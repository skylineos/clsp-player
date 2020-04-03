# CLSP Video Conduit

In order for a client to receive CLSP video from an SFS, it must first make a websocket connection to the SFS, then send the recevied video segments to the browser's Media Source Extensions API.

The video segments that are received by the SFS are called "moofs" and are units of video that are natively compatible with the browser MSE API.

Since the SFS streams video via CLSP, a CLSP connection must be requested by the client.  This request must contain some kind of identifier that the SFS will publish to.  This is an important detail, because if the identifier is not unique, meaning if a client requests a stream using an identifier that has already been used by another client (globally! meaning someone in another browser), the SFS will publish more than one stream to the same channel.  This is why we use a universally unique identifier as the `clientId`; it minimizes the chances that any user of that SFS requests a stream channel that is already being published to.

One websocket connection is needed for each stream.  Browsers limit the number of individual websocket connections on a single page.  This limitation means that we can only play a small number of streams per page.  We get around this limitation by creating an iframe for each stream, and making the websocket connection for that stream in that iframe.  The browsers do not limit the number of websocket connections across the page and all iframes, so by using iframes to make the websocket connection for a single stream, we can stream an arbitrary number of CLSP streams on a single page.

Since the communication between an iframe and the parent window is basic and limited to window message events, the Router class was created as a way to send the data received by the websocket connection to the SFS via Paho up to the parent window.

The Conduit acts as the controller in the parent window that is capable of orchestrating the Router and interpreting the window messages sent up by the Router in the iframe.

The Conduit is responsible for creating its own iframe to house the Router.  Currently, this iframe DOM element is created as a sibling to the video element that is to be used to display the video in the browser.  The Router code is duplicated each time an iframe is created, which is why there is a note at the top of the Router file to make it as small as possible and to write the code to the ES5 standard (until we stop supporting browsers that do not support ES6; however, for the time being, we will still restrict webpack/babel processing on this file since it is included in its raw form as a string by the Conduit).

The role of the Conduit is to facilitate getting video segments to the JS code that can process the video via MSE.  The video processing layer is currently the IovPlayer (which is out of the scope of this README).

The ConduitCollection is meant to be the controller for all Conduit instances on a given page.  It is important to use this collection because there are certain "global" events that need to be handled (specifically, the window message event) centrally.  It also offers better logging and a simpler API.

This is the recommended workflow for retreiving CLSP streams from an SFS:

* The video player will use the ConduitCollection singleton to instantiate one Conduit per stream
* The Conduit will create an iframe
* onload, the iframe will instantiate a Router
* The Conduit will orchestrate the Router to make the connection and start receiving video segments
* The Conduit will receive the video segments from the Router
* The Conduit will execute the `onMoof` callback that is sent to the `play` method to pass the video segments to the caller (the `IovPlayer`)


## Files

### `ConduitCollection.js`

This file contains the ConduitCollection class, which controls the collection of all Conduits for the page.  It also registers the global window event listener for messages, and delegates those messages to the correct Conduit.

### `Conduit.js`

This file contains the Conduit class.  The Conduit is responsible for controlling the Router, receiving the CLSP video data from the Router, and passing it up (e.g. to the IovPlayer)

### `Router.js`

This file contains the following:

* Router class
* iframe `onload` handler
* iframe `onunload` handler

The purpose of the Router is to establish (and manage) a single websocket connection to an SFS, and transmit the data (video segements) to the parent window.
