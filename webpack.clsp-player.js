'use strict';

const path = require('path');

const {
  isDevMode,
  generateConfig,
  exportAsProdConfig,
  exportAsDevConfig,
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
clspPlayerConfig.output.library = 'CLSP';
clspPlayerConfig.output.libraryTarget = 'umd';

let configs;

if (isDevMode) {
  configs = exportAsDevConfig([
    clspPlayerConfig,
  ]);

  // @todo - it would be nice to not need to append min to this file name.
  // Make the demo pages imprort the correct filename based on isDevMode.
  configs.forEach((config) => {
    config.output.filename = '[name].min.js';
  });
}
else {
  configs = exportAsProdConfig([
    clspPlayerConfig,
  ]);
}

module.exports = function () {
  return configs;
};
