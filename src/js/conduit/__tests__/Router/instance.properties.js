'use strict';

module.exports = function ({
  utils,
  Paho,
  _Router,
  Logger,
}) {
  describe('instance properties', () => {
    describe('logId', () => {
      it('should be properly initialized by the constructor', () => {
        const config = utils.generateRouterConfig();
        const Router = _Router.default(Paho.Paho);

        const router = new Router(...config.asArray);

        expect(router.logId).toEqual(config.asObject.logId);
      });
    });
    describe('logger', () => {
      it('should be properly initialized by the constructor', () => {
        const config = utils.generateRouterConfig();
        const Router = _Router.default(Paho.Paho);

        const router = new Router(...config.asArray);

        expect(router.logger).not.toBeNil();
        expect(router.logger.constructor).not.toBeNil();
        // @todo - is there a better way to check that this is a Logger
        // instance?
        expect(router.logger.error).toBeFunction();
      });
    });
    describe('conduitCommands', () => {
      it('should be properly initialized by the constructor', () => {
        const config = utils.generateRouterConfig();
        const Router = _Router.default(Paho.Paho);

        const router = new Router(...config.asArray);

        expect(router.conduitCommands).toEqual(config.asObject.options.conduitCommands);
      });
    });
    describe('clientId', () => {
      it('should be properly initialized by the constructor', () => {
        const config = utils.generateRouterConfig();
        const Router = _Router.default(Paho.Paho);

        const router = new Router(...config.asArray);

        expect(router.clientId).toEqual(config.asObject.clientId);
      });
    });
    describe('host', () => {
      it('should be properly initialized by the constructor', () => {
        const config = utils.generateRouterConfig();
        const Router = _Router.default(Paho.Paho);

        const router = new Router(...config.asArray);

        expect(router.host).toEqual(config.asObject.host);
      });
    });
    describe('port', () => {
      it('should be properly initialized by the constructor', () => {
        const config = utils.generateRouterConfig();
        const Router = _Router.default(Paho.Paho);

        const router = new Router(...config.asArray);

        expect(router.port).toEqual(config.asObject.port);
      });
    });
    describe('useSSL', () => {
      it('should be properly initialized by the constructor', () => {
        const config = utils.generateRouterConfig();
        const Router = _Router.default(Paho.Paho);

        const router = new Router(...config.asArray);

        expect(router.useSSL).toEqual(config.asObject.useSSL);
      });
    });
    describe('Reconnect', () => {
      it('should be properly initialized by the constructor', () => {
        const config = utils.generateRouterConfig();
        const Router = _Router.default(Paho.Paho);

        const router = new Router(...config.asArray);

        expect(router.Reconnect).toBeNull();
      });
    });
    describe('clspClient', () => {
      it.todo('should be properly initialized by the constructor');
      it.todo('should be given an `onConnectionLost` property');
      it.todo('should be given an `onMessageArrived` property');
      it.todo('should be given an `onMessageDelivered` property');
    });
    describe('boundWindowMessageEventHandler', () => {
      it.todo('should be properly initialized by the constructor');
      it.todo('should be registered via `window.addEventListener`');
    });
    describe('CONNECTION_TIMEOUT', () => {
      it('should be properly initialized by the constructor', () => {
        const config = utils.generateRouterConfig();
        const Router = _Router.default(Paho.Paho);

        const router = new Router(...config.asArray);

        expect(router.CONNECTION_TIMEOUT).toEqual(config.asObject.options.CONNECTION_TIMEOUT);
      });
    });
    describe('KEEP_ALIVE_INTERVAL', () => {
      it('should be properly initialized by the constructor', () => {
        const config = utils.generateRouterConfig();
        const Router = _Router.default(Paho.Paho);

        const router = new Router(...config.asArray);

        expect(router.KEEP_ALIVE_INTERVAL).toEqual(config.asObject.options.KEEP_ALIVE_INTERVAL);
      });
    });
    describe('PUBLISH_TIMEOUT', () => {
      it('should be properly initialized by the constructor', () => {
        const config = utils.generateRouterConfig();
        const Router = _Router.default(Paho.Paho);

        const router = new Router(...config.asArray);

        expect(router.PUBLISH_TIMEOUT).toEqual(config.asObject.options.PUBLISH_TIMEOUT);
      });
    });
  });
};
