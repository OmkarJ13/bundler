import { parse, ParseResult } from '@babel/parser';
import {
  ExportAllDeclaration,
  File,
  Identifier,
  isExpression,
  isIdentifier,
  StringLiteral,
} from '@babel/types';
import traverse, { Binding } from '@babel/traverse';
import fs, { existsSync } from 'fs';
import { dirname, join, basename } from 'path';
import { isIllegalIdentifier, makeLegal } from './utils';
import { ExternalModule } from './external-module';

export class Module {
  static externalModules: Map<string, ExternalModule> = new Map();

  path: string;

  fileName: string;

  isEntryModule: boolean;

  directory: string;

  ast: ParseResult<File>;

  dependencies: Record<string, Module | ExternalModule> = {};

  dependents: Set<Module> = new Set();

  exports: Record<
    string,
    {
      localName: string;
      identifierName: string;
      binding?: Binding;
      exportedFrom?: string;
    }
  > = {};

  externalExportAlls: ExportAllDeclaration[] = [];

  bindings: Set<Binding> = new Set();

  constructor(path: string, isEntryModule = false) {
    this.path = path;
    this.isEntryModule = isEntryModule;
    this.directory = dirname(this.path);
    this.fileName = basename(this.path);

    const contents = fs.readFileSync(this.path, 'utf-8');
    this.ast = parse(contents, { sourceType: 'module' });

    this.fixImportsWithoutExtension();
    this.analyseDependencies();
    this.analyzeExports();
    this.analyzeImports();
    this.analyzeBindings();
    this.analyzeExternalImportsAndExports();
  }

  private fixImportsWithoutExtension() {
    traverse(this.ast, {
      ImportDeclaration: (path) => {
        const importPath = path.node.source.value;

        if (!importPath.endsWith('.js')) {
          const updatedImportPath = importPath + '.js';
          let exists = false;
          if (updatedImportPath.startsWith('/')) {
            exists = existsSync(updatedImportPath);
          } else if (updatedImportPath.startsWith('.')) {
            exists = existsSync(join(this.directory, updatedImportPath));
          }

          if (exists) {
            path.node.source.value = updatedImportPath;
          }
        }
      },
    });
  }

  private analyseDependencies() {
    traverse(this.ast, {
      ImportDeclaration: (path) => {
        this.dependencies[path.node.source.value] = this.getDependencyModule(
          path.node.source.value
        );
      },
      ExportNamedDeclaration: (path) => {
        if (path.node.source) {
          this.dependencies[path.node.source.value] = this.getDependencyModule(
            path.node.source.value
          );
        }
      },
      ExportAllDeclaration: (path) => {
        this.dependencies[path.node.source.value] = this.getDependencyModule(
          path.node.source.value
        );
      },
    });
  }

  private getDependencyModule(relativePath: string): Module | ExternalModule {
    const isRelativePath =
      relativePath.startsWith('/') || relativePath.startsWith('.');

    if (isRelativePath) {
      let exists = false;
      if (relativePath.startsWith('/')) {
        exists = existsSync(relativePath);
      } else if (relativePath.startsWith('.')) {
        exists = existsSync(join(this.directory, relativePath));
      }

      if (exists) {
        const dependencyModule = new Module(join(this.directory, relativePath));
        dependencyModule.dependents.add(this);
        return dependencyModule;
      } else {
        throw new Error(
          `Could not resolve module ${relativePath} from ${this.fileName}`
        );
      }
    } else {
      const externalModule = new ExternalModule(relativePath);
      if (Module.externalModules.has(relativePath)) {
        return Module.externalModules.get(relativePath)!;
      }

      Module.externalModules.set(relativePath, externalModule);
      return externalModule;
    }
  }

  private analyzeExports() {
    traverse(this.ast, {
      ExportNamedDeclaration: (path) => {
        const { declaration, specifiers } = path.node;

        const dependency = path.node.source
          ? this.dependencies[path.node.source.value]
          : undefined;

        if (declaration) {
          switch (declaration.type) {
            case 'FunctionDeclaration':
            case 'ClassDeclaration':
              if (declaration.id) {
                this.exports[declaration.id.name] = {
                  localName: declaration.id.name,
                  identifierName: declaration.id.name,
                  binding: path.scope.getBinding(declaration.id.name),
                };
              }
              break;
            case 'VariableDeclaration':
              declaration.declarations.forEach((declaration) => {
                if (declaration.id.type === 'Identifier') {
                  this.exports[declaration.id.name] = {
                    localName: declaration.id.name,
                    identifierName: declaration.id.name,
                    binding: path.scope.getBinding(declaration.id.name),
                  };
                } else if (declaration.id.type === 'ObjectPattern') {
                  declaration.id.properties.forEach((property) => {
                    if (property.type === 'ObjectProperty') {
                      if (property.value.type === 'Identifier') {
                        this.exports[property.value.name] = {
                          localName: property.value.name,
                          identifierName: property.value.name,
                          binding: path.scope.getBinding(property.value.name),
                        };
                      }
                    } else if (property.type === 'RestElement') {
                      if (property.argument.type === 'Identifier') {
                        this.exports[property.argument.name] = {
                          localName: property.argument.name,
                          identifierName: property.argument.name,
                          binding: path.scope.getBinding(
                            property.argument.name
                          ),
                        };
                      }
                    }
                  });
                } else if (declaration.id.type === 'ArrayPattern') {
                  declaration.id.elements.forEach((element) => {
                    if (element && element.type === 'Identifier') {
                      this.exports[element.name] = {
                        localName: element.name,
                        identifierName: element.name,
                        binding: path.scope.getBinding(element.name),
                      };
                    } else if (element && element.type === 'RestElement') {
                      if (element.argument.type === 'Identifier') {
                        this.exports[element.argument.name] = {
                          localName: element.argument.name,
                          identifierName: element.argument.name,
                          binding: path.scope.getBinding(element.argument.name),
                        };
                      }
                    }
                  });
                }
              });
              break;
          }
        }

        specifiers.forEach((spec) => {
          switch (spec.type) {
            case 'ExportNamespaceSpecifier':
              {
                const exported = spec.exported as Identifier | StringLiteral;
                const exportedName =
                  exported.type === 'Identifier'
                    ? exported.name
                    : exported.value;
                this.exports[exportedName] = {
                  localName: '*',
                  identifierName:
                    exported.type === 'Identifier'
                      ? exportedName
                      : makeLegal(this.fileName),
                  binding: path.scope.getBinding(exportedName),
                  exportedFrom:
                    dependency instanceof ExternalModule
                      ? dependency.path
                      : undefined,
                };
                if (
                  dependency instanceof ExternalModule &&
                  !dependency.exports['*']
                ) {
                  dependency.exports['*'] = {
                    identifierName:
                      exported.type === 'Identifier'
                        ? exportedName
                        : makeLegal(this.fileName),
                  };
                }
              }
              break;
            case 'ExportSpecifier':
              {
                const local = spec.local as Identifier | StringLiteral;
                const localName =
                  local.type === 'Identifier' ? local.name : local.value;
                const exportedName =
                  spec.exported.type === 'Identifier'
                    ? spec.exported.name
                    : spec.exported.value;
                const isAliased = localName !== exportedName;

                if (isAliased) {
                  if (localName === 'default') {
                    // When is aliased export and localName is default its a re-export so we know dependency is there
                    this.exports[exportedName] =
                      dependency instanceof ExternalModule
                        ? {
                            localName: 'default',
                            identifierName: makeLegal(exportedName),
                            exportedFrom: dependency.path,
                          }
                        : dependency!.exports.default;
                  } else if (exportedName === 'default') {
                    this.exports.default = dependency
                      ? dependency instanceof ExternalModule
                        ? {
                            localName,
                            identifierName: makeLegal(localName),
                            exportedFrom: dependency.path,
                          }
                        : dependency.exports[localName]
                      : {
                          localName,
                          identifierName: localName,
                          binding: path.scope.getBinding(localName),
                        };
                  } else {
                    this.exports[exportedName] = dependency
                      ? dependency instanceof ExternalModule
                        ? {
                            localName,
                            identifierName: makeLegal(localName),
                            exportedFrom: dependency.path,
                          }
                        : dependency.exports[localName]
                      : {
                          localName,
                          identifierName: localName,
                          binding: path.scope.getBinding(localName),
                        };
                  }
                } else {
                  if (exportedName === 'default') {
                    // When its non-aliased default export, its a re-export so we know dependency is there
                    this.exports.default =
                      dependency instanceof ExternalModule
                        ? {
                            localName: 'default',
                            identifierName: makeLegal(this.fileName),
                            exportedFrom: dependency.path,
                          }
                        : dependency!.exports.default;
                  } else {
                    this.exports[exportedName] = dependency
                      ? dependency instanceof ExternalModule
                        ? {
                            localName,
                            identifierName: exportedName,
                            exportedFrom: dependency.path,
                          }
                        : dependency.exports[exportedName]
                      : {
                          localName,
                          identifierName: exportedName,
                          binding: path.scope.getBinding(exportedName),
                        };
                  }
                }

                if (
                  dependency instanceof ExternalModule &&
                  !dependency.exports[localName]
                ) {
                  dependency.exports[localName] = {
                    identifierName:
                      localName === 'default'
                        ? makeLegal(exportedName)
                        : isIllegalIdentifier(localName)
                          ? makeLegal(localName)
                          : localName,
                  };
                }
              }
              break;
          }
        });
      },
      ExportDefaultDeclaration: (path) => {
        const declaration = path.node.declaration;
        if (isExpression(declaration)) {
          if (isIdentifier(declaration)) {
            const binding = path.scope.getBinding(declaration.name);
            const isReassigned = (binding?.constantViolations.length || 0) > 0;

            if (isReassigned) {
              this.exports.default = {
                localName: 'default',
                identifierName: makeLegal(this.fileName),
              };
            } else {
              this.exports.default = {
                localName: 'default',
                identifierName: declaration.name,
                binding,
              };
            }
          } else {
            this.exports.default = {
              localName: 'default',
              identifierName: makeLegal(this.fileName),
            };
          }
        } else {
          if (
            declaration.type === 'ClassDeclaration' ||
            declaration.type === 'FunctionDeclaration'
          ) {
            this.exports.default = {
              localName: 'default',
              identifierName: declaration.id
                ? declaration.id.name
                : makeLegal(this.fileName),
              binding: declaration.id
                ? path.scope.getBinding(declaration.id.name)
                : undefined,
            };
          }
        }
      },
      ExportAllDeclaration: (path) => {
        const dependency = this.dependencies[path.node.source.value];

        if (dependency instanceof ExternalModule) {
          return;
        }

        this.exports = {
          ...this.exports,
          ...dependency.exports,
        };
      },
    });
  }

  private analyzeImports() {
    traverse(this.ast, {
      ImportDeclaration: (path) => {
        const importPath = path.node.source.value;
        const dependency = this.dependencies[importPath];

        if (dependency instanceof ExternalModule) {
          path.node.specifiers.forEach((specifier) => {
            switch (specifier.type) {
              case 'ImportDefaultSpecifier':
                if (!dependency.exports['default']) {
                  dependency.exports['default'] = {
                    identifierName: specifier.local.name,
                  };
                }
                break;
              case 'ImportNamespaceSpecifier':
                if (!dependency.exports['*']) {
                  dependency.exports['*'] = {
                    identifierName: specifier.local.name,
                  };
                }
                break;
              case 'ImportSpecifier':
                {
                  const importedName =
                    specifier.imported.type === 'Identifier'
                      ? specifier.imported.name
                      : specifier.imported.value;
                  if (!dependency.exports[importedName]) {
                    dependency.exports[importedName] = {
                      identifierName: specifier.local.name,
                    };
                  }
                }
                break;
            }
          });
          return;
        }

        const namedSpecifiers = path.node.specifiers.filter(
          (specifier) => specifier.type === 'ImportSpecifier'
        );

        for (const specifier of namedSpecifiers) {
          const importedName =
            specifier.imported.type === 'Identifier'
              ? specifier.imported.name
              : specifier.imported.value;
          const localName = specifier.local.name;

          if (
            !dependency.exports[importedName] &&
            dependency.externalExportAlls.length > 0
          ) {
            dependency.exports[importedName] = {
              localName: importedName,
              identifierName: localName,
              exportedFrom: dependency.externalExportAlls[0].source.value,
            };

            const externalDependency = dependency.dependencies[
              dependency.externalExportAlls[0].source.value
            ] as ExternalModule;
            externalDependency.exports[importedName] = {
              identifierName: localName,
            };
          }
        }

        const namespaceSpecifiers = path.node.specifiers.filter(
          (specifier) => specifier.type === 'ImportNamespaceSpecifier'
        );

        if (namespaceSpecifiers.length > 0 && !dependency.exports['*']) {
          dependency.exports['*'] = {
            identifierName: namespaceSpecifiers[0].local.name,
            localName: '*',
          };

          if (dependency.externalExportAlls.length > 0) {
            dependency.externalExportAlls.forEach((exportAll) => {
              const externalDependency = dependency.dependencies[
                exportAll.source.value
              ] as ExternalModule;
              externalDependency.exports['*'] = {
                identifierName: makeLegal(externalDependency.path),
              };
            });
          }
        }
      },
    });
  }

  private analyzeBindings() {
    traverse(this.ast, {
      Identifier: (path) => {
        const binding = path.scope.getBinding(path.node.name);
        const isDeclaredWithinModule =
          binding &&
          (binding.kind === 'const' ||
            binding.kind === 'hoisted' ||
            binding.kind === 'let' ||
            binding.kind === 'var');

        if (isDeclaredWithinModule) {
          this.bindings.add(binding);
        }
      },
    });
  }

  private analyzeExternalImportsAndExports() {
    traverse(this.ast, {
      ExportAllDeclaration: (path) => {
        const dependency = this.dependencies[path.node.source.value];
        if (dependency instanceof ExternalModule) {
          this.externalExportAlls.push(path.node);
        }
      },
    });
  }
}
