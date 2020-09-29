/**
 * A base class that is destroyable, supports logging, and events.
 */

import EventEmitter3 from 'eventemitter3';

import Destroyable from './Destroyable';

export default class EventEmitter extends Destroyable {
  static events = {};

  events = null;

  constructor (logOptions) {
    super(logOptions);

    this.events = new EventEmitter3();
  }

  /**
   * Register an event listener for this IovPlayer.
   *
   * @param {string} eventName
   *   A valid event name, as defined on the class's static `events` property
   * @param {function} handler
   *   A function that will be executed every time the instance emits the
   *   event defined by the `eventName` argument.
   *
   * @returns {this}
   */
  on (eventName, handler) {
    const eventNames = Object.values(this.constructor.events);

    if (!eventNames.includes(eventName)) {
      throw new Error(`Unable to register listener for unknown event "${eventName}"`);
    }

    if (!handler) {
      throw new Error(`Unable to register for event "${eventName}" without a handler`);
    }

    // @todo - should the caller have the ability to respond to this?
    if (this.isDestroyed) {
      this.logger.error(`Tried to register handler for event "${eventName}" while destroyed!`);
      return this;
    }

    this.events.on(eventName, handler);

    return this;
  }

  // @todo - should this be a private field?
  emit (eventName, data) {
    // @todo - should the caller have the ability to respond to this?
    if (this.isDestroyed) {
      this.logger.error(`Tried to emit "${eventName}" while destroyed!`);
      return;
    }

    this.events.emit(eventName, data);
  }

  async _reset () {
    this.events = new EventEmitter3();

    await super._reset();
  }

  async _destroy () {
    this.events.removeAllListeners();
    this.events = null;

    await super._destroy();
  }
}
