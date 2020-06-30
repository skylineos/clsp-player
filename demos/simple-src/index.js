import './styles.scss';

// @todo - import fontawesome
import $ from 'jquery';

// simulate `import '@skylineos/clsp-player'`
import {
  ClspIovCollection,
  clspUtils,
} from '~root/dist/clsp-player.min.js';

let clspIovCollection;
let clspIov;

function displayVersions () {
  document.title = `v${clspUtils.version} ${document.title}`;

  const pageTitle = $('#page-title').html();
  $('#page-title').html(`${pageTitle} <br /> v${clspUtils.version}`);
}

function registerHandlers () {
  function play () {
    if (!clspIov) {
      return;
    }

    window.clspPlayerControls.changeSrc();
  }

  function stop () {
    if (!clspIov) {
      return;
    }

    clspIov.stop();
  }

  function fullscreen () {
    if (!clspIov) {
      return;
    }

    clspIov.toggleFullscreen();
  }

  function destroy () {
    if (!clspIov) {
      return;
    }

    clspIovCollection.remove(clspIov.id);
    clspIov = null;
  }

  function changeSrc () {
    const streamUrl = document.getElementById('stream-src').value;

    clspIov.changeSrc(streamUrl);
  }

  window.clspPlayerControls = {
    play: play,
    stop: stop,
    fullscreen: fullscreen,
    destroy: destroy,
    changeSrc: changeSrc,
  };
}

async function main () {
  const videoElementId = 'my-video';

  try {
    const url = $(`#${videoElementId}`).find('source')[0].getAttribute('src');

    document.getElementById('stream-src').value = url;

    clspIovCollection = ClspIovCollection.asSingleton();
    clspIov = await clspIovCollection.create(videoElementId);

    clspIov.changeSrc(url);
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
