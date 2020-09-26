import {
  v4 as uuidv4,
} from 'uuid';

import EventEmitter from '../../utils/EventEmitter';
import ClspClient from '../../ClspClient/ClspClient';
import MSEWrapper from './MSE/MSEWrapper';
import Logger from '../../utils/Logger';
import StreamConfiguration from '../StreamConfiguration';
import utils from '../../utils/utils';

const DEFAULT_ENABLE_METRICS = false;
const DEFAULT_SEGMENT_INTERVAL_SAMPLE_SIZE = 5;
const DEFAULT_DRIFT_CORRECTION_CONSTANT = 2;

/**
 * Responsible for receiving stream input and routing it to the media source
 * buffer for rendering on the video tag. There is some 'light' reworking of
 * the binary data that is required.
 *
 * @todo - this class should have no knowledge of videojs or its player, since
 * it is supposed to be capable of playing video by itself.  The plugin that
 * uses this player should have all of the videojs logic, and none should
 * exist here.
*/
export default class IovPlayer extends EventEmitter {
  /**
   * @static
   *
   * The events that this IovPlayer will emit.
   */
  static events = {
    METRIC: 'metric',
    UNSUPPORTED_MIME_CODEC: 'unsupportedMimeCodec',
    FIRST_FRAME_SHOWN: 'firstFrameShown',
    VIDEO_RECEIVED: 'videoReceived',
    VIDEO_INFO_RECEIVED: 'videoInfoReceived',
    IFRAME_DESTROYED_EXTERNALLY: 'IframeDestroyedExternally',
  }

  // @todo @metrics
  // static METRIC_TYPES = [
  //   'sourceBuffer.bufferTimeEnd',
  //   'video.currentTime',
  //   'video.drift',
  //   'video.driftCorrection',
  //   'video.intervalBetweenSegments',
  //   'video.segmentIntervalAverage',
  // ];

  /**
   * Construct a new IovPlayer
   *
   * @param {string} logId
   *   a string that identifies this IovPlayer in log messages
   * @param {HTMLElement} containerElement
   *   The container element that will contain the iframe
   * @param {HTMLElement} videoElement
   *   The video element that will be used to play the CLSP stream
   * @param {*} onClspClientRouterEventError
   *   A callback to call when there is a CLSP Client error
   * @param {*} onPlayError
   *   A callback to call when there is an IovPlayer play error
   */
  static factory (
    logId,
    containerElement,
    videoElement,
    onClspClientRouterEventError,
    onPlayError,
  ) {
    return new IovPlayer(
      logId,
      containerElement,
      videoElement,
      onClspClientRouterEventError,
      onPlayError,
    );
  }

  static generateClientId () {
    // This MUST be globally unique!  The CLSP server will broadcast the stream
    // to a topic that contains this id, so if there is ANY other client
    // connected that has the same id anywhere in the world, the stream to all
    // clients that use that topic will fail.  This is why we use guids rather
    // than an incrementing integer.
    //
    // We prefix it with the project name and version for server debugging
    // purposes.
    //
    // Note - this must not contain the '+' character
    // @todo - the caller should be able to provide a prefix or something
    return [
      utils.name,
      utils.version.replace('+', '-build-'),
      uuidv4(),
    ].join('--');
  }

  isInitialized = false;
  isInitializing = false;
  isRestarting = false;
  isTryingToPlay = false;
  isStopping = false;
  isStopped = false;

  clspClientCount = 0;
  clspClient = null;
  streamConfiguration = null;
  firstFrameShown = false;
  mseWrapper = null;
  moov = null;

  latestSegmentReceivedAt = null;
  segmentIntervalAverage = null;
  intervalBetweenSegments = null;
  segmentIntervals = [];

  ENABLE_METRICS = DEFAULT_ENABLE_METRICS;
  SEGMENT_INTERVAL_SAMPLE_SIZE = DEFAULT_SEGMENT_INTERVAL_SAMPLE_SIZE;
  DRIFT_CORRECTION_CONSTANT = DEFAULT_DRIFT_CORRECTION_CONSTANT;

  /**
   * @private
   *
   * Construct a new IovPlayer
   *
   * @param {string} logId
   *   a string that identifies this IovPlayer in log messages
   * @param {HTMLElement} containerElement
   *   The container element that will contain the iframe
   * @param {HTMLElement} videoElement
   *   The video element that will be used to play the CLSP stream
   * @param {*} onClspClientRouterEventError
   *   A callback to call when there is a CLSP Client error
   * @param {*} onPlayError
   *   A callback to call when there is an IovPlayer play error
   */
  constructor (
    logId,
    containerElement,
    videoElement,
    onClspClientRouterEventError,
    onPlayError,
  ) {
    super(logId);

    if (!onClspClientRouterEventError) {
      onClspClientRouterEventError = this.#onClspClientRouterEventError;
    }

    if (!onPlayError) {
      onPlayError = this.#onPlayError;
    }

    this.#constructorArgumentsBouncer(
      containerElement,
      videoElement,
      onClspClientRouterEventError,
      onPlayError,
    );

    this.containerElement = containerElement;
    this.videoElement = videoElement;
    this.#onClspClientRouterEventError = onClspClientRouterEventError;
    // @todo - even though this is here, it's never actually called.  We need
    // a way (an event) to determine when there has been some problem with the
    // CLSP stream at the conduit level...
    this.#onPlayError = onPlayError;

    // @todo @metrics
    // this.metrics = {};
  }

  /**
   * @private
   *
   * Throw an error if any constructor arguments are invalid.
   *
   * @see IovPlayer#constructor
   *
   * @returns {void}
   */
  #constructorArgumentsBouncer (
    containerElement,
    videoElement,
    onClspClientRouterEventError,
    onPlayError,
  ) {
    if (!containerElement) {
      throw new Error('Tried to construct without a container element');
    }

    if (!videoElement) {
      throw new Error('Tried to construct without a video element');
    }

    if (typeof onClspClientRouterEventError !== 'function') {
      throw new Error('Tried to construct with an invalid onClspClientRouterEventError');
    }

    if (typeof onPlayError !== 'function') {
      throw new Error('Tried to construct with an invalid onPlayError');
    }
  }

  setStreamConfiguration (streamConfiguration) {
    if (this.isDestroyed) {
      this.logger.error('Tried to setStreamConfiguration while destroyed');
      return;
    }

    if (!StreamConfiguration.isStreamConfiguration(streamConfiguration)) {
      throw new Error('Tried to set invalid streamConfiguration!');
    }

    this.streamConfiguration = streamConfiguration;
  }

  async initialize () {
    if (this.isDestroyed) {
      this.logger.error('Tried to initialize while destroyed');
      return;
    }

    if (this.isInitializing) {
      this.logger.info('Initialization already in progress');
      return;
    }

    this.isInitialized = false;
    this.isInitializing = true;

    this.logger.debug(`Initializing with ${this.streamConfiguration.streamName}`);

    try {
      this.clientId = IovPlayer.generateClientId();
      this.videoElement.id = this.clientId;
      this.videoElement.dataset.name = this.streamConfiguration.streamName;

      this.clspClient = null;

      this.clspClient = ClspClient.factory(
        this.#generateClspClientLogId(),
        this.clientId,
        this.streamConfiguration,
        this.containerElement,
      );

      // @todo - don't use the conduit events here

      this.clspClient.conduit.on(ClspClient.events.RECONNECT_SUCCESS, async () => {
        this.logger.info('ClspClient reconnected, restarting...');

        // @todo - is there a more performant way to do this?
        try {
          await this.restart();
        }
        catch (error) {
          this.logger.error('Error while restarting after reconnection!');
          this.logger.error(error);
        }
      });

      this.clspClient.conduit.on(ClspClient.events.RECONNECT_FAILURE, (data) => {
        this.logger.error('ClspClient Reconnect Failure!');
        this.logger.error(data.error);
      });

      this.clspClient.conduit.on(ClspClient.events.ROUTER_EVENT_ERROR, (data) => {
        this.#onClspClientRouterEventError(data.error, data);
      });

      this.clspClient.conduit.on(ClspClient.events.RESYNC_STREAM_COMPLETE, () => {
        this.logger.warn('Resyncing stream...');
        this.#reinitializeMseWrapper();
      });

      this.clspClient.conduit.on(ClspClient.events.VIDEO_SEGMENT_RECEIVED, (data) => {
        this.#showVideoSegment(data.clspMessage.payloadBytes);
      });

      this.clspClient.conduit.on(ClspClient.events.IFRAME_DESTROYED_EXTERNALLY, () => {
        this.events.emit(IovPlayer.events.IFRAME_DESTROYED_EXTERNALLY);
      });

      await this.clspClient.initialize();

      this.isInitialized = true;
    }
    finally {
      this.isInitializing = false;
    }
  }

  async restart () {
    // @todo - in the early return conditions, we should be throwing errors of
    // different types...
    if (this.isDestroyed) {
      this.logger.error('Tried to restart while destroyed');
      return;
    }

    if (this.isRestarting) {
      this.logger.info('Restart already in progress');
      return;
    }

    if (this.isInitializing) {
      this.logger.info('Cannot restart, initialization already in progress');
      return;
    }

    this.logger.debug('restart');

    this.isRestarting = true;

    try {
      // @todo - this has not yet been tested for memory leaks

      // If the src attribute is missing, it means we must reinitialize.  This can
      // happen if the video was loaded while the page was not visible, e.g.
      // document.hidden === true, which can happen when switching tabs.
      // @todo - is there a more "proper" way to do this?
      const needToReinitialize = !this.videoElement.src;

      await this.stop();

      if (needToReinitialize) {
        if (this.clspClient) {
          await this.clspClient.destroy();
        }

        await this.initialize();
      }

      await this.play();

      if (needToReinitialize) {
        try {
          await this.#html5Play();
        }
        catch (error) {
          this.logger.error('Error while trying to play CLSP video from video element...');
          throw error;
        }
      }
    }
    finally {
      this.isRestarting = false;
    }
  }

  /**
   * Note that if an error is thrown during play, the IovPlayer instance should
   * be destroyed to free resources.
   */
  async play () {
    if (this.isDestroyed) {
      this.logger.info('Tried to play while destroyed');
      return;
    }

    if (!this.isInitialized || this.isInitializing) {
      throw new Error('Tried to play before initializing!');
    }

    if (this.isStopping) {
      // @todo - what to do in this case?
    }

    if (this.isTryingToPlay) {
      this.logger.info('Already trying to play');
      return;
    }

    this.logger.debug('play');

    this.isTryingToPlay = true;

    try {
      const {
        mimeCodec,
        moov,
      } = await this.clspClient.conduit.play();

      if (!MediaSource.isMimeCodecSupported(mimeCodec)) {
        this.events.emit(IovPlayer.events.UNSUPPORTED_MIME_CODEC, {
          mimeCodec,
        });

        throw new Error(`Unsupported mime codec: ${mimeCodec}`);
      }

      this.moov = moov;
      this.mimeCodec = mimeCodec;

      await this.#reinitializeMseWrapper();

      this.isPlaying = true;
      this.isStopped = false;
    }
    finally {
      this.isTryingToPlay = false;
    }
  }

  /**
   * @returns {Promise}
   */
  async stop () {
    if (this.isDestroyComplete) {
      throw new Error('Tried to stop after destroyed!');
    }

    if (!this.isInitialized) {
      throw new Error('Tried to stop before initializing!');
    }

    if (this.isStopped) {
      this.logger.info('Already stopped');
      return;
    }

    if (this.isStopping) {
      this.logger.info('Already stopping');
      return;
    }

    this.logger.debug('stop...');

    this.isStopping = true;
    this.moov = null;

    try {
      try {
        await this.clspClient.conduit.stop();
      }
      catch (error) {
        this.logger.error('failed to stop the clspClient');
        this.logger.error(error);
      }

      if (!this.mseWrapper) {
        this.logger.debug('stop succeeded...');
        return;
      }

      // Don't wait until the next play event or the destruction of this player
      // to clear the MSE
      await this.mseWrapper.destroy();

      this.mseWrapper = null;

      this.logger.debug('stop succeeded...');
    }
    catch (error) {
      this.logger.error('stop failed...');

      throw error;
    }
    finally {
      this.isStopping = false;
      // @todo - it may not be stopped...
      this.isStopped = true;
    }
  }

  async #reinitializeMseWrapper () {
    if (this.mseWrapper) {
      await this.mseWrapper.destroy();
    }

    this.mseWrapper = null;

    this.mseWrapper = MSEWrapper.factory(this.videoElement);

    this.mseWrapper.on(MSEWrapper.events.METRIC, ({
      type,
      value,
    }) => {
      this.#metric(type, value);
    });

    this.mseWrapper.mediaSource.on(MediaSource.events.SOURCE_OPEN, async (event) => {
      this.logger.debug('on mediaSource sourceopen');

      await this.mseWrapper.initializeSourceBuffer(this.mimeCodec, {
        onAppendStart: (byteArray) => {
          this.logger.silly('On Append Start...');

          this.clspClient.conduit.segmentUsed(byteArray);
        },
        onAppendFinish: async (info) => {
          this.logger.silly('On Append Finish...');

          if (!this.firstFrameShown) {
            this.firstFrameShown = true;
            this.events.emit(IovPlayer.events.FIRST_FRAME_SHOWN);
          }

          this.drift = info.bufferTimeEnd - this.videoElement.currentTime;

          this.#metric('sourceBuffer.bufferTimeEnd', info.bufferTimeEnd);
          this.#metric('video.currentTime', this.videoElement.currentTime);
          this.#metric('video.drift', this.drift);

          if (this.drift > ((this.segmentIntervalAverage / 1000) + this.DRIFT_CORRECTION_CONSTANT)) {
            this.#metric('video.driftCorrection', 1);
            this.videoElement.currentTime = info.bufferTimeEnd;
          }

          if (this.videoElement.paused === true) {
            this.logger.debug('Video is paused!');

            try {
              await this.#html5Play();
            }
            catch (error) {
              this.logger.error('Error while trying to play CLSP video from video element...');
              throw error;
            }
          }
        },
        onRemoveFinish: (info) => {
          this.logger.debug('onRemoveFinish');
        },
        onAppendError: async (error) => {
          // internal error, this has been observed to happen the tab
          // in the browser where this video player lives is hidden
          // then reselected. 'ex' is undefined the error is bug
          // within the MSE C++ implementation in the browser.
          this.logger.warn('sourceBuffer.append', 'Error while appending to sourceBuffer');
          this.logger.error(error);

          await this.#reinitializeMseWrapper();
        },
        onRemoveError: (error) => {
          if (error.constructor.name === 'DOMException') {
            // @todo - every time the mseWrapper is destroyed, there is a
            // sourceBuffer error.  No need to log that, but you should fix it
            return;
          }

          // observed this fail during a memry snapshot in chrome
          // otherwise no observed failure, so ignore exception.
          this.logger.warn('sourceBuffer.remove', 'Error while removing segments from sourceBuffer');
          this.logger.error(error);
        },
        onStreamFrozen: async () => {
          this.logger.debug('stream appears to be frozen - reinitializing...');

          await this.#reinitializeMseWrapper();
        },
        onError: async (error) => {
          this.logger.warn('mediaSource.sourceBuffer.generic', 'mediaSource sourceBuffer error');
          this.logger.error(error);

          await this.#reinitializeMseWrapper();
        },
      });

      this.events.emit(IovPlayer.events.VIDEO_INFO_RECEIVED);

      this.mseWrapper.appendMoov(this.moov);
    });

    this.mseWrapper.mediaSource.on(MediaSource.events.SOURCE_ENDED, async (event) => {
      this.logger.debug('on mediaSource sourceended');

      await this.stop();
    });

    this.mseWrapper.mediaSource.on(MediaSource.events.ERROR, (event) => {
      this.logger.warn('mediaSource.generic -> mediaSource error');

      // @todo - sometimes, this error is an event rather than an error!
      // If different onError calls use different method signatures, that
      // needs to be accounted for in the MSEWrapper, and the actual error
      // that was thrown must ALWAYS be the first argument here.  As a
      // shortcut, we can log `...args` here instead.
      this.logger.error(event);
    });

    try {
      this.mseWrapper.initializeMediaSource();
    }
    catch (error) {
      // @todo - now what?
    }

    this.mseWrapper.reinitializeVideoElementSrc();
  }

  async #html5Play () {
    // @see - https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/play
    await this.videoElement.play();
  }

  #generateClspClientLogId () {
    return `${this.logId}.clspClient:${++this.clspClientCount}`;
  }

  #onClspClientRouterEventError = (error) => {
    this.logger.error('Router Event Error!');
    this.logger.error(error);
  };

  #onPlayError = (error) => {
    this.logger.error('Player Error!');
    this.logger.error(error);
  };

  #showVideoSegment (videoSegement) {
    // @todo - this seems like a hack...
    if (this.isStopped) {
      return;
    }

    this.events.emit(IovPlayer.events.VIDEO_RECEIVED);
    // @todo @metrics
    this.#getSegmentIntervalMetrics();

    // Sometimes, the first moof arrives before the mseWrapper has finished
    // being initialized, so we will need to drop those frames
    if (!this.mseWrapper) {
      return;
    }

    // If the document is hidden, don't pass the moofs to the appropriate
    // handler. The moofs occur at a rate that will exhaust the browser
    // tab resources, ultimately resulting in a crash if given enough time.
    // @todo - this check should probably be moved to the MSEWrapper
    if (document[utils.windowStateNames.hiddenStateName]) {
      this.logger.info('Document is in hidden state, not appending moof');
      return;
    }

    this.mseWrapper.append(videoSegement);
  };

  /**
   * @private
   *
   * Track segment interval metrics to help account for drift
   *
   * @returns {void}
   */
  #getSegmentIntervalMetrics () {
    if (!this.latestSegmentReceivedAt) {
      this.latestSegmentReceivedAt = Date.now();
      return;
    }

    const previousSegmentReceivedAt = this.latestSegmentReceivedAt;
    this.latestSegmentReceivedAt = Date.now();

    this.intervalBetweenSegments = this.latestSegmentReceivedAt - previousSegmentReceivedAt;

    // @todo - Do we really need to check for the case where two segments
    // arrive at exactly the same time?
    if (!this.intervalBetweenSegments) {
      return;
    }

    if (this.segmentIntervals.length >= this.SEGMENT_INTERVAL_SAMPLE_SIZE) {
      this.segmentIntervals.shift();
    }

    this.segmentIntervals.push(this.intervalBetweenSegments);

    let segmentIntervalSum = 0;

    for (let i = 0; i < this.segmentIntervals.length; i++) {
      segmentIntervalSum += this.segmentIntervals[i];
    }

    this.segmentIntervalAverage = segmentIntervalSum / this.segmentIntervals.length;

    this.#metric('video.intervalBetweenSegments', this.intervalBetweenSegments);
    this.#metric('video.segmentIntervalAverage', this.segmentIntervalAverage);
  }

  // @todo @metrics
  /**
   * @private
   *
   * @deprecated
   */
  #metric (type, value) {
    // if (!this.ENABLE_METRICS) {
    //   return;
    // }

    // if (!IovPlayer.METRIC_TYPES.includes(type)) {
    //   // @todo - should this throw?
    //   return;
    // }

    // switch (type) {
    //   case 'video.driftCorrection': {
    //     if (!this.metrics[type]) {
    //       this.metrics[type] = 0;
    //     }

    //     this.metrics[type] += value;

    //     break;
    //   }
    //   default: {
    //     this.metrics[type] = value;
    //   }
    // }

    // this.trigger('metric', {
    //   type,
    //   value: this.metrics[type],
    // });
  }

  /**
   * @async
   */
  async _destroy () {
    try {
      await this.stop();
    }
    catch (error) {
      this.logger.error('Error encountered while trying to stop during Iov Player destroy, continuing with destroy...');
      this.logger.error(error);
    }

    await this.clspClient.destroy();

    this.clspClient = null;
    // The caller must destroy the streamConfiguration
    this.streamConfiguration = null;

    this.firstFrameShown = null;

    this.moov = null;

    this.latestSegmentReceivedAt = null;
    this.segmentIntervalAverage = null;
    this.intervalBetweenSegments = null;
    this.segmentIntervals = null;

    // @todo @metrics
    // this.metrics = null;

    await super._destroy();
  }
}
