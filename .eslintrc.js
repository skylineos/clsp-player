'use strict';

const path = require('path');
const babelConfig = require('./babel.config')();
const testOverride = require('./test/jest/.eslintrc.jest');

const rules = {
  'max-len': [
    'error',
    {
      code: 120,
      ignoreTrailingComments: true,
      ignoreUrls: true,
      ignoreStrings: true,
      ignoreTemplateLiterals: true,
      ignoreRegExpLiterals: true,
    },
  ],
  indent: [
    'error',
    2,
    {
      SwitchCase: 1,
    },
  ],
  'multiline-ternary': [
    'error',
    'always',
  ],
  'no-trailing-spaces': 'error',
  'object-curly-newline': [
    'error',
    {
      minProperties: 3,
      consistent: true,
    },
  ],
  'object-property-newline': 'error',
  'object-curly-spacing': [
    'error',
    'always',
  ],
  'array-bracket-spacing': [
    'error',
    'always',
  ],
  'array-bracket-newline': [
    'error',
    {
      minItems: 1,
    },
  ],
  'array-element-newline': [
    'error',
    'always',
  ],
  'comma-dangle': [
    'error',
    'always-multiline',
  ],
  'comma-style': [
    'error',
    'last',
  ],
  semi: [
    'error',
    'always',
  ],
  'padded-blocks': [
    'error',
    'never',
  ],
  'brace-style': [
    'error',
    'stroustrup',
  ],
  'prefer-promise-reject-errors': 'error',
  quotes: [
    'error',
    'single',
    {
      avoidEscape: true,
    },
  ],
  'arrow-parens': [
    'error',
    'always',
  ],
  'no-cond-assign': [
    'error',
    'always',
  ],
  'no-extra-boolean-cast': 'error',
  'no-multiple-empty-lines': 'error',
  'no-multi-spaces': 'error',
  'space-before-function-paren': [
    'error',
    'always',
  ],
  // @todo - waiting on this rule:
  // @see - https://github.com/eslint/eslint/issues/10323
  // 'function-paren-newline': [
  //   'error',
  //   {
  //     minItems: 3,
  //   },
  // ],
  'no-async-promise-executor': 'warn',
};

module.exports = {
  extends: [
    'standard',
    'eslint:recommended',
  ],
  root: true,
  parser: '@babel/eslint-parser',
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
    ecmaFeatures: {
      impliedStrict: true,
    },
    babelOptions: {
      configFile: path.join(__dirname, 'babel.config.js'),
    },
  },
  plugins: [
    '@babel/eslint-plugin',
  ],
  env: {
    browser: true,
  },
  rules,
  overrides: [
    {
      files: babelConfig.ignore,
      // use the default parser since babel isn't parsing these files
      parser: 'esprima',
    },
    ...testOverride,
  ],
};
