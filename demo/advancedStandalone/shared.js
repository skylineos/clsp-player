import $ from 'jquery';
import moment from 'moment';
import humanize from 'humanize';

let wallInterval = null;

const defaultClspUrls = [
  'clsp://172.28.12.248/testpattern',
  'clsp://172.28.12.247/testpattern',
  'clsps://sky-qa-dionysus.qa.skyline.local/testpattern',
  'clsp://172.28.12.57/FairfaxVideo0520',
  'clsp://172.28.12.57/40004',
];

// Run this when the demo page loads
export function onLoad () {
  const pageTitle = `CLSP ${window.CLSP_DEMO_VERSION} Demo Page`;
  document.title = pageTitle;

  $('#page-title-version').html(window.CLSP_DEMO_VERSION);
}

// Get a demo local storage value
export function getLocalStorage (name, elementId) {
  const localStorageKey = `skyline.clspPlugin.${name}.${elementId}`;

  return {
    key: localStorageKey,
    value: window.localStorage.getItem(localStorageKey),
  };
}

export function setLocalStorage (name, elementId, value) {
  const localStorageKey = `skyline.clspPlugin.${name}.${elementId}`;

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

// Create a videowall using the specified
export function initializeWall (name, createPlayer, destroyAllPlayers) {
  const $controls = $('.wall .controls');
  const $controlsToggle = $('#wall-controls-toggle');

  function toggleControls () {
    $controlsToggle.attr('data-state') === 'hidden' ?
      showControls() :
      hideControls();
  }

  function showControls () {
    $controls.show();
    $controlsToggle.attr('data-state', 'shown');
    $controlsToggle.text('Hide Controls');
  }

  function hideControls () {
    $controls.hide();
    $controlsToggle.attr('data-state', 'hidden');
    $controlsToggle.text('Show Controls');
  }

  function setMetricsVisibility () {
    if ($('#show-metrics').prop('checked')) {
      $('.wall-video-metrics').show();
    } else {
      $('.wall-video-metrics').hide();
    }
  }

  function onclick () {
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
          preload: 'auto',
          poster: '../skyline_logo.png',
          controls: true,
          tour: {
            enabled: true,
            interval: tourInterval,
          },
          sources,
          clsp: {
            enableMetrics: $('#enable-metrics').prop('checked'),
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
            preload: 'auto',
            poster: '../skyline_logo.png',
            controls: true,
            sources: [{
              src: urlList[j],
              type: "video/mp4; codecs='avc1.42E01E'",
            }, ],
            clsp: {
              enableMetrics: $('#enable-metrics').prop('checked'),
            },
          };

          createPlayer(videoIndex, playerOptions);

          videoIndex++;
        }
      }
    }

    const now = Date.now();

    document.getElementById('videowall').style.gridTemplateColumns = `repeat(${Math.ceil(Math.sqrt(videoIndex + 1))}, 1fr)`;
    $('#wallTotalVideos').text(videoIndex);
    $('#wallStartTime').text(moment(now).format('MMMM Do YYYY, h:mm:ss a'));

    if (wallInterval) {
      clearInterval(wallInterval);
    }

    $('#wallDuration').text('0 hours 0 minutes 0 seconds');

    wallInterval = setInterval(() => {
      const hoursFromStart = Math.floor(moment.duration(Date.now() - now).asHours());
      const minutesFromStart = Math.floor(moment.duration(Date.now() - now).asMinutes()) - (hoursFromStart * 60);
      const secondsFromStart = Math.floor(moment.duration(Date.now() - now).asSeconds()) - (hoursFromStart * 60 * 60) - (minutesFromStart * 60);

      $('#wallDuration').text(`${hoursFromStart} hours ${minutesFromStart} minutes ${secondsFromStart} seconds`);

      if (window.performance && window.performance.memory) {
        $('#wallHeapSizeLimit').text(humanize.filesize(window.performance.memory.jsHeapSizeLimit));
        $('#wallTotalHeapSize').text(humanize.filesize(window.performance.memory.totalJSHeapSize));
        $('#wallUsedHeapSize').text(humanize.filesize(window.performance.memory.usedJSHeapSize));
      }
    }, 1000);

    hideControls();
    setMetricsVisibility();
  }

  $('#wallCreate').click(onclick);
  $('#wall-controls-toggle').click(toggleControls);
  $('#show-metrics').on('change', setMetricsVisibility);

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
    name, 'tours-enabled', 'checkbox', true,
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
  onLoad,
  getLocalStorage,
  initLocalStorage,
  initializeWall,
};
