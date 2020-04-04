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
  - [Via NPM](#via-npm)
  - [Via Yarn](#via-yarn)
- [Usage](#usage)
  - [`<head>` Tag](#head-tag)
  - [`<video>` tag](#video-tag)
  - [`<script>` Tag](#script-tag)
- [Dependencies](#dependencies)

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

`clsp://172.28.12.57/FairfaxVideo0520`

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

### Via NPM

```
npm i @skylineos/clsp-player
```

### Via Yarn

```
yarn add @skylineos/clsp-player
```


## Usage

`@babel/polyfill` MUST be sourced/included prior to the CLSP Player.

See `demo/simple.html` for a full example.

### `<head>` Tag

In the `<head>` of your page, include a line for the CLSP Player styles:

```html
<head>
  <!-- CLSP styles -->
  <link
    rel="stylesheet"
    href="../dist/clsp-player.css"
  >
  <!-- Babel Polyfill -->
  <script
    type="text/javascript"
    src="//cdn.jsdelivr.net/npm/@babel/polyfill@7.7.0/dist/polyfill.min.js"
  ></script>
<head>
```

### `<video>` tag

We recommend wrapping the `video` tag in a container element (e.g. `div`) that the CLSP Player can mutate as needed.  The CLSP Player needs to perform some actions on the `video` element as well as its container.

On the HTML `video` tag, the `type` attribute must be the following:

```
video/mp4; codecs='avc1.42E01E'
```

This tells the browser exactly what codec to use to decode and play the video.  H.264 baseline 3.0 is a least common denominator codec supported on all browsers (according to the MSE development page).

Here is a sample video element that defines a CLSP stream:

```html
<div class="video-container">
  <div>
    <video
      id="my-video"
      muted
    >
      <source
        src="clsp://172.28.12.57/FairfaxVideo0520"
        type="video/mp4; codecs='avc1.42E01E'"
      />
    </video>
  </div>
</div>
```

### `<script>` Tag

```html
<!-- CLSP Player -->
<script src="../dist/clsp-player.min.js"></script>

<script>
  // Construct the player collection
  window.iovCollection = window.IovCollection.asSingleton();

  // Instantiate the iov instance for this video element id
  window.iovCollection.create('my-video')
    .then(function (iov) {
      // do something with the iov instance
    })
    .catch(function (error) {
      // do something with the error
    });
</script>
```


## Dependencies

`@babel/polyfill` `7.8.7` is required.
