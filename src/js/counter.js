// Counter.js Module
const adder = (function() {
  var plus = function() {
    var counter = 0;
    return function() {
      return counter++
    }
  }
  return {
    adder1: plus(),
    adder2: plus()
  }
})()
