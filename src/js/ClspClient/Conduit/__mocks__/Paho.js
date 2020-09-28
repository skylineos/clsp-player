'use strict';

const PahoClientMock = jest.fn().mockImplementation(() => {
  return {
    subscribe: jest.fn(),
    unsubscribe: jest.fn(),
    publish: jest.fn(),
    connect: jest.fn(),
    disconnect: jest.fn(),
  };
});

const PahoMessageMock = jest.fn().mockImplementation(() => {
  return {};
});

const PahoMock = {
  Client: PahoClientMock,
  Message: PahoMessageMock,
};

// @todo - would it be useful or practical to mock the export format of the
// `Paho.js` file?   Or is having the `Paho` class mock good enough?
//
// const ExportMock = {
//   default: jest.fn().mockReturnValue(PahoMock),
// };

module.exports = {
  Paho: {
    MQTT: PahoMock,
  },
  register: jest.fn(),
};
