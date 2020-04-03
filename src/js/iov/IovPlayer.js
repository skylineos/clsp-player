'use strict';

import uuidv4 from 'uuid/v4';

import ConduitCollection from '../conduit/ConduitCollection';
import MSEWrapper from './MSEWrapper';
import Logger from '../utils/logger';
import StreamConfiguration from './StreamConfiguration';
import utils from '../utils';

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
export default class IovPlayer {
  static EVENT_NAMES = [
    'metric',
    'unsupportedMimeCodec',
    'firstFrameShown',
    'videoReceived',
    'videoInfoReceived',
  ];

  static METRIC_TYPES = [
    'sourceBuffer.bufferTimeEnd',
    'video.currentTime',
    'video.drift',
    'video.driftCorrection',
    'video.segmentInterval',
    'video.segmentIntervalAverage',
  ];

  static factory (
    logId,
    videoElement,
    onConduitMessageError,
    onPlayerError,
  ) {
    return new IovPlayer(
      logId,
      videoElement,
      onConduitMessageError,
      onPlayerError,
    );
  }

  constructor (
    logId,
    videoElement,
    onConduitMessageError = this.onConduitMessageError,
    onPlayerError = this.onPlayerError,
  ) {
    this.logId = logId;
    this.logger = Logger().factory(`Iov Player ${this.logId}`);

    this.logger.debug('constructor');

    this.metrics = {};

    // @todo - there must be a more proper way to do events than this...
    this.events = {};

    for (let i = 0; i < IovPlayer.EVENT_NAMES.length; i++) {
      this.events[IovPlayer.EVENT_NAMES[i]] = [];
    }

    this.videoElement = videoElement;

    this.conduitCount = 0;
    this.conduit = null;
    this.streamConfiguration = null;

    this.onConduitMessageError = onConduitMessageError;
    this.onPlayerError = onPlayerError;
    this.firstFrameShown = false;
    this.stopped = false;

    // Used for determining the size of the internal buffer hidden from the MSE
    // api by recording the size and time of each chunk of video upon buffer append
    // and recording the time when the updateend event is called.
    this.LogSourceBuffer = false;
    this.LogSourceBufferTopic = null;

    this.latestSegmentReceived = null;
    this.segmentIntervalAverage = null;
    this.segmentInterval = null;
    this.segmentIntervals = [];

    this.mseWrapper = null;
    this.moov = null;

    // These can be configured manually after construction
    this.ENABLE_METRICS = DEFAULT_ENABLE_METRICS;
    this.SEGMENT_INTERVAL_SAMPLE_SIZE = DEFAULT_SEGMENT_INTERVAL_SAMPLE_SIZE;
    this.DRIFT_CORRECTION_CONSTANT = DEFAULT_DRIFT_CORRECTION_CONSTANT;
  }

  on (name, action) {
    this.logger.debug(`Registering Listener for ${name} event...`);

    if (!IovPlayer.EVENT_NAMES.includes(name)) {
      throw new Error(`"${name}" is not a valid event."`);
    }

    if (this.destroyed) {
      return;
    }

    this.events[name].push(action);
  }

  trigger (name, value) {
    const sillyMetrics = [
      'metric',
      'videoReceived',
    ];

    if (sillyMetrics.includes(name)) {
      this.logger.silly(`Triggering ${name} event...`);
    }
    else {
      this.logger.debug(`Triggering ${name} event...`);
    }

    if (this.destroyed) {
      return;
    }

    if (!IovPlayer.EVENT_NAMES.includes(name)) {
      throw new Error(`"${name}" is not a valid event."`);
    }

    for (let i = 0; i < this.events[name].length; i++) {
      this.events[name][i](value, this);
    }
  }

  metric (type, value) {
    if (!this.ENABLE_METRICS) {
      return;
    }

    if (!IovPlayer.METRIC_TYPES.includes(type)) {
      // @todo - should this throw?
      return;
    }

    switch (type) {
      case 'video.driftCorrection': {
        if (!this.metrics[type]) {
          this.metrics[type] = 0;
        }

        this.metrics[type] += value;

        break;
      }
      default: {
        this.metrics[type] = value;
      }
    }

    this.trigger('metric', {
      type,
      value: this.metrics[type],
    });
  }

  _onError (
    type,
    message,
    error,
  ) {
    this.logger.warn(
      type,
      ':',
      message,
    );
    this.logger.error(error);
  }

  generateConduitLogId () {
    return `${this.logId}.conduit:${++this.conduitCount}`;
  }

  onConduitReconnect = (error) => {
    if (error) {
      this.logger.error(error);
      // @todo - should we do anything else on error?
      return;
    }

    // @todo - is there a more performant way to do this?
    this.restart();
  };

  onPlayerError = (error) => {
    this.logger.error('Player Error!');
    this.logger.error(error);
  };

  onConduitMessageError = (error) => {
    this.logger.error('Conduit Message Error!');
    this.logger.error(error);
  };

  async initialize (streamConfiguration = this.streamConfiguration) {
    if (!StreamConfiguration.isStreamConfiguration(streamConfiguration)) {
      throw new Error('streamConfiguration is not valid');
    }

    this.logger.debug(`Initializing with ${streamConfiguration.streamName}`);

    this.streamConfiguration = streamConfiguration;

    // This MUST be globally unique!  The CLSP server will broadcast the stream
    // to a topic that contains this id, so if there is ANY other client
    // connected that has the same id anywhere in the world, the stream to all
    // clients that use that topic will fail.  This is why we use guids rather
    // than an incrementing integer.
    // It is now prefixed with `clsp-plugin-` to differentiate requests that
    // come from this plugin from others.
    // Note - this must not contain the '+' character
    // @todo - the caller should be able to provide a prefix or something
    this.clientId = `clsp-plugin-${utils.version.replace('+', '-build-')}-${uuidv4()}`;

    this.videoElement.id = this.clientId;
    this.videoElement.dataset.name = streamConfiguration.streamName;

    this.conduit = await ConduitCollection.asSingleton().create(
      this.generateConduitLogId(),
      this.clientId,
      this.streamConfiguration,
      this.videoElement.parentNode,
      this.onConduitReconnect,
      this.onConduitMessageError
    );

    await this.conduit.initialize();
  }

  _html5Play () {
    // @see - https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/play
    try {
      const promise = this.videoElement.play();

      if (typeof promise !== 'undefined') {
        promise.catch((error) => {
          this._onError(
            'play.promise',
            'Error while trying to play clsp video',
            error,
          );
        });
      }
    }
    catch (error) {
      this._onError(
        'play.notPromise',
        'Error while trying to play clsp video - the play operation was NOT a promise!',
        error,
      );
    }
  }

  async reinitializeMseWrapper (mimeCodec) {
    if (this.mseWrapper) {
      await this.mseWrapper.destroy();
    }

    this.mseWrapper = MSEWrapper.factory(this.videoElement);

    this.mseWrapper.on('metric', ({
      type,
      value,
    }) => {
      this.trigger('metric', {
        type,
        value,
      });
    });

    this.mseWrapper.initializeMediaSource({
      onSourceOpen: async () => {
        this.logger.debug('on mediaSource sourceopen');

        await this.mseWrapper.initializeSourceBuffer(mimeCodec, {
          onAppendStart: (byteArray) => {
            this.logger.silly('On Append Start...');

            // onAppendStart
            this.conduit.segmentUsed(byteArray);
          },
          onAppendFinish: (info) => {
            this.logger.silly('On Append Finish...');

            if (!this.firstFrameShown) {
              this.firstFrameShown = true;
              this.trigger('firstFrameShown');
            }

            this.drift = info.bufferTimeEnd - this.videoElement.currentTime;

            this.metric('sourceBuffer.bufferTimeEnd', info.bufferTimeEnd);
            this.metric('video.currentTime', this.videoElement.currentTime);
            this.metric('video.drift', this.drift);

            if (this.drift > ((this.segmentIntervalAverage / 1000) + this.DRIFT_CORRECTION_CONSTANT)) {
              this.metric('video.driftCorrection', 1);
              this.videoElement.currentTime = info.bufferTimeEnd;
            }

            if (this.videoElement.paused === true) {
              this.logger.debug('Video is paused!');

              this._html5Play();
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
            this._onError(
              'sourceBuffer.append',
              'Error while appending to sourceBuffer',
              error,
            );

            await this.reinitializeMseWrapper(mimeCodec);
          },
          onRemoveError: (error) => {
            if (error.constructor.name === 'DOMException') {
              // @todo - every time the mseWrapper is destroyed, there is a
              // sourceBuffer error.  No need to log that, but you should fix it
              return;
            }

            // observed this fail during a memry snapshot in chrome
            // otherwise no observed failure, so ignore exception.
            this._onError(
              'sourceBuffer.remove',
              'Error while removing segments from sourceBuffer',
              error,
            );
          },
          onStreamFrozen: async () => {
            this.logger.debug('stream appears to be frozen - reinitializing...');

            await this.reinitializeMseWrapper(mimeCodec);
          },
          onError: async (error) => {
            this._onError(
              'mediaSource.sourceBuffer.generic',
              'mediaSource sourceBuffer error',
              error,
            );

            await this.reinitializeMseWrapper(mimeCodec);
          },
        });

        this.trigger('videoInfoReceived');

        this.mseWrapper.appendMoov(this.moov);
      },
      onSourceEnded: async () => {
        this.logger.debug('on mediaSource sourceended');

        await this.stop();
      },
      onError: (error) => {
        this._onError(
          'mediaSource.generic',
          'mediaSource error',
          // @todo - sometimes, this error is an event rather than an error!
          // If different onError calls use different method signatures, that
          // needs to be accounted for in the MSEWrapper, and the actual error
          // that was thrown must ALWAYS be the first argument here.  As a
          // shortcut, we can log `...args` here instead.
          error,
        );
      },
    });

    if (!this.mseWrapper.mediaSource || !this.videoElement) {
      throw new Error('The video element or mediaSource is not ready!');
    }

    this.mseWrapper.reinitializeVideoElementSrc();
  }

  async restart () {
    this.logger.debug('restart');

    // @todo - this has not yet been tested for memory leaks

    // If the src attribute is missing, it means we must reinitialize.  This can
    // happen if the video was loaded while the page was not visible, e.g.
    // document.hidden === true, which can happen when switching tabs.
    // @todo - is there a more "proper" way to do this?
    const needToReinitialize = !this.videoElement.src;

    await this.stop();

    if (needToReinitialize) {
      if (this.conduit) {
        ConduitCollection.asSingleton().remove(this.clientId);
      }

      await this.initialize();
    }

    const playError = await this.play();

    if (playError) {
      return playError;
    }

    if (needToReinitialize) {
      this._html5Play();
    }
  }

  onMoof = (clspMessage) => {
    // @todo - this seems like a hack...
    if (this.stopped) {
      return;
    }

    this.trigger('videoReceived');
    this.getSegmentIntervalMetrics();

    // Sometimes, the first moof arrives before the mseWrapper has finished
    // being initialized, so we will need to drop those frames
    if (!this.mseWrapper) {
      return;
    }

    this.mseWrapper.append(clspMessage.payloadBytes);
  };

  /**
   * Note that if an error is thrown during play, the IovPlayer instance should
   * be destroyed to free resources.
   */
  async play () {
    this.logger.debug('play');

    this.stopped = false;

    if (!this.streamConfiguration) {
      this.logger.error('Cannot play a stream without a stream configuration');
      return;
    }

    let mimeCodec;
    let moov;

    try {
      ({
        // guid,
        mimeCodec,
        moov,
      } = await this.conduit.play(this.onMoof));
    }
    catch (error) {
      this.onPlayerError(error);

      // Don't throw here, since the error was handled.  Return the error to the
      // caller.
      return error;
    }

    if (!MSEWrapper.isMimeCodecSupported(mimeCodec)) {
      this.trigger('unsupportedMimeCodec', `Unsupported mime codec: ${mimeCodec}`);

      throw new Error(`Unsupported mime codec: ${mimeCodec}`);
    }

    this.moov = moov;

    await this.reinitializeMseWrapper(mimeCodec);

    this.conduit.resyncStream(() => {
      // console.log('sync received re-initialize media source buffer');
      this.reinitializeMseWrapper(mimeCodec);
    });
  }

  /**
   * @returns {Promise}
   */
  stop () {
    this.logger.debug('stop...');

    if (this.stopped) {
      return Promise.resolve();
    }

    this.stopped = true;
    this.moov = null;

    this.logger.debug('stop about to finish synchronous operations and return promise...');

    // The logic above MUST be run synchronously when called, therefore,
    // we cannot use async to define the stop method, and must return a
    // promise here rather than using await.  We return this promise so
    // that the caller has the option of waiting, but is not forced to
    // wait.
    return new Promise(async (resolve, reject) => {
      try {
        try {
          await this.conduit.stop();
        }
        catch (error) {
          this.logger.error('failed to stop the conduit');
          this.logger.error(error);
        }

        if (!this.mseWrapper) {
          this.logger.debug('stop succeeded asynchronously...');
          return resolve();
        }

        // Don't wait until the next play event or the destruction of this player
        // to clear the MSE
        await this.mseWrapper.destroy();

        this.mseWrapper = null;

        this.logger.debug('stop succeeded asynchronously...');
        resolve();
      }
      catch (error) {
        this.logger.error('stop failed asynchronously...');
        reject(error);
      }
    });
  }

  getSegmentIntervalMetrics () {
    const previousSegmentReceived = this.latestSegmentReceived;
    this.latestSegmentReceived = Date.now();

    if (previousSegmentReceived) {
      this.segmentInterval = this.latestSegmentReceived - previousSegmentReceived;
    }

    if (this.segmentInterval) {
      if (this.segmentIntervals.length >= this.SEGMENT_INTERVAL_SAMPLE_SIZE) {
        this.segmentIntervals.shift();
      }

      this.segmentIntervals.push(this.segmentInterval);

      let segmentIntervalSum = 0;

      for (let i = 0; i < this.segmentIntervals.length; i++) {
        segmentIntervalSum += this.segmentIntervals[i];
      }

      this.segmentIntervalAverage = segmentIntervalSum / this.segmentIntervals.length;

      this.metric('video.segmentInterval', this.segmentInterval);
      this.metric('video.segmentIntervalAverage', this.segmentIntervalAverage);
    }
  }

  enterFullscreen () {
    if (!window.document.fullscreenElement) {
      // Since the iov and player take control of the video element and its
      // parent, ask the parent for fullscreen since the video elements will be
      // destroyed and recreated when changing sources
      this.videoElement.parentNode.requestFullscreen();
    }
  }

  exitFullscreen () {
    if (window.document.exitFullscreen) {
      window.document.exitFullscreen();
    }
  }

  toggleFullscreen () {
    if (!window.document.fullscreenElement) {
      this.enterFullscreen();
    }
    else {
      this.exitFullscreen();
    }
  }

  _freeAllResources () {
    this.logger.debug('_freeAllResources...');

    ConduitCollection.asSingleton().remove(this.clientId);
    this.conduit = null;
    // The caller must destroy the streamConfiguration
    this.streamConfiguration = null;

    this.firstFrameShown = null;

    this.events = null;
    this.metrics = null;

    this.LogSourceBuffer = null;
    this.LogSourceBufferTopic = null;

    this.latestSegmentReceived = null;
    this.segmentIntervalAverage = null;
    this.segmentInterval = null;
    this.segmentIntervals = null;

    this.moov = null;

    this.logger.debug('_freeAllResources finished...');
  }

  /**
   * @returns {Promise}
   */
  destroy () {
    this.logger.debug('destroy...');

    if (this.destroyed) {
      return;
    }

    this.destroyed = true;

    // Note that we DO NOT wait for the stop command to finish execution,
    // because this destroy method MUST be treated as a synchronous operation
    // to ensure that the caller is not forced to wait on destruction.  This
    // allows us to properly support client side libraries and frameworks that
    // do not support asynchronous destruction.  See the comments in the destroy
    // method on the MSEWrapper for a more detailed explanation.
    this.logger.debug('about to stop...');

    const stopPromise = this.stop();

    // Setting the src of the video element to an empty string is
    // the only reliable way we have found to ensure that MediaSource,
    // SourceBuffer, and various Video elements are properly dereferenced
    // to avoid memory leaks
    // @todo - should these occur after stop? is there a reason they're done
    // in this order?
    this.videoElement.src = '';
    this.videoElement.parentNode.removeChild(this.videoElement);
    this.videoElement.remove();
    this.videoElement = null;

    this.logger.debug('exiting destroy, asynchronous destroy logic in progress...');

    return stopPromise
      .then(() => {
        this.logger.debug('stopped successfully...');
        this._freeAllResources();
        this.logger.debug('destroy successfully finished...');
      })
      .catch((error) => {
        this.logger.debug('stopped unsuccessfully...');
        this.logger.error('Error while destroying the iov player!');
        this.logger.error(error);
        this._freeAllResources();
        this.logger.debug('destroy unsuccessfully finished...');
      });
  }
}
