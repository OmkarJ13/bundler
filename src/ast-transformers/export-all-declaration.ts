import { NodePath } from '@babel/traverse';
import { ExportAllDeclaration } from '@babel/types';

export default function transformExportAll(
  path: NodePath<ExportAllDeclaration>
) {
  path.remove();
}
