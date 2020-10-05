'use strict';

const path = require('path');

const {
  outputPath,
  generateConfig,
  exportAsDevConfig,
} = require('./webpack.utils');

const demoOutputPath = path.resolve(
  outputPath,
  'demos',
);

const advancedDemoDistConfig = generateConfig(
  'advanced-dist',
  path.resolve(
    __dirname,
    'demos',
    'advanced-dist',
    'index.js',
  ),
);

advancedDemoDistConfig.output.path = demoOutputPath;

const advancedDemoSrcConfig = generateConfig(
  'advanced-src',
  path.resolve(
    __dirname,
    'demos',
    'advanced-src',
    'index.js',
  ),
);

advancedDemoSrcConfig.output.path = demoOutputPath;

const singlePlayerDemoSrcConfig = generateConfig(
  'single-player',
  path.resolve(
    __dirname,
    'demos',
    'single-player',
    'index.js',
  ),
);

singlePlayerDemoSrcConfig.output.path = demoOutputPath;

const tourDemoSrcConfig = generateConfig(
  'tour-src',
  path.resolve(
    __dirname,
    'demos',
    'tour-src',
    'index.js',
  ),
);

tourDemoSrcConfig.output.path = demoOutputPath;

// @todo - we need to stop including the demos in the npm releases because
// they're huge and unnecessary.  But, for now, we rely on them for testing,
// so this change will have to wait until the demos are moved to their own
// projects.
module.exports = function () {
  return exportAsDevConfig([
    // Note that the demo files depend on `dist/clsp-player.min.js`
    advancedDemoDistConfig,
    advancedDemoSrcConfig,
    singlePlayerDemoSrcConfig,
    tourDemoSrcConfig,
  ]);
};
