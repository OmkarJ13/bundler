import * as fs from 'fs';
import { join, dirname } from 'path';
import { parse, ParseResult } from '@babel/parser';
import _traverse from '@babel/traverse';
// https://github.com/babel/babel/issues/13855#issuecomment-945123514
const traverse = _traverse.default;
import { generate } from '@babel/generator';
import {
  classExpression,
  File,
  functionExpression,
  identifier,
  isClassDeclaration,
  isExportDefaultSpecifier,
  isExportNamespaceSpecifier,
  isFunctionDeclaration,
  isImportDefaultSpecifier,
  isImportNamespaceSpecifier,
  isTSDeclareFunction,
  VariableDeclaration,
  variableDeclaration,
  variableDeclarator,
} from '@babel/types';
import { getId } from './utils.js';

type Module = {
  id: number;
  path: string;
  ast: ParseResult<File>;
  dependencies: Module[];
};

function getDependencyGraph(entry: string): Module {
  const entryDir = dirname(entry);
  const contents = fs.readFileSync(entry, 'utf-8');
  const ast = parse(contents, { sourceType: 'module' });
  const dependencies: Module[] = [];

  const moduleId = getId();

  traverse(ast, {
    ImportDeclaration: (path) => {
      const importPath = path.node.source.value;
      const absolutePath = join(entryDir, importPath);
      const childDependencyGraph: Module = getDependencyGraph(absolutePath);
      dependencies.push(childDependencyGraph);

      const variableDeclarations: VariableDeclaration[] = [];

      for (const specifier of path.node.specifiers) {
        if (isImportDefaultSpecifier(specifier)) {
          const defaultImportVariable = variableDeclaration('const', [
            variableDeclarator(
              identifier(specifier.local.name),
              identifier(
                `__redemption_default_export_${childDependencyGraph.id}`
              )
            ),
          ]);

          variableDeclarations.push(defaultImportVariable);
        } else if (isImportNamespaceSpecifier(specifier)) {
          // TODO
        } else {
          if (
            specifier.imported.type === 'Identifier' &&
            specifier.imported.name !== specifier.local.name
          ) {
            let variable: VariableDeclaration;

            if (specifier.imported.name === 'default') {
              variable = variableDeclaration('const', [
                variableDeclarator(
                  identifier(specifier.local.name),
                  identifier(
                    `__redemption_default_export_${childDependencyGraph.id}`
                  )
                ),
              ]);
            } else {
              variable = variableDeclaration('const', [
                variableDeclarator(
                  identifier(specifier.local.name),
                  identifier(specifier.imported.name)
                ),
              ]);
            }

            variableDeclarations.push(variable);
          } else {
            // TODO: Handle StringLiteral imports
          }
        }
      }

      path.replaceWithMultiple(variableDeclarations);
    },
    ExportNamedDeclaration: (path) => {
      // export const foo ...
      // export { foo }
      // export foo from './foo.js'
      const declaration = path.node.declaration;
      if (declaration) {
        path.replaceWith(declaration);
      } else {
        const variableDeclarations: VariableDeclaration[] = [];
        for (const specifier of path.node.specifiers) {
          if (isExportDefaultSpecifier(specifier)) {
            // TODO
          } else if (isExportNamespaceSpecifier(specifier)) {
            // TODO
          } else {
            if (
              specifier.exported.type === 'Identifier' &&
              specifier.exported.name !== specifier.local.name
            ) {
              let variable: VariableDeclaration;

              if (specifier.exported.name === 'default') {
                variable = variableDeclaration('const', [
                  variableDeclarator(
                    identifier(`__redemption_default_export_${moduleId}`),
                    identifier(specifier.local.name)
                  ),
                ]);
              } else {
                variable = variableDeclaration('const', [
                  variableDeclarator(
                    identifier(specifier.exported.name),
                    identifier(specifier.local.name)
                  ),
                ]);
              }

              variableDeclarations.push(variable);
            } else {
              // TODO: Handle StringLiteral exports
            }
          }
        }

        path.replaceWithMultiple(variableDeclarations);
      }
    },
    ExportDefaultDeclaration: (path) => {
      // export default foo;
      const declaration = path.node.declaration;
      if (isClassDeclaration(declaration)) {
        if (declaration.id) {
          path.replaceWith(declaration);
          const exportFunctionVariable = variableDeclaration('const', [
            variableDeclarator(
              identifier(`__redemption_default_export_${moduleId}`),
              declaration.id
            ),
          ]);
          path.insertAfter(exportFunctionVariable);
        } else {
          const expression = classExpression(
            null,
            declaration.superClass,
            declaration.body,
            declaration.decorators
          );
          const exportClassVariable = variableDeclaration('const', [
            variableDeclarator(
              identifier(`__redemption_default_export_${moduleId}`),
              expression
            ),
          ]);
          path.replaceWith(exportClassVariable);
        }
      } else if (isFunctionDeclaration(declaration)) {
        if (declaration.id) {
          path.replaceWith(declaration);
          const exportFunctionVariable = variableDeclaration('const', [
            variableDeclarator(
              identifier(`__redemption_default_export_${moduleId}`),
              declaration.id
            ),
          ]);
          path.insertAfter(exportFunctionVariable);
        } else {
          const expression = functionExpression(
            null,
            declaration.params,
            declaration.body,
            declaration.generator,
            declaration.async
          );
          const exportFunctionVariable = variableDeclaration('const', [
            variableDeclarator(
              identifier(`__redemption_default_export_${moduleId}`),
              expression
            ),
          ]);
          path.replaceWith(exportFunctionVariable);
        }
      } else if (isTSDeclareFunction(declaration)) {
        // TODO Later
      } else {
        const defaultExportVariable = variableDeclaration('const', [
          variableDeclarator(
            identifier(`__redemption_default_export_${moduleId}`),
            declaration
          ),
        ]);
        path.replaceWith(defaultExportVariable);
      }
    },
  });

  const dependencyGraph: Module = {
    id: moduleId,
    path: entry,
    ast,
    dependencies,
  };

  return dependencyGraph;
}

function getBundle(dependencyGraph: Module): string {
  const code = [];

  if (dependencyGraph.dependencies.length > 0) {
    for (const childDependency of dependencyGraph.dependencies) {
      code.push(getBundle(childDependency));
    }
  }

  code.push(generate(dependencyGraph.ast).code);
  return code.join('\n');
}

export function bundle(entryFile: string, outputFile: string): void {
  const dependencyGraph = getDependencyGraph(entryFile);
  const bundledCode = getBundle(dependencyGraph);
  fs.writeFileSync(outputFile, bundledCode);
}
