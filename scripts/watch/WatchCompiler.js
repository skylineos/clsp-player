'use strict';

/**
 * @see - https://webpack.js.org/api/node/
 * @see - https://webpack.js.org/api/compiler-hooks/#done
 */

const BuildCompiler = require('../build/BuildCompiler');

module.exports = class WatchCompiler extends BuildCompiler {
  static factory () {
    return new WatchCompiler();
  }

  constructor () {
    super();

    this.isFirstCompile = true;

    this.watchOptions = {
      // wait one second before re-transpiling after a change
      aggregateTimeout: 1000,
      // in vagrant, we cannot rely on file system events, so we must poll :(
      // NOTE that if this is set to true, the build will never finish!
      poll: process.env.WATCH_WITH_POLLING === 'true' && 2000,
    };
  }

  initialize () {
    super.initialize();

    // Called any time a file is changed before compilation
    // Called many times on the first compilation
    this.compiler.hooks.watchRun.tap(this.name, () => {
      console.log(`${this.name}:watch:watchRun`);

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
};
