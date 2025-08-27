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
import {
  isIllegalIdentifier,
  makeLegal,
  traverseDependencyGraph,
} from './utils';
import { ExternalModule } from './external-module';
import { Bundler } from './bundler';

export class Module {
  path: string;

  fileName: string;

  isEntryModule: boolean;

  directory: string;

  ast: ParseResult<File>;

  dependencies: Record<string, Module | ExternalModule> = {};

  dependents: Set<Module> = new Set();

  importBindings: {
    importedName: string;
    source: string;
    binding?: Binding;
  }[] = [];

  exports: Record<
    string,
    {
      localName: string;
      identifierName: string;
      source: string;
      binding?: Binding;
    }
  > = {};

  externalExportAlls: ExportAllDeclaration[] = [];

  bindings: Set<Binding> = new Set();

  constructor(path: string, isEntryModule = false) {
    Bundler.modules.set(path, this);

    this.path = path;
    this.isEntryModule = isEntryModule;
    this.directory = dirname(this.path);
    this.fileName = basename(this.path);

    try {
      const contents = fs.readFileSync(this.path, 'utf-8');
      this.ast = parse(contents, { sourceType: 'module' });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to parse module at "${this.path}": ${errorMessage}`
      );
    }

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

  private checkCircularDependency(module: Module): void {
    const dependencyChain = [this.path];
    traverseDependencyGraph(
      module,
      (module) => {
        dependencyChain.push(module.path);
        if (module === this) {
          throw new Error(
            `Circular dependency detected: ${dependencyChain.join(' -> ')}`
          );
        }
      },
      'pre'
    );
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
        if (Bundler.modules.has(join(this.directory, relativePath))) {
          const module = Bundler.modules.get(
            join(this.directory, relativePath)
          )!;
          module.dependents.add(this);

          this.checkCircularDependency(module);

          return module;
        }

        const dependencyModule = new Module(join(this.directory, relativePath));
        dependencyModule.dependents.add(this);

        this.checkCircularDependency(dependencyModule);

        return dependencyModule;
      } else {
        throw new Error(
          `Could not resolve module ${relativePath} from ${this.fileName}`
        );
      }
    } else {
      if (Bundler.externalModules.has(relativePath)) {
        const externalModule = Bundler.externalModules.get(relativePath)!;
        externalModule.dependents.add(this);
        return externalModule;
      }

      const externalModule = new ExternalModule(relativePath);
      externalModule.dependents.add(this);

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
                  source: this.path,
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
                    source: this.path,
                  };
                } else if (declaration.id.type === 'ObjectPattern') {
                  declaration.id.properties.forEach((property) => {
                    if (property.type === 'ObjectProperty') {
                      if (property.value.type === 'Identifier') {
                        this.exports[property.value.name] = {
                          identifierName: property.value.name,
                          binding: path.scope.getBinding(property.value.name),
                          localName: property.value.name,
                          source: this.path,
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
                          source: this.path,
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
                        source: this.path,
                      };
                    } else if (element && element.type === 'RestElement') {
                      if (element.argument.type === 'Identifier') {
                        this.exports[element.argument.name] = {
                          identifierName: element.argument.name,
                          binding: path.scope.getBinding(element.argument.name),
                          localName: element.argument.name,
                          source: this.path,
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
                    source: dependency.path,
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
                    source: dependency.path,
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
                          source: this.path,
                        };
                  } else {
                    this.exports[exportedName] = dependency
                      ? dependency.exports[localName]
                      : {
                          identifierName: localName,
                          binding: path.scope.getBinding(localName),
                          localName,
                          source: this.path,
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
                          source: this.path,
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
                source: this.path,
              };
            } else {
              this.exports.default = {
                identifierName: declaration.name,
                binding,
                localName: 'default',
                source: this.path,
              };
            }
          } else {
            this.exports.default = {
              identifierName: makeLegal(this.fileName),
              localName: 'default',
              source: this.path,
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
              source: this.path,
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
            source:
              dependency instanceof ExternalModule
                ? importPath
                : join(this.directory, importPath),
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
                    source: dependency.path,
                  };
                }
                break;
              case 'ImportNamespaceSpecifier':
                if (!dependency.exports['*']) {
                  dependency.exports['*'] = {
                    identifierName: specifier.local.name,
                    localName: '*',
                    source: dependency.path,
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
                      source: dependency.path,
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
                source: externalDependency.path,
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
            source: dependency.path,
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
                  source: externalDependency.path,
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
