import { sleepSeconds } from 'sleepjs';

import utils from '../utils/utils';
import EventEmitter from '../utils/EventEmitter';

import IovPlayerCollection from './Player/IovPlayerCollection';
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

    this.iovPlayerCollection = IovPlayerCollection.factory(`${this.logId}.iovPlayerCollection`);

    // Needed for videojs plugin
    this.iovPlayerCollection.on(IovPlayerCollection.events.FIRST_FRAME_SHOWN, () => {
      this.emit(Iov.events.FIRST_FRAME_SHOWN);
    });

    // Needed for videojs plugin
    this.iovPlayerCollection.on(IovPlayerCollection.events.VIDEO_RECEIVED, () => {
      this.emit(Iov.events.VIDEO_RECEIVED);
    });

    // Needed for videojs plugin
    this.iovPlayerCollection.on(IovPlayerCollection.events.VIDEO_INFO_RECEIVED, () => {
      this.emit(Iov.events.VIDEO_INFO_RECEIVED);
    });

    // This means there's no chance of retrying...
    this.iovPlayerCollection.on(IovPlayerCollection.events.IFRAME_DESTROYED_EXTERNALLY, () => {
      this.emit(Iov.events.IFRAME_DESTROYED_EXTERNALLY);
    });
  }

  onConnectionChange = async () => {
    if (!window.navigator.onLine) {
      this.logger.info('Offline!');

      try {
        await this.stop();
      }
      catch (error) {
        this.logger.warn('Error encountered while stopping during offline event:');
        this.logger.error(error);
      }

      return;
    }

    this.logger.info('Back online...');

    try {
      await this.restart();
    }
    catch (error) {
      this.logger.error('Error while trying to restart during online event');
      this.logger.error(error);
    }
  };

  onVisibilityChange = async () => {
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

    this.logger.info('Back in focus...');

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
   * @param {StreamConfiguration|String} url
   *   The StreamConfiguration or url of the new stream
   * @param {Boolean} showOnFirstFrame
   *   if true, when the new stream has received its first frame,
   */
  async changeSrc (url) {
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

    const clspVideoElement = this._prepareVideoElement();

    this.streamConfiguration = StreamConfiguration.isStreamConfiguration(url)
      ? url
      : StreamConfiguration.fromUrl(url);

    let iovPlayerId;

    try {
      iovPlayerId = await this.iovPlayerCollection.create(
        this.videoElementParent,
        clspVideoElement,
        this.streamConfiguration,
      );
    }
    catch (error) {
      this.logger.error(`Error while creating / playing the player for stream ${this.streamConfiguration.streamName}`);
      this.logger.error(error);
      throw error;
    }

    if (!iovPlayerId) {
      throw new Error('IovPlayer was created, but no id was returned');
    }

    // changeSrc will only complete when the video is actually playing
    await new Promise((resolve, reject) => {
      this.iovPlayerCollection.on(IovPlayerCollection.events.FIRST_FRAME_SHOWN, async ({ id }) => {
        // This first frame shown was for a different player
        if (iovPlayerId !== id) {
          // Note, we are not resolving nor rejecting here
          return;
        }

        this.logger.info('Next player has received its first frame...');
        await sleepSeconds(this.SHOW_NEXT_VIDEO_DELAY);

        try {
          if (this.isDestroyed) {
            throw new Error('Next player received first frame while destroyed!');
          }

          resolve();
        }
        catch (error) {
          this.logger.error('Error while handling first frame shown event!');
          reject(error);
        }
      });
    });
  }

  async stop () {
    if (this.isDestroyComplete) {
      throw new Error('Tried to stop while destroyed');
    }

    if (this.isStopping) {
      this.logger.info('Already stopping');
      return;
    }

    this.isStopping = true;

    try {
      await this.iovPlayerCollection.removeAll();
    }
    finally {
      this.isStopping = false;
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
      await this.changeSrc(this.streamConfiguration);
    }
    catch (error) {
      this.logger.error('Failed to changeSrc while restarting!');

      // @todo - on failure, should we continue retrying?  maybe not since play
      // has its own retry logic in IovPlayerCollection

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
      this.logger.error('Error while stopping while destroying');
      this.logger.error(error);
    }

    try {
      await this.iovPlayerCollection.destroy();
    }
    catch (error) {
      this.logger.error('Error while destroying IOV Player Collection while destroying');
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
