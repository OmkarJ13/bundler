import { NodePath } from '@babel/traverse';
import {
  callExpression,
  ExportNamedDeclaration,
  identifier,
  memberExpression,
  objectExpression,
  objectProperty,
  stringLiteral,
  VariableDeclaration,
} from '@babel/types';
import { Module } from 'src/module';
import { declareConst } from 'src/utils';

export default function (
  path: NodePath<ExportNamedDeclaration>,
  module: Module
) {
  if (path.node.source) {
    // export .. from ...
    const dependency = module.dependencies[path.node.source.value];
    const specifiers = path.node.specifiers;
    const variableDeclarations: VariableDeclaration[] = [];

    specifiers.forEach((spec) => {
      if (spec.type === 'ExportNamespaceSpecifier') {
        variableDeclarations.push(
          declareConst(
            spec.exported.name,
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
