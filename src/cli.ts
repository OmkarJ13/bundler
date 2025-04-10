#! /usr/bin/env node

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { bundle, getDependencyGraph } from './bundle.js';

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
      const dependencyGraph = getDependencyGraph(argv.entry);
      console.dir(getDependencyGraph(argv.entry), { depth: null });
      const bundledCode = bundle(dependencyGraph);
      console.log(bundledCode);
    }
  )
  .parse();
