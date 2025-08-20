import {
  Expression,
  identifier,
  variableDeclaration,
  VariableDeclaration,
  variableDeclarator,
} from '@babel/types';
import RESERVED_NAMES from './reserved-names';
import { basename, extname } from 'path';
import { Module } from './module';
import { ExternalModule } from './external-module';

const illegalCharacters = /[^\w$]/g;

const startsWithDigit = (value: string): boolean => /\d/.test(value[0]);

const needsEscape = (value: string) =>
  startsWithDigit(value) || RESERVED_NAMES.has(value) || value === 'arguments';

export function makeLegal(value: string): string {
  const base = basename(value);
  const extension = extname(value);

  value = extension ? base.slice(0, -extension.length) : base;

  value = value
    .replace(/-(\w)/g, (_, letter) => letter.toUpperCase())
    .replace(illegalCharacters, '_');

  if (needsEscape(value)) value = `_${value}`;

  return value || '_';
}

export function isIllegalIdentifier(value: string): boolean {
  return (
    value.match(/-(\w)/g) !== null ||
    value.match(illegalCharacters) !== null ||
    needsEscape(value)
  );
}

export function declareConst(
  name: string,
  expression: Expression
): VariableDeclaration {
  return variableDeclaration('const', [
    variableDeclarator(identifier(name), expression),
  ]);
}

export function traverseDependencyGraph(
  module: Module,
  callback: (module: Module) => void
) {
  for (const [, childModule] of Object.entries(module.dependencies)) {
    if (childModule instanceof ExternalModule) {
      continue;
    }

    traverseDependencyGraph(childModule, callback);
  }

  callback(module);
}

export const mergeNamespacesFunctionName = '_mergeNamespaces';

export const mergeNamespacesFunctionDefinition = `function _mergeNamespaces(n, m) {
  m.forEach(function (e) {
    e && typeof e !== 'string' && !Array.isArray(e) && Object.keys(e).forEach(function (k) {
      if (k !== 'default' && !(k in n)) {
        var d = Object.getOwnPropertyDescriptor(e, k);
        Object.defineProperty(n, k, d.get ? d : {
          enumerable: true,
          get: function () { return e[k]; }
        });
      }
    });
  });
  return Object.freeze(n);
}
`;
