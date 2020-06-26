'use strict';

/**
 * @see - https://webpack.js.org/api/node/
 * @see - https://webpack.js.org/api/compiler-hooks
 */

const chalk = require('chalk');
const webpack = require('webpack');
const pify = require('pify');

const utils = require('../../src/js/utils/utils');

module.exports = class BuildCompiler {
  static factory (webpackConfigs) {
    return new BuildCompiler(webpackConfigs);
  }

  constructor (webpackConfigs = []) {
    this.compiler = webpack(webpackConfigs);

    this.name = utils.name;
    this.secondsCompiling = 0;
    this.timer = null;

    this.initialize();
  }

  clearTimer () {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      this.secondsCompiling = 0;
    }
  }

  setTimer () {
    this.timer = setInterval(() => {
      console.log('');
      console.log(`${this.name} webpack has been compiling for ${++this.secondsCompiling} seconds...`);
      console.log('');
    }, 1000);
  }

  initialize () {
    // @todo - there are many documented hooks, but not all of them appear to be
    // implemented.  I tried to implement the `beforeRun` hook
    this.compiler.hooks.run.tap(this.name, () => {
      console.log(`${this.name}:build:run`);

      this.clearTimer();
      this.setTimer();
    });

    // Called when a compilation has finished
    this.compiler.hooks.done.tap(this.name, (stats) => {
      console.log(`${this.name}:build:done`);

      this.clearTimer();

      const info = stats.toJson();

      // Show compile results
      console.log('');
      console.log(stats.toString({
        colors: true,
      }));
      console.log('');

      // Handle compile warnings
      if (stats.hasWarnings()) {
        console.warn('');
        console.warn('Warnings ----------------------------------------------');
        console.warn('');

        for (let i = 0; i < info.warnings.length; i++) {
          console.warn(`Warning #${i + 1}:`);
          console.warn(chalk.yellowBright(info.warnings[i]));
          console.warn('');
        }

        console.warn('');
        console.warn('^^ Warnings -------------------------------------------');
        console.warn('');
      }

      // Handle compile errors
      if (stats.hasErrors()) {
        console.error('Errors ------------------------------------------------');
        console.error('');

        for (let i = 0; i < info.errors.length; i++) {
          console.warn(`Error #${i + 1}:`);
          console.warn(chalk.redBright(info.errors[i]));
          console.warn('');
        }

        console.error('');
        console.error('^^ Errors ---------------------------------------------');
        console.error('');

        console.error('');
        console.error('Error while compiling with webpack!');
        console.error(`Webpack compilation finished with ${info.errors.length} errors and ${info.warnings.length} warnings...`);
        console.error('Make a change and save it to recompile...');
        console.error('');

        return;
      }

      console.log('');
      console.log('Webpack compiled successfully!');
      console.log(`Webpack compilation finished with ${info.errors.length} errors and ${info.warnings.length} warnings...`);
      console.log('Make a change and save it to recompile...');
      console.log('');
    });
  }

  async run () {
    const stats = await pify(this.compiler.run.bind(this.compiler))();

    return stats;
  }

  destroy () {
    // @todo
  }
};
