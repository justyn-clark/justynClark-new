import './cookies';

JC.helpers = {
  qs: (selector, scope) => (scope || document).querySelector(selector),
  qsa: (selector, scope) => (scope || document).querySelectorAll(selector),
  $on: (target, evt, callback, useCapture) => {
    target.addEventListener(evt, callback, !!useCapture)
  }
}


JC.utils = {
  adder() {
    let increment = () => {
      let counter = 0;
      return function() {
        return counter = counter + 1;
      }
    }
    return increment()
  },
  thisCheck() {
    console.log(this);
  },
  randomNumber(len) {
    return Math.floor(Math.random() * len)
  },
  interval(callback, time) {
    setInterval(callback, time)
  },
  output(x) {
    console.log(x);
  },
  charsInElement(elm) {
    if (elm.nodeType == 3) { // TEXT_NODE
      return elm.nodeValue.length;
    }
    var count = 0;
    for (var i = 0, child; child = elm.childNodes[i]; i++) {
      count += JC.utils.charsInElement(child);
    }
    return count;
  },
  showBodyCharNum() {
    var elm = document.querySelector('body');
    console.log("This page has " + JC.utils.charsInElement(elm) + " characters in the body");
  },
  openOverlay() {
    var overlay = document.querySelector('.overlay');
    var body = document.querySelector('body');
    var overlayInner = document.querySelector('.overlay__inner');
    overlay.classList.toggle('overlay--open');
    body.classList.add('overlay--open');
    overlayInner.classList.add('overlay--open');
  },
  closeOverlay() {
    var overlay = document.querySelector('.overlay');
    var body = document.querySelector('body');
    var overlayInner = document.querySelector('.overlay__inner');
    var vid = document.querySelector('.video__modal');
    overlay.classList.toggle('overlay--open');
    body.classList.toggle('overlay--open');
    overlayInner.classList.toggle('overlay--open');
    body.removeChild(vid);
  },
  youTubePlayer(id) {
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
  }
}
/*<iframe width="1280" height="720" src="https://www.youtube.com/embed/RKYjdTiMkXM?rel=0&amp;controls=0&amp;showinfo=0" frameborder="0" allowfullscreen=""></iframe>*/
