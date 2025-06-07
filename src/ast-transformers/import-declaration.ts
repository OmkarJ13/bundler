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
    const localName = specifier.local.name;

    switch (specifier.type) {
      case 'ImportDefaultSpecifier': {
        // import foo from './foo.js';
        traverse(module.ast, {
          Identifier: (path: NodePath<Identifier>) => {
            const isImported =
              path.scope.getBinding(path.node.name)?.kind === 'module';

            if (path.node.name === localName && isImported) {
              path.node.name =
                dependency.defaultExport ||
                getDefaultExportIdentifierName(dependency.id);
            }
          },
        });
        break;
      }
      case 'ImportNamespaceSpecifier':
        // import * as foo from './foo.js';
        variable = declareConst(
          localName,
          callExpression(
            memberExpression(identifier('Object'), identifier('freeze')),
            [
              objectExpression(
                Object.entries(dependency.namedExports).map(
                  ([exportedName, { identifierName }]) =>
                    objectProperty(
                      stringLiteral(exportedName),
                      identifier(identifierName)
                    )
                )
              ),
            ]
          )
        );
        variableDeclarations.push(variable);
        break;
      case 'ImportSpecifier': {
        const originalName =
          specifier.imported.type === 'Identifier'
            ? specifier.imported.name
            : specifier.imported.value;

        traverse(module.ast, {
          Identifier: (path: NodePath<Identifier>) => {
            const isImported =
              path.scope.getBinding(path.node.name)?.kind === 'module';

            if (path.node.name === localName && isImported) {
              path.node.name =
                originalName === 'default'
                  ? dependency.defaultExport ||
                    getDefaultExportIdentifierName(dependency.id)
                  : dependency.namedExports[originalName].identifierName;
            }
          },
        });
      }
    }
  }

  path.replaceWithMultiple(variableDeclarations);
}
