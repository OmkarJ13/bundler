import { parse, ParseResult } from '@babel/parser';
import {
  File,
  Identifier,
  isExpression,
  isIdentifier,
  StringLiteral,
} from '@babel/types';
import traverse, { Binding } from '@babel/traverse';
import fs from 'fs';
import { dirname, join, basename } from 'path';
import { makeLegal } from './utils';

export class Module {
  path: string;

  fileName: string;

  isEntryModule: boolean;

  directory: string;

  ast: ParseResult<File>;

  dependencies: Record<string, Module> = {};

  exports: Record<
    string,
    {
      identifierName: string;
      binding?: Binding;
    }
  > = {};

  bindings: Set<Binding> = new Set();

  constructor(path: string, isEntryModule = false) {
    this.path = path;
    this.isEntryModule = isEntryModule;
    this.directory = dirname(this.path);
    this.fileName = basename(this.path);

    const contents = fs.readFileSync(this.path, 'utf-8');
    this.ast = parse(contents, { sourceType: 'module' });

    this.analyseDependencies();
    this.analyzeExports();
    this.analyzeBindings();
  }

  private analyseDependencies() {
    traverse(this.ast, {
      ImportDeclaration: (path) => {
        this.dependencies[path.node.source.value] = this.getDependencyModule(
          path.node.source.value,
          this.directory
        );
      },
      ExportNamedDeclaration: (path) => {
        if (path.node.source) {
          this.dependencies[path.node.source.value] = this.getDependencyModule(
            path.node.source.value,
            this.directory
          );
        }
      },
      ExportAllDeclaration: (path) => {
        this.dependencies[path.node.source.value] = this.getDependencyModule(
          path.node.source.value,
          this.directory
        );
      },
    });
  }

  private getDependencyModule(relativePath: string, directory: string): Module {
    const absolutePath = join(directory, relativePath);
    const dependencyModule = new Module(absolutePath);
    return dependencyModule;
  }

  private analyzeExports() {
    traverse(this.ast, {
      ExportNamedDeclaration: (path) => {
        const { declaration, specifiers } = path.node;

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
                const dependency = path.node.source
                  ? this.dependencies[path.node.source.value]
                  : undefined;
                const isAliased = localName !== exportedName;

                if (isAliased) {
                  if (localName === 'default') {
                    // When is aliased export and localName is default its a re-export so we know dependency is there
                    this.exports[exportedName] = dependency!.exports.default;
                  } else if (exportedName === 'default') {
                    this.exports.default = dependency
                      ? dependency.exports[localName]
                      : {
                          identifierName: localName,
                          binding: path.scope.getBinding(localName),
                        };
                  } else {
                    this.exports[exportedName] = dependency
                      ? dependency.exports[localName]
                      : {
                          identifierName: localName,
                          binding: path.scope.getBinding(localName),
                        };
                  }
                } else {
                  if (exportedName === 'default') {
                    // When its non-aliased default export, its a re-export so we know dependency is there
                    this.exports.default = dependency!.exports.default;
                  } else {
                    this.exports[exportedName] = dependency
                      ? dependency.exports[exportedName]
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
}
