import { identifier, Identifier } from '@babel/types';

let ID = 0;

export function getId() {
  return ID++;
}

export function getDefaultExportIdentifier(moduleId: number): Identifier {
  return identifier(`__default_export_module_${moduleId}`);
}
