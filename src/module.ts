import { parse, ParseResult } from '@babel/parser';
import { File } from '@babel/types';
import traverse from '@babel/traverse';
import fs from 'fs';
import { dirname, join } from 'path';

export class Module {
  id: number;

  path: string;

  directory: string;

  ast: ParseResult<File>;

  dependencies: Module[] = [];

  constructor(path: string, id = 0) {
    this.id = id;
    this.path = path;
    this.directory = dirname(this.path);

    const contents = fs.readFileSync(this.path, 'utf-8');
    this.ast = parse(contents, { sourceType: 'module' });

    this.analyseDependencies();
  }

  private analyseDependencies() {
    traverse(this.ast, {
      ImportDeclaration: (path) => {
        this.dependencies.push(
          this.getDependencyModule(path.node.source.value, this.directory)
        );
      },
      ExportNamedDeclaration: (path) => {
        if (path.node.source) {
          this.dependencies.push(
            this.getDependencyModule(path.node.source.value, this.directory)
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
}
