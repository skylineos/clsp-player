import $ from 'jquery';
import moment from 'moment';
import humanize from 'humanize';

let wallInterval = null;

const defaultClspUrls = [
  'clsps://bd-demo-sfs1.skyvdn.com/testpattern',
  'clsps://bd-demo-sfs1.skyvdn.com/testpattern',
  'clsps://bd-demo-sfs1.skyvdn.com/testpattern',
];

// Get a demo local storage value
export function getLocalStorage (name, elementId) {
  const localStorageKey = `skylineos.clsp-player.${name}.${elementId}`;

  return {
    key: localStorageKey,
    value: window.localStorage.getItem(localStorageKey),
  };
}

export function setLocalStorage (name, elementId, value) {
  const localStorageKey = `skylineos.clsp-player.${name}.${elementId}`;

  window.localStorage.setItem(localStorageKey, value);

  return getLocalStorage(name, elementId);
}

// Initialize a demo local storage value
export function initLocalStorage (
  name, elementId, type, defaultValue,
) {
  const $element = $(`#${elementId}`);

  switch (type) {
    case 'input': {
      let currentValue = getLocalStorage(name, elementId).value;

      if (!currentValue) {
        currentValue = setLocalStorage(name, elementId, defaultValue.toString()).value;
      }

      $element.val(currentValue);

      $element.on('change', () => {
        setLocalStorage(name, elementId, $element.val().trim());
      });

      break;
    }
    case 'textarea': {
      let currentValue = getLocalStorage(name, elementId).value;

      if (!currentValue) {
        currentValue = setLocalStorage(name, elementId, defaultValue.join('\n')).value;
      }

      $element.val(currentValue);

      $element.on('change', () => {
        setLocalStorage(name, elementId, $element.val().trim());
      });

      break;
    }
    case 'checkbox': {
      let currentValue = getLocalStorage(name, elementId).value;

      if (currentValue !== 'true' && currentValue !== 'false') {
        currentValue = setLocalStorage(name, elementId, defaultValue.toString()).value;
      }

      $element.prop('checked', currentValue === 'true');

      $element.on('change', () => {
        setLocalStorage(name, elementId, $element.prop('checked').toString());
      });

      break;
    }
    default: {
      throw new Error(`Unknown element type: ${type}`);
    }
  }
}

function toggleControls () {
  const $controlsToggle = $('#wall-controls-toggle');

  $controlsToggle.attr('data-state') === 'hidden'
    ? showControls()
    : hideControls();
}

function showControls () {
  const $controls = $('.wall .controls');
  const $controlsToggle = $('#wall-controls-toggle');

  $controls.show();
  $controlsToggle.attr('data-state', 'shown');
  $controlsToggle.text('Hide Controls');
}

function hideControls () {
  const $controls = $('.wall .controls');
  const $controlsToggle = $('#wall-controls-toggle');

  $controls.hide();
  $controlsToggle.attr('data-state', 'hidden');
  $controlsToggle.text('Show Controls');
}

export function createWall (name, createPlayer, destroyAllPlayers) {
  destroyAllPlayers();

  const urlList = getLocalStorage(name, 'wall-streams').value.split('\n');
  const urlReplicateCount = getLocalStorage(name, 'wall-times-to-replicate').value;

  const tourUrlList = getLocalStorage(name, 'tour-streams').value.split('\n');
  const tourUrlReplicateCount = getLocalStorage(name, 'tour-times-to-replicate').value;
  const tourReplicateCount = getLocalStorage(name, 'tour-times-to-repeat').value;
  const tourInterval = getLocalStorage(name, 'tour-interval').value;

  let videoIndex = 0;

  if (getLocalStorage(name, 'tours-enabled').value === 'true') {
    for (let i = 0; i < tourReplicateCount; i++) {
      let sources = [];

      for (let j = 0; j < tourUrlReplicateCount; j++) {
        sources = sources.concat(tourUrlList.map((url) => {
          return {
            src: url,
            type: "video/mp4; codecs='avc1.42E01E'",
          };
        }));
      }

      const playerOptions = {
        autoplay: true,
        muted: true,
        playsinline: true,
        preload: 'auto',
        poster: '../skyline-logo.svg',
        controls: true,
        tour: {
          enabled: true,
          interval: tourInterval,
        },
        sources,
        clsp: {
          enableMetrics: false,
        },
      };

      createPlayer(videoIndex, playerOptions);

      videoIndex++;
    }
  }

  if (getLocalStorage(name, 'wall-enabled').value === 'true') {
    for (let i = 0; i < urlReplicateCount; i++) {
      for (let j = 0; j < urlList.length; j++) {
        const playerOptions = {
          autoplay: true,
          muted: true,
          playsinline: true,
          preload: 'auto',
          poster: '../skyline-logo.svg',
          controls: true,
          sources: [
            {
              src: urlList[j],
              type: "video/mp4; codecs='avc1.42E01E'",
            },
          ],
          clsp: {
            enableMetrics: false,
          },
        };

        createPlayer(videoIndex, playerOptions);

        videoIndex++;
      }
    }
  }

  const now = Date.now();

  const squareDimension = Math.ceil(Math.sqrt(videoIndex + 1));
  const actualDimension = squareDimension + Math.floor(squareDimension / 2);

  document.getElementById('videowall').style.gridTemplateColumns = `repeat(${actualDimension}, 1fr)`;
  $('#wallTotalVideos').text(videoIndex);
  $('#wallStartTime').text(moment(now).format('MMMM Do YYYY, h:mm:ss a'));

  if (wallInterval) {
    clearInterval(wallInterval);
  }

  $('#wallDuration').text('0 hours 0 minutes 0 seconds');

  wallInterval = setInterval(() => {
    const hoursFromStart = Math.floor(moment.duration(Date.now() - now).asHours());
    const minutesFromStart = Math.floor(moment.duration(Date.now() - now).asMinutes()) - (hoursFromStart * 60);
    const secondsFromStart = Math.floor(moment.duration(Date.now() - now).asSeconds()) - (hoursFromStart * 60 * 60) -
      (minutesFromStart * 60);

    $('#wallDuration').text(`${hoursFromStart} hours ${minutesFromStart} minutes ${secondsFromStart} seconds`);

    if (window.performance && window.performance.memory) {
      $('#wallHeapSizeLimit').text(humanize.filesize(window.performance.memory.jsHeapSizeLimit));
      $('#wallTotalHeapSize').text(humanize.filesize(window.performance.memory.totalJSHeapSize));
      $('#wallUsedHeapSize').text(humanize.filesize(window.performance.memory.usedJSHeapSize));
    }
  }, 1000);

  hideControls();
}

// Create a videowall using the specified
export function initializeWall (name, createPlayer, destroyAllPlayers) {
  $('#wallCreate').click(function () {
    createWall(name, createPlayer, destroyAllPlayers);
  });
  $('#wall-controls-toggle').click(toggleControls);

  initLocalStorage(
    name, 'wall-enabled', 'checkbox', true,
  );
  initLocalStorage(
    name, 'wall-streams', 'textarea', defaultClspUrls,
  );
  initLocalStorage(
    name, 'wall-times-to-replicate', 'input', 1,
  );

  initLocalStorage(
    name, 'tours-enabled', 'checkbox', false,
  );
  initLocalStorage(
    name, 'tour-streams', 'textarea', defaultClspUrls,
  );
  initLocalStorage(
    name, 'tour-times-to-replicate', 'input', 1,
  );
  initLocalStorage(
    name, 'tour-times-to-repeat', 'input', 1,
  );
  initLocalStorage(
    name, 'tour-interval', 'input', 10,
  );
}

export default {
  getLocalStorage,
  initLocalStorage,
  initializeWall,
  createWall,
};
