'use strict';

const webpack = require('webpack');
const TerserPlugin = require('terser-webpack-plugin');
const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;

const webpackConfigs = require('./webpack.common');

const proConfig = (webpackConfig) => {
  const config = {
    ...webpackConfig,
    mode: 'production',
    cache: true,
    devtool: 'cheap-source-map',
    optimization: {
      minimizer: [
        new TerserPlugin({
          exclude: /\.min\.js$/i,
        }),
      ],
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
        // Needed to prevent minification breaking video-contrib-hls
        // @see - https://github.com/videojs/videojs-contrib-hls/issues/600#issuecomment-321281442
        'typeof global': JSON.stringify('undefined'),
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
  return webpackConfigs().map((webpackConfig) => proConfig(webpackConfig)).reverse();
};
