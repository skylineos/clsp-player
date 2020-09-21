'use strict';

const {
  v4: uuidv4,
} = require('uuid');

/**
 * Generate a universally-unique string.  Useful for comparisons of arguments
 * etc. in tests.
 */
function generateUniqueString () {
  return uuidv4().toString();
}

module.exports = {
  generateUniqueString,
};
