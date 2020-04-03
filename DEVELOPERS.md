# CLSP Player Developer Notes <!-- omit in toc -->


## Table of Contents <!-- omit in toc -->

- [Getting Started](#getting-started)
- [Build](#build)
- [Run test server](#run-test-server)
- [Versioning](#versioning)
- [References](#references)


## Getting Started

1. Install node >=10
    * Linux: via `tj/n`
    * Windows: NVM
1. Install yarn using one of the following methods:
    * via yarn's site - [https://yarnpkg.com/en/docs/install](https://yarnpkg.com/en/docs/install)
    * via yvm - [https://yvm.js.org/docs/overview](https://yvm.js.org/docs/overview)
1. `yarn install`
1. `yarn run serve`


## Build

After making changes, build the project to generate a distributable, standalone file:

```
yarn run build
```

The generated files will be available in the `dist` directory.


## Run test server

1. `yarn run serve`
1. navigate to [http://localhost:8080](http://localhost:8080)
1. add a `clsp` url to any of the inputs, then click submit
1. click play on the video element (if not using an autoplay player)


## Versioning

@see:

* [https://yarnpkg.com/lang/en/docs/cli/version/](https://yarnpkg.com/lang/en/docs/cli/version/)
* [https://semver.org/](https://semver.org/)

```
yarn version --new-version 1.2.3+4
```

## References

* [https://developer.mozilla.org/en-US/docs/Web/API/MediaSource](https://developer.mozilla.org/en-US/docs/Web/API/MediaSource)
* [https://developers.google.com/web/updates/2017/09/autoplay-policy-changes](https://developers.google.com/web/updates/2017/09/autoplay-policy-changes)
