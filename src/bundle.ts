import * as fs from 'fs';
import { join, dirname } from 'path';
import traverse, { NodePath } from '@babel/traverse';
import { generate } from '@babel/generator';
import {
  callExpression,
  classExpression,
  ExportDefaultDeclaration,
  ExportNamedDeclaration,
  functionExpression,
  identifier,
  ImportDeclaration,
  isExportDefaultSpecifier,
  isExportNamespaceSpecifier,
  memberExpression,
  objectExpression,
  objectProperty,
  stringLiteral,
  VariableDeclaration,
  variableDeclaration,
  variableDeclarator,
} from '@babel/types';
import { getDefaultExportIdentifier } from './utils.js';
import { Module } from './module.js';

export class Bundle {
  private entryPath: string;

  private outputPath: string | undefined;

  constructor(entryPath: string, outputPath?: string) {
    this.entryPath = entryPath;
    this.outputPath = outputPath;
  }

  private transformImports(path: NodePath<ImportDeclaration>, module: Module) {
    const importPath = path.node.source.value;
    const dependency: Module = module.dependencies.find(
      (dependency) => dependency.path === join(dirname(module.path), importPath)
    )!;

    const variableDeclarations: VariableDeclaration[] = [];

    for (const specifier of path.node.specifiers) {
      let variable: VariableDeclaration;

      switch (specifier.type) {
        case 'ImportDefaultSpecifier':
          // import foo from './foo.js';
          variable = variableDeclaration('const', [
            variableDeclarator(
              identifier(specifier.local.name),
              getDefaultExportIdentifier(dependency.id)
            ),
          ]);
          variableDeclarations.push(variable);
          break;
        case 'ImportNamespaceSpecifier':
          // import * as foo from './foo.js';
          variable = variableDeclaration('const', [
            variableDeclarator(
              identifier(specifier.local.name),
              callExpression(
                memberExpression(identifier('Object'), identifier('freeze')),
                [
                  objectExpression(
                    dependency.namedExports.map((namedExport) =>
                      objectProperty(
                        stringLiteral(namedExport),
                        identifier(namedExport)
                      )
                    )
                  ),
                ]
              )
            ),
          ]);
          variableDeclarations.push(variable);
          break;
        case 'ImportSpecifier':
          switch (specifier.imported.type) {
            case 'Identifier':
              if (specifier.imported.name !== specifier.local.name) {
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
              }
              break;
            case 'StringLiteral':
              // import { 'bar-bar' as foo } from './foo.js';
              // TODO: Handle StringLiteral imports
              break;
          }
          break;
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
          let variable: VariableDeclaration;

          switch (specifier.type) {
            case 'ExportDefaultSpecifier':
              break;
            case 'ExportNamespaceSpecifier':
              break;
            case 'ExportSpecifier':
              switch (specifier.exported.type) {
                case 'Identifier':
                  if (specifier.exported.name !== specifier.local.name) {
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
                  }
                  break;
                case 'StringLiteral':
                  // export { foo as 'bar-bar' };
                  // TODO: Handle StringLiteral exports
                  break;
              }
              break;
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
    switch (declaration.type) {
      case 'ClassDeclaration':
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
            variableDeclarator(
              getDefaultExportIdentifier(module.id),
              expression
            ),
          ]);
          path.replaceWith(exportClassVariable);
        }
        break;
      case 'FunctionDeclaration':
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
            variableDeclarator(
              getDefaultExportIdentifier(module.id),
              expression
            ),
          ]);
          path.replaceWith(exportFunctionVariable);
        }
        break;
      case 'TSDeclareFunction':
        break;
      default: {
        const defaultExportVariable = variableDeclaration('const', [
          variableDeclarator(
            getDefaultExportIdentifier(module.id),
            declaration
          ),
        ]);
        path.replaceWith(defaultExportVariable);
        break;
      }
    }
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
    const module = new Module(this.entryPath);
    const bundledCode = this.getBundle(module);

    if (this.outputPath) {
      fs.writeFileSync(this.outputPath, bundledCode);
    }

    return bundledCode;
  }
}
