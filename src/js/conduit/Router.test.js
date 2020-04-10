import '@babel/polyfill';

import Router from './Router';

describe('Router', () => {
  describe('export value', () => {
    it('is function', () => {
      expect(typeof Router).toBe('function');
    });
  });

  describe('has everything necessary for iframe functionality', () => {
    it('returns object', () => {
      const router = Router();

      expect(typeof router).toBe('object');
    });
    it('has "Router" property, which is the Router class', () => {
      const router = Router();

      expect(typeof router.Router).toBe('function');
      expect(router.Router.name).toBe('Router');
    });
    it('has "onload" property of type "function"', () => {
      const router = Router();

      expect(typeof router.onload).toBe('function');
    });
    it('has "onunload" property of type "function"', () => {
      const router = Router();

      expect(typeof router.onunload).toBe('function');
    });
    it('has "PAHO_ERROR_CODE_NOT_CONNECTED" property of type "string"', () => {
      const router = Router();

      expect(typeof router.PAHO_ERROR_CODE_NOT_CONNECTED).toBe('string');
    });
  });

  xdescribe('Router', () => {
    it('lame', () => {
      throw new Error('shouldnt see me');
    });
  });

  xdescribe('onload', () => {
    it('lame', () => {
      throw new Error('shouldnt see me');
    });
  });

  describe('onunload', () => {
    describe('the router has not been instantiated', () => {
      it('does not throw an error', () => {
        const { onunload } = Router();

        window.router = undefined;

        expect(onunload).not.toThrow();
      });
    });

    describe('the router has been instantiated', () => {
      function generateMockRouter () {
        return {
          destroy: jest.fn(),
          logger: {
            info: jest.fn(),
            error: jest.fn(),
          },
        };
      }

      it('destroys the router', () => {
        const {
          onunload,
        } = Router();

        window.router = generateMockRouter();

        onunload();

        expect(window.router.destroy.mock.calls.length).toBe(1);
      });

      it('exits gracefully if an unspecified error occurs and logs the error', () => {
        const {
          onunload,
        } = Router();

        window.router = generateMockRouter();

        const error = new Error('Unspecified Error');

        window.router.destroy = jest.fn(() => {
          throw error;
        });

        onunload();

        expect(window.router.destroy.mock.calls.length).toBe(1);
        expect(window.router.logger.error.mock.calls.length).toBe(1);
        expect(window.router.logger.error.mock.calls[0].params[0]).toBe(error);
      });
    });
  });
});
