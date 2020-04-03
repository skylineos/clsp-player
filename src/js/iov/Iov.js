'use strict';

import uuidv4 from 'uuid/v4';

import Logger from '../utils/logger';
import utils from '../utils/';

import IovPlayer from './IovPlayer';
import StreamConfiguration from './StreamConfiguration';

const DEFAULT_ENABLE_METRICS = false;
const DEFAULT_CONNECTION_CHANGE_PLAY_DELAY = 5;

/**
 * Internet of Video client. This module uses the MediaSource API to
 * deliver video content streamed through CLSP from distributed sources.
 */
export default class Iov {
  static EVENT_NAMES = [
    'metric',
    'firstFrameShown',
    'videoReceived',
    'videoInfoReceived',
  ];

  static METRIC_TYPES = [];

  static factory (videoElementId, options) {
    return new Iov(videoElementId, options);
  }

  /**
   * @param {String} videoElementId
   * @param {Object} [options]
   */
  constructor (videoElementId, options = {}) {
    if (!utils.supported()) {
      throw new Error('You are using an unsupported browser - Unable to play CLSP video');
    }

    if (!videoElementId) {
      throw new Error('videoElementId is required to construct an Iov');
    }

    // This should be unique - it is only used for logging
    this.id = options.id || uuidv4();

    this.logger = Logger().factory(`Iov ${this.id}`);
    this.logger.debug('Constructing...');

    this.metrics = {};

    // @todo - there must be a more proper way to do events than this...
    this.events = {};

    for (let i = 0; i < Iov.EVENT_NAMES.length; i++) {
      this.events[Iov.EVENT_NAMES[i]] = [];
    }

    this.destroyed = false;
    this.onReadyAlreadyCalled = false;
    this.videoElementId = videoElementId;
    this.videoElementParent = null;
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

  on (name, action) {
    this.logger.debug(`Registering Listener for ${name} event...`);

    if (!Iov.EVENT_NAMES.includes(name)) {
      throw new Error(`"${name}" is not a valid event."`);
    }

    if (this.destroyed) {
      return;
    }

    this.events[name].push(action);
  }

  trigger (name, value) {
    const sillyMetrics = [];

    if (sillyMetrics.includes(name)) {
      this.logger.silly(`Triggering ${name} event...`);
    }
    else {
      this.logger.debug(`Triggering ${name} event...`);
    }

    if (this.destroyed) {
      return;
    }

    if (!Iov.EVENT_NAMES.includes(name)) {
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

    if (!Iov.METRIC_TYPES.includes(type)) {
      // @todo - should this throw?
      return;
    }

    this.metrics[type] = value;

    this.trigger('metric', {
      type,
      value: this.metrics[type],
    });
  }

  onConnectionChange = () => {
    // @todo - does this still work?
    if (window.navigator.onLine) {
      this.logger.debug('Back online...');
      if (this.iovPlayer.stopped) {
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

    this.restart();
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

    this.videoElementParent.classList.add('clsp-video-container');

    const clspVideoElement = window.document.createElement('video');
    clspVideoElement.classList.add('clsp-video');
    clspVideoElement.muted = true;

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
    iovPlayer.on('firstFrameShown', () => {
      this.trigger('firstFrameShown');
    });

    iovPlayer.on('videoReceived', () => {
      this.trigger('videoReceived');
    });

    iovPlayer.on('videoInfoReceived', () => {
      this.trigger('videoInfoReceived');
    });
  }

  generatePlayerLogId () {
    return `iov:${this.id}.player:${++this.iovPlayerCount}`;
  }

  _clearNextPlayerTimeout () {
    if (this.nextPlayerTimeout) {
      clearTimeout(this.nextPlayerTimeout);
      this.nextPlayerTimeout = null;
    }
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

  cancelChangeSrc (id) {
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
      clspVideoElement,
      () => this.changeSrc(this.streamConfiguration),
      this.onPlayerError
    );

    this.pendingChangeSrcId = changeSrcId;
    this.pendingChangeSrcStreamConfiguration = streamConfiguration;
    this.pendingChangeSrcIovPlayer = iovPlayer;

    this._registerPlayerListeners(iovPlayer);

    const firstFrameReceivedPromise = new Promise(async (resolve, reject) => {
      try {
        await iovPlayer.initialize(streamConfiguration);

        // @todo - should the play method only resolve once the first frame has
        // been shown?  right now it resolves on first moof recevied
        await this.play(iovPlayer);

        iovPlayer.on('firstFrameShown', () => {
          this.nextPlayerTimeout = setTimeout(() => {
            this._clearNextPlayerTimeout();

            this.logger.debug('Next player has received its first frame...');

            if (showOnFirstFrame) {
              this.showNextStream();
            }

            resolve();
          }, this.SHOW_NEXT_VIDEO_DELAY * 1000);
        });
      }
      catch (error) {
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

  onPlayerError = (error) => {
    // If it is currently hidden, do nothing
    if (document[utils.windowStateNames.hiddenStateName]) {
      this.stop();
      return;
    }

    this.logger.error(error);

    this.restart();
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
      this.logger.debug('Play error - destroying');
      // @todo - display a message in the page saying that the stream couldn't
      // be played
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

  enterFullscreen (iovPlayer = this.iovPlayer) {
    if (!iovPlayer) {
      this.logger.warn('Tried to fullscreen non-existent player');
      return;
    }

    this.logger.debug('Enter fullscreen');
    iovPlayer.enterFullscreen();
  }

  exitFullscreen (iovPlayer = this.iovPlayer) {
    if (!iovPlayer) {
      this.logger.warn('Tried to un-fullscreen non-existent player');
      return;
    }

    this.logger.debug('Exit fullscreen');
    iovPlayer.exitFullscreen();
  }

  toggleFullscreen (iovPlayer = this.iovPlayer) {
    if (!iovPlayer) {
      this.logger.warn('Tried to toggle fullscreen on non-existent player');
      return;
    }

    this.logger.debug('Toggle fullscreen');
    iovPlayer.toggleFullscreen();
  }

  /**
   * Dereference the necessary properties, clear any intervals and timeouts, and
   * remove any listeners.  Will also destroy the player.
   *
   * @returns {Promise}
   */
  destroy () {
    this.logger.debug('destroy');

    if (this.destroyed) {
      return;
    }

    this.destroyed = true;

    const {
      visibilityChangeEventName,
    } = utils.windowStateNames;

    if (visibilityChangeEventName) {
      document.removeEventListener(visibilityChangeEventName, this.onVisibilityChange);
    }

    window.removeEventListener('online', this.onConnectionChange);
    window.removeEventListener('offline', this.onConnectionChange);

    const iovPlayerDestroyPromise = this.iovPlayer
      ? this.iovPlayer.destroy()
      : Promise.resolve();

    this.iovPlayer = null;
    this.streamConfiguration = null;

    this.videoElement = null;
    this.videoElementParent = null;

    this.events = null;
    this.metrics = null;

    return iovPlayerDestroyPromise;
  }
}
