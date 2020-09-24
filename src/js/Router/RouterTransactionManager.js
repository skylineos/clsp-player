import {
  v4 as uuidv4,
} from 'uuid';
import {
  timeout as PromiseTimeout,
} from 'promise-timeout';

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

  _formatTransactionResponsePayload (response) {
    const payloadString = response.payloadString;

    // @todo - why is this necessary?  and why is this only ever necessary
    // in a transaction?  Is this only for moovs or something?
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

    return response;
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
   * @todo - this needs to be refactored to use PromiseTimeout
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
    requestTopic,
    messageData = {},
    timeoutDuration = this.TRANSACTION_TIMEOUT,
    responseTopic,
  ) {
    this.logger.debug(`transaction for ${requestTopic}...`);

    const transactionId = uuidv4();

    // @todo - this responseTopic override is only ever used for getting a
    // moov for a stream.  In that use case, the resp_topic is never specified
    // in the message.  This condition and workflow works, but seems less
    // elegant than it could be.
    if (!responseTopic) {
      responseTopic = `${this.clientId}/transaction/${transactionId}`;
      messageData.resp_topic = responseTopic;
    }

    this.pendingTransactions[transactionId] = {
      id: transactionId,
      hasTimedOut: false,
      timeout: null,
    };

    return new Promise(async (resolve, reject) => {
      const finished = async (error, response) => {
        // Step 3:
        // At this point, we defined a responseTopic that we want the CLSP
        // server to broadcast on, we subscribed to that responseTopic, then
        // we published to the actual requestTopic, which included telling the
        // server what responseTopic to broadcast the response on.  Assuming
        // things went well, the server broadcast the response to the
        // responseTopic, and we received it in the subscribe handler.  Since
        // this operation was meant to be a "transaction", meaning we only
        // needed a single response to our requestTopic, we can unsubscribe
        // from our responseTopic.
        await this.unsubscribe(responseTopic);

        if (this.pendingTransactions[transactionId].timeout) {
          clearTimeout(this.pendingTransactions[transactionId].timeout);
          this.pendingTransactions[transactionId].timeout = null;
        }

        if (error) {
          return reject(error);
        }

        resolve(this._formatTransactionResponsePayload(response));
      };

      try {
        this.pendingTransactions[transactionId].timeout = setTimeout(() => {
          if (this.pendingTransactions[transactionId].hasTimedOut) {
            return;
          }

          this.pendingTransactions[transactionId].hasTimedOut = true;

          finished(new Error(`Transaction for ${requestTopic} timed out after ${timeoutDuration} seconds`));
        }, timeoutDuration * 1000);

        // Step 1:
        // We subscribe to the responseTopic, which we are going to pass to the
        // server in the next step.  When the server starts broadcasting the
        // response to our request on this responseTopic, we will already be
        // listening.  We have to be listening first because, since this is a
        // transaction, the server will only broadcast the response once.
        this.subscribe(responseTopic, (response) => {
          console.log(`performed transaction for ${requestTopic}`, response);
          finished(null, response);
        });

        // Step 2:
        // We publish to the requestTopic, which is like a CLSP server REST
        // endpoint.  The server has to know how to respond to the specific
        // requestTopic, but our subscriptionTopic (which is also defined in
        // `message.resp_topic`) is arbitrary and defined by us (the client),
        // though in order to be useful, it must be globally unique.  Once we
        // publish to the requestTopic and the server successfully receives and
        // processes the request, it will start broadcasting on the resp_topic
        // we defined, which we subscribed to in the previous step.
        await this.publish(requestTopic, messageData);
      }
      catch (error) {
        finished(error);
      }
    });
  }

  /**
   * @async
   *
   * Publishing something to the CLSP server means that you send a request and
   * get a confirmation of deliver from Paho.  It's different from the
   * transaction in that you do not need to subscribe to a topic to get a
   * response/ack from the server (because you don't expect a response from the
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
  async publish (topic, data, timeout = this.TRANSACTION_TIMEOUT) {
    this.logger.debug(`Publishing to topic "${topic}"`);

    // There can be `n` publishes for 1 topic, e.g. `iov/stats`
    const publishId = uuidv4();

    try {
      await PromiseTimeout(this._publish(publishId, topic, data), timeout * 1000);
      this.logger.info(`Successfully published to topic "${topic}" with id "${publishId}"`);
    }
    catch (error) {
      this.logger.error(`Failed to publish to topic "${topic}" with id "${publishId}"`);
      throw error;
    }
  }

  /**
   * @private
   */
  _publish (publishId, topic, data) {
    return new Promise((resolve, reject) => {
      this.publishHandlers[publishId] = {
        onSuccess: (event) => {
          this.logger.info(`Successfully published to topic "${topic}" with publishId "${publishId}"`);

          delete this.publishHandlers[publishId];

          resolve();
        },
        onFailure: (event) => {
          this.logger.error(`Failed to publish to topic "${topic}" with publishId "${publishId}"`);

          delete this.publishHandlers[publishId];

          reject(new Error(event.data.reason));
        },
      };

      this.issueCommand(RouterTransactionManager.routerCommands.PUBLISH, {
        publishId,
        topic,
        data,
      });
    });
  }

  hasPublishHandler (publishId) {
    if (this.isDestroyComplete) {
      // @todo - should this throw?
      return false;
    }

    if (!publishId) {
      // @todo - should this throw?
      return false;
    }

    if (!this.publishHandlers) {
      // @todo - should this throw?
      return false;
    }

    if (!this.publishHandlers[publishId]) {
      return false;
    }

    return true;
  }

  /**
   * Register a handler that will being listening to a topic until that topic
   * is unsubscribed from.
   *
   * Note that currently, the only use cases for a "persistent" subscription
   * are stream resync and the actual stream itself.  All other subscribe use
   * cases are transactional, and therefore use the `transaction` method.  Use
   * this `subscribe` method cautiously / sparingly.
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

  hasSubscribeHandler (topic) {
    if (this.isDestroyComplete) {
      // @todo - should this throw?
      return false;
    }

    if (!topic) {
      // @todo - should this throw?
      return false;
    }

    if (!this.subscribeHandlers) {
      // @todo - should this throw?
      return false;
    }

    if (!this.subscribeHandlers[topic]) {
      return false;
    }

    return true;
  }

  /**
   * @async
   *
   * Stop listening to a topic
   *
   * @param {String} topic
   *   The topic to unsubscribe from
   */
  async unsubscribe (topic, timeout = this.TRANSACTION_TIMEOUT) {
    this.logger.debug(`Unsubscribing from topic "${topic}"`);

    try {
      await PromiseTimeout(this._unsubscribe(topic), timeout * 1000);
      this.logger.info(`Successfully unsubscribed from topic "${topic}"`);
    }
    catch (error) {
      this.logger.info(`Failed to unsubscribe from topic "${topic}"`);
      throw error;
    }
  }

  /**
   * @private
   */
  _unsubscribe (topic) {
    return new Promise((resolve, reject) => {
      this.unsubscribeHandlers[topic] = {
        onSuccess: (event) => {
          this.logger.info(`Successfully unsubscribed from topic ${topic}`);

          delete this.unsubscribeHandlers[topic];

          resolve();
        },
        onFailure: (event) => {
          this.logger.error(`Failed to unsubscribe from topic "${topic}"!`);

          delete this.unsubscribeHandlers[topic];

          reject(new Error(event.data.reason));
        },
      };

      if (this.hasSubscribeHandler(topic)) {
        // When data is received for a topic that is subscribed to, but that we
        // are about to unsubscribe from, stop processing that topic data.
        delete this.subscribeHandlers[topic];
      }

      this.issueCommand(RouterTransactionManager.routerCommands.UNSUBSCRIBE, {
        topic,
      });
    });
  }

  hasUnsubscribeHandler (topic) {
    if (this.isDestroyComplete) {
      // @todo - should this throw?
      return false;
    }

    if (!topic) {
      // @todo - should this throw?
      return false;
    }

    if (!this.unsubscribeHandlers) {
      // @todo - should this throw?
      return false;
    }

    if (!this.unsubscribeHandlers[topic]) {
      return false;
    }

    return true;
  }

  halt () {
    for (const transactionId in this.pendingTransactions) {
      const pendingTransaction = this.pendingTransactions[transactionId];

      if (pendingTransaction.timeout) {
        clearTimeout(pendingTransaction.timeout);
        pendingTransaction.timeout = null;
      }
    }

    this.pendingTransactions = {};
    this.unsubscribeHandlers = {};
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
