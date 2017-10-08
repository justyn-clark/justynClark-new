((JC) => {
  // Set up variables
  var config = JC.config = {};
  var utils = JC.utils = {};
  var components = JC.components = {};
  var menu = JC.menu = {};

  config.project = 'justynClark-new';
  config.developer = 'justyn clark';
  config.version = "1.0.0";

  var cookieMap;
  // Cookies
  utils.getCookies = update => { // Get cookies
    if(!cookieMap || update) {
      cookieMap = {};
      var i, cookies = document.cookie.split(";");
      for (i = 0; i < cookies.length; i++) {
        var index = cookies[i].indexOf('=');
        var x = cookies[i].substr(0, index);
        var y = cookies[i].substr(index + 1);
        x = x.replace(/^\s+|\s+$/g, '');
        if(x) cookieMap[x] = decodeURI(y);
      }
    }
    return cookieMap;
  };

  utils.getCookie = (c, update) => { // Get cookie
    return this.getCookies(update)[c];
  };

  utils.setCookie = (name, value, opts) => { // Set cookie JC.utils.setCookie('jcCookie',true, {expireDate: (3600 * 24 * 365)});
    var value = encodeURI(value);
    opts = opts || {};
    value += ";path=" + (opts.path || "/");
    if(opts.domain) value += ";domain=" + opts.domain;
    var t = typeof opts.maxAge;
    if(t == "number" || t == "string") value += ";max-age=" + opts.maxAge;
    var e = opts.expireDate;
    if(typeof e == "number") e = new Date((new Date()).getTime() + e * 1000);
    if(e) value += ';expires=' + e.toUTCString();
    if(opts.secure) value += ";secure";
    document.cookie = name + '=' + value;
    cookieMap = null;
  };

  // this checker
  utils.thisCheck = function() {
    console.log(this);
  }

  utils.randomNumber = function() {
    return Math.floor(Math.random() * 1000)
  };

  utils.output = function(x) {
    console.log(x);
  }

  // Character count in Element
  utils.charsInElement = elm => {
    if (elm.nodeType == 3) { // TEXT_NODE
      return elm.nodeValue.length;
    }
    var count = 0;
    for (var i = 0, child; child = elm.childNodes[i]; i++) {
      count += utils.charsInElement(child);
    }
    return count;
  }

  // Alert utility
  utils.alert = a => {
    alert(a);
  }

  utils.showBodyCharNum = () => {
    var elm = document.querySelector('body');
    console.log("This page has " + utils.charsInElement(elm) + " characters in the body");
  };

  utils.openOverlay = () =>  {
    const overlay = document.querySelector('.overlay');
    overlay.classList.toggle('overlay--open');
    console.log('overlay open');
  }

  utils.closeOverlay = () =>  {
    const overlay = document.querySelector('.overlay');
    overlay.classList.remove('overlay--open');
    console.log('overlay closed');
  }

  const loadNames = () => {
    var request;
    if (window.XMLHttpRequest) {
      request = new XMLHttpRequest();
    } else {
      request = new ActiveXObject("Microsoft.XMLHTTP");
    }
    request.open('GET', 'https://jsonplaceholder.typicode.com/users');
    request.onreadystatechange = function() {
      if ((request.readyState === 4) && (request.status === 200)) {
        var data = JSON.parse(request.responseText);
        console.log(data);
        localStorage.setItem('data', JSON.stringify(data));

        for(let i = 0; i < data.length; i++){
          console.log(data[i].name)

          var names = data[i].name + "<br>" + data[i].email;

        }

        document.querySelector('[rel=copySection]').innerHTML = names

      }
    }
    request.send();
  }

  const cookieSetter = () => {
    document.querySelector('.cookie-policy').classList.add('cookie-policy--hide');
    console.log('cookie set');
    utils.setCookie('jcCookie', true, {expireDate: (3600 * 24 * 365)});
  }

  // Set up click handlers
  const clickHandlers = () => {
    document.querySelector('[rel="main__openOverlay"]').addEventListener('click', utils.openOverlay); // open overlay
    document.querySelector('.overlay').addEventListener('click', utils.closeOverlay); // close overlay
    document.querySelector('[rel="main__loadNames"]').addEventListener('click', loadNames); // load ajax
    document.querySelector('[rel="main__clicker"]').addEventListener('click', function() {
      document.querySelector('[rel="main__clicker"]').innerHTML = adder.adder1()
      console.log(adder.adder2());
    });
    document.querySelector('.cookie-policy__close').addEventListener('click', cookieSetter); // Cookie Policy
  }

  setTimeout(()=> {
    if (!document.cookie.match('jcCookie')) {
      document.querySelector('.cookie-policy').classList.add('cookie-policy--show');
    } else {
      console.log('cookie policy is hidden');
      document.querySelector('.cookie-policy').classList.add('cookie-policy--hide');
    }
  },1000);

  // init function
  var init = () => {}

  EVT.on('init', clickHandlers)
  EVT.on('init', loadNames)

  return JC;

})(JC);




{
  let code = "</code>";
//console.log(`I'm executing ${code} immediately!`);
}
