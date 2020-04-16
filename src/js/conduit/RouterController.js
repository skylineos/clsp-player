import noop from 'lodash/noop';

import utils from '../utils/utils';
import Logger from '../utils/logger';
import Router from './Router';

// @todos:
// get all unused consts out of conduit
// double check constructors
// double check destroy
// remove the need for _onReconnect in this file

export default class RouterController {
  static events = {
    CREATE: 'create',
  };

  static routerEvents = Router().events;

  static factory (
    logId,
    clientId,
    iframe,
    onReconnect = noop,
    options = {},
  ) {
    options.MAX_RECONNECTION_TIME = '';
    options.MAX_RECONNECTION_ATTEMPTS = '';
    options.IMMEDIATE_RECONNECTION_DURATION = '';
    options.RECONNECTION_DELAY = '';
    options.IMMEDIATE_RECONNECTION_DELAY = '';
    options.PUBLISH_STATS_INTERVAL = '';

    return new RouterController(
      logId,
      clientId,
      iframe,
      onReconnect,
      options,
    );
  }

  constructor (
    logId,
    clientId,
    iframe,
    onReconnect,
    options,
  ) {
    this.logger = Logger().factory(`RouterIframe ${this.logId}`);
    this.logger.debug('Constructing...');

    this.isDestroyed = false;

    this.logId = logId;
    this.clientId = clientId;
    this.iframe = iframe;
    this.options = options;
    this._onReconnect = onReconnect;

    this.isTryingToInitialize = false;
    this.isInitialized = false;
    this.isTryingToConnect = false;
    this.isConnected = false;
    this.reconnectionAttempts = 0;
    this.totalReconnectionAttempts = 0;
    this.isTryingToDisconnect = false;
    this.isDisconnected = true;

    this.statsInterval = null;
    this.statsMsg = {
      byteCount: 0,
      inkbps: 0,
      host: document.location.host,
      clientId: this.clientId,
    };
  }

  /**
   * @private
   *
   * Send a message (data) to the iframe.  This is the only way to interact with
   * the Router.
   *
   * @param {any} message
   *   The message to send to the iframe
   *
   * @returns {void}
   */
  sendMessageToIframe (message) {
    this.logger.debug('Sending message to the iframe...');

    if (!message) {
      throw new Error('`message` is required to send a message to an iframe');
    }

    // @todo - this MUST be temporary - it is hiding the error resulting from
    // improper async logic handling!
    if (this.isDestroyed) {
      console.warn('Cannot send message via destroyed iframe');
      return;
    }

    try {
      // @todo - we should not be dispatching to '*' - we should provide the SFS
      // host here instead
      // @see - https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage
      this.iframe.contentWindow.postMessage(message, '*');
    }
    catch (error) {
      // @todo - we should probably throw here...
      // eslint-disable-next-line no-console
      console.error(error);
    }
  }

  isDesiredRouterEvent (event, desiredEventTypes) {
    const clientId = event.data.clientId;

    // A window message was received that is not related to CLSP
    if (!clientId) {
      return false;
    }

    // This message was intended for another conduit
    if (this.clientId !== clientId) {
      return false;
    }

    const eventType = event.data.event;

    if (!desiredEventTypes.includes(eventType)) {
      return false;
    }

    return true;
  }

  async initialize () {
    if (this.isDestroyed) {
      return;
    }

    if (this.isTryingToInitialize) {
      return;
    }

    if (this.isInitialized) {
      return;
    }

    this.logger.debug('Initializing...');

    return new Promise((resolve, reject) => {
      this._onRouterCreate = (event) => {
        try {
          const desiredEventTypes = [
            RouterController.routerEvents.CREATED,
            RouterController.routerEvents.CREATE_FAILURE,
          ];

          if (this.isDesiredRouterEvent(event, desiredEventTypes)) {
            return;
          }

          this.logger.debug(`initialize "${eventType}" event`);

          if (eventType === RouterIframe.routerEvents.CREATE_FAILURE) {
            throw new Error(event.data.reason);
          }

          this.isInitialized = true;

          resolve();
        }
        catch (error) {
          this.logger.error(error);
          reject(error);
        }
        finally {
          // Whether success or failure, remove the event listener
          window.removeEventListener('message', this._onRouterCreate);

          // Once the event listener is removed, remove the listener handler,
          // since it will not be used again and to prevent the `destroy` method
          // from trying to unregister it.
          this._onRouterCreate = null;
          this.isTryingToInitialize = false;
        }
      };

      // When the Router in the iframe connects, it will broadcast a message
      // letting us know it connected, or letting us know it failed.
      window.addEventListener('message', this._onRouterCreate);

      this.isTryingToInitialize = true;

      // Tell the iframe to create the Router instance
      this.sendMessageToIframe({
        clientId: this.clientId,
        event: RouterController.events.CREATE,
      });
    });
  }

  /**
   * After initialization, call this to establish the connection to the server.
   *
   * Note that this is called within the play method, so you shouldn't ever need
   * to manually call `connect`.
   *
   * @returns Promise
   *   Resolves when the connection is successfully established.
   *   Rejects upon failure to connect after a number of retries.
   */
  async connect (reconnect = true) {
    if (this.isDestroyed) {
      return;
    }

    if (this.isTryingToDisconnect) {
      throw new Error('Failed to connect - attempted to connect while a disconnection attempt was being made.');
    }

    if (this.isTryingToConnect) {
      return;
    }

    if (this.isConnected) {
      return;
    }

    this.logger.debug('Connecting...');

    return new Promise((resolve, reject) => {
      this._onRouterConnect = (event) => {
        try {
          if (this.isTryingToDisconnect) {
            throw new Error('Still listening for connection after trying to disconnect');
          }

          const desiredEventTypes = [
            RouterController.routerEvents.CONNECT_SUCCESS,
            RouterController.routerEvents.CONNECT_FAILURE,
          ];

          if (this.isDesiredRouterEvent(event, desiredEventTypes)) {
            return;
          }

          this.logger.debug(`connect "${eventType}" event`);

          if (eventType === RouterController.routerEvents.CONNECT_FAILURE) {
            const error = new Error(event.data.reason)
            this.logger.error(error);

            if (!reconnect) {
              throw error;
            }

            await this.reconnect();

            return resolve();
          }

          // the mse service will stop streaming to us if we don't send
          // a message to iov/stats within 1 minute.
          this.statsInterval = setInterval(() => {
            this.publishStats();
          }, this.options.PUBLISH_STATS_INTERVAL * 1000);

          this.isConnected = true;

          this.logger.info('Connected');

          resolve();
        }
        catch (error) {
          this.logger.error(error);
          reject(error);
        }
        finally {
          // Whether success or failure, remove the event listener
          window.removeEventListener('message', this._onRouterConnect);
          this._onRouterConnect = null;
          this.isTryingToConnect = false;
        }
      };

      window.addEventListener('message', this._onRouterConnect);

      this.isTryingToConnect = true;

      this.routerConnect();
    });
  }

  /**
   * Disconnect from the CLSP server
   *
   * @todo - return a promise that resolves when the disconnection is complete!
   */
  disconnect () {
    if (this.isDestroyed) {
      return;
    }

    if (this.isTryingToDisconnect) {
      return;
    }

    this.logger.debug('Disconnecting...');

    return new Promise((resolve, reject) => {
      this._onRouterDisconnect = (event) => {
        try {
          const desiredEventTypes = [
            RouterController.routerEvents.DISCONNECT_SUCCESS,
            RouterController.routerEvents.CONNECTION_LOST,
          ];

          if (this.isDesiredRouterEvent(event, desiredEventTypes)) {
            return;
          }

          this.logger.debug(`disconnect "${eventType}" event`);

          if (eventType === RouterController.routerEvents.CONNECTION_LOST) {
            const error = new Error(event.data.reason)
            this.logger.error(error);

            this.logger.info('Disconnected, but not gracefully');
          }
          else {
            this.logger.info('Disconnected');
          }

          this.isDisconnected = true;
          this.isTryingToConnect = false;
          this.isConnected = false;

          resolve();
        }
        catch (error) {
          this.logger.error(error);
          reject(error);
        }
        finally {
          // Whether success or failure, remove the event listener
          window.removeEventListener('message', this._onRouterDisconnect);
          this._onRouterDisconnect = null;
          this.isTryingToDisconnect = false;
        }
      };

      window.addEventListener('message', this._onRouterDisconnect);

      this.isTryingToDisconnect = true;

      // when a stream fails, it no longer needs to send stats to the
      // server, and it may not even be connected to the server
      this.clearStatsInterval();

      this.routerDisconnect();
    });

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
  ) {
    this.reconnectionAttempts++;
    this.totalReconnectionAttempts++;

    this.logger.info(`Reconnection attempt ${this.reconnectionAttempts}...`);

    try {
      if (this.isTryingToDisconnect) {
        throw new Error('Failed to reconnect - attempted to reconnect while a disconnection attempt was being made.');
      }

      if (this.options.MAX_RECONNECTION_ATTEMPTS
        && this.reconnectionAttempts > this.options.MAX_RECONNECTION_ATTEMPTS
      ) {
        throw new Error(`Failed to reconnect after ${this.reconnectionAttempts} attempts.`);
      }

      if (this.options.MAX_RECONNECTION_TIME && Date.now() > stopTryingToReconnectAt) {
        throw new Error(`Failed to reconnect after ${this.options.MAX_RECONNECTION_TIME} seconds.`);
      }

      try {
        this.disconnect();
        await this.connect(false);

        // After successfully connecting, reset the reconnection attempts and
        this.reconnectionAttempts = 0;
      }
      catch (error) {
        this.logger.error(error);

        const actualDuration = Date.now() - reconnectionStartedAt;
        const immediateReconnectionDuration = (this.options.IMMEDIATE_RECONNECTION_DURATION * 1000);

        const reconnectionDelay = actualDuration > immediateReconnectionDuration
          ? this.options.RECONNECTION_DELAY
          : this.options.IMMEDIATE_RECONNECTION_DELAY;

        await utils.sleep(reconnectionDelay);

        return this._reconnect(
          reconnectionStartedAt,
          stopTryingToReconnectAt,
        );
      }
    }
    catch (error) {
      this.logger.error(error);
      this.logger.error('Failed to reconnect');
      reject(error);
    }
  }

  /**
   * Attempt to reconnect a certain number of times
   *
   * @returns {Promise}
   */
  reconnect () {
    if (this.isDestroyed) {
      return;
    }

    if (this.isTryingToDisconnect) {
      return;
    }

    if (this.isConnected) {
      return;
    }

    if (this.isTryingToReconnect) {
      return;
    }

    this.logger.info('Reconnecting...');

    try {
      this.isTryingToReconnect = true;

      const reconnectionStartedAt = Date.now();
      const stopTryingToReconnectAt = this.MAX_RECONNECTION_TIME
        ? reconnectionStartedAt + (this.MAX_RECONNECTION_TIME * 1000)
        : 0;

      await this._reconnect(
        reconnectionStartedAt,
        stopTryingToReconnectAt,
      );

      this.logger.info('Successfully reconnected!');

      // @todo - is this necessary?  can't this be handled by the conduit?
      this._onReconnect();
    }
    catch (error) {
      this.logger.error(error);
      this.logger.error('Failed to reconnect!');

      // @todo - is this necessary?  can't this be handled by the conduit?
      this._onReconnect(error);

      throw error;
    }
    finally {
      this.isTryingToReconnect = false;
    }
  }

  clearStatsInterval () {
    if (this.statsInterval) {
      clearInterval(this.statsInterval);
      this.statsInterval = null;
    }
  }

  /**
   * @private
   *
   * @async
   *
   * Send stats to the server
   */
  async publishStats () {
    this.statsMsg.inkbps = (this.statsMsg.byteCount * 8) / 30000.0;
    this.statsMsg.byteCount = 0;

    try {
      await this.publish(
        'iov/stats',
        this.statsMsg,
      );

      this.logger.debug('iov status', this.statsMsg);
    }
    catch (error) {
      this.logger.error('Error while publishing stats!');
      this.logger.error(error);

      // if the stats cannot be published, treat it as an unexpected
      // disconnection
      this.clearStatsInterval();
      this.reconnect();
    }
  }

  routerConnect () {
    this.sendMessageToIframe({
      method: Router.methods.CONNECT,
    });
  }

  routerDisconnect () {
    this.sendMessageToIframe({
      method: Router.methods.DISCONNECT,
    });
  }

  destroy () {
    if (this.isDestroyed) {
      this.logger.debug('Already destroyed...');
      return;
    }

    this.logger.debug('Destroying...');

    if (this._onRouterCreate) {
      window.removeEventListener('message', this._onRouterCreate);
      this._onRouterCreate = null;
    }

    if (this._onRouterConnect) {
      window.removeEventListener('message', this._onRouterConnect);
      this._onRouterConnect = null;
    }

    if (this._onRouterDisconnect) {
      window.removeEventListener('message', this._onRouterDisconnect);
      this._onRouterDisconnect = null;
    }

    // @todo - what about async here?
    this.disconnect();

    this.isDestroyed = true;

    this.iframe = null;

    this.statsMsg = null;
  }
}
