(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
'use strict';

require('./init');

require('../scripts/jc');

require('../scripts/canIUseData');

var _utils = require('./utils');

var zzz = (0, _utils.adder)();

console.log(zzz());
console.log(zzz());
console.log(zzz());
console.log(zzz());
console.log(zzz());
(0, _utils.coolFunk)();
console.log((0, _utils.randNumGen)());

},{"../scripts/canIUseData":4,"../scripts/jc":5,"./init":2,"./utils":3}],2:[function(require,module,exports){
'use strict';

//import jQuery from 'jquery';
//import EventEmitter2 from 'eventemitter2';

(function (global, $) {
  // Set up global variables
  global.JC = global.JC !== undefined ? JC : {};

  $('.poo');
  JC.config = {};
  JC.utils = {};
  JC.components = {};
  JC.menu = {};

  global.EVT = new EventEmitter2();

  global.addEventListener('DOMContentLoaded', function () {
    EVT.emit('init');
  });
})(window, jQuery);

},{}],3:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.randNumGen = randNumGen;
exports.coolFunk = coolFunk;
exports.adder = adder;
function randNumGen() {
  return Math.floor(Math.random() * 1000);
};

function coolFunk() {
  console.log('this love is taking a hold of me');
};

function adder() {
  var plus = function plus() {
    var counter = 0;
    return function () {
      return counter++;
    };
  };
  /*return {
    adder1: plus(),
    adder2: plus()
  }*/

  return plus();
};

//export adder()

},{}],4:[function(require,module,exports){
'use strict';

(function (JC) {

  var canIData = document.querySelector('.canIData');
  var clickBtn = document.querySelector('[rel="main__clicker"]');

  function init() {
    var p1 = new Promise(function (resolve) {
      var request;
      if (window.XMLHttpRequest) {
        request = new XMLHttpRequest();
      } else {
        request = new ActiveXObject("Microsoft.XMLHTTP");
      }
      request.open('GET', 'https://raw.githubusercontent.com/Fyrd/caniuse/master/data.json');
      request.onreadystatechange = function () {
        if (request.readyState === 4 && request.status === 200) {
          var canIUseData = JSON.parse(request.responseText);
          resolve(canIUseData);
          console.log(canIUseData.data);
        }
      };
      request.send();
    });
    p1.then(function (canIUseData) {
      var titles = "";
      //var ul = document.createElement("ul");
      //canIData.appendChild(ul)

      var catsCSS = canIUseData.cats.CSS;
      //catsCSS.forEach(function(index,item) {
      //  var cssList = '<li>' + index + ' ' + item + '</li>';
      //  canIData.appendChild(ul);
      //  ul.insertAdjacentHTML('afterbegin', cssList);
      //});

      for (var i in canIUseData.data) {
        titles += "<div class='data__item'>";
        titles += "<h5>" + canIUseData.data[i].title + "</h5>";
        titles += "<p>" + canIUseData.data[i].description + "</p>";
        titles += "<a href=" + canIUseData.data[i].links[0].url + ">" + canIUseData.data[i].links[0].url + "</a>";
        titles += "</div>";
      }

      canIData.insertAdjacentHTML('afterbegin', titles);
    });
    //.then(()=> canIData.insertAdjacentHTML('afterbegin', "<h1>Top Modern Features</h1>"))
  }

  clickBtn.addEventListener("click", init);

  if ("Promise" in window) {
    // Check for Promise on window
    console.log('Promises are supported');
    EVT.on("init", init);
  } else {
    console.log('Your browser doesn\'t support the <code>Promise<code> interface.');
  }
})(JC);

},{}],5:[function(require,module,exports){
'use strict';

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

(function (JC) {
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
  utils.getCookies = function (update) {
    // Get cookies
    if (!cookieMap || update) {
      cookieMap = {};
      var i,
          cookies = document.cookie.split(";");
      for (i = 0; i < cookies.length; i++) {
        var index = cookies[i].indexOf('=');
        var x = cookies[i].substr(0, index);
        var y = cookies[i].substr(index + 1);
        x = x.replace(/^\s+|\s+$/g, '');
        if (x) cookieMap[x] = decodeURI(y);
      }
    }
    return cookieMap;
  };

  utils.getCookie = function (c, update) {
    // Get cookie
    return undefined.getCookies(update)[c];
  };

  utils.setCookie = function (name, value, opts) {
    // Set cookie JC.utils.setCookie('jcCookie',true, {expireDate: (3600 * 24 * 365)});
    var value = encodeURI(value);
    opts = opts || {};
    value += ";path=" + (opts.path || "/");
    if (opts.domain) value += ";domain=" + opts.domain;
    var t = _typeof(opts.maxAge);
    if (t == "number" || t == "string") value += ";max-age=" + opts.maxAge;
    var e = opts.expireDate;
    if (typeof e == "number") e = new Date(new Date().getTime() + e * 1000);
    if (e) value += ';expires=' + e.toUTCString();
    if (opts.secure) value += ";secure";
    document.cookie = name + '=' + value;
    cookieMap = null;
  };

  // this checker
  utils.thisCheck = function () {
    console.log(this);
  };

  utils.randomNumber = function () {
    return Math.floor(Math.random() * 1000);
  };

  utils.output = function (x) {
    console.log(x);
  };

  // Character count in Element
  utils.charsInElement = function (elm) {
    if (elm.nodeType == 3) {
      // TEXT_NODE
      return elm.nodeValue.length;
    }
    var count = 0;
    for (var i = 0, child; child = elm.childNodes[i]; i++) {
      count += utils.charsInElement(child);
    }
    return count;
  };

  // Alert utility
  utils.alert = function (a) {
    alert(a);
  };

  utils.showBodyCharNum = function () {
    var elm = document.querySelector('body');
    console.log("This page has " + utils.charsInElement(elm) + " characters in the body");
  };

  utils.openOverlay = function () {
    var overlay = document.querySelector('.overlay');
    overlay.classList.toggle('overlay--open');
    console.log('overlay open');
  };

  utils.closeOverlay = function () {
    var overlay = document.querySelector('.overlay');
    overlay.classList.remove('overlay--open');
    console.log('overlay closed');
  };

  var loadNames = function loadNames() {
    var request;
    if (window.XMLHttpRequest) {
      request = new XMLHttpRequest();
    } else {
      request = new ActiveXObject("Microsoft.XMLHTTP");
    }
    request.open('GET', 'https://jsonplaceholder.typicode.com/users');
    request.onreadystatechange = function () {
      if (request.readyState === 4 && request.status === 200) {
        var data = JSON.parse(request.responseText);
        console.log(data);
        localStorage.setItem('data', JSON.stringify(data));

        for (var i = 0; i < data.length; i++) {
          console.log(data[i].name);

          var names = data[i].name + "<br>" + data[i].email;
        }

        document.querySelector('[rel=copySection]').innerHTML = names;
      }
    };
    request.send();
  };

  var cookieSetter = function cookieSetter() {
    document.querySelector('.cookie-policy').classList.add('cookie-policy--hide');
    console.log('cookie set');
    utils.setCookie('jcCookie', true, { expireDate: 3600 * 24 * 365 });
  };

  // Set up click handlers
  var clickHandlers = function clickHandlers() {
    document.querySelector('[rel="main__openOverlay"]').addEventListener('click', utils.openOverlay); // open overlay
    document.querySelector('.overlay').addEventListener('click', utils.closeOverlay); // close overlay
    document.querySelector('[rel="main__loadNames"]').addEventListener('click', loadNames); // load ajax
    document.querySelector('[rel="main__clicker"]').addEventListener('click', function () {
      document.querySelector('[rel="main__clicker"]').innerHTML = adder.adder1();
      console.log(adder.adder2());
    });
    document.querySelector('.cookie-policy__close').addEventListener('click', cookieSetter); // Cookie Policy
  };

  setTimeout(function () {
    if (!document.cookie.match('jcCookie')) {
      document.querySelector('.cookie-policy').classList.add('cookie-policy--show');
    } else {
      console.log('cookie policy is hidden');
      document.querySelector('.cookie-policy').classList.add('cookie-policy--hide');
    }
  }, 1000);

  // init function
  var init = function init() {};

  EVT.on('init', clickHandlers);
  EVT.on('init', loadNames);

  return JC;
})(JC);

{
  var code = "</code>";
  //console.log(`I'm executing ${code} immediately!`);
}

},{}]},{},[1])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJzcmMvanMvbW9kdWxlcy9hcHAuanMiLCJzcmMvanMvbW9kdWxlcy9pbml0LmpzIiwic3JjL2pzL21vZHVsZXMvdXRpbHMuanMiLCJzcmMvanMvc2NyaXB0cy9jYW5JVXNlRGF0YS5qcyIsInNyYy9qcy9zY3JpcHRzL2pjLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7QUNBQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFLQSxJQUFJLE1BQU0sbUJBQVY7O0FBRUEsUUFBUSxHQUFSLENBQVksS0FBWjtBQUNBLFFBQVEsR0FBUixDQUFZLEtBQVo7QUFDQSxRQUFRLEdBQVIsQ0FBWSxLQUFaO0FBQ0EsUUFBUSxHQUFSLENBQVksS0FBWjtBQUNBLFFBQVEsR0FBUixDQUFZLEtBQVo7QUFDQTtBQUNBLFFBQVEsR0FBUixDQUFZLHdCQUFaOzs7OztBQ2hCQTtBQUNBOztBQUVBLENBQUMsVUFBUyxNQUFULEVBQWlCLENBQWpCLEVBQW1CO0FBQ2xCO0FBQ0EsU0FBTyxFQUFQLEdBQVksT0FBTyxFQUFQLEtBQWMsU0FBZCxHQUEwQixFQUExQixHQUErQixFQUEzQzs7QUFFQSxJQUFFLE1BQUY7QUFDQSxLQUFHLE1BQUgsR0FBWSxFQUFaO0FBQ0EsS0FBRyxLQUFILEdBQVcsRUFBWDtBQUNBLEtBQUcsVUFBSCxHQUFnQixFQUFoQjtBQUNBLEtBQUcsSUFBSCxHQUFVLEVBQVY7O0FBRUEsU0FBTyxHQUFQLEdBQWEsSUFBSSxhQUFKLEVBQWI7O0FBRUEsU0FBTyxnQkFBUCxDQUF3QixrQkFBeEIsRUFBNEMsWUFBVztBQUNyRCxRQUFJLElBQUosQ0FBUyxNQUFUO0FBQ0QsR0FGRDtBQUlELENBaEJELEVBZ0JHLE1BaEJILEVBZ0JXLE1BaEJYOzs7Ozs7OztRQ0hnQixVLEdBQUEsVTtRQUtBLFEsR0FBQSxRO1FBS0EsSyxHQUFBLEs7QUFWVCxTQUFTLFVBQVQsR0FBc0I7QUFDM0IsU0FBTyxL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YUFBVCxDQUF1Qix1QkFBdkIsRUFBZ0QsU0FBaEQsR0FBNEQsTUFBTSxNQUFOLEVBQTVEO0FBQ0EsY0FBUSxHQUFSLENBQVksTUFBTSxNQUFOLEVBQVo7QUFDRCxLQUhEO0FBSUEsYUFBUyxhQUFULENBQXVCLHVCQUF2QixFQUFnRCxnQkFBaEQsQ0FBaUUsT0FBakUsRUFBMEUsWUFBMUUsRUFSMEIsQ0FRK0Q7QUFDMUYsR0FURDs7QUFXQSxhQUFXLFlBQUs7QUFDYixRQUFJLENBQUMsU0FBUyxNQUFULENBQWdCLEtBQWhCLENBQXNCLFVBQXRCLENBQUwsRUFBd0M7QUFDdEMsZUFBUyxhQUFULENBQXVCLGdCQUF2QixFQUF5QyxTQUF6QyxDQUFtRCxHQUFuRCxDQUF1RCxxQkFBdkQ7QUFDRCxLQUZELE1BRU87QUFDTCxjQUFRLEdBQVIsQ0FBWSx5QkFBWjtBQUNBLGVBQVMsYUFBVCxDQUF1QixnQkFBdkIsRUFBeUMsU0FBekMsQ0FBbUQsR0FBbkQsQ0FBdUQscUJBQXZEO0FBQ0Q7QUFDSCxHQVBELEVBT0UsSUFQRjs7QUFTQTtBQUNFLE1BQUksT0FBTyxTQUFQLElBQU8sR0FBTSxDQUFFLENBQW5COztBQUVGLE1BQUksRUFBSixDQUFPLE1BQVAsRUFBZSxhQUFmO0FBQ0EsTUFBSSxFQUFKLENBQU8sTUFBUCxFQUFlLFNBQWY7O0FBRUEsU0FBTyxFQUFQO0FBRUQsQ0E3SkQsRUE2SkcsRUE3Skg7O0FBa0tBO0FBQ0EsTUFBSSxPQUFPLFNBQVg7QUFDQTtBQUNDIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3ZhciBmPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIik7dGhyb3cgZi5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGZ9dmFyIGw9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGwuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sbCxsLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsImltcG9ydCAnLi9pbml0JztcbmltcG9ydCAnLi4vc2NyaXB0cy9qYyc7XG5pbXBvcnQgJy4uL3NjcmlwdHMvY2FuSVVzZURhdGEnO1xuaW1wb3J0IHsgY29vbEZ1bmsgfSBmcm9tICcuL3V0aWxzJztcbmltcG9ydCB7IHJhbmROdW1HZW4gfSBmcm9tICcuL3V0aWxzJztcbmltcG9ydCB7IGFkZGVyIH0gZnJvbSAnLi91dGlscydcblxuXG52YXIgenp6ID0gYWRkZXIoKTtcblxuY29uc29sZS5sb2coenp6KCkpO1xuY29uc29sZS5sb2coenp6KCkpO1xuY29uc29sZS5sb2coenp6KCkpO1xuY29uc29sZS5sb2coenp6KCkpO1xuY29uc29sZS5sb2coenp6KCkpO1xuY29vbEZ1bmsoKTtcbmNvbnNvbGUubG9nKHJhbmROdW1HZW4oKSk7XG5cbiIsIi8vaW1wb3J0IGpRdWVyeSBmcm9tICdqcXVlcnknO1xuLy9pbXBvcnQgRXZlbnRFbWl0dGVyMiBmcm9tICdldmVudGVtaXR0ZXIyJztcblxuKGZ1bmN0aW9uKGdsb2JhbCwgJCl7XG4gIC8vIFNldCB1cCBnbG9iYWwgdmFyaWFibGVzXG4gIGdsb2JhbC5KQyA9IGdsb2JhbC5KQyAhPT0gdW5kZWZpbmVkID8gSkMgOiB7fTtcblxuICAkKCcucG9vJyk7XG4gIEpDLmNvbmZpZyA9IHt9O1xuICBKQy51dGlscyA9IHt9O1xuICBKQy5jb21wb25lbnRzID0ge307XG4gIEpDLm1lbnUgPSB7fTtcblxuICBnbG9iYWwuRVZUID0gbmV3IEV2ZW50RW1pdHRlcjIoKTtcblxuICBnbG9iYWwuYWRkRXZlbnRMaXN0ZW5lcignRE9NQ29udGVudExvYWRlZCcsIGZ1bmN0aW9uKCkge1xuICAgIEVWVC5lbWl0KCdpbml0Jyk7XG4gIH0pO1xuXG59KSh3aW5kb3csIGpRdWVyeSk7XG4iLCJleHBvcnQgZnVuY3Rpb24gcmFuZE51bUdlbigpIHtcbiAgcmV0dXJuIE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIDEwMDApXG59O1xuXG5cbmV4cG9ydCBmdW5jdGlvbiBjb29sRnVuaygpIHtcbiAgY29uc29sZS5sb2coJ3RoaXMgbG92ZSBpcyB0YWtpbmcgYSBob2xkIG9mIG1lJyk7XG59O1xuXG5cbmV4cG9ydCBmdW5jdGlvbiBhZGRlcigpIHtcbiAgdmFyIHBsdXMgPSBmdW5jdGlvbigpIHtcbiAgICB2YXIgY291bnRlciA9IDA7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIGNvdW50ZXIrK1xuICAgIH1cbiAgfVxuICAvKnJldHVybiB7XG4gICAgYWRkZXIxOiBwbHVzKCksXG4gICAgYWRkZXIyOiBwbHVzKClcbiAgfSovXG5cbiAgcmV0dXJuIHBsdXMoKTtcbn07XG5cbi8vZXhwb3J0IGFkZGVyKClcbiIsIihmdW5jdGlvbihKQykge1xuXG4gIHZhciBjYW5JRGF0YSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5jYW5JRGF0YScpO1xuICB2YXIgY2xpY2tCdG4gPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbcmVsPVwibWFpbl9fY2xpY2tlclwiXScpO1xuXG4gIGZ1bmN0aW9uIGluaXQoKSB7XG4gICAgdmFyIHAxID0gbmV3IFByb21pc2UoXG4gICAgICBmdW5jdGlvbihyZXNvbHZlKSB7XG4gICAgICAgIHZhciByZXF1ZXN0O1xuICAgICAgICBpZiAod2luZG93LlhNTEh0dHBSZXF1ZXN0KSB7XG4gICAgICAgICAgcmVxdWVzdCA9IG5ldyBYTUxIdHRwUmVxdWVzdCgpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJlcXVlc3QgPSBuZXcgQWN0aXZlWE9iamVjdChcIk1pY3Jvc29mdC5YTUxIVFRQXCIpO1xuICAgICAgICB9XG4gICAgICAgIHJlcXVlc3Qub3BlbignR0VUJywgJ2h0dHBzOi8vcmF3LmdpdGh1YnVzZXJjb250ZW50LmNvbS9GeXJkL2Nhbml1c2UvbWFzdGVyL2RhdGEuanNvbicpO1xuICAgICAgICByZXF1ZXN0Lm9ucmVhZHlzdGF0ZWNoYW5nZSA9IGZ1bmN0aW9uKCkge1xuICAgICAgICAgIGlmICgocmVxdWVzdC5yZWFkeVN0YXRlID09PSA0KSAmJiAocmVxdWVzdC5zdGF0dXMgPT09IDIwMCkpIHtcbiAgICAgICAgICAgIGNvbnN0IGNhbklVc2VEYXRhID0gSlNPTi5wYXJzZShyZXF1ZXN0LnJlc3BvbnNlVGV4dCk7XG4gICAgICAgICAgICByZXNvbHZlKGNhbklVc2VEYXRhKTtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGNhbklVc2VEYXRhLmRhdGEpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXF1ZXN0LnNlbmQoKTtcbiAgICAgIH0pO1xuICAgIHAxXG4gICAgICAudGhlbihjYW5JVXNlRGF0YSA9PiB7XG4gICAgICAgIHZhciB0aXRsZXM9IFwiXCI7XG4gICAgICAgIC8vdmFyIHVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInVsXCIpO1xuICAgICAgICAvL2NhbklEYXRhLmFwcGVuZENoaWxkKHVsKVxuXG4gICAgICAgIHZhciBjYXRzQ1NTID0gY2FuSVVzZURhdGEuY2F0cy5DU1M7XG4gICAgICAgIC8vY2F0c0NTUy5mb3JFYWNoKGZ1bmN0aW9uKGluZGV4LGl0ZW0pIHtcbiAgICAgICAgLy8gIHZhciBjc3NMaXN0ID0gJzxsaT4nICsgaW5kZXggKyAnICcgKyBpdGVtICsgJzwvbGk+JztcbiAgICAgICAgLy8gIGNhbklEYXRhLmFwcGVuZENoaWxkKHVsKTtcbiAgICAgICAgLy8gIHVsLmluc2VydEFkamFjZW50SFRNTCgnYWZ0ZXJiZWdpbicsIGNzc0xpc3QpO1xuICAgICAgICAvL30pO1xuXG4gICAgICAgIGZvciAobGV0IGkgaW4gY2FuSVVzZURhdGEuZGF0YSkge1xuICAgICAgICAgIHRpdGxlcyArPSBcIjxkaXYgY2xhc3M9J2RhdGFfX2l0ZW0nPlwiXG4gICAgICAgICAgdGl0bGVzICs9IFwiPGg1PlwiICsgY2FuSVVzZURhdGEuZGF0YVtpXS50aXRsZSArIFwiPC9oNT5cIlxuICAgICAgICAgIHRpdGxlcyArPSBcIjxwPlwiICsgY2FuSVVzZURhdGEuZGF0YVtpXS5kZXNjcmlwdGlvbiArIFwiPC9wPlwiXG4gICAgICAgICAgdGl0bGVzICs9IFwiPGEgaHJlZj1cIiArIGNhbklVc2VEYXRhLmRhdGFbaV0ubGlua3NbMF0udXJsICsgXCI+XCIgKyBjYW5JVXNlRGF0YS5kYXRhW2ldLmxpbmtzWzBdLnVybCArIFwiPC9hPlwiXG4gICAgICAgICAgdGl0bGVzICs9IFwiPC9kaXY+XCJcbiAgICAgICAgfVxuXG4gICAgICAgICAgY2FuSURhdGEuaW5zZXJ0QWRqYWNlbnRIVE1MKCdhZnRlcmJlZ2luJywgdGl0bGVzKTtcblxuICAgICAgICB9KVxuICAgICAgLy8udGhlbigoKT0+IGNhbklEYXRhLmluc2VydEFkamFjZW50SFRNTCgnYWZ0ZXJiZWdpbicsIFwiPGgxPlRvcCBNb2Rlcm4gRmVhdHVyZXM8L2gxPlwiKSlcbiAgfVxuXG4gIGNsaWNrQnRuLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBpbml0KTtcblxuICBpZiAoXCJQcm9taXNlXCIgaW4gd2luZG93KSB7ICAgLy8gQ2hlY2sgZm9yIFByb21pc2Ugb24gd2luZG93XG4gICAgY29uc29sZS5sb2coJ1Byb21pc2VzIGFyZSBzdXBwb3J0ZWQnKTtcbiAgICBFVlQub24oXCJpbml0XCIsIGluaXQpO1xuICAgfSBlbHNlIHtcbiAgICAgY29uc29sZS5sb2coJ1lvdXIgYnJvd3NlciBkb2VzblxcJ3Qgc3VwcG9ydCB0aGUgPGNvZGU+UHJvbWlzZTxjb2RlPiBpbnRlcmZhY2UuJyk7XG4gICB9XG5cbn0pKEpDKTtcbiIsIigoSkMpID0+IHtcbiAgLy8gU2V0IHVwIHZhcmlhYmxlc1xuICB2YXIgY29uZmlnID0gSkMuY29uZmlnID0ge307XG4gIHZhciB1dGlscyA9IEpDLnV0aWxzID0ge307XG4gIHZhciBjb21wb25lbnRzID0gSkMuY29tcG9uZW50cyA9IHt9O1xuICB2YXIgbWVudSA9IEpDLm1lbnUgPSB7fTtcblxuICBjb25maWcucHJvamVjdCA9ICdqdXN0eW5DbGFyay1uZXcnO1xuICBjb25maWcuZGV2ZWxvcGVyID0gJ2p1c3R5biBjbGFyayc7XG4gIGNvbmZpZy52ZXJzaW9uID0gXCIxLjAuMFwiO1xuXG4gIHZhciBjb29raWVNYXA7XG4gIC8vIENvb2tpZXNcbiAgdXRpbHMuZ2V0Q29va2llcyA9IHVwZGF0ZSA9PiB7IC8vIEdldCBjb29raWVzXG4gICAgaWYoIWNvb2tpZU1hcCB8fCB1cGRhdGUpIHtcbiAgICAgIGNvb2tpZU1hcCA9IHt9O1xuICAgICAgdmFyIGksIGNvb2tpZXMgPSBkb2N1bWVudC5jb29raWUuc3BsaXQoXCI7XCIpO1xuICAgICAgZm9yIChpID0gMDsgaSA8IGNvb2tpZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgdmFyIGluZGV4ID0gY29va2llc1tpXS5pbmRleE9mKCc9Jyk7XG4gICAgICAgIHZhciB4ID0gY29va2llc1tpXS5zdWJzdHIoMCwgaW5kZXgpO1xuICAgICAgICB2YXIgeSA9IGNvb2tpZXNbaV0uc3Vic3RyKGluZGV4ICsgMSk7XG4gICAgICAgIHggPSB4LnJlcGxhY2UoL15cXHMrfFxccyskL2csICcnKTtcbiAgICAgICAgaWYoeCkgY29va2llTWFwW3hdID0gZGVjb2RlVVJJKHkpO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gY29va2llTWFwO1xuICB9O1xuXG4gIHV0aWxzLmdldENvb2tpZSA9IChjLCB1cGRhdGUpID0+IHsgLy8gR2V0IGNvb2tpZVxuICAgIHJldHVybiB0aGlzLmdldENvb2tpZXModXBkYXRlKVtjXTtcbiAgfTtcblxuICB1dGlscy5zZXRDb29raWUgPSAobmFtZSwgdmFsdWUsIG9wdHMpID0+IHsgLy8gU2V0IGNvb2tpZSBKQy51dGlscy5zZXRDb29raWUoJ2pjQ29va2llJyx0cnVlLCB7ZXhwaXJlRGF0ZTogKDM2MDAgKiAyNCAqIDM2NSl9KTtcbiAgICB2YXIgdmFsdWUgPSBlbmNvZGVVUkkodmFsdWUpO1xuICAgIG9wdHMgPSBvcHRzIHx8IHt9O1xuICAgIHZhbHVlICs9IFwiO3BhdGg9XCIgKyAob3B0cy5wYXRoIHx8IFwiL1wiKTtcbiAgICBpZihvcHRzLmRvbWFpbikgdmFsdWUgKz0gXCI7ZG9tYWluPVwiICsgb3B0cy5kb21haW47XG4gICAgdmFyIHQgPSB0eXBlb2Ygb3B0cy5tYXhBZ2U7XG4gICAgaWYodCA9PSBcIm51bWJlclwiIHx8IHQgPT0gXCJzdHJpbmdcIikgdmFsdWUgKz0gXCI7bWF4LWFnZT1cIiArIG9wdHMubWF4QWdlO1xuICAgIHZhciBlID0gb3B0cy5leHBpcmVEYXRlO1xuICAgIGlmKHR5cGVvZiBlID09IFwibnVtYmVyXCIpIGUgPSBuZXcgRGF0ZSgobmV3IERhdGUoKSkuZ2V0VGltZSgpICsgZSAqIDEwMDApO1xuICAgIGlmKGUpIHZhbHVlICs9ICc7ZXhwaXJlcz0nICsgZS50b1VUQ1N0cmluZygpO1xuICAgIGlmKG9wdHMuc2VjdXJlKSB2YWx1ZSArPSBcIjtzZWN1cmVcIjtcbiAgICBkb2N1bWVudC5jb29raWUgPSBuYW1lICsgJz0nICsgdmFsdWU7XG4gICAgY29va2llTWFwID0gbnVsbDtcbiAgfTtcblxuICAvLyB0aGlzIGNoZWNrZXJcbiAgdXRpbHMudGhpc0NoZWNrID0gZnVuY3Rpb24oKSB7XG4gICAgY29uc29sZS5sb2codGhpcyk7XG4gIH1cblxuICB1dGlscy5yYW5kb21OdW1iZXIgPSBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogMTAwMClcbiAgfTtcblxuICB1dGlscy5vdXRwdXQgPSBmdW5jdGlvbih4KSB7XG4gICAgY29uc29sZS5sb2coeCk7XG4gIH1cblxuICAvLyBDaGFyYWN0ZXIgY291bnQgaW4gRWxlbWVudFxuICB1dGlscy5jaGFyc0luRWxlbWVudCA9IGVsbSA9PiB7XG4gICAgaWYgKGVsbS5ub2RlVHlwZSA9PSAzKSB7IC8vIFRFWFRfTk9ERVxuICAgICAgcmV0dXJuIGVsbS5ub2RlVmFsdWUubGVuZ3RoO1xuICAgIH1cbiAgICB2YXIgY291bnQgPSAwO1xuICAgIGZvciAodmFyIGkgPSAwLCBjaGlsZDsgY2hpbGQgPSBlbG0uY2hpbGROb2Rlc1tpXTsgaSsrKSB7XG4gICAgICBjb3VudCArPSB1dGlscy5jaGFyc0luRWxlbWVudChjaGlsZCk7XG4gICAgfVxuICAgIHJldHVybiBjb3VudDtcbiAgfVxuXG4gIC8vIEFsZXJ0IHV0aWxpdHlcbiAgdXRpbHMuYWxlcnQgPSBhID0+IHtcbiAgICBhbGVydChhKTtcbiAgfVxuXG4gIHV0aWxzLnNob3dCb2R5Q2hhck51bSA9ICgpID0+IHtcbiAgICB2YXIgZWxtID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignYm9keScpO1xuICAgIGNvbnNvbGUubG9nKFwiVGhpcyBwYWdlIGhhcyBcIiArIHV0aWxzLmNoYXJzSW5FbGVtZW50KGVsbSkgKyBcIiBjaGFyYWN0ZXJzIGluIHRoZSBib2R5XCIpO1xuICB9O1xuXG4gIHV0aWxzLm9wZW5PdmVybGF5ID0gKCkgPT4gIHtcbiAgICBjb25zdCBvdmVybGF5ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLm92ZXJsYXknKTtcbiAgICBvdmVybGF5LmNsYXNzTGlzdC50b2dnbGUoJ292ZXJsYXktLW9wZW4nKTtcbiAgICBjb25zb2xlLmxvZygnb3ZlcmxheSBvcGVuJyk7XG4gIH1cblxuICB1dGlscy5jbG9zZU92ZXJsYXkgPSAoKSA9PiAge1xuICAgIGNvbnN0IG92ZXJsYXkgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcub3ZlcmxheScpO1xuICAgIG92ZXJsYXkuY2xhc3NMaXN0LnJlbW92ZSgnb3ZlcmxheS0tb3BlbicpO1xuICAgIGNvbnNvbGUubG9nKCdvdmVybGF5IGNsb3NlZCcpO1xuICB9XG5cbiAgY29uc3QgbG9hZE5hbWVzID0gKCkgPT4ge1xuICAgIHZhciByZXF1ZXN0O1xuICAgIGlmICh3aW5kb3cuWE1MSHR0cFJlcXVlc3QpIHtcbiAgICAgIHJlcXVlc3QgPSBuZXcgWE1MSHR0cFJlcXVlc3QoKTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmVxdWVzdCA9IG5ldyBBY3RpdmVYT2JqZWN0KFwiTWljcm9zb2Z0LlhNTEhUVFBcIik7XG4gICAgfVxuICAgIHJlcXVlc3Qub3BlbignR0VUJywgJ2h0dHBzOi8vanNvbnBsYWNlaG9sZGVyLnR5cGljb2RlLmNvbS91c2VycycpO1xuICAgIHJlcXVlc3Qub25yZWFkeXN0YXRlY2hhbmdlID0gZnVuY3Rpb24oKSB7XG4gICAgICBpZiAoKHJlcXVlc3QucmVhZHlTdGF0ZSA9PT0gNCkgJiYgKHJlcXVlc3Quc3RhdHVzID09PSAyMDApKSB7XG4gICAgICAgIHZhciBkYXRhID0gSlNPTi5wYXJzZShyZXF1ZXN0LnJlc3BvbnNlVGV4dCk7XG4gICAgICAgIGNvbnNvbGUubG9nKGRhdGEpO1xuICAgICAgICBsb2NhbFN0b3JhZ2Uuc2V0SXRlbSgnZGF0YScsIEpTT04uc3RyaW5naWZ5KGRhdGEpKTtcblxuICAgICAgICBmb3IobGV0IGkgPSAwOyBpIDwgZGF0YS5sZW5ndGg7IGkrKyl7XG4gICAgICAgICAgY29uc29sZS5sb2coZGF0YVtpXS5uYW1lKVxuXG4gICAgICAgICAgdmFyIG5hbWVzID0gZGF0YVtpXS5uYW1lICsgXCI8YnI+XCIgKyBkYXRhW2ldLmVtYWlsO1xuXG4gICAgICAgIH1cblxuICAgICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbcmVsPWNvcHlTZWN0aW9uXScpLmlubmVySFRNTCA9IG5hbWVzXG5cbiAgICAgIH1cbiAgICB9XG4gICAgcmVxdWVzdC5zZW5kKCk7XG4gIH1cblxuICBjb25zdCBjb29raWVTZXR0ZXIgPSAoKSA9PiB7XG4gICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLmNvb2tpZS1wb2xpY3knKS5jbGFzc0xpc3QuYWRkKCdjb29raWUtcG9saWN5LS1oaWRlJyk7XG4gICAgY29uc29sZS5sb2coJ2Nvb2tpZSBzZXQnKTtcbiAgICB1dGlscy5zZXRDb29raWUoJ2pjQ29va2llJywgdHJ1ZSwge2V4cGlyZURhdGU6ICgzNjAwICogMjQgKiAzNjUpfSk7XG4gIH1cblxuICAvLyBTZXQgdXAgY2xpY2sgaGFuZGxlcnNcbiAgY29uc3QgY2xpY2tIYW5kbGVycyA9ICgpID0+IHtcbiAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbcmVsPVwibWFpbl9fb3Blbk92ZXJsYXlcIl0nKS5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIHV0aWxzLm9wZW5PdmVybGF5KTsgLy8gb3BlbiBvdmVybGF5XG4gICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLm92ZXJsYXknKS5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIHV0aWxzLmNsb3NlT3ZlcmxheSk7IC8vIGNsb3NlIG92ZXJsYXlcbiAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbcmVsPVwibWFpbl9fbG9hZE5hbWVzXCJdJykuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBsb2FkTmFtZXMpOyAvLyBsb2FkIGFqYXhcbiAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbcmVsPVwibWFpbl9fY2xpY2tlclwiXScpLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgZnVuY3Rpb24oKSB7XG4gICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbcmVsPVwibWFpbl9fY2xpY2tlclwiXScpLmlubmVySFRNTCA9IGFkZGVyLmFkZGVyMSgpXG4gICAgICBjb25zb2xlLmxvZyhhZGRlci5hZGRlcjIoKSk7XG4gICAgfSk7XG4gICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLmNvb2tpZS1wb2xpY3lfX2Nsb3NlJykuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBjb29raWVTZXR0ZXIpOyAvLyBDb29raWUgUG9saWN5XG4gIH1cblxuICBzZXRUaW1lb3V0KCgpPT4ge1xuICAgICBpZiAoIWRvY3VtZW50LmNvb2tpZS5tYXRjaCgnamNDb29raWUnKSkge1xuICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5jb29raWUtcG9saWN5JykuY2xhc3NMaXN0LmFkZCgnY29va2llLXBvbGljeS0tc2hvdycpO1xuICAgICB9IGVsc2Uge1xuICAgICAgIGNvbnNvbGUubG9nKCdjb29raWUgcG9saWN5IGlzIGhpZGRlbicpO1xuICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5jb29raWUtcG9saWN5JykuY2xhc3NMaXN0LmFkZCgnY29va2llLXBvbGljeS0taGlkZScpO1xuICAgICB9XG4gIH0sMTAwMCk7XG5cbiAgLy8gaW5pdCBmdW5jdGlvblxuICAgIHZhciBpbml0ID0gKCkgPT4ge31cblxuICBFVlQub24oJ2luaXQnLCBjbGlja0hhbmRsZXJzKVxuICBFVlQub24oJ2luaXQnLCBsb2FkTmFtZXMpXG5cbiAgcmV0dXJuIEpDO1xuXG59KShKQyk7XG5cblxuXG5cbntcbmxldCBjb2RlID0gXCI8L2NvZGU+XCI7XG4vL2NvbnNvbGUubG9nKGBJJ20gZXhlY3V0aW5nICR7Y29kZX0gaW1tZWRpYXRlbHkhYCk7XG59XG4iXX0=
