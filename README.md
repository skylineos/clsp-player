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
- [Using with `dist` assets](#using-with-dist-assets)
  - [`<head>` Tag](#head-tag)
  - [`<script>` Tag](#script-tag)
  - [`<video>` tag](#video-tag)
- [Using with `src` assets](#using-with-src-assets)
  - [JS](#js)
  - [Styles (SASS)](#styles-sass)
  - [Webpack](#webpack)

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
yarn add @babel/polyfill @skylineos/clsp-player
```

### Via NPM

```
npm i @babel/polyfill @skylineos/clsp-player
```


## Using with `dist` assets

NOTE: See `demos/simple-dist/` and `demos/advanced-dist/` for full examples.

NOTE: `@babel/polyfill` MUST be sourced/included prior to the CLSP Player.

### `<head>` Tag

```html
<head>
  <!-- CLSP Player styles -->
  <link
    rel="stylesheet"
    href="/path/to/dist/clsp-player.css"
  >
  <!-- Babel Polyfill -->
  <script
    type="text/javascript"
    src="//cdn.jsdelivr.net/npm/@babel/polyfill@7.8.7/dist/polyfill.min.js"
  ></script>
<head>
```

### `<script>` Tag

```html
<!-- CLSP Player -->
<script src="/path/to/dist/clsp-player.min.js"></script>

<script>
  var videoElementId = 'my-video';

  // If you are using a Skyline SFS that uses a default CLSP stream port that
  // isn't `80` (e.g. SFS < v5.2.0), you may set the window-level default port
  // for `clsp` streams:
  window.clspUtils.setDefaultStreamPort('clsp', 9001);

  // Construct the player collection
  var iovCollection = window.IovCollection.asSingleton();

  // Instantiate the iov instance for this video element id
  iovCollection.create(videoElementId)
    .then(function (iov) {
      // do something with the iov instance
      iov.changeSrc('clsp://172.28.12.57:9001/FairfaxVideo0520');
    })
    .catch(function (error) {
      // do something with the error
    });

  // Or instantiate a tour
  var tour = window.TourController.factory(
    window.IovCollection.asSingleton(),
    videoElementId,
    {
      intervalDuration: 10,
    },
  );

  tour.addUrls([
    'clsp://172.28.12.57:9001/FairfaxVideo0520',
    'clsp://172.28.12.57:9001/FairfaxVideo0420',
  ]);

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


## Using with `src` assets

NOTE: See `demos/simple-src/` and `demos/advanced-src/` for full examples.

NOTE: `@babel/polyfill` MUST be sourced/included prior to the CLSP Player.

### JS

```js
import '@babel/polyfill';

import clspUtils from '~root/src/js/utils/utils';
import IovCollection from '~root/src/js/iov/IovCollection';
import TourController from '~root/src/js/iov/TourController';

const videoElementId = 'my-video';
const urls = [
  'clsp://172.28.12.57:9001/FairfaxVideo0520',
  'clsp://172.28.12.57:9001/FairfaxVideo0420',
];

// If you are using a Skyline SFS that uses a default CLSP stream port that
// isn't `80` (e.g. SFS < v5.2.0), you may set the window-level default port
// for `clsp` streams:
clspUtils.setDefaultStreamPort('clsp', 9001);

const iovCollection = IovCollection.asSingleton();
const iov = await iovCollection.create(videoElementId);

iov.changeSrc(urls[0]);

// tour

const tour = TourController.factory(
  IovCollection.asSingleton(),
  videoElementId,
  {
    intervalDuration: 10,
  },
);

tour.addUrls(urls);
tour.start();
```

### Styles (SASS)

```scss
@import '/path/to/node_modules/@skylineos/clsp-player/src/styles/clsp-player.scss';
```

### Webpack

Create a specific module rule for the CLSP Player in your common webpack config.  This is necessary since the CLSP Player source uses modern ES6+ features and webpack will ignore files in node_modules by default.

The following peer dependencies are required to build via webpack:

* `@babel/polyfill`
* `@babel/core`
* `babel-loader`
* `@babel/preset-env`
* `@babel/plugin-transform-typeof-symbol`
* `@babel/plugin-syntax-dynamic-import`
* `@babel/plugin-proposal-object-rest-spread`
* `@babel/plugin-proposal-class-properties`
* webpack SASS toolchain if using SASS src files.  See `webpack.common.js` for an example.

Sample webpack config:

```js
{
  module: {
    rules: [
      {
        test: /.*clsp-player\/(src|demos).*\.js$/,
        loader: 'babel-loader?cacheDirectory=true',
        options: {
          presets: [
            [
              '@babel/preset-env',
              {
                // Prevents "ReferenceError: _typeof is not defined" error
                exclude: [
                  '@babel/plugin-transform-typeof-symbol',
                ],
              },
            ],
          ],
          plugins: [
            '@babel/plugin-syntax-dynamic-import',
            '@babel/plugin-proposal-object-rest-spread',
            '@babel/plugin-proposal-class-properties',
          ],
        },
      },
    ],
  },
}
```
