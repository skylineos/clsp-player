'use strict';

const mockConsole = require('jest-mock-console');

module.exports = function ({
  utils,
  Paho,
  _Router,
  Logger,
}) {
  describe('constructor', () => {
    it('should return a Router instance', () => {
      const config = utils.generateRouterConfig();
      const Router = _Router.default(Paho.Paho);

      const router = new Router(...config.asArray);

      expect(router).not.toBeNil();
      expect(router.constructor).not.toBeNil();
      expect(router.constructor.name).toEqual('Router');
    });
    it('should throw if options.Logger cannot be instantiated', () => {
      const restoreConsole = mockConsole();

      const config = utils.generateRouterConfig();
      const Router = _Router.default(Paho.Paho);

      const loggerFactoryError = new Error('logger factory error');

      config.asArray[5].Logger.factory.mockImplementationOnce(() => {
        throw loggerFactoryError;
      });

      expect(() => {
        new Router(...config.asArray);
      }).toThrow('Logger');
      expect(console.error.mock.calls).toHaveLength(1);
      expect(console.error.mock.calls[0][0]).toEqual(loggerFactoryError);
      expect(config.asArray[5].Logger.factory.mock.calls).toHaveLength(1);

      restoreConsole();
    });
    it('should throw if Paho.MQTT.Client cannot be instantiated', () => {
      const restoreConsole = mockConsole();

      const pahoClientError = new Error('paho client error');
      const Paho = {
        MQTT: {
          Client: jest.fn().mockImplementation(() => {
            throw pahoClientError;
          }),
          Message: jest.fn(),
        },
      };
      const config = utils.generateRouterConfig();
      const Router = _Router.default(Paho);

      expect(() => {
        new Router(...config.asArray);
      }).toThrow(/.*Paho.*Client.*/);
      expect(console.error.mock.calls).toHaveLength(1);
      expect(console.error.mock.calls[0][0]).toEqual(pahoClientError);
      expect(Paho.MQTT.Client.mock.calls).toHaveLength(1);

      restoreConsole();
    });
  });
};
