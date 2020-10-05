/**
 * The Conduit a hidden iframe that is used to establish a dedicated CLSP
 * websocket for a single video. This is basically an in-browser micro service
 * which uses cross-document communication to route data to and from the iframe.
 *
 * This code is a layer of abstraction on top of the CLSP router, and the
 * controller of the iframe that contains the router.
 */
import EventEmitter from '../../utils/EventEmitter';

import RouterBaseManager from '../Router/RouterBaseManager';
import RouterTransactionManager from '../Router/RouterTransactionManager';
import RouterStreamManager from '../Router/RouterStreamManager';
import RouterConnectionManager from '../Router/RouterConnectionManager';
import RouterIframeManager from '../Router/RouterIframeManager';
import StreamConfiguration from '../../iov/StreamConfiguration';

export default class Conduit extends EventEmitter {
  /**
   * @static
   *
   * The events that this RouterStatsManager will emit.
   */
  static events = {
    ROUTER_EVENT_ERROR: 'router-event-error',
    RECONNECT_SUCCESS: RouterConnectionManager.events.RECONNECT_SUCCESS,
    RECONNECT_FAILURE: RouterConnectionManager.events.RECONNECT_FAILURE,
    RESYNC_STREAM_COMPLETE: RouterStreamManager.events.RESYNC_STREAM_COMPLETE,
    VIDEO_SEGMENT_RECEIVED: RouterStreamManager.events.VIDEO_SEGMENT_RECEIVED,
    IFRAME_DESTROYED_EXTERNALLY: RouterIframeManager.events.IFRAME_DESTROYED_EXTERNALLY,
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
    super(logId);

    if (!clientId) {
      throw new Error('clientId is required to construct a new Conduit instance.');
    }

    if (!StreamConfiguration.isStreamConfiguration(streamConfiguration)) {
      throw new Error('invalid streamConfiguration passed to Conduit constructor');
    }

    if (!containerElement) {
      throw new Error('containerElement is required to construct a new Conduit instance');
    }

    this.clientId = clientId;
    this.streamConfiguration = streamConfiguration;
    this.containerElement = containerElement;

    this.isInitialized = false;

    this.routerIframeManager = RouterIframeManager.factory(
      this.logId,
      this.clientId,
      this.streamConfiguration,
      this.containerElement,
    );

    this.routerTransactionManager = RouterTransactionManager.factory(
      this.logId,
      this.clientId,
      this.routerIframeManager,
    );

    this.routerConnectionManager = RouterConnectionManager.factory(
      this.logId,
      this.clientId,
      this.routerTransactionManager,
    );

    this.routerStreamManager = RouterStreamManager.factory(
      this.logId,
      this.clientId,
      this.streamConfiguration,
      this.routerTransactionManager,
    );
  }

  async initialize () {
    this.routerIframeManager.on(RouterIframeManager.events.IFRAME_DESTROYED_EXTERNALLY, () => {
      if (this.isDestroyed) {
        this.logger.info('Iframe was destroyed externally while in process of destroying');
        return;
      }

      this.emit(Conduit.events.IFRAME_DESTROYED_EXTERNALLY);

      // This doesn't really do anything since the iframe is already
      // destroyed, it just allows the disconnection to run in parallel with
      // the rest of the destroy logic so that by the time the async destroy
      // logic gets to the part where it actually performs the disconnection,
      // it won't have to wait the 5 seconds for the disconnect timeout.
      this.routerConnectionManager.disconnect();
    });

    // Allow the caller to react every time there is a reconnection event
    this.routerConnectionManager.on(RouterConnectionManager.events.RECONNECT_SUCCESS, () => {
      this.emit(Conduit.events.RECONNECT_SUCCESS);
    });
    this.routerConnectionManager.on(RouterConnectionManager.events.RECONNECT_FAILURE, ({ error }) => {
      // @todo - currently, the default is to reconnect indefinitely.  but if
      // a reconnection attempt limit is set, what should happen when the
      // reconnection fails for the last time?  does this event indicate that
      // the last reconnection attempt failed and another attempt will not be
      // made?
      this.emit(Conduit.events.RECONNECT_FAILURE, { error });
    });

    this.routerStreamManager.on(RouterStreamManager.events.RESYNC_STREAM_COMPLETE, (data) => {
      // @todo - if a stream has to "resync", how are we supposed to respond
      // to that?
      this.emit(Conduit.events.RESYNC_STREAM_COMPLETE, data);
    });

    // This is the big one - transmit the video segments upstreama
    this.routerStreamManager.on(RouterStreamManager.events.VIDEO_SEGMENT_RECEIVED, (data) => {
      // @todo - if a video segment isn't received for some interval after the
      // previous video segment was received, some sort of remediation should
      // take place.
      this.emit(Conduit.events.VIDEO_SEGMENT_RECEIVED, data);
    });

    this.routerStreamManager.on(RouterStreamManager.events.VIDEO_SEGMENT_TIMEOUT, (data) => {
      this.logger.warn(`Did not receive a video segment for ${this.routerStreamManager.streamName} in ${data.timeout} seconds, attempting to reconnect...`);

      // No need to await here since we're in an event listener
      this.routerConnectionManager.reconnect();
    });

    await this.routerIframeManager.create();

    this.isInitialized = true;
  }

  /**
   * Play the configured stream.
   *
   * @returns {object}
   *  - guid
   *  - mimeCodec
   *  - moov
   */
  async play () {
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
      } = await this.routerStreamManager.play();

      return {
        guid,
        mimeCodec,
        moov,
      };
    }
    catch (error) {
      this.logger.error(`Error trying to play stream ${this.routerStreamManager.streamName}`);

      // @todo - we could retry?
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

    try {
      await this.routerStreamManager.stop();
    }
    catch (error) {
      // @todo - this is too tightly coupled - the iframe manager should emit
      // an event when this external destruction happens, not expect the caller
      // to check for it...
      if (!this.routerIframeManager.wasIframeDestroyedExternally()) {
        this.logger.error('Error while stopping while destroying');
        this.logger.error(error);
      }
    }

    try {
      await this.routerConnectionManager.disconnect();
    }
    catch (error) {
      // @todo - this is too tightly coupled - the iframe manager should emit
      // an event when this external destruction happens, not expect the caller
      // to check for it...
      if (!this.routerIframeManager.wasIframeDestroyedExternally()) {
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
    if (this.shouldLogSourceBuffer && this.logSourceBufferTopic) {
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
        case RouterIframeManager.routerEvents.CREATE_SUCCESS:
        case RouterIframeManager.routerEvents.CREATE_FAILURE: {
          this.routerIframeManager._handleRouterCreatedEvent(eventType, event);
          break;
        }
        case RouterConnectionManager.routerEvents.CONNECT_SUCCESS:
        case RouterConnectionManager.routerEvents.CONNECT_FAILURE:
        case RouterConnectionManager.routerEvents.DISCONNECT_SUCCESS:
        case RouterConnectionManager.routerEvents.DISCONNECT_FAILURE:
        case RouterConnectionManager.routerEvents.CONNECTION_LOST: {
          this.routerConnectionManager.onRouterEvent(eventType, event);
          break;
        }
        case RouterTransactionManager.routerEvents.UNSUBSCRIBE_SUCCESS:
        case RouterTransactionManager.routerEvents.UNSUBSCRIBE_FAILURE:
        case RouterTransactionManager.routerEvents.PUBLISH_SUCCESS:
        case RouterTransactionManager.routerEvents.PUBLISH_FAILURE:
        case RouterTransactionManager.routerEvents.MESSAGE_ARRIVED: {
          this.routerTransactionManager.onRouterEvent(eventType, event);
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

      this.emit(Conduit.events.ROUTER_EVENT_ERROR, { error });
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
  async _destroy () {
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

    try {
      await this.routerTransactionManager.destroy();
    }
    catch (error) {
      this.logger.error('Error while destroying routerTransactionManager while destroying');
      this.logger.error(error);
    }

    try {
      // Destruction of the iframe must come last
      await this.routerIframeManager.destroy();
    }
    catch (error) {
      this.logger.error('Error while destroying routerIframeManager while destroying');
      this.logger.error(error);
    }

    this.routerStreamManager = null;
    this.routerConnectionManager = null;
    this.routerTransactionManager = null;
    this.routerIframeManager = null;

    this.clientId = null;
    // The caller must destroy the streamConfiguration
    this.streamConfiguration = null;
    this.containerElement = null;

    await super._destroy();
  }
}
