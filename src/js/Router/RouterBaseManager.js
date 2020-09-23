/**
 * The RouterBaseManager is a base class that is meant to provide some things
 * (e.g. state, events, etc) that are common to all Router Manager classes.
 */

import EventEmitter from 'eventemitter3';

import Logger from '../utils/Logger';

import Router from './Router';

const {
  commands,
  events,
} = Router();

export default class RouterBaseManager {
  /**
   * The exported Router function.
   *
   * Suggested use in the iframe:
   *
   * `window.Router = ${RouterBaseManager.Router.toString()}(window.parent.Paho);`
   *
   * @see - src/js/conduit/Conduit.js#_generateIframe
   */
  static Router = Router;

  /**
   * @static
   *
   * The commands that can be issued to the Router via Window Messages
   */
  static routerCommands = commands;

  /**
   * @static
   *
   * The events that the Router will broadcast via Window Messages
   */
  static routerEvents = events;

  /**
   * @private
   *
   * @param {String} logId
   *   a string that identifies this router in log messages
   * @param {String} clientId
   *   the guid to be used to construct the topic
   */
  constructor (
    logId,
    clientId,
  ) {
    if (!logId) {
      throw new Error('logId is required to construct a new RouterStatsManager instance.');
    }

    if (!clientId) {
      throw new Error('clientId is required to construct a new RouterStatsManager instance.');
    }

    this.logId = logId;
    this.clientId = clientId;

    this.logger = Logger().factory(`${this.constructor.name} ${this.logId}`, 'color: magenta;');
    this.events = new EventEmitter();

    // state flags
    this.isDestroyed = false;
    this.isDestroyComplete = false;
  }

  /**
   * Most of the Window Message handling is done via the Conduit Collection
   * class.  However, there are currently some use cases for a Router Manager
   * to add its own Window Message listener.  Since all generic window messages
   * (of which there will be many, e.g. one for every video frame for every
   * Router instance page-wide!) will trigger the Router Manager Window Message
   * listeners to fire every time, those listeners will need to filter out all
   * messages that they don't care about.  Use this helper method can to
   * validate that the event type (if it exists) is one that the caller cares
   * about.
   *
   * @param {object} event
   *   The event from the Router via Window Message
   *   @see - https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage
   *   @see - src/js/conduit/ConduitCollection.js#_onWindowMessage
   *
   * @param {Array} validTypes
   *   An array of event types (event.data.event as defined by the Router) that
   *   are considered valid by the caller
   *
   * @returns {boolean}
   *   - true if the event type matches one of the validTypes
   *   - false if the event was for a different Router/Conduit or does not match
   *     one of the validTypes
   */
  _isValidEvent (event, validTypes) {
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

    // Filter out all other window messages
    if (!validTypes.includes(eventType)) {
      return false;
    }

    return true;
  }

  /**
   * @private
   *
   * Call this method at the end of the class's `destroy` method.
   *
   * @returns {void}
   */
  _destroy () {
    this.events.removeAllListeners();
    this.events = null;

    this.isDestroyComplete = true;

    this.logger.info('destroy complete');
  }
}
