/**
 * Note that this file and `Router.js` contains code that will be directly
 * injected into an iframe.  It will undergo NO processing by babel, webpack,
 * etc.  Therefore, it must be written using a JavaScript spec that is natively
 * supported by the browser.  For now, that spec is ES5.  DO NOT put any code
 * in these files that needs to be processed.
 *
 * @todo - determine a processing method that will allow us to write code using
 * the latest spec, but still inject working code into the iframe.
 */

export default function () {
  // keep the conduit's iframe as dumb as possible.  Call each of these in the
  // corresponding attribute on the "body" tag in the conduit's iframe.
  return {
    // `config` needs to be defined and passed in by the iframe.
    onload: function (logId, Router, config) {
      try {
        // Using variables scoped to the `window` is ok here because it will be
        // confined to the iframe's `window` - it will not pollute the parent
        // page's `window`.
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
            conduitCommands: config.conduitCommands,
          },
        );

        router._sendToParentWindow({
          event: Router.events.CREATED,
        });

        router.logger.info(logId + ' onload - Router created');

        return router;
      }
      catch (error) {
        // eslint-disable-next-line no-console
        console.error(logId + ' onload - Error while loading:', error);

        window.parent.postMessage({
          event: Router.events.CREATE_FAILURE,
          reason: error,
        }, '*');

        return null;
      }
    },
    onunload: function (logId, router) {
      if (!router) {
        // eslint-disable-next-line no-console
        console.warn(logId + ' onunload - Router not instantiated, exiting...');
        return;
      }

      try {
        router.logger.info(logId + ' onunload - Router being destroyed in onunload...');
        router.destroy();
        router.logger.info(logId + ' onunload - Router destroyed in onunload');
      }
      catch (error) {
        router.logger.error(logId + ' onunload - Error while unloading:');
        router.logger.error(error);
      }
    },
  };
}
