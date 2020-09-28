'use strict';

const merge = require('lodash/merge');

/**
 * `override` for eslint rules specifically for tests.
 *
 * Note that if we try to name this file `.eslintrc.js`, linting will fail.
 *
 * @see - https://github.com/facebook/react/blob/master/.eslintrc.js
 */

function generateTestOverride (overrides = {}) {
  const baseOverride = {
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
    rules: {
      // Needed for testing constructor errors
      'no-new': 'off',
    },
  };

  return merge(baseOverride, overrides);
}

// This override will apply to all files in __tests__ directories, and should
// be first in the override list.
const testDirectoryOverrides = generateTestOverride({
  files: [
    '**/__tests__/**/*.js',
  ],
  rules: {
    // Needed to allow splitting up large test files
    'jest/no-export': 'off',
  },
});

// This override is more specific, and will apply to all __tests__ files that
// end in `.test.js` and all mock files.  It will apply a more strict rule-set
// to the __tests__ files.
const testOverrides = generateTestOverride({
  files: [
    '**/__tests__/**/*.test.js',
    '**/__mocks__/**/*.js',
  ],
});

module.exports = [
  testDirectoryOverrides,
  testOverrides,
];
