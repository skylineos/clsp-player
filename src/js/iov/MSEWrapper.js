'use strict';

import Debug from 'debug';
import defaults from 'lodash/defaults';
import noop from 'lodash/noop';
import utils from '../utils/';
// import { mp4toJSON } from './mp4-inspect';

const DEBUG_PREFIX = 'skyline:clsp:iov';

const debug = Debug(`${DEBUG_PREFIX}:MSEWrapper`);
const silly = Debug(`silly:${DEBUG_PREFIX}:MSEWrapper`);

// This is the original error text, but it is subject to change by chrome,
// and we are only checking the part of the error text that contains no
// punctuation (and is all lower case).
// "Failed to execute 'appendBuffer' on 'SourceBuffer': The SourceBuffer is full, and cannot free space to append additional buffers.";
const FULL_BUFFER_ERROR = 'and cannot free space to append additional buffers';

export default class MSEWrapper {
  static EVENT_NAMES = [
    'metric',
  ];

  static METRIC_TYPES = [
    'mediaSource.created',
    'mediaSource.destroyed',
    'objectURL.created',
    'objectURL.revoked',
    'mediaSource.reinitialized',
    'sourceBuffer.created',
    'sourceBuffer.destroyed',
    'queue.added',
    'queue.removed',
    'sourceBuffer.append',
    'error.sourceBuffer.append',
    'frameDrop.hiddenTab',
    'queue.mediaSourceNotReady',
    'queue.sourceBufferNotReady',
    'queue.shift',
    'queue.append',
    'sourceBuffer.lastKnownBufferSize',
    'sourceBuffer.trim',
    'sourceBuffer.trim.error',
    'sourceBuffer.updateEnd',
    'sourceBuffer.updateEnd.bufferLength.empty',
    'sourceBuffer.updateEnd.bufferLength.error',
    'sourceBuffer.updateEnd.removeEvent',
    'sourceBuffer.updateEnd.appendEvent',
    'sourceBuffer.updateEnd.bufferFrozen',
    'sourceBuffer.abort',
    'error.sourceBuffer.abort',
    'sourceBuffer.lastMoofSize',
  ];

  static isMimeCodecSupported (mimeCodec) {
    return (window.MediaSource && window.MediaSource.isTypeSupported(mimeCodec));
  }

  static factory (videoElement, options = {}) {
    return new MSEWrapper(videoElement, options);
  }

  constructor (videoElement, options = {}) {
    debug('Constructing...');

    if (!videoElement) {
      throw new Error('videoElement is required to construct an MSEWrapper.');
    }

    this.destroyed = false;

    this.videoElement = videoElement;

    this.options = defaults(
      {}, options, {
        // These default buffer values provide the best results in my testing.
        // It keeps the memory usage as low as is practical, and rarely causes
        // the video to stutter
        bufferSizeLimit: 90 + Math.floor(Math.random() * (200)),
        bufferTruncateFactor: 2,
        bufferTruncateValue: null,
        driftThreshold: 2000,
        duration: 10,
        enableMetrics: false,
        appendsWithSameTimeEndThreshold: 1,
      },
    );

    this.segmentQueue = [];
    this.sequenceNumber = 0;

    this.mediaSource = null;
    this.sourceBuffer = null;
    this.objectURL = null;
    this.timeBuffered = null;
    this.appendsSinceTimeEndUpdated = 0;

    if (!this.options.bufferTruncateValue) {
      this.options.bufferTruncateValue = parseInt(this.options.bufferSizeLimit / this.options.bufferTruncateFactor);
    }

    this.metrics = {};

    // @todo - there must be a more proper way to do events than this...
    this.events = {};

    for (let i = 0; i < MSEWrapper.EVENT_NAMES.length; i++) {
      this.events[MSEWrapper.EVENT_NAMES[i]] = [];
    }

    this.eventListeners = {
      mediaSource: {},
      sourceBuffer: {},
    };
  }

  on (name, action) {
    debug(`Registering Listener for ${name} event...`);

    if (!MSEWrapper.EVENT_NAMES.includes(name)) {
      throw new Error(`"${name}" is not a valid event."`);
    }

    this.events[name].push(action);
  }

  trigger (name, value) {
    if (name === 'metric') {
      silly(`Triggering ${name} event...`);
    }
    else {
      debug(`Triggering ${name} event...`);
    }

    if (!MSEWrapper.EVENT_NAMES.includes(name)) {
      throw new Error(`"${name}" is not a valid event."`);
    }

    for (let i = 0; i < this.events[name].length; i++) {
      this.events[name][i](value, this);
    }
  }

  metric (type, value) {
    if (!this.options || !this.options.enableMetrics) {
      return;
    }

    if (!MSEWrapper.METRIC_TYPES.includes(type)) {
      // @todo - should this throw?
      return;
    }

    switch (type) {
      case 'sourceBuffer.lastKnownBufferSize':
      case 'sourceBuffer.lastMoofSize': {
        this.metrics[type] = value;
        break;
      }
      default: {
        if (!Object.prototype.hasOwnProperty.call(this.metrics, type)) {
          this.metrics[type] = 0;
        }

        this.metrics[type] += value;
      }
    }

    this.trigger('metric', {
      type,
      value: this.metrics[type],
    });
  }

  initializeMediaSource (options = {}) {
    debug('Initializing mediaSource...');

    options = defaults(
      {}, options, {
        onSourceOpen: noop,
        onSourceEnded: noop,
        onError: noop,
      },
    );

    this.metric('mediaSource.created', 1);

    // Kill the existing media source
    this.destroyMediaSource();

    this.mediaSource = new window.MediaSource();

    this.eventListeners.mediaSource.sourceopen = () => {
      // This can only be set when the media source is open.
      // @todo - does this do memory management for us so we don't have
      // to call remove on the buffer, which is expensive?  It seems
      // like it...
      this.mediaSource.duration = this.options.duration;

      options.onSourceOpen();
    };
    this.eventListeners.mediaSource.sourceended = options.onSourceEnded;
    this.eventListeners.mediaSource.error = options.onError;

    this.mediaSource.addEventListener('sourceopen', this.eventListeners.mediaSource.sourceopen);
    this.mediaSource.addEventListener('sourceended', this.eventListeners.mediaSource.sourceended);
    this.mediaSource.addEventListener('error', this.eventListeners.mediaSource.error);
  }

  getVideoElementSrc () {
    debug('getVideoElementSrc...');

    if (!this.mediaSource) {
      // @todo - should this throw?
      return;
    }

    // @todo - should multiple calls to this method with the same mediaSource
    // result in multiple objectURLs being created?  The docs for this say that
    // it creates something on the document, which lives until revokeObjectURL
    // is called on it.  Does that mean we should only ever have one per
    // this.mediaSource?  It seems like it, but I do not know.  Having only one
    // seems more predictable, and more memory efficient.

    // Ensure only a single objectURL exists at one time
    if (!this.objectURL) {
      this.metric('objectURL.created', 1);

      this.objectURL = window.URL.createObjectURL(this.mediaSource);
    }

    this.videoElement.src = this.objectURL;
  }

  destroyVideoElementSrc () {
    debug('destroyVideoElementSrc...');

    if (!this.mediaSource) {
      // @todo - should this throw?
      return;
    }

    if (!this.objectURL) {
      // @todo - should this throw?
      return;
    }

    // this.metric('objectURL.revoked', 1);

    this.objectURL = null;

    if (this.sourceBuffer) {
      this.shouldAbort = true;
    }

    // free the resource
    return window.URL.revokeObjectURL(this.videoElement.src);
  }

  reinitializeVideoElementSrc () {
    this.metric('mediaSource.reinitialized', 1);

    this.destroyVideoElementSrc();

    // reallocate, this will call media source open which will
    // append the MOOV atom.
    return this.getVideoElementSrc();
  }

  isMediaSourceReady () {
    // found when stress testing many videos, it is possible for the
    // media source ready state not to be open even though
    // source open callback is being called.
    return this.mediaSource && this.mediaSource.readyState === 'open';
  }

  isSourceBufferReady () {
    return this.sourceBuffer && this.sourceBuffer.updating === false;
  }

  async initializeSourceBuffer (mimeCodec, options = {}) {
    debug('initializeSourceBuffer...');

    options = defaults(
      {}, options, {
        onAppendStart: noop,
        onAppendFinish: noop,
        onRemoveFinish: noop,
        onAppendError: noop,
        onRemoveError: noop,
        onStreamFrozen: noop,
        onError: noop,
        retry: true,
      },
    );

    if (!this.isMediaSourceReady()) {
      throw new Error('Cannot create the sourceBuffer if the mediaSource is not ready.');
    }

    // Kill the existing source buffer
    await this.destroySourceBuffer();

    this.metric('sourceBuffer.created', 1);

    this.sourceBuffer = this.mediaSource.addSourceBuffer(mimeCodec);
    this.sourceBuffer.mode = 'sequence';

    // Custom Events
    this.eventListeners.sourceBuffer.onAppendStart = options.onAppendStart;
    this.eventListeners.sourceBuffer.onAppendError = options.onAppendError;
    this.eventListeners.sourceBuffer.onRemoveFinish = options.onRemoveFinish;
    this.eventListeners.sourceBuffer.onAppendFinish = options.onAppendFinish;
    this.eventListeners.sourceBuffer.onRemoveError = options.onRemoveError;
    this.eventListeners.sourceBuffer.onStreamFrozen = options.onStreamFrozen;
    this.eventListeners.sourceBuffer.onError = options.onError;

    // Supported Events
    this.sourceBuffer.addEventListener('updateend', this.onSourceBufferUpdateEnd);
    this.sourceBuffer.addEventListener('error', this.eventListeners.sourceBuffer.onError);
  }

  queueSegment (segment) {
    if (this.segmentQueue.length) {
      debug(`Queueing segment.  The queue currently has ${this.segmentQueue.length} segments.`);
    }
    else {
      silly('Queueing segment.  The queue is currently empty.');
    }

    this.metric('queue.added', 1);

    this.segmentQueue.push({
      timestamp: Date.now(),
      byteArray: segment,
    });
  }

  sourceBufferAbort () {
    debug('Aborting current sourceBuffer operation');

    try {
      this.metric('sourceBuffer.abort', 1);

      if (this.sourceBuffer) {
        this.sourceBuffer.abort();
        this.shouldAbort = false;
      }
    }
    catch (error) {
      this.metric('error.sourceBuffer.abort', 1);

      // Somehow, this can be become undefined...
      if (this.eventListeners.sourceBuffer.onAbortError) {
        this.eventListeners.sourceBuffer.onAbortError(error);
      }
    }
  }

  _append ({
    timestamp, byteArray,
  }) {
    silly('Appending to the sourceBuffer...');

    try {
      const estimatedDrift = Date.now() - timestamp;

      if (estimatedDrift > this.options.driftThreshold) {
        debug(`Estimated drift of ${estimatedDrift} is above the ${this.options.driftThreshold} threshold.  Flushing queue...`);
        // @todo - perhaps we should re-add the last segment to the queue with a fresh
        // timestamp?  I think one cause of stream freezing is the sourceBuffer getting
        // starved, but I don't know if that's correct
        this.metric('queue.removed', this.segmentQueue.length + 1);
        this.segmentQueue = [];
        return;
      }

      silly(`Appending to the buffer with an estimated drift of ${estimatedDrift}`);

      this.metric('sourceBuffer.append', 1);

      this.sourceBuffer.appendBuffer(byteArray);
    }
    catch (error) {
      if (error.message && error.message.toLowerCase().includes(FULL_BUFFER_ERROR)) {
        // @todo - make this a valid metric
        // this.metric('error.sourceBuffer.filled', 1);

        // If the buffer is full, we will flush it
        console.warn('source buffer is full, about to flush it...');
        this.trimBuffer(undefined, true);
      }
      else {
        this.metric('error.sourceBuffer.append', 1);

        this.eventListeners.sourceBuffer.onAppendError(error, byteArray);
      }
    }
  }

  processNextInQueue () {
    silly('processNextInQueue');

    if (this.destroyed) {
      return;
    }

    if (document[utils.windowStateNames.hiddenStateName]) {
      debug('Tab not in focus - dropping frame...');
      this.metric('frameDrop.hiddenTab', 1);
      this.metric('queue.cannotProcessNext', 1);
      return;
    }

    if (!this.isMediaSourceReady()) {
      debug('The mediaSource is not ready');
      this.metric('queue.mediaSourceNotReady', 1);
      this.metric('queue.cannotProcessNext', 1);
      return;
    }

    if (!this.isSourceBufferReady()) {
      debug('The sourceBuffer is busy');
      this.metric('queue.sourceBufferNotReady', 1);
      this.metric('queue.cannotProcessNext', 1);
      return;
    }

    if (this.segmentQueue.length > 0) {
      this.metric('queue.shift', 1);
      this.metric('queue.canProcessNext', 1);
      this._append(this.segmentQueue.shift());
    }
  }

  formatMoof (moof) {
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
    debug('appendMoov');

    if (!moov) {
      // @todo - do we need to throw here or something?  Under what
      // circumstance would this be called with no moov?
      return;
    }

    this.metric('sourceBuffer.lastMoovSize', moov.length);

    // Sometimes this can get hit after destroy is called
    if (!this.eventListeners.sourceBuffer.onAppendStart) {
      return;
    }

    debug('appending moov...');
    this.queueSegment(moov);

    this.processNextInQueue();
  }

  append (byteArray) {
    silly('Append');

    if (this.destroyed) {
      return;
    }

    this.metric('sourceBuffer.lastMoofSize', byteArray.length);

    // console.log(mp4toJSON(byteArray));

    // Sometimes this can get hit after destroy is called
    if (!this.eventListeners.sourceBuffer.onAppendStart) {
      return;
    }

    this.eventListeners.sourceBuffer.onAppendStart(byteArray);

    this.metric('queue.append', 1);

    this.queueSegment(this.formatMoof(byteArray));
    this.sequenceNumber++;

    this.processNextInQueue();
  }

  getBufferTimes () {
    silly('getBufferTimes...');

    try {
      const previousBufferSize = this.timeBuffered;
      const bufferTimeStart = this.sourceBuffer.buffered.start(0);
      const bufferTimeEnd = this.sourceBuffer.buffered.end(0);
      const currentBufferSize = bufferTimeEnd - bufferTimeStart;

      silly('getBufferTimes finished successfully...');

      return {
        previousBufferSize,
        currentBufferSize,
        bufferTimeStart,
        bufferTimeEnd,
      };
    }
    catch (error) {
      debug('getBufferTimes finished unsuccessfully...');

      return null;
    }
  }

  trimBuffer (info = this.getBufferTimes(), clearBuffer = false) {
    silly('trimBuffer...');

    this.metric('sourceBuffer.lastKnownBufferSize', this.timeBuffered);

    try {
      if (info && (clearBuffer || (this.timeBuffered > this.options.bufferSizeLimit)) && this.isSourceBufferReady()) {
        debug('Removing old stuff from sourceBuffer...');

        // @todo - this is the biggest performance problem we have with this player.
        // Can you figure out how to manage the memory usage without causing the streams
        // to stutter?
        this.metric('sourceBuffer.trim', this.options.bufferTruncateValue);

        const trimEndTime = clearBuffer
          ? Infinity
          : info.bufferTimeStart + this.options.bufferTruncateValue;

        debug('trimming buffer...');
        this.sourceBuffer.remove(info.bufferTimeStart, trimEndTime);

        debug('finished trimming buffer...');
      }
    }
    catch (error) {
      debug('trimBuffer failure!');
      this.metric('sourceBuffer.trim.error', 1);
      this.eventListeners.sourceBuffer.onRemoveError(error);
      console.error(error);
    }

    silly('trimBuffer finished...');
  }

  onRemoveFinish (info = this.getBufferTimes()) {
    debug('On remove finish...');

    this.metric('sourceBuffer.updateEnd.removeEvent', 1);
    this.eventListeners.sourceBuffer.onRemoveFinish(info);
  }

  onAppendFinish (info = this.getBufferTimes()) {
    silly('On append finish...');

    this.metric('sourceBuffer.updateEnd.appendEvent', 1);

    // The current buffer size should always be bigger.If it isn't, there is a problem,
    // and we need to reinitialize or something.  Sometimes the buffer is the same.  This is
    // allowed for consecutive appends, but only a configurable number of times.  The default
    // is 1
    debug('Appends with same time end: ' + this.appendsSinceTimeEndUpdated);
    if (this.previousTimeEnd && info.bufferTimeEnd <= this.previousTimeEnd) {
      this.appendsSinceTimeEndUpdated += 1;
      this.metric('sourceBuffer.updateEnd.bufferFrozen', 1);

      // append threshold with same time end has been crossed.  Reinitialize frozen stream.
      if (this.appendsSinceTimeEndUpdated > this.options.appendsWithSameTimeEndThreshold) {
        debug('stream frozen!');
        this.eventListeners.sourceBuffer.onStreamFrozen();
        return;
      }
    }

    this.appendsSinceTimeEndUpdated = 0;
    this.previousTimeEnd = info.bufferTimeEnd;

    this.eventListeners.sourceBuffer.onAppendFinish(info);
    this.trimBuffer(info);
  }

  onSourceBufferUpdateEnd = () => {
    silly('onUpdateEnd');

    this.metric('sourceBuffer.updateEnd', 1);

    if (this.shouldAbort) {
      this.sourceBufferAbort();
    }

    try {
      // Sometimes the mediaSource is removed while an update is being
      // processed, resulting in an error when trying to read the
      // "buffered" property.
      if (this.sourceBuffer.buffered.length <= 0) {
        this.metric('sourceBuffer.updateEnd.bufferLength.empty', 1);
        debug('After updating, the sourceBuffer has no length!');
        return;
      }
    }
    catch (error) {
      // @todo - do we need to handle this?
      this.metric('sourceBuffer.updateEnd.bufferLength.error', 1);
      debug('The mediaSource was removed while an update operation was occurring.');
      return;
    }

    const info = this.getBufferTimes();

    this.timeBuffered = info.currentBufferSize;

    if (info.previousBufferSize !== null && info.previousBufferSize > this.timeBuffered) {
      this.onRemoveFinish(info);
    }
    else {
      this.onAppendFinish(info);
    }

    this.processNextInQueue();
  }

  destroySourceBuffer () {
    debug('destroySourceBuffer...');

    return new Promise((resolve, reject) => {
      const finish = () => {
        if (this.sourceBuffer) {
          this.sourceBuffer.removeEventListener('updateend', finish);
        }

        // We must abort in the final updateend listener to ensure that
        // any operations, especially the remove operation, finish first,
        // as aborting while removing is deprecated.
        this.sourceBufferAbort();

        debug('destroySourceBuffer finished...');
        resolve();
      };

      if (!this.sourceBuffer) {
        return finish();
      }

      this.sourceBuffer.removeEventListener('updateend', this.onSourceBufferUpdateEnd);
      this.sourceBuffer.removeEventListener('error', this.eventListeners.sourceBuffer.onError);

      this.sourceBuffer.addEventListener('updateend', finish);

      // @todo - this is a hack - sometimes, the trimBuffer operation does not cause an update
      // on the sourceBuffer.  This acts as a timeout to ensure the destruction of this mseWrapper
      // instance can complete.
      debug('giving sourceBuffer some time to finish updating itself...');
      setTimeout(finish, 1000);
    });
  }

  destroyMediaSource () {
    this.metric('sourceBuffer.destroyed', 1);

    debug('Destroying mediaSource...');

    if (!this.mediaSource) {
      return;
    }

    // We must do this PRIOR to the sourceBuffer being destroyed, to ensure that the
    // 'buffered' property is still available, which is necessary for completely
    // emptying the sourceBuffer.
    this.trimBuffer(undefined, true);

    this.mediaSource.removeEventListener('sourceopen', this.eventListeners.mediaSource.sourceopen);
    this.mediaSource.removeEventListener('sourceended', this.eventListeners.mediaSource.sourceended);
    this.mediaSource.removeEventListener('error', this.eventListeners.mediaSource.error);

    // let sourceBuffers = this.mediaSource.sourceBuffers;

    // if (sourceBuffers.SourceBuffers) {
    //   // @see - https://developer.mozilla.org/en-US/docs/Web/API/MediaSource/sourceBuffers
    //   sourceBuffers = sourceBuffers.SourceBuffers();
    // }

    // for (let i = 0; i < sourceBuffers.length; i++) {
    // this.mediaSource.removeSourceBuffer(sourceBuffers[i]);
    // }

    if (this.isMediaSourceReady() && this.isSourceBufferReady()) {
      debug('media source was ready for endOfStream and removeSourceBuffer');
      this.mediaSource.endOfStream();
      this.mediaSource.removeSourceBuffer(this.sourceBuffer);
    }

    // @todo - is this happening at the right time, or should it happen
    // prior to removing the source buffers?
    this.destroyVideoElementSrc();

    this.metric('mediaSource.destroyed', 1);
  }

  _freeAllResources () {
    debug('_freeAllResources...');

    // We make NO assumptions here about what instance properties are
    // needed during the asynchronous destruction of the source buffer,
    // therefore we wait until it is finished to free all of these
    // resources.
    this.mediaSource = null;
    this.sourceBuffer = null;

    this.videoElement = null;

    this.timeBuffered = null;
    this.previousTimeEnd = null;
    this.segmentQueue = null;

    this.options = null;
    this.metrics = null;
    this.events = null;
    this.eventListeners = null;

    debug('_freeAllResources finished...');
  }

  destroy () {
    debug('destroy...');

    if (this.destroyed) {
      return Promise.resolve();
    }

    this.destroyed = true;

    this.destroyMediaSource();

    // We MUST not force the destroy method here to be asynchronous, even
    // though it "should" be.  This is because we cannot assume that the
    // caller has control over whether or not its destroy method can be
    // properly run asynchronously.  The specific use case here is that
    // many client side libraries (angular, marionette, react, etc.) do
    // not all give pre-destruction methods or events that can wait for
    // an asynchronous operation.  If angular decides it is going to
    // destroy a DOM element when a user navigates, we have no way of
    // ensuring that it supports asynchronous operations, or that the
    // caller is properly using them, if they exist.  Therefore, this
    // destroy method will clean up the source buffer later, allowing the
    // rest of the clsp destruction logic to continue.  The use case for
    // needing that functionality is that the conduit needs to use the its
    // iframe to contact the server, and if the iframe is destroyed before
    // the conduit talks to the server, errors will be thrown during
    // destruction, which will lead to resources not being free / memory
    // leaks, which may cause the browser to crash after extended periods
    // of time, such as 24 hours.
    // Note that we still return the promise, so that the caller has the
    // option of waiting if they choose.
    const destroyPromise = this.destroySourceBuffer()
      .then(() => {
        debug('destroySourceBuffer successfully finished...');
        this._freeAllResources();
        debug('destroy successfully finished...');
      })
      .catch((error) => {
        debug('destroySourceBuffer failed...');
        console.error('Error while destroying the source buffer!');
        console.error(error);

        // Do our best at memory management, even on failure
        this._freeAllResources();
        debug('destroy unsuccessfully finished...');
      });

    debug('exiting destroy, asynchronous destroy logic in progress...');

    return destroyPromise;
  }
}
