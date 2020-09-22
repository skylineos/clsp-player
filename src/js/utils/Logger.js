'use strict';

/* eslint no-console: off */

/**
 * This file needs to use `require` rather than `import` to be able to be used
 * by webpack.
 *
 * We use this in the router as well, so keep it light and ES5 only!
 */

module.exports = function (logLevel) {
  function Logger (prefix, prefixStyle) {
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
    this.prefixStyle = prefixStyle;
  }

  Logger.logLevels = [
    'error',
    'warn',
    'info',
    'debug',
    'silly',
  ];

  Logger.factory = function (prefix, prefixStyle) {
    return new Logger(prefix || '', prefixStyle);
  };

  Logger.prototype._constructMessage = function (type, message) {
    var logMessage = '(' + type + ')' + ' --> ' + message;

    // @see - https://developers.google.com/web/tools/chrome-devtools/console/console-write#string_substitution_and_formatting
    if (this.prefix && this.prefixStyle && this.logLevel > 1) {
      return [
        '%c' + this.prefix,
        this.prefixStyle,
        logMessage,
      ];
    }

    if (this.prefix) {
      return [
        this.prefix,
        logMessage,
      ];
    }

    return [
      logMessage,
    ];
  };

  Logger.prototype.silly = function (message) {
    var sillyIndex = 4;

    if (this.logLevel >= sillyIndex) {
      console.log.apply(console, this._constructMessage(Logger.logLevels[sillyIndex], message));
    }
  };

  Logger.prototype.debug = function (message) {
    var debugIndex = 3;

    if (this.logLevel >= debugIndex) {
      console.log.apply(console, this._constructMessage(Logger.logLevels[debugIndex], message));
    }
  };

  Logger.prototype.info = function (message) {
    var infoIndex = 2;

    if (this.logLevel >= infoIndex) {
      console.log.apply(console, this._constructMessage(Logger.logLevels[infoIndex], message));
    }
  };

  Logger.prototype.warn = function (message) {
    var warnIndex = 1;

    if (this.logLevel >= warnIndex) {
      console.warn.apply(console, this._constructMessage(Logger.logLevels[warnIndex], message));
    }
  };

  Logger.prototype.error = function (message) {
    var errorIndex = 0;

    console.error.apply(console, this._constructMessage(Logger.logLevels[errorIndex], message));
  };

  return Logger;
};
