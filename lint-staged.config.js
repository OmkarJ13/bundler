/**
 * @filename: lint-staged.config.js
 * @type {import('lint-staged').Configuration}
 */
export default {
  '**/*': 'npm run prettier',
  '**/*.{js,mjs,cjs,ts}': 'npm run eslint',
  '**/*.ts': () => 'npm run typescript:check',
};
