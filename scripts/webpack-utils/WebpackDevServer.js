'use strict';

/**
 * Helper class for WebpackDevServer.  Primary purpose is to simplify dev server
 * and file watcher creation and use.
 *
 * @see - https://github.com/webpack/webpack-dev-server/tree/master/examples/api/simple
 * @see - https://webpack.js.org/configuration/dev-server/#devserver
 */

const path = require('path');
const _WebpackDevServer = require('webpack-dev-server');

const WatchCompiler = require('./WatchCompiler');

// @todo - `serve.sh` can make this path an environment variable
// @todo - this should be passed in on `config`
const APPLICATION_DIR = path.join(__dirname, '..', '..');

const DEFAULT_HOST = '0.0.0.0';
const DEFAULT_PORT = 8080;

module.exports = class WebpackDevServer {
  /**
   * @see - this.constructor
   */
  static factory (name, webpackConfigs, config) {
    return new WebpackDevServer(name, webpackConfigs, config);
  }

  /**
   * @constructor
   * @private
   *
   * Create a new WebpackDevServer, configured with a watch compiler.
   *
   * @param {string} name
   *   The name of the compile job (arbitrary), used for logging
   * @param {Array} webpackConfigs
   *   An array of webpack config objects - @see - https://webpack.js.org/configuration/#options
   * @param {Object} config
   *   An object containing the configuration for this server
   * @param {Object} config.watchOptions
   *   @see - https://webpack.js.org/configuration/watch/#watchoptions
   * @param {String} config.host
   *   The WebpackDevServer host
   * @param {Number} config.port
   *   The port on which this WebpackDevServer will host the project
   * @param {Object} config.devServerConfig
   *   @see - https://webpack.js.org/configuration/dev-server/#devserver
   *
   * @returns {WebpackDevServer}
   *   A new WebpackDevServer instance
   */
  constructor (name, webpackConfigs = [], config = {}) {
    this.watchCompiler = WatchCompiler.factory(name, webpackConfigs, config.watchOptions);

    this.host = config.host || process.env.DEV_SERVER_HOST || DEFAULT_HOST;

    this.port = config.port || process.env.DEV_SERVER_PORT
      ? parseInt(process.env.DEV_SERVER_PORT, 10)
      : DEFAULT_PORT;

    this.devServerConfig = {
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

      // Allow the caller to override or add devServerConfig properties
      ...(config.devServerConfig || {})
    };

    this.server = new _WebpackDevServer(this.watchCompiler.compiler, this.devServerConfig);
  }

  /**
   * @async
   *
   * Run the dev server.
   *
   * @returns {Promise}
   */
  serve () {
    // @todo - if there is a server error, such as trying to serve via port 80,
    // the error is not caught / handled
    return new Promise((resolve, reject) => {
      this.server.listen(
        this.port,
        this.host,
        () => {
          resolve();
        },
      );
    });
  }

  /**
   * @async
   *
   * Stop and dereference the dev server.
   *
   * @returns {Promise}
   *   Resovles when the server has stopped and has been dereferenced.
   */
  stop () {
    if (!this.server) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      this.server.close(() => {
        this.server = null;
        resolve();
      });
    });
  }

  /**
   * @async
   *
   * To be called when the dev server is no longer needed.
   *
   * Destroy and dereference the watchCompiler, stop and dereference the server.
   *
   * @returns {Promise}
   *   Resolves when destroy is finished
   */
  destroy () {
    return Promise.all([
      async () => {
        await this.watchCompiler.destroy();
        this.watchCompiler = null;
        this.devServerConfig = null;
      },
      this.stop(),
    ]);
  }
};
