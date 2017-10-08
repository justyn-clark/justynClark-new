import './cookies';

JC.utils.adder = ()=> {
  var plus = function() {
    var counter = 0;
    return function() {
      return counter++
    }
  }
  return plus()
}

// this checker
JC.utils.thisCheck = function() {
  console.log(this);
}

JC.utils.randomNumber = function() {
  return Math.floor(Math.random() * 1000)
};

JC.utils.output = function(x) {
  console.log(x);
}

// Character count in Element
JC.utils.charsInElement = elm => {
  if (elm.nodeType == 3) { // TEXT_NODE
    return elm.nodeValue.length;
  }
  var count = 0;
  for (var i = 0, child; child = elm.childNodes[i]; i++) {
    count += JC.utils.charsInElement(child);
  }
  return count;
}

// Alert utility
JC.utils.alert = a => {
  alert(a);
}

JC.utils.showBodyCharNum = () => {
  var elm = document.querySelector('body');
  console.log("This page has " + JC.utils.charsInElement(elm) + " characters in the body");
};

JC.utils.openOverlay = () =>  {
  const overlay = document.querySelector('.overlay');
  overlay.classList.toggle('overlay--open');
  console.log('overlay open');
}

JC.utils.closeOverlay = () =>  {
  const overlay = document.querySelector('.overlay');
  overlay.classList.remove('overlay--open');
  console.log('overlay closed');
}



export function randNumGen(max) {
  return Math.floor(Math.random() * max)
};


export function coolFunk() {
  console.log('this love is taking a hold of me');
};
