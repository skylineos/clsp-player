'use strict';

import './styles.scss';

import '@babel/polyfill';

import $ from 'jquery';

import packageJson from '~root/package.json';
import {
  onLoad,
  initializeWall,
} from './shared';
import TourController from '../../src/js/iov/TourController';

window.CLSP_DEMO_VERSION = packageJson.version;

let wallPlayers = [];

function destroyAllPlayers () {
  for (let i = 0; i < wallPlayers.length; i++) {
    const player = wallPlayers[i];

    player.destroy();
  }

  wallPlayers = [];
}

async function createPlayer(index, playerOptions) {
  const iovCollection = window.IovCollection.asSingleton();

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
      iovCollection, videoElementId, {
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

    const $videoMetrics = $container.find('.wall-video-metrics');

    const metricTypes = [
      // ClspPlugin().METRIC_TYPES,
      // IOV.METRIC_TYPES,
      // Conduit.METRIC_TYPES,
      // IOVPlayer.METRIC_TYPES,
      // MediaSourceWrapper.METRIC_TYPES,
      // SourceBufferWrapper.METRIC_TYPES,
    ];

    for (let i = 0; i < metricTypes.length; i++) {
      const metricType = metricTypes[i];

      for (let j = 0; j < metricType.length; j++) {
        const text = metricType[j];
        const name = text.replace(new RegExp(/\./, 'g'), '-');
        const $metric = $('<div/>', {
          class: `metric ${name}`,
        });

        $metric.append($('<span/>', {
          class: 'value',
        }));
        $metric.append($('<span/>', {
          class: 'type',
          title: text,
          text,
        }));

        $videoMetrics.append($metric);
      }
    }

    const iov = await iovCollection.create(videoElementId);

    iov.changeSrc(url);

    wallPlayers.push(iov);

    // iov.on('metric', (event, { metric }) => {
    //   $videoMetrics.find(`.${metric.type.replace(new RegExp(/\./, 'g'), '-')} .value`)
    //     .attr('title', metric.value)
    //     .html(metric.value);
    // });

    $container.find('.video-stream .close').on('click', () => {
      $('#wallTotalVideos').text(parseInt($('#wallTotalVideos').text(), 10) - 1);
      iovCollection.remove(iov.id);
    });
  }
}

$(() => {
  const name = 'clspStandalone';

  onLoad();

  initializeWall(name, createPlayer, destroyAllPlayers);
});
