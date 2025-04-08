import * as fs from 'fs';
import * as path from 'path';

export function bundle(entry: string): string[] {
  const entryDir = path.dirname(entry);
  const contents = fs.readFileSync(entry, 'utf-8');
  // Hax to match import paths, to be replaced by AST parser in future
  const matches = Array.from(
    contents.matchAll(/import.*from.*(?:'|")(.*)(?:'|")/g)
  );

  const dependencies: string[] = [];
  if (matches.length > 0) {
    matches.forEach((match) => {
      const path = match[1];
      dependencies.push(path);
    });
  }

  for (const relativePath of dependencies) {
    const absolutePath = path.join(entryDir, relativePath);
    const nestedDependencies: string[] = bundle(absolutePath);
    if (nestedDependencies.length > 0) {
      dependencies.push(...nestedDependencies);
    }
  }

  return dependencies;
}
