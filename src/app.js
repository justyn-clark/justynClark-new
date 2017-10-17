import './js/modules/global';
import './js/modules/config';
import './js/modules/utils';
import './js/modules/handleClicks';
import './js/modules/canIUseData';
import './js/modules/input';
import './js/modules/weirdCase';
import './js/modules/randomNames';

import { loadVideos } from './js/modules/loadVideos';
import { loadNames } from './js/modules/loadNames';

EVT.on('init', loadVideos)
EVT.on('init', loadNames)
