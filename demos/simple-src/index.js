import './styles.scss';

// @todo - import fontawesome
import $ from 'jquery';

// simulate `import '@skylineos/clsp-player'`
import {
  IovCollection,
  Iov,
  utils,
} from '~root/dist/clsp-player.min.js';

/**
 * or with `require`....
 *
 * const {
 *   IovCollection,
 *   utils,
 * } = require('~root/dist/clsp-player.min.js');
 */

// for the simple demo, we're just going to use one player.
let iov;

function displayVersions () {
  document.title = `v${utils.version} ${document.title}`;
  $('#version').text(utils.version);
}

function registerHandlers () {
  async function play () {
    if (!iov) {
      return;
    }

    await window.clspPlayerControls.changeSrc();
  }

  async function stop () {
    if (!iov) {
      return;
    }

    await iov.stop();
  }

  function toggleFullscreen () {
    if (!iov) {
      return;
    }

    iov.toggleFullscreen();
  }

  async function destroy () {
    if (!iov) {
      return;
    }

    await IovCollection.asSingleton().remove(iov.id);
    iov = null;
  }

  function hardDestroy1 () {
    return new Promise((resolve, reject) => {
      iov.on(Iov.events.DESTROYING, () => {
        console.warn(`Iov ${iov.id} was destroyed ungracefully...`);
        resolve();
      });

      // Perform the destroy without waiting for it to finish.  This will test
      // whether or not the destroy logic will attempt to finish wihtout error
      // even though the iframe has been destroyed prematurely
      destroy();
      $('.clsp-player-container').remove();
    });
  }

  function hardDestroy2 () {
    return new Promise((resolve, reject) => {
      iov.on(Iov.events.DESTROYING, () => {
        console.warn(`Iov ${iov.id} was destroyed ungracefully...`);
        resolve();
      });

      // Perform the destroy without waiting for it to finish.  This will test
      // whether or not the destroy logic will attempt to finish wihtout error
      // even though the iframe has been destroyed prematurely
      $('.clsp-player-container').remove();
      destroy();
    });
  }

  function hardDestroy3 () {
    return new Promise((resolve, reject) => {
      iov.on(Iov.events.DESTROYING, () => {
        console.warn(`Iov ${iov.id} was destroyed ungracefully...`);
        resolve();
      });

      // Destroy the element directly without explicitly destroying.  This will test
      // whether or not the destroy logic will attempt to finish wihtout error
      // even though the iframe has been destroyed prematurely
      $('.clsp-player-container').remove();
    });
  }

  async function changeSrc () {
    const streamUrl = document.getElementById('stream-src').value;

    try {
      await iov.changeSrc(streamUrl);
    }
    catch (error) {
      console.error('Error while changing source!');
      console.error(error);
    }
  }

  window.clspPlayerControls = {
    play,
    stop,
    toggleFullscreen,
    destroy,
    hardDestroy1,
    hardDestroy2,
    hardDestroy3,
    changeSrc,
  };
}

async function main () {
  const videoElementId = 'my-video';

  try {
    utils.setDefaultStreamPort('clsp', 9001);

    // const url = document.getElementById('stream-src').value;

    // utils.disablePlayerLogging();

    iov = IovCollection.asSingleton().create({ videoElementId });

    // iov.changeSrc(url);
  }
  catch (error) {
    console.error('Error while playing stream in demo:');
    document.getElementById('demo-error').style.display = 'block';
    document.getElementById(videoElementId).style.display = 'none';
    console.error(error);
  }
}

$(() => {
  displayVersions();
  registerHandlers();
  main();
});
