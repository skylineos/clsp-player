# CLSP Player Developer Notes <!-- omit in toc -->

## Table of Contents <!-- omit in toc -->

- [Getting Started](#getting-started)
    - [Prepare Node environment](#prepare-node-environment)
    - [Run development server](#run-development-server)
- [Logging](#logging)
    - [Enable logging](#enable-logging)
    - [Disable logging](#disable-logging)
- [Lint](#lint)
- [Test](#test)
- [Versioning](#versioning)
- [Publishing](#publishing)
- [References](#references)


## Getting Started

### Prepare Node environment

1. Install latest NodeJS LTS version using `tj/n`:
    * [https://github.com/tj/n](https://github.com/tj/n)
    * Note if you're on Windows, you'll have to use a different node installation method
1. Install latest Yarn v1:
    * [https://classic.yarnpkg.com/en/docs/install#debian-stable](https://classic.yarnpkg.com/en/docs/install#debian-stable)
1. `yarn install`

### Run development server

1. `yarn run serve`
    * set `DEV_SERVER_HOST` to change the default host of `0.0.0.0`
    * set `DEV_SERVER_PORT` to change the port of `8080`
1. navigate to [http://localhost:8080](http://localhost:8080) in a supported browser
1. add a `clsp` url to any of the inputs, then click submit
1. click play on the video element (if not using an autoplay player)


## Logging

### Enable logging

Open the developer console and run the following:

```
window.localStorage.setItem('skylineos.clsp-player.logLevel', [logLevel]);
```

where `[logLevel]` is a valid log level, which is currently a number from 0 - 5.  See `src/js/utils/logger.js`.

### Disable logging

Open the developer console and run the following:

```
window.localStorage.setItem('skylineos.clsp-player.logLevel', null);
```


## Lint

To lint your code after making changes, run:

```
yarn run lint
```

## Test

@see the test README.md here [./test/jest/README.md](./test/jest/README.md)

To test the TS definition file and run the unit tests on the codebase, run:

```
yarn run test
```

A code coverage report will be available at `test/jest/coverage/lcov-report/index.html`.  A link to this will be shown in the terminal after running the tests.


## Versioning

@see:

* [https://yarnpkg.com/lang/en/docs/cli/version/](https://yarnpkg.com/lang/en/docs/cli/version/)
* [https://semver.org/](https://semver.org/)

```
yarn version --new-version 1.2.3+4
```

## Publishing

NOTE - Use `npm` to publish, NOT `yarn`
NOTE - YOU CANNOT PUBLISH A BUILD VERSION / TAG!
NOTE - Only publish pre-releases and releases!

1. It is best to do this immediately after cutting a release tag
1. Confirm that any webpack dev servers used for development are shut down
    1. `ps aux | grep yarn`
1. Checkout the version tag you want to publish
    1. e.g. `git checkout v0.22.1-2`
1. You MUST be on an unmodified checkout of the `git` tag you intend to publish.  i.e, `git status` should show:
    1. You have a tag checked out
    1. There are no changes staged for commit
1. You MUST have already run `yarn install`, since the dependencies are necessary for building and publishing
    1. `rm -rf node_modules`
    1. `yarn`
1. Ensure all lint checks and tests pass (they better, since this is a pre/release version)
    1. `yarn run lint`
    1. `yarn run test`
1. Confirm that the build passes
    1. `yarn run build`
    1. `NODE_ENV=production yarn run build`
1. You MUST be logged in to the public npm registry
1. You MUST have access to the `skylineos` organization on npm
1. You MUST ONLY publish releases (e.g. `0.18.0`) or pre-releases (e.g. `0.18.0-4`)
    1. REMINDER - Use `npm` to publish, NOT `yarn`
    1. REMINDER - YOU CANNOT PUBLISH A BUILD VERSION / TAG!
    1. REMINDER - Only publish pre-releases and releases!
    1. pre-releases should be published with the `beta` tag, e.g. `npm publish --tag beta`
    1. releases should be published via `npm publish`


## References

* [https://developer.mozilla.org/en-US/docs/Web/API/MediaSource](https://developer.mozilla.org/en-US/docs/Web/API/MediaSource)
* [https://developers.google.com/web/updates/2017/09/autoplay-policy-changes](https://developers.google.com/web/updates/2017/09/autoplay-policy-changes)
