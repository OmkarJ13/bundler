import { identifier, Identifier } from '@babel/types';

export function getDefaultExportIdentifier(moduleId: number): Identifier {
  return identifier(`__default_export_module_${moduleId}`);
}
