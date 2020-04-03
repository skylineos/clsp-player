'use strict';

var textAreaId = 'stream-src';
var videoElementId = 'my-video';

var durationDisplayInterval = null;

function _getTourList () {
  // @todo - how can we make this easier for clients to be able to set up their
  // own demos with functional urls without changing the source code?
  var initialStreams = [
    'clsps://172.28.12.57/FairfaxVideo0520',
    'clsps://172.28.12.57/FairfaxVideo0420',
    'clsps://172.28.12.57/FairfaxVideo0440',
    'clsps://172.28.12.57/FairfaxVideo0350',
    'clsps://172.28.12.57/FairfaxVideo0440_FakeStreamUrl',
    'clsps://172.28.12.57/FairfaxVideo0760',
    'clsps://172.28.12.57/FairfaxVideo0430',
    'clsps://172.28.12.57/FairfaxVideo0450',
    'clsps://172.28.12.57/FairfaxVideo0470',
    'clsps://172.28.12.57/FairfaxVideo0780',
    'clsps://172.28.12.57/FairfaxVideo0790',
    'clsp://172.28.12.57/FairfaxVideo0520',
    'clsp://172.28.12.57/FairfaxVideo0420',
    'clsp://172.28.12.57/FairfaxVideo0440',
    'clsp://172.28.12.57/FairfaxVideo0350',
    'clsp://172.28.12.57/FairfaxVideo0440_FakeStreamUrl',
    'clsp://172.28.12.57/FairfaxVideo0760',
    'clsp://172.28.12.57/FairfaxVideo0430',
    'clsp://172.28.12.57/FairfaxVideo0450',
    'clsp://172.28.12.57/FairfaxVideo0470',
    'clsp://172.28.12.57/FairfaxVideo0780',
    'clsp://172.28.12.57/FairfaxVideo0790',
  ];

  if (!document.getElementById(textAreaId).value) {
    document.getElementById(textAreaId).value = initialStreams.join('\n');
  }

  window.urls = document.getElementById(textAreaId).value
    .split('\n')
    .map((url) => url.trim())
    .filter((url) => Boolean(url));

  return window.urls;
}

function initialize () {
  document.title = 'CLSP ' + window.clspUtils.version + ' ' + document.title;
  document.getElementById('version').innerHTML += window.clspUtils.version;

  var date = new Date();

  document.getElementById('tourStartTime').innerText = date.getFullYear() + '-' + (date.getMonth() + 1) + '-' + date.getDate() + ' ' + date.getHours() + ':' + date.getMinutes() + ':' + date.getSeconds();

  var pageLoadStartTime = Date.now();

  if (durationDisplayInterval) {
    clearInterval(durationDisplayInterval);
  }

  durationDisplayInterval = setInterval(() => {
    var secondsElapsedSinceStart = (Date.now() - pageLoadStartTime) / 1000;

    var displayHours = Math.floor(secondsElapsedSinceStart / 60 / 60);
    var displayMinutes = Math.floor(secondsElapsedSinceStart / 60) - (displayHours * 60);
    var displaySeconds = Math.floor(secondsElapsedSinceStart) - (displayHours * 60 * 60) - (displayMinutes * 60);

    document.getElementById('tourDuration').innerText = displayHours + ' hours ' + displayMinutes + ' minutes ' + displaySeconds + ' seconds';

    if (window.performance && window.performance.memory) {
      document.getElementById('tourHeapSizeLimit').innerText = window.humanize.filesize(window.performance.memory.jsHeapSizeLimit);
      document.getElementById('tourTotalHeapSize').innerText = window.humanize.filesize(window.performance.memory.totalJSHeapSize);
      document.getElementById('tourUsedHeapSize').innerText = window.humanize.filesize(window.performance.memory.usedJSHeapSize);
    }
  }, 1000);

  _getTourList();

  window.tour = window.TourController.factory(
    window.IovCollection.asSingleton(), videoElementId, {
      intervalDuration: 10,
      onShown: function (
        error, index, streamConfiguration,
      ) {
        if (error) {
          console.error(`Failed to play stream ${streamConfiguration.url}`);
          console.error(error);
          return;
        }

        window.document.getElementById('current-stream-url').innerHTML = streamConfiguration.url + ' (' + index + '/' + window.tour.streamConfigurations.length + ')';
      },
    },
  );

  window.tour.addUrls(window.urls);
  window.tour.start();
}

window.clspControls = {
  initialize: initialize,
};
