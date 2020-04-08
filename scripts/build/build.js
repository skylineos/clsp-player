#!/usr/bin/env node

'use strict';

/**
 * @see - https://webpack.js.org/api/node/
 */

const pify = require('pify');

const BuildCompiler = require('./BuildCompiler');

async function main () {
  const buildCompiler = BuildCompiler.factory();

  const stats = await pify(buildCompiler.compiler.run.bind(buildCompiler.compiler))();

  if (stats.hasErrors()) {
    const info = stats.toJson();

    throw new Error(`Build encountered ${info.errors.length} errors.`);
  }
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
