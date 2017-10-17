(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
(function (process){
/*!
 * EventEmitter2
 * https://github.com/hij1nx/EventEmitter2
 *
 * Copyright (c) 2013 hij1nx
 * Licensed under the MIT license.
 */
;!function(undefined) {

  var isArray = Array.isArray ? Array.isArray : function _isArray(obj) {
    return Object.prototype.toString.call(obj) === "[object Array]";
  };
  var defaultMaxListeners = 10;

  function init() {
    this._events = {};
    if (this._conf) {
      configure.call(this, this._conf);
    }
  }

  function configure(conf) {
    if (conf) {
      this._conf = conf;

      conf.delimiter && (this.delimiter = conf.delimiter);
      this._maxListeners = conf.maxListeners !== undefined ? conf.maxListeners : defaultMaxListeners;

      conf.wildcard && (this.wildcard = conf.wildcard);
      conf.newListener && (this.newListener = conf.newListener);
      conf.verboseMemoryLeak && (this.verboseMemoryLeak = conf.verboseMemoryLeak);

      if (this.wildcard) {
        this.listenerTree = {};
      }
    } else {
      this._maxListeners = defaultMaxListeners;
    }
  }

  function logPossibleMemoryLeak(count, eventName) {
    var errorMsg = '(node) warning: possible EventEmitter memory ' +
        'leak detected. ' + count + ' listeners added. ' +
        'Use emitter.setMaxListeners() to increase limit.';

    if(this.verboseMemoryLeak){
      errorMsg += ' Event name: ' + eventName + '.';
    }

    if(typeof process !== 'undefined' && process.emitWarning){
      var e = new Error(errorMsg);
      e.name = 'MaxListenersExceededWarning';
      e.emitter = this;
      e.count = count;
      process.emitWarning(e);
    } else {
      console.error(errorMsg);

      if (console.trace){
        console.trace();
      }
    }
  }

  function EventEmitter(conf) {
    this._events = {};
    this.newListener = false;
    this.verboseMemoryLeak = false;
    configure.call(this, conf);
  }
  EventEmitter.EventEmitter2 = EventEmitter; // backwards compatibility for exporting EventEmitter property

  //
  // Attention, function return type now is array, always !
  // It has zero elements if no any matches found and one or more
  // elements (leafs) if there are matches
  //
  function searchListenerTree(handlers, type, tree, i) {
    if (!tree) {
      return [];
    }
    var listeners=[], leaf, len, branch, xTree, xxTree, isolatedBranch, endReached,
        typeLength = type.length, currentType = type[i], nextType = type[i+1];
    if (i === typeLength && tree._listeners) {
      //
      // If at the end of the event(s) list and the tree has listeners
      // invoke those listeners.
      //
      if (typeof tree._listeners === 'function') {
        handlers && handlers.push(tree._listeners);
        return [tree];
      } else {
        for (leaf = 0, len = tree._listeners.length; leaf < len; leaf++) {
          handlers && handlers.push(tree._listeners[leaf]);
        }
        return [tree];
      }
    }

    if ((currentType === '*' || currentType === '**') || tree[currentType]) {
      //
      // If the event emitted is '*' at this part
      // or there is a concrete match at this patch
      //
      if (currentType === '*') {
        for (branch in tree) {
          if (branch !== '_listeners' && tree.hasOwnProperty(branch)) {
            listeners = listeners.concat(searchListenerTree(handlers, type, tree[branch], i+1));
          }
        }
        return listeners;
      } else if(currentType === '**') {
        endReached = (i+1 === typeLength || (i+2 === typeLength && nextType === '*'));
        if(endReached && tree._listeners) {
          // The next element has a _listeners, add it to the handlers.
          listeners = listeners.concat(searchListenerTree(handlers, type, tree, typeLength));
        }

        for (branch in tree) {
          if (branch !== '_listeners' && tree.hasOwnProperty(branch)) {
            if(branch === '*' || branch === '**') {
              if(tree[branch]._listeners && !endReached) {
                listeners = listeners.concat(searchListenerTree(handlers, type, tree[branch], typeLength));
              }
              listeners = listeners.concat(searchListenerTree(handlers, type, tree[branch], i));
            } else if(branch === nextType) {
              listeners = listeners.concat(searchListenerTree(handlers, type, tree[branch], i+2));
            } else {
              // No match on this one, shift into the tree but not in the type array.
              listeners = listeners.concat(searchListenerTree(handlers, type, tree[branch], i));
            }
          }
        }
        return listeners;
      }

      listeners = listeners.concat(searchListenerTree(handlers, type, tree[currentType], i+1));
    }

    xTree = tree['*'];
    if (xTree) {
      //
      // If the listener tree will allow any match for this part,
      // then recursively explore all branches of the tree
      //
      searchListenerTree(handlers, type, xTree, i+1);
    }

    xxTree = tree['**'];
    if(xxTree) {
      if(i < typeLength) {
        if(xxTree._listeners) {
          // If we have a listener on a '**', it will catch all, so add its handler.
          searchListenerTree(handlers, type, xxTree, typeLength);
        }

        // Build arrays of matching next branches and others.
        for(branch in xxTree) {
          if(branch !== '_listeners' && xxTree.hasOwnProperty(branch)) {
            if(branch === nextType) {
              // We know the next element will match, so jump twice.
              searchListenerTree(handlers, type, xxTree[branch], i+2);
            } else if(branch === currentType) {
              // Current node matches, move into the tree.
              searchListenerTree(handlers, type, xxTree[branch], i+1);
            } else {
              isolatedBranch = {};
              isolatedBranch[branch] = xxTree[branch];
              searchListenerTree(handlers, type, { '**': isolatedBranch }, i+1);
            }
          }
        }
      } else if(xxTree._listeners) {
        // We have reached the end and still on a '**'
        searchListenerTree(handlers, type, xxTree, typeLength);
      } else if(xxTree['*'] && xxTree['*']._listeners) {
        searchListenerTree(handlers, type, xxTree['*'], typeLength);
      }
    }

    return listeners;
  }

  function growListenerTree(type, listener) {

    type = typeof type === 'string' ? type.split(this.delimiter) : type.slice();

    //
    // Looks for two consecutive '**', if so, don't add the event at all.
    //
    for(var i = 0, len = type.length; i+1 < len; i++) {
      if(type[i] === '**' && type[i+1] === '**') {
        return;
      }
    }

    var tree = this.listenerTree;
    var name = type.shift();

    while (name !== undefined) {

      if (!tree[name]) {
        tree[name] = {};
      }

      tree = tree[name];

      if (type.length === 0) {

        if (!tree._listeners) {
          tree._listeners = listener;
        }
        else {
          if (typeof tree._listeners === 'function') {
            tree._listeners = [tree._listeners];
          }

          tree._listeners.push(listener);

          if (
            !tree._listeners.warned &&
            this._maxListeners > 0 &&
            tree._listeners.length > this._maxListeners
          ) {
            tree._listeners.warned = true;
            logPossibleMemoryLeak.call(this, tree._listeners.length, name);
          }
        }
        return true;
      }
      name = type.shift();
    }
    return true;
  }

  // By default EventEmitters will print a warning if more than
  // 10 listeners are added to it. This is a useful default which
  // helps finding memory leaks.
  //
  // Obviously not all Emitters should be limited to 10. This function allows
  // that to be increased. Set to zero for unlimited.

  EventEmitter.prototype.delimiter = '.';

  EventEmitter.prototype.setMaxListeners = function(n) {
    if (n !== undefined) {
      this._maxListeners = n;
      if (!this._conf) this._conf = {};
      this._conf.maxListeners = n;
    }
  };

  EventEmitter.prototype.event = '';


  EventEmitter.prototype.once = function(event, fn) {
    return this._once(event, fn, false);
  };

  EventEmitter.prototype.prependOnceListener = function(event, fn) {
    return this._once(event, fn, true);
  };

  EventEmitter.prototype._once = function(event, fn, prepend) {
    this._many(event, 1, fn, prepend);
    return this;
  };

  EventEmitter.prototype.many = function(event, ttl, fn) {
    return this._many(event, ttl, fn, false);
  }

  EventEmitter.prototype.prependMany = function(event, ttl, fn) {
    return this._many(event, ttl, fn, true);
  }

  EventEmitter.prototype._many = function(event, ttl, fn, prepend) {
    var self = this;

    if (typeof fn !== 'function') {
      throw new Error('many only accepts instances of Function');
    }

    function listener() {
      if (--ttl === 0) {
        self.off(event, listener);
      }
      return fn.apply(this, arguments);
    }

    listener._origin = fn;

    this._on(event, listener, prepend);

    return self;
  };

  EventEmitter.prototype.emit = function() {

    this._events || init.call(this);

    var type = arguments[0];

    if (type === 'newListener' && !this.newListener) {
      if (!this._events.newListener) {
        return false;
      }
    }

    var al = arguments.length;
    var args,l,i,j;
    var handler;

    if (this._all && this._all.length) {
      handler = this._all.slice();
      if (al > 3) {
        args = new Array(al);
        for (j = 0; j < al; j++) args[j] = arguments[j];
      }

      for (i = 0, l = handler.length; i < l; i++) {
        this.event = type;
        switch (al) {
        case 1:
          handler[i].call(this, type);
          break;
        case 2:
          handler[i].call(this, type, arguments[1]);
          break;
        case 3:
          handler[i].call(this, type, arguments[1], arguments[2]);
          break;
        default:
          handler[i].apply(this, args);
        }
      }
    }

    if (this.wildcard) {
      handler = [];
      var ns = typeof type === 'string' ? type.split(this.delimiter) : type.slice();
      searchListenerTree.call(this, handler, ns, this.listenerTree, 0);
    } else {
      handler = this._events[type];
      if (typeof handler === 'function') {
        this.event = type;
        switch (al) {
        case 1:
          handler.call(this);
          break;
        case 2:
          handler.call(this, arguments[1]);
          break;
        case 3:
          handler.call(this, arguments[1], arguments[2]);
          break;
        default:
          args = new Array(al - 1);
          for (j = 1; j < al; j++) args[j - 1] = arguments[j];
          handler.apply(this, args);
        }
        return true;
      } else if (handler) {
        // need to make copy of handlers because list can change in the middle
        // of emit call
        handler = handler.slice();
      }
    }

    if (handler && handler.length) {
      if (al > 3) {
        args = new Array(al - 1);
        for (j = 1; j < al; j++) args[j - 1] = arguments[j];
      }
      for (i = 0, l = handler.length; i < l; i++) {
        this.event = type;
        switch (al) {
        case 1:
          handler[i].call(this);
          break;
        case 2:
          handler[i].call(this, arguments[1]);
          break;
        case 3:
          handler[i].call(this, arguments[1], arguments[2]);
          break;
        default:
          handler[i].apply(this, args);
        }
      }
      return true;
    } else if (!this._all && type === 'error') {
      if (arguments[1] instanceof Error) {
        throw arguments[1]; // Unhandled 'error' event
      } else {
        throw new Error("Uncaught, unspecified 'error' event.");
      }
      return false;
    }

    return !!this._all;
  };

  EventEmitter.prototype.emitAsync = function() {

    this._events || init.call(this);

    var type = arguments[0];

    if (type === 'newListener' && !this.newListener) {
        if (!this._events.newListener) { return Promise.resolve([false]); }
    }

    var promises= [];

    var al = arguments.length;
    var args,l,i,j;
    var handler;

    if (this._all) {
      if (al > 3) {
        args = new Array(al);
        for (j = 1; j < al; j++) args[j] = arguments[j];
      }
      for (i = 0, l = this._all.length; i < l; i++) {
        this.event = type;
        switch (al) {
        case 1:
          promises.push(this._all[i].call(this, type));
          break;
        case 2:
          promises.push(this._all[i].call(this, type, arguments[1]));
          break;
        case 3:
          promises.push(this._all[i].call(this, type, arguments[1], arguments[2]));
          break;
        default:
          promises.push(this._all[i].apply(this, args));
        }
      }
    }

    if (this.wildcard) {
      handler = [];
      var ns = typeof type === 'string' ? type.split(this.delimiter) : type.slice();
      searchListenerTree.call(this, handler, ns, this.listenerTree, 0);
    } else {
      handler = this._events[type];
    }

    if (typeof handler === 'function') {
      this.event = type;
      switch (al) {
      case 1:
        promises.push(handler.call(this));
        break;
      case 2:
        promises.push(handler.call(this, arguments[1]));
        break;
      case 3:
        promises.push(handler.call(this, arguments[1], arguments[2]));
        break;
      default:
        args = new Array(al - 1);
        for (j = 1; j < al; j++) args[j - 1] = arguments[j];
        promises.push(handler.apply(this, args));
      }
    } else if (handler && handler.length) {
      handler = handler.slice();
      if (al > 3) {
        args = new Array(al - 1);
        for (j = 1; j < al; j++) args[j - 1] = arguments[j];
      }
      for (i = 0, l = handler.length; i < l; i++) {
        this.event = type;
        switch (al) {
        case 1:
          promises.push(handler[i].call(this));
          break;
        case 2:
          promises.push(handler[i].call(this, arguments[1]));
          break;
        case 3:
          promises.push(handler[i].call(this, arguments[1], arguments[2]));
          break;
        default:
          promises.push(handler[i].apply(this, args));
        }
      }
    } else if (!this._all && type === 'error') {
      if (arguments[1] instanceof Error) {
        return Promise.reject(arguments[1]); // Unhandled 'error' event
      } else {
        return Promise.reject("Uncaught, unspecified 'error' event.");
      }
    }

    return Promise.all(promises);
  };

  EventEmitter.prototype.on = function(type, listener) {
    return this._on(type, listener, false);
  };

  EventEmitter.prototype.prependListener = function(type, listener) {
    return this._on(type, listener, true);
  };

  EventEmitter.prototype.onAny = function(fn) {
    return this._onAny(fn, false);
  };

  EventEmitter.prototype.prependAny = function(fn) {
    return this._onAny(fn, true);
  };

  EventEmitter.prototype.addListener = EventEmitter.prototype.on;

  EventEmitter.prototype._onAny = function(fn, prepend){
    if (typeof fn !== 'function') {
      throw new Error('onAny only accepts instances of Function');
    }

    if (!this._all) {
      this._all = [];
    }

    // Add the function to the event listener collection.
    if(prepend){
      this._all.unshift(fn);
    }else{
      this._all.push(fn);
    }

    return this;
  }

  EventEmitter.prototype._on = function(type, listener, prepend) {
    if (typeof type === 'function') {
      this._onAny(type, listener);
      return this;
    }

    if (typeof listener !== 'function') {
      throw new Error('on only accepts instances of Function');
    }
    this._events || init.call(this);

    // To avoid recursion in the case that type == "newListeners"! Before
    // adding it to the listeners, first emit "newListeners".
    this.emit('newListener', type, listener);

    if (this.wildcard) {
      growListenerTree.call(this, type, listener);
      return this;
    }

    if (!this._events[type]) {
      // Optimize the case of one listener. Don't need the extra array object.
      this._events[type] = listener;
    }
    else {
      if (typeof this._events[type] === 'function') {
        // Change to array.
        this._events[type] = [this._events[type]];
      }

      // If we've already got an array, just add
      if(prepend){
        this._events[type].unshift(listener);
      }else{
        this._events[type].push(listener);
      }

      // Check for listener leak
      if (
        !this._events[type].warned &&
        this._maxListeners > 0 &&
        this._events[type].length > this._maxListeners
      ) {
        this._events[type].warned = true;
        logPossibleMemoryLeak.call(this, this._events[type].length, type);
      }
    }

    return this;
  }

  EventEmitter.prototype.off = function(type, listener) {
    if (typeof listener !== 'function') {
      throw new Error('removeListener only takes instances of Function');
    }

    var handlers,leafs=[];

    if(this.wildcard) {
      var ns = typeof type === 'string' ? type.split(this.delimiter) : type.slice();
      leafs = searchListenerTree.call(this, null, ns, this.listenerTree, 0);
    }
    else {
      // does not use listeners(), so no side effect of creating _events[type]
      if (!this._events[type]) return this;
      handlers = this._events[type];
      leafs.push({_listeners:handlers});
    }

    for (var iLeaf=0; iLeaf<leafs.length; iLeaf++) {
      var leaf = leafs[iLeaf];
      handlers = leaf._listeners;
      if (isArray(handlers)) {

        var position = -1;

        for (var i = 0, length = handlers.length; i < length; i++) {
          if (handlers[i] === listener ||
            (handlers[i].listener && handlers[i].listener === listener) ||
            (handlers[i]._origin && handlers[i]._origin === listener)) {
            position = i;
            break;
          }
        }

        if (position < 0) {
          continue;
        }

        if(this.wildcard) {
          leaf._listeners.splice(position, 1);
        }
        else {
          this._events[type].splice(position, 1);
        }

        if (handlers.length === 0) {
          if(this.wildcard) {
            delete leaf._listeners;
          }
          else {
            delete this._events[type];
          }
        }

        this.emit("removeListener", type, listener);

        return this;
      }
      else if (handlers === listener ||
        (handlers.listener && handlers.listener === listener) ||
        (handlers._origin && handlers._origin === listener)) {
        if(this.wildcard) {
          delete leaf._listeners;
        }
        else {
          delete this._events[type];
        }

        this.emit("removeListener", type, listener);
      }
    }

    function recursivelyGarbageCollect(root) {
      if (root === undefined) {
        return;
      }
      var keys = Object.keys(root);
      for (var i in keys) {
        var key = keys[i];
        var obj = root[key];
        if ((obj instanceof Function) || (typeof obj !== "object") || (obj === null))
          continue;
        if (Object.keys(obj).length > 0) {
          recursivelyGarbageCollect(root[key]);
        }
        if (Object.keys(obj).length === 0) {
          delete root[key];
        }
      }
    }
    recursivelyGarbageCollect(this.listenerTree);

    return this;
  };

  EventEmitter.prototype.offAny = function(fn) {
    var i = 0, l = 0, fns;
    if (fn && this._all && this._all.length > 0) {
      fns = this._all;
      for(i = 0, l = fns.length; i < l; i++) {
        if(fn === fns[i]) {
          fns.splice(i, 1);
          this.emit("removeListenerAny", fn);
          return this;
        }
      }
    } else {
      fns = this._all;
      for(i = 0, l = fns.length; i < l; i++)
        this.emit("removeListenerAny", fns[i]);
      this._all = [];
    }
    return this;
  };

  EventEmitter.prototype.removeListener = EventEmitter.prototype.off;

  EventEmitter.prototype.removeAllListeners = function(type) {
    if (arguments.length === 0) {
      !this._events || init.call(this);
      return this;
    }

    if (this.wildcard) {
      var ns = typeof type === 'string' ? type.split(this.delimiter) : type.slice();
      var leafs = searchListenerTree.call(this, null, ns, this.listenerTree, 0);

      for (var iLeaf=0; iLeaf<leafs.length; iLeaf++) {
        var leaf = leafs[iLeaf];
        leaf._listeners = null;
      }
    }
    else if (this._events) {
      this._events[type] = null;
    }
    return this;
  };

  EventEmitter.prototype.listeners = function(type) {
    if (this.wildcard) {
      var handlers = [];
      var ns = typeof type === 'string' ? type.split(this.delimiter) : type.slice();
      searchListenerTree.call(this, handlers, ns, this.listenerTree, 0);
      return handlers;
    }

    this._events || init.call(this);

    if (!this._events[type]) this._events[type] = [];
    if (!isArray(this._events[type])) {
      this._events[type] = [this._events[type]];
    }
    return this._events[type];
  };

  EventEmitter.prototype.eventNames = function(){
    return Object.keys(this._events);
  }

  EventEmitter.prototype.listenerCount = function(type) {
    return this.listeners(type).length;
  };

  EventEmitter.prototype.listenersAny = function() {

    if(this._all) {
      return this._all;
    }
    else {
      return [];
    }

  };

  if (typeof define === 'function' && define.amd) {
     // AMD. Register as an anonymous module.
    define(function() {
      return EventEmitter;
    });
  } else if (typeof exports === 'object') {
    // CommonJS
    module.exports = EventEmitter;
  }
  else {
    // Browser global.
    window.EventEmitter2 = EventEmitter;
  }
}();

}).call(this,require('_process'))

},{"_process":2}],2:[function(require,module,exports){
// shim for using process in browser
var process = module.exports = {};

// cached from whatever global is present so that test runners that stub it
// don't break things.  But we need to wrap it in a try catch in case it is
// wrapped in strict mode code which doesn't define any globals.  It's inside a
// function because try/catches deoptimize in certain engines.

var cachedSetTimeout;
var cachedClearTimeout;

function defaultSetTimout() {
    throw new Error('setTimeout has not been defined');
}
function defaultClearTimeout () {
    throw new Error('clearTimeout has not been defined');
}
(function () {
    try {
        if (typeof setTimeout === 'function') {
            cachedSetTimeout = setTimeout;
        } else {
            cachedSetTimeout = defaultSetTimout;
        }
    } catch (e) {
        cachedSetTimeout = defaultSetTimout;
    }
    try {
        if (typeof clearTimeout === 'function') {
            cachedClearTimeout = clearTimeout;
        } else {
            cachedClearTimeout = defaultClearTimeout;
        }
    } catch (e) {
        cachedClearTimeout = defaultClearTimeout;
    }
} ())
function runTimeout(fun) {
    if (cachedSetTimeout === setTimeout) {
        //normal enviroments in sane situations
        return setTimeout(fun, 0);
    }
    // if setTimeout wasn't available but was latter defined
    if ((cachedSetTimeout === defaultSetTimout || !cachedSetTimeout) && setTimeout) {
        cachedSetTimeout = setTimeout;
        return setTimeout(fun, 0);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedSetTimeout(fun, 0);
    } catch(e){
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't trust the global object when called normally
            return cachedSetTimeout.call(null, fun, 0);
        } catch(e){
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error
            return cachedSetTimeout.call(this, fun, 0);
        }
    }


}
function runClearTimeout(marker) {
    if (cachedClearTimeout === clearTimeout) {
        //normal enviroments in sane situations
        return clearTimeout(marker);
    }
    // if clearTimeout wasn't available but was latter defined
    if ((cachedClearTimeout === defaultClearTimeout || !cachedClearTimeout) && clearTimeout) {
        cachedClearTimeout = clearTimeout;
        return clearTimeout(marker);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedClearTimeout(marker);
    } catch (e){
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't  trust the global object when called normally
            return cachedClearTimeout.call(null, marker);
        } catch (e){
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error.
            // Some versions of I.E. have different rules for clearTimeout vs setTimeout
            return cachedClearTimeout.call(this, marker);
        }
    }



}
var queue = [];
var draining = false;
var currentQueue;
var queueIndex = -1;

function cleanUpNextTick() {
    if (!draining || !currentQueue) {
        return;
    }
    draining = false;
    if (currentQueue.length) {
        queue = currentQueue.concat(queue);
    } else {
        queueIndex = -1;
    }
    if (queue.length) {
        drainQueue();
    }
}

function drainQueue() {
    if (draining) {
        return;
    }
    var timeout = runTimeout(cleanUpNextTick);
    draining = true;

    var len = queue.length;
    while(len) {
        currentQueue = queue;
        queue = [];
        while (++queueIndex < len) {
            if (currentQueue) {
                currentQueue[queueIndex].run();
            }
        }
        queueIndex = -1;
        len = queue.length;
    }
    currentQueue = null;
    draining = false;
    runClearTimeout(timeout);
}

process.nextTick = function (fun) {
    var args = new Array(arguments.length - 1);
    if (arguments.length > 1) {
        for (var i = 1; i < arguments.length; i++) {
            args[i - 1] = arguments[i];
        }
    }
    queue.push(new Item(fun, args));
    if (queue.length === 1 && !draining) {
        runTimeout(drainQueue);
    }
};

// v8 likes predictible objects
function Item(fun, array) {
    this.fun = fun;
    this.array = array;
}
Item.prototype.run = function () {
    this.fun.apply(null, this.array);
};
process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];
process.version = ''; // empty string to avoid regexp issues
process.versions = {};

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;
process.prependListener = noop;
process.prependOnceListener = noop;

process.listeners = function (name) { return [] }

process.binding = function (name) {
    throw new Error('process.binding is not supported');
};

process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};
process.umask = function() { return 0; };

},{}],3:[function(require,module,exports){
'use strict';

require('./js/modules/global');

require('./js/modules/config');

require('./js/modules/utils');

require('./js/modules/handleClicks');

require('./js/modules/sidebar');

require('./js/modules/droplet');

require('./js/modules/youtube');

},{"./js/modules/config":4,"./js/modules/droplet":6,"./js/modules/global":7,"./js/modules/handleClicks":8,"./js/modules/sidebar":9,"./js/modules/utils":10,"./js/modules/youtube":11}],4:[function(require,module,exports){
'use strict';

var config = JC.config = {};
config.project = 'justynClark-new';
config.developer = 'justyn clark';
config.version = "1.0.0";

},{}],5:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

exports.setPolicyCookie = setPolicyCookie;
var cookieMap;
// Cookies
JC.utils.getCookies = function (update) {
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

JC.utils.getCookie = function (c, update) {
  // Get cookie
  return undefined.getCookies(update)[c];
};

JC.utils.setCookie = function (name, value, opts) {
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

setTimeout(function () {
  if (!document.cookie.match('jcCookie')) {
    document.querySelector('.cookie-policy').classList.add('cookie-policy--show');
  } else {
    console.log('cookie policy is hidden');
    document.querySelector('.cookie-policy').classList.add('cookie-policy--hide');
  }
}, 1000);

function setPolicyCookie() {
  document.querySelector('.cookie-policy').classList.add('cookie-policy--hide');
  console.log('cookie set');
  JC.utils.setCookie('jcCookie', true, { expireDate: 3600 * 24 * 365 });
}

},{}],6:[function(require,module,exports){
'use strict';

(function () {
  var droplet = document.querySelector('.droplet');
  droplet.style.opacity = 0;
  function fadeInDroplet() {
    setTimeout(function () {
      droplet.style.opacity = 1;
    }, 2000);
  }
  EVT.on('init', fadeInDroplet);
})();

},{}],7:[function(require,module,exports){
'use strict';

var _eventemitter = require('eventemitter2');

var _eventemitter2 = _interopRequireDefault(_eventemitter);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

(function (global) {

  global.JC = global.JC !== undefined ? JC : {}; // Declare Global Object
  global.EVT = new _eventemitter2.default();

  JC.components = {};
  JC.config = {};
  JC.menu = {};
  JC.utils = {};

  global.addEventListener('DOMContentLoaded', function () {
    EVT.emit('init');
  });

  console.log(JC);
})(window);

},{"eventemitter2":1}],8:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.play = play;

var _cookies = require('./cookies');

require('./youtube');

function play() {
  var videos = randTubeVid();
  var videoID = videos[JC.utils.randomNumber(videos.length)];
  var video = JC.utils.youTubePlayer(videoID);
  video();
};

function randTubeVid() {
  var vidList = [];
  for (var i = 0; i < JC.utils.data.items.length; i++) {
    vidList[i] = JC.utils.data.items[i].contentDetails.videoId;
  }
  return vidList;
};

// Set up click handlers
function clickHandlers() {

  var header = document.querySelector('.header');
  var content1 = document.querySelector('.logo');
  var body = document.querySelector('body');
  var openOverlay = document.querySelector('[rel="1"]');
  var overlay = document.querySelector('.overlay');
  //document.querySelector('[rel="main__loadNames"]').addEventListener('click', loadNames);
  /*document.querySelector('[rel="main__clicker"]').addEventListener('click', function() {
    document.querySelector('[rel="main__clicker"]').innerHTML = adder();
  });*/

  document.querySelector('.cookie-policy__close').addEventListener('click', _cookies.setPolicyCookie); // Cookie Policy
  overlay.addEventListener('click', JC.utils.closeOverlay); // close overlay
  openOverlay.addEventListener('click', JC.utils.openOverlay); // open overlay
  openOverlay.addEventListener('click', play); // open overlay
  content1.addEventListener('click', function () {
    header.classList.toggle('--open');
    body.classList.toggle('overlay--open');
  });
}

EVT.on('init', clickHandlers);

},{"./cookies":5,"./youtube":11}],9:[function(require,module,exports){
'use strict';

(function (JC) {

  var sidebar = JC.components.sidebar = {};

  var f = document.querySelector('.sidebar');

  sidebar.openSidebar = function () {
    f.classList.add('sidebar--open');
  };
  sidebar.closeSidebar = function () {
    f.classList.remove('sidebar--open');
  };

  sidebar.delay = function (callback, time) {
    setTimeout(callback, time);
  };

  sidebar.interval = function (callback, time) {
    setInterval(callback, time);
  };

  sidebar.slideToggle = function () {
    f.classList.toggle('sidebar--open');
  };

  sidebar.init = function () {
    //sidebar.interval(sidebar.slideToggle, 2000);
    sidebar.delay(sidebar.openSidebar, 2000);
  };

  EVT.on('init', sidebar.init);
})(JC);

},{}],10:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.randNumGen = randNumGen;

require('./cookies');

JC.utils.adder = function () {
  var plus = function plus() {
    var counter = 0;
    return function () {
      return counter++;
    };
  };
  return plus();
};

// this checker
JC.utils.thisCheck = function () {
  console.log(this);
};

JC.utils.randomNumber = function (len) {
  return Math.floor(Math.random() * len);
};

JC.utils.output = function (x) {
  console.log(x);
};

// Character count in Element
JC.utils.charsInElement = function (elm) {
  if (elm.nodeType == 3) {
    // TEXT_NODE
    return elm.nodeValue.length;
  }
  var count = 0;
  for (var i = 0, child; child = elm.childNodes[i]; i++) {
    count += JC.utils.charsInElement(child);
  }
  return count;
};

// Alert utility
JC.utils.alert = function (a) {
  alert(a);
};

JC.utils.showBodyCharNum = function () {
  var elm = document.querySelector('body');
  console.log("This page has " + JC.utils.charsInElement(elm) + " characters in the body");
};

JC.utils.openOverlay = function () {
  var overlay = document.querySelector('.overlay');
  var body = document.querySelector('body');
  var overlayInner = document.querySelector('.overlay__inner');
  overlay.classList.toggle('overlay--open');
  body.classList.add('overlay--open');
  overlayInner.classList.add('overlay--open');
};

JC.utils.closeOverlay = function () {
  var overlay = document.querySelector('.overlay');
  var body = document.querySelector('body');
  var overlayInner = document.querySelector('.overlay__inner');
  var vid = document.querySelector('.video__wrap');

  overlay.classList.toggle('overlay--open');
  body.classList.toggle('overlay--open');
  overlayInner.classList.toggle('overlay--open');

  vid.remove();
};

JC.utils.youTubePlayer = function (id) {
  return function () {
    var body = document.querySelector('body');
    var video__wrap = document.createElement('div');
    var videoWrapper = document.createElement('div');
    var iframeDiv = document.createElement('iFrame');
    iframeDiv.setAttribute('data-youtube-id', id);
    iframeDiv.setAttribute('src', 'https://www.youtube.com/embed/' + id + '?rel=0&amp;controls=0&amp');
    video__wrap.setAttribute('class', 'video__wrap');
    videoWrapper.setAttribute('class', 'videoWrapper');
    video__wrap.appendChild(videoWrapper);
    videoWrapper.appendChild(iframeDiv);
    body.appendChild(video__wrap);
    console.log('return');
  };
};

function randNumGen(max) {
  return Math.floor(Math.random() * max);
};

/*<iframe width="1280" height="720" src="https://www.youtube.com/embed/RKYjdTiMkXM?rel=0&amp;controls=0&amp;showinfo=0" frameborder="0" allowfullscreen=""></iframe>*/

},{"./cookies":5}],11:[function(require,module,exports){
"use strict";

JC.utils.data = {
  "kind": "youtube#playlistItemListResponse",
  "etag": "\"cbz3lIQ2N25AfwNr-BdxUVxJ_QY/hlcgIXDADC-q1FI1GPsKKNvovaM\"",
  "nextPageToken": "CBkQAA",
  "pageInfo": {
    "totalResults": 41,
    "resultsPerPage": 25
  },
  "items": [{
    "kind": "youtube#playlistItem",
    "etag": "\"cbz3lIQ2N25AfwNr-BdxUVxJ_QY/BniZWl6UrF2z61C3B0tvNtrBjDg\"",
    "id": "UExRYUpEd0xYeUJ0WHIxRmUyRlJ6SWRUM1JGZUc1MlFWRi41NkI0NEY2RDEwNTU3Q0M2",
    "snippet": {
      "publishedAt": "2015-02-18T05:57:31.000Z",
      "channelId": "UCVM4C1fB9Qcwy7dNjbXeUVw",
      "title": "Learning how to use jQuery AJAX with PHP",
      "description": "Getting started with AJAX is super easy when you use the jQuery library. That works well for the client side, but how do you work with a server side language like PHP? It's easier than you think.",
      "thumbnails": {
        "default": {
          "url": "https://i.ytimg.com/vi/TR0gkGbMwW0/default.jpg",
          "width": 120,
          "height": 90
        },
        "medium": {
          "url": "https://i.ytimg.com/vi/TR0gkGbMwW0/mqdefault.jpg",
          "width": 320,
          "height": 180
        },
        "high": {
          "url": "https://i.ytimg.com/vi/TR0gkGbMwW0/hqdefault.jpg",
          "width": 480,
          "height": 360
        },
        "standard": {
          "url": "https://i.ytimg.com/vi/TR0gkGbMwW0/sddefault.jpg",
          "width": 640,
          "height": 480
        },
        "maxres": {
          "url": "https://i.ytimg.com/vi/TR0gkGbMwW0/maxresdefault.jpg",
          "width": 1280,
          "height": 720
        }
      },
      "channelTitle": "Justyn Clark",
      "playlistId": "PLQaJDwLXyBtXr1Fe2FRzIdT3RFeG52QVF",
      "position": 0,
      "resourceId": {
        "kind": "youtube#video",
        "videoId": "TR0gkGbMwW0"
      }
    },
    "contentDetails": {
      "videoId": "TR0gkGbMwW0",
      "videoPublishedAt": "2013-01-01T02:35:50.000Z"
    }
  }, {
    "kind": "youtube#playlistItem",
    "etag": "\"cbz3lIQ2N25AfwNr-BdxUVxJ_QY/rAXEanxbsKVUIBejZg5fmsiWyXc\"",
    "id": "UExRYUpEd0xYeUJ0WHIxRmUyRlJ6SWRUM1JGZUc1MlFWRi4yODlGNEE0NkRGMEEzMEQy",
    "snippet": {
      "publishedAt": "2015-02-27T18:36:49.000Z",
      "channelId": "UCVM4C1fB9Qcwy7dNjbXeUVw",
      "title": "Github Tutorial For Beginners - Github Basics for Mac or Windows & Source Control Basics",
      "description": "Github Tutorial For Beginners - learn Github for Mac or Github for windows\nIf you've been wanting to learn Github, now's the perfect time!  Github is seen as a big requirement by most employers these days and is very critical to business workflow.  This Github tutorial will cover the basics of how to use Github and the command line.\n\nLesson #2: Pull requests, Branching merging\nhttps://www.youtube.com/watch?v=oFYyTZwMyAg\n\nOther Videos:\njQuery rapid-learning Course\nhttps://www.youtube.com/watch?v=hMxGhHNOkCU",
      "thumbnails": {
        "default": {
          "url": "https://i.ytimg.com/vi/0fKg7e37bQE/default.jpg",
          "width": 120,
          "height": 90
        },
        "medium": {
          "url": "https://i.ytimg.com/vi/0fKg7e37bQE/mqdefault.jpg",
          "width": 320,
          "height": 180
        },
        "high": {
          "url": "https://i.ytimg.com/vi/0fKg7e37bQE/hqdefault.jpg",
          "width": 480,
          "height": 360
        },
        "standard": {
          "url": "https://i.ytimg.com/vi/0fKg7e37bQE/sddefault.jpg",
          "width": 640,
          "height": 480
        }
      },
      "channelTitle": "Justyn Clark",
      "playlistId": "PLQaJDwLXyBtXr1Fe2FRzIdT3RFeG52QVF",
      "position": 1,
      "resourceId": {
        "kind": "youtube#video",
        "videoId": "0fKg7e37bQE"
      }
    },
    "contentDetails": {
      "videoId": "0fKg7e37bQE",
      "videoPublishedAt": "2014-01-16T20:05:27.000Z"
    }
  }, {
    "kind": "youtube#playlistItem",
    "etag": "\"cbz3lIQ2N25AfwNr-BdxUVxJ_QY/BeFu7kUaSJHH9jG8P3E7kDgxTAE\"",
    "id": "UExRYUpEd0xYeUJ0WHIxRmUyRlJ6SWRUM1JGZUc1MlFWRi4wMTcyMDhGQUE4NTIzM0Y5",
    "snippet": {
      "publishedAt": "2015-03-02T22:47:08.000Z",
      "channelId": "UCVM4C1fB9Qcwy7dNjbXeUVw",
      "title": "AngularJS Tutorial",
      "description": "A video tutorial to help you get started with AngularJS. You can play around with the final result in the following jsfiddle:\n\nhttp://jsfiddle.net/johnlindquist/U3c2Q/\n\nPlease take any technical questions about AngularJS to the very active and helpful AngularJS mailing list:\nhttps://groups.google.com/forum/?fromgroups#!forum/angular",
      "thumbnails": {
        "default": {
          "url": "https://i.ytimg.com/vi/WuiHuZq_cg4/default.jpg",
          "width": 120,
          "height": 90
        },
        "medium": {
          "url": "https://i.ytimg.com/vi/WuiHuZq_cg4/mqdefault.jpg",
          "width": 320,
          "height": 180
        },
        "high": {
          "url": "https://i.ytimg.com/vi/WuiHuZq_cg4/hqdefault.jpg",
          "width": 480,
          "height": 360
        },
        "standard": {
          "url": "https://i.ytimg.com/vi/WuiHuZq_cg4/sddefault.jpg",
          "width": 640,
          "height": 480
        },
        "maxres": {
          "url": "https://i.ytimg.com/vi/WuiHuZq_cg4/maxresdefault.jpg",
          "width": 1280,
          "height": 720
        }
      },
      "channelTitle": "Justyn Clark",
      "playlistId": "PLQaJDwLXyBtXr1Fe2FRzIdT3RFeG52QVF",
      "position": 2,
      "resourceId": {
        "kind": "youtube#video",
        "videoId": "WuiHuZq_cg4"
      }
    },
    "contentDetails": {
      "videoId": "WuiHuZq_cg4",
      "videoPublishedAt": "2012-04-04T06:55:16.000Z"
    }
  }, {
    "kind": "youtube#playlistItem",
    "etag": "\"cbz3lIQ2N25AfwNr-BdxUVxJ_QY/KF_OBGq3sRCCQ6_3g0VDGGWdVWY\"",
    "id": "UExRYUpEd0xYeUJ0WHIxRmUyRlJ6SWRUM1JGZUc1MlFWRi41MjE1MkI0OTQ2QzJGNzNG",
    "snippet": {
      "publishedAt": "2015-03-10T05:54:08.000Z",
      "channelId": "UCVM4C1fB9Qcwy7dNjbXeUVw",
      "title": "Introduction to Angular.js in 50 Examples (part 1)",
      "description": "Code at https://github.com/curran/screencasts/tree/gh-pages/introToAngular An introduction to Angular.js covering single-page-app concepts, related libraries and angular features by example. This installment (part 1) covers 36 of the 50 Angular examples. Part 2 covers the rest https://www.youtube.com/watch?v=6J08m1H2BME&feature=youtu.be Examples start at 11:30 in the video.\n\nIf you appreciate this work, please consider supporting me on Patreon https://www.patreon.com/user?u=2916242&ty=h\n\nThis lecture was given by Curran Kelleher at the University of Massachusetts Lowell on March 6, 2014 as part of the undergraduate course GUI Programming II taught by Professor Jesse Heines.",
      "thumbnails": {
        "default": {
          "url": "https://i.ytimg.com/vi/TRrL5j3MIvo/default.jpg",
          "width": 120,
          "height": 90
        },
        "medium": {
          "url": "https://i.ytimg.com/vi/TRrL5j3MIvo/mqdefault.jpg",
          "width": 320,
          "height": 180
        },
        "high": {
          "url": "https://i.ytimg.com/vi/TRrL5j3MIvo/hqdefault.jpg",
          "width": 480,
          "height": 360
        }
      },
      "channelTitle": "Justyn Clark",
      "playlistId": "PLQaJDwLXyBtXr1Fe2FRzIdT3RFeG52QVF",
      "position": 3,
      "resourceId": {
        "kind": "youtube#video",
        "videoId": "TRrL5j3MIvo"
      }
    },
    "contentDetails": {
      "videoId": "TRrL5j3MIvo",
      "videoPublishedAt": "2014-03-08T03:06:25.000Z"
    }
  }, {
    "kind": "youtube#playlistItem",
    "etag": "\"cbz3lIQ2N25AfwNr-BdxUVxJ_QY/cZRI8Y2l_EIAqOZvnz9JFMAiC3M\"",
    "id": "UExRYUpEd0xYeUJ0WHIxRmUyRlJ6SWRUM1JGZUc1MlFWRi4wOTA3OTZBNzVEMTUzOTMy",
    "snippet": {
      "publishedAt": "2015-03-11T10:57:54.000Z",
      "channelId": "UCVM4C1fB9Qcwy7dNjbXeUVw",
      "title": "Using Animate.css and jQuery for easy Web Animation",
      "description": "Simple tutorial on how to use Animate.css and jQuery together in your website or web app! 🔥Subscribe for more like this: https://goo.gl/LUEkN1",
      "thumbnails": {
        "default": {
          "url": "https://i.ytimg.com/vi/CBQGl6zokMs/default.jpg",
          "width": 120,
          "height": 90
        },
        "medium": {
          "url": "https://i.ytimg.com/vi/CBQGl6zokMs/mqdefault.jpg",
          "width": 320,
          "height": 180
        },
        "high": {
          "url": "https://i.ytimg.com/vi/CBQGl6zokMs/hqdefault.jpg",
          "width": 480,
          "height": 360
        },
        "standard": {
          "url": "https://i.ytimg.com/vi/CBQGl6zokMs/sddefault.jpg",
          "width": 640,
          "height": 480
        },
        "maxres": {
          "url": "https://i.ytimg.com/vi/CBQGl6zokMs/maxresdefault.jpg",
          "width": 1280,
          "height": 720
        }
      },
      "channelTitle": "Justyn Clark",
      "playlistId": "PLQaJDwLXyBtXr1Fe2FRzIdT3RFeG52QVF",
      "position": 4,
      "resourceId": {
        "kind": "youtube#video",
        "videoId": "CBQGl6zokMs"
      }
    },
    "contentDetails": {
      "videoId": "CBQGl6zokMs",
      "videoPublishedAt": "2014-06-05T19:59:43.000Z"
    }
  }, {

    "kind": "youtube#playlistItem",
    "etag": "\"cbz3lIQ2N25AfwNr-BdxUVxJ_QY/2oQu15BQ95gjQczIRHVuSp66fNA\"",
    "id": "UExRYUpEd0xYeUJ0WHIxRmUyRlJ6SWRUM1JGZUc1MlFWRi4xMkVGQjNCMUM1N0RFNEUx",
    "snippet": {
      "publishedAt": "2015-03-14T07:42:20.000Z",
      "channelId": "UCVM4C1fB9Qcwy7dNjbXeUVw",
      "title": "WEB DEVELOPMENT - SECRETS TO STARTING A CAREER in the Web Development Industry",
      "description": "Everyone keeps saying how great web development is, but how do you get that first job?  This video is a response to the questions I've been getting about how to land that first web development job and how to know when you're ready to take the leap and look for one.\n\nThe first thing you have to know is that you don't have to be a seasoned pro to get a job as a full-time web developer.  There are LOTS of companies looking for web developers that don't have much experience.\n\nAlso, there are a lot of things you can do to prepare your resume to really stick out to a prospective employer.\n\nThis video will give you a feel for what an employer will be looking for and what they'll be \"grading\" you on as you look for a job in this industry.\n\nGithub Intro: \nhttps://www.youtube.com/watch?v=0fKg7e37bQE\nGithub Pull Requests: \nhttps://www.youtube.com/watch?v=oFYyTZwMyAg\n\njQuery Course:\nhttps://www.youtube.com/playlist?list=PLoYCgNOIyGABdI2V8I_SWo22tFpgh2s6_",
      "thumbnails": {
        "default": {
          "url": "https://i.ytimg.com/vi/JilfXmI2IjQ/default.jpg",
          "width": 120,
          "height": 90
        },
        "medium": {
          "url": "https://i.ytimg.com/vi/JilfXmI2IjQ/mqdefault.jpg",
          "width": 320,
          "height": 180
        },
        "high": {
          "url": "https://i.ytimg.com/vi/JilfXmI2IjQ/hqdefault.jpg",
          "width": 480,
          "height": 360
        },
        "standard": {
          "url": "https://i.ytimg.com/vi/JilfXmI2IjQ/sddefault.jpg",
          "width": 640,
          "height": 480
        }
      },
      "channelTitle": "Justyn Clark",
      "playlistId": "PLQaJDwLXyBtXr1Fe2FRzIdT3RFeG52QVF",
      "position": 5,
      "resourceId": {
        "kind": "youtube#video",
        "videoId": "JilfXmI2IjQ"
      }
    },
    "contentDetails": {
      "videoId": "JilfXmI2IjQ",
      "videoPublishedAt": "2014-04-21T18:00:02.000Z"
    }
  }, {

    "kind": "youtube#playlistItem",
    "etag": "\"cbz3lIQ2N25AfwNr-BdxUVxJ_QY/arv4qqC6Bj9wLgoKkX4ZNrUbtac\"",
    "id": "UExRYUpEd0xYeUJ0WHIxRmUyRlJ6SWRUM1JGZUc1MlFWRi41MzJCQjBCNDIyRkJDN0VD",
    "snippet": {
      "publishedAt": "2015-03-20T08:51:17.000Z",
      "channelId": "UCVM4C1fB9Qcwy7dNjbXeUVw",
      "title": "Realtime \"Eye Candy\" with AngularJS",
      "description": "Learn how to make a fully interactive, realtime AngularJS application with snappy animation effects, sleek performance and clean, organized code. Top that off by testing all aspects of the application using Protractor and Unit testing across multiple browsers using Karma + Sauce Labs.",
      "thumbnails": {
        "default": {
          "url": "https://i.ytimg.com/vi/8uj7YSqby7s/default.jpg",
          "width": 120,
          "height": 90
        },
        "medium": {
          "url": "https://i.ytimg.com/vi/8uj7YSqby7s/mqdefault.jpg",
          "width": 320,
          "height": 180
        },
        "high": {
          "url": "https://i.ytimg.com/vi/8uj7YSqby7s/hqdefault.jpg",
          "width": 480,
          "height": 360
        },
        "standard": {
          "url": "https://i.ytimg.com/vi/8uj7YSqby7s/sddefault.jpg",
          "width": 640,
          "height": 480
        },
        "maxres": {
          "url": "https://i.ytimg.com/vi/8uj7YSqby7s/maxresdefault.jpg",
          "width": 1280,
          "height": 720
        }
      },
      "channelTitle": "Justyn Clark",
      "playlistId": "PLQaJDwLXyBtXr1Fe2FRzIdT3RFeG52QVF",
      "position": 6,
      "resourceId": {
        "kind": "youtube#video",
        "videoId": "8uj7YSqby7s"
      }
    },
    "contentDetails": {
      "videoId": "8uj7YSqby7s",
      "videoPublishedAt": "2014-01-15T14:00:03.000Z"
    }
  }, {

    "kind": "youtube#playlistItem",
    "etag": "\"cbz3lIQ2N25AfwNr-BdxUVxJ_QY/bhcxPfCuQg_kGSvUA1ssNZbeB1M\"",
    "id": "UExRYUpEd0xYeUJ0WHIxRmUyRlJ6SWRUM1JGZUc1MlFWRi5DQUNERDQ2NkIzRUQxNTY1",
    "snippet": {
      "publishedAt": "2015-03-31T19:57:53.000Z",
      "channelId": "UCVM4C1fB9Qcwy7dNjbXeUVw",
      "title": "Junior Developer 101: Tips for How to Score a Job",
      "description": "Trying to become a junior developer? Have anxiety about the interview process? We are bringing together junior devs who made it through on the other side and lived to tell the tale.\n\nJoin us for another G+ Hangout to talk about \"Interview 101\" with devs, recruiters and employers.  \n\nWe'll answer questions like:\n\n1. What are some of the best resources for my job search?\n2. Do I need prior experience in coding or the industry to get a job?\n3. What kind of jobs should I be looking for? Is freelancing a good option? \n4. Is your portfolio the most important thing? How can I make mine better?\n5. What do hiring managers want to see on a resume?\n6. What helps me actually get an interview?\n7. What do I need to do to prepare? What test programs should I know?\n8. How do I explain my background if I've learned coding in a non-traditional way?\n9. What kind of questions should I be asking them? How do I know if it's a good culture fit?\n10. Any tips on how to stand out and follow up after the fact? \n\nAsk questions and join the conversation using  #ThinkJobs !\n\nPanelists:\nGrae Drake (@Grae_Drake) - Head of Education Operations, Thinkful (Moderator)\nLaura Horak (@laurashorak )  - Head of Community, Thinkful\nThomas Peterson (@ripleyaffect) - Engineer, Thinkful\nLee Edwards (@terronk) - Engineer Manager, Groupon\nRockman Ha (@Rocktotheman) - Chief People Officer; formerly Mongo DB\nEli Goodman (@elimgoodman) - Chief Technology Officer, Little Borrowed Dress",
      "thumbnails": {
        "default": {
          "url": "https://i.ytimg.com/vi/9qEFDqhPDCk/default.jpg",
          "width": 120,
          "height": 90
        },
        "medium": {
          "url": "https://i.ytimg.com/vi/9qEFDqhPDCk/mqdefault.jpg",
          "width": 320,
          "height": 180
        },
        "high": {
          "url": "https://i.ytimg.com/vi/9qEFDqhPDCk/hqdefault.jpg",
          "width": 480,
          "height": 360
        },
        "standard": {
          "url": "https://i.ytimg.com/vi/9qEFDqhPDCk/sddefault.jpg",
          "width": 640,
          "height": 480
        },
        "maxres": {
          "url": "https://i.ytimg.com/vi/9qEFDqhPDCk/maxresdefault.jpg",
          "width": 1280,
          "height": 720
        }
      },
      "channelTitle": "Justyn Clark",
      "playlistId": "PLQaJDwLXyBtXr1Fe2FRzIdT3RFeG52QVF",
      "position": 7,
      "resourceId": {
        "kind": "youtube#video",
        "videoId": "9qEFDqhPDCk"
      }
    },
    "contentDetails": {
      "videoId": "9qEFDqhPDCk",
      "videoPublishedAt": "2014-07-11T19:52:20.000Z"
    }
  }, {

    "kind": "youtube#playlistItem",
    "etag": "\"cbz3lIQ2N25AfwNr-BdxUVxJ_QY/cBUBfxpNIATdFF-wYgYcxCqveb8\"",
    "id": "UExRYUpEd0xYeUJ0WHIxRmUyRlJ6SWRUM1JGZUc1MlFWRi45NDk1REZENzhEMzU5MDQz",
    "snippet": {
      "publishedAt": "2015-09-29T06:29:13.000Z",
      "channelId": "UCVM4C1fB9Qcwy7dNjbXeUVw",
      "title": "CSS preprocessors with Jonathan Verrecchia",
      "description": "Yelp front-end engineer Jonathan Verrecchia will demonstrate the power of CSS preprocessors and explain why he believes these are a game changer for front-end development in this presentation given at the San Francisco HTML5 User Group.\n\nJonathan's talk will cover:\n- CSS weaknesses\n- Preprocessor features\n- Common misconceptions\n- Sass, Less, or Stylus?\n- Workflow and techniques\n- Preprocessors + OOCS\n\n** More videos on open source development at http://marakana.com/s/\n** Slides at http://mrkn.co/ucvpm",
      "thumbnails": {
        "default": {
          "url": "https://i.ytimg.com/vi/FlW2vvl0yvo/default.jpg",
          "width": 120,
          "height": 90
        },
        "medium": {
          "url": "https://i.ytimg.com/vi/FlW2vvl0yvo/mqdefault.jpg",
          "width": 320,
          "height": 180
        },
        "high": {
          "url": "https://i.ytimg.com/vi/FlW2vvl0yvo/hqdefault.jpg",
          "width": 480,
          "height": 360
        },
        "standard": {
          "url": "https://i.ytimg.com/vi/FlW2vvl0yvo/sddefault.jpg",
          "width": 640,
          "height": 480
        },
        "maxres": {
          "url": "https://i.ytimg.com/vi/FlW2vvl0yvo/maxresdefault.jpg",
          "width": 1280,
          "height": 720
        }
      },
      "channelTitle": "Justyn Clark",
      "playlistId": "PLQaJDwLXyBtXr1Fe2FRzIdT3RFeG52QVF",
      "position": 8,
      "resourceId": {
        "kind": "youtube#video",
        "videoId": "FlW2vvl0yvo"
      }
    },
    "contentDetails": {
      "videoId": "FlW2vvl0yvo",
      "videoPublishedAt": "2012-06-12T21:03:31.000Z"
    }
  }, {

    "kind": "youtube#playlistItem",
    "etag": "\"cbz3lIQ2N25AfwNr-BdxUVxJ_QY/6Qf6LaASCBZmFFIBFoqfa6WNHSw\"",
    "id": "UExRYUpEd0xYeUJ0WHIxRmUyRlJ6SWRUM1JGZUc1MlFWRi5GNjNDRDREMDQxOThCMDQ2",
    "snippet": {
      "publishedAt": "2015-12-03T07:12:07.000Z",
      "channelId": "UCVM4C1fB9Qcwy7dNjbXeUVw",
      "title": "REST API concepts and examples",
      "description": "This video introduces the viewer to some API concepts by making example calls to Facebook's Graph API, Google Maps' API, Instagram's Media Search API, and Twitter's Status Update API.\n\n/********** VIDEO LINKS **********/\n\nYoutube's Facebook Page via the Facebook Graph API\nhttp://graph.facebook.com/youtube\n\nSame thing, this time with filters\nhttps://graph.facebook.com/youtube?fields=id,name,likes\n\nGoogle Maps Geocode API call for the city of Chicago\nhttp://maps.googleapis.com/maps/api/geocode/json?address=Chicago\n\nApigee Instagram API console\nhttps://apigee.com/console/instagram\n\nHTTP Request Methods\nhttp://en.wikipedia.org/wiki/Hypertext_Transfer_Protocol#Request_methods\n\nPostman Chrome Extension\nhttps://chrome.google.com/webstore/detail/postman-rest-client/fdmmgilgnpjigdojojpjoooidkmcomcm?hl=en\n\nTwitter's Status Update documentation.\nhttps://dev.twitter.com/docs/api/1.1/post/statuses/update",
      "thumbnails": {
        "default": {
          "url": "https://i.ytimg.com/vi/7YcW25PHnAA/default.jpg",
          "width": 120,
          "height": 90
        },
        "medium": {
          "url": "https://i.ytimg.com/vi/7YcW25PHnAA/mqdefault.jpg",
          "width": 320,
          "height": 180
        },
        "high": {
          "url": "https://i.ytimg.com/vi/7YcW25PHnAA/hqdefault.jpg",
          "width": 480,
          "height": 360
        },
        "standard": {
          "url": "https://i.ytimg.com/vi/7YcW25PHnAA/sddefault.jpg",
          "width": 640,
          "height": 480
        },
        "maxres": {
          "url": "https://i.ytimg.com/vi/7YcW25PHnAA/maxresdefault.jpg",
          "width": 1280,
          "height": 720
        }
      },
      "channelTitle": "Justyn Clark",
      "playlistId": "PLQaJDwLXyBtXr1Fe2FRzIdT3RFeG52QVF",
      "position": 9,
      "resourceId": {
        "kind": "youtube#video",
        "videoId": "7YcW25PHnAA"
      }
    },
    "contentDetails": {
      "videoId": "7YcW25PHnAA",
      "videoPublishedAt": "2014-07-14T08:06:49.000Z"
    }
  }, {

    "kind": "youtube#playlistItem",
    "etag": "\"cbz3lIQ2N25AfwNr-BdxUVxJ_QY/zS68eS7HitZtUXs0-4qXTAKpjac\"",
    "id": "UExRYUpEd0xYeUJ0WHIxRmUyRlJ6SWRUM1JGZUc1MlFWRi40NzZCMERDMjVEN0RFRThB",
    "snippet": {
      "publishedAt": "2015-12-07T06:19:03.000Z",
      "channelId": "UCVM4C1fB9Qcwy7dNjbXeUVw",
      "title": "Velocity.js: UI Pack Overview",
      "description": "Play with the UI pack at http://VelocityJS.org/#uiPack.\n\nRead the full tutorial: http://www.smashingmagazine.com/2014/06/18/faster-ui-animations-with-velocity-js/",
      "thumbnails": {
        "default": {
          "url": "https://i.ytimg.com/vi/CdwvR6a39Tg/default.jpg",
          "width": 120,
          "height": 90
        },
        "medium": {
          "url": "https://i.ytimg.com/vi/CdwvR6a39Tg/mqdefault.jpg",
          "width": 320,
          "height": 180
        },
        "high": {
          "url": "https://i.ytimg.com/vi/CdwvR6a39Tg/hqdefault.jpg",
          "width": 480,
          "height": 360
        },
        "standard": {
          "url": "https://i.ytimg.com/vi/CdwvR6a39Tg/sddefault.jpg",
          "width": 640,
          "height": 480
        },
        "maxres": {
          "url": "https://i.ytimg.com/vi/CdwvR6a39Tg/maxresdefault.jpg",
          "width": 1280,
          "height": 720
        }
      },
      "channelTitle": "Justyn Clark",
      "playlistId": "PLQaJDwLXyBtXr1Fe2FRzIdT3RFeG52QVF",
      "position": 10,
      "resourceId": {
        "kind": "youtube#video",
        "videoId": "CdwvR6a39Tg"
      }
    },
    "contentDetails": {
      "videoId": "CdwvR6a39Tg",
      "videoPublishedAt": "2014-05-28T16:20:39.000Z"
    }
  }, {

    "kind": "youtube#playlistItem",
    "etag": "\"cbz3lIQ2N25AfwNr-BdxUVxJ_QY/cdqzXIF5ayI0PdvMtqdKWbCvNYk\"",
    "id": "UExRYUpEd0xYeUJ0WHIxRmUyRlJ6SWRUM1JGZUc1MlFWRi5EMEEwRUY5M0RDRTU3NDJC",
    "snippet": {
      "publishedAt": "2016-01-09T18:50:24.000Z",
      "channelId": "UCVM4C1fB9Qcwy7dNjbXeUVw",
      "title": "Top 10 Programming Languages to Learn in 2016",
      "description": "THIS VIDEO IS SPONSORED BY\n\nThe Tech Academy http://ow.ly/RAMO30fE7Oc\n\nHipsterCode https://www.hipstercode.com/",
      "thumbnails": {
        "default": {
          "url": "https://i.ytimg.com/vi/Z56GLRXxh88/default.jpg",
          "width": 120,
          "height": 90
        },
        "medium": {
          "url": "https://i.ytimg.com/vi/Z56GLRXxh88/mqdefault.jpg",
          "width": 320,
          "height": 180
        },
        "high": {
          "url": "https://i.ytimg.com/vi/Z56GLRXxh88/hqdefault.jpg",
          "width": 480,
          "height": 360
        }
      },
      "channelTitle": "Justyn Clark",
      "playlistId": "PLQaJDwLXyBtXr1Fe2FRzIdT3RFeG52QVF",
      "position": 11,
      "resourceId": {
        "kind": "youtube#video",
        "videoId": "Z56GLRXxh88"
      }
    },
    "contentDetails": {
      "videoId": "Z56GLRXxh88",
      "videoPublishedAt": "2015-08-07T01:18:39.000Z"
    }
  }, {

    "kind": "youtube#playlistItem",
    "etag": "\"cbz3lIQ2N25AfwNr-BdxUVxJ_QY/jdCy7jjgrbdV1ZSxy5EtIJBL9-0\"",
    "id": "UExRYUpEd0xYeUJ0WHIxRmUyRlJ6SWRUM1JGZUc1MlFWRi45ODRDNTg0QjA4NkFBNkQy",
    "snippet": {
      "publishedAt": "2016-01-15T00:17:46.000Z",
      "channelId": "UCVM4C1fB9Qcwy7dNjbXeUVw",
      "title": "Edge Conference 2015 - 4 Components and Modules",
      "description": "",
      "thumbnails": {
        "default": {
          "url": "https://i.ytimg.com/vi/JQgBb9WeYHI/default.jpg",
          "width": 120,
          "height": 90
        },
        "medium": {
          "url": "https://i.ytimg.com/vi/JQgBb9WeYHI/mqdefault.jpg",
          "width": 320,
          "height": 180
        },
        "high": {
          "url": "https://i.ytimg.com/vi/JQgBb9WeYHI/hqdefault.jpg",
          "width": 480,
          "height": 360
        },
        "standard": {
          "url": "https://i.ytimg.com/vi/JQgBb9WeYHI/sddefault.jpg",
          "width": 640,
          "height": 480
        },
        "maxres": {
          "url": "https://i.ytimg.com/vi/JQgBb9WeYHI/maxresdefault.jpg",
          "width": 1280,
          "height": 720
        }
      },
      "channelTitle": "Justyn Clark",
      "playlistId": "PLQaJDwLXyBtXr1Fe2FRzIdT3RFeG52QVF",
      "position": 12,
      "resourceId": {
        "kind": "youtube#video",
        "videoId": "JQgBb9WeYHI"
      }
    },
    "contentDetails": {
      "videoId": "JQgBb9WeYHI",
      "videoPublishedAt": "2015-07-13T11:06:05.000Z"
    }
  }, {

    "kind": "youtube#playlistItem",
    "etag": "\"cbz3lIQ2N25AfwNr-BdxUVxJ_QY/-N1PVwtz_nQiPd4TUUP6-X3pKNQ\"",
    "id": "UExRYUpEd0xYeUJ0WHIxRmUyRlJ6SWRUM1JGZUc1MlFWRi4zMDg5MkQ5MEVDMEM1NTg2",
    "snippet": {
      "publishedAt": "2016-01-24T09:55:37.000Z",
      "channelId": "UCVM4C1fB9Qcwy7dNjbXeUVw",
      "title": "[Ep. 1] Angular to React",
      "description": "",
      "thumbnails": {
        "default": {
          "url": "https://i.ytimg.com/vi/0TsgebidFfo/default.jpg",
          "width": 120,
          "height": 90
        },
        "medium": {
          "url": "https://i.ytimg.com/vi/0TsgebidFfo/mqdefault.jpg",
          "width": 320,
          "height": 180
        },
        "high": {
          "url": "https://i.ytimg.com/vi/0TsgebidFfo/hqdefault.jpg",
          "width": 480,
          "height": 360
        },
        "standard": {
          "url": "https://i.ytimg.com/vi/0TsgebidFfo/sddefault.jpg",
          "width": 640,
          "height": 480
        },
        "maxres": {
          "url": "https://i.ytimg.com/vi/0TsgebidFfo/maxresdefault.jpg",
          "width": 1280,
          "height": 720
        }
      },
      "channelTitle": "Justyn Clark",
      "playlistId": "PLQaJDwLXyBtXr1Fe2FRzIdT3RFeG52QVF",
      "position": 13,
      "resourceId": {
        "kind": "youtube#video",
        "videoId": "0TsgebidFfo"
      }
    },
    "contentDetails": {
      "videoId": "0TsgebidFfo",
      "videoPublishedAt": "2015-12-28T22:07:48.000Z"
    }
  }, {

    "kind": "youtube#playlistItem",
    "etag": "\"cbz3lIQ2N25AfwNr-BdxUVxJ_QY/xLicrOmvbIn2bL8Z8S1z7FhVnA4\"",
    "id": "UExRYUpEd0xYeUJ0WHIxRmUyRlJ6SWRUM1JGZUc1MlFWRi41Mzk2QTAxMTkzNDk4MDhF",
    "snippet": {
      "publishedAt": "2016-01-29T08:28:57.000Z",
      "channelId": "UCVM4C1fB9Qcwy7dNjbXeUVw",
      "title": "React and Redux",
      "description": "** I have created a better, more comprehensive video series about using React, Redux and Webpack to build web apps. Check it out at http://www.youtube.com/playlist?list=PLQDnxXqV213JJFtDaG0aE9vqvp6Wm7nBg **\n\nA talk and live demo about how (and why) to use React and Redux. Presentation recorded at Hack Reactor on Nov. 30, 2015. Github repo to follow along can be found at https://github.com/kweiberth/react-redux-todo-demo. The master branch is the finished product after the demo is completed. The react-demo-start branch is the starting point for the first demo and the redux-demo-start branch is the starting point for the second demo.",
      "thumbnails": {
        "default": {
          "url": "https://i.ytimg.com/vi/7eLqKgp0eeY/default.jpg",
          "width": 120,
          "height": 90
        },
        "medium": {
          "url": "https://i.ytimg.com/vi/7eLqKgp0eeY/mqdefault.jpg",
          "width": 320,
          "height": 180
        },
        "high": {
          "url": "https://i.ytimg.com/vi/7eLqKgp0eeY/hqdefault.jpg",
          "width": 480,
          "height": 360
        },
        "standard": {
          "url": "https://i.ytimg.com/vi/7eLqKgp0eeY/sddefault.jpg",
          "width": 640,
          "height": 480
        },
        "maxres": {
          "url": "https://i.ytimg.com/vi/7eLqKgp0eeY/maxresdefault.jpg",
          "width": 1280,
          "height": 720
        }
      },
      "channelTitle": "Justyn Clark",
      "playlistId": "PLQaJDwLXyBtXr1Fe2FRzIdT3RFeG52QVF",
      "position": 14,
      "resourceId": {
        "kind": "youtube#video",
        "videoId": "7eLqKgp0eeY"
      }
    },
    "contentDetails": {
      "videoId": "7eLqKgp0eeY",
      "videoPublishedAt": "2015-12-12T22:37:16.000Z"
    }
  }, {

    "kind": "youtube#playlistItem",
    "etag": "\"cbz3lIQ2N25AfwNr-BdxUVxJ_QY/HFVhAj18dt-0rvcK6ZqX1Pcr3HU\"",
    "id": "UExRYUpEd0xYeUJ0WHIxRmUyRlJ6SWRUM1JGZUc1MlFWRi5EQUE1NTFDRjcwMDg0NEMz",
    "snippet": {
      "publishedAt": "2016-01-29T08:29:07.000Z",
      "channelId": "UCVM4C1fB9Qcwy7dNjbXeUVw",
      "title": "React For Everyone #8 - Basic Webpack Configuration & Server",
      "description": "In this React video tutorial, we finish our setup by writing our webpack config file. Subscribe for more free tutorials https://goo.gl/6ljoFc, more React Tutorials: https://goo.gl/tRUAB9\n\nSupport Free Tutorials\nhttps://www.leveluptutorials.com/store/\n\nThe best shared web hosting\nhttp://www.bluehost.com/track/leveluptutorials/\n\nSubscribe to Level Up Pro for extra features!\nhttps://www.leveluptutorials.com/store/products/pro\n\nSubscribe to the Level Up Newsletter\nhttp://eepurl.com/AWjGz\n\nTo Support Level Up Tuts:\nhttp://leveluptuts.com/donations\n\nSimple cloud hosting, built for developers.:\nhttps://www.digitalocean.com/?refcode=67357174b09e\n\nLearn React js from scratch in the new video tutorial series React For Beginners. We'll be introducing core concepts and exploring real world application techniques as we go. New videos every week!",
      "thumbnails": {
        "default": {
          "url": "https://i.ytimg.com/vi/AtKh6tp44Ck/default.jpg",
          "width": 120,
          "height": 90
        },
        "medium": {
          "url": "https://i.ytimg.com/vi/AtKh6tp44Ck/mqdefault.jpg",
          "width": 320,
          "height": 180
        },
        "high": {
          "url": "https://i.ytimg.com/vi/AtKh6tp44Ck/hqdefault.jpg",
          "width": 480,
          "height": 360
        },
        "standard": {
          "url": "https://i.ytimg.com/vi/AtKh6tp44Ck/sddefault.jpg",
          "width": 640,
          "height": 480
        },
        "maxres": {
          "url": "https://i.ytimg.com/vi/AtKh6tp44Ck/maxresdefault.jpg",
          "width": 1280,
          "height": 720
        }
      },
      "channelTitle": "Justyn Clark",
      "playlistId": "PLQaJDwLXyBtXr1Fe2FRzIdT3RFeG52QVF",
      "position": 15,
      "resourceId": {
        "kind": "youtube#video",
        "videoId": "AtKh6tp44Ck"
      }
    },
    "contentDetails": {
      "videoId": "AtKh6tp44Ck",
      "videoPublishedAt": "2016-01-15T00:24:29.000Z"
    }
  }, {

    "kind": "youtube#playlistItem",
    "etag": "\"cbz3lIQ2N25AfwNr-BdxUVxJ_QY/5_burgSgSBJUjop9IVh99qGlbTM\"",
    "id": "UExRYUpEd0xYeUJ0WHIxRmUyRlJ6SWRUM1JGZUc1MlFWRi41QTY1Q0UxMTVCODczNThE",
    "snippet": {
      "publishedAt": "2016-12-07T04:21:24.000Z",
      "channelId": "UCVM4C1fB9Qcwy7dNjbXeUVw",
      "title": "Learn React with progressive boilerplates",
      "description": "In this video I introduce the concept of progressive boilerplate and show you how to learn React with progressive boilerplates.\n\nARc (Atomic React), the progressive boilerplate: https://github.com/diegohaz/arc\n\nreact-create-app: https://github.com/facebookincubator/create-react-app\n\nreact-boilerplate: https://github.com/mxstbr/react-boilerplate\n\nreact-redux-universal-hot-example: https://github.com/erikras/react-redux-universal-hot-example",
      "thumbnails": {
        "default": {
          "url": "https://i.ytimg.com/vi/VcHbqpdZ9mM/default.jpg",
          "width": 120,
          "height": 90
        },
        "medium": {
          "url": "https://i.ytimg.com/vi/VcHbqpdZ9mM/mqdefault.jpg",
          "width": 320,
          "height": 180
        },
        "high": {
          "url": "https://i.ytimg.com/vi/VcHbqpdZ9mM/hqdefault.jpg",
          "width": 480,
          "height": 360
        },
        "standard": {
          "url": "https://i.ytimg.com/vi/VcHbqpdZ9mM/sddefault.jpg",
          "width": 640,
          "height": 480
        },
        "maxres": {
          "url": "https://i.ytimg.com/vi/VcHbqpdZ9mM/maxresdefault.jpg",
          "width": 1280,
          "height": 720
        }
      },
      "channelTitle": "Justyn Clark",
      "playlistId": "PLQaJDwLXyBtXr1Fe2FRzIdT3RFeG52QVF",
      "position": 16,
      "resourceId": {
        "kind": "youtube#video",
        "videoId": "VcHbqpdZ9mM"
      }
    },
    "contentDetails": {
      "videoId": "VcHbqpdZ9mM",
      "videoPublishedAt": "2016-11-17T21:34:45.000Z"
    }
  }, {

    "kind": "youtube#playlistItem",
    "etag": "\"cbz3lIQ2N25AfwNr-BdxUVxJ_QY/JgaZYHBgembl20EUDSKwnohootM\"",
    "id": "UExRYUpEd0xYeUJ0WHIxRmUyRlJ6SWRUM1JGZUc1MlFWRi4yMUQyQTQzMjRDNzMyQTMy",
    "snippet": {
      "publishedAt": "2016-12-07T04:26:20.000Z",
      "channelId": "UCVM4C1fB9Qcwy7dNjbXeUVw",
      "title": "Create and deploy a RESTful API in 10 minutes",
      "description": "Create a REST API with NodeJS, MongoDB and Express.\nGitHub repo: https://github.com/diegohaz/generator-rest\n\nIn this tutorial I show you how to create a REST API with NodeJS, MongoDB (Mongoose), Express, ES6, integration and unit tests, documentation (apidoc), error handling, JSON responses and much more using Yeoman and deploy it to Heroku.\n\n-------------- LINKS -------------\n\nNodeJS: https://nodejs.org\nMongoDB: https://mongodb.com\nPostman: https://www.getpostman.com\n\n------------ RELATED ----------\n\nWhat is Node.js Exactly?\nUsing Node.js for Everything\nREST API concepts and examples\nIntro to REST\nNode.js Tutorials: From Zero to Hero with Nodejs\nREST+JSON API Design - Best Practices for Developers\nUsing REST APIs in a web application\nREST-Ful API Design\nCreate a Website or Blog\nNode.js Tutorials for Beginners\nNodeJS MongoDB Tutorial\nNode.js Fundamentals\nBuild a RESTful API in 5 Minutes with NodeJS\nBuild a Twitch.tv Chat Bot in 10 Minutes with Node.js\nNode.js Login System With Passport\nBuilding a Microservice using Node.js & Docker\nThe ABCs of APIs with Node.js\nEverything You Ever Wanted To Know About Authentication in Node.js\nCómo implementar un API REST desde cero con Node.js y MongoDB\nOverview of Node.js Microservices Architectures\nNode.js Explained\nJavaScript with ReactJS and Nodejs\nNodeJS / Express / MongoDB - Build a Shopping Cart\nDeploying Node.js App to Heroku\nTest driven Development of Web Apps in Node.Js\nHow to send server email with Node.js\nDeploying node.js applications\nRESTful API From Scratch Using Node, Express and MongoDB\nIntro to REST (aka. What Is REST Anyway?)",
      "thumbnails": {
        "default": {
          "url": "https://i.ytimg.com/vi/6x-ijyG-ack/default.jpg",
          "width": 120,
          "height": 90
        },
        "medium": {
          "url": "https://i.ytimg.com/vi/6x-ijyG-ack/mqdefault.jpg",
          "width": 320,
          "height": 180
        },
        "high": {
          "url": "https://i.ytimg.com/vi/6x-ijyG-ack/hqdefault.jpg",
          "width": 480,
          "height": 360
        },
        "standard": {
          "url": "https://i.ytimg.com/vi/6x-ijyG-ack/sddefault.jpg",
          "width": 640,
          "height": 480
        },
        "maxres": {
          "url": "https://i.ytimg.com/vi/6x-ijyG-ack/maxresdefault.jpg",
          "width": 1280,
          "height": 720
        }
      },
      "channelTitle": "Justyn Clark",
      "playlistId": "PLQaJDwLXyBtXr1Fe2FRzIdT3RFeG52QVF",
      "position": 17,
      "resourceId": {
        "kind": "youtube#video",
        "videoId": "6x-ijyG-ack"
      }
    },
    "contentDetails": {
      "videoId": "6x-ijyG-ack",
      "videoPublishedAt": "2016-09-14T02:38:54.000Z"
    }
  }, {

    "kind": "youtube#playlistItem",
    "etag": "\"cbz3lIQ2N25AfwNr-BdxUVxJ_QY/cRUpB29f1GqjUlTMJNp4Wiwh6UI\"",
    "id": "UExRYUpEd0xYeUJ0WHIxRmUyRlJ6SWRUM1JGZUc1MlFWRi45RTgxNDRBMzUwRjQ0MDhC",
    "snippet": {
      "publishedAt": "2017-01-18T17:28:00.000Z",
      "channelId": "UCVM4C1fB9Qcwy7dNjbXeUVw",
      "title": "Todd Motto - Demystifying JavaScript: you don't need jQuery (FOWD 2014)",
      "description": "https://speakerdeck.com/toddmotto/demystifying-javascript-you-dont-need-jquery",
      "thumbnails": {
        "default": {
          "url": "https://i.ytimg.com/vi/keyCg253S-o/default.jpg",
          "width": 120,
          "height": 90
        },
        "medium": {
          "url": "https://i.ytimg.com/vi/keyCg253S-o/mqdefault.jpg",
          "width": 320,
          "height": 180
        },
        "high": {
          "url": "https://i.ytimg.com/vi/keyCg253S-o/hqdefault.jpg",
          "width": 480,
          "height": 360
        },
        "standard": {
          "url": "https://i.ytimg.com/vi/keyCg253S-o/sddefault.jpg",
          "width": 640,
          "height": 480
        },
        "maxres": {
          "url": "https://i.ytimg.com/vi/keyCg253S-o/maxresdefault.jpg",
          "width": 1280,
          "height": 720
        }
      },
      "channelTitle": "Justyn Clark",
      "playlistId": "PLQaJDwLXyBtXr1Fe2FRzIdT3RFeG52QVF",
      "position": 18,
      "resourceId": {
        "kind": "youtube#video",
        "videoId": "keyCg253S-o"
      }
    },
    "contentDetails": {
      "videoId": "keyCg253S-o",
      "videoPublishedAt": "2014-06-03T09:55:40.000Z"
    }
  }, {

    "kind": "youtube#playlistItem",
    "etag": "\"cbz3lIQ2N25AfwNr-BdxUVxJ_QY/r1O0RCb27O3ZK-kkD2cUYbHhlB0\"",
    "id": "UExRYUpEd0xYeUJ0WHIxRmUyRlJ6SWRUM1JGZUc1MlFWRi5ENDU4Q0M4RDExNzM1Mjcy",
    "snippet": {
      "publishedAt": "2017-03-03T16:03:14.000Z",
      "channelId": "UCVM4C1fB9Qcwy7dNjbXeUVw",
      "title": "Jack Lenox: Building Themes with the WP REST API",
      "description": "With the REST API shortly due to be merged into WordPress core, it’s about time developers started thinking about building themes that use it. The REST API allows developers to create much more engaging user experiences. This is a talk that covers the challenges one faces when working with the REST API, how to extend the REST API itself from within your theme, and suggested ways that themes can be built to use it.\n\nSlides: https://speakerdeck.com/jacklenox/building-themes-with-the-wp-rest-api",
      "thumbnails": {
        "default": {
          "url": "https://i.ytimg.com/vi/1sykVjJRIgM/default.jpg",
          "width": 120,
          "height": 90
        },
        "medium": {
          "url": "https://i.ytimg.com/vi/1sykVjJRIgM/mqdefault.jpg",
          "width": 320,
          "height": 180
        },
        "high": {
          "url": "https://i.ytimg.com/vi/1sykVjJRIgM/hqdefault.jpg",
          "width": 480,
          "height": 360
        },
        "standard": {
          "url": "https://i.ytimg.com/vi/1sykVjJRIgM/sddefault.jpg",
          "width": 640,
          "height": 480
        },
        "maxres": {
          "url": "https://i.ytimg.com/vi/1sykVjJRIgM/maxresdefault.jpg",
          "width": 1280,
          "height": 720
        }
      },
      "channelTitle": "Justyn Clark",
      "playlistId": "PLQaJDwLXyBtXr1Fe2FRzIdT3RFeG52QVF",
      "position": 19,
      "resourceId": {
        "kind": "youtube#video",
        "videoId": "1sykVjJRIgM"
      }
    },
    "contentDetails": {
      "videoId": "1sykVjJRIgM",
      "videoPublishedAt": "2016-06-28T17:53:25.000Z"
    }
  }, {

    "kind": "youtube#playlistItem",
    "etag": "\"cbz3lIQ2N25AfwNr-BdxUVxJ_QY/HH4VcBm0bh63hIMZHrrc5INbAZg\"",
    "id": "UExRYUpEd0xYeUJ0WHIxRmUyRlJ6SWRUM1JGZUc1MlFWRi4yMDhBMkNBNjRDMjQxQTg1",
    "snippet": {
      "publishedAt": "2017-03-06T17:41:00.000Z",
      "channelId": "UCVM4C1fB9Qcwy7dNjbXeUVw",
      "title": "Object Oriented JavaScript",
      "description": "Get the Cheat Sheet Here : http://goo.gl/CQVZsW\nBest Object Oriented JavaScript Book : http://amzn.to/1L0Mvs8\n\nSupport me on Patreon : https://www.patreon.com/derekbanas\n\n01:50 JavaScript Objects\n02:36 Objects in Objects\n04:12 Constructor Functions\n05:58 instanceof\n06:28 Passing Objects to Functions\n08:09 Prototypes\n09:34 Adding Properties to Objects\n10:44 List Properties in Objects\n11:38 hasOwnProperty\n12:42 Add Properties to Built in Objects\n14:31 Private Properties\n18:01 Getters / Setters\n21:20 defineGetter / defineSetter\n24:38 defineProperty\n27:07 Constructor Function Getters / Setters\n29:40 Inheritance\n37:13 Intermediate Function Inheritance\n39:14 Call Parent Functions\n41:51 ECMAScript 6\n47:31 Singleton Pattern\n49:32 Factory Pattern\n52:53 Decorator Pattern\n54:52 Observer Pattern",
      "thumbnails": {
        "default": {
          "url": "https://i.ytimg.com/vi/O8wwnhdkPE4/default.jpg",
          "width": 120,
          "height": 90
        },
        "medium": {
          "url": "https://i.ytimg.com/vi/O8wwnhdkPE4/mqdefault.jpg",
          "width": 320,
          "height": 180
        },
        "high": {
          "url": "https://i.ytimg.com/vi/O8wwnhdkPE4/hqdefault.jpg",
          "width": 480,
          "height": 360
        }
      },
      "channelTitle": "Justyn Clark",
      "playlistId": "PLQaJDwLXyBtXr1Fe2FRzIdT3RFeG52QVF",
      "position": 20,
      "resourceId": {
        "kind": "youtube#video",
        "videoId": "O8wwnhdkPE4"
      }
    },
    "contentDetails": {
      "videoId": "O8wwnhdkPE4",
      "videoPublishedAt": "2015-09-28T21:52:46.000Z"
    }
  }, {

    "kind": "youtube#playlistItem",
    "etag": "\"cbz3lIQ2N25AfwNr-BdxUVxJ_QY/oqKB9HRxQD1KF8jIU-Hr1P6h7BU\"",
    "id": "UExRYUpEd0xYeUJ0WHIxRmUyRlJ6SWRUM1JGZUc1MlFWRi5GM0Q3M0MzMzY5NTJFNTdE",
    "snippet": {
      "publishedAt": "2017-03-10T02:37:39.000Z",
      "channelId": "UCVM4C1fB9Qcwy7dNjbXeUVw",
      "title": "WordPress REST API Tutorial (Real Examples)",
      "description": "Let's learn about the new WordPress REST API.\n\nLink to my website: http://learnwebcode.com/\n\nMy HTML & CSS Course: https://www.udemy.com/web-design-for-beginners-real-world-coding-in-html-css/?couponCode=YOUTUBE-HALF-OFF\n\nMy \"Get a Developer Job\" course: https://www.udemy.com/git-a-web-developer-job-mastering-the-modern-workflow/?couponCode=YOUTUBE-HALF-OFF\n\nStarter AJAX Code: http://codepen.io/anon/pen/ObBQqv?editors=0010\n\nStarter Form HTML & CSS: http://codepen.io/anon/pen/jVQPLz?editors=1100\n\nLink to download zip of finished theme files: http://learnwebcode.com/wordpress-rest-api-tutorial-real-examples/\n\nAdd me on Twitter for webDev resources and cat pics: https://twitter.com/learnwebcode",
      "thumbnails": {
        "default": {
          "url": "https://i.ytimg.com/vi/rGObWtjxGBc/default.jpg",
          "width": 120,
          "height": 90
        },
        "medium": {
          "url": "https://i.ytimg.com/vi/rGObWtjxGBc/mqdefault.jpg",
          "width": 320,
          "height": 180
        },
        "high": {
          "url": "https://i.ytimg.com/vi/rGObWtjxGBc/hqdefault.jpg",
          "width": 480,
          "height": 360
        },
        "standard": {
          "url": "https://i.ytimg.com/vi/rGObWtjxGBc/sddefault.jpg",
          "width": 640,
          "height": 480
        },
        "maxres": {
          "url": "https://i.ytimg.com/vi/rGObWtjxGBc/maxresdefault.jpg",
          "width": 1280,
          "height": 720
        }
      },
      "channelTitle": "Justyn Clark",
      "playlistId": "PLQaJDwLXyBtXr1Fe2FRzIdT3RFeG52QVF",
      "position": 21,
      "resourceId": {
        "kind": "youtube#video",
        "videoId": "rGObWtjxGBc"
      }
    },
    "contentDetails": {
      "videoId": "rGObWtjxGBc",
      "videoPublishedAt": "2016-12-16T04:57:13.000Z"
    }
  }, {

    "kind": "youtube#playlistItem",
    "etag": "\"cbz3lIQ2N25AfwNr-BdxUVxJ_QY/kj1vQs8SEzPY26hoXf3lDJqFggc\"",
    "id": "UExRYUpEd0xYeUJ0WHIxRmUyRlJ6SWRUM1JGZUc1MlFWRi4zRjM0MkVCRTg0MkYyQTM0",
    "snippet": {
      "publishedAt": "2017-04-01T07:08:02.000Z",
      "channelId": "UCVM4C1fB9Qcwy7dNjbXeUVw",
      "title": "Cartoons For Children | Sunny Bunnies ELUSIVE CAKE | NEW SEASON | Funny Cartoons For Children |",
      "description": "► Subscribe to Sunny Bunnies for new videos:  http://bit.ly/1UdMGUy\n\n► Watch more Funny Cartoons for Children -\nhttps://www.youtube.com/watch?v=gp5MAy6-NYA&list=PLoQlx7f6Nx-PysokdcORyH1_VGADFltty&index=2\n\n► Watch more Cartoons for Children -\nhttps://www.youtube.com/watch?v=46c_SdNZlWk&list=PLoQlx7f6Nx-PysokdcORyH1_VGADFltty&index=3\n\n► Watch more Sunny Bunnies -\nhttps://www.youtube.com/watch?v=8jY_NqygKLU&list=PLoQlx7f6Nx-PysokdcORyH1_VGADFltty&index=4\n\nKids are capable of coming up with the most unreal and fantastic creatures in their minds. Shadows are seen as bleak and gloomy, while sunbeams are associated with light and happiness, and can create funny images. What if these fantasies came alive? What if they could jump out of the sunlight?\n\nThe Sunny Bunnies are five beaming balls of light that can appear anywhere there is a light source. Whether it is sunlight or moonlight, they bring fun and happiness everywhere they go. However, each time they appear their actions turn into a mischievous game. Sometimes too mischievous.\n\nIn each episode, Sunny Bunnies appear at a different location: a circus, a stadium, a carrousel, a park, a stage… They immediately start to investigate their surroundings and that’s when the fun and mischief begin! At the very end of every episode, the laughter continues with a collection of bloopers.",
      "thumbnails": {
        "default": {
          "url": "https://i.ytimg.com/vi/QX7iaGcAyT4/default.jpg",
          "width": 120,
          "height": 90
        },
        "medium": {
          "url": "https://i.ytimg.com/vi/QX7iaGcAyT4/mqdefault.jpg",
          "width": 320,
          "height": 180
        },
        "high": {
          "url": "https://i.ytimg.com/vi/QX7iaGcAyT4/hqdefault.jpg",
          "width": 480,
          "height": 360
        },
        "standard": {
          "url": "https://i.ytimg.com/vi/QX7iaGcAyT4/sddefault.jpg",
          "width": 640,
          "height": 480
        },
        "maxres": {
          "url": "https://i.ytimg.com/vi/QX7iaGcAyT4/maxresdefault.jpg",
          "width": 1280,
          "height": 720
        }
      },
      "channelTitle": "Justyn Clark",
      "playlistId": "PLQaJDwLXyBtXr1Fe2FRzIdT3RFeG52QVF",
      "position": 22,
      "resourceId": {
        "kind": "youtube#video",
        "videoId": "QX7iaGcAyT4"
      }
    },
    "contentDetails": {
      "videoId": "QX7iaGcAyT4",
      "videoPublishedAt": "2017-02-10T11:47:54.000Z"
    }
  }, {

    "kind": "youtube#playlistItem",
    "etag": "\"cbz3lIQ2N25AfwNr-BdxUVxJ_QY/3rcpZBdYx2MRHyaq1h9zfDZr9QE\"",
    "id": "UExRYUpEd0xYeUJ0WHIxRmUyRlJ6SWRUM1JGZUc1MlFWRi45NzUwQkI1M0UxNThBMkU0",
    "snippet": {
      "publishedAt": "2017-04-16T17:28:17.000Z",
      "channelId": "UCVM4C1fB9Qcwy7dNjbXeUVw",
      "title": "JavaScript and the DOM (Part 1 of 2)",
      "description": "Today @adamrecvlohe walks us through some functional JS programming techniques in Part 1 of a 2 part Javascript series!\n\nProject Code - http://codepen.io/arecvlohe/pen/repXde\n\n- - -\n\nThis video was sponsored by the DevTips Patron Community - https://www.patreon.com/DevTips\n\nListen to Travis' Podcast - http://www.travandlos.com/\n\nGet awesomeness emailed to you every thursday - http://travisneilson.com/notes \n\nYou should follow DevTips on Twitter - https://twitter.com/DevTipsShow",
      "thumbnails": {
        "default": {
          "url": "https://i.ytimg.com/vi/hM9h1wN4rfU/default.jpg",
          "width": 120,
          "height": 90
        },
        "medium": {
          "url": "https://i.ytimg.com/vi/hM9h1wN4rfU/mqdefault.jpg",
          "width": 320,
          "height": 180
        },
        "high": {
          "url": "https://i.ytimg.com/vi/hM9h1wN4rfU/hqdefault.jpg",
          "width": 480,
          "height": 360
        },
        "standard": {
          "url": "https://i.ytimg.com/vi/hM9h1wN4rfU/sddefault.jpg",
          "width": 640,
          "height": 480
        },
        "maxres": {
          "url": "https://i.ytimg.com/vi/hM9h1wN4rfU/maxresdefault.jpg",
          "width": 1280,
          "height": 720
        }
      },
      "channelTitle": "Justyn Clark",
      "playlistId": "PLQaJDwLXyBtXr1Fe2FRzIdT3RFeG52QVF",
      "position": 23,
      "resourceId": {
        "kind": "youtube#video",
        "videoId": "hM9h1wN4rfU"
      }
    },
    "contentDetails": {
      "videoId": "hM9h1wN4rfU",
      "videoPublishedAt": "2016-05-02T15:34:37.000Z"
    }
  }, {

    "kind": "youtube#playlistItem",
    "etag": "\"cbz3lIQ2N25AfwNr-BdxUVxJ_QY/Tgj3RCAIff679mxhxULjurS1kn0\"",
    "id": "UExRYUpEd0xYeUJ0WHIxRmUyRlJ6SWRUM1JGZUc1MlFWRi5DNzE1RjZEMUZCMjA0RDBB",
    "snippet": {
      "publishedAt": "2017-05-05T05:18:38.000Z",
      "channelId": "UCVM4C1fB9Qcwy7dNjbXeUVw",
      "title": "Learn Numbers with Counting and Learn Colors with Water Balloons for Children, Toddlers and Babies",
      "description": "A Great and Fun Way to Learn Numbers and To Learn to Count is by using Colours Water Balloons! We Lined them up in differents Colors, so Children, Toddlers and Babies also can Learn Colors! Have Fun watching this Educational video, have fun Learning!\n\nWelcome to our channel, FunToysMedia. \n\nWe Create Educational and Toys videos for Kids by a Kid!\nOur Kid Jason plays in the Videos and he loves to teach Colors, Numbers, Letters and more! \nWe also do Fun Sketches.\nOur Kids videos are fun and exciting to watch. \n\nBad Baby Magic and Learn Colors with Bad Ghosts for Kids | Bad Kid Learns Colours \nhttps://www.youtube.com/watch?v=Z60vnDhcggg\n\nSuper Hero Sack Race For Kids with Superman and Spiderman | Learn Numbers for Children Play Activity \nhttps://www.youtube.com/watch?v=C_NZsUIwnk0\n\nLearn Fruits with Smoothies for Children and Toddlers | Learn Colors with Fruits Taste Challenge \nhttps://www.youtube.com/watch?v=5-Svv75IEyw\n\nLearn Colours and Popping Water Balloons for Children and Toddlers | Bad Kid Learns Colors \nhttps://www.youtube.com/watch?v=NKVI7_vJz04\n\nLearn Colors with Bad Baby Crying Gumball Bottles for Babies | Finger Family Song Nursery Rhymes \nhttps://www.youtube.com/watch?v=zuIKHV8l3W8\n\nBad Baby Crying Learn Colors for Toddlers and Babies | Finger Family Song Baby Nursery Rhymes \nhttps://www.youtube.com/watch?v=SOeO4RlwBds\n\nLearn Colors with Skippy Balls for Children, Toddlers and Babies | Funny Faces Skippy Balls Colours \nhttps://www.youtube.com/watch?v=Syh4FqjCheQ\n\nLearn Colors with Foot Nursery Songs for Children, Toddlers and Babies | Kids Finger Family Songs \nhttps://www.youtube.com/watch?v=rgcz7D2ar1U\n\nLearn Months of the Year for Children and Toddlers and Learn Colors for Kids Educational Video \nhttps://www.youtube.com/watch?v=XH5Xui0UJUM\n\nLearn Numbers and Colors with Buckets for Children and Toddlers | Throw Colours Water Balloons Game \nhttps://www.youtube.com/watch?v=5r6_-guVAMg\n\nLearn Numbers and Colors with Chocolate Easter Eggs for Children, Toddlers and Babies \nhttps://www.youtube.com/watch?v=LNVR-tQrMT0",
      "thumbnails": {
        "default": {
          "url": "https://i.ytimg.com/vi/VLI9RuBYnd4/default.jpg",
          "width": 120,
          "height": 90
        },
        "medium": {
          "url": "https://i.ytimg.com/vi/VLI9RuBYnd4/mqdefault.jpg",
          "width": 320,
          "height": 180
        },
        "high": {
          "url": "https://i.ytimg.com/vi/VLI9RuBYnd4/hqdefault.jpg",
          "width": 480,
          "height": 360
        },
        "standard": {
          "url": "https://i.ytimg.com/vi/VLI9RuBYnd4/sddefault.jpg",
          "width": 640,
          "height": 480
        },
        "maxres": {
          "url": "https://i.ytimg.com/vi/VLI9RuBYnd4/maxresdefault.jpg",
          "width": 1280,
          "height": 720
        }
      },
      "channelTitle": "Justyn Clark",
      "playlistId": "PLQaJDwLXyBtXr1Fe2FRzIdT3RFeG52QVF",
      "position": 24,
      "resourceId": {
        "kind": "youtube#video",
        "videoId": "VLI9RuBYnd4"
      }
    },
    "contentDetails": {
      "videoId": "VLI9RuBYnd4",
      "videoPublishedAt": "2017-05-04T02:00:36.000Z"
    }
  }]
};

},{}]},{},[3])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvZXZlbnRlbWl0dGVyMi9saWIvZXZlbnRlbWl0dGVyMi5qcyIsIm5vZGVfbW9kdWxlcy9wcm9jZXNzL2Jyb3dzZXIuanMiLCJzcmMvYXBwLmpzIiwic3JjL2pzL21vZHVsZXMvY29uZmlnLmpzIiwic3JjL2pzL21vZHVsZXMvY29va2llcy5qcyIsInNyYy9qcy9tb2R1bGVzL2Ryb3BsZXQuanMiLCJzcmMvanMvbW9kdWxlcy9nbG9iYWwuanMiLCJzcmMvanMvbW9kdWxlcy9oYW5kbGVDbGlja3MuanMiLCJzcmMvanMvbW9kdWxlcy9zaWRlYmFyLmpzIiwic3JjL2pzL21vZHVsZXMvdXRpbHMuanMiLCJzcmMvanMvbW9kdWxlcy95b3V0dWJlLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOztBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7OztBQ3h3QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7OztBQ3hMQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7Ozs7QUNOQSxJQUFNLFNBQVMsR0FBRyxNQUFILEdBQVksRUFBM0I7QUFDRSxPQUFPLE9BQVAsR0FBaUIsaUJBQWpCO0FBQ0EsT0FBTyxTQUFQLEdBQW1CLGNBQW5CO0FBQ0EsT0FBTyxPQUFQLEdBQWlCLE9BQWpCOzs7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LGdCQUFRLGVBREk7QUFFWixtQkFBVztBQUZDO0FBbkNMLEtBTmI7QUE4Q0Usc0JBQWtCO0FBQ2hCLGlCQUFXLGFBREs7QUFFaEIsMEJBQW9CO0FBRko7QUE5Q3BCLEdBcG1DTyxFQXVwQ1A7O0FBR0UsWUFBUSxzQkFIVjtBQUlFLFlBQVEsNkRBSlY7QUFLRSxVQUFNLHNFQUxSO0FBTUUsZUFBVztBQUNULHFCQUFlLDBCQUROO0FBRVQsbUJBQWEsMEJBRko7QUFHVCxlQUFTLG9HQUhBO0FBSVQscUJBQWUsc2pFQUpOO0FBS1Qsb0JBQWM7QUFDWixtQkFBVztBQUNULGlCQUFPLGdEQURFO0FBRVQsbUJBQVMsR0FGQTtBQUdULG9CQUFVO0FBSEQsU0FEQztBQU1aLGtCQUFVO0FBQ1IsaUJBQU8sa0RBREM7QUFFUixtQkFBUyxHQUZEO0FBR1Isb0JBQVU7QUFIRixTQU5FO0FBV1osZ0JBQVE7QUFDTixpQkFBTyxrREFERDtBQUVOLG1CQUFTLEdBRkg7QUFHTixvQkFBVTtBQUhKLFNBWEk7QUFnQlosb0JBQVk7QUFDVixpQkFBTyxrREFERztBQUVWLG1CQUFTLEdBRkM7QUFHVixvQkFBVTtBQUhBLFNBaEJBO0FBcUJaLGtCQUFVO0FBQ1IsaUJBQU8sc0RBREM7QUFFUixtQkFBUyxJQUZEO0FBR1Isb0JBQVU7QUFIRjtBQXJCRSxPQUxMO0FBZ0NULHNCQUFnQixjQWhDUDtBQWlDVCxvQkFBYyxvQ0FqQ0w7QUFrQ1Qsa0JBQVksRUFsQ0g7QUFtQ1Qsb0JBQWM7QUFDWixnQkFBUSxlQURJO0FBRVosbUJBQVc7QUFGQztBQW5DTCxLQU5iO0FBOENFLHNCQUFrQjtBQUNoQixpQkFBVyxhQURLO0FBRWhCLDBCQUFvQjtBQUZKO0FBOUNwQixHQXZwQ087QUFSSyxDQUFoQiIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCIvKiFcclxuICogRXZlbnRFbWl0dGVyMlxyXG4gKiBodHRwczovL2dpdGh1Yi5jb20vaGlqMW54L0V2ZW50RW1pdHRlcjJcclxuICpcclxuICogQ29weXJpZ2h0IChjKSAyMDEzIGhpajFueFxyXG4gKiBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIGxpY2Vuc2UuXHJcbiAqL1xyXG47IWZ1bmN0aW9uKHVuZGVmaW5lZCkge1xyXG5cclxuICB2YXIgaXNBcnJheSA9IEFycmF5LmlzQXJyYXkgPyBBcnJheS5pc0FycmF5IDogZnVuY3Rpb24gX2lzQXJyYXkob2JqKSB7XHJcbiAgICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKG9iaikgPT09IFwiW29iamVjdCBBcnJheV1cIjtcclxuICB9O1xyXG4gIHZhciBkZWZhdWx0TWF4TGlzdGVuZXJzID0gMTA7XHJcblxyXG4gIGZ1bmN0aW9uIGluaXQoKSB7XHJcbiAgICB0aGlzLl9ldmVudHMgPSB7fTtcclxuICAgIGlmICh0aGlzLl9jb25mKSB7XHJcbiAgICAgIGNvbmZpZ3VyZS5jYWxsKHRoaXMsIHRoaXMuX2NvbmYpO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gY29uZmlndXJlKGNvbmYpIHtcclxuICAgIGlmIChjb25mKSB7XHJcbiAgICAgIHRoaXMuX2NvbmYgPSBjb25mO1xyXG5cclxuICAgICAgY29uZi5kZWxpbWl0ZXIgJiYgKHRoaXMuZGVsaW1pdGVyID0gY29uZi5kZWxpbWl0ZXIpO1xyXG4gICAgICB0aGlzLl9tYXhMaXN0ZW5lcnMgPSBjb25mLm1heExpc3RlbmVycyAhPT0gdW5kZWZpbmVkID8gY29uZi5tYXhMaXN0ZW5lcnMgOiBkZWZhdWx0TWF4TGlzdGVuZXJzO1xyXG5cclxuICAgICAgY29uZi53aWxkY2FyZCAmJiAodGhpcy53aWxkY2FyZCA9IGNvbmYud2lsZGNhcmQpO1xyXG4gICAgICBjb25mLm5ld0xpc3RlbmVyICYmICh0aGlzLm5ld0xpc3RlbmVyID0gY29uZi5uZXdMaXN0ZW5lcik7XHJcbiAgICAgIGNvbmYudmVyYm9zZU1lbW9yeUxlYWsgJiYgKHRoaXMudmVyYm9zZU1lbW9yeUxlYWsgPSBjb25mLnZlcmJvc2VNZW1vcnlMZWFrKTtcclxuXHJcbiAgICAgIGlmICh0aGlzLndpbGRjYXJkKSB7XHJcbiAgICAgICAgdGhpcy5saXN0ZW5lclRyZWUgPSB7fTtcclxuICAgICAgfVxyXG4gICAgfSBlbHNlIHtcclxuICAgICAgdGhpcy5fbWF4TGlzdGVuZXJzID0gZGVmYXVsdE1heExpc3RlbmVycztcclxuICAgIH1cclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIGxvZ1Bvc3NpYmxlTWVtb3J5TGVhayhjb3VudCwgZXZlbnROYW1lKSB7XHJcbiAgICB2YXIgZXJyb3JNc2cgPSAnKG5vZGUpIHdhcm5pbmc6IHBvc3NpYmxlIEV2ZW50RW1pdHRlciBtZW1vcnkgJyArXHJcbiAgICAgICAgJ2xlYWsgZGV0ZWN0ZWQuICcgKyBjb3VudCArICcgbGlzdGVuZXJzIGFkZGVkLiAnICtcclxuICAgICAgICAnVXNlIGVtaXR0ZXIuc2V0TWF4TGlzdGVuZXJzKCkgdG8gaW5jcmVhc2UgbGltaXQuJztcclxuXHJcbiAgICBpZih0aGlzLnZlcmJvc2VNZW1vcnlMZWFrKXtcclxuICAgICAgZXJyb3JNc2cgKz0gJyBFdmVudCBuYW1lOiAnICsgZXZlbnROYW1lICsgJy4nO1xyXG4gICAgfVxyXG5cclxuICAgIGlmKHR5cGVvZiBwcm9jZXNzICE9PSAndW5kZWZpbmVkJyAmJiBwcm9jZXNzLmVtaXRXYXJuaW5nKXtcclxuICAgICAgdmFyIGUgPSBuZXcgRXJyb3IoZXJyb3JNc2cpO1xyXG4gICAgICBlLm5hbWUgPSAnTWF4TGlzdGVuZXJzRXhjZWVkZWRXYXJuaW5nJztcclxuICAgICAgZS5lbWl0dGVyID0gdGhpcztcclxuICAgICAgZS5jb3VudCA9IGNvdW50O1xyXG4gICAgICBwcm9jZXNzLmVtaXRXYXJuaW5nKGUpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgY29uc29sZS5lcnJvcihlcnJvck1zZyk7XHJcblxyXG4gICAgICBpZiAoY29uc29sZS50cmFjZSl7XHJcbiAgICAgICAgY29uc29sZS50cmFjZSgpO1xyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBFdmVudEVtaXR0ZXIoY29uZikge1xyXG4gICAgdGhpcy5fZXZlbnRzID0ge307XHJcbiAgICB0aGlzLm5ld0xpc3RlbmVyID0gZmFsc2U7XHJcbiAgICB0aGlzLnZlcmJvc2VNZW1vcnlMZWFrID0gZmFsc2U7XHJcbiAgICBjb25maWd1cmUuY2FsbCh0aGlzLCBjb25mKTtcclxuICB9XHJcbiAgRXZlbnRFbWl0dGVyLkV2ZW50RW1pdHRlcjIgPSBFdmVudEVtaXR0ZXI7IC8vIGJhY2t3YXJkcyBjb21wYXRpYmlsaXR5IGZvciBleHBvcnRpbmcgRXZlbnRFbWl0dGVyIHByb3BlcnR5XHJcblxyXG4gIC8vXHJcbiAgLy8gQXR0ZW50aW9uLCBmdW5jdGlvbiByZXR1cm4gdHlwZSBub3cgaXMgYXJyYXksIGFsd2F5cyAhXHJcbiAgLy8gSXQgaGFzIHplcm8gZWxlbWVudHMgaWYgbm8gYW55IG1hdGNoZXMgZm91bmQgYW5kIG9uZSBvciBtb3JlXHJcbiAgLy8gZWxlbWVudHMgKGxlYWZzKSBpZiB0aGVyZSBhcmUgbWF0Y2hlc1xyXG4gIC8vXHJcbiAgZnVuY3Rpb24gc2VhcmNoTGlzdGVuZXJUcmVlKGhhbmRsZXJzLCB0eXBlLCB0cmVlLCBpKSB7XHJcbiAgICBpZiAoIXRyZWUpIHtcclxuICAgICAgcmV0dXJuIFtdO1xyXG4gICAgfVxyXG4gICAgdmFyIGxpc3RlbmVycz1bXSwgbGVhZiwgbGVuLCBicmFuY2gsIHhUcmVlLCB4eFRyZWUsIGlzb2xhdGVkQnJhbmNoLCBlbmRSZWFjaGVkLFxyXG4gICAgICAgIHR5cGVMZW5ndGggPSB0eXBlLmxlbmd0aCwgY3VycmVudFR5cGUgPSB0eXBlW2ldLCBuZXh0VHlwZSA9IHR5cGVbaSsxXTtcclxuICAgIGlmIChpID09PSB0eXBlTGVuZ3RoICYmIHRyZWUuX2xpc3RlbmVycykge1xyXG4gICAgICAvL1xyXG4gICAgICAvLyBJZiBhdCB0aGUgZW5kIG9mIHRoZSBldmVudChzKSBsaXN0IGFuZCB0aGUgdHJlZSBoYXMgbGlzdGVuZXJzXHJcbiAgICAgIC8vIGludm9rZSB0aG9zZSBsaXN0ZW5lcnMuXHJcbiAgICAgIC8vXHJcbiAgICAgIGlmICh0eXBlb2YgdHJlZS5fbGlzdGVuZXJzID09PSAnZnVuY3Rpb24nKSB7XHJcbiAgICAgICAgaGFuZGxlcnMgJiYgaGFuZGxlcnMucHVzaCh0cmVlLl9saXN0ZW5lcnMpO1xyXG4gICAgICAgIHJldHVybiBbdHJlZV07XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgZm9yIChsZWFmID0gMCwgbGVuID0gdHJlZS5fbGlzdGVuZXJzLmxlbmd0aDsgbGVhZiA8IGxlbjsgbGVhZisrKSB7XHJcbiAgICAgICAgICBoYW5kbGVycyAmJiBoYW5kbGVycy5wdXNoKHRyZWUuX2xpc3RlbmVyc1tsZWFmXSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBbdHJlZV07XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBpZiAoKGN1cnJlbnRUeXBlID09PSAnKicgfHwgY3VycmVudFR5cGUgPT09ICcqKicpIHx8IHRyZWVbY3VycmVudFR5cGVdKSB7XHJcbiAgICAgIC8vXHJcbiAgICAgIC8vIElmIHRoZSBldmVudCBlbWl0dGVkIGlzICcqJyBhdCB0aGlzIHBhcnRcclxuICAgICAgLy8gb3IgdGhlcmUgaXMgYSBjb25jcmV0ZSBtYXRjaCBhdCB0aGlzIHBhdGNoXHJcbiAgICAgIC8vXHJcbiAgICAgIGlmIChjdXJyZW50VHlwZSA9PT0gJyonKSB7XHJcbiAgICAgICAgZm9yIChicmFuY2ggaW4gdHJlZSkge1xyXG4gICAgICAgICAgaWYgKGJyYW5jaCAhPT0gJ19saXN0ZW5lcnMnICYmIHRyZWUuaGFzT3duUHJvcGVydHkoYnJhbmNoKSkge1xyXG4gICAgICAgICAgICBsaXN0ZW5lcnMgPSBsaXN0ZW5lcnMuY29uY2F0KHNlYXJjaExpc3RlbmVyVHJlZShoYW5kbGVycywgdHlwZSwgdHJlZVticmFuY2hdLCBpKzEpKTtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIGxpc3RlbmVycztcclxuICAgICAgfSBlbHNlIGlmKGN1cnJlbnRUeXBlID09PSAnKionKSB7XHJcbiAgICAgICAgZW5kUmVhY2hlZCA9IChpKzEgPT09IHR5cGVMZW5ndGggfHwgKGkrMiA9PT0gdHlwZUxlbmd0aCAmJiBuZXh0VHlwZSA9PT0gJyonKSk7XHJcbiAgICAgICAgaWYoZW5kUmVhY2hlZCAmJiB0cmVlLl9saXN0ZW5lcnMpIHtcclxuICAgICAgICAgIC8vIFRoZSBuZXh0IGVsZW1lbnQgaGFzIGEgX2xpc3RlbmVycywgYWRkIGl0IHRvIHRoZSBoYW5kbGVycy5cclxuICAgICAgICAgIGxpc3RlbmVycyA9IGxpc3RlbmVycy5jb25jYXQoc2VhcmNoTGlzdGVuZXJUcmVlKGhhbmRsZXJzLCB0eXBlLCB0cmVlLCB0eXBlTGVuZ3RoKSk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBmb3IgKGJyYW5jaCBpbiB0cmVlKSB7XHJcbiAgICAgICAgICBpZiAoYnJhbmNoICE9PSAnX2xpc3RlbmVycycgJiYgdHJlZS5oYXNPd25Qcm9wZXJ0eShicmFuY2gpKSB7XHJcbiAgICAgICAgICAgIGlmKGJyYW5jaCA9PT0gJyonIHx8IGJyYW5jaCA9PT0gJyoqJykge1xyXG4gICAgICAgICAgICAgIGlmKHRyZWVbYnJhbmNoXS5fbGlzdGVuZXJzICYmICFlbmRSZWFjaGVkKSB7XHJcbiAgICAgICAgICAgICAgICBsaXN0ZW5lcnMgPSBsaXN0ZW5lcnMuY29uY2F0KHNlYXJjaExpc3RlbmVyVHJlZShoYW5kbGVycywgdHlwZSwgdHJlZVticmFuY2hdLCB0eXBlTGVuZ3RoKSk7XHJcbiAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgIGxpc3RlbmVycyA9IGxpc3RlbmVycy5jb25jYXQoc2VhcmNoTGlzdGVuZXJUcmVlKGhhbmRsZXJzLCB0eXBlLCB0cmVlW2JyYW5jaF0sIGkpKTtcclxuICAgICAgICAgICAgfSBlbHNlIGlmKGJyYW5jaCA9PT0gbmV4dFR5cGUpIHtcclxuICAgICAgICAgICAgICBsaXN0ZW5lcnMgPSBsaXN0ZW5lcnMuY29uY2F0KHNlYXJjaExpc3RlbmVyVHJlZShoYW5kbGVycywgdHlwZSwgdHJlZVticmFuY2hdLCBpKzIpKTtcclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAvLyBObyBtYXRjaCBvbiB0aGlzIG9uZSwgc2hpZnQgaW50byB0aGUgdHJlZSBidXQgbm90IGluIHRoZSB0eXBlIGFycmF5LlxyXG4gICAgICAgICAgICAgIGxpc3RlbmVycyA9IGxpc3RlbmVycy5jb25jYXQoc2VhcmNoTGlzdGVuZXJUcmVlKGhhbmRsZXJzLCB0eXBlLCB0cmVlW2JyYW5jaF0sIGkpKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gbGlzdGVuZXJzO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBsaXN0ZW5lcnMgPSBsaXN0ZW5lcnMuY29uY2F0KHNlYXJjaExpc3RlbmVyVHJlZShoYW5kbGVycywgdHlwZSwgdHJlZVtjdXJyZW50VHlwZV0sIGkrMSkpO1xyXG4gICAgfVxyXG5cclxuICAgIHhUcmVlID0gdHJlZVsnKiddO1xyXG4gICAgaWYgKHhUcmVlKSB7XHJcbiAgICAgIC8vXHJcbiAgICAgIC8vIElmIHRoZSBsaXN0ZW5lciB0cmVlIHdpbGwgYWxsb3cgYW55IG1hdGNoIGZvciB0aGlzIHBhcnQsXHJcbiAgICAgIC8vIHRoZW4gcmVjdXJzaXZlbHkgZXhwbG9yZSBhbGwgYnJhbmNoZXMgb2YgdGhlIHRyZWVcclxuICAgICAgLy9cclxuICAgICAgc2VhcmNoTGlzdGVuZXJUcmVlKGhhbmRsZXJzLCB0eXBlLCB4VHJlZSwgaSsxKTtcclxuICAgIH1cclxuXHJcbiAgICB4eFRyZWUgPSB0cmVlWycqKiddO1xyXG4gICAgaWYoeHhUcmVlKSB7XHJcbiAgICAgIGlmKGkgPCB0eXBlTGVuZ3RoKSB7XHJcbiAgICAgICAgaWYoeHhUcmVlLl9saXN0ZW5lcnMpIHtcclxuICAgICAgICAgIC8vIElmIHdlIGhhdmUgYSBsaXN0ZW5lciBvbiBhICcqKicsIGl0IHdpbGwgY2F0Y2ggYWxsLCBzbyBhZGQgaXRzIGhhbmRsZXIuXHJcbiAgICAgICAgICBzZWFyY2hMaXN0ZW5lclRyZWUoaGFuZGxlcnMsIHR5cGUsIHh4VHJlZSwgdHlwZUxlbmd0aCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBCdWlsZCBhcnJheXMgb2YgbWF0Y2hpbmcgbmV4dCBicmFuY2hlcyBhbmQgb3RoZXJzLlxyXG4gICAgICAgIGZvcihicmFuY2ggaW4geHhUcmVlKSB7XHJcbiAgICAgICAgICBpZihicmFuY2ggIT09ICdfbGlzdGVuZXJzJyAmJiB4eFRyZWUuaGFzT3duUHJvcGVydHkoYnJhbmNoKSkge1xyXG4gICAgICAgICAgICBpZihicmFuY2ggPT09IG5leHRUeXBlKSB7XHJcbiAgICAgICAgICAgICAgLy8gV2Uga25vdyB0aGUgbmV4dCBlbGVtZW50IHdpbGwgbWF0Y2gsIHNvIGp1bXAgdHdpY2UuXHJcbiAgICAgICAgICAgICAgc2VhcmNoTGlzdGVuZXJUcmVlKGhhbmRsZXJzLCB0eXBlLCB4eFRyZWVbYnJhbmNoXSwgaSsyKTtcclxuICAgICAgICAgICAgfSBlbHNlIGlmKGJyYW5jaCA9PT0gY3VycmVudFR5cGUpIHtcclxuICAgICAgICAgICAgICAvLyBDdXJyZW50IG5vZGUgbWF0Y2hlcywgbW92ZSBpbnRvIHRoZSB0cmVlLlxyXG4gICAgICAgICAgICAgIHNlYXJjaExpc3RlbmVyVHJlZShoYW5kbGVycywgdHlwZSwgeHhUcmVlW2JyYW5jaF0sIGkrMSk7XHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgaXNvbGF0ZWRCcmFuY2ggPSB7fTtcclxuICAgICAgICAgICAgICBpc29sYXRlZEJyYW5jaFticmFuY2hdID0geHhUcmVlW2JyYW5jaF07XHJcbiAgICAgICAgICAgICAgc2VhcmNoTGlzdGVuZXJUcmVlKGhhbmRsZXJzLCB0eXBlLCB7ICcqKic6IGlzb2xhdGVkQnJhbmNoIH0sIGkrMSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgIH0gZWxzZSBpZih4eFRyZWUuX2xpc3RlbmVycykge1xyXG4gICAgICAgIC8vIFdlIGhhdmUgcmVhY2hlZCB0aGUgZW5kIGFuZCBzdGlsbCBvbiBhICcqKidcclxuICAgICAgICBzZWFyY2hMaXN0ZW5lclRyZWUoaGFuZGxlcnMsIHR5cGUsIHh4VHJlZSwgdHlwZUxlbmd0aCk7XHJcbiAgICAgIH0gZWxzZSBpZih4eFRyZWVbJyonXSAmJiB4eFRyZWVbJyonXS5fbGlzdGVuZXJzKSB7XHJcbiAgICAgICAgc2VhcmNoTGlzdGVuZXJUcmVlKGhhbmRsZXJzLCB0eXBlLCB4eFRyZWVbJyonXSwgdHlwZUxlbmd0aCk7XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gbGlzdGVuZXJzO1xyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gZ3Jvd0xpc3RlbmVyVHJlZSh0eXBlLCBsaXN0ZW5lcikge1xyXG5cclxuICAgIHR5cGUgPSB0eXBlb2YgdHlwZSA9PT0gJ3N0cmluZycgPyB0eXBlLnNwbGl0KHRoaXMuZGVsaW1pdGVyKSA6IHR5cGUuc2xpY2UoKTtcclxuXHJcbiAgICAvL1xyXG4gICAgLy8gTG9va3MgZm9yIHR3byBjb25zZWN1dGl2ZSAnKionLCBpZiBzbywgZG9uJ3QgYWRkIHRoZSBldmVudCBhdCBhbGwuXHJcbiAgICAvL1xyXG4gICAgZm9yKHZhciBpID0gMCwgbGVuID0gdHlwZS5sZW5ndGg7IGkrMSA8IGxlbjsgaSsrKSB7XHJcbiAgICAgIGlmKHR5cGVbaV0gPT09ICcqKicgJiYgdHlwZVtpKzFdID09PSAnKionKSB7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgdmFyIHRyZWUgPSB0aGlzLmxpc3RlbmVyVHJlZTtcclxuICAgIHZhciBuYW1lID0gdHlwZS5zaGlmdCgpO1xyXG5cclxuICAgIHdoaWxlIChuYW1lICE9PSB1bmRlZmluZWQpIHtcclxuXHJcbiAgICAgIGlmICghdHJlZVtuYW1lXSkge1xyXG4gICAgICAgIHRyZWVbbmFtZV0gPSB7fTtcclxuICAgICAgfVxyXG5cclxuICAgICAgdHJlZSA9IHRyZWVbbmFtZV07XHJcblxyXG4gICAgICBpZiAodHlwZS5sZW5ndGggPT09IDApIHtcclxuXHJcbiAgICAgICAgaWYgKCF0cmVlLl9saXN0ZW5lcnMpIHtcclxuICAgICAgICAgIHRyZWUuX2xpc3RlbmVycyA9IGxpc3RlbmVyO1xyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNlIHtcclxuICAgICAgICAgIGlmICh0eXBlb2YgdHJlZS5fbGlzdGVuZXJzID09PSAnZnVuY3Rpb24nKSB7XHJcbiAgICAgICAgICAgIHRyZWUuX2xpc3RlbmVycyA9IFt0cmVlLl9saXN0ZW5lcnNdO1xyXG4gICAgICAgICAgfVxyXG5cclxuICAgICAgICAgIHRyZWUuX2xpc3RlbmVycy5wdXNoKGxpc3RlbmVyKTtcclxuXHJcbiAgICAgICAgICBpZiAoXHJcbiAgICAgICAgICAgICF0cmVlLl9saXN0ZW5lcnMud2FybmVkICYmXHJcbiAgICAgICAgICAgIHRoaXMuX21heExpc3RlbmVycyA+IDAgJiZcclxuICAgICAgICAgICAgdHJlZS5fbGlzdGVuZXJzLmxlbmd0aCA+IHRoaXMuX21heExpc3RlbmVyc1xyXG4gICAgICAgICAgKSB7XHJcbiAgICAgICAgICAgIHRyZWUuX2xpc3RlbmVycy53YXJuZWQgPSB0cnVlO1xyXG4gICAgICAgICAgICBsb2dQb3NzaWJsZU1lbW9yeUxlYWsuY2FsbCh0aGlzLCB0cmVlLl9saXN0ZW5lcnMubGVuZ3RoLCBuYW1lKTtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgIH1cclxuICAgICAgbmFtZSA9IHR5cGUuc2hpZnQoKTtcclxuICAgIH1cclxuICAgIHJldHVybiB0cnVlO1xyXG4gIH1cclxuXHJcbiAgLy8gQnkgZGVmYXVsdCBFdmVudEVtaXR0ZXJzIHdpbGwgcHJpbnQgYSB3YXJuaW5nIGlmIG1vcmUgdGhhblxyXG4gIC8vIDEwIGxpc3RlbmVycyBhcmUgYWRkZWQgdG8gaXQuIFRoaXMgaXMgYSB1c2VmdWwgZGVmYXVsdCB3aGljaFxyXG4gIC8vIGhlbHBzIGZpbmRpbmcgbWVtb3J5IGxlYWtzLlxyXG4gIC8vXHJcbiAgLy8gT2J2aW91c2x5IG5vdCBhbGwgRW1pdHRlcnMgc2hvdWxkIGJlIGxpbWl0ZWQgdG8gMTAuIFRoaXMgZnVuY3Rpb24gYWxsb3dzXHJcbiAgLy8gdGhhdCB0byBiZSBpbmNyZWFzZWQuIFNldCB0byB6ZXJvIGZvciB1bmxpbWl0ZWQuXHJcblxyXG4gIEV2ZW50RW1pdHRlci5wcm90b3R5cGUuZGVsaW1pdGVyID0gJy4nO1xyXG5cclxuICBFdmVudEVtaXR0ZXIucHJvdG90eXBlLnNldE1heExpc3RlbmVycyA9IGZ1bmN0aW9uKG4pIHtcclxuICAgIGlmIChuICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgdGhpcy5fbWF4TGlzdGVuZXJzID0gbjtcclxuICAgICAgaWYgKCF0aGlzLl9jb25mKSB0aGlzLl9jb25mID0ge307XHJcbiAgICAgIHRoaXMuX2NvbmYubWF4TGlzdGVuZXJzID0gbjtcclxuICAgIH1cclxuICB9O1xyXG5cclxuICBFdmVudEVtaXR0ZXIucHJvdG90eXBlLmV2ZW50ID0gJyc7XHJcblxyXG5cclxuICBFdmVudEVtaXR0ZXIucHJvdG90eXBlLm9uY2UgPSBmdW5jdGlvbihldmVudCwgZm4pIHtcclxuICAgIHJldHVybiB0aGlzLl9vbmNlKGV2ZW50LCBmbiwgZmFsc2UpO1xyXG4gIH07XHJcblxyXG4gIEV2ZW50RW1pdHRlci5wcm90b3R5cGUucHJlcGVuZE9uY2VMaXN0ZW5lciA9IGZ1bmN0aW9uKGV2ZW50LCBmbikge1xyXG4gICAgcmV0dXJuIHRoaXMuX29uY2UoZXZlbnQsIGZuLCB0cnVlKTtcclxuICB9O1xyXG5cclxuICBFdmVudEVtaXR0ZXIucHJvdG90eXBlLl9vbmNlID0gZnVuY3Rpb24oZXZlbnQsIGZuLCBwcmVwZW5kKSB7XHJcbiAgICB0aGlzLl9tYW55KGV2ZW50LCAxLCBmbiwgcHJlcGVuZCk7XHJcbiAgICByZXR1cm4gdGhpcztcclxuICB9O1xyXG5cclxuICBFdmVudEVtaXR0ZXIucHJvdG90eXBlLm1hbnkgPSBmdW5jdGlvbihldmVudCwgdHRsLCBmbikge1xyXG4gICAgcmV0dXJuIHRoaXMuX21hbnkoZXZlbnQsIHR0bCwgZm4sIGZhbHNlKTtcclxuICB9XHJcblxyXG4gIEV2ZW50RW1pdHRlci5wcm90b3R5cGUucHJlcGVuZE1hbnkgPSBmdW5jdGlvbihldmVudCwgdHRsLCBmbikge1xyXG4gICAgcmV0dXJuIHRoaXMuX21hbnkoZXZlbnQsIHR0bCwgZm4sIHRydWUpO1xyXG4gIH1cclxuXHJcbiAgRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5fbWFueSA9IGZ1bmN0aW9uKGV2ZW50LCB0dGwsIGZuLCBwcmVwZW5kKSB7XHJcbiAgICB2YXIgc2VsZiA9IHRoaXM7XHJcblxyXG4gICAgaWYgKHR5cGVvZiBmbiAhPT0gJ2Z1bmN0aW9uJykge1xyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ21hbnkgb25seSBhY2NlcHRzIGluc3RhbmNlcyBvZiBGdW5jdGlvbicpO1xyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIGxpc3RlbmVyKCkge1xyXG4gICAgICBpZiAoLS10dGwgPT09IDApIHtcclxuICAgICAgICBzZWxmLm9mZihldmVudCwgbGlzdGVuZXIpO1xyXG4gICAgICB9XHJcbiAgICAgIHJldHVybiBmbi5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xyXG4gICAgfVxyXG5cclxuICAgIGxpc3RlbmVyLl9vcmlnaW4gPSBmbjtcclxuXHJcbiAgICB0aGlzLl9vbihldmVudCwgbGlzdGVuZXIsIHByZXBlbmQpO1xyXG5cclxuICAgIHJldHVybiBzZWxmO1xyXG4gIH07XHJcblxyXG4gIEV2ZW50RW1pdHRlci5wcm90b3R5cGUuZW1pdCA9IGZ1bmN0aW9uKCkge1xyXG5cclxuICAgIHRoaXMuX2V2ZW50cyB8fCBpbml0LmNhbGwodGhpcyk7XHJcblxyXG4gICAgdmFyIHR5cGUgPSBhcmd1bWVudHNbMF07XHJcblxyXG4gICAgaWYgKHR5cGUgPT09ICduZXdMaXN0ZW5lcicgJiYgIXRoaXMubmV3TGlzdGVuZXIpIHtcclxuICAgICAgaWYgKCF0aGlzLl9ldmVudHMubmV3TGlzdGVuZXIpIHtcclxuICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICB2YXIgYWwgPSBhcmd1bWVudHMubGVuZ3RoO1xyXG4gICAgdmFyIGFyZ3MsbCxpLGo7XHJcbiAgICB2YXIgaGFuZGxlcjtcclxuXHJcbiAgICBpZiAodGhpcy5fYWxsICYmIHRoaXMuX2FsbC5sZW5ndGgpIHtcclxuICAgICAgaGFuZGxlciA9IHRoaXMuX2FsbC5zbGljZSgpO1xyXG4gICAgICBpZiAoYWwgPiAzKSB7XHJcbiAgICAgICAgYXJncyA9IG5ldyBBcnJheShhbCk7XHJcbiAgICAgICAgZm9yIChqID0gMDsgaiA8IGFsOyBqKyspIGFyZ3Nbal0gPSBhcmd1bWVudHNbal07XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGZvciAoaSA9IDAsIGwgPSBoYW5kbGVyLmxlbmd0aDsgaSA8IGw7IGkrKykge1xyXG4gICAgICAgIHRoaXMuZXZlbnQgPSB0eXBlO1xyXG4gICAgICAgIHN3aXRjaCAoYWwpIHtcclxuICAgICAgICBjYXNlIDE6XHJcbiAgICAgICAgICBoYW5kbGVyW2ldLmNhbGwodGhpcywgdHlwZSk7XHJcbiAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIDI6XHJcbiAgICAgICAgICBoYW5kbGVyW2ldLmNhbGwodGhpcywgdHlwZSwgYXJndW1lbnRzWzFdKTtcclxuICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgMzpcclxuICAgICAgICAgIGhhbmRsZXJbaV0uY2FsbCh0aGlzLCB0eXBlLCBhcmd1bWVudHNbMV0sIGFyZ3VtZW50c1syXSk7XHJcbiAgICAgICAgICBicmVhaztcclxuICAgICAgICBkZWZhdWx0OlxyXG4gICAgICAgICAgaGFuZGxlcltpXS5hcHBseSh0aGlzLCBhcmdzKTtcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBpZiAodGhpcy53aWxkY2FyZCkge1xyXG4gICAgICBoYW5kbGVyID0gW107XHJcbiAgICAgIHZhciBucyA9IHR5cGVvZiB0eXBlID09PSAnc3RyaW5nJyA/IHR5cGUuc3BsaXQodGhpcy5kZWxpbWl0ZXIpIDogdHlwZS5zbGljZSgpO1xyXG4gICAgICBzZWFyY2hMaXN0ZW5lclRyZWUuY2FsbCh0aGlzLCBoYW5kbGVyLCBucywgdGhpcy5saXN0ZW5lclRyZWUsIDApO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgaGFuZGxlciA9IHRoaXMuX2V2ZW50c1t0eXBlXTtcclxuICAgICAgaWYgKHR5cGVvZiBoYW5kbGVyID09PSAnZnVuY3Rpb24nKSB7XHJcbiAgICAgICAgdGhpcy5ldmVudCA9IHR5cGU7XHJcbiAgICAgICAgc3dpdGNoIChhbCkge1xyXG4gICAgICAgIGNhc2UgMTpcclxuICAgICAgICAgIGhhbmRsZXIuY2FsbCh0aGlzKTtcclxuICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgMjpcclxuICAgICAgICAgIGhhbmRsZXIuY2FsbCh0aGlzLCBhcmd1bWVudHNbMV0pO1xyXG4gICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSAzOlxyXG4gICAgICAgICAgaGFuZGxlci5jYWxsKHRoaXMsIGFyZ3VtZW50c1sxXSwgYXJndW1lbnRzWzJdKTtcclxuICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgICBhcmdzID0gbmV3IEFycmF5KGFsIC0gMSk7XHJcbiAgICAgICAgICBmb3IgKGogPSAxOyBqIDwgYWw7IGorKykgYXJnc1tqIC0gMV0gPSBhcmd1bWVudHNbal07XHJcbiAgICAgICAgICBoYW5kbGVyLmFwcGx5KHRoaXMsIGFyZ3MpO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgfSBlbHNlIGlmIChoYW5kbGVyKSB7XHJcbiAgICAgICAgLy8gbmVlZCB0byBtYWtlIGNvcHkgb2YgaGFuZGxlcnMgYmVjYXVzZSBsaXN0IGNhbiBjaGFuZ2UgaW4gdGhlIG1pZGRsZVxyXG4gICAgICAgIC8vIG9mIGVtaXQgY2FsbFxyXG4gICAgICAgIGhhbmRsZXIgPSBoYW5kbGVyLnNsaWNlKCk7XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBpZiAoaGFuZGxlciAmJiBoYW5kbGVyLmxlbmd0aCkge1xyXG4gICAgICBpZiAoYWwgPiAzKSB7XHJcbiAgICAgICAgYXJncyA9IG5ldyBBcnJheShhbCAtIDEpO1xyXG4gICAgICAgIGZvciAoaiA9IDE7IGogPCBhbDsgaisrKSBhcmdzW2ogLSAxXSA9IGFyZ3VtZW50c1tqXTtcclxuICAgICAgfVxyXG4gICAgICBmb3IgKGkgPSAwLCBsID0gaGFuZGxlci5sZW5ndGg7IGkgPCBsOyBpKyspIHtcclxuICAgICAgICB0aGlzLmV2ZW50ID0gdHlwZTtcclxuICAgICAgICBzd2l0Y2ggKGFsKSB7XHJcbiAgICAgICAgY2FzZSAxOlxyXG4gICAgICAgICAgaGFuZGxlcltpXS5jYWxsKHRoaXMpO1xyXG4gICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSAyOlxyXG4gICAgICAgICAgaGFuZGxlcltpXS5jYWxsKHRoaXMsIGFyZ3VtZW50c1sxXSk7XHJcbiAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIDM6XHJcbiAgICAgICAgICBoYW5kbGVyW2ldLmNhbGwodGhpcywgYXJndW1lbnRzWzFdLCBhcmd1bWVudHNbMl0pO1xyXG4gICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgIGhhbmRsZXJbaV0uYXBwbHkodGhpcywgYXJncyk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgfSBlbHNlIGlmICghdGhpcy5fYWxsICYmIHR5cGUgPT09ICdlcnJvcicpIHtcclxuICAgICAgaWYgKGFyZ3VtZW50c1sxXSBpbnN0YW5jZW9mIEVycm9yKSB7XHJcbiAgICAgICAgdGhyb3cgYXJndW1lbnRzWzFdOyAvLyBVbmhhbmRsZWQgJ2Vycm9yJyBldmVudFxyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIlVuY2F1Z2h0LCB1bnNwZWNpZmllZCAnZXJyb3InIGV2ZW50LlwiKTtcclxuICAgICAgfVxyXG4gICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuICEhdGhpcy5fYWxsO1xyXG4gIH07XHJcblxyXG4gIEV2ZW50RW1pdHRlci5wcm90b3R5cGUuZW1pdEFzeW5jID0gZnVuY3Rpb24oKSB7XHJcblxyXG4gICAgdGhpcy5fZXZlbnRzIHx8IGluaXQuY2FsbCh0aGlzKTtcclxuXHJcbiAgICB2YXIgdHlwZSA9IGFyZ3VtZW50c1swXTtcclxuXHJcbiAgICBpZiAodHlwZSA9PT0gJ25ld0xpc3RlbmVyJyAmJiAhdGhpcy5uZXdMaXN0ZW5lcikge1xyXG4gICAgICAgIGlmICghdGhpcy5fZXZlbnRzLm5ld0xpc3RlbmVyKSB7IHJldHVybiBQcm9taXNlLnJlc29sdmUoW2ZhbHNlXSk7IH1cclxuICAgIH1cclxuXHJcbiAgICB2YXIgcHJvbWlzZXM9IFtdO1xyXG5cclxuICAgIHZhciBhbCA9IGFyZ3VtZW50cy5sZW5ndGg7XHJcbiAgICB2YXIgYXJncyxsLGksajtcclxuICAgIHZhciBoYW5kbGVyO1xyXG5cclxuICAgIGlmICh0aGlzLl9hbGwpIHtcclxuICAgICAgaWYgKGFsID4gMykge1xyXG4gICAgICAgIGFyZ3MgPSBuZXcgQXJyYXkoYWwpO1xyXG4gICAgICAgIGZvciAoaiA9IDE7IGogPCBhbDsgaisrKSBhcmdzW2pdID0gYXJndW1lbnRzW2pdO1xyXG4gICAgICB9XHJcbiAgICAgIGZvciAoaSA9IDAsIGwgPSB0aGlzLl9hbGwubGVuZ3RoOyBpIDwgbDsgaSsrKSB7XHJcbiAgICAgICAgdGhpcy5ldmVudCA9IHR5cGU7XHJcbiAgICAgICAgc3dpdGNoIChhbCkge1xyXG4gICAgICAgIGNhc2UgMTpcclxuICAgICAgICAgIHByb21pc2VzLnB1c2godGhpcy5fYWxsW2ldLmNhbGwodGhpcywgdHlwZSkpO1xyXG4gICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSAyOlxyXG4gICAgICAgICAgcHJvbWlzZXMucHVzaCh0aGlzLl9hbGxbaV0uY2FsbCh0aGlzLCB0eXBlLCBhcmd1bWVudHNbMV0pKTtcclxuICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgMzpcclxuICAgICAgICAgIHByb21pc2VzLnB1c2godGhpcy5fYWxsW2ldLmNhbGwodGhpcywgdHlwZSwgYXJndW1lbnRzWzFdLCBhcmd1bWVudHNbMl0pKTtcclxuICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgICBwcm9taXNlcy5wdXNoKHRoaXMuX2FsbFtpXS5hcHBseSh0aGlzLCBhcmdzKSk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKHRoaXMud2lsZGNhcmQpIHtcclxuICAgICAgaGFuZGxlciA9IFtdO1xyXG4gICAgICB2YXIgbnMgPSB0eXBlb2YgdHlwZSA9PT0gJ3N0cmluZycgPyB0eXBlLnNwbGl0KHRoaXMuZGVsaW1pdGVyKSA6IHR5cGUuc2xpY2UoKTtcclxuICAgICAgc2VhcmNoTGlzdGVuZXJUcmVlLmNhbGwodGhpcywgaGFuZGxlciwgbnMsIHRoaXMubGlzdGVuZXJUcmVlLCAwKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIGhhbmRsZXIgPSB0aGlzLl9ldmVudHNbdHlwZV07XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKHR5cGVvZiBoYW5kbGVyID09PSAnZnVuY3Rpb24nKSB7XHJcbiAgICAgIHRoaXMuZXZlbnQgPSB0eXBlO1xyXG4gICAgICBzd2l0Y2ggKGFsKSB7XHJcbiAgICAgIGNhc2UgMTpcclxuICAgICAgICBwcm9taXNlcy5wdXNoKGhhbmRsZXIuY2FsbCh0aGlzKSk7XHJcbiAgICAgICAgYnJlYWs7XHJcbiAgICAgIGNhc2UgMjpcclxuICAgICAgICBwcm9taXNlcy5wdXNoKGhhbmRsZXIuY2FsbCh0aGlzLCBhcmd1bWVudHNbMV0pKTtcclxuICAgICAgICBicmVhaztcclxuICAgICAgY2FzZSAzOlxyXG4gICAgICAgIHByb21pc2VzLnB1c2goaGFuZGxlci5jYWxsKHRoaXMsIGFyZ3VtZW50c1sxXSwgYXJndW1lbnRzWzJdKSk7XHJcbiAgICAgICAgYnJlYWs7XHJcbiAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgYXJncyA9IG5ldyBBcnJheShhbCAtIDEpO1xyXG4gICAgICAgIGZvciAoaiA9IDE7IGogPCBhbDsgaisrKSBhcmdzW2ogLSAxXSA9IGFyZ3VtZW50c1tqXTtcclxuICAgICAgICBwcm9taXNlcy5wdXNoKGhhbmRsZXIuYXBwbHkodGhpcywgYXJncykpO1xyXG4gICAgICB9XHJcbiAgICB9IGVsc2UgaWYgKGhhbmRsZXIgJiYgaGFuZGxlci5sZW5ndGgpIHtcclxuICAgICAgaGFuZGxlciA9IGhhbmRsZXIuc2xpY2UoKTtcclxuICAgICAgaWYgKGFsID4gMykge1xyXG4gICAgICAgIGFyZ3MgPSBuZXcgQXJyYXkoYWwgLSAxKTtcclxuICAgICAgICBmb3IgKGogPSAxOyBqIDwgYWw7IGorKykgYXJnc1tqIC0gMV0gPSBhcmd1bWVudHNbal07XHJcbiAgICAgIH1cclxuICAgICAgZm9yIChpID0gMCwgbCA9IGhhbmRsZXIubGVuZ3RoOyBpIDwgbDsgaSsrKSB7XHJcbiAgICAgICAgdGhpcy5ldmVudCA9IHR5cGU7XHJcbiAgICAgICAgc3dpdGNoIChhbCkge1xyXG4gICAgICAgIGNhc2UgMTpcclxuICAgICAgICAgIHByb21pc2VzLnB1c2goaGFuZGxlcltpXS5jYWxsKHRoaXMpKTtcclxuICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgMjpcclxuICAgICAgICAgIHByb21pc2VzLnB1c2goaGFuZGxlcltpXS5jYWxsKHRoaXMsIGFyZ3VtZW50c1sxXSkpO1xyXG4gICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSAzOlxyXG4gICAgICAgICAgcHJvbWlzZXMucHVzaChoYW5kbGVyW2ldLmNhbGwodGhpcywgYXJndW1lbnRzWzFdLCBhcmd1bWVudHNbMl0pKTtcclxuICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgICBwcm9taXNlcy5wdXNoKGhhbmRsZXJbaV0uYXBwbHkodGhpcywgYXJncykpO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgfSBlbHNlIGlmICghdGhpcy5fYWxsICYmIHR5cGUgPT09ICdlcnJvcicpIHtcclxuICAgICAgaWYgKGFyZ3VtZW50c1sxXSBpbnN0YW5jZW9mIEVycm9yKSB7XHJcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KGFyZ3VtZW50c1sxXSk7IC8vIFVuaGFuZGxlZCAnZXJyb3InIGV2ZW50XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KFwiVW5jYXVnaHQsIHVuc3BlY2lmaWVkICdlcnJvcicgZXZlbnQuXCIpO1xyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIFByb21pc2UuYWxsKHByb21pc2VzKTtcclxuICB9O1xyXG5cclxuICBFdmVudEVtaXR0ZXIucHJvdG90eXBlLm9uID0gZnVuY3Rpb24odHlwZSwgbGlzdGVuZXIpIHtcclxuICAgIHJldHVybiB0aGlzLl9vbih0eXBlLCBsaXN0ZW5lciwgZmFsc2UpO1xyXG4gIH07XHJcblxyXG4gIEV2ZW50RW1pdHRlci5wcm90b3R5cGUucHJlcGVuZExpc3RlbmVyID0gZnVuY3Rpb24odHlwZSwgbGlzdGVuZXIpIHtcclxuICAgIHJldHVybiB0aGlzLl9vbih0eXBlLCBsaXN0ZW5lciwgdHJ1ZSk7XHJcbiAgfTtcclxuXHJcbiAgRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5vbkFueSA9IGZ1bmN0aW9uKGZuKSB7XHJcbiAgICByZXR1cm4gdGhpcy5fb25BbnkoZm4sIGZhbHNlKTtcclxuICB9O1xyXG5cclxuICBFdmVudEVtaXR0ZXIucHJvdG90eXBlLnByZXBlbmRBbnkgPSBmdW5jdGlvbihmbikge1xyXG4gICAgcmV0dXJuIHRoaXMuX29uQW55KGZuLCB0cnVlKTtcclxuICB9O1xyXG5cclxuICBFdmVudEVtaXR0ZXIucHJvdG90eXBlLmFkZExpc3RlbmVyID0gRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5vbjtcclxuXHJcbiAgRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5fb25BbnkgPSBmdW5jdGlvbihmbiwgcHJlcGVuZCl7XHJcbiAgICBpZiAodHlwZW9mIGZuICE9PSAnZnVuY3Rpb24nKSB7XHJcbiAgICAgIHRocm93IG5ldyBFcnJvcignb25Bbnkgb25seSBhY2NlcHRzIGluc3RhbmNlcyBvZiBGdW5jdGlvbicpO1xyXG4gICAgfVxyXG5cclxuICAgIGlmICghdGhpcy5fYWxsKSB7XHJcbiAgICAgIHRoaXMuX2FsbCA9IFtdO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIEFkZCB0aGUgZnVuY3Rpb24gdG8gdGhlIGV2ZW50IGxpc3RlbmVyIGNvbGxlY3Rpb24uXHJcbiAgICBpZihwcmVwZW5kKXtcclxuICAgICAgdGhpcy5fYWxsLnVuc2hpZnQoZm4pO1xyXG4gICAgfWVsc2V7XHJcbiAgICAgIHRoaXMuX2FsbC5wdXNoKGZuKTtcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gdGhpcztcclxuICB9XHJcblxyXG4gIEV2ZW50RW1pdHRlci5wcm90b3R5cGUuX29uID0gZnVuY3Rpb24odHlwZSwgbGlzdGVuZXIsIHByZXBlbmQpIHtcclxuICAgIGlmICh0eXBlb2YgdHlwZSA9PT0gJ2Z1bmN0aW9uJykge1xyXG4gICAgICB0aGlzLl9vbkFueSh0eXBlLCBsaXN0ZW5lcik7XHJcbiAgICAgIHJldHVybiB0aGlzO1xyXG4gICAgfVxyXG5cclxuICAgIGlmICh0eXBlb2YgbGlzdGVuZXIgIT09ICdmdW5jdGlvbicpIHtcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdvbiBvbmx5IGFjY2VwdHMgaW5zdGFuY2VzIG9mIEZ1bmN0aW9uJyk7XHJcbiAgICB9XHJcbiAgICB0aGlzLl9ldmVudHMgfHwgaW5pdC5jYWxsKHRoaXMpO1xyXG5cclxuICAgIC8vIFRvIGF2b2lkIHJlY3Vyc2lvbiBpbiB0aGUgY2FzZSB0aGF0IHR5cGUgPT0gXCJuZXdMaXN0ZW5lcnNcIiEgQmVmb3JlXHJcbiAgICAvLyBhZGRpbmcgaXQgdG8gdGhlIGxpc3RlbmVycywgZmlyc3QgZW1pdCBcIm5ld0xpc3RlbmVyc1wiLlxyXG4gICAgdGhpcy5lbWl0KCduZXdMaXN0ZW5lcicsIHR5cGUsIGxpc3RlbmVyKTtcclxuXHJcbiAgICBpZiAodGhpcy53aWxkY2FyZCkge1xyXG4gICAgICBncm93TGlzdGVuZXJUcmVlLmNhbGwodGhpcywgdHlwZSwgbGlzdGVuZXIpO1xyXG4gICAgICByZXR1cm4gdGhpcztcclxuICAgIH1cclxuXHJcbiAgICBpZiAoIXRoaXMuX2V2ZW50c1t0eXBlXSkge1xyXG4gICAgICAvLyBPcHRpbWl6ZSB0aGUgY2FzZSBvZiBvbmUgbGlzdGVuZXIuIERvbid0IG5lZWQgdGhlIGV4dHJhIGFycmF5IG9iamVjdC5cclxuICAgICAgdGhpcy5fZXZlbnRzW3R5cGVdID0gbGlzdGVuZXI7XHJcbiAgICB9XHJcbiAgICBlbHNlIHtcclxuICAgICAgaWYgKHR5cGVvZiB0aGlzLl9ldmVudHNbdHlwZV0gPT09ICdmdW5jdGlvbicpIHtcclxuICAgICAgICAvLyBDaGFuZ2UgdG8gYXJyYXkuXHJcbiAgICAgICAgdGhpcy5fZXZlbnRzW3R5cGVdID0gW3RoaXMuX2V2ZW50c1t0eXBlXV07XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIC8vIElmIHdlJ3ZlIGFscmVhZHkgZ290IGFuIGFycmF5LCBqdXN0IGFkZFxyXG4gICAgICBpZihwcmVwZW5kKXtcclxuICAgICAgICB0aGlzLl9ldmVudHNbdHlwZV0udW5zaGlmdChsaXN0ZW5lcik7XHJcbiAgICAgIH1lbHNle1xyXG4gICAgICAgIHRoaXMuX2V2ZW50c1t0eXBlXS5wdXNoKGxpc3RlbmVyKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgLy8gQ2hlY2sgZm9yIGxpc3RlbmVyIGxlYWtcclxuICAgICAgaWYgKFxyXG4gICAgICAgICF0aGlzLl9ldmVudHNbdHlwZV0ud2FybmVkICYmXHJcbiAgICAgICAgdGhpcy5fbWF4TGlzdGVuZXJzID4gMCAmJlxyXG4gICAgICAgIHRoaXMuX2V2ZW50c1t0eXBlXS5sZW5ndGggPiB0aGlzLl9tYXhMaXN0ZW5lcnNcclxuICAgICAgKSB7XHJcbiAgICAgICAgdGhpcy5fZXZlbnRzW3R5cGVdLndhcm5lZCA9IHRydWU7XHJcbiAgICAgICAgbG9nUG9zc2libGVNZW1vcnlMZWFrLmNhbGwodGhpcywgdGhpcy5fZXZlbnRzW3R5cGVdLmxlbmd0aCwgdHlwZSk7XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gdGhpcztcclxuICB9XHJcblxyXG4gIEV2ZW50RW1pdHRlci5wcm90b3R5cGUub2ZmID0gZnVuY3Rpb24odHlwZSwgbGlzdGVuZXIpIHtcclxuICAgIGlmICh0eXBlb2YgbGlzdGVuZXIgIT09ICdmdW5jdGlvbicpIHtcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdyZW1vdmVMaXN0ZW5lciBvbmx5IHRha2VzIGluc3RhbmNlcyBvZiBGdW5jdGlvbicpO1xyXG4gICAgfVxyXG5cclxuICAgIHZhciBoYW5kbGVycyxsZWFmcz1bXTtcclxuXHJcbiAgICBpZih0aGlzLndpbGRjYXJkKSB7XHJcbiAgICAgIHZhciBucyA9IHR5cGVvZiB0eXBlID09PSAnc3RyaW5nJyA/IHR5cGUuc3BsaXQodGhpcy5kZWxpbWl0ZXIpIDogdHlwZS5zbGljZSgpO1xyXG4gICAgICBsZWFmcyA9IHNlYXJjaExpc3RlbmVyVHJlZS5jYWxsKHRoaXMsIG51bGwsIG5zLCB0aGlzLmxpc3RlbmVyVHJlZSwgMCk7XHJcbiAgICB9XHJcbiAgICBlbHNlIHtcclxuICAgICAgLy8gZG9lcyBub3QgdXNlIGxpc3RlbmVycygpLCBzbyBubyBzaWRlIGVmZmVjdCBvZiBjcmVhdGluZyBfZXZlbnRzW3R5cGVdXHJcbiAgICAgIGlmICghdGhpcy5fZXZlbnRzW3R5cGVdKSByZXR1cm4gdGhpcztcclxuICAgICAgaGFuZGxlcnMgPSB0aGlzLl9ldmVudHNbdHlwZV07XHJcbiAgICAgIGxlYWZzLnB1c2goe19saXN0ZW5lcnM6aGFuZGxlcnN9KTtcclxuICAgIH1cclxuXHJcbiAgICBmb3IgKHZhciBpTGVhZj0wOyBpTGVhZjxsZWFmcy5sZW5ndGg7IGlMZWFmKyspIHtcclxuICAgICAgdmFyIGxlYWYgPSBsZWFmc1tpTGVhZl07XHJcbiAgICAgIGhhbmRsZXJzID0gbGVhZi5fbGlzdGVuZXJzO1xyXG4gICAgICBpZiAoaXNBcnJheShoYW5kbGVycykpIHtcclxuXHJcbiAgICAgICAgdmFyIHBvc2l0aW9uID0gLTE7XHJcblxyXG4gICAgICAgIGZvciAodmFyIGkgPSAwLCBsZW5ndGggPSBoYW5kbGVycy5sZW5ndGg7IGkgPCBsZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAgaWYgKGhhbmRsZXJzW2ldID09PSBsaXN0ZW5lciB8fFxyXG4gICAgICAgICAgICAoaGFuZGxlcnNbaV0ubGlzdGVuZXIgJiYgaGFuZGxlcnNbaV0ubGlzdGVuZXIgPT09IGxpc3RlbmVyKSB8fFxyXG4gICAgICAgICAgICAoaGFuZGxlcnNbaV0uX29yaWdpbiAmJiBoYW5kbGVyc1tpXS5fb3JpZ2luID09PSBsaXN0ZW5lcikpIHtcclxuICAgICAgICAgICAgcG9zaXRpb24gPSBpO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmIChwb3NpdGlvbiA8IDApIHtcclxuICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYodGhpcy53aWxkY2FyZCkge1xyXG4gICAgICAgICAgbGVhZi5fbGlzdGVuZXJzLnNwbGljZShwb3NpdGlvbiwgMSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGVsc2Uge1xyXG4gICAgICAgICAgdGhpcy5fZXZlbnRzW3R5cGVdLnNwbGljZShwb3NpdGlvbiwgMSk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBpZiAoaGFuZGxlcnMubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgICAgICBpZih0aGlzLndpbGRjYXJkKSB7XHJcbiAgICAgICAgICAgIGRlbGV0ZSBsZWFmLl9saXN0ZW5lcnM7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgICBlbHNlIHtcclxuICAgICAgICAgICAgZGVsZXRlIHRoaXMuX2V2ZW50c1t0eXBlXTtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMuZW1pdChcInJlbW92ZUxpc3RlbmVyXCIsIHR5cGUsIGxpc3RlbmVyKTtcclxuXHJcbiAgICAgICAgcmV0dXJuIHRoaXM7XHJcbiAgICAgIH1cclxuICAgICAgZWxzZSBpZiAoaGFuZGxlcnMgPT09IGxpc3RlbmVyIHx8XHJcbiAgICAgICAgKGhhbmRsZXJzLmxpc3RlbmVyICYmIGhhbmRsZXJzLmxpc3RlbmVyID09PSBsaXN0ZW5lcikgfHxcclxuICAgICAgICAoaGFuZGxlcnMuX29yaWdpbiAmJiBoYW5kbGVycy5fb3JpZ2luID09PSBsaXN0ZW5lcikpIHtcclxuICAgICAgICBpZih0aGlzLndpbGRjYXJkKSB7XHJcbiAgICAgICAgICBkZWxldGUgbGVhZi5fbGlzdGVuZXJzO1xyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNlIHtcclxuICAgICAgICAgIGRlbGV0ZSB0aGlzLl9ldmVudHNbdHlwZV07XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLmVtaXQoXCJyZW1vdmVMaXN0ZW5lclwiLCB0eXBlLCBsaXN0ZW5lcik7XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiByZWN1cnNpdmVseUdhcmJhZ2VDb2xsZWN0KHJvb3QpIHtcclxuICAgICAgaWYgKHJvb3QgPT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgIHJldHVybjtcclxuICAgICAgfVxyXG4gICAgICB2YXIga2V5cyA9IE9iamVjdC5rZXlzKHJvb3QpO1xyXG4gICAgICBmb3IgKHZhciBpIGluIGtleXMpIHtcclxuICAgICAgICB2YXIga2V5ID0ga2V5c1tpXTtcclxuICAgICAgICB2YXIgb2JqID0gcm9vdFtrZXldO1xyXG4gICAgICAgIGlmICgob2JqIGluc3RhbmNlb2YgRnVuY3Rpb24pIHx8ICh0eXBlb2Ygb2JqICE9PSBcIm9iamVjdFwiKSB8fCAob2JqID09PSBudWxsKSlcclxuICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgIGlmIChPYmplY3Qua2V5cyhvYmopLmxlbmd0aCA+IDApIHtcclxuICAgICAgICAgIHJlY3Vyc2l2ZWx5R2FyYmFnZUNvbGxlY3Qocm9vdFtrZXldKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKE9iamVjdC5rZXlzKG9iaikubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgICAgICBkZWxldGUgcm9vdFtrZXldO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgfVxyXG4gICAgcmVjdXJzaXZlbHlHYXJiYWdlQ29sbGVjdCh0aGlzLmxpc3RlbmVyVHJlZSk7XHJcblxyXG4gICAgcmV0dXJuIHRoaXM7XHJcbiAgfTtcclxuXHJcbiAgRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5vZmZBbnkgPSBmdW5jdGlvbihmbikge1xyXG4gICAgdmFyIGkgPSAwLCBsID0gMCwgZm5zO1xyXG4gICAgaWYgKGZuICYmIHRoaXMuX2FsbCAmJiB0aGlzLl9hbGwubGVuZ3RoID4gMCkge1xyXG4gICAgICBmbnMgPSB0aGlzLl9hbGw7XHJcbiAgICAgIGZvcihpID0gMCwgbCA9IGZucy5sZW5ndGg7IGkgPCBsOyBpKyspIHtcclxuICAgICAgICBpZihmbiA9PT0gZm5zW2ldKSB7XHJcbiAgICAgICAgICBmbnMuc3BsaWNlKGksIDEpO1xyXG4gICAgICAgICAgdGhpcy5lbWl0KFwicmVtb3ZlTGlzdGVuZXJBbnlcIiwgZm4pO1xyXG4gICAgICAgICAgcmV0dXJuIHRoaXM7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICBmbnMgPSB0aGlzLl9hbGw7XHJcbiAgICAgIGZvcihpID0gMCwgbCA9IGZucy5sZW5ndGg7IGkgPCBsOyBpKyspXHJcbiAgICAgICAgdGhpcy5lbWl0KFwicmVtb3ZlTGlzdGVuZXJBbnlcIiwgZm5zW2ldKTtcclxuICAgICAgdGhpcy5fYWxsID0gW107XHJcbiAgICB9XHJcbiAgICByZXR1cm4gdGhpcztcclxuICB9O1xyXG5cclxuICBFdmVudEVtaXR0ZXIucHJvdG90eXBlLnJlbW92ZUxpc3RlbmVyID0gRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5vZmY7XHJcblxyXG4gIEV2ZW50RW1pdHRlci5wcm90b3R5cGUucmVtb3ZlQWxsTGlzdGVuZXJzID0gZnVuY3Rpb24odHlwZSkge1xyXG4gICAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPT09IDApIHtcclxuICAgICAgIXRoaXMuX2V2ZW50cyB8fCBpbml0LmNhbGwodGhpcyk7XHJcbiAgICAgIHJldHVybiB0aGlzO1xyXG4gICAgfVxyXG5cclxuICAgIGlmICh0aGlzLndpbGRjYXJkKSB7XHJcbiAgICAgIHZhciBucyA9IHR5cGVvZiB0eXBlID09PSAnc3RyaW5nJyA/IHR5cGUuc3BsaXQodGhpcy5kZWxpbWl0ZXIpIDogdHlwZS5zbGljZSgpO1xyXG4gICAgICB2YXIgbGVhZnMgPSBzZWFyY2hMaXN0ZW5lclRyZWUuY2FsbCh0aGlzLCBudWxsLCBucywgdGhpcy5saXN0ZW5lclRyZWUsIDApO1xyXG5cclxuICAgICAgZm9yICh2YXIgaUxlYWY9MDsgaUxlYWY8bGVhZnMubGVuZ3RoOyBpTGVhZisrKSB7XHJcbiAgICAgICAgdmFyIGxlYWYgPSBsZWFmc1tpTGVhZl07XHJcbiAgICAgICAgbGVhZi5fbGlzdGVuZXJzID0gbnVsbDtcclxuICAgICAgfVxyXG4gICAgfVxyXG4gICAgZWxzZSBpZiAodGhpcy5fZXZlbnRzKSB7XHJcbiAgICAgIHRoaXMuX2V2ZW50c1t0eXBlXSA9IG51bGw7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gdGhpcztcclxuICB9O1xyXG5cclxuICBFdmVudEVtaXR0ZXIucHJvdG90eXBlLmxpc3RlbmVycyA9IGZ1bmN0aW9uKHR5cGUpIHtcclxuICAgIGlmICh0aGlzLndpbGRjYXJkKSB7XHJcbiAgICAgIHZhciBoYW5kbGVycyA9IFtdO1xyXG4gICAgICB2YXIgbnMgPSB0eXBlb2YgdHlwZSA9PT0gJ3N0cmluZycgPyB0eXBlLnNwbGl0KHRoaXMuZGVsaW1pdGVyKSA6IHR5cGUuc2xpY2UoKTtcclxuICAgICAgc2VhcmNoTGlzdGVuZXJUcmVlLmNhbGwodGhpcywgaGFuZGxlcnMsIG5zLCB0aGlzLmxpc3RlbmVyVHJlZSwgMCk7XHJcbiAgICAgIHJldHVybiBoYW5kbGVycztcclxuICAgIH1cclxuXHJcbiAgICB0aGlzLl9ldmVudHMgfHwgaW5pdC5jYWxsKHRoaXMpO1xyXG5cclxuICAgIGlmICghdGhpcy5fZXZlbnRzW3R5cGVdKSB0aGlzLl9ldmVudHNbdHlwZV0gPSBbXTtcclxuICAgIGlmICghaXNBcnJheSh0aGlzLl9ldmVudHNbdHlwZV0pKSB7XHJcbiAgICAgIHRoaXMuX2V2ZW50c1t0eXBlXSA9IFt0aGlzLl9ldmVudHNbdHlwZV1dO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIHRoaXMuX2V2ZW50c1t0eXBlXTtcclxuICB9O1xyXG5cclxuICBFdmVudEVtaXR0ZXIucHJvdG90eXBlLmV2ZW50TmFtZXMgPSBmdW5jdGlvbigpe1xyXG4gICAgcmV0dXJuIE9iamVjdC5rZXlzKHRoaXMuX2V2ZW50cyk7XHJcbiAgfVxyXG5cclxuICBFdmVudEVtaXR0ZXIucHJvdG90eXBlLmxpc3RlbmVyQ291bnQgPSBmdW5jdGlvbih0eXBlKSB7XHJcbiAgICByZXR1cm4gdGhpcy5saXN0ZW5lcnModHlwZSkubGVuZ3RoO1xyXG4gIH07XHJcblxyXG4gIEV2ZW50RW1pdHRlci5wcm90b3R5cGUubGlzdGVuZXJzQW55ID0gZnVuY3Rpb24oKSB7XHJcblxyXG4gICAgaWYodGhpcy5fYWxsKSB7XHJcbiAgICAgIHJldHVybiB0aGlzLl9hbGw7XHJcbiAgICB9XHJcbiAgICBlbHNlIHtcclxuICAgICAgcmV0dXJuIFtdO1xyXG4gICAgfVxyXG5cclxuICB9O1xyXG5cclxuICBpZiAodHlwZW9mIGRlZmluZSA9PT0gJ2Z1bmN0aW9uJyAmJiBkZWZpbmUuYW1kKSB7XHJcbiAgICAgLy8gQU1ELiBSZWdpc3RlciBhcyBhbiBhbm9ueW1vdXMgbW9kdWxlLlxyXG4gICAgZGVmaW5lKGZ1bmN0aW9uKCkge1xyXG4gICAgICByZXR1cm4gRXZlbnRFbWl0dGVyO1xyXG4gICAgfSk7XHJcbiAgfSBlbHNlIGlmICh0eXBlb2YgZXhwb3J0cyA9PT0gJ29iamVjdCcpIHtcclxuICAgIC8vIENvbW1vbkpTXHJcbiAgICBtb2R1bGUuZXhwb3J0cyA9IEV2ZW50RW1pdHRlcjtcclxuICB9XHJcbiAgZWxzZSB7XHJcbiAgICAvLyBCcm93c2VyIGdsb2JhbC5cclxuICAgIHdpbmRvdy5FdmVudEVtaXR0ZXIyID0gRXZlbnRFbWl0dGVyO1xyXG4gIH1cclxufSgpO1xyXG4iLCIvLyBzaGltIGZvciB1c2luZyBwcm9jZXNzIGluIGJyb3dzZXJcbnZhciBwcm9jZXNzID0gbW9kdWxlLmV4cG9ydHMgPSB7fTtcblxuLy8gY2FjaGVkIGZyb20gd2hhdGV2ZXIgZ2xvYmFsIGlzIHByZXNlbnQgc28gdGhhdCB0ZXN0IHJ1bm5lcnMgdGhhdCBzdHViIGl0XG4vLyBkb24ndCBicmVhayB0aGluZ3MuICBCdXQgd2UgbmVlZCB0byB3cmFwIGl0IGluIGEgdHJ5IGNhdGNoIGluIGNhc2UgaXQgaXNcbi8vIHdyYXBwZWQgaW4gc3RyaWN0IG1vZGUgY29kZSB3aGljaCBkb2Vzbid0IGRlZmluZSBhbnkgZ2xvYmFscy4gIEl0J3MgaW5zaWRlIGFcbi8vIGZ1bmN0aW9uIGJlY2F1c2UgdHJ5L2NhdGNoZXMgZGVvcHRpbWl6ZSBpbiBjZXJ0YWluIGVuZ2luZXMuXG5cbnZhciBjYWNoZWRTZXRUaW1lb3V0O1xudmFyIGNhY2hlZENsZWFyVGltZW91dDtcblxuZnVuY3Rpb24gZGVmYXVsdFNldFRpbW91dCgpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3NldFRpbWVvdXQgaGFzIG5vdCBiZWVuIGRlZmluZWQnKTtcbn1cbmZ1bmN0aW9uIGRlZmF1bHRDbGVhclRpbWVvdXQgKCkge1xuICAgIHRocm93IG5ldyBFcnJvcignY2xlYXJUaW1lb3V0IGhhcyBub3QgYmVlbiBkZWZpbmVkJyk7XG59XG4oZnVuY3Rpb24gKCkge1xuICAgIHRyeSB7XG4gICAgICAgIGlmICh0eXBlb2Ygc2V0VGltZW91dCA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgY2FjaGVkU2V0VGltZW91dCA9IHNldFRpbWVvdXQ7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjYWNoZWRTZXRUaW1lb3V0ID0gZGVmYXVsdFNldFRpbW91dDtcbiAgICAgICAgfVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgY2FjaGVkU2V0VGltZW91dCA9IGRlZmF1bHRTZXRUaW1vdXQ7XG4gICAgfVxuICAgIHRyeSB7XG4gICAgICAgIGlmICh0eXBlb2YgY2xlYXJUaW1lb3V0ID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICBjYWNoZWRDbGVhclRpbWVvdXQgPSBjbGVhclRpbWVvdXQ7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjYWNoZWRDbGVhclRpbWVvdXQgPSBkZWZhdWx0Q2xlYXJUaW1lb3V0O1xuICAgICAgICB9XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBjYWNoZWRDbGVhclRpbWVvdXQgPSBkZWZhdWx0Q2xlYXJUaW1lb3V0O1xuICAgIH1cbn0gKCkpXG5mdW5jdGlvbiBydW5UaW1lb3V0KGZ1bikge1xuICAgIGlmIChjYWNoZWRTZXRUaW1lb3V0ID09PSBzZXRUaW1lb3V0KSB7XG4gICAgICAgIC8vbm9ybWFsIGVudmlyb21lbnRzIGluIHNhbmUgc2l0dWF0aW9uc1xuICAgICAgICByZXR1cm4gc2V0VGltZW91dChmdW4sIDApO1xuICAgIH1cbiAgICAvLyBpZiBzZXRUaW1lb3V0IHdhc24ndCBhdmFpbGFibGUgYnV0IHdhcyBsYXR0ZXIgZGVmaW5lZFxuICAgIGlmICgoY2FjaGVkU2V0VGltZW91dCA9PT0gZGVmYXVsdFNldFRpbW91dCB8fCAhY2FjaGVkU2V0VGltZW91dCkgJiYgc2V0VGltZW91dCkge1xuICAgICAgICBjYWNoZWRTZXRUaW1lb3V0ID0gc2V0VGltZW91dDtcbiAgICAgICAgcmV0dXJuIHNldFRpbWVvdXQoZnVuLCAwKTtcbiAgICB9XG4gICAgdHJ5IHtcbiAgICAgICAgLy8gd2hlbiB3aGVuIHNvbWVib2R5IGhhcyBzY3Jld2VkIHdpdGggc2V0VGltZW91dCBidXQgbm8gSS5FLiBtYWRkbmVzc1xuICAgICAgICByZXR1cm4gY2FjaGVkU2V0VGltZW91dChmdW4sIDApO1xuICAgIH0gY2F0Y2goZSl7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICAvLyBXaGVuIHdlIGFyZSBpbiBJLkUuIGJ1dCB0aGUgc2NyaXB0IGhhcyBiZWVuIGV2YWxlZCBzbyBJLkUuIGRvZXNuJ3QgdHJ1c3QgdGhlIGdsb2JhbCBvYmplY3Qgd2hlbiBjYWxsZWQgbm9ybWFsbHlcbiAgICAgICAgICAgIHJldHVybiBjYWNoZWRTZXRUaW1lb3V0LmNhbGwobnVsbCwgZnVuLCAwKTtcbiAgICAgICAgfSBjYXRjaChlKXtcbiAgICAgICAgICAgIC8vIHNhbWUgYXMgYWJvdmUgYnV0IHdoZW4gaXQncyBhIHZlcnNpb24gb2YgSS5FLiB0aGF0IG11c3QgaGF2ZSB0aGUgZ2xvYmFsIG9iamVjdCBmb3IgJ3RoaXMnLCBob3BmdWxseSBvdXIgY29udGV4dCBjb3JyZWN0IG90aGVyd2lzZSBpdCB3aWxsIHRocm93IGEgZ2xvYmFsIGVycm9yXG4gICAgICAgICAgICByZXR1cm4gY2FjaGVkU2V0VGltZW91dC5jYWxsKHRoaXMsIGZ1biwgMCk7XG4gICAgICAgIH1cbiAgICB9XG5cblxufVxuZnVuY3Rpb24gcnVuQ2xlYXJUaW1lb3V0KG1hcmtlcikge1xuICAgIGlmIChjYWNoZWRDbGVhclRpbWVvdXQgPT09IGNsZWFyVGltZW91dCkge1xuICAgICAgICAvL25vcm1hbCBlbnZpcm9tZW50cyBpbiBzYW5lIHNpdHVhdGlvbnNcbiAgICAgICAgcmV0dXJuIGNsZWFyVGltZW91dChtYXJrZXIpO1xuICAgIH1cbiAgICAvLyBpZiBjbGVhclRpbWVvdXQgd2Fzbid0IGF2YWlsYWJsZSBidXQgd2FzIGxhdHRlciBkZWZpbmVkXG4gICAgaWYgKChjYWNoZWRDbGVhclRpbWVvdXQgPT09IGRlZmF1bHRDbGVhclRpbWVvdXQgfHwgIWNhY2hlZENsZWFyVGltZW91dCkgJiYgY2xlYXJUaW1lb3V0KSB7XG4gICAgICAgIGNhY2hlZENsZWFyVGltZW91dCA9IGNsZWFyVGltZW91dDtcbiAgICAgICAgcmV0dXJuIGNsZWFyVGltZW91dChtYXJrZXIpO1xuICAgIH1cbiAgICB0cnkge1xuICAgICAgICAvLyB3aGVuIHdoZW4gc29tZWJvZHkgaGFzIHNjcmV3ZWQgd2l0aCBzZXRUaW1lb3V0IGJ1dCBubyBJLkUuIG1hZGRuZXNzXG4gICAgICAgIHJldHVybiBjYWNoZWRDbGVhclRpbWVvdXQobWFya2VyKTtcbiAgICB9IGNhdGNoIChlKXtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIC8vIFdoZW4gd2UgYXJlIGluIEkuRS4gYnV0IHRoZSBzY3JpcHQgaGFzIGJlZW4gZXZhbGVkIHNvIEkuRS4gZG9lc24ndCAgdHJ1c3QgdGhlIGdsb2JhbCBvYmplY3Qgd2hlbiBjYWxsZWQgbm9ybWFsbHlcbiAgICAgICAgICAgIHJldHVybiBjYWNoZWRDbGVhclRpbWVvdXQuY2FsbChudWxsLCBtYXJrZXIpO1xuICAgICAgICB9IGNhdGNoIChlKXtcbiAgICAgICAgICAgIC8vIHNhbWUgYXMgYWJvdmUgYnV0IHdoZW4gaXQncyBhIHZlcnNpb24gb2YgSS5FLiB0aGF0IG11c3QgaGF2ZSB0aGUgZ2xvYmFsIG9iamVjdCBmb3IgJ3RoaXMnLCBob3BmdWxseSBvdXIgY29udGV4dCBjb3JyZWN0IG90aGVyd2lzZSBpdCB3aWxsIHRocm93IGEgZ2xvYmFsIGVycm9yLlxuICAgICAgICAgICAgLy8gU29tZSB2ZXJzaW9ucyBvZiBJLkUuIGhhdmUgZGlmZmVyZW50IHJ1bGVzIGZvciBjbGVhclRpbWVvdXQgdnMgc2V0VGltZW91dFxuICAgICAgICAgICAgcmV0dXJuIGNhY2hlZENsZWFyVGltZW91dC5jYWxsKHRoaXMsIG1hcmtlcik7XG4gICAgICAgIH1cbiAgICB9XG5cblxuXG59XG52YXIgcXVldWUgPSBbXTtcbnZhciBkcmFpbmluZyA9IGZhbHNlO1xudmFyIGN1cnJlbnRRdWV1ZTtcbnZhciBxdWV1ZUluZGV4ID0gLTE7XG5cbmZ1bmN0aW9uIGNsZWFuVXBOZXh0VGljaygpIHtcbiAgICBpZiAoIWRyYWluaW5nIHx8ICFjdXJyZW50UXVldWUpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBkcmFpbmluZyA9IGZhbHNlO1xuICAgIGlmIChjdXJyZW50UXVldWUubGVuZ3RoKSB7XG4gICAgICAgIHF1ZXVlID0gY3VycmVudFF1ZXVlLmNvbmNhdChxdWV1ZSk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgcXVldWVJbmRleCA9IC0xO1xuICAgIH1cbiAgICBpZiAocXVldWUubGVuZ3RoKSB7XG4gICAgICAgIGRyYWluUXVldWUoKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGRyYWluUXVldWUoKSB7XG4gICAgaWYgKGRyYWluaW5nKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgdmFyIHRpbWVvdXQgPSBydW5UaW1lb3V0KGNsZWFuVXBOZXh0VGljayk7XG4gICAgZHJhaW5pbmcgPSB0cnVlO1xuXG4gICAgdmFyIGxlbiA9IHF1ZXVlLmxlbmd0aDtcbiAgICB3aGlsZShsZW4pIHtcbiAgICAgICAgY3VycmVudFF1ZXVlID0gcXVldWU7XG4gICAgICAgIHF1ZXVlID0gW107XG4gICAgICAgIHdoaWxlICgrK3F1ZXVlSW5kZXggPCBsZW4pIHtcbiAgICAgICAgICAgIGlmIChjdXJyZW50UXVldWUpIHtcbiAgICAgICAgICAgICAgICBjdXJyZW50UXVldWVbcXVldWVJbmRleF0ucnVuKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcXVldWVJbmRleCA9IC0xO1xuICAgICAgICBsZW4gPSBxdWV1ZS5sZW5ndGg7XG4gICAgfVxuICAgIGN1cnJlbnRRdWV1ZSA9IG51bGw7XG4gICAgZHJhaW5pbmcgPSBmYWxzZTtcbiAgICBydW5DbGVhclRpbWVvdXQodGltZW91dCk7XG59XG5cbnByb2Nlc3MubmV4dFRpY2sgPSBmdW5jdGlvbiAoZnVuKSB7XG4gICAgdmFyIGFyZ3MgPSBuZXcgQXJyYXkoYXJndW1lbnRzLmxlbmd0aCAtIDEpO1xuICAgIGlmIChhcmd1bWVudHMubGVuZ3RoID4gMSkge1xuICAgICAgICBmb3IgKHZhciBpID0gMTsgaSA8IGFyZ3VtZW50cy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgYXJnc1tpIC0gMV0gPSBhcmd1bWVudHNbaV07XG4gICAgICAgIH1cbiAgICB9XG4gICAgcXVldWUucHVzaChuZXcgSXRlbShmdW4sIGFyZ3MpKTtcbiAgICBpZiAocXVldWUubGVuZ3RoID09PSAxICYmICFkcmFpbmluZykge1xuICAgICAgICBydW5UaW1lb3V0KGRyYWluUXVldWUpO1xuICAgIH1cbn07XG5cbi8vIHY4IGxpa2VzIHByZWRpY3RpYmxlIG9iamVjdHNcbmZ1bmN0aW9uIEl0ZW0oZnVuLCBhcnJheSkge1xuICAgIHRoaXMuZnVuID0gZnVuO1xuICAgIHRoaXMuYXJyYXkgPSBhcnJheTtcbn1cbkl0ZW0ucHJvdG90eXBlLnJ1biA9IGZ1bmN0aW9uICgpIHtcbiAgICB0aGlzLmZ1bi5hcHBseShudWxsLCB0aGlzLmFycmF5KTtcbn07XG5wcm9jZXNzLnRpdGxlID0gJ2Jyb3dzZXInO1xucHJvY2Vzcy5icm93c2VyID0gdHJ1ZTtcbnByb2Nlc3MuZW52ID0ge307XG5wcm9jZXNzLmFyZ3YgPSBbXTtcbnByb2Nlc3MudmVyc2lvbiA9ICcnOyAvLyBlbXB0eSBzdHJpbmcgdG8gYXZvaWQgcmVnZXhwIGlzc3Vlc1xucHJvY2Vzcy52ZXJzaW9ucyA9IHt9O1xuXG5mdW5jdGlvbiBub29wKCkge31cblxucHJvY2Vzcy5vbiA9IG5vb3A7XG5wcm9jZXNzLmFkZExpc3RlbmVyID0gbm9vcDtcbnByb2Nlc3Mub25jZSA9IG5vb3A7XG5wcm9jZXNzLm9mZiA9IG5vb3A7XG5wcm9jZXNzLnJlbW92ZUxpc3RlbmVyID0gbm9vcDtcbnByb2Nlc3MucmVtb3ZlQWxsTGlzdGVuZXJzID0gbm9vcDtcbnByb2Nlc3MuZW1pdCA9IG5vb3A7XG5wcm9jZXNzLnByZXBlbmRMaXN0ZW5lciA9IG5vb3A7XG5wcm9jZXNzLnByZXBlbmRPbmNlTGlzdGVuZXIgPSBub29wO1xuXG5wcm9jZXNzLmxpc3RlbmVycyA9IGZ1bmN0aW9uIChuYW1lKSB7IHJldHVybiBbXSB9XG5cbnByb2Nlc3MuYmluZGluZyA9IGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdwcm9jZXNzLmJpbmRpbmcgaXMgbm90IHN1cHBvcnRlZCcpO1xufTtcblxucHJvY2Vzcy5jd2QgPSBmdW5jdGlvbiAoKSB7IHJldHVybiAnLycgfTtcbnByb2Nlc3MuY2hkaXIgPSBmdW5jdGlvbiAoZGlyKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdwcm9jZXNzLmNoZGlyIGlzIG5vdCBzdXBwb3J0ZWQnKTtcbn07XG5wcm9jZXNzLnVtYXNrID0gZnVuY3Rpb24oKSB7IHJldHVybiAwOyB9O1xuIiwiaW1wb3J0ICcuL2pzL21vZHVsZXMvZ2xvYmFsJztcbmltcG9ydCAnLi9qcy9tb2R1bGVzL2NvbmZpZyc7XG5pbXBvcnQgJy4vanMvbW9kdWxlcy91dGlscyc7XG5pbXBvcnQgJy4vanMvbW9kdWxlcy9oYW5kbGVDbGlja3MnO1xuaW1wb3J0ICcuL2pzL21vZHVsZXMvc2lkZWJhcic7XG5pbXBvcnQgJy4vanMvbW9kdWxlcy9kcm9wbGV0JztcbmltcG9ydCAnLi9qcy9tb2R1bGVzL3lvdXR1YmUnO1xuLy9pbXBvcnQgJy4vanMvbW9kdWxlcy9jYW5JVXNlRGF0YSc7XG4vL2ltcG9ydCAnLi9qcy9tb2R1bGVzL2lucHV0Jztcbi8vaW1wb3J0ICcuL2pzL21vZHVsZXMvd2VpcmRDYXNlJztcbi8vaW1wb3J0ICcuL2pzL21vZHVsZXMvcmFuZG9tTmFtZXMnO1xuXG5cblxuXG4iLCJjb25zdCBjb25maWcgPSBKQy5jb25maWcgPSB7fTtcbiAgY29uZmlnLnByb2plY3QgPSAnanVzdHluQ2xhcmstbmV3JztcbiAgY29uZmlnLmRldmVsb3BlciA9ICdqdXN0eW4gY2xhcmsnO1xuICBjb25maWcudmVyc2lvbiA9IFwiMS4wLjBcIjtcblxuIiwidmFyIGNvb2tpZU1hcDtcbi8vIENvb2tpZXNcbkpDLnV0aWxzLmdldENvb2tpZXMgPSB1cGRhdGUgPT4geyAvLyBHZXQgY29va2llc1xuICBpZighY29va2llTWFwIHx8IHVwZGF0ZSkge1xuICAgIGNvb2tpZU1hcCA9IHt9O1xuICAgIHZhciBpLCBjb29raWVzID0gZG9jdW1lbnQuY29va2llLnNwbGl0KFwiO1wiKTtcbiAgICBmb3IgKGkgPSAwOyBpIDwgY29va2llcy5sZW5ndGg7IGkrKykge1xuICAgICAgdmFyIGluZGV4ID0gY29va2llc1tpXS5pbmRleE9mKCc9Jyk7XG4gICAgICB2YXIgeCA9IGNvb2tpZXNbaV0uc3Vic3RyKDAsIGluZGV4KTtcbiAgICAgIHZhciB5ID0gY29va2llc1tpXS5zdWJzdHIoaW5kZXggKyAxKTtcbiAgICAgIHggPSB4LnJlcGxhY2UoL15cXHMrfFxccyskL2csICcnKTtcbiAgICAgIGlmKHgpIGNvb2tpZU1hcFt4XSA9IGRlY29kZVVSSSh5KTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIGNvb2tpZU1hcDtcbn07XG5cbkpDLnV0aWxzLmdldENvb2tpZSA9IChjLCB1cGRhdGUpID0+IHsgLy8gR2V0IGNvb2tpZVxuICByZXR1cm4gdGhpcy5nZXRDb29raWVzKHVwZGF0ZSlbY107XG59O1xuXG5KQy51dGlscy5zZXRDb29raWUgPSAobmFtZSwgdmFsdWUsIG9wdHMpID0+IHsgLy8gU2V0IGNvb2tpZSBKQy51dGlscy5zZXRDb29raWUoJ2pjQ29va2llJyx0cnVlLCB7ZXhwaXJlRGF0ZTogKDM2MDAgKiAyNCAqIDM2NSl9KTtcbiAgdmFyIHZhbHVlID0gZW5jb2RlVVJJKHZhbHVlKTtcbiAgb3B0cyA9IG9wdHMgfHwge307XG4gIHZhbHVlICs9IFwiO3BhdGg9XCIgKyAob3B0cy5wYXRoIHx8IFwiL1wiKTtcbiAgaWYob3B0cy5kb21haW4pIHZhbHVlICs9IFwiO2RvbWFpbj1cIiArIG9wdHMuZG9tYWluO1xuICB2YXIgdCA9IHR5cGVvZiBvcHRzLm1heEFnZTtcbiAgaWYodCA9PSBcIm51bWJlclwiIHx8IHQgPT0gXCJzdHJpbmdcIikgdmFsdWUgKz0gXCI7bWF4LWFnZT1cIiArIG9wdHMubWF4QWdlO1xuICB2YXIgZSA9IG9wdHMuZXhwaXJlRGF0ZTtcbiAgaWYodHlwZW9mIGUgPT0gXCJudW1iZXJcIikgZSA9IG5ldyBEYXRlKChuZXcgRGF0ZSgpKS5nZXRUaW1lKCkgKyBlICogMTAwMCk7XG4gIGlmKGUpIHZhbHVlICs9ICc7ZXhwaXJlcz0nICsgZS50b1VUQ1N0cmluZygpO1xuICBpZihvcHRzLnNlY3VyZSkgdmFsdWUgKz0gXCI7c2VjdXJlXCI7XG4gIGRvY3VtZW50LmNvb2tpZSA9IG5hbWUgKyAnPScgKyB2YWx1ZTtcbiAgY29va2llTWFwID0gbnVsbDtcbn07XG5cbnNldFRpbWVvdXQoKCk9PiB7XG4gIGlmICghZG9jdW1lbnQuY29va2llLm1hdGNoKCdqY0Nvb2tpZScpKSB7XG4gICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLmNvb2tpZS1wb2xpY3knKS5jbGFzc0xpc3QuYWRkKCdjb29raWUtcG9saWN5LS1zaG93Jyk7XG4gIH0gZWxzZSB7XG4gICAgY29uc29sZS5sb2coJ2Nvb2tpZSBwb2xpY3kgaXMgaGlkZGVuJyk7XG4gICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLmNvb2tpZS1wb2xpY3knKS5jbGFzc0xpc3QuYWRkKCdjb29raWUtcG9saWN5LS1oaWRlJyk7XG4gIH1cbn0sMTAwMCk7XG5cbmV4cG9ydCBmdW5jdGlvbiBzZXRQb2xpY3lDb29raWUoKSB7XG4gIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5jb29raWUtcG9saWN5JykuY2xhc3NMaXN0LmFkZCgnY29va2llLXBvbGljeS0taGlkZScpO1xuICBjb25zb2xlLmxvZygnY29va2llIHNldCcpO1xuICBKQy51dGlscy5zZXRDb29raWUoJ2pjQ29va2llJywgdHJ1ZSwge2V4cGlyZURhdGU6ICgzNjAwICogMjQgKiAzNjUpfSk7XG59XG4iLCIoZnVuY3Rpb24oKSB7XG4gIHZhciBkcm9wbGV0ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLmRyb3BsZXQnKVxuICBkcm9wbGV0LnN0eWxlLm9wYWNpdHkgPSAwXG4gIGZ1bmN0aW9uIGZhZGVJbkRyb3BsZXQoKSB7XG4gICAgc2V0VGltZW91dChmdW5jdGlvbigpIHtcbiAgICAgIGRyb3BsZXQuc3R5bGUub3BhY2l0eSA9IDFcbiAgICB9LCAyMDAwKVxuICB9XG4gIEVWVC5vbignaW5pdCcsIGZhZGVJbkRyb3BsZXQpXG59KSgpO1xuIiwiaW1wb3J0IEV2ZW50RW1pdHRlcjIgZnJvbSAnZXZlbnRlbWl0dGVyMic7XG5cbihmdW5jdGlvbihnbG9iYWwpe1xuXG4gIGdsb2JhbC5KQyA9IGdsb2JhbC5KQyAhPT0gdW5kZWZpbmVkID8gSkMgOiB7fTsgLy8gRGVjbGFyZSBHbG9iYWwgT2JqZWN0XG4gIGdsb2JhbC5FVlQgPSBuZXcgRXZlbnRFbWl0dGVyMigpO1xuXG4gIEpDLmNvbXBvbmVudHMgPSB7fTtcbiAgSkMuY29uZmlnID0ge307XG4gIEpDLm1lbnUgPSB7fTtcbiAgSkMudXRpbHMgPSB7fTtcblxuICBnbG9iYWwuYWRkRXZlbnRMaXN0ZW5lcignRE9NQ29udGVudExvYWRlZCcsIGZ1bmN0aW9uKCkge1xuICAgIEVWVC5lbWl0KCdpbml0Jyk7XG4gIH0pO1xuXG4gIGNvbnNvbGUubG9nKEpDKTtcblxufSkod2luZG93KTtcbiIsImltcG9ydCB7IHNldFBvbGljeUNvb2tpZSB9IGZyb20gJy4vY29va2llcyc7XG5pbXBvcnQgJy4veW91dHViZSc7XG5cblxuZXhwb3J0IGZ1bmN0aW9uIHBsYXkoKSB7XG4gIHZhciB2aWRlb3MgPSByYW5kVHViZVZpZCgpO1xuICB2YXIgdmlkZW9JRCA9IHZpZGVvc1tKQy51dGlscy5yYW5kb21OdW1iZXIodmlkZW9zLmxlbmd0aCldO1xuICB2YXIgdmlkZW8gPSBKQy51dGlscy55b3VUdWJlUGxheWVyKHZpZGVvSUQpO1xuICB2aWRlbygpO1xufTtcblxuZnVuY3Rpb24gcmFuZFR1YmVWaWQoKSB7XG4gIHZhciB2aWRMaXN0ID0gW107XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgSkMudXRpbHMuZGF0YS5pdGVtcy5sZW5ndGg7IGkrKykge1xuICAgIHZpZExpc3RbaV0gPSBKQy51dGlscy5kYXRhLml0ZW1zW2ldLmNvbnRlbnREZXRhaWxzLnZpZGVvSWQ7XG4gIH1cbiAgcmV0dXJuIHZpZExpc3Q7XG59O1xuXG5cbi8vIFNldCB1cCBjbGljayBoYW5kbGVyc1xuZnVuY3Rpb24gY2xpY2tIYW5kbGVycygpIHtcblxuICB2YXIgaGVhZGVyID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLmhlYWRlcicpO1xuICB2YXIgY29udGVudDEgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcubG9nbycpO1xuICB2YXIgYm9keSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ2JvZHknKTtcbiAgdmFyIG9wZW5PdmVybGF5ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignW3JlbD1cIjFcIl0nKTtcbiAgdmFyIG92ZXJsYXkgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcub3ZlcmxheScpXG4gIC8vZG9jdW1lbnQucXVlcnlTZWxlY3RvcignW3JlbD1cIm1haW5fX2xvYWROYW1lc1wiXScpLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgbG9hZE5hbWVzKTtcbiAgLypkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbcmVsPVwibWFpbl9fY2xpY2tlclwiXScpLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgZnVuY3Rpb24oKSB7XG4gICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcignW3JlbD1cIm1haW5fX2NsaWNrZXJcIl0nKS5pbm5lckhUTUwgPSBhZGRlcigpO1xuICB9KTsqL1xuXG4gIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5jb29raWUtcG9saWN5X19jbG9zZScpLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgc2V0UG9saWN5Q29va2llKTsgLy8gQ29va2llIFBvbGljeVxuICBvdmVybGF5LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgSkMudXRpbHMuY2xvc2VPdmVybGF5KTsgLy8gY2xvc2Ugb3ZlcmxheVxuICBvcGVuT3ZlcmxheS5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIEpDLnV0aWxzLm9wZW5PdmVybGF5KTsgLy8gb3BlbiBvdmVybGF5XG4gIG9wZW5PdmVybGF5LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgcGxheSk7IC8vIG9wZW4gb3ZlcmxheVxuICBjb250ZW50MS5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIGZ1bmN0aW9uICgpIHtcbiAgICBoZWFkZXIuY2xhc3NMaXN0LnRvZ2dsZSgnLS1vcGVuJyk7XG4gICAgYm9keS5jbGFzc0xpc3QudG9nZ2xlKCdvdmVybGF5LS1vcGVuJyk7XG4gIH0pXG59XG5cbkVWVC5vbignaW5pdCcsIGNsaWNrSGFuZGxlcnMpO1xuXG4iLCIoZnVuY3Rpb24oSkMpIHtcblxuICB2YXIgc2lkZWJhciA9IEpDLmNvbXBvbmVudHMuc2lkZWJhciA9IHt9XG5cbiAgY29uc3QgZiA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5zaWRlYmFyJyk7XG5cbiAgc2lkZWJhci5vcGVuU2lkZWJhciA9IGZ1bmN0aW9uKCkge1xuICAgIGYuY2xhc3NMaXN0LmFkZCgnc2lkZWJhci0tb3BlbicpO1xuICB9XG4gIHNpZGViYXIuY2xvc2VTaWRlYmFyID0gZnVuY3Rpb24oKSB7XG4gICAgZi5jbGFzc0xpc3QucmVtb3ZlKCdzaWRlYmFyLS1vcGVuJyk7XG4gIH07XG5cbiAgc2lkZWJhci5kZWxheSA9IGZ1bmN0aW9uKGNhbGxiYWNrLCB0aW1lKSB7XG4gICAgc2V0VGltZW91dChjYWxsYmFjaywgdGltZSlcbiAgfTtcblxuICBzaWRlYmFyLmludGVydmFsID0gZnVuY3Rpb24oY2FsbGJhY2ssIHRpbWUpIHtcbiAgICBzZXRJbnRlcnZhbChjYWxsYmFjaywgdGltZSlcbiAgfTtcblxuICBzaWRlYmFyLnNsaWRlVG9nZ2xlID0gZnVuY3Rpb24oKSB7XG4gICAgZi5jbGFzc0xpc3QudG9nZ2xlKCdzaWRlYmFyLS1vcGVuJyk7XG4gIH07XG5cbiAgc2lkZWJhci5pbml0ID0gZnVuY3Rpb24oKSB7XG4gICAgLy9zaWRlYmFyLmludGVydmFsKHNpZGViYXIuc2xpZGVUb2dnbGUsIDIwMDApO1xuICAgIHNpZGViYXIuZGVsYXkoc2lkZWJhci5vcGVuU2lkZWJhciwgMjAwMCk7XG4gIH07XG5cbiAgRVZULm9uKCdpbml0Jywgc2lkZWJhci5pbml0KTtcblxufSkoSkMpO1xuIiwiaW1wb3J0ICcuL2Nvb2tpZXMnO1xuXG5KQy51dGlscy5hZGRlciA9ICgpPT4ge1xuICB2YXIgcGx1cyA9IGZ1bmN0aW9uKCkge1xuICAgIHZhciBjb3VudGVyID0gMDtcbiAgICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgICByZXR1cm4gY291bnRlcisrXG4gICAgfVxuICB9XG4gIHJldHVybiBwbHVzKClcbn1cblxuLy8gdGhpcyBjaGVja2VyXG5KQy51dGlscy50aGlzQ2hlY2sgPSBmdW5jdGlvbigpIHtcbiAgY29uc29sZS5sb2codGhpcyk7XG59XG5cbkpDLnV0aWxzLnJhbmRvbU51bWJlciA9IGZ1bmN0aW9uKGxlbikge1xuICByZXR1cm4gTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogbGVuKVxufTtcblxuSkMudXRpbHMub3V0cHV0ID0gZnVuY3Rpb24oeCkge1xuICBjb25zb2xlLmxvZyh4KTtcbn1cblxuLy8gQ2hhcmFjdGVyIGNvdW50IGluIEVsZW1lbnRcbkpDLnV0aWxzLmNoYXJzSW5FbGVtZW50ID0gZWxtID0+IHtcbiAgaWYgKGVsbS5ub2RlVHlwZSA9PSAzKSB7IC8vIFRFWFRfTk9ERVxuICAgIHJldHVybiBlbG0ubm9kZVZhbHVlLmxlbmd0aDtcbiAgfVxuICB2YXIgY291bnQgPSAwO1xuICBmb3IgKHZhciBpID0gMCwgY2hpbGQ7IGNoaWxkID0gZWxtLmNoaWxkTm9kZXNbaV07IGkrKykge1xuICAgIGNvdW50ICs9IEpDLnV0aWxzLmNoYXJzSW5FbGVtZW50KGNoaWxkKTtcbiAgfVxuICByZXR1cm4gY291bnQ7XG59XG5cbi8vIEFsZXJ0IHV0aWxpdHlcbkpDLnV0aWxzLmFsZXJ0ID0gYSA9PiB7XG4gIGFsZXJ0KGEpO1xufVxuXG5KQy51dGlscy5zaG93Qm9keUNoYXJOdW0gPSAoKSA9PiB7XG4gIHZhciBlbG0gPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdib2R5Jyk7XG4gIGNvbnNvbGUubG9nKFwiVGhpcyBwYWdlIGhhcyBcIiArIEpDLnV0aWxzLmNoYXJzSW5FbGVtZW50KGVsbSkgKyBcIiBjaGFyYWN0ZXJzIGluIHRoZSBib2R5XCIpO1xufTtcblxuSkMudXRpbHMub3Blbk92ZXJsYXkgPSAoKSA9PiAge1xuICB2YXIgb3ZlcmxheSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5vdmVybGF5Jyk7XG4gIHZhciBib2R5ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignYm9keScpO1xuICB2YXIgb3ZlcmxheUlubmVyID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLm92ZXJsYXlfX2lubmVyJyk7XG4gIG92ZXJsYXkuY2xhc3NMaXN0LnRvZ2dsZSgnb3ZlcmxheS0tb3BlbicpO1xuICBib2R5LmNsYXNzTGlzdC5hZGQoJ292ZXJsYXktLW9wZW4nKTtcbiAgb3ZlcmxheUlubmVyLmNsYXNzTGlzdC5hZGQoJ292ZXJsYXktLW9wZW4nKTtcbn1cblxuSkMudXRpbHMuY2xvc2VPdmVybGF5ID0gKCkgPT4gIHtcbiAgdmFyIG92ZXJsYXkgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcub3ZlcmxheScpO1xuICB2YXIgYm9keSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ2JvZHknKTtcbiAgdmFyIG92ZXJsYXlJbm5lciA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5vdmVybGF5X19pbm5lcicpO1xuICB2YXIgdmlkID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLnZpZGVvX193cmFwJyk7XG5cbiAgICAgIG92ZXJsYXkuY2xhc3NMaXN0LnRvZ2dsZSgnb3ZlcmxheS0tb3BlbicpO1xuICAgICAgYm9keS5jbGFzc0xpc3QudG9nZ2xlKCdvdmVybGF5LS1vcGVuJyk7XG4gICAgICBvdmVybGF5SW5uZXIuY2xhc3NMaXN0LnRvZ2dsZSgnb3ZlcmxheS0tb3BlbicpO1xuXG4gICAgICB2aWQucmVtb3ZlKCk7XG59XG5cbkpDLnV0aWxzLnlvdVR1YmVQbGF5ZXIgPSAoaWQpID0+IHtcbiAgICByZXR1cm4gZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgYm9keSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ2JvZHknKTtcbiAgICAgICAgdmFyIHZpZGVvX193cmFwID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgICAgIHZhciB2aWRlb1dyYXBwZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICAgICAgdmFyIGlmcmFtZURpdiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2lGcmFtZScpO1xuICAgICAgICBpZnJhbWVEaXYuc2V0QXR0cmlidXRlKCdkYXRhLXlvdXR1YmUtaWQnLCBpZCk7XG4gICAgICAgIGlmcmFtZURpdi5zZXRBdHRyaWJ1dGUoJ3NyYycsICdodHRwczovL3d3dy55b3V0dWJlLmNvbS9lbWJlZC8nICsgaWQgKyAnP3JlbD0wJmFtcDtjb250cm9scz0wJmFtcCcpO1xuICAgICAgICB2aWRlb19fd3JhcC5zZXRBdHRyaWJ1dGUoJ2NsYXNzJywgJ3ZpZGVvX193cmFwJyk7XG4gICAgICAgIHZpZGVvV3JhcHBlci5zZXRBdHRyaWJ1dGUoJ2NsYXNzJywgJ3ZpZGVvV3JhcHBlcicpO1xuICAgICAgICB2aWRlb19fd3JhcC5hcHBlbmRDaGlsZCh2aWRlb1dyYXBwZXIpO1xuICAgICAgICB2aWRlb1dyYXBwZXIuYXBwZW5kQ2hpbGQoaWZyYW1lRGl2KTtcbiAgICAgICAgYm9keS5hcHBlbmRDaGlsZCh2aWRlb19fd3JhcCk7XG4gICAgICAgIGNvbnNvbGUubG9nKCdyZXR1cm4nKTtcbiAgICAgIH1cbn07XG5cbmV4cG9ydCBmdW5jdGlvbiByYW5kTnVtR2VuKG1heCkge1xuICByZXR1cm4gTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogbWF4KVxufTtcblxuLyo8aWZyYW1lIHdpZHRoPVwiMTI4MFwiIGhlaWdodD1cIjcyMFwiIHNyYz1cImh0dHBzOi8vd3d3LnlvdXR1YmUuY29tL2VtYmVkL1JLWWpkVGlNa1hNP3JlbD0wJmFtcDtjb250cm9scz0wJmFtcDtzaG93aW5mbz0wXCIgZnJhbWVib3JkZXI9XCIwXCIgYWxsb3dmdWxsc2NyZWVuPVwiXCI+PC9pZnJhbWU+Ki9cbiIsIkpDLnV0aWxzLmRhdGEgPSB7XG4gIFwia2luZFwiOiBcInlvdXR1YmUjcGxheWxpc3RJdGVtTGlzdFJlc3BvbnNlXCIsXG4gIFwiZXRhZ1wiOiBcIlxcXCJjYnozbElRMk4yNUFmd05yLUJkeFVWeEpfUVkvaGxjZ0lYREFEQy1xMUZJMUdQc0tLTnZvdmFNXFxcIlwiLFxuICBcIm5leHRQYWdlVG9rZW5cIjogXCJDQmtRQUFcIixcbiAgXCJwYWdlSW5mb1wiOiB7XG4gICAgXCJ0b3RhbFJlc3VsdHNcIjogNDEsXG4gICAgXCJyZXN1bHRzUGVyUGFnZVwiOiAyNVxuICB9LFxuICBcIml0ZW1zXCI6IFtcbiAgICB7XG4gICAgICBcImtpbmRcIjogXCJ5b3V0dWJlI3BsYXlsaXN0SXRlbVwiLFxuICAgICAgXCJldGFnXCI6IFwiXFxcImNiejNsSVEyTjI1QWZ3TnItQmR4VVZ4Sl9RWS9CbmlaV2w2VXJGMno2MUMzQjB0dk50ckJqRGdcXFwiXCIsXG4gICAgICBcImlkXCI6IFwiVUV4UllVcEVkMHhZZVVKMFdISXhSbVV5UmxKNlNXUlVNMUpHWlVjMU1sRldSaTQxTmtJME5FWTJSREV3TlRVM1EwTTJcIixcbiAgICAgIFwic25pcHBldFwiOiB7XG4gICAgICAgIFwicHVibGlzaGVkQXRcIjogXCIyMDE1LTAyLTE4VDA1OjU3OjMxLjAwMFpcIixcbiAgICAgICAgXCJjaGFubmVsSWRcIjogXCJVQ1ZNNEMxZkI5UWN3eTdkTmpiWGVVVndcIixcbiAgICAgICAgXCJ0aXRsZVwiOiBcIkxlYXJuaW5nIGhvdyB0byB1c2UgalF1ZXJ5IEFKQVggd2l0aCBQSFBcIixcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkdldHRpbmcgc3RhcnRlZCB3aXRoIEFKQVggaXMgc3VwZXIgZWFzeSB3aGVuIHlvdSB1c2UgdGhlIGpRdWVyeSBsaWJyYXJ5LiBUaGF0IHdvcmtzIHdlbGwgZm9yIHRoZSBjbGllbnQgc2lkZSwgYnV0IGhvdyBkbyB5b3Ugd29yayB3aXRoIGEgc2VydmVyIHNpZGUgbGFuZ3VhZ2UgbGlrZSBQSFA/IEl0J3MgZWFzaWVyIHRoYW4geW91IHRoaW5rLlwiLFxuICAgICAgICBcInRodW1ibmFpbHNcIjoge1xuICAgICAgICAgIFwiZGVmYXVsdFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvVFIwZ2tHYk13VzAvZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogMTIwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogOTBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwibWVkaXVtXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9UUjBna0diTXdXMC9tcWRlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDMyMCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDE4MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJoaWdoXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9UUjBna0diTXdXMC9ocWRlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDQ4MCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDM2MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJzdGFuZGFyZFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvVFIwZ2tHYk13VzAvc2RkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiA2NDAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiA0ODBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwibWF4cmVzXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9UUjBna0diTXdXMC9tYXhyZXNkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiAxMjgwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogNzIwXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcImNoYW5uZWxUaXRsZVwiOiBcIkp1c3R5biBDbGFya1wiLFxuICAgICAgICBcInBsYXlsaXN0SWRcIjogXCJQTFFhSkR3TFh5QnRYcjFGZTJGUnpJZFQzUkZlRzUyUVZGXCIsXG4gICAgICAgIFwicG9zaXRpb25cIjogMCxcbiAgICAgICAgXCJyZXNvdXJjZUlkXCI6IHtcbiAgICAgICAgICBcImtpbmRcIjogXCJ5b3V0dWJlI3ZpZGVvXCIsXG4gICAgICAgICAgXCJ2aWRlb0lkXCI6IFwiVFIwZ2tHYk13VzBcIlxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgXCJjb250ZW50RGV0YWlsc1wiOiB7XG4gICAgICAgIFwidmlkZW9JZFwiOiBcIlRSMGdrR2JNd1cwXCIsXG4gICAgICAgIFwidmlkZW9QdWJsaXNoZWRBdFwiOiBcIjIwMTMtMDEtMDFUMDI6MzU6NTAuMDAwWlwiXG4gICAgICB9XG4gICAgfSxcbiAgICB7XG4gICAgICBcImtpbmRcIjogXCJ5b3V0dWJlI3BsYXlsaXN0SXRlbVwiLFxuICAgICAgXCJldGFnXCI6IFwiXFxcImNiejNsSVEyTjI1QWZ3TnItQmR4VVZ4Sl9RWS9yQVhFYW54YnNLVlVJQmVqWmc1Zm1zaVd5WGNcXFwiXCIsXG4gICAgICBcImlkXCI6IFwiVUV4UllVcEVkMHhZZVVKMFdISXhSbVV5UmxKNlNXUlVNMUpHWlVjMU1sRldSaTR5T0RsR05FRTBOa1JHTUVFek1FUXlcIixcbiAgICAgIFwic25pcHBldFwiOiB7XG4gICAgICAgIFwicHVibGlzaGVkQXRcIjogXCIyMDE1LTAyLTI3VDE4OjM2OjQ5LjAwMFpcIixcbiAgICAgICAgXCJjaGFubmVsSWRcIjogXCJVQ1ZNNEMxZkI5UWN3eTdkTmpiWGVVVndcIixcbiAgICAgICAgXCJ0aXRsZVwiOiBcIkdpdGh1YiBUdXRvcmlhbCBGb3IgQmVnaW5uZXJzIC0gR2l0aHViIEJhc2ljcyBmb3IgTWFjIG9yIFdpbmRvd3MgJiBTb3VyY2UgQ29udHJvbCBCYXNpY3NcIixcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkdpdGh1YiBUdXRvcmlhbCBGb3IgQmVnaW5uZXJzIC0gbGVhcm4gR2l0aHViIGZvciBNYWMgb3IgR2l0aHViIGZvciB3aW5kb3dzXFxuSWYgeW91J3ZlIGJlZW4gd2FudGluZyB0byBsZWFybiBHaXRodWIsIG5vdydzIHRoZSBwZXJmZWN0IHRpbWUhICBHaXRodWIgaXMgc2VlbiBhcyBhIGJpZyByZXF1aXJlbWVudCBieSBtb3N0IGVtcGxveWVycyB0aGVzZSBkYXlzIGFuZCBpcyB2ZXJ5IGNyaXRpY2FsIHRvIGJ1c2luZXNzIHdvcmtmbG93LiAgVGhpcyBHaXRodWIgdHV0b3JpYWwgd2lsbCBjb3ZlciB0aGUgYmFzaWNzIG9mIGhvdyB0byB1c2UgR2l0aHViIGFuZCB0aGUgY29tbWFuZCBsaW5lLlxcblxcbkxlc3NvbiAjMjogUHVsbCByZXF1ZXN0cywgQnJhbmNoaW5nIG1lcmdpbmdcXG5odHRwczovL3d3dy55b3V0dWJlLmNvbS93YXRjaD92PW9GWXlUWndNeUFnXFxuXFxuT3RoZXIgVmlkZW9zOlxcbmpRdWVyeSByYXBpZC1sZWFybmluZyBDb3Vyc2VcXG5odHRwczovL3d3dy55b3V0dWJlLmNvbS93YXRjaD92PWhNeEdoSE5Pa0NVXCIsXG4gICAgICAgIFwidGh1bWJuYWlsc1wiOiB7XG4gICAgICAgICAgXCJkZWZhdWx0XCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS8wZktnN2UzN2JRRS9kZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiAxMjAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiA5MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJtZWRpdW1cIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpLzBmS2c3ZTM3YlFFL21xZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogMzIwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogMTgwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImhpZ2hcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpLzBmS2c3ZTM3YlFFL2hxZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogNDgwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogMzYwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInN0YW5kYXJkXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS8wZktnN2UzN2JRRS9zZGRlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDY0MCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDQ4MFxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJjaGFubmVsVGl0bGVcIjogXCJKdXN0eW4gQ2xhcmtcIixcbiAgICAgICAgXCJwbGF5bGlzdElkXCI6IFwiUExRYUpEd0xYeUJ0WHIxRmUyRlJ6SWRUM1JGZUc1MlFWRlwiLFxuICAgICAgICBcInBvc2l0aW9uXCI6IDEsXG4gICAgICAgIFwicmVzb3VyY2VJZFwiOiB7XG4gICAgICAgICAgXCJraW5kXCI6IFwieW91dHViZSN2aWRlb1wiLFxuICAgICAgICAgIFwidmlkZW9JZFwiOiBcIjBmS2c3ZTM3YlFFXCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwiY29udGVudERldGFpbHNcIjoge1xuICAgICAgICBcInZpZGVvSWRcIjogXCIwZktnN2UzN2JRRVwiLFxuICAgICAgICBcInZpZGVvUHVibGlzaGVkQXRcIjogXCIyMDE0LTAxLTE2VDIwOjA1OjI3LjAwMFpcIlxuICAgICAgfVxuICAgIH0sXG4gICAge1xuICAgICAgXCJraW5kXCI6IFwieW91dHViZSNwbGF5bGlzdEl0ZW1cIixcbiAgICAgIFwiZXRhZ1wiOiBcIlxcXCJjYnozbElRMk4yNUFmd05yLUJkeFVWeEpfUVkvQmVGdTdrVWFTSkhIOWpHOFAzRTdrRGd4VEFFXFxcIlwiLFxuICAgICAgXCJpZFwiOiBcIlVFeFJZVXBFZDB4WWVVSjBXSEl4Um1VeVJsSjZTV1JVTTFKR1pVYzFNbEZXUmk0d01UY3lNRGhHUVVFNE5USXpNMFk1XCIsXG4gICAgICBcInNuaXBwZXRcIjoge1xuICAgICAgICBcInB1Ymxpc2hlZEF0XCI6IFwiMjAxNS0wMy0wMlQyMjo0NzowOC4wMDBaXCIsXG4gICAgICAgIFwiY2hhbm5lbElkXCI6IFwiVUNWTTRDMWZCOVFjd3k3ZE5qYlhlVVZ3XCIsXG4gICAgICAgIFwidGl0bGVcIjogXCJBbmd1bGFySlMgVHV0b3JpYWxcIixcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkEgdmlkZW8gdHV0b3JpYWwgdG8gaGVscCB5b3UgZ2V0IHN0YXJ0ZWQgd2l0aCBBbmd1bGFySlMuIFlvdSBjYW4gcGxheSBhcm91bmQgd2l0aCB0aGUgZmluYWwgcmVzdWx0IGluIHRoZSBmb2xsb3dpbmcganNmaWRkbGU6XFxuXFxuaHR0cDovL2pzZmlkZGxlLm5ldC9qb2hubGluZHF1aXN0L1UzYzJRL1xcblxcblBsZWFzZSB0YWtlIGFueSB0ZWNobmljYWwgcXVlc3Rpb25zIGFib3V0IEFuZ3VsYXJKUyB0byB0aGUgdmVyeSBhY3RpdmUgYW5kIGhlbHBmdWwgQW5ndWxhckpTIG1haWxpbmcgbGlzdDpcXG5odHRwczovL2dyb3Vwcy5nb29nbGUuY29tL2ZvcnVtLz9mcm9tZ3JvdXBzIyFmb3J1bS9hbmd1bGFyXCIsXG4gICAgICAgIFwidGh1bWJuYWlsc1wiOiB7XG4gICAgICAgICAgXCJkZWZhdWx0XCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9XdWlIdVpxX2NnNC9kZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiAxMjAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiA5MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJtZWRpdW1cIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL1d1aUh1WnFfY2c0L21xZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogMzIwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogMTgwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImhpZ2hcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL1d1aUh1WnFfY2c0L2hxZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogNDgwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogMzYwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInN0YW5kYXJkXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9XdWlIdVpxX2NnNC9zZGRlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDY0MCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDQ4MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJtYXhyZXNcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL1d1aUh1WnFfY2c0L21heHJlc2RlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDEyODAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiA3MjBcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIFwiY2hhbm5lbFRpdGxlXCI6IFwiSnVzdHluIENsYXJrXCIsXG4gICAgICAgIFwicGxheWxpc3RJZFwiOiBcIlBMUWFKRHdMWHlCdFhyMUZlMkZSeklkVDNSRmVHNTJRVkZcIixcbiAgICAgICAgXCJwb3NpdGlvblwiOiAyLFxuICAgICAgICBcInJlc291cmNlSWRcIjoge1xuICAgICAgICAgIFwia2luZFwiOiBcInlvdXR1YmUjdmlkZW9cIixcbiAgICAgICAgICBcInZpZGVvSWRcIjogXCJXdWlIdVpxX2NnNFwiXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcImNvbnRlbnREZXRhaWxzXCI6IHtcbiAgICAgICAgXCJ2aWRlb0lkXCI6IFwiV3VpSHVacV9jZzRcIixcbiAgICAgICAgXCJ2aWRlb1B1Ymxpc2hlZEF0XCI6IFwiMjAxMi0wNC0wNFQwNjo1NToxNi4wMDBaXCJcbiAgICAgIH1cbiAgICB9LFxuICAgIHtcbiAgICAgIFwia2luZFwiOiBcInlvdXR1YmUjcGxheWxpc3RJdGVtXCIsXG4gICAgICBcImV0YWdcIjogXCJcXFwiY2J6M2xJUTJOMjVBZndOci1CZHhVVnhKX1FZL0tGX09CR3Ezc1JDQ1E2XzNnMFZER0dXZFZXWVxcXCJcIixcbiAgICAgIFwiaWRcIjogXCJVRXhSWVVwRWQweFllVUowV0hJeFJtVXlSbEo2U1dSVU0xSkdaVWMxTWxGV1JpNDFNakUxTWtJME9UUTJRekpHTnpOR1wiLFxuICAgICAgXCJzbmlwcGV0XCI6IHtcbiAgICAgICAgXCJwdWJsaXNoZWRBdFwiOiBcIjIwMTUtMDMtMTBUMDU6NTQ6MDguMDAwWlwiLFxuICAgICAgICBcImNoYW5uZWxJZFwiOiBcIlVDVk00QzFmQjlRY3d5N2ROamJYZVVWd1wiLFxuICAgICAgICBcInRpdGxlXCI6IFwiSW50cm9kdWN0aW9uIHRvIEFuZ3VsYXIuanMgaW4gNTAgRXhhbXBsZXMgKHBhcnQgMSlcIixcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkNvZGUgYXQgaHR0cHM6Ly9naXRodWIuY29tL2N1cnJhbi9zY3JlZW5jYXN0cy90cmVlL2doLXBhZ2VzL2ludHJvVG9Bbmd1bGFyIEFuIGludHJvZHVjdGlvbiB0byBBbmd1bGFyLmpzIGNvdmVyaW5nIHNpbmdsZS1wYWdlLWFwcCBjb25jZXB0cywgcmVsYXRlZCBsaWJyYXJpZXMgYW5kIGFuZ3VsYXIgZmVhdHVyZXMgYnkgZXhhbXBsZS4gVGhpcyBpbnN0YWxsbWVudCAocGFydCAxKSBjb3ZlcnMgMzYgb2YgdGhlIDUwIEFuZ3VsYXIgZXhhbXBsZXMuIFBhcnQgMiBjb3ZlcnMgdGhlIHJlc3QgaHR0cHM6Ly93d3cueW91dHViZS5jb20vd2F0Y2g/dj02SjA4bTFIMkJNRSZmZWF0dXJlPXlvdXR1LmJlIEV4YW1wbGVzIHN0YXJ0IGF0IDExOjMwIGluIHRoZSB2aWRlby5cXG5cXG5JZiB5b3UgYXBwcmVjaWF0ZSB0aGlzIHdvcmssIHBsZWFzZSBjb25zaWRlciBzdXBwb3J0aW5nIG1lIG9uIFBhdHJlb24gaHR0cHM6Ly93d3cucGF0cmVvbi5jb20vdXNlcj91PTI5MTYyNDImdHk9aFxcblxcblRoaXMgbGVjdHVyZSB3YXMgZ2l2ZW4gYnkgQ3VycmFuIEtlbGxlaGVyIGF0IHRoZSBVbml2ZXJzaXR5IG9mIE1hc3NhY2h1c2V0dHMgTG93ZWxsIG9uIE1hcmNoIDYsIDIwMTQgYXMgcGFydCBvZiB0aGUgdW5kZXJncmFkdWF0ZSBjb3Vyc2UgR1VJIFByb2dyYW1taW5nIElJIHRhdWdodCBieSBQcm9mZXNzb3IgSmVzc2UgSGVpbmVzLlwiLFxuICAgICAgICBcInRodW1ibmFpbHNcIjoge1xuICAgICAgICAgIFwiZGVmYXVsdFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvVFJyTDVqM01Jdm8vZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogMTIwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogOTBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwibWVkaXVtXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9UUnJMNWozTUl2by9tcWRlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDMyMCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDE4MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJoaWdoXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9UUnJMNWozTUl2by9ocWRlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDQ4MCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDM2MFxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJjaGFubmVsVGl0bGVcIjogXCJKdXN0eW4gQ2xhcmtcIixcbiAgICAgICAgXCJwbGF5bGlzdElkXCI6IFwiUExRYUpEd0xYeUJ0WHIxRmUyRlJ6SWRUM1JGZUc1MlFWRlwiLFxuICAgICAgICBcInBvc2l0aW9uXCI6IDMsXG4gICAgICAgIFwicmVzb3VyY2VJZFwiOiB7XG4gICAgICAgICAgXCJraW5kXCI6IFwieW91dHViZSN2aWRlb1wiLFxuICAgICAgICAgIFwidmlkZW9JZFwiOiBcIlRSckw1ajNNSXZvXCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwiY29udGVudERldGFpbHNcIjoge1xuICAgICAgICBcInZpZGVvSWRcIjogXCJUUnJMNWozTUl2b1wiLFxuICAgICAgICBcInZpZGVvUHVibGlzaGVkQXRcIjogXCIyMDE0LTAzLTA4VDAzOjA2OjI1LjAwMFpcIlxuICAgICAgfVxuICAgIH0sXG4gICAge1xuICAgICAgXCJraW5kXCI6IFwieW91dHViZSNwbGF5bGlzdEl0ZW1cIixcbiAgICAgIFwiZXRhZ1wiOiBcIlxcXCJjYnozbElRMk4yNUFmd05yLUJkeFVWeEpfUVkvY1pSSThZMmxfRUlBcU9adm56OUpGTUFpQzNNXFxcIlwiLFxuICAgICAgXCJpZFwiOiBcIlVFeFJZVXBFZDB4WWVVSjBXSEl4Um1VeVJsSjZTV1JVTTFKR1pVYzFNbEZXUmk0d09UQTNPVFpCTnpWRU1UVXpPVE15XCIsXG4gICAgICBcInNuaXBwZXRcIjoge1xuICAgICAgICBcInB1Ymxpc2hlZEF0XCI6IFwiMjAxNS0wMy0xMVQxMDo1Nzo1NC4wMDBaXCIsXG4gICAgICAgIFwiY2hhbm5lbElkXCI6IFwiVUNWTTRDMWZCOVFjd3k3ZE5qYlhlVVZ3XCIsXG4gICAgICAgIFwidGl0bGVcIjogXCJVc2luZyBBbmltYXRlLmNzcyBhbmQgalF1ZXJ5IGZvciBlYXN5IFdlYiBBbmltYXRpb25cIixcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIlNpbXBsZSB0dXRvcmlhbCBvbiBob3cgdG8gdXNlIEFuaW1hdGUuY3NzIGFuZCBqUXVlcnkgdG9nZXRoZXIgaW4geW91ciB3ZWJzaXRlIG9yIHdlYiBhcHAhIPCflKVTdWJzY3JpYmUgZm9yIG1vcmUgbGlrZSB0aGlzOiBodHRwczovL2dvby5nbC9MVUVrTjFcIixcbiAgICAgICAgXCJ0aHVtYm5haWxzXCI6IHtcbiAgICAgICAgICBcImRlZmF1bHRcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL0NCUUdsNnpva01zL2RlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDEyMCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDkwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcIm1lZGl1bVwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvQ0JRR2w2em9rTXMvbXFkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiAzMjAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiAxODBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiaGlnaFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvQ0JRR2w2em9rTXMvaHFkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiA0ODAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiAzNjBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwic3RhbmRhcmRcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL0NCUUdsNnpva01zL3NkZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogNjQwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogNDgwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcIm1heHJlc1wiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvQ0JRR2w2em9rTXMvbWF4cmVzZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogMTI4MCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDcyMFxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJjaGFubmVsVGl0bGVcIjogXCJKdXN0eW4gQ2xhcmtcIixcbiAgICAgICAgXCJwbGF5bGlzdElkXCI6IFwiUExRYUpEd0xYeUJ0WHIxRmUyRlJ6SWRUM1JGZUc1MlFWRlwiLFxuICAgICAgICBcInBvc2l0aW9uXCI6IDQsXG4gICAgICAgIFwicmVzb3VyY2VJZFwiOiB7XG4gICAgICAgICAgXCJraW5kXCI6IFwieW91dHViZSN2aWRlb1wiLFxuICAgICAgICAgIFwidmlkZW9JZFwiOiBcIkNCUUdsNnpva01zXCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwiY29udGVudERldGFpbHNcIjoge1xuICAgICAgICBcInZpZGVvSWRcIjogXCJDQlFHbDZ6b2tNc1wiLFxuICAgICAgICBcInZpZGVvUHVibGlzaGVkQXRcIjogXCIyMDE0LTA2LTA1VDE5OjU5OjQzLjAwMFpcIlxuICAgICAgfVxuICAgIH0sXG4gICAge1xuXG5cbiAgICAgIFwia2luZFwiOiBcInlvdXR1YmUjcGxheWxpc3RJdGVtXCIsXG4gICAgICBcImV0YWdcIjogXCJcXFwiY2J6M2xJUTJOMjVBZndOci1CZHhVVnhKX1FZLzJvUXUxNUJROTVnalFjeklSSFZ1U3A2NmZOQVxcXCJcIixcbiAgICAgIFwiaWRcIjogXCJVRXhSWVVwRWQweFllVUowV0hJeFJtVXlSbEo2U1dSVU0xSkdaVWMxTWxGV1JpNHhNa1ZHUWpOQ01VTTFOMFJGTkVVeFwiLFxuICAgICAgXCJzbmlwcGV0XCI6IHtcbiAgICAgICAgXCJwdWJsaXNoZWRBdFwiOiBcIjIwMTUtMDMtMTRUMDc6NDI6MjAuMDAwWlwiLFxuICAgICAgICBcImNoYW5uZWxJZFwiOiBcIlVDVk00QzFmQjlRY3d5N2ROamJYZVVWd1wiLFxuICAgICAgICBcInRpdGxlXCI6IFwiV0VCIERFVkVMT1BNRU5UIC0gU0VDUkVUUyBUTyBTVEFSVElORyBBIENBUkVFUiBpbiB0aGUgV2ViIERldmVsb3BtZW50IEluZHVzdHJ5XCIsXG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJFdmVyeW9uZSBrZWVwcyBzYXlpbmcgaG93IGdyZWF0IHdlYiBkZXZlbG9wbWVudCBpcywgYnV0IGhvdyBkbyB5b3UgZ2V0IHRoYXQgZmlyc3Qgam9iPyAgVGhpcyB2aWRlbyBpcyBhIHJlc3BvbnNlIHRvIHRoZSBxdWVzdGlvbnMgSSd2ZSBiZWVuIGdldHRpbmcgYWJvdXQgaG93IHRvIGxhbmQgdGhhdCBmaXJzdCB3ZWIgZGV2ZWxvcG1lbnQgam9iIGFuZCBob3cgdG8ga25vdyB3aGVuIHlvdSdyZSByZWFkeSB0byB0YWtlIHRoZSBsZWFwIGFuZCBsb29rIGZvciBvbmUuXFxuXFxuVGhlIGZpcnN0IHRoaW5nIHlvdSBoYXZlIHRvIGtub3cgaXMgdGhhdCB5b3UgZG9uJ3QgaGF2ZSB0byBiZSBhIHNlYXNvbmVkIHBybyB0byBnZXQgYSBqb2IgYXMgYSBmdWxsLXRpbWUgd2ViIGRldmVsb3Blci4gIFRoZXJlIGFyZSBMT1RTIG9mIGNvbXBhbmllcyBsb29raW5nIGZvciB3ZWIgZGV2ZWxvcGVycyB0aGF0IGRvbid0IGhhdmUgbXVjaCBleHBlcmllbmNlLlxcblxcbkFsc28sIHRoZXJlIGFyZSBhIGxvdCBvZiB0aGluZ3MgeW91IGNhbiBkbyB0byBwcmVwYXJlIHlvdXIgcmVzdW1lIHRvIHJlYWxseSBzdGljayBvdXQgdG8gYSBwcm9zcGVjdGl2ZSBlbXBsb3llci5cXG5cXG5UaGlzIHZpZGVvIHdpbGwgZ2l2ZSB5b3UgYSBmZWVsIGZvciB3aGF0IGFuIGVtcGxveWVyIHdpbGwgYmUgbG9va2luZyBmb3IgYW5kIHdoYXQgdGhleSdsbCBiZSBcXFwiZ3JhZGluZ1xcXCIgeW91IG9uIGFzIHlvdSBsb29rIGZvciBhIGpvYiBpbiB0aGlzIGluZHVzdHJ5LlxcblxcbkdpdGh1YiBJbnRybzogXFxuaHR0cHM6Ly93d3cueW91dHViZS5jb20vd2F0Y2g/dj0wZktnN2UzN2JRRVxcbkdpdGh1YiBQdWxsIFJlcXVlc3RzOiBcXG5odHRwczovL3d3dy55b3V0dWJlLmNvbS93YXRjaD92PW9GWXlUWndNeUFnXFxuXFxualF1ZXJ5IENvdXJzZTpcXG5odHRwczovL3d3dy55b3V0dWJlLmNvbS9wbGF5bGlzdD9saXN0PVBMb1lDZ05PSXlHQUJkSTJWOElfU1dvMjJ0RnBnaDJzNl9cIixcbiAgICAgICAgXCJ0aHVtYm5haWxzXCI6IHtcbiAgICAgICAgICBcImRlZmF1bHRcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL0ppbGZYbUkySWpRL2RlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDEyMCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDkwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcIm1lZGl1bVwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvSmlsZlhtSTJJalEvbXFkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiAzMjAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiAxODBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiaGlnaFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvSmlsZlhtSTJJalEvaHFkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiA0ODAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiAzNjBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwic3RhbmRhcmRcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL0ppbGZYbUkySWpRL3NkZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogNjQwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogNDgwXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcImNoYW5uZWxUaXRsZVwiOiBcIkp1c3R5biBDbGFya1wiLFxuICAgICAgICBcInBsYXlsaXN0SWRcIjogXCJQTFFhSkR3TFh5QnRYcjFGZTJGUnpJZFQzUkZlRzUyUVZGXCIsXG4gICAgICAgIFwicG9zaXRpb25cIjogNSxcbiAgICAgICAgXCJyZXNvdXJjZUlkXCI6IHtcbiAgICAgICAgICBcImtpbmRcIjogXCJ5b3V0dWJlI3ZpZGVvXCIsXG4gICAgICAgICAgXCJ2aWRlb0lkXCI6IFwiSmlsZlhtSTJJalFcIlxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgXCJjb250ZW50RGV0YWlsc1wiOiB7XG4gICAgICAgIFwidmlkZW9JZFwiOiBcIkppbGZYbUkySWpRXCIsXG4gICAgICAgIFwidmlkZW9QdWJsaXNoZWRBdFwiOiBcIjIwMTQtMDQtMjFUMTg6MDA6MDIuMDAwWlwiXG4gICAgICB9XG4gICAgfSxcbiAgICB7XG5cblxuICAgICAgXCJraW5kXCI6IFwieW91dHViZSNwbGF5bGlzdEl0ZW1cIixcbiAgICAgIFwiZXRhZ1wiOiBcIlxcXCJjYnozbElRMk4yNUFmd05yLUJkeFVWeEpfUVkvYXJ2NHFxQzZCajl3TGdvS2tYNFpOclVidGFjXFxcIlwiLFxuICAgICAgXCJpZFwiOiBcIlVFeFJZVXBFZDB4WWVVSjBXSEl4Um1VeVJsSjZTV1JVTTFKR1pVYzFNbEZXUmk0MU16SkNRakJDTkRJeVJrSkROMFZEXCIsXG4gICAgICBcInNuaXBwZXRcIjoge1xuICAgICAgICBcInB1Ymxpc2hlZEF0XCI6IFwiMjAxNS0wMy0yMFQwODo1MToxNy4wMDBaXCIsXG4gICAgICAgIFwiY2hhbm5lbElkXCI6IFwiVUNWTTRDMWZCOVFjd3k3ZE5qYlhlVVZ3XCIsXG4gICAgICAgIFwidGl0bGVcIjogXCJSZWFsdGltZSBcXFwiRXllIENhbmR5XFxcIiB3aXRoIEFuZ3VsYXJKU1wiLFxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiTGVhcm4gaG93IHRvIG1ha2UgYSBmdWxseSBpbnRlcmFjdGl2ZSwgcmVhbHRpbWUgQW5ndWxhckpTIGFwcGxpY2F0aW9uIHdpdGggc25hcHB5IGFuaW1hdGlvbiBlZmZlY3RzLCBzbGVlayBwZXJmb3JtYW5jZSBhbmQgY2xlYW4sIG9yZ2FuaXplZCBjb2RlLiBUb3AgdGhhdCBvZmYgYnkgdGVzdGluZyBhbGwgYXNwZWN0cyBvZiB0aGUgYXBwbGljYXRpb24gdXNpbmcgUHJvdHJhY3RvciBhbmQgVW5pdCB0ZXN0aW5nIGFjcm9zcyBtdWx0aXBsZSBicm93c2VycyB1c2luZyBLYXJtYSArIFNhdWNlIExhYnMuXCIsXG4gICAgICAgIFwidGh1bWJuYWlsc1wiOiB7XG4gICAgICAgICAgXCJkZWZhdWx0XCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS84dWo3WVNxYnk3cy9kZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiAxMjAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiA5MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJtZWRpdW1cIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpLzh1ajdZU3FieTdzL21xZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogMzIwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogMTgwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImhpZ2hcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpLzh1ajdZU3FieTdzL2hxZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogNDgwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogMzYwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInN0YW5kYXJkXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS84dWo3WVNxYnk3cy9zZGRlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDY0MCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDQ4MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJtYXhyZXNcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpLzh1ajdZU3FieTdzL21heHJlc2RlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDEyODAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiA3MjBcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIFwiY2hhbm5lbFRpdGxlXCI6IFwiSnVzdHluIENsYXJrXCIsXG4gICAgICAgIFwicGxheWxpc3RJZFwiOiBcIlBMUWFKRHdMWHlCdFhyMUZlMkZSeklkVDNSRmVHNTJRVkZcIixcbiAgICAgICAgXCJwb3NpdGlvblwiOiA2LFxuICAgICAgICBcInJlc291cmNlSWRcIjoge1xuICAgICAgICAgIFwia2luZFwiOiBcInlvdXR1YmUjdmlkZW9cIixcbiAgICAgICAgICBcInZpZGVvSWRcIjogXCI4dWo3WVNxYnk3c1wiXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcImNvbnRlbnREZXRhaWxzXCI6IHtcbiAgICAgICAgXCJ2aWRlb0lkXCI6IFwiOHVqN1lTcWJ5N3NcIixcbiAgICAgICAgXCJ2aWRlb1B1Ymxpc2hlZEF0XCI6IFwiMjAxNC0wMS0xNVQxNDowMDowMy4wMDBaXCJcbiAgICAgIH1cbiAgICB9LFxuICAgIHtcblxuXG4gICAgICBcImtpbmRcIjogXCJ5b3V0dWJlI3BsYXlsaXN0SXRlbVwiLFxuICAgICAgXCJldGFnXCI6IFwiXFxcImNiejNsSVEyTjI1QWZ3TnItQmR4VVZ4Sl9RWS9iaGN4UGZDdVFnX2tHU3ZVQTFzc05aYmVCMU1cXFwiXCIsXG4gICAgICBcImlkXCI6IFwiVUV4UllVcEVkMHhZZVVKMFdISXhSbVV5UmxKNlNXUlVNMUpHWlVjMU1sRldSaTVEUVVORVJEUTJOa0l6UlVReE5UWTFcIixcbiAgICAgIFwic25pcHBldFwiOiB7XG4gICAgICAgIFwicHVibGlzaGVkQXRcIjogXCIyMDE1LTAzLTMxVDE5OjU3OjUzLjAwMFpcIixcbiAgICAgICAgXCJjaGFubmVsSWRcIjogXCJVQ1ZNNEMxZkI5UWN3eTdkTmpiWGVVVndcIixcbiAgICAgICAgXCJ0aXRsZVwiOiBcIkp1bmlvciBEZXZlbG9wZXIgMTAxOiBUaXBzIGZvciBIb3cgdG8gU2NvcmUgYSBKb2JcIixcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIlRyeWluZyB0byBiZWNvbWUgYSBqdW5pb3IgZGV2ZWxvcGVyPyBIYXZlIGFueGlldHkgYWJvdXQgdGhlIGludGVydmlldyBwcm9jZXNzPyBXZSBhcmUgYnJpbmdpbmcgdG9nZXRoZXIganVuaW9yIGRldnMgd2hvIG1hZGUgaXQgdGhyb3VnaCBvbiB0aGUgb3RoZXIgc2lkZSBhbmQgbGl2ZWQgdG8gdGVsbCB0aGUgdGFsZS5cXG5cXG5Kb2luIHVzIGZvciBhbm90aGVyIEcrIEhhbmdvdXQgdG8gdGFsayBhYm91dCBcXFwiSW50ZXJ2aWV3IDEwMVxcXCIgd2l0aCBkZXZzLCByZWNydWl0ZXJzIGFuZCBlbXBsb3llcnMuICBcXG5cXG5XZSdsbCBhbnN3ZXIgcXVlc3Rpb25zIGxpa2U6XFxuXFxuMS4gV2hhdCBhcmUgc29tZSBvZiB0aGUgYmVzdCByZXNvdXJjZXMgZm9yIG15IGpvYiBzZWFyY2g/XFxuMi4gRG8gSSBuZWVkIHByaW9yIGV4cGVyaWVuY2UgaW4gY29kaW5nIG9yIHRoZSBpbmR1c3RyeSB0byBnZXQgYSBqb2I/XFxuMy4gV2hhdCBraW5kIG9mIGpvYnMgc2hvdWxkIEkgYmUgbG9va2luZyBmb3I/IElzIGZyZWVsYW5jaW5nIGEgZ29vZCBvcHRpb24/IFxcbjQuIElzIHlvdXIgcG9ydGZvbGlvIHRoZSBtb3N0IGltcG9ydGFudCB0aGluZz8gSG93IGNhbiBJIG1ha2UgbWluZSBiZXR0ZXI/XFxuNS4gV2hhdCBkbyBoaXJpbmcgbWFuYWdlcnMgd2FudCB0byBzZWUgb24gYSByZXN1bWU/XFxuNi4gV2hhdCBoZWxwcyBtZSBhY3R1YWxseSBnZXQgYW4gaW50ZXJ2aWV3P1xcbjcuIFdoYXQgZG8gSSBuZWVkIHRvIGRvIHRvIHByZXBhcmU/IFdoYXQgdGVzdCBwcm9ncmFtcyBzaG91bGQgSSBrbm93P1xcbjguIEhvdyBkbyBJIGV4cGxhaW4gbXkgYmFja2dyb3VuZCBpZiBJJ3ZlIGxlYXJuZWQgY29kaW5nIGluIGEgbm9uLXRyYWRpdGlvbmFsIHdheT9cXG45LiBXaGF0IGtpbmQgb2YgcXVlc3Rpb25zIHNob3VsZCBJIGJlIGFza2luZyB0aGVtPyBIb3cgZG8gSSBrbm93IGlmIGl0J3MgYSBnb29kIGN1bHR1cmUgZml0P1xcbjEwLiBBbnkgdGlwcyBvbiBob3cgdG8gc3RhbmQgb3V0IGFuZCBmb2xsb3cgdXAgYWZ0ZXIgdGhlIGZhY3Q/IFxcblxcbkFzayBxdWVzdGlvbnMgYW5kIGpvaW4gdGhlIGNvbnZlcnNhdGlvbiB1c2luZyAgI1RoaW5rSm9icyAhXFxuXFxuUGFuZWxpc3RzOlxcbkdyYWUgRHJha2UgKEBHcmFlX0RyYWtlKSAtIEhlYWQgb2YgRWR1Y2F0aW9uIE9wZXJhdGlvbnMsIFRoaW5rZnVsIChNb2RlcmF0b3IpXFxuTGF1cmEgSG9yYWsgKEBsYXVyYXNob3JhayApICAtIEhlYWQgb2YgQ29tbXVuaXR5LCBUaGlua2Z1bFxcblRob21hcyBQZXRlcnNvbiAoQHJpcGxleWFmZmVjdCkgLSBFbmdpbmVlciwgVGhpbmtmdWxcXG5MZWUgRWR3YXJkcyAoQHRlcnJvbmspIC0gRW5naW5lZXIgTWFuYWdlciwgR3JvdXBvblxcblJvY2ttYW4gSGEgKEBSb2NrdG90aGVtYW4pIC0gQ2hpZWYgUGVvcGxlIE9mZmljZXI7IGZvcm1lcmx5IE1vbmdvIERCXFxuRWxpIEdvb2RtYW4gKEBlbGltZ29vZG1hbikgLSBDaGllZiBUZWNobm9sb2d5IE9mZmljZXIsIExpdHRsZSBCb3Jyb3dlZCBEcmVzc1wiLFxuICAgICAgICBcInRodW1ibmFpbHNcIjoge1xuICAgICAgICAgIFwiZGVmYXVsdFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvOXFFRkRxaFBEQ2svZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogMTIwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogOTBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwibWVkaXVtXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS85cUVGRHFoUERDay9tcWRlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDMyMCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDE4MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJoaWdoXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS85cUVGRHFoUERDay9ocWRlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDQ4MCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDM2MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJzdGFuZGFyZFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvOXFFRkRxaFBEQ2svc2RkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiA2NDAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiA0ODBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwibWF4cmVzXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS85cUVGRHFoUERDay9tYXhyZXNkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiAxMjgwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogNzIwXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcImNoYW5uZWxUaXRsZVwiOiBcIkp1c3R5biBDbGFya1wiLFxuICAgICAgICBcInBsYXlsaXN0SWRcIjogXCJQTFFhSkR3TFh5QnRYcjFGZTJGUnpJZFQzUkZlRzUyUVZGXCIsXG4gICAgICAgIFwicG9zaXRpb25cIjogNyxcbiAgICAgICAgXCJyZXNvdXJjZUlkXCI6IHtcbiAgICAgICAgICBcImtpbmRcIjogXCJ5b3V0dWJlI3ZpZGVvXCIsXG4gICAgICAgICAgXCJ2aWRlb0lkXCI6IFwiOXFFRkRxaFBEQ2tcIlxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgXCJjb250ZW50RGV0YWlsc1wiOiB7XG4gICAgICAgIFwidmlkZW9JZFwiOiBcIjlxRUZEcWhQRENrXCIsXG4gICAgICAgIFwidmlkZW9QdWJsaXNoZWRBdFwiOiBcIjIwMTQtMDctMTFUMTk6NTI6MjAuMDAwWlwiXG4gICAgICB9XG4gICAgfSxcbiAgICB7XG5cblxuICAgICAgXCJraW5kXCI6IFwieW91dHViZSNwbGF5bGlzdEl0ZW1cIixcbiAgICAgIFwiZXRhZ1wiOiBcIlxcXCJjYnozbElRMk4yNUFmd05yLUJkeFVWeEpfUVkvY0JVQmZ4cE5JQVRkRkYtd1lnWWN4Q3F2ZWI4XFxcIlwiLFxuICAgICAgXCJpZFwiOiBcIlVFeFJZVXBFZDB4WWVVSjBXSEl4Um1VeVJsSjZTV1JVTTFKR1pVYzFNbEZXUmk0NU5EazFSRVpFTnpoRU16VTVNRFF6XCIsXG4gICAgICBcInNuaXBwZXRcIjoge1xuICAgICAgICBcInB1Ymxpc2hlZEF0XCI6IFwiMjAxNS0wOS0yOVQwNjoyOToxMy4wMDBaXCIsXG4gICAgICAgIFwiY2hhbm5lbElkXCI6IFwiVUNWTTRDMWZCOVFjd3k3ZE5qYlhlVVZ3XCIsXG4gICAgICAgIFwidGl0bGVcIjogXCJDU1MgcHJlcHJvY2Vzc29ycyB3aXRoIEpvbmF0aGFuIFZlcnJlY2NoaWFcIixcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIlllbHAgZnJvbnQtZW5kIGVuZ2luZWVyIEpvbmF0aGFuIFZlcnJlY2NoaWEgd2lsbCBkZW1vbnN0cmF0ZSB0aGUgcG93ZXIgb2YgQ1NTIHByZXByb2Nlc3NvcnMgYW5kIGV4cGxhaW4gd2h5IGhlIGJlbGlldmVzIHRoZXNlIGFyZSBhIGdhbWUgY2hhbmdlciBmb3IgZnJvbnQtZW5kIGRldmVsb3BtZW50IGluIHRoaXMgcHJlc2VudGF0aW9uIGdpdmVuIGF0IHRoZSBTYW4gRnJhbmNpc2NvIEhUTUw1IFVzZXIgR3JvdXAuXFxuXFxuSm9uYXRoYW4ncyB0YWxrIHdpbGwgY292ZXI6XFxuLSBDU1Mgd2Vha25lc3Nlc1xcbi0gUHJlcHJvY2Vzc29yIGZlYXR1cmVzXFxuLSBDb21tb24gbWlzY29uY2VwdGlvbnNcXG4tIFNhc3MsIExlc3MsIG9yIFN0eWx1cz9cXG4tIFdvcmtmbG93IGFuZCB0ZWNobmlxdWVzXFxuLSBQcmVwcm9jZXNzb3JzICsgT09DU1xcblxcbioqIE1vcmUgdmlkZW9zIG9uIG9wZW4gc291cmNlIGRldmVsb3BtZW50IGF0IGh0dHA6Ly9tYXJha2FuYS5jb20vcy9cXG4qKiBTbGlkZXMgYXQgaHR0cDovL21ya24uY28vdWN2cG1cIixcbiAgICAgICAgXCJ0aHVtYm5haWxzXCI6IHtcbiAgICAgICAgICBcImRlZmF1bHRcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL0ZsVzJ2dmwweXZvL2RlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDEyMCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDkwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcIm1lZGl1bVwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvRmxXMnZ2bDB5dm8vbXFkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiAzMjAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiAxODBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiaGlnaFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvRmxXMnZ2bDB5dm8vaHFkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiA0ODAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiAzNjBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwic3RhbmRhcmRcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL0ZsVzJ2dmwweXZvL3NkZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogNjQwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogNDgwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcIm1heHJlc1wiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvRmxXMnZ2bDB5dm8vbWF4cmVzZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogMTI4MCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDcyMFxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJjaGFubmVsVGl0bGVcIjogXCJKdXN0eW4gQ2xhcmtcIixcbiAgICAgICAgXCJwbGF5bGlzdElkXCI6IFwiUExRYUpEd0xYeUJ0WHIxRmUyRlJ6SWRUM1JGZUc1MlFWRlwiLFxuICAgICAgICBcInBvc2l0aW9uXCI6IDgsXG4gICAgICAgIFwicmVzb3VyY2VJZFwiOiB7XG4gICAgICAgICAgXCJraW5kXCI6IFwieW91dHViZSN2aWRlb1wiLFxuICAgICAgICAgIFwidmlkZW9JZFwiOiBcIkZsVzJ2dmwweXZvXCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwiY29udGVudERldGFpbHNcIjoge1xuICAgICAgICBcInZpZGVvSWRcIjogXCJGbFcydnZsMHl2b1wiLFxuICAgICAgICBcInZpZGVvUHVibGlzaGVkQXRcIjogXCIyMDEyLTA2LTEyVDIxOjAzOjMxLjAwMFpcIlxuICAgICAgfVxuICAgIH0sXG4gICAge1xuXG5cbiAgICAgIFwia2luZFwiOiBcInlvdXR1YmUjcGxheWxpc3RJdGVtXCIsXG4gICAgICBcImV0YWdcIjogXCJcXFwiY2J6M2xJUTJOMjVBZndOci1CZHhVVnhKX1FZLzZRZjZMYUFTQ0JabUZGSUJGb3FmYTZXTkhTd1xcXCJcIixcbiAgICAgIFwiaWRcIjogXCJVRXhSWVVwRWQweFllVUowV0hJeFJtVXlSbEo2U1dSVU0xSkdaVWMxTWxGV1JpNUdOak5EUkRSRU1EUXhPVGhDTURRMlwiLFxuICAgICAgXCJzbmlwcGV0XCI6IHtcbiAgICAgICAgXCJwdWJsaXNoZWRBdFwiOiBcIjIwMTUtMTItMDNUMDc6MTI6MDcuMDAwWlwiLFxuICAgICAgICBcImNoYW5uZWxJZFwiOiBcIlVDVk00QzFmQjlRY3d5N2ROamJYZVVWd1wiLFxuICAgICAgICBcInRpdGxlXCI6IFwiUkVTVCBBUEkgY29uY2VwdHMgYW5kIGV4YW1wbGVzXCIsXG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJUaGlzIHZpZGVvIGludHJvZHVjZXMgdGhlIHZpZXdlciB0byBzb21lIEFQSSBjb25jZXB0cyBieSBtYWtpbmcgZXhhbXBsZSBjYWxscyB0byBGYWNlYm9vaydzIEdyYXBoIEFQSSwgR29vZ2xlIE1hcHMnIEFQSSwgSW5zdGFncmFtJ3MgTWVkaWEgU2VhcmNoIEFQSSwgYW5kIFR3aXR0ZXIncyBTdGF0dXMgVXBkYXRlIEFQSS5cXG5cXG4vKioqKioqKioqKiBWSURFTyBMSU5LUyAqKioqKioqKioqL1xcblxcbllvdXR1YmUncyBGYWNlYm9vayBQYWdlIHZpYSB0aGUgRmFjZWJvb2sgR3JhcGggQVBJXFxuaHR0cDovL2dyYXBoLmZhY2Vib29rLmNvbS95b3V0dWJlXFxuXFxuU2FtZSB0aGluZywgdGhpcyB0aW1lIHdpdGggZmlsdGVyc1xcbmh0dHBzOi8vZ3JhcGguZmFjZWJvb2suY29tL3lvdXR1YmU/ZmllbGRzPWlkLG5hbWUsbGlrZXNcXG5cXG5Hb29nbGUgTWFwcyBHZW9jb2RlIEFQSSBjYWxsIGZvciB0aGUgY2l0eSBvZiBDaGljYWdvXFxuaHR0cDovL21hcHMuZ29vZ2xlYXBpcy5jb20vbWFwcy9hcGkvZ2VvY29kZS9qc29uP2FkZHJlc3M9Q2hpY2Fnb1xcblxcbkFwaWdlZSBJbnN0YWdyYW0gQVBJIGNvbnNvbGVcXG5odHRwczovL2FwaWdlZS5jb20vY29uc29sZS9pbnN0YWdyYW1cXG5cXG5IVFRQIFJlcXVlc3QgTWV0aG9kc1xcbmh0dHA6Ly9lbi53aWtpcGVkaWEub3JnL3dpa2kvSHlwZXJ0ZXh0X1RyYW5zZmVyX1Byb3RvY29sI1JlcXVlc3RfbWV0aG9kc1xcblxcblBvc3RtYW4gQ2hyb21lIEV4dGVuc2lvblxcbmh0dHBzOi8vY2hyb21lLmdvb2dsZS5jb20vd2Vic3RvcmUvZGV0YWlsL3Bvc3RtYW4tcmVzdC1jbGllbnQvZmRtbWdpbGducGppZ2Rvam9qcGpvb29pZGttY29tY20/aGw9ZW5cXG5cXG5Ud2l0dGVyJ3MgU3RhdHVzIFVwZGF0ZSBkb2N1bWVudGF0aW9uLlxcbmh0dHBzOi8vZGV2LnR3aXR0ZXIuY29tL2RvY3MvYXBpLzEuMS9wb3N0L3N0YXR1c2VzL3VwZGF0ZVwiLFxuICAgICAgICBcInRodW1ibmFpbHNcIjoge1xuICAgICAgICAgIFwiZGVmYXVsdFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvN1ljVzI1UEhuQUEvZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogMTIwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogOTBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwibWVkaXVtXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS83WWNXMjVQSG5BQS9tcWRlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDMyMCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDE4MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJoaWdoXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS83WWNXMjVQSG5BQS9ocWRlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDQ4MCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDM2MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJzdGFuZGFyZFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvN1ljVzI1UEhuQUEvc2RkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiA2NDAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiA0ODBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwibWF4cmVzXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS83WWNXMjVQSG5BQS9tYXhyZXNkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiAxMjgwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogNzIwXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcImNoYW5uZWxUaXRsZVwiOiBcIkp1c3R5biBDbGFya1wiLFxuICAgICAgICBcInBsYXlsaXN0SWRcIjogXCJQTFFhSkR3TFh5QnRYcjFGZTJGUnpJZFQzUkZlRzUyUVZGXCIsXG4gICAgICAgIFwicG9zaXRpb25cIjogOSxcbiAgICAgICAgXCJyZXNvdXJjZUlkXCI6IHtcbiAgICAgICAgICBcImtpbmRcIjogXCJ5b3V0dWJlI3ZpZGVvXCIsXG4gICAgICAgICAgXCJ2aWRlb0lkXCI6IFwiN1ljVzI1UEhuQUFcIlxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgXCJjb250ZW50RGV0YWlsc1wiOiB7XG4gICAgICAgIFwidmlkZW9JZFwiOiBcIjdZY1cyNVBIbkFBXCIsXG4gICAgICAgIFwidmlkZW9QdWJsaXNoZWRBdFwiOiBcIjIwMTQtMDctMTRUMDg6MDY6NDkuMDAwWlwiXG4gICAgICB9XG4gICAgfSxcbiAgICB7XG5cblxuICAgICAgXCJraW5kXCI6IFwieW91dHViZSNwbGF5bGlzdEl0ZW1cIixcbiAgICAgIFwiZXRhZ1wiOiBcIlxcXCJjYnozbElRMk4yNUFmd05yLUJkeFVWeEpfUVkvelM2OGVTN0hpdFp0VVhzMC00cVhUQUtwamFjXFxcIlwiLFxuICAgICAgXCJpZFwiOiBcIlVFeFJZVXBFZDB4WWVVSjBXSEl4Um1VeVJsSjZTV1JVTTFKR1pVYzFNbEZXUmk0ME56WkNNRVJETWpWRU4wUkZSVGhCXCIsXG4gICAgICBcInNuaXBwZXRcIjoge1xuICAgICAgICBcInB1Ymxpc2hlZEF0XCI6IFwiMjAxNS0xMi0wN1QwNjoxOTowMy4wMDBaXCIsXG4gICAgICAgIFwiY2hhbm5lbElkXCI6IFwiVUNWTTRDMWZCOVFjd3k3ZE5qYlhlVVZ3XCIsXG4gICAgICAgIFwidGl0bGVcIjogXCJWZWxvY2l0eS5qczogVUkgUGFjayBPdmVydmlld1wiLFxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiUGxheSB3aXRoIHRoZSBVSSBwYWNrIGF0IGh0dHA6Ly9WZWxvY2l0eUpTLm9yZy8jdWlQYWNrLlxcblxcblJlYWQgdGhlIGZ1bGwgdHV0b3JpYWw6IGh0dHA6Ly93d3cuc21hc2hpbmdtYWdhemluZS5jb20vMjAxNC8wNi8xOC9mYXN0ZXItdWktYW5pbWF0aW9ucy13aXRoLXZlbG9jaXR5LWpzL1wiLFxuICAgICAgICBcInRodW1ibmFpbHNcIjoge1xuICAgICAgICAgIFwiZGVmYXVsdFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvQ2R3dlI2YTM5VGcvZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogMTIwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogOTBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwibWVkaXVtXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9DZHd2UjZhMzlUZy9tcWRlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDMyMCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDE4MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJoaWdoXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9DZHd2UjZhMzlUZy9ocWRlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDQ4MCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDM2MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJzdGFuZGFyZFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvQ2R3dlI2YTM5VGcvc2RkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiA2NDAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiA0ODBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwibWF4cmVzXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9DZHd2UjZhMzlUZy9tYXhyZXNkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiAxMjgwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogNzIwXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcImNoYW5uZWxUaXRsZVwiOiBcIkp1c3R5biBDbGFya1wiLFxuICAgICAgICBcInBsYXlsaXN0SWRcIjogXCJQTFFhSkR3TFh5QnRYcjFGZTJGUnpJZFQzUkZlRzUyUVZGXCIsXG4gICAgICAgIFwicG9zaXRpb25cIjogMTAsXG4gICAgICAgIFwicmVzb3VyY2VJZFwiOiB7XG4gICAgICAgICAgXCJraW5kXCI6IFwieW91dHViZSN2aWRlb1wiLFxuICAgICAgICAgIFwidmlkZW9JZFwiOiBcIkNkd3ZSNmEzOVRnXCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwiY29udGVudERldGFpbHNcIjoge1xuICAgICAgICBcInZpZGVvSWRcIjogXCJDZHd2UjZhMzlUZ1wiLFxuICAgICAgICBcInZpZGVvUHVibGlzaGVkQXRcIjogXCIyMDE0LTA1LTI4VDE2OjIwOjM5LjAwMFpcIlxuICAgICAgfVxuICAgIH0sXG4gICAge1xuXG5cbiAgICAgIFwia2luZFwiOiBcInlvdXR1YmUjcGxheWxpc3RJdGVtXCIsXG4gICAgICBcImV0YWdcIjogXCJcXFwiY2J6M2xJUTJOMjVBZndOci1CZHhVVnhKX1FZL2NkcXpYSUY1YXlJMFBkdk10cWRLV2JDdk5Za1xcXCJcIixcbiAgICAgIFwiaWRcIjogXCJVRXhSWVVwRWQweFllVUowV0hJeFJtVXlSbEo2U1dSVU0xSkdaVWMxTWxGV1JpNUVNRUV3UlVZNU0wUkRSVFUzTkRKQ1wiLFxuICAgICAgXCJzbmlwcGV0XCI6IHtcbiAgICAgICAgXCJwdWJsaXNoZWRBdFwiOiBcIjIwMTYtMDEtMDlUMTg6NTA6MjQuMDAwWlwiLFxuICAgICAgICBcImNoYW5uZWxJZFwiOiBcIlVDVk00QzFmQjlRY3d5N2ROamJYZVVWd1wiLFxuICAgICAgICBcInRpdGxlXCI6IFwiVG9wIDEwIFByb2dyYW1taW5nIExhbmd1YWdlcyB0byBMZWFybiBpbiAyMDE2XCIsXG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJUSElTIFZJREVPIElTIFNQT05TT1JFRCBCWVxcblxcblRoZSBUZWNoIEFjYWRlbXkgaHR0cDovL293Lmx5L1JBTU8zMGZFN09jXFxuXFxuSGlwc3RlckNvZGUgaHR0cHM6Ly93d3cuaGlwc3RlcmNvZGUuY29tL1wiLFxuICAgICAgICBcInRodW1ibmFpbHNcIjoge1xuICAgICAgICAgIFwiZGVmYXVsdFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvWjU2R0xSWHhoODgvZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogMTIwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogOTBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwibWVkaXVtXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9aNTZHTFJYeGg4OC9tcWRlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDMyMCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDE4MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJoaWdoXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9aNTZHTFJYeGg4OC9ocWRlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDQ4MCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDM2MFxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJjaGFubmVsVGl0bGVcIjogXCJKdXN0eW4gQ2xhcmtcIixcbiAgICAgICAgXCJwbGF5bGlzdElkXCI6IFwiUExRYUpEd0xYeUJ0WHIxRmUyRlJ6SWRUM1JGZUc1MlFWRlwiLFxuICAgICAgICBcInBvc2l0aW9uXCI6IDExLFxuICAgICAgICBcInJlc291cmNlSWRcIjoge1xuICAgICAgICAgIFwia2luZFwiOiBcInlvdXR1YmUjdmlkZW9cIixcbiAgICAgICAgICBcInZpZGVvSWRcIjogXCJaNTZHTFJYeGg4OFwiXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcImNvbnRlbnREZXRhaWxzXCI6IHtcbiAgICAgICAgXCJ2aWRlb0lkXCI6IFwiWjU2R0xSWHhoODhcIixcbiAgICAgICAgXCJ2aWRlb1B1Ymxpc2hlZEF0XCI6IFwiMjAxNS0wOC0wN1QwMToxODozOS4wMDBaXCJcbiAgICAgIH1cbiAgICB9LFxuICAgIHtcblxuXG4gICAgICBcImtpbmRcIjogXCJ5b3V0dWJlI3BsYXlsaXN0SXRlbVwiLFxuICAgICAgXCJldGFnXCI6IFwiXFxcImNiejNsSVEyTjI1QWZ3TnItQmR4VVZ4Sl9RWS9qZEN5N2pqZ3JiZFYxWlN4eTVFdElKQkw5LTBcXFwiXCIsXG4gICAgICBcImlkXCI6IFwiVUV4UllVcEVkMHhZZVVKMFdISXhSbVV5UmxKNlNXUlVNMUpHWlVjMU1sRldSaTQ1T0RSRE5UZzBRakE0TmtGQk5rUXlcIixcbiAgICAgIFwic25pcHBldFwiOiB7XG4gICAgICAgIFwicHVibGlzaGVkQXRcIjogXCIyMDE2LTAxLTE1VDAwOjE3OjQ2LjAwMFpcIixcbiAgICAgICAgXCJjaGFubmVsSWRcIjogXCJVQ1ZNNEMxZkI5UWN3eTdkTmpiWGVVVndcIixcbiAgICAgICAgXCJ0aXRsZVwiOiBcIkVkZ2UgQ29uZmVyZW5jZSAyMDE1IC0gNCBDb21wb25lbnRzIGFuZCBNb2R1bGVzXCIsXG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJcIixcbiAgICAgICAgXCJ0aHVtYm5haWxzXCI6IHtcbiAgICAgICAgICBcImRlZmF1bHRcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL0pRZ0JiOVdlWUhJL2RlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDEyMCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDkwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcIm1lZGl1bVwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvSlFnQmI5V2VZSEkvbXFkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiAzMjAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiAxODBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiaGlnaFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvSlFnQmI5V2VZSEkvaHFkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiA0ODAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiAzNjBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwic3RhbmRhcmRcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL0pRZ0JiOVdlWUhJL3NkZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogNjQwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogNDgwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcIm1heHJlc1wiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvSlFnQmI5V2VZSEkvbWF4cmVzZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogMTI4MCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDcyMFxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJjaGFubmVsVGl0bGVcIjogXCJKdXN0eW4gQ2xhcmtcIixcbiAgICAgICAgXCJwbGF5bGlzdElkXCI6IFwiUExRYUpEd0xYeUJ0WHIxRmUyRlJ6SWRUM1JGZUc1MlFWRlwiLFxuICAgICAgICBcInBvc2l0aW9uXCI6IDEyLFxuICAgICAgICBcInJlc291cmNlSWRcIjoge1xuICAgICAgICAgIFwia2luZFwiOiBcInlvdXR1YmUjdmlkZW9cIixcbiAgICAgICAgICBcInZpZGVvSWRcIjogXCJKUWdCYjlXZVlISVwiXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcImNvbnRlbnREZXRhaWxzXCI6IHtcbiAgICAgICAgXCJ2aWRlb0lkXCI6IFwiSlFnQmI5V2VZSElcIixcbiAgICAgICAgXCJ2aWRlb1B1Ymxpc2hlZEF0XCI6IFwiMjAxNS0wNy0xM1QxMTowNjowNS4wMDBaXCJcbiAgICAgIH1cbiAgICB9LFxuICAgIHtcblxuXG4gICAgICBcImtpbmRcIjogXCJ5b3V0dWJlI3BsYXlsaXN0SXRlbVwiLFxuICAgICAgXCJldGFnXCI6IFwiXFxcImNiejNsSVEyTjI1QWZ3TnItQmR4VVZ4Sl9RWS8tTjFQVnd0el9uUWlQZDRUVVVQNi1YM3BLTlFcXFwiXCIsXG4gICAgICBcImlkXCI6IFwiVUV4UllVcEVkMHhZZVVKMFdISXhSbVV5UmxKNlNXUlVNMUpHWlVjMU1sRldSaTR6TURnNU1rUTVNRVZETUVNMU5UZzJcIixcbiAgICAgIFwic25pcHBldFwiOiB7XG4gICAgICAgIFwicHVibGlzaGVkQXRcIjogXCIyMDE2LTAxLTI0VDA5OjU1OjM3LjAwMFpcIixcbiAgICAgICAgXCJjaGFubmVsSWRcIjogXCJVQ1ZNNEMxZkI5UWN3eTdkTmpiWGVVVndcIixcbiAgICAgICAgXCJ0aXRsZVwiOiBcIltFcC4gMV0gQW5ndWxhciB0byBSZWFjdFwiLFxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiXCIsXG4gICAgICAgIFwidGh1bWJuYWlsc1wiOiB7XG4gICAgICAgICAgXCJkZWZhdWx0XCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS8wVHNnZWJpZEZmby9kZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiAxMjAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiA5MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJtZWRpdW1cIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpLzBUc2dlYmlkRmZvL21xZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogMzIwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogMTgwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImhpZ2hcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpLzBUc2dlYmlkRmZvL2hxZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogNDgwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogMzYwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInN0YW5kYXJkXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS8wVHNnZWJpZEZmby9zZGRlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDY0MCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDQ4MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJtYXhyZXNcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpLzBUc2dlYmlkRmZvL21heHJlc2RlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDEyODAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiA3MjBcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIFwiY2hhbm5lbFRpdGxlXCI6IFwiSnVzdHluIENsYXJrXCIsXG4gICAgICAgIFwicGxheWxpc3RJZFwiOiBcIlBMUWFKRHdMWHlCdFhyMUZlMkZSeklkVDNSRmVHNTJRVkZcIixcbiAgICAgICAgXCJwb3NpdGlvblwiOiAxMyxcbiAgICAgICAgXCJyZXNvdXJjZUlkXCI6IHtcbiAgICAgICAgICBcImtpbmRcIjogXCJ5b3V0dWJlI3ZpZGVvXCIsXG4gICAgICAgICAgXCJ2aWRlb0lkXCI6IFwiMFRzZ2ViaWRGZm9cIlxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgXCJjb250ZW50RGV0YWlsc1wiOiB7XG4gICAgICAgIFwidmlkZW9JZFwiOiBcIjBUc2dlYmlkRmZvXCIsXG4gICAgICAgIFwidmlkZW9QdWJsaXNoZWRBdFwiOiBcIjIwMTUtMTItMjhUMjI6MDc6NDguMDAwWlwiXG4gICAgICB9XG4gICAgfSxcbiAgICB7XG5cblxuICAgICAgXCJraW5kXCI6IFwieW91dHViZSNwbGF5bGlzdEl0ZW1cIixcbiAgICAgIFwiZXRhZ1wiOiBcIlxcXCJjYnozbElRMk4yNUFmd05yLUJkeFVWeEpfUVkveExpY3JPbXZiSW4yYkw4WjhTMXo3RmhWbkE0XFxcIlwiLFxuICAgICAgXCJpZFwiOiBcIlVFeFJZVXBFZDB4WWVVSjBXSEl4Um1VeVJsSjZTV1JVTTFKR1pVYzFNbEZXUmk0MU16azJRVEF4TVRrek5EazRNRGhGXCIsXG4gICAgICBcInNuaXBwZXRcIjoge1xuICAgICAgICBcInB1Ymxpc2hlZEF0XCI6IFwiMjAxNi0wMS0yOVQwODoyODo1Ny4wMDBaXCIsXG4gICAgICAgIFwiY2hhbm5lbElkXCI6IFwiVUNWTTRDMWZCOVFjd3k3ZE5qYlhlVVZ3XCIsXG4gICAgICAgIFwidGl0bGVcIjogXCJSZWFjdCBhbmQgUmVkdXhcIixcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIioqIEkgaGF2ZSBjcmVhdGVkIGEgYmV0dGVyLCBtb3JlIGNvbXByZWhlbnNpdmUgdmlkZW8gc2VyaWVzIGFib3V0IHVzaW5nIFJlYWN0LCBSZWR1eCBhbmQgV2VicGFjayB0byBidWlsZCB3ZWIgYXBwcy4gQ2hlY2sgaXQgb3V0IGF0IGh0dHA6Ly93d3cueW91dHViZS5jb20vcGxheWxpc3Q/bGlzdD1QTFFEbnhYcVYyMTNKSkZ0RGFHMGFFOXZxdnA2V203bkJnICoqXFxuXFxuQSB0YWxrIGFuZCBsaXZlIGRlbW8gYWJvdXQgaG93IChhbmQgd2h5KSB0byB1c2UgUmVhY3QgYW5kIFJlZHV4LiBQcmVzZW50YXRpb24gcmVjb3JkZWQgYXQgSGFjayBSZWFjdG9yIG9uIE5vdi4gMzAsIDIwMTUuIEdpdGh1YiByZXBvIHRvIGZvbGxvdyBhbG9uZyBjYW4gYmUgZm91bmQgYXQgaHR0cHM6Ly9naXRodWIuY29tL2t3ZWliZXJ0aC9yZWFjdC1yZWR1eC10b2RvLWRlbW8uIFRoZSBtYXN0ZXIgYnJhbmNoIGlzIHRoZSBmaW5pc2hlZCBwcm9kdWN0IGFmdGVyIHRoZSBkZW1vIGlzIGNvbXBsZXRlZC4gVGhlIHJlYWN0LWRlbW8tc3RhcnQgYnJhbmNoIGlzIHRoZSBzdGFydGluZyBwb2ludCBmb3IgdGhlIGZpcnN0IGRlbW8gYW5kIHRoZSByZWR1eC1kZW1vLXN0YXJ0IGJyYW5jaCBpcyB0aGUgc3RhcnRpbmcgcG9pbnQgZm9yIHRoZSBzZWNvbmQgZGVtby5cIixcbiAgICAgICAgXCJ0aHVtYm5haWxzXCI6IHtcbiAgICAgICAgICBcImRlZmF1bHRcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpLzdlTHFLZ3AwZWVZL2RlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDEyMCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDkwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcIm1lZGl1bVwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvN2VMcUtncDBlZVkvbXFkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiAzMjAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiAxODBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiaGlnaFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvN2VMcUtncDBlZVkvaHFkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiA0ODAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiAzNjBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwic3RhbmRhcmRcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpLzdlTHFLZ3AwZWVZL3NkZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogNjQwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogNDgwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcIm1heHJlc1wiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvN2VMcUtncDBlZVkvbWF4cmVzZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogMTI4MCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDcyMFxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJjaGFubmVsVGl0bGVcIjogXCJKdXN0eW4gQ2xhcmtcIixcbiAgICAgICAgXCJwbGF5bGlzdElkXCI6IFwiUExRYUpEd0xYeUJ0WHIxRmUyRlJ6SWRUM1JGZUc1MlFWRlwiLFxuICAgICAgICBcInBvc2l0aW9uXCI6IDE0LFxuICAgICAgICBcInJlc291cmNlSWRcIjoge1xuICAgICAgICAgIFwia2luZFwiOiBcInlvdXR1YmUjdmlkZW9cIixcbiAgICAgICAgICBcInZpZGVvSWRcIjogXCI3ZUxxS2dwMGVlWVwiXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcImNvbnRlbnREZXRhaWxzXCI6IHtcbiAgICAgICAgXCJ2aWRlb0lkXCI6IFwiN2VMcUtncDBlZVlcIixcbiAgICAgICAgXCJ2aWRlb1B1Ymxpc2hlZEF0XCI6IFwiMjAxNS0xMi0xMlQyMjozNzoxNi4wMDBaXCJcbiAgICAgIH1cbiAgICB9LFxuICAgIHtcblxuXG4gICAgICBcImtpbmRcIjogXCJ5b3V0dWJlI3BsYXlsaXN0SXRlbVwiLFxuICAgICAgXCJldGFnXCI6IFwiXFxcImNiejNsSVEyTjI1QWZ3TnItQmR4VVZ4Sl9RWS9IRlZoQWoxOGR0LTBydmNLNlpxWDFQY3IzSFVcXFwiXCIsXG4gICAgICBcImlkXCI6IFwiVUV4UllVcEVkMHhZZVVKMFdISXhSbVV5UmxKNlNXUlVNMUpHWlVjMU1sRldSaTVFUVVFMU5URkRSamN3TURnME5FTXpcIixcbiAgICAgIFwic25pcHBldFwiOiB7XG4gICAgICAgIFwicHVibGlzaGVkQXRcIjogXCIyMDE2LTAxLTI5VDA4OjI5OjA3LjAwMFpcIixcbiAgICAgICAgXCJjaGFubmVsSWRcIjogXCJVQ1ZNNEMxZkI5UWN3eTdkTmpiWGVVVndcIixcbiAgICAgICAgXCJ0aXRsZVwiOiBcIlJlYWN0IEZvciBFdmVyeW9uZSAjOCAtIEJhc2ljIFdlYnBhY2sgQ29uZmlndXJhdGlvbiAmIFNlcnZlclwiLFxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiSW4gdGhpcyBSZWFjdCB2aWRlbyB0dXRvcmlhbCwgd2UgZmluaXNoIG91ciBzZXR1cCBieSB3cml0aW5nIG91ciB3ZWJwYWNrIGNvbmZpZyBmaWxlLiBTdWJzY3JpYmUgZm9yIG1vcmUgZnJlZSB0dXRvcmlhbHMgaHR0cHM6Ly9nb28uZ2wvNmxqb0ZjLCBtb3JlIFJlYWN0IFR1dG9yaWFsczogaHR0cHM6Ly9nb28uZ2wvdFJVQUI5XFxuXFxuU3VwcG9ydCBGcmVlIFR1dG9yaWFsc1xcbmh0dHBzOi8vd3d3LmxldmVsdXB0dXRvcmlhbHMuY29tL3N0b3JlL1xcblxcblRoZSBiZXN0IHNoYXJlZCB3ZWIgaG9zdGluZ1xcbmh0dHA6Ly93d3cuYmx1ZWhvc3QuY29tL3RyYWNrL2xldmVsdXB0dXRvcmlhbHMvXFxuXFxuU3Vic2NyaWJlIHRvIExldmVsIFVwIFBybyBmb3IgZXh0cmEgZmVhdHVyZXMhXFxuaHR0cHM6Ly93d3cubGV2ZWx1cHR1dG9yaWFscy5jb20vc3RvcmUvcHJvZHVjdHMvcHJvXFxuXFxuU3Vic2NyaWJlIHRvIHRoZSBMZXZlbCBVcCBOZXdzbGV0dGVyXFxuaHR0cDovL2VlcHVybC5jb20vQVdqR3pcXG5cXG5UbyBTdXBwb3J0IExldmVsIFVwIFR1dHM6XFxuaHR0cDovL2xldmVsdXB0dXRzLmNvbS9kb25hdGlvbnNcXG5cXG5TaW1wbGUgY2xvdWQgaG9zdGluZywgYnVpbHQgZm9yIGRldmVsb3BlcnMuOlxcbmh0dHBzOi8vd3d3LmRpZ2l0YWxvY2Vhbi5jb20vP3JlZmNvZGU9NjczNTcxNzRiMDllXFxuXFxuTGVhcm4gUmVhY3QganMgZnJvbSBzY3JhdGNoIGluIHRoZSBuZXcgdmlkZW8gdHV0b3JpYWwgc2VyaWVzIFJlYWN0IEZvciBCZWdpbm5lcnMuIFdlJ2xsIGJlIGludHJvZHVjaW5nIGNvcmUgY29uY2VwdHMgYW5kIGV4cGxvcmluZyByZWFsIHdvcmxkIGFwcGxpY2F0aW9uIHRlY2huaXF1ZXMgYXMgd2UgZ28uIE5ldyB2aWRlb3MgZXZlcnkgd2VlayFcIixcbiAgICAgICAgXCJ0aHVtYm5haWxzXCI6IHtcbiAgICAgICAgICBcImRlZmF1bHRcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL0F0S2g2dHA0NENrL2RlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDEyMCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDkwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcIm1lZGl1bVwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvQXRLaDZ0cDQ0Q2svbXFkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiAzMjAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiAxODBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiaGlnaFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvQXRLaDZ0cDQ0Q2svaHFkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiA0ODAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiAzNjBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwic3RhbmRhcmRcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL0F0S2g2dHA0NENrL3NkZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogNjQwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogNDgwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcIm1heHJlc1wiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvQXRLaDZ0cDQ0Q2svbWF4cmVzZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogMTI4MCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDcyMFxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJjaGFubmVsVGl0bGVcIjogXCJKdXN0eW4gQ2xhcmtcIixcbiAgICAgICAgXCJwbGF5bGlzdElkXCI6IFwiUExRYUpEd0xYeUJ0WHIxRmUyRlJ6SWRUM1JGZUc1MlFWRlwiLFxuICAgICAgICBcInBvc2l0aW9uXCI6IDE1LFxuICAgICAgICBcInJlc291cmNlSWRcIjoge1xuICAgICAgICAgIFwia2luZFwiOiBcInlvdXR1YmUjdmlkZW9cIixcbiAgICAgICAgICBcInZpZGVvSWRcIjogXCJBdEtoNnRwNDRDa1wiXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcImNvbnRlbnREZXRhaWxzXCI6IHtcbiAgICAgICAgXCJ2aWRlb0lkXCI6IFwiQXRLaDZ0cDQ0Q2tcIixcbiAgICAgICAgXCJ2aWRlb1B1Ymxpc2hlZEF0XCI6IFwiMjAxNi0wMS0xNVQwMDoyNDoyOS4wMDBaXCJcbiAgICAgIH1cbiAgICB9LFxuICAgIHtcblxuXG4gICAgICBcImtpbmRcIjogXCJ5b3V0dWJlI3BsYXlsaXN0SXRlbVwiLFxuICAgICAgXCJldGFnXCI6IFwiXFxcImNiejNsSVEyTjI1QWZ3TnItQmR4VVZ4Sl9RWS81X2J1cmdTZ1NCSlVqb3A5SVZoOTlxR2xiVE1cXFwiXCIsXG4gICAgICBcImlkXCI6IFwiVUV4UllVcEVkMHhZZVVKMFdISXhSbVV5UmxKNlNXUlVNMUpHWlVjMU1sRldSaTQxUVRZMVEwVXhNVFZDT0Rjek5UaEVcIixcbiAgICAgIFwic25pcHBldFwiOiB7XG4gICAgICAgIFwicHVibGlzaGVkQXRcIjogXCIyMDE2LTEyLTA3VDA0OjIxOjI0LjAwMFpcIixcbiAgICAgICAgXCJjaGFubmVsSWRcIjogXCJVQ1ZNNEMxZkI5UWN3eTdkTmpiWGVVVndcIixcbiAgICAgICAgXCJ0aXRsZVwiOiBcIkxlYXJuIFJlYWN0IHdpdGggcHJvZ3Jlc3NpdmUgYm9pbGVycGxhdGVzXCIsXG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJJbiB0aGlzIHZpZGVvIEkgaW50cm9kdWNlIHRoZSBjb25jZXB0IG9mIHByb2dyZXNzaXZlIGJvaWxlcnBsYXRlIGFuZCBzaG93IHlvdSBob3cgdG8gbGVhcm4gUmVhY3Qgd2l0aCBwcm9ncmVzc2l2ZSBib2lsZXJwbGF0ZXMuXFxuXFxuQVJjIChBdG9taWMgUmVhY3QpLCB0aGUgcHJvZ3Jlc3NpdmUgYm9pbGVycGxhdGU6IGh0dHBzOi8vZ2l0aHViLmNvbS9kaWVnb2hhei9hcmNcXG5cXG5yZWFjdC1jcmVhdGUtYXBwOiBodHRwczovL2dpdGh1Yi5jb20vZmFjZWJvb2tpbmN1YmF0b3IvY3JlYXRlLXJlYWN0LWFwcFxcblxcbnJlYWN0LWJvaWxlcnBsYXRlOiBodHRwczovL2dpdGh1Yi5jb20vbXhzdGJyL3JlYWN0LWJvaWxlcnBsYXRlXFxuXFxucmVhY3QtcmVkdXgtdW5pdmVyc2FsLWhvdC1leGFtcGxlOiBodHRwczovL2dpdGh1Yi5jb20vZXJpa3Jhcy9yZWFjdC1yZWR1eC11bml2ZXJzYWwtaG90LWV4YW1wbGVcIixcbiAgICAgICAgXCJ0aHVtYm5haWxzXCI6IHtcbiAgICAgICAgICBcImRlZmF1bHRcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL1ZjSGJxcGRaOW1NL2RlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDEyMCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDkwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcIm1lZGl1bVwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvVmNIYnFwZFo5bU0vbXFkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiAzMjAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiAxODBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiaGlnaFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvVmNIYnFwZFo5bU0vaHFkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiA0ODAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiAzNjBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwic3RhbmRhcmRcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL1ZjSGJxcGRaOW1NL3NkZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogNjQwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogNDgwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcIm1heHJlc1wiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvVmNIYnFwZFo5bU0vbWF4cmVzZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogMTI4MCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDcyMFxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJjaGFubmVsVGl0bGVcIjogXCJKdXN0eW4gQ2xhcmtcIixcbiAgICAgICAgXCJwbGF5bGlzdElkXCI6IFwiUExRYUpEd0xYeUJ0WHIxRmUyRlJ6SWRUM1JGZUc1MlFWRlwiLFxuICAgICAgICBcInBvc2l0aW9uXCI6IDE2LFxuICAgICAgICBcInJlc291cmNlSWRcIjoge1xuICAgICAgICAgIFwia2luZFwiOiBcInlvdXR1YmUjdmlkZW9cIixcbiAgICAgICAgICBcInZpZGVvSWRcIjogXCJWY0hicXBkWjltTVwiXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcImNvbnRlbnREZXRhaWxzXCI6IHtcbiAgICAgICAgXCJ2aWRlb0lkXCI6IFwiVmNIYnFwZFo5bU1cIixcbiAgICAgICAgXCJ2aWRlb1B1Ymxpc2hlZEF0XCI6IFwiMjAxNi0xMS0xN1QyMTozNDo0NS4wMDBaXCJcbiAgICAgIH1cbiAgICB9LFxuICAgIHtcblxuXG4gICAgICBcImtpbmRcIjogXCJ5b3V0dWJlI3BsYXlsaXN0SXRlbVwiLFxuICAgICAgXCJldGFnXCI6IFwiXFxcImNiejNsSVEyTjI1QWZ3TnItQmR4VVZ4Sl9RWS9KZ2FaWUhCZ2VtYmwyMEVVRFNLd25vaG9vdE1cXFwiXCIsXG4gICAgICBcImlkXCI6IFwiVUV4UllVcEVkMHhZZVVKMFdISXhSbVV5UmxKNlNXUlVNMUpHWlVjMU1sRldSaTR5TVVReVFUUXpNalJETnpNeVFUTXlcIixcbiAgICAgIFwic25pcHBldFwiOiB7XG4gICAgICAgIFwicHVibGlzaGVkQXRcIjogXCIyMDE2LTEyLTA3VDA0OjI2OjIwLjAwMFpcIixcbiAgICAgICAgXCJjaGFubmVsSWRcIjogXCJVQ1ZNNEMxZkI5UWN3eTdkTmpiWGVVVndcIixcbiAgICAgICAgXCJ0aXRsZVwiOiBcIkNyZWF0ZSBhbmQgZGVwbG95IGEgUkVTVGZ1bCBBUEkgaW4gMTAgbWludXRlc1wiLFxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiQ3JlYXRlIGEgUkVTVCBBUEkgd2l0aCBOb2RlSlMsIE1vbmdvREIgYW5kIEV4cHJlc3MuXFxuR2l0SHViIHJlcG86IGh0dHBzOi8vZ2l0aHViLmNvbS9kaWVnb2hhei9nZW5lcmF0b3ItcmVzdFxcblxcbkluIHRoaXMgdHV0b3JpYWwgSSBzaG93IHlvdSBob3cgdG8gY3JlYXRlIGEgUkVTVCBBUEkgd2l0aCBOb2RlSlMsIE1vbmdvREIgKE1vbmdvb3NlKSwgRXhwcmVzcywgRVM2LCBpbnRlZ3JhdGlvbiBhbmQgdW5pdCB0ZXN0cywgZG9jdW1lbnRhdGlvbiAoYXBpZG9jKSwgZXJyb3IgaGFuZGxpbmcsIEpTT04gcmVzcG9uc2VzIGFuZCBtdWNoIG1vcmUgdXNpbmcgWWVvbWFuIGFuZCBkZXBsb3kgaXQgdG8gSGVyb2t1Llxcblxcbi0tLS0tLS0tLS0tLS0tIExJTktTIC0tLS0tLS0tLS0tLS1cXG5cXG5Ob2RlSlM6IGh0dHBzOi8vbm9kZWpzLm9yZ1xcbk1vbmdvREI6IGh0dHBzOi8vbW9uZ29kYi5jb21cXG5Qb3N0bWFuOiBodHRwczovL3d3dy5nZXRwb3N0bWFuLmNvbVxcblxcbi0tLS0tLS0tLS0tLSBSRUxBVEVEIC0tLS0tLS0tLS1cXG5cXG5XaGF0IGlzIE5vZGUuanMgRXhhY3RseT9cXG5Vc2luZyBOb2RlLmpzIGZvciBFdmVyeXRoaW5nXFxuUkVTVCBBUEkgY29uY2VwdHMgYW5kIGV4YW1wbGVzXFxuSW50cm8gdG8gUkVTVFxcbk5vZGUuanMgVHV0b3JpYWxzOiBGcm9tIFplcm8gdG8gSGVybyB3aXRoIE5vZGVqc1xcblJFU1QrSlNPTiBBUEkgRGVzaWduIC0gQmVzdCBQcmFjdGljZXMgZm9yIERldmVsb3BlcnNcXG5Vc2luZyBSRVNUIEFQSXMgaW4gYSB3ZWIgYXBwbGljYXRpb25cXG5SRVNULUZ1bCBBUEkgRGVzaWduXFxuQ3JlYXRlIGEgV2Vic2l0ZSBvciBCbG9nXFxuTm9kZS5qcyBUdXRvcmlhbHMgZm9yIEJlZ2lubmVyc1xcbk5vZGVKUyBNb25nb0RCIFR1dG9yaWFsXFxuTm9kZS5qcyBGdW5kYW1lbnRhbHNcXG5CdWlsZCBhIFJFU1RmdWwgQVBJIGluIDUgTWludXRlcyB3aXRoIE5vZGVKU1xcbkJ1aWxkIGEgVHdpdGNoLnR2IENoYXQgQm90IGluIDEwIE1pbnV0ZXMgd2l0aCBOb2RlLmpzXFxuTm9kZS5qcyBMb2dpbiBTeXN0ZW0gV2l0aCBQYXNzcG9ydFxcbkJ1aWxkaW5nIGEgTWljcm9zZXJ2aWNlIHVzaW5nIE5vZGUuanMgJiBEb2NrZXJcXG5UaGUgQUJDcyBvZiBBUElzIHdpdGggTm9kZS5qc1xcbkV2ZXJ5dGhpbmcgWW91IEV2ZXIgV2FudGVkIFRvIEtub3cgQWJvdXQgQXV0aGVudGljYXRpb24gaW4gTm9kZS5qc1xcbkPDs21vIGltcGxlbWVudGFyIHVuIEFQSSBSRVNUIGRlc2RlIGNlcm8gY29uIE5vZGUuanMgeSBNb25nb0RCXFxuT3ZlcnZpZXcgb2YgTm9kZS5qcyBNaWNyb3NlcnZpY2VzIEFyY2hpdGVjdHVyZXNcXG5Ob2RlLmpzIEV4cGxhaW5lZFxcbkphdmFTY3JpcHQgd2l0aCBSZWFjdEpTIGFuZCBOb2RlanNcXG5Ob2RlSlMgLyBFeHByZXNzIC8gTW9uZ29EQiAtIEJ1aWxkIGEgU2hvcHBpbmcgQ2FydFxcbkRlcGxveWluZyBOb2RlLmpzIEFwcCB0byBIZXJva3VcXG5UZXN0IGRyaXZlbiBEZXZlbG9wbWVudCBvZiBXZWIgQXBwcyBpbiBOb2RlLkpzXFxuSG93IHRvIHNlbmQgc2VydmVyIGVtYWlsIHdpdGggTm9kZS5qc1xcbkRlcGxveWluZyBub2RlLmpzIGFwcGxpY2F0aW9uc1xcblJFU1RmdWwgQVBJIEZyb20gU2NyYXRjaCBVc2luZyBOb2RlLCBFeHByZXNzIGFuZCBNb25nb0RCXFxuSW50cm8gdG8gUkVTVCAoYWthLiBXaGF0IElzIFJFU1QgQW55d2F5PylcIixcbiAgICAgICAgXCJ0aHVtYm5haWxzXCI6IHtcbiAgICAgICAgICBcImRlZmF1bHRcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpLzZ4LWlqeUctYWNrL2RlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDEyMCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDkwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcIm1lZGl1bVwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvNngtaWp5Ry1hY2svbXFkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiAzMjAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiAxODBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiaGlnaFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvNngtaWp5Ry1hY2svaHFkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiA0ODAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiAzNjBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwic3RhbmRhcmRcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpLzZ4LWlqeUctYWNrL3NkZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogNjQwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogNDgwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcIm1heHJlc1wiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvNngtaWp5Ry1hY2svbWF4cmVzZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogMTI4MCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDcyMFxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJjaGFubmVsVGl0bGVcIjogXCJKdXN0eW4gQ2xhcmtcIixcbiAgICAgICAgXCJwbGF5bGlzdElkXCI6IFwiUExRYUpEd0xYeUJ0WHIxRmUyRlJ6SWRUM1JGZUc1MlFWRlwiLFxuICAgICAgICBcInBvc2l0aW9uXCI6IDE3LFxuICAgICAgICBcInJlc291cmNlSWRcIjoge1xuICAgICAgICAgIFwia2luZFwiOiBcInlvdXR1YmUjdmlkZW9cIixcbiAgICAgICAgICBcInZpZGVvSWRcIjogXCI2eC1panlHLWFja1wiXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcImNvbnRlbnREZXRhaWxzXCI6IHtcbiAgICAgICAgXCJ2aWRlb0lkXCI6IFwiNngtaWp5Ry1hY2tcIixcbiAgICAgICAgXCJ2aWRlb1B1Ymxpc2hlZEF0XCI6IFwiMjAxNi0wOS0xNFQwMjozODo1NC4wMDBaXCJcbiAgICAgIH1cbiAgICB9LFxuICAgIHtcblxuXG4gICAgICBcImtpbmRcIjogXCJ5b3V0dWJlI3BsYXlsaXN0SXRlbVwiLFxuICAgICAgXCJldGFnXCI6IFwiXFxcImNiejNsSVEyTjI1QWZ3TnItQmR4VVZ4Sl9RWS9jUlVwQjI5ZjFHcWpVbFRNSk5wNFdpd2g2VUlcXFwiXCIsXG4gICAgICBcImlkXCI6IFwiVUV4UllVcEVkMHhZZVVKMFdISXhSbVV5UmxKNlNXUlVNMUpHWlVjMU1sRldSaTQ1UlRneE5EUkJNelV3UmpRME1EaENcIixcbiAgICAgIFwic25pcHBldFwiOiB7XG4gICAgICAgIFwicHVibGlzaGVkQXRcIjogXCIyMDE3LTAxLTE4VDE3OjI4OjAwLjAwMFpcIixcbiAgICAgICAgXCJjaGFubmVsSWRcIjogXCJVQ1ZNNEMxZkI5UWN3eTdkTmpiWGVVVndcIixcbiAgICAgICAgXCJ0aXRsZVwiOiBcIlRvZGQgTW90dG8gLSBEZW15c3RpZnlpbmcgSmF2YVNjcmlwdDogeW91IGRvbid0IG5lZWQgalF1ZXJ5IChGT1dEIDIwMTQpXCIsXG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJodHRwczovL3NwZWFrZXJkZWNrLmNvbS90b2RkbW90dG8vZGVteXN0aWZ5aW5nLWphdmFzY3JpcHQteW91LWRvbnQtbmVlZC1qcXVlcnlcIixcbiAgICAgICAgXCJ0aHVtYm5haWxzXCI6IHtcbiAgICAgICAgICBcImRlZmF1bHRcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL2tleUNnMjUzUy1vL2RlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDEyMCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDkwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcIm1lZGl1bVwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkva2V5Q2cyNTNTLW8vbXFkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiAzMjAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiAxODBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiaGlnaFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkva2V5Q2cyNTNTLW8vaHFkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiA0ODAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiAzNjBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwic3RhbmRhcmRcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL2tleUNnMjUzUy1vL3NkZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogNjQwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogNDgwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcIm1heHJlc1wiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkva2V5Q2cyNTNTLW8vbWF4cmVzZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogMTI4MCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDcyMFxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJjaGFubmVsVGl0bGVcIjogXCJKdXN0eW4gQ2xhcmtcIixcbiAgICAgICAgXCJwbGF5bGlzdElkXCI6IFwiUExRYUpEd0xYeUJ0WHIxRmUyRlJ6SWRUM1JGZUc1MlFWRlwiLFxuICAgICAgICBcInBvc2l0aW9uXCI6IDE4LFxuICAgICAgICBcInJlc291cmNlSWRcIjoge1xuICAgICAgICAgIFwia2luZFwiOiBcInlvdXR1YmUjdmlkZW9cIixcbiAgICAgICAgICBcInZpZGVvSWRcIjogXCJrZXlDZzI1M1Mtb1wiXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcImNvbnRlbnREZXRhaWxzXCI6IHtcbiAgICAgICAgXCJ2aWRlb0lkXCI6IFwia2V5Q2cyNTNTLW9cIixcbiAgICAgICAgXCJ2aWRlb1B1Ymxpc2hlZEF0XCI6IFwiMjAxNC0wNi0wM1QwOTo1NTo0MC4wMDBaXCJcbiAgICAgIH1cbiAgICB9LFxuICAgIHtcblxuXG4gICAgICBcImtpbmRcIjogXCJ5b3V0dWJlI3BsYXlsaXN0SXRlbVwiLFxuICAgICAgXCJldGFnXCI6IFwiXFxcImNiejNsSVEyTjI1QWZ3TnItQmR4VVZ4Sl9RWS9yMU8wUkNiMjdPM1pLLWtrRDJjVVliSGhsQjBcXFwiXCIsXG4gICAgICBcImlkXCI6IFwiVUV4UllVcEVkMHhZZVVKMFdISXhSbVV5UmxKNlNXUlVNMUpHWlVjMU1sRldSaTVFTkRVNFEwTTRSREV4TnpNMU1qY3lcIixcbiAgICAgIFwic25pcHBldFwiOiB7XG4gICAgICAgIFwicHVibGlzaGVkQXRcIjogXCIyMDE3LTAzLTAzVDE2OjAzOjE0LjAwMFpcIixcbiAgICAgICAgXCJjaGFubmVsSWRcIjogXCJVQ1ZNNEMxZkI5UWN3eTdkTmpiWGVVVndcIixcbiAgICAgICAgXCJ0aXRsZVwiOiBcIkphY2sgTGVub3g6IEJ1aWxkaW5nIFRoZW1lcyB3aXRoIHRoZSBXUCBSRVNUIEFQSVwiLFxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiV2l0aCB0aGUgUkVTVCBBUEkgc2hvcnRseSBkdWUgdG8gYmUgbWVyZ2VkIGludG8gV29yZFByZXNzIGNvcmUsIGl04oCZcyBhYm91dCB0aW1lIGRldmVsb3BlcnMgc3RhcnRlZCB0aGlua2luZyBhYm91dCBidWlsZGluZyB0aGVtZXMgdGhhdCB1c2UgaXQuIFRoZSBSRVNUIEFQSSBhbGxvd3MgZGV2ZWxvcGVycyB0byBjcmVhdGUgbXVjaCBtb3JlIGVuZ2FnaW5nIHVzZXIgZXhwZXJpZW5jZXMuIFRoaXMgaXMgYSB0YWxrIHRoYXQgY292ZXJzIHRoZSBjaGFsbGVuZ2VzIG9uZSBmYWNlcyB3aGVuIHdvcmtpbmcgd2l0aCB0aGUgUkVTVCBBUEksIGhvdyB0byBleHRlbmQgdGhlIFJFU1QgQVBJIGl0c2VsZiBmcm9tIHdpdGhpbiB5b3VyIHRoZW1lLCBhbmQgc3VnZ2VzdGVkIHdheXMgdGhhdCB0aGVtZXMgY2FuIGJlIGJ1aWx0IHRvIHVzZSBpdC5cXG5cXG5TbGlkZXM6IGh0dHBzOi8vc3BlYWtlcmRlY2suY29tL2phY2tsZW5veC9idWlsZGluZy10aGVtZXMtd2l0aC10aGUtd3AtcmVzdC1hcGlcIixcbiAgICAgICAgXCJ0aHVtYm5haWxzXCI6IHtcbiAgICAgICAgICBcImRlZmF1bHRcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpLzFzeWtWakpSSWdNL2RlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDEyMCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDkwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcIm1lZGl1bVwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvMXN5a1ZqSlJJZ00vbXFkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiAzMjAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiAxODBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiaGlnaFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvMXN5a1ZqSlJJZ00vaHFkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiA0ODAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiAzNjBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwic3RhbmRhcmRcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpLzFzeWtWakpSSWdNL3NkZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogNjQwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogNDgwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcIm1heHJlc1wiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvMXN5a1ZqSlJJZ00vbWF4cmVzZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogMTI4MCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDcyMFxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJjaGFubmVsVGl0bGVcIjogXCJKdXN0eW4gQ2xhcmtcIixcbiAgICAgICAgXCJwbGF5bGlzdElkXCI6IFwiUExRYUpEd0xYeUJ0WHIxRmUyRlJ6SWRUM1JGZUc1MlFWRlwiLFxuICAgICAgICBcInBvc2l0aW9uXCI6IDE5LFxuICAgICAgICBcInJlc291cmNlSWRcIjoge1xuICAgICAgICAgIFwia2luZFwiOiBcInlvdXR1YmUjdmlkZW9cIixcbiAgICAgICAgICBcInZpZGVvSWRcIjogXCIxc3lrVmpKUklnTVwiXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcImNvbnRlbnREZXRhaWxzXCI6IHtcbiAgICAgICAgXCJ2aWRlb0lkXCI6IFwiMXN5a1ZqSlJJZ01cIixcbiAgICAgICAgXCJ2aWRlb1B1Ymxpc2hlZEF0XCI6IFwiMjAxNi0wNi0yOFQxNzo1MzoyNS4wMDBaXCJcbiAgICAgIH1cbiAgICB9LFxuICAgIHtcblxuXG4gICAgICBcImtpbmRcIjogXCJ5b3V0dWJlI3BsYXlsaXN0SXRlbVwiLFxuICAgICAgXCJldGFnXCI6IFwiXFxcImNiejNsSVEyTjI1QWZ3TnItQmR4VVZ4Sl9RWS9ISDRWY0JtMGJoNjNoSU1aSHJyYzVJTmJBWmdcXFwiXCIsXG4gICAgICBcImlkXCI6IFwiVUV4UllVcEVkMHhZZVVKMFdISXhSbVV5UmxKNlNXUlVNMUpHWlVjMU1sRldSaTR5TURoQk1rTkJOalJETWpReFFUZzFcIixcbiAgICAgIFwic25pcHBldFwiOiB7XG4gICAgICAgIFwicHVibGlzaGVkQXRcIjogXCIyMDE3LTAzLTA2VDE3OjQxOjAwLjAwMFpcIixcbiAgICAgICAgXCJjaGFubmVsSWRcIjogXCJVQ1ZNNEMxZkI5UWN3eTdkTmpiWGVVVndcIixcbiAgICAgICAgXCJ0aXRsZVwiOiBcIk9iamVjdCBPcmllbnRlZCBKYXZhU2NyaXB0XCIsXG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJHZXQgdGhlIENoZWF0IFNoZWV0IEhlcmUgOiBodHRwOi8vZ29vLmdsL0NRVlpzV1xcbkJlc3QgT2JqZWN0IE9yaWVudGVkIEphdmFTY3JpcHQgQm9vayA6IGh0dHA6Ly9hbXpuLnRvLzFMME12czhcXG5cXG5TdXBwb3J0IG1lIG9uIFBhdHJlb24gOiBodHRwczovL3d3dy5wYXRyZW9uLmNvbS9kZXJla2JhbmFzXFxuXFxuMDE6NTAgSmF2YVNjcmlwdCBPYmplY3RzXFxuMDI6MzYgT2JqZWN0cyBpbiBPYmplY3RzXFxuMDQ6MTIgQ29uc3RydWN0b3IgRnVuY3Rpb25zXFxuMDU6NTggaW5zdGFuY2VvZlxcbjA2OjI4IFBhc3NpbmcgT2JqZWN0cyB0byBGdW5jdGlvbnNcXG4wODowOSBQcm90b3R5cGVzXFxuMDk6MzQgQWRkaW5nIFByb3BlcnRpZXMgdG8gT2JqZWN0c1xcbjEwOjQ0IExpc3QgUHJvcGVydGllcyBpbiBPYmplY3RzXFxuMTE6MzggaGFzT3duUHJvcGVydHlcXG4xMjo0MiBBZGQgUHJvcGVydGllcyB0byBCdWlsdCBpbiBPYmplY3RzXFxuMTQ6MzEgUHJpdmF0ZSBQcm9wZXJ0aWVzXFxuMTg6MDEgR2V0dGVycyAvIFNldHRlcnNcXG4yMToyMCBkZWZpbmVHZXR0ZXIgLyBkZWZpbmVTZXR0ZXJcXG4yNDozOCBkZWZpbmVQcm9wZXJ0eVxcbjI3OjA3IENvbnN0cnVjdG9yIEZ1bmN0aW9uIEdldHRlcnMgLyBTZXR0ZXJzXFxuMjk6NDAgSW5oZXJpdGFuY2VcXG4zNzoxMyBJbnRlcm1lZGlhdGUgRnVuY3Rpb24gSW5oZXJpdGFuY2VcXG4zOToxNCBDYWxsIFBhcmVudCBGdW5jdGlvbnNcXG40MTo1MSBFQ01BU2NyaXB0IDZcXG40NzozMSBTaW5nbGV0b24gUGF0dGVyblxcbjQ5OjMyIEZhY3RvcnkgUGF0dGVyblxcbjUyOjUzIERlY29yYXRvciBQYXR0ZXJuXFxuNTQ6NTIgT2JzZXJ2ZXIgUGF0dGVyblwiLFxuICAgICAgICBcInRodW1ibmFpbHNcIjoge1xuICAgICAgICAgIFwiZGVmYXVsdFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvTzh3d25oZGtQRTQvZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogMTIwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogOTBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwibWVkaXVtXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9POHd3bmhka1BFNC9tcWRlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDMyMCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDE4MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJoaWdoXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9POHd3bmhka1BFNC9ocWRlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDQ4MCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDM2MFxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJjaGFubmVsVGl0bGVcIjogXCJKdXN0eW4gQ2xhcmtcIixcbiAgICAgICAgXCJwbGF5bGlzdElkXCI6IFwiUExRYUpEd0xYeUJ0WHIxRmUyRlJ6SWRUM1JGZUc1MlFWRlwiLFxuICAgICAgICBcInBvc2l0aW9uXCI6IDIwLFxuICAgICAgICBcInJlc291cmNlSWRcIjoge1xuICAgICAgICAgIFwia2luZFwiOiBcInlvdXR1YmUjdmlkZW9cIixcbiAgICAgICAgICBcInZpZGVvSWRcIjogXCJPOHd3bmhka1BFNFwiXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcImNvbnRlbnREZXRhaWxzXCI6IHtcbiAgICAgICAgXCJ2aWRlb0lkXCI6IFwiTzh3d25oZGtQRTRcIixcbiAgICAgICAgXCJ2aWRlb1B1Ymxpc2hlZEF0XCI6IFwiMjAxNS0wOS0yOFQyMTo1Mjo0Ni4wMDBaXCJcbiAgICAgIH1cbiAgICB9LFxuICAgIHtcblxuXG4gICAgICBcImtpbmRcIjogXCJ5b3V0dWJlI3BsYXlsaXN0SXRlbVwiLFxuICAgICAgXCJldGFnXCI6IFwiXFxcImNiejNsSVEyTjI1QWZ3TnItQmR4VVZ4Sl9RWS9vcUtCOUhSeFFEMUtGOGpJVS1IcjFQNmg3QlVcXFwiXCIsXG4gICAgICBcImlkXCI6IFwiVUV4UllVcEVkMHhZZVVKMFdISXhSbVV5UmxKNlNXUlVNMUpHWlVjMU1sRldSaTVHTTBRM00wTXpNelk1TlRKRk5UZEVcIixcbiAgICAgIFwic25pcHBldFwiOiB7XG4gICAgICAgIFwicHVibGlzaGVkQXRcIjogXCIyMDE3LTAzLTEwVDAyOjM3OjM5LjAwMFpcIixcbiAgICAgICAgXCJjaGFubmVsSWRcIjogXCJVQ1ZNNEMxZkI5UWN3eTdkTmpiWGVVVndcIixcbiAgICAgICAgXCJ0aXRsZVwiOiBcIldvcmRQcmVzcyBSRVNUIEFQSSBUdXRvcmlhbCAoUmVhbCBFeGFtcGxlcylcIixcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkxldCdzIGxlYXJuIGFib3V0IHRoZSBuZXcgV29yZFByZXNzIFJFU1QgQVBJLlxcblxcbkxpbmsgdG8gbXkgd2Vic2l0ZTogaHR0cDovL2xlYXJud2ViY29kZS5jb20vXFxuXFxuTXkgSFRNTCAmIENTUyBDb3Vyc2U6IGh0dHBzOi8vd3d3LnVkZW15LmNvbS93ZWItZGVzaWduLWZvci1iZWdpbm5lcnMtcmVhbC13b3JsZC1jb2RpbmctaW4taHRtbC1jc3MvP2NvdXBvbkNvZGU9WU9VVFVCRS1IQUxGLU9GRlxcblxcbk15IFxcXCJHZXQgYSBEZXZlbG9wZXIgSm9iXFxcIiBjb3Vyc2U6IGh0dHBzOi8vd3d3LnVkZW15LmNvbS9naXQtYS13ZWItZGV2ZWxvcGVyLWpvYi1tYXN0ZXJpbmctdGhlLW1vZGVybi13b3JrZmxvdy8/Y291cG9uQ29kZT1ZT1VUVUJFLUhBTEYtT0ZGXFxuXFxuU3RhcnRlciBBSkFYIENvZGU6IGh0dHA6Ly9jb2RlcGVuLmlvL2Fub24vcGVuL09iQlFxdj9lZGl0b3JzPTAwMTBcXG5cXG5TdGFydGVyIEZvcm0gSFRNTCAmIENTUzogaHR0cDovL2NvZGVwZW4uaW8vYW5vbi9wZW4valZRUEx6P2VkaXRvcnM9MTEwMFxcblxcbkxpbmsgdG8gZG93bmxvYWQgemlwIG9mIGZpbmlzaGVkIHRoZW1lIGZpbGVzOiBodHRwOi8vbGVhcm53ZWJjb2RlLmNvbS93b3JkcHJlc3MtcmVzdC1hcGktdHV0b3JpYWwtcmVhbC1leGFtcGxlcy9cXG5cXG5BZGQgbWUgb24gVHdpdHRlciBmb3Igd2ViRGV2IHJlc291cmNlcyBhbmQgY2F0IHBpY3M6IGh0dHBzOi8vdHdpdHRlci5jb20vbGVhcm53ZWJjb2RlXCIsXG4gICAgICAgIFwidGh1bWJuYWlsc1wiOiB7XG4gICAgICAgICAgXCJkZWZhdWx0XCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9yR09iV3RqeEdCYy9kZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiAxMjAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiA5MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJtZWRpdW1cIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL3JHT2JXdGp4R0JjL21xZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogMzIwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogMTgwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImhpZ2hcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL3JHT2JXdGp4R0JjL2hxZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogNDgwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogMzYwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInN0YW5kYXJkXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9yR09iV3RqeEdCYy9zZGRlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDY0MCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDQ4MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJtYXhyZXNcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL3JHT2JXdGp4R0JjL21heHJlc2RlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDEyODAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiA3MjBcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIFwiY2hhbm5lbFRpdGxlXCI6IFwiSnVzdHluIENsYXJrXCIsXG4gICAgICAgIFwicGxheWxpc3RJZFwiOiBcIlBMUWFKRHdMWHlCdFhyMUZlMkZSeklkVDNSRmVHNTJRVkZcIixcbiAgICAgICAgXCJwb3NpdGlvblwiOiAyMSxcbiAgICAgICAgXCJyZXNvdXJjZUlkXCI6IHtcbiAgICAgICAgICBcImtpbmRcIjogXCJ5b3V0dWJlI3ZpZGVvXCIsXG4gICAgICAgICAgXCJ2aWRlb0lkXCI6IFwickdPYld0anhHQmNcIlxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgXCJjb250ZW50RGV0YWlsc1wiOiB7XG4gICAgICAgIFwidmlkZW9JZFwiOiBcInJHT2JXdGp4R0JjXCIsXG4gICAgICAgIFwidmlkZW9QdWJsaXNoZWRBdFwiOiBcIjIwMTYtMTItMTZUMDQ6NTc6MTMuMDAwWlwiXG4gICAgICB9XG4gICAgfSxcbiAgICB7XG5cblxuICAgICAgXCJraW5kXCI6IFwieW91dHViZSNwbGF5bGlzdEl0ZW1cIixcbiAgICAgIFwiZXRhZ1wiOiBcIlxcXCJjYnozbElRMk4yNUFmd05yLUJkeFVWeEpfUVkva2oxdlFzOFNFelBZMjZob1hmM2xESnFGZ2djXFxcIlwiLFxuICAgICAgXCJpZFwiOiBcIlVFeFJZVXBFZDB4WWVVSjBXSEl4Um1VeVJsSjZTV1JVTTFKR1pVYzFNbEZXUmk0elJqTTBNa1ZDUlRnME1rWXlRVE0wXCIsXG4gICAgICBcInNuaXBwZXRcIjoge1xuICAgICAgICBcInB1Ymxpc2hlZEF0XCI6IFwiMjAxNy0wNC0wMVQwNzowODowMi4wMDBaXCIsXG4gICAgICAgIFwiY2hhbm5lbElkXCI6IFwiVUNWTTRDMWZCOVFjd3k3ZE5qYlhlVVZ3XCIsXG4gICAgICAgIFwidGl0bGVcIjogXCJDYXJ0b29ucyBGb3IgQ2hpbGRyZW4gfCBTdW5ueSBCdW5uaWVzIEVMVVNJVkUgQ0FLRSB8IE5FVyBTRUFTT04gfCBGdW5ueSBDYXJ0b29ucyBGb3IgQ2hpbGRyZW4gfFwiLFxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwi4pa6IFN1YnNjcmliZSB0byBTdW5ueSBCdW5uaWVzIGZvciBuZXcgdmlkZW9zOiAgaHR0cDovL2JpdC5seS8xVWRNR1V5XFxuXFxu4pa6IFdhdGNoIG1vcmUgRnVubnkgQ2FydG9vbnMgZm9yIENoaWxkcmVuIC1cXG5odHRwczovL3d3dy55b3V0dWJlLmNvbS93YXRjaD92PWdwNU1BeTYtTllBJmxpc3Q9UExvUWx4N2Y2TngtUHlzb2tkY09SeUgxX1ZHQURGbHR0eSZpbmRleD0yXFxuXFxu4pa6IFdhdGNoIG1vcmUgQ2FydG9vbnMgZm9yIENoaWxkcmVuIC1cXG5odHRwczovL3d3dy55b3V0dWJlLmNvbS93YXRjaD92PTQ2Y19TZE5abFdrJmxpc3Q9UExvUWx4N2Y2TngtUHlzb2tkY09SeUgxX1ZHQURGbHR0eSZpbmRleD0zXFxuXFxu4pa6IFdhdGNoIG1vcmUgU3VubnkgQnVubmllcyAtXFxuaHR0cHM6Ly93d3cueW91dHViZS5jb20vd2F0Y2g/dj04allfTnF5Z0tMVSZsaXN0PVBMb1FseDdmNk54LVB5c29rZGNPUnlIMV9WR0FERmx0dHkmaW5kZXg9NFxcblxcbktpZHMgYXJlIGNhcGFibGUgb2YgY29taW5nIHVwIHdpdGggdGhlIG1vc3QgdW5yZWFsIGFuZCBmYW50YXN0aWMgY3JlYXR1cmVzIGluIHRoZWlyIG1pbmRzLiBTaGFkb3dzIGFyZSBzZWVuIGFzIGJsZWFrIGFuZCBnbG9vbXksIHdoaWxlIHN1bmJlYW1zIGFyZSBhc3NvY2lhdGVkIHdpdGggbGlnaHQgYW5kIGhhcHBpbmVzcywgYW5kIGNhbiBjcmVhdGUgZnVubnkgaW1hZ2VzLiBXaGF0IGlmIHRoZXNlIGZhbnRhc2llcyBjYW1lIGFsaXZlPyBXaGF0IGlmIHRoZXkgY291bGQganVtcCBvdXQgb2YgdGhlIHN1bmxpZ2h0P1xcblxcblRoZSBTdW5ueSBCdW5uaWVzIGFyZSBmaXZlIGJlYW1pbmcgYmFsbHMgb2YgbGlnaHQgdGhhdCBjYW4gYXBwZWFyIGFueXdoZXJlIHRoZXJlIGlzIGEgbGlnaHQgc291cmNlLiBXaGV0aGVyIGl0IGlzIHN1bmxpZ2h0IG9yIG1vb25saWdodCwgdGhleSBicmluZyBmdW4gYW5kIGhhcHBpbmVzcyBldmVyeXdoZXJlIHRoZXkgZ28uIEhvd2V2ZXIsIGVhY2ggdGltZSB0aGV5IGFwcGVhciB0aGVpciBhY3Rpb25zIHR1cm4gaW50byBhIG1pc2NoaWV2b3VzIGdhbWUuIFNvbWV0aW1lcyB0b28gbWlzY2hpZXZvdXMuXFxuXFxuSW4gZWFjaCBlcGlzb2RlLCBTdW5ueSBCdW5uaWVzIGFwcGVhciBhdCBhIGRpZmZlcmVudCBsb2NhdGlvbjogYSBjaXJjdXMsIGEgc3RhZGl1bSwgYSBjYXJyb3VzZWwsIGEgcGFyaywgYSBzdGFnZeKApiBUaGV5IGltbWVkaWF0ZWx5IHN0YXJ0IHRvIGludmVzdGlnYXRlIHRoZWlyIHN1cnJvdW5kaW5ncyBhbmQgdGhhdOKAmXMgd2hlbiB0aGUgZnVuIGFuZCBtaXNjaGllZiBiZWdpbiEgQXQgdGhlIHZlcnkgZW5kIG9mIGV2ZXJ5IGVwaXNvZGUsIHRoZSBsYXVnaHRlciBjb250aW51ZXMgd2l0aCBhIGNvbGxlY3Rpb24gb2YgYmxvb3BlcnMuXCIsXG4gICAgICAgIFwidGh1bWJuYWlsc1wiOiB7XG4gICAgICAgICAgXCJkZWZhdWx0XCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9RWDdpYUdjQXlUNC9kZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiAxMjAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiA5MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJtZWRpdW1cIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL1FYN2lhR2NBeVQ0L21xZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogMzIwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogMTgwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImhpZ2hcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL1FYN2lhR2NBeVQ0L2hxZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogNDgwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogMzYwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInN0YW5kYXJkXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9RWDdpYUdjQXlUNC9zZGRlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDY0MCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDQ4MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJtYXhyZXNcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL1FYN2lhR2NBeVQ0L21heHJlc2RlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDEyODAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiA3MjBcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIFwiY2hhbm5lbFRpdGxlXCI6IFwiSnVzdHluIENsYXJrXCIsXG4gICAgICAgIFwicGxheWxpc3RJZFwiOiBcIlBMUWFKRHdMWHlCdFhyMUZlMkZSeklkVDNSRmVHNTJRVkZcIixcbiAgICAgICAgXCJwb3NpdGlvblwiOiAyMixcbiAgICAgICAgXCJyZXNvdXJjZUlkXCI6IHtcbiAgICAgICAgICBcImtpbmRcIjogXCJ5b3V0dWJlI3ZpZGVvXCIsXG4gICAgICAgICAgXCJ2aWRlb0lkXCI6IFwiUVg3aWFHY0F5VDRcIlxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgXCJjb250ZW50RGV0YWlsc1wiOiB7XG4gICAgICAgIFwidmlkZW9JZFwiOiBcIlFYN2lhR2NBeVQ0XCIsXG4gICAgICAgIFwidmlkZW9QdWJsaXNoZWRBdFwiOiBcIjIwMTctMDItMTBUMTE6NDc6NTQuMDAwWlwiXG4gICAgICB9XG4gICAgfSxcbiAgICB7XG5cblxuICAgICAgXCJraW5kXCI6IFwieW91dHViZSNwbGF5bGlzdEl0ZW1cIixcbiAgICAgIFwiZXRhZ1wiOiBcIlxcXCJjYnozbElRMk4yNUFmd05yLUJkeFVWeEpfUVkvM3JjcFpCZFl4Mk1SSHlhcTFoOXpmRFpyOVFFXFxcIlwiLFxuICAgICAgXCJpZFwiOiBcIlVFeFJZVXBFZDB4WWVVSjBXSEl4Um1VeVJsSjZTV1JVTTFKR1pVYzFNbEZXUmk0NU56VXdRa0kxTTBVeE5UaEJNa1UwXCIsXG4gICAgICBcInNuaXBwZXRcIjoge1xuICAgICAgICBcInB1Ymxpc2hlZEF0XCI6IFwiMjAxNy0wNC0xNlQxNzoyODoxNy4wMDBaXCIsXG4gICAgICAgIFwiY2hhbm5lbElkXCI6IFwiVUNWTTRDMWZCOVFjd3k3ZE5qYlhlVVZ3XCIsXG4gICAgICAgIFwidGl0bGVcIjogXCJKYXZhU2NyaXB0IGFuZCB0aGUgRE9NIChQYXJ0IDEgb2YgMilcIixcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIlRvZGF5IEBhZGFtcmVjdmxvaGUgd2Fsa3MgdXMgdGhyb3VnaCBzb21lIGZ1bmN0aW9uYWwgSlMgcHJvZ3JhbW1pbmcgdGVjaG5pcXVlcyBpbiBQYXJ0IDEgb2YgYSAyIHBhcnQgSmF2YXNjcmlwdCBzZXJpZXMhXFxuXFxuUHJvamVjdCBDb2RlIC0gaHR0cDovL2NvZGVwZW4uaW8vYXJlY3Zsb2hlL3Blbi9yZXBYZGVcXG5cXG4tIC0gLVxcblxcblRoaXMgdmlkZW8gd2FzIHNwb25zb3JlZCBieSB0aGUgRGV2VGlwcyBQYXRyb24gQ29tbXVuaXR5IC0gaHR0cHM6Ly93d3cucGF0cmVvbi5jb20vRGV2VGlwc1xcblxcbkxpc3RlbiB0byBUcmF2aXMnIFBvZGNhc3QgLSBodHRwOi8vd3d3LnRyYXZhbmRsb3MuY29tL1xcblxcbkdldCBhd2Vzb21lbmVzcyBlbWFpbGVkIHRvIHlvdSBldmVyeSB0aHVyc2RheSAtIGh0dHA6Ly90cmF2aXNuZWlsc29uLmNvbS9ub3RlcyBcXG5cXG5Zb3Ugc2hvdWxkIGZvbGxvdyBEZXZUaXBzIG9uIFR3aXR0ZXIgLSBodHRwczovL3R3aXR0ZXIuY29tL0RldlRpcHNTaG93XCIsXG4gICAgICAgIFwidGh1bWJuYWlsc1wiOiB7XG4gICAgICAgICAgXCJkZWZhdWx0XCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9oTTloMXdONHJmVS9kZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiAxMjAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiA5MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJtZWRpdW1cIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL2hNOWgxd040cmZVL21xZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogMzIwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogMTgwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImhpZ2hcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL2hNOWgxd040cmZVL2hxZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogNDgwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogMzYwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInN0YW5kYXJkXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9oTTloMXdONHJmVS9zZGRlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDY0MCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDQ4MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJtYXhyZXNcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL2hNOWgxd040cmZVL21heHJlc2RlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDEyODAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiA3MjBcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIFwiY2hhbm5lbFRpdGxlXCI6IFwiSnVzdHluIENsYXJrXCIsXG4gICAgICAgIFwicGxheWxpc3RJZFwiOiBcIlBMUWFKRHdMWHlCdFhyMUZlMkZSeklkVDNSRmVHNTJRVkZcIixcbiAgICAgICAgXCJwb3NpdGlvblwiOiAyMyxcbiAgICAgICAgXCJyZXNvdXJjZUlkXCI6IHtcbiAgICAgICAgICBcImtpbmRcIjogXCJ5b3V0dWJlI3ZpZGVvXCIsXG4gICAgICAgICAgXCJ2aWRlb0lkXCI6IFwiaE05aDF3TjRyZlVcIlxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgXCJjb250ZW50RGV0YWlsc1wiOiB7XG4gICAgICAgIFwidmlkZW9JZFwiOiBcImhNOWgxd040cmZVXCIsXG4gICAgICAgIFwidmlkZW9QdWJsaXNoZWRBdFwiOiBcIjIwMTYtMDUtMDJUMTU6MzQ6MzcuMDAwWlwiXG4gICAgICB9XG4gICAgfSxcbiAgICB7XG5cblxuICAgICAgXCJraW5kXCI6IFwieW91dHViZSNwbGF5bGlzdEl0ZW1cIixcbiAgICAgIFwiZXRhZ1wiOiBcIlxcXCJjYnozbElRMk4yNUFmd05yLUJkeFVWeEpfUVkvVGdqM1JDQUlmZjY3OW14aHhVTGp1clMxa24wXFxcIlwiLFxuICAgICAgXCJpZFwiOiBcIlVFeFJZVXBFZDB4WWVVSjBXSEl4Um1VeVJsSjZTV1JVTTFKR1pVYzFNbEZXUmk1RE56RTFSalpFTVVaQ01qQTBSREJCXCIsXG4gICAgICBcInNuaXBwZXRcIjoge1xuICAgICAgICBcInB1Ymxpc2hlZEF0XCI6IFwiMjAxNy0wNS0wNVQwNToxODozOC4wMDBaXCIsXG4gICAgICAgIFwiY2hhbm5lbElkXCI6IFwiVUNWTTRDMWZCOVFjd3k3ZE5qYlhlVVZ3XCIsXG4gICAgICAgIFwidGl0bGVcIjogXCJMZWFybiBOdW1iZXJzIHdpdGggQ291bnRpbmcgYW5kIExlYXJuIENvbG9ycyB3aXRoIFdhdGVyIEJhbGxvb25zIGZvciBDaGlsZHJlbiwgVG9kZGxlcnMgYW5kIEJhYmllc1wiLFxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiQSBHcmVhdCBhbmQgRnVuIFdheSB0byBMZWFybiBOdW1iZXJzIGFuZCBUbyBMZWFybiB0byBDb3VudCBpcyBieSB1c2luZyBDb2xvdXJzIFdhdGVyIEJhbGxvb25zISBXZSBMaW5lZCB0aGVtIHVwIGluIGRpZmZlcmVudHMgQ29sb3JzLCBzbyBDaGlsZHJlbiwgVG9kZGxlcnMgYW5kIEJhYmllcyBhbHNvIGNhbiBMZWFybiBDb2xvcnMhIEhhdmUgRnVuIHdhdGNoaW5nIHRoaXMgRWR1Y2F0aW9uYWwgdmlkZW8sIGhhdmUgZnVuIExlYXJuaW5nIVxcblxcbldlbGNvbWUgdG8gb3VyIGNoYW5uZWwsIEZ1blRveXNNZWRpYS4gXFxuXFxuV2UgQ3JlYXRlIEVkdWNhdGlvbmFsIGFuZCBUb3lzIHZpZGVvcyBmb3IgS2lkcyBieSBhIEtpZCFcXG5PdXIgS2lkIEphc29uIHBsYXlzIGluIHRoZSBWaWRlb3MgYW5kIGhlIGxvdmVzIHRvIHRlYWNoIENvbG9ycywgTnVtYmVycywgTGV0dGVycyBhbmQgbW9yZSEgXFxuV2UgYWxzbyBkbyBGdW4gU2tldGNoZXMuXFxuT3VyIEtpZHMgdmlkZW9zIGFyZSBmdW4gYW5kIGV4Y2l0aW5nIHRvIHdhdGNoLiBcXG5cXG5CYWQgQmFieSBNYWdpYyBhbmQgTGVhcm4gQ29sb3JzIHdpdGggQmFkIEdob3N0cyBmb3IgS2lkcyB8IEJhZCBLaWQgTGVhcm5zIENvbG91cnMgXFxuaHR0cHM6Ly93d3cueW91dHViZS5jb20vd2F0Y2g/dj1aNjB2bkRoY2dnZ1xcblxcblN1cGVyIEhlcm8gU2FjayBSYWNlIEZvciBLaWRzIHdpdGggU3VwZXJtYW4gYW5kIFNwaWRlcm1hbiB8IExlYXJuIE51bWJlcnMgZm9yIENoaWxkcmVuIFBsYXkgQWN0aXZpdHkgXFxuaHR0cHM6Ly93d3cueW91dHViZS5jb20vd2F0Y2g/dj1DX05ac1VJd25rMFxcblxcbkxlYXJuIEZydWl0cyB3aXRoIFNtb290aGllcyBmb3IgQ2hpbGRyZW4gYW5kIFRvZGRsZXJzIHwgTGVhcm4gQ29sb3JzIHdpdGggRnJ1aXRzIFRhc3RlIENoYWxsZW5nZSBcXG5odHRwczovL3d3dy55b3V0dWJlLmNvbS93YXRjaD92PTUtU3Z2NzVJRXl3XFxuXFxuTGVhcm4gQ29sb3VycyBhbmQgUG9wcGluZyBXYXRlciBCYWxsb29ucyBmb3IgQ2hpbGRyZW4gYW5kIFRvZGRsZXJzIHwgQmFkIEtpZCBMZWFybnMgQ29sb3JzIFxcbmh0dHBzOi8vd3d3LnlvdXR1YmUuY29tL3dhdGNoP3Y9TktWSTdfdkp6MDRcXG5cXG5MZWFybiBDb2xvcnMgd2l0aCBCYWQgQmFieSBDcnlpbmcgR3VtYmFsbCBCb3R0bGVzIGZvciBCYWJpZXMgfCBGaW5nZXIgRmFtaWx5IFNvbmcgTnVyc2VyeSBSaHltZXMgXFxuaHR0cHM6Ly93d3cueW91dHViZS5jb20vd2F0Y2g/dj16dUlLSFY4bDNXOFxcblxcbkJhZCBCYWJ5IENyeWluZyBMZWFybiBDb2xvcnMgZm9yIFRvZGRsZXJzIGFuZCBCYWJpZXMgfCBGaW5nZXIgRmFtaWx5IFNvbmcgQmFieSBOdXJzZXJ5IFJoeW1lcyBcXG5odHRwczovL3d3dy55b3V0dWJlLmNvbS93YXRjaD92PVNPZU80Umx3QmRzXFxuXFxuTGVhcm4gQ29sb3JzIHdpdGggU2tpcHB5IEJhbGxzIGZvciBDaGlsZHJlbiwgVG9kZGxlcnMgYW5kIEJhYmllcyB8IEZ1bm55IEZhY2VzIFNraXBweSBCYWxscyBDb2xvdXJzIFxcbmh0dHBzOi8vd3d3LnlvdXR1YmUuY29tL3dhdGNoP3Y9U3loNEZxakNoZVFcXG5cXG5MZWFybiBDb2xvcnMgd2l0aCBGb290IE51cnNlcnkgU29uZ3MgZm9yIENoaWxkcmVuLCBUb2RkbGVycyBhbmQgQmFiaWVzIHwgS2lkcyBGaW5nZXIgRmFtaWx5IFNvbmdzIFxcbmh0dHBzOi8vd3d3LnlvdXR1YmUuY29tL3dhdGNoP3Y9cmdjejdEMmFyMVVcXG5cXG5MZWFybiBNb250aHMgb2YgdGhlIFllYXIgZm9yIENoaWxkcmVuIGFuZCBUb2RkbGVycyBhbmQgTGVhcm4gQ29sb3JzIGZvciBLaWRzIEVkdWNhdGlvbmFsIFZpZGVvIFxcbmh0dHBzOi8vd3d3LnlvdXR1YmUuY29tL3dhdGNoP3Y9WEg1WHVpMFVKVU1cXG5cXG5MZWFybiBOdW1iZXJzIGFuZCBDb2xvcnMgd2l0aCBCdWNrZXRzIGZvciBDaGlsZHJlbiBhbmQgVG9kZGxlcnMgfCBUaHJvdyBDb2xvdXJzIFdhdGVyIEJhbGxvb25zIEdhbWUgXFxuaHR0cHM6Ly93d3cueW91dHViZS5jb20vd2F0Y2g/dj01cjZfLWd1VkFNZ1xcblxcbkxlYXJuIE51bWJlcnMgYW5kIENvbG9ycyB3aXRoIENob2NvbGF0ZSBFYXN0ZXIgRWdncyBmb3IgQ2hpbGRyZW4sIFRvZGRsZXJzIGFuZCBCYWJpZXMgXFxuaHR0cHM6Ly93d3cueW91dHViZS5jb20vd2F0Y2g/dj1MTlZSLXRRck1UMFwiLFxuICAgICAgICBcInRodW1ibmFpbHNcIjoge1xuICAgICAgICAgIFwiZGVmYXVsdFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvVkxJOVJ1QlluZDQvZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogMTIwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogOTBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwibWVkaXVtXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9WTEk5UnVCWW5kNC9tcWRlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDMyMCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDE4MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJoaWdoXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9WTEk5UnVCWW5kNC9ocWRlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDQ4MCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDM2MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJzdGFuZGFyZFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvVkxJOVJ1QlluZDQvc2RkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiA2NDAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiA0ODBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwibWF4cmVzXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9WTEk5UnVCWW5kNC9tYXhyZXNkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiAxMjgwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogNzIwXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcImNoYW5uZWxUaXRsZVwiOiBcIkp1c3R5biBDbGFya1wiLFxuICAgICAgICBcInBsYXlsaXN0SWRcIjogXCJQTFFhSkR3TFh5QnRYcjFGZTJGUnpJZFQzUkZlRzUyUVZGXCIsXG4gICAgICAgIFwicG9zaXRpb25cIjogMjQsXG4gICAgICAgIFwicmVzb3VyY2VJZFwiOiB7XG4gICAgICAgICAgXCJraW5kXCI6IFwieW91dHViZSN2aWRlb1wiLFxuICAgICAgICAgIFwidmlkZW9JZFwiOiBcIlZMSTlSdUJZbmQ0XCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwiY29udGVudERldGFpbHNcIjoge1xuICAgICAgICBcInZpZGVvSWRcIjogXCJWTEk5UnVCWW5kNFwiLFxuICAgICAgICBcInZpZGVvUHVibGlzaGVkQXRcIjogXCIyMDE3LTA1LTA0VDAyOjAwOjM2LjAwMFpcIlxuICAgICAgfVxuICAgIH1cbiAgXVxufVxuIl19
