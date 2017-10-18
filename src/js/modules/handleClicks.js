import { setPolicyCookie } from './cookies';
let { $on, qs } = JC.helpers ;
import { playRandomYouTubeVideo } from './youTubePlayer';

export function clickHandlers() {

  let logo = qs('.logo');
  let body = qs('body');
  let menuLink_1 = qs('[rel="1"]');
  let overlay = qs('.overlay');

  $on(qs('.cookie-policy__close'), 'click', setPolicyCookie); // Cookie Policy
  $on(menuLink_1, 'click', JC.utils.openOverlay); // open overlay
  $on(overlay, 'click', JC.utils.closeOverlay); // close overlay
  $on(menuLink_1, 'click', playRandomYouTubeVideo); // open overlay
  $on(logo, 'click', function () {
    let header = qs('.header');
    header.classList.toggle('header--open');
    if (!body.classList.contains('overlay--open')) {
      body.classList.add('overlay--open');
    } else {
      body.classList.remove('overlay--open');
    }
  });
}
