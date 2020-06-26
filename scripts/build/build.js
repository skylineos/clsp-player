#!/usr/bin/env node

'use strict';

const BuildCompiler = require('./BuildCompiler');

const webpackConfigDev = require('../../webpack.dev');
const webpackConfigProd = require('../../webpack.prod');

async function buildProd () {
  const webpackCompiler = BuildCompiler.factory(webpackConfigProd());

  const stats = await webpackCompiler.run();

  if (stats.hasErrors()) {
    const info = stats.toJson();

    throw new Error(`Prod Build encountered ${info.errors.length} errors.`);
  }
}

async function buildDev () {
  const webpackCompiler = BuildCompiler.factory(webpackConfigDev());

  const stats = await webpackCompiler.run();

  if (stats.hasErrors()) {
    const info = stats.toJson();

    throw new Error(`Dev Build encountered ${info.errors.length} errors.`);
  }
}

async function main () {
  await buildProd();
  await buildDev();
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
