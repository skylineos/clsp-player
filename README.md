# Skyline CLSP Player <!-- omit in toc -->

An html5 CLSP video player.  CLSP is a proprietary near-real-time video streaming protocol only available via Skyline's SFS solutions.

The highest h.264 keyframe/iframe segment frequency this player currently supports is 2 per second (this is different from frames per second).


## Table of Contents <!-- omit in toc -->

- [Supported Browsers](#supported-browsers)
  - [Desktop](#desktop)
  - [Mobile](#mobile)
- [URL Structure](#url-structure)
  - [Tokenization](#tokenization)
    - [Hash](#hash)
- [Installation](#installation)
  - [Via Yarn](#via-yarn)
  - [Via NPM](#via-npm)
- [Using with `<script>` tag](#using-with-script-tag)
  - [`<head>` Tag](#head-tag)
  - [`<script>` Tag](#script-tag)
  - [`<video>` tag](#video-tag)
- [Using with `import` or `require`](#using-with-import-or-require)
  - [JS](#js)
  - [Styles (SASS)](#styles-sass)

## Supported Browsers

### Desktop

* Google Chrome 53+
* Mozilla Firefox 70+
* Microsoft Edge 80+ (Chromium-based)

All other desktop browsers are currently not supported.

### Mobile

@todo


## URL Structure

The network protocol is handled by specifying the following URI format:

`[clsp protocol] :// [sfs-ip-address] : [port-number-of-web-socket] / [stream-name]`

* `clsp protocol`: clsp or clsps
* `sfs-ip-address`: the ip address is that of the SFS
* `port-number-of-web-socket`: the port is not necessary unless it is something other than 80 or 443
* `stream-name`: the stream name as defined on the SFS

Example stream url:

`clsp://172.28.12.57:9001/FairfaxVideo0520`

### Tokenization

With the latest version of the CLSP Player, you are able to control stream access with two diferent token methods.

#### Hash

The MD5 hash authentication method provides authentication as well as stream access time.

`[clsp protocol]-hash://[sfs-ip-address]:[port-number-of-web-socket]/[stream-name]?start=[time-epoch-seconds]&end=[time-epoch-seconds]&token=[hash-token]`

The token is created by appending a shared secret to the url. That new string is used to create an MD5 hash. The shared secret must first be set up on the SFS and the stream-requesting application.

> NOTE: When using the Hash method of authentication, the `[port-number-of-web-socket]` is a **REQUIRED** parameter.

In order to play a video stream that has Hash authentication enabed, there are 3 query parameters you need to pass along with your URL. Here is the structure of a clsp/clsps hash enabled url.

```
clsps-hash://<host>[:port]/stream?start={epoch_seconds}&end={epoch_seconds}&token={hashed_url}

clsp-hash://<host>[:port]/stream?start={epoch_seconds}&end={epoch_seconds}&token={hashed_url}
```

* `start`: contains the earliest time you want the stream to become available.
* `end`: contains the latest time you want the stream to become available.
* `token`: contains the entire url sans token, md5 + secret


## Installation

### Via Yarn

```
yarn add @skylineos/clsp-player
```

### Via NPM

```
npm i @skylineos/clsp-player
```


## Using with `<script>` tag

NOTE: See `demos/simple-dist/` and `demos/advanced-dist/` for full examples.

A `CLSP` object is attached to `window`, which contains the classes and utils you need to create players.

### `<head>` Tag

```html
<head>
  <!-- load CLSP Player styles -->
  <link
    rel="stylesheet"
    href="/path/to/dist/clsp-player.css"
  >
<head>
```

### `<script>` Tag

```html
<!-- load CLSP Player in `head` or `body` -->
<script src="/path/to/dist/clsp-player.min.js"></script>

<!-- use CLSP Player at end of `body` -->
<script>
  var videoElementId = 'my-video';
  var urls = [
    'clsp://172.28.12.57:9001/FairfaxVideo0520',
    'clsp://172.28.12.57:9001/FairfaxVideo0420',
  ];

  // If you are using a Skyline SFS that uses a default CLSP stream port that
  // isn't `80` (e.g. SFS < v5.2.0), you may set the window-level default port
  // for `clsp` streams:
  window.CLPS.utils.setDefaultStreamPort('clsp', 9001);

  // Construct the player collection
  var iovCollection = window.CLSP.IovCollection.asSingleton();

  // Instantiate the iov instance for the target video element
  iovCollection.create(videoElementId)
    .then(function (iov) {
      // do something with the iov instance
      iov.changeSrc(urls[0]);
    })
    .catch(function (error) {
      // do something with the error
      console.error(error);
    });

  // Or instantiate a tour
  var tour = window.CLSP.TourController.factory(
    iovCollection,
    videoElementId,
    {
      intervalDuration: 10,
    },
  );

  tour.addUrls(urls);
  tour.start();
</script>
```

### `<video>` tag

We recommend wrapping the `video` tag in a container element (e.g. `div`) that the CLSP Player can mutate as needed.  The CLSP Player needs to perform some actions on the `video` element as well as its container.

Note that for `clsp` streams, the `src` tag must have a `type` attribute with a value of `video/mp4; codecs='avc1.42E01E'`.

This tells the browser exactly what codec to use to decode and play the video.  H.264 baseline 3.0 is a least common denominator codec supported on all browsers (according to the MSE development page).

```html
<div class="video-container">
  <div class="clsp-container-fit">
    <video
      id="my-video"
      muted
      playsinline
    >
      <source
        src="clsp://172.28.12.57:9001/FairfaxVideo0520"
        type="video/mp4; codecs='avc1.42E01E'"
      />
    </video>
  </div>
</div>
```


## Using with `import` or `require`

NOTE: See `demos/simple-src/` and `demos/advanced-src/` for full examples.

### JS

```js
import {
  IovCollection,
  TourController,
  utils,
} from '@skylineos/clsp-player';

const videoElementId = 'my-video';
const urls = [
  'clsp://172.28.12.57:9001/FairfaxVideo0520',
  'clsp://172.28.12.57:9001/FairfaxVideo0420',
];

try {
  // If you are using a Skyline SFS that uses a default CLSP stream port that
  // isn't `80` (e.g. SFS < v5.2.0), you may set the window-level default port
  // for `clsp` streams:
  utils.setDefaultStreamPort('clsp', 9001);

  // Construct the player collection
  const iovCollection = IovCollection.asSingleton();

  // Instantiate the iov instance for the target video element
  const iov = await iovCollection.create(videoElementId);

  // do something with the iov instance
  iov.changeSrc(urls[0]);

  // Or instantiate a tour
  const tour = TourController.factory(
    iovCollection,
    videoElementId,
    {
      intervalDuration: 10,
    },
  );

  tour.addUrls(urls);
  tour.start();
}
catch (error) {
  // do something with the error
  console.error(error);
}
```

### Styles (SASS)

```scss
@import '/path/to/node_modules/@skylineos/clsp-player/dist/clsp-player.css';
// or import it from src
@import '/path/to/node_modules/@skylineos/clsp-player/src/styles/clsp-player.scss';
```
