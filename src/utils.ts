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

export function declareConst(
  name: string,
  expression: Expression
): VariableDeclaration {
  return variableDeclaration('const', [
    variableDeclarator(identifier(name), expression),
  ]);
}
