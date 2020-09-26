/**
 * A wrapper for the default browser `window.MediaSource` class
 */

import interval from 'interval-promise';

import EventEmitter from '../../../utils/EventEmitter';

const DEFAULT_DURATION = 10;
const DEFAULT_IS_READY_INTERVAL = 0.5;
const DEFAULT_IS_READY_TIMEOUT = 10;

export default class MediaSource extends EventEmitter {
  static events = {
    SOURCE_OPEN: 'sourceopen',
    SOURCE_ENDED: 'sourceended',
    ERROR: 'error',
  };

  static isMimeCodecSupported (mimeCodec) {
    return (window.MediaSource && window.MediaSource.isTypeSupported(mimeCodec));
  }

  static factory (logId) {
    return new MediaSource(logId);
  }

  constructor (logId) {
    super(logId);

    this.mediaSource = new window.MediaSource();
    this.objectURL = null;

    // @todo - no idea what could cause this situation...
    if (!this.mediaSource) {
      throw new Error('The video element or mediaSource is not ready!');
    }

    this.mediaSource.addEventListener('sourceopen', this.#onSourceOpen);
    this.mediaSource.addEventListener('sourceended', this.#onSourceEnded);
    this.mediaSource.addEventListener('error', this.#onError);

    this.DURATION = DEFAULT_DURATION;
    this.IS_READY_INTERVAL = DEFAULT_IS_READY_INTERVAL;
    this.IS_READY_TIMEOUT = DEFAULT_IS_READY_TIMEOUT;
  }

  // @todo - evaluate all uses of isReady outside of waitUntilReady - can
  // waitUntilReady be used in those instances?
  isReady () {
    // found when stress testing many videos, it is possible for the
    // media source ready state not to be open even though
    // source open callback is being called.
    return this.mediaSource.readyState === 'open';
  }

  async waitUntilReady () {
    if (this.isReady()) {
      return;
    }

    try {
      await interval(
        async (iteration, stop) => {
          if (this.isReady()) {
            stop();
          }
        },
        this.IS_READY_INTERVAL,
        {
          iterations: (this.IS_READY_TIMEOUT / this.IS_READY_INTERVAL)
        },
      );
    }
    catch (error) {
      const message = 'MediaSource readyState open timed out!';
      this.logger.error(message);
      this.logger.error(error);

      throw new Error(message);
    }
  }

  asObjectURL () {
    if (!this.objectURL) {
      // @todo - should multiple calls to this method with the same mediaSource
      // result in multiple objectURLs being created?  The docs for this say that
      // it creates something on the document, which lives until revokeObjectURL
      // is called on it.  Does that mean we should only ever have one per
      // this.mediaSource?  It seems like it, but I do not know.  Having only one
      // seems more predictable, and more memory efficient.
      this.objectURL = window.URL.createObjectURL(this.mediaSource);
    }

    return this.objectURL;
  }

  revokeObjectURL () {
    if (this.objectURL) {
      window.URL.revokeObjectURL(this.objectURL);
    }

    this.objectURL = null;
  }

  #onSourceOpen = async (event) => {
    await this.waitUntilReady();

    // This can only be set when the media source is open.
    // @todo - does this do memory management for us so we don't have
    // to call remove on the buffer, which is expensive?  It seems
    // like it...
    this.mediaSource.duration = this.DURATION;

    this.events.emit(MediaSource.events.SOURCE_OPEN, event);
  };

  #onSourceEnded = (event) => {
    this.events.emit(MediaSource.events.SOURCE_ENDED, event);
  };

  #onError = (event) => {
    this.events.emit(MediaSource.events.ERROR, event);
  };

  async _destroy () {
    this.mediaSource.removeEventListener('sourceopen', this.#onSourceOpen);
    this.mediaSource.removeEventListener('sourceended', this.#onSourceEnded);
    this.mediaSource.removeEventListener('error', this.#onError);

    // let sourceBuffers = this.mediaSource.sourceBuffers;

    // if (sourceBuffers.SourceBuffers) {
    //   // @see - https://developer.mozilla.org/en-US/docs/Web/API/MediaSource/sourceBuffers
    //   sourceBuffers = sourceBuffers.SourceBuffers();
    // }

    // for (let i = 0; i < sourceBuffers.length; i++) {
    //   this.mediaSource.removeSourceBuffer(sourceBuffers[i]);
    // }

    // @todo - what if it isn't ready?  shouldn't we wait for it to be ready?
    if (this.isReady()) {
      this.logger.info('media source was ready for endOfStream and removeSourceBuffer');
      this.mediaSource.endOfStream();
      this.mediaSource.removeSourceBuffer(this.sourceBuffer);
    }

    this.revokeObjectURL();

    await super._destroy();
  }
}
