import * as fs from 'fs';
import { join, dirname } from 'path';
import { parse, ParseResult } from '@babel/parser';
import traverse, { NodePath } from '@babel/traverse';
import { generate } from '@babel/generator';
import {
  classExpression,
  ExportDefaultDeclaration,
  ExportNamedDeclaration,
  File,
  functionExpression,
  identifier,
  ImportDeclaration,
  isClassDeclaration,
  isExportDefaultSpecifier,
  isExportNamespaceSpecifier,
  isExportSpecifier,
  isFunctionDeclaration,
  isImportDefaultSpecifier,
  isImportNamespaceSpecifier,
  isTSDeclareFunction,
  VariableDeclaration,
  variableDeclaration,
  variableDeclarator,
} from '@babel/types';
import { getDefaultExportIdentifier } from './utils.js';

type Module = {
  id: number;
  path: string;
  ast: ParseResult<File>;
  dependencies: Module[];
};

export class Bundle {
  private id = 0;

  private entryPath: string;

  private outputPath: string | undefined;

  constructor(entryPath: string, outputPath?: string) {
    this.entryPath = entryPath;
    this.outputPath = outputPath;
  }

  private getId() {
    return this.id++;
  }

  private transformImports(path: NodePath<ImportDeclaration>, module: Module) {
    const importPath = path.node.source.value;
    const dependency: Module = module.dependencies.find(
      (dependency) => dependency.path === join(dirname(module.path), importPath)
    )!;

    const variableDeclarations: VariableDeclaration[] = [];

    for (const specifier of path.node.specifiers) {
      if (isImportDefaultSpecifier(specifier)) {
        // import foo from './foo.js';
        const defaultImportVariable = variableDeclaration('const', [
          variableDeclarator(
            identifier(specifier.local.name),
            getDefaultExportIdentifier(dependency.id)
          ),
        ]);

        variableDeclarations.push(defaultImportVariable);
      } else if (isImportNamespaceSpecifier(specifier)) {
        // import * as foo from './foo.js';
        // TODO
      } else {
        if (
          specifier.imported.type === 'Identifier' &&
          specifier.imported.name !== specifier.local.name
        ) {
          let variable: VariableDeclaration;

          if (specifier.imported.name === 'default') {
            // import { default as foo } from './foo.js';
            variable = variableDeclaration('const', [
              variableDeclarator(
                identifier(specifier.local.name),
                getDefaultExportIdentifier(dependency.id)
              ),
            ]);
          } else {
            // import { foo as bar } from './foo.js';
            variable = variableDeclaration('const', [
              variableDeclarator(
                identifier(specifier.local.name),
                identifier(specifier.imported.name)
              ),
            ]);
          }

          variableDeclarations.push(variable);
        } else if (specifier.imported.type === 'StringLiteral') {
          // import { 'bar-bar' as foo } from './foo.js';
          // TODO: Handle StringLiteral imports
        }
      }
    }

    path.replaceWithMultiple(variableDeclarations);
  }

  private transformNamedExports(
    path: NodePath<ExportNamedDeclaration>,
    module: Module
  ) {
    const exportFromPath = path.node.source;

    if (exportFromPath) {
      // export .. from ...
      const dependency = module.dependencies.find(
        (dependency) =>
          dependency.path === join(dirname(module.path), exportFromPath.value)
      )!;
      const specifiers = path.node.specifiers;

      if (
        specifiers.length === 1 &&
        specifiers[0].exported.type === 'Identifier' &&
        specifiers[0].exported.name === 'default'
      ) {
        // export { default } from './foo.js';
        const variable = variableDeclaration('const', [
          variableDeclarator(
            getDefaultExportIdentifier(module.id),
            getDefaultExportIdentifier(dependency.id)
          ),
        ]);
        path.replaceWith(variable);
      } else {
        const variableDeclarations: VariableDeclaration[] = [];
        for (const specifier of specifiers) {
          if (isExportDefaultSpecifier(specifier)) {
            // export foo from './foo.js';
            const variable = variableDeclaration('const', [
              variableDeclarator(
                identifier(specifier.exported.name),
                getDefaultExportIdentifier(dependency.id)
              ),
            ]);
            path.replaceWith(variable);
          } else if (isExportNamespaceSpecifier(specifier)) {
            // export * as foo from './foo.js';
            // TODO
          } else {
            if (
              specifier.exported.type === 'Identifier' &&
              specifier.exported.name !== specifier.local.name
            ) {
              let variable: VariableDeclaration;

              if (specifier.exported.name === 'default') {
                // export { foo as default } from './foo.js';
                variable = variableDeclaration('const', [
                  variableDeclarator(
                    getDefaultExportIdentifier(module.id),
                    identifier(specifier.local.name)
                  ),
                ]);
              } else if (specifier.local.name === 'default') {
                // export { default as foo } from './foo.js';
                variable = variableDeclaration('const', [
                  variableDeclarator(
                    identifier(specifier.exported.name),
                    getDefaultExportIdentifier(dependency.id)
                  ),
                ]);
              } else {
                // export { foo as bar } from './foo.js';
                variable = variableDeclaration('const', [
                  variableDeclarator(
                    identifier(specifier.exported.name),
                    identifier(specifier.local.name)
                  ),
                ]);
              }

              variableDeclarations.push(variable);
            } else if (specifier.exported.type === 'StringLiteral') {
              // export { foo as 'bar-bar' } from './foo.js';
              // TODO: Handle StringLiteral exports
            }
          }
        }
        path.replaceWithMultiple(variableDeclarations);
      }
    } else {
      const declaration = path.node.declaration;
      if (declaration) {
        // export const foo = 'bar';
        path.replaceWith(declaration);
      } else {
        const variableDeclarations: VariableDeclaration[] = [];
        for (const specifier of path.node.specifiers) {
          if (isExportSpecifier(specifier)) {
            if (
              specifier.exported.type === 'Identifier' &&
              specifier.exported.name !== specifier.local.name
            ) {
              let variable: VariableDeclaration;

              if (specifier.exported.name === 'default') {
                // export { foo as default };
                variable = variableDeclaration('const', [
                  variableDeclarator(
                    getDefaultExportIdentifier(module.id),
                    identifier(specifier.local.name)
                  ),
                ]);
              } else {
                // export { foo as bar };
                variable = variableDeclaration('const', [
                  variableDeclarator(
                    identifier(specifier.exported.name),
                    identifier(specifier.local.name)
                  ),
                ]);
              }

              variableDeclarations.push(variable);
            } else if (specifier.exported.type === 'StringLiteral') {
              // export { foo as 'bar-bar' };
              // TODO: Handle StringLiteral exports
            }
          }
        }
        path.replaceWithMultiple(variableDeclarations);
      }
    }
  }

  private transformDefaultExports(
    path: NodePath<ExportDefaultDeclaration>,
    module: Module
  ) {
    // export default foo;
    const declaration = path.node.declaration;
    if (isClassDeclaration(declaration)) {
      if (declaration.id) {
        path.replaceWith(declaration);
        const exportFunctionVariable = variableDeclaration('const', [
          variableDeclarator(
            getDefaultExportIdentifier(module.id),
            declaration.id
          ),
        ]);
        path.insertAfter(exportFunctionVariable);
      } else {
        const expression = classExpression(
          null,
          declaration.superClass,
          declaration.body,
          declaration.decorators
        );
        const exportClassVariable = variableDeclaration('const', [
          variableDeclarator(getDefaultExportIdentifier(module.id), expression),
        ]);
        path.replaceWith(exportClassVariable);
      }
    } else if (isFunctionDeclaration(declaration)) {
      if (declaration.id) {
        path.replaceWith(declaration);
        const exportFunctionVariable = variableDeclaration('const', [
          variableDeclarator(
            getDefaultExportIdentifier(module.id),
            declaration.id
          ),
        ]);
        path.insertAfter(exportFunctionVariable);
      } else {
        const expression = functionExpression(
          null,
          declaration.params,
          declaration.body,
          declaration.generator,
          declaration.async
        );
        const exportFunctionVariable = variableDeclaration('const', [
          variableDeclarator(getDefaultExportIdentifier(module.id), expression),
        ]);
        path.replaceWith(exportFunctionVariable);
      }
    } else if (isTSDeclareFunction(declaration)) {
      // TODO Later
    } else {
      const defaultExportVariable = variableDeclaration('const', [
        variableDeclarator(getDefaultExportIdentifier(module.id), declaration),
      ]);
      path.replaceWith(defaultExportVariable);
    }
  }

  private getDependencyModule(relativePath: string, directory: string): Module {
    const absolutePath = join(directory, relativePath);
    const dependencyModule = this.analyzeModule(absolutePath);
    return dependencyModule;
  }

  private analyzeModule(modulePath: string): Module {
    const moduleDirectory = dirname(modulePath);
    const contents = fs.readFileSync(modulePath, 'utf-8');
    const ast = parse(contents, { sourceType: 'module' });
    const dependencies: Module[] = [];

    const moduleId = this.getId();

    traverse(ast, {
      ImportDeclaration: (path) => {
        dependencies.push(
          this.getDependencyModule(path.node.source.value, moduleDirectory)
        );
      },
      ExportNamedDeclaration: (path) => {
        if (path.node.source) {
          dependencies.push(
            this.getDependencyModule(path.node.source.value, moduleDirectory)
          );
        }
      },
    });

    const module: Module = {
      id: moduleId,
      path: modulePath,
      ast,
      dependencies,
    };

    return module;
  }

  private getBundle(module: Module): string {
    let code = '';

    if (module.dependencies.length > 0) {
      for (const childDependency of module.dependencies) {
        code += this.getBundle(childDependency);
      }
    }

    traverse(module.ast, {
      ImportDeclaration: (path) => this.transformImports(path, module),
      ExportNamedDeclaration: (path) =>
        this.transformNamedExports(path, module),
      ExportDefaultDeclaration: (path) =>
        this.transformDefaultExports(path, module),
    });

    code += generate(module.ast).code + '\n';
    return code;
  }

  bundle(): string {
    const module = this.analyzeModule(this.entryPath);
    const bundledCode = this.getBundle(module);

    if (this.outputPath) {
      fs.writeFileSync(this.outputPath, bundledCode);
    }

    return bundledCode;
  }
}
