import { Module } from './module.js';

export class ExternalModule {
  path: string;

  exports: Record<
    string,
    {
      localName: string;
      identifierName: string;
      source: string;
    }
  > = {};

  dependents: Set<Module> = new Set();

  constructor(path: string) {
    Module.externalModules.set(path, this);
    this.path = path;
  }
}
