import { describe, expect, test } from 'vitest';
import { Bundler } from '../src/bundler';
import path from 'path';
import fs from 'fs';

const fixturesDir = path.join(__dirname, 'fixtures');
const fixtures = fs.readdirSync(fixturesDir).filter((name) => {
  const fullPath = path.join(fixturesDir, name);
  return fs.statSync(fullPath).isDirectory();
});

describe('bundler', async () => {
  for (const name of fixtures) {
    const fixturePath = path.join(fixturesDir, name);
    const configPath = path.join(fixturePath, '_config.js');
    const { default: config } = await import(configPath);

    test(
      config.name,
      {
        only: config.only,
        skip: config.skip,
      },
      async () => {
        const entryPath = path.join(fixturePath, 'index.js');
        if (config.throwsError) {
          expect(() => {
            const bundle = new Bundler(entryPath);
            bundle.bundle();
          }).toThrow(config.throwsError);
        } else {
          const bundle = new Bundler(entryPath);
          const bundledCode = bundle.bundle();
          await expect(bundledCode).toMatchFileSnapshot(
            `fixtures/${name}/_expected.js`,
            fixturePath
          );
        }
      }
    );
  }
});
