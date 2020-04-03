'use strict';

function onPlay () {
  if (!window.player) {
    return;
  }

  window.player.play();
}

function onStop () {
  if (!window.player) {
    return;
  }

  // We use a custom event here because the pause event is not a viable
  // option
  window.player.trigger('stop');
}

function onFullscreen () {
  if (!window.player) {
    return;
  }

  window.player.requestFullscreen();
}

function onDestroy () {
  if (!window.player) {
    return;
  }

  window.player.dispose();
  window.player = null;
}

function main () {
  document.getElementById('version').innerHTML += window.clspUtils.version;

  window.player = window.videojs('my-video');

  if (window.clspUtils.supported()) {
    window.player.clsp();
  }

  window.player.on('ready', function () {
    // Even though the "ready" event has fired, it's not actually ready
    // until the "next tick"...
    setTimeout(function () {
      window.player.play();
    });
  });
}
