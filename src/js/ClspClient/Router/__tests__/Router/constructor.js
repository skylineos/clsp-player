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

      // @todo - is there a more proper way of mocking a static method on "real"
      // class?
      const constructorArgumentsBouncer = Router.constructorArgumentsBouncer;
      const constructorArgumentsBouncerMock = jest.fn();

      Router.constructorArgumentsBouncer = constructorArgumentsBouncerMock;

      const router = new Router(...config.asArray);

      expect(router).not.toBeNil();
      expect(router.constructor).not.toBeNil();
      expect(router.constructor.name).toEqual('Router');
      expect(constructorArgumentsBouncerMock.mock.calls).toHaveLength(1);
      expect(constructorArgumentsBouncerMock.mock.calls[0][0]).toEqual(config.asArray[0]);
      expect(constructorArgumentsBouncerMock.mock.calls[0][1]).toEqual(config.asArray[1]);
      expect(constructorArgumentsBouncerMock.mock.calls[0][2]).toEqual(config.asArray[2]);
      expect(constructorArgumentsBouncerMock.mock.calls[0][3]).toEqual(config.asArray[3]);
      expect(constructorArgumentsBouncerMock.mock.calls[0][4]).toEqual(config.asArray[4]);
      expect(constructorArgumentsBouncerMock.mock.calls[0][5]).toEqual(config.asArray[5]);

      Router.constructorArgumentsBouncer = constructorArgumentsBouncer;
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
      // @todo - test the logger error call
      // expect(console.error.mock.calls).toHaveLength(1);
      // expect(console.error.mock.calls[0][0]).toEqual(pahoClientError);
      expect(Paho.MQTT.Client.mock.calls).toHaveLength(1);
    });
  });
};
