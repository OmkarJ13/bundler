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

  static modules: Map<string, Module> = new Map();

  path: string;

  fileName: string;

  isEntryModule: boolean;

  directory: string;

  ast: ParseResult<File>;

  dependencies: Record<string, Module | ExternalModule> = {};

  dependents: Set<Module> = new Set();

  importBindings: { importedName: string; binding?: Binding }[] = [];

  exports: Record<
    string,
    {
      localName: string;
      identifierName: string;
      binding?: Binding;
    }
  > = {};

  externalExportAlls: ExportAllDeclaration[] = [];

  bindings: Set<Binding> = new Set();

  constructor(path: string, isEntryModule = false) {
    if (isEntryModule) {
      Module.modules.set(path, this);
    }

    this.path = path;
    this.isEntryModule = isEntryModule;
    this.directory = dirname(this.path);
    this.fileName = basename(this.path);

    const contents = fs.readFileSync(this.path, 'utf-8');
    this.ast = parse(contents, { sourceType: 'module' });

    this.fixImportsWithoutExtension();
    this.analyseDependencies();
    this.analyzeImports();
    this.analyzeExports();
    this.analyzeBindings();
    this.analyzeExternalExportAlls();
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
        if (Module.modules.has(join(this.directory, relativePath))) {
          const module = Module.modules.get(
            join(this.directory, relativePath)
          )!;
          module.dependents.add(this);
          return module;
        }

        const dependencyModule = new Module(join(this.directory, relativePath));
        dependencyModule.dependents.add(this);

        Module.modules.set(
          join(this.directory, relativePath),
          dependencyModule
        );
        return dependencyModule;
      } else {
        throw new Error(
          `Could not resolve module ${relativePath} from ${this.fileName}`
        );
      }
    } else {
      if (Module.externalModules.has(relativePath)) {
        const externalModule = Module.externalModules.get(relativePath)!;
        externalModule.dependents.add(this);
        return externalModule;
      }

      const externalModule = new ExternalModule(relativePath);
      externalModule.dependents.add(this);

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
                  identifierName: declaration.id.name,
                  binding: path.scope.getBinding(declaration.id.name),
                  localName: declaration.id.name,
                };
              }
              break;
            case 'VariableDeclaration':
              declaration.declarations.forEach((declaration) => {
                if (declaration.id.type === 'Identifier') {
                  this.exports[declaration.id.name] = {
                    identifierName: declaration.id.name,
                    binding: path.scope.getBinding(declaration.id.name),
                    localName: declaration.id.name,
                  };
                } else if (declaration.id.type === 'ObjectPattern') {
                  declaration.id.properties.forEach((property) => {
                    if (property.type === 'ObjectProperty') {
                      if (property.value.type === 'Identifier') {
                        this.exports[property.value.name] = {
                          identifierName: property.value.name,
                          binding: path.scope.getBinding(property.value.name),
                          localName: property.value.name,
                        };
                      }
                    } else if (property.type === 'RestElement') {
                      if (property.argument.type === 'Identifier') {
                        this.exports[property.argument.name] = {
                          identifierName: property.argument.name,
                          binding: path.scope.getBinding(
                            property.argument.name
                          ),
                          localName: property.argument.name,
                        };
                      }
                    }
                  });
                } else if (declaration.id.type === 'ArrayPattern') {
                  declaration.id.elements.forEach((element) => {
                    if (element && element.type === 'Identifier') {
                      this.exports[element.name] = {
                        identifierName: element.name,
                        binding: path.scope.getBinding(element.name),
                        localName: element.name,
                      };
                    } else if (element && element.type === 'RestElement') {
                      if (element.argument.type === 'Identifier') {
                        this.exports[element.argument.name] = {
                          identifierName: element.argument.name,
                          binding: path.scope.getBinding(element.argument.name),
                          localName: element.argument.name,
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
          const exported = spec.exported as Identifier | StringLiteral;
          const exportedName =
            exported.type === 'Identifier' ? exported.name : exported.value;

          switch (spec.type) {
            case 'ExportNamespaceSpecifier':
              if (dependency) {
                if (!dependency.exports['*']) {
                  dependency.exports['*'] = {
                    identifierName:
                      exported.type === 'Identifier'
                        ? exportedName
                        : makeLegal(this.fileName),
                    localName: '*',
                  };
                }

                this.exports[exportedName] = dependency.exports['*'];
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
                    localName,
                  };
                }

                if (isAliased) {
                  if (localName === 'default') {
                    // When is aliased export and localName is default its a re-export so we know dependency is there
                    this.exports[exportedName] = dependency!.exports.default;
                  } else if (exportedName === 'default') {
                    this.exports[exportedName] = dependency
                      ? dependency.exports[localName]
                      : {
                          identifierName: localName,
                          binding: path.scope.getBinding(localName),
                          localName,
                        };
                  } else {
                    this.exports[exportedName] = dependency
                      ? dependency.exports[localName]
                      : {
                          identifierName: localName,
                          binding: path.scope.getBinding(localName),
                          localName,
                        };
                  }
                } else {
                  if (exportedName === 'default') {
                    // When its non-aliased default export, its a re-export so we know dependency is there
                    this.exports[exportedName] = dependency!.exports.default;
                  } else {
                    this.exports[exportedName] = dependency
                      ? dependency instanceof ExternalModule
                        ? dependency.exports[localName]
                        : dependency.exports[exportedName]
                      : {
                          identifierName: exportedName,
                          binding: path.scope.getBinding(exportedName),
                          localName,
                        };
                  }
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
                identifierName: makeLegal(this.fileName),
                localName: 'default',
              };
            } else {
              this.exports.default = {
                identifierName: declaration.name,
                binding,
                localName: 'default',
              };
            }
          } else {
            this.exports.default = {
              identifierName: makeLegal(this.fileName),
              localName: 'default',
            };
          }
        } else {
          if (
            declaration.type === 'ClassDeclaration' ||
            declaration.type === 'FunctionDeclaration'
          ) {
            this.exports.default = {
              identifierName: declaration.id
                ? declaration.id.name
                : makeLegal(this.fileName),
              binding: declaration.id
                ? path.scope.getBinding(declaration.id.name)
                : undefined,
              localName: 'default',
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

        path.node.specifiers.forEach((specifier) => {
          let importedName: string;
          if (specifier.type === 'ImportDefaultSpecifier') {
            importedName = 'default';
          } else if (specifier.type === 'ImportNamespaceSpecifier') {
            importedName = '*';
          } else {
            importedName =
              specifier.imported.type === 'Identifier'
                ? specifier.imported.name
                : specifier.imported.value;
          }

          const binding = path.scope.getBinding(specifier.local.name);

          this.importBindings.push({
            importedName: importedName,
            binding: binding,
          });
        });

        if (dependency instanceof ExternalModule) {
          path.node.specifiers.forEach((specifier) => {
            switch (specifier.type) {
              case 'ImportDefaultSpecifier':
                if (!dependency.exports['default']) {
                  dependency.exports['default'] = {
                    identifierName: specifier.local.name,
                    localName: 'default',
                  };
                }
                break;
              case 'ImportNamespaceSpecifier':
                if (!dependency.exports['*']) {
                  dependency.exports['*'] = {
                    identifierName: specifier.local.name,
                    localName: '*',
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
                      localName: specifier.local.name,
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
            const externalDependency = dependency.dependencies[
              dependency.externalExportAlls[0].source.value
            ] as ExternalModule;

            if (!externalDependency.exports[importedName]) {
              externalDependency.exports[importedName] = {
                identifierName: localName,
                localName,
              };
            }

            dependency.exports[importedName] =
              externalDependency.exports[importedName];
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

              if (!externalDependency.exports['*']) {
                externalDependency.exports['*'] = {
                  identifierName: makeLegal(externalDependency.path),
                  localName: '*',
                };
              }
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

  private analyzeExternalExportAlls() {
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
