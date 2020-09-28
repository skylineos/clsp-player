/**
 * An orchestrator of MediaSources and Sourcebuffers.
 *
 * @see - https://developers.google.com/web/fundamentals/media/mse/basics
 * @see - https://github.com/nickdesaulniers/netfix/blob/gh-pages/demo/bufferAll.html
 */

import EventEmitter from '../../../utils/EventEmitter';
import utils from '../../../utils/utils';

import MediaSource from './MediaSource';
import SourceBuffer from './SourceBuffer';
// import { mp4toJSON } from './mp4-inspect';

const DEFAULT_APPENDS_WITH_SAME_TIME_END_THRESHOLD = 1;

export default class MSEWrapper extends EventEmitter {
  /**
   * Events that are emitted by this MSEWrapper
   */
  static events = {
    METRIC: 'metric',
    STREAM_FROZEN: 'stream-frozen',
    VIDEO_SEGMENT_SHOWN: 'video-segment-shown',
    SHOW_VIDEO_SEGMENT_ERROR: 'show-video-segment-error',
    MEDIA_SOURCE_ERROR: 'unexpected-media-source-error',
    SOURCE_BUFFER_ERROR: 'unexpected-source-buffer-error',
  };

  // @todo @metrics
  // static METRIC_TYPES = [
  //   'mediaSource.created',
  //   'mediaSource.destroyed',
  //   'objectURL.created',
  //   'objectURL.revoked',
  //   'mediaSource.reinitialized',
  //   'sourceBuffer.created',
  //   'sourceBuffer.destroyed',
  //   'queue.added',
  //   'queue.removed',
  //   'sourceBuffer.append',
  //   'error.sourceBuffer.append',
  //   'frameDrop.hiddenTab',
  //   'queue.mediaSourceNotReady',
  //   'queue.sourceBufferNotReady',
  //   'queue.shift',
  //   'queue.append',
  //   'sourceBuffer.lastKnownBufferSize',
  //   'sourceBuffer.trim',
  //   'sourceBuffer.trim.error',
  //   'sourceBuffer.updateEnd',
  //   'sourceBuffer.updateEnd.bufferLength.empty',
  //   'sourceBuffer.updateEnd.bufferLength.error',
  //   'sourceBuffer.updateEnd.removeEvent',
  //   'sourceBuffer.updateEnd.appendEvent',
  //   'sourceBuffer.updateEnd.bufferFrozen',
  //   'sourceBuffer.abort',
  //   'error.sourceBuffer.abort',
  //   'sourceBuffer.lastMoofSize',
  // ];

  /**
   * Create a new SourceBuffer, which is a wrapper around `window.SourceBuffer`
   *
   * @param {string|object} logId
   *   a string that identifies this SourceBuffer in log messages
   *   @see - src/js/utils/Destroyable
   */
  static factory (logId) {
    return new MSEWrapper(logId);
  }

  /**
   * @private
   *
   * Create a new SourceBuffer, which is a wrapper around `window.SourceBuffer`
   *
   * @param {string|object} logId
   *   a string that identifies this SourceBuffer in log messages
   *   @see - src/js/utils/Destroyable
   */
  constructor (logId) {
    super(logId);

    this.segmentQueue = [];
    this.sequenceNumber = 0;

    this.mediaSource = null;
    this.sourceBuffer = null;
    this.appendsSinceTimeEndUpdated = 0;

    // @todo @metrics
    // this.metrics = {};

    this.APPENDS_WITH_SAME_TIME_END_THRESHOLD = DEFAULT_APPENDS_WITH_SAME_TIME_END_THRESHOLD;
  }

  async initialize () {
    if (this.isDestroyed) {
      throw new Error('Tried to initialize while destroyed');
    }

    this.metric('mediaSource.created', 1);

    // Kill the existing media source
    await this.destroyMediaSource();

    this.mediaSource = MediaSource.factory(this.logId);

    this.mediaSource.on(MediaSource.events.ERROR, (event) => {
      this.emit(MSEWrapper.events.MEDIA_SOURCE_ERROR, event);
    });

    if (this.sourceBuffer) {
      this.sourceBuffer.abort();
    }
  }

  async initializeSourceBuffer (mimeCodec) {
    if (this.isDestroyed) {
      throw new Error('Tried to initialize source buffer while destroyed');
    }

    this.logger.info('initializeSourceBuffer...');

    try {
      await this.mediaSource.waitUntilReady();
    }
    catch (error) {
      this.logger.error('Cannot create the sourceBuffer if the mediaSource is not ready.');

      throw error;
    }

    if (this.sourceBuffer) {
      // Kill the existing source buffer
      // @todo - error handling?
      await this.sourceBuffer.destroy();
    }

    this.sourceBuffer = SourceBuffer.factory(
      this.logId,
      mimeCodec,
      this.mediaSource,
    );

    this.metric('sourceBuffer.created', 1);

    this.sourceBuffer.on(SourceBuffer.events.ERROR, (event) => {
      this.emit(MSEWrapper.events.SOURCE_BUFFER_ERROR, event);
    });

    this.sourceBuffer.on(SourceBuffer.events.UPDATE_END, (event) => {
      this.#onSourceBufferUpdateEnd();
    });

    this.sourceBuffer.on(SourceBuffer.events.DRIFT_THRESHOLD_EXCEEDED, (event) => {
      const {
        estimatedDrift,
        driftThreshold,
      } = event;

      this.logger.info(`Estimated drift of ${estimatedDrift} is above the ${driftThreshold} threshold.  Flushing queue...`);

      // @todo - perhaps we should re-add the last segment to the queue with a fresh
      // timestamp?  I think one cause of stream freezing is the sourceBuffer getting
      // starved, but I don't know if that's correct
      this.#flushQueue();
    });

    this.sourceBuffer.on(SourceBuffer.events.ABORT_ERROR, ({ error }) => {
      // @todo - what do we do here?
      this.logger.error('Error while aborting SourceBuffer!');
      this.logger.error(error);
    });
  }

  #flushQueue () {
    this.metric('queue.removed', this.segmentQueue.length + 1);
    this.segmentQueue = [];
  }

  #queueSegment (videoSegment) {
    if (this.segmentQueue.length) {
      this.logger.debug(`Queueing segment.  The queue currently has ${this.segmentQueue.length} segments.`);
    }
    else {
      this.logger.silly('Queueing segment.  The queue is currently empty.');
    }

    this.metric('queue.added', 1);

    this.segmentQueue.push({
      timestamp: Date.now(),
      byteArray: videoSegment,
    });
  }

  /**
   * The source buffer append operation may throw - it is up to the caller
   * to catch the error!
   */
  #processNextInQueue () {
    if (this.isDestroyed) {
      return;
    }

    this.logger.silly('#processNextInQueue');

    if (document[utils.windowStateNames.hiddenStateName]) {
      this.logger.debug('Tab not in focus - dropping frame...');
      this.metric('frameDrop.hiddenTab', 1);
      this.metric('queue.cannotProcessNext', 1);
      // @todo - we can safely drop frames here, right?
      // this.segmentQueue.shift();
      return;
    }

    // Do not wait until ready since we're dealing with a live stream
    if (!this.mediaSource.isReady()) {
      this.logger.info('The mediaSource is not ready');
      this.metric('queue.mediaSourceNotReady', 1);
      this.metric('queue.cannotProcessNext', 1);
      // @todo - we can safely drop frames here, right?
      // this.segmentQueue.shift();
      return;
    }

    // @todo - if the initialization logic was more properly implemented, this
    // check wouldn't be necessary
    if (!this.sourceBuffer) {
      this.logger.info('Tried to play before the SourceBuffer was initialized');
      return;
    }

    // Do not wait until ready since we're dealing with a live stream
    if (!this.sourceBuffer.isReady()) {
      this.logger.debug('The sourceBuffer is not ready');
      this.metric('queue.sourceBufferNotReady', 1);
      this.metric('queue.cannotProcessNext', 1);
      // @todo - we can safely drop frames here, right?
      // this.segmentQueue.shift();
      return;
    }

    // Only append a videoSegment if there is a videoSegment to append
    if (this.segmentQueue.length > 0) {
      this.logger.silly('appending to source buffer');
      this.metric('queue.shift', 1);
      this.metric('queue.canProcessNext', 1);
      this.sourceBuffer.append(this.segmentQueue.shift());
      return;
    }

    this.logger.debug('No videoSegments in queue');
  }

  #formatMoof (moof) {
    // We must overwrite the sequence number locally, because it
    // the sequence that comes from the server will not necessarily
    // start at zero.  It should start from zero locally.  This
    // requirement may have changed with more recent versions of the
    // browser, but it appears to make the video play a little more
    // smoothly
    moof[20] = (this.sequenceNumber & 0xFF000000) >> 24;
    moof[21] = (this.sequenceNumber & 0x00FF0000) >> 16;
    moof[22] = (this.sequenceNumber & 0x0000FF00) >> 8;
    moof[23] = this.sequenceNumber & 0xFF;

    return moof;
  }

  appendMoov (moov) {
    if (this.isDestroyed) {
      return;
    }

    this.logger.info('appendMoov');

    if (!moov) {
      throw new Error('Must provide a moov to append!');
    }

    this.metric('sourceBuffer.lastMoovSize', moov.length);

    // console.log(mp4toJSON(moov));

    this.metric('queue.appendMoov', 1);

    this.#queueSegment(moov);

    // This may throw - the caller must catch the error
    this.#processNextInQueue();
  }

  /**
   *
   * @param {*} videoSegment
   *   The moof / bytearray
   */
  showVideoSegment (videoSegment) {
    if (this.isDestroyed) {
      return;
    }

    this.logger.silly('showVideoSegment');

    if (!videoSegment) {
      throw new Error('Must provide a moov to append!');
    }

    this.metric('sourceBuffer.lastMoofSize', videoSegment.length);

    // console.log(mp4toJSON(videoSegment));

    this.metric('queue.append', 1);

    this.#queueSegment(this.#formatMoof(videoSegment));
    this.sequenceNumber++;

    // This may throw - the caller must catch the error
    this.#processNextInQueue();
  }

  #onSourceBufferTrimError (error) {
    this.metric('sourceBuffer.trim.error', 1);

    // observed this fail during a memry snapshot in chrome
    // otherwise no observed failure, so ignore exception.
    this.logger.warn('sourceBuffer.remove --> Error while trimming sourceBuffer');
    this.logger.error(error);
  }

  #onVideoSegmentShown (info) {
    if (!info) {
      throw new Error('Info must be passed to process video segment shown event!');
    }

    this.logger.silly('On video segment shown...');

    this.metric('sourceBuffer.updateEnd.appendEvent', 1);

    // The current buffer size should always be bigger.If it isn't, there is a problem,
    // and we need to reinitialize or something.  Sometimes the buffer is the same.  This is
    // allowed for consecutive appends, but only a configurable number of times.  The default
    // is 1
    this.logger.debug('Appends with same time end: ' + this.appendsSinceTimeEndUpdated);
    if (this.previousTimeEnd && info.bufferTimeEnd <= this.previousTimeEnd) {
      this.appendsSinceTimeEndUpdated += 1;
      this.metric('sourceBuffer.updateEnd.bufferFrozen', 1);

      // append threshold with same time end has been crossed.  Reinitialize frozen stream.
      if (this.appendsSinceTimeEndUpdated > this.APPENDS_WITH_SAME_TIME_END_THRESHOLD) {
        this.logger.info('stream frozen!');
        this.emit(MSEWrapper.events.STREAM_FROZEN);
        return;
      }
    }

    this.appendsSinceTimeEndUpdated = 0;
    this.previousTimeEnd = info.bufferTimeEnd;

    this.emit(MSEWrapper.events.VIDEO_SEGMENT_SHOWN, { info });

    try {
      this.sourceBuffer.trim(info);
    }
    catch (error) {
      this.#onSourceBufferTrimError(error);
    }
  }

  #onSourceBufferUpdateEnd () {
    this.logger.silly('onUpdateEnd');

    this.metric('sourceBuffer.updateEnd', 1);

    // @todo - it is likely possible to move the use of info here into the
    // SourceBuffer implementation to reduce coupling
    const info = this.sourceBuffer.getTimes();

    if (info.previousBufferSize !== null && info.previousBufferSize > this.sourceBuffer.timeBuffered) {
      // @todo - it appears that at one time, this was used for something,
      // maybe it was only ever for metrics.  What does this condition mean
      // in layman's terms, other than "a video segment was not shown as the
      // result of this sourceBuffer update"?
      this.metric('sourceBuffer.updateEnd.removeEvent', 1);
    }
    else {
      this.#onVideoSegmentShown(info);
    }

    try {
      this.#processNextInQueue();
    }
    catch (error) {
      this.logger.info('Error while showing video segment!');
      this.emit(MSEWrapper.events.SHOW_VIDEO_SEGMENT_ERROR, { error });
    }
  }

  // @todo - this logic needs to be consolidated into MediaSource or
  // SourceBuffer
  async destroyMediaSource () {
    if (!this.mediaSource) {
      return;
    }

    this.metric('sourceBuffer.destroyed', 1);

    this.logger.info('Destroying mediaSource...');

    try {
      if (this.sourceBuffer) {
        // We must do this PRIOR to the sourceBuffer being destroyed, to ensure that the
        // 'buffered' property is still available, which is necessary for completely
        // emptying the sourceBuffer.
        this.sourceBuffer.clear();
      }
    }
    catch (error) {
      this.#onSourceBufferTrimError(error);
    }

    try {
      if (this.sourceBuffer) {
        await this.sourceBuffer.waitUntilReady();
      }
    }
    catch (error) {
      this.logger.error('Error: sourceBuffer did not become ready, going to try to destry mediasource anyway!');
      this.logger.error(error);
    }

    await this.mediaSource.destroy();

    if (this.sourceBuffer) {
      // @todo - is this happening at the right time, or should it happen
      // prior to removing the source buffers?
      this.sourceBuffer.abort();
    }

    this.metric('mediaSource.destroyed', 1);
  }

  // @todo @metrics
  metric (type, value) {
    // if (!this.options || !this.options.enableMetrics) {
    //   return;
    // }

    // if (!MSEWrapper.METRIC_TYPES.includes(type)) {
    //   // @todo - should this throw?
    //   return;
    // }

    // switch (type) {
    //   case 'sourceBuffer.lastKnownBufferSize':
    //   case 'sourceBuffer.lastMoofSize': {
    //     this.metrics[type] = value;
    //     break;
    //   }
    //   default: {
    //     if (!Object.prototype.hasOwnProperty.call(this.metrics, type)) {
    //       this.metrics[type] = 0;
    //     }

    //     this.metrics[type] += value;
    //   }
    // }

    // this.trigger('metric', {
    //   type,
    //   value: this.metrics[type],
    // });
  }

  async _destroy () {
    try {
      await this.destroyMediaSource();
    }
    catch (error) {
      this.logger.error('Error while destroying mediaSource while destroying!');
      this.logger.error(error);
    }

    try {
      await this.sourceBuffer.destroy();
    }
    catch (error) {
      this.logger.error('Error while destroying sourceBuffer while destroying!');
      this.logger.error(error);
    }

    // We make NO assumptions here about what instance properties are
    // needed during the asynchronous destruction of the source buffer,
    // therefore we wait until it is finished to free all of these
    // resources.
    this.mediaSource = null;
    this.sourceBuffer = null;

    this.previousTimeEnd = null;
    this.segmentQueue = null;

    // @todo @metrics
    // this.metrics = null;

    await super._destroy();
  }
}
