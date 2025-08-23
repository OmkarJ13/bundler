import { Module } from './module.js';

export class ExternalModule {
  path: string;

  exports: Record<
    string,
    {
      localName: string;
      identifierName: string;
    }
  > = {};

  dependents: Set<Module> = new Set();

  constructor(path: string) {
    this.path = path;
  }
}
