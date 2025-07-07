import { parse, ParseResult } from '@babel/parser';
import {
  ExportNamedDeclaration,
  File,
  Identifier,
  ImportDeclaration,
  isExpression,
  isIdentifier,
  StringLiteral,
} from '@babel/types';
import traverse, { Binding, NodePath } from '@babel/traverse';
import fs, { existsSync } from 'fs';
import { dirname, join, basename } from 'path';
import { makeLegal } from './utils';
import { ExternalModule } from './external-module';

export class Module {
  path: string;

  fileName: string;

  isEntryModule: boolean;

  directory: string;

  ast: ParseResult<File>;

  dependencies: Record<string, Module | ExternalModule> = {};

  exports: Record<
    string,
    {
      identifierName: string;
      binding?: Binding;
    }
  > = {};

  externalImports: NodePath<ImportDeclaration>[] = [];

  externalExports: NodePath<ExportNamedDeclaration>[] = [];

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
    this.analyzeBindings();
    this.analyzeExternalImports();
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
        return dependencyModule;
      } else {
        throw new Error(
          `Could not resolve module ${relativePath} from ${this.fileName}`
        );
      }
    } else {
      return new ExternalModule(relativePath);
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
                };
              }
              break;
            case 'VariableDeclaration':
              declaration.declarations.forEach((declaration) => {
                if (declaration.id.type === 'Identifier') {
                  this.exports[declaration.id.name] = {
                    identifierName: declaration.id.name,
                    binding: path.scope.getBinding(declaration.id.name),
                  };
                } else if (declaration.id.type === 'ObjectPattern') {
                  declaration.id.properties.forEach((property) => {
                    if (property.type === 'ObjectProperty') {
                      if (property.value.type === 'Identifier') {
                        this.exports[property.value.name] = {
                          identifierName: property.value.name,
                          binding: path.scope.getBinding(property.value.name),
                        };
                      }
                    } else if (property.type === 'RestElement') {
                      if (property.argument.type === 'Identifier') {
                        this.exports[property.argument.name] = {
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
                        identifierName: element.name,
                        binding: path.scope.getBinding(element.name),
                      };
                    } else if (element && element.type === 'RestElement') {
                      if (element.argument.type === 'Identifier') {
                        this.exports[element.argument.name] = {
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
                  identifierName:
                    exported.type === 'Identifier'
                      ? exportedName
                      : makeLegal(this.fileName),
                  binding: path.scope.getBinding(exportedName),
                };
              }
              break;
            case 'ExportSpecifier':
              {
                const localName = spec.local.name;
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
                        ? { identifierName: makeLegal(exportedName) }
                        : dependency!.exports.default;
                  } else if (exportedName === 'default') {
                    this.exports.default = dependency
                      ? dependency instanceof ExternalModule
                        ? { identifierName: makeLegal(exportedName) }
                        : dependency.exports[localName]
                      : {
                          identifierName: localName,
                          binding: path.scope.getBinding(localName),
                        };
                  } else {
                    this.exports[exportedName] = dependency
                      ? dependency instanceof ExternalModule
                        ? { identifierName: makeLegal(exportedName) }
                        : dependency.exports[localName]
                      : {
                          identifierName: localName,
                          binding: path.scope.getBinding(localName),
                        };
                  }
                } else {
                  if (exportedName === 'default') {
                    // When its non-aliased default export, its a re-export so we know dependency is there
                    this.exports.default =
                      dependency instanceof ExternalModule
                        ? { identifierName: exportedName }
                        : dependency!.exports.default;
                  } else {
                    this.exports[exportedName] = dependency
                      ? dependency instanceof ExternalModule
                        ? { identifierName: exportedName }
                        : dependency.exports[exportedName]
                      : {
                          identifierName: exportedName,
                          binding: path.scope.getBinding(exportedName),
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
          this.exports.default = {
            identifierName: isIdentifier(declaration)
              ? declaration.name
              : makeLegal(this.fileName),
            binding: isIdentifier(declaration)
              ? path.scope.getBinding(declaration.name)
              : undefined,
          };
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
      ImportNamespaceSpecifier: (path) => {
        // Import namespace specifiers are converted to variables inside the module during bundling, so we need to include it as a binding
        const binding = path.scope.getBinding(path.node.local.name);
        if (binding) {
          this.bindings.add(binding);
        }
      },
    });
  }

  private analyzeExternalImports() {
    traverse(this.ast, {
      ImportDeclaration: (path) => {
        const importPath = path.node.source.value;
        const dependency = this.dependencies[importPath];

        if (dependency instanceof ExternalModule) {
          this.externalImports.push(path);
        }
      },
      ExportNamedDeclaration: (path) => {
        if (path.node.source) {
          const dependency = this.dependencies[path.node.source.value];
          if (dependency instanceof ExternalModule) {
            this.externalExports.push(path);
          }
        }
      },
    });
  }
}
