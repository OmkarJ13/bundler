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

  private identifierNames = new Set<string>();

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
      ExportAllDeclaration: (path) => transformExportAll(path, module),
    });
  }

  private getDeconflictedIdentifierName(identifierName: string): string {
    let deconflictedIdentifierName: string;

    if (this.identifierNames.has(identifierName)) {
      let index = 1;
      deconflictedIdentifierName = `${identifierName}$${index}`;

      while (this.identifierNames.has(deconflictedIdentifierName)) {
        deconflictedIdentifierName = `${identifierName}$${index++}`;
      }
    } else {
      deconflictedIdentifierName = identifierName;
    }

    this.identifierNames.add(deconflictedIdentifierName);
    return deconflictedIdentifierName;
  }

  private getModuleBindings(module: Module): Set<Binding> {
    const moduleBindings = new Set<Binding>();

    traverse(module.ast, {
      Identifier: (path) => {
        const binding = path.scope.getBinding(path.node.name);
        const isNamespaceImport = path.parentPath.isImportNamespaceSpecifier();
        const isDeclaredWithinModule =
          binding &&
          (binding.kind === 'const' ||
            binding.kind === 'hoisted' ||
            binding.kind === 'let' ||
            binding.kind === 'var' ||
            isNamespaceImport);
        if (isDeclaredWithinModule) {
          moduleBindings.add(binding);
        }
      },
    });

    return moduleBindings;
  }

  private deconflictBindings(module: Module) {
    const moduleBindings = this.getModuleBindings(module);
    const exports = Object.values(module.exports);

    moduleBindings.forEach((binding) => {
      const identifierName = this.getDeconflictedIdentifierName(
        binding.identifier.name
      );

      binding.identifier.name = identifierName;
      binding.referencePaths.forEach((path) => {
        (path.node as Identifier).name = identifierName;
      });

      const exported = exports.find(
        (exported) => exported.binding && exported.binding === binding
      );
      if (exported) {
        exported.identifierName = identifierName;
      }
    });
  }

  private deconflictAnonymousExports(module: Module) {
    const exports = Object.values(module.exports);
    exports
      .filter((exported) => !exported.binding)
      .forEach((exported) => {
        exported.identifierName = this.getDeconflictedIdentifierName(
          exported.identifierName
        );
      });
  }

  private deconflictIdentifiers(module: Module) {
    if (Object.entries(module.dependencies).length > 0) {
      for (const [, childModule] of Object.entries(module.dependencies)) {
        this.deconflictIdentifiers(childModule);
      }
    }

    this.deconflictBindings(module);
    this.deconflictAnonymousExports(module);
  }

  bundle(): string {
    const module = new Module(this.entryPath, true);

    this.deconflictIdentifiers(module);
    this.transformAst(module);

    const bundledCode = this.getBundle(module);

    if (this.outputPath) {
      fs.writeFileSync(this.outputPath, bundledCode);
    }

    return bundledCode;
  }
}
