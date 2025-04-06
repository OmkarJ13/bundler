/**
 * @filename: lint-staged.config.js
 * @type {import('lint-staged').Configuration}
 */
export default {
  '**/*': 'npm run format',
  '**/*.{js,mjs,cjs,ts}': 'npm run lint',
};
