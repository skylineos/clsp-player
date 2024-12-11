/**
 * A wrapper for the default browser `window.SourceBuffer` class
 *
 * @see - https://developers.google.com/web/fundamentals/media/mse/basics
 * @see - https://github.com/nickdesaulniers/netfix/blob/gh-pages/demo/bufferAll.html
 */

import interval from 'interval-promise';

import EventEmitter from '../../../utils/EventEmitter';

// This is the original error text, but it is subject to change by chrome,
// and we are only checking the part of the error text that contains no
// punctuation (and is all lower case).
// "Failed to execute 'appendBuffer' on 'SourceBuffer': The SourceBuffer is full,
// and cannot free space to append additional buffers.";
const FULL_BUFFER_ERROR = 'and cannot free space to append additional buffers';

// Check at this interval to see if the SourceBuffer is ready
const DEFAULT_IS_READY_INTERVAL = 0.25;
// Give the SourceBuffer this many seconds to become ready
const DEFAULT_IS_READY_TIMEOUT = 10;

const DEFAULT_DRIFT_THRESHOLD = 2;
const DEFAULT_BUFFER_TRUNCATE_FACTOR = 2;

export default class SourceBuffer extends EventEmitter {
  /**
   * Events that are emitted by this SourceBuffer
   */
  static events = {
    // --- Custom Events
    ABORT_ERROR: 'abort-error',
    DRIFT_THRESHOLD_EXCEEDED: 'drift-threshold-exceeded',
    // --- MSE Source Buffer Events
    // @todo - create an event name that makes sense in layman's terms, such
    // as "???" either here or in MSEWrapper
    UPDATE_END: 'updateend',
    ERROR: 'error',
  };

  static getDefaultBufferSizeLimit () {
    // These default buffer values provide the best results in my testing.
    // It keeps the memory usage as low as is practical, and rarely causes
    // the video to stutter.
    return 90 + Math.floor(Math.random() * (200));
  }

  /**
   * Create a new SourceBuffer, which is a wrapper around `window.SourceBuffer`
   *
   * @param {string|object} logId
   *   a string that identifies this SourceBuffer in log messages
   *   @see - src/js/utils/Destroyable
   * @param {string} mimeCodec
   *   The mime codec of the stream
   * @param {MediaSource} mediaSource
   *   The MediaSource instance to which this SourceBuffer instance will be
   *   added
   */
  static factory (
    logId,
    mimeCodec,
    mediaSource,
  ) {
    return new SourceBuffer(
      logId,
      mimeCodec,
      mediaSource,
    );
  }

  mimeCodec = null;
  mediaSource = null;

  sourceBuffer = null;
  timeBuffered = null;

  /**
   * @private
   *
   * Create a new SourceBuffer, which is a wrapper around `window.SourceBuffer`
   *
   * @param {string|object} logId
   *   a string that identifies this SourceBuffer in log messages
   *   @see - src/js/utils/Destroyable
   * @param {string} mimeCodec
   *   The mime codec of the stream
   * @param {MediaSource} mediaSource
   *   The MediaSource instance to which this SourceBuffer instance will be
   *   added
   */
  constructor (
    logId,
    mimeCodec,
    mediaSource,
  ) {
    super(logId);

    if (!mimeCodec) {
      throw new Error('`mimeCodec` is required to instantiate a SourceBuffer');
    }

    if (!mediaSource) {
      throw new Error('`mediaSource` is required to instantiate a SourceBuffer');
    }

    this.mimeCodec = mimeCodec;
    this.mediaSource = mediaSource;
    // @todo - should the MediaSource be responsible for this?
    this.sourceBuffer = this.mediaSource.mediaSource.addSourceBuffer(this.mimeCodec);
    this.sourceBuffer.mode = 'sequence';

    this.sourceBuffer.addEventListener('updateend', this.#onUpdateEnd);
    this.sourceBuffer.addEventListener('error', this.#onError);

    this.IS_READY_INTERVAL = DEFAULT_IS_READY_INTERVAL;
    this.IS_READY_TIMEOUT = DEFAULT_IS_READY_TIMEOUT;
    this.DRIFT_THRESHOLD = DEFAULT_DRIFT_THRESHOLD;
    this.BUFFER_SIZE_LIMIT = SourceBuffer.getDefaultBufferSizeLimit();
    this.BUFFER_TRUNCATE_VALUE = parseInt(this.BUFFER_SIZE_LIMIT / DEFAULT_BUFFER_TRUNCATE_FACTOR);
  }

  /**
   * Determine if this SourceBuffer is ready to start accepting video segments.
   *
   * @returns {boolean}
   *   - true if readyState is "open"
   *   - false if readyState is not "open"
   */
  isReady () {
    if (this.isDestroyComplete) {
      return false;
    }

    return this.sourceBuffer.updating === false;
  }

  /**
   * @async
   *
   * Wait for this SourceBuffer to become ready.
   *
   * @returns {void}
   */
  async waitUntilReady () {
    if (this.isDestroyComplete) {
      throw new Error('SourceBuffer will not become ready because it has already been destroyed');
    }

    if (this.isReady()) {
      return;
    }

    await interval(
      async (iteration, stop) => {
        if (this.isReady()) {
          stop();
        }
      },
      this.IS_READY_INTERVAL * 1000,
      {
        iterations: (this.IS_READY_TIMEOUT / this.IS_READY_INTERVAL),
      },
    );

    if (!this.isReady()) {
      throw new Error('SourceBuffer `updating` timed out!');
    }
  }

  /**
   * Append a video segment to the MSE SourceBuffer's internal buffer, which
   * will then display it as video in the browser.
   *
   * @param {object} queuedVideoSegment
   *   The video segment from the MSE queue that is to be shown
   */
  append (queuedVideoSegment) {
    if (this.isDestroyComplete) {
      return;
    }

    this.logger.silly('Appending to the sourceBuffer...');

    const {
      timestamp,
      byteArray,
    } = queuedVideoSegment;

    const estimatedDrift = (Date.now() - timestamp) / 1000;

    if (estimatedDrift > this.DRIFT_THRESHOLD) {
      this.emit(SourceBuffer.events.DRIFT_THRESHOLD_EXCEEDED, {
        estimatedDrift,
        driftThreshold: this.DRIFT_THRESHOLD,
      });
      return;
    }

    this.logger.silly(`Appending to the buffer with an estimated drift of ${estimatedDrift}`);

    // this.metric('sourceBuffer.append', 1);

    try {
      // never encountered this block but docs say you shouldn't append when the sourcebuffer is  updating
      if (this.sourceBuffer.updating) {
        this.logger.warn('Source buffer is still updating! Cannot append!');
        return;
      }
      this.sourceBuffer.appendBuffer(byteArray);
    }
    catch (error) {
      // This try block accounts for the possibility that the clear operation
      // throws.
      try {
        if (error.message && error.message.toLowerCase().includes(FULL_BUFFER_ERROR)) {
          // @todo - make this a valid metric
          // this.metric('error.sourceBuffer.filled', 1);

          // If the buffer is full, we will flush it
          this.logger.warn('source buffer is full, about to flush it...');
          this.clear();
        }
        else {
          throw error;
        }
      }
      finally {
        this.metric('error.sourceBuffer.append', 1);
      }
    }
  }

  /**
   * Schedule an abort for the next possible time.
   *
   * @returns {void}
   */
  abort () {
    this.shouldAbortOnNextUpdateEnd = true;
  }

  /** Detect a gap in the buffered time ranges */
  gapInBufferedRanges (rangeIndex) {
    const bufferedRanges = this.sourceBuffer.buffered;

    // only a single range present
    if (bufferedRanges.length <= 1) {
      return false;
    }

    const currentEnd = bufferedRanges.end(rangeIndex);
    const nextStart = bufferedRanges.start(rangeIndex + 1);

    // compare against the next range and see if there's a hole
    const gap = nextStart - currentEnd;
    if (gap > 0) {
      return true;
    }

    return false;
  }

  /**
   * Calculate size and time information about the current state of the buffer.
   *
   * @todo - provide better description
   */
  getTimes () {
    if (this.isDestroyComplete) {
      return null;
    }

    this.logger.silly('getBufferTimes...');
    const bufferTimesAry = [];

    try {
      const previousBufferSize = this.timeBuffered;
      const bufferedRanges = this.sourceBuffer.buffered;

      this.logger.debug('this.sourceBuffer.buffered length: ' + bufferedRanges.length);

      for (let i = 0; i < bufferedRanges.length; i++) {
        this.logger.info(`Range ${i}: ${bufferedRanges.start(i)} to ${bufferedRanges.end(i)} seconds`);
        const bufferTimeStart = bufferedRanges.start(i);
        const bufferTimeEnd = bufferedRanges.end(i);
        const currentBufferSize = bufferTimeEnd - bufferTimeStart;
        bufferTimesAry.push({
          previousBufferSize,
          currentBufferSize,
          bufferTimeStart,
          bufferTimeEnd,
        });
      }
      const lastRange = bufferedRanges.length - 1;
      this.timeBuffered = (bufferedRanges.end(lastRange) - bufferedRanges.start(lastRange));
      this.logger.silly('getBufferTimes finished successfully...');

      return bufferTimesAry;
    }
    catch (error) {
      this.logger.info('Failed to getBufferTimes...');

      return null;
    }
  }

  /**
   * Trim the SourceBuffer to help with memory management and to help keep the
   * video stream near-real time (?)
   *
   * @todo - under what circumstances should this be called?  Right now, it is
   * called after EVERY UPDATE_END event!  Is that correct / necessary? Maybe
   * it should only be called every other time, or every 5th time...
   *
   * @param {object[]|null} info
   *   optional, SourceBuffer time info
   * @param {boolean} shouldClear
   *   optional, defaults to false
   *   if true, will clear the entire SourceBuffer's internal buffer
   */
  trim (
    infoAry = this.getTimes(),
    shouldClear = false,
  ) {
    if (this.isDestroyComplete) {
      return;
    }

    for (let infoIdx = 0; infoIdx < infoAry.length; infoIdx++) {
      const info = infoAry[infoIdx];
      if (!info) {
        this.logger.debug('Tried to trim buffer, failed to get buffer times...');
        return;
      }
      this.logger.silly('trimBuffer...');

      this.metric('sourceBuffer.lastKnownBufferSize', this.timeBuffered);

      const shouldTrim = shouldClear || (this.timeBuffered > this.BUFFER_SIZE_LIMIT) ||
       this.gapInBufferedRanges(infoIdx);

      if (!shouldTrim) {
        this.logger.debug('No need to trim');
        return;
      }

      // @todo - should we wait for isReady here?
      if (!this.isReady()) {
        this.logger.info('Need to trim, but not ready...');
        return;
      }

      try {
        // @todo - Trimming is the biggest performance problem we have with this
        // player. Can you figure out how to manage the memory usage without
        // causing the streams to stutter?
        this.metric('sourceBuffer.trim', this.BUFFER_TRUNCATE_VALUE);

        if (shouldClear) {
          this.logger.debug('Clearing buffer...');
          this.sourceBuffer.remove(info.bufferTimeStart, Infinity);
          this.logger.debug('Successfully cleared buffer...');
        }
        else {
          const trimEndTime = info.bufferTimeStart + this.BUFFER_TRUNCATE_VALUE;

          this.logger.debug('Trimming buffer...');
          this.sourceBuffer.remove(info.bufferTimeStart, trimEndTime);
          this.logger.debug('Successfully trimmed buffer...');
        }
      }
      catch (error) {
        if (error.constructor.name === 'DOMException') {
          this.logger.info('Encountered DOMException while trying to trim buffer');
          // @todo - every time the mseWrapper is destroyed, there is a
          // sourceBuffer error.  No need to log that, but you should fix it
          return;
        }

        this.logger.debug('trimBuffer failure!');

        throw error;
      }
    }
  }

  /**
   * Completely clear / flush the SourceBuffer's internal buffer.
   *
   * To be called when the buffer is full, prior to the destruction of the
   * parent MediaSource, and during destruction of this SourceBuffer.
   *
   * @todo - it would be better if we could either destroy the SourceBuffer
   * before destroying the parent MediaSource...
   */
  clear () {
    this.logger.info('Clearing buffer...');
    this.trim(undefined, true);
  }

  /**
   * Event listener for the `updateend` event from the window.SourceBuffer
   * instance
   *
   * @param {objec} event
   */
  #onUpdateEnd = (event) => {
    if (this.isDestroyComplete) {
      throw new Error('Received `updateend` event while destroyed!');
    }

    if (this.shouldAbortOnNextUpdateEnd) {
      try {
        this.metric('sourceBuffer.abort', 1);

        this.sourceBuffer.abort();

        this.shouldAbortOnNextUpdateEnd = false;
      }
      catch (error) {
        this.metric('error.sourceBuffer.abort', 1);

        this.emit(SourceBuffer.events.ABORT_ERROR, { error });
      }
    }

    try {
      // Sometimes the mediaSource is removed while an update is being
      // processed, resulting in an error when trying to read the
      // "buffered" property.
      if (this.sourceBuffer.buffered.length <= 0) {
        this.metric('sourceBuffer.updateEnd.bufferLength.empty', 1);
        this.logger.debug('After updating, the sourceBuffer has no length!');
        return;
      }
    }
    catch (error) {
      // @todo - do we need to handle this?
      this.metric('sourceBuffer.updateEnd.bufferLength.error', 1);
      this.logger.debug('The mediaSource was removed while an update operation was occurring.');
      return;
    }

    this.emit(SourceBuffer.events.UPDATE_END, event);
  };

  /**
   * Event listener for the `error` event from the window.SourceBuffer instance
   *
   * @param {objec} event
   */
  #onError = (event) => {
    this.emit(SourceBuffer.events.ERROR, event);
  };

  // @todo @metrics
  metric () {}

  async _destroy () {
    // We must abort in the final updateend listener to ensure that
    // any operations, especially the remove operation, finish first,
    // as aborting while removing is deprecated.
    await new Promise((resolve, reject) => {
      const finish = () => {
        this.sourceBuffer.removeEventListener('updateend', finish);

        resolve();
      };

      if (!this.sourceBuffer) {
        return resolve();
      }

      this.sourceBuffer.addEventListener('updateend', finish);

      this.abort();

      // @todo - this is a hack - sometimes, the trimBuffer operation does not cause an update
      // on the sourceBuffer.  This acts as a timeout to ensure the destruction of this mseWrapper
      // instance can complete.
      this.logger.debug('giving sourceBuffer some time to finish updating itself...');
      setTimeout(finish, 1000);
    });

    try {
      this.clear();
    }
    catch (error) {
      this.logger.error('Error while clearing the buffer while destroying, continuing destroy anyway...');
      this.logger.error(error);
    }

    this.sourceBuffer.removeEventListener('updateend', this.#onUpdateEnd);
    this.sourceBuffer.removeEventListener('error', this.#onError);

    // this.mediaSource.mediaSource.removeSourceBuffer(this.sourceBuffer);

    this.mimeCodec = null;
    this.mediaSource = null;

    this.sourceBuffer = null;
    this.timeBuffered = null;

    await super._destroy();
  }
}
