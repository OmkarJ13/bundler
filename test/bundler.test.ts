import { describe, expect, test } from 'vitest';
import { bundle } from '../src/bundle';
import path from 'path';
import fs from 'fs';

const fixturesDir = path.join(__dirname, 'fixtures');
const fixtures = fs.readdirSync(fixturesDir).filter((name) => {
  const fullPath = path.join(fixturesDir, name);
  return fs.statSync(fullPath).isDirectory();
});

describe('bundler', () => {
  for (const name of fixtures) {
    test(`should bundle: ${name}`, async () => {
      const entryFile = path.join(fixturesDir, name, 'index.js');
      console.log(entryFile);
      const bundledCode = bundle(entryFile);
      await expect(bundledCode).toMatchFileSnapshot(
        `fixtures/${name}/bundle.js`
      );
    });
  }
});
