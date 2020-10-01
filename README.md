# Skyline CLSP Player <!-- omit in toc -->

An html5 CLSP video player.  CLSP is a proprietary near-real-time video streaming protocol only available via Skyline's SFS solutions.


## Table of Contents <!-- omit in toc -->

- [Supported Browsers](#supported-browsers)
  - [Desktop](#desktop)
  - [Mobile](#mobile)
- [CLSP Streams](#clsp-streams)
  - [URL Structure](#url-structure)
  - [Tokenization](#tokenization)
    - [Hash](#hash)
  - [Default Port](#default-port)
- [Installation](#installation)
  - [Via Yarn](#via-yarn)
  - [Via NPM](#via-npm)
- [Use](#use)
  - [via `<script>` tag](#via-script-tag)
    - [`<head>` Tag](#head-tag)
    - [`<script>` Tag](#script-tag)
    - [`<video>` tag](#video-tag)
  - [via `import` or `require`](#via-import-or-require)
    - [JS](#js)
    - [Styles (SASS)](#styles-sass)
    - [`<video>` tag](#video-tag-1)

## Supported Browsers

### Desktop

* Google Chrome 53+
* Mozilla Firefox 70+
* Microsoft Edge 80+ (Chromium-based)

All other desktop browsers are currently not supported.

### Mobile

@todo


## CLSP Streams

The highest h.264 keyframe/iframe segment frequency this player currently supports is 2 per second (this is different from frames per second).

### URL Structure

The network protocol is handled by specifying the following URI format:

`[clsp protocol] :// [sfs-host] : [port-number-of-web-socket] / [stream-name]`

* `clsp protocol`: `clsp` or `clsps`
* `sfs-host`: the host (or ip address) of the Skyline SFS
* `port-number-of-web-socket`: optional, @see [Default Port](#default-port)
* `stream-name`: the stream name as defined on the Skyline SFS

Example stream url:

`clsp://sfs.somecity.com/CityFeedVideo0652`

*Note* that many Skyline SFS production LTS deployments use a default port of `9001`.  To accomodate for this, you do not necessarilly need to append the port `9001` to every `clsp` url.  You can use the utility method `utils.setDefaultStreamPort`, which is documented below.

### Tokenization

Control stream access via hash tokens.

#### Hash

The MD5 hash authentication method provides authentication as well as stream access time.

```
[clsp-hash protocol]://[sfs-host]:[port-number-of-web-socket]/[stream-name]
  ?start=[time-epoch-seconds]
  &end=[time-epoch-seconds]
  &token=[hash-token]
```

* `clsp-hash protocol`: `clsp-hash` or `clsps-hash`
* `sfs-host`: the host (or ip address) of the Skyline SFS
* `port-number-of-web-socket`: required, @see [Default Port](#default-port)
* `stream-name`: the stream name as defined on the Skyline SFS
* `start`: contains the earliest time you want the stream to become available.
* `end`: contains the latest time you want the stream to become available.
* `token`: contains the entire url sans token, md5 + secret

The token is created by appending a shared secret to the url. That new string is used to create an MD5 hash. The shared secret must first be set up on the Skyline SFS and the stream-requesting application.  You will need to work with Skyline to configure and use hash token support.


### Default Port

| protocol / SFS version | >= v5.2.0 | < v5.2.0 |
| :--------------------: | :-------: | :------: |
| `clsp`                 | 80        | 9001     |
| `clsps`                | 443       | 443      |

*Note* that many Skyline SFS production LTS deployments use a default port of `9001`.  To accomodate for this, you do not necessarilly need to append the port `9001` to every `clsp` url.  You can use the utility method `utils.setDefaultStreamPort`, which is documented below.


## Installation

### Via Yarn

```
yarn add @skylineos/clsp-player
```

### Via NPM

Note that installation /use via `yarn` is recommended as it is what we use for development, testing, and dependency management.

```
npm i @skylineos/clsp-player
```


## Use

### via `<script>` tag

NOTE: See `demos/single-player/` and `demos/advanced-dist/` for full examples.

A `CLSP` object is attached to `window`, which contains the classes and utils you need to create players.

#### `<head>` Tag

```html
<head>
  <!-- load CLSP Player styles -->
  <link
    rel="stylesheet"
    href="/path/to/dist/clsp-player.css"
  >
<head>
```

#### `<script>` Tag

```html
<!-- load CLSP Player in `head` or `body` -->
<script src="/path/to/dist/clsp-player.min.js"></script>

<!-- use CLSP Player at end of `body` -->
<script>
  var videoElementId = 'my-video';
  var urls = [
    'clsps://bd-demo-sfs1.skyvdn.com/testpattern',
    'clsps://bd-demo-sfs1.skyvdn.com/testpattern',
  ];

  // If you are using a Skyline SFS that uses a default CLSP stream port that
  // isn't `80` (e.g. SFS < v5.2.0), you may set the window-level default port
  // for `clsp` streams:
  window.CLSP.utils.setDefaultStreamPort('clsp', 9001);

  // Construct the player collection
  var iovCollection = window.CLSP.IovCollection.asSingleton();

  // Instantiate the iov instance for the target video element
  var iov = iovCollection.create({
    videoElementId: videoElementId,
  })

  // play a CLSP stream with the iov instance
  iov.changeSrc(urls[0])
    .then(/*..*/)
    .catch(/*..*/);
</script>
```

#### `<video>` tag

We recommend wrapping the `video` tag in a container element (e.g. `div`) that the CLSP Player can mutate as needed.  The CLSP Player needs to perform some actions on the `video` element as well as its container.

Note that for `clsp` streams, the `src` tag must have a `type` attribute with a value of `video/mp4; codecs='avc1.42E01E'`.

This tells the browser exactly what codec to use to decode and play the video.  H.264 baseline 3.0 is a least common denominator codec supported on all browsers (according to the MSE development page).

```html
<div class="video-container">
  <div class="clsp-player-container clsp-container-fit">
    <video id="my-video"></video>
  </div>
</div>
```

### via `import` or `require`

NOTE: See `demos/single-player/` and `demos/advanced-src/` for full examples.

#### JS

```js
import {
  IovCollection,
  utils,
} from '@skylineos/clsp-player';

const videoElementId = 'my-video';
const urls = [
  'clsps://bd-demo-sfs1.skyvdn.com/testpattern',
  'clsps://bd-demo-sfs1.skyvdn.com/testpattern',
];

try {
  // If you are using a Skyline SFS that uses a default CLSP stream port that
  // isn't `80` (e.g. SFS < v5.2.0), you may set the window-level default port
  // for `clsp` streams:
  utils.setDefaultStreamPort('clsp', 9001);

  // Construct the player collection
  const iovCollection = IovCollection.asSingleton();

  // Instantiate the iov instance for the target video element
  const iov = iovCollection.create({ videoElementId });

  // play a CLSP stream with the iov instance
  await iov.changeSrc(urls[0]);
}
catch (error) {
  // do something with the error
  console.error(error);
}
```

#### Styles (SASS)

```scss
@import '/path/to/node_modules/@skylineos/clsp-player/dist/clsp-player.css';
// or import it from src
@import '/path/to/node_modules/@skylineos/clsp-player/src/styles/clsp-player.scss';
```

#### `<video>` tag

We recommend wrapping the `video` tag in a container element (e.g. `div`) that the CLSP Player can mutate as needed.  The CLSP Player needs to perform some actions on the `video` element as well as its container.

```html
<!-- The outer container used for your styling -->
<div class="video-container">
  <!-- The inner container used by CLSP for styling and other operations -->
  <div class="clsp-player-container clsp-container-fit">
    <video id="my-video"></video>
  </div>
</div>
```
