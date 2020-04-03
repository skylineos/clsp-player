# videojs-clsp Developer Notes

## Getting Started

1. Install node 10.15 via nvm or tj/n
1. Install yarn using one of the following methods:
    * via yarn's site - [https://yarnpkg.com/en/docs/install](https://yarnpkg.com/en/docs/install)
    * via yvm - [https://yvm.js.org/docs/overview](https://yvm.js.org/docs/overview)
1. `yarn install`
1. `yarn run serve`

## Webpack

When using with Webpack, you will need to register the global videojs in your webpack config file:

```javascript
{
  // ...
  alias: {
    'video.js$': path.resolve(__dirname, 'node_modules', 'video.js'),
  }
}
```

In your code, you will need to set videojs on the window prior to requiring this plugin:

```javascript
import '@babel/polyfill';
import videojs from 'video.js';

window.videojs = videojs;

// The actual plugin function is exported by this module, but it is also
// attached to the `Player.prototype`; so, there is no need to assign it
// to a variable.
require('videojs-mse-over-clsp');

const player = videojs('my-video');

// Only use CLSP if in a supported browser
if (window.clspUtils.supported()) {
  // Note - This must be executed prior to playing the video for CLSP streams
  player.clsp();
}
```

## Development Environment

Node 10.15.x is required to run the necessary build and development scripts.

One option for installing node in a development environment is to use the node version manager ["n"](https://github.com/tj/n).  If you're using Windows, you can get an installer from [Node's website](https://nodejs.org/en/download/).

## Build

Note: If you ae installing on ubuntu the package for nodejs is way out of date, you will need to follow the instructions here to upgrade node: https://github.com/tj/n

After making changes to the plugin, build the project to generate a distributable, standalone file:

```
yarn run build
```

The generated files will be available in the `dist` directory.


## Run test server

1. `yarn run serve`
1. navigate to [http://localhost:8080](http://localhost:8080) in Chrome
1. add a `clsp` url to any of the inputs, then click submit
1. click play on the video element (if not using an autoplay player)


## Vagrant

1. `cp scripts/deploy/Vagrantfile ..`
1. `vagrant destroy -f && vagrant up && vagrant ssh`
1. `cd /vagrant/clsp-videojs-plugin`
1. `rm -rf node_modules`
1. `sudo scripts/deploy/provision-bootstrap.sh`
1. `yarn install`
1. `yarn run serve:vagrant`
1. [http://5.5.5.4:8080](http://5.5.5.4:8080)


## Versioning

@see:

* [https://yarnpkg.com/lang/en/docs/cli/version/](https://yarnpkg.com/lang/en/docs/cli/version/)
* [https://semver.org/](https://semver.org/)


* `yarn version --new-version 1.2.3+4`


## References

1. [https://github.com/videojs/generator-videojs-plugin](https://github.com/videojs/generator-videojs-plugin)
1. [https://github.com/videojs/Video.js/blob/master/docs/guides/plugins.md](https://github.com/videojs/Video.js/blob/master/docs/guides/plugins.md)
1. [https://github.com/videojs/generator-videojs-plugin/blob/master/docs/conventions.md](https://github.com/videojs/generator-videojs-plugin/blob/master/docs/conventions.md)


## @todos

* get rid of vagrant, use docker for development environment
* every time a stream plays via videojs, a generic error is shown in the console: Uncaught (in promise) DOMException - it seems that claris player can supress this error message
* when stopped, if the tab is switched, the stream resumes playing - it should remain stopped
* make the advanced demo logic shared between the two advanced demos
* implement linter
* create dispose methods for all classes
* make iov initialize execute once, and by default
* minify css
* hot reload?
* hash in filenames via webpack?
* when switching tabs, if a videojs player hasn't played the clsp stream yet, we get the following error: `Uncaught (in promise) TypeError: Cannot read property 'trigger' of undefined`
* decouple the MSE abstraction by creating separate mediasource and sourcebuffer abstractions
* improve metrics
* improve memory management
* improve error handling
