'use strict';

/**
 * `override` for eslint rules specifically for tests.
 *
 * @see - https: //github.com/facebook/react/blob/master/.eslintrc.js
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
