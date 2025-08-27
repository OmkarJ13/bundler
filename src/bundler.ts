import * as fs from 'fs';
import traverse, { Binding } from '@babel/traverse';
import { generate } from '@babel/generator';
import { Module } from './module.js';
import { program, file } from '@babel/types';
import transformImports from './ast-transformers/import-declaration.js';
import transformNamedExports from './ast-transformers/export-named-declaration.js';
import transformDefaultExports from './ast-transformers/export-default-declaration.js';
import transformExportAll from './ast-transformers/export-all-declaration.js';
import {
  declareConst,
  mergeNamespacesFunctionDefinition,
  isIllegalIdentifier,
  traverseDependencyGraph,
  mergeNamespacesFunctionName,
} from './utils.js';
import { ExternalModule } from './external-module.js';
import {
  arrayExpression,
  callExpression,
  identifier,
  ImportDeclaration,
  importDeclaration,
  ImportDefaultSpecifier,
  importDefaultSpecifier,
  ImportNamespaceSpecifier,
  importNamespaceSpecifier,
  ImportSpecifier,
  importSpecifier,
  memberExpression,
  objectExpression,
  objectProperty,
  stringLiteral,
} from '@babel/types';

export class Bundler {
  static modules: Map<string, Module> = new Map();

  static externalModules: Map<string, ExternalModule> = new Map();

  private entryPath: string;

  private outputPath: string | undefined;

  private minify: boolean;

  private treeshake: boolean;

  private identifierNames = new Set<string>();

  constructor(
    entryPath: string,
    outputPath?: string,
    minify: boolean = false,
    treeshake: boolean = true
  ) {
    this.entryPath = entryPath;
    this.outputPath = outputPath;
    this.minify = minify;
    this.treeshake = treeshake;
  }

  private getBundledCode(module: Module): string {
    const externalImportDeclarations = this.getExternalImports();

    let needsMergeNamespaces = false;

    Bundler.modules.forEach((module) => {
      if (module.exports['*'] && module.externalExportAlls.length > 0) {
        needsMergeNamespaces = true;
      }
    });

    const bundledAst = file(program([], [], 'module'));

    const bundledModules: Module[] = [];

    traverseDependencyGraph(module, (module) => {
      if (!bundledModules.includes(module)) {
        bundledAst.program.body.push(...module.ast.program.body);
        bundledModules.push(module);
      }
    });

    bundledAst.program.body.unshift(
      ...externalImportDeclarations,
      ...(needsMergeNamespaces ? [mergeNamespacesFunctionDefinition] : [])
    );

    const bundledCode = generate(bundledAst, { minified: this.minify }).code;

    return bundledCode;
  }

  private performScopeHoisting(module: Module): void {
    traverseDependencyGraph(module, (module) => {
      traverse(module.ast, {
        ImportDeclaration: (path) => transformImports(path, module),
        ExportNamedDeclaration: (path) => transformNamedExports(path, module),
        ExportDefaultDeclaration: (path) =>
          transformDefaultExports(path, module),
        ExportAllDeclaration: (path) => transformExportAll(path, module),
      });

      if (!module.isEntryModule && module.exports['*']) {
        let exportAllNamespace;

        if (module.externalExportAlls.length > 0) {
          exportAllNamespace = declareConst(
            module.exports['*'].identifierName,
            callExpression(identifier(mergeNamespacesFunctionName), [
              objectExpression(
                Object.entries(module.exports)
                  .filter(
                    ([exportedName]) =>
                      exportedName !== 'default' && exportedName !== '*'
                  )
                  .map(([exportedName, { identifierName }]) =>
                    objectProperty(
                      stringLiteral(exportedName),
                      identifier(identifierName)
                    )
                  )
              ),
              arrayExpression(
                module.externalExportAlls.map((exportAll) => {
                  const dependency = module.dependencies[
                    exportAll.source.value
                  ] as ExternalModule;
                  return identifier(dependency.exports['*'].identifierName);
                })
              ),
            ])
          );
        } else {
          exportAllNamespace = declareConst(
            module.exports['*'].identifierName,
            callExpression(
              memberExpression(identifier('Object'), identifier('freeze')),
              [
                objectExpression(
                  Object.entries(module.exports)
                    .filter(
                      ([exportedName]) =>
                        exportedName !== 'default' && exportedName !== '*'
                    )
                    .map(([exportedName, { identifierName }]) =>
                      objectProperty(
                        stringLiteral(exportedName),
                        identifier(identifierName)
                      )
                    )
                ),
              ]
            )
          );
        }

        module.ast.program.body.push(exportAllNamespace);
      }
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
      const oldIdentifierName = binding.identifier.name;
      const identifierName =
        this.getDeconflictedIdentifierName(oldIdentifierName);

      if (identifierName !== oldIdentifierName) {
        binding.identifier.name = identifierName;

        binding.referencePaths.forEach((path) => {
          if (path.node?.type === 'Identifier') {
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
      }
    });
  }

  private deconflictExports(exports: { identifierName: string }[]) {
    exports.forEach((exported) => {
      const oldIdentifierName = exported.identifierName;
      const newIdentifierName =
        this.getDeconflictedIdentifierName(oldIdentifierName);
      if (oldIdentifierName !== newIdentifierName) {
        exported.identifierName = newIdentifierName;
      }
    });
  }

  private deconflictIdentifiers(module: Module) {
    const deconflictedModules: Module[] = [];
    traverseDependencyGraph(module, (module) => {
      if (!deconflictedModules.includes(module)) {
        this.deconflictBindings(module);
        deconflictedModules.push(module);
      }
    });

    const exports = new Set<{ identifierName: string }>();

    Bundler.externalModules.forEach((externalModule) => {
      Object.values(externalModule.exports).forEach((exported) => {
        exports.add(exported);
      });
    });

    traverseDependencyGraph(module, (module) => {
      Object.values(module.exports)
        .filter((exported) => !exported.binding)
        .forEach((exported) => {
          exports.add(exported);
        });
    });

    this.deconflictExports(Array.from(exports));
  }

  private getExternalImports(): ImportDeclaration[] {
    const importDeclarations: ImportDeclaration[] = [];

    Bundler.externalModules.forEach((externalModule) => {
      const exports = Object.entries(externalModule.exports);
      if (exports.length > 0) {
        const importSpecifiers: ImportSpecifier[] = [];
        const importDefaultSpecifiers: ImportDefaultSpecifier[] = [];
        const importNamespaceSpecifiers: ImportNamespaceSpecifier[] = [];

        for (const [exported, { identifierName }] of exports) {
          if (exported === 'default') {
            importDefaultSpecifiers.push(
              importDefaultSpecifier(identifier(identifierName))
            );
          } else if (exported === '*') {
            importNamespaceSpecifiers.push(
              importNamespaceSpecifier(identifier(identifierName))
            );
          } else {
            importSpecifiers.push(
              importSpecifier(
                identifier(identifierName),
                isIllegalIdentifier(exported)
                  ? stringLiteral(exported)
                  : identifier(exported)
              )
            );
          }
        }

        if (importSpecifiers.length > 0) {
          importDeclarations.push(
            importDeclaration(
              importSpecifiers,
              stringLiteral(externalModule.path)
            )
          );
        }

        if (importDefaultSpecifiers.length > 0) {
          importDeclarations.push(
            importDeclaration(
              importDefaultSpecifiers,
              stringLiteral(externalModule.path)
            )
          );
        }

        if (importNamespaceSpecifiers.length > 0) {
          importDeclarations.push(
            importDeclaration(
              importNamespaceSpecifiers,
              stringLiteral(externalModule.path)
            )
          );
        }
      } else {
        importDeclarations.push(
          importDeclaration([], stringLiteral(externalModule.path))
        );
      }
    });

    return importDeclarations;
  }

  private isExportUsed(
    module: Module | ExternalModule,
    name: string,
    binding?: Binding
  ): boolean {
    const isUsed = Array.from(module.dependents).some((dependent) => {
      const exports = Object.entries(dependent.exports);
      const importBinding = dependent.importBindings.find(
        (importBinding) =>
          (importBinding.importedName === name ||
            importBinding.importedName === '*') &&
          importBinding.source === module.path
      );

      if (
        importBinding?.binding &&
        importBinding.binding.referencePaths.length > 0
      ) {
        return true;
      }

      if (binding) {
        let reexportedName: string | null = null;

        exports.forEach(([name, { binding: exportedBinding }]) => {
          if (exportedBinding === binding) {
            reexportedName = name;
          }
        });

        if (reexportedName) {
          if (this.isExportUsed(dependent, reexportedName, binding)) {
            return true;
          }
        }
      }

      if (module.exports['*']) {
        let reexportedName: string | null = null;

        exports.forEach(([name, { localName, source }]) => {
          if (localName === '*' && source === module.path) {
            reexportedName = name;
          }
        });

        if (reexportedName) {
          if (this.isExportUsed(dependent, reexportedName, binding)) {
            return true;
          }
        }

        if (
          module instanceof ExternalModule &&
          dependent.exports['*'] &&
          dependent.externalExportAlls.length > 0
        ) {
          return true;
        }
      }

      let reexportedName: string | null = null;
      exports.forEach(([exportedName, { localName, source }]) => {
        if (localName === name && source === module.path) {
          reexportedName = exportedName;
        }
      });

      if (reexportedName) {
        if (this.isExportUsed(dependent, reexportedName, binding)) {
          return true;
        }
      }

      return false;
    });

    return isUsed;
  }

  private performTreeshake(module: Module): void {
    Bundler.externalModules.forEach((externalModule) => {
      Object.entries(externalModule.exports).forEach(([exportedName]) => {
        const isExportUsed = this.isExportUsed(externalModule, exportedName);

        if (!isExportUsed) {
          if (exportedName === '*') {
            externalModule.dependents.forEach((dependent) => {
              const exportAll = dependent.externalExportAlls.findIndex(
                (exported) => exported.source.value === externalModule.path
              );
              if (exportAll !== -1) {
                dependent.externalExportAlls.splice(exportAll, 1);
              }
            });
          }

          delete externalModule.exports[exportedName];
        }
      });
    });

    traverseDependencyGraph(module, (module) => {
      module.bindings.forEach((binding) => {
        let exportedName: string | null = null;

        Object.entries(module.exports).forEach(
          ([name, { binding: exportedBinding }]) => {
            if (binding === exportedBinding) {
              exportedName = name;
            }
          }
        );

        if (binding.referencePaths.length === 0) {
          binding.path.remove();
        } else if (exportedName && !module.isEntryModule) {
          const isExportUsed = this.isExportUsed(module, exportedName, binding);

          if (!isExportUsed) {
            binding.path.remove();
            delete module.exports[exportedName];
          }
        }
      });

      Object.entries(module.exports)
        .filter(([, { binding }]) => !binding)
        .forEach(([exportedName]) => {
          const isExportUsed = this.isExportUsed(module, exportedName);

          if (!isExportUsed) {
            delete module.exports[exportedName];
          }
        });
    });
  }

  bundle(): string {
    Bundler.externalModules.clear();
    Bundler.modules.clear();

    const module = new Module(this.entryPath, true);

    if (this.treeshake) {
      this.performTreeshake(module);
    }

    this.deconflictIdentifiers(module);
    this.performScopeHoisting(module);
    const bundledCode = this.getBundledCode(module);

    if (this.outputPath) {
      fs.writeFileSync(this.outputPath, bundledCode);
    }

    return bundledCode;
  }
}
