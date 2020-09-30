import './styles.scss';

// @todo - import fontawesome
import $ from 'jquery';

// simulate `import '@skylineos/clsp-player'`
import {
  IovCollection as srcIovCollection,
  Iov as srcIov,
  utils as srcUtils,
} from '~root/dist/clsp-player.min.js';

import {
  IovCollection as distIovCollection,
  Iov as distIov,
  utils as distUtils,
} from '../../dist/clsp-player.min.js';

/**
 * or with `require`....
 *
 * const {
 *   IovCollection,
 *   utils,
 * } = require('~root/dist/clsp-player.min.js');
 */

let IovCollection;
let Iov;
let utils;

let iov;

let videoElement;
let containerElement;

window.$ = $;

function displayVersions () {
  document.title = `v${srcUtils.version} ${document.title}`;
  $('#version').text(srcUtils.version);
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
        // console.warn(`Iov ${iov.id} was destroyed ungracefully...`);
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
        // console.warn(`Iov ${iov.id} was destroyed ungracefully...`);
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
        // console.warn(`Iov ${iov.id} was destroyed ungracefully...`);
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

  function useSourceFiles () {
    IovCollection = srcIovCollection;
    Iov = srcIov;
    utils = srcUtils;

    $('.element-control button').each(function () {
      $(this).prop('disabled', false);
    });

    $('.import-control .control-group').each(function () {
      $(this).html('Using /src files...');
    });
  }

  function useDistFiles () {
    IovCollection = distIovCollection;
    Iov = distIov;
    utils = distUtils;

    $('.element-control button').each(function () {
      $(this).prop('disabled', false);
    });

    $('.import-control .control-group').each(function () {
      $(this).html('Using /dist package...');
    });
  }

  async function useManagedVideoElement () {
    containerElement = $('.clsp-player-container')[0];
    videoElement = document.createElement('video');

    videoElement.id = 'my-video';

    videoElement.addEventListener('play', (event) => {
      console.log('Successfully played with supplied video element!');
    });

    videoElement.addEventListener('ended', (event) => {
      console.log('Successfully stopped with supplied video element!');
    });

    containerElement.appendChild(videoElement);

    $('.element-control .control-group').each(function () {
      $(this).html('Supplying video element to CLSP Player. <br /><br /> Open console to see messages.');
    });

    $('.stream-url-control button').each(function () {
      $(this).prop('disabled', false);
    });

    await changeSrc();

    $('.player-control button').each(function () {
      $(this).prop('disabled', false);
    });
    $('.destroy-control button').each(function () {
      $(this).prop('disabled', false);
    });
  }

  async function doNotSupplyVideoElement () {
    containerElement = $('.clsp-player-container')[0];

    $('.element-control .control-group').each(function () {
      $(this).html('Letting CLSP Player create video element...');
    });

    $('.stream-url-control button').each(function () {
      $(this).prop('disabled', false);
    });

    await changeSrc();

    $('.player-control button').each(function () {
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
    useSourceFiles,
    useDistFiles,
  };
}

async function main () {
  try {
    utils.setDefaultStreamPort('clsp', 9001);

    iov = IovCollection.asSingleton().create({
      videoElement,
      containerElement,
    });
  }
  catch (error) {
    console.error('Error while playing stream in demo:');
    document.getElementById('player-error').style.display = 'block';
    console.error(error);
  }
}

$(() => {
  displayVersions();
  registerHandlers();
});
