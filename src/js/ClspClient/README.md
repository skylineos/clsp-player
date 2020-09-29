# CLSP Client <!-- omit in toc -->

The CLSP Client is responsible for the connection to the CLSP server (Skyline SFS) and for all communication to and from it.

This is achieved via an iframe.  We chose to go with an iframe because it is the only way to guarantee that an arbitrary number of socket connections can be established per page.  A single html page has a limited number of individual socket connections it is allowed to make, so by making each video stream's socket connection via an independent iframe, we can bypass this socket connection limit and support an arbitrary number of streams / players per page.  This important for internal Skyline products such as Vero, Claris, and Stream Manager, but also important for third-party applications, e.g. an ATMS.


## Table of Contents <!-- omit in toc -->

- [Conduit](#conduit)
    - [`ConduitCollection.js`](#conduitcollectionjs)
    - [`Conduit.js`](#conduitjs)
- [Router](#router)
    - [`iframeEventHandlers.js`](#iframeeventhandlersjs)
    - [`Router.js`](#routerjs)
    - [Managers](#managers)
- [Workflow](#workflow)


## Conduit

Note that as the project has been iterated over, the term `Conduit` does not necessarily reflect the functionality that the files in the directory contain, and should be renamed.

### `ConduitCollection.js`

* singleton
* manage all `Conduit` instances
* serve as the single Window Message listener for `Router` messages
* route `Router` messages to the target `Conduit`

### `Conduit.js`

* compose the functionality of the various Router Managers
* route `Router` messages that come from `ConduitCollection` to the appropriate Router Manager
* provide an interface for the CLSP Player implementation (IOV Player)
* pass the video segements "up" to the CLSP Player


## Router

Note that as the project has been iterated over, the term `Router` does not necessarily reflect the functionality that the files in the directory contain, and should be renamed.

### `iframeEventHandlers.js`

This file contains the `<body>` `onload` and `onunload` event logic.  When the iframe is contstructed, these event handlers need to be set on the corresponding `<body>` tag attributes.  The `onload` handler constructs the `Router`, and the `onunload` handler destroys it.

### `Router.js`

This file contains the class that contains the logic necessary for CLSP server communication.  When the iframe is constructed, the file from this class must be injected into the iframe `<head>` tag to be used by the iframe event handlers.

* establish and maintain a websocket connection to the CLSP server.
* receive and execute commands from its parent Window
* pass return values from commands and CLSP server events up to the parent Window

### Managers

Each Router Manager file should handle a specific domain of CLSP server logic.  All domain logic is "composed" by the `Conduit` class.

```
                                                                      |-- RouterIframeManager
                                       (window message)               |      |-- iframeEventHandlers
                                            ---<-----<-----<-------<--|---<--|-- Router
                                            |                         |
                                            |                         |-- RouterTransactionManager
IovCollection -- Iov -- IovPlayer -- ConduitCollection -- Conduit --- |      |-- (RouterIframeManager)
                                                                      |
                                                                      |-- RouterConnectionManager
                                                                      |      |-- RouterStatsManager
                                                                      |      |-- (RouterTransactionManager)
                                                                      |
                                                                      |-- RouterStreamManager
                                                                      |      |-- (RouterTransactionManager)
```

## Workflow

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
