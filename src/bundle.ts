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
  Identifier,
  identifier,
  importDeclaration,
  importDefaultSpecifier,
  ImportDefaultSpecifier,
  ImportNamespaceSpecifier,
  importNamespaceSpecifier,
  ImportSpecifier,
  importSpecifier,
  stringLiteral,
  StringLiteral,
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
            const bindings = externalImport.scope.getBinding(oldSpecifierName);
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
        let importedSpecifier:
          | ImportSpecifier
          | ImportNamespaceSpecifier
          | ImportDefaultSpecifier;

        if (specifier.type === 'ExportSpecifier') {
          const local = specifier.local as Identifier | StringLiteral;
          const localName =
            local.type === 'Identifier' ? local.name : local.value;
          const exportedName =
            specifier.exported.type === 'Identifier'
              ? specifier.exported.name
              : specifier.exported.value;

          if (localName === 'default') {
            importedSpecifier = importDefaultSpecifier(
              identifier(module.exports[exportedName].identifierName)
            );
          } else {
            importedSpecifier = importSpecifier(
              identifier(module.exports[exportedName].identifierName),
              local.type === 'Identifier'
                ? identifier(localName)
                : stringLiteral(localName)
            );
          }

          importSpecifiers.push(importedSpecifier);
        } else if (specifier.type === 'ExportNamespaceSpecifier') {
          const exportedName = specifier.exported.name;
          importedSpecifier = importNamespaceSpecifier(
            identifier(exportedName)
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

    if (module.externalExportAlls.length > 0) {
      const importSpecifiers: ImportSpecifier[] = [];
      for (const dependent of module.dependents) {
        traverse(dependent.ast, {
          ImportDeclaration: (path) => {
            const dependency = dependent.dependencies[path.node.source.value];
            if (dependency instanceof ExternalModule) {
              return;
            }

            if (dependency.fileName === module.fileName) {
              const namedSpecifiers = path.node.specifiers.filter(
                (specifier) => specifier.type === 'ImportSpecifier'
              );

              for (const specifier of namedSpecifiers) {
                const importedName =
                  specifier.imported.type === 'Identifier'
                    ? specifier.imported.name
                    : specifier.imported.value;
                if (!module.exports[importedName]) {
                  importSpecifiers.push(specifier);
                }
              }
            }
          },
        });

        if (importSpecifiers.length > 0) {
          const [firstExternalExportAll, ...restExternalExportAlls] =
            module.externalExportAlls;
          code +=
            generate(
              importDeclaration(
                importSpecifiers,
                firstExternalExportAll.node.source
              )
            ).code + '\n';

          if (restExternalExportAlls.length > 0) {
            importSpecifiers.forEach((importSpecifier) => {
              console.warn(
                `Ambigious external export resolution: ${module.fileName} re-exports ${importSpecifier.imported.type === 'Identifier' ? importSpecifier.imported.name : importSpecifier.imported.value} from one of the external modules ${module.externalExportAlls.map((externalExportAll) => externalExportAll.node.source.value).join(' and ')}, guessing ${firstExternalExportAll.node.source.value}`
              );
            });

            restExternalExportAlls.forEach((externalExportAll) => {
              code +=
                generate(importDeclaration([], externalExportAll.node.source))
                  .code + '\n';
            });
          }
        } else {
          module.externalExportAlls.forEach((externalExportAll) => {
            code +=
              generate(importDeclaration([], externalExportAll.node.source))
                .code + '\n';
          });
        }
      }

      for (const externalExportAll of module.externalExportAlls) {
        externalExportAll.remove();
      }
    }

    return code;
  }

  bundle(): string {
    const module = new Module(this.entryPath, true);

    this.deconflictIdentifiers(module);

    let externalImports =
      this.hoistExternalImports(module) +
      this.convertExternalExportsToImports(module);

    this.transformAst(module);

    externalImports += externalImports ? '\n' : '';

    const bundledCode = externalImports + this.getBundle(module);

    if (this.outputPath) {
      fs.writeFileSync(this.outputPath, bundledCode);
    }

    return bundledCode;
  }
}
