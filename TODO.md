# 🛠 Redemption

---

## 🎯 Chapter 1: Foundation

- [x] Setup package.json
- [x] Setup Typescript
- [x] Install and configure Prettier
- [x] Install and configure ESLint
- [x] Setup lint-staged and husky for pre-commit hooks
- [x] Figure out basic directory structure

## 🎯 Chapter 2: Basics

- [x] Create basic CLI
  - [x] Accept entry file path from CLI arguments
  - [x] Print received entry file path
- [x] Figure out bundler parsing logic
  - [x] Read entry file content
  - [x] Parse imports (basic parsing)
  - [x] Collect dependencies
- [x] Figure out how to model dependency graph
- [ ] Bundle Files
  - [ ] Naive bundling (concatenate module code using IIFEs)
  - [ ] Output bundle

## 🎯 Chapter 3: Beyond The Basics

- [ ] Scope Hoisting (flatten modules without IIFEs)
  - [ ] Read through how rollup does this
  - [ ] Understand the benefits vs. naive approach
- [ ] Handle Variable Name Collisions

## 🎯 Chapter 4: Advanced Bundler

- [ ] TypeScript Support
  - [ ] Handle `.ts` file extensions
  - [ ] Transpile `.ts` to `.js` (basic — strip types)
  - [ ] Decide whether to use own parser or call external transpiler like esbuild
  - [ ] Support bundling mixed projects (`.js` + `.ts`)
- [ ] Naive Tree Shaking (Remove unused imports/exports)
  - [ ] Modify dependency graph to identify unused dependencies
  - [ ] Modify bundling logic to exclude unused dependencies
- [ ] Figure out how to handle external libraries
  - [ ] How the fuck does this work?
  - [ ] Handle external libs, don't bundle them
- [ ] Code splitting - Multiple output chunks
- [ ] Minification using an external library

## 🎯 Chapter 5: Developer Experience

- [ ] Support for redemption.config.ts file to specify options
- [ ] Prettify CLI output and error reporting
- [ ] Unit tests

## 🎯 Chapter 6: Beyond Advanced - Red Dead Redemption

- [ ] Minification logic from scratch
  - [ ] Too optimistic?
- [ ] Circular dependency detection
- [ ] Aggressive tree-shaking, for more than just imports and exports
- [ ] Sourcemaps
  - [ ] Again, what the fuck?
- [ ] Plugin Hooks

---
