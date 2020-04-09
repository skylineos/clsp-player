import '@babel/polyfill';

import Router from './Router';

describe('Router', () => {
  describe('export value', () => {
    test('is function', () => {
      expect(typeof Router).toBe('function');
    });
  });

  describe('has everything necessary for iframe functionality', () => {
    test('returns object', () => {
      const router = Router();

      expect(typeof router).toBe('object');
    });
    test('has "Router" property, which is the Router class', () => {
      const router = Router();

      expect(typeof router.Router).toBe('function');
      expect(router.Router.name).toBe('Router');
    });
    test('has "onload" property of type "function"', () => {
      const router = Router();

      expect(typeof router.onload).toBe('function');
    });
    test('has "onunload" property of type "function"', () => {
      const router = Router();

      expect(typeof router.onunload).toBe('function');
    });
    test('has "PAHO_ERROR_CODE_NOT_CONNECTED" property of type "string"', () => {
      const router = Router();

      expect(typeof router.PAHO_ERROR_CODE_NOT_CONNECTED).toBe('string');
    });
  });

  xdescribe('Router', () => {
    test('lame', () => {
      throw new Error('shouldnt see me');
    });
  });

  xdescribe('onload', () => {
    test('lame', () => {
      throw new Error('shouldnt see me');
    });
  });

  describe('onunload', () => {
    describe('when router has not been instantiated...', () => {
      test('exits gracefully', () => {
        const { onunload } = Router();

        window.router = undefined;

        expect(onunload).not.toThrow();
      });
    });

    describe('when router has been instantiated...', () => {
      function generateMockRouter () {
        return {
          destroy: jest.fn(),
          logger: {
            info: jest.fn(),
            error: jest.fn(),
          },
        };
      }

      test('destroys the router', () => {
        const {
          onunload,
        } = Router();

        window.router = generateMockRouter();

        onunload();

        expect(window.router.destroy.mock.calls.length).toBe(1);
        expect(window.router.logger.info.mock.calls.length).toBe(2);
        expect(window.router.logger.error.mock.calls.length).toBe(0);
      });
      test('exits gracefully if the router has already been disconnected', () => {
        const {
          PAHO_ERROR_CODE_NOT_CONNECTED,
          onunload,
        } = Router();

        window.router = generateMockRouter();

        window.router.destroy = jest.fn(() => {
          throw new Error(PAHO_ERROR_CODE_NOT_CONNECTED);
        });

        onunload();

        expect(window.router.destroy.mock.calls.length).toBe(1);
        expect(window.router.logger.info.mock.calls.length).toBe(1);
        expect(window.router.logger.error.mock.calls.length).toBe(0);
      });
      test('exits gracefully if an unspecified error occurs', () => {
        const {
          onunload,
        } = Router();

        window.router = generateMockRouter();

        window.router.destroy = jest.fn(() => {
          throw new Error('Unspecified Error');
        });

        onunload();

        expect(window.router.destroy.mock.calls.length).toBe(1);
        expect(window.router.logger.info.mock.calls.length).toBe(1);
        expect(window.router.logger.error.mock.calls.length).toBe(1);
      });
    });
  });
});
