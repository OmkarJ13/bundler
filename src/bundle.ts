import * as fs from 'fs';
import * as path from 'path';
import { getId } from './utils.js';

type Dependency = {
  id: number;
  path: string;
  code: string;
  dependencies: Dependency[];
};

export function bundle(entry: string): Dependency[] {
  const entryDir = path.dirname(entry);
  const contents = fs.readFileSync(entry, 'utf-8');

  const dependencies: Dependency[] = [
    {
      id: getId(),
      path: entry,
      code: contents,
      dependencies: [],
    },
  ];

  // Hax to match import paths, to be replaced by AST parser in future
  const matches = Array.from(
    contents.matchAll(/import.*from.*(?:'|")(.*)(?:'|")/g)
  );

  const imports = matches.map((match) => match[1]);
  imports.forEach((importPath) => {
    const absolutePath = path.join(entryDir, importPath);
    const nestedDependencies: Dependency[] = bundle(absolutePath);
    dependencies[0].dependencies.push(...nestedDependencies);
  });

  return dependencies;
}
