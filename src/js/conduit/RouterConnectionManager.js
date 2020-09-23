import {
  sleepSeconds,
} from 'sleepjs';

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
    DID_CONNECT: 'did-connect',
    CONNECT_FAILED: 'connect-failed',
    DID_RECONNECT: 'did-reconnect',
    RECONNECT_FAILED: 'reconnect-failed',
    DID_DISCONNECT: 'did-disconnect',
    DISCONNECT_FAILED: 'disconnect-failed',
  }

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

    this.statsManager.events.on(RouterStatsManager.events.PUBLISH_FAILURE, (data) => {
      // @todo - maybe wait for 2 or 3 failures before reconnecting?
      this.logger.info('Publish stats failure - attempting to reconnect...');
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
   *
   * @param {} emit
   *
   * @returns {void}
   */
  async connect (emit = true) {
    if (this.isDestroyed) {
      this.logger.info('Tried to connect on destroyed RouterConnectionManager');
      return;
    }

    if (this.isDisconnecting) {
      this.logger.info('Tried to connect while there was a disconnection in progress');
      return;
    }

    if (this.isConnecting) {
      this.logger.info('Connection already in progress');
      return;
    }

    if (this.isConnected) {
      this.logger.info('Already connected.');
      return;
    }

    this.isConnecting = true;

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
        this.events.emit(RouterConnectionManager.events.DID_CONNECT);
      }
    }
    catch (error) {
      this.logger.error('Failed to connect');
      this.logger.error(error);

      if (emit) {
        this.events.emit(RouterConnectionManager.events.CONNECT_FAILED, {
          error,
        });
      }
    }
    finally {
      this.isConnecting = false;
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
    if (this.isDestroyed) {
      this.logger.info('Tried to _connect on destroyed RouterConnectionManager');
      return;
    }

    if (this.isDisconnecting) {
      this.logger.info('Tried to _connect while there was a disconnection in progress');
      return;
    }

    this.logger.debug('Connecting to CLSP server...');

    return new Promise((resolve, reject) => {
      if (this.isConnected) {
        return resolve();
      }

      this._onConnect = async (event) => {
        const isValidEvent = this._isValidEvent(event, [
          RouterConnectionManager.routerEvents.CONNECT_SUCCESS,
          RouterConnectionManager.routerEvents.CONNECT_FAILURE,
        ]);

        if (!isValidEvent) {
          return;
        }

        const eventType = event.data.event;

        this.logger.debug(`connect "${eventType}" event`);

        // Whether success or failure, remove the event listener
        window.removeEventListener('message', this._onConnect);
        this._onConnect = null;

        if (eventType === RouterConnectionManager.routerEvents.CONNECT_FAILURE) {
          this.logger.error(new Error(event.data.reason));

          return reject(new Error('Failed to connect'));
        }

        this.isConnected = true;

        // As soon as the connection is made, start publishing stats
        this.statsManager.start();

        resolve();
      };

      window.addEventListener('message', this._onConnect);

      // @todo - what happens in the event of a timeout?
      this.routerTransactionManager.issueCommand(RouterConnectionManager.routerCommands.CONNECT);
    });
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

    this.logger.info('Reconnecting...');

    // If we're already trying to reconnect, don't try again
    if (this.isReconnecting) {
      this.logger.info('A reconnection attempt is already in progress');
      return;
    }

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
        this.events.emit(RouterConnectionManager.events.DID_RECONNECT);
      }
    }
    catch (error) {
      this.logger.error('Failed to reconnect');

      if (emit) {
        this.events.emit(RouterConnectionManager.events.RECONNECT_FAILED);
      }
    }
    finally {
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
      await this._connect();

      this.logger.info(`Reconnected successfully after ${reconnectionAttempts} attempts`);

      // If the call to `connect` was successful, we're done here
      return;
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

    this.logger.info('Disconnecting...');

    this.isDisconnecting = true;

    try {
      await this._disconnect();

      if (emit) {
        this.events.emit(RouterConnectionManager.events.DID_DISCONNECT);
      }
    }
    catch (error) {
      this.logger.error('Error while disconnecting:');
      this.logger.error(error);

      if (emit) {
        this.events.emit(RouterConnectionManager.events.DISCONNECT_FAILED, {
          error,
        });
      }
    }
    finally {
      this.isDisconnecting = false;
    }
  }

  /**
   * @private
   * @async
   *
   * Do not call this method directly!  Only use the `disconnect` method.
   */
  _disconnect () {
    if (this.isDestroyComplete) {
      this.logger.info('Tried to _disconnect on a destroyed RouterConnectionManager');
      return;
    }

    // If a connection is in progress, cancel it
    if (this._onConnect) {
      window.removeEventListener('message', this._onConnect);
      this._onConnect = null;
    }

    // when a stream fails, it no longer needs to send stats to the
    // server, and it may not even be connected to the server
    this.statsManager.stop();

    return new Promise((resolve, reject) => {
      if (this.isConnected) {
        return resolve();
      }

      this._onDisconnect = async (event) => {
        const isValidEvent = this._isValidEvent(event, [
          RouterConnectionManager.routerEvents.DISCONNECT_SUCCESS,
          RouterConnectionManager.routerEvents.DISCONNECT_FAILURE,
        ]);

        if (!isValidEvent) {
          return;
        }

        const eventType = event.data.event;

        this.logger.debug(`disconnect "${eventType}" event`);

        // Whether success or failure, remove the event listener
        window.removeEventListener('message', this._onDisconnect);
        this._onDisconnect = null;

        if (eventType === RouterConnectionManager.routerEvents.DISCONNECT_FAILURE) {
          this.logger.error(new Error(event.data.reason));

          return reject(new Error('Failed to disconnect'));
        }

        this.isConnected = false;
        this.isDisconnecting = false;

        resolve();
      };

      window.addEventListener('message', this._onDisconnect);

      // @todo - what happens in the event of a timeout?
      this.routerTransactionManager.issueCommand(RouterConnectionManager.routerCommands.DISCONNECT);
    });
  }

  /**
   * Handler for the CONNECTION_LOST event.  Will stop stats and attempt to
   * reconnect.
   *
   * @param {*} event
   */
  _onConnectionLost (event) {
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
    // this.events.emit(RouterConnectionManager.events.DID_DISCONNECT, {
    //   reason: event.data.reason,
    // });
  }

  onMessage (eventType, event) {
    try {
      switch (eventType) {
        case RouterConnectionManager.routerEvents.CONNECTION_LOST: {
          this._onConnectionLost(event);
          break;
        }
        case RouterConnectionManager.routerEvents.CONNECT_SUCCESS:
        case RouterConnectionManager.routerEvents.CONNECT_FAILURE:
        case RouterConnectionManager.routerEvents.DISCONNECT_SUCCESS:
        case RouterConnectionManager.routerEvents.DISCONNECT_FAILURE: {
          break;
        }
        default: {
          this.logger.info(`RouterConnectionManager called with unknown eventType: ${eventType}`);
        }
      }
    }
    catch (error) {
      this.logger.error('Error while receiving message from Router:');
      this.logger.error(error);
    }
  }

  async destroy () {
    if (this.isDestroyed) {
      this.logger.info('Tried to destroy on destroyed RouterConnectionManager');
      return;
    }

    this.isDestroyed = true;

    try {
      await this.disconnect();
    }
    catch (error) {
      this.logger.error('Error while disconnecting while destroying:');
      this.logger.error(error);
    }

    try {
      this.statsManager.destroy();
    }
    catch (error) {
      this.logger.error('Error while destroying statsManager while destroying:');
      this.logger.error(error);
    }

    this.statsManager = null;
    this.routerTransactionManager = null;

    super._destroy();
  }
}
