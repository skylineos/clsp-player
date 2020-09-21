'use strict';

/* eslint no-console: off */

/**
 * This file needs to use `require` rather than `import` to be able to be used
 * by webpack.
 *
 * We use this in the router as well, so keep it light and ES5 only!
 */

module.exports = function (logLevel) {
  function Logger (prefix) {
    if (logLevel === undefined && typeof window !== 'undefined') {
      // The logLevel may be set in localstorage
      // e.g. localStorage.setItem('skylineos.clsp-player.logLevel', 3), then refresh
      logLevel = isNaN(Number(window.localStorage.getItem('skylineos.clsp-player.logLevel')))
        ? 1
        : Number(window.localStorage.getItem('skylineos.clsp-player.logLevel'));

      window.localStorage.setItem('skylineos.clsp-player.logLevel', logLevel);
    }

    this.logLevel = logLevel;
    this.prefix = prefix;
  }

  Logger.logLevels = [
    'error',
    'warn',
    'info',
    'debug',
    'silly',
  ];

  Logger.factory = function (prefix) {
    return new Logger(prefix || '');
  };

  Logger.prototype._constructMessage = function (type, message) {
    var logMessage = '(' + type + ')' + ' --> ' + message;

    if (this.prefix) {
      logMessage = this.prefix + ' ' + logMessage;
    }

    return logMessage;
  };

  Logger.prototype.silly = function (message) {
    var sillyIndex = 4;

    if (this.logLevel >= sillyIndex) {
      console.log(this._constructMessage(Logger.logLevels[sillyIndex], message));
    }
  };

  Logger.prototype.debug = function (message) {
    var debugIndex = 3;

    if (this.logLevel >= debugIndex) {
      console.log(this._constructMessage(Logger.logLevels[debugIndex], message));
    }
  };

  Logger.prototype.info = function (message) {
    var infoIndex = 2;

    if (this.logLevel >= infoIndex) {
      console.log(this._constructMessage(Logger.logLevels[infoIndex], message));
    }
  };

  Logger.prototype.warn = function (message) {
    var warnIndex = 1;

    if (this.logLevel >= warnIndex) {
      console.warn(this._constructMessage(Logger.logLevels[warnIndex], message));
    }
  };

  Logger.prototype.error = function (message) {
    var errorIndex = 0;

    console.error(this._constructMessage(Logger.logLevels[errorIndex], message));
  };

  return Logger;
};
