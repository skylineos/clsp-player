/**
 * The RouterBaseManager is a base class that is meant to provide some things
 * (e.g. state, events, etc) that are common to all Router Manager classes.
 */

import EventEmitter from '../../utils/EventEmitter';

import Router from './Router';

const {
  commands,
  events,
} = Router();

export default class RouterBaseManager extends EventEmitter {
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
    super(logId);

    if (!logId) {
      throw new Error('logId is required to construct a new RouterStatsManager instance.');
    }

    if (!clientId) {
      throw new Error('clientId is required to construct a new RouterStatsManager instance.');
    }

    this.logId = logId;
    this.clientId = clientId;
  }
}
