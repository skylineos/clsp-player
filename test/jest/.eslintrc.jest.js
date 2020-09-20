'use strict';

/**
 * `override` for eslint rules specifically for tests.
 *
 * Note that if we try to name this file `.eslintrc.js`, linting will fail.
 *
 * @see - https://github.com/facebook/react/blob/master/.eslintrc.js
 */

module.exports = {
  files: [
    '**/__tests__/*.js',
  ],
  plugins: [
    'jest',
  ],
  extends: [
    'plugin:jest/recommended',
    'plugin:jest/style',
  ],
  env: {
    'jest/globals': true,
  },
};
