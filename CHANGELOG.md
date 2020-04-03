
# CLSP Changelog

## v0.17.0 - 2020-02-11 - Critical

* change the videojs element class from `vjs-mse-over-mqtt` to `vjs-clsp`
* update vulnerable dependencies
* update all outdated dependencies
* numerous memory leak fixes
* the video tags SHOULD now have a dedicated container for use by the CLSP plugin
* add functionality to switch stream source on internal player
* add externally available tour controller
* add stream play timeout handling in Conduit
* add CLSP publishing events
* handle streams that don't return data (with timeouts)
* handle invalid urls (with timeouts)
* rename IOV classes
* implement ConduitCollection
* implement StreamConfiguration
* implement TourController
* most constants (like timeout durations) are now configurable on instances
* improve async logic and error handling
* add timeouts to catch and respond to errors, which improves memory utilization
* IovPlayer no longer calls methods on its parent Iov
* IovPlayer now instantiates and controls its own Conduit
* split styles into multiple files
* add demo for tours
* each demo now has its own folder
* create constants for Conduit and Router events
* document Conduit and Router classes and files

## v0.16.3 - 2019-08-15 - Recommended

* Add debug logs
* emit "firstFrameShown" event
* fix streams flickering in certain situations
* remove jupyter notebook, which makes this project show as primarily javascript in github
* update destroy logic


## v0.16.0 - 2019-05-15 - Recommended

* Remove debug statements appearing as console errors
* Update all outdated npm dependencies
* Rearchitected interfaces between most classes, and among the videojs plugin components
* Added IOV Collection class to manage IOV instances
* De-coupled the CLSP-playing logic from videojs
* IOV is now the only class that communicates with the Conduit and the IOV Player
* Removed the requirement of videojs for playing CLSP streams
* Added explicit play, stop, fullscreen, and destroy methods to the CLSP player (IOV)
* Added explicit stop and destroy methods to the CLSP plugin
* Improved destroy logic
* Identify additional browsers
* Implement successful failover to HLS, if available
* Added support for `ononline` and `onoffline` window events
* Added new logging system
* Improved logging
* Improve jsdocs
* Created demo wall for CLSP player
* Created demo player for CLSP player
* Created demo player for CLSP plugin
* Created demo landing page
* Include code examples for common use cases in README
* Moved internal-developer-specific stuff from the README into DEVELOPERS.md


## v0.15.0 - 2018-12-07 - Critical

* update to node 10.15
* move to yarn from npm
* add Vagrantfile and steps
* update standard skyline development assets
* remove gulp, rely solely on bash scripts and webpack
* make iframe javascript reference parent window paho library to reduce code duplication
* minimize the iframe srcdoc javascript
* fix window minimize memory leak


## v0.13.11 - 2018-12-07 - Critical

* lock down paho version to ensure it doesn't update to 1.1.0, which is incompatible


## v0.13.10 - 2018-10-13 - Critical

* fix chrome detection for chrome v71


## v0.13.9 - 2018-10-13 - Critical

* update most outdated libraries
* update video.js version
* add memory stats to demo page
* update to videojs 7 to improve memory management
* make destroy synchronous
* performance / lifecycle improvements
* address errors
* improve debug statements
* perform null check on window.performance and memory
* when the buffer gets full, flush it


## v0.13.8 - 2018-11-14 - Critical

* fix unresolved sourceBuffer destroy
* ensure the asynchronous destroy logic can finish before videojs dispose runs/finishes
* document necessary videojs-errors version
* move videojs-errors into devdependencies


## v0.13.7 - 2018-11-13 - Optional

* set the default timeout back to 2 minutes


## v0.13.6 - 2018-11-13 - Critical

* fix async calls
* destroy self on player dispose
* implement disconnect conduit method
* WIP destroy player without error
* do not try to reconnect to CLSP after successful disconnection
* stop trying to send stats to the server on failure
* reset videojs-errors after responding to recoverable errors


## v0.13.5 - 2018-10-31 - Critical

* fix tab switching memory leak
* disable metrics by default to improve performance
* export version in main file
* implement player retry on error
* implement workaround for videojs 7 autoplay issue for a future version
* detect and throw error when too much browser resources are being used
* retry on iov player error
* check isSourceBufferReady before performing destroy operations on MSEWrapper
* additional null checks
* tracking "stopped" on iov player
* consolidate iov conduit actions on stop and play
* demo page allows user to close an individual player
* demo page only contains wall
* demo displays index number and stream url
* demo page remembers last used urls
* add standard skyline development assets
* fix webpack config mutations, which fixes dev server
* trigger a 'firstFrameShown' event on the videojs player instance so that the listener can be registered prior to iovplayer instantiation


## v0.13.4 - 2018-08-27 - Critical

* tours are no longer supported - must be implemented by the caller
* fix high quality stream playback (streams with large segment intervals)
* video elements are now properly muted, so user interaction is no longer required for autoplay on page load
* make drift detection values dynamically calculated based on metrics
* make freeze detection values dynamically calculated based on metrics
* improve metrics
* improve memory management
* improve error handling
* tour improvements
* ensure all moofs have proper and sequential sequence numbers
* properly display version number on registered plugin
* add version script to automatically build whenever version is incremented
* demo page tracks number of videos playing, time started, and time elapsed
* improve dev server
* file / class restructure
* decrease coupling between classes
* decrease coupling between videojs and iovPlayer
* update dependencies


## v0.12.1 - 2018-08-27 - Optional

* improve demo page


## v0.12.0 - 2018-08-13 - Critical

* metric collection and calculation
* implement a queue to reduce unecessarily-dropped video segments
* implement "burst control" to ensure that video segments are not skipped
* rudimentary tab visibility handling
* rudimentary "drift detection" to respond to increases in lag
* rudimentary "freeze detection" to respond to seemingly frozen streams
* reduce video stuttering
* improve error handling
* require videojs 6.7.1 (the last version to properly support autoplay)
* document relationship between SFS settings and player performance and guarantees
* demo page improvements
* display metrics on demo page
* abstract the logic for MSE
* decrease coupling between classes
* decrease coupling between videojs and iovPlayer
* update dependencies


## v0.10.2 - 2018-08-27 - Optional

* improve demo page


## v0.10.0 - 2018-08-01 - Critical

* first stable production-ready build
* support cycling through multiple clsp streams (tours)
* can respond to CLSP resync messages
* use default secure and non-secure ports
* rudimentary error handling
* updated demo page
* headless player demo
* use webpack, babel, es6, etc
* use npm to manage dependencies
* decrease coupling between classes
* decrease coupling between videojs and iovPlayer


## v0.1.5 - 2017-08-27 - Critical

* first stable proof of concept
* rudimentary demo page
* point of reference for basic video playing via clsp, no advanced features


## Appendices

### Status Definitions

* Critical - this version fixes critical issues that were discovered in the previous version, and it is critical that users update
* Recommended - this version fixes important issues or adds important functionality, and it is recommended that users update
* Optional - this version fixes minor issues or adds minor or optional functionality, and users can safely wait to update
