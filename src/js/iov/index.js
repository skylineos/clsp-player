'use strict';

import 'srcdoc-polyfill';

import IovCollection from './IovCollection';
import TourController from './TourController';

window.IovCollection = IovCollection;
window.TourController = TourController;

export default {
  IovCollection,
  TourController,
};
