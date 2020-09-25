import Iov from './Iov';
import Logger from '../utils/Logger';

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
export default class IovCollection {
  static asSingleton () {
    if (!collection) {
      collection = IovCollection.factory();
    }

    return collection;
  }

  static factory () {
    return new IovCollection();
  }

  /**
   * @private
   */
  constructor () {
    this.logger = Logger().factory('IovCollection');
    this.logger.debug('Constructing...');

    this.iovs = {};

    this.isDestroyed = false;
    this.isDestroyComplete = false;
  }

  /**
   * Create an Iov for a specific stream, and add it to this collection.
   *
   * @param {String} url
   *   The url to the clsp stream
   * @param {DOMNode} videoElementId
   *   The id of the video element that will serve as the video player in the
   *   DOM
   *
   * @returns {Iov}
   */
  async create (videoElementId) {
    const iov = Iov.factory(
      videoElementId,
      {
        id: (++totalIovCount).toString(),
      },
    );

    iov.events.on(Iov.events.IFRAME_DESTROYED_EXTERNALLY, () => {
      this.remove(iov.id);
    });

    this.add(iov);

    return iov;
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
    return Object.prototype.hasOwnProperty.call(this.iovs, id);
  }

  /**
   * Get an iov with the passed id from this collection.
   *
   * @param {String} id
   *   The id of the iov instance to get
   *
   * @returns {Iov|undefined}
   *   If an iov with this id doest not exist, undefined is returned.
   */
  get (id) {
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

    if (!iov) {
      return;
    }

    delete this.iovs[id];

    await iov.destroy();

    return this;
  }

  /**
   * Destroy this collection and destroy all iov instances in this collection.
   *
   * @returns {void}
   */
  async destroy () {
    if (this.isDestroyed) {
      return;
    }

    this.isDestroyed = true;

    for (const id in this.iovs) {
      try {
        await this.remove(id);
      }
      catch (error) {
        this.logger.error(`Error while removing IOV ${id} while destroying`);
        this.logger.error(error);
      }
    }

    this.iovs = null;

    this.isDestroyComplete = true;

    this.logger.info('destroy complete');
  }
}
