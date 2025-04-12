#! /usr/bin/env node

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { bundle } from './bundle.js';

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
      bundle(argv.entry, argv.output);
    }
  )
  .help()
  .parse(hideBin(process.argv));
