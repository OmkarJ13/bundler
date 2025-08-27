# Bundler

This is a minimalist JavaScript bundler created to explore the inner workings of modern module bundlers like Rollup and webpack. It's a tool built for learning and experimentation, and not intended for production use.

## Features

- **ES Module Support:** Works with `import` and `export` syntax.
- **Tree-Shaking:** Automatically removes unused code to keep your bundles small.
- **Scope Hoisting:** Combines modules into a single scope for faster, smaller code.
- **Minification:** Reduces the final bundle size by removing unnecessary characters.
- **Dependency Resolution:** Traverses your module graph to include all necessary code.
- **Minimalist Core:** A small, focused codebase that's easier to understand.

## Usage

You can use Bundler to bundle your JavaScript projects from the command line.

```bash
npx bundler bundle --entry ./src/index.js --output ./dist/bundle.js
```

### Options

| Option        | Description                            | Default             |
| ------------- | -------------------------------------- | ------------------- |
| `--entry`     | The entry point of your application.   | (required)          |
| `--output`    | The path to write the bundled file to. | (required)          |
| `--treeshake` | Enable or disable tree-shaking.        | `true`              |
| `--minify`    | Minify the output bundle.              | `false`             |
| `--config`    | Path to a configuration file.          | `bundler.config.js` |

### Configuration File

You can also configure Bundler using a `bundler.config.js` file:

```javascript
// bundler.config.js
export default {
  entry: './src/index.js',
  output: './dist/bundle.js',
  minify: true,
};
```

## How It Works

This bundler processes JavaScript modules in the following sequence:

1.  **Parsing & Dependency Graph Construction**: It starts from the entry file, parsing the code into an Abstract Syntax Tree (AST). It then traverses the `import` statements to discover all dependencies, building a complete graph of your project's modules.

2.  **Tree Shaking**: The dependency graph is analyzed to identify and remove any exported code that is not actually used in the project, which helps to reduce the final bundle size.

3.  **Deconflicting Identifiers**: To prevent naming collisions when all the modules are combined, the bundler intelligently renames variables as needed.

4.  **Scope Hoisting**: The `import` and `export` statements, which are specific to modules, are transformed and rewritten so that all the code can exist within a single scope.

5.  **Code Generation**: Finally, the transformed code from all modules is concatenated, minified, and a single bundled JavaScript file is generated.

## Development

To get started with development:

1.  Clone the repository:
    ```bash
    git clone https://github.com/OmkarJ13/bundler.git
    ```
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Run the tests:
    ```bash
    npm test
    ```

## Future Scope & Contributions

There are many opportunities to expand the capabilities of this project, and contributions are welcome! Some of the features that could be added in the future include:

- **Source Maps**: To make debugging bundled code easier.
- **Code Splitting**: To split the bundle into smaller chunks that can be loaded on demand.
- **Plugin System**: To allow for custom transformations and optimizations.
- **Support for Other Module Formats**: Such as CommonJS.

If you're interested in contributing, feel free to open an issue or submit a pull request.

---

Built with curiosity by [OmkarJ13](https://github.com/OmkarJ13).
