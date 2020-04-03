'use strict';

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
      minProperties: 1,
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
  'function-paren-newline': [
    'error',
    {
      minItems: 3,
    },
  ],
  'no-async-promise-executor': 'warn',
};

module.exports = {
  extends: [
    'standard',
    'eslint:recommended',
  ],
  root: true,
  parser: 'babel-eslint',
  parserOptions: {
    ecmaVersion: 8,
    sourceType: 'module',
    ecmaFeatures: {
      impliedStrict: true,
    },
  },
  env: {
    node: true,
  },
  rules,
};
