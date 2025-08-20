import * as fs from 'fs';
import traverse, { Binding } from '@babel/traverse';
import { generate } from '@babel/generator';
import { Module } from './module.js';
import { program, file, File } from '@babel/types';
import transformImports from './ast-transformers/import-declaration.js';
import transformNamedExports from './ast-transformers/export-named-declaration.js';
import transformDefaultExports from './ast-transformers/export-default-declaration.js';
import transformExportAll from './ast-transformers/export-all-declaration.js';
import {
  declareConst,
  mergeNamespacesFunctionDefinition,
  isIllegalIdentifier,
  traverseDependencyGraph,
  mergeNamespacesFunctionName,
} from './utils.js';
import { ExternalModule } from './external-module.js';
import {
  arrayExpression,
  callExpression,
  identifier,
  ImportDeclaration,
  importDeclaration,
  ImportDefaultSpecifier,
  importDefaultSpecifier,
  ImportNamespaceSpecifier,
  importNamespaceSpecifier,
  ImportSpecifier,
  importSpecifier,
  memberExpression,
  objectExpression,
  objectProperty,
  stringLiteral,
} from '@babel/types';
import { ParseResult } from '@babel/parser';

export class Bundle {
  private entryPath: string;

  private outputPath: string | undefined;

  private identifierNames = new Set<string>();

  constructor(entryPath: string, outputPath?: string) {
    this.entryPath = entryPath;
    this.outputPath = outputPath;
  }

  private getBundle(module: Module): string {
    let code = '';

    traverseDependencyGraph(module, (module) => {
      code += generate(module.ast).code + '\n';
    });

    return code;
  }

  private transformAst(module: Module): void {
    traverseDependencyGraph(module, (module) => {
      traverse(module.ast, {
        ImportDeclaration: (path) => transformImports(path, module),
        ExportNamedDeclaration: (path) => transformNamedExports(path, module),
        ExportDefaultDeclaration: (path) =>
          transformDefaultExports(path, module),
        ExportAllDeclaration: (path) => transformExportAll(path, module),
      });

      if (!module.isEntryModule && module.exports['*']) {
        let exportAllNamespace;

        if (module.externalExportAlls.length > 0) {
          exportAllNamespace = declareConst(
            module.exports['*'].identifierName,
            callExpression(identifier(mergeNamespacesFunctionName), [
              objectExpression(
                Object.entries(module.exports)
                  .filter(
                    ([exportedName]) =>
                      exportedName !== 'default' && exportedName !== '*'
                  )
                  .map(([exportedName, { identifierName }]) =>
                    objectProperty(
                      stringLiteral(exportedName),
                      identifier(identifierName)
                    )
                  )
              ),
              arrayExpression(
                module.externalExportAlls.map((exportAll) => {
                  const dependency = module.dependencies[
                    exportAll.source.value
                  ] as ExternalModule;
                  return identifier(dependency.exports['*'].identifierName);
                })
              ),
            ])
          );
        } else {
          exportAllNamespace = declareConst(
            module.exports['*'].identifierName,
            callExpression(
              memberExpression(identifier('Object'), identifier('freeze')),
              [
                objectExpression(
                  Object.entries(module.exports)
                    .filter(
                      ([exportedName]) =>
                        exportedName !== 'default' && exportedName !== '*'
                    )
                    .map(([exportedName, { identifierName }]) =>
                      objectProperty(
                        stringLiteral(exportedName),
                        identifier(identifierName)
                      )
                    )
                ),
              ]
            )
          );
        }

        module.ast.program.body.push(exportAllNamespace);
      }
    });
  }

  private getDeconflictedIdentifierName(identifierName: string): string {
    let deconflictedIdentifierName: string;

    if (this.identifierNames.has(identifierName)) {
      let index = 1;
      deconflictedIdentifierName = `${identifierName}$${index}`;

      while (this.identifierNames.has(deconflictedIdentifierName)) {
        deconflictedIdentifierName = `${identifierName}$${index++}`;
      }
    } else {
      deconflictedIdentifierName = identifierName;
    }

    this.identifierNames.add(deconflictedIdentifierName);
    return deconflictedIdentifierName;
  }

  private deconflictBindings(module: Module) {
    const exports = Object.values(module.exports);

    module.bindings.forEach((binding) => {
      const oldIdentifierName = binding.identifier.name;
      const identifierName =
        this.getDeconflictedIdentifierName(oldIdentifierName);

      if (identifierName !== oldIdentifierName) {
        binding.identifier.name = identifierName;

        binding.referencePaths.forEach((path) => {
          if (path.node.type === 'Identifier') {
            path.node.name = identifierName;
          }
        });

        binding.constantViolations.forEach((path) => {
          if (
            path.isAssignmentExpression() &&
            path.node.left.type === 'Identifier'
          ) {
            path.node.left.name = identifierName;
          }
        });

        const exported = exports.find(
          (exported) => exported.binding && exported.binding === binding
        );
        if (exported) {
          exported.identifierName = identifierName;
        }
      }
    });
  }

  private deconflictExportsWithoutBindings(
    exports: Record<
      string,
      { identifierName: string; binding?: Binding; exportedFrom?: string }
    >
  ) {
    Object.values(exports)
      .filter((exported) => !exported.binding && !exported.exportedFrom)
      .forEach((exported) => {
        const oldIdentifierName = exported.identifierName;
        const newIdentifierName =
          this.getDeconflictedIdentifierName(oldIdentifierName);
        if (oldIdentifierName !== newIdentifierName) {
          exported.identifierName = newIdentifierName;
        }
      });
  }

  private deconflictIdentifiers(module: Module) {
    Module.externalModules.forEach((externalModule) => {
      this.deconflictExportsWithoutBindings(externalModule.exports);
    });

    traverseDependencyGraph(module, (module) => {
      this.deconflictBindings(module);
      this.deconflictExportsWithoutBindings(module.exports);
    });
  }

  private getExternalImports(): ImportDeclaration[] {
    const importDeclarations: ImportDeclaration[] = [];

    Module.externalModules.forEach((externalModule) => {
      const exports = Object.entries(externalModule.exports);
      if (exports.length > 0) {
        const importSpecifiers: ImportSpecifier[] = [];
        const importDefaultSpecifiers: ImportDefaultSpecifier[] = [];
        const importNamespaceSpecifiers: ImportNamespaceSpecifier[] = [];

        for (const [exported, { identifierName }] of exports) {
          if (exported === 'default') {
            importDefaultSpecifiers.push(
              importDefaultSpecifier(identifier(identifierName))
            );
          } else if (exported === '*') {
            importNamespaceSpecifiers.push(
              importNamespaceSpecifier(identifier(identifierName))
            );
          } else {
            importSpecifiers.push(
              importSpecifier(
                identifier(identifierName),
                isIllegalIdentifier(exported)
                  ? stringLiteral(exported)
                  : identifier(exported)
              )
            );
          }
        }

        if (importSpecifiers.length > 0) {
          importDeclarations.push(
            importDeclaration(
              importSpecifiers,
              stringLiteral(externalModule.path)
            )
          );
        }

        if (importDefaultSpecifiers.length > 0) {
          importDeclarations.push(
            importDeclaration(
              importDefaultSpecifiers,
              stringLiteral(externalModule.path)
            )
          );
        }

        if (importNamespaceSpecifiers.length > 0) {
          importDeclarations.push(
            importDeclaration(
              importNamespaceSpecifiers,
              stringLiteral(externalModule.path)
            )
          );
        }
      } else {
        importDeclarations.push(
          importDeclaration([], stringLiteral(externalModule.path))
        );
      }
    });

    return importDeclarations;
  }

  bundle(): string {
    Module.externalModules.clear();
    const module = new Module(this.entryPath, true);

    this.deconflictIdentifiers(module);

    const externalImportDeclarations = this.getExternalImports();

    this.transformAst(module);

    let needsMergeNamespaces = false;

    traverseDependencyGraph(module, (module) => {
      if (module.exports['*'] && module.externalExportAlls.length > 0) {
        needsMergeNamespaces = true;
      }
    });

    const bundledAst = file(program([], [], 'module'));

    const asts: ParseResult<File>[] = [];

    traverseDependencyGraph(module, (module) => {
      asts.push(module.ast);
    });

    bundledAst.program.body.push(
      ...externalImportDeclarations,
      ...(needsMergeNamespaces
        ? [mergeNamespacesFunctionDefinition.program.body[0]]
        : []),
      ...asts.map((ast) => ast.program.body).flat()
    );

    const bundledCode = generate(bundledAst).code;

    if (this.outputPath) {
      fs.writeFileSync(this.outputPath, bundledCode);
    }

    return bundledCode;
  }
}
