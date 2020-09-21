const LoggerMock = jest.fn().mockImplementation(() => {
  return {
    silly: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
});

LoggerMock.factory = jest.fn().mockReturnValue(new LoggerMock());

// @todo - would it be useful or practical to mock the export format of the
// `Logger.js` file?   Or is having the `Logger` class mock good enough?
//
// const ExportMock = {
//   default: jest.fn().mockReturnValue(LoggerMock),
// };

module.exports = LoggerMock;
