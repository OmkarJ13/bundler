import { NodePath } from '@babel/traverse';
import {
  ClassDeclaration,
  classExpression,
  ExportDefaultDeclaration,
  FunctionDeclaration,
  functionExpression,
} from '@babel/types';
import { Module } from 'src/module';
import { declareConst, getDefaultExportIdentifierName } from 'src/utils';

function transformClassDeclaration(
  path: NodePath<ExportDefaultDeclaration>,
  module: Module
) {
  const declaration = path.node.declaration as ClassDeclaration;

  if (declaration.id) {
    path.replaceWith(declaration);
    const exportFunctionVariable = declareConst(
      getDefaultExportIdentifierName(module.id),
      declaration.id
    );
    path.insertAfter(exportFunctionVariable);
  } else {
    const expression = classExpression(
      null,
      declaration.superClass,
      declaration.body,
      declaration.decorators
    );
    const exportClassVariable = declareConst(
      getDefaultExportIdentifierName(module.id),
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
    const exportFunctionVariable = declareConst(
      getDefaultExportIdentifierName(module.id),
      declaration.id
    );
    path.insertAfter(exportFunctionVariable);
  } else {
    const expression = functionExpression(
      null,
      declaration.params,
      declaration.body,
      declaration.generator,
      declaration.async
    );
    const exportFunctionVariable = declareConst(
      getDefaultExportIdentifierName(module.id),
      expression
    );
    path.replaceWith(exportFunctionVariable);
  }
}

export default function (
  path: NodePath<ExportDefaultDeclaration>,
  module: Module
) {
  // export default foo;
  const declaration = path.node.declaration;
  switch (declaration.type) {
    case 'ClassDeclaration':
      transformClassDeclaration(path, module);
      break;
    case 'FunctionDeclaration':
      transformFunctionDeclaration(path, module);
      break;
    case 'TSDeclareFunction':
      /* */
      break;
    default: {
      const defaultExportVariable = declareConst(
        getDefaultExportIdentifierName(module.id),
        declaration
      );
      path.replaceWith(defaultExportVariable);
      break;
    }
  }
}
