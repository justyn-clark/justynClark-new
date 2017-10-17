import { setPolicyCookie } from './cookies';
import { loadNames } from './loadNames';
//import { youTubePlayer } from './utils';

var videos = ['2fKGD9Mg1is','RKYjdTiMkXM'];



var video = JC.utils.youTubePlayer();

// Set up click handlers
function clickHandlers() {

  var adder = JC.utils.adder();
  var openOverlay = document.querySelector('[rel="main__openOverlay"]');
  var overlay = document.querySelector('.overlay')

  document.querySelector('[rel="main__loadNames"]').addEventListener('click', loadNames);

  document.querySelector('[rel="main__clicker"]').addEventListener('click', function() {
    document.querySelector('[rel="main__clicker"]').innerHTML = adder();
  });

  document.querySelector('.cookie-policy__close').addEventListener('click', setPolicyCookie); // Cookie Policy

  overlay.addEventListener('click', JC.utils.closeOverlay); // close overlay
  openOverlay.addEventListener('click', JC.utils.openOverlay); // open overlay
  openOverlay.addEventListener('click', video); // open overlay
}

EVT.on('init', clickHandlers);

