'use strict';

export default class StreamConfiguration {
  static factory (
    streamName, host, port, useSSL, tokenConfig,
  ) {
    return new StreamConfiguration(
      streamName, host, port, useSSL, tokenConfig,
    );
  }

  static fromObject (config) {
    if (!config || !typeof config === 'object') {
      throw new Error('config must be an object to create a streamConfiguration');
    }

    return StreamConfiguration.factory(
      config.streamName,
      config.host,
      config.port,
      config.useSSL,
      {
        ...config.tokenConfig,
      },
    );
  }

  static isStreamConfiguration (target) {
    return target && target.constructor && target.constructor.name === 'StreamConfiguration';
  }

  static generateConfigFromUrl (url) {
    if (!url) {
      throw new Error('No source was given to be parsed!');
    }

    // We use an anchor tag here beacuse, when an href is added to
    // an anchor dom Element, the parsing is done for you by the
    // browser.
    const parser = document.createElement('a');

    let useSSL;
    let defaultPort;
    let hashUrl;
    let b64HashAccessUrl = '';
    let hash = '';

    // Chrome is the only browser that allows non-http protocols in
    // the anchor tag's href, so change them all to http here so we
    // get the benefits of the anchor tag's parsing
    if (url.substring(0, 10).toLowerCase() === 'clsps-hash') {
      useSSL = true;
      parser.href = url.replace('clsps-hash', 'https');
      defaultPort = 443;
      hashUrl = true;
    }
    else if (url.substring(0, 9).toLowerCase() === 'clsp-hash') {
      useSSL = false;
      parser.href = url.replace('clsp-hash', 'http');
      defaultPort = 80;
      hashUrl = true;
    }
    else if (url.substring(0, 5).toLowerCase() === 'clsps') {
      useSSL = true;
      parser.href = url.replace('clsps', 'https');
      defaultPort = 443;
      hashUrl = false;
    }
    else if (url.substring(0, 4).toLowerCase() === 'clsp') {
      useSSL = false;
      parser.href = url.replace('clsp', 'http');
      defaultPort = 80;
      hashUrl = false;
    }
    else {
      throw new Error('The given source is not a clsp url, and therefore cannot be parsed.');
    }

    const paths = parser.pathname.split('/');
    const streamName = paths[paths.length - 1];

    let host = parser.hostname;
    let port = parser.port;

    if (port.length === 0) {
      port = defaultPort;
    }

    port = parseInt(port);

    // @ is a special address meaning the server that loaded the web page.
    if (host === '@') {
      host = window.location.hostname;
    }

    if (hashUrl === true) {
      // URL: clsp[s]-hash://<sfs-addr>[:<port>]/<stream>?start=...&end=...&token=...
      const qpOffset = url.indexOf(parser.pathname) + parser.pathname.length;

      const qrArgs = url.substr(qpOffset).split('?')[1];
      const query = {};

      const pairs = qrArgs.split('&');
      for (let i = 0; i < pairs.length; i++) {
        const pair = pairs[i].split('=');
        query[decodeURIComponent(pair[0])] = decodeURIComponent(pair[1] || '');
      }

      if (typeof query.start === 'undefined') {
        throw new Error("Required 'start' query parameter not defined for a clsp[s]-hash");
      }

      if (typeof query.end === 'undefined') {
        throw new Error("Required 'end' query parameter not defined for a clsp[s]-hash");
      }

      if (typeof query.token === 'undefined') {
        throw new Error("Required 'token' query parameter not defined for a clsp[s]-hash");
      }

      const protocol = useSSL
        ? 'clsps-hash'
        : 'clsp-hash';

      const hashUrl = `${protocol}://${host}:${port}/${streamName}?start=${query.start}&end=${query.end}&token=${query.token}`;

      b64HashAccessUrl = window.btoa(hashUrl);
      hash = query.token;
    }

    return {
      streamName,
      host,
      port,
      useSSL,
      tokenConfig: {
        b64HashAccessUrl,
        hash,
      },
    };
  }

  static fromUrl (url) {
    const config = StreamConfiguration.generateConfigFromUrl(url);

    return StreamConfiguration.fromObject(config);
  }

  constructor (
    streamName,
    host,
    port,
    useSSL,
    tokenConfig = {},
  ) {
    if (!streamName) {
      throw new Error('streamName is required to create a stream configuration.');
    }

    if (!host) {
      throw new Error('host is required to create a stream configuration.');
    }

    if (!port) {
      throw new Error('port is required to create a stream configuration.');
    }

    if (!useSSL && useSSL !== false) {
      throw new Error('useSSL is required to create a stream configuration.');
    }

    if (!tokenConfig || typeof tokenConfig !== 'object') {
      throw new Error('tokenConfig is required to create a stream configuration.');
    }

    this.streamName = streamName;
    this.host = host;
    this.port = port;
    this.useSSL = useSSL;
    this.tokenConfig = tokenConfig;

    this.destroyed = false;
  }

  clone (streamConfiguration) {
    if (!StreamConfiguration.isStreamConfiguration(streamConfiguration)) {
      throw new Error('Cannot clone with invalid streamConfiguration');
    }

    const clone = StreamConfiguration.factory(...streamConfiguration.toObject());

    return clone;
  }

  toObject () {
    return {
      streamName: this.streamName,
      host: this.host,
      port: this.port,
      useSSL: this.useSSL,
      tokenConfig: {
        ...this.tokenConfig,
      },
    };
  }

  get protocol () {
    return this.useSSL
      ? 'clsps'
      : 'clsp';
  }

  get url () {
    return `${this.protocol}://${this.host}:${this.port}/${this.streamName}`;
  }

  destroy () {
    if (this.destroyed) {
      return;
    }

    this.destroyed = true;

    this.streamName = null;
    this.host = null;
    this.port = null;
    this.useSSL = null;
    this.tokenConfig = null;
  }
}
