import { NodePath } from '@babel/traverse';
import { ImportDeclaration, VariableDeclaration } from '@babel/types';
import { ExternalModule } from '../external-module';
import { Module } from '../module';

export default function (path: NodePath<ImportDeclaration>, module: Module) {
  const importPath = path.node.source.value;
  const dependency: Module | ExternalModule = module.dependencies[importPath];

  if (dependency instanceof ExternalModule) {
    return;
  }

  const variableDeclarations: VariableDeclaration[] = [];

  for (const specifier of path.node.specifiers) {
    const localName = specifier.local.name;
    const referencePaths = path.scope.getBinding(localName)?.referencePaths;

    switch (specifier.type) {
      case 'ImportDefaultSpecifier': {
        // import foo from './foo.js';
        referencePaths?.forEach((path) => {
          if (path.node.type === 'Identifier') {
            path.node.name = dependency.exports.default.identifierName;
          }
        });
        break;
      }
      case 'ImportNamespaceSpecifier':
        // import * as foo from './foo.js';
        referencePaths?.forEach((path) => {
          if (path.node.type === 'Identifier') {
            path.node.name = dependency.exports['*'].identifierName;
          }
        });
        break;
      case 'ImportSpecifier': {
        const originalName =
          specifier.imported.type === 'Identifier'
            ? specifier.imported.name
            : specifier.imported.value;

        referencePaths?.forEach((path) => {
          if (path.node.type === 'Identifier') {
            if (dependency.exports[originalName]) {
              path.node.name = dependency.exports[originalName].identifierName;
            }
          }
        });
      }
    }
  }

  path.replaceWithMultiple(variableDeclarations);
}
