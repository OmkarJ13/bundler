#! /usr/bin/env node

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { Bundle } from './bundle.js';

yargs()
  .scriptName('redemption')
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
        });
    },
    (argv) => {
      const bundle = new Bundle(argv.entry, argv.output);
      bundle.bundle();
    }
  )
  .help()
  .parse(hideBin(process.argv));
