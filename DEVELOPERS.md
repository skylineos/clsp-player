# CLSP Player Developer Notes <!-- omit in toc -->


## Table of Contents <!-- omit in toc -->

- [Getting Started](#getting-started)
    - [Prepare Node Environment](#prepare-node-environment)
    - [Run test server](#run-test-server)
- [Versioning](#versioning)
- [Publishing](#publishing)
- [References](#references)


## Getting Started

### Prepare Node Environment

1. Install latest NodeJS LTS version using `tj/n`:
    * [https://github.com/tj/n](https://github.com/tj/n)
    * Note if you're on Windows, you'll have to use a different node installation method
1. Install latest Yarn v1:
    * [https://classic.yarnpkg.com/en/docs/install#debian-stable](https://classic.yarnpkg.com/en/docs/install#debian-stable)
1. `yarn install`

### Run test server

1. `yarn run serve`
    * set `DEV_SERVER_HOST` to change the default host of `0.0.0.0`
    * set `DEV_SERVER_PORT` to change the port of `8080`
1. navigate to [http://localhost:8080](http://localhost:8080) in a supported browser
1. add a `clsp` url to any of the inputs, then click submit
1. click play on the video element (if not using an autoplay player)


## Versioning

@see:

* [https://yarnpkg.com/lang/en/docs/cli/version/](https://yarnpkg.com/lang/en/docs/cli/version/)
* [https://semver.org/](https://semver.org/)

```
yarn version --new-version 1.2.3+4
```

## Publishing

1. You MUST be on an unmodified checkout of the `git` tag you intend to publish.  i.e, `git status` should show:
    1. You have a tag checked out
    1. There are no changes staged for commit
1. You MUST have already run `yarn install`, since the dependencies are necessary for building and publishing
1. You MUST be logged in to the public npm registry
1. You MUST have access to the `skylineos` organization on npm
1. You MUST ONLY publish releases (e.g. `0.18.0`) or pre-releases (e.g. `0.18.0-4`) - no builds or anything else without approval

When the above checklist is complete, publish via:

```
npm publish
```


## References

* [https://developer.mozilla.org/en-US/docs/Web/API/MediaSource](https://developer.mozilla.org/en-US/docs/Web/API/MediaSource)
* [https://developers.google.com/web/updates/2017/09/autoplay-policy-changes](https://developers.google.com/web/updates/2017/09/autoplay-policy-changes)
