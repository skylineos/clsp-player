import EventEmitter from 'eventemitter3';

import Logger from '../utils/Logger';

import Router from './Router';

const {
  commands,
  events,
} = Router();

export default class RouterBaseManager {
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

  _destroy () {
    this.events.removeAllListeners();
    this.events = null;

    this.isDestroyComplete = true;
  }
}
