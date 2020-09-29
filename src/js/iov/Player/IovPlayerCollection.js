import isNil from 'lodash/isNil';
import { v4 as uuidv4 } from 'uuid';

import IovPlayer from './IovPlayer';
import EventEmitter from '../../utils/EventEmitter';

const DEFAULT_MAX_RETRIES_ON_PLAY_ERROR = 100;

export default class IovPlayerCollection extends EventEmitter {
  static events = {
    // Needed for videojs plugin
    VIDEO_RECEIVED: IovPlayer.events.VIDEO_RECEIVED,
    // Needed for videojs plugin
    VIDEO_INFO_RECEIVED: IovPlayer.events.VIDEO_INFO_RECEIVED,
    FIRST_FRAME_SHOWN: IovPlayer.events.FIRST_FRAME_SHOWN,
    IFRAME_DESTROYED_EXTERNALLY: IovPlayer.events.IFRAME_DESTROYED_EXTERNALLY,
  };

  static factory (logId) {
    return new IovPlayerCollection(logId);
  }

  /**
   * @private
   */
  constructor (logId) {
    super(logId);

    this.initialize();

    this.MAX_RETRIES_ON_PLAY_ERROR = DEFAULT_MAX_RETRIES_ON_PLAY_ERROR;
  }

  initialize () {
    this.logger.info('Initializing');

    this.players = {};
    this.playerStack = [];

    this.playerLogMessageIds = {};
    this.retryAttempts = {};

    this.mostRecentlyPlayedId = null;
    this.mostRecentlyAddedId = null;

    this.totalPlayersAdded = 0;
    this.pendingRemoval = {};
  }

  generatePlayerLogId (streamName) {
    return `${this.logId}.player:${this.totalPlayersAdded}:${streamName}`;
  }

  async create (
    containerElement,
    videoElement,
    streamConfiguration,
  ) {
    const iovPlayer = this._create(
      containerElement,
      videoElement,
      streamConfiguration,
    );

    const id = iovPlayer.id;

    this.#add(iovPlayer);

    await this.#play(id);

    return id;
  }

  _create (
    containerElement,
    videoElement,
    streamConfiguration,
  ) {
    if (!containerElement) {
      throw new Error('A container element is required to create an IovPlayer');
    }

    if (!videoElement) {
      throw new Error('A video element is required to create an IovPlayer');
    }

    if (!streamConfiguration) {
      throw new Error('stream configuration is required to create an IovPlayer');
    }

    this.totalPlayersAdded++;

    const id = uuidv4();

    const iovPlayer = IovPlayer.factory(
      this.generatePlayerLogId(streamConfiguration.streamName),
      id,
      containerElement,
      videoElement,
    );

    iovPlayer.setStreamConfiguration(streamConfiguration);

    // Tell the IOV to start tearing it all down...
    iovPlayer.on(IovPlayer.events.IFRAME_DESTROYED_EXTERNALLY, () => {
      if (this.isDestroyed) {
        this.logger.info('Iframe was destroyed externally while in process of destroying');
        return;
      }

      this.emit(IovPlayerCollection.events.IFRAME_DESTROYED_EXTERNALLY, { id });
    });

    // Needed for videojs plugin
    iovPlayer.on(IovPlayer.events.VIDEO_RECEIVED, () => {
      this.emit(IovPlayerCollection.events.VIDEO_RECEIVED, { id });
    });

    // Needed for videojs plugin
    iovPlayer.on(IovPlayer.events.VIDEO_INFO_RECEIVED, () => {
      this.emit(IovPlayerCollection.events.VIDEO_INFO_RECEIVED, { id });
    });

    iovPlayer.on(IovPlayer.events.FIRST_FRAME_SHOWN, async () => {
      // Needed for videojs plugin
      this.emit(IovPlayerCollection.events.FIRST_FRAME_SHOWN, { id });

      this.mostRecentlyPlayedId = id;

      try {
        // Only destroy all previous rather than all other players because a
        // more recently added player may exist that has not had its first
        // frame shown yet
        this.logger.info(`First frame received for ${this.playerLogMessageIds[id]}, destroying all previous players...`);
        this.destroyAllPreviousPlayers(id);
      }
      catch (error) {
        this.logger.error(`Error while destroying previous players for ${this.playerLogMessageIds[id]}`);
        this.logger.error(error);
      }
    });

    /* eslint-disable-next-line handle-callback-err */
    iovPlayer.on(IovPlayer.events.RECONNECT_FAILURE, async ({ error }) => {
      try {
        this.logger.info(`Critical player error RECONNECT_FAILURE for player ${this.playerLogMessageIds[id]}`);
        await this.#handleCriticalIovPlayerError(id, IovPlayer.events.RECONNECT_FAILURE);
      }
      catch (error) {
        this.logger.error(`Error while handling player error RECONNECT_FAILURE for player ${this.playerLogMessageIds[id]}`);
        this.logger.error(error);
      }
    });

    /* eslint-disable-next-line handle-callback-err */
    iovPlayer.on(IovPlayer.events.ROUTER_EVENT_ERROR, async ({ error }) => {
      try {
        this.logger.info(`Critical player error ROUTER_EVENT_ERROR for player ${this.playerLogMessageIds[id]}`);
        await this.#handleCriticalIovPlayerError(id, IovPlayer.events.ROUTER_EVENT_ERROR);
      }
      catch (error) {
        this.logger.error(`Error while handling player error ROUTER_EVENT_ERROR for player ${this.playerLogMessageIds[id]}`);
        this.logger.error(error);
      }
    });

    /* eslint-disable-next-line handle-callback-err */
    iovPlayer.on(IovPlayer.events.REINITIALZE_ERROR, async ({ error }) => {
      try {
        this.logger.info(`Critical player error REINITIALZE_ERROR for player ${this.playerLogMessageIds[id]}`);
        await this.#handleCriticalIovPlayerError(id, IovPlayer.events.REINITIALZE_ERROR);
      }
      catch (error) {
        this.logger.error(`Error while handling player error REINITIALZE_ERROR for player ${this.playerLogMessageIds[id]}`);
        this.logger.error(error);
      }
    });

    return iovPlayer;
  }

  async #handleCriticalIovPlayerError (id, eventName) {
    if (id === this.mostRecentlyPlayedId || id === this.mostRecentlyAddedId) {
      this.logger.info(`Active IovPlayer ${this.playerLogMessageIds[id]} emitted the "${eventName}" event, recreating it...`);

      try {
        await this.#recreate(id);
      }
      catch (error) {
        this.logger.error(`Error while recreating ${this.playerLogMessageIds[id]}`);
        this.logger.error(error);
      }

      return;
    }

    this.logger.info(`Stale IovPlayer ${this.playerLogMessageIds[id]} emitted the "${eventName}" event, destroying it...`);

    try {
      await this.remove(id);
    }
    catch (error) {
      this.logger.error(`Error while removing Stale IovPlayer ${this.playerLogMessageIds[id]} during "${eventName}" event, continuing anyway...`);
      this.logger.error(error);
    }
  }

  async destroyAllPreviousPlayers (id) {
    const index = this.playerStack.indexOf(id);

    if (index === -1) {
      return;
    }

    const idsToRemove = this.playerStack.slice(0, index);

    try {
      await this.removeMany(idsToRemove);
    }
    catch (error) {
      this.logger.error(`Error(s) while destroying players before ${this.playerLogMessageIds[id]}, continuing anyway...`);
      this.logger.error(error);
    }
  }

  #replaceInStack (oldId, newId) {
    const index = this.playerStack.indexOf(oldId);

    if (index === -1) {
      throw new Error(`Cannot replace ${this.playerLogMessageIds[oldId]} in stack because it doesn't exist in the stack...`);
    }

    this.playerStack[index] = newId;
  }

  async #recreate (oldId) {
    const oldIovPlayer = this.get(oldId);

    if (oldIovPlayer === null) {
      throw new Error(`Cannot recreate IovPlayer with non-existent id ${oldId}`);
    }

    const oldPlayerLogMessageId = this.playerLogMessageIds[oldId];

    const iovPlayer = this._create(
      oldIovPlayer.containerElement,
      oldIovPlayer.videoElement,
      oldIovPlayer.streamConfiguration,
    );

    const id = iovPlayer.id;

    this.players[id] = iovPlayer;
    this.playerLogMessageIds[id] = this.totalPlayersAdded;
    this.retryAttempts[id] = 0;
    this.#replaceInStack(oldId, id);

    if (this.mostRecentlyAddedId === oldId) {
      this.mostRecentlyAddedId = id;
    }

    if (this.mostRecentlyPlayedId === oldId) {
      this.mostRecentlyPlayedId = id;
    }

    // We do not need to await this
    this.remove(oldId).catch((error) => {
      this.logger.error(`Error while recreating player ${oldPlayerLogMessageId}, continuing anyway...`);
      this.logger.error(error);
    });

    await this.#play(id);
  }

  async #play (id) {
    const iovPlayer = this.get(id);

    if (iovPlayer === null) {
      throw new Error(`Cannot play - IovPlayer id ${id} doesn't exist`);
    }

    try {
      await iovPlayer.initialize();

      // @todo - should the play method only resolve once the first frame has
      // been shown?  right now it resolves on first moof recevied
      await iovPlayer.play();

      iovPlayer.logger.info('Play succeeded!');
    }
    catch (error) {
      this.logger.warn(`Error while trying to play IovPlayer ${this.playerLogMessageIds[id]}...`);
      this.logger.error(error);

      if (this.MAX_RETRIES_ON_PLAY_ERROR > 0 && this.retryAttempts[id] <= this.MAX_RETRIES_ON_PLAY_ERROR) {
        this.logger.warn(`Retry play attempt #${this.retryAttempts[id]++} for player ${this.playerLogMessageIds[id]}...`);

        await this.#play(id);
      }
      else {
        this.logger.error('Destroying IovPlayer after exhausting play and retry attempts');

        // @todo - display a message in the page (aka to the user) saying that
        // the stream couldn't be played?
        await this.remove(id);

        throw error;
      }
    }
  }

  has (id) {
    if (isNil(id)) {
      return false;
    }

    if (this.pendingRemoval[id]) {
      return false;
    }

    return Object.prototype.hasOwnProperty.call(this.players, id);
  }

  get (id) {
    if (!this.has(id)) {
      return null;
    }

    return this.players[id];
  }

  #add (iovPlayer) {
    const id = iovPlayer.id;

    if (this.has(id)) {
      throw new Error('Cannot add an iovPlayer without a unique id');
    }

    this.players[id] = iovPlayer;
    this.playerLogMessageIds[id] = this.totalPlayersAdded;
    this.retryAttempts[id] = 0;
    this.mostRecentlyAddedId = id;
    this.playerStack.push(id);
  }

  async remove (id) {
    const iovPlayer = this.get(id);

    if (iovPlayer === null) {
      return;
    }

    iovPlayer.logger.info('IovPlayerCollection - removing player...');

    const playerLogMessageId = this.playerLogMessageIds[id];

    this.pendingRemoval[id] = true;

    // It is no longer the most recently played
    if (this.mostRecentlyPlayedId === id) {
      this.mostRecentlyPlayedId = null;
    }

    // remove it from the stack
    const index = this.playerStack.indexOf(id);

    if (index !== -1) {
      this.playerStack.splice(index, 1);
    }

    // it is no longer the most recently added
    if (this.mostRecentlyAddedId === id) {
      const stackLength = this.playerStack.length;

      if (stackLength === 0) {
        this.mostRecentlyAddedId = null;
      }
      else {
        this.mostRecentlyAddedId = this.playerStack[stackLength - 1];
      }
    }

    // remove it from all internal state
    delete this.players[id];
    delete this.playerLogMessageIds[id];
    delete this.pendingRemoval[id];

    try {
      await iovPlayer.destroy();
    }
    catch (error) {
      this.logger.error(`Error destroying IovPlayer ${playerLogMessageId} while removing, continuing anyway`);
      this.logger.error(error);
    }
  }

  async removeMany (ids) {
    const removeOperations = ids.map((id) => this.remove(id));

    const results = await Promise.allSettled(removeOperations);

    const errors = results.reduce((acc, cur) => {
      if (cur.status !== 'fulfilled') {
        acc.push(cur);
      }

      return acc;
    }, []);

    if (errors.length) {
      this.logger.warn('Error(s) encountered while destroying IovPlayer(s) during removeMany...');

      errors.forEach((error) => {
        this.logger.error(error.reason);
      });

      throw errors[0].reason;
    }
  }

  async removeAll () {
    const playerIds = Object.keys(this.players);

    await this.removeMany(playerIds);
  }

  async _destroy () {
    try {
      await this.removeAll();
    }
    catch (error) {
      this.logger.error('Error(s) encountered while removing while destroying, continuing anyway...');
    }

    this.players = null;
    this.playerLogMessageIds = null;
    this.pendingRemoval = null;
    this.playerStack = null;
  }
}
