// @todo - it may be better to put this in `setupFilesAfterEnv` in jest config
import '@babel/polyfill';

import Router from '../Router';

describe('Router', () => {
  describe('has a default export value', () => {
    it('is a function', () => {
      expect(typeof Router).toBe('function');
    });
    it('returns an object with the required keys and value types', () => {
      const router = Router();

      expect(router).toBeObject();
      expect(router).toContainAllKeys([
        'Router',
        'onload',
        'onunload',
      ]);
      expect(typeof router.Router).toBe('function');
      expect(router.Router.name).toBe('Router');
      expect(typeof router.onload).toBe('function');
      expect(typeof router.onunload).toBe('function');
    });
  });

  describe.skip('Router', () => {
    it('lame', () => {
      throw new Error('shouldnt see me');
    });
  });

  describe.skip('onload', () => {
    it('lame', () => {
      throw new Error('shouldnt see me');
    });
  });

  describe('when onunload is called', () => {
    describe('when the router has not been instantiated', () => {
      it('does not throw an error', () => {
        const {
          onunload,
        } = Router();

        window.router = undefined;

        expect(onunload).not.toThrow();
      });
    });

    describe('when the router has been instantiated', () => {
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

        expect(window.router.destroy.mock.calls).toHaveLength(1);
      });

      it('logs any unexpected error and does not throw', () => {
        const {
          onunload,
        } = Router();

        window.router = generateMockRouter();

        const error = new Error('Unexpected Error!');

        window.router.destroy = jest.fn(() => {
          throw error;
        });

        onunload();

        expect(window.router.destroy.mock.calls).toHaveLength(1);
        expect(window.router.logger.error.mock.calls).toHaveLength(1);
        expect(window.router.logger.error.mock.calls[0].params[0]).toBe(error);
      });
    });
  });
});
