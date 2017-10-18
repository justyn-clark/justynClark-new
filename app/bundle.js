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

require('./js/modules/sidebar');

require('./js/modules/droplet');

require('./js/modules/youtubeData');

var _handleClicks = require('./js/modules/handleClicks');

EVT.on('init', _handleClicks.clickHandlers);

},{"./js/modules/config":4,"./js/modules/droplet":6,"./js/modules/global":7,"./js/modules/handleClicks":8,"./js/modules/sidebar":9,"./js/modules/utils":10,"./js/modules/youtubeData":12}],4:[function(require,module,exports){
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
exports.clickHandlers = clickHandlers;

var _cookies = require('./cookies');

var _youTubePlayer = require('./youTubePlayer');

var _JC$helpers = JC.helpers,
    $on = _JC$helpers.$on,
    qs = _JC$helpers.qs;
function clickHandlers() {

  var logo = qs('.logo');
  var body = qs('body');
  var menuLink_1 = qs('[rel="1"]');
  var overlay = qs('.overlay');

  $on(qs('.cookie-policy__close'), 'click', _cookies.setPolicyCookie); // Cookie Policy
  $on(menuLink_1, 'click', JC.utils.openOverlay); // open overlay
  $on(overlay, 'click', JC.utils.closeOverlay); // close overlay
  $on(menuLink_1, 'click', _youTubePlayer.playRandomYouTubeVideo); // open overlay
  $on(logo, 'click', function () {
    var header = qs('.header');
    header.classList.toggle('header--open');
    if (!body.classList.contains('overlay--open')) {
      body.classList.add('overlay--open');
    } else {
      body.classList.remove('overlay--open');
    }
  });
}

},{"./cookies":5,"./youTubePlayer":11}],9:[function(require,module,exports){
'use strict';

(function () {

  var sb = document.querySelector('.sidebar');

  var sidebar = JC.components.sidebar = {
    openSidebar: function openSidebar() {
      sb.classList.add('sidebar--open');
    },
    closeSidebar: function closeSidebar() {
      sb.classList.remove('sidebar--open');
    },
    delay: function delay(callback, time) {
      setTimeout(callback, time);
    },
    interval: function interval(callback, time) {
      setInterval(callback, time);
    },
    slideToggle: function slideToggle() {
      sb.classList.toggle('sidebar--open');
    },
    init: function init() {
      //sidebar.interval(sidebar.slideToggle, 2000);
      sidebar.delay(sidebar.openSidebar, 2000);
    }
  };

  EVT.on('init', sidebar.init);
})();

},{}],10:[function(require,module,exports){
'use strict';

require('./cookies');

JC.helpers = {
  qs: function qs(selector, scope) {
    return (scope || document).querySelector(selector);
  },
  qsa: function qsa(selector, scope) {
    return (scope || document).querySelectorAll(selector);
  },
  $on: function $on(target, evt, callback, useCapture) {
    target.addEventListener(evt, callback, !!useCapture);
  }
};

JC.utils = {
  adder: function adder() {
    var increment = function increment() {
      var counter = 0;
      return function () {
        return counter = counter + 1;
      };
    };
    return increment();
  },
  thisCheck: function thisCheck() {
    console.log(this);
  },
  randomNumber: function randomNumber(len) {
    return Math.floor(Math.random() * len);
  },
  interval: function interval(callback, time) {
    setInterval(callback, time);
  },
  output: function output(x) {
    console.log(x);
  },
  charsInElement: function charsInElement(elm) {
    if (elm.nodeType == 3) {
      // TEXT_NODE
      return elm.nodeValue.length;
    }
    var count = 0;
    for (var i = 0, child; child = elm.childNodes[i]; i++) {
      count += JC.utils.charsInElement(child);
    }
    return count;
  },
  showBodyCharNum: function showBodyCharNum() {
    var elm = document.querySelector('body');
    console.log("This page has " + JC.utils.charsInElement(elm) + " characters in the body");
  },
  openOverlay: function openOverlay() {
    var overlay = document.querySelector('.overlay');
    var body = document.querySelector('body');
    var overlayInner = document.querySelector('.overlay__inner');
    overlay.classList.toggle('overlay--open');
    body.classList.add('overlay--open');
    overlayInner.classList.add('overlay--open');
  },
  closeOverlay: function closeOverlay() {
    var overlay = document.querySelector('.overlay');
    var body = document.querySelector('body');
    var overlayInner = document.querySelector('.overlay__inner');
    var vid = document.querySelector('.video__modal');
    overlay.classList.toggle('overlay--open');
    body.classList.toggle('overlay--open');
    overlayInner.classList.toggle('overlay--open');
    body.removeChild(vid);
  }
};
/*<iframe width="1280" height="720" src="https://www.youtube.com/embed/RKYjdTiMkXM?rel=0&amp;controls=0&amp;showinfo=0" frameborder="0" allowfullscreen=""></iframe>*/

},{"./cookies":5}],11:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.playRandomYouTubeVideo = playRandomYouTubeVideo;

require('./youtubeData');

var items = JC.utils.data.items;
var qs = JC.helpers.qs;


function getYouTubeIDs() {
  var ids = [];
  for (var i = 0; i < items.length; i++) {
    ids[i] = items[i].contentDetails.videoId;
  }
  return ids;
};

function youTubePlayer(id) {
  return function () {
    var body = qs('body');
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
    console.log('YouTube video player is open');
  };
}

function playRandomYouTubeVideo() {
  var ids = getYouTubeIDs(); // array
  var getRandId = ids[JC.utils.randomNumber(ids.length)];
  var playVideo = youTubePlayer(getRandId);
  playVideo();
};

},{"./youtubeData":12}],12:[function(require,module,exports){
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvZXZlbnRlbWl0dGVyMi9saWIvZXZlbnRlbWl0dGVyMi5qcyIsIm5vZGVfbW9kdWxlcy9wcm9jZXNzL2Jyb3dzZXIuanMiLCJzcmMvYXBwLmpzIiwic3JjL2pzL21vZHVsZXMvY29uZmlnLmpzIiwic3JjL2pzL21vZHVsZXMvY29va2llcy5qcyIsInNyYy9qcy9tb2R1bGVzL2Ryb3BsZXQuanMiLCJzcmMvanMvbW9kdWxlcy9nbG9iYWwuanMiLCJzcmMvanMvbW9kdWxlcy9oYW5kbGVDbGlja3MuanMiLCJzcmMvanMvbW9kdWxlcy9zaWRlYmFyLmpzIiwic3JjL2pzL21vZHVsZXMvdXRpbHMuanMiLCJzcmMvanMvbW9kdWxlcy95b3VUdWJlUGxheWVyLmpzIiwic3JjL2pzL21vZHVsZXMveW91dHViZURhdGEuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7O0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7O0FDeHdCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7O0FDeExBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUVBOztBQUVBLElBQUksRUFBSixDQUFPLE1BQVA7Ozs7O0FDVEEsSUFBTSxTQUFTLEdBQUcsTUFBSCxHQUFZLEVBQTNCO0FBQ0UsT0FBTyxPQUFQLEdBQWlC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b0I7QUFGSjtBQTlDcEIsR0F2cENPO0FBUkssQ0FBaEIiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiLyohXHJcbiAqIEV2ZW50RW1pdHRlcjJcclxuICogaHR0cHM6Ly9naXRodWIuY29tL2hpajFueC9FdmVudEVtaXR0ZXIyXHJcbiAqXHJcbiAqIENvcHlyaWdodCAoYykgMjAxMyBoaWoxbnhcclxuICogTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBsaWNlbnNlLlxyXG4gKi9cclxuOyFmdW5jdGlvbih1bmRlZmluZWQpIHtcclxuXHJcbiAgdmFyIGlzQXJyYXkgPSBBcnJheS5pc0FycmF5ID8gQXJyYXkuaXNBcnJheSA6IGZ1bmN0aW9uIF9pc0FycmF5KG9iaikge1xyXG4gICAgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChvYmopID09PSBcIltvYmplY3QgQXJyYXldXCI7XHJcbiAgfTtcclxuICB2YXIgZGVmYXVsdE1heExpc3RlbmVycyA9IDEwO1xyXG5cclxuICBmdW5jdGlvbiBpbml0KCkge1xyXG4gICAgdGhpcy5fZXZlbnRzID0ge307XHJcbiAgICBpZiAodGhpcy5fY29uZikge1xyXG4gICAgICBjb25maWd1cmUuY2FsbCh0aGlzLCB0aGlzLl9jb25mKTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIGNvbmZpZ3VyZShjb25mKSB7XHJcbiAgICBpZiAoY29uZikge1xyXG4gICAgICB0aGlzLl9jb25mID0gY29uZjtcclxuXHJcbiAgICAgIGNvbmYuZGVsaW1pdGVyICYmICh0aGlzLmRlbGltaXRlciA9IGNvbmYuZGVsaW1pdGVyKTtcclxuICAgICAgdGhpcy5fbWF4TGlzdGVuZXJzID0gY29uZi5tYXhMaXN0ZW5lcnMgIT09IHVuZGVmaW5lZCA/IGNvbmYubWF4TGlzdGVuZXJzIDogZGVmYXVsdE1heExpc3RlbmVycztcclxuXHJcbiAgICAgIGNvbmYud2lsZGNhcmQgJiYgKHRoaXMud2lsZGNhcmQgPSBjb25mLndpbGRjYXJkKTtcclxuICAgICAgY29uZi5uZXdMaXN0ZW5lciAmJiAodGhpcy5uZXdMaXN0ZW5lciA9IGNvbmYubmV3TGlzdGVuZXIpO1xyXG4gICAgICBjb25mLnZlcmJvc2VNZW1vcnlMZWFrICYmICh0aGlzLnZlcmJvc2VNZW1vcnlMZWFrID0gY29uZi52ZXJib3NlTWVtb3J5TGVhayk7XHJcblxyXG4gICAgICBpZiAodGhpcy53aWxkY2FyZCkge1xyXG4gICAgICAgIHRoaXMubGlzdGVuZXJUcmVlID0ge307XHJcbiAgICAgIH1cclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIHRoaXMuX21heExpc3RlbmVycyA9IGRlZmF1bHRNYXhMaXN0ZW5lcnM7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBsb2dQb3NzaWJsZU1lbW9yeUxlYWsoY291bnQsIGV2ZW50TmFtZSkge1xyXG4gICAgdmFyIGVycm9yTXNnID0gJyhub2RlKSB3YXJuaW5nOiBwb3NzaWJsZSBFdmVudEVtaXR0ZXIgbWVtb3J5ICcgK1xyXG4gICAgICAgICdsZWFrIGRldGVjdGVkLiAnICsgY291bnQgKyAnIGxpc3RlbmVycyBhZGRlZC4gJyArXHJcbiAgICAgICAgJ1VzZSBlbWl0dGVyLnNldE1heExpc3RlbmVycygpIHRvIGluY3JlYXNlIGxpbWl0Lic7XHJcblxyXG4gICAgaWYodGhpcy52ZXJib3NlTWVtb3J5TGVhayl7XHJcbiAgICAgIGVycm9yTXNnICs9ICcgRXZlbnQgbmFtZTogJyArIGV2ZW50TmFtZSArICcuJztcclxuICAgIH1cclxuXHJcbiAgICBpZih0eXBlb2YgcHJvY2VzcyAhPT0gJ3VuZGVmaW5lZCcgJiYgcHJvY2Vzcy5lbWl0V2FybmluZyl7XHJcbiAgICAgIHZhciBlID0gbmV3IEVycm9yKGVycm9yTXNnKTtcclxuICAgICAgZS5uYW1lID0gJ01heExpc3RlbmVyc0V4Y2VlZGVkV2FybmluZyc7XHJcbiAgICAgIGUuZW1pdHRlciA9IHRoaXM7XHJcbiAgICAgIGUuY291bnQgPSBjb3VudDtcclxuICAgICAgcHJvY2Vzcy5lbWl0V2FybmluZyhlKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIGNvbnNvbGUuZXJyb3IoZXJyb3JNc2cpO1xyXG5cclxuICAgICAgaWYgKGNvbnNvbGUudHJhY2Upe1xyXG4gICAgICAgIGNvbnNvbGUudHJhY2UoKTtcclxuICAgICAgfVxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gRXZlbnRFbWl0dGVyKGNvbmYpIHtcclxuICAgIHRoaXMuX2V2ZW50cyA9IHt9O1xyXG4gICAgdGhpcy5uZXdMaXN0ZW5lciA9IGZhbHNlO1xyXG4gICAgdGhpcy52ZXJib3NlTWVtb3J5TGVhayA9IGZhbHNlO1xyXG4gICAgY29uZmlndXJlLmNhbGwodGhpcywgY29uZik7XHJcbiAgfVxyXG4gIEV2ZW50RW1pdHRlci5FdmVudEVtaXR0ZXIyID0gRXZlbnRFbWl0dGVyOyAvLyBiYWNrd2FyZHMgY29tcGF0aWJpbGl0eSBmb3IgZXhwb3J0aW5nIEV2ZW50RW1pdHRlciBwcm9wZXJ0eVxyXG5cclxuICAvL1xyXG4gIC8vIEF0dGVudGlvbiwgZnVuY3Rpb24gcmV0dXJuIHR5cGUgbm93IGlzIGFycmF5LCBhbHdheXMgIVxyXG4gIC8vIEl0IGhhcyB6ZXJvIGVsZW1lbnRzIGlmIG5vIGFueSBtYXRjaGVzIGZvdW5kIGFuZCBvbmUgb3IgbW9yZVxyXG4gIC8vIGVsZW1lbnRzIChsZWFmcykgaWYgdGhlcmUgYXJlIG1hdGNoZXNcclxuICAvL1xyXG4gIGZ1bmN0aW9uIHNlYXJjaExpc3RlbmVyVHJlZShoYW5kbGVycywgdHlwZSwgdHJlZSwgaSkge1xyXG4gICAgaWYgKCF0cmVlKSB7XHJcbiAgICAgIHJldHVybiBbXTtcclxuICAgIH1cclxuICAgIHZhciBsaXN0ZW5lcnM9W10sIGxlYWYsIGxlbiwgYnJhbmNoLCB4VHJlZSwgeHhUcmVlLCBpc29sYXRlZEJyYW5jaCwgZW5kUmVhY2hlZCxcclxuICAgICAgICB0eXBlTGVuZ3RoID0gdHlwZS5sZW5ndGgsIGN1cnJlbnRUeXBlID0gdHlwZVtpXSwgbmV4dFR5cGUgPSB0eXBlW2krMV07XHJcbiAgICBpZiAoaSA9PT0gdHlwZUxlbmd0aCAmJiB0cmVlLl9saXN0ZW5lcnMpIHtcclxuICAgICAgLy9cclxuICAgICAgLy8gSWYgYXQgdGhlIGVuZCBvZiB0aGUgZXZlbnQocykgbGlzdCBhbmQgdGhlIHRyZWUgaGFzIGxpc3RlbmVyc1xyXG4gICAgICAvLyBpbnZva2UgdGhvc2UgbGlzdGVuZXJzLlxyXG4gICAgICAvL1xyXG4gICAgICBpZiAodHlwZW9mIHRyZWUuX2xpc3RlbmVycyA9PT0gJ2Z1bmN0aW9uJykge1xyXG4gICAgICAgIGhhbmRsZXJzICYmIGhhbmRsZXJzLnB1c2godHJlZS5fbGlzdGVuZXJzKTtcclxuICAgICAgICByZXR1cm4gW3RyZWVdO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIGZvciAobGVhZiA9IDAsIGxlbiA9IHRyZWUuX2xpc3RlbmVycy5sZW5ndGg7IGxlYWYgPCBsZW47IGxlYWYrKykge1xyXG4gICAgICAgICAgaGFuZGxlcnMgJiYgaGFuZGxlcnMucHVzaCh0cmVlLl9saXN0ZW5lcnNbbGVhZl0pO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gW3RyZWVdO1xyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKChjdXJyZW50VHlwZSA9PT0gJyonIHx8IGN1cnJlbnRUeXBlID09PSAnKionKSB8fCB0cmVlW2N1cnJlbnRUeXBlXSkge1xyXG4gICAgICAvL1xyXG4gICAgICAvLyBJZiB0aGUgZXZlbnQgZW1pdHRlZCBpcyAnKicgYXQgdGhpcyBwYXJ0XHJcbiAgICAgIC8vIG9yIHRoZXJlIGlzIGEgY29uY3JldGUgbWF0Y2ggYXQgdGhpcyBwYXRjaFxyXG4gICAgICAvL1xyXG4gICAgICBpZiAoY3VycmVudFR5cGUgPT09ICcqJykge1xyXG4gICAgICAgIGZvciAoYnJhbmNoIGluIHRyZWUpIHtcclxuICAgICAgICAgIGlmIChicmFuY2ggIT09ICdfbGlzdGVuZXJzJyAmJiB0cmVlLmhhc093blByb3BlcnR5KGJyYW5jaCkpIHtcclxuICAgICAgICAgICAgbGlzdGVuZXJzID0gbGlzdGVuZXJzLmNvbmNhdChzZWFyY2hMaXN0ZW5lclRyZWUoaGFuZGxlcnMsIHR5cGUsIHRyZWVbYnJhbmNoXSwgaSsxKSk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBsaXN0ZW5lcnM7XHJcbiAgICAgIH0gZWxzZSBpZihjdXJyZW50VHlwZSA9PT0gJyoqJykge1xyXG4gICAgICAgIGVuZFJlYWNoZWQgPSAoaSsxID09PSB0eXBlTGVuZ3RoIHx8IChpKzIgPT09IHR5cGVMZW5ndGggJiYgbmV4dFR5cGUgPT09ICcqJykpO1xyXG4gICAgICAgIGlmKGVuZFJlYWNoZWQgJiYgdHJlZS5fbGlzdGVuZXJzKSB7XHJcbiAgICAgICAgICAvLyBUaGUgbmV4dCBlbGVtZW50IGhhcyBhIF9saXN0ZW5lcnMsIGFkZCBpdCB0byB0aGUgaGFuZGxlcnMuXHJcbiAgICAgICAgICBsaXN0ZW5lcnMgPSBsaXN0ZW5lcnMuY29uY2F0KHNlYXJjaExpc3RlbmVyVHJlZShoYW5kbGVycywgdHlwZSwgdHJlZSwgdHlwZUxlbmd0aCkpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgZm9yIChicmFuY2ggaW4gdHJlZSkge1xyXG4gICAgICAgICAgaWYgKGJyYW5jaCAhPT0gJ19saXN0ZW5lcnMnICYmIHRyZWUuaGFzT3duUHJvcGVydHkoYnJhbmNoKSkge1xyXG4gICAgICAgICAgICBpZihicmFuY2ggPT09ICcqJyB8fCBicmFuY2ggPT09ICcqKicpIHtcclxuICAgICAgICAgICAgICBpZih0cmVlW2JyYW5jaF0uX2xpc3RlbmVycyAmJiAhZW5kUmVhY2hlZCkge1xyXG4gICAgICAgICAgICAgICAgbGlzdGVuZXJzID0gbGlzdGVuZXJzLmNvbmNhdChzZWFyY2hMaXN0ZW5lclRyZWUoaGFuZGxlcnMsIHR5cGUsIHRyZWVbYnJhbmNoXSwgdHlwZUxlbmd0aCkpO1xyXG4gICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICBsaXN0ZW5lcnMgPSBsaXN0ZW5lcnMuY29uY2F0KHNlYXJjaExpc3RlbmVyVHJlZShoYW5kbGVycywgdHlwZSwgdHJlZVticmFuY2hdLCBpKSk7XHJcbiAgICAgICAgICAgIH0gZWxzZSBpZihicmFuY2ggPT09IG5leHRUeXBlKSB7XHJcbiAgICAgICAgICAgICAgbGlzdGVuZXJzID0gbGlzdGVuZXJzLmNvbmNhdChzZWFyY2hMaXN0ZW5lclRyZWUoaGFuZGxlcnMsIHR5cGUsIHRyZWVbYnJhbmNoXSwgaSsyKSk7XHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgLy8gTm8gbWF0Y2ggb24gdGhpcyBvbmUsIHNoaWZ0IGludG8gdGhlIHRyZWUgYnV0IG5vdCBpbiB0aGUgdHlwZSBhcnJheS5cclxuICAgICAgICAgICAgICBsaXN0ZW5lcnMgPSBsaXN0ZW5lcnMuY29uY2F0KHNlYXJjaExpc3RlbmVyVHJlZShoYW5kbGVycywgdHlwZSwgdHJlZVticmFuY2hdLCBpKSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIGxpc3RlbmVycztcclxuICAgICAgfVxyXG5cclxuICAgICAgbGlzdGVuZXJzID0gbGlzdGVuZXJzLmNvbmNhdChzZWFyY2hMaXN0ZW5lclRyZWUoaGFuZGxlcnMsIHR5cGUsIHRyZWVbY3VycmVudFR5cGVdLCBpKzEpKTtcclxuICAgIH1cclxuXHJcbiAgICB4VHJlZSA9IHRyZWVbJyonXTtcclxuICAgIGlmICh4VHJlZSkge1xyXG4gICAgICAvL1xyXG4gICAgICAvLyBJZiB0aGUgbGlzdGVuZXIgdHJlZSB3aWxsIGFsbG93IGFueSBtYXRjaCBmb3IgdGhpcyBwYXJ0LFxyXG4gICAgICAvLyB0aGVuIHJlY3Vyc2l2ZWx5IGV4cGxvcmUgYWxsIGJyYW5jaGVzIG9mIHRoZSB0cmVlXHJcbiAgICAgIC8vXHJcbiAgICAgIHNlYXJjaExpc3RlbmVyVHJlZShoYW5kbGVycywgdHlwZSwgeFRyZWUsIGkrMSk7XHJcbiAgICB9XHJcblxyXG4gICAgeHhUcmVlID0gdHJlZVsnKionXTtcclxuICAgIGlmKHh4VHJlZSkge1xyXG4gICAgICBpZihpIDwgdHlwZUxlbmd0aCkge1xyXG4gICAgICAgIGlmKHh4VHJlZS5fbGlzdGVuZXJzKSB7XHJcbiAgICAgICAgICAvLyBJZiB3ZSBoYXZlIGEgbGlzdGVuZXIgb24gYSAnKionLCBpdCB3aWxsIGNhdGNoIGFsbCwgc28gYWRkIGl0cyBoYW5kbGVyLlxyXG4gICAgICAgICAgc2VhcmNoTGlzdGVuZXJUcmVlKGhhbmRsZXJzLCB0eXBlLCB4eFRyZWUsIHR5cGVMZW5ndGgpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gQnVpbGQgYXJyYXlzIG9mIG1hdGNoaW5nIG5leHQgYnJhbmNoZXMgYW5kIG90aGVycy5cclxuICAgICAgICBmb3IoYnJhbmNoIGluIHh4VHJlZSkge1xyXG4gICAgICAgICAgaWYoYnJhbmNoICE9PSAnX2xpc3RlbmVycycgJiYgeHhUcmVlLmhhc093blByb3BlcnR5KGJyYW5jaCkpIHtcclxuICAgICAgICAgICAgaWYoYnJhbmNoID09PSBuZXh0VHlwZSkge1xyXG4gICAgICAgICAgICAgIC8vIFdlIGtub3cgdGhlIG5leHQgZWxlbWVudCB3aWxsIG1hdGNoLCBzbyBqdW1wIHR3aWNlLlxyXG4gICAgICAgICAgICAgIHNlYXJjaExpc3RlbmVyVHJlZShoYW5kbGVycywgdHlwZSwgeHhUcmVlW2JyYW5jaF0sIGkrMik7XHJcbiAgICAgICAgICAgIH0gZWxzZSBpZihicmFuY2ggPT09IGN1cnJlbnRUeXBlKSB7XHJcbiAgICAgICAgICAgICAgLy8gQ3VycmVudCBub2RlIG1hdGNoZXMsIG1vdmUgaW50byB0aGUgdHJlZS5cclxuICAgICAgICAgICAgICBzZWFyY2hMaXN0ZW5lclRyZWUoaGFuZGxlcnMsIHR5cGUsIHh4VHJlZVticmFuY2hdLCBpKzEpO1xyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgIGlzb2xhdGVkQnJhbmNoID0ge307XHJcbiAgICAgICAgICAgICAgaXNvbGF0ZWRCcmFuY2hbYnJhbmNoXSA9IHh4VHJlZVticmFuY2hdO1xyXG4gICAgICAgICAgICAgIHNlYXJjaExpc3RlbmVyVHJlZShoYW5kbGVycywgdHlwZSwgeyAnKionOiBpc29sYXRlZEJyYW5jaCB9LCBpKzEpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICB9IGVsc2UgaWYoeHhUcmVlLl9saXN0ZW5lcnMpIHtcclxuICAgICAgICAvLyBXZSBoYXZlIHJlYWNoZWQgdGhlIGVuZCBhbmQgc3RpbGwgb24gYSAnKionXHJcbiAgICAgICAgc2VhcmNoTGlzdGVuZXJUcmVlKGhhbmRsZXJzLCB0eXBlLCB4eFRyZWUsIHR5cGVMZW5ndGgpO1xyXG4gICAgICB9IGVsc2UgaWYoeHhUcmVlWycqJ10gJiYgeHhUcmVlWycqJ10uX2xpc3RlbmVycykge1xyXG4gICAgICAgIHNlYXJjaExpc3RlbmVyVHJlZShoYW5kbGVycywgdHlwZSwgeHhUcmVlWycqJ10sIHR5cGVMZW5ndGgpO1xyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIGxpc3RlbmVycztcclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIGdyb3dMaXN0ZW5lclRyZWUodHlwZSwgbGlzdGVuZXIpIHtcclxuXHJcbiAgICB0eXBlID0gdHlwZW9mIHR5cGUgPT09ICdzdHJpbmcnID8gdHlwZS5zcGxpdCh0aGlzLmRlbGltaXRlcikgOiB0eXBlLnNsaWNlKCk7XHJcblxyXG4gICAgLy9cclxuICAgIC8vIExvb2tzIGZvciB0d28gY29uc2VjdXRpdmUgJyoqJywgaWYgc28sIGRvbid0IGFkZCB0aGUgZXZlbnQgYXQgYWxsLlxyXG4gICAgLy9cclxuICAgIGZvcih2YXIgaSA9IDAsIGxlbiA9IHR5cGUubGVuZ3RoOyBpKzEgPCBsZW47IGkrKykge1xyXG4gICAgICBpZih0eXBlW2ldID09PSAnKionICYmIHR5cGVbaSsxXSA9PT0gJyoqJykge1xyXG4gICAgICAgIHJldHVybjtcclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHZhciB0cmVlID0gdGhpcy5saXN0ZW5lclRyZWU7XHJcbiAgICB2YXIgbmFtZSA9IHR5cGUuc2hpZnQoKTtcclxuXHJcbiAgICB3aGlsZSAobmFtZSAhPT0gdW5kZWZpbmVkKSB7XHJcblxyXG4gICAgICBpZiAoIXRyZWVbbmFtZV0pIHtcclxuICAgICAgICB0cmVlW25hbWVdID0ge307XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIHRyZWUgPSB0cmVlW25hbWVdO1xyXG5cclxuICAgICAgaWYgKHR5cGUubGVuZ3RoID09PSAwKSB7XHJcblxyXG4gICAgICAgIGlmICghdHJlZS5fbGlzdGVuZXJzKSB7XHJcbiAgICAgICAgICB0cmVlLl9saXN0ZW5lcnMgPSBsaXN0ZW5lcjtcclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZSB7XHJcbiAgICAgICAgICBpZiAodHlwZW9mIHRyZWUuX2xpc3RlbmVycyA9PT0gJ2Z1bmN0aW9uJykge1xyXG4gICAgICAgICAgICB0cmVlLl9saXN0ZW5lcnMgPSBbdHJlZS5fbGlzdGVuZXJzXTtcclxuICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICB0cmVlLl9saXN0ZW5lcnMucHVzaChsaXN0ZW5lcik7XHJcblxyXG4gICAgICAgICAgaWYgKFxyXG4gICAgICAgICAgICAhdHJlZS5fbGlzdGVuZXJzLndhcm5lZCAmJlxyXG4gICAgICAgICAgICB0aGlzLl9tYXhMaXN0ZW5lcnMgPiAwICYmXHJcbiAgICAgICAgICAgIHRyZWUuX2xpc3RlbmVycy5sZW5ndGggPiB0aGlzLl9tYXhMaXN0ZW5lcnNcclxuICAgICAgICAgICkge1xyXG4gICAgICAgICAgICB0cmVlLl9saXN0ZW5lcnMud2FybmVkID0gdHJ1ZTtcclxuICAgICAgICAgICAgbG9nUG9zc2libGVNZW1vcnlMZWFrLmNhbGwodGhpcywgdHJlZS5fbGlzdGVuZXJzLmxlbmd0aCwgbmFtZSk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgICB9XHJcbiAgICAgIG5hbWUgPSB0eXBlLnNoaWZ0KCk7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gdHJ1ZTtcclxuICB9XHJcblxyXG4gIC8vIEJ5IGRlZmF1bHQgRXZlbnRFbWl0dGVycyB3aWxsIHByaW50IGEgd2FybmluZyBpZiBtb3JlIHRoYW5cclxuICAvLyAxMCBsaXN0ZW5lcnMgYXJlIGFkZGVkIHRvIGl0LiBUaGlzIGlzIGEgdXNlZnVsIGRlZmF1bHQgd2hpY2hcclxuICAvLyBoZWxwcyBmaW5kaW5nIG1lbW9yeSBsZWFrcy5cclxuICAvL1xyXG4gIC8vIE9idmlvdXNseSBub3QgYWxsIEVtaXR0ZXJzIHNob3VsZCBiZSBsaW1pdGVkIHRvIDEwLiBUaGlzIGZ1bmN0aW9uIGFsbG93c1xyXG4gIC8vIHRoYXQgdG8gYmUgaW5jcmVhc2VkLiBTZXQgdG8gemVybyBmb3IgdW5saW1pdGVkLlxyXG5cclxuICBFdmVudEVtaXR0ZXIucHJvdG90eXBlLmRlbGltaXRlciA9ICcuJztcclxuXHJcbiAgRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5zZXRNYXhMaXN0ZW5lcnMgPSBmdW5jdGlvbihuKSB7XHJcbiAgICBpZiAobiAhPT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgIHRoaXMuX21heExpc3RlbmVycyA9IG47XHJcbiAgICAgIGlmICghdGhpcy5fY29uZikgdGhpcy5fY29uZiA9IHt9O1xyXG4gICAgICB0aGlzLl9jb25mLm1heExpc3RlbmVycyA9IG47XHJcbiAgICB9XHJcbiAgfTtcclxuXHJcbiAgRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5ldmVudCA9ICcnO1xyXG5cclxuXHJcbiAgRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5vbmNlID0gZnVuY3Rpb24oZXZlbnQsIGZuKSB7XHJcbiAgICByZXR1cm4gdGhpcy5fb25jZShldmVudCwgZm4sIGZhbHNlKTtcclxuICB9O1xyXG5cclxuICBFdmVudEVtaXR0ZXIucHJvdG90eXBlLnByZXBlbmRPbmNlTGlzdGVuZXIgPSBmdW5jdGlvbihldmVudCwgZm4pIHtcclxuICAgIHJldHVybiB0aGlzLl9vbmNlKGV2ZW50LCBmbiwgdHJ1ZSk7XHJcbiAgfTtcclxuXHJcbiAgRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5fb25jZSA9IGZ1bmN0aW9uKGV2ZW50LCBmbiwgcHJlcGVuZCkge1xyXG4gICAgdGhpcy5fbWFueShldmVudCwgMSwgZm4sIHByZXBlbmQpO1xyXG4gICAgcmV0dXJuIHRoaXM7XHJcbiAgfTtcclxuXHJcbiAgRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5tYW55ID0gZnVuY3Rpb24oZXZlbnQsIHR0bCwgZm4pIHtcclxuICAgIHJldHVybiB0aGlzLl9tYW55KGV2ZW50LCB0dGwsIGZuLCBmYWxzZSk7XHJcbiAgfVxyXG5cclxuICBFdmVudEVtaXR0ZXIucHJvdG90eXBlLnByZXBlbmRNYW55ID0gZnVuY3Rpb24oZXZlbnQsIHR0bCwgZm4pIHtcclxuICAgIHJldHVybiB0aGlzLl9tYW55KGV2ZW50LCB0dGwsIGZuLCB0cnVlKTtcclxuICB9XHJcblxyXG4gIEV2ZW50RW1pdHRlci5wcm90b3R5cGUuX21hbnkgPSBmdW5jdGlvbihldmVudCwgdHRsLCBmbiwgcHJlcGVuZCkge1xyXG4gICAgdmFyIHNlbGYgPSB0aGlzO1xyXG5cclxuICAgIGlmICh0eXBlb2YgZm4gIT09ICdmdW5jdGlvbicpIHtcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdtYW55IG9ubHkgYWNjZXB0cyBpbnN0YW5jZXMgb2YgRnVuY3Rpb24nKTtcclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiBsaXN0ZW5lcigpIHtcclxuICAgICAgaWYgKC0tdHRsID09PSAwKSB7XHJcbiAgICAgICAgc2VsZi5vZmYoZXZlbnQsIGxpc3RlbmVyKTtcclxuICAgICAgfVxyXG4gICAgICByZXR1cm4gZm4uYXBwbHkodGhpcywgYXJndW1lbnRzKTtcclxuICAgIH1cclxuXHJcbiAgICBsaXN0ZW5lci5fb3JpZ2luID0gZm47XHJcblxyXG4gICAgdGhpcy5fb24oZXZlbnQsIGxpc3RlbmVyLCBwcmVwZW5kKTtcclxuXHJcbiAgICByZXR1cm4gc2VsZjtcclxuICB9O1xyXG5cclxuICBFdmVudEVtaXR0ZXIucHJvdG90eXBlLmVtaXQgPSBmdW5jdGlvbigpIHtcclxuXHJcbiAgICB0aGlzLl9ldmVudHMgfHwgaW5pdC5jYWxsKHRoaXMpO1xyXG5cclxuICAgIHZhciB0eXBlID0gYXJndW1lbnRzWzBdO1xyXG5cclxuICAgIGlmICh0eXBlID09PSAnbmV3TGlzdGVuZXInICYmICF0aGlzLm5ld0xpc3RlbmVyKSB7XHJcbiAgICAgIGlmICghdGhpcy5fZXZlbnRzLm5ld0xpc3RlbmVyKSB7XHJcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgdmFyIGFsID0gYXJndW1lbnRzLmxlbmd0aDtcclxuICAgIHZhciBhcmdzLGwsaSxqO1xyXG4gICAgdmFyIGhhbmRsZXI7XHJcblxyXG4gICAgaWYgKHRoaXMuX2FsbCAmJiB0aGlzLl9hbGwubGVuZ3RoKSB7XHJcbiAgICAgIGhhbmRsZXIgPSB0aGlzLl9hbGwuc2xpY2UoKTtcclxuICAgICAgaWYgKGFsID4gMykge1xyXG4gICAgICAgIGFyZ3MgPSBuZXcgQXJyYXkoYWwpO1xyXG4gICAgICAgIGZvciAoaiA9IDA7IGogPCBhbDsgaisrKSBhcmdzW2pdID0gYXJndW1lbnRzW2pdO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBmb3IgKGkgPSAwLCBsID0gaGFuZGxlci5sZW5ndGg7IGkgPCBsOyBpKyspIHtcclxuICAgICAgICB0aGlzLmV2ZW50ID0gdHlwZTtcclxuICAgICAgICBzd2l0Y2ggKGFsKSB7XHJcbiAgICAgICAgY2FzZSAxOlxyXG4gICAgICAgICAgaGFuZGxlcltpXS5jYWxsKHRoaXMsIHR5cGUpO1xyXG4gICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSAyOlxyXG4gICAgICAgICAgaGFuZGxlcltpXS5jYWxsKHRoaXMsIHR5cGUsIGFyZ3VtZW50c1sxXSk7XHJcbiAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIDM6XHJcbiAgICAgICAgICBoYW5kbGVyW2ldLmNhbGwodGhpcywgdHlwZSwgYXJndW1lbnRzWzFdLCBhcmd1bWVudHNbMl0pO1xyXG4gICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgIGhhbmRsZXJbaV0uYXBwbHkodGhpcywgYXJncyk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKHRoaXMud2lsZGNhcmQpIHtcclxuICAgICAgaGFuZGxlciA9IFtdO1xyXG4gICAgICB2YXIgbnMgPSB0eXBlb2YgdHlwZSA9PT0gJ3N0cmluZycgPyB0eXBlLnNwbGl0KHRoaXMuZGVsaW1pdGVyKSA6IHR5cGUuc2xpY2UoKTtcclxuICAgICAgc2VhcmNoTGlzdGVuZXJUcmVlLmNhbGwodGhpcywgaGFuZGxlciwgbnMsIHRoaXMubGlzdGVuZXJUcmVlLCAwKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIGhhbmRsZXIgPSB0aGlzLl9ldmVudHNbdHlwZV07XHJcbiAgICAgIGlmICh0eXBlb2YgaGFuZGxlciA9PT0gJ2Z1bmN0aW9uJykge1xyXG4gICAgICAgIHRoaXMuZXZlbnQgPSB0eXBlO1xyXG4gICAgICAgIHN3aXRjaCAoYWwpIHtcclxuICAgICAgICBjYXNlIDE6XHJcbiAgICAgICAgICBoYW5kbGVyLmNhbGwodGhpcyk7XHJcbiAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIDI6XHJcbiAgICAgICAgICBoYW5kbGVyLmNhbGwodGhpcywgYXJndW1lbnRzWzFdKTtcclxuICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgMzpcclxuICAgICAgICAgIGhhbmRsZXIuY2FsbCh0aGlzLCBhcmd1bWVudHNbMV0sIGFyZ3VtZW50c1syXSk7XHJcbiAgICAgICAgICBicmVhaztcclxuICAgICAgICBkZWZhdWx0OlxyXG4gICAgICAgICAgYXJncyA9IG5ldyBBcnJheShhbCAtIDEpO1xyXG4gICAgICAgICAgZm9yIChqID0gMTsgaiA8IGFsOyBqKyspIGFyZ3NbaiAtIDFdID0gYXJndW1lbnRzW2pdO1xyXG4gICAgICAgICAgaGFuZGxlci5hcHBseSh0aGlzLCBhcmdzKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgIH0gZWxzZSBpZiAoaGFuZGxlcikge1xyXG4gICAgICAgIC8vIG5lZWQgdG8gbWFrZSBjb3B5IG9mIGhhbmRsZXJzIGJlY2F1c2UgbGlzdCBjYW4gY2hhbmdlIGluIHRoZSBtaWRkbGVcclxuICAgICAgICAvLyBvZiBlbWl0IGNhbGxcclxuICAgICAgICBoYW5kbGVyID0gaGFuZGxlci5zbGljZSgpO1xyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKGhhbmRsZXIgJiYgaGFuZGxlci5sZW5ndGgpIHtcclxuICAgICAgaWYgKGFsID4gMykge1xyXG4gICAgICAgIGFyZ3MgPSBuZXcgQXJyYXkoYWwgLSAxKTtcclxuICAgICAgICBmb3IgKGogPSAxOyBqIDwgYWw7IGorKykgYXJnc1tqIC0gMV0gPSBhcmd1bWVudHNbal07XHJcbiAgICAgIH1cclxuICAgICAgZm9yIChpID0gMCwgbCA9IGhhbmRsZXIubGVuZ3RoOyBpIDwgbDsgaSsrKSB7XHJcbiAgICAgICAgdGhpcy5ldmVudCA9IHR5cGU7XHJcbiAgICAgICAgc3dpdGNoIChhbCkge1xyXG4gICAgICAgIGNhc2UgMTpcclxuICAgICAgICAgIGhhbmRsZXJbaV0uY2FsbCh0aGlzKTtcclxuICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgMjpcclxuICAgICAgICAgIGhhbmRsZXJbaV0uY2FsbCh0aGlzLCBhcmd1bWVudHNbMV0pO1xyXG4gICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSAzOlxyXG4gICAgICAgICAgaGFuZGxlcltpXS5jYWxsKHRoaXMsIGFyZ3VtZW50c1sxXSwgYXJndW1lbnRzWzJdKTtcclxuICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgICBoYW5kbGVyW2ldLmFwcGx5KHRoaXMsIGFyZ3MpO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgICByZXR1cm4gdHJ1ZTtcclxuICAgIH0gZWxzZSBpZiAoIXRoaXMuX2FsbCAmJiB0eXBlID09PSAnZXJyb3InKSB7XHJcbiAgICAgIGlmIChhcmd1bWVudHNbMV0gaW5zdGFuY2VvZiBFcnJvcikge1xyXG4gICAgICAgIHRocm93IGFyZ3VtZW50c1sxXTsgLy8gVW5oYW5kbGVkICdlcnJvcicgZXZlbnRcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJVbmNhdWdodCwgdW5zcGVjaWZpZWQgJ2Vycm9yJyBldmVudC5cIik7XHJcbiAgICAgIH1cclxuICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiAhIXRoaXMuX2FsbDtcclxuICB9O1xyXG5cclxuICBFdmVudEVtaXR0ZXIucHJvdG90eXBlLmVtaXRBc3luYyA9IGZ1bmN0aW9uKCkge1xyXG5cclxuICAgIHRoaXMuX2V2ZW50cyB8fCBpbml0LmNhbGwodGhpcyk7XHJcblxyXG4gICAgdmFyIHR5cGUgPSBhcmd1bWVudHNbMF07XHJcblxyXG4gICAgaWYgKHR5cGUgPT09ICduZXdMaXN0ZW5lcicgJiYgIXRoaXMubmV3TGlzdGVuZXIpIHtcclxuICAgICAgICBpZiAoIXRoaXMuX2V2ZW50cy5uZXdMaXN0ZW5lcikgeyByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKFtmYWxzZV0pOyB9XHJcbiAgICB9XHJcblxyXG4gICAgdmFyIHByb21pc2VzPSBbXTtcclxuXHJcbiAgICB2YXIgYWwgPSBhcmd1bWVudHMubGVuZ3RoO1xyXG4gICAgdmFyIGFyZ3MsbCxpLGo7XHJcbiAgICB2YXIgaGFuZGxlcjtcclxuXHJcbiAgICBpZiAodGhpcy5fYWxsKSB7XHJcbiAgICAgIGlmIChhbCA+IDMpIHtcclxuICAgICAgICBhcmdzID0gbmV3IEFycmF5KGFsKTtcclxuICAgICAgICBmb3IgKGogPSAxOyBqIDwgYWw7IGorKykgYXJnc1tqXSA9IGFyZ3VtZW50c1tqXTtcclxuICAgICAgfVxyXG4gICAgICBmb3IgKGkgPSAwLCBsID0gdGhpcy5fYWxsLmxlbmd0aDsgaSA8IGw7IGkrKykge1xyXG4gICAgICAgIHRoaXMuZXZlbnQgPSB0eXBlO1xyXG4gICAgICAgIHN3aXRjaCAoYWwpIHtcclxuICAgICAgICBjYXNlIDE6XHJcbiAgICAgICAgICBwcm9taXNlcy5wdXNoKHRoaXMuX2FsbFtpXS5jYWxsKHRoaXMsIHR5cGUpKTtcclxuICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgMjpcclxuICAgICAgICAgIHByb21pc2VzLnB1c2godGhpcy5fYWxsW2ldLmNhbGwodGhpcywgdHlwZSwgYXJndW1lbnRzWzFdKSk7XHJcbiAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIDM6XHJcbiAgICAgICAgICBwcm9taXNlcy5wdXNoKHRoaXMuX2FsbFtpXS5jYWxsKHRoaXMsIHR5cGUsIGFyZ3VtZW50c1sxXSwgYXJndW1lbnRzWzJdKSk7XHJcbiAgICAgICAgICBicmVhaztcclxuICAgICAgICBkZWZhdWx0OlxyXG4gICAgICAgICAgcHJvbWlzZXMucHVzaCh0aGlzLl9hbGxbaV0uYXBwbHkodGhpcywgYXJncykpO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGlmICh0aGlzLndpbGRjYXJkKSB7XHJcbiAgICAgIGhhbmRsZXIgPSBbXTtcclxuICAgICAgdmFyIG5zID0gdHlwZW9mIHR5cGUgPT09ICdzdHJpbmcnID8gdHlwZS5zcGxpdCh0aGlzLmRlbGltaXRlcikgOiB0eXBlLnNsaWNlKCk7XHJcbiAgICAgIHNlYXJjaExpc3RlbmVyVHJlZS5jYWxsKHRoaXMsIGhhbmRsZXIsIG5zLCB0aGlzLmxpc3RlbmVyVHJlZSwgMCk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICBoYW5kbGVyID0gdGhpcy5fZXZlbnRzW3R5cGVdO1xyXG4gICAgfVxyXG5cclxuICAgIGlmICh0eXBlb2YgaGFuZGxlciA9PT0gJ2Z1bmN0aW9uJykge1xyXG4gICAgICB0aGlzLmV2ZW50ID0gdHlwZTtcclxuICAgICAgc3dpdGNoIChhbCkge1xyXG4gICAgICBjYXNlIDE6XHJcbiAgICAgICAgcHJvbWlzZXMucHVzaChoYW5kbGVyLmNhbGwodGhpcykpO1xyXG4gICAgICAgIGJyZWFrO1xyXG4gICAgICBjYXNlIDI6XHJcbiAgICAgICAgcHJvbWlzZXMucHVzaChoYW5kbGVyLmNhbGwodGhpcywgYXJndW1lbnRzWzFdKSk7XHJcbiAgICAgICAgYnJlYWs7XHJcbiAgICAgIGNhc2UgMzpcclxuICAgICAgICBwcm9taXNlcy5wdXNoKGhhbmRsZXIuY2FsbCh0aGlzLCBhcmd1bWVudHNbMV0sIGFyZ3VtZW50c1syXSkpO1xyXG4gICAgICAgIGJyZWFrO1xyXG4gICAgICBkZWZhdWx0OlxyXG4gICAgICAgIGFyZ3MgPSBuZXcgQXJyYXkoYWwgLSAxKTtcclxuICAgICAgICBmb3IgKGogPSAxOyBqIDwgYWw7IGorKykgYXJnc1tqIC0gMV0gPSBhcmd1bWVudHNbal07XHJcbiAgICAgICAgcHJvbWlzZXMucHVzaChoYW5kbGVyLmFwcGx5KHRoaXMsIGFyZ3MpKTtcclxuICAgICAgfVxyXG4gICAgfSBlbHNlIGlmIChoYW5kbGVyICYmIGhhbmRsZXIubGVuZ3RoKSB7XHJcbiAgICAgIGhhbmRsZXIgPSBoYW5kbGVyLnNsaWNlKCk7XHJcbiAgICAgIGlmIChhbCA+IDMpIHtcclxuICAgICAgICBhcmdzID0gbmV3IEFycmF5KGFsIC0gMSk7XHJcbiAgICAgICAgZm9yIChqID0gMTsgaiA8IGFsOyBqKyspIGFyZ3NbaiAtIDFdID0gYXJndW1lbnRzW2pdO1xyXG4gICAgICB9XHJcbiAgICAgIGZvciAoaSA9IDAsIGwgPSBoYW5kbGVyLmxlbmd0aDsgaSA8IGw7IGkrKykge1xyXG4gICAgICAgIHRoaXMuZXZlbnQgPSB0eXBlO1xyXG4gICAgICAgIHN3aXRjaCAoYWwpIHtcclxuICAgICAgICBjYXNlIDE6XHJcbiAgICAgICAgICBwcm9taXNlcy5wdXNoKGhhbmRsZXJbaV0uY2FsbCh0aGlzKSk7XHJcbiAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIDI6XHJcbiAgICAgICAgICBwcm9taXNlcy5wdXNoKGhhbmRsZXJbaV0uY2FsbCh0aGlzLCBhcmd1bWVudHNbMV0pKTtcclxuICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgMzpcclxuICAgICAgICAgIHByb21pc2VzLnB1c2goaGFuZGxlcltpXS5jYWxsKHRoaXMsIGFyZ3VtZW50c1sxXSwgYXJndW1lbnRzWzJdKSk7XHJcbiAgICAgICAgICBicmVhaztcclxuICAgICAgICBkZWZhdWx0OlxyXG4gICAgICAgICAgcHJvbWlzZXMucHVzaChoYW5kbGVyW2ldLmFwcGx5KHRoaXMsIGFyZ3MpKTtcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgIH0gZWxzZSBpZiAoIXRoaXMuX2FsbCAmJiB0eXBlID09PSAnZXJyb3InKSB7XHJcbiAgICAgIGlmIChhcmd1bWVudHNbMV0gaW5zdGFuY2VvZiBFcnJvcikge1xyXG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdChhcmd1bWVudHNbMV0pOyAvLyBVbmhhbmRsZWQgJ2Vycm9yJyBldmVudFxyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdChcIlVuY2F1Z2h0LCB1bnNwZWNpZmllZCAnZXJyb3InIGV2ZW50LlwiKTtcclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiBQcm9taXNlLmFsbChwcm9taXNlcyk7XHJcbiAgfTtcclxuXHJcbiAgRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5vbiA9IGZ1bmN0aW9uKHR5cGUsIGxpc3RlbmVyKSB7XHJcbiAgICByZXR1cm4gdGhpcy5fb24odHlwZSwgbGlzdGVuZXIsIGZhbHNlKTtcclxuICB9O1xyXG5cclxuICBFdmVudEVtaXR0ZXIucHJvdG90eXBlLnByZXBlbmRMaXN0ZW5lciA9IGZ1bmN0aW9uKHR5cGUsIGxpc3RlbmVyKSB7XHJcbiAgICByZXR1cm4gdGhpcy5fb24odHlwZSwgbGlzdGVuZXIsIHRydWUpO1xyXG4gIH07XHJcblxyXG4gIEV2ZW50RW1pdHRlci5wcm90b3R5cGUub25BbnkgPSBmdW5jdGlvbihmbikge1xyXG4gICAgcmV0dXJuIHRoaXMuX29uQW55KGZuLCBmYWxzZSk7XHJcbiAgfTtcclxuXHJcbiAgRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5wcmVwZW5kQW55ID0gZnVuY3Rpb24oZm4pIHtcclxuICAgIHJldHVybiB0aGlzLl9vbkFueShmbiwgdHJ1ZSk7XHJcbiAgfTtcclxuXHJcbiAgRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5hZGRMaXN0ZW5lciA9IEV2ZW50RW1pdHRlci5wcm90b3R5cGUub247XHJcblxyXG4gIEV2ZW50RW1pdHRlci5wcm90b3R5cGUuX29uQW55ID0gZnVuY3Rpb24oZm4sIHByZXBlbmQpe1xyXG4gICAgaWYgKHR5cGVvZiBmbiAhPT0gJ2Z1bmN0aW9uJykge1xyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ29uQW55IG9ubHkgYWNjZXB0cyBpbnN0YW5jZXMgb2YgRnVuY3Rpb24nKTtcclxuICAgIH1cclxuXHJcbiAgICBpZiAoIXRoaXMuX2FsbCkge1xyXG4gICAgICB0aGlzLl9hbGwgPSBbXTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBBZGQgdGhlIGZ1bmN0aW9uIHRvIHRoZSBldmVudCBsaXN0ZW5lciBjb2xsZWN0aW9uLlxyXG4gICAgaWYocHJlcGVuZCl7XHJcbiAgICAgIHRoaXMuX2FsbC51bnNoaWZ0KGZuKTtcclxuICAgIH1lbHNle1xyXG4gICAgICB0aGlzLl9hbGwucHVzaChmbik7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIHRoaXM7XHJcbiAgfVxyXG5cclxuICBFdmVudEVtaXR0ZXIucHJvdG90eXBlLl9vbiA9IGZ1bmN0aW9uKHR5cGUsIGxpc3RlbmVyLCBwcmVwZW5kKSB7XHJcbiAgICBpZiAodHlwZW9mIHR5cGUgPT09ICdmdW5jdGlvbicpIHtcclxuICAgICAgdGhpcy5fb25BbnkodHlwZSwgbGlzdGVuZXIpO1xyXG4gICAgICByZXR1cm4gdGhpcztcclxuICAgIH1cclxuXHJcbiAgICBpZiAodHlwZW9mIGxpc3RlbmVyICE9PSAnZnVuY3Rpb24nKSB7XHJcbiAgICAgIHRocm93IG5ldyBFcnJvcignb24gb25seSBhY2NlcHRzIGluc3RhbmNlcyBvZiBGdW5jdGlvbicpO1xyXG4gICAgfVxyXG4gICAgdGhpcy5fZXZlbnRzIHx8IGluaXQuY2FsbCh0aGlzKTtcclxuXHJcbiAgICAvLyBUbyBhdm9pZCByZWN1cnNpb24gaW4gdGhlIGNhc2UgdGhhdCB0eXBlID09IFwibmV3TGlzdGVuZXJzXCIhIEJlZm9yZVxyXG4gICAgLy8gYWRkaW5nIGl0IHRvIHRoZSBsaXN0ZW5lcnMsIGZpcnN0IGVtaXQgXCJuZXdMaXN0ZW5lcnNcIi5cclxuICAgIHRoaXMuZW1pdCgnbmV3TGlzdGVuZXInLCB0eXBlLCBsaXN0ZW5lcik7XHJcblxyXG4gICAgaWYgKHRoaXMud2lsZGNhcmQpIHtcclxuICAgICAgZ3Jvd0xpc3RlbmVyVHJlZS5jYWxsKHRoaXMsIHR5cGUsIGxpc3RlbmVyKTtcclxuICAgICAgcmV0dXJuIHRoaXM7XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKCF0aGlzLl9ldmVudHNbdHlwZV0pIHtcclxuICAgICAgLy8gT3B0aW1pemUgdGhlIGNhc2Ugb2Ygb25lIGxpc3RlbmVyLiBEb24ndCBuZWVkIHRoZSBleHRyYSBhcnJheSBvYmplY3QuXHJcbiAgICAgIHRoaXMuX2V2ZW50c1t0eXBlXSA9IGxpc3RlbmVyO1xyXG4gICAgfVxyXG4gICAgZWxzZSB7XHJcbiAgICAgIGlmICh0eXBlb2YgdGhpcy5fZXZlbnRzW3R5cGVdID09PSAnZnVuY3Rpb24nKSB7XHJcbiAgICAgICAgLy8gQ2hhbmdlIHRvIGFycmF5LlxyXG4gICAgICAgIHRoaXMuX2V2ZW50c1t0eXBlXSA9IFt0aGlzLl9ldmVudHNbdHlwZV1dO1xyXG4gICAgICB9XHJcblxyXG4gICAgICAvLyBJZiB3ZSd2ZSBhbHJlYWR5IGdvdCBhbiBhcnJheSwganVzdCBhZGRcclxuICAgICAgaWYocHJlcGVuZCl7XHJcbiAgICAgICAgdGhpcy5fZXZlbnRzW3R5cGVdLnVuc2hpZnQobGlzdGVuZXIpO1xyXG4gICAgICB9ZWxzZXtcclxuICAgICAgICB0aGlzLl9ldmVudHNbdHlwZV0ucHVzaChsaXN0ZW5lcik7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIC8vIENoZWNrIGZvciBsaXN0ZW5lciBsZWFrXHJcbiAgICAgIGlmIChcclxuICAgICAgICAhdGhpcy5fZXZlbnRzW3R5cGVdLndhcm5lZCAmJlxyXG4gICAgICAgIHRoaXMuX21heExpc3RlbmVycyA+IDAgJiZcclxuICAgICAgICB0aGlzLl9ldmVudHNbdHlwZV0ubGVuZ3RoID4gdGhpcy5fbWF4TGlzdGVuZXJzXHJcbiAgICAgICkge1xyXG4gICAgICAgIHRoaXMuX2V2ZW50c1t0eXBlXS53YXJuZWQgPSB0cnVlO1xyXG4gICAgICAgIGxvZ1Bvc3NpYmxlTWVtb3J5TGVhay5jYWxsKHRoaXMsIHRoaXMuX2V2ZW50c1t0eXBlXS5sZW5ndGgsIHR5cGUpO1xyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIHRoaXM7XHJcbiAgfVxyXG5cclxuICBFdmVudEVtaXR0ZXIucHJvdG90eXBlLm9mZiA9IGZ1bmN0aW9uKHR5cGUsIGxpc3RlbmVyKSB7XHJcbiAgICBpZiAodHlwZW9mIGxpc3RlbmVyICE9PSAnZnVuY3Rpb24nKSB7XHJcbiAgICAgIHRocm93IG5ldyBFcnJvcigncmVtb3ZlTGlzdGVuZXIgb25seSB0YWtlcyBpbnN0YW5jZXMgb2YgRnVuY3Rpb24nKTtcclxuICAgIH1cclxuXHJcbiAgICB2YXIgaGFuZGxlcnMsbGVhZnM9W107XHJcblxyXG4gICAgaWYodGhpcy53aWxkY2FyZCkge1xyXG4gICAgICB2YXIgbnMgPSB0eXBlb2YgdHlwZSA9PT0gJ3N0cmluZycgPyB0eXBlLnNwbGl0KHRoaXMuZGVsaW1pdGVyKSA6IHR5cGUuc2xpY2UoKTtcclxuICAgICAgbGVhZnMgPSBzZWFyY2hMaXN0ZW5lclRyZWUuY2FsbCh0aGlzLCBudWxsLCBucywgdGhpcy5saXN0ZW5lclRyZWUsIDApO1xyXG4gICAgfVxyXG4gICAgZWxzZSB7XHJcbiAgICAgIC8vIGRvZXMgbm90IHVzZSBsaXN0ZW5lcnMoKSwgc28gbm8gc2lkZSBlZmZlY3Qgb2YgY3JlYXRpbmcgX2V2ZW50c1t0eXBlXVxyXG4gICAgICBpZiAoIXRoaXMuX2V2ZW50c1t0eXBlXSkgcmV0dXJuIHRoaXM7XHJcbiAgICAgIGhhbmRsZXJzID0gdGhpcy5fZXZlbnRzW3R5cGVdO1xyXG4gICAgICBsZWFmcy5wdXNoKHtfbGlzdGVuZXJzOmhhbmRsZXJzfSk7XHJcbiAgICB9XHJcblxyXG4gICAgZm9yICh2YXIgaUxlYWY9MDsgaUxlYWY8bGVhZnMubGVuZ3RoOyBpTGVhZisrKSB7XHJcbiAgICAgIHZhciBsZWFmID0gbGVhZnNbaUxlYWZdO1xyXG4gICAgICBoYW5kbGVycyA9IGxlYWYuX2xpc3RlbmVycztcclxuICAgICAgaWYgKGlzQXJyYXkoaGFuZGxlcnMpKSB7XHJcblxyXG4gICAgICAgIHZhciBwb3NpdGlvbiA9IC0xO1xyXG5cclxuICAgICAgICBmb3IgKHZhciBpID0gMCwgbGVuZ3RoID0gaGFuZGxlcnMubGVuZ3RoOyBpIDwgbGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgIGlmIChoYW5kbGVyc1tpXSA9PT0gbGlzdGVuZXIgfHxcclxuICAgICAgICAgICAgKGhhbmRsZXJzW2ldLmxpc3RlbmVyICYmIGhhbmRsZXJzW2ldLmxpc3RlbmVyID09PSBsaXN0ZW5lcikgfHxcclxuICAgICAgICAgICAgKGhhbmRsZXJzW2ldLl9vcmlnaW4gJiYgaGFuZGxlcnNbaV0uX29yaWdpbiA9PT0gbGlzdGVuZXIpKSB7XHJcbiAgICAgICAgICAgIHBvc2l0aW9uID0gaTtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBpZiAocG9zaXRpb24gPCAwKSB7XHJcbiAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmKHRoaXMud2lsZGNhcmQpIHtcclxuICAgICAgICAgIGxlYWYuX2xpc3RlbmVycy5zcGxpY2UocG9zaXRpb24sIDEpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNlIHtcclxuICAgICAgICAgIHRoaXMuX2V2ZW50c1t0eXBlXS5zcGxpY2UocG9zaXRpb24sIDEpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYgKGhhbmRsZXJzLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICAgICAgaWYodGhpcy53aWxkY2FyZCkge1xyXG4gICAgICAgICAgICBkZWxldGUgbGVhZi5fbGlzdGVuZXJzO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgICAgZWxzZSB7XHJcbiAgICAgICAgICAgIGRlbGV0ZSB0aGlzLl9ldmVudHNbdHlwZV07XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLmVtaXQoXCJyZW1vdmVMaXN0ZW5lclwiLCB0eXBlLCBsaXN0ZW5lcik7XHJcblxyXG4gICAgICAgIHJldHVybiB0aGlzO1xyXG4gICAgICB9XHJcbiAgICAgIGVsc2UgaWYgKGhhbmRsZXJzID09PSBsaXN0ZW5lciB8fFxyXG4gICAgICAgIChoYW5kbGVycy5saXN0ZW5lciAmJiBoYW5kbGVycy5saXN0ZW5lciA9PT0gbGlzdGVuZXIpIHx8XHJcbiAgICAgICAgKGhhbmRsZXJzLl9vcmlnaW4gJiYgaGFuZGxlcnMuX29yaWdpbiA9PT0gbGlzdGVuZXIpKSB7XHJcbiAgICAgICAgaWYodGhpcy53aWxkY2FyZCkge1xyXG4gICAgICAgICAgZGVsZXRlIGxlYWYuX2xpc3RlbmVycztcclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZSB7XHJcbiAgICAgICAgICBkZWxldGUgdGhpcy5fZXZlbnRzW3R5cGVdO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5lbWl0KFwicmVtb3ZlTGlzdGVuZXJcIiwgdHlwZSwgbGlzdGVuZXIpO1xyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gcmVjdXJzaXZlbHlHYXJiYWdlQ29sbGVjdChyb290KSB7XHJcbiAgICAgIGlmIChyb290ID09PSB1bmRlZmluZWQpIHtcclxuICAgICAgICByZXR1cm47XHJcbiAgICAgIH1cclxuICAgICAgdmFyIGtleXMgPSBPYmplY3Qua2V5cyhyb290KTtcclxuICAgICAgZm9yICh2YXIgaSBpbiBrZXlzKSB7XHJcbiAgICAgICAgdmFyIGtleSA9IGtleXNbaV07XHJcbiAgICAgICAgdmFyIG9iaiA9IHJvb3Rba2V5XTtcclxuICAgICAgICBpZiAoKG9iaiBpbnN0YW5jZW9mIEZ1bmN0aW9uKSB8fCAodHlwZW9mIG9iaiAhPT0gXCJvYmplY3RcIikgfHwgKG9iaiA9PT0gbnVsbCkpXHJcbiAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICBpZiAoT2JqZWN0LmtleXMob2JqKS5sZW5ndGggPiAwKSB7XHJcbiAgICAgICAgICByZWN1cnNpdmVseUdhcmJhZ2VDb2xsZWN0KHJvb3Rba2V5XSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmIChPYmplY3Qua2V5cyhvYmopLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICAgICAgZGVsZXRlIHJvb3Rba2V5XTtcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgIH1cclxuICAgIHJlY3Vyc2l2ZWx5R2FyYmFnZUNvbGxlY3QodGhpcy5saXN0ZW5lclRyZWUpO1xyXG5cclxuICAgIHJldHVybiB0aGlzO1xyXG4gIH07XHJcblxyXG4gIEV2ZW50RW1pdHRlci5wcm90b3R5cGUub2ZmQW55ID0gZnVuY3Rpb24oZm4pIHtcclxuICAgIHZhciBpID0gMCwgbCA9IDAsIGZucztcclxuICAgIGlmIChmbiAmJiB0aGlzLl9hbGwgJiYgdGhpcy5fYWxsLmxlbmd0aCA+IDApIHtcclxuICAgICAgZm5zID0gdGhpcy5fYWxsO1xyXG4gICAgICBmb3IoaSA9IDAsIGwgPSBmbnMubGVuZ3RoOyBpIDwgbDsgaSsrKSB7XHJcbiAgICAgICAgaWYoZm4gPT09IGZuc1tpXSkge1xyXG4gICAgICAgICAgZm5zLnNwbGljZShpLCAxKTtcclxuICAgICAgICAgIHRoaXMuZW1pdChcInJlbW92ZUxpc3RlbmVyQW55XCIsIGZuKTtcclxuICAgICAgICAgIHJldHVybiB0aGlzO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgfSBlbHNlIHtcclxuICAgICAgZm5zID0gdGhpcy5fYWxsO1xyXG4gICAgICBmb3IoaSA9IDAsIGwgPSBmbnMubGVuZ3RoOyBpIDwgbDsgaSsrKVxyXG4gICAgICAgIHRoaXMuZW1pdChcInJlbW92ZUxpc3RlbmVyQW55XCIsIGZuc1tpXSk7XHJcbiAgICAgIHRoaXMuX2FsbCA9IFtdO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIHRoaXM7XHJcbiAgfTtcclxuXHJcbiAgRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5yZW1vdmVMaXN0ZW5lciA9IEV2ZW50RW1pdHRlci5wcm90b3R5cGUub2ZmO1xyXG5cclxuICBFdmVudEVtaXR0ZXIucHJvdG90eXBlLnJlbW92ZUFsbExpc3RlbmVycyA9IGZ1bmN0aW9uKHR5cGUpIHtcclxuICAgIGlmIChhcmd1bWVudHMubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgICF0aGlzLl9ldmVudHMgfHwgaW5pdC5jYWxsKHRoaXMpO1xyXG4gICAgICByZXR1cm4gdGhpcztcclxuICAgIH1cclxuXHJcbiAgICBpZiAodGhpcy53aWxkY2FyZCkge1xyXG4gICAgICB2YXIgbnMgPSB0eXBlb2YgdHlwZSA9PT0gJ3N0cmluZycgPyB0eXBlLnNwbGl0KHRoaXMuZGVsaW1pdGVyKSA6IHR5cGUuc2xpY2UoKTtcclxuICAgICAgdmFyIGxlYWZzID0gc2VhcmNoTGlzdGVuZXJUcmVlLmNhbGwodGhpcywgbnVsbCwgbnMsIHRoaXMubGlzdGVuZXJUcmVlLCAwKTtcclxuXHJcbiAgICAgIGZvciAodmFyIGlMZWFmPTA7IGlMZWFmPGxlYWZzLmxlbmd0aDsgaUxlYWYrKykge1xyXG4gICAgICAgIHZhciBsZWFmID0gbGVhZnNbaUxlYWZdO1xyXG4gICAgICAgIGxlYWYuX2xpc3RlbmVycyA9IG51bGw7XHJcbiAgICAgIH1cclxuICAgIH1cclxuICAgIGVsc2UgaWYgKHRoaXMuX2V2ZW50cykge1xyXG4gICAgICB0aGlzLl9ldmVudHNbdHlwZV0gPSBudWxsO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIHRoaXM7XHJcbiAgfTtcclxuXHJcbiAgRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5saXN0ZW5lcnMgPSBmdW5jdGlvbih0eXBlKSB7XHJcbiAgICBpZiAodGhpcy53aWxkY2FyZCkge1xyXG4gICAgICB2YXIgaGFuZGxlcnMgPSBbXTtcclxuICAgICAgdmFyIG5zID0gdHlwZW9mIHR5cGUgPT09ICdzdHJpbmcnID8gdHlwZS5zcGxpdCh0aGlzLmRlbGltaXRlcikgOiB0eXBlLnNsaWNlKCk7XHJcbiAgICAgIHNlYXJjaExpc3RlbmVyVHJlZS5jYWxsKHRoaXMsIGhhbmRsZXJzLCBucywgdGhpcy5saXN0ZW5lclRyZWUsIDApO1xyXG4gICAgICByZXR1cm4gaGFuZGxlcnM7XHJcbiAgICB9XHJcblxyXG4gICAgdGhpcy5fZXZlbnRzIHx8IGluaXQuY2FsbCh0aGlzKTtcclxuXHJcbiAgICBpZiAoIXRoaXMuX2V2ZW50c1t0eXBlXSkgdGhpcy5fZXZlbnRzW3R5cGVdID0gW107XHJcbiAgICBpZiAoIWlzQXJyYXkodGhpcy5fZXZlbnRzW3R5cGVdKSkge1xyXG4gICAgICB0aGlzLl9ldmVudHNbdHlwZV0gPSBbdGhpcy5fZXZlbnRzW3R5cGVdXTtcclxuICAgIH1cclxuICAgIHJldHVybiB0aGlzLl9ldmVudHNbdHlwZV07XHJcbiAgfTtcclxuXHJcbiAgRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5ldmVudE5hbWVzID0gZnVuY3Rpb24oKXtcclxuICAgIHJldHVybiBPYmplY3Qua2V5cyh0aGlzLl9ldmVudHMpO1xyXG4gIH1cclxuXHJcbiAgRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5saXN0ZW5lckNvdW50ID0gZnVuY3Rpb24odHlwZSkge1xyXG4gICAgcmV0dXJuIHRoaXMubGlzdGVuZXJzKHR5cGUpLmxlbmd0aDtcclxuICB9O1xyXG5cclxuICBFdmVudEVtaXR0ZXIucHJvdG90eXBlLmxpc3RlbmVyc0FueSA9IGZ1bmN0aW9uKCkge1xyXG5cclxuICAgIGlmKHRoaXMuX2FsbCkge1xyXG4gICAgICByZXR1cm4gdGhpcy5fYWxsO1xyXG4gICAgfVxyXG4gICAgZWxzZSB7XHJcbiAgICAgIHJldHVybiBbXTtcclxuICAgIH1cclxuXHJcbiAgfTtcclxuXHJcbiAgaWYgKHR5cGVvZiBkZWZpbmUgPT09ICdmdW5jdGlvbicgJiYgZGVmaW5lLmFtZCkge1xyXG4gICAgIC8vIEFNRC4gUmVnaXN0ZXIgYXMgYW4gYW5vbnltb3VzIG1vZHVsZS5cclxuICAgIGRlZmluZShmdW5jdGlvbigpIHtcclxuICAgICAgcmV0dXJuIEV2ZW50RW1pdHRlcjtcclxuICAgIH0pO1xyXG4gIH0gZWxzZSBpZiAodHlwZW9mIGV4cG9ydHMgPT09ICdvYmplY3QnKSB7XHJcbiAgICAvLyBDb21tb25KU1xyXG4gICAgbW9kdWxlLmV4cG9ydHMgPSBFdmVudEVtaXR0ZXI7XHJcbiAgfVxyXG4gIGVsc2Uge1xyXG4gICAgLy8gQnJvd3NlciBnbG9iYWwuXHJcbiAgICB3aW5kb3cuRXZlbnRFbWl0dGVyMiA9IEV2ZW50RW1pdHRlcjtcclxuICB9XHJcbn0oKTtcclxuIiwiLy8gc2hpbSBmb3IgdXNpbmcgcHJvY2VzcyBpbiBicm93c2VyXG52YXIgcHJvY2VzcyA9IG1vZHVsZS5leHBvcnRzID0ge307XG5cbi8vIGNhY2hlZCBmcm9tIHdoYXRldmVyIGdsb2JhbCBpcyBwcmVzZW50IHNvIHRoYXQgdGVzdCBydW5uZXJzIHRoYXQgc3R1YiBpdFxuLy8gZG9uJ3QgYnJlYWsgdGhpbmdzLiAgQnV0IHdlIG5lZWQgdG8gd3JhcCBpdCBpbiBhIHRyeSBjYXRjaCBpbiBjYXNlIGl0IGlzXG4vLyB3cmFwcGVkIGluIHN0cmljdCBtb2RlIGNvZGUgd2hpY2ggZG9lc24ndCBkZWZpbmUgYW55IGdsb2JhbHMuICBJdCdzIGluc2lkZSBhXG4vLyBmdW5jdGlvbiBiZWNhdXNlIHRyeS9jYXRjaGVzIGRlb3B0aW1pemUgaW4gY2VydGFpbiBlbmdpbmVzLlxuXG52YXIgY2FjaGVkU2V0VGltZW91dDtcbnZhciBjYWNoZWRDbGVhclRpbWVvdXQ7XG5cbmZ1bmN0aW9uIGRlZmF1bHRTZXRUaW1vdXQoKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdzZXRUaW1lb3V0IGhhcyBub3QgYmVlbiBkZWZpbmVkJyk7XG59XG5mdW5jdGlvbiBkZWZhdWx0Q2xlYXJUaW1lb3V0ICgpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ2NsZWFyVGltZW91dCBoYXMgbm90IGJlZW4gZGVmaW5lZCcpO1xufVxuKGZ1bmN0aW9uICgpIHtcbiAgICB0cnkge1xuICAgICAgICBpZiAodHlwZW9mIHNldFRpbWVvdXQgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgIGNhY2hlZFNldFRpbWVvdXQgPSBzZXRUaW1lb3V0O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY2FjaGVkU2V0VGltZW91dCA9IGRlZmF1bHRTZXRUaW1vdXQ7XG4gICAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGNhY2hlZFNldFRpbWVvdXQgPSBkZWZhdWx0U2V0VGltb3V0O1xuICAgIH1cbiAgICB0cnkge1xuICAgICAgICBpZiAodHlwZW9mIGNsZWFyVGltZW91dCA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgY2FjaGVkQ2xlYXJUaW1lb3V0ID0gY2xlYXJUaW1lb3V0O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY2FjaGVkQ2xlYXJUaW1lb3V0ID0gZGVmYXVsdENsZWFyVGltZW91dDtcbiAgICAgICAgfVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgY2FjaGVkQ2xlYXJUaW1lb3V0ID0gZGVmYXVsdENsZWFyVGltZW91dDtcbiAgICB9XG59ICgpKVxuZnVuY3Rpb24gcnVuVGltZW91dChmdW4pIHtcbiAgICBpZiAoY2FjaGVkU2V0VGltZW91dCA9PT0gc2V0VGltZW91dCkge1xuICAgICAgICAvL25vcm1hbCBlbnZpcm9tZW50cyBpbiBzYW5lIHNpdHVhdGlvbnNcbiAgICAgICAgcmV0dXJuIHNldFRpbWVvdXQoZnVuLCAwKTtcbiAgICB9XG4gICAgLy8gaWYgc2V0VGltZW91dCB3YXNuJ3QgYXZhaWxhYmxlIGJ1dCB3YXMgbGF0dGVyIGRlZmluZWRcbiAgICBpZiAoKGNhY2hlZFNldFRpbWVvdXQgPT09IGRlZmF1bHRTZXRUaW1vdXQgfHwgIWNhY2hlZFNldFRpbWVvdXQpICYmIHNldFRpbWVvdXQpIHtcbiAgICAgICAgY2FjaGVkU2V0VGltZW91dCA9IHNldFRpbWVvdXQ7XG4gICAgICAgIHJldHVybiBzZXRUaW1lb3V0KGZ1biwgMCk7XG4gICAgfVxuICAgIHRyeSB7XG4gICAgICAgIC8vIHdoZW4gd2hlbiBzb21lYm9keSBoYXMgc2NyZXdlZCB3aXRoIHNldFRpbWVvdXQgYnV0IG5vIEkuRS4gbWFkZG5lc3NcbiAgICAgICAgcmV0dXJuIGNhY2hlZFNldFRpbWVvdXQoZnVuLCAwKTtcbiAgICB9IGNhdGNoKGUpe1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgLy8gV2hlbiB3ZSBhcmUgaW4gSS5FLiBidXQgdGhlIHNjcmlwdCBoYXMgYmVlbiBldmFsZWQgc28gSS5FLiBkb2Vzbid0IHRydXN0IHRoZSBnbG9iYWwgb2JqZWN0IHdoZW4gY2FsbGVkIG5vcm1hbGx5XG4gICAgICAgICAgICByZXR1cm4gY2FjaGVkU2V0VGltZW91dC5jYWxsKG51bGwsIGZ1biwgMCk7XG4gICAgICAgIH0gY2F0Y2goZSl7XG4gICAgICAgICAgICAvLyBzYW1lIGFzIGFib3ZlIGJ1dCB3aGVuIGl0J3MgYSB2ZXJzaW9uIG9mIEkuRS4gdGhhdCBtdXN0IGhhdmUgdGhlIGdsb2JhbCBvYmplY3QgZm9yICd0aGlzJywgaG9wZnVsbHkgb3VyIGNvbnRleHQgY29ycmVjdCBvdGhlcndpc2UgaXQgd2lsbCB0aHJvdyBhIGdsb2JhbCBlcnJvclxuICAgICAgICAgICAgcmV0dXJuIGNhY2hlZFNldFRpbWVvdXQuY2FsbCh0aGlzLCBmdW4sIDApO1xuICAgICAgICB9XG4gICAgfVxuXG5cbn1cbmZ1bmN0aW9uIHJ1bkNsZWFyVGltZW91dChtYXJrZXIpIHtcbiAgICBpZiAoY2FjaGVkQ2xlYXJUaW1lb3V0ID09PSBjbGVhclRpbWVvdXQpIHtcbiAgICAgICAgLy9ub3JtYWwgZW52aXJvbWVudHMgaW4gc2FuZSBzaXR1YXRpb25zXG4gICAgICAgIHJldHVybiBjbGVhclRpbWVvdXQobWFya2VyKTtcbiAgICB9XG4gICAgLy8gaWYgY2xlYXJUaW1lb3V0IHdhc24ndCBhdmFpbGFibGUgYnV0IHdhcyBsYXR0ZXIgZGVmaW5lZFxuICAgIGlmICgoY2FjaGVkQ2xlYXJUaW1lb3V0ID09PSBkZWZhdWx0Q2xlYXJUaW1lb3V0IHx8ICFjYWNoZWRDbGVhclRpbWVvdXQpICYmIGNsZWFyVGltZW91dCkge1xuICAgICAgICBjYWNoZWRDbGVhclRpbWVvdXQgPSBjbGVhclRpbWVvdXQ7XG4gICAgICAgIHJldHVybiBjbGVhclRpbWVvdXQobWFya2VyKTtcbiAgICB9XG4gICAgdHJ5IHtcbiAgICAgICAgLy8gd2hlbiB3aGVuIHNvbWVib2R5IGhhcyBzY3Jld2VkIHdpdGggc2V0VGltZW91dCBidXQgbm8gSS5FLiBtYWRkbmVzc1xuICAgICAgICByZXR1cm4gY2FjaGVkQ2xlYXJUaW1lb3V0KG1hcmtlcik7XG4gICAgfSBjYXRjaCAoZSl7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICAvLyBXaGVuIHdlIGFyZSBpbiBJLkUuIGJ1dCB0aGUgc2NyaXB0IGhhcyBiZWVuIGV2YWxlZCBzbyBJLkUuIGRvZXNuJ3QgIHRydXN0IHRoZSBnbG9iYWwgb2JqZWN0IHdoZW4gY2FsbGVkIG5vcm1hbGx5XG4gICAgICAgICAgICByZXR1cm4gY2FjaGVkQ2xlYXJUaW1lb3V0LmNhbGwobnVsbCwgbWFya2VyKTtcbiAgICAgICAgfSBjYXRjaCAoZSl7XG4gICAgICAgICAgICAvLyBzYW1lIGFzIGFib3ZlIGJ1dCB3aGVuIGl0J3MgYSB2ZXJzaW9uIG9mIEkuRS4gdGhhdCBtdXN0IGhhdmUgdGhlIGdsb2JhbCBvYmplY3QgZm9yICd0aGlzJywgaG9wZnVsbHkgb3VyIGNvbnRleHQgY29ycmVjdCBvdGhlcndpc2UgaXQgd2lsbCB0aHJvdyBhIGdsb2JhbCBlcnJvci5cbiAgICAgICAgICAgIC8vIFNvbWUgdmVyc2lvbnMgb2YgSS5FLiBoYXZlIGRpZmZlcmVudCBydWxlcyBmb3IgY2xlYXJUaW1lb3V0IHZzIHNldFRpbWVvdXRcbiAgICAgICAgICAgIHJldHVybiBjYWNoZWRDbGVhclRpbWVvdXQuY2FsbCh0aGlzLCBtYXJrZXIpO1xuICAgICAgICB9XG4gICAgfVxuXG5cblxufVxudmFyIHF1ZXVlID0gW107XG52YXIgZHJhaW5pbmcgPSBmYWxzZTtcbnZhciBjdXJyZW50UXVldWU7XG52YXIgcXVldWVJbmRleCA9IC0xO1xuXG5mdW5jdGlvbiBjbGVhblVwTmV4dFRpY2soKSB7XG4gICAgaWYgKCFkcmFpbmluZyB8fCAhY3VycmVudFF1ZXVlKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgZHJhaW5pbmcgPSBmYWxzZTtcbiAgICBpZiAoY3VycmVudFF1ZXVlLmxlbmd0aCkge1xuICAgICAgICBxdWV1ZSA9IGN1cnJlbnRRdWV1ZS5jb25jYXQocXVldWUpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHF1ZXVlSW5kZXggPSAtMTtcbiAgICB9XG4gICAgaWYgKHF1ZXVlLmxlbmd0aCkge1xuICAgICAgICBkcmFpblF1ZXVlKCk7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBkcmFpblF1ZXVlKCkge1xuICAgIGlmIChkcmFpbmluZykge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIHZhciB0aW1lb3V0ID0gcnVuVGltZW91dChjbGVhblVwTmV4dFRpY2spO1xuICAgIGRyYWluaW5nID0gdHJ1ZTtcblxuICAgIHZhciBsZW4gPSBxdWV1ZS5sZW5ndGg7XG4gICAgd2hpbGUobGVuKSB7XG4gICAgICAgIGN1cnJlbnRRdWV1ZSA9IHF1ZXVlO1xuICAgICAgICBxdWV1ZSA9IFtdO1xuICAgICAgICB3aGlsZSAoKytxdWV1ZUluZGV4IDwgbGVuKSB7XG4gICAgICAgICAgICBpZiAoY3VycmVudFF1ZXVlKSB7XG4gICAgICAgICAgICAgICAgY3VycmVudFF1ZXVlW3F1ZXVlSW5kZXhdLnJ1bigpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHF1ZXVlSW5kZXggPSAtMTtcbiAgICAgICAgbGVuID0gcXVldWUubGVuZ3RoO1xuICAgIH1cbiAgICBjdXJyZW50UXVldWUgPSBudWxsO1xuICAgIGRyYWluaW5nID0gZmFsc2U7XG4gICAgcnVuQ2xlYXJUaW1lb3V0KHRpbWVvdXQpO1xufVxuXG5wcm9jZXNzLm5leHRUaWNrID0gZnVuY3Rpb24gKGZ1bikge1xuICAgIHZhciBhcmdzID0gbmV3IEFycmF5KGFyZ3VtZW50cy5sZW5ndGggLSAxKTtcbiAgICBpZiAoYXJndW1lbnRzLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgZm9yICh2YXIgaSA9IDE7IGkgPCBhcmd1bWVudHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGFyZ3NbaSAtIDFdID0gYXJndW1lbnRzW2ldO1xuICAgICAgICB9XG4gICAgfVxuICAgIHF1ZXVlLnB1c2gobmV3IEl0ZW0oZnVuLCBhcmdzKSk7XG4gICAgaWYgKHF1ZXVlLmxlbmd0aCA9PT0gMSAmJiAhZHJhaW5pbmcpIHtcbiAgICAgICAgcnVuVGltZW91dChkcmFpblF1ZXVlKTtcbiAgICB9XG59O1xuXG4vLyB2OCBsaWtlcyBwcmVkaWN0aWJsZSBvYmplY3RzXG5mdW5jdGlvbiBJdGVtKGZ1biwgYXJyYXkpIHtcbiAgICB0aGlzLmZ1biA9IGZ1bjtcbiAgICB0aGlzLmFycmF5ID0gYXJyYXk7XG59XG5JdGVtLnByb3RvdHlwZS5ydW4gPSBmdW5jdGlvbiAoKSB7XG4gICAgdGhpcy5mdW4uYXBwbHkobnVsbCwgdGhpcy5hcnJheSk7XG59O1xucHJvY2Vzcy50aXRsZSA9ICdicm93c2VyJztcbnByb2Nlc3MuYnJvd3NlciA9IHRydWU7XG5wcm9jZXNzLmVudiA9IHt9O1xucHJvY2Vzcy5hcmd2ID0gW107XG5wcm9jZXNzLnZlcnNpb24gPSAnJzsgLy8gZW1wdHkgc3RyaW5nIHRvIGF2b2lkIHJlZ2V4cCBpc3N1ZXNcbnByb2Nlc3MudmVyc2lvbnMgPSB7fTtcblxuZnVuY3Rpb24gbm9vcCgpIHt9XG5cbnByb2Nlc3Mub24gPSBub29wO1xucHJvY2Vzcy5hZGRMaXN0ZW5lciA9IG5vb3A7XG5wcm9jZXNzLm9uY2UgPSBub29wO1xucHJvY2Vzcy5vZmYgPSBub29wO1xucHJvY2Vzcy5yZW1vdmVMaXN0ZW5lciA9IG5vb3A7XG5wcm9jZXNzLnJlbW92ZUFsbExpc3RlbmVycyA9IG5vb3A7XG5wcm9jZXNzLmVtaXQgPSBub29wO1xucHJvY2Vzcy5wcmVwZW5kTGlzdGVuZXIgPSBub29wO1xucHJvY2Vzcy5wcmVwZW5kT25jZUxpc3RlbmVyID0gbm9vcDtcblxucHJvY2Vzcy5saXN0ZW5lcnMgPSBmdW5jdGlvbiAobmFtZSkgeyByZXR1cm4gW10gfVxuXG5wcm9jZXNzLmJpbmRpbmcgPSBmdW5jdGlvbiAobmFtZSkge1xuICAgIHRocm93IG5ldyBFcnJvcigncHJvY2Vzcy5iaW5kaW5nIGlzIG5vdCBzdXBwb3J0ZWQnKTtcbn07XG5cbnByb2Nlc3MuY3dkID0gZnVuY3Rpb24gKCkgeyByZXR1cm4gJy8nIH07XG5wcm9jZXNzLmNoZGlyID0gZnVuY3Rpb24gKGRpcikge1xuICAgIHRocm93IG5ldyBFcnJvcigncHJvY2Vzcy5jaGRpciBpcyBub3Qgc3VwcG9ydGVkJyk7XG59O1xucHJvY2Vzcy51bWFzayA9IGZ1bmN0aW9uKCkgeyByZXR1cm4gMDsgfTtcbiIsImltcG9ydCAnLi9qcy9tb2R1bGVzL2dsb2JhbCc7XG5pbXBvcnQgJy4vanMvbW9kdWxlcy9jb25maWcnO1xuaW1wb3J0ICcuL2pzL21vZHVsZXMvdXRpbHMnO1xuaW1wb3J0ICcuL2pzL21vZHVsZXMvc2lkZWJhcic7XG5pbXBvcnQgJy4vanMvbW9kdWxlcy9kcm9wbGV0JztcbmltcG9ydCAnLi9qcy9tb2R1bGVzL3lvdXR1YmVEYXRhJztcblxuaW1wb3J0IHsgY2xpY2tIYW5kbGVycyB9IGZyb20gJy4vanMvbW9kdWxlcy9oYW5kbGVDbGlja3MnO1xuXG5FVlQub24oJ2luaXQnLCBjbGlja0hhbmRsZXJzKTtcblxuXG5cblxuIiwiY29uc3QgY29uZmlnID0gSkMuY29uZmlnID0ge307XG4gIGNvbmZpZy5wcm9qZWN0ID0gJ2p1c3R5bkNsYXJrLW5ldyc7XG4gIGNvbmZpZy5kZXZlbG9wZXIgPSAnanVzdHluIGNsYXJrJztcbiAgY29uZmlnLnZlcnNpb24gPSBcIjEuMC4wXCI7XG5cbiIsInZhciBjb29raWVNYXA7XG4vLyBDb29raWVzXG5KQy51dGlscy5nZXRDb29raWVzID0gdXBkYXRlID0+IHsgLy8gR2V0IGNvb2tpZXNcbiAgaWYoIWNvb2tpZU1hcCB8fCB1cGRhdGUpIHtcbiAgICBjb29raWVNYXAgPSB7fTtcbiAgICB2YXIgaSwgY29va2llcyA9IGRvY3VtZW50LmNvb2tpZS5zcGxpdChcIjtcIik7XG4gICAgZm9yIChpID0gMDsgaSA8IGNvb2tpZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgIHZhciBpbmRleCA9IGNvb2tpZXNbaV0uaW5kZXhPZignPScpO1xuICAgICAgdmFyIHggPSBjb29raWVzW2ldLnN1YnN0cigwLCBpbmRleCk7XG4gICAgICB2YXIgeSA9IGNvb2tpZXNbaV0uc3Vic3RyKGluZGV4ICsgMSk7XG4gICAgICB4ID0geC5yZXBsYWNlKC9eXFxzK3xcXHMrJC9nLCAnJyk7XG4gICAgICBpZih4KSBjb29raWVNYXBbeF0gPSBkZWNvZGVVUkkoeSk7XG4gICAgfVxuICB9XG4gIHJldHVybiBjb29raWVNYXA7XG59O1xuXG5KQy51dGlscy5nZXRDb29raWUgPSAoYywgdXBkYXRlKSA9PiB7IC8vIEdldCBjb29raWVcbiAgcmV0dXJuIHRoaXMuZ2V0Q29va2llcyh1cGRhdGUpW2NdO1xufTtcblxuSkMudXRpbHMuc2V0Q29va2llID0gKG5hbWUsIHZhbHVlLCBvcHRzKSA9PiB7IC8vIFNldCBjb29raWUgSkMudXRpbHMuc2V0Q29va2llKCdqY0Nvb2tpZScsdHJ1ZSwge2V4cGlyZURhdGU6ICgzNjAwICogMjQgKiAzNjUpfSk7XG4gIHZhciB2YWx1ZSA9IGVuY29kZVVSSSh2YWx1ZSk7XG4gIG9wdHMgPSBvcHRzIHx8IHt9O1xuICB2YWx1ZSArPSBcIjtwYXRoPVwiICsgKG9wdHMucGF0aCB8fCBcIi9cIik7XG4gIGlmKG9wdHMuZG9tYWluKSB2YWx1ZSArPSBcIjtkb21haW49XCIgKyBvcHRzLmRvbWFpbjtcbiAgdmFyIHQgPSB0eXBlb2Ygb3B0cy5tYXhBZ2U7XG4gIGlmKHQgPT0gXCJudW1iZXJcIiB8fCB0ID09IFwic3RyaW5nXCIpIHZhbHVlICs9IFwiO21heC1hZ2U9XCIgKyBvcHRzLm1heEFnZTtcbiAgdmFyIGUgPSBvcHRzLmV4cGlyZURhdGU7XG4gIGlmKHR5cGVvZiBlID09IFwibnVtYmVyXCIpIGUgPSBuZXcgRGF0ZSgobmV3IERhdGUoKSkuZ2V0VGltZSgpICsgZSAqIDEwMDApO1xuICBpZihlKSB2YWx1ZSArPSAnO2V4cGlyZXM9JyArIGUudG9VVENTdHJpbmcoKTtcbiAgaWYob3B0cy5zZWN1cmUpIHZhbHVlICs9IFwiO3NlY3VyZVwiO1xuICBkb2N1bWVudC5jb29raWUgPSBuYW1lICsgJz0nICsgdmFsdWU7XG4gIGNvb2tpZU1hcCA9IG51bGw7XG59O1xuXG5zZXRUaW1lb3V0KCgpPT4ge1xuICBpZiAoIWRvY3VtZW50LmNvb2tpZS5tYXRjaCgnamNDb29raWUnKSkge1xuICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5jb29raWUtcG9saWN5JykuY2xhc3NMaXN0LmFkZCgnY29va2llLXBvbGljeS0tc2hvdycpO1xuICB9IGVsc2Uge1xuICAgIGNvbnNvbGUubG9nKCdjb29raWUgcG9saWN5IGlzIGhpZGRlbicpO1xuICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5jb29raWUtcG9saWN5JykuY2xhc3NMaXN0LmFkZCgnY29va2llLXBvbGljeS0taGlkZScpO1xuICB9XG59LDEwMDApO1xuXG5leHBvcnQgZnVuY3Rpb24gc2V0UG9saWN5Q29va2llKCkge1xuICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcuY29va2llLXBvbGljeScpLmNsYXNzTGlzdC5hZGQoJ2Nvb2tpZS1wb2xpY3ktLWhpZGUnKTtcbiAgY29uc29sZS5sb2coJ2Nvb2tpZSBzZXQnKTtcbiAgSkMudXRpbHMuc2V0Q29va2llKCdqY0Nvb2tpZScsIHRydWUsIHtleHBpcmVEYXRlOiAoMzYwMCAqIDI0ICogMzY1KX0pO1xufVxuIiwiKGZ1bmN0aW9uKCkge1xuICB2YXIgZHJvcGxldCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5kcm9wbGV0JylcbiAgZHJvcGxldC5zdHlsZS5vcGFjaXR5ID0gMFxuICBmdW5jdGlvbiBmYWRlSW5Ecm9wbGV0KCkge1xuICAgIHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7XG4gICAgICBkcm9wbGV0LnN0eWxlLm9wYWNpdHkgPSAxXG4gICAgfSwgMjAwMClcbiAgfVxuICBFVlQub24oJ2luaXQnLCBmYWRlSW5Ecm9wbGV0KVxufSkoKTtcbiIsImltcG9ydCBFdmVudEVtaXR0ZXIyIGZyb20gJ2V2ZW50ZW1pdHRlcjInO1xuXG4oZnVuY3Rpb24oZ2xvYmFsKXtcblxuICBnbG9iYWwuSkMgPSBnbG9iYWwuSkMgIT09IHVuZGVmaW5lZCA/IEpDIDoge307IC8vIERlY2xhcmUgR2xvYmFsIE9iamVjdFxuICBnbG9iYWwuRVZUID0gbmV3IEV2ZW50RW1pdHRlcjIoKTtcblxuICBKQy5jb21wb25lbnRzID0ge307XG4gIEpDLmNvbmZpZyA9IHt9O1xuICBKQy5tZW51ID0ge307XG4gIEpDLnV0aWxzID0ge307XG5cbiAgZ2xvYmFsLmFkZEV2ZW50TGlzdGVuZXIoJ0RPTUNvbnRlbnRMb2FkZWQnLCBmdW5jdGlvbigpIHtcbiAgICBFVlQuZW1pdCgnaW5pdCcpO1xuICB9KTtcblxuICBjb25zb2xlLmxvZyhKQyk7XG5cbn0pKHdpbmRvdyk7XG4iLCJpbXBvcnQgeyBzZXRQb2xpY3lDb29raWUgfSBmcm9tICcuL2Nvb2tpZXMnO1xubGV0IHsgJG9uLCBxcyB9ID0gSkMuaGVscGVycyA7XG5pbXBvcnQgeyBwbGF5UmFuZG9tWW91VHViZVZpZGVvIH0gZnJvbSAnLi95b3VUdWJlUGxheWVyJztcblxuZXhwb3J0IGZ1bmN0aW9uIGNsaWNrSGFuZGxlcnMoKSB7XG5cbiAgbGV0IGxvZ28gPSBxcygnLmxvZ28nKTtcbiAgbGV0IGJvZHkgPSBxcygnYm9keScpO1xuICBsZXQgbWVudUxpbmtfMSA9IHFzKCdbcmVsPVwiMVwiXScpO1xuICBsZXQgb3ZlcmxheSA9IHFzKCcub3ZlcmxheScpO1xuXG4gICRvbihxcygnLmNvb2tpZS1wb2xpY3lfX2Nsb3NlJyksICdjbGljaycsIHNldFBvbGljeUNvb2tpZSk7IC8vIENvb2tpZSBQb2xpY3lcbiAgJG9uKG1lbnVMaW5rXzEsICdjbGljaycsIEpDLnV0aWxzLm9wZW5PdmVybGF5KTsgLy8gb3BlbiBvdmVybGF5XG4gICRvbihvdmVybGF5LCAnY2xpY2snLCBKQy51dGlscy5jbG9zZU92ZXJsYXkpOyAvLyBjbG9zZSBvdmVybGF5XG4gICRvbihtZW51TGlua18xLCAnY2xpY2snLCBwbGF5UmFuZG9tWW91VHViZVZpZGVvKTsgLy8gb3BlbiBvdmVybGF5XG4gICRvbihsb2dvLCAnY2xpY2snLCBmdW5jdGlvbiAoKSB7XG4gICAgbGV0IGhlYWRlciA9IHFzKCcuaGVhZGVyJyk7XG4gICAgaGVhZGVyLmNsYXNzTGlzdC50b2dnbGUoJ2hlYWRlci0tb3BlbicpO1xuICAgIGlmICghYm9keS5jbGFzc0xpc3QuY29udGFpbnMoJ292ZXJsYXktLW9wZW4nKSkge1xuICAgICAgYm9keS5jbGFzc0xpc3QuYWRkKCdvdmVybGF5LS1vcGVuJyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGJvZHkuY2xhc3NMaXN0LnJlbW92ZSgnb3ZlcmxheS0tb3BlbicpO1xuICAgIH1cbiAgfSk7XG59XG4iLCIoZnVuY3Rpb24oKSB7XG5cbiAgY29uc3Qgc2IgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcuc2lkZWJhcicpO1xuXG4gIHZhciBzaWRlYmFyID0gSkMuY29tcG9uZW50cy5zaWRlYmFyID0ge1xuICAgIG9wZW5TaWRlYmFyKCkge1xuICAgICAgc2IuY2xhc3NMaXN0LmFkZCgnc2lkZWJhci0tb3BlbicpO1xuICAgIH0sXG4gICAgY2xvc2VTaWRlYmFyKCkge1xuICAgICAgc2IuY2xhc3NMaXN0LnJlbW92ZSgnc2lkZWJhci0tb3BlbicpO1xuICAgIH0sXG4gICAgZGVsYXkoY2FsbGJhY2ssIHRpbWUpIHtcbiAgICAgIHNldFRpbWVvdXQoY2FsbGJhY2ssIHRpbWUpXG4gICAgfSxcbiAgICBpbnRlcnZhbChjYWxsYmFjaywgdGltZSkge1xuICAgICAgc2V0SW50ZXJ2YWwoY2FsbGJhY2ssIHRpbWUpXG4gICAgfSxcbiAgICBzbGlkZVRvZ2dsZSgpIHtcbiAgICAgIHNiLmNsYXNzTGlzdC50b2dnbGUoJ3NpZGViYXItLW9wZW4nKTtcbiAgICB9LFxuICAgIGluaXQoKSB7XG4gICAgICAvL3NpZGViYXIuaW50ZXJ2YWwoc2lkZWJhci5zbGlkZVRvZ2dsZSwgMjAwMCk7XG4gICAgICBzaWRlYmFyLmRlbGF5KHNpZGViYXIub3BlblNpZGViYXIsIDIwMDApO1xuICAgIH1cbiAgfVxuXG4gIEVWVC5vbignaW5pdCcsIHNpZGViYXIuaW5pdCk7XG5cbn0oKSk7XG4iLCJpbXBvcnQgJy4vY29va2llcyc7XG5cbkpDLmhlbHBlcnMgPSB7XG4gIHFzOiAoc2VsZWN0b3IsIHNjb3BlKSA9PiAoc2NvcGUgfHwgZG9jdW1lbnQpLnF1ZXJ5U2VsZWN0b3Ioc2VsZWN0b3IpLFxuICBxc2E6IChzZWxlY3Rvciwgc2NvcGUpID0+IChzY29wZSB8fCBkb2N1bWVudCkucXVlcnlTZWxlY3RvckFsbChzZWxlY3RvciksXG4gICRvbjogKHRhcmdldCwgZXZ0LCBjYWxsYmFjaywgdXNlQ2FwdHVyZSkgPT4ge1xuICAgIHRhcmdldC5hZGRFdmVudExpc3RlbmVyKGV2dCwgY2FsbGJhY2ssICEhdXNlQ2FwdHVyZSlcbiAgfVxufVxuXG5cbkpDLnV0aWxzID0ge1xuICBhZGRlcigpIHtcbiAgICBsZXQgaW5jcmVtZW50ID0gKCkgPT4ge1xuICAgICAgbGV0IGNvdW50ZXIgPSAwO1xuICAgICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgICAgICByZXR1cm4gY291bnRlciA9IGNvdW50ZXIgKyAxO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gaW5jcmVtZW50KClcbiAgfSxcbiAgdGhpc0NoZWNrKCkge1xuICAgIGNvbnNvbGUubG9nKHRoaXMpO1xuICB9LFxuICByYW5kb21OdW1iZXIobGVuKSB7XG4gICAgcmV0dXJuIE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIGxlbilcbiAgfSxcbiAgaW50ZXJ2YWwoY2FsbGJhY2ssIHRpbWUpIHtcbiAgICBzZXRJbnRlcnZhbChjYWxsYmFjaywgdGltZSlcbiAgfSxcbiAgb3V0cHV0KHgpIHtcbiAgICBjb25zb2xlLmxvZyh4KTtcbiAgfSxcbiAgY2hhcnNJbkVsZW1lbnQoZWxtKSB7XG4gICAgaWYgKGVsbS5ub2RlVHlwZSA9PSAzKSB7IC8vIFRFWFRfTk9ERVxuICAgICAgcmV0dXJuIGVsbS5ub2RlVmFsdWUubGVuZ3RoO1xuICAgIH1cbiAgICB2YXIgY291bnQgPSAwO1xuICAgIGZvciAodmFyIGkgPSAwLCBjaGlsZDsgY2hpbGQgPSBlbG0uY2hpbGROb2Rlc1tpXTsgaSsrKSB7XG4gICAgICBjb3VudCArPSBKQy51dGlscy5jaGFyc0luRWxlbWVudChjaGlsZCk7XG4gICAgfVxuICAgIHJldHVybiBjb3VudDtcbiAgfSxcbiAgc2hvd0JvZHlDaGFyTnVtKCkge1xuICAgIHZhciBlbG0gPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdib2R5Jyk7XG4gICAgY29uc29sZS5sb2coXCJUaGlzIHBhZ2UgaGFzIFwiICsgSkMudXRpbHMuY2hhcnNJbkVsZW1lbnQoZWxtKSArIFwiIGNoYXJhY3RlcnMgaW4gdGhlIGJvZHlcIik7XG4gIH0sXG4gIG9wZW5PdmVybGF5KCkge1xuICAgIHZhciBvdmVybGF5ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLm92ZXJsYXknKTtcbiAgICB2YXIgYm9keSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ2JvZHknKTtcbiAgICB2YXIgb3ZlcmxheUlubmVyID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLm92ZXJsYXlfX2lubmVyJyk7XG4gICAgb3ZlcmxheS5jbGFzc0xpc3QudG9nZ2xlKCdvdmVybGF5LS1vcGVuJyk7XG4gICAgYm9keS5jbGFzc0xpc3QuYWRkKCdvdmVybGF5LS1vcGVuJyk7XG4gICAgb3ZlcmxheUlubmVyLmNsYXNzTGlzdC5hZGQoJ292ZXJsYXktLW9wZW4nKTtcbiAgfSxcbiAgY2xvc2VPdmVybGF5KCkge1xuICAgIHZhciBvdmVybGF5ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLm92ZXJsYXknKTtcbiAgICB2YXIgYm9keSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ2JvZHknKTtcbiAgICB2YXIgb3ZlcmxheUlubmVyID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLm92ZXJsYXlfX2lubmVyJyk7XG4gICAgdmFyIHZpZCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy52aWRlb19fbW9kYWwnKTtcbiAgICBvdmVybGF5LmNsYXNzTGlzdC50b2dnbGUoJ292ZXJsYXktLW9wZW4nKTtcbiAgICBib2R5LmNsYXNzTGlzdC50b2dnbGUoJ292ZXJsYXktLW9wZW4nKTtcbiAgICBvdmVybGF5SW5uZXIuY2xhc3NMaXN0LnRvZ2dsZSgnb3ZlcmxheS0tb3BlbicpO1xuICAgIGJvZHkucmVtb3ZlQ2hpbGQodmlkKTtcbiAgfVxufVxuLyo8aWZyYW1lIHdpZHRoPVwiMTI4MFwiIGhlaWdodD1cIjcyMFwiIHNyYz1cImh0dHBzOi8vd3d3LnlvdXR1YmUuY29tL2VtYmVkL1JLWWpkVGlNa1hNP3JlbD0wJmFtcDtjb250cm9scz0wJmFtcDtzaG93aW5mbz0wXCIgZnJhbWVib3JkZXI9XCIwXCIgYWxsb3dmdWxsc2NyZWVuPVwiXCI+PC9pZnJhbWU+Ki9cbiIsImltcG9ydCAnLi95b3V0dWJlRGF0YSc7XG5sZXQgeyBpdGVtcyB9ID0gSkMudXRpbHMuZGF0YTtcbmxldCB7IHFzIH0gPSBKQy5oZWxwZXJzO1xuXG5mdW5jdGlvbiBnZXRZb3VUdWJlSURzKCkge1xuICBsZXQgaWRzID0gW107XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgaXRlbXMubGVuZ3RoOyBpKyspIHtcbiAgICBpZHNbaV0gPSBpdGVtc1tpXS5jb250ZW50RGV0YWlscy52aWRlb0lkO1xuICB9XG4gIHJldHVybiBpZHM7XG59O1xuXG5mdW5jdGlvbiB5b3VUdWJlUGxheWVyKGlkKSB7XG4gIHJldHVybiBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIGJvZHkgPSBxcygnYm9keScpO1xuICAgIHZhciB2aWRlb19fbW9kYWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICB2YXIgaWZyYW1lV3JhcHBlciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgIHZhciBpZnJhbWVEaXYgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdpRnJhbWUnKTtcbiAgICAgICAgaWZyYW1lRGl2LnNldEF0dHJpYnV0ZSgnZGF0YS15b3V0dWJlLWlkJywgaWQpO1xuICAgICAgICBpZnJhbWVEaXYuc2V0QXR0cmlidXRlKCdzcmMnLCAnaHR0cHM6Ly93d3cueW91dHViZS5jb20vZW1iZWQvJyArIGlkICsgJz9yZWw9MCZhbXA7Y29udHJvbHM9MCZhbXAnKTtcbiAgICAgICAgdmlkZW9fX21vZGFsLnNldEF0dHJpYnV0ZSgnY2xhc3MnLCAndmlkZW9fX21vZGFsJyk7XG4gICAgICAgIGlmcmFtZVdyYXBwZXIuc2V0QXR0cmlidXRlKCdjbGFzcycsICdpZnJhbWVXcmFwcGVyJyk7XG4gICAgICAgIHZpZGVvX19tb2RhbC5hcHBlbmRDaGlsZChpZnJhbWVXcmFwcGVyKTtcbiAgICAgICAgaWZyYW1lV3JhcHBlci5hcHBlbmRDaGlsZChpZnJhbWVEaXYpO1xuICAgICAgICBib2R5LmFwcGVuZENoaWxkKHZpZGVvX19tb2RhbCk7XG4gICAgICAgIGNvbnNvbGUubG9nKCdZb3VUdWJlIHZpZGVvIHBsYXllciBpcyBvcGVuJyk7XG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHBsYXlSYW5kb21Zb3VUdWJlVmlkZW8oKSB7XG4gIGxldCBpZHMgPSBnZXRZb3VUdWJlSURzKCk7IC8vIGFycmF5XG4gIGxldCBnZXRSYW5kSWQgPSBpZHNbSkMudXRpbHMucmFuZG9tTnVtYmVyKGlkcy5sZW5ndGgpXTtcbiAgbGV0IHBsYXlWaWRlbyA9IHlvdVR1YmVQbGF5ZXIoZ2V0UmFuZElkKTtcbiAgcGxheVZpZGVvKCk7XG59O1xuIiwiSkMudXRpbHMuZGF0YSA9IHtcbiAgXCJraW5kXCI6IFwieW91dHViZSNwbGF5bGlzdEl0ZW1MaXN0UmVzcG9uc2VcIixcbiAgXCJldGFnXCI6IFwiXFxcImNiejNsSVEyTjI1QWZ3TnItQmR4VVZ4Sl9RWS9obGNnSVhEQURDLXExRkkxR1BzS0tOdm92YU1cXFwiXCIsXG4gIFwibmV4dFBhZ2VUb2tlblwiOiBcIkNCa1FBQVwiLFxuICBcInBhZ2VJbmZvXCI6IHtcbiAgICBcInRvdGFsUmVzdWx0c1wiOiA0MSxcbiAgICBcInJlc3VsdHNQZXJQYWdlXCI6IDI1XG4gIH0sXG4gIFwiaXRlbXNcIjogW1xuICAgIHtcbiAgICAgIFwia2luZFwiOiBcInlvdXR1YmUjcGxheWxpc3RJdGVtXCIsXG4gICAgICBcImV0YWdcIjogXCJcXFwiY2J6M2xJUTJOMjVBZndOci1CZHhVVnhKX1FZL0JuaVpXbDZVckYyejYxQzNCMHR2TnRyQmpEZ1xcXCJcIixcbiAgICAgIFwiaWRcIjogXCJVRXhSWVVwRWQweFllVUowV0hJeFJtVXlSbEo2U1dSVU0xSkdaVWMxTWxGV1JpNDFOa0kwTkVZMlJERXdOVFUzUTBNMlwiLFxuICAgICAgXCJzbmlwcGV0XCI6IHtcbiAgICAgICAgXCJwdWJsaXNoZWRBdFwiOiBcIjIwMTUtMDItMThUMDU6NTc6MzEuMDAwWlwiLFxuICAgICAgICBcImNoYW5uZWxJZFwiOiBcIlVDVk00QzFmQjlRY3d5N2ROamJYZVVWd1wiLFxuICAgICAgICBcInRpdGxlXCI6IFwiTGVhcm5pbmcgaG93IHRvIHVzZSBqUXVlcnkgQUpBWCB3aXRoIFBIUFwiLFxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiR2V0dGluZyBzdGFydGVkIHdpdGggQUpBWCBpcyBzdXBlciBlYXN5IHdoZW4geW91IHVzZSB0aGUgalF1ZXJ5IGxpYnJhcnkuIFRoYXQgd29ya3Mgd2VsbCBmb3IgdGhlIGNsaWVudCBzaWRlLCBidXQgaG93IGRvIHlvdSB3b3JrIHdpdGggYSBzZXJ2ZXIgc2lkZSBsYW5ndWFnZSBsaWtlIFBIUD8gSXQncyBlYXNpZXIgdGhhbiB5b3UgdGhpbmsuXCIsXG4gICAgICAgIFwidGh1bWJuYWlsc1wiOiB7XG4gICAgICAgICAgXCJkZWZhdWx0XCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9UUjBna0diTXdXMC9kZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiAxMjAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiA5MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJtZWRpdW1cIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL1RSMGdrR2JNd1cwL21xZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogMzIwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogMTgwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImhpZ2hcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL1RSMGdrR2JNd1cwL2hxZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogNDgwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogMzYwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInN0YW5kYXJkXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9UUjBna0diTXdXMC9zZGRlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDY0MCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDQ4MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJtYXhyZXNcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL1RSMGdrR2JNd1cwL21heHJlc2RlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDEyODAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiA3MjBcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIFwiY2hhbm5lbFRpdGxlXCI6IFwiSnVzdHluIENsYXJrXCIsXG4gICAgICAgIFwicGxheWxpc3RJZFwiOiBcIlBMUWFKRHdMWHlCdFhyMUZlMkZSeklkVDNSRmVHNTJRVkZcIixcbiAgICAgICAgXCJwb3NpdGlvblwiOiAwLFxuICAgICAgICBcInJlc291cmNlSWRcIjoge1xuICAgICAgICAgIFwia2luZFwiOiBcInlvdXR1YmUjdmlkZW9cIixcbiAgICAgICAgICBcInZpZGVvSWRcIjogXCJUUjBna0diTXdXMFwiXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcImNvbnRlbnREZXRhaWxzXCI6IHtcbiAgICAgICAgXCJ2aWRlb0lkXCI6IFwiVFIwZ2tHYk13VzBcIixcbiAgICAgICAgXCJ2aWRlb1B1Ymxpc2hlZEF0XCI6IFwiMjAxMy0wMS0wMVQwMjozNTo1MC4wMDBaXCJcbiAgICAgIH1cbiAgICB9LFxuICAgIHtcbiAgICAgIFwia2luZFwiOiBcInlvdXR1YmUjcGxheWxpc3RJdGVtXCIsXG4gICAgICBcImV0YWdcIjogXCJcXFwiY2J6M2xJUTJOMjVBZndOci1CZHhVVnhKX1FZL3JBWEVhbnhic0tWVUlCZWpaZzVmbXNpV3lYY1xcXCJcIixcbiAgICAgIFwiaWRcIjogXCJVRXhSWVVwRWQweFllVUowV0hJeFJtVXlSbEo2U1dSVU0xSkdaVWMxTWxGV1JpNHlPRGxHTkVFME5rUkdNRUV6TUVReVwiLFxuICAgICAgXCJzbmlwcGV0XCI6IHtcbiAgICAgICAgXCJwdWJsaXNoZWRBdFwiOiBcIjIwMTUtMDItMjdUMTg6MzY6NDkuMDAwWlwiLFxuICAgICAgICBcImNoYW5uZWxJZFwiOiBcIlVDVk00QzFmQjlRY3d5N2ROamJYZVVWd1wiLFxuICAgICAgICBcInRpdGxlXCI6IFwiR2l0aHViIFR1dG9yaWFsIEZvciBCZWdpbm5lcnMgLSBHaXRodWIgQmFzaWNzIGZvciBNYWMgb3IgV2luZG93cyAmIFNvdXJjZSBDb250cm9sIEJhc2ljc1wiLFxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiR2l0aHViIFR1dG9yaWFsIEZvciBCZWdpbm5lcnMgLSBsZWFybiBHaXRodWIgZm9yIE1hYyBvciBHaXRodWIgZm9yIHdpbmRvd3NcXG5JZiB5b3UndmUgYmVlbiB3YW50aW5nIHRvIGxlYXJuIEdpdGh1Yiwgbm93J3MgdGhlIHBlcmZlY3QgdGltZSEgIEdpdGh1YiBpcyBzZWVuIGFzIGEgYmlnIHJlcXVpcmVtZW50IGJ5IG1vc3QgZW1wbG95ZXJzIHRoZXNlIGRheXMgYW5kIGlzIHZlcnkgY3JpdGljYWwgdG8gYnVzaW5lc3Mgd29ya2Zsb3cuICBUaGlzIEdpdGh1YiB0dXRvcmlhbCB3aWxsIGNvdmVyIHRoZSBiYXNpY3Mgb2YgaG93IHRvIHVzZSBHaXRodWIgYW5kIHRoZSBjb21tYW5kIGxpbmUuXFxuXFxuTGVzc29uICMyOiBQdWxsIHJlcXVlc3RzLCBCcmFuY2hpbmcgbWVyZ2luZ1xcbmh0dHBzOi8vd3d3LnlvdXR1YmUuY29tL3dhdGNoP3Y9b0ZZeVRad015QWdcXG5cXG5PdGhlciBWaWRlb3M6XFxualF1ZXJ5IHJhcGlkLWxlYXJuaW5nIENvdXJzZVxcbmh0dHBzOi8vd3d3LnlvdXR1YmUuY29tL3dhdGNoP3Y9aE14R2hITk9rQ1VcIixcbiAgICAgICAgXCJ0aHVtYm5haWxzXCI6IHtcbiAgICAgICAgICBcImRlZmF1bHRcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpLzBmS2c3ZTM3YlFFL2RlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDEyMCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDkwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcIm1lZGl1bVwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvMGZLZzdlMzdiUUUvbXFkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiAzMjAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiAxODBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiaGlnaFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvMGZLZzdlMzdiUUUvaHFkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiA0ODAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiAzNjBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwic3RhbmRhcmRcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpLzBmS2c3ZTM3YlFFL3NkZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogNjQwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogNDgwXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcImNoYW5uZWxUaXRsZVwiOiBcIkp1c3R5biBDbGFya1wiLFxuICAgICAgICBcInBsYXlsaXN0SWRcIjogXCJQTFFhSkR3TFh5QnRYcjFGZTJGUnpJZFQzUkZlRzUyUVZGXCIsXG4gICAgICAgIFwicG9zaXRpb25cIjogMSxcbiAgICAgICAgXCJyZXNvdXJjZUlkXCI6IHtcbiAgICAgICAgICBcImtpbmRcIjogXCJ5b3V0dWJlI3ZpZGVvXCIsXG4gICAgICAgICAgXCJ2aWRlb0lkXCI6IFwiMGZLZzdlMzdiUUVcIlxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgXCJjb250ZW50RGV0YWlsc1wiOiB7XG4gICAgICAgIFwidmlkZW9JZFwiOiBcIjBmS2c3ZTM3YlFFXCIsXG4gICAgICAgIFwidmlkZW9QdWJsaXNoZWRBdFwiOiBcIjIwMTQtMDEtMTZUMjA6MDU6MjcuMDAwWlwiXG4gICAgICB9XG4gICAgfSxcbiAgICB7XG4gICAgICBcImtpbmRcIjogXCJ5b3V0dWJlI3BsYXlsaXN0SXRlbVwiLFxuICAgICAgXCJldGFnXCI6IFwiXFxcImNiejNsSVEyTjI1QWZ3TnItQmR4VVZ4Sl9RWS9CZUZ1N2tVYVNKSEg5akc4UDNFN2tEZ3hUQUVcXFwiXCIsXG4gICAgICBcImlkXCI6IFwiVUV4UllVcEVkMHhZZVVKMFdISXhSbVV5UmxKNlNXUlVNMUpHWlVjMU1sRldSaTR3TVRjeU1EaEdRVUU0TlRJek0wWTVcIixcbiAgICAgIFwic25pcHBldFwiOiB7XG4gICAgICAgIFwicHVibGlzaGVkQXRcIjogXCIyMDE1LTAzLTAyVDIyOjQ3OjA4LjAwMFpcIixcbiAgICAgICAgXCJjaGFubmVsSWRcIjogXCJVQ1ZNNEMxZkI5UWN3eTdkTmpiWGVVVndcIixcbiAgICAgICAgXCJ0aXRsZVwiOiBcIkFuZ3VsYXJKUyBUdXRvcmlhbFwiLFxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiQSB2aWRlbyB0dXRvcmlhbCB0byBoZWxwIHlvdSBnZXQgc3RhcnRlZCB3aXRoIEFuZ3VsYXJKUy4gWW91IGNhbiBwbGF5IGFyb3VuZCB3aXRoIHRoZSBmaW5hbCByZXN1bHQgaW4gdGhlIGZvbGxvd2luZyBqc2ZpZGRsZTpcXG5cXG5odHRwOi8vanNmaWRkbGUubmV0L2pvaG5saW5kcXVpc3QvVTNjMlEvXFxuXFxuUGxlYXNlIHRha2UgYW55IHRlY2huaWNhbCBxdWVzdGlvbnMgYWJvdXQgQW5ndWxhckpTIHRvIHRoZSB2ZXJ5IGFjdGl2ZSBhbmQgaGVscGZ1bCBBbmd1bGFySlMgbWFpbGluZyBsaXN0Olxcbmh0dHBzOi8vZ3JvdXBzLmdvb2dsZS5jb20vZm9ydW0vP2Zyb21ncm91cHMjIWZvcnVtL2FuZ3VsYXJcIixcbiAgICAgICAgXCJ0aHVtYm5haWxzXCI6IHtcbiAgICAgICAgICBcImRlZmF1bHRcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL1d1aUh1WnFfY2c0L2RlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDEyMCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDkwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcIm1lZGl1bVwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvV3VpSHVacV9jZzQvbXFkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiAzMjAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiAxODBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiaGlnaFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvV3VpSHVacV9jZzQvaHFkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiA0ODAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiAzNjBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwic3RhbmRhcmRcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL1d1aUh1WnFfY2c0L3NkZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogNjQwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogNDgwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcIm1heHJlc1wiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvV3VpSHVacV9jZzQvbWF4cmVzZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogMTI4MCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDcyMFxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJjaGFubmVsVGl0bGVcIjogXCJKdXN0eW4gQ2xhcmtcIixcbiAgICAgICAgXCJwbGF5bGlzdElkXCI6IFwiUExRYUpEd0xYeUJ0WHIxRmUyRlJ6SWRUM1JGZUc1MlFWRlwiLFxuICAgICAgICBcInBvc2l0aW9uXCI6IDIsXG4gICAgICAgIFwicmVzb3VyY2VJZFwiOiB7XG4gICAgICAgICAgXCJraW5kXCI6IFwieW91dHViZSN2aWRlb1wiLFxuICAgICAgICAgIFwidmlkZW9JZFwiOiBcIld1aUh1WnFfY2c0XCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwiY29udGVudERldGFpbHNcIjoge1xuICAgICAgICBcInZpZGVvSWRcIjogXCJXdWlIdVpxX2NnNFwiLFxuICAgICAgICBcInZpZGVvUHVibGlzaGVkQXRcIjogXCIyMDEyLTA0LTA0VDA2OjU1OjE2LjAwMFpcIlxuICAgICAgfVxuICAgIH0sXG4gICAge1xuICAgICAgXCJraW5kXCI6IFwieW91dHViZSNwbGF5bGlzdEl0ZW1cIixcbiAgICAgIFwiZXRhZ1wiOiBcIlxcXCJjYnozbElRMk4yNUFmd05yLUJkeFVWeEpfUVkvS0ZfT0JHcTNzUkNDUTZfM2cwVkRHR1dkVldZXFxcIlwiLFxuICAgICAgXCJpZFwiOiBcIlVFeFJZVXBFZDB4WWVVSjBXSEl4Um1VeVJsSjZTV1JVTTFKR1pVYzFNbEZXUmk0MU1qRTFNa0kwT1RRMlF6SkdOek5HXCIsXG4gICAgICBcInNuaXBwZXRcIjoge1xuICAgICAgICBcInB1Ymxpc2hlZEF0XCI6IFwiMjAxNS0wMy0xMFQwNTo1NDowOC4wMDBaXCIsXG4gICAgICAgIFwiY2hhbm5lbElkXCI6IFwiVUNWTTRDMWZCOVFjd3k3ZE5qYlhlVVZ3XCIsXG4gICAgICAgIFwidGl0bGVcIjogXCJJbnRyb2R1Y3Rpb24gdG8gQW5ndWxhci5qcyBpbiA1MCBFeGFtcGxlcyAocGFydCAxKVwiLFxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiQ29kZSBhdCBodHRwczovL2dpdGh1Yi5jb20vY3VycmFuL3NjcmVlbmNhc3RzL3RyZWUvZ2gtcGFnZXMvaW50cm9Ub0FuZ3VsYXIgQW4gaW50cm9kdWN0aW9uIHRvIEFuZ3VsYXIuanMgY292ZXJpbmcgc2luZ2xlLXBhZ2UtYXBwIGNvbmNlcHRzLCByZWxhdGVkIGxpYnJhcmllcyBhbmQgYW5ndWxhciBmZWF0dXJlcyBieSBleGFtcGxlLiBUaGlzIGluc3RhbGxtZW50IChwYXJ0IDEpIGNvdmVycyAzNiBvZiB0aGUgNTAgQW5ndWxhciBleGFtcGxlcy4gUGFydCAyIGNvdmVycyB0aGUgcmVzdCBodHRwczovL3d3dy55b3V0dWJlLmNvbS93YXRjaD92PTZKMDhtMUgyQk1FJmZlYXR1cmU9eW91dHUuYmUgRXhhbXBsZXMgc3RhcnQgYXQgMTE6MzAgaW4gdGhlIHZpZGVvLlxcblxcbklmIHlvdSBhcHByZWNpYXRlIHRoaXMgd29yaywgcGxlYXNlIGNvbnNpZGVyIHN1cHBvcnRpbmcgbWUgb24gUGF0cmVvbiBodHRwczovL3d3dy5wYXRyZW9uLmNvbS91c2VyP3U9MjkxNjI0MiZ0eT1oXFxuXFxuVGhpcyBsZWN0dXJlIHdhcyBnaXZlbiBieSBDdXJyYW4gS2VsbGVoZXIgYXQgdGhlIFVuaXZlcnNpdHkgb2YgTWFzc2FjaHVzZXR0cyBMb3dlbGwgb24gTWFyY2ggNiwgMjAxNCBhcyBwYXJ0IG9mIHRoZSB1bmRlcmdyYWR1YXRlIGNvdXJzZSBHVUkgUHJvZ3JhbW1pbmcgSUkgdGF1Z2h0IGJ5IFByb2Zlc3NvciBKZXNzZSBIZWluZXMuXCIsXG4gICAgICAgIFwidGh1bWJuYWlsc1wiOiB7XG4gICAgICAgICAgXCJkZWZhdWx0XCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9UUnJMNWozTUl2by9kZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiAxMjAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiA5MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJtZWRpdW1cIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL1RSckw1ajNNSXZvL21xZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogMzIwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogMTgwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImhpZ2hcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL1RSckw1ajNNSXZvL2hxZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogNDgwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogMzYwXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcImNoYW5uZWxUaXRsZVwiOiBcIkp1c3R5biBDbGFya1wiLFxuICAgICAgICBcInBsYXlsaXN0SWRcIjogXCJQTFFhSkR3TFh5QnRYcjFGZTJGUnpJZFQzUkZlRzUyUVZGXCIsXG4gICAgICAgIFwicG9zaXRpb25cIjogMyxcbiAgICAgICAgXCJyZXNvdXJjZUlkXCI6IHtcbiAgICAgICAgICBcImtpbmRcIjogXCJ5b3V0dWJlI3ZpZGVvXCIsXG4gICAgICAgICAgXCJ2aWRlb0lkXCI6IFwiVFJyTDVqM01Jdm9cIlxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgXCJjb250ZW50RGV0YWlsc1wiOiB7XG4gICAgICAgIFwidmlkZW9JZFwiOiBcIlRSckw1ajNNSXZvXCIsXG4gICAgICAgIFwidmlkZW9QdWJsaXNoZWRBdFwiOiBcIjIwMTQtMDMtMDhUMDM6MDY6MjUuMDAwWlwiXG4gICAgICB9XG4gICAgfSxcbiAgICB7XG4gICAgICBcImtpbmRcIjogXCJ5b3V0dWJlI3BsYXlsaXN0SXRlbVwiLFxuICAgICAgXCJldGFnXCI6IFwiXFxcImNiejNsSVEyTjI1QWZ3TnItQmR4VVZ4Sl9RWS9jWlJJOFkybF9FSUFxT1p2bno5SkZNQWlDM01cXFwiXCIsXG4gICAgICBcImlkXCI6IFwiVUV4UllVcEVkMHhZZVVKMFdISXhSbVV5UmxKNlNXUlVNMUpHWlVjMU1sRldSaTR3T1RBM09UWkJOelZFTVRVek9UTXlcIixcbiAgICAgIFwic25pcHBldFwiOiB7XG4gICAgICAgIFwicHVibGlzaGVkQXRcIjogXCIyMDE1LTAzLTExVDEwOjU3OjU0LjAwMFpcIixcbiAgICAgICAgXCJjaGFubmVsSWRcIjogXCJVQ1ZNNEMxZkI5UWN3eTdkTmpiWGVVVndcIixcbiAgICAgICAgXCJ0aXRsZVwiOiBcIlVzaW5nIEFuaW1hdGUuY3NzIGFuZCBqUXVlcnkgZm9yIGVhc3kgV2ViIEFuaW1hdGlvblwiLFxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiU2ltcGxlIHR1dG9yaWFsIG9uIGhvdyB0byB1c2UgQW5pbWF0ZS5jc3MgYW5kIGpRdWVyeSB0b2dldGhlciBpbiB5b3VyIHdlYnNpdGUgb3Igd2ViIGFwcCEg8J+UpVN1YnNjcmliZSBmb3IgbW9yZSBsaWtlIHRoaXM6IGh0dHBzOi8vZ29vLmdsL0xVRWtOMVwiLFxuICAgICAgICBcInRodW1ibmFpbHNcIjoge1xuICAgICAgICAgIFwiZGVmYXVsdFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvQ0JRR2w2em9rTXMvZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogMTIwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogOTBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwibWVkaXVtXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9DQlFHbDZ6b2tNcy9tcWRlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDMyMCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDE4MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJoaWdoXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9DQlFHbDZ6b2tNcy9ocWRlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDQ4MCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDM2MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJzdGFuZGFyZFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvQ0JRR2w2em9rTXMvc2RkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiA2NDAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiA0ODBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwibWF4cmVzXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9DQlFHbDZ6b2tNcy9tYXhyZXNkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiAxMjgwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogNzIwXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcImNoYW5uZWxUaXRsZVwiOiBcIkp1c3R5biBDbGFya1wiLFxuICAgICAgICBcInBsYXlsaXN0SWRcIjogXCJQTFFhSkR3TFh5QnRYcjFGZTJGUnpJZFQzUkZlRzUyUVZGXCIsXG4gICAgICAgIFwicG9zaXRpb25cIjogNCxcbiAgICAgICAgXCJyZXNvdXJjZUlkXCI6IHtcbiAgICAgICAgICBcImtpbmRcIjogXCJ5b3V0dWJlI3ZpZGVvXCIsXG4gICAgICAgICAgXCJ2aWRlb0lkXCI6IFwiQ0JRR2w2em9rTXNcIlxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgXCJjb250ZW50RGV0YWlsc1wiOiB7XG4gICAgICAgIFwidmlkZW9JZFwiOiBcIkNCUUdsNnpva01zXCIsXG4gICAgICAgIFwidmlkZW9QdWJsaXNoZWRBdFwiOiBcIjIwMTQtMDYtMDVUMTk6NTk6NDMuMDAwWlwiXG4gICAgICB9XG4gICAgfSxcbiAgICB7XG5cblxuICAgICAgXCJraW5kXCI6IFwieW91dHViZSNwbGF5bGlzdEl0ZW1cIixcbiAgICAgIFwiZXRhZ1wiOiBcIlxcXCJjYnozbElRMk4yNUFmd05yLUJkeFVWeEpfUVkvMm9RdTE1QlE5NWdqUWN6SVJIVnVTcDY2Zk5BXFxcIlwiLFxuICAgICAgXCJpZFwiOiBcIlVFeFJZVXBFZDB4WWVVSjBXSEl4Um1VeVJsSjZTV1JVTTFKR1pVYzFNbEZXUmk0eE1rVkdRak5DTVVNMU4wUkZORVV4XCIsXG4gICAgICBcInNuaXBwZXRcIjoge1xuICAgICAgICBcInB1Ymxpc2hlZEF0XCI6IFwiMjAxNS0wMy0xNFQwNzo0MjoyMC4wMDBaXCIsXG4gICAgICAgIFwiY2hhbm5lbElkXCI6IFwiVUNWTTRDMWZCOVFjd3k3ZE5qYlhlVVZ3XCIsXG4gICAgICAgIFwidGl0bGVcIjogXCJXRUIgREVWRUxPUE1FTlQgLSBTRUNSRVRTIFRPIFNUQVJUSU5HIEEgQ0FSRUVSIGluIHRoZSBXZWIgRGV2ZWxvcG1lbnQgSW5kdXN0cnlcIixcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkV2ZXJ5b25lIGtlZXBzIHNheWluZyBob3cgZ3JlYXQgd2ViIGRldmVsb3BtZW50IGlzLCBidXQgaG93IGRvIHlvdSBnZXQgdGhhdCBmaXJzdCBqb2I/ICBUaGlzIHZpZGVvIGlzIGEgcmVzcG9uc2UgdG8gdGhlIHF1ZXN0aW9ucyBJJ3ZlIGJlZW4gZ2V0dGluZyBhYm91dCBob3cgdG8gbGFuZCB0aGF0IGZpcnN0IHdlYiBkZXZlbG9wbWVudCBqb2IgYW5kIGhvdyB0byBrbm93IHdoZW4geW91J3JlIHJlYWR5IHRvIHRha2UgdGhlIGxlYXAgYW5kIGxvb2sgZm9yIG9uZS5cXG5cXG5UaGUgZmlyc3QgdGhpbmcgeW91IGhhdmUgdG8ga25vdyBpcyB0aGF0IHlvdSBkb24ndCBoYXZlIHRvIGJlIGEgc2Vhc29uZWQgcHJvIHRvIGdldCBhIGpvYiBhcyBhIGZ1bGwtdGltZSB3ZWIgZGV2ZWxvcGVyLiAgVGhlcmUgYXJlIExPVFMgb2YgY29tcGFuaWVzIGxvb2tpbmcgZm9yIHdlYiBkZXZlbG9wZXJzIHRoYXQgZG9uJ3QgaGF2ZSBtdWNoIGV4cGVyaWVuY2UuXFxuXFxuQWxzbywgdGhlcmUgYXJlIGEgbG90IG9mIHRoaW5ncyB5b3UgY2FuIGRvIHRvIHByZXBhcmUgeW91ciByZXN1bWUgdG8gcmVhbGx5IHN0aWNrIG91dCB0byBhIHByb3NwZWN0aXZlIGVtcGxveWVyLlxcblxcblRoaXMgdmlkZW8gd2lsbCBnaXZlIHlvdSBhIGZlZWwgZm9yIHdoYXQgYW4gZW1wbG95ZXIgd2lsbCBiZSBsb29raW5nIGZvciBhbmQgd2hhdCB0aGV5J2xsIGJlIFxcXCJncmFkaW5nXFxcIiB5b3Ugb24gYXMgeW91IGxvb2sgZm9yIGEgam9iIGluIHRoaXMgaW5kdXN0cnkuXFxuXFxuR2l0aHViIEludHJvOiBcXG5odHRwczovL3d3dy55b3V0dWJlLmNvbS93YXRjaD92PTBmS2c3ZTM3YlFFXFxuR2l0aHViIFB1bGwgUmVxdWVzdHM6IFxcbmh0dHBzOi8vd3d3LnlvdXR1YmUuY29tL3dhdGNoP3Y9b0ZZeVRad015QWdcXG5cXG5qUXVlcnkgQ291cnNlOlxcbmh0dHBzOi8vd3d3LnlvdXR1YmUuY29tL3BsYXlsaXN0P2xpc3Q9UExvWUNnTk9JeUdBQmRJMlY4SV9TV28yMnRGcGdoMnM2X1wiLFxuICAgICAgICBcInRodW1ibmFpbHNcIjoge1xuICAgICAgICAgIFwiZGVmYXVsdFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvSmlsZlhtSTJJalEvZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogMTIwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogOTBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwibWVkaXVtXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9KaWxmWG1JMklqUS9tcWRlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDMyMCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDE4MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJoaWdoXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9KaWxmWG1JMklqUS9ocWRlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDQ4MCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDM2MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJzdGFuZGFyZFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvSmlsZlhtSTJJalEvc2RkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiA2NDAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiA0ODBcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIFwiY2hhbm5lbFRpdGxlXCI6IFwiSnVzdHluIENsYXJrXCIsXG4gICAgICAgIFwicGxheWxpc3RJZFwiOiBcIlBMUWFKRHdMWHlCdFhyMUZlMkZSeklkVDNSRmVHNTJRVkZcIixcbiAgICAgICAgXCJwb3NpdGlvblwiOiA1LFxuICAgICAgICBcInJlc291cmNlSWRcIjoge1xuICAgICAgICAgIFwia2luZFwiOiBcInlvdXR1YmUjdmlkZW9cIixcbiAgICAgICAgICBcInZpZGVvSWRcIjogXCJKaWxmWG1JMklqUVwiXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcImNvbnRlbnREZXRhaWxzXCI6IHtcbiAgICAgICAgXCJ2aWRlb0lkXCI6IFwiSmlsZlhtSTJJalFcIixcbiAgICAgICAgXCJ2aWRlb1B1Ymxpc2hlZEF0XCI6IFwiMjAxNC0wNC0yMVQxODowMDowMi4wMDBaXCJcbiAgICAgIH1cbiAgICB9LFxuICAgIHtcblxuXG4gICAgICBcImtpbmRcIjogXCJ5b3V0dWJlI3BsYXlsaXN0SXRlbVwiLFxuICAgICAgXCJldGFnXCI6IFwiXFxcImNiejNsSVEyTjI1QWZ3TnItQmR4VVZ4Sl9RWS9hcnY0cXFDNkJqOXdMZ29La1g0Wk5yVWJ0YWNcXFwiXCIsXG4gICAgICBcImlkXCI6IFwiVUV4UllVcEVkMHhZZVVKMFdISXhSbVV5UmxKNlNXUlVNMUpHWlVjMU1sRldSaTQxTXpKQ1FqQkNOREl5UmtKRE4wVkRcIixcbiAgICAgIFwic25pcHBldFwiOiB7XG4gICAgICAgIFwicHVibGlzaGVkQXRcIjogXCIyMDE1LTAzLTIwVDA4OjUxOjE3LjAwMFpcIixcbiAgICAgICAgXCJjaGFubmVsSWRcIjogXCJVQ1ZNNEMxZkI5UWN3eTdkTmpiWGVVVndcIixcbiAgICAgICAgXCJ0aXRsZVwiOiBcIlJlYWx0aW1lIFxcXCJFeWUgQ2FuZHlcXFwiIHdpdGggQW5ndWxhckpTXCIsXG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJMZWFybiBob3cgdG8gbWFrZSBhIGZ1bGx5IGludGVyYWN0aXZlLCByZWFsdGltZSBBbmd1bGFySlMgYXBwbGljYXRpb24gd2l0aCBzbmFwcHkgYW5pbWF0aW9uIGVmZmVjdHMsIHNsZWVrIHBlcmZvcm1hbmNlIGFuZCBjbGVhbiwgb3JnYW5pemVkIGNvZGUuIFRvcCB0aGF0IG9mZiBieSB0ZXN0aW5nIGFsbCBhc3BlY3RzIG9mIHRoZSBhcHBsaWNhdGlvbiB1c2luZyBQcm90cmFjdG9yIGFuZCBVbml0IHRlc3RpbmcgYWNyb3NzIG11bHRpcGxlIGJyb3dzZXJzIHVzaW5nIEthcm1hICsgU2F1Y2UgTGFicy5cIixcbiAgICAgICAgXCJ0aHVtYm5haWxzXCI6IHtcbiAgICAgICAgICBcImRlZmF1bHRcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpLzh1ajdZU3FieTdzL2RlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDEyMCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDkwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcIm1lZGl1bVwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvOHVqN1lTcWJ5N3MvbXFkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiAzMjAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiAxODBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiaGlnaFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvOHVqN1lTcWJ5N3MvaHFkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiA0ODAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiAzNjBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwic3RhbmRhcmRcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpLzh1ajdZU3FieTdzL3NkZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogNjQwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogNDgwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcIm1heHJlc1wiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvOHVqN1lTcWJ5N3MvbWF4cmVzZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogMTI4MCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDcyMFxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJjaGFubmVsVGl0bGVcIjogXCJKdXN0eW4gQ2xhcmtcIixcbiAgICAgICAgXCJwbGF5bGlzdElkXCI6IFwiUExRYUpEd0xYeUJ0WHIxRmUyRlJ6SWRUM1JGZUc1MlFWRlwiLFxuICAgICAgICBcInBvc2l0aW9uXCI6IDYsXG4gICAgICAgIFwicmVzb3VyY2VJZFwiOiB7XG4gICAgICAgICAgXCJraW5kXCI6IFwieW91dHViZSN2aWRlb1wiLFxuICAgICAgICAgIFwidmlkZW9JZFwiOiBcIjh1ajdZU3FieTdzXCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwiY29udGVudERldGFpbHNcIjoge1xuICAgICAgICBcInZpZGVvSWRcIjogXCI4dWo3WVNxYnk3c1wiLFxuICAgICAgICBcInZpZGVvUHVibGlzaGVkQXRcIjogXCIyMDE0LTAxLTE1VDE0OjAwOjAzLjAwMFpcIlxuICAgICAgfVxuICAgIH0sXG4gICAge1xuXG5cbiAgICAgIFwia2luZFwiOiBcInlvdXR1YmUjcGxheWxpc3RJdGVtXCIsXG4gICAgICBcImV0YWdcIjogXCJcXFwiY2J6M2xJUTJOMjVBZndOci1CZHhVVnhKX1FZL2JoY3hQZkN1UWdfa0dTdlVBMXNzTlpiZUIxTVxcXCJcIixcbiAgICAgIFwiaWRcIjogXCJVRXhSWVVwRWQweFllVUowV0hJeFJtVXlSbEo2U1dSVU0xSkdaVWMxTWxGV1JpNURRVU5FUkRRMk5rSXpSVVF4TlRZMVwiLFxuICAgICAgXCJzbmlwcGV0XCI6IHtcbiAgICAgICAgXCJwdWJsaXNoZWRBdFwiOiBcIjIwMTUtMDMtMzFUMTk6NTc6NTMuMDAwWlwiLFxuICAgICAgICBcImNoYW5uZWxJZFwiOiBcIlVDVk00QzFmQjlRY3d5N2ROamJYZVVWd1wiLFxuICAgICAgICBcInRpdGxlXCI6IFwiSnVuaW9yIERldmVsb3BlciAxMDE6IFRpcHMgZm9yIEhvdyB0byBTY29yZSBhIEpvYlwiLFxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiVHJ5aW5nIHRvIGJlY29tZSBhIGp1bmlvciBkZXZlbG9wZXI/IEhhdmUgYW54aWV0eSBhYm91dCB0aGUgaW50ZXJ2aWV3IHByb2Nlc3M/IFdlIGFyZSBicmluZ2luZyB0b2dldGhlciBqdW5pb3IgZGV2cyB3aG8gbWFkZSBpdCB0aHJvdWdoIG9uIHRoZSBvdGhlciBzaWRlIGFuZCBsaXZlZCB0byB0ZWxsIHRoZSB0YWxlLlxcblxcbkpvaW4gdXMgZm9yIGFub3RoZXIgRysgSGFuZ291dCB0byB0YWxrIGFib3V0IFxcXCJJbnRlcnZpZXcgMTAxXFxcIiB3aXRoIGRldnMsIHJlY3J1aXRlcnMgYW5kIGVtcGxveWVycy4gIFxcblxcbldlJ2xsIGFuc3dlciBxdWVzdGlvbnMgbGlrZTpcXG5cXG4xLiBXaGF0IGFyZSBzb21lIG9mIHRoZSBiZXN0IHJlc291cmNlcyBmb3IgbXkgam9iIHNlYXJjaD9cXG4yLiBEbyBJIG5lZWQgcHJpb3IgZXhwZXJpZW5jZSBpbiBjb2Rpbmcgb3IgdGhlIGluZHVzdHJ5IHRvIGdldCBhIGpvYj9cXG4zLiBXaGF0IGtpbmQgb2Ygam9icyBzaG91bGQgSSBiZSBsb29raW5nIGZvcj8gSXMgZnJlZWxhbmNpbmcgYSBnb29kIG9wdGlvbj8gXFxuNC4gSXMgeW91ciBwb3J0Zm9saW8gdGhlIG1vc3QgaW1wb3J0YW50IHRoaW5nPyBIb3cgY2FuIEkgbWFrZSBtaW5lIGJldHRlcj9cXG41LiBXaGF0IGRvIGhpcmluZyBtYW5hZ2VycyB3YW50IHRvIHNlZSBvbiBhIHJlc3VtZT9cXG42LiBXaGF0IGhlbHBzIG1lIGFjdHVhbGx5IGdldCBhbiBpbnRlcnZpZXc/XFxuNy4gV2hhdCBkbyBJIG5lZWQgdG8gZG8gdG8gcHJlcGFyZT8gV2hhdCB0ZXN0IHByb2dyYW1zIHNob3VsZCBJIGtub3c/XFxuOC4gSG93IGRvIEkgZXhwbGFpbiBteSBiYWNrZ3JvdW5kIGlmIEkndmUgbGVhcm5lZCBjb2RpbmcgaW4gYSBub24tdHJhZGl0aW9uYWwgd2F5P1xcbjkuIFdoYXQga2luZCBvZiBxdWVzdGlvbnMgc2hvdWxkIEkgYmUgYXNraW5nIHRoZW0/IEhvdyBkbyBJIGtub3cgaWYgaXQncyBhIGdvb2QgY3VsdHVyZSBmaXQ/XFxuMTAuIEFueSB0aXBzIG9uIGhvdyB0byBzdGFuZCBvdXQgYW5kIGZvbGxvdyB1cCBhZnRlciB0aGUgZmFjdD8gXFxuXFxuQXNrIHF1ZXN0aW9ucyBhbmQgam9pbiB0aGUgY29udmVyc2F0aW9uIHVzaW5nICAjVGhpbmtKb2JzICFcXG5cXG5QYW5lbGlzdHM6XFxuR3JhZSBEcmFrZSAoQEdyYWVfRHJha2UpIC0gSGVhZCBvZiBFZHVjYXRpb24gT3BlcmF0aW9ucywgVGhpbmtmdWwgKE1vZGVyYXRvcilcXG5MYXVyYSBIb3JhayAoQGxhdXJhc2hvcmFrICkgIC0gSGVhZCBvZiBDb21tdW5pdHksIFRoaW5rZnVsXFxuVGhvbWFzIFBldGVyc29uIChAcmlwbGV5YWZmZWN0KSAtIEVuZ2luZWVyLCBUaGlua2Z1bFxcbkxlZSBFZHdhcmRzIChAdGVycm9uaykgLSBFbmdpbmVlciBNYW5hZ2VyLCBHcm91cG9uXFxuUm9ja21hbiBIYSAoQFJvY2t0b3RoZW1hbikgLSBDaGllZiBQZW9wbGUgT2ZmaWNlcjsgZm9ybWVybHkgTW9uZ28gREJcXG5FbGkgR29vZG1hbiAoQGVsaW1nb29kbWFuKSAtIENoaWVmIFRlY2hub2xvZ3kgT2ZmaWNlciwgTGl0dGxlIEJvcnJvd2VkIERyZXNzXCIsXG4gICAgICAgIFwidGh1bWJuYWlsc1wiOiB7XG4gICAgICAgICAgXCJkZWZhdWx0XCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS85cUVGRHFoUERDay9kZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiAxMjAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiA5MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJtZWRpdW1cIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpLzlxRUZEcWhQRENrL21xZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogMzIwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogMTgwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImhpZ2hcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpLzlxRUZEcWhQRENrL2hxZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogNDgwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogMzYwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInN0YW5kYXJkXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS85cUVGRHFoUERDay9zZGRlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDY0MCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDQ4MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJtYXhyZXNcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpLzlxRUZEcWhQRENrL21heHJlc2RlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDEyODAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiA3MjBcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIFwiY2hhbm5lbFRpdGxlXCI6IFwiSnVzdHluIENsYXJrXCIsXG4gICAgICAgIFwicGxheWxpc3RJZFwiOiBcIlBMUWFKRHdMWHlCdFhyMUZlMkZSeklkVDNSRmVHNTJRVkZcIixcbiAgICAgICAgXCJwb3NpdGlvblwiOiA3LFxuICAgICAgICBcInJlc291cmNlSWRcIjoge1xuICAgICAgICAgIFwia2luZFwiOiBcInlvdXR1YmUjdmlkZW9cIixcbiAgICAgICAgICBcInZpZGVvSWRcIjogXCI5cUVGRHFoUERDa1wiXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcImNvbnRlbnREZXRhaWxzXCI6IHtcbiAgICAgICAgXCJ2aWRlb0lkXCI6IFwiOXFFRkRxaFBEQ2tcIixcbiAgICAgICAgXCJ2aWRlb1B1Ymxpc2hlZEF0XCI6IFwiMjAxNC0wNy0xMVQxOTo1MjoyMC4wMDBaXCJcbiAgICAgIH1cbiAgICB9LFxuICAgIHtcblxuXG4gICAgICBcImtpbmRcIjogXCJ5b3V0dWJlI3BsYXlsaXN0SXRlbVwiLFxuICAgICAgXCJldGFnXCI6IFwiXFxcImNiejNsSVEyTjI1QWZ3TnItQmR4VVZ4Sl9RWS9jQlVCZnhwTklBVGRGRi13WWdZY3hDcXZlYjhcXFwiXCIsXG4gICAgICBcImlkXCI6IFwiVUV4UllVcEVkMHhZZVVKMFdISXhSbVV5UmxKNlNXUlVNMUpHWlVjMU1sRldSaTQ1TkRrMVJFWkVOemhFTXpVNU1EUXpcIixcbiAgICAgIFwic25pcHBldFwiOiB7XG4gICAgICAgIFwicHVibGlzaGVkQXRcIjogXCIyMDE1LTA5LTI5VDA2OjI5OjEzLjAwMFpcIixcbiAgICAgICAgXCJjaGFubmVsSWRcIjogXCJVQ1ZNNEMxZkI5UWN3eTdkTmpiWGVVVndcIixcbiAgICAgICAgXCJ0aXRsZVwiOiBcIkNTUyBwcmVwcm9jZXNzb3JzIHdpdGggSm9uYXRoYW4gVmVycmVjY2hpYVwiLFxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiWWVscCBmcm9udC1lbmQgZW5naW5lZXIgSm9uYXRoYW4gVmVycmVjY2hpYSB3aWxsIGRlbW9uc3RyYXRlIHRoZSBwb3dlciBvZiBDU1MgcHJlcHJvY2Vzc29ycyBhbmQgZXhwbGFpbiB3aHkgaGUgYmVsaWV2ZXMgdGhlc2UgYXJlIGEgZ2FtZSBjaGFuZ2VyIGZvciBmcm9udC1lbmQgZGV2ZWxvcG1lbnQgaW4gdGhpcyBwcmVzZW50YXRpb24gZ2l2ZW4gYXQgdGhlIFNhbiBGcmFuY2lzY28gSFRNTDUgVXNlciBHcm91cC5cXG5cXG5Kb25hdGhhbidzIHRhbGsgd2lsbCBjb3ZlcjpcXG4tIENTUyB3ZWFrbmVzc2VzXFxuLSBQcmVwcm9jZXNzb3IgZmVhdHVyZXNcXG4tIENvbW1vbiBtaXNjb25jZXB0aW9uc1xcbi0gU2FzcywgTGVzcywgb3IgU3R5bHVzP1xcbi0gV29ya2Zsb3cgYW5kIHRlY2huaXF1ZXNcXG4tIFByZXByb2Nlc3NvcnMgKyBPT0NTXFxuXFxuKiogTW9yZSB2aWRlb3Mgb24gb3BlbiBzb3VyY2UgZGV2ZWxvcG1lbnQgYXQgaHR0cDovL21hcmFrYW5hLmNvbS9zL1xcbioqIFNsaWRlcyBhdCBodHRwOi8vbXJrbi5jby91Y3ZwbVwiLFxuICAgICAgICBcInRodW1ibmFpbHNcIjoge1xuICAgICAgICAgIFwiZGVmYXVsdFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvRmxXMnZ2bDB5dm8vZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogMTIwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogOTBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwibWVkaXVtXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9GbFcydnZsMHl2by9tcWRlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDMyMCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDE4MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJoaWdoXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9GbFcydnZsMHl2by9ocWRlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDQ4MCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDM2MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJzdGFuZGFyZFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvRmxXMnZ2bDB5dm8vc2RkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiA2NDAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiA0ODBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwibWF4cmVzXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9GbFcydnZsMHl2by9tYXhyZXNkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiAxMjgwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogNzIwXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcImNoYW5uZWxUaXRsZVwiOiBcIkp1c3R5biBDbGFya1wiLFxuICAgICAgICBcInBsYXlsaXN0SWRcIjogXCJQTFFhSkR3TFh5QnRYcjFGZTJGUnpJZFQzUkZlRzUyUVZGXCIsXG4gICAgICAgIFwicG9zaXRpb25cIjogOCxcbiAgICAgICAgXCJyZXNvdXJjZUlkXCI6IHtcbiAgICAgICAgICBcImtpbmRcIjogXCJ5b3V0dWJlI3ZpZGVvXCIsXG4gICAgICAgICAgXCJ2aWRlb0lkXCI6IFwiRmxXMnZ2bDB5dm9cIlxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgXCJjb250ZW50RGV0YWlsc1wiOiB7XG4gICAgICAgIFwidmlkZW9JZFwiOiBcIkZsVzJ2dmwweXZvXCIsXG4gICAgICAgIFwidmlkZW9QdWJsaXNoZWRBdFwiOiBcIjIwMTItMDYtMTJUMjE6MDM6MzEuMDAwWlwiXG4gICAgICB9XG4gICAgfSxcbiAgICB7XG5cblxuICAgICAgXCJraW5kXCI6IFwieW91dHViZSNwbGF5bGlzdEl0ZW1cIixcbiAgICAgIFwiZXRhZ1wiOiBcIlxcXCJjYnozbElRMk4yNUFmd05yLUJkeFVWeEpfUVkvNlFmNkxhQVNDQlptRkZJQkZvcWZhNldOSFN3XFxcIlwiLFxuICAgICAgXCJpZFwiOiBcIlVFeFJZVXBFZDB4WWVVSjBXSEl4Um1VeVJsSjZTV1JVTTFKR1pVYzFNbEZXUmk1R05qTkRSRFJFTURReE9UaENNRFEyXCIsXG4gICAgICBcInNuaXBwZXRcIjoge1xuICAgICAgICBcInB1Ymxpc2hlZEF0XCI6IFwiMjAxNS0xMi0wM1QwNzoxMjowNy4wMDBaXCIsXG4gICAgICAgIFwiY2hhbm5lbElkXCI6IFwiVUNWTTRDMWZCOVFjd3k3ZE5qYlhlVVZ3XCIsXG4gICAgICAgIFwidGl0bGVcIjogXCJSRVNUIEFQSSBjb25jZXB0cyBhbmQgZXhhbXBsZXNcIixcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIlRoaXMgdmlkZW8gaW50cm9kdWNlcyB0aGUgdmlld2VyIHRvIHNvbWUgQVBJIGNvbmNlcHRzIGJ5IG1ha2luZyBleGFtcGxlIGNhbGxzIHRvIEZhY2Vib29rJ3MgR3JhcGggQVBJLCBHb29nbGUgTWFwcycgQVBJLCBJbnN0YWdyYW0ncyBNZWRpYSBTZWFyY2ggQVBJLCBhbmQgVHdpdHRlcidzIFN0YXR1cyBVcGRhdGUgQVBJLlxcblxcbi8qKioqKioqKioqIFZJREVPIExJTktTICoqKioqKioqKiovXFxuXFxuWW91dHViZSdzIEZhY2Vib29rIFBhZ2UgdmlhIHRoZSBGYWNlYm9vayBHcmFwaCBBUElcXG5odHRwOi8vZ3JhcGguZmFjZWJvb2suY29tL3lvdXR1YmVcXG5cXG5TYW1lIHRoaW5nLCB0aGlzIHRpbWUgd2l0aCBmaWx0ZXJzXFxuaHR0cHM6Ly9ncmFwaC5mYWNlYm9vay5jb20veW91dHViZT9maWVsZHM9aWQsbmFtZSxsaWtlc1xcblxcbkdvb2dsZSBNYXBzIEdlb2NvZGUgQVBJIGNhbGwgZm9yIHRoZSBjaXR5IG9mIENoaWNhZ29cXG5odHRwOi8vbWFwcy5nb29nbGVhcGlzLmNvbS9tYXBzL2FwaS9nZW9jb2RlL2pzb24/YWRkcmVzcz1DaGljYWdvXFxuXFxuQXBpZ2VlIEluc3RhZ3JhbSBBUEkgY29uc29sZVxcbmh0dHBzOi8vYXBpZ2VlLmNvbS9jb25zb2xlL2luc3RhZ3JhbVxcblxcbkhUVFAgUmVxdWVzdCBNZXRob2RzXFxuaHR0cDovL2VuLndpa2lwZWRpYS5vcmcvd2lraS9IeXBlcnRleHRfVHJhbnNmZXJfUHJvdG9jb2wjUmVxdWVzdF9tZXRob2RzXFxuXFxuUG9zdG1hbiBDaHJvbWUgRXh0ZW5zaW9uXFxuaHR0cHM6Ly9jaHJvbWUuZ29vZ2xlLmNvbS93ZWJzdG9yZS9kZXRhaWwvcG9zdG1hbi1yZXN0LWNsaWVudC9mZG1tZ2lsZ25wamlnZG9qb2pwam9vb2lka21jb21jbT9obD1lblxcblxcblR3aXR0ZXIncyBTdGF0dXMgVXBkYXRlIGRvY3VtZW50YXRpb24uXFxuaHR0cHM6Ly9kZXYudHdpdHRlci5jb20vZG9jcy9hcGkvMS4xL3Bvc3Qvc3RhdHVzZXMvdXBkYXRlXCIsXG4gICAgICAgIFwidGh1bWJuYWlsc1wiOiB7XG4gICAgICAgICAgXCJkZWZhdWx0XCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS83WWNXMjVQSG5BQS9kZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiAxMjAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiA5MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJtZWRpdW1cIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpLzdZY1cyNVBIbkFBL21xZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogMzIwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogMTgwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImhpZ2hcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpLzdZY1cyNVBIbkFBL2hxZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogNDgwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogMzYwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInN0YW5kYXJkXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS83WWNXMjVQSG5BQS9zZGRlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDY0MCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDQ4MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJtYXhyZXNcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpLzdZY1cyNVBIbkFBL21heHJlc2RlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDEyODAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiA3MjBcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIFwiY2hhbm5lbFRpdGxlXCI6IFwiSnVzdHluIENsYXJrXCIsXG4gICAgICAgIFwicGxheWxpc3RJZFwiOiBcIlBMUWFKRHdMWHlCdFhyMUZlMkZSeklkVDNSRmVHNTJRVkZcIixcbiAgICAgICAgXCJwb3NpdGlvblwiOiA5LFxuICAgICAgICBcInJlc291cmNlSWRcIjoge1xuICAgICAgICAgIFwia2luZFwiOiBcInlvdXR1YmUjdmlkZW9cIixcbiAgICAgICAgICBcInZpZGVvSWRcIjogXCI3WWNXMjVQSG5BQVwiXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcImNvbnRlbnREZXRhaWxzXCI6IHtcbiAgICAgICAgXCJ2aWRlb0lkXCI6IFwiN1ljVzI1UEhuQUFcIixcbiAgICAgICAgXCJ2aWRlb1B1Ymxpc2hlZEF0XCI6IFwiMjAxNC0wNy0xNFQwODowNjo0OS4wMDBaXCJcbiAgICAgIH1cbiAgICB9LFxuICAgIHtcblxuXG4gICAgICBcImtpbmRcIjogXCJ5b3V0dWJlI3BsYXlsaXN0SXRlbVwiLFxuICAgICAgXCJldGFnXCI6IFwiXFxcImNiejNsSVEyTjI1QWZ3TnItQmR4VVZ4Sl9RWS96UzY4ZVM3SGl0WnRVWHMwLTRxWFRBS3BqYWNcXFwiXCIsXG4gICAgICBcImlkXCI6IFwiVUV4UllVcEVkMHhZZVVKMFdISXhSbVV5UmxKNlNXUlVNMUpHWlVjMU1sRldSaTQwTnpaQ01FUkRNalZFTjBSRlJUaEJcIixcbiAgICAgIFwic25pcHBldFwiOiB7XG4gICAgICAgIFwicHVibGlzaGVkQXRcIjogXCIyMDE1LTEyLTA3VDA2OjE5OjAzLjAwMFpcIixcbiAgICAgICAgXCJjaGFubmVsSWRcIjogXCJVQ1ZNNEMxZkI5UWN3eTdkTmpiWGVVVndcIixcbiAgICAgICAgXCJ0aXRsZVwiOiBcIlZlbG9jaXR5LmpzOiBVSSBQYWNrIE92ZXJ2aWV3XCIsXG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJQbGF5IHdpdGggdGhlIFVJIHBhY2sgYXQgaHR0cDovL1ZlbG9jaXR5SlMub3JnLyN1aVBhY2suXFxuXFxuUmVhZCB0aGUgZnVsbCB0dXRvcmlhbDogaHR0cDovL3d3dy5zbWFzaGluZ21hZ2F6aW5lLmNvbS8yMDE0LzA2LzE4L2Zhc3Rlci11aS1hbmltYXRpb25zLXdpdGgtdmVsb2NpdHktanMvXCIsXG4gICAgICAgIFwidGh1bWJuYWlsc1wiOiB7XG4gICAgICAgICAgXCJkZWZhdWx0XCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9DZHd2UjZhMzlUZy9kZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiAxMjAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiA5MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJtZWRpdW1cIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL0Nkd3ZSNmEzOVRnL21xZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogMzIwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogMTgwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImhpZ2hcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL0Nkd3ZSNmEzOVRnL2hxZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogNDgwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogMzYwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInN0YW5kYXJkXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9DZHd2UjZhMzlUZy9zZGRlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDY0MCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDQ4MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJtYXhyZXNcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL0Nkd3ZSNmEzOVRnL21heHJlc2RlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDEyODAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiA3MjBcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIFwiY2hhbm5lbFRpdGxlXCI6IFwiSnVzdHluIENsYXJrXCIsXG4gICAgICAgIFwicGxheWxpc3RJZFwiOiBcIlBMUWFKRHdMWHlCdFhyMUZlMkZSeklkVDNSRmVHNTJRVkZcIixcbiAgICAgICAgXCJwb3NpdGlvblwiOiAxMCxcbiAgICAgICAgXCJyZXNvdXJjZUlkXCI6IHtcbiAgICAgICAgICBcImtpbmRcIjogXCJ5b3V0dWJlI3ZpZGVvXCIsXG4gICAgICAgICAgXCJ2aWRlb0lkXCI6IFwiQ2R3dlI2YTM5VGdcIlxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgXCJjb250ZW50RGV0YWlsc1wiOiB7XG4gICAgICAgIFwidmlkZW9JZFwiOiBcIkNkd3ZSNmEzOVRnXCIsXG4gICAgICAgIFwidmlkZW9QdWJsaXNoZWRBdFwiOiBcIjIwMTQtMDUtMjhUMTY6MjA6MzkuMDAwWlwiXG4gICAgICB9XG4gICAgfSxcbiAgICB7XG5cblxuICAgICAgXCJraW5kXCI6IFwieW91dHViZSNwbGF5bGlzdEl0ZW1cIixcbiAgICAgIFwiZXRhZ1wiOiBcIlxcXCJjYnozbElRMk4yNUFmd05yLUJkeFVWeEpfUVkvY2RxelhJRjVheUkwUGR2TXRxZEtXYkN2TllrXFxcIlwiLFxuICAgICAgXCJpZFwiOiBcIlVFeFJZVXBFZDB4WWVVSjBXSEl4Um1VeVJsSjZTV1JVTTFKR1pVYzFNbEZXUmk1RU1FRXdSVVk1TTBSRFJUVTNOREpDXCIsXG4gICAgICBcInNuaXBwZXRcIjoge1xuICAgICAgICBcInB1Ymxpc2hlZEF0XCI6IFwiMjAxNi0wMS0wOVQxODo1MDoyNC4wMDBaXCIsXG4gICAgICAgIFwiY2hhbm5lbElkXCI6IFwiVUNWTTRDMWZCOVFjd3k3ZE5qYlhlVVZ3XCIsXG4gICAgICAgIFwidGl0bGVcIjogXCJUb3AgMTAgUHJvZ3JhbW1pbmcgTGFuZ3VhZ2VzIHRvIExlYXJuIGluIDIwMTZcIixcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIlRISVMgVklERU8gSVMgU1BPTlNPUkVEIEJZXFxuXFxuVGhlIFRlY2ggQWNhZGVteSBodHRwOi8vb3cubHkvUkFNTzMwZkU3T2NcXG5cXG5IaXBzdGVyQ29kZSBodHRwczovL3d3dy5oaXBzdGVyY29kZS5jb20vXCIsXG4gICAgICAgIFwidGh1bWJuYWlsc1wiOiB7XG4gICAgICAgICAgXCJkZWZhdWx0XCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9aNTZHTFJYeGg4OC9kZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiAxMjAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiA5MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJtZWRpdW1cIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL1o1NkdMUlh4aDg4L21xZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogMzIwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogMTgwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImhpZ2hcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL1o1NkdMUlh4aDg4L2hxZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogNDgwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogMzYwXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcImNoYW5uZWxUaXRsZVwiOiBcIkp1c3R5biBDbGFya1wiLFxuICAgICAgICBcInBsYXlsaXN0SWRcIjogXCJQTFFhSkR3TFh5QnRYcjFGZTJGUnpJZFQzUkZlRzUyUVZGXCIsXG4gICAgICAgIFwicG9zaXRpb25cIjogMTEsXG4gICAgICAgIFwicmVzb3VyY2VJZFwiOiB7XG4gICAgICAgICAgXCJraW5kXCI6IFwieW91dHViZSN2aWRlb1wiLFxuICAgICAgICAgIFwidmlkZW9JZFwiOiBcIlo1NkdMUlh4aDg4XCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwiY29udGVudERldGFpbHNcIjoge1xuICAgICAgICBcInZpZGVvSWRcIjogXCJaNTZHTFJYeGg4OFwiLFxuICAgICAgICBcInZpZGVvUHVibGlzaGVkQXRcIjogXCIyMDE1LTA4LTA3VDAxOjE4OjM5LjAwMFpcIlxuICAgICAgfVxuICAgIH0sXG4gICAge1xuXG5cbiAgICAgIFwia2luZFwiOiBcInlvdXR1YmUjcGxheWxpc3RJdGVtXCIsXG4gICAgICBcImV0YWdcIjogXCJcXFwiY2J6M2xJUTJOMjVBZndOci1CZHhVVnhKX1FZL2pkQ3k3ampncmJkVjFaU3h5NUV0SUpCTDktMFxcXCJcIixcbiAgICAgIFwiaWRcIjogXCJVRXhSWVVwRWQweFllVUowV0hJeFJtVXlSbEo2U1dSVU0xSkdaVWMxTWxGV1JpNDVPRFJETlRnMFFqQTROa0ZCTmtReVwiLFxuICAgICAgXCJzbmlwcGV0XCI6IHtcbiAgICAgICAgXCJwdWJsaXNoZWRBdFwiOiBcIjIwMTYtMDEtMTVUMDA6MTc6NDYuMDAwWlwiLFxuICAgICAgICBcImNoYW5uZWxJZFwiOiBcIlVDVk00QzFmQjlRY3d5N2ROamJYZVVWd1wiLFxuICAgICAgICBcInRpdGxlXCI6IFwiRWRnZSBDb25mZXJlbmNlIDIwMTUgLSA0IENvbXBvbmVudHMgYW5kIE1vZHVsZXNcIixcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIlwiLFxuICAgICAgICBcInRodW1ibmFpbHNcIjoge1xuICAgICAgICAgIFwiZGVmYXVsdFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvSlFnQmI5V2VZSEkvZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogMTIwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogOTBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwibWVkaXVtXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9KUWdCYjlXZVlISS9tcWRlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDMyMCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDE4MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJoaWdoXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9KUWdCYjlXZVlISS9ocWRlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDQ4MCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDM2MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJzdGFuZGFyZFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvSlFnQmI5V2VZSEkvc2RkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiA2NDAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiA0ODBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwibWF4cmVzXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9KUWdCYjlXZVlISS9tYXhyZXNkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiAxMjgwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogNzIwXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcImNoYW5uZWxUaXRsZVwiOiBcIkp1c3R5biBDbGFya1wiLFxuICAgICAgICBcInBsYXlsaXN0SWRcIjogXCJQTFFhSkR3TFh5QnRYcjFGZTJGUnpJZFQzUkZlRzUyUVZGXCIsXG4gICAgICAgIFwicG9zaXRpb25cIjogMTIsXG4gICAgICAgIFwicmVzb3VyY2VJZFwiOiB7XG4gICAgICAgICAgXCJraW5kXCI6IFwieW91dHViZSN2aWRlb1wiLFxuICAgICAgICAgIFwidmlkZW9JZFwiOiBcIkpRZ0JiOVdlWUhJXCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwiY29udGVudERldGFpbHNcIjoge1xuICAgICAgICBcInZpZGVvSWRcIjogXCJKUWdCYjlXZVlISVwiLFxuICAgICAgICBcInZpZGVvUHVibGlzaGVkQXRcIjogXCIyMDE1LTA3LTEzVDExOjA2OjA1LjAwMFpcIlxuICAgICAgfVxuICAgIH0sXG4gICAge1xuXG5cbiAgICAgIFwia2luZFwiOiBcInlvdXR1YmUjcGxheWxpc3RJdGVtXCIsXG4gICAgICBcImV0YWdcIjogXCJcXFwiY2J6M2xJUTJOMjVBZndOci1CZHhVVnhKX1FZLy1OMVBWd3R6X25RaVBkNFRVVVA2LVgzcEtOUVxcXCJcIixcbiAgICAgIFwiaWRcIjogXCJVRXhSWVVwRWQweFllVUowV0hJeFJtVXlSbEo2U1dSVU0xSkdaVWMxTWxGV1JpNHpNRGc1TWtRNU1FVkRNRU0xTlRnMlwiLFxuICAgICAgXCJzbmlwcGV0XCI6IHtcbiAgICAgICAgXCJwdWJsaXNoZWRBdFwiOiBcIjIwMTYtMDEtMjRUMDk6NTU6MzcuMDAwWlwiLFxuICAgICAgICBcImNoYW5uZWxJZFwiOiBcIlVDVk00QzFmQjlRY3d5N2ROamJYZVVWd1wiLFxuICAgICAgICBcInRpdGxlXCI6IFwiW0VwLiAxXSBBbmd1bGFyIHRvIFJlYWN0XCIsXG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJcIixcbiAgICAgICAgXCJ0aHVtYm5haWxzXCI6IHtcbiAgICAgICAgICBcImRlZmF1bHRcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpLzBUc2dlYmlkRmZvL2RlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDEyMCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDkwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcIm1lZGl1bVwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvMFRzZ2ViaWRGZm8vbXFkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiAzMjAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiAxODBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiaGlnaFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvMFRzZ2ViaWRGZm8vaHFkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiA0ODAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiAzNjBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwic3RhbmRhcmRcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpLzBUc2dlYmlkRmZvL3NkZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogNjQwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogNDgwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcIm1heHJlc1wiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvMFRzZ2ViaWRGZm8vbWF4cmVzZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogMTI4MCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDcyMFxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJjaGFubmVsVGl0bGVcIjogXCJKdXN0eW4gQ2xhcmtcIixcbiAgICAgICAgXCJwbGF5bGlzdElkXCI6IFwiUExRYUpEd0xYeUJ0WHIxRmUyRlJ6SWRUM1JGZUc1MlFWRlwiLFxuICAgICAgICBcInBvc2l0aW9uXCI6IDEzLFxuICAgICAgICBcInJlc291cmNlSWRcIjoge1xuICAgICAgICAgIFwia2luZFwiOiBcInlvdXR1YmUjdmlkZW9cIixcbiAgICAgICAgICBcInZpZGVvSWRcIjogXCIwVHNnZWJpZEZmb1wiXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcImNvbnRlbnREZXRhaWxzXCI6IHtcbiAgICAgICAgXCJ2aWRlb0lkXCI6IFwiMFRzZ2ViaWRGZm9cIixcbiAgICAgICAgXCJ2aWRlb1B1Ymxpc2hlZEF0XCI6IFwiMjAxNS0xMi0yOFQyMjowNzo0OC4wMDBaXCJcbiAgICAgIH1cbiAgICB9LFxuICAgIHtcblxuXG4gICAgICBcImtpbmRcIjogXCJ5b3V0dWJlI3BsYXlsaXN0SXRlbVwiLFxuICAgICAgXCJldGFnXCI6IFwiXFxcImNiejNsSVEyTjI1QWZ3TnItQmR4VVZ4Sl9RWS94TGljck9tdmJJbjJiTDhaOFMxejdGaFZuQTRcXFwiXCIsXG4gICAgICBcImlkXCI6IFwiVUV4UllVcEVkMHhZZVVKMFdISXhSbVV5UmxKNlNXUlVNMUpHWlVjMU1sRldSaTQxTXprMlFUQXhNVGt6TkRrNE1EaEZcIixcbiAgICAgIFwic25pcHBldFwiOiB7XG4gICAgICAgIFwicHVibGlzaGVkQXRcIjogXCIyMDE2LTAxLTI5VDA4OjI4OjU3LjAwMFpcIixcbiAgICAgICAgXCJjaGFubmVsSWRcIjogXCJVQ1ZNNEMxZkI5UWN3eTdkTmpiWGVVVndcIixcbiAgICAgICAgXCJ0aXRsZVwiOiBcIlJlYWN0IGFuZCBSZWR1eFwiLFxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiKiogSSBoYXZlIGNyZWF0ZWQgYSBiZXR0ZXIsIG1vcmUgY29tcHJlaGVuc2l2ZSB2aWRlbyBzZXJpZXMgYWJvdXQgdXNpbmcgUmVhY3QsIFJlZHV4IGFuZCBXZWJwYWNrIHRvIGJ1aWxkIHdlYiBhcHBzLiBDaGVjayBpdCBvdXQgYXQgaHR0cDovL3d3dy55b3V0dWJlLmNvbS9wbGF5bGlzdD9saXN0PVBMUURueFhxVjIxM0pKRnREYUcwYUU5dnF2cDZXbTduQmcgKipcXG5cXG5BIHRhbGsgYW5kIGxpdmUgZGVtbyBhYm91dCBob3cgKGFuZCB3aHkpIHRvIHVzZSBSZWFjdCBhbmQgUmVkdXguIFByZXNlbnRhdGlvbiByZWNvcmRlZCBhdCBIYWNrIFJlYWN0b3Igb24gTm92LiAzMCwgMjAxNS4gR2l0aHViIHJlcG8gdG8gZm9sbG93IGFsb25nIGNhbiBiZSBmb3VuZCBhdCBodHRwczovL2dpdGh1Yi5jb20va3dlaWJlcnRoL3JlYWN0LXJlZHV4LXRvZG8tZGVtby4gVGhlIG1hc3RlciBicmFuY2ggaXMgdGhlIGZpbmlzaGVkIHByb2R1Y3QgYWZ0ZXIgdGhlIGRlbW8gaXMgY29tcGxldGVkLiBUaGUgcmVhY3QtZGVtby1zdGFydCBicmFuY2ggaXMgdGhlIHN0YXJ0aW5nIHBvaW50IGZvciB0aGUgZmlyc3QgZGVtbyBhbmQgdGhlIHJlZHV4LWRlbW8tc3RhcnQgYnJhbmNoIGlzIHRoZSBzdGFydGluZyBwb2ludCBmb3IgdGhlIHNlY29uZCBkZW1vLlwiLFxuICAgICAgICBcInRodW1ibmFpbHNcIjoge1xuICAgICAgICAgIFwiZGVmYXVsdFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvN2VMcUtncDBlZVkvZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogMTIwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogOTBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwibWVkaXVtXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS83ZUxxS2dwMGVlWS9tcWRlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDMyMCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDE4MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJoaWdoXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS83ZUxxS2dwMGVlWS9ocWRlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDQ4MCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDM2MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJzdGFuZGFyZFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvN2VMcUtncDBlZVkvc2RkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiA2NDAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiA0ODBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwibWF4cmVzXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS83ZUxxS2dwMGVlWS9tYXhyZXNkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiAxMjgwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogNzIwXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcImNoYW5uZWxUaXRsZVwiOiBcIkp1c3R5biBDbGFya1wiLFxuICAgICAgICBcInBsYXlsaXN0SWRcIjogXCJQTFFhSkR3TFh5QnRYcjFGZTJGUnpJZFQzUkZlRzUyUVZGXCIsXG4gICAgICAgIFwicG9zaXRpb25cIjogMTQsXG4gICAgICAgIFwicmVzb3VyY2VJZFwiOiB7XG4gICAgICAgICAgXCJraW5kXCI6IFwieW91dHViZSN2aWRlb1wiLFxuICAgICAgICAgIFwidmlkZW9JZFwiOiBcIjdlTHFLZ3AwZWVZXCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwiY29udGVudERldGFpbHNcIjoge1xuICAgICAgICBcInZpZGVvSWRcIjogXCI3ZUxxS2dwMGVlWVwiLFxuICAgICAgICBcInZpZGVvUHVibGlzaGVkQXRcIjogXCIyMDE1LTEyLTEyVDIyOjM3OjE2LjAwMFpcIlxuICAgICAgfVxuICAgIH0sXG4gICAge1xuXG5cbiAgICAgIFwia2luZFwiOiBcInlvdXR1YmUjcGxheWxpc3RJdGVtXCIsXG4gICAgICBcImV0YWdcIjogXCJcXFwiY2J6M2xJUTJOMjVBZndOci1CZHhVVnhKX1FZL0hGVmhBajE4ZHQtMHJ2Y0s2WnFYMVBjcjNIVVxcXCJcIixcbiAgICAgIFwiaWRcIjogXCJVRXhSWVVwRWQweFllVUowV0hJeFJtVXlSbEo2U1dSVU0xSkdaVWMxTWxGV1JpNUVRVUUxTlRGRFJqY3dNRGcwTkVNelwiLFxuICAgICAgXCJzbmlwcGV0XCI6IHtcbiAgICAgICAgXCJwdWJsaXNoZWRBdFwiOiBcIjIwMTYtMDEtMjlUMDg6Mjk6MDcuMDAwWlwiLFxuICAgICAgICBcImNoYW5uZWxJZFwiOiBcIlVDVk00QzFmQjlRY3d5N2ROamJYZVVWd1wiLFxuICAgICAgICBcInRpdGxlXCI6IFwiUmVhY3QgRm9yIEV2ZXJ5b25lICM4IC0gQmFzaWMgV2VicGFjayBDb25maWd1cmF0aW9uICYgU2VydmVyXCIsXG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJJbiB0aGlzIFJlYWN0IHZpZGVvIHR1dG9yaWFsLCB3ZSBmaW5pc2ggb3VyIHNldHVwIGJ5IHdyaXRpbmcgb3VyIHdlYnBhY2sgY29uZmlnIGZpbGUuIFN1YnNjcmliZSBmb3IgbW9yZSBmcmVlIHR1dG9yaWFscyBodHRwczovL2dvby5nbC82bGpvRmMsIG1vcmUgUmVhY3QgVHV0b3JpYWxzOiBodHRwczovL2dvby5nbC90UlVBQjlcXG5cXG5TdXBwb3J0IEZyZWUgVHV0b3JpYWxzXFxuaHR0cHM6Ly93d3cubGV2ZWx1cHR1dG9yaWFscy5jb20vc3RvcmUvXFxuXFxuVGhlIGJlc3Qgc2hhcmVkIHdlYiBob3N0aW5nXFxuaHR0cDovL3d3dy5ibHVlaG9zdC5jb20vdHJhY2svbGV2ZWx1cHR1dG9yaWFscy9cXG5cXG5TdWJzY3JpYmUgdG8gTGV2ZWwgVXAgUHJvIGZvciBleHRyYSBmZWF0dXJlcyFcXG5odHRwczovL3d3dy5sZXZlbHVwdHV0b3JpYWxzLmNvbS9zdG9yZS9wcm9kdWN0cy9wcm9cXG5cXG5TdWJzY3JpYmUgdG8gdGhlIExldmVsIFVwIE5ld3NsZXR0ZXJcXG5odHRwOi8vZWVwdXJsLmNvbS9BV2pHelxcblxcblRvIFN1cHBvcnQgTGV2ZWwgVXAgVHV0czpcXG5odHRwOi8vbGV2ZWx1cHR1dHMuY29tL2RvbmF0aW9uc1xcblxcblNpbXBsZSBjbG91ZCBob3N0aW5nLCBidWlsdCBmb3IgZGV2ZWxvcGVycy46XFxuaHR0cHM6Ly93d3cuZGlnaXRhbG9jZWFuLmNvbS8/cmVmY29kZT02NzM1NzE3NGIwOWVcXG5cXG5MZWFybiBSZWFjdCBqcyBmcm9tIHNjcmF0Y2ggaW4gdGhlIG5ldyB2aWRlbyB0dXRvcmlhbCBzZXJpZXMgUmVhY3QgRm9yIEJlZ2lubmVycy4gV2UnbGwgYmUgaW50cm9kdWNpbmcgY29yZSBjb25jZXB0cyBhbmQgZXhwbG9yaW5nIHJlYWwgd29ybGQgYXBwbGljYXRpb24gdGVjaG5pcXVlcyBhcyB3ZSBnby4gTmV3IHZpZGVvcyBldmVyeSB3ZWVrIVwiLFxuICAgICAgICBcInRodW1ibmFpbHNcIjoge1xuICAgICAgICAgIFwiZGVmYXVsdFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvQXRLaDZ0cDQ0Q2svZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogMTIwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogOTBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwibWVkaXVtXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9BdEtoNnRwNDRDay9tcWRlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDMyMCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDE4MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJoaWdoXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9BdEtoNnRwNDRDay9ocWRlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDQ4MCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDM2MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJzdGFuZGFyZFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvQXRLaDZ0cDQ0Q2svc2RkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiA2NDAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiA0ODBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwibWF4cmVzXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9BdEtoNnRwNDRDay9tYXhyZXNkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiAxMjgwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogNzIwXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcImNoYW5uZWxUaXRsZVwiOiBcIkp1c3R5biBDbGFya1wiLFxuICAgICAgICBcInBsYXlsaXN0SWRcIjogXCJQTFFhSkR3TFh5QnRYcjFGZTJGUnpJZFQzUkZlRzUyUVZGXCIsXG4gICAgICAgIFwicG9zaXRpb25cIjogMTUsXG4gICAgICAgIFwicmVzb3VyY2VJZFwiOiB7XG4gICAgICAgICAgXCJraW5kXCI6IFwieW91dHViZSN2aWRlb1wiLFxuICAgICAgICAgIFwidmlkZW9JZFwiOiBcIkF0S2g2dHA0NENrXCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwiY29udGVudERldGFpbHNcIjoge1xuICAgICAgICBcInZpZGVvSWRcIjogXCJBdEtoNnRwNDRDa1wiLFxuICAgICAgICBcInZpZGVvUHVibGlzaGVkQXRcIjogXCIyMDE2LTAxLTE1VDAwOjI0OjI5LjAwMFpcIlxuICAgICAgfVxuICAgIH0sXG4gICAge1xuXG5cbiAgICAgIFwia2luZFwiOiBcInlvdXR1YmUjcGxheWxpc3RJdGVtXCIsXG4gICAgICBcImV0YWdcIjogXCJcXFwiY2J6M2xJUTJOMjVBZndOci1CZHhVVnhKX1FZLzVfYnVyZ1NnU0JKVWpvcDlJVmg5OXFHbGJUTVxcXCJcIixcbiAgICAgIFwiaWRcIjogXCJVRXhSWVVwRWQweFllVUowV0hJeFJtVXlSbEo2U1dSVU0xSkdaVWMxTWxGV1JpNDFRVFkxUTBVeE1UVkNPRGN6TlRoRVwiLFxuICAgICAgXCJzbmlwcGV0XCI6IHtcbiAgICAgICAgXCJwdWJsaXNoZWRBdFwiOiBcIjIwMTYtMTItMDdUMDQ6MjE6MjQuMDAwWlwiLFxuICAgICAgICBcImNoYW5uZWxJZFwiOiBcIlVDVk00QzFmQjlRY3d5N2ROamJYZVVWd1wiLFxuICAgICAgICBcInRpdGxlXCI6IFwiTGVhcm4gUmVhY3Qgd2l0aCBwcm9ncmVzc2l2ZSBib2lsZXJwbGF0ZXNcIixcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkluIHRoaXMgdmlkZW8gSSBpbnRyb2R1Y2UgdGhlIGNvbmNlcHQgb2YgcHJvZ3Jlc3NpdmUgYm9pbGVycGxhdGUgYW5kIHNob3cgeW91IGhvdyB0byBsZWFybiBSZWFjdCB3aXRoIHByb2dyZXNzaXZlIGJvaWxlcnBsYXRlcy5cXG5cXG5BUmMgKEF0b21pYyBSZWFjdCksIHRoZSBwcm9ncmVzc2l2ZSBib2lsZXJwbGF0ZTogaHR0cHM6Ly9naXRodWIuY29tL2RpZWdvaGF6L2FyY1xcblxcbnJlYWN0LWNyZWF0ZS1hcHA6IGh0dHBzOi8vZ2l0aHViLmNvbS9mYWNlYm9va2luY3ViYXRvci9jcmVhdGUtcmVhY3QtYXBwXFxuXFxucmVhY3QtYm9pbGVycGxhdGU6IGh0dHBzOi8vZ2l0aHViLmNvbS9teHN0YnIvcmVhY3QtYm9pbGVycGxhdGVcXG5cXG5yZWFjdC1yZWR1eC11bml2ZXJzYWwtaG90LWV4YW1wbGU6IGh0dHBzOi8vZ2l0aHViLmNvbS9lcmlrcmFzL3JlYWN0LXJlZHV4LXVuaXZlcnNhbC1ob3QtZXhhbXBsZVwiLFxuICAgICAgICBcInRodW1ibmFpbHNcIjoge1xuICAgICAgICAgIFwiZGVmYXVsdFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvVmNIYnFwZFo5bU0vZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogMTIwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogOTBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwibWVkaXVtXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9WY0hicXBkWjltTS9tcWRlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDMyMCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDE4MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJoaWdoXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9WY0hicXBkWjltTS9ocWRlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDQ4MCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDM2MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJzdGFuZGFyZFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvVmNIYnFwZFo5bU0vc2RkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiA2NDAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiA0ODBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwibWF4cmVzXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9WY0hicXBkWjltTS9tYXhyZXNkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiAxMjgwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogNzIwXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcImNoYW5uZWxUaXRsZVwiOiBcIkp1c3R5biBDbGFya1wiLFxuICAgICAgICBcInBsYXlsaXN0SWRcIjogXCJQTFFhSkR3TFh5QnRYcjFGZTJGUnpJZFQzUkZlRzUyUVZGXCIsXG4gICAgICAgIFwicG9zaXRpb25cIjogMTYsXG4gICAgICAgIFwicmVzb3VyY2VJZFwiOiB7XG4gICAgICAgICAgXCJraW5kXCI6IFwieW91dHViZSN2aWRlb1wiLFxuICAgICAgICAgIFwidmlkZW9JZFwiOiBcIlZjSGJxcGRaOW1NXCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwiY29udGVudERldGFpbHNcIjoge1xuICAgICAgICBcInZpZGVvSWRcIjogXCJWY0hicXBkWjltTVwiLFxuICAgICAgICBcInZpZGVvUHVibGlzaGVkQXRcIjogXCIyMDE2LTExLTE3VDIxOjM0OjQ1LjAwMFpcIlxuICAgICAgfVxuICAgIH0sXG4gICAge1xuXG5cbiAgICAgIFwia2luZFwiOiBcInlvdXR1YmUjcGxheWxpc3RJdGVtXCIsXG4gICAgICBcImV0YWdcIjogXCJcXFwiY2J6M2xJUTJOMjVBZndOci1CZHhVVnhKX1FZL0pnYVpZSEJnZW1ibDIwRVVEU0t3bm9ob290TVxcXCJcIixcbiAgICAgIFwiaWRcIjogXCJVRXhSWVVwRWQweFllVUowV0hJeFJtVXlSbEo2U1dSVU0xSkdaVWMxTWxGV1JpNHlNVVF5UVRRek1qUkROek15UVRNeVwiLFxuICAgICAgXCJzbmlwcGV0XCI6IHtcbiAgICAgICAgXCJwdWJsaXNoZWRBdFwiOiBcIjIwMTYtMTItMDdUMDQ6MjY6MjAuMDAwWlwiLFxuICAgICAgICBcImNoYW5uZWxJZFwiOiBcIlVDVk00QzFmQjlRY3d5N2ROamJYZVVWd1wiLFxuICAgICAgICBcInRpdGxlXCI6IFwiQ3JlYXRlIGFuZCBkZXBsb3kgYSBSRVNUZnVsIEFQSSBpbiAxMCBtaW51dGVzXCIsXG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJDcmVhdGUgYSBSRVNUIEFQSSB3aXRoIE5vZGVKUywgTW9uZ29EQiBhbmQgRXhwcmVzcy5cXG5HaXRIdWIgcmVwbzogaHR0cHM6Ly9naXRodWIuY29tL2RpZWdvaGF6L2dlbmVyYXRvci1yZXN0XFxuXFxuSW4gdGhpcyB0dXRvcmlhbCBJIHNob3cgeW91IGhvdyB0byBjcmVhdGUgYSBSRVNUIEFQSSB3aXRoIE5vZGVKUywgTW9uZ29EQiAoTW9uZ29vc2UpLCBFeHByZXNzLCBFUzYsIGludGVncmF0aW9uIGFuZCB1bml0IHRlc3RzLCBkb2N1bWVudGF0aW9uIChhcGlkb2MpLCBlcnJvciBoYW5kbGluZywgSlNPTiByZXNwb25zZXMgYW5kIG11Y2ggbW9yZSB1c2luZyBZZW9tYW4gYW5kIGRlcGxveSBpdCB0byBIZXJva3UuXFxuXFxuLS0tLS0tLS0tLS0tLS0gTElOS1MgLS0tLS0tLS0tLS0tLVxcblxcbk5vZGVKUzogaHR0cHM6Ly9ub2RlanMub3JnXFxuTW9uZ29EQjogaHR0cHM6Ly9tb25nb2RiLmNvbVxcblBvc3RtYW46IGh0dHBzOi8vd3d3LmdldHBvc3RtYW4uY29tXFxuXFxuLS0tLS0tLS0tLS0tIFJFTEFURUQgLS0tLS0tLS0tLVxcblxcbldoYXQgaXMgTm9kZS5qcyBFeGFjdGx5P1xcblVzaW5nIE5vZGUuanMgZm9yIEV2ZXJ5dGhpbmdcXG5SRVNUIEFQSSBjb25jZXB0cyBhbmQgZXhhbXBsZXNcXG5JbnRybyB0byBSRVNUXFxuTm9kZS5qcyBUdXRvcmlhbHM6IEZyb20gWmVybyB0byBIZXJvIHdpdGggTm9kZWpzXFxuUkVTVCtKU09OIEFQSSBEZXNpZ24gLSBCZXN0IFByYWN0aWNlcyBmb3IgRGV2ZWxvcGVyc1xcblVzaW5nIFJFU1QgQVBJcyBpbiBhIHdlYiBhcHBsaWNhdGlvblxcblJFU1QtRnVsIEFQSSBEZXNpZ25cXG5DcmVhdGUgYSBXZWJzaXRlIG9yIEJsb2dcXG5Ob2RlLmpzIFR1dG9yaWFscyBmb3IgQmVnaW5uZXJzXFxuTm9kZUpTIE1vbmdvREIgVHV0b3JpYWxcXG5Ob2RlLmpzIEZ1bmRhbWVudGFsc1xcbkJ1aWxkIGEgUkVTVGZ1bCBBUEkgaW4gNSBNaW51dGVzIHdpdGggTm9kZUpTXFxuQnVpbGQgYSBUd2l0Y2gudHYgQ2hhdCBCb3QgaW4gMTAgTWludXRlcyB3aXRoIE5vZGUuanNcXG5Ob2RlLmpzIExvZ2luIFN5c3RlbSBXaXRoIFBhc3Nwb3J0XFxuQnVpbGRpbmcgYSBNaWNyb3NlcnZpY2UgdXNpbmcgTm9kZS5qcyAmIERvY2tlclxcblRoZSBBQkNzIG9mIEFQSXMgd2l0aCBOb2RlLmpzXFxuRXZlcnl0aGluZyBZb3UgRXZlciBXYW50ZWQgVG8gS25vdyBBYm91dCBBdXRoZW50aWNhdGlvbiBpbiBOb2RlLmpzXFxuQ8OzbW8gaW1wbGVtZW50YXIgdW4gQVBJIFJFU1QgZGVzZGUgY2VybyBjb24gTm9kZS5qcyB5IE1vbmdvREJcXG5PdmVydmlldyBvZiBOb2RlLmpzIE1pY3Jvc2VydmljZXMgQXJjaGl0ZWN0dXJlc1xcbk5vZGUuanMgRXhwbGFpbmVkXFxuSmF2YVNjcmlwdCB3aXRoIFJlYWN0SlMgYW5kIE5vZGVqc1xcbk5vZGVKUyAvIEV4cHJlc3MgLyBNb25nb0RCIC0gQnVpbGQgYSBTaG9wcGluZyBDYXJ0XFxuRGVwbG95aW5nIE5vZGUuanMgQXBwIHRvIEhlcm9rdVxcblRlc3QgZHJpdmVuIERldmVsb3BtZW50IG9mIFdlYiBBcHBzIGluIE5vZGUuSnNcXG5Ib3cgdG8gc2VuZCBzZXJ2ZXIgZW1haWwgd2l0aCBOb2RlLmpzXFxuRGVwbG95aW5nIG5vZGUuanMgYXBwbGljYXRpb25zXFxuUkVTVGZ1bCBBUEkgRnJvbSBTY3JhdGNoIFVzaW5nIE5vZGUsIEV4cHJlc3MgYW5kIE1vbmdvREJcXG5JbnRybyB0byBSRVNUIChha2EuIFdoYXQgSXMgUkVTVCBBbnl3YXk/KVwiLFxuICAgICAgICBcInRodW1ibmFpbHNcIjoge1xuICAgICAgICAgIFwiZGVmYXVsdFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvNngtaWp5Ry1hY2svZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogMTIwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogOTBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwibWVkaXVtXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS82eC1panlHLWFjay9tcWRlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDMyMCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDE4MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJoaWdoXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS82eC1panlHLWFjay9ocWRlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDQ4MCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDM2MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJzdGFuZGFyZFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvNngtaWp5Ry1hY2svc2RkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiA2NDAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiA0ODBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwibWF4cmVzXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS82eC1panlHLWFjay9tYXhyZXNkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiAxMjgwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogNzIwXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcImNoYW5uZWxUaXRsZVwiOiBcIkp1c3R5biBDbGFya1wiLFxuICAgICAgICBcInBsYXlsaXN0SWRcIjogXCJQTFFhSkR3TFh5QnRYcjFGZTJGUnpJZFQzUkZlRzUyUVZGXCIsXG4gICAgICAgIFwicG9zaXRpb25cIjogMTcsXG4gICAgICAgIFwicmVzb3VyY2VJZFwiOiB7XG4gICAgICAgICAgXCJraW5kXCI6IFwieW91dHViZSN2aWRlb1wiLFxuICAgICAgICAgIFwidmlkZW9JZFwiOiBcIjZ4LWlqeUctYWNrXCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwiY29udGVudERldGFpbHNcIjoge1xuICAgICAgICBcInZpZGVvSWRcIjogXCI2eC1panlHLWFja1wiLFxuICAgICAgICBcInZpZGVvUHVibGlzaGVkQXRcIjogXCIyMDE2LTA5LTE0VDAyOjM4OjU0LjAwMFpcIlxuICAgICAgfVxuICAgIH0sXG4gICAge1xuXG5cbiAgICAgIFwia2luZFwiOiBcInlvdXR1YmUjcGxheWxpc3RJdGVtXCIsXG4gICAgICBcImV0YWdcIjogXCJcXFwiY2J6M2xJUTJOMjVBZndOci1CZHhVVnhKX1FZL2NSVXBCMjlmMUdxalVsVE1KTnA0V2l3aDZVSVxcXCJcIixcbiAgICAgIFwiaWRcIjogXCJVRXhSWVVwRWQweFllVUowV0hJeFJtVXlSbEo2U1dSVU0xSkdaVWMxTWxGV1JpNDVSVGd4TkRSQk16VXdSalEwTURoQ1wiLFxuICAgICAgXCJzbmlwcGV0XCI6IHtcbiAgICAgICAgXCJwdWJsaXNoZWRBdFwiOiBcIjIwMTctMDEtMThUMTc6Mjg6MDAuMDAwWlwiLFxuICAgICAgICBcImNoYW5uZWxJZFwiOiBcIlVDVk00QzFmQjlRY3d5N2ROamJYZVVWd1wiLFxuICAgICAgICBcInRpdGxlXCI6IFwiVG9kZCBNb3R0byAtIERlbXlzdGlmeWluZyBKYXZhU2NyaXB0OiB5b3UgZG9uJ3QgbmVlZCBqUXVlcnkgKEZPV0QgMjAxNClcIixcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcImh0dHBzOi8vc3BlYWtlcmRlY2suY29tL3RvZGRtb3R0by9kZW15c3RpZnlpbmctamF2YXNjcmlwdC15b3UtZG9udC1uZWVkLWpxdWVyeVwiLFxuICAgICAgICBcInRodW1ibmFpbHNcIjoge1xuICAgICAgICAgIFwiZGVmYXVsdFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkva2V5Q2cyNTNTLW8vZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogMTIwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogOTBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwibWVkaXVtXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9rZXlDZzI1M1Mtby9tcWRlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDMyMCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDE4MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJoaWdoXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9rZXlDZzI1M1Mtby9ocWRlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDQ4MCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDM2MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJzdGFuZGFyZFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkva2V5Q2cyNTNTLW8vc2RkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiA2NDAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiA0ODBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwibWF4cmVzXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9rZXlDZzI1M1Mtby9tYXhyZXNkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiAxMjgwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogNzIwXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcImNoYW5uZWxUaXRsZVwiOiBcIkp1c3R5biBDbGFya1wiLFxuICAgICAgICBcInBsYXlsaXN0SWRcIjogXCJQTFFhSkR3TFh5QnRYcjFGZTJGUnpJZFQzUkZlRzUyUVZGXCIsXG4gICAgICAgIFwicG9zaXRpb25cIjogMTgsXG4gICAgICAgIFwicmVzb3VyY2VJZFwiOiB7XG4gICAgICAgICAgXCJraW5kXCI6IFwieW91dHViZSN2aWRlb1wiLFxuICAgICAgICAgIFwidmlkZW9JZFwiOiBcImtleUNnMjUzUy1vXCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwiY29udGVudERldGFpbHNcIjoge1xuICAgICAgICBcInZpZGVvSWRcIjogXCJrZXlDZzI1M1Mtb1wiLFxuICAgICAgICBcInZpZGVvUHVibGlzaGVkQXRcIjogXCIyMDE0LTA2LTAzVDA5OjU1OjQwLjAwMFpcIlxuICAgICAgfVxuICAgIH0sXG4gICAge1xuXG5cbiAgICAgIFwia2luZFwiOiBcInlvdXR1YmUjcGxheWxpc3RJdGVtXCIsXG4gICAgICBcImV0YWdcIjogXCJcXFwiY2J6M2xJUTJOMjVBZndOci1CZHhVVnhKX1FZL3IxTzBSQ2IyN08zWksta2tEMmNVWWJIaGxCMFxcXCJcIixcbiAgICAgIFwiaWRcIjogXCJVRXhSWVVwRWQweFllVUowV0hJeFJtVXlSbEo2U1dSVU0xSkdaVWMxTWxGV1JpNUVORFU0UTBNNFJERXhOek0xTWpjeVwiLFxuICAgICAgXCJzbmlwcGV0XCI6IHtcbiAgICAgICAgXCJwdWJsaXNoZWRBdFwiOiBcIjIwMTctMDMtMDNUMTY6MDM6MTQuMDAwWlwiLFxuICAgICAgICBcImNoYW5uZWxJZFwiOiBcIlVDVk00QzFmQjlRY3d5N2ROamJYZVVWd1wiLFxuICAgICAgICBcInRpdGxlXCI6IFwiSmFjayBMZW5veDogQnVpbGRpbmcgVGhlbWVzIHdpdGggdGhlIFdQIFJFU1QgQVBJXCIsXG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJXaXRoIHRoZSBSRVNUIEFQSSBzaG9ydGx5IGR1ZSB0byBiZSBtZXJnZWQgaW50byBXb3JkUHJlc3MgY29yZSwgaXTigJlzIGFib3V0IHRpbWUgZGV2ZWxvcGVycyBzdGFydGVkIHRoaW5raW5nIGFib3V0IGJ1aWxkaW5nIHRoZW1lcyB0aGF0IHVzZSBpdC4gVGhlIFJFU1QgQVBJIGFsbG93cyBkZXZlbG9wZXJzIHRvIGNyZWF0ZSBtdWNoIG1vcmUgZW5nYWdpbmcgdXNlciBleHBlcmllbmNlcy4gVGhpcyBpcyBhIHRhbGsgdGhhdCBjb3ZlcnMgdGhlIGNoYWxsZW5nZXMgb25lIGZhY2VzIHdoZW4gd29ya2luZyB3aXRoIHRoZSBSRVNUIEFQSSwgaG93IHRvIGV4dGVuZCB0aGUgUkVTVCBBUEkgaXRzZWxmIGZyb20gd2l0aGluIHlvdXIgdGhlbWUsIGFuZCBzdWdnZXN0ZWQgd2F5cyB0aGF0IHRoZW1lcyBjYW4gYmUgYnVpbHQgdG8gdXNlIGl0LlxcblxcblNsaWRlczogaHR0cHM6Ly9zcGVha2VyZGVjay5jb20vamFja2xlbm94L2J1aWxkaW5nLXRoZW1lcy13aXRoLXRoZS13cC1yZXN0LWFwaVwiLFxuICAgICAgICBcInRodW1ibmFpbHNcIjoge1xuICAgICAgICAgIFwiZGVmYXVsdFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvMXN5a1ZqSlJJZ00vZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogMTIwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogOTBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwibWVkaXVtXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS8xc3lrVmpKUklnTS9tcWRlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDMyMCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDE4MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJoaWdoXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS8xc3lrVmpKUklnTS9ocWRlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDQ4MCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDM2MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJzdGFuZGFyZFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvMXN5a1ZqSlJJZ00vc2RkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiA2NDAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiA0ODBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwibWF4cmVzXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS8xc3lrVmpKUklnTS9tYXhyZXNkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiAxMjgwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogNzIwXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcImNoYW5uZWxUaXRsZVwiOiBcIkp1c3R5biBDbGFya1wiLFxuICAgICAgICBcInBsYXlsaXN0SWRcIjogXCJQTFFhSkR3TFh5QnRYcjFGZTJGUnpJZFQzUkZlRzUyUVZGXCIsXG4gICAgICAgIFwicG9zaXRpb25cIjogMTksXG4gICAgICAgIFwicmVzb3VyY2VJZFwiOiB7XG4gICAgICAgICAgXCJraW5kXCI6IFwieW91dHViZSN2aWRlb1wiLFxuICAgICAgICAgIFwidmlkZW9JZFwiOiBcIjFzeWtWakpSSWdNXCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwiY29udGVudERldGFpbHNcIjoge1xuICAgICAgICBcInZpZGVvSWRcIjogXCIxc3lrVmpKUklnTVwiLFxuICAgICAgICBcInZpZGVvUHVibGlzaGVkQXRcIjogXCIyMDE2LTA2LTI4VDE3OjUzOjI1LjAwMFpcIlxuICAgICAgfVxuICAgIH0sXG4gICAge1xuXG5cbiAgICAgIFwia2luZFwiOiBcInlvdXR1YmUjcGxheWxpc3RJdGVtXCIsXG4gICAgICBcImV0YWdcIjogXCJcXFwiY2J6M2xJUTJOMjVBZndOci1CZHhVVnhKX1FZL0hINFZjQm0wYmg2M2hJTVpIcnJjNUlOYkFaZ1xcXCJcIixcbiAgICAgIFwiaWRcIjogXCJVRXhSWVVwRWQweFllVUowV0hJeFJtVXlSbEo2U1dSVU0xSkdaVWMxTWxGV1JpNHlNRGhCTWtOQk5qUkRNalF4UVRnMVwiLFxuICAgICAgXCJzbmlwcGV0XCI6IHtcbiAgICAgICAgXCJwdWJsaXNoZWRBdFwiOiBcIjIwMTctMDMtMDZUMTc6NDE6MDAuMDAwWlwiLFxuICAgICAgICBcImNoYW5uZWxJZFwiOiBcIlVDVk00QzFmQjlRY3d5N2ROamJYZVVWd1wiLFxuICAgICAgICBcInRpdGxlXCI6IFwiT2JqZWN0IE9yaWVudGVkIEphdmFTY3JpcHRcIixcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkdldCB0aGUgQ2hlYXQgU2hlZXQgSGVyZSA6IGh0dHA6Ly9nb28uZ2wvQ1FWWnNXXFxuQmVzdCBPYmplY3QgT3JpZW50ZWQgSmF2YVNjcmlwdCBCb29rIDogaHR0cDovL2Ftem4udG8vMUwwTXZzOFxcblxcblN1cHBvcnQgbWUgb24gUGF0cmVvbiA6IGh0dHBzOi8vd3d3LnBhdHJlb24uY29tL2RlcmVrYmFuYXNcXG5cXG4wMTo1MCBKYXZhU2NyaXB0IE9iamVjdHNcXG4wMjozNiBPYmplY3RzIGluIE9iamVjdHNcXG4wNDoxMiBDb25zdHJ1Y3RvciBGdW5jdGlvbnNcXG4wNTo1OCBpbnN0YW5jZW9mXFxuMDY6MjggUGFzc2luZyBPYmplY3RzIHRvIEZ1bmN0aW9uc1xcbjA4OjA5IFByb3RvdHlwZXNcXG4wOTozNCBBZGRpbmcgUHJvcGVydGllcyB0byBPYmplY3RzXFxuMTA6NDQgTGlzdCBQcm9wZXJ0aWVzIGluIE9iamVjdHNcXG4xMTozOCBoYXNPd25Qcm9wZXJ0eVxcbjEyOjQyIEFkZCBQcm9wZXJ0aWVzIHRvIEJ1aWx0IGluIE9iamVjdHNcXG4xNDozMSBQcml2YXRlIFByb3BlcnRpZXNcXG4xODowMSBHZXR0ZXJzIC8gU2V0dGVyc1xcbjIxOjIwIGRlZmluZUdldHRlciAvIGRlZmluZVNldHRlclxcbjI0OjM4IGRlZmluZVByb3BlcnR5XFxuMjc6MDcgQ29uc3RydWN0b3IgRnVuY3Rpb24gR2V0dGVycyAvIFNldHRlcnNcXG4yOTo0MCBJbmhlcml0YW5jZVxcbjM3OjEzIEludGVybWVkaWF0ZSBGdW5jdGlvbiBJbmhlcml0YW5jZVxcbjM5OjE0IENhbGwgUGFyZW50IEZ1bmN0aW9uc1xcbjQxOjUxIEVDTUFTY3JpcHQgNlxcbjQ3OjMxIFNpbmdsZXRvbiBQYXR0ZXJuXFxuNDk6MzIgRmFjdG9yeSBQYXR0ZXJuXFxuNTI6NTMgRGVjb3JhdG9yIFBhdHRlcm5cXG41NDo1MiBPYnNlcnZlciBQYXR0ZXJuXCIsXG4gICAgICAgIFwidGh1bWJuYWlsc1wiOiB7XG4gICAgICAgICAgXCJkZWZhdWx0XCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9POHd3bmhka1BFNC9kZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiAxMjAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiA5MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJtZWRpdW1cIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL084d3duaGRrUEU0L21xZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogMzIwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogMTgwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImhpZ2hcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL084d3duaGRrUEU0L2hxZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogNDgwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogMzYwXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcImNoYW5uZWxUaXRsZVwiOiBcIkp1c3R5biBDbGFya1wiLFxuICAgICAgICBcInBsYXlsaXN0SWRcIjogXCJQTFFhSkR3TFh5QnRYcjFGZTJGUnpJZFQzUkZlRzUyUVZGXCIsXG4gICAgICAgIFwicG9zaXRpb25cIjogMjAsXG4gICAgICAgIFwicmVzb3VyY2VJZFwiOiB7XG4gICAgICAgICAgXCJraW5kXCI6IFwieW91dHViZSN2aWRlb1wiLFxuICAgICAgICAgIFwidmlkZW9JZFwiOiBcIk84d3duaGRrUEU0XCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwiY29udGVudERldGFpbHNcIjoge1xuICAgICAgICBcInZpZGVvSWRcIjogXCJPOHd3bmhka1BFNFwiLFxuICAgICAgICBcInZpZGVvUHVibGlzaGVkQXRcIjogXCIyMDE1LTA5LTI4VDIxOjUyOjQ2LjAwMFpcIlxuICAgICAgfVxuICAgIH0sXG4gICAge1xuXG5cbiAgICAgIFwia2luZFwiOiBcInlvdXR1YmUjcGxheWxpc3RJdGVtXCIsXG4gICAgICBcImV0YWdcIjogXCJcXFwiY2J6M2xJUTJOMjVBZndOci1CZHhVVnhKX1FZL29xS0I5SFJ4UUQxS0Y4aklVLUhyMVA2aDdCVVxcXCJcIixcbiAgICAgIFwiaWRcIjogXCJVRXhSWVVwRWQweFllVUowV0hJeFJtVXlSbEo2U1dSVU0xSkdaVWMxTWxGV1JpNUdNMFEzTTBNek16WTVOVEpGTlRkRVwiLFxuICAgICAgXCJzbmlwcGV0XCI6IHtcbiAgICAgICAgXCJwdWJsaXNoZWRBdFwiOiBcIjIwMTctMDMtMTBUMDI6Mzc6MzkuMDAwWlwiLFxuICAgICAgICBcImNoYW5uZWxJZFwiOiBcIlVDVk00QzFmQjlRY3d5N2ROamJYZVVWd1wiLFxuICAgICAgICBcInRpdGxlXCI6IFwiV29yZFByZXNzIFJFU1QgQVBJIFR1dG9yaWFsIChSZWFsIEV4YW1wbGVzKVwiLFxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiTGV0J3MgbGVhcm4gYWJvdXQgdGhlIG5ldyBXb3JkUHJlc3MgUkVTVCBBUEkuXFxuXFxuTGluayB0byBteSB3ZWJzaXRlOiBodHRwOi8vbGVhcm53ZWJjb2RlLmNvbS9cXG5cXG5NeSBIVE1MICYgQ1NTIENvdXJzZTogaHR0cHM6Ly93d3cudWRlbXkuY29tL3dlYi1kZXNpZ24tZm9yLWJlZ2lubmVycy1yZWFsLXdvcmxkLWNvZGluZy1pbi1odG1sLWNzcy8/Y291cG9uQ29kZT1ZT1VUVUJFLUhBTEYtT0ZGXFxuXFxuTXkgXFxcIkdldCBhIERldmVsb3BlciBKb2JcXFwiIGNvdXJzZTogaHR0cHM6Ly93d3cudWRlbXkuY29tL2dpdC1hLXdlYi1kZXZlbG9wZXItam9iLW1hc3RlcmluZy10aGUtbW9kZXJuLXdvcmtmbG93Lz9jb3Vwb25Db2RlPVlPVVRVQkUtSEFMRi1PRkZcXG5cXG5TdGFydGVyIEFKQVggQ29kZTogaHR0cDovL2NvZGVwZW4uaW8vYW5vbi9wZW4vT2JCUXF2P2VkaXRvcnM9MDAxMFxcblxcblN0YXJ0ZXIgRm9ybSBIVE1MICYgQ1NTOiBodHRwOi8vY29kZXBlbi5pby9hbm9uL3Blbi9qVlFQTHo/ZWRpdG9ycz0xMTAwXFxuXFxuTGluayB0byBkb3dubG9hZCB6aXAgb2YgZmluaXNoZWQgdGhlbWUgZmlsZXM6IGh0dHA6Ly9sZWFybndlYmNvZGUuY29tL3dvcmRwcmVzcy1yZXN0LWFwaS10dXRvcmlhbC1yZWFsLWV4YW1wbGVzL1xcblxcbkFkZCBtZSBvbiBUd2l0dGVyIGZvciB3ZWJEZXYgcmVzb3VyY2VzIGFuZCBjYXQgcGljczogaHR0cHM6Ly90d2l0dGVyLmNvbS9sZWFybndlYmNvZGVcIixcbiAgICAgICAgXCJ0aHVtYm5haWxzXCI6IHtcbiAgICAgICAgICBcImRlZmF1bHRcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL3JHT2JXdGp4R0JjL2RlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDEyMCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDkwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcIm1lZGl1bVwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvckdPYld0anhHQmMvbXFkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiAzMjAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiAxODBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiaGlnaFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvckdPYld0anhHQmMvaHFkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiA0ODAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiAzNjBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwic3RhbmRhcmRcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL3JHT2JXdGp4R0JjL3NkZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogNjQwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogNDgwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcIm1heHJlc1wiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvckdPYld0anhHQmMvbWF4cmVzZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogMTI4MCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDcyMFxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJjaGFubmVsVGl0bGVcIjogXCJKdXN0eW4gQ2xhcmtcIixcbiAgICAgICAgXCJwbGF5bGlzdElkXCI6IFwiUExRYUpEd0xYeUJ0WHIxRmUyRlJ6SWRUM1JGZUc1MlFWRlwiLFxuICAgICAgICBcInBvc2l0aW9uXCI6IDIxLFxuICAgICAgICBcInJlc291cmNlSWRcIjoge1xuICAgICAgICAgIFwia2luZFwiOiBcInlvdXR1YmUjdmlkZW9cIixcbiAgICAgICAgICBcInZpZGVvSWRcIjogXCJyR09iV3RqeEdCY1wiXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcImNvbnRlbnREZXRhaWxzXCI6IHtcbiAgICAgICAgXCJ2aWRlb0lkXCI6IFwickdPYld0anhHQmNcIixcbiAgICAgICAgXCJ2aWRlb1B1Ymxpc2hlZEF0XCI6IFwiMjAxNi0xMi0xNlQwNDo1NzoxMy4wMDBaXCJcbiAgICAgIH1cbiAgICB9LFxuICAgIHtcblxuXG4gICAgICBcImtpbmRcIjogXCJ5b3V0dWJlI3BsYXlsaXN0SXRlbVwiLFxuICAgICAgXCJldGFnXCI6IFwiXFxcImNiejNsSVEyTjI1QWZ3TnItQmR4VVZ4Sl9RWS9rajF2UXM4U0V6UFkyNmhvWGYzbERKcUZnZ2NcXFwiXCIsXG4gICAgICBcImlkXCI6IFwiVUV4UllVcEVkMHhZZVVKMFdISXhSbVV5UmxKNlNXUlVNMUpHWlVjMU1sRldSaTR6UmpNME1rVkNSVGcwTWtZeVFUTTBcIixcbiAgICAgIFwic25pcHBldFwiOiB7XG4gICAgICAgIFwicHVibGlzaGVkQXRcIjogXCIyMDE3LTA0LTAxVDA3OjA4OjAyLjAwMFpcIixcbiAgICAgICAgXCJjaGFubmVsSWRcIjogXCJVQ1ZNNEMxZkI5UWN3eTdkTmpiWGVVVndcIixcbiAgICAgICAgXCJ0aXRsZVwiOiBcIkNhcnRvb25zIEZvciBDaGlsZHJlbiB8IFN1bm55IEJ1bm5pZXMgRUxVU0lWRSBDQUtFIHwgTkVXIFNFQVNPTiB8IEZ1bm55IENhcnRvb25zIEZvciBDaGlsZHJlbiB8XCIsXG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCLilrogU3Vic2NyaWJlIHRvIFN1bm55IEJ1bm5pZXMgZm9yIG5ldyB2aWRlb3M6ICBodHRwOi8vYml0Lmx5LzFVZE1HVXlcXG5cXG7ilrogV2F0Y2ggbW9yZSBGdW5ueSBDYXJ0b29ucyBmb3IgQ2hpbGRyZW4gLVxcbmh0dHBzOi8vd3d3LnlvdXR1YmUuY29tL3dhdGNoP3Y9Z3A1TUF5Ni1OWUEmbGlzdD1QTG9RbHg3ZjZOeC1QeXNva2RjT1J5SDFfVkdBREZsdHR5JmluZGV4PTJcXG5cXG7ilrogV2F0Y2ggbW9yZSBDYXJ0b29ucyBmb3IgQ2hpbGRyZW4gLVxcbmh0dHBzOi8vd3d3LnlvdXR1YmUuY29tL3dhdGNoP3Y9NDZjX1NkTlpsV2smbGlzdD1QTG9RbHg3ZjZOeC1QeXNva2RjT1J5SDFfVkdBREZsdHR5JmluZGV4PTNcXG5cXG7ilrogV2F0Y2ggbW9yZSBTdW5ueSBCdW5uaWVzIC1cXG5odHRwczovL3d3dy55b3V0dWJlLmNvbS93YXRjaD92PThqWV9OcXlnS0xVJmxpc3Q9UExvUWx4N2Y2TngtUHlzb2tkY09SeUgxX1ZHQURGbHR0eSZpbmRleD00XFxuXFxuS2lkcyBhcmUgY2FwYWJsZSBvZiBjb21pbmcgdXAgd2l0aCB0aGUgbW9zdCB1bnJlYWwgYW5kIGZhbnRhc3RpYyBjcmVhdHVyZXMgaW4gdGhlaXIgbWluZHMuIFNoYWRvd3MgYXJlIHNlZW4gYXMgYmxlYWsgYW5kIGdsb29teSwgd2hpbGUgc3VuYmVhbXMgYXJlIGFzc29jaWF0ZWQgd2l0aCBsaWdodCBhbmQgaGFwcGluZXNzLCBhbmQgY2FuIGNyZWF0ZSBmdW5ueSBpbWFnZXMuIFdoYXQgaWYgdGhlc2UgZmFudGFzaWVzIGNhbWUgYWxpdmU/IFdoYXQgaWYgdGhleSBjb3VsZCBqdW1wIG91dCBvZiB0aGUgc3VubGlnaHQ/XFxuXFxuVGhlIFN1bm55IEJ1bm5pZXMgYXJlIGZpdmUgYmVhbWluZyBiYWxscyBvZiBsaWdodCB0aGF0IGNhbiBhcHBlYXIgYW55d2hlcmUgdGhlcmUgaXMgYSBsaWdodCBzb3VyY2UuIFdoZXRoZXIgaXQgaXMgc3VubGlnaHQgb3IgbW9vbmxpZ2h0LCB0aGV5IGJyaW5nIGZ1biBhbmQgaGFwcGluZXNzIGV2ZXJ5d2hlcmUgdGhleSBnby4gSG93ZXZlciwgZWFjaCB0aW1lIHRoZXkgYXBwZWFyIHRoZWlyIGFjdGlvbnMgdHVybiBpbnRvIGEgbWlzY2hpZXZvdXMgZ2FtZS4gU29tZXRpbWVzIHRvbyBtaXNjaGlldm91cy5cXG5cXG5JbiBlYWNoIGVwaXNvZGUsIFN1bm55IEJ1bm5pZXMgYXBwZWFyIGF0IGEgZGlmZmVyZW50IGxvY2F0aW9uOiBhIGNpcmN1cywgYSBzdGFkaXVtLCBhIGNhcnJvdXNlbCwgYSBwYXJrLCBhIHN0YWdl4oCmIFRoZXkgaW1tZWRpYXRlbHkgc3RhcnQgdG8gaW52ZXN0aWdhdGUgdGhlaXIgc3Vycm91bmRpbmdzIGFuZCB0aGF04oCZcyB3aGVuIHRoZSBmdW4gYW5kIG1pc2NoaWVmIGJlZ2luISBBdCB0aGUgdmVyeSBlbmQgb2YgZXZlcnkgZXBpc29kZSwgdGhlIGxhdWdodGVyIGNvbnRpbnVlcyB3aXRoIGEgY29sbGVjdGlvbiBvZiBibG9vcGVycy5cIixcbiAgICAgICAgXCJ0aHVtYm5haWxzXCI6IHtcbiAgICAgICAgICBcImRlZmF1bHRcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL1FYN2lhR2NBeVQ0L2RlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDEyMCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDkwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcIm1lZGl1bVwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvUVg3aWFHY0F5VDQvbXFkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiAzMjAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiAxODBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiaGlnaFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvUVg3aWFHY0F5VDQvaHFkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiA0ODAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiAzNjBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwic3RhbmRhcmRcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL1FYN2lhR2NBeVQ0L3NkZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogNjQwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogNDgwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcIm1heHJlc1wiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvUVg3aWFHY0F5VDQvbWF4cmVzZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogMTI4MCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDcyMFxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJjaGFubmVsVGl0bGVcIjogXCJKdXN0eW4gQ2xhcmtcIixcbiAgICAgICAgXCJwbGF5bGlzdElkXCI6IFwiUExRYUpEd0xYeUJ0WHIxRmUyRlJ6SWRUM1JGZUc1MlFWRlwiLFxuICAgICAgICBcInBvc2l0aW9uXCI6IDIyLFxuICAgICAgICBcInJlc291cmNlSWRcIjoge1xuICAgICAgICAgIFwia2luZFwiOiBcInlvdXR1YmUjdmlkZW9cIixcbiAgICAgICAgICBcInZpZGVvSWRcIjogXCJRWDdpYUdjQXlUNFwiXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcImNvbnRlbnREZXRhaWxzXCI6IHtcbiAgICAgICAgXCJ2aWRlb0lkXCI6IFwiUVg3aWFHY0F5VDRcIixcbiAgICAgICAgXCJ2aWRlb1B1Ymxpc2hlZEF0XCI6IFwiMjAxNy0wMi0xMFQxMTo0Nzo1NC4wMDBaXCJcbiAgICAgIH1cbiAgICB9LFxuICAgIHtcblxuXG4gICAgICBcImtpbmRcIjogXCJ5b3V0dWJlI3BsYXlsaXN0SXRlbVwiLFxuICAgICAgXCJldGFnXCI6IFwiXFxcImNiejNsSVEyTjI1QWZ3TnItQmR4VVZ4Sl9RWS8zcmNwWkJkWXgyTVJIeWFxMWg5emZEWnI5UUVcXFwiXCIsXG4gICAgICBcImlkXCI6IFwiVUV4UllVcEVkMHhZZVVKMFdISXhSbVV5UmxKNlNXUlVNMUpHWlVjMU1sRldSaTQ1TnpVd1FrSTFNMFV4TlRoQk1rVTBcIixcbiAgICAgIFwic25pcHBldFwiOiB7XG4gICAgICAgIFwicHVibGlzaGVkQXRcIjogXCIyMDE3LTA0LTE2VDE3OjI4OjE3LjAwMFpcIixcbiAgICAgICAgXCJjaGFubmVsSWRcIjogXCJVQ1ZNNEMxZkI5UWN3eTdkTmpiWGVVVndcIixcbiAgICAgICAgXCJ0aXRsZVwiOiBcIkphdmFTY3JpcHQgYW5kIHRoZSBET00gKFBhcnQgMSBvZiAyKVwiLFxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiVG9kYXkgQGFkYW1yZWN2bG9oZSB3YWxrcyB1cyB0aHJvdWdoIHNvbWUgZnVuY3Rpb25hbCBKUyBwcm9ncmFtbWluZyB0ZWNobmlxdWVzIGluIFBhcnQgMSBvZiBhIDIgcGFydCBKYXZhc2NyaXB0IHNlcmllcyFcXG5cXG5Qcm9qZWN0IENvZGUgLSBodHRwOi8vY29kZXBlbi5pby9hcmVjdmxvaGUvcGVuL3JlcFhkZVxcblxcbi0gLSAtXFxuXFxuVGhpcyB2aWRlbyB3YXMgc3BvbnNvcmVkIGJ5IHRoZSBEZXZUaXBzIFBhdHJvbiBDb21tdW5pdHkgLSBodHRwczovL3d3dy5wYXRyZW9uLmNvbS9EZXZUaXBzXFxuXFxuTGlzdGVuIHRvIFRyYXZpcycgUG9kY2FzdCAtIGh0dHA6Ly93d3cudHJhdmFuZGxvcy5jb20vXFxuXFxuR2V0IGF3ZXNvbWVuZXNzIGVtYWlsZWQgdG8geW91IGV2ZXJ5IHRodXJzZGF5IC0gaHR0cDovL3RyYXZpc25laWxzb24uY29tL25vdGVzIFxcblxcbllvdSBzaG91bGQgZm9sbG93IERldlRpcHMgb24gVHdpdHRlciAtIGh0dHBzOi8vdHdpdHRlci5jb20vRGV2VGlwc1Nob3dcIixcbiAgICAgICAgXCJ0aHVtYm5haWxzXCI6IHtcbiAgICAgICAgICBcImRlZmF1bHRcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL2hNOWgxd040cmZVL2RlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDEyMCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDkwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcIm1lZGl1bVwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvaE05aDF3TjRyZlUvbXFkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiAzMjAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiAxODBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiaGlnaFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvaE05aDF3TjRyZlUvaHFkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiA0ODAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiAzNjBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwic3RhbmRhcmRcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL2hNOWgxd040cmZVL3NkZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogNjQwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogNDgwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcIm1heHJlc1wiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvaE05aDF3TjRyZlUvbWF4cmVzZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogMTI4MCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDcyMFxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJjaGFubmVsVGl0bGVcIjogXCJKdXN0eW4gQ2xhcmtcIixcbiAgICAgICAgXCJwbGF5bGlzdElkXCI6IFwiUExRYUpEd0xYeUJ0WHIxRmUyRlJ6SWRUM1JGZUc1MlFWRlwiLFxuICAgICAgICBcInBvc2l0aW9uXCI6IDIzLFxuICAgICAgICBcInJlc291cmNlSWRcIjoge1xuICAgICAgICAgIFwia2luZFwiOiBcInlvdXR1YmUjdmlkZW9cIixcbiAgICAgICAgICBcInZpZGVvSWRcIjogXCJoTTloMXdONHJmVVwiXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcImNvbnRlbnREZXRhaWxzXCI6IHtcbiAgICAgICAgXCJ2aWRlb0lkXCI6IFwiaE05aDF3TjRyZlVcIixcbiAgICAgICAgXCJ2aWRlb1B1Ymxpc2hlZEF0XCI6IFwiMjAxNi0wNS0wMlQxNTozNDozNy4wMDBaXCJcbiAgICAgIH1cbiAgICB9LFxuICAgIHtcblxuXG4gICAgICBcImtpbmRcIjogXCJ5b3V0dWJlI3BsYXlsaXN0SXRlbVwiLFxuICAgICAgXCJldGFnXCI6IFwiXFxcImNiejNsSVEyTjI1QWZ3TnItQmR4VVZ4Sl9RWS9UZ2ozUkNBSWZmNjc5bXhoeFVManVyUzFrbjBcXFwiXCIsXG4gICAgICBcImlkXCI6IFwiVUV4UllVcEVkMHhZZVVKMFdISXhSbVV5UmxKNlNXUlVNMUpHWlVjMU1sRldSaTVETnpFMVJqWkVNVVpDTWpBMFJEQkJcIixcbiAgICAgIFwic25pcHBldFwiOiB7XG4gICAgICAgIFwicHVibGlzaGVkQXRcIjogXCIyMDE3LTA1LTA1VDA1OjE4OjM4LjAwMFpcIixcbiAgICAgICAgXCJjaGFubmVsSWRcIjogXCJVQ1ZNNEMxZkI5UWN3eTdkTmpiWGVVVndcIixcbiAgICAgICAgXCJ0aXRsZVwiOiBcIkxlYXJuIE51bWJlcnMgd2l0aCBDb3VudGluZyBhbmQgTGVhcm4gQ29sb3JzIHdpdGggV2F0ZXIgQmFsbG9vbnMgZm9yIENoaWxkcmVuLCBUb2RkbGVycyBhbmQgQmFiaWVzXCIsXG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJBIEdyZWF0IGFuZCBGdW4gV2F5IHRvIExlYXJuIE51bWJlcnMgYW5kIFRvIExlYXJuIHRvIENvdW50IGlzIGJ5IHVzaW5nIENvbG91cnMgV2F0ZXIgQmFsbG9vbnMhIFdlIExpbmVkIHRoZW0gdXAgaW4gZGlmZmVyZW50cyBDb2xvcnMsIHNvIENoaWxkcmVuLCBUb2RkbGVycyBhbmQgQmFiaWVzIGFsc28gY2FuIExlYXJuIENvbG9ycyEgSGF2ZSBGdW4gd2F0Y2hpbmcgdGhpcyBFZHVjYXRpb25hbCB2aWRlbywgaGF2ZSBmdW4gTGVhcm5pbmchXFxuXFxuV2VsY29tZSB0byBvdXIgY2hhbm5lbCwgRnVuVG95c01lZGlhLiBcXG5cXG5XZSBDcmVhdGUgRWR1Y2F0aW9uYWwgYW5kIFRveXMgdmlkZW9zIGZvciBLaWRzIGJ5IGEgS2lkIVxcbk91ciBLaWQgSmFzb24gcGxheXMgaW4gdGhlIFZpZGVvcyBhbmQgaGUgbG92ZXMgdG8gdGVhY2ggQ29sb3JzLCBOdW1iZXJzLCBMZXR0ZXJzIGFuZCBtb3JlISBcXG5XZSBhbHNvIGRvIEZ1biBTa2V0Y2hlcy5cXG5PdXIgS2lkcyB2aWRlb3MgYXJlIGZ1biBhbmQgZXhjaXRpbmcgdG8gd2F0Y2guIFxcblxcbkJhZCBCYWJ5IE1hZ2ljIGFuZCBMZWFybiBDb2xvcnMgd2l0aCBCYWQgR2hvc3RzIGZvciBLaWRzIHwgQmFkIEtpZCBMZWFybnMgQ29sb3VycyBcXG5odHRwczovL3d3dy55b3V0dWJlLmNvbS93YXRjaD92PVo2MHZuRGhjZ2dnXFxuXFxuU3VwZXIgSGVybyBTYWNrIFJhY2UgRm9yIEtpZHMgd2l0aCBTdXBlcm1hbiBhbmQgU3BpZGVybWFuIHwgTGVhcm4gTnVtYmVycyBmb3IgQ2hpbGRyZW4gUGxheSBBY3Rpdml0eSBcXG5odHRwczovL3d3dy55b3V0dWJlLmNvbS93YXRjaD92PUNfTlpzVUl3bmswXFxuXFxuTGVhcm4gRnJ1aXRzIHdpdGggU21vb3RoaWVzIGZvciBDaGlsZHJlbiBhbmQgVG9kZGxlcnMgfCBMZWFybiBDb2xvcnMgd2l0aCBGcnVpdHMgVGFzdGUgQ2hhbGxlbmdlIFxcbmh0dHBzOi8vd3d3LnlvdXR1YmUuY29tL3dhdGNoP3Y9NS1TdnY3NUlFeXdcXG5cXG5MZWFybiBDb2xvdXJzIGFuZCBQb3BwaW5nIFdhdGVyIEJhbGxvb25zIGZvciBDaGlsZHJlbiBhbmQgVG9kZGxlcnMgfCBCYWQgS2lkIExlYXJucyBDb2xvcnMgXFxuaHR0cHM6Ly93d3cueW91dHViZS5jb20vd2F0Y2g/dj1OS1ZJN192SnowNFxcblxcbkxlYXJuIENvbG9ycyB3aXRoIEJhZCBCYWJ5IENyeWluZyBHdW1iYWxsIEJvdHRsZXMgZm9yIEJhYmllcyB8IEZpbmdlciBGYW1pbHkgU29uZyBOdXJzZXJ5IFJoeW1lcyBcXG5odHRwczovL3d3dy55b3V0dWJlLmNvbS93YXRjaD92PXp1SUtIVjhsM1c4XFxuXFxuQmFkIEJhYnkgQ3J5aW5nIExlYXJuIENvbG9ycyBmb3IgVG9kZGxlcnMgYW5kIEJhYmllcyB8IEZpbmdlciBGYW1pbHkgU29uZyBCYWJ5IE51cnNlcnkgUmh5bWVzIFxcbmh0dHBzOi8vd3d3LnlvdXR1YmUuY29tL3dhdGNoP3Y9U09lTzRSbHdCZHNcXG5cXG5MZWFybiBDb2xvcnMgd2l0aCBTa2lwcHkgQmFsbHMgZm9yIENoaWxkcmVuLCBUb2RkbGVycyBhbmQgQmFiaWVzIHwgRnVubnkgRmFjZXMgU2tpcHB5IEJhbGxzIENvbG91cnMgXFxuaHR0cHM6Ly93d3cueW91dHViZS5jb20vd2F0Y2g/dj1TeWg0RnFqQ2hlUVxcblxcbkxlYXJuIENvbG9ycyB3aXRoIEZvb3QgTnVyc2VyeSBTb25ncyBmb3IgQ2hpbGRyZW4sIFRvZGRsZXJzIGFuZCBCYWJpZXMgfCBLaWRzIEZpbmdlciBGYW1pbHkgU29uZ3MgXFxuaHR0cHM6Ly93d3cueW91dHViZS5jb20vd2F0Y2g/dj1yZ2N6N0QyYXIxVVxcblxcbkxlYXJuIE1vbnRocyBvZiB0aGUgWWVhciBmb3IgQ2hpbGRyZW4gYW5kIFRvZGRsZXJzIGFuZCBMZWFybiBDb2xvcnMgZm9yIEtpZHMgRWR1Y2F0aW9uYWwgVmlkZW8gXFxuaHR0cHM6Ly93d3cueW91dHViZS5jb20vd2F0Y2g/dj1YSDVYdWkwVUpVTVxcblxcbkxlYXJuIE51bWJlcnMgYW5kIENvbG9ycyB3aXRoIEJ1Y2tldHMgZm9yIENoaWxkcmVuIGFuZCBUb2RkbGVycyB8IFRocm93IENvbG91cnMgV2F0ZXIgQmFsbG9vbnMgR2FtZSBcXG5odHRwczovL3d3dy55b3V0dWJlLmNvbS93YXRjaD92PTVyNl8tZ3VWQU1nXFxuXFxuTGVhcm4gTnVtYmVycyBhbmQgQ29sb3JzIHdpdGggQ2hvY29sYXRlIEVhc3RlciBFZ2dzIGZvciBDaGlsZHJlbiwgVG9kZGxlcnMgYW5kIEJhYmllcyBcXG5odHRwczovL3d3dy55b3V0dWJlLmNvbS93YXRjaD92PUxOVlItdFFyTVQwXCIsXG4gICAgICAgIFwidGh1bWJuYWlsc1wiOiB7XG4gICAgICAgICAgXCJkZWZhdWx0XCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9WTEk5UnVCWW5kNC9kZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiAxMjAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiA5MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJtZWRpdW1cIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL1ZMSTlSdUJZbmQ0L21xZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogMzIwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogMTgwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImhpZ2hcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL1ZMSTlSdUJZbmQ0L2hxZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogNDgwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogMzYwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInN0YW5kYXJkXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9WTEk5UnVCWW5kNC9zZGRlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDY0MCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDQ4MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJtYXhyZXNcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL1ZMSTlSdUJZbmQ0L21heHJlc2RlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDEyODAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiA3MjBcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIFwiY2hhbm5lbFRpdGxlXCI6IFwiSnVzdHluIENsYXJrXCIsXG4gICAgICAgIFwicGxheWxpc3RJZFwiOiBcIlBMUWFKRHdMWHlCdFhyMUZlMkZSeklkVDNSRmVHNTJRVkZcIixcbiAgICAgICAgXCJwb3NpdGlvblwiOiAyNCxcbiAgICAgICAgXCJyZXNvdXJjZUlkXCI6IHtcbiAgICAgICAgICBcImtpbmRcIjogXCJ5b3V0dWJlI3ZpZGVvXCIsXG4gICAgICAgICAgXCJ2aWRlb0lkXCI6IFwiVkxJOVJ1QlluZDRcIlxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgXCJjb250ZW50RGV0YWlsc1wiOiB7XG4gICAgICAgIFwidmlkZW9JZFwiOiBcIlZMSTlSdUJZbmQ0XCIsXG4gICAgICAgIFwidmlkZW9QdWJsaXNoZWRBdFwiOiBcIjIwMTctMDUtMDRUMDI6MDA6MzYuMDAwWlwiXG4gICAgICB9XG4gICAgfVxuICBdXG59XG4iXX0=
