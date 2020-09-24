import Conduit from './Conduit';
import Paho from './Paho';
import utils from '../utils/utils';

import Logger from '../utils/Logger';

let collection;

export default class ConduitCollection {
  static asSingleton () {
    if (!collection) {
      collection = ConduitCollection.factory();
    }

    return collection;
  }

  static factory () {
    return new ConduitCollection();
  }

  /**
   * @private
   */
  constructor () {
    this.logger = Logger().factory('ConduitCollection');
    this.logger.debug('Constructing...');

    this.totalConduitCount = 0;

    this.conduits = {};
    this.deletedConduitClientIds = [];

    this.destroyed = false;
    this.isDestroyComplete = false;

    Paho.register();

    window.addEventListener('message', this._routeWindowMessageToTargetConduit);
  }

  /**
   * @private
   *
   * The listener for the "message" event on the window.  Its job is to
   * identify messages that are intended for a specific Conduit / stream and
   * route them to the correct one.  The most common example of this is when a
   * Router receives a moof/segment from a server, and posts a message to the
   * window.  This listener will route that moof/segment to the proper Conduit.
   *
   * @param {Object} event
   *   The window message event
   *
   * @returns {void}
   */
  _routeWindowMessageToTargetConduit = (event) => {
    const clientId = event.data.clientId;

    if (!clientId) {
      // A window message was received that is not related to CLSP
      return;
    }

    this.logger.debug(`Received Window Message event for ${clientId}`);

    const eventType = event.data.event;

    if (!this.has(clientId)) {
      // When the CLSP connection is interupted due to a listener being removed,
      // a fail event is always sent.  It is not necessary to log this as an error
      // in the console, because it is not an error.
      // @todo - the fail event no longer exists (or is it from Paho or
      // something?) - what is the name of the new corresponding event?
      if (eventType === 'fail') {
        return;
      }

      // @todo - use this to detect an externally destroyed iframe
      // if (eventType === 'iframe-onunload') {
      //   console.log(event);
      //   return;
      // }

      // Don't show an error for iovs that have been deleted
      if (this.deletedConduitClientIds.includes(clientId)) {
        this.logger.warn(`Received a message for deleted conduit ${clientId}`);
        return;
      }

      throw new Error(`Unable to route message of type ${eventType} for Conduit with clientId "${clientId}".  A Conduit with that clientId does not exist.`);
    }

    // Pass the Window Message event to the proper Conduit instance.  All we've
    // done at this point is pass the event to the Conduit that it was intended
    // for.  At this point, the Conduit is responsible for taking the necessary
    // action based on the eventType
    this.get(clientId).onRouterEvent(eventType, event);
  };

  /**
   * Create a Conduit for a specific stream, and add it to this collection.
   *
   * @returns {Conduit}
   */
  async create (
    logId,
    clientId,
    streamConfiguration,
    containerElement,
  ) {
    this.logger.debug(`creating a conduit with logId ${logId} and clientId ${clientId}`);

    const conduit = Conduit.factory(
      logId,
      clientId,
      streamConfiguration,
      containerElement,
    );

    this._add(conduit);

    this.totalConduitCount++;

    return conduit;
  }

  /**
   * Add a Conduit instance to this collection.
   *
   * @private
   *
   * @param {Conduit} conduit
   *   The conduit instance to add
   *
   * @returns {this}
   */
  _add (conduit) {
    const clientId = conduit.clientId;

    this.conduits[clientId] = conduit;

    return this;
  }

  /**
   * Determine whether or not a Conduit with the passed clientId exists in this
   * collection.
   *
   * @param {String} clientId
   *   The clientId of the conduit to find
   *
   * @returns {Boolean}
   *   True if the conduit with the given clientId exists
   *   False if the conduit with the given clientId does not exist
   */
  has (clientId) {
    return Object.prototype.hasOwnProperty.call(this.conduits, clientId);
  }

  /**
   * Get a Conduit with the passed clientId from this collection.
   *
   * @param {String} clientId
   *   The clientId of the conduit instance to get
   *
   * @returns {Conduit|undefined}
   *   If a Conduit with this clientId doest not exist, undefined is returned.
   */
  get (clientId) {
    return this.conduits[clientId];
  }

  /**
   * Remove a conduit instance from this collection and destroy it.
   *
   * @param {String} clientId
   *   The clientId of the conduit to remove and destroy
   *
   * @returns {this}
   */
  async remove (clientId) {
    const conduit = this.get(clientId);

    if (!conduit) {
      return;
    }

    await conduit.destroy();

    delete this.conduits[clientId];

    this.deletedConduitClientIds.push(clientId);

    return this;
  }

  /**
   * Destroy this collection and destroy all conduit instances in it.
   *
   * @returns {void}
   */
  async destroy () {
    if (this.destroyed) {
      return;
    }

    this.destroyed = true;

    window.removeEventListener('message', this._routeWindowMessageToTargetConduit);

    for (const clientId in this.conduits) {
      try {
        await this.remove(clientId);
      }
      catch (error) {
        this.logger.error(`Error while removing conduit ${clientId} while destroying`);
        this.logger.error(error);
      }
    }

    this.conduits = null;
    this.deletedConduitClientIds = null;

    this.isDestroyComplete = true;
    this.logger.info('destroy complete');
  }
}
