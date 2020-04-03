'use strict';

// This is configured as an external library by webpack, so the caller must
// provide videojs on `window`
import videojs from 'video.js';

import ClspSourceHandler from './ClspSourceHandler';
import utils from '../utils/';
import Logger from '../utils/logger';

const Plugin = videojs.getPlugin('plugin');

// Note that the value can never be zero!
const VIDEOJS_ERRORS_PLAYER_CURRENT_TIME_MIN = 1;
const VIDEOJS_ERRORS_PLAYER_CURRENT_TIME_MAX = 20;

const logger = Logger().factory('clsp-videojs-plugin');

let totalPluginCount = 0;

export default (defaultOptions = {}) => class ClspPlugin extends Plugin {
  static VERSION = utils.version;

  static utils = utils;

  static METRIC_TYPES = [
    'videojs.errorRetriesCount',
  ];

  static register () {
    if (videojs.getPlugin(utils.name)) {
      throw new Error('You can only register the clsp plugin once, and it has already been registered.');
    }

    const sourceHandler = ClspSourceHandler()('html5');

    videojs.getTech('Html5').registerSourceHandler(sourceHandler, 0);
    videojs.registerPlugin(utils.name, ClspPlugin);

    logger.debug('plugin registered');

    return ClspPlugin;
  }

  static getDefaultOptions () {
    return {
      /**
       * The number of times to retry playing the video when there is an error
       * that we know we can recover from.
       *
       * If a negative number is passed, retry indefinitely
       * If 0 is passed, never retry
       * If a positive number is passed, retry that many times
       */
      maxRetriesOnError: -1,
      tourDuration: 10 * 1000,
      enableMetrics: false,
      videojsErrorsOptions: {},
    };
  }

  constructor (player, options) {
    super(player, options);

    this.id = ++totalPluginCount;
    this.logger = Logger().factory(`CLSP Plugin ${this.id}`);

    this.logger.debug('creating plugin instance');

    const playerOptions = player.options_;

    this.options = videojs.mergeOptions({
      ...this.constructor.getDefaultOptions(),
      ...defaultOptions,
      ...(playerOptions.clsp || {}),
    }, options);

    this._playerOptions = playerOptions;
    this.currentSourceIndex = 0;

    player.addClass('vjs-clsp');

    if (this.options.customClass) {
      player.addClass(this.options.customClass);
    }

    this.resetErrors(player);

    // @todo - this error doesn't work or display the way it's intended to
    if (!utils.supported()) {
      return player.error({
        code: 'PLAYER_ERR_NOT_COMPAT',
        type: 'PLAYER_ERR_NOT_COMPAT',
        dismiss: false,
      });
    }

    this.autoplayEnabled = playerOptions.autoplay || player.getAttribute('autoplay') === 'true';

    // for debugging...

    // const oldTrigger = player.trigger.bind(player);
    // player.trigger = (eventName, ...args) => {
    //   console.log(eventName);
    //   console.log(...args);
    //   oldTrigger(eventName, ...args);
    // };

    // Track the number of times we've retried on error
    player._errorRetriesCount = 0;

    // Needed to make videojs-errors think that the video is progressing.
    // If we do not do this, videojs-errors will give us a timeout error.
    // The number just needs to change, it doesn't need to continually increment
    player._currentTime = VIDEOJS_ERRORS_PLAYER_CURRENT_TIME_MIN;
    player.currentTime = () => {
      // Don't let this number get over 2 billion!
      if (player._currentTime > VIDEOJS_ERRORS_PLAYER_CURRENT_TIME_MAX) {
        player._currentTime = VIDEOJS_ERRORS_PLAYER_CURRENT_TIME_MIN;
      }
      else {
        player._currentTime++;
      }

      return player._currentTime;
    };

    // @todo - are we not using videojs properly?
    // @see - https://github.com/videojs/video.js/issues/5233
    // @see - https://jsfiddle.net/karstenlh/96hrzp5w/
    // This is currently needed for autoplay.
    player.on('ready', () => {
      this.logger.debug('the player is ready');

      if (this.autoplayEnabled) {
        // Even though the "ready" event has fired, it's not actually ready
        // until the "next tick"...
        setTimeout(() => {
          player.play();
        });
      }
    });

    // @todo - this seems like we aren't using videojs properly
    player.on('error', async (event) => {
      this.logger.debug('the player encountered an error');

      const retry = async () => {
        this.logger.debug('retrying due to error');

        if (this.options.maxRetriesOnError === 0) {
          return;
        }

        if (this.options.maxRetriesOnError < 0 || player._errorRetriesCount <= this.options.maxRetriesOnError) {
          // @todo - when can we reset this to zero?
          player._errorRetriesCount++;

          this.resetErrors(player);

          const iov = this.getIov();

          // @todo - investigate how this can be called when the iov has been destroyed
          if (!iov || iov.destroyed) {
            await this.initializeIov(player);
          }
          else {
            await iov.restart();
          }
        }
      };

      const error = player.error();

      switch (error.code) {
        // timeout error
        case -2: {
          return retry();
        }
        case 0:
        case 4:
        case 5:
        case 'PLAYER_ERR_Iov': {
          break;
        }
        default: {
          return retry();
        }
      }
    });

    player.on('play', async () => {
      this.logger.debug('on player play event');

      // @todo - it is probably unnecessary to have to completely tear down the
      // existing iov and create a new one.  But for now, this works
      await this.initializeIov(player);

      // @todo - this hides it permanently.  it should be re-enabled when the
      // player stops or pauses.  This will likely involve using some videojs
      // classes rather than using the .hide method
      this.player.loadingSpinner.hide();
    });

    // the "pause" event gets triggered for some reason in scenarios where I do
    // not expect it to be triggered.  Therefore, we will create our own "stop"
    // event to be able to better control the player to stop.
    player.on('stop', () => {
      this.logger.debug('on player stop event');

      this.player.pause();
      this.getIov().stop();
    });

    player.on('dispose', () => {
      this.logger.debug('on dispose stop event');

      this.destroy(player);
    });

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
  }

  onVisibilityChange = () => {
    this.logger.debug('tab visibility changed...');

    if (document[utils.windowStateNames.hiddenStateName]) {
      // Continue to update the time, which will prevent videojs-errors from
      // issuing a timeout error
      this.visibilityChangeInterval = setInterval(async () => {
        this.logger.debug('updating time...');

        this.player.trigger('timeupdate');
      }, 2000);

      return;
    }

    if (this.visibilityChangeInterval) {
      clearInterval(this.visibilityChangeInterval);
    }
  };

  getVideojsErrorsOptions () {
    this.logger.debug('getting videojs errors options...');

    return {
      timeout: 120 * 1000,
      errors: {
        PLAYER_ERR_NOT_COMPAT: {
          type: 'PLAYER_ERR_NOT_COMPAT',
          headline: 'This browser is unsupported.',
          message: 'Chrome 52+ is required.',
        },
      },
      ...this.options.videojsErrorsOptions,
    };
  }

  resetErrors (player) {
    this.logger.debug('resetting errors...');

    // @see - https://github.com/videojs/video.js/issues/4401
    player.error(null);
    player.errorDisplay.close();

    // Support for the videojs-errors library
    // After an error occurs, and then we clear the error and its message
    // above, we must re-enable videojs-errors on the player
    if (player.errors) {
      player.errors(this.getVideojsErrorsOptions());
    }
  }

  getClspHandler (player = this.player) {
    this.logger.debug('getting CLSP handler Iov...');

    return player.tech(true).clsp;
  }

  getIov () {
    this.logger.debug('getting Iov...');

    return this.getClspHandler().iov;
  }

  onClspHandlerError = () => {
    this.logger.debug('handling CLSP error...');

    const clspHandler = this.getClspHandler();

    clspHandler.destroy();

    this.player.error({
      // @todo - change the code to 'INSUFFICIENT_RESOURCES'
      code: 0,
      type: 'INSUFFICIENT_RESOURCES',
      headline: 'Insufficient Resources',
      message: 'The current hardware cannot support the current number of playing streams.',
    });
  };

  async initializeIov (player) {
    this.logger.debug('initializing Iov...');

    const clspHandler = this.getClspHandler();

    if (!clspHandler) {
      throw new Error(`VideoJS Player ${player.id()} does not have CLSP tech!`);
    }

    clspHandler.off('error', this.onClspHandlerError);
    clspHandler.on('error', this.onClspHandlerError);

    await clspHandler.createIov(player);

    const iov = this.getIov();

    iov.ENABLE_METRICS = this.options.enableMetrics;

    this.logger.debug('resgistering "firstFrameShown" event');

    // @todo - is this still the correct way to track this?  we may want to use
    // the onShown handler in the iov instead
    iov.on('firstFrameShown', () => {
      this.logger.debug('about to trigger "firstFrameShown" event on videojs player');
      player.trigger('firstFrameShown');
    });

    await iov.stop();

    await iov.changeSrc(clspHandler.source_.src).firstFrameReceivedPromise;
  }

  destroy (player = this.player) {
    this.logger.debug('destroying...');

    // Note that when the 'dispose' event is fired, this.player no longer exists
    if (!player) {
      this.logger.warn('Unable to destroy CLSP Plugin without the player!');
      return;
    }

    if (this.destroyed) {
      this.logger.debug('Tried to destroy when already destroyed');
      return;
    }

    this.destroyed = true;

    // @todo - destroy the tech, since it is a player-specific instance
    try {
      const clspHandler = this.getClspHandler(player);

      clspHandler.destroy();
      clspHandler.off('error', this.onClspHandlerError);

      const {
        visibilityChangeEventName,
      } = utils.windowStateNames;

      if (visibilityChangeEventName) {
        this.logger.debug('removing onVisibilityChange listener...');
        document.removeEventListener(visibilityChangeEventName, this.onVisibilityChange);
      }

      if (this.visibilityChangeInterval) {
        this.logger.debug('removing visibilityChangeInterval...');
        clearInterval(this.visibilityChangeInterval);
      }

      this._playerOptions = null;
      this.currentSourceIndex = null;
    }
    catch (error) {
      // @todo - need to improve iov destroy logic...
      this.logger.error('Error while destroying clsp plugin instance!');
      this.logger.error(error);
    }
  }
};
