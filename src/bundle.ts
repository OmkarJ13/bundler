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

export class Bundle {
  private entryPath: string;

  private outputPath: string | undefined;

  private identifierNames = new Set<string>();

  constructor(entryPath: string, outputPath?: string) {
    this.entryPath = entryPath;
    this.outputPath = outputPath;
  }

  private getBundle(module: Module): string {
    const externalImportDeclarations = this.getExternalImports();

    let needsMergeNamespaces = false;

    traverseDependencyGraph(module, (module) => {
      if (module.exports['*'] && module.externalExportAlls.length > 0) {
        needsMergeNamespaces = true;
      }
    });

    const bundledAst = file(program([], [], 'module'));

    traverseDependencyGraph(module, (module) => {
      bundledAst.program.body.push(...module.ast.program.body);
    });

    bundledAst.program.body.unshift(
      ...externalImportDeclarations,
      ...(needsMergeNamespaces ? [mergeNamespacesFunctionDefinition] : [])
    );

    const bundledCode = generate(bundledAst).code;

    return bundledCode;
  }

  private transformAst(module: Module): void {
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
    traverseDependencyGraph(module, (module) => {
      this.deconflictBindings(module);
    });

    const exports = new Set<{ identifierName: string }>();

    Module.externalModules.forEach((externalModule) => {
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

    Module.externalModules.forEach((externalModule) => {
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

  private isExportUnused(
    module: Module,
    name: string,
    binding: Binding
  ): boolean {
    if (module.exports['*']) {
      // Imported as namespace somewhere, assuming its used
      return false;
    }

    const isUnused = Array.from(module.dependents).every((dependent) => {
      const importBinding = dependent.importBindings.find(
        (importBinding) => importBinding.importedName === name
      );
      if (importBinding && importBinding.binding) {
        return importBinding.binding.referencePaths.length === 0;
      }

      let exportedName: string | null = null;

      Object.entries(dependent.exports).forEach(
        ([name, { binding: exportedBinding }]) => {
          if (exportedBinding === binding) {
            exportedName = name;
          }
        }
      );

      if (exportedName) {
        return this.isExportUnused(dependent, exportedName, binding);
      }

      return true;
    });

    return isUnused;
  }

  private treeShakeUnusedBindings(module: Module): void {
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
          const isExportUnused = this.isExportUnused(
            module,
            exportedName,
            binding
          );

          if (isExportUnused) {
            binding.path.remove();
            delete module.exports[exportedName];
          }
        }
      });
    });
  }

  bundle(): string {
    Module.externalModules.clear();
    const module = new Module(this.entryPath, true);

    this.treeShakeUnusedBindings(module);
    this.deconflictIdentifiers(module);
    this.transformAst(module);
    const bundledCode = this.getBundle(module);

    if (this.outputPath) {
      fs.writeFileSync(this.outputPath, bundledCode);
    }

    return bundledCode;
  }
}
