'use strict';

/**
 * @see - https://github.com/webpack/webpack-dev-server/tree/master/examples/api/simple
 * @see - https://webpack.js.org/configuration/dev-server/#devserver
 */

const path = require('path');
const merge = require('lodash/merge');
const _WebpackDevServer = require('webpack-dev-server');

const WatchCompiler = require('./WatchCompiler');

// @todo - `serve.sh` can make this path an environment variable
const APPLICATION_DIR = path.join(__dirname, '..', '..');

const DEFAULT_HOST = '0.0.0.0';
const DEFAULT_PORT = 8080;

module.exports = class WebpackDevServer {
  static factory (webpackConfigs, config) {
    return new WebpackDevServer(webpackConfigs, config);
  }

  constructor (webpackConfigs, config = {}) {
    this.watchCompiler = WatchCompiler.factory(webpackConfigs, config);

    this.host = config.host || Object.prototype.hasOwnProperty.call(process.env, 'DEV_SERVER_HOST')
      ? process.env.DEV_SERVER_HOST
      : DEFAULT_HOST;

    this.port = config.port || Object.prototype.hasOwnProperty.call(process.env, 'DEV_SERVER_PORT')
      ? parseInt(process.env.DEV_SERVER_PORT, 10)
      : DEFAULT_PORT;

    this.devServerConfig = merge({
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
      watchOptions: this.watchCompiler.watchOptions,
      // The hooks will print the stats
      stats: false,
    }, config.devServerConfig || {});

    this.server = new _WebpackDevServer(this.watchCompiler.compiler, this.devServerConfig);
  }

  async run () {
    // @todo - if there is a server error, such as trying to serve via port 80,
    // the error is not caught / handled
    await new Promise((resolve, reject) => {
      this.server.listen(
        this.port,
        this.host,
        () => {
          resolve();
        },
      );
    });
  }

  async stop () {
    if (!this.server) {
      return;
    }

    return new Promise((resolve, reject) => {
      this.server.close(() => {
        this.server = null;
        resolve();
      });
    });
  }

  destroy () {
    return Promise.all([
      this.watchCompiler.destroy(),
      this.stop(),
    ]);
  }
};
