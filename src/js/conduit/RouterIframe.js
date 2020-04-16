/**
 * Controller for the iframe that contains the Router.  The Router should never
 * be dealth with directly.  Any caller (e.g. Conduit) should use this.
 */

import Paho from 'paho-mqtt';

import utils from '../utils/utils';
import Logger from '../utils/logger';
import Router from './Router';
import StreamConfiguration from '../iov/StreamConfiguration';
import RouterController from './RouterController';

// Even though the export of paho-mqtt is { Client, Message }, there is an
// internal reference that the library makes to itself, and it expects
// itself to exist at Paho.MQTT.
window.Paho = {
  MQTT: Paho,
};

const DEFAULT_CONNECTION_TIMEOUT = 120;
// Setting this to half of the default value to help with SFS memory
// management
const DEFAULT_KEEP_ALIVE_INTERVAL = 30;
// The number of seconds to wait for a "publish" message to be delivered
const DEFAULT_PUBLISH_TIMEOUT = utils.DEFAULT_STREAM_TIMEOUT;

export default class RouterIframe {
  static routerEvents = Router().events;

  /**
   * @param {string} logId
   *   A string that associates this instance with an iov in log messages
   * @param {string} clientId
   *   The guid to be used to construct the topic
   * @param {Object} streamConfiguration
   *   The object representation of the StreamConfiguration instance of the
   *   stream that is to be played
   * @param {HTMLElement} parentElement
   *   The element that will have the iframe appended to it
   * @param {Object} options
   *   Additional configuration options
   *
   * @returns {RouterIframe}
   */
  static factory (
    logId,
    clientId,
    streamConfiguration,
    parentElement,
    onReconnect,
    options = {},
  ) {
    if (!logId) {
      throw new Error('`logId` is required to construct a RouterIframe');
    }

    if (!clientId) {
      throw new Error('`logId` is required to construct a RouterIframe');
    }

    if (!StreamConfiguration.isStreamConfiguration(streamConfiguration)) {
      throw new Error('`streamConfiguration` must be a valid StreamConfiguration instance');
    }

    if (!parentElement) {
      throw new Error('`parentElement` is required to construct a RouterIframe');
    }

    if (!options) {
      throw new Error('`options` is required to construct a RouterIframe');
    }

    options.CONNECTION_TIMEOUT = options.CONNECTION_TIMEOUT ?? DEFAULT_CONNECTION_TIMEOUT;
    options.KEEP_ALIVE_INTERVAL = options.KEEP_ALIVE_INTERVAL ?? DEFAULT_KEEP_ALIVE_INTERVAL;
    options.PUBLISH_TIMEOUT = options.PUBLISH_TIMEOUT ?? DEFAULT_PUBLISH_TIMEOUT;

    return new RouterIframe(
      logId,
      clientId,
      streamConfiguration,
      onReconnect,
      options,
    );
  }

  /**
   * @private
   *
   * The event handler for the iframe's body.onload event.  Constructs the
   * Router.
   *
   * Since this is injected into the iframe, keep it light and ES5.
   *
   * @param {string} logId
   *   A string that associates this instance with an iov in log messages
   * @param {string} clientId
   *   The guid to be used to construct the topic
   * @param {Object} streamConfiguration
   *   The object representation of the StreamConfiguration instance of the
   *   stream that is to be played
   * @param {Object} options
   *   Additional configuration options
   * @param {Logger} Logger
   *   The logger for the iframe (not the Router) - only used to log the
   *   onload events
   * @param {Router} Router
   *   The Router class
   *
   * @returns {void}
   */
  static onloadHandler (
    Logger,
    Router,
    logId,
    clientId,
    streamConfiguration,
    options,
  ) {
    // @todo - should these window defaults be removed, forcing the caller to
    // always pass the params?
    Logger = Logger || window.Logger;
    Router = Router || window.Router;
    logId = logId || window.logId;
    clientId = clientId || window.clientId;
    streamConfiguration = streamConfiguration || window.streamConfiguration;
    options = options || window.options;

    if (!Logger) {
      console.error('`Logger` is required in onload for Router iframe!');
      return;
    }

    if (!logId) {
      console.error('`logId` is required in onload for Router iframe!');
      return;
    }

    var logger = Logger().factory('RouterIframe.onload ' + logId);

    try {
      if (!Router) {
        throw new Error('`Router` is required in onload for Router iframe!');
      }

      if (!clientId) {
        throw new Error('`clientId` is required in onload for Router iframe!');
      }

      if (!streamConfiguration) {
        throw new Error('`streamConfiguration` is required in onload for Router iframe!');
      }

      if (!options) {
        throw new Error('`options` is required in onload for Router iframe!');
      }

      logger.info('Router being created...');

      var createListener = window.addEventListener('message', function (event) {
        try {
          var clientId = event.data.clientId;

          // A window message was received that is not related to CLSP
          if (!clientId) {
            return;
          }

          // This message was intended for another Conduit instance
          if (this.clientId !== clientId) {
            return;
          }

          var eventType = event.data.event;

          // @todo - use RouterController.events.CREATE
          // We only care about the CREATE message
          if (eventType !== 'create') {
            return;
          }

          window.router = Router.factory(
            logId,
            clientId,
            streamConfiguration,
            options,
          );

          logger.info('Router created');
        }
        catch (error) {
          logger.error(error);
        }
        finally {
          window.removeEventListener('message', createListener);
          createListener = null;
        }
      }, false);
    }
    catch (error) {
      logger.error(error);
    }
  }

  /**
   * @private
   *
   * The event handler for the iframe's body.onunload event.  Destroys the
   * Router.
   *
   * Since this is injected into the iframe, keep it light and ES5.
   *
   * @param {Logger} Logger
   *   The logger for the iframe (not the Router) - only used to log the
   *   onunload events
   * @param {string} logId
   *   A string that associates this instance with an iov in log messages
   * @param {Router} router
   *   The Router instance
   *
   * @returns {void}
   */
  static onunloadHandler (
    Logger,
    logId,
    router,
  ) {
    // @todo - should these window defaults be removed, forcing the caller to
    // always pass the params?
    Logger = Logger || window.Logger;
    logId = logId || window.logId;
    router = router || window.router;

    if (!Logger) {
      console.error('`Logger` is required in onload for Router iframe!');
      return;
    }

    if (!logId) {
      console.error('`logId` is required in onload for Router iframe!');
      return;
    }

    var logger = Logger().factory('RouterIframe.onunload ' + logId);

    try {
      if (!router) {
        logger.info('');
        return;
      }

      logger.info('Router being destroyed...');
      router.destroy();
      logger.info('Router destroyed');
    }
    catch (error) {
      logger.error(error);
    }
  }

  /**
   * @private
   *
   * @param {string} logId
   *   A string that associates this instance with an iov in log messages
   * @param {string} clientId
   *   The guid to be used to construct the topic
   * @param {Object} streamConfiguration
   *   The object representation of the StreamConfiguration instance of the
   *   stream that is to be played
   * @param {HTMLElement} parentElement
   *   The element that will have the iframe appended to it
   * @param {Object} options
   *   Additional configuration options
   *
   * @returns {RouterIframe}
   */
  constructor (
    logId,
    clientId,
    streamConfiguration,
    parentElement,
    onReconnect,
    options,
  ) {
    this.logger = Logger().factory(`RouterIframe ${this.logId}`);
    this.logger.debug('Constructing...');

    this.destroyed = false;

    this.logId = logId;
    this.clientId = clientId;
    this.streamConfiguration = streamConfiguration;
    this.parentElement = parentElement;
    this.options = options;

    this.iframe = this.generateIframeElement();
    this.routerController = RouterController.factory(
      this.logId,
      this.clientId,
      this.iframe,
      onReconnect,
    );

    this.attach();
  }

  /**
   * @private
   *
   * Generate an iframe with an embedded CLSP Router.  To be used by a Conduit
   * instance to communicate with the CLSP Server (SFS).
   *
   * @todo - add a window.onerror
   * @see - https://developer.mozilla.org/en-US/docs/Web/API/GlobalEventHandlers/onerror
   *
   * @returns {Element}
   */
  generateIframeElement () {
    if (this.destroyed) {
      return;
    }

    if (this.iframe) {
      throw new Error('iframe has already been generated');
    }

    this.logger.debug('Generating Iframe Element on the `document`...');

    const iframe = document.createElement('iframe');

    iframe.setAttribute('id', this.clientId);

    // This iframe should be invisible
    iframe.width = 0;
    iframe.height = 0;
    iframe.setAttribute('style', 'display:none;');

    iframe.srcdoc = `
      <html>
        <head>
          <script type="text/javascript">
            window.parentWindowMessages = ${JSON.stringify(RouterIframe.windowMessages)};

            window.Logger = ${Logger.toString()};
            window.Router = ${Router().toString()};

            window.logId = '${this.logId}';
            window.clientId = '${this.clientId}';
            window.streamConfiguration = ${JSON.stringify(this.streamConfiguration.toObject())};
            window.options = ${JSON.stringify(this.options)};
          </script>
        </head>
        <body
          onload="${RouterIframe.onloadHandler.toString()}();"
          onunload="${RouterIframe.onunloadHandler.toString()}();"
        >
          <div id="message"></div>
        </body>
      </html>
    `;

    return iframe;
  }

  /**
   * @private
   *
   * Insert the iframe into the DOM in the passed element.
   *
   * @returns {void}
   */
  attach () {
    if (this.destroyed) {
      return;
    }

    this.logger.debug('Attaching the iframe to the DOM...');

    if (!this.iframe) {
      throw new Error('the iframe must be generated before it can be attached');
    }

    // @todo - if the Iov were to create a wrapper around the video element
    // that it manages (rather than expecting one to already be there), each
    // video element and iframe could be contained in a single container,
    // rather than potentially having multiple video elements and multiple
    // iframes contained in a single parent.
    this.parentElement.appendChild(this.iframe);
  }

  async initialize () {
    await this.routerController.initialize();
  }


  connect () {
  }

  disconnect () {
  }

  subscribe (topic) {
    this.sendMessage({
      method: Router.methods.SUBSCRIBE,
      topic,
    });
  }

  unsubscribe (topic) {
    this.sendMessage({
      method: Router.methods.UNSUBSCRIBE,
      topic,
    });
  }

  publish (publishId, topic, data) {
    this.sendMessage({
      method: Router.methods.PUBLISH,
      publishId,
      topic,
      data,
    });
  }

  send (topic, byteArray) {
    this._command({
      method: Router.methods.SEND,
      topic,
      byteArray,
    });
  }

  /**
   * Destroy this instance, including dereferencing properties.
   *
   * @returns {void}
   */
  destroy () {
    if (this.destroyed) {
      this.logger.debug('Already destroyed...');
      return;
    }

    this.logger.debug('Destroying...');

    this.destroyed = true;

    // @todo - is this an asynchronous operation?
    // The Router will be destroyed along with the iframe
    this.iframe.parentNode.removeChild(this.iframe);
    // @todo - documentation for why this works vs. iframe.remove()
    this.iframe.srcdoc = '';
    this.iframe = null;

    this.streamConfiguration = null;
    this.options = null;
  }
}
