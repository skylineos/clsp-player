#!/usr/bin/env node
'use strict';

// Be sure to have a look at the following documentation:
// @see - https://github.com/webpack/webpack-dev-server
// @see - https://github.com/chimurai/http-proxy-middleware
// @see - https://github.com/nodejitsu/node-http-proxy

const path = require('path');
const webpack = require('webpack');
const WebpackDevServer = require('webpack-dev-server');

// Use both here to support the use of either minified or non-minified files
// in the demo index.html file
const devConfigs = require('../webpack.dev');
const prodConfigs = require('../webpack.prod');

// @todo - the devServer.sh can make this path an environment variable from utils.sh
const APPLICATION_DIR = path.join(__dirname, '..');

const DEV_SERVER_HOST = Object.prototype.hasOwnProperty.call(process.env, 'DEV_SERVER_HOST')
  ? process.env.DEV_SERVER_HOST
  : '0.0.0.0';
const DEV_SERVER_PORT = Object.prototype.hasOwnProperty.call(process.env, 'DEV_SERVER_PORT')
  ? parseInt(process.env.DEV_SERVER_PORT, 10)
  : 8080;

async function runDevServer () {
  const compiler = webpack([
    ...(devConfigs()),
    ...(prodConfigs()),
  ]);

  const devServerConfig = {
    // when compression is enabled, things are served VERY slowly
    compress: false,
    // when a build fails, show the failure in the browser
    overlay: true,
    // do not hot reload the browser on change - breaks ie11 (maybe you can fix it)
    hot: false,
    // The directory that will be served (in our case, project root)
    contentBase: APPLICATION_DIR,
    // @todo - do we need this?  why or why not?
    // publicPath: webpackConfigDev[0].output.publicPath,
    watchOptions: {
      // wait one second before re-transpiling after a change
      aggregateTimeout: 1000,
      // in vagrant, we cannot rely on file system events, so we must poll :(
      // NOTE that if this is set to true, the build will never finish!
      poll: process.env.WATCH_WITH_POLLING === 'true' && 2000,
    },
    stats: {
      // make the output easier on the eyes
      colors: true,
    },
  };

  return new Promise((resolve, reject) => {
    const server = new WebpackDevServer(compiler, devServerConfig).listen(
      DEV_SERVER_PORT,
      DEV_SERVER_HOST,
      () => {
        compiler.plugin('done', (stats) => {
          resolve(server);
        });
      },
    );
  });
}

runDevServer()
  .then((server) => {
    console.log('');
    console.log(`Webpack dev server is running on port ${DEV_SERVER_PORT}!`);
    console.log('');
  })
  .catch((err) => {
    console.error('Unable to run webpack dev server!');
    console.error(err);
    process.exit(1);
  });
