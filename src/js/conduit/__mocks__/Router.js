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

RouterMock.events = {
  CREATED: generateUniqueString(),
  CREATE_FAILURE: generateUniqueString(),
  DATA_RECEIVED: generateUniqueString(),
  PUBLISH_SUCCESS: generateUniqueString(),
  PUBLISH_FAILURE: generateUniqueString(),
  CONNECT_SUCCESS: generateUniqueString(),
  CONNECT_FAILURE: generateUniqueString(),
  CONNECTION_LOST: generateUniqueString(),
  DISCONNECT_SUCCESS: generateUniqueString(),
  SUBSCRIBE_FAILURE: generateUniqueString(),
  UNSUBSCRIBE_FAILURE: generateUniqueString(),
  WINDOW_MESSAGE_FAIL: generateUniqueString(),
};

// @todo - would it be useful or practical to mock the export format of the
// `Router.js` file?   Or is having the `Router` class mock good enough?
//
// const ExportMock = {
//   default: jest.fn().mockReturnValue(RouterMock),
// };

module.exports = RouterMock;
