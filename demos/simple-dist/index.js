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

function hardDestroy1 () {
  // Perform the destroy without waiting for it to finish.  This will test
  // whether or not the destroy logic will attempt to finish wihtout error
  // even though the iframe has been destroyed prematurely
  destroy();
  var container = document.querySelector('.clsp-player-container');
  container.parentNode.removeChild(container);
}

function hardDestroy2 () {
  // Perform the destroy without waiting for it to finish.  This will test
  // whether or not the destroy logic will attempt to finish wihtout error
  // even though the iframe has been destroyed prematurely
  var container = document.querySelector('.clsp-player-container');
  container.parentNode.removeChild(container);
  destroy();
}

function hardDestroy3 () {
  // Perform the destroy without waiting for it to finish.  This will test
  // whether or not the destroy logic will attempt to finish wihtout error
  // even though the iframe has been destroyed prematurely
  var container = document.querySelector('.clsp-player-container');
  container.parentNode.removeChild(container);
}

function changeSrc () {
  var streamUrl = document.getElementById('stream-src').value;

  window.iov.changeSrc(streamUrl);
}

function initialize () {
  window.CLSP.utils.setDefaultStreamPort('clsp', 9001);

  var videoElementId = 'my-video';

  var element = document.getElementById(videoElementId);
  var url = element.children[0].getAttribute('src');

  document.getElementById('stream-src').value = url;

  window.iovCollection = window.CLSP.IovCollection.asSingleton();

  window.iovCollection.create(videoElementId)
    .then(function (iov) {
      window.iov = iov;
      window.iov.changeSrc(url);
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
  hardDestroy1: hardDestroy1,
  hardDestroy2: hardDestroy2,
  hardDestroy3: hardDestroy3,
  changeSrc: changeSrc,
  initialize: initialize,
};
