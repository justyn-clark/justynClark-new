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

require('./js/modules/randomNames');

},{"./js/modules/canIUseData":4,"./js/modules/config":5,"./js/modules/global":7,"./js/modules/handleClicks":8,"./js/modules/input":9,"./js/modules/randomNames":11,"./js/modules/utils":12,"./js/modules/weirdCase":13}],4:[function(require,module,exports){
'use strict';

(function () {

  var canIData = document.querySelector('.canIData');
  //var clickBtn = document.querySelector('[rel="main__clicker"]');

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

      for (var i in canIUseData.data) {
        titles += "<div class='data__item'>";
        titles += "<h5>" + canIUseData.data[i].title + "</h5>";
        titles += "<p>" + canIUseData.data[i].description + "</p>";
        titles += "<a href=" + canIUseData.data[i].links[0].url + ">" + "link" + "</a>";
        titles += "</div>";
      }

      canIData.innerHTML = titles;
    });
  }

  //clickBtn.addEventListener("click", init);

  if ("Promise" in window) {
    // Check for Promise on window
    console.log('Promises are supported');
    EVT.on("init", init);
  } else {
    console.log('Your browser doesn\'t support the <code>Promise<code> interface.');
  }
})();

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

var _cookies = require('./cookies');

var _loadNames = require('./loadNames');

var _utils = require('./utils');

var x = (0, _utils.youTubePlayer)('RKYjdTiMkXM');

// Set up click handlers
function clickHandlers() {

  var adder = JC.utils.adder();
  var openOverlay = document.querySelector('[rel="main__openOverlay"]');
  var overlay = document.querySelector('.overlay');

  document.querySelector('[rel="main__loadNames"]').addEventListener('click', _loadNames.loadNames);

  document.querySelector('[rel="main__clicker"]').addEventListener('click', function () {
    document.querySelector('[rel="main__clicker"]').innerHTML = adder();
  });

  document.querySelector('.cookie-policy__close').addEventListener('click', _cookies.setPolicyCookie); // Cookie Policy

  overlay.addEventListener('click', JC.utils.closeOverlay); // close overlay
  openOverlay.addEventListener('click', JC.utils.openOverlay); // open overlay
  openOverlay.addEventListener('click', x); // open overlay
}

EVT.on('init', clickHandlers);

},{"./cookies":6,"./loadNames":10,"./utils":12}],9:[function(require,module,exports){
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
exports.loadNames = loadNames;
function loadNames() {

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
      localStorage.setItem('data', JSON.stringify(data));
      console.log(data);

      var names = '';
      for (var i = 0; i < data.length; i++) {
        names += '<div class="person">';
        names += '<h5>' + data[i].username + "</h5>";
        names += '<p>' + data[i].name + "</p>";
        names += '<i>' + data[i].email + "</i>";
        names += '</div>';
        console.log(data[i].name);
      }
      document.querySelector('[rel=copySection]').innerHTML = names;
    }
  };

  request.send();
}

},{}],11:[function(require,module,exports){
'use strict';

var _utils = require('./utils');

var _weirdCase = require('./weirdCase');

(function () {
  var firstNames = ["big", "ol dirty", "lil", "the legendary", "chief", "boss", 'young', 'sleepy', 'OG', 'AKA', 'The Champ'];
  var lastNames = ["mac", "wig wig", "bastard", "mote", "johnson", "smasher", 'jones', 'dawg', 'almighty', 'the illest', 'bae', 'skezz'];

  function getRandName(arr) {
    return arr[(0, _utils.randNumGen)(arr.length)];
  }

  document.querySelector('.randName').innerHTML = (0, _weirdCase.toWeirdCase)(getRandName(firstNames)) + ' ' + (0, _weirdCase.toWeirdCase)(getRandName(lastNames));
})();

},{"./utils":12,"./weirdCase":13}],12:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.randNumGen = randNumGen;
exports.coolFunk = coolFunk;
exports.youTubePlayer = youTubePlayer;

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

function randNumGen(max) {
  return Math.floor(Math.random() * max);
};

function coolFunk() {
  console.log('this love is taking a hold of me');
};

function youTubePlayer(id) {

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

/*<iframe width="1280" height="720" src="https://www.youtube.com/embed/RKYjdTiMkXM?rel=0&amp;controls=0&amp;showinfo=0" frameborder="0" allowfullscreen=""></iframe>*/

},{"./cookies":6}],13:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.toWeirdCase = toWeirdCase;
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

//document.querySelector('.randName').insertAdjacentHTML('beforebegin', '<div class="">' + toWeirdCase('Weird string case') + '</div>')

},{}]},{},[3])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvZXZlbnRlbWl0dGVyMi9saWIvZXZlbnRlbWl0dGVyMi5qcyIsIm5vZGVfbW9kdWxlcy9wcm9jZXNzL2Jyb3dzZXIuanMiLCJzcmMvYXBwLmpzIiwic3JjL2pzL21vZHVsZXMvY2FuSVVzZURhdGEuanMiLCJzcmMvanMvbW9kdWxlcy9jb25maWcuanMiLCJzcmMvanMvbW9kdWxlcy9jb29raWVzLmpzIiwic3JjL2pzL21vZHVsZXMvZ2xvYmFsLmpzIiwic3JjL2pzL21vZHVsZXMvaGFuZGxlQ2xpY2tzLmpzIiwic3JjL2pzL21vZHVsZXMvaW5wdXQuanMiLCJzcmMvanMvbW9kdWxlcy9sb2FkTmFtZXMuanMiLCJzcmMvanMvbW9kdWxlcy9yYW5kb21OYW1lcy5qcyIsInNyYy9qcy9tb2R1bGVzL3V0aWxzLmpzIiwic3JjL2pzL21vZHVsZXMvd2VpcmRDYXNlLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOztBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7OztBQ3h3QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7OztBQ3hMQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7Ozs7QUNQQSxDQUFDLFlBQVc7O0FBRVYsTUFBSSxXQUFXLFNBQVMsYUFBVCxDQUF1QixX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QVksWUFBWixDQUF5QixPQUF6QixFQUFrQyxhQUFsQztBQUNBLGlCQUFhLFlBQWIsQ0FBMEIsT0FBMUIsRUFBbUMsY0FBbkM7O0FBRUEsZ0JBQVksV0FBWixDQUF3QixZQUF4QjtBQUNBLGlCQUFhLFdBQWIsQ0FBeUIsU0FBekI7O0FBRUEsU0FBSyxXQUFMLENBQWlCLFdBQWpCOztBQUVBLFlBQVEsR0FBUixDQUFZLFFBQVo7QUFDRCxHQXRCRDtBQXdCTDs7QUFJRDs7Ozs7Ozs7UUNuR2dCLFcsR0FBQSxXO0FBYmhCLFNBQVMsUUFBVCxDQUFrQixHQUFsQixFQUF1QixLQUF2QixFQUE4QjtBQUM1QixNQUFJLFFBQVEsQ0FBUixJQUFhLENBQWpCLEVBQW9CO0FBQ2xCLFdBQU8sSUFBSSxXQUFKLEVBQVA7QUFDRDtBQUNELE1BQUksUUFBUSxDQUFSLElBQWEsQ0FBakIsRUFBb0I7QUFDbEIsV0FBTyxJQUFJLFdBQUosRUFBUDtBQUNEO0FBQ0Y7O0FBRUQsU0FBUyxZQUFULENBQXNCLE1BQXRCLEVBQThCO0FBQzVCLFNBQU8sT0FBTyxLQUFQLENBQWEsRUFBYixFQUFpQixHQUFqQixDQUFxQixRQUFyQixFQUErQixJQUEvQixDQUFvQyxFQUFwQyxDQUFQO0FBQ0Q7O0FBRU0sU0FBUyxXQUFULENBQXFCLElBQXJCLEVBQTBCO0FBQy9CLFNBQU8sS0FBSyxLQUFMLENBQVcsR0FBWCxFQUFnQixHQUFoQixDQUFvQixVQUFTLEdBQVQsRUFBYztBQUN2QyxXQUFPLGFBQWEsR0FBYixDQUFQO0FBQ0QsR0FGTSxFQUVKLElBRkksQ0FFQyxHQUZELENBQVA7QUFJRDs7QUFFRCIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCIvKiFcclxuICogRXZlbnRFbWl0dGVyMlxyXG4gKiBodHRwczovL2dpdGh1Yi5jb20vaGlqMW54L0V2ZW50RW1pdHRlcjJcclxuICpcclxuICogQ29weXJpZ2h0IChjKSAyMDEzIGhpajFueFxyXG4gKiBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIGxpY2Vuc2UuXHJcbiAqL1xyXG47IWZ1bmN0aW9uKHVuZGVmaW5lZCkge1xyXG5cclxuICB2YXIgaXNBcnJheSA9IEFycmF5LmlzQXJyYXkgPyBBcnJheS5pc0FycmF5IDogZnVuY3Rpb24gX2lzQXJyYXkob2JqKSB7XHJcbiAgICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKG9iaikgPT09IFwiW29iamVjdCBBcnJheV1cIjtcclxuICB9O1xyXG4gIHZhciBkZWZhdWx0TWF4TGlzdGVuZXJzID0gMTA7XHJcblxyXG4gIGZ1bmN0aW9uIGluaXQoKSB7XHJcbiAgICB0aGlzLl9ldmVudHMgPSB7fTtcclxuICAgIGlmICh0aGlzLl9jb25mKSB7XHJcbiAgICAgIGNvbmZpZ3VyZS5jYWxsKHRoaXMsIHRoaXMuX2NvbmYpO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gY29uZmlndXJlKGNvbmYpIHtcclxuICAgIGlmIChjb25mKSB7XHJcbiAgICAgIHRoaXMuX2NvbmYgPSBjb25mO1xyXG5cclxuICAgICAgY29uZi5kZWxpbWl0ZXIgJiYgKHRoaXMuZGVsaW1pdGVyID0gY29uZi5kZWxpbWl0ZXIpO1xyXG4gICAgICB0aGlzLl9tYXhMaXN0ZW5lcnMgPSBjb25mLm1heExpc3RlbmVycyAhPT0gdW5kZWZpbmVkID8gY29uZi5tYXhMaXN0ZW5lcnMgOiBkZWZhdWx0TWF4TGlzdGVuZXJzO1xyXG5cclxuICAgICAgY29uZi53aWxkY2FyZCAmJiAodGhpcy53aWxkY2FyZCA9IGNvbmYud2lsZGNhcmQpO1xyXG4gICAgICBjb25mLm5ld0xpc3RlbmVyICYmICh0aGlzLm5ld0xpc3RlbmVyID0gY29uZi5uZXdMaXN0ZW5lcik7XHJcbiAgICAgIGNvbmYudmVyYm9zZU1lbW9yeUxlYWsgJiYgKHRoaXMudmVyYm9zZU1lbW9yeUxlYWsgPSBjb25mLnZlcmJvc2VNZW1vcnlMZWFrKTtcclxuXHJcbiAgICAgIGlmICh0aGlzLndpbGRjYXJkKSB7XHJcbiAgICAgICAgdGhpcy5saXN0ZW5lclRyZWUgPSB7fTtcclxuICAgICAgfVxyXG4gICAgfSBlbHNlIHtcclxuICAgICAgdGhpcy5fbWF4TGlzdGVuZXJzID0gZGVmYXVsdE1heExpc3RlbmVycztcclxuICAgIH1cclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIGxvZ1Bvc3NpYmxlTWVtb3J5TGVhayhjb3VudCwgZXZlbnROYW1lKSB7XHJcbiAgICB2YXIgZXJyb3JNc2cgPSAnKG5vZGUpIHdhcm5pbmc6IHBvc3NpYmxlIEV2ZW50RW1pdHRlciBtZW1vcnkgJyArXHJcbiAgICAgICAgJ2xlYWsgZGV0ZWN0ZWQuICcgKyBjb3VudCArICcgbGlzdGVuZXJzIGFkZGVkLiAnICtcclxuICAgICAgICAnVXNlIGVtaXR0ZXIuc2V0TWF4TGlzdGVuZXJzKCkgdG8gaW5jcmVhc2UgbGltaXQuJztcclxuXHJcbiAgICBpZih0aGlzLnZlcmJvc2VNZW1vcnlMZWFrKXtcclxuICAgICAgZXJyb3JNc2cgKz0gJyBFdmVudCBuYW1lOiAnICsgZXZlbnROYW1lICsgJy4nO1xyXG4gICAgfVxyXG5cclxuICAgIGlmKHR5cGVvZiBwcm9jZXNzICE9PSAndW5kZWZpbmVkJyAmJiBwcm9jZXNzLmVtaXRXYXJuaW5nKXtcclxuICAgICAgdmFyIGUgPSBuZXcgRXJyb3IoZXJyb3JNc2cpO1xyXG4gICAgICBlLm5hbWUgPSAnTWF4TGlzdGVuZXJzRXhjZWVkZWRXYXJuaW5nJztcclxuICAgICAgZS5lbWl0dGVyID0gdGhpcztcclxuICAgICAgZS5jb3VudCA9IGNvdW50O1xyXG4gICAgICBwcm9jZXNzLmVtaXRXYXJuaW5nKGUpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgY29uc29sZS5lcnJvcihlcnJvck1zZyk7XHJcblxyXG4gICAgICBpZiAoY29uc29sZS50cmFjZSl7XHJcbiAgICAgICAgY29uc29sZS50cmFjZSgpO1xyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBFdmVudEVtaXR0ZXIoY29uZikge1xyXG4gICAgdGhpcy5fZXZlbnRzID0ge307XHJcbiAgICB0aGlzLm5ld0xpc3RlbmVyID0gZmFsc2U7XHJcbiAgICB0aGlzLnZlcmJvc2VNZW1vcnlMZWFrID0gZmFsc2U7XHJcbiAgICBjb25maWd1cmUuY2FsbCh0aGlzLCBjb25mKTtcclxuICB9XHJcbiAgRXZlbnRFbWl0dGVyLkV2ZW50RW1pdHRlcjIgPSBFdmVudEVtaXR0ZXI7IC8vIGJhY2t3YXJkcyBjb21wYXRpYmlsaXR5IGZvciBleHBvcnRpbmcgRXZlbnRFbWl0dGVyIHByb3BlcnR5XHJcblxyXG4gIC8vXHJcbiAgLy8gQXR0ZW50aW9uLCBmdW5jdGlvbiByZXR1cm4gdHlwZSBub3cgaXMgYXJyYXksIGFsd2F5cyAhXHJcbiAgLy8gSXQgaGFzIHplcm8gZWxlbWVudHMgaWYgbm8gYW55IG1hdGNoZXMgZm91bmQgYW5kIG9uZSBvciBtb3JlXHJcbiAgLy8gZWxlbWVudHMgKGxlYWZzKSBpZiB0aGVyZSBhcmUgbWF0Y2hlc1xyXG4gIC8vXHJcbiAgZnVuY3Rpb24gc2VhcmNoTGlzdGVuZXJUcmVlKGhhbmRsZXJzLCB0eXBlLCB0cmVlLCBpKSB7XHJcbiAgICBpZiAoIXRyZWUpIHtcclxuICAgICAgcmV0dXJuIFtdO1xyXG4gICAgfVxyXG4gICAgdmFyIGxpc3RlbmVycz1bXSwgbGVhZiwgbGVuLCBicmFuY2gsIHhUcmVlLCB4eFRyZWUsIGlzb2xhdGVkQnJhbmNoLCBlbmRSZWFjaGVkLFxyXG4gICAgICAgIHR5cGVMZW5ndGggPSB0eXBlLmxlbmd0aCwgY3VycmVudFR5cGUgPSB0eXBlW2ldLCBuZXh0VHlwZSA9IHR5cGVbaSsxXTtcclxuICAgIGlmIChpID09PSB0eXBlTGVuZ3RoICYmIHRyZWUuX2xpc3RlbmVycykge1xyXG4gICAgICAvL1xyXG4gICAgICAvLyBJZiBhdCB0aGUgZW5kIG9mIHRoZSBldmVudChzKSBsaXN0IGFuZCB0aGUgdHJlZSBoYXMgbGlzdGVuZXJzXHJcbiAgICAgIC8vIGludm9rZSB0aG9zZSBsaXN0ZW5lcnMuXHJcbiAgICAgIC8vXHJcbiAgICAgIGlmICh0eXBlb2YgdHJlZS5fbGlzdGVuZXJzID09PSAnZnVuY3Rpb24nKSB7XHJcbiAgICAgICAgaGFuZGxlcnMgJiYgaGFuZGxlcnMucHVzaCh0cmVlLl9saXN0ZW5lcnMpO1xyXG4gICAgICAgIHJldHVybiBbdHJlZV07XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgZm9yIChsZWFmID0gMCwgbGVuID0gdHJlZS5fbGlzdGVuZXJzLmxlbmd0aDsgbGVhZiA8IGxlbjsgbGVhZisrKSB7XHJcbiAgICAgICAgICBoYW5kbGVycyAmJiBoYW5kbGVycy5wdXNoKHRyZWUuX2xpc3RlbmVyc1tsZWFmXSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBbdHJlZV07XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBpZiAoKGN1cnJlbnRUeXBlID09PSAnKicgfHwgY3VycmVudFR5cGUgPT09ICcqKicpIHx8IHRyZWVbY3VycmVudFR5cGVdKSB7XHJcbiAgICAgIC8vXHJcbiAgICAgIC8vIElmIHRoZSBldmVudCBlbWl0dGVkIGlzICcqJyBhdCB0aGlzIHBhcnRcclxuICAgICAgLy8gb3IgdGhlcmUgaXMgYSBjb25jcmV0ZSBtYXRjaCBhdCB0aGlzIHBhdGNoXHJcbiAgICAgIC8vXHJcbiAgICAgIGlmIChjdXJyZW50VHlwZSA9PT0gJyonKSB7XHJcbiAgICAgICAgZm9yIChicmFuY2ggaW4gdHJlZSkge1xyXG4gICAgICAgICAgaWYgKGJyYW5jaCAhPT0gJ19saXN0ZW5lcnMnICYmIHRyZWUuaGFzT3duUHJvcGVydHkoYnJhbmNoKSkge1xyXG4gICAgICAgICAgICBsaXN0ZW5lcnMgPSBsaXN0ZW5lcnMuY29uY2F0KHNlYXJjaExpc3RlbmVyVHJlZShoYW5kbGVycywgdHlwZSwgdHJlZVticmFuY2hdLCBpKzEpKTtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIGxpc3RlbmVycztcclxuICAgICAgfSBlbHNlIGlmKGN1cnJlbnRUeXBlID09PSAnKionKSB7XHJcbiAgICAgICAgZW5kUmVhY2hlZCA9IChpKzEgPT09IHR5cGVMZW5ndGggfHwgKGkrMiA9PT0gdHlwZUxlbmd0aCAmJiBuZXh0VHlwZSA9PT0gJyonKSk7XHJcbiAgICAgICAgaWYoZW5kUmVhY2hlZCAmJiB0cmVlLl9saXN0ZW5lcnMpIHtcclxuICAgICAgICAgIC8vIFRoZSBuZXh0IGVsZW1lbnQgaGFzIGEgX2xpc3RlbmVycywgYWRkIGl0IHRvIHRoZSBoYW5kbGVycy5cclxuICAgICAgICAgIGxpc3RlbmVycyA9IGxpc3RlbmVycy5jb25jYXQoc2VhcmNoTGlzdGVuZXJUcmVlKGhhbmRsZXJzLCB0eXBlLCB0cmVlLCB0eXBlTGVuZ3RoKSk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBmb3IgKGJyYW5jaCBpbiB0cmVlKSB7XHJcbiAgICAgICAgICBpZiAoYnJhbmNoICE9PSAnX2xpc3RlbmVycycgJiYgdHJlZS5oYXNPd25Qcm9wZXJ0eShicmFuY2gpKSB7XHJcbiAgICAgICAgICAgIGlmKGJyYW5jaCA9PT0gJyonIHx8IGJyYW5jaCA9PT0gJyoqJykge1xyXG4gICAgICAgICAgICAgIGlmKHRyZWVbYnJhbmNoXS5fbGlzdGVuZXJzICYmICFlbmRSZWFjaGVkKSB7XHJcbiAgICAgICAgICAgICAgICBsaXN0ZW5lcnMgPSBsaXN0ZW5lcnMuY29uY2F0KHNlYXJjaExpc3RlbmVyVHJlZShoYW5kbGVycywgdHlwZSwgdHJlZVticmFuY2hdLCB0eXBlTGVuZ3RoKSk7XHJcbiAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgIGxpc3RlbmVycyA9IGxpc3RlbmVycy5jb25jYXQoc2VhcmNoTGlzdGVuZXJUcmVlKGhhbmRsZXJzLCB0eXBlLCB0cmVlW2JyYW5jaF0sIGkpKTtcclxuICAgICAgICAgICAgfSBlbHNlIGlmKGJyYW5jaCA9PT0gbmV4dFR5cGUpIHtcclxuICAgICAgICAgICAgICBsaXN0ZW5lcnMgPSBsaXN0ZW5lcnMuY29uY2F0KHNlYXJjaExpc3RlbmVyVHJlZShoYW5kbGVycywgdHlwZSwgdHJlZVticmFuY2hdLCBpKzIpKTtcclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAvLyBObyBtYXRjaCBvbiB0aGlzIG9uZSwgc2hpZnQgaW50byB0aGUgdHJlZSBidXQgbm90IGluIHRoZSB0eXBlIGFycmF5LlxyXG4gICAgICAgICAgICAgIGxpc3RlbmVycyA9IGxpc3RlbmVycy5jb25jYXQoc2VhcmNoTGlzdGVuZXJUcmVlKGhhbmRsZXJzLCB0eXBlLCB0cmVlW2JyYW5jaF0sIGkpKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gbGlzdGVuZXJzO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBsaXN0ZW5lcnMgPSBsaXN0ZW5lcnMuY29uY2F0KHNlYXJjaExpc3RlbmVyVHJlZShoYW5kbGVycywgdHlwZSwgdHJlZVtjdXJyZW50VHlwZV0sIGkrMSkpO1xyXG4gICAgfVxyXG5cclxuICAgIHhUcmVlID0gdHJlZVsnKiddO1xyXG4gICAgaWYgKHhUcmVlKSB7XHJcbiAgICAgIC8vXHJcbiAgICAgIC8vIElmIHRoZSBsaXN0ZW5lciB0cmVlIHdpbGwgYWxsb3cgYW55IG1hdGNoIGZvciB0aGlzIHBhcnQsXHJcbiAgICAgIC8vIHRoZW4gcmVjdXJzaXZlbHkgZXhwbG9yZSBhbGwgYnJhbmNoZXMgb2YgdGhlIHRyZWVcclxuICAgICAgLy9cclxuICAgICAgc2VhcmNoTGlzdGVuZXJUcmVlKGhhbmRsZXJzLCB0eXBlLCB4VHJlZSwgaSsxKTtcclxuICAgIH1cclxuXHJcbiAgICB4eFRyZWUgPSB0cmVlWycqKiddO1xyXG4gICAgaWYoeHhUcmVlKSB7XHJcbiAgICAgIGlmKGkgPCB0eXBlTGVuZ3RoKSB7XHJcbiAgICAgICAgaWYoeHhUcmVlLl9saXN0ZW5lcnMpIHtcclxuICAgICAgICAgIC8vIElmIHdlIGhhdmUgYSBsaXN0ZW5lciBvbiBhICcqKicsIGl0IHdpbGwgY2F0Y2ggYWxsLCBzbyBhZGQgaXRzIGhhbmRsZXIuXHJcbiAgICAgICAgICBzZWFyY2hMaXN0ZW5lclRyZWUoaGFuZGxlcnMsIHR5cGUsIHh4VHJlZSwgdHlwZUxlbmd0aCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBCdWlsZCBhcnJheXMgb2YgbWF0Y2hpbmcgbmV4dCBicmFuY2hlcyBhbmQgb3RoZXJzLlxyXG4gICAgICAgIGZvcihicmFuY2ggaW4geHhUcmVlKSB7XHJcbiAgICAgICAgICBpZihicmFuY2ggIT09ICdfbGlzdGVuZXJzJyAmJiB4eFRyZWUuaGFzT3duUHJvcGVydHkoYnJhbmNoKSkge1xyXG4gICAgICAgICAgICBpZihicmFuY2ggPT09IG5leHRUeXBlKSB7XHJcbiAgICAgICAgICAgICAgLy8gV2Uga25vdyB0aGUgbmV4dCBlbGVtZW50IHdpbGwgbWF0Y2gsIHNvIGp1bXAgdHdpY2UuXHJcbiAgICAgICAgICAgICAgc2VhcmNoTGlzdGVuZXJUcmVlKGhhbmRsZXJzLCB0eXBlLCB4eFRyZWVbYnJhbmNoXSwgaSsyKTtcclxuICAgICAgICAgICAgfSBlbHNlIGlmKGJyYW5jaCA9PT0gY3VycmVudFR5cGUpIHtcclxuICAgICAgICAgICAgICAvLyBDdXJyZW50IG5vZGUgbWF0Y2hlcywgbW92ZSBpbnRvIHRoZSB0cmVlLlxyXG4gICAgICAgICAgICAgIHNlYXJjaExpc3RlbmVyVHJlZShoYW5kbGVycywgdHlwZSwgeHhUcmVlW2JyYW5jaF0sIGkrMSk7XHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgaXNvbGF0ZWRCcmFuY2ggPSB7fTtcclxuICAgICAgICAgICAgICBpc29sYXRlZEJyYW5jaFticmFuY2hdID0geHhUcmVlW2JyYW5jaF07XHJcbiAgICAgICAgICAgICAgc2VhcmNoTGlzdGVuZXJUcmVlKGhhbmRsZXJzLCB0eXBlLCB7ICcqKic6IGlzb2xhdGVkQnJhbmNoIH0sIGkrMSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgIH0gZWxzZSBpZih4eFRyZWUuX2xpc3RlbmVycykge1xyXG4gICAgICAgIC8vIFdlIGhhdmUgcmVhY2hlZCB0aGUgZW5kIGFuZCBzdGlsbCBvbiBhICcqKidcclxuICAgICAgICBzZWFyY2hMaXN0ZW5lclRyZWUoaGFuZGxlcnMsIHR5cGUsIHh4VHJlZSwgdHlwZUxlbmd0aCk7XHJcbiAgICAgIH0gZWxzZSBpZih4eFRyZWVbJyonXSAmJiB4eFRyZWVbJyonXS5fbGlzdGVuZXJzKSB7XHJcbiAgICAgICAgc2VhcmNoTGlzdGVuZXJUcmVlKGhhbmRsZXJzLCB0eXBlLCB4eFRyZWVbJyonXSwgdHlwZUxlbmd0aCk7XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gbGlzdGVuZXJzO1xyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gZ3Jvd0xpc3RlbmVyVHJlZSh0eXBlLCBsaXN0ZW5lcikge1xyXG5cclxuICAgIHR5cGUgPSB0eXBlb2YgdHlwZSA9PT0gJ3N0cmluZycgPyB0eXBlLnNwbGl0KHRoaXMuZGVsaW1pdGVyKSA6IHR5cGUuc2xpY2UoKTtcclxuXHJcbiAgICAvL1xyXG4gICAgLy8gTG9va3MgZm9yIHR3byBjb25zZWN1dGl2ZSAnKionLCBpZiBzbywgZG9uJ3QgYWRkIHRoZSBldmVudCBhdCBhbGwuXHJcbiAgICAvL1xyXG4gICAgZm9yKHZhciBpID0gMCwgbGVuID0gdHlwZS5sZW5ndGg7IGkrMSA8IGxlbjsgaSsrKSB7XHJcbiAgICAgIGlmKHR5cGVbaV0gPT09ICcqKicgJiYgdHlwZVtpKzFdID09PSAnKionKSB7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgdmFyIHRyZWUgPSB0aGlzLmxpc3RlbmVyVHJlZTtcclxuICAgIHZhciBuYW1lID0gdHlwZS5zaGlmdCgpO1xyXG5cclxuICAgIHdoaWxlIChuYW1lICE9PSB1bmRlZmluZWQpIHtcclxuXHJcbiAgICAgIGlmICghdHJlZVtuYW1lXSkge1xyXG4gICAgICAgIHRyZWVbbmFtZV0gPSB7fTtcclxuICAgICAgfVxyXG5cclxuICAgICAgdHJlZSA9IHRyZWVbbmFtZV07XHJcblxyXG4gICAgICBpZiAodHlwZS5sZW5ndGggPT09IDApIHtcclxuXHJcbiAgICAgICAgaWYgKCF0cmVlLl9saXN0ZW5lcnMpIHtcclxuICAgICAgICAgIHRyZWUuX2xpc3RlbmVycyA9IGxpc3RlbmVyO1xyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNlIHtcclxuICAgICAgICAgIGlmICh0eXBlb2YgdHJlZS5fbGlzdGVuZXJzID09PSAnZnVuY3Rpb24nKSB7XHJcbiAgICAgICAgICAgIHRyZWUuX2xpc3RlbmVycyA9IFt0cmVlLl9saXN0ZW5lcnNdO1xyXG4gICAgICAgICAgfVxyXG5cclxuICAgICAgICAgIHRyZWUuX2xpc3RlbmVycy5wdXNoKGxpc3RlbmVyKTtcclxuXHJcbiAgICAgICAgICBpZiAoXHJcbiAgICAgICAgICAgICF0cmVlLl9saXN0ZW5lcnMud2FybmVkICYmXHJcbiAgICAgICAgICAgIHRoaXMuX21heExpc3RlbmVycyA+IDAgJiZcclxuICAgICAgICAgICAgdHJlZS5fbGlzdGVuZXJzLmxlbmd0aCA+IHRoaXMuX21heExpc3RlbmVyc1xyXG4gICAgICAgICAgKSB7XHJcbiAgICAgICAgICAgIHRyZWUuX2xpc3RlbmVycy53YXJuZWQgPSB0cnVlO1xyXG4gICAgICAgICAgICBsb2dQb3NzaWJsZU1lbW9yeUxlYWsuY2FsbCh0aGlzLCB0cmVlLl9saXN0ZW5lcnMubGVuZ3RoLCBuYW1lKTtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgIH1cclxuICAgICAgbmFtZSA9IHR5cGUuc2hpZnQoKTtcclxuICAgIH1cclxuICAgIHJldHVybiB0cnVlO1xyXG4gIH1cclxuXHJcbiAgLy8gQnkgZGVmYXVsdCBFdmVudEVtaXR0ZXJzIHdpbGwgcHJpbnQgYSB3YXJuaW5nIGlmIG1vcmUgdGhhblxyXG4gIC8vIDEwIGxpc3RlbmVycyBhcmUgYWRkZWQgdG8gaXQuIFRoaXMgaXMgYSB1c2VmdWwgZGVmYXVsdCB3aGljaFxyXG4gIC8vIGhlbHBzIGZpbmRpbmcgbWVtb3J5IGxlYWtzLlxyXG4gIC8vXHJcbiAgLy8gT2J2aW91c2x5IG5vdCBhbGwgRW1pdHRlcnMgc2hvdWxkIGJlIGxpbWl0ZWQgdG8gMTAuIFRoaXMgZnVuY3Rpb24gYWxsb3dzXHJcbiAgLy8gdGhhdCB0byBiZSBpbmNyZWFzZWQuIFNldCB0byB6ZXJvIGZvciB1bmxpbWl0ZWQuXHJcblxyXG4gIEV2ZW50RW1pdHRlci5wcm90b3R5cGUuZGVsaW1pdGVyID0gJy4nO1xyXG5cclxuICBFdmVudEVtaXR0ZXIucHJvdG90eXBlLnNldE1heExpc3RlbmVycyA9IGZ1bmN0aW9uKG4pIHtcclxuICAgIGlmIChuICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgdGhpcy5fbWF4TGlzdGVuZXJzID0gbjtcclxuICAgICAgaWYgKCF0aGlzLl9jb25mKSB0aGlzLl9jb25mID0ge307XHJcbiAgICAgIHRoaXMuX2NvbmYubWF4TGlzdGVuZXJzID0gbjtcclxuICAgIH1cclxuICB9O1xyXG5cclxuICBFdmVudEVtaXR0ZXIucHJvdG90eXBlLmV2ZW50ID0gJyc7XHJcblxyXG5cclxuICBFdmVudEVtaXR0ZXIucHJvdG90eXBlLm9uY2UgPSBmdW5jdGlvbihldmVudCwgZm4pIHtcclxuICAgIHJldHVybiB0aGlzLl9vbmNlKGV2ZW50LCBmbiwgZmFsc2UpO1xyXG4gIH07XHJcblxyXG4gIEV2ZW50RW1pdHRlci5wcm90b3R5cGUucHJlcGVuZE9uY2VMaXN0ZW5lciA9IGZ1bmN0aW9uKGV2ZW50LCBmbikge1xyXG4gICAgcmV0dXJuIHRoaXMuX29uY2UoZXZlbnQsIGZuLCB0cnVlKTtcclxuICB9O1xyXG5cclxuICBFdmVudEVtaXR0ZXIucHJvdG90eXBlLl9vbmNlID0gZnVuY3Rpb24oZXZlbnQsIGZuLCBwcmVwZW5kKSB7XHJcbiAgICB0aGlzLl9tYW55KGV2ZW50LCAxLCBmbiwgcHJlcGVuZCk7XHJcbiAgICByZXR1cm4gdGhpcztcclxuICB9O1xyXG5cclxuICBFdmVudEVtaXR0ZXIucHJvdG90eXBlLm1hbnkgPSBmdW5jdGlvbihldmVudCwgdHRsLCBmbikge1xyXG4gICAgcmV0dXJuIHRoaXMuX21hbnkoZXZlbnQsIHR0bCwgZm4sIGZhbHNlKTtcclxuICB9XHJcblxyXG4gIEV2ZW50RW1pdHRlci5wcm90b3R5cGUucHJlcGVuZE1hbnkgPSBmdW5jdGlvbihldmVudCwgdHRsLCBmbikge1xyXG4gICAgcmV0dXJuIHRoaXMuX21hbnkoZXZlbnQsIHR0bCwgZm4sIHRydWUpO1xyXG4gIH1cclxuXHJcbiAgRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5fbWFueSA9IGZ1bmN0aW9uKGV2ZW50LCB0dGwsIGZuLCBwcmVwZW5kKSB7XHJcbiAgICB2YXIgc2VsZiA9IHRoaXM7XHJcblxyXG4gICAgaWYgKHR5cGVvZiBmbiAhPT0gJ2Z1bmN0aW9uJykge1xyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ21hbnkgb25seSBhY2NlcHRzIGluc3RhbmNlcyBvZiBGdW5jdGlvbicpO1xyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIGxpc3RlbmVyKCkge1xyXG4gICAgICBpZiAoLS10dGwgPT09IDApIHtcclxuICAgICAgICBzZWxmLm9mZihldmVudCwgbGlzdGVuZXIpO1xyXG4gICAgICB9XHJcbiAgICAgIHJldHVybiBmbi5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xyXG4gICAgfVxyXG5cclxuICAgIGxpc3RlbmVyLl9vcmlnaW4gPSBmbjtcclxuXHJcbiAgICB0aGlzLl9vbihldmVudCwgbGlzdGVuZXIsIHByZXBlbmQpO1xyXG5cclxuICAgIHJldHVybiBzZWxmO1xyXG4gIH07XHJcblxyXG4gIEV2ZW50RW1pdHRlci5wcm90b3R5cGUuZW1pdCA9IGZ1bmN0aW9uKCkge1xyXG5cclxuICAgIHRoaXMuX2V2ZW50cyB8fCBpbml0LmNhbGwodGhpcyk7XHJcblxyXG4gICAgdmFyIHR5cGUgPSBhcmd1bWVudHNbMF07XHJcblxyXG4gICAgaWYgKHR5cGUgPT09ICduZXdMaXN0ZW5lcicgJiYgIXRoaXMubmV3TGlzdGVuZXIpIHtcclxuICAgICAgaWYgKCF0aGlzLl9ldmVudHMubmV3TGlzdGVuZXIpIHtcclxuICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICB2YXIgYWwgPSBhcmd1bWVudHMubGVuZ3RoO1xyXG4gICAgdmFyIGFyZ3MsbCxpLGo7XHJcbiAgICB2YXIgaGFuZGxlcjtcclxuXHJcbiAgICBpZiAodGhpcy5fYWxsICYmIHRoaXMuX2FsbC5sZW5ndGgpIHtcclxuICAgICAgaGFuZGxlciA9IHRoaXMuX2FsbC5zbGljZSgpO1xyXG4gICAgICBpZiAoYWwgPiAzKSB7XHJcbiAgICAgICAgYXJncyA9IG5ldyBBcnJheShhbCk7XHJcbiAgICAgICAgZm9yIChqID0gMDsgaiA8IGFsOyBqKyspIGFyZ3Nbal0gPSBhcmd1bWVudHNbal07XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGZvciAoaSA9IDAsIGwgPSBoYW5kbGVyLmxlbmd0aDsgaSA8IGw7IGkrKykge1xyXG4gICAgICAgIHRoaXMuZXZlbnQgPSB0eXBlO1xyXG4gICAgICAgIHN3aXRjaCAoYWwpIHtcclxuICAgICAgICBjYXNlIDE6XHJcbiAgICAgICAgICBoYW5kbGVyW2ldLmNhbGwodGhpcywgdHlwZSk7XHJcbiAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIDI6XHJcbiAgICAgICAgICBoYW5kbGVyW2ldLmNhbGwodGhpcywgdHlwZSwgYXJndW1lbnRzWzFdKTtcclxuICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgMzpcclxuICAgICAgICAgIGhhbmRsZXJbaV0uY2FsbCh0aGlzLCB0eXBlLCBhcmd1bWVudHNbMV0sIGFyZ3VtZW50c1syXSk7XHJcbiAgICAgICAgICBicmVhaztcclxuICAgICAgICBkZWZhdWx0OlxyXG4gICAgICAgICAgaGFuZGxlcltpXS5hcHBseSh0aGlzLCBhcmdzKTtcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBpZiAodGhpcy53aWxkY2FyZCkge1xyXG4gICAgICBoYW5kbGVyID0gW107XHJcbiAgICAgIHZhciBucyA9IHR5cGVvZiB0eXBlID09PSAnc3RyaW5nJyA/IHR5cGUuc3BsaXQodGhpcy5kZWxpbWl0ZXIpIDogdHlwZS5zbGljZSgpO1xyXG4gICAgICBzZWFyY2hMaXN0ZW5lclRyZWUuY2FsbCh0aGlzLCBoYW5kbGVyLCBucywgdGhpcy5saXN0ZW5lclRyZWUsIDApO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgaGFuZGxlciA9IHRoaXMuX2V2ZW50c1t0eXBlXTtcclxuICAgICAgaWYgKHR5cGVvZiBoYW5kbGVyID09PSAnZnVuY3Rpb24nKSB7XHJcbiAgICAgICAgdGhpcy5ldmVudCA9IHR5cGU7XHJcbiAgICAgICAgc3dpdGNoIChhbCkge1xyXG4gICAgICAgIGNhc2UgMTpcclxuICAgICAgICAgIGhhbmRsZXIuY2FsbCh0aGlzKTtcclxuICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgMjpcclxuICAgICAgICAgIGhhbmRsZXIuY2FsbCh0aGlzLCBhcmd1bWVudHNbMV0pO1xyXG4gICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSAzOlxyXG4gICAgICAgICAgaGFuZGxlci5jYWxsKHRoaXMsIGFyZ3VtZW50c1sxXSwgYXJndW1lbnRzWzJdKTtcclxuICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgICBhcmdzID0gbmV3IEFycmF5KGFsIC0gMSk7XHJcbiAgICAgICAgICBmb3IgKGogPSAxOyBqIDwgYWw7IGorKykgYXJnc1tqIC0gMV0gPSBhcmd1bWVudHNbal07XHJcbiAgICAgICAgICBoYW5kbGVyLmFwcGx5KHRoaXMsIGFyZ3MpO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgfSBlbHNlIGlmIChoYW5kbGVyKSB7XHJcbiAgICAgICAgLy8gbmVlZCB0byBtYWtlIGNvcHkgb2YgaGFuZGxlcnMgYmVjYXVzZSBsaXN0IGNhbiBjaGFuZ2UgaW4gdGhlIG1pZGRsZVxyXG4gICAgICAgIC8vIG9mIGVtaXQgY2FsbFxyXG4gICAgICAgIGhhbmRsZXIgPSBoYW5kbGVyLnNsaWNlKCk7XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBpZiAoaGFuZGxlciAmJiBoYW5kbGVyLmxlbmd0aCkge1xyXG4gICAgICBpZiAoYWwgPiAzKSB7XHJcbiAgICAgICAgYXJncyA9IG5ldyBBcnJheShhbCAtIDEpO1xyXG4gICAgICAgIGZvciAoaiA9IDE7IGogPCBhbDsgaisrKSBhcmdzW2ogLSAxXSA9IGFyZ3VtZW50c1tqXTtcclxuICAgICAgfVxyXG4gICAgICBmb3IgKGkgPSAwLCBsID0gaGFuZGxlci5sZW5ndGg7IGkgPCBsOyBpKyspIHtcclxuICAgICAgICB0aGlzLmV2ZW50ID0gdHlwZTtcclxuICAgICAgICBzd2l0Y2ggKGFsKSB7XHJcbiAgICAgICAgY2FzZSAxOlxyXG4gICAgICAgICAgaGFuZGxlcltpXS5jYWxsKHRoaXMpO1xyXG4gICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSAyOlxyXG4gICAgICAgICAgaGFuZGxlcltpXS5jYWxsKHRoaXMsIGFyZ3VtZW50c1sxXSk7XHJcbiAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIDM6XHJcbiAgICAgICAgICBoYW5kbGVyW2ldLmNhbGwodGhpcywgYXJndW1lbnRzWzFdLCBhcmd1bWVudHNbMl0pO1xyXG4gICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgIGhhbmRsZXJbaV0uYXBwbHkodGhpcywgYXJncyk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgfSBlbHNlIGlmICghdGhpcy5fYWxsICYmIHR5cGUgPT09ICdlcnJvcicpIHtcclxuICAgICAgaWYgKGFyZ3VtZW50c1sxXSBpbnN0YW5jZW9mIEVycm9yKSB7XHJcbiAgICAgICAgdGhyb3cgYXJndW1lbnRzWzFdOyAvLyBVbmhhbmRsZWQgJ2Vycm9yJyBldmVudFxyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIlVuY2F1Z2h0LCB1bnNwZWNpZmllZCAnZXJyb3InIGV2ZW50LlwiKTtcclxuICAgICAgfVxyXG4gICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuICEhdGhpcy5fYWxsO1xyXG4gIH07XHJcblxyXG4gIEV2ZW50RW1pdHRlci5wcm90b3R5cGUuZW1pdEFzeW5jID0gZnVuY3Rpb24oKSB7XHJcblxyXG4gICAgdGhpcy5fZXZlbnRzIHx8IGluaXQuY2FsbCh0aGlzKTtcclxuXHJcbiAgICB2YXIgdHlwZSA9IGFyZ3VtZW50c1swXTtcclxuXHJcbiAgICBpZiAodHlwZSA9PT0gJ25ld0xpc3RlbmVyJyAmJiAhdGhpcy5uZXdMaXN0ZW5lcikge1xyXG4gICAgICAgIGlmICghdGhpcy5fZXZlbnRzLm5ld0xpc3RlbmVyKSB7IHJldHVybiBQcm9taXNlLnJlc29sdmUoW2ZhbHNlXSk7IH1cclxuICAgIH1cclxuXHJcbiAgICB2YXIgcHJvbWlzZXM9IFtdO1xyXG5cclxuICAgIHZhciBhbCA9IGFyZ3VtZW50cy5sZW5ndGg7XHJcbiAgICB2YXIgYXJncyxsLGksajtcclxuICAgIHZhciBoYW5kbGVyO1xyXG5cclxuICAgIGlmICh0aGlzLl9hbGwpIHtcclxuICAgICAgaWYgKGFsID4gMykge1xyXG4gICAgICAgIGFyZ3MgPSBuZXcgQXJyYXkoYWwpO1xyXG4gICAgICAgIGZvciAoaiA9IDE7IGogPCBhbDsgaisrKSBhcmdzW2pdID0gYXJndW1lbnRzW2pdO1xyXG4gICAgICB9XHJcbiAgICAgIGZvciAoaSA9IDAsIGwgPSB0aGlzLl9hbGwubGVuZ3RoOyBpIDwgbDsgaSsrKSB7XHJcbiAgICAgICAgdGhpcy5ldmVudCA9IHR5cGU7XHJcbiAgICAgICAgc3dpdGNoIChhbCkge1xyXG4gICAgICAgIGNhc2UgMTpcclxuICAgICAgICAgIHByb21pc2VzLnB1c2godGhpcy5fYWxsW2ldLmNhbGwodGhpcywgdHlwZSkpO1xyXG4gICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSAyOlxyXG4gICAgICAgICAgcHJvbWlzZXMucHVzaCh0aGlzLl9hbGxbaV0uY2FsbCh0aGlzLCB0eXBlLCBhcmd1bWVudHNbMV0pKTtcclxuICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgMzpcclxuICAgICAgICAgIHByb21pc2VzLnB1c2godGhpcy5fYWxsW2ldLmNhbGwodGhpcywgdHlwZSwgYXJndW1lbnRzWzFdLCBhcmd1bWVudHNbMl0pKTtcclxuICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgICBwcm9taXNlcy5wdXNoKHRoaXMuX2FsbFtpXS5hcHBseSh0aGlzLCBhcmdzKSk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKHRoaXMud2lsZGNhcmQpIHtcclxuICAgICAgaGFuZGxlciA9IFtdO1xyXG4gICAgICB2YXIgbnMgPSB0eXBlb2YgdHlwZSA9PT0gJ3N0cmluZycgPyB0eXBlLnNwbGl0KHRoaXMuZGVsaW1pdGVyKSA6IHR5cGUuc2xpY2UoKTtcclxuICAgICAgc2VhcmNoTGlzdGVuZXJUcmVlLmNhbGwodGhpcywgaGFuZGxlciwgbnMsIHRoaXMubGlzdGVuZXJUcmVlLCAwKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIGhhbmRsZXIgPSB0aGlzLl9ldmVudHNbdHlwZV07XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKHR5cGVvZiBoYW5kbGVyID09PSAnZnVuY3Rpb24nKSB7XHJcbiAgICAgIHRoaXMuZXZlbnQgPSB0eXBlO1xyXG4gICAgICBzd2l0Y2ggKGFsKSB7XHJcbiAgICAgIGNhc2UgMTpcclxuICAgICAgICBwcm9taXNlcy5wdXNoKGhhbmRsZXIuY2FsbCh0aGlzKSk7XHJcbiAgICAgICAgYnJlYWs7XHJcbiAgICAgIGNhc2UgMjpcclxuICAgICAgICBwcm9taXNlcy5wdXNoKGhhbmRsZXIuY2FsbCh0aGlzLCBhcmd1bWVudHNbMV0pKTtcclxuICAgICAgICBicmVhaztcclxuICAgICAgY2FzZSAzOlxyXG4gICAgICAgIHByb21pc2VzLnB1c2goaGFuZGxlci5jYWxsKHRoaXMsIGFyZ3VtZW50c1sxXSwgYXJndW1lbnRzWzJdKSk7XHJcbiAgICAgICAgYnJlYWs7XHJcbiAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgYXJncyA9IG5ldyBBcnJheShhbCAtIDEpO1xyXG4gICAgICAgIGZvciAoaiA9IDE7IGogPCBhbDsgaisrKSBhcmdzW2ogLSAxXSA9IGFyZ3VtZW50c1tqXTtcclxuICAgICAgICBwcm9taXNlcy5wdXNoKGhhbmRsZXIuYXBwbHkodGhpcywgYXJncykpO1xyXG4gICAgICB9XHJcbiAgICB9IGVsc2UgaWYgKGhhbmRsZXIgJiYgaGFuZGxlci5sZW5ndGgpIHtcclxuICAgICAgaGFuZGxlciA9IGhhbmRsZXIuc2xpY2UoKTtcclxuICAgICAgaWYgKGFsID4gMykge1xyXG4gICAgICAgIGFyZ3MgPSBuZXcgQXJyYXkoYWwgLSAxKTtcclxuICAgICAgICBmb3IgKGogPSAxOyBqIDwgYWw7IGorKykgYXJnc1tqIC0gMV0gPSBhcmd1bWVudHNbal07XHJcbiAgICAgIH1cclxuICAgICAgZm9yIChpID0gMCwgbCA9IGhhbmRsZXIubGVuZ3RoOyBpIDwgbDsgaSsrKSB7XHJcbiAgICAgICAgdGhpcy5ldmVudCA9IHR5cGU7XHJcbiAgICAgICAgc3dpdGNoIChhbCkge1xyXG4gICAgICAgIGNhc2UgMTpcclxuICAgICAgICAgIHByb21pc2VzLnB1c2goaGFuZGxlcltpXS5jYWxsKHRoaXMpKTtcclxuICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgMjpcclxuICAgICAgICAgIHByb21pc2VzLnB1c2goaGFuZGxlcltpXS5jYWxsKHRoaXMsIGFyZ3VtZW50c1sxXSkpO1xyXG4gICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSAzOlxyXG4gICAgICAgICAgcHJvbWlzZXMucHVzaChoYW5kbGVyW2ldLmNhbGwodGhpcywgYXJndW1lbnRzWzFdLCBhcmd1bWVudHNbMl0pKTtcclxuICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgICBwcm9taXNlcy5wdXNoKGhhbmRsZXJbaV0uYXBwbHkodGhpcywgYXJncykpO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgfSBlbHNlIGlmICghdGhpcy5fYWxsICYmIHR5cGUgPT09ICdlcnJvcicpIHtcclxuICAgICAgaWYgKGFyZ3VtZW50c1sxXSBpbnN0YW5jZW9mIEVycm9yKSB7XHJcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KGFyZ3VtZW50c1sxXSk7IC8vIFVuaGFuZGxlZCAnZXJyb3InIGV2ZW50XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KFwiVW5jYXVnaHQsIHVuc3BlY2lmaWVkICdlcnJvcicgZXZlbnQuXCIpO1xyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIFByb21pc2UuYWxsKHByb21pc2VzKTtcclxuICB9O1xyXG5cclxuICBFdmVudEVtaXR0ZXIucHJvdG90eXBlLm9uID0gZnVuY3Rpb24odHlwZSwgbGlzdGVuZXIpIHtcclxuICAgIHJldHVybiB0aGlzLl9vbih0eXBlLCBsaXN0ZW5lciwgZmFsc2UpO1xyXG4gIH07XHJcblxyXG4gIEV2ZW50RW1pdHRlci5wcm90b3R5cGUucHJlcGVuZExpc3RlbmVyID0gZnVuY3Rpb24odHlwZSwgbGlzdGVuZXIpIHtcclxuICAgIHJldHVybiB0aGlzLl9vbih0eXBlLCBsaXN0ZW5lciwgdHJ1ZSk7XHJcbiAgfTtcclxuXHJcbiAgRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5vbkFueSA9IGZ1bmN0aW9uKGZuKSB7XHJcbiAgICByZXR1cm4gdGhpcy5fb25BbnkoZm4sIGZhbHNlKTtcclxuICB9O1xyXG5cclxuICBFdmVudEVtaXR0ZXIucHJvdG90eXBlLnByZXBlbmRBbnkgPSBmdW5jdGlvbihmbikge1xyXG4gICAgcmV0dXJuIHRoaXMuX29uQW55KGZuLCB0cnVlKTtcclxuICB9O1xyXG5cclxuICBFdmVudEVtaXR0ZXIucHJvdG90eXBlLmFkZExpc3RlbmVyID0gRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5vbjtcclxuXHJcbiAgRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5fb25BbnkgPSBmdW5jdGlvbihmbiwgcHJlcGVuZCl7XHJcbiAgICBpZiAodHlwZW9mIGZuICE9PSAnZnVuY3Rpb24nKSB7XHJcbiAgICAgIHRocm93IG5ldyBFcnJvcignb25Bbnkgb25seSBhY2NlcHRzIGluc3RhbmNlcyBvZiBGdW5jdGlvbicpO1xyXG4gICAgfVxyXG5cclxuICAgIGlmICghdGhpcy5fYWxsKSB7XHJcbiAgICAgIHRoaXMuX2FsbCA9IFtdO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIEFkZCB0aGUgZnVuY3Rpb24gdG8gdGhlIGV2ZW50IGxpc3RlbmVyIGNvbGxlY3Rpb24uXHJcbiAgICBpZihwcmVwZW5kKXtcclxuICAgICAgdGhpcy5fYWxsLnVuc2hpZnQoZm4pO1xyXG4gICAgfWVsc2V7XHJcbiAgICAgIHRoaXMuX2FsbC5wdXNoKGZuKTtcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gdGhpcztcclxuICB9XHJcblxyXG4gIEV2ZW50RW1pdHRlci5wcm90b3R5cGUuX29uID0gZnVuY3Rpb24odHlwZSwgbGlzdGVuZXIsIHByZXBlbmQpIHtcclxuICAgIGlmICh0eXBlb2YgdHlwZSA9PT0gJ2Z1bmN0aW9uJykge1xyXG4gICAgICB0aGlzLl9vbkFueSh0eXBlLCBsaXN0ZW5lcik7XHJcbiAgICAgIHJldHVybiB0aGlzO1xyXG4gICAgfVxyXG5cclxuICAgIGlmICh0eXBlb2YgbGlzdGVuZXIgIT09ICdmdW5jdGlvbicpIHtcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdvbiBvbmx5IGFjY2VwdHMgaW5zdGFuY2VzIG9mIEZ1bmN0aW9uJyk7XHJcbiAgICB9XHJcbiAgICB0aGlzLl9ldmVudHMgfHwgaW5pdC5jYWxsKHRoaXMpO1xyXG5cclxuICAgIC8vIFRvIGF2b2lkIHJlY3Vyc2lvbiBpbiB0aGUgY2FzZSB0aGF0IHR5cGUgPT0gXCJuZXdMaXN0ZW5lcnNcIiEgQmVmb3JlXHJcbiAgICAvLyBhZGRpbmcgaXQgdG8gdGhlIGxpc3RlbmVycywgZmlyc3QgZW1pdCBcIm5ld0xpc3RlbmVyc1wiLlxyXG4gICAgdGhpcy5lbWl0KCduZXdMaXN0ZW5lcicsIHR5cGUsIGxpc3RlbmVyKTtcclxuXHJcbiAgICBpZiAodGhpcy53aWxkY2FyZCkge1xyXG4gICAgICBncm93TGlzdGVuZXJUcmVlLmNhbGwodGhpcywgdHlwZSwgbGlzdGVuZXIpO1xyXG4gICAgICByZXR1cm4gdGhpcztcclxuICAgIH1cclxuXHJcbiAgICBpZiAoIXRoaXMuX2V2ZW50c1t0eXBlXSkge1xyXG4gICAgICAvLyBPcHRpbWl6ZSB0aGUgY2FzZSBvZiBvbmUgbGlzdGVuZXIuIERvbid0IG5lZWQgdGhlIGV4dHJhIGFycmF5IG9iamVjdC5cclxuICAgICAgdGhpcy5fZXZlbnRzW3R5cGVdID0gbGlzdGVuZXI7XHJcbiAgICB9XHJcbiAgICBlbHNlIHtcclxuICAgICAgaWYgKHR5cGVvZiB0aGlzLl9ldmVudHNbdHlwZV0gPT09ICdmdW5jdGlvbicpIHtcclxuICAgICAgICAvLyBDaGFuZ2UgdG8gYXJyYXkuXHJcbiAgICAgICAgdGhpcy5fZXZlbnRzW3R5cGVdID0gW3RoaXMuX2V2ZW50c1t0eXBlXV07XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIC8vIElmIHdlJ3ZlIGFscmVhZHkgZ290IGFuIGFycmF5LCBqdXN0IGFkZFxyXG4gICAgICBpZihwcmVwZW5kKXtcclxuICAgICAgICB0aGlzLl9ldmVudHNbdHlwZV0udW5zaGlmdChsaXN0ZW5lcik7XHJcbiAgICAgIH1lbHNle1xyXG4gICAgICAgIHRoaXMuX2V2ZW50c1t0eXBlXS5wdXNoKGxpc3RlbmVyKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgLy8gQ2hlY2sgZm9yIGxpc3RlbmVyIGxlYWtcclxuICAgICAgaWYgKFxyXG4gICAgICAgICF0aGlzLl9ldmVudHNbdHlwZV0ud2FybmVkICYmXHJcbiAgICAgICAgdGhpcy5fbWF4TGlzdGVuZXJzID4gMCAmJlxyXG4gICAgICAgIHRoaXMuX2V2ZW50c1t0eXBlXS5sZW5ndGggPiB0aGlzLl9tYXhMaXN0ZW5lcnNcclxuICAgICAgKSB7XHJcbiAgICAgICAgdGhpcy5fZXZlbnRzW3R5cGVdLndhcm5lZCA9IHRydWU7XHJcbiAgICAgICAgbG9nUG9zc2libGVNZW1vcnlMZWFrLmNhbGwodGhpcywgdGhpcy5fZXZlbnRzW3R5cGVdLmxlbmd0aCwgdHlwZSk7XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gdGhpcztcclxuICB9XHJcblxyXG4gIEV2ZW50RW1pdHRlci5wcm90b3R5cGUub2ZmID0gZnVuY3Rpb24odHlwZSwgbGlzdGVuZXIpIHtcclxuICAgIGlmICh0eXBlb2YgbGlzdGVuZXIgIT09ICdmdW5jdGlvbicpIHtcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdyZW1vdmVMaXN0ZW5lciBvbmx5IHRha2VzIGluc3RhbmNlcyBvZiBGdW5jdGlvbicpO1xyXG4gICAgfVxyXG5cclxuICAgIHZhciBoYW5kbGVycyxsZWFmcz1bXTtcclxuXHJcbiAgICBpZih0aGlzLndpbGRjYXJkKSB7XHJcbiAgICAgIHZhciBucyA9IHR5cGVvZiB0eXBlID09PSAnc3RyaW5nJyA/IHR5cGUuc3BsaXQodGhpcy5kZWxpbWl0ZXIpIDogdHlwZS5zbGljZSgpO1xyXG4gICAgICBsZWFmcyA9IHNlYXJjaExpc3RlbmVyVHJlZS5jYWxsKHRoaXMsIG51bGwsIG5zLCB0aGlzLmxpc3RlbmVyVHJlZSwgMCk7XHJcbiAgICB9XHJcbiAgICBlbHNlIHtcclxuICAgICAgLy8gZG9lcyBub3QgdXNlIGxpc3RlbmVycygpLCBzbyBubyBzaWRlIGVmZmVjdCBvZiBjcmVhdGluZyBfZXZlbnRzW3R5cGVdXHJcbiAgICAgIGlmICghdGhpcy5fZXZlbnRzW3R5cGVdKSByZXR1cm4gdGhpcztcclxuICAgICAgaGFuZGxlcnMgPSB0aGlzLl9ldmVudHNbdHlwZV07XHJcbiAgICAgIGxlYWZzLnB1c2goe19saXN0ZW5lcnM6aGFuZGxlcnN9KTtcclxuICAgIH1cclxuXHJcbiAgICBmb3IgKHZhciBpTGVhZj0wOyBpTGVhZjxsZWFmcy5sZW5ndGg7IGlMZWFmKyspIHtcclxuICAgICAgdmFyIGxlYWYgPSBsZWFmc1tpTGVhZl07XHJcbiAgICAgIGhhbmRsZXJzID0gbGVhZi5fbGlzdGVuZXJzO1xyXG4gICAgICBpZiAoaXNBcnJheShoYW5kbGVycykpIHtcclxuXHJcbiAgICAgICAgdmFyIHBvc2l0aW9uID0gLTE7XHJcblxyXG4gICAgICAgIGZvciAodmFyIGkgPSAwLCBsZW5ndGggPSBoYW5kbGVycy5sZW5ndGg7IGkgPCBsZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAgaWYgKGhhbmRsZXJzW2ldID09PSBsaXN0ZW5lciB8fFxyXG4gICAgICAgICAgICAoaGFuZGxlcnNbaV0ubGlzdGVuZXIgJiYgaGFuZGxlcnNbaV0ubGlzdGVuZXIgPT09IGxpc3RlbmVyKSB8fFxyXG4gICAgICAgICAgICAoaGFuZGxlcnNbaV0uX29yaWdpbiAmJiBoYW5kbGVyc1tpXS5fb3JpZ2luID09PSBsaXN0ZW5lcikpIHtcclxuICAgICAgICAgICAgcG9zaXRpb24gPSBpO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmIChwb3NpdGlvbiA8IDApIHtcclxuICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYodGhpcy53aWxkY2FyZCkge1xyXG4gICAgICAgICAgbGVhZi5fbGlzdGVuZXJzLnNwbGljZShwb3NpdGlvbiwgMSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGVsc2Uge1xyXG4gICAgICAgICAgdGhpcy5fZXZlbnRzW3R5cGVdLnNwbGljZShwb3NpdGlvbiwgMSk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBpZiAoaGFuZGxlcnMubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgICAgICBpZih0aGlzLndpbGRjYXJkKSB7XHJcbiAgICAgICAgICAgIGRlbGV0ZSBsZWFmLl9saXN0ZW5lcnM7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgICBlbHNlIHtcclxuICAgICAgICAgICAgZGVsZXRlIHRoaXMuX2V2ZW50c1t0eXBlXTtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMuZW1pdChcInJlbW92ZUxpc3RlbmVyXCIsIHR5cGUsIGxpc3RlbmVyKTtcclxuXHJcbiAgICAgICAgcmV0dXJuIHRoaXM7XHJcbiAgICAgIH1cclxuICAgICAgZWxzZSBpZiAoaGFuZGxlcnMgPT09IGxpc3RlbmVyIHx8XHJcbiAgICAgICAgKGhhbmRsZXJzLmxpc3RlbmVyICYmIGhhbmRsZXJzLmxpc3RlbmVyID09PSBsaXN0ZW5lcikgfHxcclxuICAgICAgICAoaGFuZGxlcnMuX29yaWdpbiAmJiBoYW5kbGVycy5fb3JpZ2luID09PSBsaXN0ZW5lcikpIHtcclxuICAgICAgICBpZih0aGlzLndpbGRjYXJkKSB7XHJcbiAgICAgICAgICBkZWxldGUgbGVhZi5fbGlzdGVuZXJzO1xyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNlIHtcclxuICAgICAgICAgIGRlbGV0ZSB0aGlzLl9ldmVudHNbdHlwZV07XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLmVtaXQoXCJyZW1vdmVMaXN0ZW5lclwiLCB0eXBlLCBsaXN0ZW5lcik7XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiByZWN1cnNpdmVseUdhcmJhZ2VDb2xsZWN0KHJvb3QpIHtcclxuICAgICAgaWYgKHJvb3QgPT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgIHJldHVybjtcclxuICAgICAgfVxyXG4gICAgICB2YXIga2V5cyA9IE9iamVjdC5rZXlzKHJvb3QpO1xyXG4gICAgICBmb3IgKHZhciBpIGluIGtleXMpIHtcclxuICAgICAgICB2YXIga2V5ID0ga2V5c1tpXTtcclxuICAgICAgICB2YXIgb2JqID0gcm9vdFtrZXldO1xyXG4gICAgICAgIGlmICgob2JqIGluc3RhbmNlb2YgRnVuY3Rpb24pIHx8ICh0eXBlb2Ygb2JqICE9PSBcIm9iamVjdFwiKSB8fCAob2JqID09PSBudWxsKSlcclxuICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgIGlmIChPYmplY3Qua2V5cyhvYmopLmxlbmd0aCA+IDApIHtcclxuICAgICAgICAgIHJlY3Vyc2l2ZWx5R2FyYmFnZUNvbGxlY3Qocm9vdFtrZXldKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKE9iamVjdC5rZXlzKG9iaikubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgICAgICBkZWxldGUgcm9vdFtrZXldO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgfVxyXG4gICAgcmVjdXJzaXZlbHlHYXJiYWdlQ29sbGVjdCh0aGlzLmxpc3RlbmVyVHJlZSk7XHJcblxyXG4gICAgcmV0dXJuIHRoaXM7XHJcbiAgfTtcclxuXHJcbiAgRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5vZmZBbnkgPSBmdW5jdGlvbihmbikge1xyXG4gICAgdmFyIGkgPSAwLCBsID0gMCwgZm5zO1xyXG4gICAgaWYgKGZuICYmIHRoaXMuX2FsbCAmJiB0aGlzLl9hbGwubGVuZ3RoID4gMCkge1xyXG4gICAgICBmbnMgPSB0aGlzLl9hbGw7XHJcbiAgICAgIGZvcihpID0gMCwgbCA9IGZucy5sZW5ndGg7IGkgPCBsOyBpKyspIHtcclxuICAgICAgICBpZihmbiA9PT0gZm5zW2ldKSB7XHJcbiAgICAgICAgICBmbnMuc3BsaWNlKGksIDEpO1xyXG4gICAgICAgICAgdGhpcy5lbWl0KFwicmVtb3ZlTGlzdGVuZXJBbnlcIiwgZm4pO1xyXG4gICAgICAgICAgcmV0dXJuIHRoaXM7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICBmbnMgPSB0aGlzLl9hbGw7XHJcbiAgICAgIGZvcihpID0gMCwgbCA9IGZucy5sZW5ndGg7IGkgPCBsOyBpKyspXHJcbiAgICAgICAgdGhpcy5lbWl0KFwicmVtb3ZlTGlzdGVuZXJBbnlcIiwgZm5zW2ldKTtcclxuICAgICAgdGhpcy5fYWxsID0gW107XHJcbiAgICB9XHJcbiAgICByZXR1cm4gdGhpcztcclxuICB9O1xyXG5cclxuICBFdmVudEVtaXR0ZXIucHJvdG90eXBlLnJlbW92ZUxpc3RlbmVyID0gRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5vZmY7XHJcblxyXG4gIEV2ZW50RW1pdHRlci5wcm90b3R5cGUucmVtb3ZlQWxsTGlzdGVuZXJzID0gZnVuY3Rpb24odHlwZSkge1xyXG4gICAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPT09IDApIHtcclxuICAgICAgIXRoaXMuX2V2ZW50cyB8fCBpbml0LmNhbGwodGhpcyk7XHJcbiAgICAgIHJldHVybiB0aGlzO1xyXG4gICAgfVxyXG5cclxuICAgIGlmICh0aGlzLndpbGRjYXJkKSB7XHJcbiAgICAgIHZhciBucyA9IHR5cGVvZiB0eXBlID09PSAnc3RyaW5nJyA/IHR5cGUuc3BsaXQodGhpcy5kZWxpbWl0ZXIpIDogdHlwZS5zbGljZSgpO1xyXG4gICAgICB2YXIgbGVhZnMgPSBzZWFyY2hMaXN0ZW5lclRyZWUuY2FsbCh0aGlzLCBudWxsLCBucywgdGhpcy5saXN0ZW5lclRyZWUsIDApO1xyXG5cclxuICAgICAgZm9yICh2YXIgaUxlYWY9MDsgaUxlYWY8bGVhZnMubGVuZ3RoOyBpTGVhZisrKSB7XHJcbiAgICAgICAgdmFyIGxlYWYgPSBsZWFmc1tpTGVhZl07XHJcbiAgICAgICAgbGVhZi5fbGlzdGVuZXJzID0gbnVsbDtcclxuICAgICAgfVxyXG4gICAgfVxyXG4gICAgZWxzZSBpZiAodGhpcy5fZXZlbnRzKSB7XHJcbiAgICAgIHRoaXMuX2V2ZW50c1t0eXBlXSA9IG51bGw7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gdGhpcztcclxuICB9O1xyXG5cclxuICBFdmVudEVtaXR0ZXIucHJvdG90eXBlLmxpc3RlbmVycyA9IGZ1bmN0aW9uKHR5cGUpIHtcclxuICAgIGlmICh0aGlzLndpbGRjYXJkKSB7XHJcbiAgICAgIHZhciBoYW5kbGVycyA9IFtdO1xyXG4gICAgICB2YXIgbnMgPSB0eXBlb2YgdHlwZSA9PT0gJ3N0cmluZycgPyB0eXBlLnNwbGl0KHRoaXMuZGVsaW1pdGVyKSA6IHR5cGUuc2xpY2UoKTtcclxuICAgICAgc2VhcmNoTGlzdGVuZXJUcmVlLmNhbGwodGhpcywgaGFuZGxlcnMsIG5zLCB0aGlzLmxpc3RlbmVyVHJlZSwgMCk7XHJcbiAgICAgIHJldHVybiBoYW5kbGVycztcclxuICAgIH1cclxuXHJcbiAgICB0aGlzLl9ldmVudHMgfHwgaW5pdC5jYWxsKHRoaXMpO1xyXG5cclxuICAgIGlmICghdGhpcy5fZXZlbnRzW3R5cGVdKSB0aGlzLl9ldmVudHNbdHlwZV0gPSBbXTtcclxuICAgIGlmICghaXNBcnJheSh0aGlzLl9ldmVudHNbdHlwZV0pKSB7XHJcbiAgICAgIHRoaXMuX2V2ZW50c1t0eXBlXSA9IFt0aGlzLl9ldmVudHNbdHlwZV1dO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIHRoaXMuX2V2ZW50c1t0eXBlXTtcclxuICB9O1xyXG5cclxuICBFdmVudEVtaXR0ZXIucHJvdG90eXBlLmV2ZW50TmFtZXMgPSBmdW5jdGlvbigpe1xyXG4gICAgcmV0dXJuIE9iamVjdC5rZXlzKHRoaXMuX2V2ZW50cyk7XHJcbiAgfVxyXG5cclxuICBFdmVudEVtaXR0ZXIucHJvdG90eXBlLmxpc3RlbmVyQ291bnQgPSBmdW5jdGlvbih0eXBlKSB7XHJcbiAgICByZXR1cm4gdGhpcy5saXN0ZW5lcnModHlwZSkubGVuZ3RoO1xyXG4gIH07XHJcblxyXG4gIEV2ZW50RW1pdHRlci5wcm90b3R5cGUubGlzdGVuZXJzQW55ID0gZnVuY3Rpb24oKSB7XHJcblxyXG4gICAgaWYodGhpcy5fYWxsKSB7XHJcbiAgICAgIHJldHVybiB0aGlzLl9hbGw7XHJcbiAgICB9XHJcbiAgICBlbHNlIHtcclxuICAgICAgcmV0dXJuIFtdO1xyXG4gICAgfVxyXG5cclxuICB9O1xyXG5cclxuICBpZiAodHlwZW9mIGRlZmluZSA9PT0gJ2Z1bmN0aW9uJyAmJiBkZWZpbmUuYW1kKSB7XHJcbiAgICAgLy8gQU1ELiBSZWdpc3RlciBhcyBhbiBhbm9ueW1vdXMgbW9kdWxlLlxyXG4gICAgZGVmaW5lKGZ1bmN0aW9uKCkge1xyXG4gICAgICByZXR1cm4gRXZlbnRFbWl0dGVyO1xyXG4gICAgfSk7XHJcbiAgfSBlbHNlIGlmICh0eXBlb2YgZXhwb3J0cyA9PT0gJ29iamVjdCcpIHtcclxuICAgIC8vIENvbW1vbkpTXHJcbiAgICBtb2R1bGUuZXhwb3J0cyA9IEV2ZW50RW1pdHRlcjtcclxuICB9XHJcbiAgZWxzZSB7XHJcbiAgICAvLyBCcm93c2VyIGdsb2JhbC5cclxuICAgIHdpbmRvdy5FdmVudEVtaXR0ZXIyID0gRXZlbnRFbWl0dGVyO1xyXG4gIH1cclxufSgpO1xyXG4iLCIvLyBzaGltIGZvciB1c2luZyBwcm9jZXNzIGluIGJyb3dzZXJcbnZhciBwcm9jZXNzID0gbW9kdWxlLmV4cG9ydHMgPSB7fTtcblxuLy8gY2FjaGVkIGZyb20gd2hhdGV2ZXIgZ2xvYmFsIGlzIHByZXNlbnQgc28gdGhhdCB0ZXN0IHJ1bm5lcnMgdGhhdCBzdHViIGl0XG4vLyBkb24ndCBicmVhayB0aGluZ3MuICBCdXQgd2UgbmVlZCB0byB3cmFwIGl0IGluIGEgdHJ5IGNhdGNoIGluIGNhc2UgaXQgaXNcbi8vIHdyYXBwZWQgaW4gc3RyaWN0IG1vZGUgY29kZSB3aGljaCBkb2Vzbid0IGRlZmluZSBhbnkgZ2xvYmFscy4gIEl0J3MgaW5zaWRlIGFcbi8vIGZ1bmN0aW9uIGJlY2F1c2UgdHJ5L2NhdGNoZXMgZGVvcHRpbWl6ZSBpbiBjZXJ0YWluIGVuZ2luZXMuXG5cbnZhciBjYWNoZWRTZXRUaW1lb3V0O1xudmFyIGNhY2hlZENsZWFyVGltZW91dDtcblxuZnVuY3Rpb24gZGVmYXVsdFNldFRpbW91dCgpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3NldFRpbWVvdXQgaGFzIG5vdCBiZWVuIGRlZmluZWQnKTtcbn1cbmZ1bmN0aW9uIGRlZmF1bHRDbGVhclRpbWVvdXQgKCkge1xuICAgIHRocm93IG5ldyBFcnJvcignY2xlYXJUaW1lb3V0IGhhcyBub3QgYmVlbiBkZWZpbmVkJyk7XG59XG4oZnVuY3Rpb24gKCkge1xuICAgIHRyeSB7XG4gICAgICAgIGlmICh0eXBlb2Ygc2V0VGltZW91dCA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgY2FjaGVkU2V0VGltZW91dCA9IHNldFRpbWVvdXQ7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjYWNoZWRTZXRUaW1lb3V0ID0gZGVmYXVsdFNldFRpbW91dDtcbiAgICAgICAgfVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgY2FjaGVkU2V0VGltZW91dCA9IGRlZmF1bHRTZXRUaW1vdXQ7XG4gICAgfVxuICAgIHRyeSB7XG4gICAgICAgIGlmICh0eXBlb2YgY2xlYXJUaW1lb3V0ID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICBjYWNoZWRDbGVhclRpbWVvdXQgPSBjbGVhclRpbWVvdXQ7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjYWNoZWRDbGVhclRpbWVvdXQgPSBkZWZhdWx0Q2xlYXJUaW1lb3V0O1xuICAgICAgICB9XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBjYWNoZWRDbGVhclRpbWVvdXQgPSBkZWZhdWx0Q2xlYXJUaW1lb3V0O1xuICAgIH1cbn0gKCkpXG5mdW5jdGlvbiBydW5UaW1lb3V0KGZ1bikge1xuICAgIGlmIChjYWNoZWRTZXRUaW1lb3V0ID09PSBzZXRUaW1lb3V0KSB7XG4gICAgICAgIC8vbm9ybWFsIGVudmlyb21lbnRzIGluIHNhbmUgc2l0dWF0aW9uc1xuICAgICAgICByZXR1cm4gc2V0VGltZW91dChmdW4sIDApO1xuICAgIH1cbiAgICAvLyBpZiBzZXRUaW1lb3V0IHdhc24ndCBhdmFpbGFibGUgYnV0IHdhcyBsYXR0ZXIgZGVmaW5lZFxuICAgIGlmICgoY2FjaGVkU2V0VGltZW91dCA9PT0gZGVmYXVsdFNldFRpbW91dCB8fCAhY2FjaGVkU2V0VGltZW91dCkgJiYgc2V0VGltZW91dCkge1xuICAgICAgICBjYWNoZWRTZXRUaW1lb3V0ID0gc2V0VGltZW91dDtcbiAgICAgICAgcmV0dXJuIHNldFRpbWVvdXQoZnVuLCAwKTtcbiAgICB9XG4gICAgdHJ5IHtcbiAgICAgICAgLy8gd2hlbiB3aGVuIHNvbWVib2R5IGhhcyBzY3Jld2VkIHdpdGggc2V0VGltZW91dCBidXQgbm8gSS5FLiBtYWRkbmVzc1xuICAgICAgICByZXR1cm4gY2FjaGVkU2V0VGltZW91dChmdW4sIDApO1xuICAgIH0gY2F0Y2goZSl7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICAvLyBXaGVuIHdlIGFyZSBpbiBJLkUuIGJ1dCB0aGUgc2NyaXB0IGhhcyBiZWVuIGV2YWxlZCBzbyBJLkUuIGRvZXNuJ3QgdHJ1c3QgdGhlIGdsb2JhbCBvYmplY3Qgd2hlbiBjYWxsZWQgbm9ybWFsbHlcbiAgICAgICAgICAgIHJldHVybiBjYWNoZWRTZXRUaW1lb3V0LmNhbGwobnVsbCwgZnVuLCAwKTtcbiAgICAgICAgfSBjYXRjaChlKXtcbiAgICAgICAgICAgIC8vIHNhbWUgYXMgYWJvdmUgYnV0IHdoZW4gaXQncyBhIHZlcnNpb24gb2YgSS5FLiB0aGF0IG11c3QgaGF2ZSB0aGUgZ2xvYmFsIG9iamVjdCBmb3IgJ3RoaXMnLCBob3BmdWxseSBvdXIgY29udGV4dCBjb3JyZWN0IG90aGVyd2lzZSBpdCB3aWxsIHRocm93IGEgZ2xvYmFsIGVycm9yXG4gICAgICAgICAgICByZXR1cm4gY2FjaGVkU2V0VGltZW91dC5jYWxsKHRoaXMsIGZ1biwgMCk7XG4gICAgICAgIH1cbiAgICB9XG5cblxufVxuZnVuY3Rpb24gcnVuQ2xlYXJUaW1lb3V0KG1hcmtlcikge1xuICAgIGlmIChjYWNoZWRDbGVhclRpbWVvdXQgPT09IGNsZWFyVGltZW91dCkge1xuICAgICAgICAvL25vcm1hbCBlbnZpcm9tZW50cyBpbiBzYW5lIHNpdHVhdGlvbnNcbiAgICAgICAgcmV0dXJuIGNsZWFyVGltZW91dChtYXJrZXIpO1xuICAgIH1cbiAgICAvLyBpZiBjbGVhclRpbWVvdXQgd2Fzbid0IGF2YWlsYWJsZSBidXQgd2FzIGxhdHRlciBkZWZpbmVkXG4gICAgaWYgKChjYWNoZWRDbGVhclRpbWVvdXQgPT09IGRlZmF1bHRDbGVhclRpbWVvdXQgfHwgIWNhY2hlZENsZWFyVGltZW91dCkgJiYgY2xlYXJUaW1lb3V0KSB7XG4gICAgICAgIGNhY2hlZENsZWFyVGltZW91dCA9IGNsZWFyVGltZW91dDtcbiAgICAgICAgcmV0dXJuIGNsZWFyVGltZW91dChtYXJrZXIpO1xuICAgIH1cbiAgICB0cnkge1xuICAgICAgICAvLyB3aGVuIHdoZW4gc29tZWJvZHkgaGFzIHNjcmV3ZWQgd2l0aCBzZXRUaW1lb3V0IGJ1dCBubyBJLkUuIG1hZGRuZXNzXG4gICAgICAgIHJldHVybiBjYWNoZWRDbGVhclRpbWVvdXQobWFya2VyKTtcbiAgICB9IGNhdGNoIChlKXtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIC8vIFdoZW4gd2UgYXJlIGluIEkuRS4gYnV0IHRoZSBzY3JpcHQgaGFzIGJlZW4gZXZhbGVkIHNvIEkuRS4gZG9lc24ndCAgdHJ1c3QgdGhlIGdsb2JhbCBvYmplY3Qgd2hlbiBjYWxsZWQgbm9ybWFsbHlcbiAgICAgICAgICAgIHJldHVybiBjYWNoZWRDbGVhclRpbWVvdXQuY2FsbChudWxsLCBtYXJrZXIpO1xuICAgICAgICB9IGNhdGNoIChlKXtcbiAgICAgICAgICAgIC8vIHNhbWUgYXMgYWJvdmUgYnV0IHdoZW4gaXQncyBhIHZlcnNpb24gb2YgSS5FLiB0aGF0IG11c3QgaGF2ZSB0aGUgZ2xvYmFsIG9iamVjdCBmb3IgJ3RoaXMnLCBob3BmdWxseSBvdXIgY29udGV4dCBjb3JyZWN0IG90aGVyd2lzZSBpdCB3aWxsIHRocm93IGEgZ2xvYmFsIGVycm9yLlxuICAgICAgICAgICAgLy8gU29tZSB2ZXJzaW9ucyBvZiBJLkUuIGhhdmUgZGlmZmVyZW50IHJ1bGVzIGZvciBjbGVhclRpbWVvdXQgdnMgc2V0VGltZW91dFxuICAgICAgICAgICAgcmV0dXJuIGNhY2hlZENsZWFyVGltZW91dC5jYWxsKHRoaXMsIG1hcmtlcik7XG4gICAgICAgIH1cbiAgICB9XG5cblxuXG59XG52YXIgcXVldWUgPSBbXTtcbnZhciBkcmFpbmluZyA9IGZhbHNlO1xudmFyIGN1cnJlbnRRdWV1ZTtcbnZhciBxdWV1ZUluZGV4ID0gLTE7XG5cbmZ1bmN0aW9uIGNsZWFuVXBOZXh0VGljaygpIHtcbiAgICBpZiAoIWRyYWluaW5nIHx8ICFjdXJyZW50UXVldWUpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBkcmFpbmluZyA9IGZhbHNlO1xuICAgIGlmIChjdXJyZW50UXVldWUubGVuZ3RoKSB7XG4gICAgICAgIHF1ZXVlID0gY3VycmVudFF1ZXVlLmNvbmNhdChxdWV1ZSk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgcXVldWVJbmRleCA9IC0xO1xuICAgIH1cbiAgICBpZiAocXVldWUubGVuZ3RoKSB7XG4gICAgICAgIGRyYWluUXVldWUoKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGRyYWluUXVldWUoKSB7XG4gICAgaWYgKGRyYWluaW5nKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgdmFyIHRpbWVvdXQgPSBydW5UaW1lb3V0KGNsZWFuVXBOZXh0VGljayk7XG4gICAgZHJhaW5pbmcgPSB0cnVlO1xuXG4gICAgdmFyIGxlbiA9IHF1ZXVlLmxlbmd0aDtcbiAgICB3aGlsZShsZW4pIHtcbiAgICAgICAgY3VycmVudFF1ZXVlID0gcXVldWU7XG4gICAgICAgIHF1ZXVlID0gW107XG4gICAgICAgIHdoaWxlICgrK3F1ZXVlSW5kZXggPCBsZW4pIHtcbiAgICAgICAgICAgIGlmIChjdXJyZW50UXVldWUpIHtcbiAgICAgICAgICAgICAgICBjdXJyZW50UXVldWVbcXVldWVJbmRleF0ucnVuKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcXVldWVJbmRleCA9IC0xO1xuICAgICAgICBsZW4gPSBxdWV1ZS5sZW5ndGg7XG4gICAgfVxuICAgIGN1cnJlbnRRdWV1ZSA9IG51bGw7XG4gICAgZHJhaW5pbmcgPSBmYWxzZTtcbiAgICBydW5DbGVhclRpbWVvdXQodGltZW91dCk7XG59XG5cbnByb2Nlc3MubmV4dFRpY2sgPSBmdW5jdGlvbiAoZnVuKSB7XG4gICAgdmFyIGFyZ3MgPSBuZXcgQXJyYXkoYXJndW1lbnRzLmxlbmd0aCAtIDEpO1xuICAgIGlmIChhcmd1bWVudHMubGVuZ3RoID4gMSkge1xuICAgICAgICBmb3IgKHZhciBpID0gMTsgaSA8IGFyZ3VtZW50cy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgYXJnc1tpIC0gMV0gPSBhcmd1bWVudHNbaV07XG4gICAgICAgIH1cbiAgICB9XG4gICAgcXVldWUucHVzaChuZXcgSXRlbShmdW4sIGFyZ3MpKTtcbiAgICBpZiAocXVldWUubGVuZ3RoID09PSAxICYmICFkcmFpbmluZykge1xuICAgICAgICBydW5UaW1lb3V0KGRyYWluUXVldWUpO1xuICAgIH1cbn07XG5cbi8vIHY4IGxpa2VzIHByZWRpY3RpYmxlIG9iamVjdHNcbmZ1bmN0aW9uIEl0ZW0oZnVuLCBhcnJheSkge1xuICAgIHRoaXMuZnVuID0gZnVuO1xuICAgIHRoaXMuYXJyYXkgPSBhcnJheTtcbn1cbkl0ZW0ucHJvdG90eXBlLnJ1biA9IGZ1bmN0aW9uICgpIHtcbiAgICB0aGlzLmZ1bi5hcHBseShudWxsLCB0aGlzLmFycmF5KTtcbn07XG5wcm9jZXNzLnRpdGxlID0gJ2Jyb3dzZXInO1xucHJvY2Vzcy5icm93c2VyID0gdHJ1ZTtcbnByb2Nlc3MuZW52ID0ge307XG5wcm9jZXNzLmFyZ3YgPSBbXTtcbnByb2Nlc3MudmVyc2lvbiA9ICcnOyAvLyBlbXB0eSBzdHJpbmcgdG8gYXZvaWQgcmVnZXhwIGlzc3Vlc1xucHJvY2Vzcy52ZXJzaW9ucyA9IHt9O1xuXG5mdW5jdGlvbiBub29wKCkge31cblxucHJvY2Vzcy5vbiA9IG5vb3A7XG5wcm9jZXNzLmFkZExpc3RlbmVyID0gbm9vcDtcbnByb2Nlc3Mub25jZSA9IG5vb3A7XG5wcm9jZXNzLm9mZiA9IG5vb3A7XG5wcm9jZXNzLnJlbW92ZUxpc3RlbmVyID0gbm9vcDtcbnByb2Nlc3MucmVtb3ZlQWxsTGlzdGVuZXJzID0gbm9vcDtcbnByb2Nlc3MuZW1pdCA9IG5vb3A7XG5wcm9jZXNzLnByZXBlbmRMaXN0ZW5lciA9IG5vb3A7XG5wcm9jZXNzLnByZXBlbmRPbmNlTGlzdGVuZXIgPSBub29wO1xuXG5wcm9jZXNzLmxpc3RlbmVycyA9IGZ1bmN0aW9uIChuYW1lKSB7IHJldHVybiBbXSB9XG5cbnByb2Nlc3MuYmluZGluZyA9IGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdwcm9jZXNzLmJpbmRpbmcgaXMgbm90IHN1cHBvcnRlZCcpO1xufTtcblxucHJvY2Vzcy5jd2QgPSBmdW5jdGlvbiAoKSB7IHJldHVybiAnLycgfTtcbnByb2Nlc3MuY2hkaXIgPSBmdW5jdGlvbiAoZGlyKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdwcm9jZXNzLmNoZGlyIGlzIG5vdCBzdXBwb3J0ZWQnKTtcbn07XG5wcm9jZXNzLnVtYXNrID0gZnVuY3Rpb24oKSB7IHJldHVybiAwOyB9O1xuIiwiaW1wb3J0ICcuL2pzL21vZHVsZXMvZ2xvYmFsJztcbmltcG9ydCAnLi9qcy9tb2R1bGVzL2NvbmZpZyc7XG5pbXBvcnQgJy4vanMvbW9kdWxlcy91dGlscyc7XG5pbXBvcnQgJy4vanMvbW9kdWxlcy9oYW5kbGVDbGlja3MnO1xuaW1wb3J0ICcuL2pzL21vZHVsZXMvY2FuSVVzZURhdGEnO1xuaW1wb3J0ICcuL2pzL21vZHVsZXMvaW5wdXQnO1xuaW1wb3J0ICcuL2pzL21vZHVsZXMvd2VpcmRDYXNlJztcbmltcG9ydCAnLi9qcy9tb2R1bGVzL3JhbmRvbU5hbWVzJztcbiIsIihmdW5jdGlvbigpIHtcblxuICB2YXIgY2FuSURhdGEgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcuY2FuSURhdGEnKTtcbiAgLy92YXIgY2xpY2tCdG4gPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbcmVsPVwibWFpbl9fY2xpY2tlclwiXScpO1xuXG4gIGZ1bmN0aW9uIGluaXQoKSB7XG4gICAgdmFyIHAxID0gbmV3IFByb21pc2UoXG4gICAgICBmdW5jdGlvbihyZXNvbHZlKSB7XG4gICAgICAgIHZhciByZXF1ZXN0O1xuICAgICAgICBpZiAod2luZG93LlhNTEh0dHBSZXF1ZXN0KSB7XG4gICAgICAgICAgcmVxdWVzdCA9IG5ldyBYTUxIdHRwUmVxdWVzdCgpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJlcXVlc3QgPSBuZXcgQWN0aXZlWE9iamVjdChcIk1pY3Jvc29mdC5YTUxIVFRQXCIpO1xuICAgICAgICB9XG4gICAgICAgIHJlcXVlc3Qub3BlbignR0VUJywgJ2h0dHBzOi8vcmF3LmdpdGh1YnVzZXJjb250ZW50LmNvbS9GeXJkL2Nhbml1c2UvbWFzdGVyL2RhdGEuanNvbicpO1xuICAgICAgICByZXF1ZXN0Lm9ucmVhZHlzdGF0ZWNoYW5nZSA9IGZ1bmN0aW9uKCkge1xuICAgICAgICAgIGlmIChyZXF1ZXN0LnJlYWR5U3RhdGUgPT09IDQgJiYgcmVxdWVzdC5zdGF0dXMgPT09IDIwMCkge1xuICAgICAgICAgICAgY29uc3QgY2FuSVVzZURhdGEgPSBKU09OLnBhcnNlKHJlcXVlc3QucmVzcG9uc2VUZXh0KTtcbiAgICAgICAgICAgIHJlc29sdmUoY2FuSVVzZURhdGEpO1xuICAgICAgICAgICAgY29uc29sZS5sb2coY2FuSVVzZURhdGEuZGF0YSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJlcXVlc3Quc2VuZCgpO1xuICAgICAgfSk7XG4gICAgcDFcbiAgICAgIC50aGVuKGNhbklVc2VEYXRhID0+IHtcblxuICAgICAgICB2YXIgdGl0bGVzPSBcIlwiO1xuXG4gICAgICAgICAgZm9yIChsZXQgaSBpbiBjYW5JVXNlRGF0YS5kYXRhKSB7XG4gICAgICAgICAgICB0aXRsZXMgKz0gXCI8ZGl2IGNsYXNzPSdkYXRhX19pdGVtJz5cIlxuICAgICAgICAgICAgdGl0bGVzICs9IFwiPGg1PlwiICsgY2FuSVVzZURhdGEuZGF0YVtpXS50aXRsZSArIFwiPC9oNT5cIlxuICAgICAgICAgICAgdGl0bGVzICs9IFwiPHA+XCIgKyBjYW5JVXNlRGF0YS5kYXRhW2ldLmRlc2NyaXB0aW9uICsgXCI8L3A+XCJcbiAgICAgICAgICAgIHRpdGxlcyArPSBcIjxhIGhyZWY9XCIgKyBjYW5JVXNlRGF0YS5kYXRhW2ldLmxpbmtzWzBdLnVybCArIFwiPlwiICsgXCJsaW5rXCIgKyBcIjwvYT5cIlxuICAgICAgICAgICAgdGl0bGVzICs9IFwiPC9kaXY+XCJcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBjYW5JRGF0YS5pbm5lckhUTUwgPSB0aXRsZXM7XG5cbiAgICAgIH0pXG5cbiAgfVxuXG4gIC8vY2xpY2tCdG4uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGluaXQpO1xuXG4gIGlmIChcIlByb21pc2VcIiBpbiB3aW5kb3cpIHsgICAvLyBDaGVjayBmb3IgUHJvbWlzZSBvbiB3aW5kb3dcbiAgICBjb25zb2xlLmxvZygnUHJvbWlzZXMgYXJlIHN1cHBvcnRlZCcpO1xuICAgIEVWVC5vbihcImluaXRcIiwgaW5pdCk7XG5cbiAgIH0gZWxzZSB7XG4gICAgIGNvbnNvbGUubG9nKCdZb3VyIGJyb3dzZXIgZG9lc25cXCd0IHN1cHBvcnQgdGhlIDxjb2RlPlByb21pc2U8Y29kZT4gaW50ZXJmYWNlLicpO1xuICAgfVxuXG59KSgpO1xuIiwiY29uc3QgY29uZmlnID0gSkMuY29uZmlnID0ge307XG4gIGNvbmZpZy5wcm9qZWN0ID0gJ2p1c3R5bkNsYXJrLW5ldyc7XG4gIGNvbmZpZy5kZXZlbG9wZXIgPSAnanVzdHluIGNsYXJrJztcbiAgY29uZmlnLnZlcnNpb24gPSBcIjEuMC4wXCI7XG5cbiIsInZhciBjb29raWVNYXA7XG4vLyBDb29raWVzXG5KQy51dGlscy5nZXRDb29raWVzID0gdXBkYXRlID0+IHsgLy8gR2V0IGNvb2tpZXNcbiAgaWYoIWNvb2tpZU1hcCB8fCB1cGRhdGUpIHtcbiAgICBjb29raWVNYXAgPSB7fTtcbiAgICB2YXIgaSwgY29va2llcyA9IGRvY3VtZW50LmNvb2tpZS5zcGxpdChcIjtcIik7XG4gICAgZm9yIChpID0gMDsgaSA8IGNvb2tpZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgIHZhciBpbmRleCA9IGNvb2tpZXNbaV0uaW5kZXhPZignPScpO1xuICAgICAgdmFyIHggPSBjb29raWVzW2ldLnN1YnN0cigwLCBpbmRleCk7XG4gICAgICB2YXIgeSA9IGNvb2tpZXNbaV0uc3Vic3RyKGluZGV4ICsgMSk7XG4gICAgICB4ID0geC5yZXBsYWNlKC9eXFxzK3xcXHMrJC9nLCAnJyk7XG4gICAgICBpZih4KSBjb29raWVNYXBbeF0gPSBkZWNvZGVVUkkoeSk7XG4gICAgfVxuICB9XG4gIHJldHVybiBjb29raWVNYXA7XG59O1xuXG5KQy51dGlscy5nZXRDb29raWUgPSAoYywgdXBkYXRlKSA9PiB7IC8vIEdldCBjb29raWVcbiAgcmV0dXJuIHRoaXMuZ2V0Q29va2llcyh1cGRhdGUpW2NdO1xufTtcblxuSkMudXRpbHMuc2V0Q29va2llID0gKG5hbWUsIHZhbHVlLCBvcHRzKSA9PiB7IC8vIFNldCBjb29raWUgSkMudXRpbHMuc2V0Q29va2llKCdqY0Nvb2tpZScsdHJ1ZSwge2V4cGlyZURhdGU6ICgzNjAwICogMjQgKiAzNjUpfSk7XG4gIHZhciB2YWx1ZSA9IGVuY29kZVVSSSh2YWx1ZSk7XG4gIG9wdHMgPSBvcHRzIHx8IHt9O1xuICB2YWx1ZSArPSBcIjtwYXRoPVwiICsgKG9wdHMucGF0aCB8fCBcIi9cIik7XG4gIGlmKG9wdHMuZG9tYWluKSB2YWx1ZSArPSBcIjtkb21haW49XCIgKyBvcHRzLmRvbWFpbjtcbiAgdmFyIHQgPSB0eXBlb2Ygb3B0cy5tYXhBZ2U7XG4gIGlmKHQgPT0gXCJudW1iZXJcIiB8fCB0ID09IFwic3RyaW5nXCIpIHZhbHVlICs9IFwiO21heC1hZ2U9XCIgKyBvcHRzLm1heEFnZTtcbiAgdmFyIGUgPSBvcHRzLmV4cGlyZURhdGU7XG4gIGlmKHR5cGVvZiBlID09IFwibnVtYmVyXCIpIGUgPSBuZXcgRGF0ZSgobmV3IERhdGUoKSkuZ2V0VGltZSgpICsgZSAqIDEwMDApO1xuICBpZihlKSB2YWx1ZSArPSAnO2V4cGlyZXM9JyArIGUudG9VVENTdHJpbmcoKTtcbiAgaWYob3B0cy5zZWN1cmUpIHZhbHVlICs9IFwiO3NlY3VyZVwiO1xuICBkb2N1bWVudC5jb29raWUgPSBuYW1lICsgJz0nICsgdmFsdWU7XG4gIGNvb2tpZU1hcCA9IG51bGw7XG59O1xuXG5zZXRUaW1lb3V0KCgpPT4ge1xuICBpZiAoIWRvY3VtZW50LmNvb2tpZS5tYXRjaCgnamNDb29raWUnKSkge1xuICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5jb29raWUtcG9saWN5JykuY2xhc3NMaXN0LmFkZCgnY29va2llLXBvbGljeS0tc2hvdycpO1xuICB9IGVsc2Uge1xuICAgIGNvbnNvbGUubG9nKCdjb29raWUgcG9saWN5IGlzIGhpZGRlbicpO1xuICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5jb29raWUtcG9saWN5JykuY2xhc3NMaXN0LmFkZCgnY29va2llLXBvbGljeS0taGlkZScpO1xuICB9XG59LDEwMDApO1xuXG5leHBvcnQgZnVuY3Rpb24gc2V0UG9saWN5Q29va2llKCkge1xuICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcuY29va2llLXBvbGljeScpLmNsYXNzTGlzdC5hZGQoJ2Nvb2tpZS1wb2xpY3ktLWhpZGUnKTtcbiAgY29uc29sZS5sb2coJ2Nvb2tpZSBzZXQnKTtcbiAgSkMudXRpbHMuc2V0Q29va2llKCdqY0Nvb2tpZScsIHRydWUsIHtleHBpcmVEYXRlOiAoMzYwMCAqIDI0ICogMzY1KX0pO1xufVxuIiwiaW1wb3J0IEV2ZW50RW1pdHRlcjIgZnJvbSAnZXZlbnRlbWl0dGVyMic7XG5cbihmdW5jdGlvbihnbG9iYWwpe1xuXG4gIGdsb2JhbC5KQyA9IGdsb2JhbC5KQyAhPT0gdW5kZWZpbmVkID8gSkMgOiB7fTsgLy8gU2V0IHVwIGdsb2JhbCB2YXJpYWJsZXNcblxuICBKQy5jb21wb25lbnRzID0ge307XG4gIEpDLmNvbmZpZyA9IHt9O1xuICBKQy5tZW51ID0ge307XG4gIEpDLnV0aWxzID0ge307XG5cbiAgZ2xvYmFsLkVWVCA9IG5ldyBFdmVudEVtaXR0ZXIyKCk7XG5cbiAgZ2xvYmFsLmFkZEV2ZW50TGlzdGVuZXIoJ0RPTUNvbnRlbnRMb2FkZWQnLCBmdW5jdGlvbigpIHtcbiAgICBFVlQuZW1pdCgnaW5pdCcpO1xuICB9KTtcblxuICBjb25zb2xlLmxvZyhKQyk7XG5cbiAgY29uc3Qgc3RyID0gJ0VTNidcbiAgY29uc29sZS5sb2coYEhlbGxvICR7c3RyfWApXG5cbn0pKHdpbmRvdyk7XG4iLCJpbXBvcnQgeyBzZXRQb2xpY3lDb29raWUgfSBmcm9tICcuL2Nvb2tpZXMnO1xuaW1wb3J0IHsgbG9hZE5hbWVzIH0gZnJvbSAnLi9sb2FkTmFtZXMnO1xuaW1wb3J0IHsgeW91VHViZVBsYXllciB9IGZyb20gJy4vdXRpbHMnO1xuXG52YXIgeCA9IHlvdVR1YmVQbGF5ZXIoJ1JLWWpkVGlNa1hNJyk7XG5cbi8vIFNldCB1cCBjbGljayBoYW5kbGVyc1xuZnVuY3Rpb24gY2xpY2tIYW5kbGVycygpIHtcblxuICB2YXIgYWRkZXIgPSBKQy51dGlscy5hZGRlcigpO1xuICB2YXIgb3Blbk92ZXJsYXkgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbcmVsPVwibWFpbl9fb3Blbk92ZXJsYXlcIl0nKTtcbiAgdmFyIG92ZXJsYXkgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcub3ZlcmxheScpXG5cbiAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcignW3JlbD1cIm1haW5fX2xvYWROYW1lc1wiXScpLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgbG9hZE5hbWVzKTtcblxuICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbcmVsPVwibWFpbl9fY2xpY2tlclwiXScpLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgZnVuY3Rpb24oKSB7XG4gICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcignW3JlbD1cIm1haW5fX2NsaWNrZXJcIl0nKS5pbm5lckhUTUwgPSBhZGRlcigpO1xuICB9KTtcblxuICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcuY29va2llLXBvbGljeV9fY2xvc2UnKS5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIHNldFBvbGljeUNvb2tpZSk7IC8vIENvb2tpZSBQb2xpY3lcblxuICBvdmVybGF5LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgSkMudXRpbHMuY2xvc2VPdmVybGF5KTsgLy8gY2xvc2Ugb3ZlcmxheVxuICBvcGVuT3ZlcmxheS5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIEpDLnV0aWxzLm9wZW5PdmVybGF5KTsgLy8gb3BlbiBvdmVybGF5XG4gIG9wZW5PdmVybGF5LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgeCk7IC8vIG9wZW4gb3ZlcmxheVxufVxuXG5FVlQub24oJ2luaXQnLCBjbGlja0hhbmRsZXJzKTtcblxuIiwiKGZ1bmN0aW9uKCkge1xuXG4gIGNvbnN0IGFuc3dlcnMgPSBbXTtcblxuICB2YXIgZm9ybSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5mb3JtJyk7XG5cbiAgY29uc3QgaW5wdXRGdW5jID0gKGUpPT4ge1xuICAgIGUucHJldmVudERlZmF1bHQoKTtcblxuICAgIHZhciBpbnB1dFZhbHVlID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignW25hbWU9aXRlbV0nKS52YWx1ZTtcblxuICAgIGFuc3dlcnMucHVzaChpbnB1dFZhbHVlKVxuXG4gICAgbG9jYWxTdG9yYWdlLnNldEl0ZW0oJ2Fuc3dlcnMnLCBKU09OLnN0cmluZ2lmeShhbnN3ZXJzKSk7XG5cbiAgICB2YXIgYW5zd2Vyc09iaiA9IEpTT04ucGFyc2UobG9jYWxTdG9yYWdlLmdldEl0ZW0oJ2Fuc3dlcnMnKSk7XG5cbiAgICBjb25zb2xlLmxvZyhhbnN3ZXJzT2JqKTtcblxuICAgIGxvY2FsU3RvcmFnZS5zZXRJdGVtKEpDLnV0aWxzLnJhbmRvbU51bWJlcigpLCBpbnB1dFZhbHVlKTtcblxuICAgIC8vdGhpcy5yZXNldCgpO1xuXG4gIH1cblxuICBmb3JtLmFkZEV2ZW50TGlzdGVuZXIoJ3N1Ym1pdCcsIGlucHV0RnVuYyk7XG5cbn0pKCk7XG5cbiIsImV4cG9ydCBmdW5jdGlvbiBsb2FkTmFtZXMoKSB7XG5cbiAgdmFyIHJlcXVlc3Q7XG5cbiAgaWYgKHdpbmRvdy5YTUxIdHRwUmVxdWVzdCkge1xuICAgIHJlcXVlc3QgPSBuZXcgWE1MSHR0cFJlcXVlc3QoKTtcbiAgfSBlbHNlIHtcbiAgICByZXF1ZXN0ID0gbmV3IEFjdGl2ZVhPYmplY3QoXCJNaWNyb3NvZnQuWE1MSFRUUFwiKTtcbiAgfVxuXG4gIHJlcXVlc3Qub3BlbignR0VUJywgJ2h0dHBzOi8vanNvbnBsYWNlaG9sZGVyLnR5cGljb2RlLmNvbS91c2VycycpO1xuXG4gIHJlcXVlc3Qub25yZWFkeXN0YXRlY2hhbmdlID0gZnVuY3Rpb24oKSB7XG4gICAgaWYgKChyZXF1ZXN0LnJlYWR5U3RhdGUgPT09IDQpICYmIChyZXF1ZXN0LnN0YXR1cyA9PT0gMjAwKSkge1xuICAgICAgdmFyIGRhdGEgPSBKU09OLnBhcnNlKHJlcXVlc3QucmVzcG9uc2VUZXh0KTtcbiAgICAgIGxvY2FsU3RvcmFnZS5zZXRJdGVtKCdkYXRhJywgSlNPTi5zdHJpbmdpZnkoZGF0YSkpO1xuICAgICAgY29uc29sZS5sb2coZGF0YSk7XG5cbiAgICAgIHZhciBuYW1lcyA9ICcnO1xuICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBkYXRhLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIG5hbWVzICs9ICc8ZGl2IGNsYXNzPVwicGVyc29uXCI+JztcbiAgICAgICAgbmFtZXMgKz0gJzxoNT4nICsgZGF0YVtpXS51c2VybmFtZSArIFwiPC9oNT5cIjtcbiAgICAgICAgbmFtZXMgKz0gJzxwPicgKyBkYXRhW2ldLm5hbWUgKyBcIjwvcD5cIjtcbiAgICAgICAgbmFtZXMgKz0gJzxpPicgKyBkYXRhW2ldLmVtYWlsICsgXCI8L2k+XCI7XG4gICAgICAgIG5hbWVzICs9ICc8L2Rpdj4nO1xuICAgICAgICBjb25zb2xlLmxvZyhkYXRhW2ldLm5hbWUpXG4gICAgICB9XG4gICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbcmVsPWNvcHlTZWN0aW9uXScpLmlubmVySFRNTCA9IG5hbWVzO1xuICAgIH1cbiAgfVxuXG4gIHJlcXVlc3Quc2VuZCgpO1xufVxuXG4iLCJpbXBvcnQgeyByYW5kTnVtR2VuIH0gZnJvbSAnLi91dGlscyc7XG5pbXBvcnQgeyB0b1dlaXJkQ2FzZSB9IGZyb20gJy4vd2VpcmRDYXNlJztcblxuKGZ1bmN0aW9uKCkge1xuICB2YXIgZmlyc3ROYW1lcyA9IFtcImJpZ1wiLCBcIm9sIGRpcnR5XCIsIFwibGlsXCIsIFwidGhlIGxlZ2VuZGFyeVwiLCBcImNoaWVmXCIsIFwiYm9zc1wiLCAneW91bmcnLCAnc2xlZXB5JywgJ09HJywgJ0FLQScsICdUaGUgQ2hhbXAnXTtcbiAgdmFyIGxhc3ROYW1lcyA9IFtcIm1hY1wiLCBcIndpZyB3aWdcIiwgXCJiYXN0YXJkXCIsIFwibW90ZVwiLCBcImpvaG5zb25cIiwgXCJzbWFzaGVyXCIsICdqb25lcycsICdkYXdnJywgJ2FsbWlnaHR5JywgJ3RoZSBpbGxlc3QnLCAnYmFlJywgJ3NrZXp6J107XG5cbiAgZnVuY3Rpb24gZ2V0UmFuZE5hbWUoYXJyKSB7XG4gICAgcmV0dXJuIGFycltyYW5kTnVtR2VuKGFyci5sZW5ndGgpXTtcbiAgfVxuXG4gIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5yYW5kTmFtZScpLmlubmVySFRNTCA9IHRvV2VpcmRDYXNlKGdldFJhbmROYW1lKGZpcnN0TmFtZXMpKSArICcgJyArIHRvV2VpcmRDYXNlKGdldFJhbmROYW1lKGxhc3ROYW1lcykpO1xufSkoKTtcbiIsImltcG9ydCAnLi9jb29raWVzJztcblxuSkMudXRpbHMuYWRkZXIgPSAoKT0+IHtcbiAgdmFyIHBsdXMgPSBmdW5jdGlvbigpIHtcbiAgICB2YXIgY291bnRlciA9IDA7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIGNvdW50ZXIrK1xuICAgIH1cbiAgfVxuICByZXR1cm4gcGx1cygpXG59XG5cbi8vIHRoaXMgY2hlY2tlclxuSkMudXRpbHMudGhpc0NoZWNrID0gZnVuY3Rpb24oKSB7XG4gIGNvbnNvbGUubG9nKHRoaXMpO1xufVxuXG5KQy51dGlscy5yYW5kb21OdW1iZXIgPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIDEwMDApXG59O1xuXG5KQy51dGlscy5vdXRwdXQgPSBmdW5jdGlvbih4KSB7XG4gIGNvbnNvbGUubG9nKHgpO1xufVxuXG4vLyBDaGFyYWN0ZXIgY291bnQgaW4gRWxlbWVudFxuSkMudXRpbHMuY2hhcnNJbkVsZW1lbnQgPSBlbG0gPT4ge1xuICBpZiAoZWxtLm5vZGVUeXBlID09IDMpIHsgLy8gVEVYVF9OT0RFXG4gICAgcmV0dXJuIGVsbS5ub2RlVmFsdWUubGVuZ3RoO1xuICB9XG4gIHZhciBjb3VudCA9IDA7XG4gIGZvciAodmFyIGkgPSAwLCBjaGlsZDsgY2hpbGQgPSBlbG0uY2hpbGROb2Rlc1tpXTsgaSsrKSB7XG4gICAgY291bnQgKz0gSkMudXRpbHMuY2hhcnNJbkVsZW1lbnQoY2hpbGQpO1xuICB9XG4gIHJldHVybiBjb3VudDtcbn1cblxuLy8gQWxlcnQgdXRpbGl0eVxuSkMudXRpbHMuYWxlcnQgPSBhID0+IHtcbiAgYWxlcnQoYSk7XG59XG5cbkpDLnV0aWxzLnNob3dCb2R5Q2hhck51bSA9ICgpID0+IHtcbiAgdmFyIGVsbSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ2JvZHknKTtcbiAgY29uc29sZS5sb2coXCJUaGlzIHBhZ2UgaGFzIFwiICsgSkMudXRpbHMuY2hhcnNJbkVsZW1lbnQoZWxtKSArIFwiIGNoYXJhY3RlcnMgaW4gdGhlIGJvZHlcIik7XG59O1xuXG5KQy51dGlscy5vcGVuT3ZlcmxheSA9ICgpID0+ICB7XG4gIHZhciBvdmVybGF5ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLm92ZXJsYXknKTtcbiAgdmFyIGJvZHkgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdib2R5Jyk7XG4gIHZhciBvdmVybGF5SW5uZXIgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcub3ZlcmxheV9faW5uZXInKTtcbiAgb3ZlcmxheS5jbGFzc0xpc3QudG9nZ2xlKCdvdmVybGF5LS1vcGVuJyk7XG4gIGJvZHkuY2xhc3NMaXN0LmFkZCgnb3ZlcmxheS0tb3BlbicpO1xuICBvdmVybGF5SW5uZXIuY2xhc3NMaXN0LmFkZCgnb3ZlcmxheS0tb3BlbicpO1xufVxuXG5KQy51dGlscy5jbG9zZU92ZXJsYXkgPSAoKSA9PiAge1xuICB2YXIgb3ZlcmxheSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5vdmVybGF5Jyk7XG4gIHZhciBib2R5ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignYm9keScpO1xuICB2YXIgb3ZlcmxheUlubmVyID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLm92ZXJsYXlfX2lubmVyJyk7XG4gIHZhciB2aWQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcudmlkZW9fX3dyYXAnKTtcblxuICAgICAgb3ZlcmxheS5jbGFzc0xpc3QudG9nZ2xlKCdvdmVybGF5LS1vcGVuJyk7XG4gICAgICBib2R5LmNsYXNzTGlzdC50b2dnbGUoJ292ZXJsYXktLW9wZW4nKTtcbiAgICAgIG92ZXJsYXlJbm5lci5jbGFzc0xpc3QudG9nZ2xlKCdvdmVybGF5LS1vcGVuJyk7XG5cbiAgICAgIHZpZC5yZW1vdmUoKTtcbn1cblxuXG5cbmV4cG9ydCBmdW5jdGlvbiByYW5kTnVtR2VuKG1heCkge1xuICByZXR1cm4gTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogbWF4KVxufTtcblxuXG5leHBvcnQgZnVuY3Rpb24gY29vbEZ1bmsoKSB7XG4gIGNvbnNvbGUubG9nKCd0aGlzIGxvdmUgaXMgdGFraW5nIGEgaG9sZCBvZiBtZScpO1xufTtcblxuXG5cbmV4cG9ydCBmdW5jdGlvbiB5b3VUdWJlUGxheWVyKGlkKSB7XG5cbiAgICAgIHJldHVybiBmdW5jdGlvbiAoKSB7XG5cbiAgICAgICAgdmFyIGJvZHkgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdib2R5Jyk7XG5cbiAgICAgICAgdmFyIHZpZGVvX193cmFwID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgICAgIHZhciB2aWRlb1dyYXBwZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblxuICAgICAgICB2YXIgaWZyYW1lRGl2ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnaUZyYW1lJyk7XG5cbiAgICAgICAgaWZyYW1lRGl2LnNldEF0dHJpYnV0ZSgnZGF0YS15b3V0dWJlLWlkJywgaWQpO1xuICAgICAgICBpZnJhbWVEaXYuc2V0QXR0cmlidXRlKCdzcmMnLCAnaHR0cHM6Ly93d3cueW91dHViZS5jb20vZW1iZWQvJyArIGlkICsgJz9yZWw9MCZhbXA7Y29udHJvbHM9MCZhbXAnKTtcblxuXG4gICAgICAgIHZpZGVvX193cmFwLnNldEF0dHJpYnV0ZSgnY2xhc3MnLCAndmlkZW9fX3dyYXAnKTtcbiAgICAgICAgdmlkZW9XcmFwcGVyLnNldEF0dHJpYnV0ZSgnY2xhc3MnLCAndmlkZW9XcmFwcGVyJyk7XG5cbiAgICAgICAgdmlkZW9fX3dyYXAuYXBwZW5kQ2hpbGQodmlkZW9XcmFwcGVyKTtcbiAgICAgICAgdmlkZW9XcmFwcGVyLmFwcGVuZENoaWxkKGlmcmFtZURpdik7XG5cbiAgICAgICAgYm9keS5hcHBlbmRDaGlsZCh2aWRlb19fd3JhcCk7XG5cbiAgICAgICAgY29uc29sZS5sb2coJ3JldHVybicpO1xuICAgICAgfVxuXG59O1xuXG5cblxuLyo8aWZyYW1lIHdpZHRoPVwiMTI4MFwiIGhlaWdodD1cIjcyMFwiIHNyYz1cImh0dHBzOi8vd3d3LnlvdXR1YmUuY29tL2VtYmVkL1JLWWpkVGlNa1hNP3JlbD0wJmFtcDtjb250cm9scz0wJmFtcDtzaG93aW5mbz0wXCIgZnJhbWVib3JkZXI9XCIwXCIgYWxsb3dmdWxsc2NyZWVuPVwiXCI+PC9pZnJhbWU+Ki9cbiIsImZ1bmN0aW9uIGdldEluZGV4KHZhbCwgaW5kZXgpIHtcbiAgaWYgKGluZGV4ICUgMiA9PSAwKSB7XG4gICAgcmV0dXJuIHZhbC50b1VwcGVyQ2FzZSgpXG4gIH1cbiAgaWYgKGluZGV4ICUgMiA9PSAxKSB7XG4gICAgcmV0dXJuIHZhbC50b0xvd2VyQ2FzZSgpXG4gIH1cbn1cblxuZnVuY3Rpb24gdG9VcHBlckxvd2VyKHN0cmluZykge1xuICByZXR1cm4gc3RyaW5nLnNwbGl0KCcnKS5tYXAoZ2V0SW5kZXgpLmpvaW4oJycpO1xufTtcblxuZXhwb3J0IGZ1bmN0aW9uIHRvV2VpcmRDYXNlKHRleHQpe1xuICByZXR1cm4gdGV4dC5zcGxpdCgnICcpLm1hcChmdW5jdGlvbih2YWwpIHtcbiAgICByZXR1cm4gdG9VcHBlckxvd2VyKHZhbClcbiAgfSkuam9pbignICcpXG5cbn1cblxuLy9kb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucmFuZE5hbWUnKS5pbnNlcnRBZGphY2VudEhUTUwoJ2JlZm9yZWJlZ2luJywgJzxkaXYgY2xhc3M9XCJcIj4nICsgdG9XZWlyZENhc2UoJ1dlaXJkIHN0cmluZyBjYXNlJykgKyAnPC9kaXY+JylcbiJdfQ==
