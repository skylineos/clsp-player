'use strict';

const _utils = require('./Router/utils');

const constructorTests = require('./Router/constructor');
const staticPropertiesTests = require('./Router/static.properties');
const staticMethodsTests = require('./Router/static.methods');
const instancePropertiesTests = require('./Router/instance.properties');
const instanceMethodsTests = require('./Router/instance.methods');

const Paho = require('../../conduit/Paho');
const _Router = require('../Router');
const Logger = require('../../utils/Logger');

jest.mock('../../conduit/Paho');
jest.mock('../../utils/Logger');

describe('Router', () => {
  const utils = _utils({
    Logger,
  });

  describe('exports', () => {
    it('should have a default property that is a function', () => {
      expect(_Router).toBeObject();
      expect(_Router).toHaveProperty('default');
      expect(typeof _Router.default).toBe('function');
    });

    describe('default', () => {
      it('should return the Router class', () => {
        const Router = _Router.default(Paho.Paho);

        expect(Router).toBeFunction();
        expect(Router.name).toEqual('Router');
      });
    });
  });

  staticPropertiesTests({
    utils,
    Paho,
    _Router,
    Logger,
  });

  staticMethodsTests({
    utils,
    Paho,
    _Router,
    Logger,
  });

  constructorTests({
    utils,
    Paho,
    _Router,
    Logger,
  });

  instancePropertiesTests({
    utils,
    Paho,
    _Router,
    Logger,
  });

  instanceMethodsTests({
    utils,
    Paho,
    _Router,
    Logger,
  });
});
