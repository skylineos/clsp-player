#!/usr/bin/env node

'use strict';

/**
 * @see - https://github.com/webpack/webpack-dev-server
 * @see - https://github.com/webpack/webpack-dev-server/blob/master/examples/api/simple/server.js
 */

const WebpackDevServer = require('./WebpackDevServer');

const DEV_SERVER_HOST = Object.prototype.hasOwnProperty.call(process.env, 'DEV_SERVER_HOST')
  ? process.env.DEV_SERVER_HOST
  : '0.0.0.0';
const DEV_SERVER_PORT = Object.prototype.hasOwnProperty.call(process.env, 'DEV_SERVER_PORT')
  ? parseInt(process.env.DEV_SERVER_PORT, 10)
  : 8080;

async function main () {
  const webpackDevServer = WebpackDevServer.factory();

  // @todo - if there is a server error, such as trying to serve via port 80,
  // the error is not caught / handled
  return new Promise((resolve, reject) => {
    webpackDevServer.server.listen(
      DEV_SERVER_PORT,
      DEV_SERVER_HOST,
      () => {
        resolve();
      },
    );
  });
}

main()
  .then(() => {
    console.log('');
    console.log(`Webpack dev server is running on port ${DEV_SERVER_PORT}!`);
    console.log('');
    // Do not exit here because the watcher needs to keep running
  })
  .catch((err) => {
    console.error('Unable to run webpack dev server!');
    console.error(err);
    process.exit(1);
  });
