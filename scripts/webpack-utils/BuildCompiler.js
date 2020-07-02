'use strict';

/**
 * A helper class for the webpack build compiler (as opposed to the `watch`
 * compiler).
 *
 * @see - https://webpack.js.org/api/node/
 * @see - https://webpack.js.org/api/compiler-hooks
 *
 * The primary purpose of this helper class is to print useful messages about
 * the build status.  While the compiler is running (building), a status message
 * will be logged to the console every second.  When the build finishes, errors
 * and warnings will be more clearly displayed, rather than being hidden amongst
 * the rest of the webpack stats.
 */

const chalk = require('chalk');
const webpack = require('webpack');

module.exports = class BuildCompiler {
  /**
   * @see - this.constructor
   */
  static factory (name, webpackConfigs) {
    return new BuildCompiler(name, webpackConfigs);
  }

  /**
   * @constructor
   * @private
   *
   * Create a new BuildCompiler, and register the default webpack compiler
   * hooks.
   *
   * @param {string} name
   *   The name of the compile job (arbitrary), used for logging
   * @param {Array} webpackConfigs
   *   An array of webpack config objects - @see - https://webpack.js.org/configuration/#options
   *
   * @returns {BuildCompiler}
   *   A new BuildCompiler instance
   */
  constructor (name, webpackConfigs = []) {
    this.name = name;
    this.compiler = webpack(webpackConfigs);

    this.clearTimer();
    this.initialize();
  }

  /**
   * @private
   *
   * Stop the internal compile timer.
   *
   * @returns {void}
   */
  clearTimer () {
    if (this.timer) {
      clearInterval(this.timer);
    }

    this.timer = null;
    this.secondsCompiling = 0;
  }

  /**
   * @private
   *
   * Start the internal compile timer.  A message will be logged to the console
   * every second until the timer is cleared.
   *
   * @returns {void}
   */
  setTimer () {
    if (this.timer) {
      return;
    }

    this.timer = setInterval(() => {
      console.log('');
      console.log(`${this.name} webpack has been compiling for ${++this.secondsCompiling} seconds...`);
      console.log('');
    }, 1000);
  }

  /**
   * @private
   *
   * Register the default compiler hooks.
   *
   * On `run`, the compile timer is started/restarted.
   *
   * On `done`, any warnings and errors will be logged to the console.  If there
   * were no errors, a "done" message will also be logged.
   *
   * @returns {void}
   */
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

      // Show ALL compile results
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

  /**
   * @private
   *
   * Properly handle a webpack compiler error.  Logs the useful error info to
   * the console.
   *
   * @see - https://webpack.js.org/api/node/#error-handling
   *
   * @param {Error} error
   *   The webpack compiler error
   */
  handleBuildError (error) {
    if (!error) {
      return;
    }

    console.error(error.stack || error);

    if (error.details) {
      console.error(error.details);
    }

    this.clearTimer();
  }

  /**
   * Build the files.
   *
   * @see - https://webpack.js.org/api/node/#run
   *
   * @returns {Promise}
   *   Resolves the webpack compiler stats when the compiler is finished. @see - https://webpack.js.org/api/node/#stats-object
   *   Rejects on any critical compiler error (but NOT a stats error).
   */
  build () {
    return new Promise((resolve, reject) => {
      this.compiler.run((error, stats) => {
        if (error) {
          this.handleBuildError(error);
          reject(error);
          return;
        }

        resolve(stats);
      });
    });
  }

  /**
   * To be called when the BuildCompiler is done or no longer needed.
   *
   * Stops the compile timer and dereferences the compiler.
   *
   * @returns {void}
   */
  destroy () {
    this.clearTimer();
    this.compiler = null;
  }
};
