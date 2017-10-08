var cookieMap;
// Cookies
JC.utils.getCookies = update => { // Get cookies
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

JC.utils.getCookie = (c, update) => { // Get cookie
  return this.getCookies(update)[c];
};

JC.utils.setCookie = (name, value, opts) => { // Set cookie JC.utils.setCookie('jcCookie',true, {expireDate: (3600 * 24 * 365)});
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

setTimeout(()=> {
  if (!document.cookie.match('jcCookie')) {
    document.querySelector('.cookie-policy').classList.add('cookie-policy--show');
  } else {
    console.log('cookie policy is hidden');
    document.querySelector('.cookie-policy').classList.add('cookie-policy--hide');
  }
},1000);

export const setPolicyCookie = () => {
  document.querySelector('.cookie-policy').classList.add('cookie-policy--hide');
  console.log('cookie set');
  JC.utils.setCookie('jcCookie', true, {expireDate: (3600 * 24 * 365)});
}
