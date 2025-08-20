import { NodePath } from '@babel/traverse';
import { ExportAllDeclaration } from '@babel/types';
import { Module } from '../module';

export default function transformExportAll(
  path: NodePath<ExportAllDeclaration>,
  module: Module
) {
  if (module.isEntryModule) {
    return;
  }

  path.remove();
}
