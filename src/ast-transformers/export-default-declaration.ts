import { NodePath } from '@babel/traverse';
import {
  ClassDeclaration,
  classExpression,
  ExportDefaultDeclaration,
  FunctionDeclaration,
  functionExpression,
  isExpression,
  isIdentifier,
} from '@babel/types';
import { Module } from 'src/module';
import { declareConst } from 'src/utils';

function transformClassDeclaration(
  path: NodePath<ExportDefaultDeclaration>,
  module: Module
) {
  const declaration = path.node.declaration as ClassDeclaration;

  if (declaration.id) {
    path.replaceWith(declaration);
  } else {
    const expression = classExpression(
      null,
      declaration.superClass,
      declaration.body,
      declaration.decorators
    );
    const exportClassVariable = declareConst(
      module.exports.default.identifierName,
      expression
    );
    path.replaceWith(exportClassVariable);
  }
}

function transformFunctionDeclaration(
  path: NodePath<ExportDefaultDeclaration>,
  module: Module
) {
  const declaration = path.node.declaration as FunctionDeclaration;
  if (declaration.id) {
    path.replaceWith(declaration);
  } else {
    const expression = functionExpression(
      null,
      declaration.params,
      declaration.body,
      declaration.generator,
      declaration.async
    );
    const exportFunctionVariable = declareConst(
      module.exports.default.identifierName,
      expression
    );
    path.replaceWith(exportFunctionVariable);
  }
}

export default function (
  path: NodePath<ExportDefaultDeclaration>,
  module: Module
) {
  if (module.isEntryModule) {
    return;
  }

  // export default foo;
  const declaration = path.node.declaration;
  switch (declaration.type) {
    case 'ClassDeclaration':
      transformClassDeclaration(path, module);
      break;
    case 'FunctionDeclaration':
      transformFunctionDeclaration(path, module);
      break;
    default: {
      if (isExpression(declaration) && !isIdentifier(declaration)) {
        const defaultExportVariable = declareConst(
          module.exports.default.identifierName,
          declaration
        );
        path.replaceWith(defaultExportVariable);
      } else {
        path.remove();
      }
      break;
    }
  }
}
