import { NodePath } from '@babel/traverse';
import {
  callExpression,
  Identifier,
  identifier,
  ImportDeclaration,
  memberExpression,
  objectExpression,
  objectProperty,
  stringLiteral,
  VariableDeclaration,
} from '@babel/types';
import traverse from '@babel/traverse';
import { Module } from 'src/module';
import { declareConst, getDefaultExportIdentifierName } from 'src/utils';

export default function (path: NodePath<ImportDeclaration>, module: Module) {
  const importPath = path.node.source.value;
  const dependency: Module = module.dependencies[importPath];
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
          case 'Identifier': {
            const localName = specifier.local.name;
            const originalName = specifier.imported.name;
            const isAliased = localName !== originalName;

            if (isAliased) {
              traverse(module.ast, {
                Identifier: (path: NodePath<Identifier>) => {
                  const isImported =
                    path.scope.getBinding(path.node.name)?.kind === 'module';
                  if (path.node.name === localName && isImported) {
                    path.node.name =
                      originalName === 'default'
                        ? getDefaultExportIdentifierName(dependency.id)
                        : originalName;
                  }
                },
              });
            }
            break;
          }
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
