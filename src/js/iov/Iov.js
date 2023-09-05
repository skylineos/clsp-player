/**
 * The Iov is responsible for:
 * - providing an interface to callers trying to play CLSP streams
 * - managing the container and video elements used for playing CLSP streams
 *
 * The caller should only ever interact with an Iov instance and the Iov
 * Collection singleton.
 */

import { sleepSeconds } from 'sleepjs';
import isNil from 'lodash/isNil';

import utils from '../utils/utils';
import EventEmitter from '../utils/EventEmitter';

import IovPlayerCollection from './Player/IovPlayerCollection';
import IovPlayer from './Player/IovPlayer';
import StreamConfiguration from './StreamConfiguration';

const DEFAULT_ENABLE_METRICS = false;
const DEFAULT_CONNECTION_CHANGE_PLAY_DELAY = 5;

const CONTAINER_CLASS = 'clsp-player-container';
const VIDEO_CLASS = 'clsp-player';
const LOADING_ANIMATION_CLASS = 'clsp-player-loading-animation';
const ERROR_MSG_CLASS = 'clsp-player-error-msg';

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
    DESTROYING: 'destroying',
  };

  static factory (
    logId,
    id,
    config,
  ) {
    return new Iov(
      logId,
      id,
      config,
    );
  }

  constructor (
    logId,
    id,
    config,
  ) {
    if (!utils.supported()) {
      throw new Error('You are using an unsupported browser - Unable to play CLSP video');
    }

    super(logId);

    if (isNil(id)) {
      throw new Error('id is required to construct an Iov');
    }

    if (!config) {
      throw new Error('Tried to construct without config');
    }

    // @todo @metrics
    // this.metrics = {};

    this.id = id;
    this.shouldRetainVideoElement = false;
    this.containerElement = null;
    this.videoElement = null;

    this._config = config;
    // It's worth noting here that regardless of whether or not the caller
    // passes in a videoElement to be reused, the Iov instance will always use
    // the same videoElement for all IovPlayers until the Iov is destroyed.
    // This is different from the previous implementation, which would use a
    // different videoElement for every changeSrc command.
    this.#initializeElements(config);

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
      if (this.isDestroyed) {
        this.logger.info('Iframe was destroyed externally while in process of destroying');
        return;
      }

      this.emit(Iov.events.IFRAME_DESTROYED_EXTERNALLY);
    });

    this.iovPlayerCollection.on(IovPlayerCollection.events.DISPLAY_ERROR_MSG, (error) => {
      this.logger.info('Displaying error msg to user');
      this.displayErrorMsg(error.error.message);
    });
  }

  #initializeElements ({
    videoElementId,
    videoElement,
    containerElementId,
    containerElement,
  }) {
    this.logger.info('Initializing elements...');

    if (containerElementId) {
      containerElement = document.getElementById(containerElementId);
    }

    // at this point, the container element may still be falsy.  we'll handle
    // that after we determine the video element
    this.containerElement = containerElement;

    // If one or the other was passed in, CLSP Player will NOT be responsible
    // for the creation and possible deletion of any video elements on the DOM
    if (videoElementId || videoElement) {
      this.shouldRetainVideoElement = true;
    }

    if (videoElementId) {
      videoElement = document.getElementById(videoElementId);
    }

    this.videoElement = videoElement;

    if (this.shouldRetainVideoElement && !this.videoElement) {
      if (videoElementId) {
        throw new Error(`Unable to get element with id: "${videoElementId}"`);
      }

      throw new Error('No video element or id was passed');
    }

    // If we don't have either the container or the video element at this
    // point, then the caller didn't pass any elements to us.  We need at least
    // of those 2 to create a player.
    if (!this.videoElement && !this.containerElement) {
      throw new Error('Must pass at least 1 valid container or video element or id');
    }

    if (!this.videoElement) {
      videoElement = document.createElement('video');

      containerElement.appendChild(videoElement);

      this.videoElement = videoElement;
    }

    if (!this.containerElement) {
      this.containerElement = this.videoElement.parentNode;
    }

    // One final sanity check
    if (!this.containerElement || !this.videoElement) {
      throw new Error('Unable to get both the container and video elements');
    }

    this.containerElement.classList.add(CONTAINER_CLASS);

    this.videoElement.classList.add(VIDEO_CLASS);
    this.videoElement.muted = true;
    this.videoElement.playsinline = true;
  }

  #uninitializeElements () {
    this.logger.info('Unnitializing elements...');

    // Ensures all loading animations are cleaned up.
    this.destroyAllLoadingAnimations();

    this.containerElement.classList.remove(CONTAINER_CLASS);

    this.videoElement.classList.remove(VIDEO_CLASS);

    // Setting the src of the video element to an empty string is
    // the only reliable way we have found to ensure that MediaSource,
    // SourceBuffer, and various Video elements are properly dereferenced
    // to avoid memory leaks
    // @todo - should these occur after stop? is there a reason they're done
    // in this order?
    this.videoElement.src = '';

    // If the CLSP Player was responsible for creating the video element,
    // completely remove it
    if (!this.shouldRetainVideoElement) {
      this.containerElement.removeChild(this.videoElement);
      this.videoElement.remove();
      this.videoElement = null;
    }

    this.videoElement = null;
    this.containerElement = null;
  }

  onConnectionChange = async () => {
    if (utils.isOnline()) {
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
      this.logger.error('Error encountered while stopping during offline event:');
      this.logger.error(error);
    }
  };

  onVisibilityChange = async () => {
    // @todo the player doesn't HAVE to restart on visibility change.  If the
    // MSEWrapper is changed to NOT put moofs on the segment queue when the
    // document is not in focus, the player can remain and not have to be
    // destroyed and restarted every time.  Perhaps only after a configurable
    // timeout should the destroy and restart be used - that way the SFS isn't
    // serving the stream segments to players that aren't using them.

    if (utils.isDocumentHidden()) {
      try {
        await this.stop();
      }
      catch (error) {
        this.logger.error('Error while trying to stop during visibilityChange event');
        this.logger.error(error);
      }

      return;
    }

    this.logger.info('Back in focus...');

    if (!this.streamConfiguration) {
      // If streamConfiguration doesn't exist, it means that this Iov was
      // created, but was never played.
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

  getErrorMsgContainer = () => {
    return this.containerElement.getElementsByClassName(ERROR_MSG_CLASS)[0];
  }

  getLoadingAnimation = () => {
    // Returns an HTMLCollection [] with all the loading animations
    // that exist in the container.
    return this.containerElement.getElementsByClassName(LOADING_ANIMATION_CLASS);
  }

  destroyAllLoadingAnimations = () => {
    // Remove all loading animations within the container.
    const loadingElements = this.getLoadingAnimation();

    for (let i = 0; i < loadingElements.length; i++) {
      loadingElements[i].remove();
    }
  }

  createLoadingAnimation = () => {
    // If loading animation already exists, end function.
    const loadingElements = this.getLoadingAnimation();
    if (loadingElements.length > 0) {
      return;
    }

    // Create loading div element.
    const loadingDiv = document.createElement('div');
    loadingDiv.classList.add(LOADING_ANIMATION_CLASS);

    // Add loading div to the container.
    this.containerElement.insertBefore(loadingDiv, this.videoElement);
  }

  clearErrorMsg = () => {
    this.getErrorMsgContainer().innerHTML= "";
  }

  displayErrorMsg = (errorMsg) => {
    const errorMsgContainer =  this.getErrorMsgContainer()
    errorMsgContainer.innerHTML = errorMsg;
  }

  /**
   * If an existing container exists for holding an error msg, clear it.
   * Otherwise, create a new container element for holding an error msg.
   */
  initializeErrorMsgContainer = () => {
    if (this.getErrorMsgContainer() == undefined) {
      const errorDiv = document.createElement('div');
      errorDiv.classList.add(ERROR_MSG_CLASS);
      this.containerElement.insertBefore(videoDiv, this.videoElement);
    } else {
      this.clearErrorMsg();
    }
  }

  /**
   * @param {StreamConfiguration|String} url
   *   The StreamConfiguration or url of the new stream
   */
  async changeSrc (url) {
    // adding loading animation to the IOV

    if (this.isDestroyed) {
      this.logger.info('Tried to changeSrc while destroyed');
      return;
    }

    this.logger.info('Changing Stream...');

    if (!url) {
      throw new Error('url is required to changeSrc');
    }

    this.streamConfiguration = StreamConfiguration.isStreamConfiguration(url)
      ? url
      : StreamConfiguration.fromUrl(url);

    if (utils.isDocumentHidden()) {
      // @todo - it would be better to do something other than just log info
      // here...
      this.logger.info('Tried to changeSrc while tab was hidden!');

      return;
    }

    if (!utils.isOnline()) {
      // @todo - display 'no internet connection' indicator
      this.logger.info('Tried to changeSrc while not connected to the internet!');

      return;
    }

    this.createLoadingAnimation();
    this.initializeErrorMsgContainer();
   

    let iovPlayerId;

    // When many requests are made in rapid succession to the same SFS, the
    // streams can fail to load, and it may take MINUTES for the connection to
    // properly establish itself.  This is a simple workaround to address that
    // issue, since many simultaneous streams in a single browser window is one
    // of the primary use cases of the CLSP Player.
    await sleepSeconds(Math.random());

    try {
      iovPlayerId = await this.iovPlayerCollection.create(
        this.containerElement,
        this.videoElement,
        this.streamConfiguration,
      );
    }
    catch (error) {
      this.logger.error(`Error while creating / playing the player for stream ${this.streamConfiguration.streamName}`);
      this.logger.error(error);

      this.destroyAllLoadingAnimations();

      throw error;
    }

    if (!iovPlayerId) {
      this.destroyAllLoadingAnimations();

      throw new Error('IovPlayer was created, but no id was returned');
    }

    // changeSrc will only complete when the video is actually playing
    await new Promise((resolve, reject) => {
      this.iovPlayerCollection.on(IovPlayerCollection.events.FIRST_FRAME_SHOWN, async ({ id }) => {
        // Ensuring that n number of loading animations are removed.
        this.destroyAllLoadingAnimations();

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

    this.#uninitializeElements();
    this._config = null;

    // @todo @metrics
    // this.metrics = null;

    await super._destroy();

    const timeFinished = Date.now();
    const timeToDestroy = (timeFinished - timeStarted) / 1000;

    this.logger.info(`Destroy complete in ${timeToDestroy} seconds...`);
  }

  async destroy () {
    // Since this Iov instance may be destroyed without the caller's explicit
    // invocation (e.g. when the iframe is destroyed externally), emit an event
    // that the caller may listen to to know when this Iov has been destroyed
    this.emit(Iov.events.DESTROYING, { iov: this });

    await super.destroy();
  }
}
