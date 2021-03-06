import './styles.scss';

import $ from 'jquery';

// simulate `import '@skylineos/clsp-player'`
import {
  IovCollection,
  TourController,
  utils,
} from '~root/dist/clsp-player.min.js';

/**
 * or with `require`....
 *
 * const {
 *   IovCollection,
 *   TourController,
 *   utils,
 * } = require('~root/dist/clsp-player.min.js');
 */

import {
  initializeWall,
  // createWall,
} from './shared';

let wallPlayers = [];

function destroyAllPlayers () {
  for (let i = 0; i < wallPlayers.length; i++) {
    const player = wallPlayers[i];

    player.destroy();
  }

  wallPlayers = [];
}

async function createPlayer (index, playerOptions) {
  const iovCollection = IovCollection.asSingleton();

  const videoId = `wall-video-${index}`;

  const $container = $('#videowall')
    .append(document.getElementById('wall-video-template').innerHTML)
    .find('#wall-container-null');

  const $video = $container.find('video');

  $video.attr('id', videoId);
  const videoElementId = $video[0].id;

  $container.attr('id', `wall-container-${index}`);
  $container.find('.video-stream .index').text(index);

  if (playerOptions.tour && playerOptions.tour.enabled) {
    const tour = TourController.factory(
      iovCollection,
      videoElementId,
      {
        intervalDuration: 10,
        onShown: (
          error, index, streamConfiguration,
        ) => {
          if (error) {
            console.error(`Failed to play stream ${streamConfiguration.url}`);
            console.error(error);
            return;
          }

          $container.find('.video-stream .url').text(`(${index}/${tour.streamConfigurations.length}) ${streamConfiguration.url}`);
          $container.find('.video-stream .url').attr('title', streamConfiguration.url);
        },
      },
    );

    tour.addUrls(playerOptions.sources.map((source) => source.src));
    tour.start(playerOptions.sources, playerOptions.tour.interval);

    $container.find('.video-stream .close').on('click', () => {
      $('#wallTotalVideos').text(parseInt($('#wallTotalVideos').text(), 10) - 1);
      tour.stop();
    });
  }
  else {
    const url = playerOptions.sources[0].src;

    $container.find('.video-stream .url').text(url);
    $container.find('.video-stream .url').attr('title', url);

    const iov = iovCollection.create({ videoElementId });

    iov.changeSrc(url).catch(function (error) {
      console.error('Error while playing stream in demo:');
      console.error(error);
    });

    wallPlayers.push(iov);

    $container.find('.video-stream .close').on('click', () => {
      $('#wallTotalVideos').text(parseInt($('#wallTotalVideos').text(), 10) - 1);
      iovCollection.remove(iov.id);
    });
  }
}

$(() => {
  const localStorageName = 'clsp-player-advanced-demo-src';

  document.title = `v${utils.version} ${document.title}`;

  const pageTitle = $('#page-title').html();
  $('#page-title').html(`${pageTitle} <br /> v${utils.version}`);

  utils.setDefaultStreamPort('clsp', 9001);

  initializeWall(
    localStorageName,
    createPlayer,
    destroyAllPlayers,
  );

  // createWall(
  //   localStorageName,
  //   createPlayer,
  //   destroyAllPlayers,
  // );
});
