(function(global, $){
  // Set up global variables
  global.JC = global.JC !== undefined ? JC : {};

  $('.poo');
  JC.config = {};
  JC.utils = {};
  JC.components = {};
  JC.menu = {};

  global.EVT = new EventEmitter2();

  global.addEventListener('DOMContentLoaded', function() {
    EVT.emit('init');
  });

})(window, jQuery);

