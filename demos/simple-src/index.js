import './styles.scss';

// @todo - import fontawesome
import $ from 'jquery';

// simulate `import '@skylineos/clsp-player'`
import {
  IovCollection,
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

let iovCollection;
let iov;

function displayVersions () {
  document.title = `v${utils.version} ${document.title}`;

  const pageTitle = $('#page-title').html();
  $('#page-title').html(`${pageTitle} <br /> v${utils.version}`);
}

function registerHandlers () {
  function play () {
    if (!iov) {
      return;
    }

    window.clspPlayerControls.changeSrc();
  }

  function stop () {
    if (!iov) {
      return;
    }

    iov.stop();
  }

  function fullscreen () {
    if (!iov) {
      return;
    }

    iov.toggleFullscreen();
  }

  function destroy () {
    if (!iov) {
      return;
    }

    iovCollection.remove(iov.id);
    iov = null;
  }

  function hardDestroy1 () {
    // Perform the destroy without waiting for it to finish.  This will test
    // whether or not the destroy logic will attempt to finish wihtout error
    // even though the iframe has been destroyed prematurely
    destroy();
    $('.clsp-player-container').remove();
  }

  function hardDestroy2 () {
    // Perform the destroy without waiting for it to finish.  This will test
    // whether or not the destroy logic will attempt to finish wihtout error
    // even though the iframe has been destroyed prematurely
    $('.clsp-player-container').remove();
    destroy();
  }

  function hardDestroy3 () {
    // Perform the destroy without waiting for it to finish.  This will test
    // whether or not the destroy logic will attempt to finish wihtout error
    // even though the iframe has been destroyed prematurely
    $('.clsp-player-container').remove();
  }

  function changeSrc () {
    const streamUrl = document.getElementById('stream-src').value;

    iov.changeSrc(streamUrl).catch(function (error) {
      console.error('Error while playing stream in demo:');
      console.error(error);
    });
  }

  window.clspPlayerControls = {
    play: play,
    stop: stop,
    fullscreen: fullscreen,
    destroy: destroy,
    hardDestroy1: hardDestroy1,
    hardDestroy2: hardDestroy2,
    hardDestroy3: hardDestroy3,
    changeSrc: changeSrc,
  };
}

async function main () {
  const videoElementId = 'my-video';

  try {
    utils.setDefaultStreamPort('clsp', 9001);

    const url = document.getElementById('stream-src').value;

    iovCollection = IovCollection.asSingleton();
    iov = iovCollection.create(videoElementId);

    // iov.registerContainerElement();
    // iov.registerVideoElement();

    iov.changeSrc(url).catch(function (error) {
      console.error('Error while playing stream in demo:');
      console.error(error);
    });
  }
  catch (error) {
    document.getElementById('browser-not-supported').style.display = 'block';
    document.getElementById(videoElementId).style.display = 'none';
    console.error(error);
  }
}

$(() => {
  displayVersions();
  registerHandlers();
  main();
});
