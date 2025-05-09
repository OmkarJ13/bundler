import { NodePath } from '@babel/traverse';
import {
  callExpression,
  identifier,
  ImportDeclaration,
  memberExpression,
  objectExpression,
  objectProperty,
  stringLiteral,
  VariableDeclaration,
} from '@babel/types';
import { dirname, join } from 'path';
import { Module } from 'src/module';
import { declareConst, getDefaultExportIdentifierName } from 'src/utils';

export default function (path: NodePath<ImportDeclaration>, module: Module) {
  const importPath = path.node.source.value;
  const dependency: Module = module.dependencies.find(
    (dependency) => dependency.path === join(dirname(module.path), importPath)
  )!;

  const variableDeclarations: VariableDeclaration[] = [];

  for (const specifier of path.node.specifiers) {
    let variable: VariableDeclaration;

    switch (specifier.type) {
      case 'ImportDefaultSpecifier':
        // import foo from './foo.js';
        variable = declareConst(
          specifier.local.name,
          identifier(getDefaultExportIdentifierName(dependency.id))
        );
        variableDeclarations.push(variable);
        break;
      case 'ImportNamespaceSpecifier':
        // import * as foo from './foo.js';
        variable = declareConst(
          specifier.local.name,
          callExpression(
            memberExpression(identifier('Object'), identifier('freeze')),
            [
              objectExpression(
                dependency.namedExports.map((namedExport) =>
                  objectProperty(
                    stringLiteral(namedExport),
                    identifier(namedExport)
                  )
                )
              ),
            ]
          )
        );
        variableDeclarations.push(variable);
        break;
      case 'ImportSpecifier':
        switch (specifier.imported.type) {
          case 'Identifier':
            if (specifier.imported.name !== specifier.local.name) {
              if (specifier.imported.name === 'default') {
                // import { default as foo } from './foo.js';
                variable = declareConst(
                  specifier.local.name,
                  identifier(getDefaultExportIdentifierName(dependency.id))
                );
              } else {
                // import { foo as bar } from './foo.js';
                variable = declareConst(
                  specifier.local.name,
                  identifier(specifier.imported.name)
                );
              }

              variableDeclarations.push(variable);
            }
            break;
          case 'StringLiteral':
            // import { 'bar-bar' as foo } from './foo.js';
            // TODO: Handle StringLiteral imports
            break;
        }
        break;
    }
  }

  path.replaceWithMultiple(variableDeclarations);
}
