#!/usr/bin/env node

'use strict';

/**
 * @see - https://github.com/webpack/webpack-dev-server
 * @see - https://github.com/webpack/webpack-dev-server/blob/master/examples/api/simple/server.js
 */

const webpackConfigProd = require('../../webpack.prod');
const webpackConfigDev = require('../../webpack.dev');

const WatchCompiler = require('./WatchCompiler');
const WebpackDevServer = require('./WebpackDevServer');

let prodWatcher;
let webpackDevServer;

async function cleanUp () {
  // @todo - what happens during an error in a stop call?
  if (prodWatcher) {
    await prodWatcher.destroy();
    prodWatcher = null;
  }

  if (webpackDevServer) {
    await webpackDevServer.destroy();
    webpackDevServer = null;
  }
}

async function main () {
  // watch the prod files
  prodWatcher = WatchCompiler.factory(webpackConfigProd());
  await prodWatcher.run();

  // serve and watch the dev files
  webpackDevServer = WebpackDevServer.factory(webpackConfigDev());
  await webpackDevServer.run();
}

main()
  .then(() => {
    console.log('');
    console.log(`Webpack dev server is running on port ${webpackDevServer.port}!`);
    console.log('');

    // Do not exit here because the watcher needs to keep running
  })
  .catch(async (err) => {
    console.error('Unable to run webpack dev server!');
    console.error(err);

    await cleanUp();

    process.exit(1);
  });
