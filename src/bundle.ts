import * as fs from 'fs';
import * as path from 'path';
import { getObjectAsString } from './utils.js';

type Dependency = {
  path: string;
  code: (
    require: (path: string) => unknown,
    module: { exports: Record<string, never> }
  ) => void;
  dependencies: Record<string, Dependency>;
};

export function getDependencyGraph(entry: string): Dependency {
  const entryDir = path.dirname(entry);
  const contents = fs.readFileSync(entry, 'utf-8');

  const dependencyGraph: Dependency = {
    path: entry,
    code: eval(`(function (require, module) {
      ${contents}
    })`) as (
      require: (path: string) => unknown,
      module: { exports: Record<string, never> }
    ) => void,
    dependencies: {},
  };

  // Hax to match import paths, to be replaced by AST parser in future
  const matches = Array.from(
    contents.matchAll(/require\((?:'|")(.*)(?:'|")\)/g)
  );

  const imports = matches.map((match) => match[1]);
  imports.forEach((importPath) => {
    const absolutePath = path.join(entryDir, importPath);
    const childDependencyGraph: Dependency = getDependencyGraph(absolutePath);
    dependencyGraph.dependencies[importPath] = childDependencyGraph;
  });

  return dependencyGraph;
}

function bootstrapModules(dependencyGraph: Dependency) {
  function require(dependencyGraph: Dependency) {
    const module: { exports: Record<string, never> } = { exports: {} };

    function localRequire(path: string) {
      const childDependencyGraph = dependencyGraph.dependencies[path];
      return require(childDependencyGraph);
    }

    dependencyGraph.code(localRequire, module);
    return module.exports;
  }

  require(dependencyGraph);
}

export function bundle(dependencyGraph: Dependency, outputPath: string): void {
  const bundle = `
    (${bootstrapModules.toString()})(${getObjectAsString(dependencyGraph)})
  `;

  fs.writeFileSync(outputPath, bundle);
}
