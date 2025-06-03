import { parse, ParseResult } from '@babel/parser';
import { File, isExpression, isIdentifier } from '@babel/types';
import traverse from '@babel/traverse';
import fs from 'fs';
import { dirname, join } from 'path';

export class Module {
  id: number;

  path: string;

  directory: string;

  ast: ParseResult<File>;

  dependencies: Record<string, Module> = {};

  namedExports: Record<string, { identifierName: string }> = {};

  defaultExport: string | null = null;

  constructor(path: string, id = 0) {
    this.id = id;
    this.path = path;
    this.directory = dirname(this.path);

    const contents = fs.readFileSync(this.path, 'utf-8');
    this.ast = parse(contents, { sourceType: 'module' });

    this.analyseDependencies();
    this.analyzeExports();
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
    });
  }

  private getDependencyModule(relativePath: string, directory: string): Module {
    const absolutePath = join(directory, relativePath);
    const dependencyModule = new Module(absolutePath, this.id++);
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
                this.namedExports[declaration.id.name] = {
                  identifierName: declaration.id.name,
                };
              }
              break;
            case 'VariableDeclaration':
              declaration.declarations.forEach((declaration) => {
                if (declaration.id.type === 'Identifier') {
                  this.namedExports[declaration.id.name] = {
                    identifierName: declaration.id.name,
                  };
                }
              });
              break;
          }
        }

        specifiers.forEach((spec) => {
          switch (spec.type) {
            case 'ExportNamespaceSpecifier':
              this.namedExports[spec.exported.name] = {
                identifierName: spec.exported.name,
              };
              break;
            case 'ExportSpecifier':
              if (spec.exported.type === 'Identifier') {
                const localName = spec.local.name;
                const exportedName = spec.exported.name;
                const isAliased = localName !== exportedName;

                if (isAliased) {
                  if (localName === 'default') {
                    // When is aliased export and localName is default its a re-export so we know dependency is there
                    const dependency =
                      this.dependencies[path.node.source!.value];
                    this.namedExports[exportedName] = {
                      identifierName: dependency.defaultExport!,
                    };
                  } else if (exportedName === 'default') {
                    this.defaultExport = spec.local.name;
                  } else {
                    this.namedExports[exportedName] = {
                      identifierName: localName,
                    };
                  }
                } else {
                  if (exportedName === 'default') {
                    // When its non-aliased default export, its a re-export so we know dependency is there
                    const dependency =
                      this.dependencies[path.node.source!.value];
                    this.defaultExport = dependency.defaultExport!;
                  } else {
                    this.namedExports[exportedName] = {
                      identifierName: exportedName,
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
        if (isExpression(declaration) && isIdentifier(declaration)) {
          this.defaultExport = declaration.name;
        } else {
          if (
            (declaration.type === 'ClassDeclaration' ||
              declaration.type === 'FunctionDeclaration') &&
            declaration.id
          ) {
            this.defaultExport = declaration.id.name;
          }
        }
      },
    });
  }
}
