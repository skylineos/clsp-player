'use strict';

/* eslint no-console: off */

/**
 * This file needs to use `require` rather than `import` to be able to be used
 * by webpack.
 *
 * We use this in the router as well, so keep it light and ES5 only!
 */

module.exports = function (version, logLevel, disableLogging) {
  function Logger (prefix, prefixStyle) {
    if (logLevel === undefined && typeof window !== 'undefined') {
      var storedVersion = window.localStorage.getItem('skylineos.clsp-player.version');

      // Always reset the log level when the version changes
      if (storedVersion !== version) {
        window.localStorage.setItem('skylineos.clsp-player.logLevel', 0);
        window.localStorage.setItem('skylineos.clsp-player.version', version);
      }

      var storedLogLevel = Number(window.localStorage.getItem('skylineos.clsp-player.logLevel'));

      // The logLevel may be set in localstorage
      // e.g. localStorage.setItem('skylineos.clsp-player.logLevel', 3), then refresh
      logLevel = isNaN(storedLogLevel) || storedLogLevel < 0
        ? 0
        : storedLogLevel;

      window.localStorage.setItem('skylineos.clsp-player.logLevel', logLevel);
    }

    this.logLevel = logLevel;
    this.prefix = prefix;
    this.prefixStyle = prefixStyle;
  }

  Logger.logLevels = [
    'critical',
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

  var sillyIndex = 5;
  var debugIndex = 4;
  var infoIndex = 3;
  var warnIndex = 2;
  var errorIndex = 1;
  var criticalIndex = 0;

  Logger.prototype.silly = function (message) {
    if (this.logLevel < sillyIndex || disableLogging) {
      return;
    }

    console.log.apply(console, this._constructMessage(Logger.logLevels[sillyIndex], message));
  };

  Logger.prototype.debug = function (message) {
    if (this.logLevel < debugIndex || disableLogging) {
      return;
    }

    console.log.apply(console, this._constructMessage(Logger.logLevels[debugIndex], message));
  };

  Logger.prototype.info = function (message) {
    if (this.logLevel < infoIndex || disableLogging) {
      return;
    }

    console.log.apply(console, this._constructMessage(Logger.logLevels[infoIndex], message));
  };

  Logger.prototype.warn = function (message) {
    if (this.logLevel < warnIndex || disableLogging) {
      return;
    }

    console.warn.apply(console, this._constructMessage(Logger.logLevels[warnIndex], message));
  };

  Logger.prototype.error = function (message) {
    if (this.logLevel < errorIndex || disableLogging) {
      return;
    }

    console.error.apply(console, this._constructMessage(Logger.logLevels[errorIndex], message));
  };

  Logger.prototype.critical = function (message) {
    if (disableLogging) {
      return;
    }

    console.error.apply(console, this._constructMessage(Logger.logLevels[criticalIndex], message));
  };

  return Logger;
};
