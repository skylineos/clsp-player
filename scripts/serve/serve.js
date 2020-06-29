#!/usr/bin/env node

'use strict';

/**
 * A script to serve the CLSP Player Demos for development purposes.  Changes to
 * files in the src and demo directories will trigger a rebuild.
 *
 * This should only ever be called from `./serve.sh`
 *
 * @see - https://github.com/webpack/webpack-dev-server
 * @see - https://github.com/webpack/webpack-dev-server/blob/master/examples/api/simple/server.js
 */

const webpackConfigClspPlayer = require('../../webpack.clsp-player');
const webpackConfigDemos = require('../../webpack.demos');

const WatchCompiler = require('../webpack-utils/WatchCompiler');
const WebpackDevServer = require('../webpack-utils/WebpackDevServer');

// This watches the CLSP Player src
let clspPlayerWatcher;
// This watches and serves the demos
let webpackDevServer;

/**
 * Do our best to ensure that no watchers remain active.
 */
async function cleanUp () {
  // @todo - what happens during an error in a stop call?
  if (clspPlayerWatcher) {
    await clspPlayerWatcher.destroy();
    clspPlayerWatcher = null;
  }

  if (webpackDevServer) {
    await webpackDevServer.destroy();
    webpackDevServer = null;
  }
}

async function main () {
  // Build / Watch the CLSP Player first, because the demos depend on it.
  clspPlayerWatcher = WatchCompiler.factory('clsp-player', webpackConfigClspPlayer());
  await clspPlayerWatcher.watch();

  webpackDevServer = WebpackDevServer.factory('clsp-player-demos', webpackConfigDemos());
  await webpackDevServer.serve();
}

main()
  .then(() => {
    console.log('');
    console.log(`Webpack dev server is running on port ${webpackDevServer.port}!`);
    console.log('');

    // Do not exit here because the watcher needs to keep running
  })
  .catch(async (err) => {
    await cleanUp();

    console.error('\nUnable to run webpack dev server!');
    console.error(err);

    process.exit(1);
  });
