/**
 * The Conduit a hidden iframe that is used to establish a dedicated CLSP
 * websocket for a single video. This is basically an in-browser micro service
 * which uses cross-document communication to route data to and from the iframe.
 *
 * This code is a layer of abstraction on top of the CLSP router, and the
 * controller of the iframe that contains the router.
 */
import EventEmitter from 'eventemitter3';
import {
  timeout as PromiseTimeout,
} from 'promise-timeout';

import utils from '../utils/utils';
import RouterBaseManager from '../Router/RouterBaseManager';
import RouterTransactionManager from '../Router/RouterTransactionManager';
import RouterStreamManager from '../Router/RouterStreamManager';
import RouterConnectionManager from '../Router/RouterConnectionManager';
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
  /**
   * @static
   *
   * The events that this RouterStatsManager will emit.
   */
  static events = {
    ON_MESSAGE_ERROR: 'onMessage-error',
    IFRAME_DESTROYED_EXTERNALLY: 'iframe-destroyed-externally',
    RECONNECT_SUCCESS: RouterConnectionManager.events.RECONNECT_SUCCESS,
    RECONNECT_FAILURE: RouterConnectionManager.events.RECONNECT_FAILURE,
    RESYNC_STREAM_COMPLETE: RouterStreamManager.events.RESYNC_STREAM_COMPLETE,
  }

  /**
   * @static
   *
   * The events that the Router will broadcast via Window Messages
   */
  static routerEvents = RouterBaseManager.routerEvents;

  static factory (
    logId,
    clientId,
    streamConfiguration,
    containerElement,
  ) {
    return new Conduit(
      logId,
      clientId,
      streamConfiguration,
      containerElement,
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
   */
  constructor (
    logId,
    clientId,
    streamConfiguration,
    containerElement,
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

    this.logId = logId;
    this.clientId = clientId;
    this.streamConfiguration = streamConfiguration;
    this.containerElement = containerElement;

    this.logger = Logger().factory(`Conduit ${this.logId}`, 'color: orange;');
    this.logger.debug('Constructing...');

    this.events = new EventEmitter();

    this.isInitialized = false;
    this.isDestroyed = false;
    this.isDestroyComplete = false;

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
    this.routerConnectionManager.events.on(RouterConnectionManager.events.RECONNECT_SUCCESS, () => {
      this.events.emit(Conduit.events.RECONNECT_SUCCESS);
    });
    this.routerConnectionManager.events.on(RouterConnectionManager.events.RECONNECT_FAILURE, (data) => {
      this.events.emit(Conduit.events.RECONNECT_FAILURE, data);
    });

    this.routerStreamManager = RouterStreamManager.factory(
      this.logId,
      this.clientId,
      this.streamConfiguration,
      this.routerTransactionManager,
    );

    this.routerStreamManager.events.on(RouterStreamManager.events.RESYNC_STREAM_COMPLETE, () => {
      this.events.emit(Conduit.events.RESYNC_STREAM_COMPLETE);
    });
  }

  /**
   * @async
   *
   * After constructing, call this to initialize the conduit, which will create
   * the iframe and the Router needed to get the stream from the server.
   *
   * @returns Promise
   *   Resolves when the Router has been successfully created.
   *   Rejects upon failure to create the Router.
   */
  async initialize () {
    if (this.isInitialized) {
      this.logger.warn('Conduit already initialized...');
      return;
    }

    this.logger.debug('Initializing...');

    try {
      await PromiseTimeout(this._initialize(), 2 * 1000);

      this.logger.info('Router created successfully');

      this.isInitialized = true;
    }
    catch (error) {
      this.logger.error('Failed to create the Iframe/Router!');
      this.logger.error(error);
    }
  }

  _initialize () {
    return new Promise((resolve, reject) => {
      this._onRouterCreate = (error) => {
        if (error) {
          return reject(error);
        }

        resolve();
      };

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

    try {
      await this.routerStreamManager.stop();
    }
    catch (error) {
      if (!this.iframe.contentWindow) {
        // In the normal course of operation, sometimes other libraries or
        // implementations will delete the iframe or a parent component
        // rather than letting the CLSP Player manage it.  In this instance,
        // we recognize that this happened, but do not show nor throw an error.
        this.logger.info('Iframe destroyed externally!');
        this.events.emit(Conduit.events.IFRAME_DESTROYED_EXTERNALLY);
      }
      else {
        this.logger.error('Error while stopping while destroying');
        this.logger.error(error);
      }
    }

    try {
      await this.routerConnectionManager.disconnect();
    }
    catch (error) {
      if (!this.iframe.contentWindow) {
        // In the normal course of operation, sometimes other libraries or
        // implementations will delete the iframe or a parent component
        // rather than letting the CLSP Player manage it.  In this instance,
        // we recognize that this happened, but do not show nor throw an error.
        this.logger.info('Iframe destroyed externally!');
        this.events.emit(Conduit.events.IFRAME_DESTROYED_EXTERNALLY);
      }
      else {
        this.logger.error('Error while stopping while destroying');
        this.logger.error(error);
      }
    }
  }

  /**
   * To be called when a segment (moof) is shown (appended to the MSE buffer).
   *
   * In practical terms, this is meant to be called when the moof is appended
   * to the MSE SourceBuffer.  This method is meant to update stats.
   *
   * @param {Array} byteArray
   *   The raw segment / moof
   */
  segmentUsed (byteArray) {
    // @todo - this is never used, but existed in the original implementation
    // Used for determining the size of the internal buffer hidden from the MSE
    // api by recording the size and time of each chunk of video upon buffer
    // append and recording the time when the updateend event is called.
    if ((this.shouldLogSourceBuffer) && (this.logSourceBufferTopic !== null)) {
      this.routerTransactionManager.directSend(this.logSourceBufferTopic, byteArray);
    }

    this.routerConnectionManager.statsManager.updateByteCount(byteArray);
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
  onRouterEvent (eventType, event) {
    this.logger.debug(`Message received for "${eventType}" event`);

    try {
      switch (eventType) {
        case Conduit.routerEvents.CREATE_SUCCESS: {
          this._onRouterCreate();
          break;
        }
        case Conduit.routerEvents.CREATE_FAILURE: {
          this._onRouterCreate(new Error(event.data.reason));
          break;
        }
        case Conduit.routerEvents.CONNECT_SUCCESS:
        case Conduit.routerEvents.CONNECT_FAILURE:
        case Conduit.routerEvents.DISCONNECT_SUCCESS:
        case Conduit.routerEvents.DISCONNECT_FAILURE:
        case Conduit.routerEvents.CONNECTION_LOST: {
          this.routerConnectionManager.onMessage(eventType, event);
          break;
        }
        case Conduit.routerEvents.UNSUBSCRIBE_SUCCESS: {
          const topic = event.data.topic;

          if (!this.routerTransactionManager.hasUnsubscribeHandler(topic)) {
            this.logger.warn(`No handler for topic "${topic}" for unsubscribe event "${eventType}"`);
            return;
          }

          this.routerTransactionManager.unsubscribeHandlers[topic].onSuccess(event);

          break;
        }
        case Conduit.routerEvents.UNSUBSCRIBE_FAILURE: {
          const topic = event.data.topic;

          if (!this.routerTransactionManager.hasUnsubscribeHandler(topic)) {
            this.logger.warn(`No handler for topic "${topic}" for unsubscribe event "${eventType}"`);
            return;
          }

          this.routerTransactionManager.unsubscribeHandlers[topic].onFailure(event);

          break;
        }
        case Conduit.routerEvents.PUBLISH_SUCCESS: {
          const publishId = event.data.publishId;

          if (!this.routerTransactionManager.hasPublishHandler(publishId)) {
            this.logger.warn(`No handler for publishId "${publishId}" for publish event "${eventType}"`);
            return;
          }

          this.routerTransactionManager.publishHandlers[publishId].onSuccess(event);

          break;
        }
        case Conduit.routerEvents.PUBLISH_FAILURE: {
          const publishId = event.data.publishId;

          if (!this.routerTransactionManager.hasPublishHandler(publishId)) {
            this.logger.warn(`No handler for publishId "${publishId}" for publish event "${eventType}"`);
            return;
          }

          this.routerTransactionManager.publishHandlers[publishId].onFailure(event);

          break;
        }
        case Conduit.routerEvents.MESSAGE_ARRIVED: {
          const message = event.data;
          const topic = message.destinationName;

          if (!this.routerTransactionManager.hasSubscribeHandler(topic)) {
            this.logger.warn(`No handler for subscribe topic "${topic}" for message event "${eventType}"`);
            return;
          }

          this.routerTransactionManager.subscribeHandlers[topic](message, event);

          break;
        }
        case Conduit.routerEvents.WINDOW_MESSAGE_FAIL: {
          // @todo - is disconnecting really the best response to this event?
          // we could broadcast or reconnect or something...
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
      this.logger.error('onMessageError');
      this.logger.error(error);

      this.events.emit(Conduit.events.ON_MESSAGE_ERROR, {
        error,
      });
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
            '${this.clientId}',
            window.Router,
            window.clspRouterConfig
          );"
          onunload="window.iframeEventHandlers.onunload(
            '${this.logId}',
            '${this.clientId}',
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

    if (this.isDestroyComplete) {
      this.logger.warn('Cannot send message via destroyed iframe', message);
      return;
    }

    if (!this.iframe.contentWindow) {
      // In the normal course of operation, sometimes other libraries or
      // implementations will delete the iframe or a parent component
      // rather than letting the CLSP Player manage it.  In this instance,
      // we recognize that this happened, but do not show nor throw an error.
      this.logger.info('Iframe destroyed externally!');
      this.events.emit(Conduit.events.IFRAME_DESTROYED_EXTERNALLY);
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

    // order matters here
    try {
      await this.stop();
    }
    catch (error) {
      this.logger.error('Error while stopping while destroying');
      this.logger.error(error);
    }

    try {
      await this.routerStreamManager.destroy();
    }
    catch (error) {
      this.logger.error('Error while destroying routerStreamManager while destroying');
      this.logger.error(error);
    }

    try {
      await this.routerConnectionManager.destroy();
    }
    catch (error) {
      this.logger.error('Error while destroying routerConnectionManager while destroying');
      this.logger.error(error);
    }

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

    this.isDestroyComplete = true;

    this.events.removeAllListeners();
    this.events = null;

    this.isDestroyComplete = true;

    this.logger.info('destroy complete');
  }
}
