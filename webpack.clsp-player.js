'use strict';

const path = require('path');

const {
  generateConfig,
  exportAsProdConfig,
} = require('./webpack.utils');

const utils = require('./src/js/utils/utils');

const clspPlayerConfig = generateConfig(
  utils.name,
  path.resolve(
    __dirname,
    'src',
    'js',
    'index.js',
  ),
);

// @see - https://webpack.js.org/configuration/output/#module-definition-systems
clspPlayerConfig.output.libraryTarget = 'umd';

module.exports = function () {
  return exportAsProdConfig([
    clspPlayerConfig,
  ]);
};
