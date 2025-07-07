import * as fs from 'fs';
import traverse from '@babel/traverse';
import { generate } from '@babel/generator';
import { Module } from './module.js';
import transformImports from './ast-transformers/import-declaration.js';
import transformNamedExports from './ast-transformers/export-named-declaration.js';
import transformDefaultExports from './ast-transformers/export-default-declaration.js';
import transformExportAll from './ast-transformers/export-all-declaration.js';
import { hasDependencies } from './utils.js';
import { ExternalModule } from './external-module.js';
import {
  identifier,
  importDeclaration,
  ImportSpecifier,
  importSpecifier,
} from '@babel/types';

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

    if (hasDependencies(module)) {
      for (const [, childModule] of Object.entries(module.dependencies)) {
        if (childModule instanceof ExternalModule) {
          continue;
        }

        code += this.getBundle(childModule);
      }
    }

    code += generate(module.ast).code + '\n';
    return code;
  }

  private transformAst(module: Module): void {
    if (hasDependencies(module)) {
      for (const [, childModule] of Object.entries(module.dependencies)) {
        if (childModule instanceof ExternalModule) {
          continue;
        }

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

  private deconflictBindings(module: Module) {
    const exports = Object.values(module.exports);

    module.bindings.forEach((binding) => {
      const identifierName = this.getDeconflictedIdentifierName(
        binding.identifier.name
      );

      binding.identifier.name = identifierName;

      binding.referencePaths.forEach((path) => {
        if (path.node.type === 'Identifier') {
          path.node.name = identifierName;
        }
      });

      binding.constantViolations.forEach((path) => {
        if (
          path.isAssignmentExpression() &&
          path.node.left.type === 'Identifier'
        ) {
          path.node.left.name = identifierName;
        }
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
    if (hasDependencies(module)) {
      for (const [, childModule] of Object.entries(module.dependencies)) {
        if (childModule instanceof ExternalModule) {
          continue;
        }

        this.deconflictIdentifiers(childModule);
      }
    }

    this.deconflictExternalImports(module);
    this.deconflictBindings(module);
    this.deconflictAnonymousExports(module);
  }

  private deconflictExternalImports(module: Module) {
    for (const externalImport of module.externalImports) {
      for (const specifier of externalImport.node.specifiers) {
        if (specifier.type === 'ImportSpecifier') {
          const oldSpecifierName = specifier.local.name;
          const specifierName = this.getDeconflictedIdentifierName(
            specifier.local.name
          );
          if (specifierName !== oldSpecifierName) {
            specifier.local.name = specifierName;
            const bindings = externalImport.scope.getBinding(specifierName);
            if (bindings) {
              bindings.referencePaths.forEach((path) => {
                if (path.node.type === 'Identifier') {
                  path.node.name = specifierName;
                }
              });
            }
          }
        }
      }
    }
  }

  private hoistExternalImports(module: Module): string {
    let code = '';

    if (hasDependencies(module)) {
      for (const [, childModule] of Object.entries(module.dependencies)) {
        if (childModule instanceof ExternalModule) {
          continue;
        }

        code += this.hoistExternalImports(childModule);
      }
    }

    for (const importDeclaration of module.externalImports) {
      code += generate(importDeclaration.node).code + '\n';
      importDeclaration.remove();
    }

    return code;
  }

  private convertExternalExportsToImports(module: Module) {
    let code = '';

    if (hasDependencies(module)) {
      for (const [, childModule] of Object.entries(module.dependencies)) {
        if (childModule instanceof ExternalModule) {
          continue;
        }

        code += this.convertExternalExportsToImports(childModule);
      }
    }

    if (module.isEntryModule) {
      return code;
    }

    for (const externalExport of module.externalExports) {
      const importSpecifiers = [];

      for (const specifier of externalExport.node.specifiers) {
        let importedSpecifier: ImportSpecifier;

        if (specifier.type === 'ExportSpecifier') {
          const exportedName =
            specifier.exported.type === 'Identifier'
              ? specifier.exported.name
              : specifier.exported.value;
          importedSpecifier = importSpecifier(
            identifier(module.exports[exportedName].identifierName),
            specifier.local
          );
          importSpecifiers.push(importedSpecifier);
        }
      }

      code +=
        generate(
          importDeclaration(importSpecifiers, externalExport.node.source!)
        ).code + '\n';
      externalExport.remove();
    }

    return code;
  }

  bundle(): string {
    const module = new Module(this.entryPath, true);

    this.deconflictIdentifiers(module);
    this.transformAst(module);

    const externalImports =
      this.hoistExternalImports(module) +
      this.convertExternalExportsToImports(module) +
      '\n';
    const bundledCode = externalImports + this.getBundle(module);

    if (this.outputPath) {
      fs.writeFileSync(this.outputPath, bundledCode);
    }

    return bundledCode;
  }
}
