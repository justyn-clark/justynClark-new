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

require('./js/modules/objConstructor');

require('./js/modules/handleClicks');

require('./js/modules/canIUseData');

require('./js/modules/input');

require('./js/modules/weirdCase');

require('./js/modules/randomNames');

require('./js/modules/countdown');

//import {loadVideos} from './js/modules/loadVideos';

//EVT.on('init', loadVideos)

var canFight = function canFight(state) {
  return {
    fight: function fight() {
      console.log(state.name + ' slashes at the foe!');
      state.stamina--;
    }
  };
};

var fighter = function fighter(name) {
  var state = {
    name: name,
    health: 100,
    stamina: 100
  };

  return Object.assign(state, canFight(state));
};

var canCast = function canCast(state) {
  return {
    cast: function cast(spell) {
      console.log(state.name + ' casts ' + spell + '!');
      state.mana--;
    }
  };
};

var mage = function mage(name) {
  var state = {
    name: name,
    health: 100,
    mana: 100
  };

  return Object.assign(state, canCast(state));
};

var slasher = fighter('Slasher');
var dasher = fighter('Dasher');
var stomper = fighter('Stomper');
var crusher = fighter('Crusher');

//slasher.fight();
//dasher.fight();
//stomper.fight();
//crusher.fight();

// Slasher slashes at the foe!
//console.log(slasher.stamina)  // 99

var scorcher = mage('Scorcher');
//scorcher.cast('fireball');    // Scorcher casts fireball!
//console.log(scorcher.mana)    // 99

var toolBox = function toolBox() {
  return {
    click: function click(arg) {
      console.log('' + arg);
    },
    randNum: function randNum() {
      return Math.floor(Math.random() * 100);
    }
  };
};

var tool = toolBox();

console.log(tool);
console.log(tool.click('click'));
console.log(tool.randNum());

},{"./js/modules/canIUseData":4,"./js/modules/config":5,"./js/modules/countdown":7,"./js/modules/global":8,"./js/modules/handleClicks":9,"./js/modules/input":10,"./js/modules/objConstructor":12,"./js/modules/randomNames":13,"./js/modules/utils":14,"./js/modules/weirdCase":15}],4:[function(require,module,exports){
'use strict';

(function () {

  var canIData = document.querySelector('.canIData');

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

  if ("Promise" in window) {
    // Check for Promise on window
    console.log('Promises are supported');
    //EVT.on("init", init);
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
"use strict";

(function (JC) {

  var countdown = JC.countdown = {};

  var targetDate = "Oct 31, 2017 08:30:00"; // Set the date we're counting down to

  countdown.init = function () {
    setupClock();
    //setupCloseClickHandler(); //Get the time
  };

  var preload = function preload() {
    var countDownCookie = JC.utils.getCookie("countdownclosed");
    if (!countDownCookie) {
      init();
    } else if (countDownCookie != "") {
      console.log("The cookie " + countDownCookie + " has been set.");
      document.querySelector('.countdown').hide();
    }
  };

  var setupClock = function setupClock() {
    var countDownDate = new Date(targetDate).getTime(); // Reading from the component
    var clock = setInterval(function () {
      var now = new Date().getTime();
      var distance = countDownDate - now;
      var days = Math.floor(distance / (1000 * 60 * 60 * 24));
      var hours = Math.floor(distance % (1000 * 60 * 60 * 24) / (1000 * 60 * 60));
      var minutes = Math.floor(distance % (1000 * 60 * 60) / (1000 * 60));
      var seconds = Math.floor(distance % (1000 * 60) / 1000);
      document.querySelector('.counter').innerHTML = units(days) + ":" + units(hours) + ":" + units(minutes) + ":" + units(seconds);
      if (distance < 0) {
        clearInterval(clock);
        document.querySelector('.counter').innerHTML = "NOW LIVE"; // End countdown and display message
      }
    }, 1000);
  };

  var units = function units(n) {
    return n > 9 ? "" + n : "0" + n;
  };

  var setupCloseClickHandler = function setupCloseClickHandler() {
    document.querySelector('.counter').addEventListener('click', function (e) {
      e.preventDefault();
      //document.querySelector('.countdown').slideUp();
      JC.utils.setCookie("countdownclosed", true, { expireDate: 3600 * 24 * 365 });
    });
  };

  //EVT.on('init', countdown.init)

  //init();
  //preload();
})(JC);

},{}],8:[function(require,module,exports){
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

},{"eventemitter2":1}],9:[function(require,module,exports){
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

//EVT.on('init', clickHandlers);

},{"./cookies":6,"./loadNames":11,"./utils":14}],10:[function(require,module,exports){
'use strict';

(function () {

  var answers = [];

  var messageDiv = document.querySelector('.message');
  var form = document.querySelector('.form'); // grab the form element

  // welcome messageDiv
  messageDiv.innerHTML = "What would you like you train today at the gym? Arms, Legs or Back?";

  var inputFunc = function inputFunc(e) {
    e.preventDefault();
    var inputValue = document.querySelector('[name=item]').value.toUpperCase(); // get value
    switch (inputValue) {
      case "ARMS":
        messageDiv.innerHTML = "So you want arms like Popeye eh? Are you ready to build those guns? (YES or NO)";
        var ready = document.querySelector('[name=item]').value.toUpperCase(); // get value
        console.log(ready + ' ' + "to rock");
        //var warmedUp =  document.querySelector('[name=item]').value.toUpperCase();
        /*if (ready === 'YES') {
          messageDiv.innerHTML = "Which way to the gun show!";
        } else {
          messageDiv.innerHTML = "But don't you want that peak tho?";
        }*/
        break;
      case "LEGS":
        messageDiv.innerHTML = "Wait a minute. We really should look in to the details";
        break;
      case "BACK":
        messageDiv.innerHTML = "go sit down then";
        break;
      default:
        messageDiv.innerHTML = "You're really undecided";
    }

    answers.push(inputValue); // add input value to array

    localStorage.setItem('answers', JSON.stringify(answers)); // save input to local storage
    localStorage.setItem(JC.utils.randomNumber(), inputValue);

    var answersObj = JSON.parse(localStorage.getItem('answers'));
    console.log(answersObj);

    form.reset();
  };

  form.addEventListener('submit', inputFunc);
})();

},{}],11:[function(require,module,exports){
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

},{}],12:[function(require,module,exports){
/*
function constructor(spec) {
  let
    {member} = spec,
    {other} = other_constructor(spec),
    method = function () {
      // member, other, method, spec
    };
  return Object.freeze({
    method,
    other
  });
}
*/

/*
function green() {
  let a;
  return function yellow() {
    let b;
        … a …
  … b …
  };
    … a …
}
*/
"use strict";

},{}],13:[function(require,module,exports){
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

},{"./utils":14,"./weirdCase":15}],14:[function(require,module,exports){
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

},{"./cookies":6}],15:[function(require,module,exports){
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

},{}]},{},[3])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvZXZlbnRlbWl0dGVyMi9saWIvZXZlbnRlbWl0dGVyMi5qcyIsIm5vZGVfbW9kdWxlcy9wcm9jZXNzL2Jyb3dzZXIuanMiLCJzcmMvYXBwLmpzIiwic3JjL2pzL21vZHVsZXMvY2FuSVVzZURhdGEuanMiLCJzcmMvanMvbW9kdWxlcy9jb25maWcuanMiLCJzcmMvanMvbW9kdWxlcy9jb29raWVzLmpzIiwic3JjL2pzL21vZHVsZXMvY291bnRkb3duLmpzIiwic3JjL2pzL21vZHVsZXMvZ2xvYmFsLmpzIiwic3JjL2pzL21vZHVsZXMvaGFuZGxlQ2xpY2tzLmpzIiwic3JjL2pzL21vZHVsZXMvaW5wdXQuanMiLCJzcmMvanMvbW9kdWxlcy9sb2FkTmFtZXMuanMiLCJzcmMvanMvbW9kdWxlcy9vYmpDb25zdHJ1Y3Rvci5qcyIsInNyYy9qcy9tb2R1bGVzL3JhbmRvbU5hbWVzLmpzIiwic3JjL2pzL21vZHVsZXMvdXRpbHMuanMiLCJzcmMvanMvbW9kdWxlcy93ZWlyZENhc2UuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7O0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7O0FDeHdCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7O0FDeExBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNB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LEVBQW9CO0FBQ2xCLFdBQU8sSUFBSSxXQUFKLEVBQVA7QUFDRDtBQUNELE1BQUksUUFBUSxDQUFSLElBQWEsQ0FBakIsRUFBb0I7QUFDbEIsV0FBTyxJQUFJLFdBQUosRUFBUDtBQUNEO0FBQ0Y7O0FBRUQsU0FBUyxZQUFULENBQXNCLE1BQXRCLEVBQThCO0FBQzVCLFNBQU8sT0FBTyxLQUFQLENBQWEsRUFBYixFQUFpQixHQUFqQixDQUFxQixRQUFyQixFQUErQixJQUEvQixDQUFvQyxFQUFwQyxDQUFQO0FBQ0Q7O0FBRU0sU0FBUyxXQUFULENBQXFCLElBQXJCLEVBQTBCO0FBQy9CLFNBQU8sS0FBSyxLQUFMLENBQVcsR0FBWCxFQUFnQixHQUFoQixDQUFvQixVQUFTLEdBQVQsRUFBYztBQUN2QyxXQUFPLGFBQWEsR0FBYixDQUFQO0FBQ0QsR0FGTSxFQUVKLElBRkksQ0FFQyxHQUZELENBQVA7QUFJRCIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCIvKiFcclxuICogRXZlbnRFbWl0dGVyMlxyXG4gKiBodHRwczovL2dpdGh1Yi5jb20vaGlqMW54L0V2ZW50RW1pdHRlcjJcclxuICpcclxuICogQ29weXJpZ2h0IChjKSAyMDEzIGhpajFueFxyXG4gKiBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIGxpY2Vuc2UuXHJcbiAqL1xyXG47IWZ1bmN0aW9uKHVuZGVmaW5lZCkge1xyXG5cclxuICB2YXIgaXNBcnJheSA9IEFycmF5LmlzQXJyYXkgPyBBcnJheS5pc0FycmF5IDogZnVuY3Rpb24gX2lzQXJyYXkob2JqKSB7XHJcbiAgICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKG9iaikgPT09IFwiW29iamVjdCBBcnJheV1cIjtcclxuICB9O1xyXG4gIHZhciBkZWZhdWx0TWF4TGlzdGVuZXJzID0gMTA7XHJcblxyXG4gIGZ1bmN0aW9uIGluaXQoKSB7XHJcbiAgICB0aGlzLl9ldmVudHMgPSB7fTtcclxuICAgIGlmICh0aGlzLl9jb25mKSB7XHJcbiAgICAgIGNvbmZpZ3VyZS5jYWxsKHRoaXMsIHRoaXMuX2NvbmYpO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gY29uZmlndXJlKGNvbmYpIHtcclxuICAgIGlmIChjb25mKSB7XHJcbiAgICAgIHRoaXMuX2NvbmYgPSBjb25mO1xyXG5cclxuICAgICAgY29uZi5kZWxpbWl0ZXIgJiYgKHRoaXMuZGVsaW1pdGVyID0gY29uZi5kZWxpbWl0ZXIpO1xyXG4gICAgICB0aGlzLl9tYXhMaXN0ZW5lcnMgPSBjb25mLm1heExpc3RlbmVycyAhPT0gdW5kZWZpbmVkID8gY29uZi5tYXhMaXN0ZW5lcnMgOiBkZWZhdWx0TWF4TGlzdGVuZXJzO1xyXG5cclxuICAgICAgY29uZi53aWxkY2FyZCAmJiAodGhpcy53aWxkY2FyZCA9IGNvbmYud2lsZGNhcmQpO1xyXG4gICAgICBjb25mLm5ld0xpc3RlbmVyICYmICh0aGlzLm5ld0xpc3RlbmVyID0gY29uZi5uZXdMaXN0ZW5lcik7XHJcbiAgICAgIGNvbmYudmVyYm9zZU1lbW9yeUxlYWsgJiYgKHRoaXMudmVyYm9zZU1lbW9yeUxlYWsgPSBjb25mLnZlcmJvc2VNZW1vcnlMZWFrKTtcclxuXHJcbiAgICAgIGlmICh0aGlzLndpbGRjYXJkKSB7XHJcbiAgICAgICAgdGhpcy5saXN0ZW5lclRyZWUgPSB7fTtcclxuICAgICAgfVxyXG4gICAgfSBlbHNlIHtcclxuICAgICAgdGhpcy5fbWF4TGlzdGVuZXJzID0gZGVmYXVsdE1heExpc3RlbmVycztcclxuICAgIH1cclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIGxvZ1Bvc3NpYmxlTWVtb3J5TGVhayhjb3VudCwgZXZlbnROYW1lKSB7XHJcbiAgICB2YXIgZXJyb3JNc2cgPSAnKG5vZGUpIHdhcm5pbmc6IHBvc3NpYmxlIEV2ZW50RW1pdHRlciBtZW1vcnkgJyArXHJcbiAgICAgICAgJ2xlYWsgZGV0ZWN0ZWQuICcgKyBjb3VudCArICcgbGlzdGVuZXJzIGFkZGVkLiAnICtcclxuICAgICAgICAnVXNlIGVtaXR0ZXIuc2V0TWF4TGlzdGVuZXJzKCkgdG8gaW5jcmVhc2UgbGltaXQuJztcclxuXHJcbiAgICBpZih0aGlzLnZlcmJvc2VNZW1vcnlMZWFrKXtcclxuICAgICAgZXJyb3JNc2cgKz0gJyBFdmVudCBuYW1lOiAnICsgZXZlbnROYW1lICsgJy4nO1xyXG4gICAgfVxyXG5cclxuICAgIGlmKHR5cGVvZiBwcm9jZXNzICE9PSAndW5kZWZpbmVkJyAmJiBwcm9jZXNzLmVtaXRXYXJuaW5nKXtcclxuICAgICAgdmFyIGUgPSBuZXcgRXJyb3IoZXJyb3JNc2cpO1xyXG4gICAgICBlLm5hbWUgPSAnTWF4TGlzdGVuZXJzRXhjZWVkZWRXYXJuaW5nJztcclxuICAgICAgZS5lbWl0dGVyID0gdGhpcztcclxuICAgICAgZS5jb3VudCA9IGNvdW50O1xyXG4gICAgICBwcm9jZXNzLmVtaXRXYXJuaW5nKGUpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgY29uc29sZS5lcnJvcihlcnJvck1zZyk7XHJcblxyXG4gICAgICBpZiAoY29uc29sZS50cmFjZSl7XHJcbiAgICAgICAgY29uc29sZS50cmFjZSgpO1xyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBFdmVudEVtaXR0ZXIoY29uZikge1xyXG4gICAgdGhpcy5fZXZlbnRzID0ge307XHJcbiAgICB0aGlzLm5ld0xpc3RlbmVyID0gZmFsc2U7XHJcbiAgICB0aGlzLnZlcmJvc2VNZW1vcnlMZWFrID0gZmFsc2U7XHJcbiAgICBjb25maWd1cmUuY2FsbCh0aGlzLCBjb25mKTtcclxuICB9XHJcbiAgRXZlbnRFbWl0dGVyLkV2ZW50RW1pdHRlcjIgPSBFdmVudEVtaXR0ZXI7IC8vIGJhY2t3YXJkcyBjb21wYXRpYmlsaXR5IGZvciBleHBvcnRpbmcgRXZlbnRFbWl0dGVyIHByb3BlcnR5XHJcblxyXG4gIC8vXHJcbiAgLy8gQXR0ZW50aW9uLCBmdW5jdGlvbiByZXR1cm4gdHlwZSBub3cgaXMgYXJyYXksIGFsd2F5cyAhXHJcbiAgLy8gSXQgaGFzIHplcm8gZWxlbWVudHMgaWYgbm8gYW55IG1hdGNoZXMgZm91bmQgYW5kIG9uZSBvciBtb3JlXHJcbiAgLy8gZWxlbWVudHMgKGxlYWZzKSBpZiB0aGVyZSBhcmUgbWF0Y2hlc1xyXG4gIC8vXHJcbiAgZnVuY3Rpb24gc2VhcmNoTGlzdGVuZXJUcmVlKGhhbmRsZXJzLCB0eXBlLCB0cmVlLCBpKSB7XHJcbiAgICBpZiAoIXRyZWUpIHtcclxuICAgICAgcmV0dXJuIFtdO1xyXG4gICAgfVxyXG4gICAgdmFyIGxpc3RlbmVycz1bXSwgbGVhZiwgbGVuLCBicmFuY2gsIHhUcmVlLCB4eFRyZWUsIGlzb2xhdGVkQnJhbmNoLCBlbmRSZWFjaGVkLFxyXG4gICAgICAgIHR5cGVMZW5ndGggPSB0eXBlLmxlbmd0aCwgY3VycmVudFR5cGUgPSB0eXBlW2ldLCBuZXh0VHlwZSA9IHR5cGVbaSsxXTtcclxuICAgIGlmIChpID09PSB0eXBlTGVuZ3RoICYmIHRyZWUuX2xpc3RlbmVycykge1xyXG4gICAgICAvL1xyXG4gICAgICAvLyBJZiBhdCB0aGUgZW5kIG9mIHRoZSBldmVudChzKSBsaXN0IGFuZCB0aGUgdHJlZSBoYXMgbGlzdGVuZXJzXHJcbiAgICAgIC8vIGludm9rZSB0aG9zZSBsaXN0ZW5lcnMuXHJcbiAgICAgIC8vXHJcbiAgICAgIGlmICh0eXBlb2YgdHJlZS5fbGlzdGVuZXJzID09PSAnZnVuY3Rpb24nKSB7XHJcbiAgICAgICAgaGFuZGxlcnMgJiYgaGFuZGxlcnMucHVzaCh0cmVlLl9saXN0ZW5lcnMpO1xyXG4gICAgICAgIHJldHVybiBbdHJlZV07XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgZm9yIChsZWFmID0gMCwgbGVuID0gdHJlZS5fbGlzdGVuZXJzLmxlbmd0aDsgbGVhZiA8IGxlbjsgbGVhZisrKSB7XHJcbiAgICAgICAgICBoYW5kbGVycyAmJiBoYW5kbGVycy5wdXNoKHRyZWUuX2xpc3RlbmVyc1tsZWFmXSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBbdHJlZV07XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBpZiAoKGN1cnJlbnRUeXBlID09PSAnKicgfHwgY3VycmVudFR5cGUgPT09ICcqKicpIHx8IHRyZWVbY3VycmVudFR5cGVdKSB7XHJcbiAgICAgIC8vXHJcbiAgICAgIC8vIElmIHRoZSBldmVudCBlbWl0dGVkIGlzICcqJyBhdCB0aGlzIHBhcnRcclxuICAgICAgLy8gb3IgdGhlcmUgaXMgYSBjb25jcmV0ZSBtYXRjaCBhdCB0aGlzIHBhdGNoXHJcbiAgICAgIC8vXHJcbiAgICAgIGlmIChjdXJyZW50VHlwZSA9PT0gJyonKSB7XHJcbiAgICAgICAgZm9yIChicmFuY2ggaW4gdHJlZSkge1xyXG4gICAgICAgICAgaWYgKGJyYW5jaCAhPT0gJ19saXN0ZW5lcnMnICYmIHRyZWUuaGFzT3duUHJvcGVydHkoYnJhbmNoKSkge1xyXG4gICAgICAgICAgICBsaXN0ZW5lcnMgPSBsaXN0ZW5lcnMuY29uY2F0KHNlYXJjaExpc3RlbmVyVHJlZShoYW5kbGVycywgdHlwZSwgdHJlZVticmFuY2hdLCBpKzEpKTtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIGxpc3RlbmVycztcclxuICAgICAgfSBlbHNlIGlmKGN1cnJlbnRUeXBlID09PSAnKionKSB7XHJcbiAgICAgICAgZW5kUmVhY2hlZCA9IChpKzEgPT09IHR5cGVMZW5ndGggfHwgKGkrMiA9PT0gdHlwZUxlbmd0aCAmJiBuZXh0VHlwZSA9PT0gJyonKSk7XHJcbiAgICAgICAgaWYoZW5kUmVhY2hlZCAmJiB0cmVlLl9saXN0ZW5lcnMpIHtcclxuICAgICAgICAgIC8vIFRoZSBuZXh0IGVsZW1lbnQgaGFzIGEgX2xpc3RlbmVycywgYWRkIGl0IHRvIHRoZSBoYW5kbGVycy5cclxuICAgICAgICAgIGxpc3RlbmVycyA9IGxpc3RlbmVycy5jb25jYXQoc2VhcmNoTGlzdGVuZXJUcmVlKGhhbmRsZXJzLCB0eXBlLCB0cmVlLCB0eXBlTGVuZ3RoKSk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBmb3IgKGJyYW5jaCBpbiB0cmVlKSB7XHJcbiAgICAgICAgICBpZiAoYnJhbmNoICE9PSAnX2xpc3RlbmVycycgJiYgdHJlZS5oYXNPd25Qcm9wZXJ0eShicmFuY2gpKSB7XHJcbiAgICAgICAgICAgIGlmKGJyYW5jaCA9PT0gJyonIHx8IGJyYW5jaCA9PT0gJyoqJykge1xyXG4gICAgICAgICAgICAgIGlmKHRyZWVbYnJhbmNoXS5fbGlzdGVuZXJzICYmICFlbmRSZWFjaGVkKSB7XHJcbiAgICAgICAgICAgICAgICBsaXN0ZW5lcnMgPSBsaXN0ZW5lcnMuY29uY2F0KHNlYXJjaExpc3RlbmVyVHJlZShoYW5kbGVycywgdHlwZSwgdHJlZVticmFuY2hdLCB0eXBlTGVuZ3RoKSk7XHJcbiAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgIGxpc3RlbmVycyA9IGxpc3RlbmVycy5jb25jYXQoc2VhcmNoTGlzdGVuZXJUcmVlKGhhbmRsZXJzLCB0eXBlLCB0cmVlW2JyYW5jaF0sIGkpKTtcclxuICAgICAgICAgICAgfSBlbHNlIGlmKGJyYW5jaCA9PT0gbmV4dFR5cGUpIHtcclxuICAgICAgICAgICAgICBsaXN0ZW5lcnMgPSBsaXN0ZW5lcnMuY29uY2F0KHNlYXJjaExpc3RlbmVyVHJlZShoYW5kbGVycywgdHlwZSwgdHJlZVticmFuY2hdLCBpKzIpKTtcclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAvLyBObyBtYXRjaCBvbiB0aGlzIG9uZSwgc2hpZnQgaW50byB0aGUgdHJlZSBidXQgbm90IGluIHRoZSB0eXBlIGFycmF5LlxyXG4gICAgICAgICAgICAgIGxpc3RlbmVycyA9IGxpc3RlbmVycy5jb25jYXQoc2VhcmNoTGlzdGVuZXJUcmVlKGhhbmRsZXJzLCB0eXBlLCB0cmVlW2JyYW5jaF0sIGkpKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gbGlzdGVuZXJzO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBsaXN0ZW5lcnMgPSBsaXN0ZW5lcnMuY29uY2F0KHNlYXJjaExpc3RlbmVyVHJlZShoYW5kbGVycywgdHlwZSwgdHJlZVtjdXJyZW50VHlwZV0sIGkrMSkpO1xyXG4gICAgfVxyXG5cclxuICAgIHhUcmVlID0gdHJlZVsnKiddO1xyXG4gICAgaWYgKHhUcmVlKSB7XHJcbiAgICAgIC8vXHJcbiAgICAgIC8vIElmIHRoZSBsaXN0ZW5lciB0cmVlIHdpbGwgYWxsb3cgYW55IG1hdGNoIGZvciB0aGlzIHBhcnQsXHJcbiAgICAgIC8vIHRoZW4gcmVjdXJzaXZlbHkgZXhwbG9yZSBhbGwgYnJhbmNoZXMgb2YgdGhlIHRyZWVcclxuICAgICAgLy9cclxuICAgICAgc2VhcmNoTGlzdGVuZXJUcmVlKGhhbmRsZXJzLCB0eXBlLCB4VHJlZSwgaSsxKTtcclxuICAgIH1cclxuXHJcbiAgICB4eFRyZWUgPSB0cmVlWycqKiddO1xyXG4gICAgaWYoeHhUcmVlKSB7XHJcbiAgICAgIGlmKGkgPCB0eXBlTGVuZ3RoKSB7XHJcbiAgICAgICAgaWYoeHhUcmVlLl9saXN0ZW5lcnMpIHtcclxuICAgICAgICAgIC8vIElmIHdlIGhhdmUgYSBsaXN0ZW5lciBvbiBhICcqKicsIGl0IHdpbGwgY2F0Y2ggYWxsLCBzbyBhZGQgaXRzIGhhbmRsZXIuXHJcbiAgICAgICAgICBzZWFyY2hMaXN0ZW5lclRyZWUoaGFuZGxlcnMsIHR5cGUsIHh4VHJlZSwgdHlwZUxlbmd0aCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBCdWlsZCBhcnJheXMgb2YgbWF0Y2hpbmcgbmV4dCBicmFuY2hlcyBhbmQgb3RoZXJzLlxyXG4gICAgICAgIGZvcihicmFuY2ggaW4geHhUcmVlKSB7XHJcbiAgICAgICAgICBpZihicmFuY2ggIT09ICdfbGlzdGVuZXJzJyAmJiB4eFRyZWUuaGFzT3duUHJvcGVydHkoYnJhbmNoKSkge1xyXG4gICAgICAgICAgICBpZihicmFuY2ggPT09IG5leHRUeXBlKSB7XHJcbiAgICAgICAgICAgICAgLy8gV2Uga25vdyB0aGUgbmV4dCBlbGVtZW50IHdpbGwgbWF0Y2gsIHNvIGp1bXAgdHdpY2UuXHJcbiAgICAgICAgICAgICAgc2VhcmNoTGlzdGVuZXJUcmVlKGhhbmRsZXJzLCB0eXBlLCB4eFRyZWVbYnJhbmNoXSwgaSsyKTtcclxuICAgICAgICAgICAgfSBlbHNlIGlmKGJyYW5jaCA9PT0gY3VycmVudFR5cGUpIHtcclxuICAgICAgICAgICAgICAvLyBDdXJyZW50IG5vZGUgbWF0Y2hlcywgbW92ZSBpbnRvIHRoZSB0cmVlLlxyXG4gICAgICAgICAgICAgIHNlYXJjaExpc3RlbmVyVHJlZShoYW5kbGVycywgdHlwZSwgeHhUcmVlW2JyYW5jaF0sIGkrMSk7XHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgaXNvbGF0ZWRCcmFuY2ggPSB7fTtcclxuICAgICAgICAgICAgICBpc29sYXRlZEJyYW5jaFticmFuY2hdID0geHhUcmVlW2JyYW5jaF07XHJcbiAgICAgICAgICAgICAgc2VhcmNoTGlzdGVuZXJUcmVlKGhhbmRsZXJzLCB0eXBlLCB7ICcqKic6IGlzb2xhdGVkQnJhbmNoIH0sIGkrMSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgIH0gZWxzZSBpZih4eFRyZWUuX2xpc3RlbmVycykge1xyXG4gICAgICAgIC8vIFdlIGhhdmUgcmVhY2hlZCB0aGUgZW5kIGFuZCBzdGlsbCBvbiBhICcqKidcclxuICAgICAgICBzZWFyY2hMaXN0ZW5lclRyZWUoaGFuZGxlcnMsIHR5cGUsIHh4VHJlZSwgdHlwZUxlbmd0aCk7XHJcbiAgICAgIH0gZWxzZSBpZih4eFRyZWVbJyonXSAmJiB4eFRyZWVbJyonXS5fbGlzdGVuZXJzKSB7XHJcbiAgICAgICAgc2VhcmNoTGlzdGVuZXJUcmVlKGhhbmRsZXJzLCB0eXBlLCB4eFRyZWVbJyonXSwgdHlwZUxlbmd0aCk7XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gbGlzdGVuZXJzO1xyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gZ3Jvd0xpc3RlbmVyVHJlZSh0eXBlLCBsaXN0ZW5lcikge1xyXG5cclxuICAgIHR5cGUgPSB0eXBlb2YgdHlwZSA9PT0gJ3N0cmluZycgPyB0eXBlLnNwbGl0KHRoaXMuZGVsaW1pdGVyKSA6IHR5cGUuc2xpY2UoKTtcclxuXHJcbiAgICAvL1xyXG4gICAgLy8gTG9va3MgZm9yIHR3byBjb25zZWN1dGl2ZSAnKionLCBpZiBzbywgZG9uJ3QgYWRkIHRoZSBldmVudCBhdCBhbGwuXHJcbiAgICAvL1xyXG4gICAgZm9yKHZhciBpID0gMCwgbGVuID0gdHlwZS5sZW5ndGg7IGkrMSA8IGxlbjsgaSsrKSB7XHJcbiAgICAgIGlmKHR5cGVbaV0gPT09ICcqKicgJiYgdHlwZVtpKzFdID09PSAnKionKSB7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgdmFyIHRyZWUgPSB0aGlzLmxpc3RlbmVyVHJlZTtcclxuICAgIHZhciBuYW1lID0gdHlwZS5zaGlmdCgpO1xyXG5cclxuICAgIHdoaWxlIChuYW1lICE9PSB1bmRlZmluZWQpIHtcclxuXHJcbiAgICAgIGlmICghdHJlZVtuYW1lXSkge1xyXG4gICAgICAgIHRyZWVbbmFtZV0gPSB7fTtcclxuICAgICAgfVxyXG5cclxuICAgICAgdHJlZSA9IHRyZWVbbmFtZV07XHJcblxyXG4gICAgICBpZiAodHlwZS5sZW5ndGggPT09IDApIHtcclxuXHJcbiAgICAgICAgaWYgKCF0cmVlLl9saXN0ZW5lcnMpIHtcclxuICAgICAgICAgIHRyZWUuX2xpc3RlbmVycyA9IGxpc3RlbmVyO1xyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNlIHtcclxuICAgICAgICAgIGlmICh0eXBlb2YgdHJlZS5fbGlzdGVuZXJzID09PSAnZnVuY3Rpb24nKSB7XHJcbiAgICAgICAgICAgIHRyZWUuX2xpc3RlbmVycyA9IFt0cmVlLl9saXN0ZW5lcnNdO1xyXG4gICAgICAgICAgfVxyXG5cclxuICAgICAgICAgIHRyZWUuX2xpc3RlbmVycy5wdXNoKGxpc3RlbmVyKTtcclxuXHJcbiAgICAgICAgICBpZiAoXHJcbiAgICAgICAgICAgICF0cmVlLl9saXN0ZW5lcnMud2FybmVkICYmXHJcbiAgICAgICAgICAgIHRoaXMuX21heExpc3RlbmVycyA+IDAgJiZcclxuICAgICAgICAgICAgdHJlZS5fbGlzdGVuZXJzLmxlbmd0aCA+IHRoaXMuX21heExpc3RlbmVyc1xyXG4gICAgICAgICAgKSB7XHJcbiAgICAgICAgICAgIHRyZWUuX2xpc3RlbmVycy53YXJuZWQgPSB0cnVlO1xyXG4gICAgICAgICAgICBsb2dQb3NzaWJsZU1lbW9yeUxlYWsuY2FsbCh0aGlzLCB0cmVlLl9saXN0ZW5lcnMubGVuZ3RoLCBuYW1lKTtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgIH1cclxuICAgICAgbmFtZSA9IHR5cGUuc2hpZnQoKTtcclxuICAgIH1cclxuICAgIHJldHVybiB0cnVlO1xyXG4gIH1cclxuXHJcbiAgLy8gQnkgZGVmYXVsdCBFdmVudEVtaXR0ZXJzIHdpbGwgcHJpbnQgYSB3YXJuaW5nIGlmIG1vcmUgdGhhblxyXG4gIC8vIDEwIGxpc3RlbmVycyBhcmUgYWRkZWQgdG8gaXQuIFRoaXMgaXMgYSB1c2VmdWwgZGVmYXVsdCB3aGljaFxyXG4gIC8vIGhlbHBzIGZpbmRpbmcgbWVtb3J5IGxlYWtzLlxyXG4gIC8vXHJcbiAgLy8gT2J2aW91c2x5IG5vdCBhbGwgRW1pdHRlcnMgc2hvdWxkIGJlIGxpbWl0ZWQgdG8gMTAuIFRoaXMgZnVuY3Rpb24gYWxsb3dzXHJcbiAgLy8gdGhhdCB0byBiZSBpbmNyZWFzZWQuIFNldCB0byB6ZXJvIGZvciB1bmxpbWl0ZWQuXHJcblxyXG4gIEV2ZW50RW1pdHRlci5wcm90b3R5cGUuZGVsaW1pdGVyID0gJy4nO1xyXG5cclxuICBFdmVudEVtaXR0ZXIucHJvdG90eXBlLnNldE1heExpc3RlbmVycyA9IGZ1bmN0aW9uKG4pIHtcclxuICAgIGlmIChuICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgdGhpcy5fbWF4TGlzdGVuZXJzID0gbjtcclxuICAgICAgaWYgKCF0aGlzLl9jb25mKSB0aGlzLl9jb25mID0ge307XHJcbiAgICAgIHRoaXMuX2NvbmYubWF4TGlzdGVuZXJzID0gbjtcclxuICAgIH1cclxuICB9O1xyXG5cclxuICBFdmVudEVtaXR0ZXIucHJvdG90eXBlLmV2ZW50ID0gJyc7XHJcblxyXG5cclxuICBFdmVudEVtaXR0ZXIucHJvdG90eXBlLm9uY2UgPSBmdW5jdGlvbihldmVudCwgZm4pIHtcclxuICAgIHJldHVybiB0aGlzLl9vbmNlKGV2ZW50LCBmbiwgZmFsc2UpO1xyXG4gIH07XHJcblxyXG4gIEV2ZW50RW1pdHRlci5wcm90b3R5cGUucHJlcGVuZE9uY2VMaXN0ZW5lciA9IGZ1bmN0aW9uKGV2ZW50LCBmbikge1xyXG4gICAgcmV0dXJuIHRoaXMuX29uY2UoZXZlbnQsIGZuLCB0cnVlKTtcclxuICB9O1xyXG5cclxuICBFdmVudEVtaXR0ZXIucHJvdG90eXBlLl9vbmNlID0gZnVuY3Rpb24oZXZlbnQsIGZuLCBwcmVwZW5kKSB7XHJcbiAgICB0aGlzLl9tYW55KGV2ZW50LCAxLCBmbiwgcHJlcGVuZCk7XHJcbiAgICByZXR1cm4gdGhpcztcclxuICB9O1xyXG5cclxuICBFdmVudEVtaXR0ZXIucHJvdG90eXBlLm1hbnkgPSBmdW5jdGlvbihldmVudCwgdHRsLCBmbikge1xyXG4gICAgcmV0dXJuIHRoaXMuX21hbnkoZXZlbnQsIHR0bCwgZm4sIGZhbHNlKTtcclxuICB9XHJcblxyXG4gIEV2ZW50RW1pdHRlci5wcm90b3R5cGUucHJlcGVuZE1hbnkgPSBmdW5jdGlvbihldmVudCwgdHRsLCBmbikge1xyXG4gICAgcmV0dXJuIHRoaXMuX21hbnkoZXZlbnQsIHR0bCwgZm4sIHRydWUpO1xyXG4gIH1cclxuXHJcbiAgRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5fbWFueSA9IGZ1bmN0aW9uKGV2ZW50LCB0dGwsIGZuLCBwcmVwZW5kKSB7XHJcbiAgICB2YXIgc2VsZiA9IHRoaXM7XHJcblxyXG4gICAgaWYgKHR5cGVvZiBmbiAhPT0gJ2Z1bmN0aW9uJykge1xyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ21hbnkgb25seSBhY2NlcHRzIGluc3RhbmNlcyBvZiBGdW5jdGlvbicpO1xyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIGxpc3RlbmVyKCkge1xyXG4gICAgICBpZiAoLS10dGwgPT09IDApIHtcclxuICAgICAgICBzZWxmLm9mZihldmVudCwgbGlzdGVuZXIpO1xyXG4gICAgICB9XHJcbiAgICAgIHJldHVybiBmbi5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xyXG4gICAgfVxyXG5cclxuICAgIGxpc3RlbmVyLl9vcmlnaW4gPSBmbjtcclxuXHJcbiAgICB0aGlzLl9vbihldmVudCwgbGlzdGVuZXIsIHByZXBlbmQpO1xyXG5cclxuICAgIHJldHVybiBzZWxmO1xyXG4gIH07XHJcblxyXG4gIEV2ZW50RW1pdHRlci5wcm90b3R5cGUuZW1pdCA9IGZ1bmN0aW9uKCkge1xyXG5cclxuICAgIHRoaXMuX2V2ZW50cyB8fCBpbml0LmNhbGwodGhpcyk7XHJcblxyXG4gICAgdmFyIHR5cGUgPSBhcmd1bWVudHNbMF07XHJcblxyXG4gICAgaWYgKHR5cGUgPT09ICduZXdMaXN0ZW5lcicgJiYgIXRoaXMubmV3TGlzdGVuZXIpIHtcclxuICAgICAgaWYgKCF0aGlzLl9ldmVudHMubmV3TGlzdGVuZXIpIHtcclxuICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICB2YXIgYWwgPSBhcmd1bWVudHMubGVuZ3RoO1xyXG4gICAgdmFyIGFyZ3MsbCxpLGo7XHJcbiAgICB2YXIgaGFuZGxlcjtcclxuXHJcbiAgICBpZiAodGhpcy5fYWxsICYmIHRoaXMuX2FsbC5sZW5ndGgpIHtcclxuICAgICAgaGFuZGxlciA9IHRoaXMuX2FsbC5zbGljZSgpO1xyXG4gICAgICBpZiAoYWwgPiAzKSB7XHJcbiAgICAgICAgYXJncyA9IG5ldyBBcnJheShhbCk7XHJcbiAgICAgICAgZm9yIChqID0gMDsgaiA8IGFsOyBqKyspIGFyZ3Nbal0gPSBhcmd1bWVudHNbal07XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGZvciAoaSA9IDAsIGwgPSBoYW5kbGVyLmxlbmd0aDsgaSA8IGw7IGkrKykge1xyXG4gICAgICAgIHRoaXMuZXZlbnQgPSB0eXBlO1xyXG4gICAgICAgIHN3aXRjaCAoYWwpIHtcclxuICAgICAgICBjYXNlIDE6XHJcbiAgICAgICAgICBoYW5kbGVyW2ldLmNhbGwodGhpcywgdHlwZSk7XHJcbiAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIDI6XHJcbiAgICAgICAgICBoYW5kbGVyW2ldLmNhbGwodGhpcywgdHlwZSwgYXJndW1lbnRzWzFdKTtcclxuICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgMzpcclxuICAgICAgICAgIGhhbmRsZXJbaV0uY2FsbCh0aGlzLCB0eXBlLCBhcmd1bWVudHNbMV0sIGFyZ3VtZW50c1syXSk7XHJcbiAgICAgICAgICBicmVhaztcclxuICAgICAgICBkZWZhdWx0OlxyXG4gICAgICAgICAgaGFuZGxlcltpXS5hcHBseSh0aGlzLCBhcmdzKTtcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBpZiAodGhpcy53aWxkY2FyZCkge1xyXG4gICAgICBoYW5kbGVyID0gW107XHJcbiAgICAgIHZhciBucyA9IHR5cGVvZiB0eXBlID09PSAnc3RyaW5nJyA/IHR5cGUuc3BsaXQodGhpcy5kZWxpbWl0ZXIpIDogdHlwZS5zbGljZSgpO1xyXG4gICAgICBzZWFyY2hMaXN0ZW5lclRyZWUuY2FsbCh0aGlzLCBoYW5kbGVyLCBucywgdGhpcy5saXN0ZW5lclRyZWUsIDApO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgaGFuZGxlciA9IHRoaXMuX2V2ZW50c1t0eXBlXTtcclxuICAgICAgaWYgKHR5cGVvZiBoYW5kbGVyID09PSAnZnVuY3Rpb24nKSB7XHJcbiAgICAgICAgdGhpcy5ldmVudCA9IHR5cGU7XHJcbiAgICAgICAgc3dpdGNoIChhbCkge1xyXG4gICAgICAgIGNhc2UgMTpcclxuICAgICAgICAgIGhhbmRsZXIuY2FsbCh0aGlzKTtcclxuICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgMjpcclxuICAgICAgICAgIGhhbmRsZXIuY2FsbCh0aGlzLCBhcmd1bWVudHNbMV0pO1xyXG4gICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSAzOlxyXG4gICAgICAgICAgaGFuZGxlci5jYWxsKHRoaXMsIGFyZ3VtZW50c1sxXSwgYXJndW1lbnRzWzJdKTtcclxuICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgICBhcmdzID0gbmV3IEFycmF5KGFsIC0gMSk7XHJcbiAgICAgICAgICBmb3IgKGogPSAxOyBqIDwgYWw7IGorKykgYXJnc1tqIC0gMV0gPSBhcmd1bWVudHNbal07XHJcbiAgICAgICAgICBoYW5kbGVyLmFwcGx5KHRoaXMsIGFyZ3MpO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgfSBlbHNlIGlmIChoYW5kbGVyKSB7XHJcbiAgICAgICAgLy8gbmVlZCB0byBtYWtlIGNvcHkgb2YgaGFuZGxlcnMgYmVjYXVzZSBsaXN0IGNhbiBjaGFuZ2UgaW4gdGhlIG1pZGRsZVxyXG4gICAgICAgIC8vIG9mIGVtaXQgY2FsbFxyXG4gICAgICAgIGhhbmRsZXIgPSBoYW5kbGVyLnNsaWNlKCk7XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBpZiAoaGFuZGxlciAmJiBoYW5kbGVyLmxlbmd0aCkge1xyXG4gICAgICBpZiAoYWwgPiAzKSB7XHJcbiAgICAgICAgYXJncyA9IG5ldyBBcnJheShhbCAtIDEpO1xyXG4gICAgICAgIGZvciAoaiA9IDE7IGogPCBhbDsgaisrKSBhcmdzW2ogLSAxXSA9IGFyZ3VtZW50c1tqXTtcclxuICAgICAgfVxyXG4gICAgICBmb3IgKGkgPSAwLCBsID0gaGFuZGxlci5sZW5ndGg7IGkgPCBsOyBpKyspIHtcclxuICAgICAgICB0aGlzLmV2ZW50ID0gdHlwZTtcclxuICAgICAgICBzd2l0Y2ggKGFsKSB7XHJcbiAgICAgICAgY2FzZSAxOlxyXG4gICAgICAgICAgaGFuZGxlcltpXS5jYWxsKHRoaXMpO1xyXG4gICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSAyOlxyXG4gICAgICAgICAgaGFuZGxlcltpXS5jYWxsKHRoaXMsIGFyZ3VtZW50c1sxXSk7XHJcbiAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIDM6XHJcbiAgICAgICAgICBoYW5kbGVyW2ldLmNhbGwodGhpcywgYXJndW1lbnRzWzFdLCBhcmd1bWVudHNbMl0pO1xyXG4gICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgIGhhbmRsZXJbaV0uYXBwbHkodGhpcywgYXJncyk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgfSBlbHNlIGlmICghdGhpcy5fYWxsICYmIHR5cGUgPT09ICdlcnJvcicpIHtcclxuICAgICAgaWYgKGFyZ3VtZW50c1sxXSBpbnN0YW5jZW9mIEVycm9yKSB7XHJcbiAgICAgICAgdGhyb3cgYXJndW1lbnRzWzFdOyAvLyBVbmhhbmRsZWQgJ2Vycm9yJyBldmVudFxyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIlVuY2F1Z2h0LCB1bnNwZWNpZmllZCAnZXJyb3InIGV2ZW50LlwiKTtcclxuICAgICAgfVxyXG4gICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuICEhdGhpcy5fYWxsO1xyXG4gIH07XHJcblxyXG4gIEV2ZW50RW1pdHRlci5wcm90b3R5cGUuZW1pdEFzeW5jID0gZnVuY3Rpb24oKSB7XHJcblxyXG4gICAgdGhpcy5fZXZlbnRzIHx8IGluaXQuY2FsbCh0aGlzKTtcclxuXHJcbiAgICB2YXIgdHlwZSA9IGFyZ3VtZW50c1swXTtcclxuXHJcbiAgICBpZiAodHlwZSA9PT0gJ25ld0xpc3RlbmVyJyAmJiAhdGhpcy5uZXdMaXN0ZW5lcikge1xyXG4gICAgICAgIGlmICghdGhpcy5fZXZlbnRzLm5ld0xpc3RlbmVyKSB7IHJldHVybiBQcm9taXNlLnJlc29sdmUoW2ZhbHNlXSk7IH1cclxuICAgIH1cclxuXHJcbiAgICB2YXIgcHJvbWlzZXM9IFtdO1xyXG5cclxuICAgIHZhciBhbCA9IGFyZ3VtZW50cy5sZW5ndGg7XHJcbiAgICB2YXIgYXJncyxsLGksajtcclxuICAgIHZhciBoYW5kbGVyO1xyXG5cclxuICAgIGlmICh0aGlzLl9hbGwpIHtcclxuICAgICAgaWYgKGFsID4gMykge1xyXG4gICAgICAgIGFyZ3MgPSBuZXcgQXJyYXkoYWwpO1xyXG4gICAgICAgIGZvciAoaiA9IDE7IGogPCBhbDsgaisrKSBhcmdzW2pdID0gYXJndW1lbnRzW2pdO1xyXG4gICAgICB9XHJcbiAgICAgIGZvciAoaSA9IDAsIGwgPSB0aGlzLl9hbGwubGVuZ3RoOyBpIDwgbDsgaSsrKSB7XHJcbiAgICAgICAgdGhpcy5ldmVudCA9IHR5cGU7XHJcbiAgICAgICAgc3dpdGNoIChhbCkge1xyXG4gICAgICAgIGNhc2UgMTpcclxuICAgICAgICAgIHByb21pc2VzLnB1c2godGhpcy5fYWxsW2ldLmNhbGwodGhpcywgdHlwZSkpO1xyXG4gICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSAyOlxyXG4gICAgICAgICAgcHJvbWlzZXMucHVzaCh0aGlzLl9hbGxbaV0uY2FsbCh0aGlzLCB0eXBlLCBhcmd1bWVudHNbMV0pKTtcclxuICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgMzpcclxuICAgICAgICAgIHByb21pc2VzLnB1c2godGhpcy5fYWxsW2ldLmNhbGwodGhpcywgdHlwZSwgYXJndW1lbnRzWzFdLCBhcmd1bWVudHNbMl0pKTtcclxuICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgICBwcm9taXNlcy5wdXNoKHRoaXMuX2FsbFtpXS5hcHBseSh0aGlzLCBhcmdzKSk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKHRoaXMud2lsZGNhcmQpIHtcclxuICAgICAgaGFuZGxlciA9IFtdO1xyXG4gICAgICB2YXIgbnMgPSB0eXBlb2YgdHlwZSA9PT0gJ3N0cmluZycgPyB0eXBlLnNwbGl0KHRoaXMuZGVsaW1pdGVyKSA6IHR5cGUuc2xpY2UoKTtcclxuICAgICAgc2VhcmNoTGlzdGVuZXJUcmVlLmNhbGwodGhpcywgaGFuZGxlciwgbnMsIHRoaXMubGlzdGVuZXJUcmVlLCAwKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIGhhbmRsZXIgPSB0aGlzLl9ldmVudHNbdHlwZV07XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKHR5cGVvZiBoYW5kbGVyID09PSAnZnVuY3Rpb24nKSB7XHJcbiAgICAgIHRoaXMuZXZlbnQgPSB0eXBlO1xyXG4gICAgICBzd2l0Y2ggKGFsKSB7XHJcbiAgICAgIGNhc2UgMTpcclxuICAgICAgICBwcm9taXNlcy5wdXNoKGhhbmRsZXIuY2FsbCh0aGlzKSk7XHJcbiAgICAgICAgYnJlYWs7XHJcbiAgICAgIGNhc2UgMjpcclxuICAgICAgICBwcm9taXNlcy5wdXNoKGhhbmRsZXIuY2FsbCh0aGlzLCBhcmd1bWVudHNbMV0pKTtcclxuICAgICAgICBicmVhaztcclxuICAgICAgY2FzZSAzOlxyXG4gICAgICAgIHByb21pc2VzLnB1c2goaGFuZGxlci5jYWxsKHRoaXMsIGFyZ3VtZW50c1sxXSwgYXJndW1lbnRzWzJdKSk7XHJcbiAgICAgICAgYnJlYWs7XHJcbiAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgYXJncyA9IG5ldyBBcnJheShhbCAtIDEpO1xyXG4gICAgICAgIGZvciAoaiA9IDE7IGogPCBhbDsgaisrKSBhcmdzW2ogLSAxXSA9IGFyZ3VtZW50c1tqXTtcclxuICAgICAgICBwcm9taXNlcy5wdXNoKGhhbmRsZXIuYXBwbHkodGhpcywgYXJncykpO1xyXG4gICAgICB9XHJcbiAgICB9IGVsc2UgaWYgKGhhbmRsZXIgJiYgaGFuZGxlci5sZW5ndGgpIHtcclxuICAgICAgaGFuZGxlciA9IGhhbmRsZXIuc2xpY2UoKTtcclxuICAgICAgaWYgKGFsID4gMykge1xyXG4gICAgICAgIGFyZ3MgPSBuZXcgQXJyYXkoYWwgLSAxKTtcclxuICAgICAgICBmb3IgKGogPSAxOyBqIDwgYWw7IGorKykgYXJnc1tqIC0gMV0gPSBhcmd1bWVudHNbal07XHJcbiAgICAgIH1cclxuICAgICAgZm9yIChpID0gMCwgbCA9IGhhbmRsZXIubGVuZ3RoOyBpIDwgbDsgaSsrKSB7XHJcbiAgICAgICAgdGhpcy5ldmVudCA9IHR5cGU7XHJcbiAgICAgICAgc3dpdGNoIChhbCkge1xyXG4gICAgICAgIGNhc2UgMTpcclxuICAgICAgICAgIHByb21pc2VzLnB1c2goaGFuZGxlcltpXS5jYWxsKHRoaXMpKTtcclxuICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgMjpcclxuICAgICAgICAgIHByb21pc2VzLnB1c2goaGFuZGxlcltpXS5jYWxsKHRoaXMsIGFyZ3VtZW50c1sxXSkpO1xyXG4gICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSAzOlxyXG4gICAgICAgICAgcHJvbWlzZXMucHVzaChoYW5kbGVyW2ldLmNhbGwodGhpcywgYXJndW1lbnRzWzFdLCBhcmd1bWVudHNbMl0pKTtcclxuICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgICBwcm9taXNlcy5wdXNoKGhhbmRsZXJbaV0uYXBwbHkodGhpcywgYXJncykpO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgfSBlbHNlIGlmICghdGhpcy5fYWxsICYmIHR5cGUgPT09ICdlcnJvcicpIHtcclxuICAgICAgaWYgKGFyZ3VtZW50c1sxXSBpbnN0YW5jZW9mIEVycm9yKSB7XHJcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KGFyZ3VtZW50c1sxXSk7IC8vIFVuaGFuZGxlZCAnZXJyb3InIGV2ZW50XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KFwiVW5jYXVnaHQsIHVuc3BlY2lmaWVkICdlcnJvcicgZXZlbnQuXCIpO1xyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIFByb21pc2UuYWxsKHByb21pc2VzKTtcclxuICB9O1xyXG5cclxuICBFdmVudEVtaXR0ZXIucHJvdG90eXBlLm9uID0gZnVuY3Rpb24odHlwZSwgbGlzdGVuZXIpIHtcclxuICAgIHJldHVybiB0aGlzLl9vbih0eXBlLCBsaXN0ZW5lciwgZmFsc2UpO1xyXG4gIH07XHJcblxyXG4gIEV2ZW50RW1pdHRlci5wcm90b3R5cGUucHJlcGVuZExpc3RlbmVyID0gZnVuY3Rpb24odHlwZSwgbGlzdGVuZXIpIHtcclxuICAgIHJldHVybiB0aGlzLl9vbih0eXBlLCBsaXN0ZW5lciwgdHJ1ZSk7XHJcbiAgfTtcclxuXHJcbiAgRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5vbkFueSA9IGZ1bmN0aW9uKGZuKSB7XHJcbiAgICByZXR1cm4gdGhpcy5fb25BbnkoZm4sIGZhbHNlKTtcclxuICB9O1xyXG5cclxuICBFdmVudEVtaXR0ZXIucHJvdG90eXBlLnByZXBlbmRBbnkgPSBmdW5jdGlvbihmbikge1xyXG4gICAgcmV0dXJuIHRoaXMuX29uQW55KGZuLCB0cnVlKTtcclxuICB9O1xyXG5cclxuICBFdmVudEVtaXR0ZXIucHJvdG90eXBlLmFkZExpc3RlbmVyID0gRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5vbjtcclxuXHJcbiAgRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5fb25BbnkgPSBmdW5jdGlvbihmbiwgcHJlcGVuZCl7XHJcbiAgICBpZiAodHlwZW9mIGZuICE9PSAnZnVuY3Rpb24nKSB7XHJcbiAgICAgIHRocm93IG5ldyBFcnJvcignb25Bbnkgb25seSBhY2NlcHRzIGluc3RhbmNlcyBvZiBGdW5jdGlvbicpO1xyXG4gICAgfVxyXG5cclxuICAgIGlmICghdGhpcy5fYWxsKSB7XHJcbiAgICAgIHRoaXMuX2FsbCA9IFtdO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIEFkZCB0aGUgZnVuY3Rpb24gdG8gdGhlIGV2ZW50IGxpc3RlbmVyIGNvbGxlY3Rpb24uXHJcbiAgICBpZihwcmVwZW5kKXtcclxuICAgICAgdGhpcy5fYWxsLnVuc2hpZnQoZm4pO1xyXG4gICAgfWVsc2V7XHJcbiAgICAgIHRoaXMuX2FsbC5wdXNoKGZuKTtcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gdGhpcztcclxuICB9XHJcblxyXG4gIEV2ZW50RW1pdHRlci5wcm90b3R5cGUuX29uID0gZnVuY3Rpb24odHlwZSwgbGlzdGVuZXIsIHByZXBlbmQpIHtcclxuICAgIGlmICh0eXBlb2YgdHlwZSA9PT0gJ2Z1bmN0aW9uJykge1xyXG4gICAgICB0aGlzLl9vbkFueSh0eXBlLCBsaXN0ZW5lcik7XHJcbiAgICAgIHJldHVybiB0aGlzO1xyXG4gICAgfVxyXG5cclxuICAgIGlmICh0eXBlb2YgbGlzdGVuZXIgIT09ICdmdW5jdGlvbicpIHtcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdvbiBvbmx5IGFjY2VwdHMgaW5zdGFuY2VzIG9mIEZ1bmN0aW9uJyk7XHJcbiAgICB9XHJcbiAgICB0aGlzLl9ldmVudHMgfHwgaW5pdC5jYWxsKHRoaXMpO1xyXG5cclxuICAgIC8vIFRvIGF2b2lkIHJlY3Vyc2lvbiBpbiB0aGUgY2FzZSB0aGF0IHR5cGUgPT0gXCJuZXdMaXN0ZW5lcnNcIiEgQmVmb3JlXHJcbiAgICAvLyBhZGRpbmcgaXQgdG8gdGhlIGxpc3RlbmVycywgZmlyc3QgZW1pdCBcIm5ld0xpc3RlbmVyc1wiLlxyXG4gICAgdGhpcy5lbWl0KCduZXdMaXN0ZW5lcicsIHR5cGUsIGxpc3RlbmVyKTtcclxuXHJcbiAgICBpZiAodGhpcy53aWxkY2FyZCkge1xyXG4gICAgICBncm93TGlzdGVuZXJUcmVlLmNhbGwodGhpcywgdHlwZSwgbGlzdGVuZXIpO1xyXG4gICAgICByZXR1cm4gdGhpcztcclxuICAgIH1cclxuXHJcbiAgICBpZiAoIXRoaXMuX2V2ZW50c1t0eXBlXSkge1xyXG4gICAgICAvLyBPcHRpbWl6ZSB0aGUgY2FzZSBvZiBvbmUgbGlzdGVuZXIuIERvbid0IG5lZWQgdGhlIGV4dHJhIGFycmF5IG9iamVjdC5cclxuICAgICAgdGhpcy5fZXZlbnRzW3R5cGVdID0gbGlzdGVuZXI7XHJcbiAgICB9XHJcbiAgICBlbHNlIHtcclxuICAgICAgaWYgKHR5cGVvZiB0aGlzLl9ldmVudHNbdHlwZV0gPT09ICdmdW5jdGlvbicpIHtcclxuICAgICAgICAvLyBDaGFuZ2UgdG8gYXJyYXkuXHJcbiAgICAgICAgdGhpcy5fZXZlbnRzW3R5cGVdID0gW3RoaXMuX2V2ZW50c1t0eXBlXV07XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIC8vIElmIHdlJ3ZlIGFscmVhZHkgZ290IGFuIGFycmF5LCBqdXN0IGFkZFxyXG4gICAgICBpZihwcmVwZW5kKXtcclxuICAgICAgICB0aGlzLl9ldmVudHNbdHlwZV0udW5zaGlmdChsaXN0ZW5lcik7XHJcbiAgICAgIH1lbHNle1xyXG4gICAgICAgIHRoaXMuX2V2ZW50c1t0eXBlXS5wdXNoKGxpc3RlbmVyKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgLy8gQ2hlY2sgZm9yIGxpc3RlbmVyIGxlYWtcclxuICAgICAgaWYgKFxyXG4gICAgICAgICF0aGlzLl9ldmVudHNbdHlwZV0ud2FybmVkICYmXHJcbiAgICAgICAgdGhpcy5fbWF4TGlzdGVuZXJzID4gMCAmJlxyXG4gICAgICAgIHRoaXMuX2V2ZW50c1t0eXBlXS5sZW5ndGggPiB0aGlzLl9tYXhMaXN0ZW5lcnNcclxuICAgICAgKSB7XHJcbiAgICAgICAgdGhpcy5fZXZlbnRzW3R5cGVdLndhcm5lZCA9IHRydWU7XHJcbiAgICAgICAgbG9nUG9zc2libGVNZW1vcnlMZWFrLmNhbGwodGhpcywgdGhpcy5fZXZlbnRzW3R5cGVdLmxlbmd0aCwgdHlwZSk7XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gdGhpcztcclxuICB9XHJcblxyXG4gIEV2ZW50RW1pdHRlci5wcm90b3R5cGUub2ZmID0gZnVuY3Rpb24odHlwZSwgbGlzdGVuZXIpIHtcclxuICAgIGlmICh0eXBlb2YgbGlzdGVuZXIgIT09ICdmdW5jdGlvbicpIHtcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdyZW1vdmVMaXN0ZW5lciBvbmx5IHRha2VzIGluc3RhbmNlcyBvZiBGdW5jdGlvbicpO1xyXG4gICAgfVxyXG5cclxuICAgIHZhciBoYW5kbGVycyxsZWFmcz1bXTtcclxuXHJcbiAgICBpZih0aGlzLndpbGRjYXJkKSB7XHJcbiAgICAgIHZhciBucyA9IHR5cGVvZiB0eXBlID09PSAnc3RyaW5nJyA/IHR5cGUuc3BsaXQodGhpcy5kZWxpbWl0ZXIpIDogdHlwZS5zbGljZSgpO1xyXG4gICAgICBsZWFmcyA9IHNlYXJjaExpc3RlbmVyVHJlZS5jYWxsKHRoaXMsIG51bGwsIG5zLCB0aGlzLmxpc3RlbmVyVHJlZSwgMCk7XHJcbiAgICB9XHJcbiAgICBlbHNlIHtcclxuICAgICAgLy8gZG9lcyBub3QgdXNlIGxpc3RlbmVycygpLCBzbyBubyBzaWRlIGVmZmVjdCBvZiBjcmVhdGluZyBfZXZlbnRzW3R5cGVdXHJcbiAgICAgIGlmICghdGhpcy5fZXZlbnRzW3R5cGVdKSByZXR1cm4gdGhpcztcclxuICAgICAgaGFuZGxlcnMgPSB0aGlzLl9ldmVudHNbdHlwZV07XHJcbiAgICAgIGxlYWZzLnB1c2goe19saXN0ZW5lcnM6aGFuZGxlcnN9KTtcclxuICAgIH1cclxuXHJcbiAgICBmb3IgKHZhciBpTGVhZj0wOyBpTGVhZjxsZWFmcy5sZW5ndGg7IGlMZWFmKyspIHtcclxuICAgICAgdmFyIGxlYWYgPSBsZWFmc1tpTGVhZl07XHJcbiAgICAgIGhhbmRsZXJzID0gbGVhZi5fbGlzdGVuZXJzO1xyXG4gICAgICBpZiAoaXNBcnJheShoYW5kbGVycykpIHtcclxuXHJcbiAgICAgICAgdmFyIHBvc2l0aW9uID0gLTE7XHJcblxyXG4gICAgICAgIGZvciAodmFyIGkgPSAwLCBsZW5ndGggPSBoYW5kbGVycy5sZW5ndGg7IGkgPCBsZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAgaWYgKGhhbmRsZXJzW2ldID09PSBsaXN0ZW5lciB8fFxyXG4gICAgICAgICAgICAoaGFuZGxlcnNbaV0ubGlzdGVuZXIgJiYgaGFuZGxlcnNbaV0ubGlzdGVuZXIgPT09IGxpc3RlbmVyKSB8fFxyXG4gICAgICAgICAgICAoaGFuZGxlcnNbaV0uX29yaWdpbiAmJiBoYW5kbGVyc1tpXS5fb3JpZ2luID09PSBsaXN0ZW5lcikpIHtcclxuICAgICAgICAgICAgcG9zaXRpb24gPSBpO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmIChwb3NpdGlvbiA8IDApIHtcclxuICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYodGhpcy53aWxkY2FyZCkge1xyXG4gICAgICAgICAgbGVhZi5fbGlzdGVuZXJzLnNwbGljZShwb3NpdGlvbiwgMSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGVsc2Uge1xyXG4gICAgICAgICAgdGhpcy5fZXZlbnRzW3R5cGVdLnNwbGljZShwb3NpdGlvbiwgMSk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBpZiAoaGFuZGxlcnMubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgICAgICBpZih0aGlzLndpbGRjYXJkKSB7XHJcbiAgICAgICAgICAgIGRlbGV0ZSBsZWFmLl9saXN0ZW5lcnM7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgICBlbHNlIHtcclxuICAgICAgICAgICAgZGVsZXRlIHRoaXMuX2V2ZW50c1t0eXBlXTtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMuZW1pdChcInJlbW92ZUxpc3RlbmVyXCIsIHR5cGUsIGxpc3RlbmVyKTtcclxuXHJcbiAgICAgICAgcmV0dXJuIHRoaXM7XHJcbiAgICAgIH1cclxuICAgICAgZWxzZSBpZiAoaGFuZGxlcnMgPT09IGxpc3RlbmVyIHx8XHJcbiAgICAgICAgKGhhbmRsZXJzLmxpc3RlbmVyICYmIGhhbmRsZXJzLmxpc3RlbmVyID09PSBsaXN0ZW5lcikgfHxcclxuICAgICAgICAoaGFuZGxlcnMuX29yaWdpbiAmJiBoYW5kbGVycy5fb3JpZ2luID09PSBsaXN0ZW5lcikpIHtcclxuICAgICAgICBpZih0aGlzLndpbGRjYXJkKSB7XHJcbiAgICAgICAgICBkZWxldGUgbGVhZi5fbGlzdGVuZXJzO1xyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNlIHtcclxuICAgICAgICAgIGRlbGV0ZSB0aGlzLl9ldmVudHNbdHlwZV07XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLmVtaXQoXCJyZW1vdmVMaXN0ZW5lclwiLCB0eXBlLCBsaXN0ZW5lcik7XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiByZWN1cnNpdmVseUdhcmJhZ2VDb2xsZWN0KHJvb3QpIHtcclxuICAgICAgaWYgKHJvb3QgPT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgIHJldHVybjtcclxuICAgICAgfVxyXG4gICAgICB2YXIga2V5cyA9IE9iamVjdC5rZXlzKHJvb3QpO1xyXG4gICAgICBmb3IgKHZhciBpIGluIGtleXMpIHtcclxuICAgICAgICB2YXIga2V5ID0ga2V5c1tpXTtcclxuICAgICAgICB2YXIgb2JqID0gcm9vdFtrZXldO1xyXG4gICAgICAgIGlmICgob2JqIGluc3RhbmNlb2YgRnVuY3Rpb24pIHx8ICh0eXBlb2Ygb2JqICE9PSBcIm9iamVjdFwiKSB8fCAob2JqID09PSBudWxsKSlcclxuICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgIGlmIChPYmplY3Qua2V5cyhvYmopLmxlbmd0aCA+IDApIHtcclxuICAgICAgICAgIHJlY3Vyc2l2ZWx5R2FyYmFnZUNvbGxlY3Qocm9vdFtrZXldKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKE9iamVjdC5rZXlzKG9iaikubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgICAgICBkZWxldGUgcm9vdFtrZXldO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgfVxyXG4gICAgcmVjdXJzaXZlbHlHYXJiYWdlQ29sbGVjdCh0aGlzLmxpc3RlbmVyVHJlZSk7XHJcblxyXG4gICAgcmV0dXJuIHRoaXM7XHJcbiAgfTtcclxuXHJcbiAgRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5vZmZBbnkgPSBmdW5jdGlvbihmbikge1xyXG4gICAgdmFyIGkgPSAwLCBsID0gMCwgZm5zO1xyXG4gICAgaWYgKGZuICYmIHRoaXMuX2FsbCAmJiB0aGlzLl9hbGwubGVuZ3RoID4gMCkge1xyXG4gICAgICBmbnMgPSB0aGlzLl9hbGw7XHJcbiAgICAgIGZvcihpID0gMCwgbCA9IGZucy5sZW5ndGg7IGkgPCBsOyBpKyspIHtcclxuICAgICAgICBpZihmbiA9PT0gZm5zW2ldKSB7XHJcbiAgICAgICAgICBmbnMuc3BsaWNlKGksIDEpO1xyXG4gICAgICAgICAgdGhpcy5lbWl0KFwicmVtb3ZlTGlzdGVuZXJBbnlcIiwgZm4pO1xyXG4gICAgICAgICAgcmV0dXJuIHRoaXM7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICBmbnMgPSB0aGlzLl9hbGw7XHJcbiAgICAgIGZvcihpID0gMCwgbCA9IGZucy5sZW5ndGg7IGkgPCBsOyBpKyspXHJcbiAgICAgICAgdGhpcy5lbWl0KFwicmVtb3ZlTGlzdGVuZXJBbnlcIiwgZm5zW2ldKTtcclxuICAgICAgdGhpcy5fYWxsID0gW107XHJcbiAgICB9XHJcbiAgICByZXR1cm4gdGhpcztcclxuICB9O1xyXG5cclxuICBFdmVudEVtaXR0ZXIucHJvdG90eXBlLnJlbW92ZUxpc3RlbmVyID0gRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5vZmY7XHJcblxyXG4gIEV2ZW50RW1pdHRlci5wcm90b3R5cGUucmVtb3ZlQWxsTGlzdGVuZXJzID0gZnVuY3Rpb24odHlwZSkge1xyXG4gICAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPT09IDApIHtcclxuICAgICAgIXRoaXMuX2V2ZW50cyB8fCBpbml0LmNhbGwodGhpcyk7XHJcbiAgICAgIHJldHVybiB0aGlzO1xyXG4gICAgfVxyXG5cclxuICAgIGlmICh0aGlzLndpbGRjYXJkKSB7XHJcbiAgICAgIHZhciBucyA9IHR5cGVvZiB0eXBlID09PSAnc3RyaW5nJyA/IHR5cGUuc3BsaXQodGhpcy5kZWxpbWl0ZXIpIDogdHlwZS5zbGljZSgpO1xyXG4gICAgICB2YXIgbGVhZnMgPSBzZWFyY2hMaXN0ZW5lclRyZWUuY2FsbCh0aGlzLCBudWxsLCBucywgdGhpcy5saXN0ZW5lclRyZWUsIDApO1xyXG5cclxuICAgICAgZm9yICh2YXIgaUxlYWY9MDsgaUxlYWY8bGVhZnMubGVuZ3RoOyBpTGVhZisrKSB7XHJcbiAgICAgICAgdmFyIGxlYWYgPSBsZWFmc1tpTGVhZl07XHJcbiAgICAgICAgbGVhZi5fbGlzdGVuZXJzID0gbnVsbDtcclxuICAgICAgfVxyXG4gICAgfVxyXG4gICAgZWxzZSBpZiAodGhpcy5fZXZlbnRzKSB7XHJcbiAgICAgIHRoaXMuX2V2ZW50c1t0eXBlXSA9IG51bGw7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gdGhpcztcclxuICB9O1xyXG5cclxuICBFdmVudEVtaXR0ZXIucHJvdG90eXBlLmxpc3RlbmVycyA9IGZ1bmN0aW9uKHR5cGUpIHtcclxuICAgIGlmICh0aGlzLndpbGRjYXJkKSB7XHJcbiAgICAgIHZhciBoYW5kbGVycyA9IFtdO1xyXG4gICAgICB2YXIgbnMgPSB0eXBlb2YgdHlwZSA9PT0gJ3N0cmluZycgPyB0eXBlLnNwbGl0KHRoaXMuZGVsaW1pdGVyKSA6IHR5cGUuc2xpY2UoKTtcclxuICAgICAgc2VhcmNoTGlzdGVuZXJUcmVlLmNhbGwodGhpcywgaGFuZGxlcnMsIG5zLCB0aGlzLmxpc3RlbmVyVHJlZSwgMCk7XHJcbiAgICAgIHJldHVybiBoYW5kbGVycztcclxuICAgIH1cclxuXHJcbiAgICB0aGlzLl9ldmVudHMgfHwgaW5pdC5jYWxsKHRoaXMpO1xyXG5cclxuICAgIGlmICghdGhpcy5fZXZlbnRzW3R5cGVdKSB0aGlzLl9ldmVudHNbdHlwZV0gPSBbXTtcclxuICAgIGlmICghaXNBcnJheSh0aGlzLl9ldmVudHNbdHlwZV0pKSB7XHJcbiAgICAgIHRoaXMuX2V2ZW50c1t0eXBlXSA9IFt0aGlzLl9ldmVudHNbdHlwZV1dO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIHRoaXMuX2V2ZW50c1t0eXBlXTtcclxuICB9O1xyXG5cclxuICBFdmVudEVtaXR0ZXIucHJvdG90eXBlLmV2ZW50TmFtZXMgPSBmdW5jdGlvbigpe1xyXG4gICAgcmV0dXJuIE9iamVjdC5rZXlzKHRoaXMuX2V2ZW50cyk7XHJcbiAgfVxyXG5cclxuICBFdmVudEVtaXR0ZXIucHJvdG90eXBlLmxpc3RlbmVyQ291bnQgPSBmdW5jdGlvbih0eXBlKSB7XHJcbiAgICByZXR1cm4gdGhpcy5saXN0ZW5lcnModHlwZSkubGVuZ3RoO1xyXG4gIH07XHJcblxyXG4gIEV2ZW50RW1pdHRlci5wcm90b3R5cGUubGlzdGVuZXJzQW55ID0gZnVuY3Rpb24oKSB7XHJcblxyXG4gICAgaWYodGhpcy5fYWxsKSB7XHJcbiAgICAgIHJldHVybiB0aGlzLl9hbGw7XHJcbiAgICB9XHJcbiAgICBlbHNlIHtcclxuICAgICAgcmV0dXJuIFtdO1xyXG4gICAgfVxyXG5cclxuICB9O1xyXG5cclxuICBpZiAodHlwZW9mIGRlZmluZSA9PT0gJ2Z1bmN0aW9uJyAmJiBkZWZpbmUuYW1kKSB7XHJcbiAgICAgLy8gQU1ELiBSZWdpc3RlciBhcyBhbiBhbm9ueW1vdXMgbW9kdWxlLlxyXG4gICAgZGVmaW5lKGZ1bmN0aW9uKCkge1xyXG4gICAgICByZXR1cm4gRXZlbnRFbWl0dGVyO1xyXG4gICAgfSk7XHJcbiAgfSBlbHNlIGlmICh0eXBlb2YgZXhwb3J0cyA9PT0gJ29iamVjdCcpIHtcclxuICAgIC8vIENvbW1vbkpTXHJcbiAgICBtb2R1bGUuZXhwb3J0cyA9IEV2ZW50RW1pdHRlcjtcclxuICB9XHJcbiAgZWxzZSB7XHJcbiAgICAvLyBCcm93c2VyIGdsb2JhbC5cclxuICAgIHdpbmRvdy5FdmVudEVtaXR0ZXIyID0gRXZlbnRFbWl0dGVyO1xyXG4gIH1cclxufSgpO1xyXG4iLCIvLyBzaGltIGZvciB1c2luZyBwcm9jZXNzIGluIGJyb3dzZXJcbnZhciBwcm9jZXNzID0gbW9kdWxlLmV4cG9ydHMgPSB7fTtcblxuLy8gY2FjaGVkIGZyb20gd2hhdGV2ZXIgZ2xvYmFsIGlzIHByZXNlbnQgc28gdGhhdCB0ZXN0IHJ1bm5lcnMgdGhhdCBzdHViIGl0XG4vLyBkb24ndCBicmVhayB0aGluZ3MuICBCdXQgd2UgbmVlZCB0byB3cmFwIGl0IGluIGEgdHJ5IGNhdGNoIGluIGNhc2UgaXQgaXNcbi8vIHdyYXBwZWQgaW4gc3RyaWN0IG1vZGUgY29kZSB3aGljaCBkb2Vzbid0IGRlZmluZSBhbnkgZ2xvYmFscy4gIEl0J3MgaW5zaWRlIGFcbi8vIGZ1bmN0aW9uIGJlY2F1c2UgdHJ5L2NhdGNoZXMgZGVvcHRpbWl6ZSBpbiBjZXJ0YWluIGVuZ2luZXMuXG5cbnZhciBjYWNoZWRTZXRUaW1lb3V0O1xudmFyIGNhY2hlZENsZWFyVGltZW91dDtcblxuZnVuY3Rpb24gZGVmYXVsdFNldFRpbW91dCgpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3NldFRpbWVvdXQgaGFzIG5vdCBiZWVuIGRlZmluZWQnKTtcbn1cbmZ1bmN0aW9uIGRlZmF1bHRDbGVhclRpbWVvdXQgKCkge1xuICAgIHRocm93IG5ldyBFcnJvcignY2xlYXJUaW1lb3V0IGhhcyBub3QgYmVlbiBkZWZpbmVkJyk7XG59XG4oZnVuY3Rpb24gKCkge1xuICAgIHRyeSB7XG4gICAgICAgIGlmICh0eXBlb2Ygc2V0VGltZW91dCA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgY2FjaGVkU2V0VGltZW91dCA9IHNldFRpbWVvdXQ7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjYWNoZWRTZXRUaW1lb3V0ID0gZGVmYXVsdFNldFRpbW91dDtcbiAgICAgICAgfVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgY2FjaGVkU2V0VGltZW91dCA9IGRlZmF1bHRTZXRUaW1vdXQ7XG4gICAgfVxuICAgIHRyeSB7XG4gICAgICAgIGlmICh0eXBlb2YgY2xlYXJUaW1lb3V0ID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICBjYWNoZWRDbGVhclRpbWVvdXQgPSBjbGVhclRpbWVvdXQ7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjYWNoZWRDbGVhclRpbWVvdXQgPSBkZWZhdWx0Q2xlYXJUaW1lb3V0O1xuICAgICAgICB9XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBjYWNoZWRDbGVhclRpbWVvdXQgPSBkZWZhdWx0Q2xlYXJUaW1lb3V0O1xuICAgIH1cbn0gKCkpXG5mdW5jdGlvbiBydW5UaW1lb3V0KGZ1bikge1xuICAgIGlmIChjYWNoZWRTZXRUaW1lb3V0ID09PSBzZXRUaW1lb3V0KSB7XG4gICAgICAgIC8vbm9ybWFsIGVudmlyb21lbnRzIGluIHNhbmUgc2l0dWF0aW9uc1xuICAgICAgICByZXR1cm4gc2V0VGltZW91dChmdW4sIDApO1xuICAgIH1cbiAgICAvLyBpZiBzZXRUaW1lb3V0IHdhc24ndCBhdmFpbGFibGUgYnV0IHdhcyBsYXR0ZXIgZGVmaW5lZFxuICAgIGlmICgoY2FjaGVkU2V0VGltZW91dCA9PT0gZGVmYXVsdFNldFRpbW91dCB8fCAhY2FjaGVkU2V0VGltZW91dCkgJiYgc2V0VGltZW91dCkge1xuICAgICAgICBjYWNoZWRTZXRUaW1lb3V0ID0gc2V0VGltZW91dDtcbiAgICAgICAgcmV0dXJuIHNldFRpbWVvdXQoZnVuLCAwKTtcbiAgICB9XG4gICAgdHJ5IHtcbiAgICAgICAgLy8gd2hlbiB3aGVuIHNvbWVib2R5IGhhcyBzY3Jld2VkIHdpdGggc2V0VGltZW91dCBidXQgbm8gSS5FLiBtYWRkbmVzc1xuICAgICAgICByZXR1cm4gY2FjaGVkU2V0VGltZW91dChmdW4sIDApO1xuICAgIH0gY2F0Y2goZSl7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICAvLyBXaGVuIHdlIGFyZSBpbiBJLkUuIGJ1dCB0aGUgc2NyaXB0IGhhcyBiZWVuIGV2YWxlZCBzbyBJLkUuIGRvZXNuJ3QgdHJ1c3QgdGhlIGdsb2JhbCBvYmplY3Qgd2hlbiBjYWxsZWQgbm9ybWFsbHlcbiAgICAgICAgICAgIHJldHVybiBjYWNoZWRTZXRUaW1lb3V0LmNhbGwobnVsbCwgZnVuLCAwKTtcbiAgICAgICAgfSBjYXRjaChlKXtcbiAgICAgICAgICAgIC8vIHNhbWUgYXMgYWJvdmUgYnV0IHdoZW4gaXQncyBhIHZlcnNpb24gb2YgSS5FLiB0aGF0IG11c3QgaGF2ZSB0aGUgZ2xvYmFsIG9iamVjdCBmb3IgJ3RoaXMnLCBob3BmdWxseSBvdXIgY29udGV4dCBjb3JyZWN0IG90aGVyd2lzZSBpdCB3aWxsIHRocm93IGEgZ2xvYmFsIGVycm9yXG4gICAgICAgICAgICByZXR1cm4gY2FjaGVkU2V0VGltZW91dC5jYWxsKHRoaXMsIGZ1biwgMCk7XG4gICAgICAgIH1cbiAgICB9XG5cblxufVxuZnVuY3Rpb24gcnVuQ2xlYXJUaW1lb3V0KG1hcmtlcikge1xuICAgIGlmIChjYWNoZWRDbGVhclRpbWVvdXQgPT09IGNsZWFyVGltZW91dCkge1xuICAgICAgICAvL25vcm1hbCBlbnZpcm9tZW50cyBpbiBzYW5lIHNpdHVhdGlvbnNcbiAgICAgICAgcmV0dXJuIGNsZWFyVGltZW91dChtYXJrZXIpO1xuICAgIH1cbiAgICAvLyBpZiBjbGVhclRpbWVvdXQgd2Fzbid0IGF2YWlsYWJsZSBidXQgd2FzIGxhdHRlciBkZWZpbmVkXG4gICAgaWYgKChjYWNoZWRDbGVhclRpbWVvdXQgPT09IGRlZmF1bHRDbGVhclRpbWVvdXQgfHwgIWNhY2hlZENsZWFyVGltZW91dCkgJiYgY2xlYXJUaW1lb3V0KSB7XG4gICAgICAgIGNhY2hlZENsZWFyVGltZW91dCA9IGNsZWFyVGltZW91dDtcbiAgICAgICAgcmV0dXJuIGNsZWFyVGltZW91dChtYXJrZXIpO1xuICAgIH1cbiAgICB0cnkge1xuICAgICAgICAvLyB3aGVuIHdoZW4gc29tZWJvZHkgaGFzIHNjcmV3ZWQgd2l0aCBzZXRUaW1lb3V0IGJ1dCBubyBJLkUuIG1hZGRuZXNzXG4gICAgICAgIHJldHVybiBjYWNoZWRDbGVhclRpbWVvdXQobWFya2VyKTtcbiAgICB9IGNhdGNoIChlKXtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIC8vIFdoZW4gd2UgYXJlIGluIEkuRS4gYnV0IHRoZSBzY3JpcHQgaGFzIGJlZW4gZXZhbGVkIHNvIEkuRS4gZG9lc24ndCAgdHJ1c3QgdGhlIGdsb2JhbCBvYmplY3Qgd2hlbiBjYWxsZWQgbm9ybWFsbHlcbiAgICAgICAgICAgIHJldHVybiBjYWNoZWRDbGVhclRpbWVvdXQuY2FsbChudWxsLCBtYXJrZXIpO1xuICAgICAgICB9IGNhdGNoIChlKXtcbiAgICAgICAgICAgIC8vIHNhbWUgYXMgYWJvdmUgYnV0IHdoZW4gaXQncyBhIHZlcnNpb24gb2YgSS5FLiB0aGF0IG11c3QgaGF2ZSB0aGUgZ2xvYmFsIG9iamVjdCBmb3IgJ3RoaXMnLCBob3BmdWxseSBvdXIgY29udGV4dCBjb3JyZWN0IG90aGVyd2lzZSBpdCB3aWxsIHRocm93IGEgZ2xvYmFsIGVycm9yLlxuICAgICAgICAgICAgLy8gU29tZSB2ZXJzaW9ucyBvZiBJLkUuIGhhdmUgZGlmZmVyZW50IHJ1bGVzIGZvciBjbGVhclRpbWVvdXQgdnMgc2V0VGltZW91dFxuICAgICAgICAgICAgcmV0dXJuIGNhY2hlZENsZWFyVGltZW91dC5jYWxsKHRoaXMsIG1hcmtlcik7XG4gICAgICAgIH1cbiAgICB9XG5cblxuXG59XG52YXIgcXVldWUgPSBbXTtcbnZhciBkcmFpbmluZyA9IGZhbHNlO1xudmFyIGN1cnJlbnRRdWV1ZTtcbnZhciBxdWV1ZUluZGV4ID0gLTE7XG5cbmZ1bmN0aW9uIGNsZWFuVXBOZXh0VGljaygpIHtcbiAgICBpZiAoIWRyYWluaW5nIHx8ICFjdXJyZW50UXVldWUpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBkcmFpbmluZyA9IGZhbHNlO1xuICAgIGlmIChjdXJyZW50UXVldWUubGVuZ3RoKSB7XG4gICAgICAgIHF1ZXVlID0gY3VycmVudFF1ZXVlLmNvbmNhdChxdWV1ZSk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgcXVldWVJbmRleCA9IC0xO1xuICAgIH1cbiAgICBpZiAocXVldWUubGVuZ3RoKSB7XG4gICAgICAgIGRyYWluUXVldWUoKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGRyYWluUXVldWUoKSB7XG4gICAgaWYgKGRyYWluaW5nKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgdmFyIHRpbWVvdXQgPSBydW5UaW1lb3V0KGNsZWFuVXBOZXh0VGljayk7XG4gICAgZHJhaW5pbmcgPSB0cnVlO1xuXG4gICAgdmFyIGxlbiA9IHF1ZXVlLmxlbmd0aDtcbiAgICB3aGlsZShsZW4pIHtcbiAgICAgICAgY3VycmVudFF1ZXVlID0gcXVldWU7XG4gICAgICAgIHF1ZXVlID0gW107XG4gICAgICAgIHdoaWxlICgrK3F1ZXVlSW5kZXggPCBsZW4pIHtcbiAgICAgICAgICAgIGlmIChjdXJyZW50UXVldWUpIHtcbiAgICAgICAgICAgICAgICBjdXJyZW50UXVldWVbcXVldWVJbmRleF0ucnVuKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcXVldWVJbmRleCA9IC0xO1xuICAgICAgICBsZW4gPSBxdWV1ZS5sZW5ndGg7XG4gICAgfVxuICAgIGN1cnJlbnRRdWV1ZSA9IG51bGw7XG4gICAgZHJhaW5pbmcgPSBmYWxzZTtcbiAgICBydW5DbGVhclRpbWVvdXQodGltZW91dCk7XG59XG5cbnByb2Nlc3MubmV4dFRpY2sgPSBmdW5jdGlvbiAoZnVuKSB7XG4gICAgdmFyIGFyZ3MgPSBuZXcgQXJyYXkoYXJndW1lbnRzLmxlbmd0aCAtIDEpO1xuICAgIGlmIChhcmd1bWVudHMubGVuZ3RoID4gMSkge1xuICAgICAgICBmb3IgKHZhciBpID0gMTsgaSA8IGFyZ3VtZW50cy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgYXJnc1tpIC0gMV0gPSBhcmd1bWVudHNbaV07XG4gICAgICAgIH1cbiAgICB9XG4gICAgcXVldWUucHVzaChuZXcgSXRlbShmdW4sIGFyZ3MpKTtcbiAgICBpZiAocXVldWUubGVuZ3RoID09PSAxICYmICFkcmFpbmluZykge1xuICAgICAgICBydW5UaW1lb3V0KGRyYWluUXVldWUpO1xuICAgIH1cbn07XG5cbi8vIHY4IGxpa2VzIHByZWRpY3RpYmxlIG9iamVjdHNcbmZ1bmN0aW9uIEl0ZW0oZnVuLCBhcnJheSkge1xuICAgIHRoaXMuZnVuID0gZnVuO1xuICAgIHRoaXMuYXJyYXkgPSBhcnJheTtcbn1cbkl0ZW0ucHJvdG90eXBlLnJ1biA9IGZ1bmN0aW9uICgpIHtcbiAgICB0aGlzLmZ1bi5hcHBseShudWxsLCB0aGlzLmFycmF5KTtcbn07XG5wcm9jZXNzLnRpdGxlID0gJ2Jyb3dzZXInO1xucHJvY2Vzcy5icm93c2VyID0gdHJ1ZTtcbnByb2Nlc3MuZW52ID0ge307XG5wcm9jZXNzLmFyZ3YgPSBbXTtcbnByb2Nlc3MudmVyc2lvbiA9ICcnOyAvLyBlbXB0eSBzdHJpbmcgdG8gYXZvaWQgcmVnZXhwIGlzc3Vlc1xucHJvY2Vzcy52ZXJzaW9ucyA9IHt9O1xuXG5mdW5jdGlvbiBub29wKCkge31cblxucHJvY2Vzcy5vbiA9IG5vb3A7XG5wcm9jZXNzLmFkZExpc3RlbmVyID0gbm9vcDtcbnByb2Nlc3Mub25jZSA9IG5vb3A7XG5wcm9jZXNzLm9mZiA9IG5vb3A7XG5wcm9jZXNzLnJlbW92ZUxpc3RlbmVyID0gbm9vcDtcbnByb2Nlc3MucmVtb3ZlQWxsTGlzdGVuZXJzID0gbm9vcDtcbnByb2Nlc3MuZW1pdCA9IG5vb3A7XG5wcm9jZXNzLnByZXBlbmRMaXN0ZW5lciA9IG5vb3A7XG5wcm9jZXNzLnByZXBlbmRPbmNlTGlzdGVuZXIgPSBub29wO1xuXG5wcm9jZXNzLmxpc3RlbmVycyA9IGZ1bmN0aW9uIChuYW1lKSB7IHJldHVybiBbXSB9XG5cbnByb2Nlc3MuYmluZGluZyA9IGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdwcm9jZXNzLmJpbmRpbmcgaXMgbm90IHN1cHBvcnRlZCcpO1xufTtcblxucHJvY2Vzcy5jd2QgPSBmdW5jdGlvbiAoKSB7IHJldHVybiAnLycgfTtcbnByb2Nlc3MuY2hkaXIgPSBmdW5jdGlvbiAoZGlyKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdwcm9jZXNzLmNoZGlyIGlzIG5vdCBzdXBwb3J0ZWQnKTtcbn07XG5wcm9jZXNzLnVtYXNrID0gZnVuY3Rpb24oKSB7IHJldHVybiAwOyB9O1xuIiwiaW1wb3J0ICcuL2pzL21vZHVsZXMvZ2xvYmFsJztcbmltcG9ydCAnLi9qcy9tb2R1bGVzL2NvbmZpZyc7XG5pbXBvcnQgJy4vanMvbW9kdWxlcy91dGlscyc7XG5pbXBvcnQgJy4vanMvbW9kdWxlcy9vYmpDb25zdHJ1Y3Rvcic7XG5pbXBvcnQgJy4vanMvbW9kdWxlcy9oYW5kbGVDbGlja3MnO1xuaW1wb3J0ICcuL2pzL21vZHVsZXMvY2FuSVVzZURhdGEnO1xuaW1wb3J0ICcuL2pzL21vZHVsZXMvaW5wdXQnO1xuaW1wb3J0ICcuL2pzL21vZHVsZXMvd2VpcmRDYXNlJztcbmltcG9ydCAnLi9qcy9tb2R1bGVzL3JhbmRvbU5hbWVzJztcbmltcG9ydCAnLi9qcy9tb2R1bGVzL2NvdW50ZG93bic7XG5cbi8vaW1wb3J0IHtsb2FkVmlkZW9zfSBmcm9tICcuL2pzL21vZHVsZXMvbG9hZFZpZGVvcyc7XG5cbi8vRVZULm9uKCdpbml0JywgbG9hZFZpZGVvcylcblxuY29uc3QgY2FuRmlnaHQgPSAoc3RhdGUpID0+ICh7XG4gIGZpZ2h0OiAoKSA9PiB7XG4gICAgY29uc29sZS5sb2coYCR7c3RhdGUubmFtZX0gc2xhc2hlcyBhdCB0aGUgZm9lIWApO1xuICAgIHN0YXRlLnN0YW1pbmEtLTtcbiAgfVxufSlcblxuY29uc3QgZmlnaHRlciA9IChuYW1lKSA9PiB7XG4gIGxldCBzdGF0ZSA9IHtcbiAgICBuYW1lLFxuICAgIGhlYWx0aDogMTAwLFxuICAgIHN0YW1pbmE6IDEwMFxuICB9XG5cbiAgcmV0dXJuIE9iamVjdC5hc3NpZ24oc3RhdGUsIGNhbkZpZ2h0KHN0YXRlKSk7XG59XG5cbmNvbnN0IGNhbkNhc3QgPSAoc3RhdGUpID0+ICh7XG4gIGNhc3Q6IChzcGVsbCkgPT4ge1xuICAgIGNvbnNvbGUubG9nKGAke3N0YXRlLm5hbWV9IGNhc3RzICR7c3BlbGx9IWApO1xuICAgIHN0YXRlLm1hbmEtLTtcbiAgfVxufSlcblxuY29uc3QgbWFnZSA9IChuYW1lKSA9PiB7XG4gIGxldCBzdGF0ZSA9IHtcbiAgICBuYW1lLFxuICAgIGhlYWx0aDogMTAwLFxuICAgIG1hbmE6IDEwMFxuICB9XG5cbiAgcmV0dXJuIE9iamVjdC5hc3NpZ24oc3RhdGUsIGNhbkNhc3Qoc3RhdGUpKTtcbn1cblxudmFyIHNsYXNoZXIgPSBmaWdodGVyKCdTbGFzaGVyJylcbnZhciBkYXNoZXIgPSBmaWdodGVyKCdEYXNoZXInKVxudmFyIHN0b21wZXIgPSBmaWdodGVyKCdTdG9tcGVyJylcbnZhciBjcnVzaGVyID0gZmlnaHRlcignQ3J1c2hlcicpXG5cblxuLy9zbGFzaGVyLmZpZ2h0KCk7XG4vL2Rhc2hlci5maWdodCgpO1xuLy9zdG9tcGVyLmZpZ2h0KCk7XG4vL2NydXNoZXIuZmlnaHQoKTtcblxuLy8gU2xhc2hlciBzbGFzaGVzIGF0IHRoZSBmb2UhXG4vL2NvbnNvbGUubG9nKHNsYXNoZXIuc3RhbWluYSkgIC8vIDk5XG5cbnZhciBzY29yY2hlciA9IG1hZ2UoJ1Njb3JjaGVyJylcbi8vc2NvcmNoZXIuY2FzdCgnZmlyZWJhbGwnKTsgICAgLy8gU2NvcmNoZXIgY2FzdHMgZmlyZWJhbGwhXG4vL2NvbnNvbGUubG9nKHNjb3JjaGVyLm1hbmEpICAgIC8vIDk5XG5cbmNvbnN0IHRvb2xCb3ggPSAoKT0+IHtcbiAgcmV0dXJuICh7XG4gICAgY2xpY2sgIDogKGFyZykgPT4ge1xuICAgICAgY29uc29sZS5sb2coYCR7YXJnfWApO1xuICAgIH0sXG4gICAgcmFuZE51bTogKCkgPT4ge1xuICAgICAgIHJldHVybiBNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiAxMDApXG4gICAgfVxuICB9KTtcbn1cblxudmFyIHRvb2wgPSB0b29sQm94KCk7XG5cbmNvbnNvbGUubG9nKHRvb2wpO1xuY29uc29sZS5sb2codG9vbC5jbGljaygnY2xpY2snKSk7XG5jb25zb2xlLmxvZyh0b29sLnJhbmROdW0oKSk7XG4iLCIoZnVuY3Rpb24oKSB7XG5cbiAgdmFyIGNhbklEYXRhID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLmNhbklEYXRhJyk7XG5cbiAgZnVuY3Rpb24gaW5pdCgpIHtcbiAgICB2YXIgcDEgPSBuZXcgUHJvbWlzZShcbiAgICAgIGZ1bmN0aW9uKHJlc29sdmUpIHtcbiAgICAgICAgdmFyIHJlcXVlc3Q7XG4gICAgICAgIGlmICh3aW5kb3cuWE1MSHR0cFJlcXVlc3QpIHtcbiAgICAgICAgICByZXF1ZXN0ID0gbmV3IFhNTEh0dHBSZXF1ZXN0KCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmVxdWVzdCA9IG5ldyBBY3RpdmVYT2JqZWN0KFwiTWljcm9zb2Z0LlhNTEhUVFBcIik7XG4gICAgICAgIH1cbiAgICAgICAgcmVxdWVzdC5vcGVuKCdHRVQnLCAnaHR0cHM6Ly9yYXcuZ2l0aHVidXNlcmNvbnRlbnQuY29tL0Z5cmQvY2FuaXVzZS9tYXN0ZXIvZGF0YS5qc29uJyk7XG4gICAgICAgIHJlcXVlc3Qub25yZWFkeXN0YXRlY2hhbmdlID0gZnVuY3Rpb24oKSB7XG4gICAgICAgICAgaWYgKHJlcXVlc3QucmVhZHlTdGF0ZSA9PT0gNCAmJiByZXF1ZXN0LnN0YXR1cyA9PT0gMjAwKSB7XG4gICAgICAgICAgICBjb25zdCBjYW5JVXNlRGF0YSA9IEpTT04ucGFyc2UocmVxdWVzdC5yZXNwb25zZVRleHQpO1xuICAgICAgICAgICAgcmVzb2x2ZShjYW5JVXNlRGF0YSk7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhjYW5JVXNlRGF0YS5kYXRhKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmVxdWVzdC5zZW5kKCk7XG4gICAgICB9KTtcbiAgICBwMVxuICAgICAgLnRoZW4oY2FuSVVzZURhdGEgPT4ge1xuXG4gICAgICAgIHZhciB0aXRsZXM9IFwiXCI7XG5cbiAgICAgICAgICBmb3IgKGxldCBpIGluIGNhbklVc2VEYXRhLmRhdGEpIHtcbiAgICAgICAgICAgIHRpdGxlcyArPSBcIjxkaXYgY2xhc3M9J2RhdGFfX2l0ZW0nPlwiXG4gICAgICAgICAgICB0aXRsZXMgKz0gXCI8aDU+XCIgKyBjYW5JVXNlRGF0YS5kYXRhW2ldLnRpdGxlICsgXCI8L2g1PlwiXG4gICAgICAgICAgICB0aXRsZXMgKz0gXCI8cD5cIiArIGNhbklVc2VEYXRhLmRhdGFbaV0uZGVzY3JpcHRpb24gKyBcIjwvcD5cIlxuICAgICAgICAgICAgdGl0bGVzICs9IFwiPGEgaHJlZj1cIiArIGNhbklVc2VEYXRhLmRhdGFbaV0ubGlua3NbMF0udXJsICsgXCI+XCIgKyBcImxpbmtcIiArIFwiPC9hPlwiXG4gICAgICAgICAgICB0aXRsZXMgKz0gXCI8L2Rpdj5cIlxuICAgICAgICAgIH1cblxuICAgICAgICAgIGNhbklEYXRhLmlubmVySFRNTCA9IHRpdGxlcztcblxuICAgICAgfSlcblxuICB9XG5cbiAgaWYgKFwiUHJvbWlzZVwiIGluIHdpbmRvdykgeyAgIC8vIENoZWNrIGZvciBQcm9taXNlIG9uIHdpbmRvd1xuICAgIGNvbnNvbGUubG9nKCdQcm9taXNlcyBhcmUgc3VwcG9ydGVkJyk7XG4gICAgLy9FVlQub24oXCJpbml0XCIsIGluaXQpO1xuXG4gICB9IGVsc2Uge1xuICAgICBjb25zb2xlLmxvZygnWW91ciBicm93c2VyIGRvZXNuXFwndCBzdXBwb3J0IHRoZSA8Y29kZT5Qcm9taXNlPGNvZGU+IGludGVyZmFjZS4nKTtcbiAgIH1cblxufSkoKTtcbiIsImNvbnN0IGNvbmZpZyA9IEpDLmNvbmZpZyA9IHt9O1xuICBjb25maWcucHJvamVjdCA9ICdqdXN0eW5DbGFyay1uZXcnO1xuICBjb25maWcuZGV2ZWxvcGVyID0gJ2p1c3R5biBjbGFyayc7XG4gIGNvbmZpZy52ZXJzaW9uID0gXCIxLjAuMFwiO1xuXG4iLCJ2YXIgY29va2llTWFwO1xuLy8gQ29va2llc1xuSkMudXRpbHMuZ2V0Q29va2llcyA9IHVwZGF0ZSA9PiB7IC8vIEdldCBjb29raWVzXG4gIGlmKCFjb29raWVNYXAgfHwgdXBkYXRlKSB7XG4gICAgY29va2llTWFwID0ge307XG4gICAgdmFyIGksIGNvb2tpZXMgPSBkb2N1bWVudC5jb29raWUuc3BsaXQoXCI7XCIpO1xuICAgIGZvciAoaSA9IDA7IGkgPCBjb29raWVzLmxlbmd0aDsgaSsrKSB7XG4gICAgICB2YXIgaW5kZXggPSBjb29raWVzW2ldLmluZGV4T2YoJz0nKTtcbiAgICAgIHZhciB4ID0gY29va2llc1tpXS5zdWJzdHIoMCwgaW5kZXgpO1xuICAgICAgdmFyIHkgPSBjb29raWVzW2ldLnN1YnN0cihpbmRleCArIDEpO1xuICAgICAgeCA9IHgucmVwbGFjZSgvXlxccyt8XFxzKyQvZywgJycpO1xuICAgICAgaWYoeCkgY29va2llTWFwW3hdID0gZGVjb2RlVVJJKHkpO1xuICAgIH1cbiAgfVxuICByZXR1cm4gY29va2llTWFwO1xufTtcblxuSkMudXRpbHMuZ2V0Q29va2llID0gKGMsIHVwZGF0ZSkgPT4geyAvLyBHZXQgY29va2llXG4gIHJldHVybiB0aGlzLmdldENvb2tpZXModXBkYXRlKVtjXTtcbn07XG5cbkpDLnV0aWxzLnNldENvb2tpZSA9IChuYW1lLCB2YWx1ZSwgb3B0cykgPT4geyAvLyBTZXQgY29va2llIEpDLnV0aWxzLnNldENvb2tpZSgnamNDb29raWUnLHRydWUsIHtleHBpcmVEYXRlOiAoMzYwMCAqIDI0ICogMzY1KX0pO1xuICB2YXIgdmFsdWUgPSBlbmNvZGVVUkkodmFsdWUpO1xuICBvcHRzID0gb3B0cyB8fCB7fTtcbiAgdmFsdWUgKz0gXCI7cGF0aD1cIiArIChvcHRzLnBhdGggfHwgXCIvXCIpO1xuICBpZihvcHRzLmRvbWFpbikgdmFsdWUgKz0gXCI7ZG9tYWluPVwiICsgb3B0cy5kb21haW47XG4gIHZhciB0ID0gdHlwZW9mIG9wdHMubWF4QWdlO1xuICBpZih0ID09IFwibnVtYmVyXCIgfHwgdCA9PSBcInN0cmluZ1wiKSB2YWx1ZSArPSBcIjttYXgtYWdlPVwiICsgb3B0cy5tYXhBZ2U7XG4gIHZhciBlID0gb3B0cy5leHBpcmVEYXRlO1xuICBpZih0eXBlb2YgZSA9PSBcIm51bWJlclwiKSBlID0gbmV3IERhdGUoKG5ldyBEYXRlKCkpLmdldFRpbWUoKSArIGUgKiAxMDAwKTtcbiAgaWYoZSkgdmFsdWUgKz0gJztleHBpcmVzPScgKyBlLnRvVVRDU3RyaW5nKCk7XG4gIGlmKG9wdHMuc2VjdXJlKSB2YWx1ZSArPSBcIjtzZWN1cmVcIjtcbiAgZG9jdW1lbnQuY29va2llID0gbmFtZSArICc9JyArIHZhbHVlO1xuICBjb29raWVNYXAgPSBudWxsO1xufTtcblxuc2V0VGltZW91dCgoKT0+IHtcbiAgaWYgKCFkb2N1bWVudC5jb29raWUubWF0Y2goJ2pjQ29va2llJykpIHtcbiAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcuY29va2llLXBvbGljeScpLmNsYXNzTGlzdC5hZGQoJ2Nvb2tpZS1wb2xpY3ktLXNob3cnKTtcbiAgfSBlbHNlIHtcbiAgICBjb25zb2xlLmxvZygnY29va2llIHBvbGljeSBpcyBoaWRkZW4nKTtcbiAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcuY29va2llLXBvbGljeScpLmNsYXNzTGlzdC5hZGQoJ2Nvb2tpZS1wb2xpY3ktLWhpZGUnKTtcbiAgfVxufSwxMDAwKTtcblxuZXhwb3J0IGZ1bmN0aW9uIHNldFBvbGljeUNvb2tpZSgpIHtcbiAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLmNvb2tpZS1wb2xpY3knKS5jbGFzc0xpc3QuYWRkKCdjb29raWUtcG9saWN5LS1oaWRlJyk7XG4gIGNvbnNvbGUubG9nKCdjb29raWUgc2V0Jyk7XG4gIEpDLnV0aWxzLnNldENvb2tpZSgnamNDb29raWUnLCB0cnVlLCB7ZXhwaXJlRGF0ZTogKDM2MDAgKiAyNCAqIDM2NSl9KTtcbn1cbiIsIihmdW5jdGlvbihKQykge1xuXG4gIHZhciBjb3VudGRvd24gPSBKQy5jb3VudGRvd24gPSB7fTtcblxuICB2YXIgdGFyZ2V0RGF0ZSA9IFwiT2N0IDMxLCAyMDE3IDA4OjMwOjAwXCI7IC8vIFNldCB0aGUgZGF0ZSB3ZSdyZSBjb3VudGluZyBkb3duIHRvXG5cbiAgY291bnRkb3duLmluaXQgPSBmdW5jdGlvbiAoKSB7XG4gICAgc2V0dXBDbG9jaygpO1xuICAgIC8vc2V0dXBDbG9zZUNsaWNrSGFuZGxlcigpOyAvL0dldCB0aGUgdGltZVxuICB9O1xuXG4gIHZhciBwcmVsb2FkID0gZnVuY3Rpb24gKCkge1xuICAgIHZhciBjb3VudERvd25Db29raWUgPSBKQy51dGlscy5nZXRDb29raWUoXCJjb3VudGRvd25jbG9zZWRcIik7XG4gICAgaWYgKCFjb3VudERvd25Db29raWUpe1xuICAgICAgaW5pdCgpO1xuICAgIH0gZWxzZSBpZiAoY291bnREb3duQ29va2llICE9IFwiXCIpIHtcbiAgICAgIGNvbnNvbGUubG9nKFwiVGhlIGNvb2tpZSBcIiArIGNvdW50RG93bkNvb2tpZSArIFwiIGhhcyBiZWVuIHNldC5cIik7XG4gICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcuY291bnRkb3duJykuaGlkZSgpO1xuICAgIH1cbiAgfTtcblxuICB2YXIgc2V0dXBDbG9jayA9IGZ1bmN0aW9uKCkge1xuICAgIHZhciBjb3VudERvd25EYXRlID0gbmV3IERhdGUodGFyZ2V0RGF0ZSkuZ2V0VGltZSgpOyAvLyBSZWFkaW5nIGZyb20gdGhlIGNvbXBvbmVudFxuICAgIHZhciBjbG9jayA9IHNldEludGVydmFsKGZ1bmN0aW9uKCkge1xuICAgICAgdmFyIG5vdyAgICAgICA9IG5ldyBEYXRlKCkuZ2V0VGltZSgpO1xuICAgICAgdmFyIGRpc3RhbmNlICA9IGNvdW50RG93bkRhdGUgLSBub3c7XG4gICAgICB2YXIgZGF5cyAgICAgID0gTWF0aC5mbG9vcihkaXN0YW5jZSAvICgxMDAwICogNjAgKiA2MCAqIDI0KSk7XG4gICAgICB2YXIgaG91cnMgICAgID0gTWF0aC5mbG9vcigoZGlzdGFuY2UgJSAoMTAwMCAqIDYwICogNjAgKiAyNCkpIC8gKDEwMDAgKiA2MCAqIDYwKSk7XG4gICAgICB2YXIgbWludXRlcyAgID0gTWF0aC5mbG9vcigoZGlzdGFuY2UgJSAoMTAwMCAqIDYwICogNjApKSAvICgxMDAwICogNjApKTtcbiAgICAgIHZhciBzZWNvbmRzICAgPSBNYXRoLmZsb29yKChkaXN0YW5jZSAlICgxMDAwICogNjApKSAvIDEwMDApO1xuICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLmNvdW50ZXInKS5pbm5lckhUTUwgPSB1bml0cyhkYXlzKSArIFwiOlwiICsgdW5pdHMoaG91cnMpICsgXCI6XCIgKyB1bml0cyhtaW51dGVzKSArIFwiOlwiICsgdW5pdHMoc2Vjb25kcyk7XG4gICAgICBpZiAoZGlzdGFuY2UgPCAwKSB7XG4gICAgICAgIGNsZWFySW50ZXJ2YWwoY2xvY2spO1xuICAgICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcuY291bnRlcicpLmlubmVySFRNTCA9IFwiTk9XIExJVkVcIiAvLyBFbmQgY291bnRkb3duIGFuZCBkaXNwbGF5IG1lc3NhZ2VcbiAgICAgIH1cbiAgICB9LCAxMDAwKTtcbiAgfTtcblxuXG4gIHZhciB1bml0cyA9IGZ1bmN0aW9uKG4pIHtcbiAgICByZXR1cm4gbiA+IDkgPyBcIlwiICsgbiA6IFwiMFwiICsgbjtcbiAgfTtcblxuICB2YXIgc2V0dXBDbG9zZUNsaWNrSGFuZGxlciA9IGZ1bmN0aW9uKCkge1xuICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5jb3VudGVyJykuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBmdW5jdGlvbiAoZSkge1xuICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgLy9kb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcuY291bnRkb3duJykuc2xpZGVVcCgpO1xuICAgICAgSkMudXRpbHMuc2V0Q29va2llKFwiY291bnRkb3duY2xvc2VkXCIsIHRydWUsIHtleHBpcmVEYXRlOiAoMzYwMCAqIDI0ICogMzY1KX0pO1xuICAgIH0pO1xuICB9O1xuXG4gIC8vRVZULm9uKCdpbml0JywgY291bnRkb3duLmluaXQpXG5cbiAgLy9pbml0KCk7XG4gIC8vcHJlbG9hZCgpO1xuXG59KShKQyk7XG4iLCJpbXBvcnQgRXZlbnRFbWl0dGVyMiBmcm9tICdldmVudGVtaXR0ZXIyJztcblxuKGZ1bmN0aW9uKGdsb2JhbCl7XG5cbiAgZ2xvYmFsLkpDID0gZ2xvYmFsLkpDICE9PSB1bmRlZmluZWQgPyBKQyA6IHt9OyAvLyBEZWNsYXJlIEdsb2JhbCBPYmplY3RcbiAgZ2xvYmFsLkVWVCA9IG5ldyBFdmVudEVtaXR0ZXIyKCk7XG5cbiAgSkMuY29tcG9uZW50cyA9IHt9O1xuICBKQy5jb25maWcgPSB7fTtcbiAgSkMubWVudSA9IHt9O1xuICBKQy51dGlscyA9IHt9O1xuXG4gIGdsb2JhbC5hZGRFdmVudExpc3RlbmVyKCdET01Db250ZW50TG9hZGVkJywgZnVuY3Rpb24oKSB7XG4gICAgRVZULmVtaXQoJ2luaXQnKTtcbiAgfSk7XG5cbiAgY29uc29sZS5sb2coSkMpO1xuXG59KSh3aW5kb3cpO1xuIiwiaW1wb3J0IHsgc2V0UG9saWN5Q29va2llIH0gZnJvbSAnLi9jb29raWVzJztcbmltcG9ydCB7IGxvYWROYW1lcyB9IGZyb20gJy4vbG9hZE5hbWVzJztcbmltcG9ydCB7IHlvdVR1YmVQbGF5ZXIgfSBmcm9tICcuL3V0aWxzJztcblxudmFyIHggPSB5b3VUdWJlUGxheWVyKCdSS1lqZFRpTWtYTScpO1xuXG4vLyBTZXQgdXAgY2xpY2sgaGFuZGxlcnNcbmZ1bmN0aW9uIGNsaWNrSGFuZGxlcnMoKSB7XG5cbiAgdmFyIGFkZGVyID0gSkMudXRpbHMuYWRkZXIoKTtcbiAgdmFyIG9wZW5PdmVybGF5ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignW3JlbD1cIm1haW5fX29wZW5PdmVybGF5XCJdJyk7XG4gIHZhciBvdmVybGF5ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLm92ZXJsYXknKVxuXG4gIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tyZWw9XCJtYWluX19sb2FkTmFtZXNcIl0nKS5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIGxvYWROYW1lcyk7XG5cbiAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcignW3JlbD1cIm1haW5fX2NsaWNrZXJcIl0nKS5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIGZ1bmN0aW9uKCkge1xuICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tyZWw9XCJtYWluX19jbGlja2VyXCJdJykuaW5uZXJIVE1MID0gYWRkZXIoKTtcbiAgfSk7XG5cbiAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLmNvb2tpZS1wb2xpY3lfX2Nsb3NlJykuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBzZXRQb2xpY3lDb29raWUpOyAvLyBDb29raWUgUG9saWN5XG5cbiAgb3ZlcmxheS5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIEpDLnV0aWxzLmNsb3NlT3ZlcmxheSk7IC8vIGNsb3NlIG92ZXJsYXlcbiAgb3Blbk92ZXJsYXkuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBKQy51dGlscy5vcGVuT3ZlcmxheSk7IC8vIG9wZW4gb3ZlcmxheVxuICBvcGVuT3ZlcmxheS5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIHgpOyAvLyBvcGVuIG92ZXJsYXlcbn1cblxuLy9FVlQub24oJ2luaXQnLCBjbGlja0hhbmRsZXJzKTtcblxuIiwiKGZ1bmN0aW9uKCkge1xuXG4gIGNvbnN0IGFuc3dlcnMgPSBbXTtcblxuICB2YXIgbWVzc2FnZURpdiA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5tZXNzYWdlJyk7XG4gIHZhciBmb3JtID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLmZvcm0nKTsgIC8vIGdyYWIgdGhlIGZvcm0gZWxlbWVudFxuXG4gIC8vIHdlbGNvbWUgbWVzc2FnZURpdlxuICBtZXNzYWdlRGl2LmlubmVySFRNTCA9IFwiV2hhdCB3b3VsZCB5b3UgbGlrZSB5b3UgdHJhaW4gdG9kYXkgYXQgdGhlIGd5bT8gQXJtcywgTGVncyBvciBCYWNrP1wiO1xuXG4gIGNvbnN0IGlucHV0RnVuYyA9IChlKT0+IHtcbiAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgdmFyIGlucHV0VmFsdWUgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbbmFtZT1pdGVtXScpLnZhbHVlLnRvVXBwZXJDYXNlKCk7ICAvLyBnZXQgdmFsdWVcbiAgICBzd2l0Y2goaW5wdXRWYWx1ZSkge1xuICAgICAgY2FzZSBcIkFSTVNcIjpcbiAgICAgICAgbWVzc2FnZURpdi5pbm5lckhUTUwgPSBcIlNvIHlvdSB3YW50IGFybXMgbGlrZSBQb3BleWUgZWg/IEFyZSB5b3UgcmVhZHkgdG8gYnVpbGQgdGhvc2UgZ3Vucz8gKFlFUyBvciBOTylcIjtcbiAgICAgICAgdmFyIHJlYWR5ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignW25hbWU9aXRlbV0nKS52YWx1ZS50b1VwcGVyQ2FzZSgpOyAgLy8gZ2V0IHZhbHVlXG4gICAgICAgIGNvbnNvbGUubG9nKHJlYWR5ICsgJyAnICsgXCJ0byByb2NrXCIpO1xuICAgICAgICAvL3ZhciB3YXJtZWRVcCA9ICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbbmFtZT1pdGVtXScpLnZhbHVlLnRvVXBwZXJDYXNlKCk7XG4gICAgICAgIC8qaWYgKHJlYWR5ID09PSAnWUVTJykge1xuICAgICAgICAgIG1lc3NhZ2VEaXYuaW5uZXJIVE1MID0gXCJXaGljaCB3YXkgdG8gdGhlIGd1biBzaG93IVwiO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIG1lc3NhZ2VEaXYuaW5uZXJIVE1MID0gXCJCdXQgZG9uJ3QgeW91IHdhbnQgdGhhdCBwZWFrIHRobz9cIjtcbiAgICAgICAgfSovXG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSBcIkxFR1NcIjpcbiAgICAgICAgbWVzc2FnZURpdi5pbm5lckhUTUwgPSBcIldhaXQgYSBtaW51dGUuIFdlIHJlYWxseSBzaG91bGQgbG9vayBpbiB0byB0aGUgZGV0YWlsc1wiO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgXCJCQUNLXCI6XG4gICAgICAgIG1lc3NhZ2VEaXYuaW5uZXJIVE1MID0gXCJnbyBzaXQgZG93biB0aGVuXCI7XG4gICAgICAgIGJyZWFrO1xuICAgICAgZGVmYXVsdDpcbiAgICAgICAgbWVzc2FnZURpdi5pbm5lckhUTUwgPSBcIllvdSdyZSByZWFsbHkgdW5kZWNpZGVkXCI7XG4gICAgfVxuXG4gICAgYW5zd2Vycy5wdXNoKGlucHV0VmFsdWUpOyAgLy8gYWRkIGlucHV0IHZhbHVlIHRvIGFycmF5XG5cbiAgICBsb2NhbFN0b3JhZ2Uuc2V0SXRlbSgnYW5zd2VycycsIEpTT04uc3RyaW5naWZ5KGFuc3dlcnMpKTsgLy8gc2F2ZSBpbnB1dCB0byBsb2NhbCBzdG9yYWdlXG4gICAgbG9jYWxTdG9yYWdlLnNldEl0ZW0oSkMudXRpbHMucmFuZG9tTnVtYmVyKCksIGlucHV0VmFsdWUpO1xuXG4gICAgdmFyIGFuc3dlcnNPYmogPSBKU09OLnBhcnNlKGxvY2FsU3RvcmFnZS5nZXRJdGVtKCdhbnN3ZXJzJykpO1xuICAgIGNvbnNvbGUubG9nKGFuc3dlcnNPYmopO1xuXG4gICAgZm9ybS5yZXNldCgpO1xuXG4gIH1cblxuICBmb3JtLmFkZEV2ZW50TGlzdGVuZXIoJ3N1Ym1pdCcsIGlucHV0RnVuYyk7XG5cbn0pKCk7XG5cblxuIiwiZXhwb3J0IGZ1bmN0aW9uIGxvYWROYW1lcygpIHtcblxuICB2YXIgcmVxdWVzdDtcblxuICBpZiAod2luZG93LlhNTEh0dHBSZXF1ZXN0KSB7XG4gICAgcmVxdWVzdCA9IG5ldyBYTUxIdHRwUmVxdWVzdCgpO1xuICB9IGVsc2Uge1xuICAgIHJlcXVlc3QgPSBuZXcgQWN0aXZlWE9iamVjdChcIk1pY3Jvc29mdC5YTUxIVFRQXCIpO1xuICB9XG5cbiAgcmVxdWVzdC5vcGVuKCdHRVQnLCAnaHR0cHM6Ly9qc29ucGxhY2Vob2xkZXIudHlwaWNvZGUuY29tL3VzZXJzJyk7XG5cbiAgcmVxdWVzdC5vbnJlYWR5c3RhdGVjaGFuZ2UgPSBmdW5jdGlvbigpIHtcbiAgICBpZiAoKHJlcXVlc3QucmVhZHlTdGF0ZSA9PT0gNCkgJiYgKHJlcXVlc3Quc3RhdHVzID09PSAyMDApKSB7XG4gICAgICB2YXIgZGF0YSA9IEpTT04ucGFyc2UocmVxdWVzdC5yZXNwb25zZVRleHQpO1xuICAgICAgbG9jYWxTdG9yYWdlLnNldEl0ZW0oJ2RhdGEnLCBKU09OLnN0cmluZ2lmeShkYXRhKSk7XG4gICAgICBjb25zb2xlLmxvZyhkYXRhKTtcblxuICAgICAgdmFyIG5hbWVzID0gJyc7XG4gICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGRhdGEubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgbmFtZXMgKz0gJzxkaXYgY2xhc3M9XCJwZXJzb25cIj4nO1xuICAgICAgICBuYW1lcyArPSAnPGg1PicgKyBkYXRhW2ldLnVzZXJuYW1lICsgXCI8L2g1PlwiO1xuICAgICAgICBuYW1lcyArPSAnPHA+JyArIGRhdGFbaV0ubmFtZSArIFwiPC9wPlwiO1xuICAgICAgICBuYW1lcyArPSAnPGk+JyArIGRhdGFbaV0uZW1haWwgKyBcIjwvaT5cIjtcbiAgICAgICAgbmFtZXMgKz0gJzwvZGl2Pic7XG4gICAgICAgIGNvbnNvbGUubG9nKGRhdGFbaV0ubmFtZSlcbiAgICAgIH1cbiAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tyZWw9Y29weVNlY3Rpb25dJykuaW5uZXJIVE1MID0gbmFtZXM7XG4gICAgfVxuICB9XG5cbiAgcmVxdWVzdC5zZW5kKCk7XG59XG5cblxuIiwiLypcbmZ1bmN0aW9uIGNvbnN0cnVjdG9yKHNwZWMpIHtcbiAgbGV0XG4gICAge21lbWJlcn0gPSBzcGVjLFxuICAgIHtvdGhlcn0gPSBvdGhlcl9jb25zdHJ1Y3RvcihzcGVjKSxcbiAgICBtZXRob2QgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAvLyBtZW1iZXIsIG90aGVyLCBtZXRob2QsIHNwZWNcbiAgICB9O1xuICByZXR1cm4gT2JqZWN0LmZyZWV6ZSh7XG4gICAgbWV0aG9kLFxuICAgIG90aGVyXG4gIH0pO1xufVxuKi9cblxuXG4vKlxuZnVuY3Rpb24gZ3JlZW4oKSB7XG4gIGxldCBhO1xuICByZXR1cm4gZnVuY3Rpb24geWVsbG93KCkge1xuICAgIGxldCBiO1xuICAgICAgICDigKYgYSDigKZcbiAg4oCmIGIg4oCmXG4gIH07XG4gICAg4oCmIGEg4oCmXG59XG4qL1xuIiwiaW1wb3J0IHsgcmFuZE51bUdlbiB9IGZyb20gJy4vdXRpbHMnO1xuaW1wb3J0IHsgdG9XZWlyZENhc2UgfSBmcm9tICcuL3dlaXJkQ2FzZSc7XG5cbihmdW5jdGlvbigpIHtcbiAgdmFyIGZpcnN0TmFtZXMgPSBbXCJiaWdcIiwgXCJvbCBkaXJ0eVwiLCBcImxpbFwiLCBcInRoZSBsZWdlbmRhcnlcIiwgXCJjaGllZlwiLCBcImJvc3NcIiwgJ3lvdW5nJywgJ3NsZWVweScsICdPRycsICdBS0EnLCAnVGhlIENoYW1wJ107XG4gIHZhciBsYXN0TmFtZXMgPSBbXCJtYWNcIiwgXCJ3aWcgd2lnXCIsIFwiYmFzdGFyZFwiLCBcIm1vdGVcIiwgXCJqb2huc29uXCIsIFwic21hc2hlclwiLCAnam9uZXMnLCAnZGF3ZycsICdhbG1pZ2h0eScsICd0aGUgaWxsZXN0JywgJ2JhZScsICdza2V6eiddO1xuXG4gIGZ1bmN0aW9uIGdldFJhbmROYW1lKGFycikge1xuICAgIHJldHVybiBhcnJbcmFuZE51bUdlbihhcnIubGVuZ3RoKV07XG4gIH1cblxuICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucmFuZE5hbWUnKS5pbm5lckhUTUwgPSB0b1dlaXJkQ2FzZShnZXRSYW5kTmFtZShmaXJzdE5hbWVzKSkgKyAnICcgKyB0b1dlaXJkQ2FzZShnZXRSYW5kTmFtZShsYXN0TmFtZXMpKTtcbn0pKCk7XG4iLCJpbXBvcnQgJy4vY29va2llcyc7XG5cbkpDLnV0aWxzLmFkZGVyID0gKCk9PiB7XG4gIHZhciBwbHVzID0gZnVuY3Rpb24oKSB7XG4gICAgdmFyIGNvdW50ZXIgPSAwO1xuICAgIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICAgIHJldHVybiBjb3VudGVyKytcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHBsdXMoKVxufVxuXG4vLyB0aGlzIGNoZWNrZXJcbkpDLnV0aWxzLnRoaXNDaGVjayA9IGZ1bmN0aW9uKCkge1xuICBjb25zb2xlLmxvZyh0aGlzKTtcbn1cblxuSkMudXRpbHMucmFuZG9tTnVtYmVyID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiBNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiAxMDAwKVxufTtcblxuSkMudXRpbHMub3V0cHV0ID0gZnVuY3Rpb24oeCkge1xuICBjb25zb2xlLmxvZyh4KTtcbn1cblxuLy8gQ2hhcmFjdGVyIGNvdW50IGluIEVsZW1lbnRcbkpDLnV0aWxzLmNoYXJzSW5FbGVtZW50ID0gZWxtID0+IHtcbiAgaWYgKGVsbS5ub2RlVHlwZSA9PSAzKSB7IC8vIFRFWFRfTk9ERVxuICAgIHJldHVybiBlbG0ubm9kZVZhbHVlLmxlbmd0aDtcbiAgfVxuICB2YXIgY291bnQgPSAwO1xuICBmb3IgKHZhciBpID0gMCwgY2hpbGQ7IGNoaWxkID0gZWxtLmNoaWxkTm9kZXNbaV07IGkrKykge1xuICAgIGNvdW50ICs9IEpDLnV0aWxzLmNoYXJzSW5FbGVtZW50KGNoaWxkKTtcbiAgfVxuICByZXR1cm4gY291bnQ7XG59XG5cbi8vIEFsZXJ0IHV0aWxpdHlcbkpDLnV0aWxzLmFsZXJ0ID0gYSA9PiB7XG4gIGFsZXJ0KGEpO1xufVxuXG5KQy51dGlscy5zaG93Qm9keUNoYXJOdW0gPSAoKSA9PiB7XG4gIHZhciBlbG0gPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdib2R5Jyk7XG4gIGNvbnNvbGUubG9nKFwiVGhpcyBwYWdlIGhhcyBcIiArIEpDLnV0aWxzLmNoYXJzSW5FbGVtZW50KGVsbSkgKyBcIiBjaGFyYWN0ZXJzIGluIHRoZSBib2R5XCIpO1xufTtcblxuSkMudXRpbHMub3Blbk92ZXJsYXkgPSAoKSA9PiAge1xuICB2YXIgb3ZlcmxheSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5vdmVybGF5Jyk7XG4gIHZhciBib2R5ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignYm9keScpO1xuICB2YXIgb3ZlcmxheUlubmVyID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLm92ZXJsYXlfX2lubmVyJyk7XG4gIG92ZXJsYXkuY2xhc3NMaXN0LnRvZ2dsZSgnb3ZlcmxheS0tb3BlbicpO1xuICBib2R5LmNsYXNzTGlzdC5hZGQoJ292ZXJsYXktLW9wZW4nKTtcbiAgb3ZlcmxheUlubmVyLmNsYXNzTGlzdC5hZGQoJ292ZXJsYXktLW9wZW4nKTtcbn1cblxuSkMudXRpbHMuY2xvc2VPdmVybGF5ID0gKCkgPT4gIHtcbiAgdmFyIG92ZXJsYXkgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcub3ZlcmxheScpO1xuICB2YXIgYm9keSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ2JvZHknKTtcbiAgdmFyIG92ZXJsYXlJbm5lciA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5vdmVybGF5X19pbm5lcicpO1xuICB2YXIgdmlkID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLnZpZGVvX193cmFwJyk7XG5cbiAgICAgIG92ZXJsYXkuY2xhc3NMaXN0LnRvZ2dsZSgnb3ZlcmxheS0tb3BlbicpO1xuICAgICAgYm9keS5jbGFzc0xpc3QudG9nZ2xlKCdvdmVybGF5LS1vcGVuJyk7XG4gICAgICBvdmVybGF5SW5uZXIuY2xhc3NMaXN0LnRvZ2dsZSgnb3ZlcmxheS0tb3BlbicpO1xuXG4gICAgICB2aWQucmVtb3ZlKCk7XG59XG5cblxuXG5leHBvcnQgZnVuY3Rpb24gcmFuZE51bUdlbihtYXgpIHtcbiAgcmV0dXJuIE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIG1heClcbn07XG5cblxuZXhwb3J0IGZ1bmN0aW9uIGNvb2xGdW5rKCkge1xuICBjb25zb2xlLmxvZygndGhpcyBsb3ZlIGlzIHRha2luZyBhIGhvbGQgb2YgbWUnKTtcbn07XG5cblxuXG5leHBvcnQgZnVuY3Rpb24geW91VHViZVBsYXllcihpZCkge1xuXG4gICAgICByZXR1cm4gZnVuY3Rpb24gKCkge1xuXG4gICAgICAgIHZhciBib2R5ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignYm9keScpO1xuXG4gICAgICAgIHZhciB2aWRlb19fd3JhcCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgICAgICB2YXIgdmlkZW9XcmFwcGVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cbiAgICAgICAgdmFyIGlmcmFtZURpdiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2lGcmFtZScpO1xuXG4gICAgICAgIGlmcmFtZURpdi5zZXRBdHRyaWJ1dGUoJ2RhdGEteW91dHViZS1pZCcsIGlkKTtcbiAgICAgICAgaWZyYW1lRGl2LnNldEF0dHJpYnV0ZSgnc3JjJywgJ2h0dHBzOi8vd3d3LnlvdXR1YmUuY29tL2VtYmVkLycgKyBpZCArICc/cmVsPTAmYW1wO2NvbnRyb2xzPTAmYW1wJyk7XG5cblxuICAgICAgICB2aWRlb19fd3JhcC5zZXRBdHRyaWJ1dGUoJ2NsYXNzJywgJ3ZpZGVvX193cmFwJyk7XG4gICAgICAgIHZpZGVvV3JhcHBlci5zZXRBdHRyaWJ1dGUoJ2NsYXNzJywgJ3ZpZGVvV3JhcHBlcicpO1xuXG4gICAgICAgIHZpZGVvX193cmFwLmFwcGVuZENoaWxkKHZpZGVvV3JhcHBlcik7XG4gICAgICAgIHZpZGVvV3JhcHBlci5hcHBlbmRDaGlsZChpZnJhbWVEaXYpO1xuXG4gICAgICAgIGJvZHkuYXBwZW5kQ2hpbGQodmlkZW9fX3dyYXApO1xuXG4gICAgICAgIGNvbnNvbGUubG9nKCdyZXR1cm4nKTtcbiAgICAgIH1cblxufTtcblxuXG5cbi8qPGlmcmFtZSB3aWR0aD1cIjEyODBcIiBoZWlnaHQ9XCI3MjBcIiBzcmM9XCJodHRwczovL3d3dy55b3V0dWJlLmNvbS9lbWJlZC9SS1lqZFRpTWtYTT9yZWw9MCZhbXA7Y29udHJvbHM9MCZhbXA7c2hvd2luZm89MFwiIGZyYW1lYm9yZGVyPVwiMFwiIGFsbG93ZnVsbHNjcmVlbj1cIlwiPjwvaWZyYW1lPiovXG4iLCJmdW5jdGlvbiBnZXRJbmRleCh2YWwsIGluZGV4KSB7XG4gIGlmIChpbmRleCAlIDIgPT0gMCkge1xuICAgIHJldHVybiB2YWwudG9VcHBlckNhc2UoKVxuICB9XG4gIGlmIChpbmRleCAlIDIgPT0gMSkge1xuICAgIHJldHVybiB2YWwudG9Mb3dlckNhc2UoKVxuICB9XG59XG5cbmZ1bmN0aW9uIHRvVXBwZXJMb3dlcihzdHJpbmcpIHtcbiAgcmV0dXJuIHN0cmluZy5zcGxpdCgnJykubWFwKGdldEluZGV4KS5qb2luKCcnKTtcbn07XG5cbmV4cG9ydCBmdW5jdGlvbiB0b1dlaXJkQ2FzZSh0ZXh0KXtcbiAgcmV0dXJuIHRleHQuc3BsaXQoJyAnKS5tYXAoZnVuY3Rpb24odmFsKSB7XG4gICAgcmV0dXJuIHRvVXBwZXJMb3dlcih2YWwpXG4gIH0pLmpvaW4oJyAnKVxuXG59XG4iXX0=
