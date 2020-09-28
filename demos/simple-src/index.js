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

let videoElement;
let containerElement;

window.$ = $;

function displayVersions () {
  document.title = `v${utils.version} ${document.title}`;
  $('#version').text(utils.version);
}

function registerHandlers () {
  async function play () {
    await changeSrc();
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

    if (!iov) {
      await main(streamUrl);
    }

    try {
      await iov.changeSrc(streamUrl);
    }
    catch (error) {
      console.error('Error while changing source!');
      console.error(error);
    }
  }

  function useManagedVideoElement () {
    containerElement = $('.clsp-player-container')[0];
    videoElement = document.createElement('video');

    videoElement.id = 'my-video';

    videoElement.addEventListener('play', (event) => {
      console.log('Successfully played with supplied video element!');
    });

    videoElement.addEventListener('ended', (event) => {
      console.log('Successfully stopped with supplied video element!');
    });

    // videoElement.classList.add(VIDEO_CLASS);
    // videoElement.muted = true;
    // videoElement.playsinline = true;

    containerElement.appendChild(videoElement);

    enableControls();

    changeSrc();
  }

  function doNotSupplyVideoElement () {
    containerElement = $('.clsp-player-container')[0];

    enableControls();

    changeSrc();
  }

  function enableControls () {
    $('.element-control button').each(function () {
      $(this).prop('disabled', true);
    });
    $('.stream-control button').each(function () {
      $(this).prop('disabled', false);
    });
    $('.display-control button').each(function () {
      $(this).prop('disabled', false);
    });
    $('.destroy-control button').each(function () {
      $(this).prop('disabled', false);
    });
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
    useManagedVideoElement,
    doNotSupplyVideoElement,
    enableControls,
  };
}

async function main () {
  try {
    utils.setDefaultStreamPort('clsp', 9001);

    // utils.disablePlayerLogging();

    iov = IovCollection.asSingleton().create({
      videoElement,
      containerElement,
    });
  }
  catch (error) {
    console.error('Error while playing stream in demo:');
    document.getElementById('player-error').style.display = 'block';
    // document.getElementById(videoElementId).style.display = 'none';
    console.error(error);
  }
}

$(() => {
  displayVersions();
  registerHandlers();
  // main();
});
