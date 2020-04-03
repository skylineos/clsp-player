'use strict';

const webpack = require('webpack');
const webpackConfigs = require('./webpack.common');

function devConfig (webpackConfig) {
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
}

module.exports = function () {
  return webpackConfigs().map((webpackConfig) => devConfig(webpackConfig)).reverse();
};
