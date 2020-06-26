'use strict';

const webpack = require('webpack');
const webpackConfigs = require('./webpack.demos');

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
  // Note that we do not build the clsp-player as a development asset
  const configs = webpackConfigs().map((webpackConfig) => devConfig(webpackConfig));

  return configs;
};
