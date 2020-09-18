'use strict';

var textAreaId = 'stream-src';
var videoElementId = 'my-video';

var durationDisplayInterval = null;

// @todo - how can we make this easier for clients to be able to set up their
// own demos with functional urls without changing the source code?
var initialStreams = [
  'clsps://hera.qa.skyline.local/FairfaxVideo0520',
  'clsps://hera.qa.skyline.local/FairfaxVideo0420',
  'clsps://hera.qa.skyline.local/FairfaxVideo0440',
  'clsps://hera.qa.skyline.local/FairfaxVideo0350',
  'clsps://hera.qa.skyline.local/FairfaxVideo0440_FakeStreamUrl',
  'clsps://hera.qa.skyline.local/FairfaxVideo0760',
  'clsps://hera.qa.skyline.local/FairfaxVideo0430',
  'clsps://hera.qa.skyline.local/FairfaxVideo0450',
  'clsps://hera.qa.skyline.local/FairfaxVideo0470',
  'clsps://hera.qa.skyline.local/FairfaxVideo0780',
  'clsps://hera.qa.skyline.local/FairfaxVideo0790',
  'clsp://hera.qa.skyline.local/FairfaxVideo0520',
  'clsp://hera.qa.skyline.local/FairfaxVideo0420',
  'clsp://hera.qa.skyline.local/FairfaxVideo0440',
  'clsp://hera.qa.skyline.local/FairfaxVideo0350',
  'clsp://hera.qa.skyline.local/FairfaxVideo0440_FakeStreamUrl',
  'clsp://hera.qa.skyline.local/FairfaxVideo0760',
  'clsp://hera.qa.skyline.local/FairfaxVideo0430',
  'clsp://hera.qa.skyline.local/FairfaxVideo0450',
  'clsp://hera.qa.skyline.local/FairfaxVideo0470',
  'clsp://hera.qa.skyline.local/FairfaxVideo0780',
  'clsp://hera.qa.skyline.local/FairfaxVideo0790',
];

function displayVersions () {
  document.title = `v${window.CLSP.utils.version} ${document.title}`;

  var pageTitle = document.getElementById('page-title').innerHTML;
  document.getElementById('page-title').innerHTML = `${pageTitle} <br /> v${window.CLSP.utils.version}`;
}

function getTourList () {
  if (!document.getElementById(textAreaId).value) {
    document.getElementById(textAreaId).value = initialStreams.join('\n');
  }

  var urls = document.getElementById(textAreaId).value
    .split('\n')
    .map((url) => url.trim())
    .filter((url) => Boolean(url));

  return urls;
}

function initializeTimer () {
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
}

function initialize () {
  displayVersions();
  initializeTimer();

  var urls = getTourList();

  var tour = window.CLSP.TourController.factory(
    window.CLSP.IovCollection.asSingleton(),
    videoElementId,
    {
      intervalDuration: 10,
      onShown: function (
        error, index, streamConfiguration,
      ) {
        if (error) {
          console.error(`Failed to play stream ${streamConfiguration.url}`);
          console.error(error);
          return;
        }

        window.document.getElementById('current-stream-url').innerHTML = streamConfiguration.url + ' (' + index + '/' + tour.streamConfigurations.length + ')';
      },
    },
  );

  tour.addUrls(urls);
  tour.start();

  window.tour = tour;
}

window.clspPlayerControls = {
  initialize: initialize,
};
