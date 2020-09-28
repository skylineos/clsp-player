import RouterBaseManager from './RouterBaseManager';

const DEFAULT_PUBLISH_STATS_INTERVAL = 5;

export default class RouterStatsManager extends RouterBaseManager {
  /**
   * @static
   *
   * The events that this RouterStatsManager will emit.
   */
  static events = {
    PUBLISH_FAILURE: 'publish-failed',
  }

  /**
   * @static
   *
   * The Router events that this Router Manager is responsible for
   */
  static routerEvents = {};

  static factory (
    logId,
    clientId,
    routerTransactionManager,
  ) {
    return new RouterStatsManager(
      logId,
      clientId,
      routerTransactionManager,
    );
  }

  constructor (
    logId,
    clientId,
    routerTransactionManager,
  ) {
    super(
      logId,
      clientId,
    );

    if (!routerTransactionManager) {
      throw new Error('A RouterTransactionManager is required to instantiate a RouterStatsManager');
    }

    this.routerTransactionManager = routerTransactionManager;

    this.statsMsg = {
      byteCount: 0,
      inkbps: 0,
      host: document.location.host,
      clientId: this.clientId,
    };

    this.publishInterval = null;
    this.isStopped = true;

    // configurable state
    this.PUBLISH_STATS_INTERVAL = DEFAULT_PUBLISH_STATS_INTERVAL;
  }

  /**
   * Update the stats byte count with the byteArray / segment.  To be called
   * when the segment is appended to the MSE SourceBuffer.
   *
   * @param {*} byteArray
   */
  updateByteCount (byteArray) {
    if (this.isDestroyed) {
      this.logger.info('Tried to updateByteCount while destroyed');
      return;
    }

    this.logger.silly('Updating bytecount...');

    this.statsMsg.byteCount += byteArray.length;
  }

  /**
   * We have to send stats to the server at least once per minute, or else the
   * CLSP service will stop streaming to this Router.
   *
   * @returns {void}
   */
  start () {
    if (this.isDestroyed) {
      this.logger.info('Tried to start while destroyed');
      return;
    }

    if (this.publishInterval) {
      this.stop();
    }

    this.logger.info('Starting stats publishing...');

    this.publishInterval = setInterval(() => {
      this._publishStats();
    }, this.PUBLISH_STATS_INTERVAL * 1000);

    this.isStopped = false;
  }

  /**
   * Stop publishing stats to the server.  Do this When we no longer want to
   * stream to the Router.
   *
   * @returns {void}
   */
  stop () {
    if (this.isDestroyComplete) {
      this.logger.info('Tried to stop while destroyed');
      return;
    }

    this.logger.info('Stopping stats publishing...');

    if (this.publishInterval) {
      clearInterval(this.publishInterval);
      this.publishInterval = null;
    }

    this.isStopped = true;
  }

  /**
   * @private
   *
   * @async
   *
   * Send stats to the server.
   *
   * @returns {void}
   */
  async _publishStats () {
    if (this.isDestroyed) {
      this.logger.info('Tried to _publishStats while destroyed');
      return;
    }

    this.statsMsg.inkbps = (this.statsMsg.byteCount * 8) / 30000.0;
    this.statsMsg.byteCount = 0;

    try {
      this.logger.info('About to send stats message...');

      await this.routerTransactionManager.publish('iov/stats', this.statsMsg);

      this.logger.debug('iov status', this.statsMsg);
    }
    catch (error) {
      // This prevents the errors from displaying when stopped, e.g. after the
      // iframe has been destroyed
      if (!this.isStopped) {
        this.logger.error('Error while publishing stats!');
        this.logger.error(error);

        this.emit(RouterStatsManager.events.PUBLISH_FAILURE, { error });

        // If any publish operation fails, do not continue to try to send stats
        // messages.  It is up to the caller how to respond.
        this.stop();
      }
    }
  }

  async _destroy () {
    this.stop();

    this.statsMsg = null;
    this.routerTransactionManager = null;

    await super._destroy();
  }
}
