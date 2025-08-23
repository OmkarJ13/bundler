import { NodePath } from '@babel/traverse';
import { ExportNamedDeclaration } from '@babel/types';
import { Module } from '../module';

export default function (
  path: NodePath<ExportNamedDeclaration>,
  module: Module
) {
  if (module.isEntryModule) {
    return;
  }

  if (path.node.source) {
    // export .. from ...
    path.remove();
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
