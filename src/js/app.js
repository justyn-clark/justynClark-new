(function(global){
  global.EVT = new EventEmitter2()
  global.addEventListener('DOMContentLoaded', function() {
    EVT.emit('init')
  })
})(window)
