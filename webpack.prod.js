'use strict';

const webpack = require('webpack');
const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;

const webpackConfigs = require('./webpack.common');

const proConfig = (webpackConfig) => {
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
};

module.exports = function () {
  const configs = webpackConfigs().map((webpackConfig) => proConfig(webpackConfig));

  // We ONLY want the CLSP Player to be built in prod mode
  // Discard all the demo configs
  return [
    configs.pop(),
  ];
};
