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
let clspPlayerSrcWatcher;
// This watches and serves the demos
let demoServer;

/**
 * Do our best to ensure that no watchers remain active.
 */
async function cleanUp () {
  // @todo - what happens during an error in a stop call?
  if (clspPlayerSrcWatcher) {
    await clspPlayerSrcWatcher.destroy();
    clspPlayerSrcWatcher = null;
  }

  if (demoServer) {
    await demoServer.destroy();
    demoServer = null;
  }
}

async function main () {
  // Build / Watch the CLSP Player first, because the demos depend on it.
  clspPlayerSrcWatcher = WatchCompiler.factory('clsp-player', webpackConfigClspPlayer());
  await clspPlayerSrcWatcher.watch();

  demoServer = WebpackDevServer.factory('clsp-player-demos', webpackConfigDemos());
  await demoServer.serve();
}

main()
  .then(() => {
    console.log('');
    console.log(`Webpack dev server is running on port ${demoServer.port}!`);
    console.log('');

    // Do not exit here because the watcher needs to keep running
  })
  .catch(async (err) => {
    await cleanUp();

    console.error('\nUnable to run webpack dev server!');
    console.error(err);

    process.exit(1);
  });
