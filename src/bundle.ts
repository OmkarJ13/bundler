import * as fs from 'fs';
import * as path from 'path';

type Dependency = {
  path: string;
  code: string;
  dependencies: Dependency[];
};

function getDependencyGraph(entry: string): Dependency {
  const entryDir = path.dirname(entry);
  const contents = fs.readFileSync(entry, 'utf-8');

  const dependencyGraph: Dependency = {
    path: entry,
    code: contents
      .replaceAll(/import.*from.*/g, '')
      .replaceAll(/export/g, '')
      .trim(),
    dependencies: [],
  };

  // Hax to match import paths, to be replaced by AST parser in future
  const matches = Array.from(
    contents.matchAll(/import.*from.*(?:'|")(.*)(?:'|")/g)
  );

  const imports = matches.map((match) => match[1]);
  imports.forEach((importPath) => {
    const absolutePath = path.join(entryDir, importPath);
    const childDependencyGraph: Dependency = getDependencyGraph(absolutePath);
    dependencyGraph.dependencies.push(childDependencyGraph);
  });

  return dependencyGraph;
}

function getBundle(dependencyGraph: Dependency): string {
  const code = [];

  if (dependencyGraph.dependencies.length > 0) {
    for (const childDependency of dependencyGraph.dependencies) {
      code.push(getBundle(childDependency));
    }
  }

  code.push(dependencyGraph.code);
  return code.join('\n');
}

export function bundle(entryFile: string, outputFile: string): void {
  const dependencyGraph = getDependencyGraph(entryFile);
  const bundledCode = getBundle(dependencyGraph);
  fs.writeFileSync(outputFile, bundledCode);
}
