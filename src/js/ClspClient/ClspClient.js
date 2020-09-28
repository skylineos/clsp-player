import Destroyable from '../utils/Destroyable';
import Conduit from './Conduit/Conduit';
import ConduitCollection from './Conduit/ConduitCollection';
import StreamConfiguration from '../iov/StreamConfiguration';

export default class ClspClient extends Destroyable {
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
    super(logId);

    this._constructorArgumentsBouncer(
      clientId,
      streamConfiguration,
      containerElement,
    );

    this.clientId = clientId;
    this.streamConfiguration = streamConfiguration;
    this.containerElement = containerElement;

    this.conduit = ConduitCollection.asSingleton().create(
      this.logId,
      this.clientId,
      this.streamConfiguration,
      this.containerElement,
    );
  }

  _constructorArgumentsBouncer (
    clientId,
    streamConfiguration,
    containerElement,
  ) {
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

  async _destroy () {
    await ConduitCollection.asSingleton().remove(this.clientId);

    this.conduit = null;
    this.streamConfiguration = null;
    this.containerElement = null;

    await super._destroy();
  }
}
