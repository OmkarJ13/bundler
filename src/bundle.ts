import * as fs from 'fs';
import traverse from '@babel/traverse';
import { generate } from '@babel/generator';
import { Module } from './module.js';
import transformImports from './ast-transformers/import-declaration.js';
import transformNamedExports from './ast-transformers/export-named-declaration.js';
import transformDefaultExports from './ast-transformers/export-default-declaration.js';
import transformExportAll from './ast-transformers/export-all-declaration.js';

export class Bundle {
  private entryPath: string;

  private outputPath: string | undefined;

  constructor(entryPath: string, outputPath?: string) {
    this.entryPath = entryPath;
    this.outputPath = outputPath;
  }

  private getBundle(module: Module): string {
    let code = '';

    if (Object.entries(module.dependencies).length > 0) {
      for (const [, childModule] of Object.entries(module.dependencies)) {
        code += this.getBundle(childModule);
      }
    }

    traverse(module.ast, {
      ImportDeclaration: (path) => transformImports(path, module),
      ExportNamedDeclaration: (path) => transformNamedExports(path),
      ExportDefaultDeclaration: (path) => transformDefaultExports(path, module),
      ExportAllDeclaration: (path) => transformExportAll(path),
    });

    code += generate(module.ast).code + '\n';
    return code;
  }

  bundle(): string {
    const module = new Module(this.entryPath);
    const bundledCode = this.getBundle(module);

    if (this.outputPath) {
      fs.writeFileSync(this.outputPath, bundledCode);
    }

    return bundledCode;
  }
}
