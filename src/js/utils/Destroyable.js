/**
 * A base class that supports destruction and logging.
 */

import Logger from './Logger';
import utils from './utils';

export default class Destroyable {
  logId = null;
  isDestroyed = false;
  isDestroyComplete = false;

  constructor (options) {
    if (!options) {
      throw new Error('Logging options are required');
    }

    if (typeof options === 'object') {
      this.logId = options.id;
      this.logColor = options.color;
    }

    if (typeof options === 'string') {
      this.logId = options;
    }

    if (!this.logId) {
      throw new Error(`\`logId\` is required to construct a new ${this.constructor.name}`);
    }

    if (!this.logColor) {
      this.logColor = 'black';
    }

    this.logger = Logger(undefined, utils.isPlayerLoggingDisabled()).factory(
      `${this.constructor.name} ${this.logId}`,
      `color: ${this.logColor};`,
    );
    this.logger.info(`Constructing new ${this.constructor.name} instance`);
  }

  /**
   * Put your class's destroy logic in this method.
   */
  async _reset () {}

  async reset () {
    this.logger.info('Resetting...');

    this.isDestroyed = false;
    this.isDestroyComplete = false;

    await this._reset();

    this.logger.info('Reset complete');
  }

  /**
   * Put your class's destroy logic in this method.
   */
  async _destroy () {}

  /**
   * @async
   *
   * This method will call the `_destroy` method of the instance's class
   *
   * @returns {void}
   */
  async destroy () {
    if (this.isDestroyed) {
      this.logger.info('Already destroyed');
      return;
    }

    this.isDestroyed = true;

    this.logger.info('Destroying...');

    await this._destroy();

    this.isDestroyComplete = true;

    this.logger.info('Destroy complete');
  }
}
