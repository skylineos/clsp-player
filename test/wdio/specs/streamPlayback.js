const { resolveStreamUrl, assertUsable } = require('../helpers/localConfig');

/**
 * G6 playback gate: proves the locally built player can actually play a CLSP
 * stream, not merely render a shell.
 *
 * Two steps, in order:
 *   1. select the player build under test ("Use /src files" -> the bundle the dev
 *      server just compiled from src/, not a published package);
 *   2. point it at a stream URL and start playback.
 *
 * The URL is written into the input BEFORE the player is initialised because the
 * demo calls changeSrc() during initialisation -- doing it in the other order
 * would make the demo attempt its hard-coded default host.
 *
 * Requires local config; see test/wdio/helpers/localConfig.js. Without it the
 * test reports itself pending so the gap is visible rather than hidden.
 */
describe('Single Player Demo stream playback', function () {
  const PLAYBACK_TIMEOUT = 60000;
  const { streamUrl, source } = resolveStreamUrl();

  before(function () {
    if (!streamUrl) {
      this.skip();
    }

    assertUsable(streamUrl);
  });

  it('should advance video time for a CLSP stream', async () => {
    const consoleErrors = [];

    await browser.url('/demos/single-player');

    await $('[title="Use /src files"]').click();

    // Collect page errors from here on; a stream failure surfaces in the console
    // long before it would surface in the DOM.
    await browser.execute(() => {
      window.__wdioErrors = [];

      const record = (message) => window.__wdioErrors.push(String(message));

      console.error = (...args) => record(args.join(' '));
      window.addEventListener('error', (event) => record(event.message));
      window.addEventListener('unhandledrejection', (event) => record(`unhandledrejection: ${event.reason}`));
    });

    const streamInput = await $('#stream-src');

    await streamInput.setValue(streamUrl);

    // Initialises the player and calls changeSrc() with the URL above.
    await $('[title="Let CLSP Player Create Video Element"]').click();

    await expect($('#player-error')).not.toBeDisplayed();

    const video = await $('.clsp-player-container video');

    await expect(video).toBeExisting();

    await browser.waitUntil(async () => {
      const state = await browser.execute(() => {
        const el = document.querySelector('.clsp-player-container video');

        if (!el) {
          return { time: 0, error: 'no video element' };
        }

        return {
          time: el.currentTime,
          error: el.error ? `${el.error.name}(${el.error.code})` : null,
        };
      });

      if (state.error) {
        throw new Error(`video error: ${state.error}`);
      }

      return state.time > 0;
    }, {
      timeout: PLAYBACK_TIMEOUT,
      timeoutMsg: `stream did not begin playing within ${PLAYBACK_TIMEOUT / 1000}s (from ${source})`,
      interval: 1000,
    });

    const first = await browser.execute(() => document.querySelector('.clsp-player-container video').currentTime);

    await browser.pause(2000);

    const second = await browser.execute(() => document.querySelector('.clsp-player-container video').currentTime);

    expect(second).toBeGreaterThan(first);

    const errors = await browser.execute(() => window.__wdioErrors);

    expect(errors).toEqual([]);
  });
});
