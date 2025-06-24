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
import { Module } from 'src/module';
import { declareConst } from 'src/utils';

export default function (path: NodePath<ImportDeclaration>, module: Module) {
  const importPath = path.node.source.value;
  const dependency: Module = module.dependencies[importPath];
  const variableDeclarations: VariableDeclaration[] = [];

  for (const specifier of path.node.specifiers) {
    let variable: VariableDeclaration;
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
        variable = declareConst(
          localName,
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
        );
        variableDeclarations.push(variable);
        break;
      case 'ImportSpecifier': {
        const originalName =
          specifier.imported.type === 'Identifier'
            ? specifier.imported.name
            : specifier.imported.value;

        referencePaths?.forEach((path) => {
          if (path.node.type === 'Identifier') {
            path.node.name =
              originalName === 'default'
                ? dependency.exports.default.identifierName
                : dependency.exports[originalName].identifierName;
          }
        });
      }
    }
  }

  path.replaceWithMultiple(variableDeclarations);
}
