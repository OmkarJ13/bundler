#! /usr/bin/env node

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { Bundle } from './bundle.js';

yargs()
  .scriptName('bundler')
  .usage('$0 [command] [options]')
  .command(
    'bundle [options]',
    'bundle javascript files',
    (yargs) => {
      return yargs
        .option('entry', {
          default: 'src/index.js',
          description: 'entry file',
        })
        .option('output', {
          default: 'dist/bundle.js',
          description: 'output bundle file',
        })
        .option('minify', {
          default: false,
          description: 'minify the bundle',
        })
        .option('treeshake', {
          default: true,
          description: 'treeshake the bundle',
        })
        .option('config', {
          default: 'bundler.config.js',
          description: 'config file',
        });
    },
    async (argv) => {
      const { default: config } = await import(argv.config);

      const bundle = new Bundle(
        config.entry ?? argv.entry,
        config.output ?? argv.output,
        config.minify ?? argv.minify,
        config.treeshake ?? argv.treeshake
      );

      bundle.bundle();
    }
  )
  .help()
  .parse(hideBin(process.argv));
