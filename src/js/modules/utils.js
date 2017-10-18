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

JC.utils.randomNumber = function(len) {
  return Math.floor(Math.random() * len)
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
  var overlay = document.querySelector('.overlay');
  var body = document.querySelector('body');
  var overlayInner = document.querySelector('.overlay__inner');
      overlay.classList.toggle('overlay--open');
      body.classList.add('overlay--open');
      overlayInner.classList.add('overlay--open');
}

JC.utils.closeOverlay = () =>  {
  var overlay = document.querySelector('.overlay');
  var body = document.querySelector('body');
  var overlayInner = document.querySelector('.overlay__inner');
  var vid = document.querySelector('.video__modal');
      overlay.classList.toggle('overlay--open');
      body.classList.toggle('overlay--open');
      overlayInner.classList.toggle('overlay--open');
      body.removeChild(vid);
}

JC.utils.youTubePlayer = (id) => {
    return function () {
        var body = document.querySelector('body');
        var video__modal = document.createElement('div');
        var iframeWrapper = document.createElement('div');
        var iframeDiv = document.createElement('iFrame');
            iframeDiv.setAttribute('data-youtube-id', id);
            iframeDiv.setAttribute('src', 'https://www.youtube.com/embed/' + id + '?rel=0&amp;controls=0&amp');
            video__modal.setAttribute('class', 'video__modal');
            iframeWrapper.setAttribute('class', 'iframeWrapper');
            video__modal.appendChild(iframeWrapper);
            iframeWrapper.appendChild(iframeDiv);
            body.appendChild(video__modal);
            console.log('return');
      }
};

export function randNumGen(max) {
  return Math.floor(Math.random() * max)
};

/*<iframe width="1280" height="720" src="https://www.youtube.com/embed/RKYjdTiMkXM?rel=0&amp;controls=0&amp;showinfo=0" frameborder="0" allowfullscreen=""></iframe>*/
