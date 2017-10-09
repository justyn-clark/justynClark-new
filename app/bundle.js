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

require('./js/modules/canIUseData');

require('./js/modules/input');

require('./js/modules/weirdCase');

},{"./js/modules/canIUseData":4,"./js/modules/config":5,"./js/modules/global":7,"./js/modules/handleClicks":8,"./js/modules/input":9,"./js/modules/utils":11,"./js/modules/weirdCase":12}],4:[function(require,module,exports){
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

      if (true) {
        for (var i in canIUseData.data) {
          titles += "<div class='data__item'>";
          titles += "<h5>" + canIUseData.data[i].title + "</h5>";
          titles += "<p>" + canIUseData.data[i].description + "</p>";
          titles += "<a href=" + canIUseData.data[i].links[0].url + ">" + "link" + "</a>";
          titles += "</div>";
        }
      }

      canIData.innerHTML = titles;
    });
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

var config = JC.config = {};
config.project = 'justynClark-new';
config.developer = 'justyn clark';
config.version = "1.0.0";

},{}],6:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

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

var setPolicyCookie = exports.setPolicyCookie = function setPolicyCookie() {
  document.querySelector('.cookie-policy').classList.add('cookie-policy--hide');
  console.log('cookie set');
  JC.utils.setCookie('jcCookie', true, { expireDate: 3600 * 24 * 365 });
};

},{}],7:[function(require,module,exports){
'use strict';

var _eventemitter = require('eventemitter2');

var _eventemitter2 = _interopRequireDefault(_eventemitter);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

(function (global) {

  global.JC = global.JC !== undefined ? JC : {}; // Set up global variables

  JC.components = {};
  JC.config = {};
  JC.menu = {};
  JC.utils = {};

  global.EVT = new _eventemitter2.default();

  global.addEventListener('DOMContentLoaded', function () {
    EVT.emit('init');
  });

  console.log(JC);

  var str = 'ES6';
  console.log('Hello ' + str);
})(window);

},{"eventemitter2":1}],8:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.clickHandlers = undefined;

var _cookies = require('./cookies');

var _loadNames = require('./loadNames');

// Set up click handlers
var clickHandlers = exports.clickHandlers = function clickHandlers() {
  var adder = JC.utils.adder();
  document.querySelector('[rel="main__loadNames"]').addEventListener('click', _loadNames.loadNames);
  document.querySelector('[rel="main__openOverlay"]').addEventListener('click', JC.utils.openOverlay); // open overlay
  document.querySelector('.overlay').addEventListener('click', JC.utils.closeOverlay); // close overlay
  document.querySelector('[rel="main__clicker"]').addEventListener('click', function () {
    document.querySelector('[rel="main__clicker"]').innerHTML = adder();
  });
  document.querySelector('.cookie-policy__close').addEventListener('click', _cookies.setPolicyCookie); // Cookie Policy
};

EVT.on('init', clickHandlers);

},{"./cookies":6,"./loadNames":10}],9:[function(require,module,exports){
'use strict';

(function () {

  var answers = [];

  var form = document.querySelector('.form');

  var inputFunc = function inputFunc(e) {
    e.preventDefault();

    var inputValue = document.querySelector('[name=item]').value;

    answers.push(inputValue);

    localStorage.setItem('answers', JSON.stringify(answers));

    var answersObj = JSON.parse(localStorage.getItem('answers'));

    console.log(answersObj);

    localStorage.setItem(JC.utils.randomNumber(), inputValue);

    //this.reset();
  };

  form.addEventListener('submit', inputFunc);
})();

},{}],10:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
var loadNames = exports.loadNames = function loadNames() {
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

        var names = data[i].name + "<br>";
      }

      document.querySelector('[rel=copySection]').innerHTML = names;
    }
  };
  request.send();
};

},{}],11:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.randNumGen = randNumGen;
exports.coolFunk = coolFunk;

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

JC.utils.randomNumber = function () {
  return Math.floor(Math.random() * 1000);
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
  overlay.classList.toggle('overlay--open');
  console.log('overlay open');
};

JC.utils.closeOverlay = function () {
  var overlay = document.querySelector('.overlay');
  overlay.classList.remove('overlay--open');
  console.log('overlay closed');
};

function randNumGen(max) {
  return Math.floor(Math.random() * max);
};

function coolFunk() {
  console.log('this love is taking a hold of me');
};

},{"./cookies":6}],12:[function(require,module,exports){
'use strict';

function getIndex(val, index) {
  if (index % 2 == 0) {
    return val.toUpperCase();
  }
  if (index % 2 == 1) {
    return val.toLowerCase();
  }
}

function toUpperLower(string) {
  return string.split('').map(getIndex).join('');
};

function toWeirdCase(text) {
  return text.split(' ').map(function (val) {
    return toUpperLower(val);
  }).join(' ');
}

console.log(toWeirdCase('Weird string case'));

},{}]},{},[3])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvZXZlbnRlbWl0dGVyMi9saWIvZXZlbnRlbWl0dGVyMi5qcyIsIm5vZGVfbW9kdWxlcy9wcm9jZXNzL2Jyb3dzZXIuanMiLCJzcmMvYXBwLmpzIiwic3JjL2pzL21vZHVsZXMvY2FuSVVzZURhdGEuanMiLCJzcmMvanMvbW9kdWxlcy9jb25maWcuanMiLCJzcmMvanMvbW9kdWxlcy9jb29raWVzLmpzIiwic3JjL2pzL21vZHVsZXMvZ2xvYmFsLmpzIiwic3JjL2pzL21vZHVsZXMvaGFuZGxlQ2xpY2tzLmpzIiwic3JjL2pzL21vZHVsZXMvaW5wdXQuanMiLCJzcmMvanMvbW9kdWxlcy9sb2FkTmFtZXMuanMiLCJzcmMvanMvbW9kdWxlcy91dGlscy5qcyIsInNyYy9qcy9tb2R1bGVzL3dlaXJkQ2FzZS5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7QUN4d0JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7QUN4TEE7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7Ozs7O0FDTkEsQ0FBQyxVQUFTLEVBQVQsRUFBYTs7QUFFWixNQUFJLFdBQVcsU0FBUyxhQUFULENBQXVCLFdBQXZCLENBQWY7QUFDQSxNQUFJLFdBQVcsU0FB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Q0FBWiIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCIvKiFcclxuICogRXZlbnRFbWl0dGVyMlxyXG4gKiBodHRwczovL2dpdGh1Yi5jb20vaGlqMW54L0V2ZW50RW1pdHRlcjJcclxuICpcclxuICogQ29weXJpZ2h0IChjKSAyMDEzIGhpajFueFxyXG4gKiBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIGxpY2Vuc2UuXHJcbiAqL1xyXG47IWZ1bmN0aW9uKHVuZGVmaW5lZCkge1xyXG5cclxuICB2YXIgaXNBcnJheSA9IEFycmF5LmlzQXJyYXkgPyBBcnJheS5pc0FycmF5IDogZnVuY3Rpb24gX2lzQXJyYXkob2JqKSB7XHJcbiAgICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKG9iaikgPT09IFwiW29iamVjdCBBcnJheV1cIjtcclxuICB9O1xyXG4gIHZhciBkZWZhdWx0TWF4TGlzdGVuZXJzID0gMTA7XHJcblxyXG4gIGZ1bmN0aW9uIGluaXQoKSB7XHJcbiAgICB0aGlzLl9ldmVudHMgPSB7fTtcclxuICAgIGlmICh0aGlzLl9jb25mKSB7XHJcbiAgICAgIGNvbmZpZ3VyZS5jYWxsKHRoaXMsIHRoaXMuX2NvbmYpO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gY29uZmlndXJlKGNvbmYpIHtcclxuICAgIGlmIChjb25mKSB7XHJcbiAgICAgIHRoaXMuX2NvbmYgPSBjb25mO1xyXG5cclxuICAgICAgY29uZi5kZWxpbWl0ZXIgJiYgKHRoaXMuZGVsaW1pdGVyID0gY29uZi5kZWxpbWl0ZXIpO1xyXG4gICAgICB0aGlzLl9tYXhMaXN0ZW5lcnMgPSBjb25mLm1heExpc3RlbmVycyAhPT0gdW5kZWZpbmVkID8gY29uZi5tYXhMaXN0ZW5lcnMgOiBkZWZhdWx0TWF4TGlzdGVuZXJzO1xyXG5cclxuICAgICAgY29uZi53aWxkY2FyZCAmJiAodGhpcy53aWxkY2FyZCA9IGNvbmYud2lsZGNhcmQpO1xyXG4gICAgICBjb25mLm5ld0xpc3RlbmVyICYmICh0aGlzLm5ld0xpc3RlbmVyID0gY29uZi5uZXdMaXN0ZW5lcik7XHJcbiAgICAgIGNvbmYudmVyYm9zZU1lbW9yeUxlYWsgJiYgKHRoaXMudmVyYm9zZU1lbW9yeUxlYWsgPSBjb25mLnZlcmJvc2VNZW1vcnlMZWFrKTtcclxuXHJcbiAgICAgIGlmICh0aGlzLndpbGRjYXJkKSB7XHJcbiAgICAgICAgdGhpcy5saXN0ZW5lclRyZWUgPSB7fTtcclxuICAgICAgfVxyXG4gICAgfSBlbHNlIHtcclxuICAgICAgdGhpcy5fbWF4TGlzdGVuZXJzID0gZGVmYXVsdE1heExpc3RlbmVycztcclxuICAgIH1cclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIGxvZ1Bvc3NpYmxlTWVtb3J5TGVhayhjb3VudCwgZXZlbnROYW1lKSB7XHJcbiAgICB2YXIgZXJyb3JNc2cgPSAnKG5vZGUpIHdhcm5pbmc6IHBvc3NpYmxlIEV2ZW50RW1pdHRlciBtZW1vcnkgJyArXHJcbiAgICAgICAgJ2xlYWsgZGV0ZWN0ZWQuICcgKyBjb3VudCArICcgbGlzdGVuZXJzIGFkZGVkLiAnICtcclxuICAgICAgICAnVXNlIGVtaXR0ZXIuc2V0TWF4TGlzdGVuZXJzKCkgdG8gaW5jcmVhc2UgbGltaXQuJztcclxuXHJcbiAgICBpZih0aGlzLnZlcmJvc2VNZW1vcnlMZWFrKXtcclxuICAgICAgZXJyb3JNc2cgKz0gJyBFdmVudCBuYW1lOiAnICsgZXZlbnROYW1lICsgJy4nO1xyXG4gICAgfVxyXG5cclxuICAgIGlmKHR5cGVvZiBwcm9jZXNzICE9PSAndW5kZWZpbmVkJyAmJiBwcm9jZXNzLmVtaXRXYXJuaW5nKXtcclxuICAgICAgdmFyIGUgPSBuZXcgRXJyb3IoZXJyb3JNc2cpO1xyXG4gICAgICBlLm5hbWUgPSAnTWF4TGlzdGVuZXJzRXhjZWVkZWRXYXJuaW5nJztcclxuICAgICAgZS5lbWl0dGVyID0gdGhpcztcclxuICAgICAgZS5jb3VudCA9IGNvdW50O1xyXG4gICAgICBwcm9jZXNzLmVtaXRXYXJuaW5nKGUpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgY29uc29sZS5lcnJvcihlcnJvck1zZyk7XHJcblxyXG4gICAgICBpZiAoY29uc29sZS50cmFjZSl7XHJcbiAgICAgICAgY29uc29sZS50cmFjZSgpO1xyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBFdmVudEVtaXR0ZXIoY29uZikge1xyXG4gICAgdGhpcy5fZXZlbnRzID0ge307XHJcbiAgICB0aGlzLm5ld0xpc3RlbmVyID0gZmFsc2U7XHJcbiAgICB0aGlzLnZlcmJvc2VNZW1vcnlMZWFrID0gZmFsc2U7XHJcbiAgICBjb25maWd1cmUuY2FsbCh0aGlzLCBjb25mKTtcclxuICB9XHJcbiAgRXZlbnRFbWl0dGVyLkV2ZW50RW1pdHRlcjIgPSBFdmVudEVtaXR0ZXI7IC8vIGJhY2t3YXJkcyBjb21wYXRpYmlsaXR5IGZvciBleHBvcnRpbmcgRXZlbnRFbWl0dGVyIHByb3BlcnR5XHJcblxyXG4gIC8vXHJcbiAgLy8gQXR0ZW50aW9uLCBmdW5jdGlvbiByZXR1cm4gdHlwZSBub3cgaXMgYXJyYXksIGFsd2F5cyAhXHJcbiAgLy8gSXQgaGFzIHplcm8gZWxlbWVudHMgaWYgbm8gYW55IG1hdGNoZXMgZm91bmQgYW5kIG9uZSBvciBtb3JlXHJcbiAgLy8gZWxlbWVudHMgKGxlYWZzKSBpZiB0aGVyZSBhcmUgbWF0Y2hlc1xyXG4gIC8vXHJcbiAgZnVuY3Rpb24gc2VhcmNoTGlzdGVuZXJUcmVlKGhhbmRsZXJzLCB0eXBlLCB0cmVlLCBpKSB7XHJcbiAgICBpZiAoIXRyZWUpIHtcclxuICAgICAgcmV0dXJuIFtdO1xyXG4gICAgfVxyXG4gICAgdmFyIGxpc3RlbmVycz1bXSwgbGVhZiwgbGVuLCBicmFuY2gsIHhUcmVlLCB4eFRyZWUsIGlzb2xhdGVkQnJhbmNoLCBlbmRSZWFjaGVkLFxyXG4gICAgICAgIHR5cGVMZW5ndGggPSB0eXBlLmxlbmd0aCwgY3VycmVudFR5cGUgPSB0eXBlW2ldLCBuZXh0VHlwZSA9IHR5cGVbaSsxXTtcclxuICAgIGlmIChpID09PSB0eXBlTGVuZ3RoICYmIHRyZWUuX2xpc3RlbmVycykge1xyXG4gICAgICAvL1xyXG4gICAgICAvLyBJZiBhdCB0aGUgZW5kIG9mIHRoZSBldmVudChzKSBsaXN0IGFuZCB0aGUgdHJlZSBoYXMgbGlzdGVuZXJzXHJcbiAgICAgIC8vIGludm9rZSB0aG9zZSBsaXN0ZW5lcnMuXHJcbiAgICAgIC8vXHJcbiAgICAgIGlmICh0eXBlb2YgdHJlZS5fbGlzdGVuZXJzID09PSAnZnVuY3Rpb24nKSB7XHJcbiAgICAgICAgaGFuZGxlcnMgJiYgaGFuZGxlcnMucHVzaCh0cmVlLl9saXN0ZW5lcnMpO1xyXG4gICAgICAgIHJldHVybiBbdHJlZV07XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgZm9yIChsZWFmID0gMCwgbGVuID0gdHJlZS5fbGlzdGVuZXJzLmxlbmd0aDsgbGVhZiA8IGxlbjsgbGVhZisrKSB7XHJcbiAgICAgICAgICBoYW5kbGVycyAmJiBoYW5kbGVycy5wdXNoKHRyZWUuX2xpc3RlbmVyc1tsZWFmXSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBbdHJlZV07XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBpZiAoKGN1cnJlbnRUeXBlID09PSAnKicgfHwgY3VycmVudFR5cGUgPT09ICcqKicpIHx8IHRyZWVbY3VycmVudFR5cGVdKSB7XHJcbiAgICAgIC8vXHJcbiAgICAgIC8vIElmIHRoZSBldmVudCBlbWl0dGVkIGlzICcqJyBhdCB0aGlzIHBhcnRcclxuICAgICAgLy8gb3IgdGhlcmUgaXMgYSBjb25jcmV0ZSBtYXRjaCBhdCB0aGlzIHBhdGNoXHJcbiAgICAgIC8vXHJcbiAgICAgIGlmIChjdXJyZW50VHlwZSA9PT0gJyonKSB7XHJcbiAgICAgICAgZm9yIChicmFuY2ggaW4gdHJlZSkge1xyXG4gICAgICAgICAgaWYgKGJyYW5jaCAhPT0gJ19saXN0ZW5lcnMnICYmIHRyZWUuaGFzT3duUHJvcGVydHkoYnJhbmNoKSkge1xyXG4gICAgICAgICAgICBsaXN0ZW5lcnMgPSBsaXN0ZW5lcnMuY29uY2F0KHNlYXJjaExpc3RlbmVyVHJlZShoYW5kbGVycywgdHlwZSwgdHJlZVticmFuY2hdLCBpKzEpKTtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIGxpc3RlbmVycztcclxuICAgICAgfSBlbHNlIGlmKGN1cnJlbnRUeXBlID09PSAnKionKSB7XHJcbiAgICAgICAgZW5kUmVhY2hlZCA9IChpKzEgPT09IHR5cGVMZW5ndGggfHwgKGkrMiA9PT0gdHlwZUxlbmd0aCAmJiBuZXh0VHlwZSA9PT0gJyonKSk7XHJcbiAgICAgICAgaWYoZW5kUmVhY2hlZCAmJiB0cmVlLl9saXN0ZW5lcnMpIHtcclxuICAgICAgICAgIC8vIFRoZSBuZXh0IGVsZW1lbnQgaGFzIGEgX2xpc3RlbmVycywgYWRkIGl0IHRvIHRoZSBoYW5kbGVycy5cclxuICAgICAgICAgIGxpc3RlbmVycyA9IGxpc3RlbmVycy5jb25jYXQoc2VhcmNoTGlzdGVuZXJUcmVlKGhhbmRsZXJzLCB0eXBlLCB0cmVlLCB0eXBlTGVuZ3RoKSk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBmb3IgKGJyYW5jaCBpbiB0cmVlKSB7XHJcbiAgICAgICAgICBpZiAoYnJhbmNoICE9PSAnX2xpc3RlbmVycycgJiYgdHJlZS5oYXNPd25Qcm9wZXJ0eShicmFuY2gpKSB7XHJcbiAgICAgICAgICAgIGlmKGJyYW5jaCA9PT0gJyonIHx8IGJyYW5jaCA9PT0gJyoqJykge1xyXG4gICAgICAgICAgICAgIGlmKHRyZWVbYnJhbmNoXS5fbGlzdGVuZXJzICYmICFlbmRSZWFjaGVkKSB7XHJcbiAgICAgICAgICAgICAgICBsaXN0ZW5lcnMgPSBsaXN0ZW5lcnMuY29uY2F0KHNlYXJjaExpc3RlbmVyVHJlZShoYW5kbGVycywgdHlwZSwgdHJlZVticmFuY2hdLCB0eXBlTGVuZ3RoKSk7XHJcbiAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgIGxpc3RlbmVycyA9IGxpc3RlbmVycy5jb25jYXQoc2VhcmNoTGlzdGVuZXJUcmVlKGhhbmRsZXJzLCB0eXBlLCB0cmVlW2JyYW5jaF0sIGkpKTtcclxuICAgICAgICAgICAgfSBlbHNlIGlmKGJyYW5jaCA9PT0gbmV4dFR5cGUpIHtcclxuICAgICAgICAgICAgICBsaXN0ZW5lcnMgPSBsaXN0ZW5lcnMuY29uY2F0KHNlYXJjaExpc3RlbmVyVHJlZShoYW5kbGVycywgdHlwZSwgdHJlZVticmFuY2hdLCBpKzIpKTtcclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAvLyBObyBtYXRjaCBvbiB0aGlzIG9uZSwgc2hpZnQgaW50byB0aGUgdHJlZSBidXQgbm90IGluIHRoZSB0eXBlIGFycmF5LlxyXG4gICAgICAgICAgICAgIGxpc3RlbmVycyA9IGxpc3RlbmVycy5jb25jYXQoc2VhcmNoTGlzdGVuZXJUcmVlKGhhbmRsZXJzLCB0eXBlLCB0cmVlW2JyYW5jaF0sIGkpKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gbGlzdGVuZXJzO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBsaXN0ZW5lcnMgPSBsaXN0ZW5lcnMuY29uY2F0KHNlYXJjaExpc3RlbmVyVHJlZShoYW5kbGVycywgdHlwZSwgdHJlZVtjdXJyZW50VHlwZV0sIGkrMSkpO1xyXG4gICAgfVxyXG5cclxuICAgIHhUcmVlID0gdHJlZVsnKiddO1xyXG4gICAgaWYgKHhUcmVlKSB7XHJcbiAgICAgIC8vXHJcbiAgICAgIC8vIElmIHRoZSBsaXN0ZW5lciB0cmVlIHdpbGwgYWxsb3cgYW55IG1hdGNoIGZvciB0aGlzIHBhcnQsXHJcbiAgICAgIC8vIHRoZW4gcmVjdXJzaXZlbHkgZXhwbG9yZSBhbGwgYnJhbmNoZXMgb2YgdGhlIHRyZWVcclxuICAgICAgLy9cclxuICAgICAgc2VhcmNoTGlzdGVuZXJUcmVlKGhhbmRsZXJzLCB0eXBlLCB4VHJlZSwgaSsxKTtcclxuICAgIH1cclxuXHJcbiAgICB4eFRyZWUgPSB0cmVlWycqKiddO1xyXG4gICAgaWYoeHhUcmVlKSB7XHJcbiAgICAgIGlmKGkgPCB0eXBlTGVuZ3RoKSB7XHJcbiAgICAgICAgaWYoeHhUcmVlLl9saXN0ZW5lcnMpIHtcclxuICAgICAgICAgIC8vIElmIHdlIGhhdmUgYSBsaXN0ZW5lciBvbiBhICcqKicsIGl0IHdpbGwgY2F0Y2ggYWxsLCBzbyBhZGQgaXRzIGhhbmRsZXIuXHJcbiAgICAgICAgICBzZWFyY2hMaXN0ZW5lclRyZWUoaGFuZGxlcnMsIHR5cGUsIHh4VHJlZSwgdHlwZUxlbmd0aCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBCdWlsZCBhcnJheXMgb2YgbWF0Y2hpbmcgbmV4dCBicmFuY2hlcyBhbmQgb3RoZXJzLlxyXG4gICAgICAgIGZvcihicmFuY2ggaW4geHhUcmVlKSB7XHJcbiAgICAgICAgICBpZihicmFuY2ggIT09ICdfbGlzdGVuZXJzJyAmJiB4eFRyZWUuaGFzT3duUHJvcGVydHkoYnJhbmNoKSkge1xyXG4gICAgICAgICAgICBpZihicmFuY2ggPT09IG5leHRUeXBlKSB7XHJcbiAgICAgICAgICAgICAgLy8gV2Uga25vdyB0aGUgbmV4dCBlbGVtZW50IHdpbGwgbWF0Y2gsIHNvIGp1bXAgdHdpY2UuXHJcbiAgICAgICAgICAgICAgc2VhcmNoTGlzdGVuZXJUcmVlKGhhbmRsZXJzLCB0eXBlLCB4eFRyZWVbYnJhbmNoXSwgaSsyKTtcclxuICAgICAgICAgICAgfSBlbHNlIGlmKGJyYW5jaCA9PT0gY3VycmVudFR5cGUpIHtcclxuICAgICAgICAgICAgICAvLyBDdXJyZW50IG5vZGUgbWF0Y2hlcywgbW92ZSBpbnRvIHRoZSB0cmVlLlxyXG4gICAgICAgICAgICAgIHNlYXJjaExpc3RlbmVyVHJlZShoYW5kbGVycywgdHlwZSwgeHhUcmVlW2JyYW5jaF0sIGkrMSk7XHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgaXNvbGF0ZWRCcmFuY2ggPSB7fTtcclxuICAgICAgICAgICAgICBpc29sYXRlZEJyYW5jaFticmFuY2hdID0geHhUcmVlW2JyYW5jaF07XHJcbiAgICAgICAgICAgICAgc2VhcmNoTGlzdGVuZXJUcmVlKGhhbmRsZXJzLCB0eXBlLCB7ICcqKic6IGlzb2xhdGVkQnJhbmNoIH0sIGkrMSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgIH0gZWxzZSBpZih4eFRyZWUuX2xpc3RlbmVycykge1xyXG4gICAgICAgIC8vIFdlIGhhdmUgcmVhY2hlZCB0aGUgZW5kIGFuZCBzdGlsbCBvbiBhICcqKidcclxuICAgICAgICBzZWFyY2hMaXN0ZW5lclRyZWUoaGFuZGxlcnMsIHR5cGUsIHh4VHJlZSwgdHlwZUxlbmd0aCk7XHJcbiAgICAgIH0gZWxzZSBpZih4eFRyZWVbJyonXSAmJiB4eFRyZWVbJyonXS5fbGlzdGVuZXJzKSB7XHJcbiAgICAgICAgc2VhcmNoTGlzdGVuZXJUcmVlKGhhbmRsZXJzLCB0eXBlLCB4eFRyZWVbJyonXSwgdHlwZUxlbmd0aCk7XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gbGlzdGVuZXJzO1xyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gZ3Jvd0xpc3RlbmVyVHJlZSh0eXBlLCBsaXN0ZW5lcikge1xyXG5cclxuICAgIHR5cGUgPSB0eXBlb2YgdHlwZSA9PT0gJ3N0cmluZycgPyB0eXBlLnNwbGl0KHRoaXMuZGVsaW1pdGVyKSA6IHR5cGUuc2xpY2UoKTtcclxuXHJcbiAgICAvL1xyXG4gICAgLy8gTG9va3MgZm9yIHR3byBjb25zZWN1dGl2ZSAnKionLCBpZiBzbywgZG9uJ3QgYWRkIHRoZSBldmVudCBhdCBhbGwuXHJcbiAgICAvL1xyXG4gICAgZm9yKHZhciBpID0gMCwgbGVuID0gdHlwZS5sZW5ndGg7IGkrMSA8IGxlbjsgaSsrKSB7XHJcbiAgICAgIGlmKHR5cGVbaV0gPT09ICcqKicgJiYgdHlwZVtpKzFdID09PSAnKionKSB7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgdmFyIHRyZWUgPSB0aGlzLmxpc3RlbmVyVHJlZTtcclxuICAgIHZhciBuYW1lID0gdHlwZS5zaGlmdCgpO1xyXG5cclxuICAgIHdoaWxlIChuYW1lICE9PSB1bmRlZmluZWQpIHtcclxuXHJcbiAgICAgIGlmICghdHJlZVtuYW1lXSkge1xyXG4gICAgICAgIHRyZWVbbmFtZV0gPSB7fTtcclxuICAgICAgfVxyXG5cclxuICAgICAgdHJlZSA9IHRyZWVbbmFtZV07XHJcblxyXG4gICAgICBpZiAodHlwZS5sZW5ndGggPT09IDApIHtcclxuXHJcbiAgICAgICAgaWYgKCF0cmVlLl9saXN0ZW5lcnMpIHtcclxuICAgICAgICAgIHRyZWUuX2xpc3RlbmVycyA9IGxpc3RlbmVyO1xyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNlIHtcclxuICAgICAgICAgIGlmICh0eXBlb2YgdHJlZS5fbGlzdGVuZXJzID09PSAnZnVuY3Rpb24nKSB7XHJcbiAgICAgICAgICAgIHRyZWUuX2xpc3RlbmVycyA9IFt0cmVlLl9saXN0ZW5lcnNdO1xyXG4gICAgICAgICAgfVxyXG5cclxuICAgICAgICAgIHRyZWUuX2xpc3RlbmVycy5wdXNoKGxpc3RlbmVyKTtcclxuXHJcbiAgICAgICAgICBpZiAoXHJcbiAgICAgICAgICAgICF0cmVlLl9saXN0ZW5lcnMud2FybmVkICYmXHJcbiAgICAgICAgICAgIHRoaXMuX21heExpc3RlbmVycyA+IDAgJiZcclxuICAgICAgICAgICAgdHJlZS5fbGlzdGVuZXJzLmxlbmd0aCA+IHRoaXMuX21heExpc3RlbmVyc1xyXG4gICAgICAgICAgKSB7XHJcbiAgICAgICAgICAgIHRyZWUuX2xpc3RlbmVycy53YXJuZWQgPSB0cnVlO1xyXG4gICAgICAgICAgICBsb2dQb3NzaWJsZU1lbW9yeUxlYWsuY2FsbCh0aGlzLCB0cmVlLl9saXN0ZW5lcnMubGVuZ3RoLCBuYW1lKTtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgIH1cclxuICAgICAgbmFtZSA9IHR5cGUuc2hpZnQoKTtcclxuICAgIH1cclxuICAgIHJldHVybiB0cnVlO1xyXG4gIH1cclxuXHJcbiAgLy8gQnkgZGVmYXVsdCBFdmVudEVtaXR0ZXJzIHdpbGwgcHJpbnQgYSB3YXJuaW5nIGlmIG1vcmUgdGhhblxyXG4gIC8vIDEwIGxpc3RlbmVycyBhcmUgYWRkZWQgdG8gaXQuIFRoaXMgaXMgYSB1c2VmdWwgZGVmYXVsdCB3aGljaFxyXG4gIC8vIGhlbHBzIGZpbmRpbmcgbWVtb3J5IGxlYWtzLlxyXG4gIC8vXHJcbiAgLy8gT2J2aW91c2x5IG5vdCBhbGwgRW1pdHRlcnMgc2hvdWxkIGJlIGxpbWl0ZWQgdG8gMTAuIFRoaXMgZnVuY3Rpb24gYWxsb3dzXHJcbiAgLy8gdGhhdCB0byBiZSBpbmNyZWFzZWQuIFNldCB0byB6ZXJvIGZvciB1bmxpbWl0ZWQuXHJcblxyXG4gIEV2ZW50RW1pdHRlci5wcm90b3R5cGUuZGVsaW1pdGVyID0gJy4nO1xyXG5cclxuICBFdmVudEVtaXR0ZXIucHJvdG90eXBlLnNldE1heExpc3RlbmVycyA9IGZ1bmN0aW9uKG4pIHtcclxuICAgIGlmIChuICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgdGhpcy5fbWF4TGlzdGVuZXJzID0gbjtcclxuICAgICAgaWYgKCF0aGlzLl9jb25mKSB0aGlzLl9jb25mID0ge307XHJcbiAgICAgIHRoaXMuX2NvbmYubWF4TGlzdGVuZXJzID0gbjtcclxuICAgIH1cclxuICB9O1xyXG5cclxuICBFdmVudEVtaXR0ZXIucHJvdG90eXBlLmV2ZW50ID0gJyc7XHJcblxyXG5cclxuICBFdmVudEVtaXR0ZXIucHJvdG90eXBlLm9uY2UgPSBmdW5jdGlvbihldmVudCwgZm4pIHtcclxuICAgIHJldHVybiB0aGlzLl9vbmNlKGV2ZW50LCBmbiwgZmFsc2UpO1xyXG4gIH07XHJcblxyXG4gIEV2ZW50RW1pdHRlci5wcm90b3R5cGUucHJlcGVuZE9uY2VMaXN0ZW5lciA9IGZ1bmN0aW9uKGV2ZW50LCBmbikge1xyXG4gICAgcmV0dXJuIHRoaXMuX29uY2UoZXZlbnQsIGZuLCB0cnVlKTtcclxuICB9O1xyXG5cclxuICBFdmVudEVtaXR0ZXIucHJvdG90eXBlLl9vbmNlID0gZnVuY3Rpb24oZXZlbnQsIGZuLCBwcmVwZW5kKSB7XHJcbiAgICB0aGlzLl9tYW55KGV2ZW50LCAxLCBmbiwgcHJlcGVuZCk7XHJcbiAgICByZXR1cm4gdGhpcztcclxuICB9O1xyXG5cclxuICBFdmVudEVtaXR0ZXIucHJvdG90eXBlLm1hbnkgPSBmdW5jdGlvbihldmVudCwgdHRsLCBmbikge1xyXG4gICAgcmV0dXJuIHRoaXMuX21hbnkoZXZlbnQsIHR0bCwgZm4sIGZhbHNlKTtcclxuICB9XHJcblxyXG4gIEV2ZW50RW1pdHRlci5wcm90b3R5cGUucHJlcGVuZE1hbnkgPSBmdW5jdGlvbihldmVudCwgdHRsLCBmbikge1xyXG4gICAgcmV0dXJuIHRoaXMuX21hbnkoZXZlbnQsIHR0bCwgZm4sIHRydWUpO1xyXG4gIH1cclxuXHJcbiAgRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5fbWFueSA9IGZ1bmN0aW9uKGV2ZW50LCB0dGwsIGZuLCBwcmVwZW5kKSB7XHJcbiAgICB2YXIgc2VsZiA9IHRoaXM7XHJcblxyXG4gICAgaWYgKHR5cGVvZiBmbiAhPT0gJ2Z1bmN0aW9uJykge1xyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ21hbnkgb25seSBhY2NlcHRzIGluc3RhbmNlcyBvZiBGdW5jdGlvbicpO1xyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIGxpc3RlbmVyKCkge1xyXG4gICAgICBpZiAoLS10dGwgPT09IDApIHtcclxuICAgICAgICBzZWxmLm9mZihldmVudCwgbGlzdGVuZXIpO1xyXG4gICAgICB9XHJcbiAgICAgIHJldHVybiBmbi5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xyXG4gICAgfVxyXG5cclxuICAgIGxpc3RlbmVyLl9vcmlnaW4gPSBmbjtcclxuXHJcbiAgICB0aGlzLl9vbihldmVudCwgbGlzdGVuZXIsIHByZXBlbmQpO1xyXG5cclxuICAgIHJldHVybiBzZWxmO1xyXG4gIH07XHJcblxyXG4gIEV2ZW50RW1pdHRlci5wcm90b3R5cGUuZW1pdCA9IGZ1bmN0aW9uKCkge1xyXG5cclxuICAgIHRoaXMuX2V2ZW50cyB8fCBpbml0LmNhbGwodGhpcyk7XHJcblxyXG4gICAgdmFyIHR5cGUgPSBhcmd1bWVudHNbMF07XHJcblxyXG4gICAgaWYgKHR5cGUgPT09ICduZXdMaXN0ZW5lcicgJiYgIXRoaXMubmV3TGlzdGVuZXIpIHtcclxuICAgICAgaWYgKCF0aGlzLl9ldmVudHMubmV3TGlzdGVuZXIpIHtcclxuICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICB2YXIgYWwgPSBhcmd1bWVudHMubGVuZ3RoO1xyXG4gICAgdmFyIGFyZ3MsbCxpLGo7XHJcbiAgICB2YXIgaGFuZGxlcjtcclxuXHJcbiAgICBpZiAodGhpcy5fYWxsICYmIHRoaXMuX2FsbC5sZW5ndGgpIHtcclxuICAgICAgaGFuZGxlciA9IHRoaXMuX2FsbC5zbGljZSgpO1xyXG4gICAgICBpZiAoYWwgPiAzKSB7XHJcbiAgICAgICAgYXJncyA9IG5ldyBBcnJheShhbCk7XHJcbiAgICAgICAgZm9yIChqID0gMDsgaiA8IGFsOyBqKyspIGFyZ3Nbal0gPSBhcmd1bWVudHNbal07XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGZvciAoaSA9IDAsIGwgPSBoYW5kbGVyLmxlbmd0aDsgaSA8IGw7IGkrKykge1xyXG4gICAgICAgIHRoaXMuZXZlbnQgPSB0eXBlO1xyXG4gICAgICAgIHN3aXRjaCAoYWwpIHtcclxuICAgICAgICBjYXNlIDE6XHJcbiAgICAgICAgICBoYW5kbGVyW2ldLmNhbGwodGhpcywgdHlwZSk7XHJcbiAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIDI6XHJcbiAgICAgICAgICBoYW5kbGVyW2ldLmNhbGwodGhpcywgdHlwZSwgYXJndW1lbnRzWzFdKTtcclxuICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgMzpcclxuICAgICAgICAgIGhhbmRsZXJbaV0uY2FsbCh0aGlzLCB0eXBlLCBhcmd1bWVudHNbMV0sIGFyZ3VtZW50c1syXSk7XHJcbiAgICAgICAgICBicmVhaztcclxuICAgICAgICBkZWZhdWx0OlxyXG4gICAgICAgICAgaGFuZGxlcltpXS5hcHBseSh0aGlzLCBhcmdzKTtcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBpZiAodGhpcy53aWxkY2FyZCkge1xyXG4gICAgICBoYW5kbGVyID0gW107XHJcbiAgICAgIHZhciBucyA9IHR5cGVvZiB0eXBlID09PSAnc3RyaW5nJyA/IHR5cGUuc3BsaXQodGhpcy5kZWxpbWl0ZXIpIDogdHlwZS5zbGljZSgpO1xyXG4gICAgICBzZWFyY2hMaXN0ZW5lclRyZWUuY2FsbCh0aGlzLCBoYW5kbGVyLCBucywgdGhpcy5saXN0ZW5lclRyZWUsIDApO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgaGFuZGxlciA9IHRoaXMuX2V2ZW50c1t0eXBlXTtcclxuICAgICAgaWYgKHR5cGVvZiBoYW5kbGVyID09PSAnZnVuY3Rpb24nKSB7XHJcbiAgICAgICAgdGhpcy5ldmVudCA9IHR5cGU7XHJcbiAgICAgICAgc3dpdGNoIChhbCkge1xyXG4gICAgICAgIGNhc2UgMTpcclxuICAgICAgICAgIGhhbmRsZXIuY2FsbCh0aGlzKTtcclxuICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgMjpcclxuICAgICAgICAgIGhhbmRsZXIuY2FsbCh0aGlzLCBhcmd1bWVudHNbMV0pO1xyXG4gICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSAzOlxyXG4gICAgICAgICAgaGFuZGxlci5jYWxsKHRoaXMsIGFyZ3VtZW50c1sxXSwgYXJndW1lbnRzWzJdKTtcclxuICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgICBhcmdzID0gbmV3IEFycmF5KGFsIC0gMSk7XHJcbiAgICAgICAgICBmb3IgKGogPSAxOyBqIDwgYWw7IGorKykgYXJnc1tqIC0gMV0gPSBhcmd1bWVudHNbal07XHJcbiAgICAgICAgICBoYW5kbGVyLmFwcGx5KHRoaXMsIGFyZ3MpO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgfSBlbHNlIGlmIChoYW5kbGVyKSB7XHJcbiAgICAgICAgLy8gbmVlZCB0byBtYWtlIGNvcHkgb2YgaGFuZGxlcnMgYmVjYXVzZSBsaXN0IGNhbiBjaGFuZ2UgaW4gdGhlIG1pZGRsZVxyXG4gICAgICAgIC8vIG9mIGVtaXQgY2FsbFxyXG4gICAgICAgIGhhbmRsZXIgPSBoYW5kbGVyLnNsaWNlKCk7XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBpZiAoaGFuZGxlciAmJiBoYW5kbGVyLmxlbmd0aCkge1xyXG4gICAgICBpZiAoYWwgPiAzKSB7XHJcbiAgICAgICAgYXJncyA9IG5ldyBBcnJheShhbCAtIDEpO1xyXG4gICAgICAgIGZvciAoaiA9IDE7IGogPCBhbDsgaisrKSBhcmdzW2ogLSAxXSA9IGFyZ3VtZW50c1tqXTtcclxuICAgICAgfVxyXG4gICAgICBmb3IgKGkgPSAwLCBsID0gaGFuZGxlci5sZW5ndGg7IGkgPCBsOyBpKyspIHtcclxuICAgICAgICB0aGlzLmV2ZW50ID0gdHlwZTtcclxuICAgICAgICBzd2l0Y2ggKGFsKSB7XHJcbiAgICAgICAgY2FzZSAxOlxyXG4gICAgICAgICAgaGFuZGxlcltpXS5jYWxsKHRoaXMpO1xyXG4gICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSAyOlxyXG4gICAgICAgICAgaGFuZGxlcltpXS5jYWxsKHRoaXMsIGFyZ3VtZW50c1sxXSk7XHJcbiAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIDM6XHJcbiAgICAgICAgICBoYW5kbGVyW2ldLmNhbGwodGhpcywgYXJndW1lbnRzWzFdLCBhcmd1bWVudHNbMl0pO1xyXG4gICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgIGhhbmRsZXJbaV0uYXBwbHkodGhpcywgYXJncyk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgfSBlbHNlIGlmICghdGhpcy5fYWxsICYmIHR5cGUgPT09ICdlcnJvcicpIHtcclxuICAgICAgaWYgKGFyZ3VtZW50c1sxXSBpbnN0YW5jZW9mIEVycm9yKSB7XHJcbiAgICAgICAgdGhyb3cgYXJndW1lbnRzWzFdOyAvLyBVbmhhbmRsZWQgJ2Vycm9yJyBldmVudFxyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIlVuY2F1Z2h0LCB1bnNwZWNpZmllZCAnZXJyb3InIGV2ZW50LlwiKTtcclxuICAgICAgfVxyXG4gICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuICEhdGhpcy5fYWxsO1xyXG4gIH07XHJcblxyXG4gIEV2ZW50RW1pdHRlci5wcm90b3R5cGUuZW1pdEFzeW5jID0gZnVuY3Rpb24oKSB7XHJcblxyXG4gICAgdGhpcy5fZXZlbnRzIHx8IGluaXQuY2FsbCh0aGlzKTtcclxuXHJcbiAgICB2YXIgdHlwZSA9IGFyZ3VtZW50c1swXTtcclxuXHJcbiAgICBpZiAodHlwZSA9PT0gJ25ld0xpc3RlbmVyJyAmJiAhdGhpcy5uZXdMaXN0ZW5lcikge1xyXG4gICAgICAgIGlmICghdGhpcy5fZXZlbnRzLm5ld0xpc3RlbmVyKSB7IHJldHVybiBQcm9taXNlLnJlc29sdmUoW2ZhbHNlXSk7IH1cclxuICAgIH1cclxuXHJcbiAgICB2YXIgcHJvbWlzZXM9IFtdO1xyXG5cclxuICAgIHZhciBhbCA9IGFyZ3VtZW50cy5sZW5ndGg7XHJcbiAgICB2YXIgYXJncyxsLGksajtcclxuICAgIHZhciBoYW5kbGVyO1xyXG5cclxuICAgIGlmICh0aGlzLl9hbGwpIHtcclxuICAgICAgaWYgKGFsID4gMykge1xyXG4gICAgICAgIGFyZ3MgPSBuZXcgQXJyYXkoYWwpO1xyXG4gICAgICAgIGZvciAoaiA9IDE7IGogPCBhbDsgaisrKSBhcmdzW2pdID0gYXJndW1lbnRzW2pdO1xyXG4gICAgICB9XHJcbiAgICAgIGZvciAoaSA9IDAsIGwgPSB0aGlzLl9hbGwubGVuZ3RoOyBpIDwgbDsgaSsrKSB7XHJcbiAgICAgICAgdGhpcy5ldmVudCA9IHR5cGU7XHJcbiAgICAgICAgc3dpdGNoIChhbCkge1xyXG4gICAgICAgIGNhc2UgMTpcclxuICAgICAgICAgIHByb21pc2VzLnB1c2godGhpcy5fYWxsW2ldLmNhbGwodGhpcywgdHlwZSkpO1xyXG4gICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSAyOlxyXG4gICAgICAgICAgcHJvbWlzZXMucHVzaCh0aGlzLl9hbGxbaV0uY2FsbCh0aGlzLCB0eXBlLCBhcmd1bWVudHNbMV0pKTtcclxuICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgMzpcclxuICAgICAgICAgIHByb21pc2VzLnB1c2godGhpcy5fYWxsW2ldLmNhbGwodGhpcywgdHlwZSwgYXJndW1lbnRzWzFdLCBhcmd1bWVudHNbMl0pKTtcclxuICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgICBwcm9taXNlcy5wdXNoKHRoaXMuX2FsbFtpXS5hcHBseSh0aGlzLCBhcmdzKSk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKHRoaXMud2lsZGNhcmQpIHtcclxuICAgICAgaGFuZGxlciA9IFtdO1xyXG4gICAgICB2YXIgbnMgPSB0eXBlb2YgdHlwZSA9PT0gJ3N0cmluZycgPyB0eXBlLnNwbGl0KHRoaXMuZGVsaW1pdGVyKSA6IHR5cGUuc2xpY2UoKTtcclxuICAgICAgc2VhcmNoTGlzdGVuZXJUcmVlLmNhbGwodGhpcywgaGFuZGxlciwgbnMsIHRoaXMubGlzdGVuZXJUcmVlLCAwKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIGhhbmRsZXIgPSB0aGlzLl9ldmVudHNbdHlwZV07XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKHR5cGVvZiBoYW5kbGVyID09PSAnZnVuY3Rpb24nKSB7XHJcbiAgICAgIHRoaXMuZXZlbnQgPSB0eXBlO1xyXG4gICAgICBzd2l0Y2ggKGFsKSB7XHJcbiAgICAgIGNhc2UgMTpcclxuICAgICAgICBwcm9taXNlcy5wdXNoKGhhbmRsZXIuY2FsbCh0aGlzKSk7XHJcbiAgICAgICAgYnJlYWs7XHJcbiAgICAgIGNhc2UgMjpcclxuICAgICAgICBwcm9taXNlcy5wdXNoKGhhbmRsZXIuY2FsbCh0aGlzLCBhcmd1bWVudHNbMV0pKTtcclxuICAgICAgICBicmVhaztcclxuICAgICAgY2FzZSAzOlxyXG4gICAgICAgIHByb21pc2VzLnB1c2goaGFuZGxlci5jYWxsKHRoaXMsIGFyZ3VtZW50c1sxXSwgYXJndW1lbnRzWzJdKSk7XHJcbiAgICAgICAgYnJlYWs7XHJcbiAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgYXJncyA9IG5ldyBBcnJheShhbCAtIDEpO1xyXG4gICAgICAgIGZvciAoaiA9IDE7IGogPCBhbDsgaisrKSBhcmdzW2ogLSAxXSA9IGFyZ3VtZW50c1tqXTtcclxuICAgICAgICBwcm9taXNlcy5wdXNoKGhhbmRsZXIuYXBwbHkodGhpcywgYXJncykpO1xyXG4gICAgICB9XHJcbiAgICB9IGVsc2UgaWYgKGhhbmRsZXIgJiYgaGFuZGxlci5sZW5ndGgpIHtcclxuICAgICAgaGFuZGxlciA9IGhhbmRsZXIuc2xpY2UoKTtcclxuICAgICAgaWYgKGFsID4gMykge1xyXG4gICAgICAgIGFyZ3MgPSBuZXcgQXJyYXkoYWwgLSAxKTtcclxuICAgICAgICBmb3IgKGogPSAxOyBqIDwgYWw7IGorKykgYXJnc1tqIC0gMV0gPSBhcmd1bWVudHNbal07XHJcbiAgICAgIH1cclxuICAgICAgZm9yIChpID0gMCwgbCA9IGhhbmRsZXIubGVuZ3RoOyBpIDwgbDsgaSsrKSB7XHJcbiAgICAgICAgdGhpcy5ldmVudCA9IHR5cGU7XHJcbiAgICAgICAgc3dpdGNoIChhbCkge1xyXG4gICAgICAgIGNhc2UgMTpcclxuICAgICAgICAgIHByb21pc2VzLnB1c2goaGFuZGxlcltpXS5jYWxsKHRoaXMpKTtcclxuICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgMjpcclxuICAgICAgICAgIHByb21pc2VzLnB1c2goaGFuZGxlcltpXS5jYWxsKHRoaXMsIGFyZ3VtZW50c1sxXSkpO1xyXG4gICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSAzOlxyXG4gICAgICAgICAgcHJvbWlzZXMucHVzaChoYW5kbGVyW2ldLmNhbGwodGhpcywgYXJndW1lbnRzWzFdLCBhcmd1bWVudHNbMl0pKTtcclxuICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgICBwcm9taXNlcy5wdXNoKGhhbmRsZXJbaV0uYXBwbHkodGhpcywgYXJncykpO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgfSBlbHNlIGlmICghdGhpcy5fYWxsICYmIHR5cGUgPT09ICdlcnJvcicpIHtcclxuICAgICAgaWYgKGFyZ3VtZW50c1sxXSBpbnN0YW5jZW9mIEVycm9yKSB7XHJcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KGFyZ3VtZW50c1sxXSk7IC8vIFVuaGFuZGxlZCAnZXJyb3InIGV2ZW50XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KFwiVW5jYXVnaHQsIHVuc3BlY2lmaWVkICdlcnJvcicgZXZlbnQuXCIpO1xyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIFByb21pc2UuYWxsKHByb21pc2VzKTtcclxuICB9O1xyXG5cclxuICBFdmVudEVtaXR0ZXIucHJvdG90eXBlLm9uID0gZnVuY3Rpb24odHlwZSwgbGlzdGVuZXIpIHtcclxuICAgIHJldHVybiB0aGlzLl9vbih0eXBlLCBsaXN0ZW5lciwgZmFsc2UpO1xyXG4gIH07XHJcblxyXG4gIEV2ZW50RW1pdHRlci5wcm90b3R5cGUucHJlcGVuZExpc3RlbmVyID0gZnVuY3Rpb24odHlwZSwgbGlzdGVuZXIpIHtcclxuICAgIHJldHVybiB0aGlzLl9vbih0eXBlLCBsaXN0ZW5lciwgdHJ1ZSk7XHJcbiAgfTtcclxuXHJcbiAgRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5vbkFueSA9IGZ1bmN0aW9uKGZuKSB7XHJcbiAgICByZXR1cm4gdGhpcy5fb25BbnkoZm4sIGZhbHNlKTtcclxuICB9O1xyXG5cclxuICBFdmVudEVtaXR0ZXIucHJvdG90eXBlLnByZXBlbmRBbnkgPSBmdW5jdGlvbihmbikge1xyXG4gICAgcmV0dXJuIHRoaXMuX29uQW55KGZuLCB0cnVlKTtcclxuICB9O1xyXG5cclxuICBFdmVudEVtaXR0ZXIucHJvdG90eXBlLmFkZExpc3RlbmVyID0gRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5vbjtcclxuXHJcbiAgRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5fb25BbnkgPSBmdW5jdGlvbihmbiwgcHJlcGVuZCl7XHJcbiAgICBpZiAodHlwZW9mIGZuICE9PSAnZnVuY3Rpb24nKSB7XHJcbiAgICAgIHRocm93IG5ldyBFcnJvcignb25Bbnkgb25seSBhY2NlcHRzIGluc3RhbmNlcyBvZiBGdW5jdGlvbicpO1xyXG4gICAgfVxyXG5cclxuICAgIGlmICghdGhpcy5fYWxsKSB7XHJcbiAgICAgIHRoaXMuX2FsbCA9IFtdO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIEFkZCB0aGUgZnVuY3Rpb24gdG8gdGhlIGV2ZW50IGxpc3RlbmVyIGNvbGxlY3Rpb24uXHJcbiAgICBpZihwcmVwZW5kKXtcclxuICAgICAgdGhpcy5fYWxsLnVuc2hpZnQoZm4pO1xyXG4gICAgfWVsc2V7XHJcbiAgICAgIHRoaXMuX2FsbC5wdXNoKGZuKTtcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gdGhpcztcclxuICB9XHJcblxyXG4gIEV2ZW50RW1pdHRlci5wcm90b3R5cGUuX29uID0gZnVuY3Rpb24odHlwZSwgbGlzdGVuZXIsIHByZXBlbmQpIHtcclxuICAgIGlmICh0eXBlb2YgdHlwZSA9PT0gJ2Z1bmN0aW9uJykge1xyXG4gICAgICB0aGlzLl9vbkFueSh0eXBlLCBsaXN0ZW5lcik7XHJcbiAgICAgIHJldHVybiB0aGlzO1xyXG4gICAgfVxyXG5cclxuICAgIGlmICh0eXBlb2YgbGlzdGVuZXIgIT09ICdmdW5jdGlvbicpIHtcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdvbiBvbmx5IGFjY2VwdHMgaW5zdGFuY2VzIG9mIEZ1bmN0aW9uJyk7XHJcbiAgICB9XHJcbiAgICB0aGlzLl9ldmVudHMgfHwgaW5pdC5jYWxsKHRoaXMpO1xyXG5cclxuICAgIC8vIFRvIGF2b2lkIHJlY3Vyc2lvbiBpbiB0aGUgY2FzZSB0aGF0IHR5cGUgPT0gXCJuZXdMaXN0ZW5lcnNcIiEgQmVmb3JlXHJcbiAgICAvLyBhZGRpbmcgaXQgdG8gdGhlIGxpc3RlbmVycywgZmlyc3QgZW1pdCBcIm5ld0xpc3RlbmVyc1wiLlxyXG4gICAgdGhpcy5lbWl0KCduZXdMaXN0ZW5lcicsIHR5cGUsIGxpc3RlbmVyKTtcclxuXHJcbiAgICBpZiAodGhpcy53aWxkY2FyZCkge1xyXG4gICAgICBncm93TGlzdGVuZXJUcmVlLmNhbGwodGhpcywgdHlwZSwgbGlzdGVuZXIpO1xyXG4gICAgICByZXR1cm4gdGhpcztcclxuICAgIH1cclxuXHJcbiAgICBpZiAoIXRoaXMuX2V2ZW50c1t0eXBlXSkge1xyXG4gICAgICAvLyBPcHRpbWl6ZSB0aGUgY2FzZSBvZiBvbmUgbGlzdGVuZXIuIERvbid0IG5lZWQgdGhlIGV4dHJhIGFycmF5IG9iamVjdC5cclxuICAgICAgdGhpcy5fZXZlbnRzW3R5cGVdID0gbGlzdGVuZXI7XHJcbiAgICB9XHJcbiAgICBlbHNlIHtcclxuICAgICAgaWYgKHR5cGVvZiB0aGlzLl9ldmVudHNbdHlwZV0gPT09ICdmdW5jdGlvbicpIHtcclxuICAgICAgICAvLyBDaGFuZ2UgdG8gYXJyYXkuXHJcbiAgICAgICAgdGhpcy5fZXZlbnRzW3R5cGVdID0gW3RoaXMuX2V2ZW50c1t0eXBlXV07XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIC8vIElmIHdlJ3ZlIGFscmVhZHkgZ290IGFuIGFycmF5LCBqdXN0IGFkZFxyXG4gICAgICBpZihwcmVwZW5kKXtcclxuICAgICAgICB0aGlzLl9ldmVudHNbdHlwZV0udW5zaGlmdChsaXN0ZW5lcik7XHJcbiAgICAgIH1lbHNle1xyXG4gICAgICAgIHRoaXMuX2V2ZW50c1t0eXBlXS5wdXNoKGxpc3RlbmVyKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgLy8gQ2hlY2sgZm9yIGxpc3RlbmVyIGxlYWtcclxuICAgICAgaWYgKFxyXG4gICAgICAgICF0aGlzLl9ldmVudHNbdHlwZV0ud2FybmVkICYmXHJcbiAgICAgICAgdGhpcy5fbWF4TGlzdGVuZXJzID4gMCAmJlxyXG4gICAgICAgIHRoaXMuX2V2ZW50c1t0eXBlXS5sZW5ndGggPiB0aGlzLl9tYXhMaXN0ZW5lcnNcclxuICAgICAgKSB7XHJcbiAgICAgICAgdGhpcy5fZXZlbnRzW3R5cGVdLndhcm5lZCA9IHRydWU7XHJcbiAgICAgICAgbG9nUG9zc2libGVNZW1vcnlMZWFrLmNhbGwodGhpcywgdGhpcy5fZXZlbnRzW3R5cGVdLmxlbmd0aCwgdHlwZSk7XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gdGhpcztcclxuICB9XHJcblxyXG4gIEV2ZW50RW1pdHRlci5wcm90b3R5cGUub2ZmID0gZnVuY3Rpb24odHlwZSwgbGlzdGVuZXIpIHtcclxuICAgIGlmICh0eXBlb2YgbGlzdGVuZXIgIT09ICdmdW5jdGlvbicpIHtcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdyZW1vdmVMaXN0ZW5lciBvbmx5IHRha2VzIGluc3RhbmNlcyBvZiBGdW5jdGlvbicpO1xyXG4gICAgfVxyXG5cclxuICAgIHZhciBoYW5kbGVycyxsZWFmcz1bXTtcclxuXHJcbiAgICBpZih0aGlzLndpbGRjYXJkKSB7XHJcbiAgICAgIHZhciBucyA9IHR5cGVvZiB0eXBlID09PSAnc3RyaW5nJyA/IHR5cGUuc3BsaXQodGhpcy5kZWxpbWl0ZXIpIDogdHlwZS5zbGljZSgpO1xyXG4gICAgICBsZWFmcyA9IHNlYXJjaExpc3RlbmVyVHJlZS5jYWxsKHRoaXMsIG51bGwsIG5zLCB0aGlzLmxpc3RlbmVyVHJlZSwgMCk7XHJcbiAgICB9XHJcbiAgICBlbHNlIHtcclxuICAgICAgLy8gZG9lcyBub3QgdXNlIGxpc3RlbmVycygpLCBzbyBubyBzaWRlIGVmZmVjdCBvZiBjcmVhdGluZyBfZXZlbnRzW3R5cGVdXHJcbiAgICAgIGlmICghdGhpcy5fZXZlbnRzW3R5cGVdKSByZXR1cm4gdGhpcztcclxuICAgICAgaGFuZGxlcnMgPSB0aGlzLl9ldmVudHNbdHlwZV07XHJcbiAgICAgIGxlYWZzLnB1c2goe19saXN0ZW5lcnM6aGFuZGxlcnN9KTtcclxuICAgIH1cclxuXHJcbiAgICBmb3IgKHZhciBpTGVhZj0wOyBpTGVhZjxsZWFmcy5sZW5ndGg7IGlMZWFmKyspIHtcclxuICAgICAgdmFyIGxlYWYgPSBsZWFmc1tpTGVhZl07XHJcbiAgICAgIGhhbmRsZXJzID0gbGVhZi5fbGlzdGVuZXJzO1xyXG4gICAgICBpZiAoaXNBcnJheShoYW5kbGVycykpIHtcclxuXHJcbiAgICAgICAgdmFyIHBvc2l0aW9uID0gLTE7XHJcblxyXG4gICAgICAgIGZvciAodmFyIGkgPSAwLCBsZW5ndGggPSBoYW5kbGVycy5sZW5ndGg7IGkgPCBsZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAgaWYgKGhhbmRsZXJzW2ldID09PSBsaXN0ZW5lciB8fFxyXG4gICAgICAgICAgICAoaGFuZGxlcnNbaV0ubGlzdGVuZXIgJiYgaGFuZGxlcnNbaV0ubGlzdGVuZXIgPT09IGxpc3RlbmVyKSB8fFxyXG4gICAgICAgICAgICAoaGFuZGxlcnNbaV0uX29yaWdpbiAmJiBoYW5kbGVyc1tpXS5fb3JpZ2luID09PSBsaXN0ZW5lcikpIHtcclxuICAgICAgICAgICAgcG9zaXRpb24gPSBpO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmIChwb3NpdGlvbiA8IDApIHtcclxuICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYodGhpcy53aWxkY2FyZCkge1xyXG4gICAgICAgICAgbGVhZi5fbGlzdGVuZXJzLnNwbGljZShwb3NpdGlvbiwgMSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGVsc2Uge1xyXG4gICAgICAgICAgdGhpcy5fZXZlbnRzW3R5cGVdLnNwbGljZShwb3NpdGlvbiwgMSk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBpZiAoaGFuZGxlcnMubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgICAgICBpZih0aGlzLndpbGRjYXJkKSB7XHJcbiAgICAgICAgICAgIGRlbGV0ZSBsZWFmLl9saXN0ZW5lcnM7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgICBlbHNlIHtcclxuICAgICAgICAgICAgZGVsZXRlIHRoaXMuX2V2ZW50c1t0eXBlXTtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMuZW1pdChcInJlbW92ZUxpc3RlbmVyXCIsIHR5cGUsIGxpc3RlbmVyKTtcclxuXHJcbiAgICAgICAgcmV0dXJuIHRoaXM7XHJcbiAgICAgIH1cclxuICAgICAgZWxzZSBpZiAoaGFuZGxlcnMgPT09IGxpc3RlbmVyIHx8XHJcbiAgICAgICAgKGhhbmRsZXJzLmxpc3RlbmVyICYmIGhhbmRsZXJzLmxpc3RlbmVyID09PSBsaXN0ZW5lcikgfHxcclxuICAgICAgICAoaGFuZGxlcnMuX29yaWdpbiAmJiBoYW5kbGVycy5fb3JpZ2luID09PSBsaXN0ZW5lcikpIHtcclxuICAgICAgICBpZih0aGlzLndpbGRjYXJkKSB7XHJcbiAgICAgICAgICBkZWxldGUgbGVhZi5fbGlzdGVuZXJzO1xyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNlIHtcclxuICAgICAgICAgIGRlbGV0ZSB0aGlzLl9ldmVudHNbdHlwZV07XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLmVtaXQoXCJyZW1vdmVMaXN0ZW5lclwiLCB0eXBlLCBsaXN0ZW5lcik7XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiByZWN1cnNpdmVseUdhcmJhZ2VDb2xsZWN0KHJvb3QpIHtcclxuICAgICAgaWYgKHJvb3QgPT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgIHJldHVybjtcclxuICAgICAgfVxyXG4gICAgICB2YXIga2V5cyA9IE9iamVjdC5rZXlzKHJvb3QpO1xyXG4gICAgICBmb3IgKHZhciBpIGluIGtleXMpIHtcclxuICAgICAgICB2YXIga2V5ID0ga2V5c1tpXTtcclxuICAgICAgICB2YXIgb2JqID0gcm9vdFtrZXldO1xyXG4gICAgICAgIGlmICgob2JqIGluc3RhbmNlb2YgRnVuY3Rpb24pIHx8ICh0eXBlb2Ygb2JqICE9PSBcIm9iamVjdFwiKSB8fCAob2JqID09PSBudWxsKSlcclxuICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgIGlmIChPYmplY3Qua2V5cyhvYmopLmxlbmd0aCA+IDApIHtcclxuICAgICAgICAgIHJlY3Vyc2l2ZWx5R2FyYmFnZUNvbGxlY3Qocm9vdFtrZXldKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKE9iamVjdC5rZXlzKG9iaikubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgICAgICBkZWxldGUgcm9vdFtrZXldO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgfVxyXG4gICAgcmVjdXJzaXZlbHlHYXJiYWdlQ29sbGVjdCh0aGlzLmxpc3RlbmVyVHJlZSk7XHJcblxyXG4gICAgcmV0dXJuIHRoaXM7XHJcbiAgfTtcclxuXHJcbiAgRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5vZmZBbnkgPSBmdW5jdGlvbihmbikge1xyXG4gICAgdmFyIGkgPSAwLCBsID0gMCwgZm5zO1xyXG4gICAgaWYgKGZuICYmIHRoaXMuX2FsbCAmJiB0aGlzLl9hbGwubGVuZ3RoID4gMCkge1xyXG4gICAgICBmbnMgPSB0aGlzLl9hbGw7XHJcbiAgICAgIGZvcihpID0gMCwgbCA9IGZucy5sZW5ndGg7IGkgPCBsOyBpKyspIHtcclxuICAgICAgICBpZihmbiA9PT0gZm5zW2ldKSB7XHJcbiAgICAgICAgICBmbnMuc3BsaWNlKGksIDEpO1xyXG4gICAgICAgICAgdGhpcy5lbWl0KFwicmVtb3ZlTGlzdGVuZXJBbnlcIiwgZm4pO1xyXG4gICAgICAgICAgcmV0dXJuIHRoaXM7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICBmbnMgPSB0aGlzLl9hbGw7XHJcbiAgICAgIGZvcihpID0gMCwgbCA9IGZucy5sZW5ndGg7IGkgPCBsOyBpKyspXHJcbiAgICAgICAgdGhpcy5lbWl0KFwicmVtb3ZlTGlzdGVuZXJBbnlcIiwgZm5zW2ldKTtcclxuICAgICAgdGhpcy5fYWxsID0gW107XHJcbiAgICB9XHJcbiAgICByZXR1cm4gdGhpcztcclxuICB9O1xyXG5cclxuICBFdmVudEVtaXR0ZXIucHJvdG90eXBlLnJlbW92ZUxpc3RlbmVyID0gRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5vZmY7XHJcblxyXG4gIEV2ZW50RW1pdHRlci5wcm90b3R5cGUucmVtb3ZlQWxsTGlzdGVuZXJzID0gZnVuY3Rpb24odHlwZSkge1xyXG4gICAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPT09IDApIHtcclxuICAgICAgIXRoaXMuX2V2ZW50cyB8fCBpbml0LmNhbGwodGhpcyk7XHJcbiAgICAgIHJldHVybiB0aGlzO1xyXG4gICAgfVxyXG5cclxuICAgIGlmICh0aGlzLndpbGRjYXJkKSB7XHJcbiAgICAgIHZhciBucyA9IHR5cGVvZiB0eXBlID09PSAnc3RyaW5nJyA/IHR5cGUuc3BsaXQodGhpcy5kZWxpbWl0ZXIpIDogdHlwZS5zbGljZSgpO1xyXG4gICAgICB2YXIgbGVhZnMgPSBzZWFyY2hMaXN0ZW5lclRyZWUuY2FsbCh0aGlzLCBudWxsLCBucywgdGhpcy5saXN0ZW5lclRyZWUsIDApO1xyXG5cclxuICAgICAgZm9yICh2YXIgaUxlYWY9MDsgaUxlYWY8bGVhZnMubGVuZ3RoOyBpTGVhZisrKSB7XHJcbiAgICAgICAgdmFyIGxlYWYgPSBsZWFmc1tpTGVhZl07XHJcbiAgICAgICAgbGVhZi5fbGlzdGVuZXJzID0gbnVsbDtcclxuICAgICAgfVxyXG4gICAgfVxyXG4gICAgZWxzZSBpZiAodGhpcy5fZXZlbnRzKSB7XHJcbiAgICAgIHRoaXMuX2V2ZW50c1t0eXBlXSA9IG51bGw7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gdGhpcztcclxuICB9O1xyXG5cclxuICBFdmVudEVtaXR0ZXIucHJvdG90eXBlLmxpc3RlbmVycyA9IGZ1bmN0aW9uKHR5cGUpIHtcclxuICAgIGlmICh0aGlzLndpbGRjYXJkKSB7XHJcbiAgICAgIHZhciBoYW5kbGVycyA9IFtdO1xyXG4gICAgICB2YXIgbnMgPSB0eXBlb2YgdHlwZSA9PT0gJ3N0cmluZycgPyB0eXBlLnNwbGl0KHRoaXMuZGVsaW1pdGVyKSA6IHR5cGUuc2xpY2UoKTtcclxuICAgICAgc2VhcmNoTGlzdGVuZXJUcmVlLmNhbGwodGhpcywgaGFuZGxlcnMsIG5zLCB0aGlzLmxpc3RlbmVyVHJlZSwgMCk7XHJcbiAgICAgIHJldHVybiBoYW5kbGVycztcclxuICAgIH1cclxuXHJcbiAgICB0aGlzLl9ldmVudHMgfHwgaW5pdC5jYWxsKHRoaXMpO1xyXG5cclxuICAgIGlmICghdGhpcy5fZXZlbnRzW3R5cGVdKSB0aGlzLl9ldmVudHNbdHlwZV0gPSBbXTtcclxuICAgIGlmICghaXNBcnJheSh0aGlzLl9ldmVudHNbdHlwZV0pKSB7XHJcbiAgICAgIHRoaXMuX2V2ZW50c1t0eXBlXSA9IFt0aGlzLl9ldmVudHNbdHlwZV1dO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIHRoaXMuX2V2ZW50c1t0eXBlXTtcclxuICB9O1xyXG5cclxuICBFdmVudEVtaXR0ZXIucHJvdG90eXBlLmV2ZW50TmFtZXMgPSBmdW5jdGlvbigpe1xyXG4gICAgcmV0dXJuIE9iamVjdC5rZXlzKHRoaXMuX2V2ZW50cyk7XHJcbiAgfVxyXG5cclxuICBFdmVudEVtaXR0ZXIucHJvdG90eXBlLmxpc3RlbmVyQ291bnQgPSBmdW5jdGlvbih0eXBlKSB7XHJcbiAgICByZXR1cm4gdGhpcy5saXN0ZW5lcnModHlwZSkubGVuZ3RoO1xyXG4gIH07XHJcblxyXG4gIEV2ZW50RW1pdHRlci5wcm90b3R5cGUubGlzdGVuZXJzQW55ID0gZnVuY3Rpb24oKSB7XHJcblxyXG4gICAgaWYodGhpcy5fYWxsKSB7XHJcbiAgICAgIHJldHVybiB0aGlzLl9hbGw7XHJcbiAgICB9XHJcbiAgICBlbHNlIHtcclxuICAgICAgcmV0dXJuIFtdO1xyXG4gICAgfVxyXG5cclxuICB9O1xyXG5cclxuICBpZiAodHlwZW9mIGRlZmluZSA9PT0gJ2Z1bmN0aW9uJyAmJiBkZWZpbmUuYW1kKSB7XHJcbiAgICAgLy8gQU1ELiBSZWdpc3RlciBhcyBhbiBhbm9ueW1vdXMgbW9kdWxlLlxyXG4gICAgZGVmaW5lKGZ1bmN0aW9uKCkge1xyXG4gICAgICByZXR1cm4gRXZlbnRFbWl0dGVyO1xyXG4gICAgfSk7XHJcbiAgfSBlbHNlIGlmICh0eXBlb2YgZXhwb3J0cyA9PT0gJ29iamVjdCcpIHtcclxuICAgIC8vIENvbW1vbkpTXHJcbiAgICBtb2R1bGUuZXhwb3J0cyA9IEV2ZW50RW1pdHRlcjtcclxuICB9XHJcbiAgZWxzZSB7XHJcbiAgICAvLyBCcm93c2VyIGdsb2JhbC5cclxuICAgIHdpbmRvdy5FdmVudEVtaXR0ZXIyID0gRXZlbnRFbWl0dGVyO1xyXG4gIH1cclxufSgpO1xyXG4iLCIvLyBzaGltIGZvciB1c2luZyBwcm9jZXNzIGluIGJyb3dzZXJcbnZhciBwcm9jZXNzID0gbW9kdWxlLmV4cG9ydHMgPSB7fTtcblxuLy8gY2FjaGVkIGZyb20gd2hhdGV2ZXIgZ2xvYmFsIGlzIHByZXNlbnQgc28gdGhhdCB0ZXN0IHJ1bm5lcnMgdGhhdCBzdHViIGl0XG4vLyBkb24ndCBicmVhayB0aGluZ3MuICBCdXQgd2UgbmVlZCB0byB3cmFwIGl0IGluIGEgdHJ5IGNhdGNoIGluIGNhc2UgaXQgaXNcbi8vIHdyYXBwZWQgaW4gc3RyaWN0IG1vZGUgY29kZSB3aGljaCBkb2Vzbid0IGRlZmluZSBhbnkgZ2xvYmFscy4gIEl0J3MgaW5zaWRlIGFcbi8vIGZ1bmN0aW9uIGJlY2F1c2UgdHJ5L2NhdGNoZXMgZGVvcHRpbWl6ZSBpbiBjZXJ0YWluIGVuZ2luZXMuXG5cbnZhciBjYWNoZWRTZXRUaW1lb3V0O1xudmFyIGNhY2hlZENsZWFyVGltZW91dDtcblxuZnVuY3Rpb24gZGVmYXVsdFNldFRpbW91dCgpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3NldFRpbWVvdXQgaGFzIG5vdCBiZWVuIGRlZmluZWQnKTtcbn1cbmZ1bmN0aW9uIGRlZmF1bHRDbGVhclRpbWVvdXQgKCkge1xuICAgIHRocm93IG5ldyBFcnJvcignY2xlYXJUaW1lb3V0IGhhcyBub3QgYmVlbiBkZWZpbmVkJyk7XG59XG4oZnVuY3Rpb24gKCkge1xuICAgIHRyeSB7XG4gICAgICAgIGlmICh0eXBlb2Ygc2V0VGltZW91dCA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgY2FjaGVkU2V0VGltZW91dCA9IHNldFRpbWVvdXQ7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjYWNoZWRTZXRUaW1lb3V0ID0gZGVmYXVsdFNldFRpbW91dDtcbiAgICAgICAgfVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgY2FjaGVkU2V0VGltZW91dCA9IGRlZmF1bHRTZXRUaW1vdXQ7XG4gICAgfVxuICAgIHRyeSB7XG4gICAgICAgIGlmICh0eXBlb2YgY2xlYXJUaW1lb3V0ID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICBjYWNoZWRDbGVhclRpbWVvdXQgPSBjbGVhclRpbWVvdXQ7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjYWNoZWRDbGVhclRpbWVvdXQgPSBkZWZhdWx0Q2xlYXJUaW1lb3V0O1xuICAgICAgICB9XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBjYWNoZWRDbGVhclRpbWVvdXQgPSBkZWZhdWx0Q2xlYXJUaW1lb3V0O1xuICAgIH1cbn0gKCkpXG5mdW5jdGlvbiBydW5UaW1lb3V0KGZ1bikge1xuICAgIGlmIChjYWNoZWRTZXRUaW1lb3V0ID09PSBzZXRUaW1lb3V0KSB7XG4gICAgICAgIC8vbm9ybWFsIGVudmlyb21lbnRzIGluIHNhbmUgc2l0dWF0aW9uc1xuICAgICAgICByZXR1cm4gc2V0VGltZW91dChmdW4sIDApO1xuICAgIH1cbiAgICAvLyBpZiBzZXRUaW1lb3V0IHdhc24ndCBhdmFpbGFibGUgYnV0IHdhcyBsYXR0ZXIgZGVmaW5lZFxuICAgIGlmICgoY2FjaGVkU2V0VGltZW91dCA9PT0gZGVmYXVsdFNldFRpbW91dCB8fCAhY2FjaGVkU2V0VGltZW91dCkgJiYgc2V0VGltZW91dCkge1xuICAgICAgICBjYWNoZWRTZXRUaW1lb3V0ID0gc2V0VGltZW91dDtcbiAgICAgICAgcmV0dXJuIHNldFRpbWVvdXQoZnVuLCAwKTtcbiAgICB9XG4gICAgdHJ5IHtcbiAgICAgICAgLy8gd2hlbiB3aGVuIHNvbWVib2R5IGhhcyBzY3Jld2VkIHdpdGggc2V0VGltZW91dCBidXQgbm8gSS5FLiBtYWRkbmVzc1xuICAgICAgICByZXR1cm4gY2FjaGVkU2V0VGltZW91dChmdW4sIDApO1xuICAgIH0gY2F0Y2goZSl7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICAvLyBXaGVuIHdlIGFyZSBpbiBJLkUuIGJ1dCB0aGUgc2NyaXB0IGhhcyBiZWVuIGV2YWxlZCBzbyBJLkUuIGRvZXNuJ3QgdHJ1c3QgdGhlIGdsb2JhbCBvYmplY3Qgd2hlbiBjYWxsZWQgbm9ybWFsbHlcbiAgICAgICAgICAgIHJldHVybiBjYWNoZWRTZXRUaW1lb3V0LmNhbGwobnVsbCwgZnVuLCAwKTtcbiAgICAgICAgfSBjYXRjaChlKXtcbiAgICAgICAgICAgIC8vIHNhbWUgYXMgYWJvdmUgYnV0IHdoZW4gaXQncyBhIHZlcnNpb24gb2YgSS5FLiB0aGF0IG11c3QgaGF2ZSB0aGUgZ2xvYmFsIG9iamVjdCBmb3IgJ3RoaXMnLCBob3BmdWxseSBvdXIgY29udGV4dCBjb3JyZWN0IG90aGVyd2lzZSBpdCB3aWxsIHRocm93IGEgZ2xvYmFsIGVycm9yXG4gICAgICAgICAgICByZXR1cm4gY2FjaGVkU2V0VGltZW91dC5jYWxsKHRoaXMsIGZ1biwgMCk7XG4gICAgICAgIH1cbiAgICB9XG5cblxufVxuZnVuY3Rpb24gcnVuQ2xlYXJUaW1lb3V0KG1hcmtlcikge1xuICAgIGlmIChjYWNoZWRDbGVhclRpbWVvdXQgPT09IGNsZWFyVGltZW91dCkge1xuICAgICAgICAvL25vcm1hbCBlbnZpcm9tZW50cyBpbiBzYW5lIHNpdHVhdGlvbnNcbiAgICAgICAgcmV0dXJuIGNsZWFyVGltZW91dChtYXJrZXIpO1xuICAgIH1cbiAgICAvLyBpZiBjbGVhclRpbWVvdXQgd2Fzbid0IGF2YWlsYWJsZSBidXQgd2FzIGxhdHRlciBkZWZpbmVkXG4gICAgaWYgKChjYWNoZWRDbGVhclRpbWVvdXQgPT09IGRlZmF1bHRDbGVhclRpbWVvdXQgfHwgIWNhY2hlZENsZWFyVGltZW91dCkgJiYgY2xlYXJUaW1lb3V0KSB7XG4gICAgICAgIGNhY2hlZENsZWFyVGltZW91dCA9IGNsZWFyVGltZW91dDtcbiAgICAgICAgcmV0dXJuIGNsZWFyVGltZW91dChtYXJrZXIpO1xuICAgIH1cbiAgICB0cnkge1xuICAgICAgICAvLyB3aGVuIHdoZW4gc29tZWJvZHkgaGFzIHNjcmV3ZWQgd2l0aCBzZXRUaW1lb3V0IGJ1dCBubyBJLkUuIG1hZGRuZXNzXG4gICAgICAgIHJldHVybiBjYWNoZWRDbGVhclRpbWVvdXQobWFya2VyKTtcbiAgICB9IGNhdGNoIChlKXtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIC8vIFdoZW4gd2UgYXJlIGluIEkuRS4gYnV0IHRoZSBzY3JpcHQgaGFzIGJlZW4gZXZhbGVkIHNvIEkuRS4gZG9lc24ndCAgdHJ1c3QgdGhlIGdsb2JhbCBvYmplY3Qgd2hlbiBjYWxsZWQgbm9ybWFsbHlcbiAgICAgICAgICAgIHJldHVybiBjYWNoZWRDbGVhclRpbWVvdXQuY2FsbChudWxsLCBtYXJrZXIpO1xuICAgICAgICB9IGNhdGNoIChlKXtcbiAgICAgICAgICAgIC8vIHNhbWUgYXMgYWJvdmUgYnV0IHdoZW4gaXQncyBhIHZlcnNpb24gb2YgSS5FLiB0aGF0IG11c3QgaGF2ZSB0aGUgZ2xvYmFsIG9iamVjdCBmb3IgJ3RoaXMnLCBob3BmdWxseSBvdXIgY29udGV4dCBjb3JyZWN0IG90aGVyd2lzZSBpdCB3aWxsIHRocm93IGEgZ2xvYmFsIGVycm9yLlxuICAgICAgICAgICAgLy8gU29tZSB2ZXJzaW9ucyBvZiBJLkUuIGhhdmUgZGlmZmVyZW50IHJ1bGVzIGZvciBjbGVhclRpbWVvdXQgdnMgc2V0VGltZW91dFxuICAgICAgICAgICAgcmV0dXJuIGNhY2hlZENsZWFyVGltZW91dC5jYWxsKHRoaXMsIG1hcmtlcik7XG4gICAgICAgIH1cbiAgICB9XG5cblxuXG59XG52YXIgcXVldWUgPSBbXTtcbnZhciBkcmFpbmluZyA9IGZhbHNlO1xudmFyIGN1cnJlbnRRdWV1ZTtcbnZhciBxdWV1ZUluZGV4ID0gLTE7XG5cbmZ1bmN0aW9uIGNsZWFuVXBOZXh0VGljaygpIHtcbiAgICBpZiAoIWRyYWluaW5nIHx8ICFjdXJyZW50UXVldWUpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBkcmFpbmluZyA9IGZhbHNlO1xuICAgIGlmIChjdXJyZW50UXVldWUubGVuZ3RoKSB7XG4gICAgICAgIHF1ZXVlID0gY3VycmVudFF1ZXVlLmNvbmNhdChxdWV1ZSk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgcXVldWVJbmRleCA9IC0xO1xuICAgIH1cbiAgICBpZiAocXVldWUubGVuZ3RoKSB7XG4gICAgICAgIGRyYWluUXVldWUoKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGRyYWluUXVldWUoKSB7XG4gICAgaWYgKGRyYWluaW5nKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgdmFyIHRpbWVvdXQgPSBydW5UaW1lb3V0KGNsZWFuVXBOZXh0VGljayk7XG4gICAgZHJhaW5pbmcgPSB0cnVlO1xuXG4gICAgdmFyIGxlbiA9IHF1ZXVlLmxlbmd0aDtcbiAgICB3aGlsZShsZW4pIHtcbiAgICAgICAgY3VycmVudFF1ZXVlID0gcXVldWU7XG4gICAgICAgIHF1ZXVlID0gW107XG4gICAgICAgIHdoaWxlICgrK3F1ZXVlSW5kZXggPCBsZW4pIHtcbiAgICAgICAgICAgIGlmIChjdXJyZW50UXVldWUpIHtcbiAgICAgICAgICAgICAgICBjdXJyZW50UXVldWVbcXVldWVJbmRleF0ucnVuKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcXVldWVJbmRleCA9IC0xO1xuICAgICAgICBsZW4gPSBxdWV1ZS5sZW5ndGg7XG4gICAgfVxuICAgIGN1cnJlbnRRdWV1ZSA9IG51bGw7XG4gICAgZHJhaW5pbmcgPSBmYWxzZTtcbiAgICBydW5DbGVhclRpbWVvdXQodGltZW91dCk7XG59XG5cbnByb2Nlc3MubmV4dFRpY2sgPSBmdW5jdGlvbiAoZnVuKSB7XG4gICAgdmFyIGFyZ3MgPSBuZXcgQXJyYXkoYXJndW1lbnRzLmxlbmd0aCAtIDEpO1xuICAgIGlmIChhcmd1bWVudHMubGVuZ3RoID4gMSkge1xuICAgICAgICBmb3IgKHZhciBpID0gMTsgaSA8IGFyZ3VtZW50cy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgYXJnc1tpIC0gMV0gPSBhcmd1bWVudHNbaV07XG4gICAgICAgIH1cbiAgICB9XG4gICAgcXVldWUucHVzaChuZXcgSXRlbShmdW4sIGFyZ3MpKTtcbiAgICBpZiAocXVldWUubGVuZ3RoID09PSAxICYmICFkcmFpbmluZykge1xuICAgICAgICBydW5UaW1lb3V0KGRyYWluUXVldWUpO1xuICAgIH1cbn07XG5cbi8vIHY4IGxpa2VzIHByZWRpY3RpYmxlIG9iamVjdHNcbmZ1bmN0aW9uIEl0ZW0oZnVuLCBhcnJheSkge1xuICAgIHRoaXMuZnVuID0gZnVuO1xuICAgIHRoaXMuYXJyYXkgPSBhcnJheTtcbn1cbkl0ZW0ucHJvdG90eXBlLnJ1biA9IGZ1bmN0aW9uICgpIHtcbiAgICB0aGlzLmZ1bi5hcHBseShudWxsLCB0aGlzLmFycmF5KTtcbn07XG5wcm9jZXNzLnRpdGxlID0gJ2Jyb3dzZXInO1xucHJvY2Vzcy5icm93c2VyID0gdHJ1ZTtcbnByb2Nlc3MuZW52ID0ge307XG5wcm9jZXNzLmFyZ3YgPSBbXTtcbnByb2Nlc3MudmVyc2lvbiA9ICcnOyAvLyBlbXB0eSBzdHJpbmcgdG8gYXZvaWQgcmVnZXhwIGlzc3Vlc1xucHJvY2Vzcy52ZXJzaW9ucyA9IHt9O1xuXG5mdW5jdGlvbiBub29wKCkge31cblxucHJvY2Vzcy5vbiA9IG5vb3A7XG5wcm9jZXNzLmFkZExpc3RlbmVyID0gbm9vcDtcbnByb2Nlc3Mub25jZSA9IG5vb3A7XG5wcm9jZXNzLm9mZiA9IG5vb3A7XG5wcm9jZXNzLnJlbW92ZUxpc3RlbmVyID0gbm9vcDtcbnByb2Nlc3MucmVtb3ZlQWxsTGlzdGVuZXJzID0gbm9vcDtcbnByb2Nlc3MuZW1pdCA9IG5vb3A7XG5wcm9jZXNzLnByZXBlbmRMaXN0ZW5lciA9IG5vb3A7XG5wcm9jZXNzLnByZXBlbmRPbmNlTGlzdGVuZXIgPSBub29wO1xuXG5wcm9jZXNzLmxpc3RlbmVycyA9IGZ1bmN0aW9uIChuYW1lKSB7IHJldHVybiBbXSB9XG5cbnByb2Nlc3MuYmluZGluZyA9IGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdwcm9jZXNzLmJpbmRpbmcgaXMgbm90IHN1cHBvcnRlZCcpO1xufTtcblxucHJvY2Vzcy5jd2QgPSBmdW5jdGlvbiAoKSB7IHJldHVybiAnLycgfTtcbnByb2Nlc3MuY2hkaXIgPSBmdW5jdGlvbiAoZGlyKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdwcm9jZXNzLmNoZGlyIGlzIG5vdCBzdXBwb3J0ZWQnKTtcbn07XG5wcm9jZXNzLnVtYXNrID0gZnVuY3Rpb24oKSB7IHJldHVybiAwOyB9O1xuIiwiaW1wb3J0ICcuL2pzL21vZHVsZXMvZ2xvYmFsJztcbmltcG9ydCAnLi9qcy9tb2R1bGVzL2NvbmZpZyc7XG5pbXBvcnQgJy4vanMvbW9kdWxlcy91dGlscyc7XG5pbXBvcnQgJy4vanMvbW9kdWxlcy9oYW5kbGVDbGlja3MnO1xuaW1wb3J0ICcuL2pzL21vZHVsZXMvY2FuSVVzZURhdGEnO1xuaW1wb3J0ICcuL2pzL21vZHVsZXMvaW5wdXQnO1xuaW1wb3J0ICcuL2pzL21vZHVsZXMvd2VpcmRDYXNlJztcbiIsIihmdW5jdGlvbihKQykge1xuXG4gIHZhciBjYW5JRGF0YSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5jYW5JRGF0YScpO1xuICB2YXIgY2xpY2tCdG4gPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbcmVsPVwibWFpbl9fY2xpY2tlclwiXScpO1xuXG4gIGZ1bmN0aW9uIGluaXQoKSB7XG4gICAgdmFyIHAxID0gbmV3IFByb21pc2UoXG4gICAgICBmdW5jdGlvbihyZXNvbHZlKSB7XG4gICAgICAgIHZhciByZXF1ZXN0O1xuICAgICAgICBpZiAod2luZG93LlhNTEh0dHBSZXF1ZXN0KSB7XG4gICAgICAgICAgcmVxdWVzdCA9IG5ldyBYTUxIdHRwUmVxdWVzdCgpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJlcXVlc3QgPSBuZXcgQWN0aXZlWE9iamVjdChcIk1pY3Jvc29mdC5YTUxIVFRQXCIpO1xuICAgICAgICB9XG4gICAgICAgIHJlcXVlc3Qub3BlbignR0VUJywgJ2h0dHBzOi8vcmF3LmdpdGh1YnVzZXJjb250ZW50LmNvbS9GeXJkL2Nhbml1c2UvbWFzdGVyL2RhdGEuanNvbicpO1xuICAgICAgICByZXF1ZXN0Lm9ucmVhZHlzdGF0ZWNoYW5nZSA9IGZ1bmN0aW9uKCkge1xuICAgICAgICAgIGlmICgocmVxdWVzdC5yZWFkeVN0YXRlID09PSA0KSAmJiAocmVxdWVzdC5zdGF0dXMgPT09IDIwMCkpIHtcbiAgICAgICAgICAgIGNvbnN0IGNhbklVc2VEYXRhID0gSlNPTi5wYXJzZShyZXF1ZXN0LnJlc3BvbnNlVGV4dCk7XG4gICAgICAgICAgICByZXNvbHZlKGNhbklVc2VEYXRhKTtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGNhbklVc2VEYXRhLmRhdGEpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXF1ZXN0LnNlbmQoKTtcbiAgICAgIH0pO1xuICAgIHAxXG4gICAgICAudGhlbihjYW5JVXNlRGF0YSA9PiB7XG5cbiAgICAgICAgdmFyIHRpdGxlcz0gXCJcIjtcblxuICAgICAgICBpZiAodHJ1ZSkge1xuICAgICAgICAgIGZvciAobGV0IGkgaW4gY2FuSVVzZURhdGEuZGF0YSkge1xuICAgICAgICAgICAgdGl0bGVzICs9IFwiPGRpdiBjbGFzcz0nZGF0YV9faXRlbSc+XCJcbiAgICAgICAgICAgIHRpdGxlcyArPSBcIjxoNT5cIiArIGNhbklVc2VEYXRhLmRhdGFbaV0udGl0bGUgKyBcIjwvaDU+XCJcbiAgICAgICAgICAgIHRpdGxlcyArPSBcIjxwPlwiICsgY2FuSVVzZURhdGEuZGF0YVtpXS5kZXNjcmlwdGlvbiArIFwiPC9wPlwiXG4gICAgICAgICAgICB0aXRsZXMgKz0gXCI8YSBocmVmPVwiICsgY2FuSVVzZURhdGEuZGF0YVtpXS5saW5rc1swXS51cmwgKyBcIj5cIiArIFwibGlua1wiICsgXCI8L2E+XCJcbiAgICAgICAgICAgIHRpdGxlcyArPSBcIjwvZGl2PlwiXG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgICBjYW5JRGF0YS5pbm5lckhUTUwgPSB0aXRsZXM7XG5cbiAgICAgICAgfSlcbiAgfVxuXG4gIGNsaWNrQnRuLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBpbml0KTtcblxuICBpZiAoXCJQcm9taXNlXCIgaW4gd2luZG93KSB7ICAgLy8gQ2hlY2sgZm9yIFByb21pc2Ugb24gd2luZG93XG4gICAgY29uc29sZS5sb2coJ1Byb21pc2VzIGFyZSBzdXBwb3J0ZWQnKTtcbiAgICBFVlQub24oXCJpbml0XCIsIGluaXQpO1xuICAgfSBlbHNlIHtcbiAgICAgY29uc29sZS5sb2coJ1lvdXIgYnJvd3NlciBkb2VzblxcJ3Qgc3VwcG9ydCB0aGUgPGNvZGU+UHJvbWlzZTxjb2RlPiBpbnRlcmZhY2UuJyk7XG4gICB9XG5cbn0pKEpDKTtcbiIsImNvbnN0IGNvbmZpZyA9IEpDLmNvbmZpZyA9IHt9O1xuICBjb25maWcucHJvamVjdCA9ICdqdXN0eW5DbGFyay1uZXcnO1xuICBjb25maWcuZGV2ZWxvcGVyID0gJ2p1c3R5biBjbGFyayc7XG4gIGNvbmZpZy52ZXJzaW9uID0gXCIxLjAuMFwiO1xuXG4iLCJ2YXIgY29va2llTWFwO1xuLy8gQ29va2llc1xuSkMudXRpbHMuZ2V0Q29va2llcyA9IHVwZGF0ZSA9PiB7IC8vIEdldCBjb29raWVzXG4gIGlmKCFjb29raWVNYXAgfHwgdXBkYXRlKSB7XG4gICAgY29va2llTWFwID0ge307XG4gICAgdmFyIGksIGNvb2tpZXMgPSBkb2N1bWVudC5jb29raWUuc3BsaXQoXCI7XCIpO1xuICAgIGZvciAoaSA9IDA7IGkgPCBjb29raWVzLmxlbmd0aDsgaSsrKSB7XG4gICAgICB2YXIgaW5kZXggPSBjb29raWVzW2ldLmluZGV4T2YoJz0nKTtcbiAgICAgIHZhciB4ID0gY29va2llc1tpXS5zdWJzdHIoMCwgaW5kZXgpO1xuICAgICAgdmFyIHkgPSBjb29raWVzW2ldLnN1YnN0cihpbmRleCArIDEpO1xuICAgICAgeCA9IHgucmVwbGFjZSgvXlxccyt8XFxzKyQvZywgJycpO1xuICAgICAgaWYoeCkgY29va2llTWFwW3hdID0gZGVjb2RlVVJJKHkpO1xuICAgIH1cbiAgfVxuICByZXR1cm4gY29va2llTWFwO1xufTtcblxuSkMudXRpbHMuZ2V0Q29va2llID0gKGMsIHVwZGF0ZSkgPT4geyAvLyBHZXQgY29va2llXG4gIHJldHVybiB0aGlzLmdldENvb2tpZXModXBkYXRlKVtjXTtcbn07XG5cbkpDLnV0aWxzLnNldENvb2tpZSA9IChuYW1lLCB2YWx1ZSwgb3B0cykgPT4geyAvLyBTZXQgY29va2llIEpDLnV0aWxzLnNldENvb2tpZSgnamNDb29raWUnLHRydWUsIHtleHBpcmVEYXRlOiAoMzYwMCAqIDI0ICogMzY1KX0pO1xuICB2YXIgdmFsdWUgPSBlbmNvZGVVUkkodmFsdWUpO1xuICBvcHRzID0gb3B0cyB8fCB7fTtcbiAgdmFsdWUgKz0gXCI7cGF0aD1cIiArIChvcHRzLnBhdGggfHwgXCIvXCIpO1xuICBpZihvcHRzLmRvbWFpbikgdmFsdWUgKz0gXCI7ZG9tYWluPVwiICsgb3B0cy5kb21haW47XG4gIHZhciB0ID0gdHlwZW9mIG9wdHMubWF4QWdlO1xuICBpZih0ID09IFwibnVtYmVyXCIgfHwgdCA9PSBcInN0cmluZ1wiKSB2YWx1ZSArPSBcIjttYXgtYWdlPVwiICsgb3B0cy5tYXhBZ2U7XG4gIHZhciBlID0gb3B0cy5leHBpcmVEYXRlO1xuICBpZih0eXBlb2YgZSA9PSBcIm51bWJlclwiKSBlID0gbmV3IERhdGUoKG5ldyBEYXRlKCkpLmdldFRpbWUoKSArIGUgKiAxMDAwKTtcbiAgaWYoZSkgdmFsdWUgKz0gJztleHBpcmVzPScgKyBlLnRvVVRDU3RyaW5nKCk7XG4gIGlmKG9wdHMuc2VjdXJlKSB2YWx1ZSArPSBcIjtzZWN1cmVcIjtcbiAgZG9jdW1lbnQuY29va2llID0gbmFtZSArICc9JyArIHZhbHVlO1xuICBjb29raWVNYXAgPSBudWxsO1xufTtcblxuc2V0VGltZW91dCgoKT0+IHtcbiAgaWYgKCFkb2N1bWVudC5jb29raWUubWF0Y2goJ2pjQ29va2llJykpIHtcbiAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcuY29va2llLXBvbGljeScpLmNsYXNzTGlzdC5hZGQoJ2Nvb2tpZS1wb2xpY3ktLXNob3cnKTtcbiAgfSBlbHNlIHtcbiAgICBjb25zb2xlLmxvZygnY29va2llIHBvbGljeSBpcyBoaWRkZW4nKTtcbiAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcuY29va2llLXBvbGljeScpLmNsYXNzTGlzdC5hZGQoJ2Nvb2tpZS1wb2xpY3ktLWhpZGUnKTtcbiAgfVxufSwxMDAwKTtcblxuZXhwb3J0IGNvbnN0IHNldFBvbGljeUNvb2tpZSA9ICgpID0+IHtcbiAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLmNvb2tpZS1wb2xpY3knKS5jbGFzc0xpc3QuYWRkKCdjb29raWUtcG9saWN5LS1oaWRlJyk7XG4gIGNvbnNvbGUubG9nKCdjb29raWUgc2V0Jyk7XG4gIEpDLnV0aWxzLnNldENvb2tpZSgnamNDb29raWUnLCB0cnVlLCB7ZXhwaXJlRGF0ZTogKDM2MDAgKiAyNCAqIDM2NSl9KTtcbn1cbiIsImltcG9ydCBFdmVudEVtaXR0ZXIyIGZyb20gJ2V2ZW50ZW1pdHRlcjInO1xuXG4oZnVuY3Rpb24oZ2xvYmFsKXtcblxuICBnbG9iYWwuSkMgPSBnbG9iYWwuSkMgIT09IHVuZGVmaW5lZCA/IEpDIDoge307IC8vIFNldCB1cCBnbG9iYWwgdmFyaWFibGVzXG5cbiAgSkMuY29tcG9uZW50cyA9IHt9O1xuICBKQy5jb25maWcgPSB7fTtcbiAgSkMubWVudSA9IHt9O1xuICBKQy51dGlscyA9IHt9O1xuXG4gIGdsb2JhbC5FVlQgPSBuZXcgRXZlbnRFbWl0dGVyMigpO1xuXG4gIGdsb2JhbC5hZGRFdmVudExpc3RlbmVyKCdET01Db250ZW50TG9hZGVkJywgZnVuY3Rpb24oKSB7XG4gICAgRVZULmVtaXQoJ2luaXQnKTtcbiAgfSk7XG5cbiAgY29uc29sZS5sb2coSkMpO1xuXG4gIGNvbnN0IHN0ciA9ICdFUzYnXG4gIGNvbnNvbGUubG9nKGBIZWxsbyAke3N0cn1gKVxuXG59KSh3aW5kb3cpO1xuIiwiaW1wb3J0IHsgc2V0UG9saWN5Q29va2llIH0gZnJvbSAnLi9jb29raWVzJztcbmltcG9ydCB7IGxvYWROYW1lcyB9IGZyb20gJy4vbG9hZE5hbWVzJztcblxuLy8gU2V0IHVwIGNsaWNrIGhhbmRsZXJzXG5leHBvcnQgY29uc3QgY2xpY2tIYW5kbGVycyA9ICgpID0+IHtcbiAgdmFyIGFkZGVyID0gSkMudXRpbHMuYWRkZXIoKTtcbiAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcignW3JlbD1cIm1haW5fX2xvYWROYW1lc1wiXScpLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgbG9hZE5hbWVzKTtcbiAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcignW3JlbD1cIm1haW5fX29wZW5PdmVybGF5XCJdJykuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBKQy51dGlscy5vcGVuT3ZlcmxheSk7IC8vIG9wZW4gb3ZlcmxheVxuICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcub3ZlcmxheScpLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgSkMudXRpbHMuY2xvc2VPdmVybGF5KTsgLy8gY2xvc2Ugb3ZlcmxheVxuICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbcmVsPVwibWFpbl9fY2xpY2tlclwiXScpLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgZnVuY3Rpb24oKSB7XG4gICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcignW3JlbD1cIm1haW5fX2NsaWNrZXJcIl0nKS5pbm5lckhUTUwgPSBhZGRlcigpO1xuICB9KTtcbiAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLmNvb2tpZS1wb2xpY3lfX2Nsb3NlJykuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBzZXRQb2xpY3lDb29raWUpOyAvLyBDb29raWUgUG9saWN5XG59XG5cbkVWVC5vbignaW5pdCcsIGNsaWNrSGFuZGxlcnMpO1xuXG4iLCIoZnVuY3Rpb24oKSB7XG5cbiAgY29uc3QgYW5zd2VycyA9IFtdO1xuXG4gIHZhciBmb3JtID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLmZvcm0nKTtcblxuICBjb25zdCBpbnB1dEZ1bmMgPSAoZSk9PiB7XG4gICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuXG4gICAgdmFyIGlucHV0VmFsdWUgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbbmFtZT1pdGVtXScpLnZhbHVlO1xuXG4gICAgYW5zd2Vycy5wdXNoKGlucHV0VmFsdWUpXG5cbiAgICBsb2NhbFN0b3JhZ2Uuc2V0SXRlbSgnYW5zd2VycycsIEpTT04uc3RyaW5naWZ5KGFuc3dlcnMpKTtcblxuICAgIHZhciBhbnN3ZXJzT2JqID0gSlNPTi5wYXJzZShsb2NhbFN0b3JhZ2UuZ2V0SXRlbSgnYW5zd2VycycpKTtcblxuICAgIGNvbnNvbGUubG9nKGFuc3dlcnNPYmopO1xuXG4gICAgbG9jYWxTdG9yYWdlLnNldEl0ZW0oSkMudXRpbHMucmFuZG9tTnVtYmVyKCksIGlucHV0VmFsdWUpO1xuXG4gICAgLy90aGlzLnJlc2V0KCk7XG5cbiAgfVxuXG4gIGZvcm0uYWRkRXZlbnRMaXN0ZW5lcignc3VibWl0JywgaW5wdXRGdW5jKTtcblxufSkoKTtcblxuIiwiZXhwb3J0IGNvbnN0IGxvYWROYW1lcyA9ICgpID0+IHtcbiAgdmFyIHJlcXVlc3Q7XG4gIGlmICh3aW5kb3cuWE1MSHR0cFJlcXVlc3QpIHtcbiAgICByZXF1ZXN0ID0gbmV3IFhNTEh0dHBSZXF1ZXN0KCk7XG4gIH0gZWxzZSB7XG4gICAgcmVxdWVzdCA9IG5ldyBBY3RpdmVYT2JqZWN0KFwiTWljcm9zb2Z0LlhNTEhUVFBcIik7XG4gIH1cbiAgcmVxdWVzdC5vcGVuKCdHRVQnLCAnaHR0cHM6Ly9qc29ucGxhY2Vob2xkZXIudHlwaWNvZGUuY29tL3VzZXJzJyk7XG4gIHJlcXVlc3Qub25yZWFkeXN0YXRlY2hhbmdlID0gZnVuY3Rpb24oKSB7XG4gICAgaWYgKChyZXF1ZXN0LnJlYWR5U3RhdGUgPT09IDQpICYmIChyZXF1ZXN0LnN0YXR1cyA9PT0gMjAwKSkge1xuICAgICAgdmFyIGRhdGEgPSBKU09OLnBhcnNlKHJlcXVlc3QucmVzcG9uc2VUZXh0KTtcbiAgICAgIGNvbnNvbGUubG9nKGRhdGEpO1xuICAgICAgbG9jYWxTdG9yYWdlLnNldEl0ZW0oJ2RhdGEnLCBKU09OLnN0cmluZ2lmeShkYXRhKSk7XG5cbiAgICAgIGZvcihsZXQgaSA9IDA7IGkgPCBkYXRhLmxlbmd0aDsgaSsrKXtcbiAgICAgICAgY29uc29sZS5sb2coZGF0YVtpXS5uYW1lKVxuXG4gICAgICAgIHZhciBuYW1lcyA9IGRhdGFbaV0ubmFtZSArIFwiPGJyPlwiO1xuXG4gICAgICB9XG5cbiAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tyZWw9Y29weVNlY3Rpb25dJykuaW5uZXJIVE1MID0gbmFtZXM7XG5cbiAgICB9XG4gIH1cbiAgcmVxdWVzdC5zZW5kKCk7XG59XG5cbiIsImltcG9ydCAnLi9jb29raWVzJztcblxuSkMudXRpbHMuYWRkZXIgPSAoKT0+IHtcbiAgdmFyIHBsdXMgPSBmdW5jdGlvbigpIHtcbiAgICB2YXIgY291bnRlciA9IDA7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIGNvdW50ZXIrK1xuICAgIH1cbiAgfVxuICByZXR1cm4gcGx1cygpXG59XG5cbi8vIHRoaXMgY2hlY2tlclxuSkMudXRpbHMudGhpc0NoZWNrID0gZnVuY3Rpb24oKSB7XG4gIGNvbnNvbGUubG9nKHRoaXMpO1xufVxuXG5KQy51dGlscy5yYW5kb21OdW1iZXIgPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIDEwMDApXG59O1xuXG5KQy51dGlscy5vdXRwdXQgPSBmdW5jdGlvbih4KSB7XG4gIGNvbnNvbGUubG9nKHgpO1xufVxuXG4vLyBDaGFyYWN0ZXIgY291bnQgaW4gRWxlbWVudFxuSkMudXRpbHMuY2hhcnNJbkVsZW1lbnQgPSBlbG0gPT4ge1xuICBpZiAoZWxtLm5vZGVUeXBlID09IDMpIHsgLy8gVEVYVF9OT0RFXG4gICAgcmV0dXJuIGVsbS5ub2RlVmFsdWUubGVuZ3RoO1xuICB9XG4gIHZhciBjb3VudCA9IDA7XG4gIGZvciAodmFyIGkgPSAwLCBjaGlsZDsgY2hpbGQgPSBlbG0uY2hpbGROb2Rlc1tpXTsgaSsrKSB7XG4gICAgY291bnQgKz0gSkMudXRpbHMuY2hhcnNJbkVsZW1lbnQoY2hpbGQpO1xuICB9XG4gIHJldHVybiBjb3VudDtcbn1cblxuLy8gQWxlcnQgdXRpbGl0eVxuSkMudXRpbHMuYWxlcnQgPSBhID0+IHtcbiAgYWxlcnQoYSk7XG59XG5cbkpDLnV0aWxzLnNob3dCb2R5Q2hhck51bSA9ICgpID0+IHtcbiAgdmFyIGVsbSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ2JvZHknKTtcbiAgY29uc29sZS5sb2coXCJUaGlzIHBhZ2UgaGFzIFwiICsgSkMudXRpbHMuY2hhcnNJbkVsZW1lbnQoZWxtKSArIFwiIGNoYXJhY3RlcnMgaW4gdGhlIGJvZHlcIik7XG59O1xuXG5KQy51dGlscy5vcGVuT3ZlcmxheSA9ICgpID0+ICB7XG4gIGNvbnN0IG92ZXJsYXkgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcub3ZlcmxheScpO1xuICBvdmVybGF5LmNsYXNzTGlzdC50b2dnbGUoJ292ZXJsYXktLW9wZW4nKTtcbiAgY29uc29sZS5sb2coJ292ZXJsYXkgb3BlbicpO1xufVxuXG5KQy51dGlscy5jbG9zZU92ZXJsYXkgPSAoKSA9PiAge1xuICBjb25zdCBvdmVybGF5ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLm92ZXJsYXknKTtcbiAgb3ZlcmxheS5jbGFzc0xpc3QucmVtb3ZlKCdvdmVybGF5LS1vcGVuJyk7XG4gIGNvbnNvbGUubG9nKCdvdmVybGF5IGNsb3NlZCcpO1xufVxuXG5cblxuZXhwb3J0IGZ1bmN0aW9uIHJhbmROdW1HZW4obWF4KSB7XG4gIHJldHVybiBNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiBtYXgpXG59O1xuXG5cbmV4cG9ydCBmdW5jdGlvbiBjb29sRnVuaygpIHtcbiAgY29uc29sZS5sb2coJ3RoaXMgbG92ZSBpcyB0YWtpbmcgYSBob2xkIG9mIG1lJyk7XG59O1xuIiwiZnVuY3Rpb24gZ2V0SW5kZXgodmFsLCBpbmRleCkge1xuICBpZiAoaW5kZXggJSAyID09IDApIHtcbiAgICByZXR1cm4gdmFsLnRvVXBwZXJDYXNlKClcbiAgfVxuICBpZiAoaW5kZXggJSAyID09IDEpIHtcbiAgICByZXR1cm4gdmFsLnRvTG93ZXJDYXNlKClcbiAgfVxufVxuXG5mdW5jdGlvbiB0b1VwcGVyTG93ZXIoc3RyaW5nKSB7XG4gIHJldHVybiBzdHJpbmcuc3BsaXQoJycpLm1hcChnZXRJbmRleCkuam9pbignJyk7XG59O1xuXG5mdW5jdGlvbiB0b1dlaXJkQ2FzZSh0ZXh0KXtcbiAgcmV0dXJuIHRleHQuc3BsaXQoJyAnKS5tYXAoZnVuY3Rpb24odmFsKSB7XG4gICAgcmV0dXJuIHRvVXBwZXJMb3dlcih2YWwpXG4gIH0pLmpvaW4oJyAnKVxuXG59XG5cbmNvbnNvbGUubG9nKHRvV2VpcmRDYXNlKCdXZWlyZCBzdHJpbmcgY2FzZScpKTtcbiJdfQ==
