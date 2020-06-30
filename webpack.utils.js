'use strict';

/**
 * This file contains utilities for generating valid and useful webpack
 * configuration options.
 *
 * @see - https://webpack.js.org/guides/production/
 *
 * The webpack configuration in this project isn't structured exactly the same
 * as the webpack guide, but it's similar.  This `utils` file is similar to the
 * `common` file, the `clsp-player` file is similar to the `prod` file, and the
 * `demos` file is similar to the `dev` file.
 *
 * @todo - would it be easier / more readable to use `webpack-merge`?
 */

const webpack = require('webpack');
const path = require('path');
const chalk = require('chalk');
const ProgressBarPlugin = require('progress-bar-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const WriteFilePlugin = require('write-file-webpack-plugin');
const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;

const devMode = process.env.NODE_ENV !== 'production';

/**
 * @private
 *
 * Helper function to generate a formatted progress bar plugin for a webpack
 * config.
 *
 * @see - https://www.npmjs.com/package/progress-bar-webpack-plugin
 *
 * @param {String} name
 *   The file / module name (typically the `entry` name) used for logging
 *   purposes
 */
function generateProgressBarPlugin (name) {
  const building = chalk.bold(`Building ${name} page...`);
  const bar = chalk.bgBlue.white.bold('[:bar]');
  const percent = chalk.bold.green(':percent');
  const elapsed = chalk.bold('(:elapsed seconds)');

  return new ProgressBarPlugin({
    format: `   ${building} ${bar} ${percent} ${elapsed}`,
    clear: false,
  });
}

/**
 * The directory where the built / compiled files will go.
 *
 * @type {String}
 */
const outputPath = path.resolve(
  __dirname,
  'dist',
);

/**
 * Generate a webpack configuration object.  The resulting configuration object
 * is currently suitable for all files this project exports.
 *
 * @see - https://webpack.js.org/configuration/
 *
 * @param {String} name
 *   The entry name, which will be used to construct the file name
 * @param {String} entry
 *   The entry point for the webpack configuration - must point to a single file
 *
 * @returns {Object}
 *   A webpack configuration object
 */
function generateConfig (name, entry) {
  return {
    name,
    entry: {
      // @see - https://github.com/webpack-contrib/webpack-serve/issues/27
      [name]: [
        entry,
      ],
    },
    output: {
      path: outputPath,
      filename: '[name].js',
    },
    module: {
      rules: [
        {
          test: /\.js$/,
          loader: 'babel-loader?cacheDirectory=true',
          options: {
            presets: [
              [
                '@babel/preset-env',
                {
                  exclude: [
                    '@babel/plugin-transform-typeof-symbol',
                  ],
                },
              ],
            ],
            plugins: [
              '@babel/plugin-syntax-dynamic-import',
              '@babel/plugin-proposal-object-rest-spread',
              '@babel/plugin-proposal-class-properties',
            ],
          },
          // @see - https://github.com/webpack/webpack/issues/2031
          include: [
            path.resolve(
              __dirname,
              'src'
            ),
            path.resolve(
              __dirname,
              'demos'
            ),
            // @see - https://github.com/visionmedia/debug/issues/668
            path.resolve(
              __dirname,
              'node_modules',
              'debug'
            ),
          ],
        },
        // @see - https://github.com/bensmithett/webpack-css-example/blob/master/webpack.config.js
        {
          test: /\.(eot|svg|ttf|woff|woff2)$/,
          loader: 'url-loader',
        },
        {
          // @see - https://github.com/webpack-contrib/mini-css-extract-plugin
          // @see - https://github.com/webpack-contrib/sass-loader
          test: /\.(sa|sc|c)ss$/,
          use: [
            {
              loader: MiniCssExtractPlugin.loader,
              options: {
                hmr: devMode,
              },
            },
            'css-loader',
            // @todo
            // 'postcss-loader',
            'sass-loader',
          ],
        },
      ],
    },
    resolve: {
      alias: {
        '~root': __dirname,
      },
    },
    plugins: [
      generateProgressBarPlugin(name),
      new MiniCssExtractPlugin({
        filename: devMode
          ? '[name].css'
          : '[name].[hash].css',
        chunkFilename: devMode
          ? '[id].css'
          : '[id].[hash].css',
      }),
      new WriteFilePlugin(),
    ],
  };
}

/**
 * Given an array of webpack configurations, add properties to them to make the
 * resulting built / compiled files more suitable for a development environment.
 *
 * @see - https://webpack.js.org/configuration/mode/
 *
 * @param {Array} webpackConfigs
 *   An Array of webpack configuration objects
 *
 * @returns {Array}
 *   An Array of webpack configuration objects with added development
 *   configuration
 */
function exportAsDevConfig (webpackConfigs) {
  return webpackConfigs.map((webpackConfig) => {
    return {
      ...webpackConfig,
      mode: 'development',
      devtool: 'eval-source-map',
      output: {
        ...webpackConfig.output,
        pathinfo: true,
      },
      plugins: [
        ...webpackConfig.plugins,
        new webpack.DefinePlugin({
          'process.env': {
            NODE_ENV: JSON.stringify('development'),
          },
        }),
      ],
    };
  });
}

/**
 * Given an array of webpack configurations, add properties to them to make the
 * resulting built / compiled files more suitable for a production environment.
 *
 * @see - https://webpack.js.org/configuration/mode/
 *
 * @param {Array} webpackConfigs
 *   An Array of webpack configuration objects
 *
 * @returns {Array}
 *   An Array of webpack configuration objects with added production
 *   configuration
 */
function exportAsProdConfig (webpackConfigs) {
  return webpackConfigs.map((webpackConfig) => {
    const config = {
      ...webpackConfig,
      mode: 'production',
      cache: true,
      // @todo - minimization breaks the plugin and player!
      optimization: {
        minimize: false,
      },
      plugins: [
        ...webpackConfig.plugins,
        new webpack.DefinePlugin({
          // This is needed to ensure that things like react and redux compile and
          // minify properly - if you need access to this in code, use
          // global.app.environment instead.
          'process.env': {
            NODE_ENV: JSON.stringify('production'),
          },
        }),
      ],
    };

    if (process.env.ANALYZE_BUILD) {
      config.plugins.push(new BundleAnalyzerPlugin({
        analyzerMode: 'static',
      }));
    }

    config.output.filename = '[name].min.js';

    return config;
  });
}

module.exports = {
  outputPath,
  generateConfig,
  exportAsDevConfig,
  exportAsProdConfig,
};
