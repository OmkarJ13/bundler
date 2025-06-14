import * as fs from 'fs';
import traverse, { Binding } from '@babel/traverse';
import { generate } from '@babel/generator';
import { Module } from './module.js';
import transformImports from './ast-transformers/import-declaration.js';
import transformNamedExports from './ast-transformers/export-named-declaration.js';
import transformDefaultExports from './ast-transformers/export-default-declaration.js';
import transformExportAll from './ast-transformers/export-all-declaration.js';
import { Identifier } from '@babel/types';

export class Bundle {
  private entryPath: string;

  private outputPath: string | undefined;

  private identifierNames = new Set();

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

    code += generate(module.ast).code + '\n';
    return code;
  }

  private transformAst(module: Module): void {
    if (Object.entries(module.dependencies).length > 0) {
      for (const [, childModule] of Object.entries(module.dependencies)) {
        this.transformAst(childModule);
      }
    }

    traverse(module.ast, {
      ImportDeclaration: (path) => transformImports(path, module),
      ExportNamedDeclaration: (path) => transformNamedExports(path, module),
      ExportDefaultDeclaration: (path) => transformDefaultExports(path, module),
      ExportAllDeclaration: (path) => transformExportAll(path),
    });
  }

  private deconflictIdentifiers(module: Module) {
    if (Object.entries(module.dependencies).length > 0) {
      for (const [, childModule] of Object.entries(module.dependencies)) {
        this.deconflictIdentifiers(childModule);
      }
    }

    const identiferBindings = new Set<Binding>();

    traverse(module.ast, {
      Identifier: (path) => {
        const binding = path.scope.getBinding(path.node.name);
        const isDeclaredWithinModule =
          binding &&
          (binding.kind === 'const' ||
            binding.kind === 'hoisted' ||
            binding.kind === 'let' ||
            binding.kind === 'var');
        if (isDeclaredWithinModule) {
          identiferBindings.add(binding);
        }
      },
    });

    identiferBindings.forEach((binding) => {
      if (this.identifierNames.has(binding.identifier.name)) {
        let index = 1;
        let identifierName = `${binding.identifier.name}$${index}`;

        while (this.identifierNames.has(identifierName)) {
          identifierName = `${binding.identifier.name}$${index++}`;
        }

        this.identifierNames.add(identifierName);

        Object.keys(module.exports).forEach((exportedName) => {
          if (
            module.exports[exportedName].identifierName ===
            binding.identifier.name
          ) {
            module.exports[exportedName].identifierName = identifierName;
          }
        });

        binding.identifier.name = identifierName;
        binding.referencePaths.forEach((path) => {
          (path.node as Identifier).name = identifierName;
        });
      } else {
        this.identifierNames.add(binding.identifier.name);
      }
    });
  }

  bundle(): string {
    const module = new Module(this.entryPath);

    this.deconflictIdentifiers(module);
    this.transformAst(module);

    const bundledCode = this.getBundle(module);

    if (this.outputPath) {
      fs.writeFileSync(this.outputPath, bundledCode);
    }

    return bundledCode;
  }
}
