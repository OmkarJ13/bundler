import { NodePath } from '@babel/traverse';
import {
  ExportNamedDeclaration,
  identifier,
  isExportDefaultSpecifier,
  isExportNamespaceSpecifier,
  VariableDeclaration,
} from '@babel/types';
import { dirname, join } from 'path';
import { Module } from 'src/module';
import { declareConst, getDefaultExportIdentifierName } from 'src/utils';

function transformReExports(
  path: NodePath<ExportNamedDeclaration>,
  module: Module
) {
  const exportFromPath = path.node.source!;

  const dependency = module.dependencies.find(
    (dependency) =>
      dependency.path === join(dirname(module.path), exportFromPath.value)
  )!;
  const specifiers = path.node.specifiers;

  if (
    specifiers.length === 1 &&
    specifiers[0].exported.type === 'Identifier' &&
    specifiers[0].exported.name === 'default'
  ) {
    // export { default } from './foo.js';
    const variable = declareConst(
      getDefaultExportIdentifierName(module.id),
      identifier(getDefaultExportIdentifierName(dependency.id))
    );
    path.replaceWith(variable);
  } else {
    const variableDeclarations: VariableDeclaration[] = [];
    for (const specifier of specifiers) {
      if (isExportDefaultSpecifier(specifier)) {
        // export foo from './foo.js';
        const variable = declareConst(
          specifier.exported.name,
          identifier(getDefaultExportIdentifierName(dependency.id))
        );
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
            variable = declareConst(
              getDefaultExportIdentifierName(module.id),
              identifier(specifier.local.name)
            );
          } else if (specifier.local.name === 'default') {
            // export { default as foo } from './foo.js';
            variable = declareConst(
              specifier.exported.name,
              identifier(getDefaultExportIdentifierName(dependency.id))
            );
          } else {
            // export { foo as bar } from './foo.js';
            variable = declareConst(
              specifier.exported.name,
              identifier(specifier.local.name)
            );
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
}

function transformExports(
  path: NodePath<ExportNamedDeclaration>,
  module: Module
) {
  const declaration = path.node.declaration;
  if (declaration) {
    // export const foo = 'bar';
    path.replaceWith(declaration);
  } else {
    const variableDeclarations: VariableDeclaration[] = [];
    for (const specifier of path.node.specifiers) {
      let variable: VariableDeclaration;

      switch (specifier.type) {
        case 'ExportDefaultSpecifier':
          break;
        case 'ExportNamespaceSpecifier':
          break;
        case 'ExportSpecifier':
          switch (specifier.exported.type) {
            case 'Identifier':
              if (specifier.exported.name !== specifier.local.name) {
                if (specifier.exported.name === 'default') {
                  // export { foo as default };
                  variable = declareConst(
                    getDefaultExportIdentifierName(module.id),
                    identifier(specifier.local.name)
                  );
                } else {
                  // export { foo as bar };
                  variable = declareConst(
                    specifier.exported.name,
                    identifier(specifier.local.name)
                  );
                }

                variableDeclarations.push(variable);
              }
              break;
            case 'StringLiteral':
              // export { foo as 'bar-bar' };
              // TODO: Handle StringLiteral exports
              break;
          }
          break;
      }
    }
    path.replaceWithMultiple(variableDeclarations);
  }
}

export default function (
  path: NodePath<ExportNamedDeclaration>,
  module: Module
) {
  if (path.node.source) {
    // export .. from ...
    transformReExports(path, module);
  } else {
    transformExports(path, module);
  }
}
