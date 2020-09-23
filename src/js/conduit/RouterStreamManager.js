import utils from '../utils/utils';
import StreamConfiguration from '../iov/StreamConfiguration';
import RouterBaseManager from './RouterBaseManager';

const DEFAULT_STREAM_DATA_TIMEOUT_DURATION = utils.DEFAULT_STREAM_TIMEOUT;
const DEFAULT_MOOV_TIMEOUT_DURATION = utils.DEFAULT_STREAM_TIMEOUT;
const DEFAULT_FIRST_MOOF_TIMEOUT_DURATION = utils.DEFAULT_STREAM_TIMEOUT;
const DEFAULT_MOOF_TIMEOUT_DURATION = utils.DEFAULT_STREAM_TIMEOUT;

export default class RouterStreamManager extends RouterBaseManager {
  /**
   * @static
   *
   * The events that this RouterConnectionManager will emit.
   */
  static events = {
    SEGMENT_USED: 'segment-used',
  }

  static factory (
    logId,
    clientId,
    streamConfiguration,
    routerTransactionManager,
  ) {
    return new RouterStreamManager(
      logId,
      clientId,
      streamConfiguration,
      routerTransactionManager,
    );
  }

  constructor (
    logId,
    clientId,
    streamConfiguration,
    routerTransactionManager,
  ) {
    super(
      logId,
      clientId,
    );

    if (!StreamConfiguration.isStreamConfiguration(streamConfiguration)) {
      throw new Error('A StreamConfiguration is required to instantiate a RouterStreamManager');
    }

    if (!routerTransactionManager) {
      throw new Error('A RouterTransactionManager is required to instantiate a RouterStreamManager');
    }

    this.streamConfiguration = streamConfiguration;
    this.routerTransactionManager = routerTransactionManager;

    this.STREAM_DATA_TIMEOUT_DURATION = DEFAULT_STREAM_DATA_TIMEOUT_DURATION;
    this.MOOV_TIMEOUT_DURATION = DEFAULT_MOOV_TIMEOUT_DURATION;
    this.FIRST_MOOF_TIMEOUT_DURATION = DEFAULT_FIRST_MOOF_TIMEOUT_DURATION;
    this.MOOF_TIMEOUT_DURATION = DEFAULT_MOOF_TIMEOUT_DURATION;

    this.streamName = this.streamConfiguration.streamName;
    this.moovRequestTopic = `${this.clientId}/init-segment/${parseInt(Math.random() * 1000000)}`;
    this.guid = null;

    this.firstMoofTimeout = null;
    this.moofTimeout = null;
  }

  /**
   * Called many times, each time a moof (segment) is received
   *
   * @callback Conduit-onMoof
   * @param {any} moof - a stream segment
   */

  /**
   * @async
   *
   * If the hash is valid or if we are not using a hash, perform the necessary
   * conduit operations to retrieve stream segments (moofs).  The actual
   * "playing" occurs in the player, since it involves taking those received
   * stream segments and using MSE to display them.
   *
   * @param {Conduit-onMoof} onMoof
   *   the function that will handle the moof
   *
   * @returns {Promise}
   *   * Resolves once the first moof has been received
   *   * Rejects if the moov or first moof time out
   */
  async play (onMoof) {
    if (this.isDestroyed) {
      this.logger.info('Tried to play from destroyed RouterStreamManager');
      return;
    }

    if (this.streamConfiguration.tokenConfig &&
        this.streamConfiguration.tokenConfig.hash &&
        this.streamConfiguration.tokenConfig.hash.length > 0
    ) {
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

      await this.stop();

      throw error;
    }
  }

  /**
   * @async
   *
   * Stop the stream.  Multiple topics will be unsubscribed from, and the stop
   * topic will be published.
   *
   * @returns {void}
   */
  async stop () {
    this.clearFirstMoofTimeout();
    this.clearMoofTimeout();

    if (!this.guid) {
      // @todo - is this condition a symptom of a problem?
      this.logger.info(`Trying to stop stream ${this.streamName} with no guid!`);
      return;
    }

    const results = await Promise.allSettled([
      // Stop listening for the moov
      await this.routerTransactionManager.unsubscribe(this.moovRequestTopic),
      // Stop listening for moofs
      await this.routerTransactionManager.unsubscribe(`iov/video/${this.guid}/live`),
      // Stop listening for resync events
      await this.routerTransactionManager.unsubscribe(`iov/video/${this.guid}/resync`),
      // Tell the server we've stopped
      await this.routerTransactionManager.publish(`iov/video/${this.guid}/stop`, {
        clientId: this.clientId,
      }),
    ]);

    const errors = results.reduce((acc, cur) => {
      if (cur.status !== 'fulfilled') {
        acc.push(cur);
      }

      return acc;
    }, []);

    if (errors.length) {
      this.logger.warn('Error(s) encountered while stopping:');
      this.logger.error(errors);

      // @todo - is there a better way to do this?
      throw errors[0];
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
      this.routerTransactionManager.directSend(this.LogSourceBufferTopic, byteArray);
    }

    this.events.emit(RouterStreamManager.events.SEGMENT_USED, {
      byteArray,
    });
  }

  /**
   * @callback Conduit-resyncStreamCb
   * @param {any} - @todo - document this
   */

  /**
   * Subscribe to a CLSP "resync" topic that will be called if the stream with
   * this guid dies and has to be restarted.
   *
   * On this event, the caller should restart the stream.
   *
   * @todo - emit an event rather than taking a callback
   *
   * @param {Conduit-resyncStreamCb} onResync
   *   The callback for the resync operation
   */
  resyncStream (onResync) {
    this.routerTransactionManager.subscribe(`iov/video/${this.guid}/resync`, onResync);
  }

  /**
   * @async
   *
   * Get the list of available CLSP streams from the SFS
   *
   * Note - this isn't currently used anywhere
   *
   * @returns {Object}
   *   @todo
   */
  async getStreamList (cb) {
    this.logger.debug('Getting Stream List...');

    const {
      payloadString: streamList,
    } = await this.routerTransactionManager.transaction('iov/video/list');

    return streamList;
  }

  /**
   * @async
   *
   * Validate the hash that this conduit was constructed with.
   *
   * @returns {String}
   *   the stream name
   */
  async validateHash () {
    this.logger.debug('Validating Hash...');

    // response ->  {"status": 200, "target_url": "clsp://sfs1/fakestream", "error": null}
    const {
      payloadString: response,
    } = await this.routerTransactionManager.transaction('iov/hashValidate', {
      b64HashURL: this.streamConfiguration.tokenConfig.b64HashAccessUrl,
      token: this.streamConfiguration.tokenConfig.hash,
    });

    if (response.status === 401) {
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
   * @async
   *
   * Get the `guid` and `mimeCodec` for the stream.  The guid serves as a stream
   * instance for a given camera or video feed, and is needed to make requests
   * for the stream instance.
   *
   * @returns {Object}
   *   The video metadata, including the `guid` and `mimeCodec` properties.
   */
  async requestStreamData () {
    this.logger.debug('Requesting Stream...');

    const {
      payloadString: videoMetaData,
    } = await this.routerTransactionManager.transaction(
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
   * @async
   *
   * Request the moov from the SFS
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
    } = await this.routerTransactionManager.transaction(
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
      this.routerTransactionManager.subscribe(moofReceivedTopic, (clspMessage) => {
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
          this.routerConnectionManager.reconnect();
        }, this.MOOF_TIMEOUT_DURATION * 1000);

        onMoof(clspMessage);
      });
    });
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

    const handler = this.routerTransactionManager.subscribeHandlers[topic];

    if (!handler) {
      throw new Error(`No handler for ${topic}`);
    }

    handler(message);
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
  onMessage (eventType, event) {
    try {
      switch (eventType) {
        case RouterStreamManager.routerEvents.DATA_RECEIVED: {
          this._onClspData(event.data);
          break;
        }
        default: {
          this.logger.info(`RouterStreamManager called with unknown eventType: ${eventType}`);
        }
      }
    }
    catch (error) {
      this.logger.error('Error while receiving message from Router:');
      this.logger.error(error);
    }
  }

  /**
   * @async
   *
   * Clean up and dereference the necessary properties.  Will also stop the
   * stream.
   *
   * @returns {void}
   */
  async destroy () {
    if (this.isDestroyed) {
      return;
    }

    this.isDestroyed = true;

    try {
      await this.stop();
    }
    catch (error) {
      this.logger.error('Failed to stop when destroying!');
      this.logger.error(error);
    }

    this.streamConfiguration = null;
    this.routerTransactionManager = null;

    this.streamName = null;
    this.moovRequestTopic = null;
    this.guid = null;

    this.firstMoofTimeout = null;
    this.moofTimeout = null;

    super._destroy();
  }
}
