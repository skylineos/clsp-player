import {
  sleepSeconds,
} from 'sleepjs';
import {
  timeout as PromiseTimeout,
} from 'promise-timeout';

import RouterBaseManager from './RouterBaseManager';
import RouterStatsManager from './RouterStatsManager';

const DEFAULT_MAX_RECONNECTION_ATTEMPTS = 0;
const DEFAULT_MAX_RECONNECTION_TIME = 0;
// When trying to reconnect, try every 5 seconds for the first 2 minutes, then
// try every 30 seconds after 2 minutes.
const DEFAULT_IMMEDIATE_RECONNECTION_DELAY = 5;
const DEFAULT_IMMEDIATE_RECONNECTION_DURATION = 120;
const DEFAULT_RECONNECTION_DELAY = 30;

export default class RouterConnectionManager extends RouterBaseManager {
  /**
   * @static
   *
   * The events that this RouterConnectionManager will emit.
   */
  static events = {
    // Emitted when a connection attempt
    CONNECT_SUCCESS: 'connect-success',
    CONNECT_FAILURE: 'connect-failure',
    RECONNECT_SUCCESS: 'reconnect-success',
    RECONNECT_FAILURE: 'reconnect-failure',
    DISCONNECT_SUCCESS: 'disconnect-success',
    DISCONNECT_FAILURE: 'disconnect-failure',
  }

  /**
   * @static
   *
   * The Router events that this Router Manager is responsible for
   */
  static routerEvents = {
    CONNECT_SUCCESS: RouterBaseManager.routerEvents.CONNECT_SUCCESS,
    CONNECT_FAILURE: RouterBaseManager.routerEvents.CONNECT_FAILURE,
    DISCONNECT_SUCCESS: RouterBaseManager.routerEvents.DISCONNECT_SUCCESS,
    DISCONNECT_FAILURE: RouterBaseManager.routerEvents.DISCONNECT_FAILURE,
    CONNECTION_LOST: RouterBaseManager.routerEvents.CONNECTION_LOST,
  };

  static factory (
    logId,
    clientId,
    routerTransactionManager,
  ) {
    return new RouterConnectionManager(
      logId,
      clientId,
      routerTransactionManager,
    );
  }

  constructor (
    logId,
    clientId,
    routerTransactionManager,
  ) {
    super(
      logId,
      clientId,
    );

    if (!routerTransactionManager) {
      throw new Error('A RouterTransactionManager is required to instantiate a RouterConnectionManager');
    }

    this.routerTransactionManager = routerTransactionManager;

    this.statsManager = RouterStatsManager.factory(
      this.logId,
      this.clientId,
      this.routerTransactionManager,
    );

    this.statsManager.on(RouterStatsManager.events.PUBLISH_FAILURE, (data) => {
      // @todo - maybe wait for 2 or 3 failures before reconnecting?
      this.logger.warn('Publish stats failure - attempting to reconnect...');
      this.reconnect();
    });

    // configurable state
    this.MAX_RECONNECTION_ATTEMPTS = DEFAULT_MAX_RECONNECTION_ATTEMPTS;
    this.MAX_RECONNECTION_TIME = DEFAULT_MAX_RECONNECTION_TIME;
    this.IMMEDIATE_RECONNECTION_DELAY = DEFAULT_IMMEDIATE_RECONNECTION_DELAY;
    this.IMMEDIATE_RECONNECTION_DURATION = DEFAULT_IMMEDIATE_RECONNECTION_DURATION;
    this.RECONNECTION_DELAY = DEFAULT_RECONNECTION_DELAY;

    // state flags
    this.isConnected = false;
    this.isConnecting = false;
    this.isDisconnecting = false;
    this.isReconnecting = false;

    // listeners
    this._onConnect = null;
    this._onDisconnect = null;
  }

  /**
   * @async
   *
   * After initialization, call this to establish the connection to the server.
   * It's really just a wrapper around reconnect that emits a different event.
   *
   * @param {} emit
   *
   * @returns {void}
   */
  async connect (emit = true) {
    try {
      await this.reconnect(false);

      if (this.isDestroyed) {
        this.logger.info('Destroy occurred before the connection finished');
        return;
      }

      if (this.isDisconnecting) {
        this.logger.info('Disconnection occurred before the connection finished');
        return;
      }

      if (emit) {
        this.events.emit(RouterConnectionManager.events.CONNECT_SUCCESS);
      }
    }
    catch (error) {
      this.logger.error('Failed to connect');
      this.logger.error(error);

      if (emit) {
        this.events.emit(RouterConnectionManager.events.CONNECT_FAILURE, {
          error,
        });
      }
    }
  }

  /**
   * Do not call this method directly!  Only use the `connect` method.
   *
   * @returns Promise
   *   Resolves when the connection is successfully established.
   *   Rejects upon failure to connect after a number of retries.
   */
  _connect () {
    return new Promise((resolve, reject) => {
      this._onConnect = (error) => {
        this._onConnect = null;

        if (error) {
          return reject(error);
        }

        resolve();
      };

      this.routerTransactionManager.issueCommand(RouterConnectionManager.routerCommands.CONNECT);
    });
  }

  _handleConnectRouterEvent (eventType, event) {
    switch (eventType) {
      case RouterConnectionManager.routerEvents.CONNECT_SUCCESS: {
        this._onConnect();
        break;
      }
      case RouterConnectionManager.routerEvents.CONNECT_FAILURE: {
        this._onConnect(new Error(event.data.reason));
        break;
      }
      default: {
        throw new Error(`Unknown eventType: ${eventType}`);
      }
    }
  }

  /**
   * @async
   *
   * Attempt to reconnect a certain number of times
   *
   * @returns {Promise}
   */
  async reconnect (emit = true) {
    if (this.isDestroyed) {
      this.logger.info('Tried to reconnect on destroyed RouterConnectionManager');
      return;
    }

    if (this.isDisconnecting) {
      this.logger.info('Tried to reconnect while there was a disconnection in progress');
      return;
    }

    if (this.isConnecting) {
      this.logger.info('Connection already in progress');
      return;
    }

    if (this.isReconnecting) {
      this.logger.info('A reconnection attempt is already in progress');
      return;
    }

    this.logger.info('Reconnecting...');

    this.isConnecting = true;
    this.isReconnecting = true;

    const reconnectionStartedAt = Date.now();

    const stopTryingToReconnectAt = this.MAX_RECONNECTION_TIME
      ? reconnectionStartedAt + (this.MAX_RECONNECTION_TIME * 1000)
      : 0;

    try {
      await this._reconnect(
        reconnectionStartedAt,
        stopTryingToReconnectAt,
      );

      if (this.isDestroyed) {
        this.logger.info('Destruction occurred before the reconnection finished');
        return;
      }

      if (this.isDisconnecting) {
        this.logger.info('Disconnection occurred before the reconnection finished');
        return;
      }

      this.logger.info('Successfully reconnected!');

      if (emit) {
        this.events.emit(RouterConnectionManager.events.RECONNECT_SUCCESS);
      }
    }
    catch (error) {
      this.logger.error('Failed to reconnect');

      if (emit) {
        this.events.emit(RouterConnectionManager.events.RECONNECT_FAILURE, {
          error,
        });
      }
    }
    finally {
      this.isConnecting = false;
      this.isReconnecting = false;
    }
  }

  /**
   * @private
   * @async
   *
   * Do not call this method directly!  Only use the `reconnect` method.
   */
  async _reconnect (
    reconnectionStartedAt,
    stopTryingToReconnectAt,
    reconnectionAttempts = 0,
  ) {
    if (this.isDestroyed) {
      this.logger.info('Tried to _reconnect on destroyed RouterConnectionManager');
      return;
    }

    if (this.isDisconnecting) {
      this.logger.info('Tried to _reconnect while there was a disconnection in progress');
      return;
    }

    if (this.isConnected) {
      this.logger.info('Already connected.');
      return;
    }

    reconnectionAttempts++;

    if (this.MAX_RECONNECTION_ATTEMPTS && reconnectionAttempts > this.MAX_RECONNECTION_ATTEMPTS) {
      throw new Error(`Failed to reconnect after ${reconnectionAttempts} attempts.`);
    }

    if (this.MAX_RECONNECTION_TIME && Date.now() > stopTryingToReconnectAt) {
      throw new Error(`Failed to reconnect after ${this.MAX_RECONNECTION_TIME} seconds.`);
    }

    this.logger.info(`Reconnection attempt #${reconnectionAttempts}...`);

    try {
      await this.disconnect(false);

      // @todo - This seems like it's doing too much.  Maybe there should be an
      // additional `connect` layer, e.g:
      // connect -> reconnect -> _connect -> __connect ?
      await PromiseTimeout(this._connect(), this.IMMEDIATE_RECONNECTION_DELAY * 1000);

      this.isConnected = true;

      // As soon as the connection is made, start publishing stats
      this.statsManager.start();

      this.logger.info(`Reconnected successfully after ${reconnectionAttempts} attempts`);
    }
    catch (error) {
      this.logger.error('Error while trying to reconnect:');
      this.logger.error(error);

      const reconnectionDelay = (Date.now() - reconnectionStartedAt > (this.IMMEDIATE_RECONNECTION_DURATION * 1000))
        ? this.RECONNECTION_DELAY
        : this.IMMEDIATE_RECONNECTION_DELAY;

      await sleepSeconds(reconnectionDelay);

      await this._reconnect(
        reconnectionStartedAt,
        stopTryingToReconnectAt,
        reconnectionAttempts,
      );
    }
  }

  /**
   * @async
   *
   * Disconnect from the CLSP server
   */
  async disconnect (emit = true) {
    if (this.isDestroyComplete) {
      this.logger.info('Tried to disconnect on a destroyed RouterConnectionManager');
      return;
    }

    if (this.isDisconnecting) {
      this.logger.info('There is already a disconnection in progress');
      return;
    }

    if (!this.isConnected) {
      return;
    }

    this.logger.info('Disconnecting...');

    this.isDisconnecting = true;

    try {
      // when a stream fails, it no longer needs to send stats to the
      // server, and it may not even be connected to the server
      this.statsManager.stop();

      await PromiseTimeout(this._disconnect(), this.IMMEDIATE_RECONNECTION_DELAY * 1000);

      if (emit) {
        this.events.emit(RouterConnectionManager.events.DISCONNECT_SUCCESS);
      }
    }
    catch (error) {
      if (this.isDestroyComplete) {
        this.logger.info('Disconnect failed while destroyed');
        return;
      }

      if (this.routerTransactionManager.iframeWasDestroyedExternally) {
        this.logger.info('Disconnect failed while iframe was destroyed externally');
        return;
      }

      if (emit) {
        this.events.emit(RouterConnectionManager.events.DISCONNECT_FAILURE, {
          error,
        });
      }

      throw error;
    }
    finally {
      this._onDisconnect = null;

      // @todo - is this correct in the event of an error while disconnecting?
      this.isConnected = false;
      this.isDisconnecting = false;
    }
  }

  _disconnect () {
    return new Promise((resolve, reject) => {
      this._onDisconnect = (error) => {
        if (error) {
          return reject(error);
        }

        resolve();
      };

      this.routerTransactionManager.issueCommand(RouterConnectionManager.routerCommands.DISCONNECT);
    });
  }

  _handleDisconnectRouterEvent (eventType, event) {
    switch (eventType) {
      case RouterConnectionManager.routerEvents.DISCONNECT_SUCCESS: {
        this._onDisconnect();
        break;
      }
      case RouterConnectionManager.routerEvents.DISCONNECT_FAILURE: {
        this._onDisconnect(new Error(event.data.reason));
        break;
      }
      default: {
        throw new Error(`Unknown eventType: ${eventType}`);
      }
    }
  }

  /**
   * Handler for the CONNECTION_LOST event.  Will stop stats and attempt to
   * reconnect.
   *
   * @param {*} event
   */
  _handleConnectionLostRouterEvent (event) {
    const eventType = event.data.event;

    this.logger.debug(`connection lost "${eventType}" event`);

    // We know we're no longer connected
    this.isConnected = false;

    // As soon as the connection is made, start publishing stats
    this.statsManager.stop();

    // @todo - not sure if this is the right way to handle it - should the
    // caller request the reconnect?  Should this emit a disconnect event
    // instead of trying to reconnect?
    this.reconnect();
    // this.events.emit(RouterConnectionManager.events.DISCONNECT_SUCCESS, {
    //   reason: event.data.reason,
    // });
  }

  onRouterEvent (eventType, event) {
    if (this.isDestroyComplete) {
      throw new Error(`Tried to handle Router event ${eventType} after destroy was complete!`);
    }

    switch (eventType) {
      case RouterConnectionManager.routerEvents.CONNECT_SUCCESS:
      case RouterConnectionManager.routerEvents.CONNECT_FAILURE: {
        this._handleConnectRouterEvent(eventType, event);
        break;
      }
      case RouterConnectionManager.routerEvents.DISCONNECT_SUCCESS:
      case RouterConnectionManager.routerEvents.DISCONNECT_FAILURE: {
        this._handleDisconnectRouterEvent(eventType, event);
        break;
      }
      case RouterConnectionManager.routerEvents.CONNECTION_LOST: {
        this._handleConnectionLostRouterEvent(event);
        break;
      }
      default: {
        throw new Error(`Unknown eventType: ${eventType}`);
      }
    }
  }

  async _destroy () {
    try {
      await this.disconnect();
    }
    catch (error) {
      this.logger.error('Error while disconnecting while destroying:');
      this.logger.error(error);
    }

    try {
      await this.statsManager.destroy();
    }
    catch (error) {
      this.logger.error('Error while destroying statsManager while destroying:');
      this.logger.error(error);
    }

    this.statsManager = null;
    this.routerTransactionManager = null;

    this._onConnect = null;
    this._onDisconnect = null;

    await super._destroy();
  }
}
