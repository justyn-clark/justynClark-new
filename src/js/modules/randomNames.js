import { randNumGen } from './utils';
import { toWeirdCase } from './weirdCase';

(function() {
  var firstNames = ["big", "ol dirty", "lil", "the legendary", "chief", "boss", 'young', 'sleepy', 'OG', 'AKA', 'The Champ'];
  var lastNames = ["mac", "wig wig", "bastard", "mote", "johnson", "smasher", 'jones', 'dawg', 'almighty', 'the illest', 'bae', 'skezz'];

  function getRandName(arr) {
    return arr[randNumGen(arr.length)];
  }

  document.querySelector('.randName').innerHTML = toWeirdCase(getRandName(firstNames)) + ' ' + toWeirdCase(getRandName(lastNames));
})();
