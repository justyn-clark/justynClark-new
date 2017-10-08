export function randNumGen() {
  return Math.floor(Math.random() * 1000)
};


export function coolFunk() {
  console.log('this love is taking a hold of me');
};


export function adder() {
  var plus = function() {
    var counter = 0;
    return function() {
      return counter++
    }
  }
  /*return {
    adder1: plus(),
    adder2: plus()
  }*/

  return plus();
};

//export adder()
