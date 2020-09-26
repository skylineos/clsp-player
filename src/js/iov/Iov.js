import {
  v4 as uuidv4,
} from 'uuid';

import utils from '../utils/utils';
import EventEmitter from '../utils/EventEmitter';

import IovPlayer from './Player/IovPlayer';
import StreamConfiguration from './StreamConfiguration';

const DEFAULT_ENABLE_METRICS = false;
const DEFAULT_CONNECTION_CHANGE_PLAY_DELAY = 5;

/**
 * Internet of Video client. This module uses the MediaSource API to
 * deliver video content streamed through CLSP from distributed sources.
 */
export default class Iov extends EventEmitter {
  static events = {
    METRIC: 'metric',
    FIRST_FRAME_SHOWN: IovPlayer.events.FIRST_FRAME_SHOWN,
    VIDEO_RECEIVED: IovPlayer.events.VIDEO_RECEIVED,
    VIDEO_INFO_RECEIVED: IovPlayer.events.VIDEO_INFO_RECEIVED,
    IFRAME_DESTROYED_EXTERNALLY: IovPlayer.events.IFRAME_DESTROYED_EXTERNALLY,
    REINITIALZE_ERROR: IovPlayer.events.REINITIALZE_ERROR,
  };

  static factory (
    logId,
    videoElementId,
  ) {
    return new Iov(
      logId,
      videoElementId,
    );
  }

  /**
   * @param {String} videoElementId
   */
  constructor (
    logId,
    videoElementId,
  ) {
    super(logId);

    if (!utils.supported()) {
      throw new Error('You are using an unsupported browser - Unable to play CLSP video');
    }

    if (!videoElementId) {
      throw new Error('videoElementId is required to construct an Iov');
    }

    // @todo @metrics
    // this.metrics = {};

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
  }

  registerContainerElement (containerElement) {
    this.containerElement = containerElement;

    return this;
  }

  registerVideoElement (videoElement) {
    this.videoElement = videoElement;
    this.containerElement = this.videoElement.parentNode;

    return this;
  }

  onConnectionChange = () => {
    // @todo - does this still work?
    if (window.navigator.onLine) {
      this.logger.debug('Back online...');
      if (this.iovPlayer.isStopped || this.iovPlayer.isStopping) {
        // Without this timeout, the video appears blank.  Not sure if there is
        // some race condition...
        setTimeout(() => {
          this.changeSrc(this.streamConfiguration);
        }, this.CONNECTION_CHANGE_PLAY_DELAY * 1000);
      }
    }
    else {
      this.logger.debug('Offline!');
      this.stop();
    }
  };

  onVisibilityChange = async () => {
    // If it is currently hidden, do nothing
    if (document[utils.windowStateNames.hiddenStateName]) {
      this.stop();
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

  _registerPlayerListeners (iovPlayer) {
    // @todo - this seems to be videojs specific, and should be removed or moved
    // somewhere else
    iovPlayer.on(IovPlayer.events.FIRST_FRAME_SHOWN, () => {
      this.events.emit(Iov.events.FIRST_FRAME_SHOWN);
    });

    iovPlayer.on(IovPlayer.events.VIDEO_RECEIVED, () => {
      this.events.emit(Iov.events.VIDEO_RECEIVED);
    });

    iovPlayer.on(IovPlayer.events.VIDEO_INFO_RECEIVED, () => {
      this.events.emit(Iov.events.VIDEO_INFO_RECEIVED);
    });

    iovPlayer.on(IovPlayer.events.IFRAME_DESTROYED_EXTERNALLY, () => {
      this.events.emit(Iov.events.IFRAME_DESTROYED_EXTERNALLY);
    });

    iovPlayer.on(IovPlayer.events.REINITIALZE_ERROR, ({ error }) => {
      this.events.emit(Iov.events.REINITIALZE_ERROR, { error });
    });
  }

  generatePlayerLogId () {
    return `iov:${this.logId}.player:${++this.iovPlayerCount}`;
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
  showNextStream () {
    this.logger.debug('About to show next player');

    // The next player is actually playing / displaying video, but it isn't
    // visible because the old player is still in front of it.  The destruction
    // of the old player is what actually causes the next player to become
    // visible.
    if (this.iovPlayer) {
      // async, but we don't need to wait for it
      this.iovPlayer.destroy();
    }

    this._clearNextPlayerTimeout();

    if (this.pendingChangeSrcIovPlayer) {
      this.streamConfiguration = this.pendingChangeSrcStreamConfiguration;
      this.iovPlayer = this.pendingChangeSrcIovPlayer;

      this.pendingChangeSrcStreamConfiguration = null;
      this.pendingChangeSrcIovPlayer = null;
    }
  }

  cancelChangeSrc () {
    if (!this.pendingChangeSrcIovPlayer) {
      return;
    }

    // @todo - should we await this?
    this.pendingChangeSrcIovPlayer.destroy();

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
    this.logger.debug('Changing Stream...');

    if (!url) {
      throw new Error('url is required to changeSrc');
    }

    // Handle the case of multiple changeSrc requests.  Only change to the last
    // stream that was requested
    if (this.pendingChangeSrcIovPlayer) {
      this._clearNextPlayerTimeout();
      this.cancelChangeSrc();
    }

    const clspVideoElement = this._prepareVideoElement();

    const streamConfiguration = StreamConfiguration.isStreamConfiguration(url)
      ? url
      : StreamConfiguration.fromUrl(url);

    const changeSrcId = uuidv4();
    const iovPlayer = IovPlayer.factory(
      this.generatePlayerLogId(),
      this.videoElementParent,
      clspVideoElement,
      () => this.changeSrc(this.streamConfiguration),
      // @todo - this is currently not used by IovPlayer...
      this.onPlayerError,
    );

    this.pendingChangeSrcId = changeSrcId;
    this.pendingChangeSrcStreamConfiguration = streamConfiguration;
    this.pendingChangeSrcIovPlayer = iovPlayer;

    this._registerPlayerListeners(iovPlayer);

    const firstFrameReceivedPromise = new Promise(async (resolve, reject) => {
      iovPlayer.on(IovPlayer.events.FIRST_FRAME_SHOWN, () => {
        this.nextPlayerTimeout = setTimeout(() => {
          this._clearNextPlayerTimeout();

          this.logger.debug('Next player has received its first frame...');

          if (showOnFirstFrame) {
            this.showNextStream();
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
    this.logger.debug('clone');

    const newStreamConfiguration = StreamConfiguration.isStreamConfiguration(streamConfiguration)
      ? streamConfiguration.clone()
      : StreamConfiguration.fromUrl(streamConfiguration);

    // @todo - is it possible to reuse the iov player?
    return Iov.factory(this.videoElement, newStreamConfiguration);
  }

  onPlayerError = async (error) => {
    // If it is currently hidden, do nothing
    if (document[utils.windowStateNames.hiddenStateName]) {
      this.stop();
      return;
    }

    this.logger.error('IovPlayer error encountered!');
    this.logger.error(error);

    try {
      await this.restart();
    }
    catch (error) {
      this.logger.error('Error while restarting after IovPlayer error!');
      this.logger.error(error);
    }
  };

  /**
   * Whenever possible, use the changeSrc method instead, since it minimizes the
   * number of black (empty) frames when playing or resuming a stream
   * @param {IovPlayer} iovPlayer
   */
  async play (iovPlayer = this.iovPlayer) {
    this.logger.debug('Play');

    try {
      await iovPlayer.play();
    }
    catch (error) {
      this.logger.debug('Error while trying to play from IovPlayer, destroying IovPlayer...');
      // @todo - display a message in the page (aka to the user) saying that
      // the stream couldn't be played?
      await iovPlayer.destroy();

      throw error;
    }
  }

  async stop (iovPlayer = this.iovPlayer) {
    if (!iovPlayer) {
      this.logger.warn('Tried to stop non-existent player');
      return;
    }

    this.logger.debug('Stop');
    await iovPlayer.stop();
  }

  async restart (iovPlayer = this.iovPlayer) {
    if (!iovPlayer) {
      return;
    }

    // @todo - this is a blunt instrument - is there a more performant (but
    // still reliable) way to restart the player as opposed to destroying it and
    // creating a new one?
    this.logger.debug('Restart');

    // @todo - do we need to handle firstFrameReceivedPromise rejecting here?
    await this.changeSrc(this.streamConfiguration).firstFrameReceivedPromise;
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
    const {
      visibilityChangeEventName,
    } = utils.windowStateNames;

    if (visibilityChangeEventName) {
      document.removeEventListener(visibilityChangeEventName, this.onVisibilityChange);
    }

    window.removeEventListener('online', this.onConnectionChange);
    window.removeEventListener('offline', this.onConnectionChange);

    if (this.iovPlayer) {
      try {
        await this.iovPlayer.destroy();
      }
      catch (error) {
        this.logger.error('Error while destroying IOV Player while destroying IOV');
        this.logger.error(error);
      }
    }

    this.iovPlayer = null;
    this.streamConfiguration = null;

    this.videoElement = null;
    this.videoElementParent = null;

    // @todo @metrics
    // this.metrics = null;

    await super._destroy();
  }
}
