import * as fs from 'fs';
import { join, dirname } from 'path';
import { parse, ParseResult } from '@babel/parser';
import _traverse, { NodePath } from '@babel/traverse';
// https://github.com/babel/babel/issues/13855#issuecomment-945123514
const traverse = _traverse.default;
import { generate } from '@babel/generator';
import {
  classExpression,
  ExportDefaultDeclaration,
  ExportNamedDeclaration,
  File,
  functionExpression,
  identifier,
  ImportDeclaration,
  isClassDeclaration,
  isExportDefaultSpecifier,
  isExportNamespaceSpecifier,
  isExportSpecifier,
  isFunctionDeclaration,
  isImportDefaultSpecifier,
  isImportNamespaceSpecifier,
  isTSDeclareFunction,
  VariableDeclaration,
  variableDeclaration,
  variableDeclarator,
} from '@babel/types';
import { getDefaultExportIdentifier, getId } from './utils.js';

type Module = {
  id: number;
  path: string;
  ast: ParseResult<File>;
  dependencies: Module[];
};

function transformImports(
  dependencies: Module[],
  entryDir: string,
  path: NodePath<ImportDeclaration>
) {
  const importPath = path.node.source.value;
  const absolutePath = join(entryDir, importPath);
  const childDependencyGraph: Module = getDependencyGraph(absolutePath);
  dependencies.push(childDependencyGraph);

  const variableDeclarations: VariableDeclaration[] = [];

  for (const specifier of path.node.specifiers) {
    if (isImportDefaultSpecifier(specifier)) {
      // import foo from './foo.js';
      const defaultImportVariable = variableDeclaration('const', [
        variableDeclarator(
          identifier(specifier.local.name),
          getDefaultExportIdentifier(childDependencyGraph.id)
        ),
      ]);

      variableDeclarations.push(defaultImportVariable);
    } else if (isImportNamespaceSpecifier(specifier)) {
      // import * as foo from './foo.js';
      // TODO
    } else {
      if (
        specifier.imported.type === 'Identifier' &&
        specifier.imported.name !== specifier.local.name
      ) {
        let variable: VariableDeclaration;

        if (specifier.imported.name === 'default') {
          // import { default as foo } from './foo.js';
          variable = variableDeclaration('const', [
            variableDeclarator(
              identifier(specifier.local.name),
              getDefaultExportIdentifier(childDependencyGraph.id)
            ),
          ]);
        } else {
          // import { foo as bar } from './foo.js';
          variable = variableDeclaration('const', [
            variableDeclarator(
              identifier(specifier.local.name),
              identifier(specifier.imported.name)
            ),
          ]);
        }

        variableDeclarations.push(variable);
      } else if (specifier.imported.type === 'StringLiteral') {
        // import { 'bar-bar' as foo } from './foo.js';
        // TODO: Handle StringLiteral imports
      }
    }
  }

  path.replaceWithMultiple(variableDeclarations);
}

function transformNamedExports(
  moduleId: number,
  dependencies: Module[],
  entryDir: string,
  path: NodePath<ExportNamedDeclaration>
) {
  if (path.node.source) {
    // export .. from ...
    const importPath = path.node.source.value;
    const absolutePath = join(entryDir, importPath);
    const childDependencyGraph = getDependencyGraph(absolutePath);
    dependencies.push(childDependencyGraph);

    const specifiers = path.node.specifiers;

    if (
      specifiers.length === 1 &&
      specifiers[0].exported.type === 'Identifier' &&
      specifiers[0].exported.name === 'default'
    ) {
      // export { default } from './foo.js';
      const variable = variableDeclaration('const', [
        variableDeclarator(
          getDefaultExportIdentifier(moduleId),
          getDefaultExportIdentifier(childDependencyGraph.id)
        ),
      ]);
      path.replaceWith(variable);
    } else {
      const variableDeclarations: VariableDeclaration[] = [];
      for (const specifier of specifiers) {
        if (isExportDefaultSpecifier(specifier)) {
          // export foo from './foo.js';
          const variable = variableDeclaration('const', [
            variableDeclarator(
              identifier(specifier.exported.name),
              getDefaultExportIdentifier(childDependencyGraph.id)
            ),
          ]);
          path.replaceWith(variable);
        } else if (isExportNamespaceSpecifier(specifier)) {
          // export * as foo from './foo.js';
          // TODO
        } else {
          if (
            specifier.exported.type === 'Identifier' &&
            specifier.exported.name !== specifier.local.name
          ) {
            let variable: VariableDeclaration;

            if (specifier.exported.name === 'default') {
              // export { foo as default } from './foo.js';
              variable = variableDeclaration('const', [
                variableDeclarator(
                  getDefaultExportIdentifier(moduleId),
                  identifier(specifier.local.name)
                ),
              ]);
            } else if (specifier.local.name === 'default') {
              // export { default as foo } from './foo.js';
              variable = variableDeclaration('const', [
                variableDeclarator(
                  identifier(specifier.exported.name),
                  getDefaultExportIdentifier(childDependencyGraph.id)
                ),
              ]);
            } else {
              // export { foo as bar } from './foo.js';
              variable = variableDeclaration('const', [
                variableDeclarator(
                  identifier(specifier.exported.name),
                  identifier(specifier.local.name)
                ),
              ]);
            }

            variableDeclarations.push(variable);
          } else if (specifier.exported.type === 'StringLiteral') {
            // export { foo as 'bar-bar' } from './foo.js';
            // TODO: Handle StringLiteral exports
          }
        }
      }
      path.replaceWithMultiple(variableDeclarations);
    }
  } else {
    const declaration = path.node.declaration;
    if (declaration) {
      // export const foo = 'bar';
      path.replaceWith(declaration);
    } else {
      const variableDeclarations: VariableDeclaration[] = [];
      for (const specifier of path.node.specifiers) {
        if (isExportSpecifier(specifier)) {
          if (
            specifier.exported.type === 'Identifier' &&
            specifier.exported.name !== specifier.local.name
          ) {
            let variable: VariableDeclaration;

            if (specifier.exported.name === 'default') {
              // export { foo as default };
              variable = variableDeclaration('const', [
                variableDeclarator(
                  getDefaultExportIdentifier(moduleId),
                  identifier(specifier.local.name)
                ),
              ]);
            } else {
              // export { foo as bar };
              variable = variableDeclaration('const', [
                variableDeclarator(
                  identifier(specifier.exported.name),
                  identifier(specifier.local.name)
                ),
              ]);
            }

            variableDeclarations.push(variable);
          } else if (specifier.exported.type === 'StringLiteral') {
            // export { foo as 'bar-bar' };
            // TODO: Handle StringLiteral exports
          }
        }
      }
      path.replaceWithMultiple(variableDeclarations);
    }
  }
}

function transformDefaultExports(
  moduleId: number,
  path: NodePath<ExportDefaultDeclaration>
) {
  // export default foo;
  const declaration = path.node.declaration;
  if (isClassDeclaration(declaration)) {
    if (declaration.id) {
      path.replaceWith(declaration);
      const exportFunctionVariable = variableDeclaration('const', [
        variableDeclarator(
          getDefaultExportIdentifier(moduleId),
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
        variableDeclarator(getDefaultExportIdentifier(moduleId), expression),
      ]);
      path.replaceWith(exportClassVariable);
    }
  } else if (isFunctionDeclaration(declaration)) {
    if (declaration.id) {
      path.replaceWith(declaration);
      const exportFunctionVariable = variableDeclaration('const', [
        variableDeclarator(
          getDefaultExportIdentifier(moduleId),
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
        variableDeclarator(getDefaultExportIdentifier(moduleId), expression),
      ]);
      path.replaceWith(exportFunctionVariable);
    }
  } else if (isTSDeclareFunction(declaration)) {
    // TODO Later
  } else {
    const defaultExportVariable = variableDeclaration('const', [
      variableDeclarator(getDefaultExportIdentifier(moduleId), declaration),
    ]);
    path.replaceWith(defaultExportVariable);
  }
}

function getDependencyGraph(entry: string): Module {
  const entryDir = dirname(entry);
  const contents = fs.readFileSync(entry, 'utf-8');
  const ast = parse(contents, { sourceType: 'module' });
  const dependencies: Module[] = [];

  const moduleId = getId();

  traverse(ast, {
    ImportDeclaration: (path) => transformImports(dependencies, entryDir, path),
    ExportNamedDeclaration: (path) =>
      transformNamedExports(moduleId, dependencies, entryDir, path),
    ExportDefaultDeclaration: (path) => transformDefaultExports(moduleId, path),
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
