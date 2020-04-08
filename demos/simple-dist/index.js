'use strict';

function play () {
  if (!window.iov) {
    return;
  }

  window.clspPlayerControls.changeSrc();
}

function stop () {
  if (!window.iov) {
    return;
  }

  window.iov.stop();
}

function fullscreen () {
  if (!window.iov) {
    return;
  }

  window.iov.toggleFullscreen();
}

function destroy () {
  if (!window.iov) {
    return;
  }

  window.iovCollection.remove(window.iov.id);
  window.iov = null;
}

function changeSrc () {
  var streamUrl = document.getElementById('stream-src').value;

  window.iov.changeSrc(streamUrl);
}

function initialize () {
  var videoElementId = 'my-video';

  var element = document.getElementById(videoElementId);
  var url = element.children[0].getAttribute('src');

  document.getElementById('stream-src').value = url;

  window.iovCollection = window.IovCollection.asSingleton();

  window.iovCollection.create(videoElementId)
    .then(function (iov) {
      window.iov = iov;
      iov.changeSrc(url);
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
