'use strict';

/**
 * This file needs to use `require` rather than `import` to be able to be used
 * by webpack.
 */

const packageJson = require('../../../package.json');

const Logger = require('./logger');

// @todo - remove this side-effect
const logger = Logger().factory();

// CLSP default port for SFS >= 5.2.0 is 80
// CLSP default port for SFS < 5.2.0 is 9001
const DEFAULT_CLSP_PORT = 80;
const DEFAULT_CLSPS_PORT = 443;

// Locally-scoped value that maintains the clsp and clsps port states.
//
// @see - getDefaultStreamPort
// @see - setDefaultStreamPort
//
// @todo - state / config could be managed better than this
const streamPorts = {
  clsp: DEFAULT_CLSP_PORT,
  clsps: DEFAULT_CLSPS_PORT,
};

/**
 * The name of the CLSP Player library as defined in `package.json` without the
 * group name.
 *
 * @type {String}
 */
const name = packageJson.name.split('/').pop();

/**
 * The version of the CLSP Player library.  Follows semver.
 *
 * @type {String}
 */
const version = packageJson.version;

/**
 * The oldest Chrome browser version supported by CLSP Player.
 *
 * @type {Number}
 */
const MINIMUM_CHROME_VERSION = 53;

/**
 * The MIME type required for CLSP Player to be able to play the stream.
 *
 * @todo - this mime type, though used in the videojs plugin, and
 * seemingly enforced, is not actually enforced.  The only enforcement
 * done is requiring the user provide this string on the video element
 * in the DOM.  The codecs that are supplied by the SFS's vary.  Here
 * are some "valid", though not enforced mimeCodec values I have come
 * across:
 * - video/mp4; codecs="avc1.4DE016"
 * - video/mp4; codecs="avc1.42E00C"
 * - video/mp4; codecs="avc1.42E00D"
 *
 * @type {String}
 */
const SUPPORTED_MIME_TYPE = "video/mp4; codecs='avc1.42E01E'";

/**
 * The amount of time (in seconds) before a stream times out.
 *
 * Note that this timeout value should be treated as the minimum value to
 * support Vero tours and high-quality streams.
 *
 * @type {Number}
 */
const DEFAULT_STREAM_TIMEOUT = 20;


function isBrowserCompatable () {
  try {
    mediaSourceExtensionsCheck();
  }
  catch (error) {
    logger.error(error);

    return false;
  }

  // We don't support Internet Explorer
  const isInternetExplorer = navigator.userAgent.toLowerCase().indexOf('trident') > -1;

  if (isInternetExplorer) {
    logger.debug('Detected Internet Explorer browser');
    return false;
  }

  // We don't support Edge (yet)
  const isEdge = navigator.userAgent.toLowerCase().indexOf('edge') > -1;

  if (isEdge) {
    logger.debug('Detected Edge browser');
    return false;
  }

  // We support a limited number of streams in Firefox
  // no specific version of firefox required for now.
  const isFirefox = navigator.userAgent.toLowerCase().indexOf('firefox') > -1;

  if (isFirefox) {
    logger.debug('Detected Firefox browser');
    return true;
  }

  // Most browsers have "Chrome" in their user agent.  The above filters rule
  // out Internet Explorer and Edge, so we are going to assume that if we're at
  // this point, we're really dealing with Chrome.
  const isChrome = Boolean(window.chrome);

  if (!isChrome) {
    return false;
  }

  try {
    // Rather than accounting for match returning null, we'll catch the error
    const chromeVersion = parseInt(navigator.userAgent.match(/Chrom(e|ium)\/([0-9]+)\./)[2], 10);

    logger.debug(`Detected Chrome version ${chromeVersion}`);

    return chromeVersion >= MINIMUM_CHROME_VERSION;
  }
  catch (error) {
    logger.error(error);

    return false;
  }
}

function mediaSourceExtensionsCheck () {
  // For the MAC
  window.MediaSource = window.MediaSource || window.WebKitMediaSource;

  if (!window.MediaSource) {
    throw new Error('Media Source Extensions not supported in your browser: Claris Live Streaming will not work!');
  }
}

function isSupportedMimeType (mimeType) {
  return mimeType === SUPPORTED_MIME_TYPE;
}

function _getWindowStateNames () {
  logger.debug('Determining Page_Visibility_API property names.');

  if (typeof document === 'undefined') {
    return {};
  }

  // @see - https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API
  if (typeof document.hidden !== 'undefined') {
    logger.debug('Using standard Page_Visibility_API property names.');
    return {
      hiddenStateName: 'hidden',
      visibilityChangeEventName: 'visibilitychange',
    };
  }

  if (typeof document.msHidden !== 'undefined') {
    logger.debug('Using Microsoft Page_Visibility_API property names.');
    return {
      hiddenStateName: 'msHidden',
      visibilityChangeEventName: 'msvisibilitychange',
    };
  }

  if (typeof document.webkitHidden !== 'undefined') {
    logger.debug('Using Webkit Page_Visibility_API property names.');
    return {
      hiddenStateName: 'webkitHidden',
      visibilityChangeEventName: 'webkitvisibilitychange',
    };
  }

  logger.error('Unable to use the page visibility api - switching tabs and minimizing the page may result in slow downs and page crashes.');

  return {
    hiddenStateName: '',
    visibilityChangeEventName: '',
  };
}

function getDefaultStreamPort (protocol) {
  return streamPorts[protocol];
}

function setDefaultStreamPort (protocol, port) {
  streamPorts[protocol] = port;
}

module.exports = {
  name,
  version,
  MINIMUM_CHROME_VERSION,
  SUPPORTED_MIME_TYPE,
  DEFAULT_STREAM_TIMEOUT,
  supported: isBrowserCompatable,
  mediaSourceExtensionsCheck,
  isSupportedMimeType,
  windowStateNames: _getWindowStateNames(),
  getDefaultStreamPort,
  setDefaultStreamPort,
};
