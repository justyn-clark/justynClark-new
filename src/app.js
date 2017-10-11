import './js/modules/global';
import './js/modules/config';
import './js/modules/utils';
import './js/modules/handleClicks';
import './js/modules/canIUseData';
import './js/modules/input';
import './js/modules/weirdCase';
import './js/modules/randomNames';

import {loadVideos} from './js/modules/loadVideos';

EVT.on('init', loadVideos)
