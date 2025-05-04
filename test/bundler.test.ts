import { describe, expect, test } from 'vitest';
import { Bundle } from '../src/bundle';
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
      const entryPath = path.join(fixturesDir, name, 'index.js');
      const bundle = new Bundle(entryPath);
      const bundledCode = bundle.bundle();
      await expect(bundledCode).toMatchFileSnapshot(
        `fixtures/${name}/bundle.js`
      );
    });
  }
});
