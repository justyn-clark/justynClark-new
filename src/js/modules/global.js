import EventEmitter2 from 'eventemitter2';

(function(global){

  global.JC = global.JC !== undefined ? JC : {}; // Set up global variables

  JC.components = {};
  JC.config = {};
  JC.menu = {};
  JC.utils = {};

  global.EVT = new EventEmitter2();

  global.addEventListener('DOMContentLoaded', function() {
    EVT.emit('init');
  });

  console.log(JC);

  const str = 'ES6'
  console.log(`Hello ${str}`)

})(window);
