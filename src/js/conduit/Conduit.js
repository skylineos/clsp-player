/**
 * The Conduit a hidden iframe that is used to establish a dedicated CLSP
 * websocket for a single video. This is basically an in-browser micro service
 * which uses cross-document communication to route data to and from the iframe.
 *
 * This code is a layer of abstraction on top of the CLSP router, and the
 * controller of the iframe that contains the router.
 */

import utils from '../utils/utils';
import RouterBaseManager from './RouterBaseManager';
import RouterTransactionManager from './RouterTransactionManager';
import RouterStreamManager from './RouterStreamManager';
import RouterConnectionManager from './RouterConnectionManager';
import iframeEventHandlers from './iframeEventHandlers';
import Logger from '../utils/Logger';
import StreamConfiguration from '../iov/StreamConfiguration';

const DEFAULT_ROUTER_CONNECTION_TIMEOUT = 120;
// Setting this to half of the default value to help with SFS memory
// management
const DEFAULT_ROUTER_KEEP_ALIVE_INTERVAL = 30;
// The number of seconds to wait for a "publish" message to be delivered
const DEFAULT_ROUTER_PUBLISH_TIMEOUT = utils.DEFAULT_STREAM_TIMEOUT;

export default class Conduit {
  static factory (
    logId,
    clientId,
    streamConfiguration,
    containerElement,
    onReconnect,
    onMessageError,
  ) {
    return new Conduit(
      logId,
      clientId,
      streamConfiguration,
      containerElement,
      onReconnect,
      onMessageError,
    );
  }

  /**
   * @private
   *
   * @param {String} logId
   *   a string that identifies this router in log messages
   * @param {String} clientId
   *   the guid to be used to construct the topic
   * @param {StreamConfiguration} streamConfiguration
   *   The stream configuration to pull from the CLSP server / SFS
   * @param {Element} containerElement
   *   The container of the video element and where the Conduit's iframe will be
   *   inserted
   * @param {Function} onReconnect
   *   The action to perform when a reconnection attempt is successful
   * @param {Function} onMessageError
   *   The action to perform when an error is encountered between the Router
   *   and Conduit instances
   */
  constructor (
    logId,
    clientId,
    streamConfiguration,
    containerElement,
    onReconnect = () => {},
    onMessageError = () => {},
  ) {
    if (!logId) {
      throw new Error('logId is required to construct a new Conduit instance.');
    }

    if (!clientId) {
      throw new Error('clientId is required to construct a new Conduit instance.');
    }

    if (!StreamConfiguration.isStreamConfiguration(streamConfiguration)) {
      throw new Error('invalid streamConfiguration passed to Conduit constructor');
    }

    if (!containerElement) {
      throw new Error('containerElement is required to construct a new Conduit instance');
    }

    if (typeof onReconnect !== 'function') {
      throw new Error('onReconnect must be a function to construct a new Conduit instance');
    }

    if (typeof onMessageError !== 'function') {
      throw new Error('onMessageError must be a function to construct a new Conduit instance');
    }

    this.logId = logId;
    this.clientId = clientId;
    this.streamConfiguration = streamConfiguration;
    this.containerElement = containerElement;
    this._onReconnect = onReconnect;
    this._onMessageError = onMessageError;

    this.logger = Logger().factory(`Conduit ${this.logId}`, 'color: orange;');
    this.logger.debug('Constructing...');

    this.isDestroyed = false;
    this.isInitialized = false;

    // These can be configured manually after construction
    this.ROUTER_CONNECTION_TIMEOUT = DEFAULT_ROUTER_CONNECTION_TIMEOUT;
    this.ROUTER_KEEP_ALIVE_INTERVAL = DEFAULT_ROUTER_KEEP_ALIVE_INTERVAL;
    this.ROUTER_PUBLISH_TIMEOUT = DEFAULT_ROUTER_PUBLISH_TIMEOUT;

    this.routerTransactionManager = RouterTransactionManager.factory(
      this.logId,
      this.clientId,
    );

    // This is how the RouterTransactionManager issues commands to the Router
    // via the iframe
    this.routerTransactionManager.events.on(RouterTransactionManager.events.COMMAND_ISSUED, (data) => {
      this._command({
        method: data.command,
        ...data.message,
      });
    });

    this.routerConnectionManager = RouterConnectionManager.factory(
      this.logId,
      this.clientId,
      this.routerTransactionManager,
    );

    // Allow the caller to react every time there is a reconnection event
    this.routerConnectionManager.events.on(RouterConnectionManager.events.DID_RECONNECT, () => {
      this._onReconnect();
    });

    this.routerStreamManager = RouterStreamManager.factory(
      this.logId,
      this.clientId,
      this.streamConfiguration,
      this.routerTransactionManager,
    );

    // Every time a video segment is used / shown, the stats must be updated
    this.routerStreamManager.events.on(RouterStreamManager.events.SEGMENT_USED, (data) => {
      this.routerConnectionManager.statsManager.updateByteCount(data.byteArray);
    });
  }

  /**
   * After constructing, call this to initialize the conduit, which will create
   * the iframe and the Router needed to get the stream from the server.
   *
   * @returns Promise
   *   Resolves when the Router has been successfully created.
   *   Rejects upon failure to create the Router.
   */
  initialize () {
    this.logger.debug('Initializing...');

    return new Promise((resolve, reject) => {
      this._onRouterCreate = (event) => {
        const clientId = event.data.clientId;

        // A window message was received that is not related to CLSP
        if (!clientId) {
          return;
        }

        // This message was intended for another Conduit instance
        if (this.clientId !== clientId) {
          return;
        }

        const eventType = event.data.event;

        // Filter out all other window messages from the Router
        if (
          eventType !== RouterBaseManager.routerEvents.CREATED &&
          eventType !== RouterBaseManager.routerEvents.CREATE_FAILURE
        ) {
          return;
        }

        this.logger.debug(`initialize "${eventType}" event`);

        // Whether success or failure, remove the event listener
        window.removeEventListener('message', this._onRouterCreate);

        // Once the event listener is removed, remove the listener handler,
        // since it will not be used again and to prevent the `destroy` method
        // from trying to unregister it.
        this._onRouterCreate = null;

        if (eventType === RouterBaseManager.routerEvents.CREATE_FAILURE) {
          return reject(event.data.reason);
        }

        this.isInitialized = true;

        resolve();
      };

      // When the Router in the iframe connects, it will broadcast a message
      // letting us know it connected, or letting us know it failed.
      window.addEventListener('message', this._onRouterCreate);

      this.iframe = this._generateIframe();

      // @todo - if the Iov were to create a wrapper around the video element
      // that it manages (rather than expecting one to already be there), each
      // video element and iframe could be contained in a single container,
      // rather than potentially having multiple video elements and multiple
      // iframes contained in a single parent.
      this.containerElement.appendChild(this.iframe);
    });
  }

  /**
   * Play the configured stream.
   *
   * @param {function} onMoof
   *   the function that will handle the moof
   *   @see RouterStreamManager.play
   *
   * @returns {object}
   *  - guid
   *  - mimeCodec
   *  - moov
   */
  async play (onMoof) {
    if (this.isDestroyed) {
      this.logger.info('Tried to play a stream from a destroyed Conduit');
      return;
    }

    if (!this.isInitialized) {
      this.logger.info('Tried to play a stream without first initializing the Conduit');
      return;
    }

    this.logger.info('Playing...');

    try {
      // The Router has to be connected before the stream can play
      await this.routerConnectionManager.connect();
    }
    catch (error) {
      this.logger.error('Error while trying to connect before playing:');
      this.logger.error(error);

      throw error;
    }

    try {
      const {
        guid,
        mimeCodec,
        moov,
      } = await this.routerStreamManager.play(onMoof);

      return {
        guid,
        mimeCodec,
        moov,
      };
    }
    catch (error) {
      this.logger.error(`Error trying to play stream ${this.routerStreamManager.streamName}`);

      // @todo - we could retry
      await this.stop();

      throw error;
    }
  }

  /**
   * @async
   *
   * Stop the playing stream.  Makes the necessary calls to the Router Manager
   * instances.
   *
   * @returns {void}
   */
  async stop () {
    this.logger.info('Stopping stream...');

    this.routerTransactionManager.halt();
    await this.routerStreamManager.stop();
    await this.routerConnectionManager.disconnect();
  }

  /**
   * @async
   *
   * Clean up and dereference the necessary properties.  Will also disconnect
   * and destroy the iframe.
   *
   * @returns {void}
   */
  async destroy () {
    this.logger.debug('Destroying...');

    if (this.isDestroyed) {
      return;
    }

    this.isDestroyed = true;

    if (this._onRouterCreate) {
      window.removeEventListener('message', this._onRouterCreate);
      this._onRouterCreate = null;
    }

    // order matters here
    await this.stop();
    await this.routerStreamManager.destroy();
    await this.routerConnectionManager.destroy();
    this.routerTransactionManager.destroy();

    this.routerStreamManager = null;
    this.routerConnectionManager = null;
    this.routerTransactionManager = null;

    this.clientId = null;
    // The caller must destroy the streamConfiguration
    this.streamConfiguration = null;
    this.containerElement = null;

    // The Router will be destroyed along with the iframe
    this.iframe.parentNode.removeChild(this.iframe);
    this.iframe.srcdoc = '';
    this.iframe = null;
    // Calling this doesn't seem to work...
    // this.iframe.remove();

    // @todo - can this be safely dereferenced?
    // this._onMessageError = null;
  }

  /**
   * When the Router sends a message back from its iframe, the Conduit
   * Collection handles it.  If the message was meant for this Conduit, the
   * Conduit Collection will call this method with the event data.
   *
   * @param {Object} event
   *   We expect event to have "data.event", which represents the event that
   *   occurred relative to the clsp stream.  "ready" means the stream is ready,
   *   "fail" means there was an error, "data" means a video segment / moof was
   *   sent.
   */
  onMessage (event) {
    const eventType = event.data.event;

    this.logger.debug(`Message received for "${eventType}" event`);

    try {
      switch (eventType) {
        // The events in the cases below are handled by RouterTransactionManager
        case RouterTransactionManager.routerEvents.UNSUBSCRIBE_SUCCESS:
        case RouterTransactionManager.routerEvents.UNSUBSCRIBE_FAILURE:
        case RouterTransactionManager.routerEvents.PUBLISH_SUCCESS:
        case RouterTransactionManager.routerEvents.PUBLISH_FAILURE: {
          this.routerTransactionManager.onMessage(eventType, event);
          break;
        }
        // The events in the cases below are handled by RouterConnectionManager
        case RouterConnectionManager.routerEvents.CONNECT_SUCCESS:
        case RouterConnectionManager.routerEvents.CONNECT_FAILURE:
        case RouterConnectionManager.routerEvents.DISCONNECT_SUCCESS:
        case RouterConnectionManager.routerEvents.DISCONNECT_FAILURE:
        case RouterConnectionManager.routerEvents.CONNECTION_LOST: {
          this.routerConnectionManager.onMessage(eventType, event);
          break;
        }
        // The events in the cases below are handled by RouterStreamManager
        case RouterStreamManager.routerEvents.DATA_RECEIVED: {
          this.routerStreamManager.onMessage(eventType, event);
          break;
        }
        // The events in the cases below are handled by the conduit
        case RouterBaseManager.routerEvents.CREATED:
        case RouterBaseManager.routerEvents.CREATE_FAILURE: {
          // these are handled in initialize
          break;
        }
        case RouterBaseManager.routerEvents.WINDOW_MESSAGE_FAIL: {
          // @todo - do we really need to disconnect? should we reconnect?
          this.routerConnectionManager.disconnect();
          break;
        }
        // Log the error, but don't throw
        default: {
          this.logger.error(`No match for event: ${eventType}`);
        }
      }
    }
    catch (error) {
      this.logger.debug('onMessageError');
      this.logger.error(error);

      this._onMessageError(error);
    }
  }

  /**
   * @private
   *
   * Generate an iframe with an embedded CLSP Router.  The Router will receive
   * commands from this Conduit via Router Manager command events.
   *
   * @returns Element
   */
  _generateIframe () {
    this.logger.debug('Generating Iframe...');

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

            // Configure the CLSP properties
            window.clspRouterConfig = {
              logId: '${this.logId}',
              clientId: '${this.clientId}',
              host: '${this.streamConfiguration.host}',
              port: ${this.streamConfiguration.port},
              useSSL: ${this.streamConfiguration.useSSL},
              CONNECTION_TIMEOUT: ${this.ROUTER_CONNECTION_TIMEOUT},
              KEEP_ALIVE_INTERVAL: ${this.ROUTER_KEEP_ALIVE_INTERVAL},
              PUBLISH_TIMEOUT: ${this.ROUTER_PUBLISH_TIMEOUT},
              Logger: (${Logger.toString()})(),
            };

            window.Router = ${RouterBaseManager.Router.toString()}(window.parent.Paho);
            window.iframeEventHandlers = ${iframeEventHandlers.toString()}();
          </script>
        </head>
        <body
          onload="window.router = window.iframeEventHandlers.onload(
            '${this.logId}',
            window.Router,
            window.clspRouterConfig
          );"
          onunload="window.iframeEventHandlers.onunload(
            '${this.logId}',
            window.router
          );"
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
   * Pass a Router command to the iframe.  Should only ever be invoked in
   * response to a Router Manager command event.
   *
   * @param {Object} message
   *   The message / event data to send with the command
   */
  _command (message) {
    this.logger.debug('Sending a message to the iframe...');

    // @todo - this MUST be temporary - it is hiding the error resulting from
    // improper async logic handling!
    if (this.isDestroyed) {
      console.warn('Cannot send message via destroyed iframe');
      return;
    }

    try {
      // @todo - we should not be dispatching to '*' - we should provide the SFS
      // host here instead
      // @see - https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage
      this.iframe.contentWindow.postMessage(message, '*');
    }
    catch (error) {
      // @todo - we should probably throw here...
      // eslint-disable-next-line no-console
      console.error(error);
    }
  }
}
