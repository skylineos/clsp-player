'use strict';

/**
 * The Router is the lowest level controller of the actual CLSP connection.
 *
 * Note that this is the code that gets duplicated in each iframe.
 * Keep the contents of the exported function light and ES5 only.
 *
 * @todo - have a custom loader for webpack that can convert this to ES5 and
 * minify it in a self-contained way at the time it is required so that we can
 * use ES6 and multiple files.
 *
 * @todo - should all thrown errors send a message to the parent Conduit?
 */

/**
 * This Router will manage a CLSP connection for a given clientId, and pass
 * the relevant data and messages back up to the Conduit.
 *
 * @see - https://developer.mozilla.org/en-US/docs/Web/HTML/Element/iframe
 * @see - https://developer.mozilla.org/en-US/docs/Web/HTML/Element/body
 * @see - https://www.eclipse.org/paho/files/jsdoc/index.html
 *
 * @export - the function that provides the Router and constants
 */
export default function () {
  // The error code from Paho that represents the socket not being
  // connected
  var PAHO_ERROR_CODE_NOT_CONNECTED = 'AMQJS0011E';
  var PAHO_ERROR_CODE_ALREADY_CONNECTED = 'AMQJS0011E';
  var Paho = window.parent.Paho;

  /**
   * A Router that can be used to set up a CLSP connection to the specified
   * host and port, using a Conduit-provided clientId that will be a part of
   * every message that is passed from this iframe window to the parent window,
   * so that the conduit can identify what client the message is for.
   *
   * @param {String} logId
   *   a string that identifies this router in log messages
   * @param {String} clientId
   *   the guid to be used to construct the topic
   * @param {String} host
   *   the host (url or ip) of the SFS that is providing the stream
   * @param {Number} port
   *   the port the stream is served over
   * @param {Boolean} useSSL
   *   true to request the stream over clsps, false to request the stream over clsp
   * @param {Object} options
   */
  function Router (
    logId,
    clientId,
    host,
    port,
    useSSL,
    options
  ) {
    try {
      this.logId = logId;

      this.logger = window.Logger().factory(`Router ${this.logId}`);

      this.clientId = clientId;

      this.host = host;
      this.port = port;
      this.useSSL = useSSL;

      this.logger.debug('Constructing...');

      this.Reconnect = null;

      // @todo - there is a "private" method named "_doConnect" in the paho
      // library that is responsible for instantiating the WebSocket.  We have
      // seen at least 1 instance where the instantiation of the WebSocket fails
      // which was due to the error "ERR_NAME_NOT_RESOLVED", but it does not
      // seem like this error is "passed" up to the caller (e.g. Router.connect)
      // and therefore we cannot respond to it.  If we could, perhaps we could
      // attempt to reconnect, or at least send a message to Router's parent.
      // Given this, should we override Paho.MQTT.Client._doConnect and wrap
      // the original prototype method call in a try/catch that we can control
      // and respond to?  I'm not even sure that that would solve the problem.
      // Presumably, the instantiation of the WebSocket would throw, which would
      // be caught by our Router.connect try/catch block...
      this.clspClient = new Paho.MQTT.Client(
        this.host,
        this.port,
        '/mqtt',
        this.clientId,
      );

      this.clspClient.onConnectionLost = this._onConnectionLost.bind(this);
      this.clspClient.onMessageArrived = this._onMessageArrived.bind(this);
      this.clspClient.onMessageDelivered = this._onMessageDelivered.bind(this);

      this.boundWindowMessageEventHandler = this._windowMessageEventHandler.bind(this);

      window.addEventListener(
        'message',
        this.boundWindowMessageEventHandler,
        false,
      );

      this.CONNECTION_TIMEOUT = options.CONNECTION_TIMEOUT;
      this.KEEP_ALIVE_INTERVAL = options.KEEP_ALIVE_INTERVAL;
      this.PUBLISH_TIMEOUT = options.PUBLISH_TIMEOUT;
    }
    catch (error) {
      this.logger.error('IFRAME error for clientId: ' + clientId);
      this.logger.error(error);
    }
  }

  // All events that are emitted by the Router are prefixed with `clsp_router`
  Router.events = {
    // Triggered when the Router is successfully instantiated.
    // Can only be triggered at time of router instantiation.
    CREATED: 'clsp_router_created',
    // Triggered when there is an error during Router instantiation.
    // Can only be triggered at time of router instantiation.
    CREATE_FAILURE: 'clsp_router_create_failure',
    // Triggered when a segment / moof is transmitted.
    // Can be triggered for as long as the connection is open.
    DATA_RECEIVED: 'clsp_router_clsp_data',
    // Triggered when a message is successfully published to the server
    // Can only be triggered on publish
    PUBLISH_SUCCESS: 'clsp_router_publish_success',
    // Triggered when a message fails to be published to the server
    // Can only be triggered on publish
    PUBLISH_FAIL: 'clsp_router_publish_failure',
    // Triggered when the connection to the CLSP server is established.
    // Can only be triggered at time of connection.
    CONNECT_SUCCESS: 'clsp_router_connect_success',
    // Triggered when trying to connect to the CLSP server fails.
    // Can only be triggered at time of connection.
    CONNECT_FAILURE: 'clsp_router_connect_failure',
    // Triggered when the connection to the CLSP server has been established, but is later lost.
    // Can be triggered for as long as the connection is open.
    CONNECTION_LOST: 'clsp_router_connection_lost',
    // Triggered when the connection to the CLSP server is terminated normally.
    // Can only be triggered at time of disconnection.
    DISCONNECT_SUCCESS: 'clsp_router_disconnect_success',
    // Triggered when trying to subscribe to a topic fails.
    // Can only be triggered when a subscribe is attempted.
    SUBSCRIBE_FAILURE: 'clsp_router_subscribe_failure',
    // When trying to unsubscribe from a topic fails.
    // Can only be triggered when an unsubscribe is attempted.
    UNSUBSCRIBE_FAILURE: 'clsp_router_unsubscribe_failure',
    // Triggered when an error is encountered while processing window messages.
    // Can be triggered any time.
    WINDOW_MESSAGE_FAIL: 'clsp_router_window_message_fail',
  };

  Router.factory = function (
    logId,
    clientId,
    host,
    port,
    useSSL,
    options
  ) {
    return new Router(
      logId,
      clientId,
      host,
      port,
      useSSL,
      options
    );
  };

  /**
   * @private
   *
   * Post a "message" with the current `clientId` to the parent window.
   *
   * @param {Object} message
   *   The message to send to the parent window
   *
   * @returns {void}
   */
  Router.prototype._sendToParentWindow = function (message) {
    this.logger.debug('Sending message to parent window...');

    if (this.destroyed) {
      return;
    }

    if (typeof message !== 'object') {
      throw new Error('_sendToParentWindow must be passed an object');
    }

    message.clientId = this.clientId;

    switch (message.event) {
      case Router.events.CREATED:
      case Router.events.CONNECT_SUCCESS:
      case Router.events.DISCONNECT_SUCCESS: {
        // no validation needed
        break;
      }
      case Router.events.DATA_RECEIVED: {
        if (!Object.prototype.hasOwnProperty.call(message, 'destinationName') ||
          !Object.prototype.hasOwnProperty.call(message, 'payloadString') ||
          !Object.prototype.hasOwnProperty.call(message, 'payloadBytes')
        ) {
          throw new Error('improperly formatted "data" message sent to _sendToParentWindow');
        }

        break;
      }
      case Router.events.CONNECT_FAILURE:
      case Router.events.CONNECTION_LOST:
      case Router.events.SUBSCRIBE_FAILURE:
      case Router.events.UNSUBSCRIBE_FAILURE:
      case Router.events.WINDOW_MESSAGE_FAIL: {
        if (!Object.prototype.hasOwnProperty.call(message, 'reason')) {
          throw new Error('improperly formatted "fail" message sent to _sendToParentWindow');
        }

        break;
      }
      case Router.events.PUBLISH_SUCCESS: {
        if (!message.publishId) {
          throw new Error('publish message must contain a publishId');
        }

        if (!message.topic) {
          throw new Error('publish message must contain a topic');
        }

        break;
      }
      case Router.events.PUBLISH_FAIL: {
        if (!message.publishId) {
          throw new Error('publish message must contain a publishId');
        }

        if (!Object.prototype.hasOwnProperty.call(message, 'reason')) {
          throw new Error('improperly formatted "fail" message sent to _sendToParentWindow');
        }

        break;
      }
      default: {
        throw new Error('Unknown event ' + message.event + ' sent to _sendToParentWindow');
      }
    }

    try {
      window.parent.postMessage(message, '*');
    }
    catch (error) {
      // When the connection to the SFS fails, and the conduit is destroyed,
      // there is still a message that is attempted to be sent to the parent.
      // In this case, the only way this "orphaned" iframe object can
      // communicate with the console is by throwing an error.  Therefore, it is
      // difficult to debug and I do not know what the final message is.  Having
      // the error written to the console here will still allow errors under
      // "normal" operations to be written to the console, but will suppress the
      // final unwanted error.
      // eslint-disable-next-line no-console
      console.error(error);
    }
  };

  /**
   * @private
   *
   * To be called when a message has arrived in this Paho.MQTT.client
   *
   * The idea here is that when the server sends a CLSP message, whether a
   * moof, moov, or something else, that data needs to be sent to the appropriate
   * player (client).  So when this router gets that chunk of data, it sends it
   * back to the Conduit with the clientId, and the Conduit is then responsible
   * for passing it to the appropriate player.
   *
   * @see - https://www.eclipse.org/paho/files/jsdoc/Paho.MQTT.Client.html
   *
   * @param {Paho.MQTT.Message} clspMessage
   *   The incoming message
   *
   * @returns {void}
   */
  Router.prototype._onMessageArrived = function (clspMessage) {
    this.logger.debug('Received CLSP message...');

    try {
      var payloadString = '';

      try {
        payloadString = clspMessage.payloadString;
      }
      catch (error) {
        // I have no idea what is going on here, but every single time we do the
        // assignment above, an error is thrown.  When I console.log(payloadString)
        // it appears to be an empty string.  However, if that assignment is not
        // done, no video gets displayed!!
        // There should be some way to only use the payloadBytes here...
      }

      this._sendToParentWindow({
        event: Router.events.DATA_RECEIVED,
        destinationName: clspMessage.destinationName,
        payloadString: payloadString, // @todo - why is this necessary when it doesn't exist?
        payloadBytes: clspMessage.payloadBytes || null,
      });
    }
    catch (error) {
      this.logger.error(error);
    }
  };

  /**
   * @private
   *
   * To be called when a message has been published by this CLSP client.
   *
   * @see - https://www.eclipse.org/paho/files/jsdoc/Paho.MQTT.Client.html
   *
   * @param {Paho.MQTT.Message} clspMessage
   *   The message that was delivered
   *
   * @returns {void}
   */
  Router.prototype._onMessageDelivered = function (clspMessage) {
    this.logger.debug('Delivered CLSP message...');

    if (clspMessage._onDelivered) {
      clspMessage._onDelivered();
    }
  };

  /**
   * @private
   *
   * Called when an clspClient connection has been lost
   *
   * @see - https://www.eclipse.org/paho/files/jsdoc/Paho.MQTT.Client.html
   *
   * @param {Object} response
   *   The response object
   *
   * @returns {void}
   */
  Router.prototype._onConnectionLost = function (response) {
    this.logger.debug('CLSP connection lost');

    var errorCode = parseInt(response.errorCode);

    if (errorCode === 0) {
      // The connection was "properly" terminated
      this._sendToParentWindow({
        event: Router.events.DISCONNECT_SUCCESS,
      });

      return;
    }

    this.logger.warn('CLSP connection lost improperly!');

    this._sendToParentWindow({
      event: Router.events.CONNECTION_LOST,
      reason: 'connection lost error code "' + errorCode + '" with message: ' + response.errorMessage,
    });
  };

  /**
   * @private
   *
   * Any time a "message" event occurs on the window, respond to it by
   * inspecting the message's "method" property and taking the appropriate
   * action.
   *
   * @param {Object} event
   *   The window message event
   *
   * @returns {void}
   */
  Router.prototype._windowMessageEventHandler = function (event) {
    var message = event.data;
    var method = message.method;

    this.logger.debug('Handling incoming window message for "' + method + '"...');

    try {
      switch (method) {
        case window.conduitCommands.SUBSCRIBE: {
          this._subscribe(message.topic);
          break;
        }
        case window.conduitCommands.UNSUBSCRIBE: {
          this._unsubscribe(message.topic);
          break;
        }
        case window.conduitCommands.PUBLISH: {
          var payload = null;

          try {
            payload = JSON.stringify(message.data);
          }
          catch (error) {
            this.logger.error('ERROR: Unable to handle the "publish" window message event!');
            this.logger.error('json stringify error: ' + message.data);

            // @todo - should we throw here?
            // throw error;
            return;
          }

          this._publish(
            message.publishId, message.topic, payload,
          );
          break;
        }
        case window.conduitCommands.CONNECT: {
          this.connect();
          break;
        }
        case window.conduitCommands.DISCONNECT: {
          this.disconnect();
          break;
        }
        case window.conduitCommands.SEND: {
          this._publish(
            message.publishId, message.topic, message.byteArray,
          );
          break;
        }
        default: {
          this.logger.error('unknown message method: ' + method);
        }
      }
    }
    catch (error) {
      this.logger.error(error);

      this._sendToParentWindow({
        event: Router.events.WINDOW_MESSAGE_FAIL,
        reason: 'window message event failure',
      });
    }
  };

  /**
   * @private
   *
   * Success handler for the CLSP client "connect".  Registers the window
   * message event handler, and notifies the parent window that this client is
   * "ready".
   *
   * @todo - track the "connected" status to prevent multiple window message
   * event handlers from being attached
   *
   * @see - https://www.eclipse.org/paho/files/jsdoc/Paho.MQTT.Client.html
   *
   * @param {Object} response
   *   The response object
   *
   * @returns {void}
   */
  Router.prototype._connect_onSuccess = function (response) {
    this.logger.info('Successfully established CLSP connection');

    this._sendToParentWindow({
      event: Router.events.CONNECT_SUCCESS,
    });
  };

  /**
   * @private
   *
   * Failure handler for CLSP client "connect".  Sends a "fail" message to the
   * parent window
   *
   * @see - https://www.eclipse.org/paho/files/jsdoc/Paho.MQTT.Client.html
   *
   * @param {Object} response
   *   The response object
   *
   * @returns {void}
   */
  Router.prototype._connect_onFailure = function (response) {
    this.logger.info('CLSP Connection Failure!');

    this._sendToParentWindow({
      event: Router.events.CONNECT_FAILURE,
      reason: 'Connection Failed - Error code ' + parseInt(response.errorCode) + ': ' + response.errorMessage,
    });
  };

  /**
   * @private
   *
   * Success handler for CLSP client "subscribe".
   *
   * @see - https://www.eclipse.org/paho/files/jsdoc/Paho.MQTT.Client.html
   *
   * @param {String} topic
   *   The topic that was successfully subscribed to
   * @param {Object} response
   *   The response object
   *
   * @returns {void}
   */
  Router.prototype._subscribe_onSuccess = function (topic, response) {
    this.logger.debug('Successfully subscribed to topic "' + topic + '"');
    // @todo
  };

  /**
   * @private
   *
   * Failure handler for CLSP "subscribe".  Sends a "fail" message to the parent
   * window
   *
   * @see - https://www.eclipse.org/paho/files/jsdoc/Paho.MQTT.Client.html
   *
   * @param {String} topic
   *   The topic that was attempted to be subscribed to
   * @param {Object} response
   *   The response object
   *
   * @returns {void}
   */
  Router.prototype._subscribe_onFailure = function (topic, response) {
    this.logger.error('Failed to subscribe to topic "' + topic + '"');

    this._sendToParentWindow({
      event: Router.events.SUBSCRIBE_FAILURE,
      reason: 'Subscribe Failed - Error code ' + parseInt(response.errorCode) + ': ' + response.errorMessage,
    });
  };

  /**
   * @private
   *
   * Start receiving messages for the given topic.
   *
   * @see - https://www.eclipse.org/paho/files/jsdoc/Paho.MQTT.Client.html
   *
   * @param {String} topic
   *   The topic to subscribe to
   *
   * @returns {void}
   */
  Router.prototype._subscribe = function (topic) {
    this.logger.debug('Subscribing to topic "' + topic + '"');

    if (!topic) {
      throw new Error('topic is a required argument when subscribing');
    }

    this.clspClient.subscribe(topic, {
      onSuccess: this._subscribe_onSuccess.bind(this, topic),
      onFailure: this._subscribe_onFailure.bind(this, topic),
    });
  };

  /**
   * @private
   *
   * Success handler for "unsubscribe".
   *
   * @see - https://www.eclipse.org/paho/files/jsdoc/Paho.MQTT.Client.html
   *
   * @param {String} topic
   *   The topic that was successfully unsubscribed from
   * @param {Object} response
   *   The response object
   *
   * @returns {void}
   */
  Router.prototype._unsubscribe_onSuccess = function (topic, response) {
    this.logger.debug('Successfully unsubscribed from topic "' + topic + '"');
    // @todo
  };

  /**
   * @private
   *
   * Failure handler for "unsubscribe".  Sends a "fail" message to the parent
   * window
   *
   * @see - https://www.eclipse.org/paho/files/jsdoc/Paho.MQTT.Client.html
   *
   * @param {String} topic
   *   The topic that was successfully subscribed to
   * @param {Object} response
   *   The response object
   *
   * @returns {void}
   */
  Router.prototype._unsubscribe_onFailure = function (topic, response) {
    this.logger.debug('Failed to unsubscribe from topic "' + topic + '"');

    this._sendToParentWindow({
      event: Router.events.UNSUBSCRIBE_FAILURE,
      reason: 'Unsubscribe Failed - Error code ' + parseInt(response.errorCode) + ': ' + response.errorMessage,
    });
  };

  /**
   * @private
   *
   * Stop receiving messages for the given topic
   *
   * @see - https://www.eclipse.org/paho/files/jsdoc/Paho.MQTT.Client.html
   *
   * @param {String} topic
   *   The topic to unsubscribe from
   *
   * @returns {void}
   */
  Router.prototype._unsubscribe = function (topic) {
    this.logger.debug('Unsubscribing from topic "' + topic + '"');

    if (!topic) {
      throw new Error('topic is a required argument when unsubscribing');
    }

    this.clspClient.unsubscribe(topic, {
      onSuccess: this._unsubscribe_onSuccess.bind(this, topic),
      onFailure: this._unsubscribe_onFailure.bind(this, topic),
    });
  };

  /**
   * @private
   *
   * Publish a message to the clients that are listening for the given topic
   *
   * @see - https://www.eclipse.org/paho/files/jsdoc/Paho.MQTT.Message.html
   *
   * @param {String|ArrayBuffer} payload
   *   The message data to be sent
   * @param {String} topic
   *   The topic to publish to
   *
   * @returns {void}
   */
  Router.prototype._publish = function (
    publishId, topic, payload,
  ) {
    this.logger.debug('Publishing to topic "' + topic + '"');

    if (!payload) {
      throw new Error('payload is a required argument when publishing');
    }

    if (!topic) {
      throw new Error('topic is a required argument when publishing');
    }

    var self = this;

    var clspMessage = new Paho.MQTT.Message(payload);

    clspMessage.destinationName = topic;

    // I tried setting the quality of service to 2, which has the highest level
    // of reliability, but it seems that Paho doesn't clean up after itself
    // or have sane (or any) timeouts or something.  When this is set to 2, over
    // time, local storage will fill up, and all CLSP will cease to work.  Not
    // to mention the fact that local storage refuses additional writes.
    // clspMessage.qos = 2; // qos: exactly once

    var publishTimeout = setTimeout(function () {
      clearTimeout(publishTimeout);
      publishTimeout = null;

      self._sendToParentWindow({
        event: Router.events.PUBLISH_FAIL,
        publishId: publishId,
        reason: 'publish operation for "' + topic + '" timed out after ' + self.PUBLISH_TIMEOUT + ' seconds.',
      });
    }, this.PUBLISH_TIMEOUT * 1000);

    // custom property
    clspMessage._onDelivered = function (clspMessage) {
      if (!publishTimeout) {
        // the publish operation timed out and has already been rejected
        return;
      }

      clearTimeout(publishTimeout);
      publishTimeout = null;

      self._sendToParentWindow({
        event: Router.events.PUBLISH_SUCCESS,
        publishId: publishId,
        topic: topic,
      });
    };

    // @todo - this can fail if the client is not connected
    this.clspClient.publish(clspMessage);
  };

  /**
   * Connect this Messaging client to its server
   *
   * @see - https://www.eclipse.org/paho/files/jsdoc/Paho.MQTT.Message.html
   * @see - https://www.eclipse.org/paho/files/jsdoc/Paho.MQTT.Client.html
   *
   * @returns {void}
   */
  Router.prototype.connect = function () {
    this.logger.info('Connecting...');

    // last will message sent on disconnect
    var willMessage = new Paho.MQTT.Message(JSON.stringify({
      clientId: this.clientId,
    }));

    willMessage.destinationName = 'iov/clientDisconnect';

    var connectionOptions = {
      timeout: this.CONNECTION_TIMEOUT,
      keepAliveInterval: this.KEEP_ALIVE_INTERVAL,
      onSuccess: this._connect_onSuccess.bind(this),
      onFailure: this._connect_onFailure.bind(this),
      willMessage: willMessage,
      // @todo - should `reconnect` be set here?
    };

    if (this.useSSL === true) {
      connectionOptions.useSSL = true;
    }

    try {
      this.clspClient.connect(connectionOptions);
      this.logger.info('Connected');
    }
    catch (error) {
      if (error.message.startsWith(PAHO_ERROR_CODE_ALREADY_CONNECTED)) {
        // if we're already connected, there's no error to report
        return;
      }

      this.logger.error('Failed to connect', error);

      this._sendToParentWindow({
        event: Router.events.CONNECT_FAILURE,
        reason: 'General error when trying to connect.',
      });
    }
  };

  /**
   * Disconnect the messaging client from the server.  To get confirmation of
   * the disconnection, the caller must listen for the following event:
   * `Router.events.CONNECTION_LOST`
   *
   * @see - https://www.eclipse.org/paho/files/jsdoc/Paho.MQTT.Client.html
   *
   * @returns {void}
   */
  Router.prototype.disconnect = function () {
    this.logger.info('Disconnecting');

    try {
      this.clspClient.disconnect();
    }
    catch (error) {
      if (error.message.startsWith(PAHO_ERROR_CODE_NOT_CONNECTED)) {
        // if we're not connected when we attempted to disconnect, there's no
        // error to report
        return;
      }

      this.logger.error('ERROR while disconnecting');
      this.logger.error(error);

      throw error;
    }
  };

  /**
   * Destroy the Router and free all resources
   *
   * @returns {void}
   */
  Router.prototype.destroy = function () {
    this.logger.info('Destroying...');

    if (this.destroyed) {
      return;
    }

    this.destroyed = true;

    window.removeEventListener('message', this.boundWindowMessageEventHandler);

    this.boundWindowMessageEventHandler = null;

    this.disconnect();

    // @todo - is there a way to "destroy" the client?  I didn't see anything
    // in the documentation
    this.clspClient = null;
  };

  // This is a series of "controllers" to keep the conduit's iframe as dumb as
  // possible.  Call each of these in the corresponding attribute on the
  // "body" tag.
  return {
    onload: function () {
      try {
        window.router = Router.factory(
          window.clspRouterConfig.logId,
          window.clspRouterConfig.clientId,
          window.clspRouterConfig.host,
          window.clspRouterConfig.port,
          window.clspRouterConfig.useSSL,
          {
            CONNECTION_TIMEOUT: window.clspRouterConfig.CONNECTION_TIMEOUT,
            KEEP_ALIVE_INTERVAL: window.clspRouterConfig.KEEP_ALIVE_INTERVAL,
            PUBLISH_TIMEOUT: window.clspRouterConfig.PUBLISH_TIMEOUT,
          }
        );

        window.router._sendToParentWindow({
          event: Router.events.CREATED,
        });

        window.router.logger.info('onload - Router created');
      }
      catch (error) {
        // eslint-disable-next-line no-console
        console.error(error);

        window.parent.postMessage({
          event: Router.events.CREATE_FAILURE,
          reason: error,
        }, '*');
      }
    },
    onunload: function () {
      if (!window.router) {
        return;
      }

      try {
        window.router.logger.info('onunload - Router being destroyed in onunload...');
        window.router.destroy();
        window.router.logger.info('onunload - Router destroyed in onunload');
      }
      catch (error) {
        if (error.message.startsWith(PAHO_ERROR_CODE_NOT_CONNECTED)) {
          // if there wasn't a connection, do not show an error
          return;
        }

        window.router.logger.error(error);
      }
    },
    Router: Router,
  };
}
