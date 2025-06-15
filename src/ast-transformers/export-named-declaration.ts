import { NodePath } from '@babel/traverse';
import {
  callExpression,
  ExportNamedDeclaration,
  Identifier,
  identifier,
  memberExpression,
  objectExpression,
  objectProperty,
  StringLiteral,
  stringLiteral,
  VariableDeclaration,
} from '@babel/types';
import { Module } from 'src/module';
import { declareConst } from 'src/utils';

export default function (
  path: NodePath<ExportNamedDeclaration>,
  module: Module
) {
  if (module.isEntryModule) {
    return;
  }

  if (path.node.source) {
    // export .. from ...
    const dependency = module.dependencies[path.node.source.value];
    const specifiers = path.node.specifiers;
    const variableDeclarations: VariableDeclaration[] = [];

    specifiers.forEach((spec) => {
      if (spec.type === 'ExportNamespaceSpecifier') {
        const exported = spec.exported as Identifier | StringLiteral;
        const exportedName =
          exported.type === 'Identifier' ? exported.name : exported.value;
        variableDeclarations.push(
          declareConst(
            module.exports[exportedName].identifierName,
            callExpression(
              memberExpression(identifier('Object'), identifier('freeze')),
              [
                objectExpression(
                  Object.entries(dependency.exports)
                    .filter(([exportedName]) => exportedName !== 'default')
                    .map(([exportedName, { identifierName }]) =>
                      objectProperty(
                        stringLiteral(exportedName),
                        identifier(identifierName)
                      )
                    )
                ),
              ]
            )
          )
        );
      }
    });

    path.replaceWithMultiple(variableDeclarations);
  } else {
    const declaration = path.node.declaration;
    if (declaration) {
      // export const foo = 'bar';
      path.replaceWith(declaration);
    } else {
      // export { foo, bar }
      path.remove();
    }
  }
}
