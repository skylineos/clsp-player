/**
 * This is the entrypoint for using the CLSP Player distributable file.  If you
 * are importing / requiring the CLSP Player source, it is recommended that you
 * do not use this file.
 */

import 'srcdoc-polyfill';

import '../styles/clsp-player.scss';

import Iov from './iov/Iov';
import IovCollection from './iov/IovCollection';
import TourController from './iov/TourController';
import utils from './utils/utils';

/**
 * Add the necessary CLSP classes/objects to the `window`.  Useful for simple
 * projects and importing via `<script>` tags.
 */
function register () {
  // @todo - deprecate `window` mutations.  use `globalThis`
  if (!window.IovCollection) {
    window.IovCollection = IovCollection;
  }

  if (!window.TourController) {
    window.TourController = TourController;
  }

  if (!window.clspUtils) {
    window.clspUtils = utils;
  }
}

// @todo - do not mutate `window`, the caller should do it as needed
register();

// Support default `import`
export default {
  Iov,
  IovCollection,
  TourController,
  utils,
  register,
};

// Support destructured `import` and `require`
export {
  Iov,
  IovCollection,
  TourController,
  utils,
  register,
};
