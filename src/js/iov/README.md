# CLSP Player

@todo


## Files

### `index.js`

The entrypoint file for using the CLSP Player without VideoJS.  Only exposes the IovCollection

### `IovCollection.js`

The singleton that serves as the controller for the collection of all Iov instances for a given page.

### `Iov.js`

The Iov controls the DOM elements that are needed to play a CLSP video, and it exposes the necessary methods from the internal player.

### `StreamConfiguration.js`

A configuration object that contains all the necessary stream data.  It does not contain a `clientId`.

### `IovPlayer.js`

The IovPlayer controls both the Conduit for receiving the stream and the MSEWrapper to play the video.

### `MSEWrapper.js`

The controller for the browser's experimental Media Source Extensions.

### `mp4-inspect.js`

A utility for inspecting moofs.  Only used for development debugging.  It is not included in the `dist`.
