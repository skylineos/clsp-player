import {
  v4 as uuidv4,
} from 'uuid';

import RouterBaseManager from './RouterBaseManager';

const DEFAULT_TRANSACTION_TIMEOUT = 5;

export default class RouterTransactionManager extends RouterBaseManager {
  /**
   * @static
   *
   * The events that this RouterConnectionManager will emit.
   */
  static events = {
    COMMAND_ISSUED: 'command-issued',
  }

  static factory (
    logId,
    clientId,
  ) {
    return new RouterTransactionManager(
      logId,
      clientId,
    );
  }

  constructor (
    logId,
    clientId,
  ) {
    super(
      logId,
      clientId,
    );

    this.publishHandlers = {};
    this.pendingTransactions = {};
    this.subscribeHandlers = {};
    this.unsubscribeHandlers = {};

    this.TRANSACTION_TIMEOUT = DEFAULT_TRANSACTION_TIMEOUT;
  }

  /**
   * Issue a command to the Router
   *
   * @param {*} type
   */
  issueCommand (command, message = {}) {
    if (this.isDestroyed) {
      this.logger.warn(`Cannot issue command "${command}" to Router after destruction`);
      return;
    }

    this.logger.debug(`Issuing command ${command} to Router...`);

    this.events.emit(RouterTransactionManager.events.COMMAND_ISSUED, {
      command,
      message,
    });
  }

  /**
   * Request
   *
   * When asking the server for something, we do not get a response right away.
   * Instead, we must perform the following steps:
   *
   * 1. generate a unique string, which will be sent to the server as the "response topic"
   * 1. subscribe
   *
   * @param {String} topic
   *   The topic to perform a transaction on
   * @param {Object} messageData
   *   The data to be published
   *
   * @returns {Promise}
   *   Resolves when the transaction successfully finishes
   *   Rejects if there is any error or timeout during the transaction
   */
  transaction (
    topic,
    messageData = {},
    timeoutDuration = this.TRANSACTION_TIMEOUT,
    subscribeTopic,
  ) {
    this.logger.debug(`transaction for ${topic}...`);

    const transactionId = uuidv4();

    if (!subscribeTopic) {
      subscribeTopic = messageData.resp_topic = `${this.clientId}/response/${transactionId}`;
    }

    this.pendingTransactions[transactionId] = {
      id: transactionId,
      hasTimedOut: false,
      timeout: null,
    };

    return new Promise(async (resolve, reject) => {
      const finished = async (error, response) => {
        await this.unsubscribe(subscribeTopic);

        if (this.pendingTransactions[transactionId].timeout) {
          clearTimeout(this.pendingTransactions[transactionId].timeout);
          this.pendingTransactions[transactionId].timeout = null;
        }

        if (error) {
          return reject(error);
        }

        const payloadString = response.payloadString;

        // @todo - why is this necessary?
        if (response.payloadString) {
          try {
            response.payloadString = JSON.parse(payloadString) || {};
          }
          catch (error) {
            this.logger.warn('Failed to parse payloadString');
            this.logger.warn(error);
            response.payloadString = payloadString;
          }
        }

        resolve(response);
      };

      this.pendingTransactions[transactionId].timeout = setTimeout(() => {
        if (this.pendingTransactions[transactionId].hasTimedOut) {
          return;
        }

        this.pendingTransactions[transactionId].hasTimedOut = true;

        finished(new Error(`Transaction for ${topic} timed out after ${timeoutDuration} seconds`));
      }, timeoutDuration * 1000);

      this.subscribe(subscribeTopic, (response) => {
        finished(null, response);
      });

      try {
        await this.publish(topic, messageData);
      }
      catch (error) {
        finished(error);
      }
    });
  }

  /**
   * Publishing something to the CLSP server means that you send a request and
   * get a confirmation of deliver from Paho.  It's different from the
   * transaction in that you do not need to subscribe to a topic to get a
   * response from the server (because you don't expect a response from the
   * server).  All transactions use publish in addition to sub/unsub.
   *
   * Publish actions include:
   * - stopping a stream
   * - sending stats
   *
   * @param {String} topic
   *   The topic to publish to
   * @param {Object} data
   *   The data to publish
   *
   * @returns {Promise}
   *   Resolves when publish operation is successful
   *   Rejects when publish operation fails
   */
  publish (topic, data) {
    this.logger.debug(`Publishing to topic "${topic}"`);

    // There can be `n` publishes for 1 topic, e.g. `iov/stats`
    const publishId = uuidv4();

    return new Promise((resolve, reject) => {
      this.publishHandlers[publishId] = (event) => {
        const isValidEvent = this._isValidEvent(event, [
          RouterTransactionManager.routerEvents.PUBLISH_SUCCESS,
          RouterTransactionManager.routerEvents.PUBLISH_FAILURE,
        ]);

        if (!isValidEvent) {
          return;
        }

        // Filter out messages that are for a different publish event
        if (event.data.publishId !== publishId) {
          return;
        }

        const eventType = event.data.event;

        this.logger.debug(`publish "${eventType}" event`);

        // Whether success or failure, remove the event listener
        window.removeEventListener('message', this.publishHandlers[publishId]);
        delete this.publishHandlers[publishId];

        if (eventType === RouterTransactionManager.routerEvents.PUBLISH_FAILURE) {
          this.logger.error(new Error(event.data.reason));

          return reject(new Error(`Failed to publish to topic "${topic}", publishId "${publishId}"`));
        }

        this.logger.info(`Successfully published to topic "${topic}", publishId "${publishId}"`);

        resolve();
      };

      window.addEventListener('message', this.publishHandlers[publishId]);

      this.issueCommand(RouterTransactionManager.routerCommands.PUBLISH, {
        publishId,
        topic,
        data,
      });
    });
  }

  /**
   * Register a handler that will listen to a topic
   *
   * @todo - return a Promise
   *
   * @param {String} topic
   *   The topic to subscribe to
   * @param {Conduit-subscribeCb} cb
   *   The callback for the subscribe operation
   */
  subscribe (topic, handler) {
    this.logger.debug(`Subscribing to topic "${topic}"`);

    this.subscribeHandlers[topic] = handler;

    this.issueCommand(RouterTransactionManager.routerCommands.SUBSCRIBE, {
      topic,
    });
  }

  /**
   * Stop listening to a topic
   *
   * @param {String} topic
   *   The topic to unsubscribe from
   */
  unsubscribe (topic) {
    this.logger.debug(`Unsubscribing from topic "${topic}"`);

    // unsubscribes can occur asynchronously, so ensure the handlers object
    // still exists
    // @todo - is this `handlers` condition still needed?
    if (this.subscribeHandlers) {
      delete this.subscribeHandlers[topic];
    }

    return new Promise((resolve, reject) => {
      this.unsubscribeHandlers[topic] = (event) => {
        const clientId = event.data.clientId;

        // A window message was received that is not related to CLSP
        if (!clientId) {
          return;
        }

        // This message was intended for another conduit
        if (this.clientId !== clientId) {
          return;
        }

        const eventType = event.data.event;

        // Filter out all other window messages
        if (
          eventType !== RouterTransactionManager.routerEvents.UNSUBSCRIBE_SUCCESS &&
          eventType !== RouterTransactionManager.routerEvents.UNSUBSCRIBE_FAILURE
        ) {
          return;
        }

        // Filter out unsubscribe messages that are for a different topic
        if (event.data.topic !== topic) {
          return;
        }

        this.logger.debug(`unsubscribe "${eventType}" event`);

        // Whether success or failure, remove the event listener
        window.removeEventListener('message', this.unsubscribeHandlers[topic]);
        delete this.unsubscribeHandlers[topic];

        if (eventType === RouterTransactionManager.routerEvents.UNSUBSCRIBE_FAILURE) {
          this.logger.error(new Error(event.data.reason));

          return reject(new Error(`Failed to unsubscribe from topic "${topic}"`));
        }

        this.logger.info(`Successfully unsubscribed from topic "${topic}"`);
        resolve();
      };

      window.addEventListener('message', this.unsubscribeHandlers[topic]);

      // @todo - what happens in the event of a timeout?
      this.issueCommand(RouterTransactionManager.routerCommands.UNSUBSCRIBE, {
        topic,
      });
    });
  }

  halt () {
    for (const [
      , // id, which we aren't using
      pendingTransaction,
    ] of Object.entries(this.pendingTransactions)) {
      if (pendingTransaction.timeout) {
        clearTimeout(pendingTransaction.timeout);
        pendingTransaction.timeout = null;
      }
    }

    this.pendingTransactions = {};

    for (const topic in this.unsubscribeHandlers) {
      window.removeEventListener('message', this.unsubscribeHandlers[topic]);
    }

    this.unsubscribeHandlers = {};

    for (const publishId in this.publishHandlers) {
      window.removeEventListener('message', this.publishHandlers[publishId]);
    }

    this.publishHandlers = {};

    // @todo - do these all need to be unsubscribed from?
    this.subscribeHandlers = {};
  }

  /**
   * @todo - provide method description
   *
   * @todo - return a Promise
   *
   * @param {String} topic
   *   The topic to send to
   * @param {Array} byteArray
   *   The raw data to send
   */
  directSend (topic, byteArray) {
    this.logger.debug('directSend...');

    this.issueCommand(RouterTransactionManager.routerCommands.SEND, {
      topic,
      byteArray,
    });
  }

  onMessage (eventType, event) {
    try {
      switch (eventType) {
        case RouterTransactionManager.routerEvents.UNSUBSCRIBE_SUCCESS:
        case RouterTransactionManager.routerEvents.UNSUBSCRIBE_FAILURE:
        case RouterTransactionManager.routerEvents.PUBLISH_SUCCESS:
        case RouterTransactionManager.routerEvents.PUBLISH_FAILURE: {
          break;
        }
        default: {
          this.logger.info(`RouterTransactionManager called with unknown eventType: ${eventType}`);
        }
      }
    }
    catch (error) {
      this.logger.error('Error while receiving message from Router:');
      this.logger.error(error);
    }
  }

  destroy () {
    if (this.isDestroyed) {
      return;
    }

    this.isDestroyed = true;

    this.halt();

    this.pendingTransactions = {};
    this.unsubscribeHandlers = {};
    this.publishHandlers = {};
    this.subscribeHandlers = {};

    super._destroy();
  }
}
