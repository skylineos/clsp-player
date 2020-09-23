'use strict';

const mockConsole = require('jest-mock-console');

// @todo - can we use module alias or something here?
const {
  generateUniqueString,
} = require('../../../../test/jest/utils');

const _iframeEventHandlers = require('../iframeEventHandlers');
const Router = require('../Router/Router');

jest.mock('../Router/Router');

describe('iframeEventHandlers', () => {
  function generateLogId () {
    return generateUniqueString();
  }

  function generateRouterConfig () {
    return {
      logId: generateUniqueString(),
      clientId: generateUniqueString(),
      host: generateUniqueString(),
      port: generateUniqueString(),
      useSSL: generateUniqueString(),
      CONNECTION_TIMEOUT: generateUniqueString(),
      KEEP_ALIVE_INTERVAL: generateUniqueString(),
      PUBLISH_TIMEOUT: generateUniqueString(),
      Logger: generateUniqueString(),
    };
  }

  describe('exports', () => {
    it('should have a default property that is a function', () => {
      expect(_iframeEventHandlers).toBeObject();
      expect(_iframeEventHandlers).toHaveProperty('default');
      expect(typeof _iframeEventHandlers.default).toBe('function');
    });

    describe('default', () => {
      it('should return an object with the required keys and value types', () => {
        const iframeEventHandlers = _iframeEventHandlers.default();

        expect(iframeEventHandlers).toBeObject();
        expect(iframeEventHandlers).toContainAllKeys([
          'onload',
          'onunload',
        ]);

        expect(typeof iframeEventHandlers.onload).toBe('function');
        expect(typeof iframeEventHandlers.onunload).toBe('function');
      });
    });
  });

  describe('onload', () => {
    beforeEach(() => {
      Router.mockClear();
    });

    it('should construct the router', () => {
      const logId = generateLogId();
      const config = generateRouterConfig();

      const {
        onload,
      } = _iframeEventHandlers.default();

      const router = onload(logId, Router, config);

      expect(Router.factory.mock.calls).toHaveLength(1);
      expect(Router.factory.mock.calls[0][0]).toEqual(config.logId);
      expect(Router.factory.mock.calls[0][1]).toEqual(config.clientId);
      expect(Router.factory.mock.calls[0][2]).toEqual(config.host);
      expect(Router.factory.mock.calls[0][3]).toEqual(config.port);
      expect(Router.factory.mock.calls[0][4]).toEqual(config.useSSL);
      expect(Router.factory.mock.calls[0][5]).toBeObject();
      expect(Router.factory.mock.calls[0][5]).toContainAllKeys([
        'CONNECTION_TIMEOUT',
        'KEEP_ALIVE_INTERVAL',
        'PUBLISH_TIMEOUT',
        'Logger',
      ]);
      expect(Router.factory.mock.calls[0][5].CONNECTION_TIMEOUT).toEqual(config.CONNECTION_TIMEOUT);
      expect(Router.factory.mock.calls[0][5].KEEP_ALIVE_INTERVAL).toEqual(config.KEEP_ALIVE_INTERVAL);
      expect(Router.factory.mock.calls[0][5].PUBLISH_TIMEOUT).toEqual(config.PUBLISH_TIMEOUT);
      expect(Router.factory.mock.calls[0][5].Logger).toEqual(config.Logger);

      expect(router).not.toBeNil();

      expect(router.logger.info.mock.calls).toHaveLength(1);
      expect(router.logger.info.mock.calls[0][0]).toInclude(logId);
    });

    it('should let the parent window know the router was successfully instantiated', () => {
      const logId = generateLogId();
      const config = generateRouterConfig();

      const {
        onload,
      } = _iframeEventHandlers.default();

      const router = onload(logId, Router, config);

      expect(router._sendToParentWindow.mock.calls).toHaveLength(1);
      expect(router._sendToParentWindow.mock.calls[0][0]).toBeObject();
      expect(router._sendToParentWindow.mock.calls[0][0]).toContainAllKeys([
        'event',
      ]);
      expect(router._sendToParentWindow.mock.calls[0][0].event).toEqual(Router.events.CREATED);
    });

    it('should let the parent window know if an error was encountered during instantiation', () => {
      const restoreConsole = mockConsole();
      const logId = generateLogId();
      const config = generateRouterConfig();

      const {
        onload,
      } = _iframeEventHandlers.default();

      const onloadError = new Error('onload error');

      Router.factory.mockImplementationOnce(() => {
        throw onloadError;
      });

      // @see - https://medium.com/@the_teacher/how-to-test-console-output-console-log-console-warn-with-rtl-react-testing-library-and-jest-6df367736cf0
      const originalPostMessage = window.parent.postMessage;
      window.parent.postMessage = jest.fn();

      expect(() => onload(logId, Router, config)).not.toThrow();
      expect(console.error.mock.calls).toHaveLength(2);
      expect(console.error.mock.calls[0][0]).toInclude(logId);
      expect(console.error.mock.calls[1][0]).toEqual(onloadError);
      expect(window.parent.postMessage.mock.calls).toHaveLength(1);
      expect(window.parent.postMessage.mock.calls[0][0]).toBeObject();
      expect(window.parent.postMessage.mock.calls[0][0]).toContainAllKeys([
        'event',
        'reason',
      ]);
      expect(window.parent.postMessage.mock.calls[0][0].event).toEqual(Router.events.CREATE_FAILURE);
      expect(window.parent.postMessage.mock.calls[0][0].reason).toEqual(onloadError);

      restoreConsole();
      window.parent.postMessage = originalPostMessage;
    });
  });

  describe('onunload', () => {
    describe('when onunload is called', () => {
      describe('when the router has not been instantiated', () => {
        it('should not throw an error', () => {
          const restoreConsole = mockConsole();

          const logId = generateLogId();

          const {
            onunload,
          } = _iframeEventHandlers.default();

          expect(() => onunload(logId)).not.toThrow();
          expect(console.warn).toHaveBeenCalled();
          expect(console.warn.mock.calls[0][0]).toInclude(logId);

          restoreConsole();
        });
      });

      describe('when the router has been instantiated', () => {
        beforeEach(() => {
          Router.mockClear();
        });

        it('should destroy the router', () => {
          const logId = generateLogId();

          const {
            onunload,
          } = _iframeEventHandlers.default();

          const router = new Router();

          onunload(logId, router);

          expect(router.destroy.mock.calls).toHaveLength(1);
          expect(router.logger.info.mock.calls).toHaveLength(2);
          expect(router.logger.info.mock.calls[0][0]).toInclude(logId);
          expect(router.logger.info.mock.calls[1][0]).toInclude(logId);
        });

        it('should log any unexpected error and does not throw', () => {
          const logId = generateLogId();

          const {
            onunload,
          } = _iframeEventHandlers.default();

          const router = new Router();

          const routerDestroyError = new Error('Router Destroy Error');

          router.destroy.mockImplementationOnce(() => {
            throw routerDestroyError;
          });

          onunload(logId, router);

          expect(router.destroy.mock.calls).toHaveLength(1);
          expect(router.logger.error.mock.calls).toHaveLength(2);
          expect(router.logger.error.mock.calls[0][0]).toInclude(logId);
          expect(router.logger.error.mock.calls[1][0]).toBe(routerDestroyError);
        });
      });
    });
  });
});
