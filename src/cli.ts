#! /usr/bin/env node

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { Bundler } from './bundler.js';
import { resolve } from 'path';
import { existsSync } from 'fs';
import type { Config } from './index.js';

yargs()
  .scriptName('bundler')
  .usage('$0 [command] [options]')
  .command(
    'bundle [options]',
    'bundle javascript files',
    (yargs) => {
      return yargs
        .option('entry', {
          description: 'entry file',
          type: 'string',
        })
        .option('output', {
          description: 'output bundle file',
          type: 'string',
        })
        .option('minify', {
          default: false,
          description: 'minify the bundle',
          defaultDescription: 'false',
        })
        .option('treeshake', {
          default: true,
          description: 'treeshake the bundle',
          defaultDescription: 'true',
        })
        .option('config', {
          description: 'config file',
          type: 'string',
          defaultDescription: 'bundler.config.js',
        });
    },
    async (argv) => {
      let config: Partial<Config> = {};

      const configPath = resolve(
        process.cwd(),
        argv.config ?? 'bundler.config.js'
      );
      if (existsSync(configPath)) {
        const module = await import(configPath);
        config = module.default;
      } else {
        if (argv.config) {
          throw new Error(`Config file ${configPath} not found`);
        }
      }

      const entry = config?.entry ?? argv.entry;
      const output = config?.output ?? argv.output;
      const minify = config?.minify ?? argv.minify;
      const treeshake = config?.treeshake ?? argv.treeshake;

      if (!entry) {
        throw new Error('No entry file path provided');
      }

      if (!output) {
        throw new Error('No output file path provided');
      }

      const bundle = new Bundler(entry, output, minify, treeshake);

      bundle.bundle();
    }
  )
  .help()
  .parse(hideBin(process.argv));
