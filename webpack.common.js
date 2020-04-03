'use strict';

const path = require('path');
const chalk = require('chalk');
const ProgressBarPlugin = require('progress-bar-webpack-plugin');
const ExtractTextPlugin = require('extract-text-webpack-plugin');
const WriteFilePlugin = require('write-file-webpack-plugin');

const packageJson = require('./package.json');

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

function generateConfig (name, entry) {
  // @see - https://github.com/webpack-contrib/sass-loader
  const extractSass = new ExtractTextPlugin({
    filename: '[name].css',
  });

  return {
    name,
    entry: {
      // @see - https://github.com/webpack-contrib/webpack-serve/issues/27
      [name]: [
        entry,
      ],
    },
    output: {
      path: path.resolve(
        __dirname,
        'dist'
      ),
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
              'demo'
            ),
            // @see - https://github.com/visionmedia/debug/issues/668
            path.resolve(
              __dirname,
              'node_modules',
              'debug'
            ),
          ],
        },
        // @todo - postcss?
        // @see - https://github.com/bensmithett/webpack-css-example/blob/master/webpack.config.js
        {
          test: /\.(eot|svg|ttf|woff|woff2)$/,
          loader: 'url-loader',
        },
        {
          test: /\.s?css$/,
          use: extractSass.extract({
            fallback: 'style-loader',
            use: [
              {
                loader: 'css-loader',
              },
              {
                loader: 'sass-loader',
              },
            ],
          }),
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
      extractSass,
      new WriteFilePlugin(),
    ],
  };
}

module.exports = function () {
  return [
    generateConfig(
      packageJson.name,
      path.resolve(
        __dirname,
        'src',
        'js',
        'index.js'
      )
    ),
    generateConfig(
      'demo-advanced',
      path.resolve(
        __dirname,
        'demo',
        'advanced',
        'index.js'
      )
    ),
  ];
};
