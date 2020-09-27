import { v4 as uuidv4 } from 'uuid';

import utils from '../utils/utils';
import EventEmitter from '../utils/EventEmitter';

import IovPlayer from './Player/IovPlayer';
import StreamConfiguration from './StreamConfiguration';

const DEFAULT_ENABLE_METRICS = false;
const DEFAULT_CONNECTION_CHANGE_PLAY_DELAY = 5;
const DEFAULT_MAX_RETRIES_ON_PLAY_ERROR = 20;

/**
 * Internet of Video client. This module uses the MediaSource API to
 * deliver video content streamed through CLSP from distributed sources.
 */
export default class Iov extends EventEmitter {
  static events = {
    METRIC: 'metric',
    NO_STREAM_CONFIGURATION: 'no-stream-configuration',
    RETRY_ERROR: 'retry-error',
    FIRST_FRAME_SHOWN: IovPlayer.events.FIRST_FRAME_SHOWN,
    VIDEO_RECEIVED: IovPlayer.events.VIDEO_RECEIVED,
    VIDEO_INFO_RECEIVED: IovPlayer.events.VIDEO_INFO_RECEIVED,
    IFRAME_DESTROYED_EXTERNALLY: IovPlayer.events.IFRAME_DESTROYED_EXTERNALLY,
    REINITIALZE_ERROR: IovPlayer.events.REINITIALZE_ERROR,
  };

  static factory (
    logId,
    id,
    videoElementId,
  ) {
    return new Iov(
      logId,
      id,
      videoElementId,
    );
  }

  /**
   * @param {String} videoElementId
   */
  constructor (
    logId,
    id,
    videoElementId,
  ) {
    if (!utils.supported()) {
      throw new Error('You are using an unsupported browser - Unable to play CLSP video');
    }

    super(logId);

    if (!id) {
      throw new Error('id is required to construct an Iov');
    }

    if (!videoElementId) {
      throw new Error('videoElementId is required to construct an Iov');
    }

    // @todo @metrics
    // this.metrics = {};

    this.id = id;
    this.videoElementId = videoElementId;
    this.videoElementParent = null;

    this.onReadyAlreadyCalled = false;
    this.iovPlayerCount = 0;

    const {
      visibilityChangeEventName,
    } = utils.windowStateNames;

    if (visibilityChangeEventName) {
      document.addEventListener(
        visibilityChangeEventName,
        this.onVisibilityChange,
        false,
      );
    }

    window.addEventListener(
      'online',
      this.onConnectionChange,
      false,
    );

    window.addEventListener(
      'offline',
      this.onConnectionChange,
      false,
    );

    // These can be configured manually after construction
    this.ENABLE_METRICS = DEFAULT_ENABLE_METRICS;
    this.CONNECTION_CHANGE_PLAY_DELAY = DEFAULT_CONNECTION_CHANGE_PLAY_DELAY;
    this.MAX_RETRIES_ON_PLAY_ERROR = DEFAULT_MAX_RETRIES_ON_PLAY_ERROR;
  }

  onConnectionChange = async () => {
    if (window.navigator.onLine) {
      this.logger.info('Back online...');

      try {
        await this.restart();
      }
      catch (error) {
        this.logger.error('Error while trying to restart during online event');
        this.logger.error(error);
      }

      return;
    }

    this.logger.info('Offline!');

    try {
      await this.stop();
    }
    catch (error) {
      this.logger.warn('Error encountered while stopping during offline event:');
      this.logger.error(error);
    }
  };

  onVisibilityChange = async () => {
    // If it is currently hidden, do nothing
    if (document[utils.windowStateNames.hiddenStateName]) {
      try {
        await this.stop();
      }
      catch (error) {
        this.logger.warn('Error while trying to stop during visibilityChange event');
        this.logger.error(error);
      }

      return;
    }

    try {
      await this.restart();
    }
    catch (error) {
      this.logger.error('Error while restarting during onVisibilityChange!');
      this.logger.error(error);
    }
  };

  _prepareVideoElement () {
    const videoElement = window.document.getElementById(this.videoElementId);

    // If we have no elements to work with, throw an error
    if (!videoElement) {
      throw new Error(`Unable to find an element in the DOM with id "${this.videoElementId}".`);
    }

    if (!this.videoElementParent) {
      videoElement.style.display = 'none';
      this.videoElementParent = videoElement.parentNode;
    }

    if (!this.videoElementParent) {
      throw new Error('There is no iframe container element to attach the iframe to!');
    }

    this.videoElementParent.classList.add('clsp-player-container');

    const clspVideoElement = window.document.createElement('video');
    clspVideoElement.classList.add('clsp-player');

    clspVideoElement.muted = true;
    clspVideoElement.playsinline = true;

    const insertBefore = this.iovPlayer && this.iovPlayer.videoElement
      ? this.iovPlayer.videoElement.nextSibling
      : this.videoElementParent.childNodes[0];

    // @todo - is it ok that the most recent video is always first?  what about
    // the spinner or the not-supported text
    this.videoElementParent.insertBefore(clspVideoElement, insertBefore);

    return clspVideoElement;
  }

  generatePlayerLogId () {
    return `${this.logId}.player:${this.iovPlayerCount}`;
  }

  _clearNextPlayerTimeout () {
    if (this.nextPlayerTimeout) {
      clearTimeout(this.nextPlayerTimeout);
      this.nextPlayerTimeout = null;
    }
  }

  enterFullscreen () {
    if (!window.document.fullscreenElement) {
      // Since the iov and player take control of the video element and its
      // parent, ask the parent for fullscreen since the video elements will be
      // destroyed and recreated when changing sources
      this.containerElement.requestFullscreen();
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

  destroyVideoElement () {
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
  }

  /**
   * Meant to be run as soon as the next player (after awaiting changeSrc) has
   * recevied its first frame.
   */
  async showNextStream () {
    this.logger.info('About to show next player');

    // The next player is actually playing / displaying video, but it isn't
    // visible because the old player is still in front of it.  The destruction
    // of the old player is what actually causes the next player to become
    // visible.
    if (this.iovPlayer) {
      // async, but we don't need to wait for it
      // @todo - what do we do about errors?  should we await this?
      await this.stop(false);
    }

    this._clearNextPlayerTimeout();

    if (this.pendingChangeSrcIovPlayer) {
      this.streamConfiguration = this.pendingChangeSrcStreamConfiguration;
      this.iovPlayer = this.pendingChangeSrcIovPlayer;

      this.pendingChangeSrcStreamConfiguration = null;
      this.pendingChangeSrcIovPlayer = null;
    }
  }

  async cancelChangeSrc () {
    if (!this.pendingChangeSrcIovPlayer) {
      return;
    }

    this.logger.info('Cancelling changeSrc, destroying pending player...');

    try {
      await this.pendingChangeSrcIovPlayer.destroy();
    }
    catch (error) {
      this.logger.error('Error while destroying pending IovPlayer, continuing anyway...');
      this.logger.error(error);
    }

    this.pendingChangeSrcId = null;
    this.pendingChangeSrcStreamConfiguration = null;
    this.pendingChangeSrcIovPlayer = null;
  }

  /**
   * @param {StreamConfiguration|String} url
   *   The StreamConfiguration or url of the new stream
   * @param {Boolean} showOnFirstFrame
   *   if true, when the new stream has received its first frame,
   */
  changeSrc (url, showOnFirstFrame = true) {
    if (this.isDestroyed) {
      this.logger.info('Tried to changeSrc while destroyed');
      return;
    }

    this.logger.info('Changing Stream...');

    if (!url) {
      // @todo - we shouldn't need to throw this, but root cause has not yet
      // been determined
      this.emit(Iov.events.NO_STREAM_CONFIGURATION);

      throw new Error('url is required to changeSrc');
    }

    // Handle the case of multiple changeSrc requests.  Only change to the last
    // stream that was requested
    if (this.pendingChangeSrcIovPlayer) {
      this._clearNextPlayerTimeout();
      // @todo - should we await this?
      this.cancelChangeSrc();
    }

    const clspVideoElement = this._prepareVideoElement();

    const streamConfiguration = StreamConfiguration.isStreamConfiguration(url)
      ? url
      : StreamConfiguration.fromUrl(url);

    const changeSrcId = uuidv4();
    this.iovPlayerCount++;
    const iovPlayer = IovPlayer.factory(
      this.generatePlayerLogId(),
      this.videoElementParent,
      clspVideoElement,
    );

    // @todo - this seems to be videojs specific, and should be removed or moved
    // somewhere else
    iovPlayer.on(IovPlayer.events.FIRST_FRAME_SHOWN, () => {
      this.emit(Iov.events.FIRST_FRAME_SHOWN);
    });

    iovPlayer.on(IovPlayer.events.VIDEO_RECEIVED, () => {
      this.emit(Iov.events.VIDEO_RECEIVED);
    });

    iovPlayer.on(IovPlayer.events.VIDEO_INFO_RECEIVED, () => {
      this.emit(Iov.events.VIDEO_INFO_RECEIVED);
    });

    iovPlayer.on(IovPlayer.events.RECONNECT_FAILURE, ({ error }) => {
      // Don't try to clean anything up, just destroy it and start over
      // @todo - there should be a more graceful way to handle this...
      this.emit(Iov.events.REINITIALZE_ERROR, { error });
    });

    iovPlayer.on(IovPlayer.events.ROUTER_EVENT_ERROR, ({ error }) => {
      // Don't try to clean anything up, just destroy it and start over
      // @todo - there should be a more graceful way to handle this...
      this.emit(Iov.events.REINITIALZE_ERROR, { error });
    });

    iovPlayer.on(IovPlayer.events.REINITIALZE_ERROR, ({ error }) => {
      // Don't try to clean anything up, just destroy it and start over
      // @todo - there should be a more graceful way to handle this...
      this.emit(Iov.events.REINITIALZE_ERROR, { error });
    });

    // This means there's no chance of retrying...
    iovPlayer.on(IovPlayer.events.IFRAME_DESTROYED_EXTERNALLY, () => {
      this.emit(Iov.events.IFRAME_DESTROYED_EXTERNALLY);
    });

    this.pendingChangeSrcId = changeSrcId;
    this.pendingChangeSrcStreamConfiguration = streamConfiguration;
    this.pendingChangeSrcIovPlayer = iovPlayer;

    const firstFrameReceivedPromise = new Promise(async (resolve, reject) => {
      iovPlayer.on(IovPlayer.events.FIRST_FRAME_SHOWN, () => {
        this.nextPlayerTimeout = setTimeout(() => {
          this._clearNextPlayerTimeout();

          if (this.isDestroyed) {
            return reject(new Error('Next player received first frame while destroyed!'));
          }

          this.logger.info('Next player has received its first frame...');

          if (showOnFirstFrame) {
            this.showNextStream().catch(reject);
          }

          resolve();
        }, this.SHOW_NEXT_VIDEO_DELAY * 1000);
      });

      try {
        iovPlayer.setStreamConfiguration(streamConfiguration);

        await iovPlayer.initialize();

        // @todo - should the play method only resolve once the first frame has
        // been shown?  right now it resolves on first moof recevied
        await this.play(iovPlayer);
      }
      catch (error) {
        this.logger.error('Error while trying to change source!');
        reject(error);
      }
    });

    return {
      id: changeSrcId,
      firstFrameReceivedPromise,
    };
  }

  /**
   * @param {StreamConfiguration|url} streamConfiguration
   *   The StreamConfiguration or url of the stream to use with the cloned
   *   player
   */
  clone (streamConfiguration = this.streamConfiguration) {
    if (this.isDestroyed) {
      throw new Error('Tried to clone while destroyed!');
    }

    this.logger.info('clone');

    const newStreamConfiguration = StreamConfiguration.isStreamConfiguration(streamConfiguration)
      ? streamConfiguration.clone()
      : StreamConfiguration.fromUrl(streamConfiguration);

    // @todo - is it possible to reuse the iov player?
    return Iov.factory(this.videoElement, newStreamConfiguration);
  }

  /**
   * Whenever possible, use the changeSrc method instead, since it minimizes the
   * number of black (empty) frames when playing or resuming a stream
   * @param {IovPlayer} iovPlayer
   */
  async play (iovPlayer = this.iovPlayer) {
    if (this.isDestroyed) {
      throw new Error('Tried to play while destroyed');
    }

    this.logger.info('Play');

    try {
      await iovPlayer.play();
    }
    catch (error) {
      this.logger.warn('Error while trying to play from IovPlayer, destroying IovPlayer...');
      this.logger.error(error);

      if (this.MAX_RETRIES_ON_PLAY_ERROR > 0) {
        await this.#retryPlay(iovPlayer);
      }
      else {
        // @todo - display a message in the page (aka to the user) saying that
        // the stream couldn't be played?
        await iovPlayer.destroy();

        throw error;
      }
    }
  }

  async #retryPlay (iovPlayer) {
    if (this.isDestroyed) {
      this.logger.error('Tried to retry play while destroyed');
      return;
    }

    if (this.retryCount >= this.MAX_RETRIES_ON_PLAY_ERROR) {
      const retryCount = this.retryCount;

      this.retryCount = 0;

      // @todo - we shouldn't need to throw this, but root cause has not yet
      // been determined
      // this.emit(Iov.events.RETRY_ERROR);

      throw new Error(`Failed to play after ${retryCount} retries!`);
    }

    this.retryCount++;

    await this.play(iovPlayer);
  }

  async stop (stopPendingPlayer = true) {
    if (this.isDestroyComplete) {
      throw new Error('Tried to stop while destroyed');
    }

    if (!this.iovPlayer && !this.pendingChangeSrcIovPlayer) {
      this.logger.info('Already stopped');
      return;
    }

    if (this.isStopping) {
      this.logger.info('Already stopping');
      return;
    }

    this.isStopping = true;

    // When we get back online, if the first frame was not shown yet, this will
    // enable the restart command to work, because cancelChangeSrc will null
    // out pendingChangeSrcStreamConfiguration
    if (!this.streamConfiguration && this.pendingChangeSrcStreamConfiguration) {
      this.streamConfiguration = this.pendingChangeSrcStreamConfiguration;
    }

    this.logger.info('Stopping by destroying current IovPlayer...');

    const stopOperations = [];

    if (this.iovPlayer) {
      stopOperations.push(this.iovPlayer.destroy());
    }

    // If the iov is in the process of being destroyed, we will not accept the
    // stopPendingPlayer override
    if (stopPendingPlayer && !this.isDestroyed) {
      stopOperations.push(this.cancelChangeSrc());
    }

    const results = await Promise.allSettled(stopOperations);

    const errors = results.reduce((acc, cur) => {
      if (cur.status !== 'fulfilled') {
        acc.push(cur);
      }

      return acc;
    }, []);

    this.iovPlayer = null;
    this.isStopping = false;

    if (errors.length) {
      this.logger.warn('Error(s) encountered while stopping during offline event:');

      errors.forEach((error) => {
        this.logger.error(error.reason);
      });

      throw errors[0].reason;
    }
  }

  async restart () {
    if (this.isDestroyed) {
      throw new Error('Tried to restart while destroyed');
    }

    // @todo - this is a blunt instrument - is there a more performant (but
    // still reliable) way to restart the player as opposed to destroying it and
    // creating a new one?
    this.logger.info('Restart');

    try {
      await this.stop();
    }
    catch (error) {
      this.logger.warn('Failed to stop while restarting, continuing anyway...');
      this.logger.error(error);
    }

    try {
      // Account for restart being called before the first frame was shown
      const streamConfiguration = this.pendingChangeSrcStreamConfiguration || this.streamConfiguration;

      // @todo - do we need to handle firstFrameReceivedPromise rejecting here?
      await this.changeSrc(streamConfiguration).firstFrameReceivedPromise;
    }
    catch (error) {
      this.logger.error('Failed to changeSrc while restarting!');

      // @todo - on failure, should we continue retrying?

      throw error;
    }
  }

  // @todo @metrics
  metric (type, value) {
    // if (!this.ENABLE_METRICS) {
    //   return;
    // }

    // if (!Iov.METRIC_TYPES.includes(type)) {
    //   // @todo - should this throw?
    //   return;
    // }

    // this.metrics[type] = value;

    // this.trigger('metric', {
    //   type,
    //   value: this.metrics[type],
    // });
  }

  /**
   * Dereference the necessary properties, clear any intervals and timeouts, and
   * remove any listeners.  Will also destroy the player.
   *
   * @returns {Promise}
   */
  async _destroy () {
    const timeStarted = Date.now();

    const {
      visibilityChangeEventName,
    } = utils.windowStateNames;

    if (visibilityChangeEventName) {
      document.removeEventListener(visibilityChangeEventName, this.onVisibilityChange);
    }

    window.removeEventListener('online', this.onConnectionChange);
    window.removeEventListener('offline', this.onConnectionChange);

    try {
      await this.stop();
    }
    catch (error) {
      this.logger.error('Error while destroying IOV Player while destroying IOV');
      this.logger.error(error);
    }

    this.streamConfiguration = null;

    this.videoElement = null;
    this.videoElementParent = null;

    // @todo @metrics
    // this.metrics = null;

    await super._destroy();

    const timeFinished = Date.now();
    const timeToDestroy = (timeFinished - timeStarted) / 1000;

    this.logger.info(`Destroy complete in ${timeToDestroy} seconds...`);
  }
}
