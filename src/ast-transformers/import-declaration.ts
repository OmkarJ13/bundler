import { NodePath } from '@babel/traverse';
import { ImportDeclaration, VariableDeclaration } from '@babel/types';
import { ExternalModule } from '../external-module';
import { Module } from '../module';

export default function (path: NodePath<ImportDeclaration>, module: Module) {
  const importPath = path.node.source.value;
  const dependency: Module | ExternalModule = module.dependencies[importPath];

  const variableDeclarations: VariableDeclaration[] = [];

  for (const specifier of path.node.specifiers) {
    const localName = specifier.local.name;
    const referencePaths = path.scope.getBinding(localName)?.referencePaths;

    switch (specifier.type) {
      case 'ImportDefaultSpecifier': {
        // import foo from './foo.js';
        referencePaths?.forEach((path) => {
          if (path.node.type === 'Identifier') {
            if (
              dependency instanceof Module &&
              dependency.exports.default.exportedFrom
            ) {
              const externalModule = Module.externalModules.get(
                dependency.exports.default.exportedFrom
              );
              if (externalModule) {
                path.node.name =
                  externalModule?.exports[
                    dependency.exports.default.localName
                  ].identifierName;
              }
            } else {
              path.node.name = dependency.exports.default.identifierName;
            }
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
              console.log('import ', localName);
              console.log(dependency.path, dependency.exports);
              if (
                dependency instanceof Module &&
                dependency.exports[originalName].exportedFrom
              ) {
                const externalModule = Module.externalModules.get(
                  dependency.exports[originalName].exportedFrom
                );
                if (externalModule) {
                  path.node.name =
                    externalModule.exports[
                      dependency.exports[originalName].localName
                    ].identifierName;
                }
              } else {
                path.node.name =
                  dependency.exports[originalName].identifierName;
              }
            }
          }
        });
      }
    }
  }

  if (dependency instanceof ExternalModule) {
    path.remove();
  } else {
    path.replaceWithMultiple(variableDeclarations);
  }
}
