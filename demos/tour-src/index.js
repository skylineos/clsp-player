import './styles.scss';

// @todo - import fontawesome
import $ from 'jquery';
import humanize from 'humanize';

// simulate `import '@skylineos/clsp-player'`
import {
  IovCollection,
  TourController,
  utils as clspUtils,
} from '~root/dist/clsp-player.min.js';

let durationDisplayInterval;

const textAreaId = 'stream-src';
const videoElementId = 'my-video';

// @todo - how can we make this easier for clients to be able to set up their
// own demos with functional urls without changing the source code?
const initialStreams = [
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
  document.title = `v${clspUtils.version} ${document.title}`;

  const pageTitle = document.getElementById('page-title').innerHTML;
  document.getElementById('page-title').innerHTML = `${pageTitle} <br /> v${clspUtils.version}`;
}

function getTourList () {
  if (!$(`#${textAreaId}`).val()) {
    $(`#${textAreaId}`).val(initialStreams.join('\n'));
  }

  const urls = $(`#${textAreaId}`).val()
    .split('\n')
    .map((url) => url.trim())
    .filter((url) => Boolean(url));

  return urls;
}

function initializeTimer () {
  const date = new Date();

  $('#tourStartTime').html(`${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()} ${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}`);

  const pageLoadStartTime = Date.now();

  if (durationDisplayInterval) {
    clearInterval(durationDisplayInterval);
  }

  durationDisplayInterval = setInterval(() => {
    const secondsElapsedSinceStart = (Date.now() - pageLoadStartTime) / 1000;

    const displayHours = Math.floor(secondsElapsedSinceStart / 60 / 60);
    const displayMinutes = Math.floor(secondsElapsedSinceStart / 60) - (displayHours * 60);
    const displaySeconds = Math.floor(secondsElapsedSinceStart) - (displayHours * 60 * 60) - (displayMinutes * 60);

    $('#tourDuration').text(`${displayHours} hours ${displayMinutes} minutes ${displaySeconds} seconds`);

    if (window.performance && window.performance.memory) {
      $('#tourHeapSizeLimit').text(humanize.filesize(window.performance.memory.jsHeapSizeLimit));
      $('#tourTotalHeapSize').text(humanize.filesize(window.performance.memory.totalJSHeapSize));
      $('#tourUsedHeapSize').text(humanize.filesize(window.performance.memory.usedJSHeapSize));
    }
  }, 1000);
}

$(() => {
  displayVersions();
  initializeTimer();

  const urls = getTourList();

  const tour = TourController.factory(
    IovCollection.asSingleton(),
    videoElementId,
    {
      intervalDuration: 10,
      onShown: (error, index, streamConfiguration) => {
        if (error) {
          console.error(`Failed to play stream ${streamConfiguration.url}`);
          console.error(error);
          return;
        }

        $('#current-stream-url').html(`${streamConfiguration.url} (${index}/${tour.streamConfigurations.length})`);
      },
    },
  );

  tour.addUrls(urls);
  tour.start();

  window.tour = tour;
});
