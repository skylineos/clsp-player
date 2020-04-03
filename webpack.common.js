'use strict';

const path = require('path');
const chalk = require('chalk');
const ProgressBarPlugin = require('progress-bar-webpack-plugin');
const ExtractTextPlugin = require('extract-text-webpack-plugin');
const WriteFilePlugin = require('write-file-webpack-plugin');

const packageJson = require('./package.json');

const DESTINATION_PATH = path.resolve(__dirname, 'dist');

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

function generateExtractSassPlugin () {
  // @see - https://github.com/webpack-contrib/sass-loader
  return new ExtractTextPlugin({
    filename: '[name].css',
  });
}

function generateWriteFilePlugin () {
  return new WriteFilePlugin();
}

function generateJsRule (srcPath) {
  return {
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
      srcPath,
      // @see - https://github.com/visionmedia/debug/issues/668
      path.resolve(
        __dirname,
        'node_modules',
        'debug'
      ),
    ],
  };
}

function generateStyleRules (extractSass) {
  return [
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
  ];
}

function generateClspConfig () {
  const name = packageJson.name;
  const srcPath = path.resolve(
    __dirname,
    'src',
    'js'
  );

  const extractSass = generateExtractSassPlugin();

  return {
    name,
    entry: {
      // @see - https://github.com/webpack-contrib/webpack-serve/issues/27
      [name]: [
        path.resolve(
          srcPath,
          'video-js-plugin',
          'index.js'
        ),
      ],
      iovPlayer: [
        path.resolve(
          srcPath,
          'iov',
          'index.js'
        ),
      ],
    },
    output: {
      path: DESTINATION_PATH,
      filename: '[name].js',
    },
    module: {
      rules: [
        generateJsRule(srcPath),
        ...generateStyleRules(extractSass),
      ],
      // noParse: /video.js/
    },
    externals: {
      'video.js': 'videojs',
    },
    plugins: [
      generateProgressBarPlugin(name),
      extractSass,
      generateWriteFilePlugin(),
    ],
  };
}

function generateAdvancedWithVideoJsDemoConfig () {
  const name = 'advancedWithVideoJs';
  const srcPath = path.resolve(
    __dirname,
    'demo',
    'advancedWithVideoJs'
  );

  const extractSass = generateExtractSassPlugin();

  return {
    name,
    entry: {
      // @see - https://github.com/webpack-contrib/webpack-serve/issues/27
      [name]: [
        path.resolve(srcPath, 'main.js'),
      ],
    },
    output: {
      filename: '[name].js',
      path: DESTINATION_PATH,
    },
    module: {
      rules: [
        generateJsRule(srcPath),
        ...generateStyleRules(extractSass),
      ],
    },
    resolve: {
      alias: {
        '~root': __dirname,
        'video.js$': path.resolve(
          __dirname,
          'node_modules',
          'video.js'
        ),
      },
    },
    plugins: [
      generateProgressBarPlugin(name),
      extractSass,
      generateWriteFilePlugin(),
    ],
  };
}

function generateAdvancedStandaloneDemoConfig () {
  const name = 'advancedStandalone';
  const srcPath = path.resolve(
    __dirname,
    'demo',
    'advancedStandalone'
  );

  const extractSass = generateExtractSassPlugin();

  return {
    name,
    entry: {
      // @see - https://github.com/webpack-contrib/webpack-serve/issues/27
      [name]: [
        path.resolve(srcPath, 'main.js'),
      ],
    },
    output: {
      filename: '[name].js',
      path: DESTINATION_PATH,
    },
    module: {
      rules: [
        generateJsRule(srcPath),
        ...generateStyleRules(extractSass),
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
      generateWriteFilePlugin(),
    ],
  };
}

module.exports = function () {
  return [
    generateClspConfig(),
    generateAdvancedWithVideoJsDemoConfig(),
    generateAdvancedStandaloneDemoConfig(),
  ];
};
