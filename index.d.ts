// Type definitions for CLSP Player
// Project: https://github.com/skylineos/clsp-player

import StreamConfiguration from "./src/js/iov/StreamConfiguration";

// @see - https://www.typescriptlang.org/docs/handbook/declaration-files/templates/module-d-ts.html
// @see - https://github.com/DefinitelyTyped/DefinitelyTyped/blob/master/types/react/index.d.ts

export as namespace CLSP;

interface StreamConfigurationTokenConfig {
  b64HashAccessUrl: string;
  hash: string;
}

interface StreamConfigurationConfig {
  streamName: string;
  host: string;
  port: number;
  useSSL: boolean;
  tokenConfig: StreamConfigurationTokenConfig;
}

/**
 * Defined in /src/js/iov/StreamConfiguration.js
 */
declare class StreamConfiguration {
  static factory(streamName: string, host: string, port: number, useSSL: boolean, tokenConfig: StreamConfigurationTokenConfig): StreamConfiguration;
  static fromObject(config): StreamConfiguration;
  static isStreamConfiguration(target: any): boolean;
  static generateConfigFromUrl(url: string): StreamConfigurationConfig;
  static fromUrl(url): StreamConfiguration;
  protocol: string;
  url: string;
  clone(streamConfiguration: StreamConfiguration): StreamConfiguration;
  toObject(): StreamConfigurationConfig;
  destroy();
}

interface IovChangeSrcReturnValue {
  id: string;
  firstFrameReceivedPromise: Promise<void>;
}

/**
 * Internet of Video client. This module uses the MediaSource API to
 * deliver video content streamed through CLSP from distributed sources.
 */
export class Iov {
  on(eventName: string, handler: Function);
  onConnectionChange();
  onVisibilityChange():Promise<void>;
  generatePlayerLogId(): string;
  showNextStream();
  cancelChangeSrc();
  changeSrc(url: string | StreamConfiguration, showOnFirstFrame?: boolean): Promise<IovChangeSrcReturnValue>;
  clone(streamConfiguration?: StreamConfiguration): Iov;
  onPlayerError(error);
  play():Promise<void>;
  stop():Promise<void>;
  restart():Promise<void>;
  enterFullscreen();
  exitFullscreen();
  toggleFullscreen();
  /**
   * Dereference the necessary properties, clear any intervals and timeouts, and
   * remove any listeners.  Will also destroy the player.
   */
  destroy(): Promise<void>;
}

/**
 * The Iov Collection is meant to be a singleton, and is meant to manage all
 * Iovs in a given browser window/document.  There are certain centralized
 * functions it is meant to perform, such as generating the guids that are
 * needed to establish a connection to a unique topic on the SFS, and to listen
 * to window messages and route the relevant messages to the appropriate Iov
 * instance.
 */
export class IovCollection {
  static asSingleton():IovCollection;
  /**
   * Create an Iov for a specific stream, and add it to this collection.
   */
  create(videoElementId: string): Promise<Iov>;
  /**
   * Add an Iov instance to this collection.  It can then be accessed by its id.
   */
  add(iov: Iov): this;
  /**
   * Determine whether or not an iov with the passed id exists in this
   * collection.
   */
  has(id: string): boolean;
  /**
   * Get an iov with the passed id from this collection.
   */
  get(id: string): Iov | undefined;
  /**
   * Remove an iov instance from this collection and destroy it.
   */
  remove(id: string): this;
  /**
   * Destroy this collection and destroy all iov instances in this collection.
   */
  destroy();
}

export class TourController {
  static factory(IovCollection: IovCollection, videoElementId: string, options?: {onLoad?: Function, onShown?: Function}): TourController;
  addUrls(urls: Array<string>);
  next(playImmediately?: boolean, resetTimer?: boolean): Promise<void>;
  previous(): Promise<void>;
  resume(force?: boolean, wait?: boolean): Promise<void>;
  start(): Promise<void>;
  pause();
  stop();
  reset(): Promise<void>;
  fullscreen();
  destroy();
}

interface PageVisibilityApiPropertyNames {
  hiddenStateName: string;
  visibilityChangeEventName: string;
}

export class utils {
  static name: string;
  static version: string;
  static MINIMUM_CHROME_VERSION: number;
  static SUPPORTED_MIME_TYPE: string;
  static DEFAULT_STREAM_TIMEOUT: number;
  static supported(): boolean;
  static isSupportedMimeType(): boolean;
  static windowStateNames: PageVisibilityApiPropertyNames;
  static getDefaultStreamPort(): number;
  static setDefaultStreamPort(protocol: string, port: number);
}
