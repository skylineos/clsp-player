'use strict';

/**
 * The Conduit a hidden iframe that is used to establish a dedicated CLSP
 * websocket for a single video. This is basically an in-browser micro service
 * which uses cross-document communication to route data to and from the iframe.
 *
 * This code is a layer of abstraction on top of the CLSP router, and the
 * controller of the iframe that contains the router.
 */

import uuidv4 from 'uuid/v4';

import utils from '../utils/';
import Router from './Router';
import Logger from '../utils/logger';
import StreamConfiguration from '../iov/StreamConfiguration';

const DEFAULT_MAX_RECONNECTION_ATTEMPTS = 0;
const DEFAULT_MAX_RECONNECTION_TIME = 0;
// When trying to reconnect, try every 5 seconds for the first 2 minutes, then
// try every 30 seconds after 2 minutes.
const DEFAULT_IMMEDIATE_RECONNECTION_DELAY = 5;
const DEFAULT_IMMEDIATE_RECONNECTION_DURATION = 120;
const DEFAULT_RECONNECTION_DELAY = 30;
const DEFAULT_STREAM_DATA_TIMEOUT_DURATION = utils.DEFAULT_STREAM_TIMEOUT;
const DEFAULT_MOOV_TIMEOUT_DURATION = utils.DEFAULT_STREAM_TIMEOUT;
const DEFAULT_FIRST_MOOF_TIMEOUT_DURATION = utils.DEFAULT_STREAM_TIMEOUT;
const DEFAULT_MOOF_TIMEOUT_DURATION = utils.DEFAULT_STREAM_TIMEOUT;
const DEFAULT_PUBLISH_STATS_INTERVAL = 5;
const DEFAULT_TRANSACTION_TIMEOUT = 5;

const DEFAULT_ROUTER_CONNECTION_TIMEOUT = 120;
// Setting this to half of the default value to help with SFS memory
// management
const DEFAULT_ROUTER_KEEP_ALIVE_INTERVAL = 30;
// The number of seconds to wait for a "publish" message to be delivered
const DEFAULT_ROUTER_PUBLISH_TIMEOUT = utils.DEFAULT_STREAM_TIMEOUT;

export default class Conduit {
  static iframeCommands = {
    SUBSCRIBE: 'subscribe',
    UNSUBSCRIBE: 'unsubscribe',
    PUBLISH: 'publish',
    CONNECT: 'connect',
    DISCONNECT: 'disconnect',
    SEND: 'send',
  };

  static routerEvents = Router().Router.events;

  static factory (
    logId,
    clientId,
    streamConfiguration,
    containerElement,
    onReconnect,
    onMessageError
  ) {
    return new Conduit(
      logId,
      clientId,
      streamConfiguration,
      containerElement,
      onReconnect,
      onMessageError
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
    onMessageError = () => {}
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

    this.streamName = this.streamConfiguration.streamName;
    this.guid = null;

    this.logger = Logger().factory(`Conduit ${this.logId}`);
    this.logger.debug('Constructing...');

    this.statsMsg = {
      byteCount: 0,
      inkbps: 0,
      host: document.location.host,
      clientId: this.clientId,
    };

    this.handlers = {};

    this.reconnectionAttempts = 0;

    this.connected = false;
    this._onMessageError = onMessageError;
    this._onReconnect = onReconnect;

    this.statsInterval = null;
    this.firstMoofTimeout = null;
    this.pendingTransactions = {};

    this.moovRequestTopic = `${this.clientId}/init-segment/${parseInt(Math.random() * 1000000)}`;
    this.publishHandlers = {};
    this.reconnectionInProgress = null;

    // These can be configured manually after construction
    this.MAX_RECONNECTION_ATTEMPTS = DEFAULT_MAX_RECONNECTION_ATTEMPTS;
    this.MAX_RECONNECTION_TIME = DEFAULT_MAX_RECONNECTION_TIME;
    this.IMMEDIATE_RECONNECTION_DELAY = DEFAULT_IMMEDIATE_RECONNECTION_DELAY;
    this.IMMEDIATE_RECONNECTION_DURATION = DEFAULT_IMMEDIATE_RECONNECTION_DURATION;
    this.RECONNECTION_DELAY = DEFAULT_RECONNECTION_DELAY;
    this.STREAM_DATA_TIMEOUT_DURATION = DEFAULT_STREAM_DATA_TIMEOUT_DURATION;
    this.MOOV_TIMEOUT_DURATION = DEFAULT_MOOV_TIMEOUT_DURATION;
    this.FIRST_MOOF_TIMEOUT_DURATION = DEFAULT_FIRST_MOOF_TIMEOUT_DURATION;
    this.MOOF_TIMEOUT_DURATION = DEFAULT_MOOF_TIMEOUT_DURATION;
    this.PUBLISH_STATS_INTERVAL = DEFAULT_PUBLISH_STATS_INTERVAL;
    this.TRANSACTION_TIMEOUT = DEFAULT_TRANSACTION_TIMEOUT;
    this.ROUTER_CONNECTION_TIMEOUT = DEFAULT_ROUTER_CONNECTION_TIMEOUT;
    this.ROUTER_KEEP_ALIVE_INTERVAL = DEFAULT_ROUTER_KEEP_ALIVE_INTERVAL;
    this.ROUTER_PUBLISH_TIMEOUT = DEFAULT_ROUTER_PUBLISH_TIMEOUT;
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
        if (eventType !== Conduit.routerEvents.CREATED && eventType !== Conduit.routerEvents.CREATE_FAILURE) {
          return;
        }

        this.logger.debug(`initialize "${eventType}" event`);

        // Whether success or failure, remove the event listener
        window.removeEventListener('message', this._onRouterCreate);

        // Once the event listener is removed, remove the listener handler,
        // since it will not be used again and to prevent the `destroy` method
        // from trying to unregister it.
        this._onRouterCreate = null;

        if (eventType === Conduit.routerEvents.CREATE_FAILURE) {
          return reject(event.data.reason);
        }

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
   * After initialization, call this to establish the connection to the server.
   *
   * Note that this is called within the play method, so you shouldn't ever need
   * to manually call `connect`.
   *
   * @returns Promise
   *   Resolves when the connection is successfully established.
   *   Rejects upon failure to connect after a number of retries.
   */
  connect (reconnect = true) {
    this.logger.debug('Connecting to CLSP server...');

    return new Promise((resolve, reject) => {
      if (this.connected) {
        return resolve();
      }

      this._onConnect = (event) => {
        const clientId = event.data.clientId;

        // A window message was received that is not related to CLSP
        if (!clientId) {
          return;
        }

        // This message was intended for another conduit
        if (this.clientId !== clientId) {
          return;
        }

        const eventType = event.data.event;

        // Filter out all other window messages
        if (eventType !== Conduit.routerEvents.CONNECT_SUCCESS && eventType !== Conduit.routerEvents.CONNECT_FAILURE) {
          return;
        }

        this.logger.debug(`connect "${eventType}" event`);

        // Whether success or failure, remove the event listener
        window.removeEventListener('message', this._onConnect);
        this._onConnect = null;

        if (eventType === Conduit.routerEvents.CONNECT_FAILURE) {
          this.logger.error(new Error(event.data.reason));

          if (reconnect) {
            this.reconnect()
              .then(resolve)
              .catch(reject);

            return;
          }

          return reject(new Error('Failed to connect'));
        }

        // the mse service will stop streaming to us if we don't send
        // a message to iov/stats within 1 minute.
        this.statsInterval = setInterval(() => {
          this.publishStats();
        }, this.PUBLISH_STATS_INTERVAL * 1000);

        this.connected = true;

        this.logger.info('Connected');
        resolve();
      };

      window.addEventListener('message', this._onConnect);

      this._command({
        method: Conduit.iframeCommands.CONNECT,
      });
    });
  }

  /**
   * Called many times, each time a moof (segment) is received
   *
   * @callback Conduit-onMoof
   * @param {any} moof - a stream segment
   */

  /**
   * If the hash is valid or if we are not using a hash, perform the necessary
   * conduit operations to retrieve stream segments (moofs).  The actual
   * "playing" occurs in the player, since it involves taking those received
   * stream segments and using MSE to display them.
   *
   * @async
   *
   * @param {Conduit-onMoof} onMoof
   *   the function that will handle the moof
   *
   * @returns {Promise}
   *   * Resolves once the first moof has been received
   *   * Rejects if the moov or first moof time out
   */
  async play (onMoof) {
    this.logger.info('Playing...');

    // @todo - should we have a check to confirm that the conduit has been initialized?
    // @todo - should connect be called here?
    await this.connect();

    if (this.streamConfiguration.hash && this.streamConfiguration.hash.length > 0) {
      this.streamName = await this.validateHash();
    }

    this.logger.info('Play is requesting stream...');

    try {
      const {
        guid,
        mimeCodec,
      } = await this.requestStreamData();

      this.guid = guid;

      // Get the moov first
      const {
        moov,
      } = await this.requestMoov();

      // Set up the listener for the moofs
      await this.requestMoofs(onMoof);

      return {
        guid,
        mimeCodec,
        moov,
      };
    }
    catch (error) {
      this.logger.error(`Error trying to play stream ${this.streamName}`);

      // @todo - we could retry
      this.stop();

      throw error;
    }
  }

  /**
   * Disconnect from the CLSP server
   *
   * @todo - return a promise that resolves when the disconnection is complete!
   */
  disconnect () {
    this.logger.debug('Disconnecting...');

    // If a connection is in progress, cancel it
    if (this._onConnect) {
      window.removeEventListener('message', this._onConnect);
      this._onConnect = null;
    }

    this.connected = false;

    // when a stream fails, it no longer needs to send stats to the
    // server, and it may not even be connected to the server
    this.clearStatsInterval();

    this._command({
      method: Conduit.iframeCommands.DISCONNECT,
    });
  }

  /**
   * Stop the playing stream and cancel all requests
   *
   * @todo - await the disconnection, and maybe even the
   * unsubscribes

   */
  stop () {
    this.logger.debug('Stopping stream...');

    for (const [
      id,
      pendingTransaction,
    ] of Object.entries(this.pendingTransactions)) {
      if (pendingTransaction.timeout) {
        clearTimeout(pendingTransaction.timeout);
        pendingTransaction.timeout = null;
      }
    }

    this.pendingTransactions = {};

    this.clearFirstMoofTimeout();
    this.clearMoofTimeout();

    if (this.guid) {
      // Stop listening for the moov
      this.unsubscribe(this.moovRequestTopic);

      // Stop listening for moofs
      this.unsubscribe(`iov/video/${this.guid}/live`);

      // Stop listening for resync events
      this.unsubscribe(`iov/video/${this.guid}/resync`);

      // Tell the server we've stopped
      this.publish(`iov/video/${this.guid}/stop`, {
        clientId: this.clientId,
      }).catch((error) => {
        this.logger.warn('Error while stopping:');
        this.logger.error(error);
      });
    }
    else {
      this.logger.info(`Trying to stop stream ${this.streamName} with no guid!`);
    }

    this.disconnect();
  }

  /**
   * Clean up and dereference the necessary properties.  Will also disconnect
   * and destroy the iframe.
   *
   * @todo - return a Promise, but do not wait for the promise to resolve to
   * continue the destroy logic.  the promise should resolve/reject based on
   * the disconnect method call
   *
   * @returns {void}
   */
  destroy () {
    this.logger.debug('Destroying...');

    if (this.destroyed) {
      return;
    }

    this.destroyed = true;

    if (this._onConnect) {
      window.removeEventListener('message', this._onConnect);
      this._onConnect = null;
    }

    if (this._onRouterCreate) {
      window.removeEventListener('message', this._onRouterCreate);
      this._onRouterCreate = null;
    }

    this.stop();

    this.clientId = null;
    this.guid = null;
    // The caller must destroy the streamConfiguration
    this.streamConfiguration = null;
    this.containerElement = null;

    // The Router will be destroyed along with the iframe
    this.iframe.parentNode.removeChild(this.iframe);
    // this.iframe.remove();
    this.iframe.srcdoc = '';
    this.iframe = null;

    this.handlers = null;
    this.reconnectionAttempts = null;

    this.connected = null;
    this.firstMoofTimeout = null;

    this.moovRequestTopic = null;

    this.statsMsg = null;

    this.publishHandlers = null;
    this.reconnectionInProgress = null;

    // @todo - can this be safely dereferenced?
    // this._onMessageError = null;
  }

  /**
   * Validate the hash that this conduit was constructed with.
   *
   * @async
   *
   * @returns {String}
   *   the stream name
   */
  async validateHash () {
    this.logger.debug('Validating Hash...');

    // response ->  {"status": 200, "target_url": "clsp://sfs1/fakestream", "error": null}
    const {
      payloadString: response,
    } = await this.transaction('iov/hashValidate', {
      b64HashURL: this.streamConfiguration.b64_hash_access_url,
      token: this.streamConfiguration.hash,
    });

    if (response.status === 403) {
      throw new Error('HashUnAuthorized');
    }

    if (response.status !== 200) {
      throw new Error('HashInvalid');
    }

    // TODO, figure out how to handle a change in the sfs url from the
    // clsp-hash from the target url returned from decrypting the hash
    // token.
    // Example:
    //    user enters 'clsp-hash://sfs1/hash?start=0&end=...&token=...' for source
    //    clspUrl = 'clsp://SFS2/streamOnDifferentSfs
    // --- due to the videojs architecture i don't see a clean way of doing this.
    // ==============================================================================
    //    The only way I can see doing this cleanly is to change videojs itself to
    //    allow the 'canHandleSource' function in ClspSourceHandler to return a
    //    promise not a value, then ascychronously find out if it can play this
    //    source after making the call to decrypt the hash token.22
    // =============================================================================
    // Note: this could go away in architecture 2.0 if CLSP was a cluster in this
    // case what is now the sfs ip address in clsp url will always be the same it will
    // be the public ip of cluster gateway.
    const t = response.target_url.split('/');

    // get the actual stream name
    const streamName = t[t.length - 1];

    return streamName;
  }

  /**
   * Get the `guid` and `mimeCodec` for the stream.  The guid serves as a stream
   * instance for a given camera or video feed, and is needed to make requests
   * for the stream instance.
   *
   * @async
   *
   * @returns {Object}
   *   The video metadata, including the `guid` and `mimeCodec` properties.
   */
  async requestStreamData () {
    this.logger.debug('Requesting Stream...');

    const {
      payloadString: videoMetaData,
    } = await this.transaction(
      `iov/video/${window.btoa(this.streamName)}/request`,
      {
        clientId: this.clientId,
      },
      this.STREAM_DATA_TIMEOUT_DURATION,
    );

    // @todo - is it possible to do better error handling here?
    if (!videoMetaData.mimeCodec) {
      throw new Error('Error while requesting stream: mimeCodec was not received!');
    }

    if (!videoMetaData.guid) {
      throw new Error('Error while requesting stream: guid was not received!');
    }

    return videoMetaData;
  }

  clearStatsInterval () {
    if (this.statsInterval) {
      clearInterval(this.statsInterval);
      this.statsInterval = null;
    }
  }

  clearFirstMoofTimeout () {
    if (this.firstMoofTimeout) {
      clearTimeout(this.firstMoofTimeout);
      this.firstMoofTimeout = null;
    }
  }

  clearMoofTimeout () {
    if (this.moofTimeout) {
      clearTimeout(this.moofTimeout);
      this.moofTimeout = null;
    }
  }

  /**
   * Request the moov from the SFS
   *
   * @async
   *
   * @todo - why is the clientId used here rather than the stream guid?
   *
   * @returns {Object}
   *   The moov
   */
  async requestMoov () {
    this.logger.info('Requesting the moov...');

    if (!this.guid) {
      throw new Error('The guid must be set before requesting the moov');
    }

    const {
      payloadBytes: moov,
    } = await this.transaction(
      `iov/video/${this.guid}/play`,
      {
        initSegmentTopic: this.moovRequestTopic,
        clientId: this.clientId,
      },
      this.MOOV_TIMEOUT_DURATION,
      // We must override the subscribe topic to get the moov
      this.moovRequestTopic,
    );

    return {
      moov,
    };
  }

  /**
   * Request moofs from the SFS.  Should only be called after getting the moov.
   *
   * @param {Function} onMoof
   *   The function to call when a moof is received
   *
   * @returns {Promise}
   *   * Resolves when the first moof is received
   *   * Rejects if the first moof is not received within the time defined by
   *     FIRST_MOOF_TIMEOUT_DURATION
   */
  async requestMoofs (onMoof = () => {}) {
    this.logger.info('Setting up moof listener...');

    if (!this.guid) {
      throw new Error('The guid must be set before requesting moofs');
    }

    return new Promise((resolve, reject) => {
      let hasFirstMoofTimedOut = false;
      let hasReceivedFirstMoof = false;

      this.firstMoofTimeout = setTimeout(() => {
        if (hasFirstMoofTimedOut) {
          return;
        }

        hasFirstMoofTimedOut = true;

        this.clearFirstMoofTimeout();

        reject(new Error(`First moof for stream ${this.streamName} timed out after ${this.FIRST_MOOF_TIMEOUT_DURATION} seconds`));
      }, this.FIRST_MOOF_TIMEOUT_DURATION * 1000);

      const moofReceivedTopic = `iov/video/${this.guid}/live`;

      // Set up the listener for the stream itself (the moof video segments)
      this.subscribe(moofReceivedTopic, (clspMessage) => {
        if (!hasReceivedFirstMoof) {
          // If we received the first moof after the timeout, do nothing
          if (hasFirstMoofTimedOut) {
            this.logger.warn('Received first moof, but moofTimeout has already occurred...');
            return;
          }

          // If the firstMoofTimeout still exists, cancel it, since the request
          // did not timeout
          this.clearFirstMoofTimeout();

          // Since this is the first moof, resolve
          hasReceivedFirstMoof = true;

          resolve({
            moofReceivedTopic,
          });
        }

        this.clearMoofTimeout();

        this.moofTimeout = setTimeout(() => {
          this.reconnect();
        }, this.MOOF_TIMEOUT_DURATION * 1000);

        onMoof(clspMessage);
      });
    });
  }

  /**
   * @callback Conduit-resyncStreamCb
   * @param {any} - @todo - document this
   */

  /**
   * @todo - provide method description
   *
   * @todo - return a Promise
   *
   * @param {Conduit-resyncStreamCb} onResync
   *   The callback for the resync operation
   */
  resyncStream (onResync) {
    // subscribe to a sync topic that will be called if the stream that is
    // feeding the mse service dies and has to be restarted that this player
    // should restart the stream
    this.subscribe(`iov/video/${this.guid}/resync`, onResync);
  }

  /**
   * Get the list of available CLSP streams from the SFS
   *
   * Note - this isn't currently used anywhere
   *
   * @async
   *
   * @returns {Object}
   *   @todo
   */
  async getStreamList (cb) {
    this.logger.debug('Getting Stream List...');

    const {
      payloadString: streamList,
    } = await this.transaction('iov/video/list');

    return streamList;
  }

  /**
   * Handler for an iframe window message.
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
        case Conduit.routerEvents.DATA_RECEIVED: {
          this._onClspData(event.data);
          break;
        }
        case Conduit.routerEvents.CONNECT_FAILURE:
        case Conduit.routerEvents.CONNECTION_LOST: {
          if (this.reconnectionInProgress) {
            return;
          }

          this.reconnect();
          break;
        }
        case Conduit.routerEvents.WINDOW_MESSAGE_FAIL: {
          // @todo - do we really need to disconnect? should we reconnect?
          this.disconnect();
          break;
        }
        case Conduit.routerEvents.PUBLISH_SUCCESS: {
          const publishId = event.data.publishId;

          if (!publishId || !this.publishHandlers[publishId]) {
            throw new Error(`No publish handler for ${publishId}`);
          }

          this.publishHandlers[publishId](
            null, event.data, event,
          );

          break;
        }
        case Conduit.routerEvents.PUBLISH_FAIL: {
          const publishId = event.data.publishId;

          if (!publishId || !this.publishHandlers[publishId]) {
            throw new Error(`No publish handler for ${publishId}`);
          }

          this.publishHandlers[publishId](
            new Error(event.data.reason), event.data, event,
          );

          break;
        }
        case Conduit.routerEvents.CREATED:
        case Conduit.routerEvents.CONNECT_SUCCESS:
        case Conduit.routerEvents.DISCONNECT_SUCCESS: {
          break;
        }
        default: {
          this.logger.error(`No match for event: ${eventType}`);
        }
      }
    }
    catch (error) {
      this.logger.debug('onMessageError');

      this._onMessageError(error);
    }
  }

  /**
   * To be called when a segment / moof is "shown".  In realistic terms, this is
   * meant to be called when the moof is appended to the MSE SourceBuffer.  This
   * method is meant to update stats.
   *
   * @param {Array} byteArray
   *   The raw segment / moof
   */
  segmentUsed (byteArray) {
    // @todo - it appears that this is never used!
    if ((this.LogSourceBuffer === true) && (this.LogSourceBufferTopic !== null)) {
      this.directSend({
        method: Conduit.iframeCommands.SEND,
        topic: this.LogSourceBufferTopic,
        byteArray,
      });
    }

    this.statsMsg.byteCount += byteArray.length;
  }

  /**
   * Every time a segment / moof is received from the server, it should be
   * passed to this method
   *
   * @param {*} message
   */
  _onClspData (message) {
    const topic = message.destinationName;

    this.logger.debug(`Handling message for topic "${topic}"`);

    if (!topic) {
      throw new Error('Message contained no topic to handle!');
    }

    const handler = this.handlers[topic];

    if (!handler) {
      throw new Error(`No handler for ${topic}`);
    }

    handler(message);
  }

  /**
   * @todo - provide method description
   *
   * @todo - return a Promise
   *
   * @param {String} topic
   *   The topic to subscribe to
   * @param {Conduit-subscribeCb} cb
   *   The callback for the subscribe operation
   */
  subscribe (topic, handler) {
    this.logger.debug(`Subscribing to topic "${topic}"`);

    this.handlers[topic] = handler;

    this._command({
      method: Conduit.iframeCommands.SUBSCRIBE,
      topic,
    });
  }

  /**
   * @todo - provide method description
   *
   * @todo - return a Promise
   *
   * @param {String} topic
   *   The topic to unsubscribe from
   */
  unsubscribe (topic) {
    this.logger.debug(`Unsubscribing from topic "${topic}"`);

    // unsubscribes can occur asynchronously, so ensure the handlers object
    // still exists
    if (this.handlers) {
      delete this.handlers[topic];
    }

    this._command({
      method: Conduit.iframeCommands.UNSUBSCRIBE,
      topic,
    });
  }

  /**
   * @todo - provide method description
   *
   * @param {String} topic
   *   The topic to publish to
   * @param {Object} data
   *   The data to publish
   *
   * @returns {Promise}
   *   Resolves when publish operation is successful
   *   Rejects when publish operation fails
   */
  publish (topic, data) {
    const publishId = uuidv4();

    this.logger.debug(`Publishing to topic "${topic}"`);

    return new Promise((resolve, reject) => {
      this.publishHandlers[publishId] = (error) => {
        delete this.publishHandlers[publishId];

        if (error) {
          return reject(error);
        }

        resolve();
      };

      this._command({
        method: Conduit.iframeCommands.PUBLISH,
        publishId,
        topic,
        data,
      });
    });
  }

  /**
   * @todo - provide method description
   *
   * @todo - return a Promise
   *
   * @param {String} topic
   *   The topic to send to
   * @param {Array} byteArray
   *   The raw data to send
   */
  directSend (topic, byteArray) {
    this.logger.debug('directSend...');

    this._command({
      method: Conduit.iframeCommands.SEND,
      topic,
      byteArray,
    });
  }

  /**
   * Request
   *
   * When asking the server for something, we do not get a response right away.
   * Instead, we must perform the following steps:
   *
   * 1. generate a unique string, which will be sent to the server as the "response topic"
   * 1. subscribe
   *
   * @param {String} topic
   *   The topic to perform a transaction on
   * @param {Object} messageData
   *   The data to be published
   *
   * @returns {Promise}
   *   Resolves when the transaction successfully finishes
   *   Rejects if there is any error or timeout during the transaction
   */
  transaction (
    topic,
    messageData = {},
    timeoutDuration = this.TRANSACTION_TIMEOUT,
    subscribeTopic,
  ) {
    this.logger.debug(`transaction for ${topic}...`);

    const transactionId = uuidv4();

    if (!subscribeTopic) {
      subscribeTopic = messageData.resp_topic = `${this.clientId}/response/${transactionId}`;
    }

    this.pendingTransactions[transactionId] = {
      id: transactionId,
      hasTimedOut: false,
      timeout: null,
    };

    return new Promise((resolve, reject) => {
      const finished = (error, response) => {
        this.unsubscribe(subscribeTopic);

        if (this.pendingTransactions[transactionId].timeout) {
          clearTimeout(this.pendingTransactions[transactionId].timeout);
          this.pendingTransactions[transactionId].timeout = null;
        }

        if (error) {
          return reject(error);
        }

        const payloadString = response.payloadString;

        // @todo - why is this necessary?
        if (response.payloadString) {
          try {
            response.payloadString = JSON.parse(payloadString) || {};
          }
          catch (error) {
            this.logger.warn('Failed to parse payloadString');
            this.logger.warn(error);
            response.payloadString = payloadString;
          }
        }

        resolve(response);
      };

      this.pendingTransactions[transactionId].timeout = setTimeout(() => {
        if (this.pendingTransactions[transactionId].hasTimedOut) {
          return;
        }

        this.pendingTransactions[transactionId].hasTimedOut = true;

        finished(new Error(`Transaction for ${topic} timed out after ${timeoutDuration} seconds`));
      }, timeoutDuration * 1000);

      this.subscribe(subscribeTopic, (response) => {
        finished(null, response);
      });

      this.publish(topic, messageData).catch((error) => {
        finished(error);
      });
    });
  }

  /**
   * @private
   *
   * Generate an iframe with an embedded CLSP router.  The router will be what
   * this Conduit instance communicates with in subsequent commands.
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
            // Include the logger
            window.Logger = ${Logger.toString()};

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
            };

            window.conduitCommands = ${JSON.stringify(Conduit.iframeCommands)};

            window.iframeEventHandlers = ${Router.toString()}();
          </script>
        </head>
        <body
          onload="window.iframeEventHandlers.onload();"
          onunload="window.iframeEventHandlers.onunload();"
        >
          <div id="message"></div>
        </body>
      </html>
    `;

    return iframe;
  }

  /**
   * @private
   * @async
   *
   * Do not call this method directly!  Only use the `reconnect` method.
   */
  async _reconnect (reconnectionStartedAt, stopTryingToReconnectAt, onSuccess, onFailure) {
    this.logger.info('Reconnecting...');

    this.reconnectionAttempts++;

    if (this.MAX_RECONNECTION_ATTEMPTS && this.reconnectionAttempts > this.MAX_RECONNECTION_ATTEMPTS) {
      return onFailure(new Error(`Failed to reconnect after ${this.reconnectionAttempts} attempts.`));
    }

    if (this.MAX_RECONNECTION_TIME && Date.now() > stopTryingToReconnectAt) {
      return onFailure(new Error(`Failed to reconnect after ${this.MAX_RECONNECTION_TIME} seconds.`));
    }

    try {
      this.disconnect();
      await this.connect(false);

      // After successfully connecting, reset the reconnection attempts and
      this.reconnectionAttempts = 0;
      this.reconnectionInProgress = null;

      onSuccess();
    }
    catch (error) {
      this.logger.error(error);

      const reconnectionDelay = (Date.now() - reconnectionStartedAt > (this.IMMEDIATE_RECONNECTION_DURATION * 1000))
        ? this.RECONNECTION_DELAY
        : this.IMMEDIATE_RECONNECTION_DELAY

      setTimeout(() => {
        // @todo - do we need to worry about recursion overflowing the stack?
        this._reconnect(
          reconnectionStartedAt,
          stopTryingToReconnectAt,
          onSuccess,
          onFailure
        );
      }, reconnectionDelay * 1000);
    }
  }

  /**
   * Attempt to reconnect a certain number of times
   *
   * @returns {Promise}
   */
  reconnect () {
    this.logger.info('Reconnecting...');

    // If we're already trying to reconnect, don't try again
    if (this.reconnectionInProgress) {
      return this.reconnectionInProgress;
    }

    const reconnectionStartedAt = Date.now();

    const stopTryingToReconnectAt = this.MAX_RECONNECTION_TIME
      ? reconnectionStartedAt + (this.MAX_RECONNECTION_TIME * 1000)
      : 0;

    this.reconnectionInProgress = new Promise((resolve, reject) => {
      this.logger.info('First reconnection attempt...');

      this._reconnect(
        reconnectionStartedAt,
        stopTryingToReconnectAt,
        () => {
          this.logger.info('reconnected!')

          // After successfully connecting, clear the reconnectionInProgress
          this.reconnectionInProgress = null;

          this._onReconnect();
          resolve();
        },
        (error) => {
          this._onReconnect(error);
          reject(error);
        }
      );
    });

    return this.reconnectionInProgress;
  }

  /**
   * @private
   *
   * Pass a CLSP command to the iframe.
   *
   * @param {Object} message
   */
  _command (message) {
    this.logger.debug('Sending a message to the iframe...');

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
   * @private
   *
   * @async
   *
   * Send stats to the server
   */
  async publishStats () {
    this.statsMsg.inkbps = (this.statsMsg.byteCount * 8) / 30000.0;
    this.statsMsg.byteCount = 0;

    try {
      await this.publish('iov/stats', this.statsMsg);

      this.logger.debug('iov status', this.statsMsg);
    }
    catch (error) {
      this.logger.error('Error while publishing stats!');
      this.logger.error(error);

      // if the stats cannot be published, treat that as an unexpected
      // disconnection
      this.clearStatsInterval();
      this.reconnect();
    }
  }
}
