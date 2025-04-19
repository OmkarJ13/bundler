import * as fs from 'fs';
import { join, dirname } from 'path';
import { parse, ParseResult } from '@babel/parser';
import _traverse from '@babel/traverse';
// https://github.com/babel/babel/issues/13855#issuecomment-945123514
const traverse = _traverse.default;
import { generate } from '@babel/generator';
import {
  File,
  identifier,
  isClassDeclaration,
  isFunctionDeclaration,
  isImportDefaultSpecifier,
  isImportNamespaceSpecifier,
  isTSDeclareFunction,
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
          path.replaceWith(defaultImportVariable);
        } else if (isImportNamespaceSpecifier(specifier)) {
          // TODO
        } else {
          if (specifier.imported.type === 'Identifier') {
            if (specifier.imported.name !== specifier.local.name) {
              const aliasedImportVariable = variableDeclaration('const', [
                variableDeclarator(
                  identifier(specifier.local.name),
                  identifier(specifier.imported.name)
                ),
              ]);
              path.replaceWith(aliasedImportVariable);
            } else {
              path.remove();
            }
          } else {
            // TODO: Handle StringLiteral imports
          }
        }
      }
    },
    ExportNamedDeclaration: (path) => {
      const declaration = path.node.declaration;
      if (declaration) {
        // Export contains a declaration, so we need to remove the export part while keeping the declaration
        // export const foo = 'bar' will be replaced with const foo = 'bar';
        path.replaceWith(declaration);
      } else {
        // Export doesn't contain declaration, so we can remove it completely.
        // export { foo }; will be removed, as foo is already declared somewhere else, so no need to re-declaring it
        path.remove();
      }
    },
    ExportDefaultDeclaration: (path) => {
      const declaration = path.node.declaration;
      if (isClassDeclaration(declaration)) {
        // TODO
      } else if (isFunctionDeclaration(declaration)) {
        // TODO
      } else if (isTSDeclareFunction(declaration)) {
        // TODO
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
