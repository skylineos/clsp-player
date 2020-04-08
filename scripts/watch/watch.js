#!/usr/bin/env node

'use strict';

/**
 * @see - https://webpack.js.org/api/node/
 * @see - https://webpack.js.org/configuration/watch/#watchoptions
 */

const WatchCompiler = require('./WatchCompiler');

function main () {
  const watchCompiler = WatchCompiler.factory();

  // NEVER resolve or reject (on compile error) to ensure the webpack process
  // continues watching indefinitely
  return new Promise((resolve, reject) => {
    watchCompiler.compiler.watch(watchCompiler.watchOptions, (error) => {
      // @see - https://webpack.js.org/api/node/#error-handling

      // Handle fatal error
      if (error) {
        console.error(error.stack || error);

        if (error.details) {
          console.error(error.details);
        }

        if (watchCompiler.timer) {
          clearInterval(watchCompiler.timer);
          watchCompiler.secondsCompiling = 0;
        }

        return reject(error);
      }

      // Note that the `done` hook will handle the stats
    });
  });
}

main()
  .then(() => {
    throw new Error('Main function completed, which means the dev server is no longer running');
  })
  .catch((error) => {
    console.error('Failed while using webpack to build Vero!');
    console.error(error);

    process.exit(1);
  });
