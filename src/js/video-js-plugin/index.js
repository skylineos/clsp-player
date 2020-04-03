'use strict';

import 'srcdoc-polyfill';

import '../utils/';
import plugin from './plugin';
import '../../styles/videojs-mse-over-clsp.scss';

const clspPlugin = plugin();

// @todo - do not initialize the plugin by default, since that is a side
// effect.  make the caller call the initialize function.  also, is it
// possible to unregister the plugin?
clspPlugin.register();

export default clspPlugin;
