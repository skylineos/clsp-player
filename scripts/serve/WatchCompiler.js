'use strict';

/**
 * @see - https://webpack.js.org/api/node/
 * @see - https://webpack.js.org/api/compiler-hooks/#done
 */

const BuildCompiler = require('../build/BuildCompiler');

module.exports = class WatchCompiler extends BuildCompiler {
  static factory (webpackConfigs) {
    return new WatchCompiler(webpackConfigs);
  }

  constructor (webpackConfigs) {
    super(webpackConfigs);

    this.isFirstCompile = true;

    this.watchOptions = {
      // wait one second before re-transpiling after a change
      aggregateTimeout: 1000,
      // in vagrant, we cannot rely on file system events, so we must poll :(
      // NOTE that if this is set to true, the build will never finish!
      poll: process.env.WATCH_WITH_POLLING === 'true' && 2000,
    };

    this.watching = null;
  }

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

  async run () {
    return new Promise((resolve, reject) => {
      this.watching = this.compiler.watch(this.watchOptions, (error, stats) => {
        // @see - https://webpack.js.org/api/node/#error-handling

        // Handle fatal error
        if (error) {
          console.error(error.stack || error);

          if (error.details) {
            console.error(error.details);
          }

          if (this.timer) {
            clearInterval(this.timer);
            this.secondsCompiling = 0;
          }

          return reject(error);
        }

        // Note that the `done` hook will handle the stats
        resolve();
      });
    });
  }

  async stop () {
    if (!this.watching) {
      return;
    }

    return new Promise((resolve, reject) => {
      this.watching.close(() => {
        this.watching = null;
        resolve();
      });
    });
  }

  destroy () {
    super.destroy();

    return this.stop();
  }
};
