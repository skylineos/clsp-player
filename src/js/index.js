/**
 * This is the entrypoint for using the CLSP Player distributable file.  If you
 * are importing / requiring the CLSP Player source, it is recommended that you
 * do not use this file.
 */

import 'srcdoc-polyfill';

import '../styles/clsp-player.scss';

import IovCollection from './iov/IovCollection';
import Iov from './iov/Iov';
import TourController from './iov/TourController';
import utils from './utils/utils';

window.IovCollection = IovCollection;
window.TourController = TourController;
const ClspUtils = utils;

if (!window.clspUtils) {
  window.clspUtils = utils;
}

export {
  Iov,
  IovCollection,
  TourController,
  ClspUtils,
};
