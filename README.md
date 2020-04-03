# videojs-mse-over-clsp <!-- omit in toc -->

A videojs plugin that adds support for video served over the `clsp` protocol.
Currently, this protocol is available only via Skyline's SFS solutions.

Note - this plugin currently only works in Chrome and Firefox.  Chrome is recommended for performance.
Note - this highest h.264 keyframe/iframe segment frequency this plugin currently supports is 2 per second.  This is different from frames per second.

## Table of Contents <!-- omit in toc -->

- [URL Structure](#url-structure)
  - [Tokenization](#tokenization)
    - [Hash](#hash)
- [Installation](#installation)
  - [Via NPM](#via-npm)
  - [Via Git](#via-git)
- [Usage](#usage)
  - [`<head>` Tag](#head-tag)
  - [`<video>` tag](#video-tag)
  - [`<script>` Tag](#script-tag)
- [Supported Browsers](#supported-browsers)
- [Dependencies](#dependencies)
- [License](#license)

## URL Structure

The new network protocol is handled by specifying the following URI format:

`[clsp protocol] :// [sfs-ip-address] : [port-number-of-web-socket] / [stream-name]`

* clsp or clsps
* the ip address is that of the SFS
* the port is not necessary unless it is something other than 80 or 443
* the stream name as defined on the SFS

Example stream url:

`clsp://172.28.12.57/FairfaxVideo0520`

### Tokenization

With the latest version of the CLSP plugin, you are able to control stream
access with two diferent token methods.

#### Hash

The MD5 hash authentication method provides authentication as well as stream
access time.

`[clsp protocol]-hash://[sfs-ip-address]:[port-number-of-web-socket]/[stream-name]?start=[time-epoch-seconds]&end=[time-epoch-seconds]&token=[hash-token]`

The token is created by appending a shared secret to the url. That new string is
used to create an MD5 hash. The shared secret must first be set up on the SFS and
the stream-requesting application.

> NOTE: When using the Hash method of authentication, the `[port-number-of-web-socket]` is a `REQUIRED` parameter.

In order to play a video stream that has Hash authentication enabed, there are 3 query parameters you need to pass
along with your URL. Here is the structure of a clsp/clsps hash enabled url.

```
clsps-hash://<host>[:port]/stream?start={epoch_seconds}&end={epoch_seconds}&token={hashed_url}

clsp-hash://<host>[:port]/stream?start={epoch_seconds}&end={epoch_seconds}&token={hashed_url}
```

- `start` contains the earliest time you want the stream to become available.
- `end` contains the latest time you want the stream to become available.
- `token` contains the entire url sans token, md5 + secret

## Installation

### Via NPM

Add the following entry to your `package.json` `dependencies` object:

```javascript
"dependencies": {
  // ...
  "videojs-mse-over-clsp": "git+https://github.com/skylineos/clsp-videojs-plugin.git#v0.15.0",
}
```

This plugin is not currently published on NPM.  We will be publishing it soon.


### Via Git

```
git clone https://github.com/skylineos/clsp-videojs-plugin.git
cd clsp-videojs-plugin
yarn install
```

## Usage

`@babel/polyfill` and `video.js` MUST be sourced/included prior to the plugin.

See `demo/simpleWithVideoJs.html` for a full example.

### `<head>` Tag

In the `<head>` of your page, include a line for the videojs and the clsp plugin styles:

```html
<head>
  <!-- VideoJS styles -->
  <link
    rel="stylesheet"
    href="//vjs.zencdn.net/7.6.6/video-js.min.css"
  >
  <!-- CLSP styles -->
  <link
    rel="stylesheet"
    href="../dist/videojs-mse-over-clsp.css"
  >
  <!-- Babel Polyfill -->
  <script
    type="text/javascript"
    src="//cdn.jsdelivr.net/npm/@babel/polyfill@7.7.0/dist/polyfill.min.js"
  ></script>
<head>
```


### `<video>` tag

We recommend wrapping the `video` tag in a container element (e.g. `div`) that
the CLSP plugin can mutate as needed.  The CLSP plugin needs to perform some
actions on the `video` element as well as its container.

On the HTML `video` tag, the `type` attribute must be the following:

`video/mp4; codecs='avc1.42E01E'`

This tells the browser exactly what codec to use to decode and play the video.
H.264 baseline 3.0 is a least common denominator codec supported on all browsers
(according to the MSE development page).

Here is a sample video element that defines a CLSP and an HLS stream

```html
<div>
  <video
    id="my-video"
    class="video-js vjs-default-skin"
    controls
  >
    <!-- CLSP Stream -->
    <source
      src="clsp://8.15.251.53/FairfaxVideo0510"
      type="video/mp4; codecs='avc1.42E01E'"
    />
    <!-- HLS Stream -->
    <source
      src="http://8.15.251.53:1935/rtplive/FairfaxVideo0510/playlist.m3u8"
      type="application/x-mpegURL"
    />
  </video>
</div>
```


### `<script>` Tag

This is the simplest case. Get the script in whatever way you prefer and include the plugin _after_ you include [video.js][videojs], so that the `videojs` global is available.

```html
<!-- VideoJS -->
<script src="//vjs.zencdn.net/7.6.6/video.min.js"></script>
<!-- CLSP Plugin -->
<script src="../dist/videojs-mse-over-clsp.min.js"></script>

<script>
  // construct the player
  var player = videojs('my-video');

  // Only use CLSP if in a supported browser
  if (window.clspUtils.supported()) {
    // Note - This must be executed prior to playing the video for CLSP streams
    player.clsp();
  }
</script>
```

## Supported Browsers

Chrome 52+ or Firefox are the browsers that this plugin currently supports.  All other browsers are currently not supported.


## Dependencies

`@babel/polyfill` `7.7.0` is required.

`video.js` `7.6.6` is the recommended version.  Version `6.x` is not recommended due to it being less performant over time.

If using `videojs-errors`, which is recommended, `4.2.0` is the recommended version, as it allows us to re-register successive errors to respond to successfive failures as necessary to support stream recovery.


## License

See the LICENSE file at the root of this repository.
