import { setPolicyCookie } from './cookies';
import { loadNames } from './loadNames';

// Set up click handlers
export const clickHandlers = () => {
  var adder = JC.utils.adder();
  document.querySelector('[rel="main__loadNames"]').addEventListener('click', loadNames);
  document.querySelector('[rel="main__openOverlay"]').addEventListener('click', JC.utils.openOverlay); // open overlay
  document.querySelector('.overlay').addEventListener('click', JC.utils.closeOverlay); // close overlay
  document.querySelector('[rel="main__clicker"]').addEventListener('click', function() {
    document.querySelector('[rel="main__clicker"]').innerHTML = adder();
  });
  document.querySelector('.cookie-policy__close').addEventListener('click', setPolicyCookie); // Cookie Policy
}

EVT.on('init', clickHandlers);

