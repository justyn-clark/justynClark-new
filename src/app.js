import './js/modules/global';
import './js/modules/config';
import './js/modules/utils';
import './js/modules/sidebar';
import './js/modules/droplet';
import './js/modules/youtubeData';

import { clickHandlers } from './js/modules/handleClicks';

EVT.on('init', clickHandlers);




