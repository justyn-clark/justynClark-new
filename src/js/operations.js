// Operations.js Module
(function() {
  // Multiply by 10 function
  let mulitiply = (x,y) => x * y;
  let sum = mulitiply(100,9);

  //console.log(`Give me ${sum} dollars and 4 cents foo boo butt boy head`);

// Create a counter function
  const makeCounter = ()=> {
    var i = 0
    const counter = ()=> i = i + 1
    return counter
  }

  var counterOne = makeCounter();
  var counterTwo = makeCounter();

})();

