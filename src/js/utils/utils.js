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

/**
 * Determine whether or not the CLSP Player is supported in the current browser.
 *
 * @todo - we are currently manually checking useragentstring - we should find a
 *   library that can check browser type for us
 *
 * @returns {Boolean}
 *   `true` if the browser is supported by CLSP Player
 *   `false` if the browser is not supported by CLSP Player
 */
function isBrowserCompatable () {
  // @todo - at one time, this was needed for browsers on MacOS - is this still
  // necessary?
  window.MediaSource = window.MediaSource || window.WebKitMediaSource;

  if (!window.MediaSource) {
    console.error('Media Source Extensions not supported in your browser, unable to load CLSP Player');
    return false;
  }

  const isInternetExplorer = navigator.userAgent.toLowerCase().indexOf('trident') > -1;

  if (isInternetExplorer) {
    logger.debug('Detected Internet Explorer browser, which is not supported.');
    return false;
  }

  const isEdge = navigator.userAgent.toLowerCase().indexOf('edge') > -1;

  if (isEdge) {
    logger.debug('Detected older Edge browser, which is not supported');
    return false;
  }

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
    logger.error('Unable to detect Chrome version');
    logger.error(error);

    return false;
  }
}

/**
 * Check to see if the passed mimeType is supported by CLSP Player.
 *
 * @param {String} mimeType
 *   Will check to see if this mimeType is supported
 *
 * @returns {Boolean}
 *   `true` if the mimeType is supported by CLSP Player
 *   `false` if the mimeType is not supported by CLSP Player
 */
function isSupportedMimeType (mimeType) {
  return mimeType === SUPPORTED_MIME_TYPE;
}

/**
 * @typedef {Object} PageVisibilityApiPropertyNames
 * @property {String} hiddenStateName
 *   The property name used for the `document.hidden` property
 * @property {String} visibilityChangeEventName
 *   The property name used for the `document.visibilityChange` event name
 */

/**
 * Get the property names used by this browser for the Page Visibility API.
 *
 * @returns {PageVisibilityApiPropertyNames}
 */
function getWindowStateNames () {
  logger.debug('Determining Page_Visibility_API property names.');

  // @see - https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API
  if (typeof document.hidden !== 'undefined') {
    logger.debug('Using standard Page_Visibility_API property names.');
    return {
      hiddenStateName: 'hidden',
      visibilityChangeEventName: 'visibilitychange',
    };
  }

  // @todo - do we need this since we don't support IE or old Edge?
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

/**
 * Get the default port number for the given protocol.
 *
 * @param {String} protocol
 *   The protocol to get the default port for.  Must be a known protocol (e.g.
 *   `clsp` or `clsps`)
 */
function getDefaultStreamPort (protocol) {
  return streamPorts[protocol];
}

/**
 * Set the default port number for the given protocol.
 *
 * @param {String} protocol
 *   The protocol to set the default port for.  Must be a known protocol (e.g.
 *   `clsp` or `clsps`)
 */
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
  isSupportedMimeType,
  windowStateNames: getWindowStateNames(),
  getDefaultStreamPort,
  setDefaultStreamPort,
};
