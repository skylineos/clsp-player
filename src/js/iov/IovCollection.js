import isNil from 'lodash/isNil';

import Iov from './Iov';
import Destroyable from '../utils/Destroyable';

// @todo - this could cause an overflow!
let totalIovCount = 0;
let collection;

/**
 * The Iov Collection is meant to be a singleton, and is meant to manage all
 * Iovs in a given browser window/document.  There are certain centralized
 * functions it is meant to perform, such as generating the guids that are
 * needed to establish a connection to a unique topic on the SFS, and to listen
 * to window messages and route the relevant messages to the appropriate Iov
 * instance.
 */
export default class IovCollection extends Destroyable {
  static asSingleton () {
    if (!collection) {
      collection = IovCollection.factory();
    }

    return collection;
  }

  /**
   * @private
   */
  static factory () {
    return new IovCollection();
  }

  /**
   * @private
   */
  constructor () {
    // @todo - right now, only a single collection (index 0) is supported
    super('0');

    this.iovs = {};
    this.pendingRemoval = {};
  }

  /**
   * Create an Iov for a specific stream, and add it to this collection.
   *
   * @param {String} url
   *   The url to the clsp stream
   *
   * @returns {Iov}
   */
  create (config = {}) {
    const id = totalIovCount;

    totalIovCount++;

    this.logger.info(`Creating Iov ${id}`);

    const iov = Iov.factory(
      `iov:${id}`,
      id,
      config,
    );

    this.logger.info(`Created Iov ${id}`);

    iov.on(Iov.events.IFRAME_DESTROYED_EXTERNALLY, async () => {
      iov.logger.info('IovCollection: iframe was destroyed, removing iov...');

      try {
        await this.remove(iov.id);
      }
      catch (error) {
        iov.logger.error('IovCollection: error while removing iov from collection!');
        iov.logger.error(error);
      }
    });

    this.add(iov);

    return iov;
  }

  async #retry (id) {
    const iov = this.get(id);

    // Don't retry a stream that has already been removed
    if (iov === null) {
      this.logger.info(`Attempted to retry Iov ${id} which has already been removed`);
      return;
    }

    const config = iov._config;

    const streamConfiguration = iov.streamConfiguration;

    try {
      await this.remove(id);
    }
    catch (error) {
      iov.logger.error('IovCollection: error while removing iov from collection, continuing anyway...');
      iov.logger.error(error);
    }

    const newIov = this.create(config);

    try {
      await newIov.changeSrc(streamConfiguration);
    }
    catch (error) {
      newIov.logger.error('IovCollection: Error on changeSrc while retrying');
      newIov.logger.error(error);
    }
  }

  /**
   * Add an Iov instance to this collection.  It can then be accessed by its id.
   *
   * @param {Iov} iov
   *   The iov instance to add
   *
   * @returns {this}
   */
  add (iov) {
    const id = iov.id;

    if (isNil(id)) {
      throw new Error('Tried to add Iov without id');
    }

    if (this.has(id)) {
      throw new Error('Cannot add an Iov with a previously-used id');
    }

    this.logger.info(`Adding Iov ${id}`);

    this.iovs[id] = iov;

    return this;
  }

  /**
   * Determine whether or not an iov with the passed id exists in this
   * collection.
   *
   * @param {String} id
   *   The id of the iov to find
   *
   * @returns {Boolean}
   *   True if the iov with the given id exists
   *   False if the iov with the given id does not exist
   */
  has (id) {
    if (isNil(id)) {
      return false;
    }

    if (this.pendingRemoval[id]) {
      return false;
    }

    return Object.prototype.hasOwnProperty.call(this.iovs, id);
  }

  /**
   * Get an iov with the passed id from this collection.
   *
   * @param {String} id
   *   The id of the iov instance to get
   *
   * @returns {Iov|null}
   *   If an iov with this id doest not exist, undefined is returned.
   */
  get (id) {
    if (!this.has(id)) {
      return null;
    }

    return this.iovs[id];
  }

  /**
   * Remove an iov instance from this collection and destroy it.
   *
   * @param {String} id
   *   The id of the iov to remove and destroy
   *
   * @returns {this}
   */
  async remove (id) {
    const iov = this.get(id);

    if (iov === null) {
      return;
    }

    try {
      this.pendingRemoval[id] = true;

      delete this.iovs[id];

      iov.logger.info('IovCollection - removing iov...');
      await iov.destroy();
    }
    catch (error) {
      this.logger.error(`Error destroying Iov ${id} while removing`);
      this.logger.error(error);
    }
    finally {
      delete this.pendingRemoval[id];
    }
  }

  /**
   * Destroy this collection and destroy all iov instances in this collection.
   *
   * @returns {void}
   */
  async _destroy () {
    for (const id in this.iovs) {
      try {
        await this.remove(id);
      }
      catch (error) {
        this.logger.error(`Error while removing IOV ${id} while destroying`);
        this.logger.error(error);
      }
    }

    // @todo - is it safe to dereference these?
    this.iovs = null;
    this.pendingRemoval = null;

    await super._destroy();
  }
}
