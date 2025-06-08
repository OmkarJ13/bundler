import {
  Expression,
  identifier,
  variableDeclaration,
  VariableDeclaration,
  variableDeclarator,
} from '@babel/types';

export function getDefaultExportIdentifierName(moduleId: number): string {
  return `__default_export_module_${moduleId}`;
}

export function getStringLiteralExportNamespaceIdentifierName(
  moduleId: number
): string {
  return `__string_literal_namespace_export_module_${moduleId}`;
}

export function declareConst(
  name: string,
  expression: Expression
): VariableDeclaration {
  return variableDeclaration('const', [
    variableDeclarator(identifier(name), expression),
  ]);
}
