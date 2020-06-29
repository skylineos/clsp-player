#!/usr/bin/env node

'use strict';

/**
 * A script to build the CLSP Player and Demos.
 *
 * This should only ever be called from `./build.sh`
 */

const BuildCompiler = require('../webpack-utils/BuildCompiler');

const webpackConfigClspPlayer = require('../../webpack.clsp-player');
const webpackConfigDemos = require('../../webpack.demos');

async function build (name, webpackConfigs) {
  const buildCompiler = BuildCompiler.factory(name, webpackConfigs);

  const stats = await buildCompiler.build();

  // Show an error summary.  The user will need to scroll up in the terminal
  // to see the detailed errors and warnings.
  if (stats.hasErrors()) {
    const info = stats.toJson();

    throw new Error(`${name} Build encountered ${info.errors.length} errors.`);
  }
}

async function main () {
  // Build the CLSP Player first, because the demos depend on it.
  await build('clsp-player', webpackConfigClspPlayer());
  await build('clsp-player-demos', webpackConfigDemos());
}

main()
  .then(() => {
    console.log('Build succeeded!');
    process.exit();
  })
  .catch((error) => {
    console.error(error);
    console.error('Build failed!');
    process.exit(1);
  });
