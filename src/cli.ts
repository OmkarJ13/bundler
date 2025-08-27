#! /usr/bin/env node

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { Bundler } from './bundler.js';
import { resolve, relative } from 'path';
import { existsSync } from 'fs';
import type { Config } from './index.js';
import chalk from 'chalk';
import ora from 'ora';
import boxen from 'boxen';
import prettyBytes from 'pretty-bytes';

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
          type: 'boolean',
          default: true,
          description: 'minify the bundle',
          defaultDescription: 'true',
        })
        .option('treeshake', {
          type: 'boolean',
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
      const spinner = ora({
        text: 'Creating bundle...',
        color: 'cyan',
      });

      try {
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

        const entryPath = resolve(entry);
        const outputPath = resolve(output);
        const relativeEntry = relative(process.cwd(), entryPath);
        const relativeOutput = relative(process.cwd(), outputPath);

        if (!existsSync(entryPath)) {
          throw new Error(
            `Entry file ${chalk.yellow(relativeEntry)} not found`
          );
        }

        spinner.start();

        const bundler = new Bundler(entry, output);
        const result = bundler.bundle(minify, treeshake);

        spinner.succeed(chalk.green('Bundle created successfully!'));

        const sizeReduction =
          ((result.stats.inputSize - result.stats.outputSize) /
            result.stats.inputSize) *
          100;
        const sizeReductionText =
          sizeReduction > 0
            ? chalk.green(`(-${sizeReduction.toFixed(1)}%)`)
            : chalk.red(`(+${Math.abs(sizeReduction).toFixed(1)}%)`);

        const successMessage = [
          `${chalk.cyan('📁 Input:')}        ${chalk.white(relativeEntry)}`,
          `${chalk.cyan('📄 Output:')}       ${chalk.white(relativeOutput)}`,
          `${chalk.cyan('📊 Size:')}         ${chalk.white(prettyBytes(result.stats.inputSize))} → ${chalk.white(prettyBytes(result.stats.outputSize))} ${sizeReductionText}`,
          `${chalk.cyan('⚡ Time:')}         ${chalk.white(result.stats.duration + 'ms')}`,
          `${chalk.cyan('📦 Modules:')}      ${chalk.white(result.stats.modulesProcessed + ' processed')}`,
          ...(result.stats.treeshakeEnabled
            ? [`${chalk.cyan('🌳 Tree-shaking:')} ${chalk.green('Enabled')}`]
            : []),
          ...(result.stats.minifyEnabled
            ? [`${chalk.cyan('📉 Minification:')} ${chalk.green('Enabled')}`]
            : []),
        ].join('\n');

        console.log(
          boxen(successMessage, {
            padding: 1,
            margin: 1,
            borderStyle: 'single',
            borderColor: 'green',
            title: '✅ Success',
            titleAlignment: 'center',
          })
        );

        if (result.warnings.length > 0) {
          const formattedWarnings = result.warnings
            .map((warning, index) => {
              const warningNumber = chalk.dim(`[${index + 1}]`);
              const warningIcon = chalk.yellow('🟨');
              const warningText = chalk.white(warning);
              return `${warningIcon} ${warningNumber} ${warningText}`;
            })
            .join('\n\n');

          console.log(
            boxen(formattedWarnings, {
              padding: 1,
              margin: 1,
              borderStyle: 'single',
              borderColor: 'yellow',
              title: `🟨 ${result.warnings.length} Warning${result.warnings.length > 1 ? 's' : ''}`,
              titleAlignment: 'center',
            })
          );
        }
      } catch (error) {
        spinner.fail(chalk.red('Bundle creation failed'));
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        console.log(
          boxen(chalk.red('❌ ') + errorMessage, {
            padding: 1,
            margin: 1,
            borderStyle: 'single',
            borderColor: 'red',
            title: '🚨 Error',
            titleAlignment: 'center',
          })
        );

        process.exit(1);
      }
    }
  )
  .help()
  .parse(hideBin(process.argv));
