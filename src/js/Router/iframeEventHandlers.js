/**
 * Note that this file and `Router.js` contain code that will be directly
 * injected into an iframe.  It will undergo NO processing by babel, webpack,
 * etc.  Therefore, it must be written using a JavaScript spec that is natively
 * supported by the browser.  For now, that spec is ES5.  DO NOT put any code
 * in these files that needs to be transpiled.
 *
 * The only exception here is the `export` statement.  The `export` statement
 * is allowed and necessary because this file will be loaded by webpack.  Even
 * though it is loaded by webpack, the value that is returned by the `export`
 * is in no way processed or transformed.
 *
 * @todo - determine a processing method that will allow us to write code using
 * the latest spec, but still inject working code into the iframe.
 *
 * @returns {object}
 *   An object containing the properties `onload` and `onunload`, which are to
 *   be used as the event listeners for the corresponding events on the `<body>`
 *   tag of the iframe.
 */
export default function () {
  // @todo - if we can somehow get an event to fire from here when the iframe
  // is unloaded, it would make the iframe handling significantly more elegant
  // and resilient...
  return {
    /**
     * The `onload` event handler for the `<body> onload` event.  This event
     * handler will instantiate the Router.
     *
     * On success or failure, a message will be sent to the parent window to
     * indicate success or failure.
     *
     * @param {string} logId
     *   a string that identifies this Conduit / Router in log messages
     * @param {class} Router
     *   The Router class
     * @param {object} config
     *   An object containing all necessary Router config options
     *
     * @returns {Router|null}
     *   The instantiated router, or `null` if an error is encountered
     */
    onload: function (logId, clientId, Router, config) {
      try {
        // @todo - validate arguments
        var router = Router.factory(
          config.logId,
          config.clientId,
          config.host,
          config.port,
          config.useSSL,
          {
            CONNECTION_TIMEOUT: config.CONNECTION_TIMEOUT,
            KEEP_ALIVE_INTERVAL: config.KEEP_ALIVE_INTERVAL,
            PUBLISH_TIMEOUT: config.PUBLISH_TIMEOUT,
            Logger: config.Logger,
          },
        );

        router._sendToParentWindow({
          event: Router.events.CREATE_SUCCESS,
        });

        router.logger.info(logId + ' onload - Router created');

        return router;
      }
      catch (error) {
        // eslint-disable-next-line no-console
        console.error(logId + ' onload - Error while loading:');
        console.error(error);

        window.parent.postMessage({
          event: Router.events.CREATE_FAILURE,
          reason: error,
        }, '*');

        return null;
      }
    },

    /**
     * The `onunload` event handler for the `<body> onunload` event.  This
     * event handler will destroy this iframe's Router if it exists.
     *
     * @param {string} logId
     *   a string that identifies this Conduit / Router in log messages
     * @param {Router} router
     *   The router that was instantiated for this iframe
     *
     * @returns {void}
     */
    onunload: function (logId, clientId, router) {
      // @todo - use this to detect an externally destroyed iframe
      // window.parent.postMessage({
      //   clientId: clientId,
      //   event: 'iframe-onunload',
      // }, '*');

      // @todo - validate arguments

      if (!router) {
        // eslint-disable-next-line no-console
        console.warn(logId + ' onunload - Router not instantiated, exiting...');
        return;
      }

      try {
        router.logger.info(logId + ' onunload - Router being destroyed in onunload...');
        router.destroy();
        router.logger.info(logId + ' onunload - Router destroyed in onunload');
        // @todo - should this send a message to the parent window, like onload
        // does?
      }
      catch (error) {
        router.logger.error(logId + ' onunload - Error while unloading:');
        router.logger.error(error);
        // @todo - should this send a message to the parent window, like onload
        // does?
      }
    },
  };
}
