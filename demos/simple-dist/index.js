'use strict';

function play () {
  if (!window.clspIov) {
    return;
  }

  window.clspPlayerControls.changeSrc();
}

function stop () {
  if (!window.clspIov) {
    return;
  }

  window.clspIov.stop();
}

function fullscreen () {
  if (!window.clspIov) {
    return;
  }

  window.clspIov.toggleFullscreen();
}

function destroy () {
  if (!window.clspIov) {
    return;
  }

  window.clspIovCollection.remove(window.clspIov.id);
  window.clspIov = null;
}

function changeSrc () {
  var streamUrl = document.getElementById('stream-src').value;

  window.clspIov.changeSrc(streamUrl);
}

function initialize () {
  var videoElementId = 'my-video';

  var element = document.getElementById(videoElementId);
  var url = element.children[0].getAttribute('src');

  document.getElementById('stream-src').value = url;

  window.clspIovCollection = window.ClspIovCollection.asSingleton();

  window.clspIovCollection.create(videoElementId)
    .then(function (clspIov) {
      window.clspIov = clspIov;
      window.clspIov.changeSrc(url);
    })
    .catch(function (error) {
      document.getElementById('browser-not-supported').style.display = 'block';
      document.getElementById(videoElementId).style.display = 'none';
      console.error(error);
    });
}

window.clspPlayerControls = {
  play: play,
  stop: stop,
  fullscreen: fullscreen,
  destroy: destroy,
  changeSrc: changeSrc,
  initialize: initialize,
};
