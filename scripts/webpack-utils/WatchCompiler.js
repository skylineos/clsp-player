'use strict';

/**
 * A helper class for the webpack `watch` compiler.
 *
 * @see - https://webpack.js.org/api/node/
 * @see - https://webpack.js.org/api/node/#watching
 * @see - https://webpack.js.org/api/compiler-hooks
 * @see - https://webpack.js.org/api/compiler-hooks/#done
 *
 * This helper extends the BuildCompiler, so it inherits all of those console
 * messages.  This WatchCompiler class also logs a message to the console any
 * time a change is detected, and starts a new timer for that update.
 */

const BuildCompiler = require('./BuildCompiler');

module.exports = class WatchCompiler extends BuildCompiler {
  /**
   * @see - this.constructor
   */
  static factory (name, webpackConfigs, watchOptions) {
    return new WatchCompiler(name, webpackConfigs, watchOptions);
  }

  /**
   * @constructor
   * @private
   *
   * Create a new WatchCompiler, and register the default webpack compiler
   * hooks.
   *
   * @param {string} name
   *   The name of the compile job (arbitrary), used for logging
   * @param {Array} webpackConfigs
   *   An array of webpack config objects - @see - https://webpack.js.org/configuration/#options
   * @param {Object} watchOptions
   *   An object containing any watchOptions overrides - @see - https://webpack.js.org/configuration/watch/#watchoptions
   *
   * @returns {WatchCompiler}
   *   A new WatchCompiler instance
   */
  constructor (name, webpackConfigs = [], watchOptions = {}) {
    super(name, webpackConfigs);

    this.watchOptions = {
      // wait one second before re-transpiling after a change
      aggregateTimeout: 1000,
      // in vagrant, we cannot rely on file system events, so we must poll :(
      // NOTE that if this is set to true, the build will never finish!
      poll: process.env.WATCH_WITH_POLLING === 'true' && 2000,
      ...watchOptions,
    };

    // Used to track whether or not to log a "change detected" message
    this.isFirstCompile = true;
    // the webpack watcher
    // @see - https://webpack.js.org/api/node/#watching
    this.watching = null;
  }

  /**
   * @private
   *
   * Register additional compiler hooks.
   *
   * On `watchRun`, indicate that a change was detected if this isn't the first
   * time the compilation has run.  Also, reset the timer to display how long
   * this update compilation has been running.
   *
   * @returns {void}
   */
  initialize () {
    super.initialize();

    // Called any time a file is changed before compilation
    // Called many times on the first compilation
    this.compiler.hooks.watchRun.tap(this.name, () => {
      console.log(`\n${this.name}:watch:watchRun`);

      if (!this.isFirstCompile) {
        console.log('');
        console.log('Change detected, compiling...');
        console.log('');
      }

      if (!this.timer) {
        this.setTimer();
      }
    });

    // Called when a compilation has finished
    this.compiler.hooks.done.tap(this.name, (stats) => {
      console.log(`${this.name}:watch:done`);

      this.isFirstCompile = false;
    });
  }

  /**
   * `build` is not a supported method, so calling this will ALWAYS throw an
   * error.  The caller must use the `watch` method.
   *
   * @returns {void}
   */
  build () {
    throw new Error('`build` method not supported.  Use `watch` instead.');
  }

  /**
   * @async
   *
   * Build and then Watch the files.
   *
   * @see - https://webpack.js.org/api/node/#watching
   *
   * @returns {Promise}
   *   Resolves when the watcher has started without an error.
   *   Rejects when the watcher encounters an error (NOT a stats error).
   */
  watch () {
    return new Promise((resolve, reject) => {
      this.watching = this.compiler.watch(this.watchOptions, (error, stats) => {
        if (error) {
          this.handleBuildError(error);
          reject(error);
          return;
        }

        resolve();
      });
    });
  }

  /**
   * @async
   *
   * Stop the watcher.
   *
   * @returns {Promise}
   *   Resolves when the watcher has been stopped / closed.
   *   Rejects never.
   */
  stop () {
    if (!this.watching) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      this.watching.close(() => {
        // Note an error being passed to this callback is not documented in
        // webpack's documentation
        this.watching = null;
        resolve();
      });
    });
  }

  /**
   * To be called when the WatchCompiler is no longer needed.
   *
   * Stops the watcher, the compile timer, and dereferences the compiler.
   *
   * @returns {void}
   */
  destroy () {
    super.destroy();

    return this.stop();
  }
};
