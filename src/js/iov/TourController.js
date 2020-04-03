'use strict';

import StreamConfiguration from './StreamConfiguration';
import Logger from '../utils/logger';

const DEFAULT_TOUR_INTERVAL_DURATION = 10;
const DEFAULT_TOUR_PRELOAD_DURATION = 9;

export default class TourController {
  static factory (
    iovCollection, videoElementId, options,
  ) {
    return new TourController(
      iovCollection, videoElementId, options,
    );
  }

  constructor (
    iovCollection, videoElementId, options = {},
  ) {
    this.logger = Logger().factory('Tour Controller');

    this.iovCollection = iovCollection;

    this.destroyed = false;
    this.startTime = null;
    this.streamConfigurations = [];
    this.iov = null;
    this.currentIndex = 0;
    this.interval = null;
    this.videoElementId = videoElementId;

    this.pendingChangeSrcs = {};

    this.options = {
      onLoaded: options.onLoad || (() => {}),
      onShown: options.onShown || (() => {}),
    };

    // These can be configured manually after construction
    this.TOUR_INTERVAL_DURATION = DEFAULT_TOUR_INTERVAL_DURATION;
    this.TOUR_PRELOAD_DURATION = DEFAULT_TOUR_PRELOAD_DURATION;
  }

  addUrls (urls) {
    if (!Array.isArray(urls)) {
      urls = [
        urls,
      ];
    }

    for (let i = 0; i < urls.length; i++) {
      this.streamConfigurations.push(StreamConfiguration.fromUrl(urls[i]));
    }
  }

  _cancelChangeSrc (changeSrcId) {
    if (!Object.prototype.hasOwnProperty.call(this.pendingChangeSrcs, changeSrcId)) {
      return;
    }

    this.iov.cancelChangeSrc(changeSrcId);

    if (this.pendingChangeSrcs[changeSrcId].timeout) {
      clearTimeout(this.pendingChangeSrcs[changeSrcId].timeout);
      this.pendingChangeSrcs[changeSrcId].timeout = null;
    }

    delete this.pendingChangeSrcs[changeSrcId];
  }

  _cancelAllChangeSrcs () {
    for (const [
      changeSrcId,
      pendingChangeSrc,
    ] of Object.entries(this.pendingChangeSrcs)) {
      this._cancelChangeSrc(changeSrcId);
    }
  }

  _changeSrc (index, streamConfiguration) {
    const stopTryingToPlayerAfter = this.TOUR_INTERVAL_DURATION + this.TOUR_PRELOAD_DURATION;
    let preloadTimeout = null;
    let changeSrcTimeout = null;
    let changeSrcId = null;

    this._cancelAllChangeSrcs();

    return new Promise(async (resolve, reject) => {
      const onSuccess = () => {
        this.logger.debug(`Successfull played ${streamConfiguration.streamName}`);

        if (preloadTimeout) {
          clearTimeout(preloadTimeout);
          preloadTimeout = null;
        }

        if (changeSrcTimeout) {
          clearTimeout(changeSrcTimeout);
          changeSrcTimeout = null;
        }

        delete this.pendingChangeSrcs[changeSrcId];

        this.options.onLoaded(
          null, index, streamConfiguration,
        );

        resolve();
      };

      const onError = (error) => {
        this.logger.error(error);

        this._cancelChangeSrc(changeSrcId);

        // Note that we cancel the preloadTimeout here - an error could occur
        // before the configured preload time, but we expect the caller (next)
        // to perform the preload timeout task of showing the next stream
        if (preloadTimeout) {
          clearTimeout(preloadTimeout);
          preloadTimeout = null;
        }

        if (changeSrcTimeout) {
          clearTimeout(changeSrcTimeout);
          changeSrcTimeout = null;
        }

        this.options.onLoaded(
          error, index, streamConfiguration,
        );

        reject(error);
      };

      // If the stream hasn't loaded during the configured preload time, show
      // the empty player to let the user know there is an error
      preloadTimeout = setTimeout(() => {
        if (preloadTimeout) {
          clearTimeout(preloadTimeout);
          preloadTimeout = null;
        }

        this._showNextStream(
          0, index, streamConfiguration,
        );
      }, this.TOUR_PRELOAD_DURATION * 1000);

      // There is a network timeout configured for playing the stream, which if
      // reached will throw an error at changeSrc.  However, the tour interval
      // may be shorter than the network timeout.  Therefore, if the stream has
      // not loaded during the timeout interval, we need to stop trying to load
      // it.
      changeSrcTimeout = setTimeout(() => {
        onError(new Error(`Failed to play ${streamConfiguration.streamName} after ${stopTryingToPlayerAfter} seconds`));
      }, stopTryingToPlayerAfter * 1000);

      try {
        const {
          id: _changeSrcId,
          firstFrameReceivedPromise,
        } = this.iov.changeSrc(streamConfiguration, false);

        changeSrcId = _changeSrcId;
        this.pendingChangeSrcs[changeSrcId] = {
          id: changeSrcId,
          timeout: changeSrcTimeout,
        };

        await firstFrameReceivedPromise;

        onSuccess();
      }
      catch (error) {
        onError(error);
      }
    });
  }

  _showNextStream (
    nextStartTime, index, streamConfiguration,
  ) {
    const show = () => {
      this.iov.showNextStream();
      this.options.onShown(
        null, index, streamConfiguration,
      );
    };

    if (!nextStartTime) {
      show();
      return;
    }

    const showAfter = (this.TOUR_PRELOAD_DURATION * 1000) - (Date.now() - nextStartTime);

    if (showAfter <= 0) {
      show();
      return;
    }

    setTimeout(() => {
      show();
    }, showAfter);
  }

  async next (playImmediately = false, resetTimer = false) {
    const nextStartTime = playImmediately
      ? 0
      : Date.now();

    // Start the tour list over again once the end of the stream list is reached
    if (this.currentIndex === this.streamConfigurations.length) {
      this.currentIndex = 0;
    }

    const streamConfiguration = this.streamConfigurations[this.currentIndex];

    this.currentIndex++;

    // Store this locally.  Since this is asynchronous, and since next can be
    // called multiple times in a row, we don't want to read this.currentIndex
    // later and have it be the wrong incremented value.
    const index = this.currentIndex;

    let playSucceeded = false;

    try {
      await this._changeSrc(index, streamConfiguration);

      playSucceeded = true;

      this._showNextStream(
        nextStartTime, index, streamConfiguration,
      );
    }
    catch (error) {
      this.logger.error(`Failed to play ${streamConfiguration.streamName}`);
      this.logger.error(error);

      if (!playSucceeded) {
        // Even if the stream doesn't load, we need to show the empty player
        this._showNextStream(
          nextStartTime, index, streamConfiguration,
        );
      }
    }

    if (resetTimer) {
      clearInterval(this.interval);

      await this.resume(true);
    }
  }

  async previous () {
    // @todo - this seems hacky
    if (this.currentIndex === 0) {
      this.currentIndex = this.streamConfigurations.length - 2;
    }
    else if (this.currentIndex === 1) {
      this.currentIndex = this.streamConfigurations.length - 1;
    }
    else {
      this.currentIndex -= 2;
    }

    await this.next(true, true);
  }

  async resume (force = false, wait = true) {
    if (!force && this.interval) {
      return;
    }

    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    if (this.nextTimeout) {
      clearTimeout(this.nextTimeout);
      this.nextTimeout = null;
    }

    if (!wait) {
      await this.next(true);
    }

    this.pause();

    this.nextTimeout = setTimeout(() => {
      if (this.nextTimeout) {
        clearTimeout(this.nextTimeout);
        this.nextTimeout = null;
      }

      // When the tour resumes, we want to preload the next video for the
      // configured number of seconds
      this.next();

      // We want all subsequent preloads to start at the configured interval
      // duration relative to the first preload (above), rather than relative
      // to the time the videos are visible.  This will ensure the videos are
      // preloading the configured amount of time before they should become
      // visible
      this.interval = setInterval(() => {
        this.next();
      }, this.TOUR_INTERVAL_DURATION * 1000);
    }, (this.TOUR_INTERVAL_DURATION - this.TOUR_PRELOAD_DURATION) * 1000);
  }

  /**
   * This is meant to be the entry point to the tour.  It should only be called
   * once, at the beginning, to start the tour.
   */
  async start () {
    this.iov = await this.iovCollection.create(this.videoElementId);

    await this.resume(true, false);
  }

  pause () {
    if (!this.interval) {
      return;
    }

    clearInterval(this.interval);
    this.interval = null;
  }

  stop () {
    this.pause();

    this.currentIndex = 0;
  }

  async reset () {
    this.stop();

    await this.resume(true);
  }

  fullscreen () {
    if (!this.iov) {
      return;
    }

    this.iov.toggleFullscreen();
  }

  /**
   * Destroy this tour and all associated streamConfigurations and iovs
   */
  destroy () {
    if (this.destroyed) {
      return;
    }

    this.destroyed = true;

    this._cancelAllChangeSrcs();

    this.pause();

    for (let i = 0; i < this.streamConfigurations.length; i++) {
      this.streamConfigurations[i].destroy();
    }

    this.streamConfigurations = null;

    if (this.iov) {
      this.iovCollection.remove(this.iov.id);
      this.iov = null;
    }

    this.iovCollection = null;
    this.videoElementId = null;
  }
}
