#! /usr/bin/env node

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

yargs(hideBin(process.argv))
  .command(
    'bundle [entry]',
    'bundles js files',
    (yargs) => {
      return yargs.positional('entry', {
        default: 'index.js',
        description: 'entry file',
      });
    },
    (argv) => {
      console.info(`Bundling code with entry file: ${argv.entry}`);
    }
  )
  .parse();
