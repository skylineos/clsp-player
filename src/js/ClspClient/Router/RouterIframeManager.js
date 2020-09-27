import {
  timeout as PromiseTimeout,
} from 'promise-timeout';

import Logger from '../../utils/Logger';
import utils from '../../utils/utils';

import RouterBaseManager from './RouterBaseManager';
import Router from './Router';
import iframeEventHandlers from './iframeEventHandlers';
import StreamConfiguration from '../../iov/StreamConfiguration';

const DEFAULT_ROUTER_CONNECTION_TIMEOUT = 120;
// Setting this to half of the default value to help with SFS memory
// management
const DEFAULT_ROUTER_KEEP_ALIVE_INTERVAL = 30;
// The number of seconds to wait for a "publish" message to be delivered
const DEFAULT_ROUTER_PUBLISH_TIMEOUT = utils.DEFAULT_STREAM_TIMEOUT;

export default class RouterIframeManager extends RouterBaseManager {
  /**
   * @static
   *
   * The events that this RouterStatsManager will emit.
   */
  static events = {
    IFRAME_DESTROYED_EXTERNALLY: 'iframe-destroyed-externally',
  }

  /**
   * @static
   *
   * The Router events that this Router Manager is responsible for
   */
  static routerEvents = {
    CREATE_SUCCESS: RouterBaseManager.routerEvents.CREATE_SUCCESS,
    CREATE_FAILURE: RouterBaseManager.routerEvents.CREATE_FAILURE,
  };

  static factory (
    logId,
    clientId,
    streamConfiguration,
    containerElement,
  ) {
    return new RouterIframeManager(
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
   *   The container of the video element and where the iframe will be inserted
   */
  constructor (
    logId,
    clientId,
    streamConfiguration,
    containerElement,
  ) {
    super(
      logId,
      clientId,
    );

    if (!StreamConfiguration.isStreamConfiguration(streamConfiguration)) {
      throw new Error('invalid streamConfiguration passed to Router Iframe Manager constructor');
    }

    if (!containerElement) {
      throw new Error('containerElement is required to construct a new Router Iframe Manager instance');
    }

    // Passed state
    this.streamConfiguration = streamConfiguration;
    this.containerElement = containerElement;

    // Managed state
    this.iframe = null;

    // State flags
    this.isCreated = false;

    // These can be configured manually after construction
    this.ROUTER_CONNECTION_TIMEOUT = DEFAULT_ROUTER_CONNECTION_TIMEOUT;
    this.ROUTER_KEEP_ALIVE_INTERVAL = DEFAULT_ROUTER_KEEP_ALIVE_INTERVAL;
    this.ROUTER_PUBLISH_TIMEOUT = DEFAULT_ROUTER_PUBLISH_TIMEOUT;
  }

  /**
   * @async
   *
   * Create the iframe and the Router needed to get the stream from the server.
   *
   * @returns Promise
   *   Resolves when the Router has been successfully created.
   *   Rejects upon failure to create the Router.
   */
  async create () {
    if (this.isDestroyed) {
      throw new Error('Tried to create a destroyed Router Iframe Manager!');
    }

    if (this.isCreated) {
      this.logger.warn('Router Iframe Manager already created...');
      return;
    }

    this.logger.debug('Initializing...');

    try {
      await PromiseTimeout(this._create(), 2 * 1000);
      this.logger.info('Router created successfully');

      this.isCreated = true;
    }
    catch (error) {
      this.logger.error('Failed to create the Iframe/Router!');
      this.logger.error(error);
    }
  }

  _create () {
    return new Promise((resolve, reject) => {
      this._onRouterCreated = (error) => {
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

  _handleRouterCreatedEvent (eventType, event) {
    if (this.isDestroyed) {
      throw new Error('Tried to create a Router for a destroyed Router Iframe Manager!');
    }

    // @todo - a better check may be `!this.isInitializing`
    if (!this._onRouterCreated) {
      throw new Error('Tried to create Router prior to initialization!');
    }

    if (this.isCreated) {
      throw new Error('Tried to create Router after initialization!');
    }

    switch (eventType) {
      case RouterIframeManager.routerEvents.CREATE_SUCCESS: {
        this._onRouterCreated();
        break;
      }
      case RouterIframeManager.routerEvents.CREATE_FAILURE: {
        this._onRouterCreated(new Error(event.data.reason));
        break;
      }
      default: {
        throw new Error(`Unknown eventType: ${eventType}`);
      }
    }
  }

  /**
   * @private
   *
   * Generate an iframe with an embedded CLSP Router.
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

            window.Router = ${Router.toString()}(window.parent.Paho);
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

  wasIframeDestroyedExternally () {
    return !this.iframe.contentWindow;
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
  command (command, data) {
    this.logger.debug('Sending a message to the iframe...');

    if (this.isDestroyComplete) {
      this.logger.warn('Cannot send message via destroyed iframe', command, data);
      return;
    }

    if (this.wasIframeDestroyedExternally()) {
      // In the normal course of operation, sometimes other libraries or
      // implementations will delete the iframe or a parent component
      // rather than letting the CLSP Player manage it.  In this instance,
      // we recognize that this happened, but do not show nor throw an error.
      this.logger.info('Iframe destroyed externally!');
      this.events.emit(RouterIframeManager.events.IFRAME_DESTROYED_EXTERNALLY);
      return;
    }

    try {
      const message = {
        method: command,
        ...data,
      };

      // @todo - we should not be dispatching to '*' - we should provide the SFS
      // host here instead
      // @see - https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage
      this.iframe.contentWindow.postMessage(message, '*');
    }
    catch (error) {
      // @todo - we should probably throw here...
      this.logger.error(error);
    }
  }

  _destroyIframe () {
    if (this.isDestroyComplete) {
      return;
    }

    // The Router will be destroyed along with the iframe
    this.iframe.parentNode.removeChild(this.iframe);
    this.iframe.srcdoc = '';
    this.iframe = null;
    // Calling this doesn't seem to work...
    // this.iframe.remove();
  }

  async _destroy () {
    this._destroyIframe();

    // The caller must destroy the streamConfiguration
    this.streamConfiguration = null;
    this.containerElement = null;

    await super._destroy();
  }
}
