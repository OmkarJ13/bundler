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

  namedExports: string[] = [];

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
                this.namedExports.push(declaration.id.name);
              }
              break;
            case 'VariableDeclaration':
              declaration.declarations.forEach((declaration) => {
                if (declaration.id.type === 'Identifier') {
                  this.namedExports.push(declaration.id.name);
                }
              });
              break;
          }
        }

        specifiers.forEach((spec) => {
          switch (spec.exported.type) {
            case 'Identifier':
              if (spec.exported.name !== 'default') {
                this.namedExports.push(spec.exported.name);
              }
              break;
            case 'StringLiteral':
              this.namedExports.push(spec.exported.value);
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
