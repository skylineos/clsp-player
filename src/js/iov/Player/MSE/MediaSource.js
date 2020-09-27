/**
 * A wrapper for the default browser `window.MediaSource` class
 *
 * @see - https://developers.google.com/web/fundamentals/media/mse/basics
 * @see - https://github.com/nickdesaulniers/netfix/blob/gh-pages/demo/bufferAll.html
 */

import interval from 'interval-promise';

import EventEmitter from '../../../utils/EventEmitter';

const DEFAULT_DURATION = 10;
// Check at this interval to see if the MediaSource is ready
const DEFAULT_IS_READY_INTERVAL = 0.25;
// Give the MediaSource this many seconds to become ready
const DEFAULT_IS_READY_TIMEOUT = 1;

export default class MediaSource extends EventEmitter {
  /**
   * Events that are emitted by this MediaSource
   */
  static events = {
    // --- Custom events
    SOURCE_OPEN_ERROR: 'source-open-error',
    // --- MSE MediaSource events
    // @todo - create an event name that makes sense in layman's terms, such
    // as "INITIALIZED" either here or in MSEWrapper
    SOURCE_OPEN: 'sourceopen',
    // @todo - create an event name that makes sense in layman's terms, such
    // as "FINISHED" either here or in MSEWrapper
    SOURCE_ENDED: 'sourceended',
    ERROR: 'error',
  };

  /**
   * Check to see if the passed mimeCodec is supported by this browser.
   *
   * @see - https://developer.mozilla.org/en-US/docs/Web/API/MediaSource/isTypeSupported
   *
   * @param {string} mimeCodec
   *   The mime code to check for support / compatibility
   *
   * @returns {boolean}
   *   - true if the mimeCodec is supported
   *   - false if the mimeCodec is not supported
   */
  static isMimeCodecSupported (mimeCodec) {
    if (!mimeCodec) {
      return false;
    }

    return window.MediaSource.isTypeSupported(mimeCodec);
  }

  /**
   * Create a new MediaSource, which is a wrapper around `window.MediaSource`
   *
   * @param {string|object} logId
   *   a string that identifies this MediaSource in log messages
   *   @see - src/js/utils/Destroyable
   */
  static factory (logId) {
    return new MediaSource(logId);
  }

  /**
   * @private
   *
   * Create a new MediaSource, which is a wrapper around `window.MediaSource`
   *
   * @param {string|object} logId
   *   a string that identifies this MediaSource in log messages
   *   @see - src/js/utils/Destroyable
   */
  constructor (logId) {
    super(logId);

    this.mediaSource = new window.MediaSource();

    // @todo - no idea what could cause this situation...
    if (!this.mediaSource) {
      throw new Error('The video element or mediaSource is not ready!');
    }

    this.mediaSource.addEventListener('sourceopen', this.#onSourceOpen);
    this.mediaSource.addEventListener('sourceended', this.#onSourceEnded);
    this.mediaSource.addEventListener('error', this.#onError);

    this.objectURL = null;

    this.DURATION = DEFAULT_DURATION;
    this.IS_READY_INTERVAL = DEFAULT_IS_READY_INTERVAL;
    this.IS_READY_TIMEOUT = DEFAULT_IS_READY_TIMEOUT;
  }

  /**
   * Determine if this MediaSource is ready to start using any SourceBuffers
   * it might have.
   *
   * @returns {boolean}
   *   - true if readyState is "open"
   *   - false if readyState is not "open"
   */
  isReady () {
    if (this.isDestroyComplete) {
      return false;
    }

    // found when stress testing many videos, it is possible for the
    // media source ready state not to be open even though
    // source open callback is being called.
    return this.mediaSource.readyState === 'open';
  }

  /**
   * @async
   *
   * Wait for this MediaSource to become ready.
   *
   * @returns {void}
   */
  async waitUntilReady () {
    if (this.isDestroyComplete) {
      throw new Error('MediaSource will not become ready because it has already been destroyed');
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
      throw new Error('MediaSource `readyState` timed out waiting to be `open`!');
    }
  }

  /**
   * Create the objectURL for this MediaSource that is needed to play a stream
   * using an HTML5 `<video>` tag.
   *
   * @see - https://developer.mozilla.org/en-US/docs/Web/API/URL/createObjectURL
   *
   * @returns {DOMString|string}
   *   The objectURL that can be set as the `<video>` tag's `src` attribute
   */
  asObjectURL () {
    if (this.isDestroyed) {
      throw new Error('Cannot create objectURL while destroyed');
    }

    if (!this.objectURL) {
      // Since the value returned by `createObjectURL` appears to be retained
      // by the `document`, only create one for this instance to reduce the
      // chance of it creating a memory leak.
      this.objectURL = window.URL.createObjectURL(this.mediaSource);
    }

    return this.objectURL;
  }

  /**
   * @private
   *
   * Revoke the objectURL that was created for this MediaSource, if it exists.
   * Meant to help with memory management.
   *
   * @returns {void}
   */
  #revokeObjectURL () {
    if (this.objectURL) {
      window.URL.revokeObjectURL(this.objectURL);
    }

    this.objectURL = null;
  }

  /**
   * @private
   *
   * Event listener for the `sourceopen` event.  Broadcasts an event to
   * indicate that this MediaSource is ready.
   *
   * @todo - Does this realy need to be broadcast up?  Is there ever a
   * situation where `sourceopen` will be emitted more than once for a single
   * MediaSource / SourceBuffer?  If not, this event should only be used
   * privately as part of an initialization method.
   *
   * @param {object} event
   *
   * @returns {void}
   */
  #onSourceOpen = async (event) => {
    try {
      await this.waitUntilReady();
    }
    catch (error) {
      this.events.emit(MediaSource.events.SOURCE_OPEN_ERROR, { error });
      return;
    }

    // This can only be set when the media source is open.
    // @todo - does this do memory management for us so we don't have
    // to call remove on the buffer, which is expensive?  It seems
    // like it...
    this.mediaSource.duration = this.DURATION;

    this.events.emit(MediaSource.events.SOURCE_OPEN, event);
  };

  /**
   * @private
   *
   * Event listener for the `sourceended` event.  Broadcasts an event to
   * indicate that this MediaSource is finished.
   *
   * @todo - the `sourceended` event is only supposed to be emitted when
   * `mediaSource.endOfStream` is called, which is only ever done inside this
   * class.  This means we should always be in control of when this event
   * occurs, and shouldn't need to broadcast it up.  Is there some other
   * condition which could cause this to be emitted?
   *
   * @param {object} event
   *
   * @returns {void}
   */
  #onSourceEnded = (event) => {
    this.events.emit(MediaSource.events.SOURCE_ENDED, event);
  };

  /**
   * @private
   *
   * Event listener for the `error` event.  Broadcasts an event to indicate
   * that this MediaSource has encountered an unexpected error.
   *
   * @param {object} event
   *
   * @returns {void}
   */
  #onError = (event) => {
    this.events.emit(MediaSource.events.ERROR, event);
  };

  /**
   * @private
   * @deprecated
   *
   * Intended to clear all SourceBuffers from this MediaSource.  We should not
   * need to do this since we are supposed to only have a single SourceBuffer
   * that is privately managed (by the MSEWrapper).
   *
   * @see - https://developer.mozilla.org/en-US/docs/Web/API/MediaSource/sourceBuffers
   *
   * @returns {void}
   */
  #removeAllSourceBuffers () {
    let sourceBuffers = this.mediaSource.sourceBuffers;

    if (sourceBuffers.SourceBuffers) {
      sourceBuffers = sourceBuffers.SourceBuffers();
    }

    for (let i = 0; i < sourceBuffers.length; i++) {
      const sourceBuffer = sourceBuffers[i];

      this.mediaSource.removeSourceBuffer(sourceBuffer);
    }
  }

  async _destroy () {
    this.mediaSource.removeEventListener('sourceopen', this.#onSourceOpen);
    this.mediaSource.removeEventListener('sourceended', this.#onSourceEnded);
    this.mediaSource.removeEventListener('error', this.#onError);

    try {
      await this.waitUntilReady();

      // `endOfStream` can only be called when the mediaSource is ready
      this.mediaSource.endOfStream();
    }
    catch (error) {
      this.logger.info('MediaSource did not become ready while destroying, continuing destroy anyway...');
      this.logger.info(error);
    }

    // @todo - can this be done in the SourceBuffer destroy?
    // @todo - if the destroy logic was more properly implemented, this could
    // be done elsewhere...
    this.#removeAllSourceBuffers();
    // this.mediaSource.removeSourceBuffer(this.sourceBuffer.sourceBuffer);

    this.#revokeObjectURL();

    await super._destroy();
  }
}
