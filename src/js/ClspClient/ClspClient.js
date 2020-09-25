import Logger from '../utils/Logger';

import Conduit from './Conduit/Conduit';
import ConduitCollection from './Conduit/ConduitCollection';
import StreamConfiguration from '../iov/StreamConfiguration';

export default class ClspClient {
  static events = Conduit.events;

  /**
   * Create a new CLSP Client
   *
   * @param {String} logId
   *   a string that identifies this router in log messages
   * @param {String} clientId
   *   the guid to be used to construct the topic
   * @param {StreamConfiguration} streamConfiguration
   *   The stream configuration to pull from the CLSP server / SFS
   * @param {Element} containerElement
   *   The container of the video element and where the Conduit's iframe will be
   *   inserted
   */
  static factory (
    logId,
    clientId,
    streamConfiguration,
    containerElement,
  ) {
    return new ClspClient(
      logId,
      clientId,
      streamConfiguration,
      containerElement,
    );
  }

  /**
   * @private
   *
   * Create a new CLSP Client
   *
   * @param {String} logId
   *   a string that identifies this router in log messages
   * @param {String} clientId
   *   the guid to be used to construct the topic
   * @param {StreamConfiguration} streamConfiguration
   *   The stream configuration to pull from the CLSP server / SFS
   * @param {Element} containerElement
   *   The container of the video element and where the Conduit's iframe will be
   *   inserted
   */
  constructor (
    logId,
    clientId,
    streamConfiguration,
    containerElement,
  ) {
    this._constructorArgumentsBouncer(
      logId,
      clientId,
      streamConfiguration,
      containerElement,
    );

    this.logId = logId;
    this.clientId = clientId;
    this.streamConfiguration = streamConfiguration;
    this.containerElement = containerElement;

    this.logger = Logger().factory(`Conduit ${this.logId}`, 'color: orange;');
    this.logger.debug('Constructing...');

    this.conduit = ConduitCollection.asSingleton().create(
      this.logId,
      this.clientId,
      this.streamConfiguration,
      this.containerElement,
    );

    this.isDestroyed = false;
    this.isDestroyComplete = false;
  }

  _constructorArgumentsBouncer (
    logId,
    clientId,
    streamConfiguration,
    containerElement,
  ) {
    if (!logId) {
      throw new Error('logId is required to construct a new Conduit instance.');
    }

    if (!clientId) {
      throw new Error('clientId is required to construct a new Conduit instance.');
    }

    if (!StreamConfiguration.isStreamConfiguration(streamConfiguration)) {
      throw new Error('invalid streamConfiguration passed to Conduit constructor');
    }

    if (!containerElement) {
      throw new Error('containerElement is required to construct a new Conduit instance');
    }
  }

  async initialize () {
    if (this.isDestroyed) {
      throw new Error('Tried to initialize while destroyed');
    }

    await this.conduit.initialize();
  }

  async destroy () {
    if (this.isDestroyed) {
      return;
    }

    this.isDestroyed = true;

    await ConduitCollection.asSingleton().remove(this.clientId);

    this.conduit = null;
    this.streamConfiguration = null;
    this.containerElement = null;

    this.isDestroyComplete = false;

    this.logger.info('destroy complete');
  }
}
