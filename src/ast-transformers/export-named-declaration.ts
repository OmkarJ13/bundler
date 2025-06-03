import { NodePath } from '@babel/traverse';
import { ExportNamedDeclaration } from '@babel/types';

export default function (path: NodePath<ExportNamedDeclaration>) {
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
