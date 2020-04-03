#!/usr/bin/env node
'use strict';

const webpack = require('webpack');
const chalk = require('chalk');

const devConfigs = require('../webpack.dev');
const prodConfigs = require('../webpack.prod');

// @see - https://webpack.js.org/api/node/
webpack([
  ...(devConfigs()),
  ...(prodConfigs()),
], (err, stats) => {
  if (err) {
    console.error(chalk.redBright(err.stack || err));

    if (err.details) {
      console.error(chalk.redBright(err.details));
    }

    process.exit(1);
  }

  const info = stats.toJson();

  process.stdout.write(stats.toString() + '\n');

  if (stats.hasWarnings()) {
    console.warn(chalk.yellowBright(info.warnings));
  }

  // Write errors last to make failure more apparent
  if (stats.hasErrors()) {
    console.error(chalk.redBright(info.errors));
    process.exit(1);
  }

  process.exit(0);
});
