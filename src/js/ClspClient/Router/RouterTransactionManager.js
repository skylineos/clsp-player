import {
  v4 as uuidv4,
} from 'uuid';
import {
  timeout as PromiseTimeout,
} from 'promise-timeout';

import RouterBaseManager from './RouterBaseManager';
import RouterIframeManager from './RouterIframeManager';

const DEFAULT_TRANSACTION_TIMEOUT = 5;

export default class RouterTransactionManager extends RouterBaseManager {
  /**
   * @static
   *
   * The Router events that this Router Manager is responsible for
   */
  static routerEvents = {
    PUBLISH_SUCCESS: RouterBaseManager.routerEvents.PUBLISH_SUCCESS,
    PUBLISH_FAILURE: RouterBaseManager.routerEvents.PUBLISH_FAILURE,
    UNSUBSCRIBE_SUCCESS: RouterBaseManager.routerEvents.UNSUBSCRIBE_SUCCESS,
    UNSUBSCRIBE_FAILURE: RouterBaseManager.routerEvents.UNSUBSCRIBE_FAILURE,
    MESSAGE_ARRIVED: RouterBaseManager.routerEvents.MESSAGE_ARRIVED,
  };

  static factory (
    logId,
    clientId,
    routerIframeManager,
  ) {
    return new RouterTransactionManager(
      logId,
      clientId,
      routerIframeManager,
    );
  }

  constructor (
    logId,
    clientId,
    routerIframeManager,
  ) {
    super(
      logId,
      clientId,
      routerIframeManager,
    );

    if (!routerIframeManager) {
      throw new Error('Tried to instantiate a RouterTransactionManager without a routerIframeManager!');
    }

    this.routerIframeManager = routerIframeManager;

    this.isHalting = false;
    this.isHalted = false;
    this.iframeWasDestroyedExternally = false;

    this.publishHandlers = {};
    this.pendingTransactions = {};
    this.subscribeHandlers = {};
    this.unsubscribeHandlers = {};
    this.unsubscribesInProgress = {};

    this.TRANSACTION_TIMEOUT = DEFAULT_TRANSACTION_TIMEOUT;

    // @todo - this seems too tightly coupled...  It's needed to detect when an
    // error should be shown for unsubscribes and publishes
    this.routerIframeManager.on(RouterIframeManager.events.IFRAME_DESTROYED_EXTERNALLY, () => {
      this.iframeWasDestroyedExternally = true;
    });
  }

  /**
   * Issue a command to the Router
   *
   * @param {*} type
   */
  issueCommand (command, data = {}) {
    if (this.isDestroyed) {
      this.logger.warn(`Cannot issue command "${command}" to Router after destruction`);
      return;
    }

    this.logger.debug(`Issuing command ${command} to Router...`);

    this.routerIframeManager.command(command, data);
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
        try {
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
            throw error;
          }

          resolve(this._formatTransactionResponsePayload(response));
        }
        catch (error) {
          reject(error);
        }
      };

      try {
        this.pendingTransactions[transactionId].timeout = setTimeout(() => {
          // @todo - somehow, this condition is possible...
          // Encountered when disconnecting from the network / internet while
          // testing
          if (!this.pendingTransactions || !this.pendingTransactions[transactionId]) {
            this.logger.warn(`Pending transaction for ${transactionId} was not cancelled...`);
            return;
          }

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
    if (this.isDestroyComplete) {
      this.logger.info(`Tried to publish to topic "${topic}" while destroyed`);
      return;
    }

    this.logger.debug(`Publishing to topic "${topic}"`);

    // There can be `n` publishes for 1 topic, e.g. `iov/stats`
    const publishId = uuidv4();

    try {
      await PromiseTimeout(this._publish(publishId, topic, data), timeout * 1000);
      this.logger.info(`Successfully published to topic "${topic}" with id "${publishId}"`);
    }
    catch (error) {
      if (this.isDestroyed) {
        this.logger.info(`Publish to topic "${topic}" with id "${publishId}" failed while destroying`);
        return;
      }

      if (this.isHalting || this.isHalted) {
        this.logger.info(`Publish to topic "${topic}" with id "${publishId}" failed while halting/halted`);
        return;
      }

      if (this.iframeWasDestroyedExternally) {
        this.logger.info(`Publish to topic "${topic}" with id "${publishId}" failed while iframe was destroyed externally`);
        return;
      }

      this.logger.error(`Failed to publish to topic "${topic}" with id "${publishId}"`);
      this.logger.error(error);

      throw error;
    }
    finally {
      delete this.publishHandlers[publishId];
    }
  }

  /**
   * @private
   */
  _publish (publishId, topic, data) {
    return new Promise((resolve, reject) => {
      this.publishHandlers[publishId] = (error) => {
        if (error) {
          return reject(error);
        }

        resolve();
      };

      this.issueCommand(RouterTransactionManager.routerCommands.PUBLISH, {
        publishId,
        topic,
        data,
      });
    });
  }

  _handlePublishRouterEvent (eventType, event) {
    const publishId = event.data.publishId;

    if (!publishId) {
      throw new Error('Cannot handle publish event without publishId');
    }

    if (!this.publishHandlers[publishId]) {
      this.logger.warn(`No handler for publishId "${publishId}" for publish event "${eventType}"`);
      return;
    }

    switch (eventType) {
      case RouterTransactionManager.routerEvents.PUBLISH_SUCCESS: {
        this.publishHandlers[publishId]();
        break;
      }
      case RouterTransactionManager.routerEvents.PUBLISH_FAILURE: {
        this.publishHandlers[publishId](new Error(event.data.reason));
        break;
      }
      default: {
        throw new Error(`Unknown eventType: ${eventType}`);
      }
    }
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
   * @param {RouterTransactionManager-subscribeHandler} handler
   *   The callback for the subscribe operation
   */
  subscribe (topic, handler) {
    this.logger.debug(`Subscribing to topic "${topic}"`);

    this.subscribeHandlers[topic] = handler;

    this.issueCommand(RouterTransactionManager.routerCommands.SUBSCRIBE, {
      topic,
    });
  }

  _handleMessageArrivedRouterEvent (eventType, event) {
    if (this.isDestroyComplete) {
      throw new Error('Tried to handle Router message arrived event after destroy was complete!');
    }

    const message = event.data;
    const topic = message.destinationName;

    if (!topic) {
      throw new Error('Cannot handle subscribe event without a topic');
    }

    if (!this.subscribeHandlers[topic]) {
      this.logger.warn(`No handler for subscribe topic "${topic}" for message event "${eventType}"`);
      return;
    }

    switch (eventType) {
      case RouterTransactionManager.routerEvents.MESSAGE_ARRIVED: {
        this.subscribeHandlers[topic](message, event);
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
   * Stop listening to a topic
   *
   * @param {String} topic
   *   The topic to unsubscribe from
   */
  async unsubscribe (topic, timeout = this.TRANSACTION_TIMEOUT) {
    if (this.isDestroyComplete) {
      this.logger.info(`Tried to unsubscribe from topic "${topic}" while destroyed`);
      return;
    }

    if (this.unsubscribesInProgress[topic]) {
      this.logger.info(`Already unsubscribing from ${topic}`);
      return;
    }

    this.logger.debug(`Unsubscribing from topic "${topic}"`);

    try {
      // When data is received for a topic that is subscribed to, but that we
      // are about to unsubscribe from, stop processing that topic data.
      delete this.subscribeHandlers[topic];

      this.unsubscribesInProgress[topic] = true;

      await PromiseTimeout(this._unsubscribe(topic), timeout * 1000);

      this.logger.info(`Successfully unsubscribed from topic "${topic}"`);
    }
    catch (error) {
      if (this.isDestroyed) {
        this.logger.info(`Unsubscribe from topic "${topic}" failed while destroying`);
        return;
      }

      if (this.isHalting || this.isHalted) {
        this.logger.info(`Unsubscribe from topic "${topic}" failed while halting/halted`);
        return;
      }

      if (this.iframeWasDestroyedExternally) {
        this.logger.info(`Unsubscribe from topic "${topic}" failed while iframe was destroyed externally`);
        return;
      }

      this.logger.info(`Failed to unsubscribe from topic "${topic}"`);

      throw error;
    }
    finally {
      delete this.unsubscribesInProgress[topic];
      delete this.unsubscribeHandlers[topic];
    }
  }

  /**
   * @private
   */
  _unsubscribe (topic) {
    return new Promise((resolve, reject) => {
      this.unsubscribeHandlers[topic] = (error) => {
        if (error) {
          return reject(error);
        }

        resolve();
      };

      this.issueCommand(RouterTransactionManager.routerCommands.UNSUBSCRIBE, {
        topic,
      });
    });
  }

  _handleUnsubscribeRouterEvent (eventType, event) {
    const topic = event.data.topic;

    if (this.isDestroyComplete) {
      throw new Error('Tried to check unsubscribe handler after destroy was complete!');
    }

    if (!topic) {
      throw new Error('Cannot handle unsubscribe event without a topic');
    }

    if (!this.unsubscribeHandlers[topic]) {
      this.logger.warn(`No handler for topic "${topic}" for unsubscribe event "${eventType}"`);
      return;
    }

    switch (eventType) {
      case RouterTransactionManager.routerEvents.UNSUBSCRIBE_SUCCESS: {
        this.unsubscribeHandlers[topic]();
        break;
      }
      case RouterTransactionManager.routerEvents.UNSUBSCRIBE_FAILURE: {
        this.unsubscribeHandlers[topic](new Error(event.data.reason));
        break;
      }
      default: {
        throw new Error(`Unknown eventType: ${eventType}`);
      }
    }
  }

  onRouterEvent (eventType, event) {
    if (this.isDestroyComplete) {
      throw new Error(`Tried to handle Router event ${eventType} after destroy was complete!`);
    }

    switch (eventType) {
      case RouterTransactionManager.routerEvents.PUBLISH_SUCCESS:
      case RouterTransactionManager.routerEvents.PUBLISH_FAILURE: {
        this._handlePublishRouterEvent(eventType, event);
        break;
      }
      case RouterTransactionManager.routerEvents.UNSUBSCRIBE_SUCCESS:
      case RouterTransactionManager.routerEvents.UNSUBSCRIBE_FAILURE: {
        this._handleUnsubscribeRouterEvent(eventType, event);
        break;
      }
      case RouterTransactionManager.routerEvents.MESSAGE_ARRIVED: {
        this._handleMessageArrivedRouterEvent(eventType, event);
        break;
      }
      default: {
        throw new Error(`Unknown eventType: ${eventType}`);
      }
    }
  }

  async halt () {
    if (this.isDestroyed) {
      this.logger.info('Tried to halt while destroyed');
      return;
    }

    if (this.isHalting || this.isHalted) {
      this.logger.info('Tried to halt while halting/halted');
      return;
    }

    this.logger.info('Halting all handlers...');
    this.isHalting = true;

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

    const subscribedTopics = Object.keys(this.subscribeHandlers);

    // @todo - error handling
    await Promise.allSettled(subscribedTopics.map((topic) => this.unsubscribe(topic)));

    this.subscribeHandlers = {};
    this.unsubscribesInProgress = {};

    this.isHalting = false;
    this.isHalted = true;
    this.logger.info('Finished halting all handlers');
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

  async _destroy () {
    await this.halt();

    this.pendingTransactions = null;
    this.unsubscribeHandlers = null;
    this.publishHandlers = null;
    this.subscribeHandlers = null;
    this.unsubscribesInProgress = null;

    await super._destroy();
  }
}
