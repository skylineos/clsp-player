'use strict';

const mockConsole = require('jest-mock-console');

module.exports = function ({
  utils,
  Paho,
  _Router,
  Logger,
}) {
  describe('static methods', () => {
    describe('factory', () => {
      it('should return a Router instance', () => {
        const config = utils.generateRouterConfig();
        const Router = _Router.default(Paho.Paho);

        const router = Router.factory(...config.asArray);


        expect(router).not.toBeNil();
        expect(router.constructor).not.toBeNil();
        expect(router.constructor.name).toEqual('Router');
      });
    });

    describe('constructorArgumentsBouncer', () => {
      it('should throw if Paho is not an object', () => {
        const Paho = undefined;
        const config = utils.generateRouterConfig();
        const Router = _Router.default(Paho);

        expect(() => {
          new Router(...config.asArray);
        }).toThrow('Paho is required');
      });
      it('should throw if Paho.MQTT is not an object', () => {
        const Paho = {
          MQTT: undefined,
        };
        const config = utils.generateRouterConfig();
        const Router = _Router.default(Paho);

        expect(() => {
          new Router(...config.asArray);
        }).toThrow('Paho.MQTT is required');
      });
      it('should throw if Paho.MQTT.Client is not a function', () => {
        const Paho = {
          MQTT: {
            Client: undefined,
            Message: jest.fn(),
          },
        };
        const config = utils.generateRouterConfig();
        const Router = _Router.default(Paho);

        expect(() => {
          new Router(...config.asArray);
        }).toThrow('Paho.MQTT.Client is required');
      });
      it('should throw if Paho.MQTT.Message is not a function', () => {
        const Paho = {
          MQTT: {
            Client: jest.fn(),
            Message: undefined,
          },
        };
        const config = utils.generateRouterConfig();
        const Router = _Router.default(Paho);

        expect(() => {
          new Router(...config.asArray);
        }).toThrow('Paho.MQTT.Message is required');
      });
      it('should throw if logId is undefined', () => {
        const config = utils.generateRouterConfig();
        const Router = _Router.default(Paho.Paho);

        config.asArray[0] = undefined;

        expect(() => {
          new Router(...config.asArray);
        }).toThrow('logId');
      });
      it('should throw if clientId is undefined', () => {
        const config = utils.generateRouterConfig();
        const Router = _Router.default(Paho.Paho);

        config.asArray[1] = undefined;

        expect(() => {
          new Router(...config.asArray);
        }).toThrow('clientId');
      });
      it('should throw if host is undefined', () => {
        const config = utils.generateRouterConfig();
        const Router = _Router.default(Paho.Paho);

        config.asArray[2] = undefined;

        expect(() => {
          new Router(...config.asArray);
        }).toThrow('host');
      });
      it('should throw if port is undefined', () => {
        const config = utils.generateRouterConfig();
        const Router = _Router.default(Paho.Paho);

        config.asArray[3] = undefined;

        expect(() => {
          new Router(...config.asArray);
        }).toThrow('port');
      });
      it('should throw if useSSL is undefined', () => {
        const config = utils.generateRouterConfig();
        const Router = _Router.default(Paho.Paho);

        config.asArray[4] = undefined;

        expect(() => {
          new Router(...config.asArray);
        }).toThrow('useSSL');
      });
      it('should throw if options is not an object', () => {
        const config = utils.generateRouterConfig();
        const Router = _Router.default(Paho.Paho);

        config.asArray[5] = undefined;

        expect(() => {
          new Router(...config.asArray);
        }).toThrow('options');
      });
      it('should throw if options.Logger is undefined', () => {
        const config = utils.generateRouterConfig();
        const Router = _Router.default(Paho.Paho);

        config.asArray[5].Logger = undefined;

        expect(() => {
          new Router(...config.asArray);
        }).toThrow('options.Logger');
      });
      it('should throw if options.CONNECTION_TIMEOUT is not an object', () => {
        const config = utils.generateRouterConfig();
        const Router = _Router.default(Paho.Paho);

        config.asArray[5].CONNECTION_TIMEOUT = undefined;

        expect(() => {
          new Router(...config.asArray);
        }).toThrow('options.CONNECTION_TIMEOUT');
      });
      it('should throw if options.KEEP_ALIVE_INTERVAL is not an object', () => {
        const config = utils.generateRouterConfig();
        const Router = _Router.default(Paho.Paho);

        config.asArray[5].KEEP_ALIVE_INTERVAL = undefined;

        expect(() => {
          new Router(...config.asArray);
        }).toThrow('options.KEEP_ALIVE_INTERVAL');
      });
      it('should throw if options.PUBLISH_TIMEOUT is not an object', () => {
        const config = utils.generateRouterConfig();
        const Router = _Router.default(Paho.Paho);

        config.asArray[5].PUBLISH_TIMEOUT = undefined;

        expect(() => {
          new Router(...config.asArray);
        }).toThrow('options.PUBLISH_TIMEOUT');
      });
    });
  });
};
