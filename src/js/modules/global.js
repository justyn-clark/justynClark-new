import EventEmitter2 from 'eventemitter2';

(function(global){

  global.JC = global.JC !== undefined ? JC : {}; // Declare Global Object
  global.EVT = new EventEmitter2();

  JC.components = {};
  JC.config = {};
  JC.menu = {};
  JC.utils = {};

  global.addEventListener('DOMContentLoaded', function() {
    EVT.emit('init');
  });

  //console.log(JC);

})(window);
