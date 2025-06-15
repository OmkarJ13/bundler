import { parse, ParseResult } from '@babel/parser';
import {
  File,
  Identifier,
  isExpression,
  isIdentifier,
  StringLiteral,
} from '@babel/types';
import traverse from '@babel/traverse';
import fs from 'fs';
import { dirname, join, basename } from 'path';
import { makeLegal } from './utils';

export class Module {
  id: number;

  path: string;

  fileName: string;

  directory: string;

  ast: ParseResult<File>;

  dependencies: Record<string, Module> = {};

  exports: Record<
    string | 'default',
    { identifierName: string; isInternalIdentifier?: boolean }
  > = {};

  constructor(path: string, id = 0) {
    this.id = id;
    this.path = path;
    this.directory = dirname(this.path);
    this.fileName = basename(this.path);

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
                this.exports[declaration.id.name] = {
                  identifierName: declaration.id.name,
                };
              }
              break;
            case 'VariableDeclaration':
              declaration.declarations.forEach((declaration) => {
                if (declaration.id.type === 'Identifier') {
                  this.exports[declaration.id.name] = {
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
                  isInternalIdentifier: exported.type !== 'Identifier',
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
                    const dependency =
                      this.dependencies[path.node.source!.value];
                    this.exports[exportedName] = dependency.exports.default;
                  } else if (exportedName === 'default') {
                    this.exports.default = {
                      identifierName: spec.local.name,
                    };
                  } else {
                    this.exports[exportedName] = {
                      identifierName: localName,
                    };
                  }
                } else {
                  if (exportedName === 'default') {
                    // When its non-aliased default export, its a re-export so we know dependency is there
                    const dependency =
                      this.dependencies[path.node.source!.value];
                    this.exports.default = dependency.exports.default;
                  } else {
                    this.exports[exportedName] = {
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
        if (isExpression(declaration)) {
          this.exports.default = {
            identifierName: isIdentifier(declaration)
              ? declaration.name
              : makeLegal(this.fileName),
            isInternalIdentifier: !isIdentifier(declaration),
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
              isInternalIdentifier: !declaration.id,
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
}
