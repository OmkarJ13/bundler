import { NodePath } from '@babel/traverse';
import { ExportAllDeclaration } from '@babel/types';
import { Module } from '../module';
import { ExternalModule } from '../external-module';

export default function transformExportAll(
  path: NodePath<ExportAllDeclaration>,
  module: Module
) {
  if (module.isEntryModule) {
    return;
  }

  const dependency = module.dependencies[path.node.source.value];
  if (dependency instanceof ExternalModule) {
    return;
  }

  path.remove();
}
