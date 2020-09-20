'use strict';

const {
  v4: uuidv4,
} = require('uuid');

function generateUniqueString () {
  return uuidv4().toString();
}

module.exports = {
  generateUniqueString,
};
