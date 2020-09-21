'use strict';

// @todo - can we use module alias or something here?
const utils = require('../../../../../test/jest/utils');

module.exports = function ({
  Logger,
}) {
  return {
    ...utils,
    generateRouterConfig () {
      const config = {
        logId: utils.generateUniqueString(),
        clientId: utils.generateUniqueString(),
        host: utils.generateUniqueString(),
        port: utils.generateUniqueString(),
        useSSL: utils.generateUniqueString(),
        options: {
          CONNECTION_TIMEOUT: utils.generateUniqueString(),
          KEEP_ALIVE_INTERVAL: utils.generateUniqueString(),
          PUBLISH_TIMEOUT: utils.generateUniqueString(),
          Logger,
          conduitCommands: {},
        },
      };

      return {
        asArray: [
          config.logId,
          config.clientId,
          config.host,
          config.port,
          config.useSSL,
          config.options,
        ],
        asObject: config,
      };
    },
  };
};
