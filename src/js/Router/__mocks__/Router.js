'use strict';

// @todo - can we use module alias or something here?
const {
  generateUniqueString,
} = require('../../../../test/jest/utils');

const RouterMock = jest.fn().mockImplementation(() => {
  return {
    destroy: jest.fn(),
    logger: {
      info: jest.fn(),
      error: jest.fn(),
    },
    _sendToParentWindow: jest.fn(),
  };
});

RouterMock.factory = jest.fn().mockReturnValue(new RouterMock());

RouterMock.pahoErrorCodes = {
  NOT_CONNECTED: generateUniqueString(),
  ALREADY_CONNECTED: generateUniqueString(),
};

RouterMock.events = {
  CREATE_SUCCESS: generateUniqueString(),
  CREATE_FAILURE: generateUniqueString(),
  MESSAGE_ARRIVED: generateUniqueString(),
  PUBLISH_SUCCESS: generateUniqueString(),
  PUBLISH_FAILURE: generateUniqueString(),
  CONNECT_SUCCESS: generateUniqueString(),
  CONNECT_FAILURE: generateUniqueString(),
  CONNECTION_LOST: generateUniqueString(),
  DISCONNECT_SUCCESS: generateUniqueString(),
  DISCONNECT_FAILURE: generateUniqueString(),
  SUBSCRIBE_FAILURE: generateUniqueString(),
  UNSUBSCRIBE_SUCCESS: generateUniqueString(),
  UNSUBSCRIBE_FAILURE: generateUniqueString(),
  WINDOW_MESSAGE_FAIL: generateUniqueString(),
};

RouterMock.commands = {
  CONNECT: generateUniqueString(),
  DISCONNECT: generateUniqueString(),
  PUBLISH: generateUniqueString(),
  SUBSCRIBE: generateUniqueString(),
  UNSUBSCRIBE: generateUniqueString(),
  SEND: generateUniqueString(),
};

// @todo - would it be useful or practical to mock the export format of the
// `Router.js` file?   Or is having the `Router` class mock good enough?
//
// const ExportMock = {
//   default: jest.fn().mockReturnValue(RouterMock),
// };

module.exports = RouterMock;
