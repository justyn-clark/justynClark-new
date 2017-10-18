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
  },
  youTubePlayer: function youTubePlayer(id) {
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
    };
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


function getYouTubeIDs() {
  var ids = [];
  for (var i = 0; i < items.length; i++) {
    ids[i] = items[i].contentDetails.videoId;
  }
  return ids;
};

function playRandomYouTubeVideo() {
  var ids = getYouTubeIDs(); // array
  var getRandId = ids[JC.utils.randomNumber(ids.length)];
  var playVideo = JC.utils.youTubePlayer(getRandId);
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvZXZlbnRlbWl0dGVyMi9saWIvZXZlbnRlbWl0dGVyMi5qcyIsIm5vZGVfbW9kdWxlcy9wcm9jZXNzL2Jyb3dzZXIuanMiLCJzcmMvYXBwLmpzIiwic3JjL2pzL21vZHVsZXMvY29uZmlnLmpzIiwic3JjL2pzL21vZHVsZXMvY29va2llcy5qcyIsInNyYy9qcy9tb2R1bGVzL2Ryb3BsZXQuanMiLCJzcmMvanMvbW9kdWxlcy9nbG9iYWwuanMiLCJzcmMvanMvbW9kdWxlcy9oYW5kbGVDbGlja3MuanMiLCJzcmMvanMvbW9kdWxlcy9zaWRlYmFyLmpzIiwic3JjL2pzL21vZHVsZXMvdXRpbHMuanMiLCJzcmMvanMvbW9kdWxlcy95b3VUdWJlUGxheWVyLmpzIiwic3JjL2pzL21vZHVsZXMveW91dHViZURhdGEuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7O0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7O0FDeHdCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7O0FDeExBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUVBOztBQUVBLElBQUksRUFBSixDQUFPLE1BQVA7Ozs7O0FDVEEsSUFBTSxTQUFTLEdBQUcsTUFBSCxHQUFZLEVBQTNCO0FBQ0UsT0FBTyxPQUFQLEdBQWlC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O0FBRWhCLDBCQUFvQjtBQUZKO0FBOUNwQixHQXZwQ087QUFSSyxDQUFoQiIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCIvKiFcclxuICogRXZlbnRFbWl0dGVyMlxyXG4gKiBodHRwczovL2dpdGh1Yi5jb20vaGlqMW54L0V2ZW50RW1pdHRlcjJcclxuICpcclxuICogQ29weXJpZ2h0IChjKSAyMDEzIGhpajFueFxyXG4gKiBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIGxpY2Vuc2UuXHJcbiAqL1xyXG47IWZ1bmN0aW9uKHVuZGVmaW5lZCkge1xyXG5cclxuICB2YXIgaXNBcnJheSA9IEFycmF5LmlzQXJyYXkgPyBBcnJheS5pc0FycmF5IDogZnVuY3Rpb24gX2lzQXJyYXkob2JqKSB7XHJcbiAgICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKG9iaikgPT09IFwiW29iamVjdCBBcnJheV1cIjtcclxuICB9O1xyXG4gIHZhciBkZWZhdWx0TWF4TGlzdGVuZXJzID0gMTA7XHJcblxyXG4gIGZ1bmN0aW9uIGluaXQoKSB7XHJcbiAgICB0aGlzLl9ldmVudHMgPSB7fTtcclxuICAgIGlmICh0aGlzLl9jb25mKSB7XHJcbiAgICAgIGNvbmZpZ3VyZS5jYWxsKHRoaXMsIHRoaXMuX2NvbmYpO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gY29uZmlndXJlKGNvbmYpIHtcclxuICAgIGlmIChjb25mKSB7XHJcbiAgICAgIHRoaXMuX2NvbmYgPSBjb25mO1xyXG5cclxuICAgICAgY29uZi5kZWxpbWl0ZXIgJiYgKHRoaXMuZGVsaW1pdGVyID0gY29uZi5kZWxpbWl0ZXIpO1xyXG4gICAgICB0aGlzLl9tYXhMaXN0ZW5lcnMgPSBjb25mLm1heExpc3RlbmVycyAhPT0gdW5kZWZpbmVkID8gY29uZi5tYXhMaXN0ZW5lcnMgOiBkZWZhdWx0TWF4TGlzdGVuZXJzO1xyXG5cclxuICAgICAgY29uZi53aWxkY2FyZCAmJiAodGhpcy53aWxkY2FyZCA9IGNvbmYud2lsZGNhcmQpO1xyXG4gICAgICBjb25mLm5ld0xpc3RlbmVyICYmICh0aGlzLm5ld0xpc3RlbmVyID0gY29uZi5uZXdMaXN0ZW5lcik7XHJcbiAgICAgIGNvbmYudmVyYm9zZU1lbW9yeUxlYWsgJiYgKHRoaXMudmVyYm9zZU1lbW9yeUxlYWsgPSBjb25mLnZlcmJvc2VNZW1vcnlMZWFrKTtcclxuXHJcbiAgICAgIGlmICh0aGlzLndpbGRjYXJkKSB7XHJcbiAgICAgICAgdGhpcy5saXN0ZW5lclRyZWUgPSB7fTtcclxuICAgICAgfVxyXG4gICAgfSBlbHNlIHtcclxuICAgICAgdGhpcy5fbWF4TGlzdGVuZXJzID0gZGVmYXVsdE1heExpc3RlbmVycztcclxuICAgIH1cclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIGxvZ1Bvc3NpYmxlTWVtb3J5TGVhayhjb3VudCwgZXZlbnROYW1lKSB7XHJcbiAgICB2YXIgZXJyb3JNc2cgPSAnKG5vZGUpIHdhcm5pbmc6IHBvc3NpYmxlIEV2ZW50RW1pdHRlciBtZW1vcnkgJyArXHJcbiAgICAgICAgJ2xlYWsgZGV0ZWN0ZWQuICcgKyBjb3VudCArICcgbGlzdGVuZXJzIGFkZGVkLiAnICtcclxuICAgICAgICAnVXNlIGVtaXR0ZXIuc2V0TWF4TGlzdGVuZXJzKCkgdG8gaW5jcmVhc2UgbGltaXQuJztcclxuXHJcbiAgICBpZih0aGlzLnZlcmJvc2VNZW1vcnlMZWFrKXtcclxuICAgICAgZXJyb3JNc2cgKz0gJyBFdmVudCBuYW1lOiAnICsgZXZlbnROYW1lICsgJy4nO1xyXG4gICAgfVxyXG5cclxuICAgIGlmKHR5cGVvZiBwcm9jZXNzICE9PSAndW5kZWZpbmVkJyAmJiBwcm9jZXNzLmVtaXRXYXJuaW5nKXtcclxuICAgICAgdmFyIGUgPSBuZXcgRXJyb3IoZXJyb3JNc2cpO1xyXG4gICAgICBlLm5hbWUgPSAnTWF4TGlzdGVuZXJzRXhjZWVkZWRXYXJuaW5nJztcclxuICAgICAgZS5lbWl0dGVyID0gdGhpcztcclxuICAgICAgZS5jb3VudCA9IGNvdW50O1xyXG4gICAgICBwcm9jZXNzLmVtaXRXYXJuaW5nKGUpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgY29uc29sZS5lcnJvcihlcnJvck1zZyk7XHJcblxyXG4gICAgICBpZiAoY29uc29sZS50cmFjZSl7XHJcbiAgICAgICAgY29uc29sZS50cmFjZSgpO1xyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBFdmVudEVtaXR0ZXIoY29uZikge1xyXG4gICAgdGhpcy5fZXZlbnRzID0ge307XHJcbiAgICB0aGlzLm5ld0xpc3RlbmVyID0gZmFsc2U7XHJcbiAgICB0aGlzLnZlcmJvc2VNZW1vcnlMZWFrID0gZmFsc2U7XHJcbiAgICBjb25maWd1cmUuY2FsbCh0aGlzLCBjb25mKTtcclxuICB9XHJcbiAgRXZlbnRFbWl0dGVyLkV2ZW50RW1pdHRlcjIgPSBFdmVudEVtaXR0ZXI7IC8vIGJhY2t3YXJkcyBjb21wYXRpYmlsaXR5IGZvciBleHBvcnRpbmcgRXZlbnRFbWl0dGVyIHByb3BlcnR5XHJcblxyXG4gIC8vXHJcbiAgLy8gQXR0ZW50aW9uLCBmdW5jdGlvbiByZXR1cm4gdHlwZSBub3cgaXMgYXJyYXksIGFsd2F5cyAhXHJcbiAgLy8gSXQgaGFzIHplcm8gZWxlbWVudHMgaWYgbm8gYW55IG1hdGNoZXMgZm91bmQgYW5kIG9uZSBvciBtb3JlXHJcbiAgLy8gZWxlbWVudHMgKGxlYWZzKSBpZiB0aGVyZSBhcmUgbWF0Y2hlc1xyXG4gIC8vXHJcbiAgZnVuY3Rpb24gc2VhcmNoTGlzdGVuZXJUcmVlKGhhbmRsZXJzLCB0eXBlLCB0cmVlLCBpKSB7XHJcbiAgICBpZiAoIXRyZWUpIHtcclxuICAgICAgcmV0dXJuIFtdO1xyXG4gICAgfVxyXG4gICAgdmFyIGxpc3RlbmVycz1bXSwgbGVhZiwgbGVuLCBicmFuY2gsIHhUcmVlLCB4eFRyZWUsIGlzb2xhdGVkQnJhbmNoLCBlbmRSZWFjaGVkLFxyXG4gICAgICAgIHR5cGVMZW5ndGggPSB0eXBlLmxlbmd0aCwgY3VycmVudFR5cGUgPSB0eXBlW2ldLCBuZXh0VHlwZSA9IHR5cGVbaSsxXTtcclxuICAgIGlmIChpID09PSB0eXBlTGVuZ3RoICYmIHRyZWUuX2xpc3RlbmVycykge1xyXG4gICAgICAvL1xyXG4gICAgICAvLyBJZiBhdCB0aGUgZW5kIG9mIHRoZSBldmVudChzKSBsaXN0IGFuZCB0aGUgdHJlZSBoYXMgbGlzdGVuZXJzXHJcbiAgICAgIC8vIGludm9rZSB0aG9zZSBsaXN0ZW5lcnMuXHJcbiAgICAgIC8vXHJcbiAgICAgIGlmICh0eXBlb2YgdHJlZS5fbGlzdGVuZXJzID09PSAnZnVuY3Rpb24nKSB7XHJcbiAgICAgICAgaGFuZGxlcnMgJiYgaGFuZGxlcnMucHVzaCh0cmVlLl9saXN0ZW5lcnMpO1xyXG4gICAgICAgIHJldHVybiBbdHJlZV07XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgZm9yIChsZWFmID0gMCwgbGVuID0gdHJlZS5fbGlzdGVuZXJzLmxlbmd0aDsgbGVhZiA8IGxlbjsgbGVhZisrKSB7XHJcbiAgICAgICAgICBoYW5kbGVycyAmJiBoYW5kbGVycy5wdXNoKHRyZWUuX2xpc3RlbmVyc1tsZWFmXSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBbdHJlZV07XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBpZiAoKGN1cnJlbnRUeXBlID09PSAnKicgfHwgY3VycmVudFR5cGUgPT09ICcqKicpIHx8IHRyZWVbY3VycmVudFR5cGVdKSB7XHJcbiAgICAgIC8vXHJcbiAgICAgIC8vIElmIHRoZSBldmVudCBlbWl0dGVkIGlzICcqJyBhdCB0aGlzIHBhcnRcclxuICAgICAgLy8gb3IgdGhlcmUgaXMgYSBjb25jcmV0ZSBtYXRjaCBhdCB0aGlzIHBhdGNoXHJcbiAgICAgIC8vXHJcbiAgICAgIGlmIChjdXJyZW50VHlwZSA9PT0gJyonKSB7XHJcbiAgICAgICAgZm9yIChicmFuY2ggaW4gdHJlZSkge1xyXG4gICAgICAgICAgaWYgKGJyYW5jaCAhPT0gJ19saXN0ZW5lcnMnICYmIHRyZWUuaGFzT3duUHJvcGVydHkoYnJhbmNoKSkge1xyXG4gICAgICAgICAgICBsaXN0ZW5lcnMgPSBsaXN0ZW5lcnMuY29uY2F0KHNlYXJjaExpc3RlbmVyVHJlZShoYW5kbGVycywgdHlwZSwgdHJlZVticmFuY2hdLCBpKzEpKTtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIGxpc3RlbmVycztcclxuICAgICAgfSBlbHNlIGlmKGN1cnJlbnRUeXBlID09PSAnKionKSB7XHJcbiAgICAgICAgZW5kUmVhY2hlZCA9IChpKzEgPT09IHR5cGVMZW5ndGggfHwgKGkrMiA9PT0gdHlwZUxlbmd0aCAmJiBuZXh0VHlwZSA9PT0gJyonKSk7XHJcbiAgICAgICAgaWYoZW5kUmVhY2hlZCAmJiB0cmVlLl9saXN0ZW5lcnMpIHtcclxuICAgICAgICAgIC8vIFRoZSBuZXh0IGVsZW1lbnQgaGFzIGEgX2xpc3RlbmVycywgYWRkIGl0IHRvIHRoZSBoYW5kbGVycy5cclxuICAgICAgICAgIGxpc3RlbmVycyA9IGxpc3RlbmVycy5jb25jYXQoc2VhcmNoTGlzdGVuZXJUcmVlKGhhbmRsZXJzLCB0eXBlLCB0cmVlLCB0eXBlTGVuZ3RoKSk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBmb3IgKGJyYW5jaCBpbiB0cmVlKSB7XHJcbiAgICAgICAgICBpZiAoYnJhbmNoICE9PSAnX2xpc3RlbmVycycgJiYgdHJlZS5oYXNPd25Qcm9wZXJ0eShicmFuY2gpKSB7XHJcbiAgICAgICAgICAgIGlmKGJyYW5jaCA9PT0gJyonIHx8IGJyYW5jaCA9PT0gJyoqJykge1xyXG4gICAgICAgICAgICAgIGlmKHRyZWVbYnJhbmNoXS5fbGlzdGVuZXJzICYmICFlbmRSZWFjaGVkKSB7XHJcbiAgICAgICAgICAgICAgICBsaXN0ZW5lcnMgPSBsaXN0ZW5lcnMuY29uY2F0KHNlYXJjaExpc3RlbmVyVHJlZShoYW5kbGVycywgdHlwZSwgdHJlZVticmFuY2hdLCB0eXBlTGVuZ3RoKSk7XHJcbiAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgIGxpc3RlbmVycyA9IGxpc3RlbmVycy5jb25jYXQoc2VhcmNoTGlzdGVuZXJUcmVlKGhhbmRsZXJzLCB0eXBlLCB0cmVlW2JyYW5jaF0sIGkpKTtcclxuICAgICAgICAgICAgfSBlbHNlIGlmKGJyYW5jaCA9PT0gbmV4dFR5cGUpIHtcclxuICAgICAgICAgICAgICBsaXN0ZW5lcnMgPSBsaXN0ZW5lcnMuY29uY2F0KHNlYXJjaExpc3RlbmVyVHJlZShoYW5kbGVycywgdHlwZSwgdHJlZVticmFuY2hdLCBpKzIpKTtcclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAvLyBObyBtYXRjaCBvbiB0aGlzIG9uZSwgc2hpZnQgaW50byB0aGUgdHJlZSBidXQgbm90IGluIHRoZSB0eXBlIGFycmF5LlxyXG4gICAgICAgICAgICAgIGxpc3RlbmVycyA9IGxpc3RlbmVycy5jb25jYXQoc2VhcmNoTGlzdGVuZXJUcmVlKGhhbmRsZXJzLCB0eXBlLCB0cmVlW2JyYW5jaF0sIGkpKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gbGlzdGVuZXJzO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBsaXN0ZW5lcnMgPSBsaXN0ZW5lcnMuY29uY2F0KHNlYXJjaExpc3RlbmVyVHJlZShoYW5kbGVycywgdHlwZSwgdHJlZVtjdXJyZW50VHlwZV0sIGkrMSkpO1xyXG4gICAgfVxyXG5cclxuICAgIHhUcmVlID0gdHJlZVsnKiddO1xyXG4gICAgaWYgKHhUcmVlKSB7XHJcbiAgICAgIC8vXHJcbiAgICAgIC8vIElmIHRoZSBsaXN0ZW5lciB0cmVlIHdpbGwgYWxsb3cgYW55IG1hdGNoIGZvciB0aGlzIHBhcnQsXHJcbiAgICAgIC8vIHRoZW4gcmVjdXJzaXZlbHkgZXhwbG9yZSBhbGwgYnJhbmNoZXMgb2YgdGhlIHRyZWVcclxuICAgICAgLy9cclxuICAgICAgc2VhcmNoTGlzdGVuZXJUcmVlKGhhbmRsZXJzLCB0eXBlLCB4VHJlZSwgaSsxKTtcclxuICAgIH1cclxuXHJcbiAgICB4eFRyZWUgPSB0cmVlWycqKiddO1xyXG4gICAgaWYoeHhUcmVlKSB7XHJcbiAgICAgIGlmKGkgPCB0eXBlTGVuZ3RoKSB7XHJcbiAgICAgICAgaWYoeHhUcmVlLl9saXN0ZW5lcnMpIHtcclxuICAgICAgICAgIC8vIElmIHdlIGhhdmUgYSBsaXN0ZW5lciBvbiBhICcqKicsIGl0IHdpbGwgY2F0Y2ggYWxsLCBzbyBhZGQgaXRzIGhhbmRsZXIuXHJcbiAgICAgICAgICBzZWFyY2hMaXN0ZW5lclRyZWUoaGFuZGxlcnMsIHR5cGUsIHh4VHJlZSwgdHlwZUxlbmd0aCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBCdWlsZCBhcnJheXMgb2YgbWF0Y2hpbmcgbmV4dCBicmFuY2hlcyBhbmQgb3RoZXJzLlxyXG4gICAgICAgIGZvcihicmFuY2ggaW4geHhUcmVlKSB7XHJcbiAgICAgICAgICBpZihicmFuY2ggIT09ICdfbGlzdGVuZXJzJyAmJiB4eFRyZWUuaGFzT3duUHJvcGVydHkoYnJhbmNoKSkge1xyXG4gICAgICAgICAgICBpZihicmFuY2ggPT09IG5leHRUeXBlKSB7XHJcbiAgICAgICAgICAgICAgLy8gV2Uga25vdyB0aGUgbmV4dCBlbGVtZW50IHdpbGwgbWF0Y2gsIHNvIGp1bXAgdHdpY2UuXHJcbiAgICAgICAgICAgICAgc2VhcmNoTGlzdGVuZXJUcmVlKGhhbmRsZXJzLCB0eXBlLCB4eFRyZWVbYnJhbmNoXSwgaSsyKTtcclxuICAgICAgICAgICAgfSBlbHNlIGlmKGJyYW5jaCA9PT0gY3VycmVudFR5cGUpIHtcclxuICAgICAgICAgICAgICAvLyBDdXJyZW50IG5vZGUgbWF0Y2hlcywgbW92ZSBpbnRvIHRoZSB0cmVlLlxyXG4gICAgICAgICAgICAgIHNlYXJjaExpc3RlbmVyVHJlZShoYW5kbGVycywgdHlwZSwgeHhUcmVlW2JyYW5jaF0sIGkrMSk7XHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgaXNvbGF0ZWRCcmFuY2ggPSB7fTtcclxuICAgICAgICAgICAgICBpc29sYXRlZEJyYW5jaFticmFuY2hdID0geHhUcmVlW2JyYW5jaF07XHJcbiAgICAgICAgICAgICAgc2VhcmNoTGlzdGVuZXJUcmVlKGhhbmRsZXJzLCB0eXBlLCB7ICcqKic6IGlzb2xhdGVkQnJhbmNoIH0sIGkrMSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgIH0gZWxzZSBpZih4eFRyZWUuX2xpc3RlbmVycykge1xyXG4gICAgICAgIC8vIFdlIGhhdmUgcmVhY2hlZCB0aGUgZW5kIGFuZCBzdGlsbCBvbiBhICcqKidcclxuICAgICAgICBzZWFyY2hMaXN0ZW5lclRyZWUoaGFuZGxlcnMsIHR5cGUsIHh4VHJlZSwgdHlwZUxlbmd0aCk7XHJcbiAgICAgIH0gZWxzZSBpZih4eFRyZWVbJyonXSAmJiB4eFRyZWVbJyonXS5fbGlzdGVuZXJzKSB7XHJcbiAgICAgICAgc2VhcmNoTGlzdGVuZXJUcmVlKGhhbmRsZXJzLCB0eXBlLCB4eFRyZWVbJyonXSwgdHlwZUxlbmd0aCk7XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gbGlzdGVuZXJzO1xyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gZ3Jvd0xpc3RlbmVyVHJlZSh0eXBlLCBsaXN0ZW5lcikge1xyXG5cclxuICAgIHR5cGUgPSB0eXBlb2YgdHlwZSA9PT0gJ3N0cmluZycgPyB0eXBlLnNwbGl0KHRoaXMuZGVsaW1pdGVyKSA6IHR5cGUuc2xpY2UoKTtcclxuXHJcbiAgICAvL1xyXG4gICAgLy8gTG9va3MgZm9yIHR3byBjb25zZWN1dGl2ZSAnKionLCBpZiBzbywgZG9uJ3QgYWRkIHRoZSBldmVudCBhdCBhbGwuXHJcbiAgICAvL1xyXG4gICAgZm9yKHZhciBpID0gMCwgbGVuID0gdHlwZS5sZW5ndGg7IGkrMSA8IGxlbjsgaSsrKSB7XHJcbiAgICAgIGlmKHR5cGVbaV0gPT09ICcqKicgJiYgdHlwZVtpKzFdID09PSAnKionKSB7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgdmFyIHRyZWUgPSB0aGlzLmxpc3RlbmVyVHJlZTtcclxuICAgIHZhciBuYW1lID0gdHlwZS5zaGlmdCgpO1xyXG5cclxuICAgIHdoaWxlIChuYW1lICE9PSB1bmRlZmluZWQpIHtcclxuXHJcbiAgICAgIGlmICghdHJlZVtuYW1lXSkge1xyXG4gICAgICAgIHRyZWVbbmFtZV0gPSB7fTtcclxuICAgICAgfVxyXG5cclxuICAgICAgdHJlZSA9IHRyZWVbbmFtZV07XHJcblxyXG4gICAgICBpZiAodHlwZS5sZW5ndGggPT09IDApIHtcclxuXHJcbiAgICAgICAgaWYgKCF0cmVlLl9saXN0ZW5lcnMpIHtcclxuICAgICAgICAgIHRyZWUuX2xpc3RlbmVycyA9IGxpc3RlbmVyO1xyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNlIHtcclxuICAgICAgICAgIGlmICh0eXBlb2YgdHJlZS5fbGlzdGVuZXJzID09PSAnZnVuY3Rpb24nKSB7XHJcbiAgICAgICAgICAgIHRyZWUuX2xpc3RlbmVycyA9IFt0cmVlLl9saXN0ZW5lcnNdO1xyXG4gICAgICAgICAgfVxyXG5cclxuICAgICAgICAgIHRyZWUuX2xpc3RlbmVycy5wdXNoKGxpc3RlbmVyKTtcclxuXHJcbiAgICAgICAgICBpZiAoXHJcbiAgICAgICAgICAgICF0cmVlLl9saXN0ZW5lcnMud2FybmVkICYmXHJcbiAgICAgICAgICAgIHRoaXMuX21heExpc3RlbmVycyA+IDAgJiZcclxuICAgICAgICAgICAgdHJlZS5fbGlzdGVuZXJzLmxlbmd0aCA+IHRoaXMuX21heExpc3RlbmVyc1xyXG4gICAgICAgICAgKSB7XHJcbiAgICAgICAgICAgIHRyZWUuX2xpc3RlbmVycy53YXJuZWQgPSB0cnVlO1xyXG4gICAgICAgICAgICBsb2dQb3NzaWJsZU1lbW9yeUxlYWsuY2FsbCh0aGlzLCB0cmVlLl9saXN0ZW5lcnMubGVuZ3RoLCBuYW1lKTtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgIH1cclxuICAgICAgbmFtZSA9IHR5cGUuc2hpZnQoKTtcclxuICAgIH1cclxuICAgIHJldHVybiB0cnVlO1xyXG4gIH1cclxuXHJcbiAgLy8gQnkgZGVmYXVsdCBFdmVudEVtaXR0ZXJzIHdpbGwgcHJpbnQgYSB3YXJuaW5nIGlmIG1vcmUgdGhhblxyXG4gIC8vIDEwIGxpc3RlbmVycyBhcmUgYWRkZWQgdG8gaXQuIFRoaXMgaXMgYSB1c2VmdWwgZGVmYXVsdCB3aGljaFxyXG4gIC8vIGhlbHBzIGZpbmRpbmcgbWVtb3J5IGxlYWtzLlxyXG4gIC8vXHJcbiAgLy8gT2J2aW91c2x5IG5vdCBhbGwgRW1pdHRlcnMgc2hvdWxkIGJlIGxpbWl0ZWQgdG8gMTAuIFRoaXMgZnVuY3Rpb24gYWxsb3dzXHJcbiAgLy8gdGhhdCB0byBiZSBpbmNyZWFzZWQuIFNldCB0byB6ZXJvIGZvciB1bmxpbWl0ZWQuXHJcblxyXG4gIEV2ZW50RW1pdHRlci5wcm90b3R5cGUuZGVsaW1pdGVyID0gJy4nO1xyXG5cclxuICBFdmVudEVtaXR0ZXIucHJvdG90eXBlLnNldE1heExpc3RlbmVycyA9IGZ1bmN0aW9uKG4pIHtcclxuICAgIGlmIChuICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgdGhpcy5fbWF4TGlzdGVuZXJzID0gbjtcclxuICAgICAgaWYgKCF0aGlzLl9jb25mKSB0aGlzLl9jb25mID0ge307XHJcbiAgICAgIHRoaXMuX2NvbmYubWF4TGlzdGVuZXJzID0gbjtcclxuICAgIH1cclxuICB9O1xyXG5cclxuICBFdmVudEVtaXR0ZXIucHJvdG90eXBlLmV2ZW50ID0gJyc7XHJcblxyXG5cclxuICBFdmVudEVtaXR0ZXIucHJvdG90eXBlLm9uY2UgPSBmdW5jdGlvbihldmVudCwgZm4pIHtcclxuICAgIHJldHVybiB0aGlzLl9vbmNlKGV2ZW50LCBmbiwgZmFsc2UpO1xyXG4gIH07XHJcblxyXG4gIEV2ZW50RW1pdHRlci5wcm90b3R5cGUucHJlcGVuZE9uY2VMaXN0ZW5lciA9IGZ1bmN0aW9uKGV2ZW50LCBmbikge1xyXG4gICAgcmV0dXJuIHRoaXMuX29uY2UoZXZlbnQsIGZuLCB0cnVlKTtcclxuICB9O1xyXG5cclxuICBFdmVudEVtaXR0ZXIucHJvdG90eXBlLl9vbmNlID0gZnVuY3Rpb24oZXZlbnQsIGZuLCBwcmVwZW5kKSB7XHJcbiAgICB0aGlzLl9tYW55KGV2ZW50LCAxLCBmbiwgcHJlcGVuZCk7XHJcbiAgICByZXR1cm4gdGhpcztcclxuICB9O1xyXG5cclxuICBFdmVudEVtaXR0ZXIucHJvdG90eXBlLm1hbnkgPSBmdW5jdGlvbihldmVudCwgdHRsLCBmbikge1xyXG4gICAgcmV0dXJuIHRoaXMuX21hbnkoZXZlbnQsIHR0bCwgZm4sIGZhbHNlKTtcclxuICB9XHJcblxyXG4gIEV2ZW50RW1pdHRlci5wcm90b3R5cGUucHJlcGVuZE1hbnkgPSBmdW5jdGlvbihldmVudCwgdHRsLCBmbikge1xyXG4gICAgcmV0dXJuIHRoaXMuX21hbnkoZXZlbnQsIHR0bCwgZm4sIHRydWUpO1xyXG4gIH1cclxuXHJcbiAgRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5fbWFueSA9IGZ1bmN0aW9uKGV2ZW50LCB0dGwsIGZuLCBwcmVwZW5kKSB7XHJcbiAgICB2YXIgc2VsZiA9IHRoaXM7XHJcblxyXG4gICAgaWYgKHR5cGVvZiBmbiAhPT0gJ2Z1bmN0aW9uJykge1xyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ21hbnkgb25seSBhY2NlcHRzIGluc3RhbmNlcyBvZiBGdW5jdGlvbicpO1xyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIGxpc3RlbmVyKCkge1xyXG4gICAgICBpZiAoLS10dGwgPT09IDApIHtcclxuICAgICAgICBzZWxmLm9mZihldmVudCwgbGlzdGVuZXIpO1xyXG4gICAgICB9XHJcbiAgICAgIHJldHVybiBmbi5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xyXG4gICAgfVxyXG5cclxuICAgIGxpc3RlbmVyLl9vcmlnaW4gPSBmbjtcclxuXHJcbiAgICB0aGlzLl9vbihldmVudCwgbGlzdGVuZXIsIHByZXBlbmQpO1xyXG5cclxuICAgIHJldHVybiBzZWxmO1xyXG4gIH07XHJcblxyXG4gIEV2ZW50RW1pdHRlci5wcm90b3R5cGUuZW1pdCA9IGZ1bmN0aW9uKCkge1xyXG5cclxuICAgIHRoaXMuX2V2ZW50cyB8fCBpbml0LmNhbGwodGhpcyk7XHJcblxyXG4gICAgdmFyIHR5cGUgPSBhcmd1bWVudHNbMF07XHJcblxyXG4gICAgaWYgKHR5cGUgPT09ICduZXdMaXN0ZW5lcicgJiYgIXRoaXMubmV3TGlzdGVuZXIpIHtcclxuICAgICAgaWYgKCF0aGlzLl9ldmVudHMubmV3TGlzdGVuZXIpIHtcclxuICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICB2YXIgYWwgPSBhcmd1bWVudHMubGVuZ3RoO1xyXG4gICAgdmFyIGFyZ3MsbCxpLGo7XHJcbiAgICB2YXIgaGFuZGxlcjtcclxuXHJcbiAgICBpZiAodGhpcy5fYWxsICYmIHRoaXMuX2FsbC5sZW5ndGgpIHtcclxuICAgICAgaGFuZGxlciA9IHRoaXMuX2FsbC5zbGljZSgpO1xyXG4gICAgICBpZiAoYWwgPiAzKSB7XHJcbiAgICAgICAgYXJncyA9IG5ldyBBcnJheShhbCk7XHJcbiAgICAgICAgZm9yIChqID0gMDsgaiA8IGFsOyBqKyspIGFyZ3Nbal0gPSBhcmd1bWVudHNbal07XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGZvciAoaSA9IDAsIGwgPSBoYW5kbGVyLmxlbmd0aDsgaSA8IGw7IGkrKykge1xyXG4gICAgICAgIHRoaXMuZXZlbnQgPSB0eXBlO1xyXG4gICAgICAgIHN3aXRjaCAoYWwpIHtcclxuICAgICAgICBjYXNlIDE6XHJcbiAgICAgICAgICBoYW5kbGVyW2ldLmNhbGwodGhpcywgdHlwZSk7XHJcbiAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIDI6XHJcbiAgICAgICAgICBoYW5kbGVyW2ldLmNhbGwodGhpcywgdHlwZSwgYXJndW1lbnRzWzFdKTtcclxuICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgMzpcclxuICAgICAgICAgIGhhbmRsZXJbaV0uY2FsbCh0aGlzLCB0eXBlLCBhcmd1bWVudHNbMV0sIGFyZ3VtZW50c1syXSk7XHJcbiAgICAgICAgICBicmVhaztcclxuICAgICAgICBkZWZhdWx0OlxyXG4gICAgICAgICAgaGFuZGxlcltpXS5hcHBseSh0aGlzLCBhcmdzKTtcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBpZiAodGhpcy53aWxkY2FyZCkge1xyXG4gICAgICBoYW5kbGVyID0gW107XHJcbiAgICAgIHZhciBucyA9IHR5cGVvZiB0eXBlID09PSAnc3RyaW5nJyA/IHR5cGUuc3BsaXQodGhpcy5kZWxpbWl0ZXIpIDogdHlwZS5zbGljZSgpO1xyXG4gICAgICBzZWFyY2hMaXN0ZW5lclRyZWUuY2FsbCh0aGlzLCBoYW5kbGVyLCBucywgdGhpcy5saXN0ZW5lclRyZWUsIDApO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgaGFuZGxlciA9IHRoaXMuX2V2ZW50c1t0eXBlXTtcclxuICAgICAgaWYgKHR5cGVvZiBoYW5kbGVyID09PSAnZnVuY3Rpb24nKSB7XHJcbiAgICAgICAgdGhpcy5ldmVudCA9IHR5cGU7XHJcbiAgICAgICAgc3dpdGNoIChhbCkge1xyXG4gICAgICAgIGNhc2UgMTpcclxuICAgICAgICAgIGhhbmRsZXIuY2FsbCh0aGlzKTtcclxuICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgMjpcclxuICAgICAgICAgIGhhbmRsZXIuY2FsbCh0aGlzLCBhcmd1bWVudHNbMV0pO1xyXG4gICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSAzOlxyXG4gICAgICAgICAgaGFuZGxlci5jYWxsKHRoaXMsIGFyZ3VtZW50c1sxXSwgYXJndW1lbnRzWzJdKTtcclxuICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgICBhcmdzID0gbmV3IEFycmF5KGFsIC0gMSk7XHJcbiAgICAgICAgICBmb3IgKGogPSAxOyBqIDwgYWw7IGorKykgYXJnc1tqIC0gMV0gPSBhcmd1bWVudHNbal07XHJcbiAgICAgICAgICBoYW5kbGVyLmFwcGx5KHRoaXMsIGFyZ3MpO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgfSBlbHNlIGlmIChoYW5kbGVyKSB7XHJcbiAgICAgICAgLy8gbmVlZCB0byBtYWtlIGNvcHkgb2YgaGFuZGxlcnMgYmVjYXVzZSBsaXN0IGNhbiBjaGFuZ2UgaW4gdGhlIG1pZGRsZVxyXG4gICAgICAgIC8vIG9mIGVtaXQgY2FsbFxyXG4gICAgICAgIGhhbmRsZXIgPSBoYW5kbGVyLnNsaWNlKCk7XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBpZiAoaGFuZGxlciAmJiBoYW5kbGVyLmxlbmd0aCkge1xyXG4gICAgICBpZiAoYWwgPiAzKSB7XHJcbiAgICAgICAgYXJncyA9IG5ldyBBcnJheShhbCAtIDEpO1xyXG4gICAgICAgIGZvciAoaiA9IDE7IGogPCBhbDsgaisrKSBhcmdzW2ogLSAxXSA9IGFyZ3VtZW50c1tqXTtcclxuICAgICAgfVxyXG4gICAgICBmb3IgKGkgPSAwLCBsID0gaGFuZGxlci5sZW5ndGg7IGkgPCBsOyBpKyspIHtcclxuICAgICAgICB0aGlzLmV2ZW50ID0gdHlwZTtcclxuICAgICAgICBzd2l0Y2ggKGFsKSB7XHJcbiAgICAgICAgY2FzZSAxOlxyXG4gICAgICAgICAgaGFuZGxlcltpXS5jYWxsKHRoaXMpO1xyXG4gICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSAyOlxyXG4gICAgICAgICAgaGFuZGxlcltpXS5jYWxsKHRoaXMsIGFyZ3VtZW50c1sxXSk7XHJcbiAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIDM6XHJcbiAgICAgICAgICBoYW5kbGVyW2ldLmNhbGwodGhpcywgYXJndW1lbnRzWzFdLCBhcmd1bWVudHNbMl0pO1xyXG4gICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgIGhhbmRsZXJbaV0uYXBwbHkodGhpcywgYXJncyk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgfSBlbHNlIGlmICghdGhpcy5fYWxsICYmIHR5cGUgPT09ICdlcnJvcicpIHtcclxuICAgICAgaWYgKGFyZ3VtZW50c1sxXSBpbnN0YW5jZW9mIEVycm9yKSB7XHJcbiAgICAgICAgdGhyb3cgYXJndW1lbnRzWzFdOyAvLyBVbmhhbmRsZWQgJ2Vycm9yJyBldmVudFxyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIlVuY2F1Z2h0LCB1bnNwZWNpZmllZCAnZXJyb3InIGV2ZW50LlwiKTtcclxuICAgICAgfVxyXG4gICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuICEhdGhpcy5fYWxsO1xyXG4gIH07XHJcblxyXG4gIEV2ZW50RW1pdHRlci5wcm90b3R5cGUuZW1pdEFzeW5jID0gZnVuY3Rpb24oKSB7XHJcblxyXG4gICAgdGhpcy5fZXZlbnRzIHx8IGluaXQuY2FsbCh0aGlzKTtcclxuXHJcbiAgICB2YXIgdHlwZSA9IGFyZ3VtZW50c1swXTtcclxuXHJcbiAgICBpZiAodHlwZSA9PT0gJ25ld0xpc3RlbmVyJyAmJiAhdGhpcy5uZXdMaXN0ZW5lcikge1xyXG4gICAgICAgIGlmICghdGhpcy5fZXZlbnRzLm5ld0xpc3RlbmVyKSB7IHJldHVybiBQcm9taXNlLnJlc29sdmUoW2ZhbHNlXSk7IH1cclxuICAgIH1cclxuXHJcbiAgICB2YXIgcHJvbWlzZXM9IFtdO1xyXG5cclxuICAgIHZhciBhbCA9IGFyZ3VtZW50cy5sZW5ndGg7XHJcbiAgICB2YXIgYXJncyxsLGksajtcclxuICAgIHZhciBoYW5kbGVyO1xyXG5cclxuICAgIGlmICh0aGlzLl9hbGwpIHtcclxuICAgICAgaWYgKGFsID4gMykge1xyXG4gICAgICAgIGFyZ3MgPSBuZXcgQXJyYXkoYWwpO1xyXG4gICAgICAgIGZvciAoaiA9IDE7IGogPCBhbDsgaisrKSBhcmdzW2pdID0gYXJndW1lbnRzW2pdO1xyXG4gICAgICB9XHJcbiAgICAgIGZvciAoaSA9IDAsIGwgPSB0aGlzLl9hbGwubGVuZ3RoOyBpIDwgbDsgaSsrKSB7XHJcbiAgICAgICAgdGhpcy5ldmVudCA9IHR5cGU7XHJcbiAgICAgICAgc3dpdGNoIChhbCkge1xyXG4gICAgICAgIGNhc2UgMTpcclxuICAgICAgICAgIHByb21pc2VzLnB1c2godGhpcy5fYWxsW2ldLmNhbGwodGhpcywgdHlwZSkpO1xyXG4gICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSAyOlxyXG4gICAgICAgICAgcHJvbWlzZXMucHVzaCh0aGlzLl9hbGxbaV0uY2FsbCh0aGlzLCB0eXBlLCBhcmd1bWVudHNbMV0pKTtcclxuICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgMzpcclxuICAgICAgICAgIHByb21pc2VzLnB1c2godGhpcy5fYWxsW2ldLmNhbGwodGhpcywgdHlwZSwgYXJndW1lbnRzWzFdLCBhcmd1bWVudHNbMl0pKTtcclxuICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgICBwcm9taXNlcy5wdXNoKHRoaXMuX2FsbFtpXS5hcHBseSh0aGlzLCBhcmdzKSk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKHRoaXMud2lsZGNhcmQpIHtcclxuICAgICAgaGFuZGxlciA9IFtdO1xyXG4gICAgICB2YXIgbnMgPSB0eXBlb2YgdHlwZSA9PT0gJ3N0cmluZycgPyB0eXBlLnNwbGl0KHRoaXMuZGVsaW1pdGVyKSA6IHR5cGUuc2xpY2UoKTtcclxuICAgICAgc2VhcmNoTGlzdGVuZXJUcmVlLmNhbGwodGhpcywgaGFuZGxlciwgbnMsIHRoaXMubGlzdGVuZXJUcmVlLCAwKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIGhhbmRsZXIgPSB0aGlzLl9ldmVudHNbdHlwZV07XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKHR5cGVvZiBoYW5kbGVyID09PSAnZnVuY3Rpb24nKSB7XHJcbiAgICAgIHRoaXMuZXZlbnQgPSB0eXBlO1xyXG4gICAgICBzd2l0Y2ggKGFsKSB7XHJcbiAgICAgIGNhc2UgMTpcclxuICAgICAgICBwcm9taXNlcy5wdXNoKGhhbmRsZXIuY2FsbCh0aGlzKSk7XHJcbiAgICAgICAgYnJlYWs7XHJcbiAgICAgIGNhc2UgMjpcclxuICAgICAgICBwcm9taXNlcy5wdXNoKGhhbmRsZXIuY2FsbCh0aGlzLCBhcmd1bWVudHNbMV0pKTtcclxuICAgICAgICBicmVhaztcclxuICAgICAgY2FzZSAzOlxyXG4gICAgICAgIHByb21pc2VzLnB1c2goaGFuZGxlci5jYWxsKHRoaXMsIGFyZ3VtZW50c1sxXSwgYXJndW1lbnRzWzJdKSk7XHJcbiAgICAgICAgYnJlYWs7XHJcbiAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgYXJncyA9IG5ldyBBcnJheShhbCAtIDEpO1xyXG4gICAgICAgIGZvciAoaiA9IDE7IGogPCBhbDsgaisrKSBhcmdzW2ogLSAxXSA9IGFyZ3VtZW50c1tqXTtcclxuICAgICAgICBwcm9taXNlcy5wdXNoKGhhbmRsZXIuYXBwbHkodGhpcywgYXJncykpO1xyXG4gICAgICB9XHJcbiAgICB9IGVsc2UgaWYgKGhhbmRsZXIgJiYgaGFuZGxlci5sZW5ndGgpIHtcclxuICAgICAgaGFuZGxlciA9IGhhbmRsZXIuc2xpY2UoKTtcclxuICAgICAgaWYgKGFsID4gMykge1xyXG4gICAgICAgIGFyZ3MgPSBuZXcgQXJyYXkoYWwgLSAxKTtcclxuICAgICAgICBmb3IgKGogPSAxOyBqIDwgYWw7IGorKykgYXJnc1tqIC0gMV0gPSBhcmd1bWVudHNbal07XHJcbiAgICAgIH1cclxuICAgICAgZm9yIChpID0gMCwgbCA9IGhhbmRsZXIubGVuZ3RoOyBpIDwgbDsgaSsrKSB7XHJcbiAgICAgICAgdGhpcy5ldmVudCA9IHR5cGU7XHJcbiAgICAgICAgc3dpdGNoIChhbCkge1xyXG4gICAgICAgIGNhc2UgMTpcclxuICAgICAgICAgIHByb21pc2VzLnB1c2goaGFuZGxlcltpXS5jYWxsKHRoaXMpKTtcclxuICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgMjpcclxuICAgICAgICAgIHByb21pc2VzLnB1c2goaGFuZGxlcltpXS5jYWxsKHRoaXMsIGFyZ3VtZW50c1sxXSkpO1xyXG4gICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSAzOlxyXG4gICAgICAgICAgcHJvbWlzZXMucHVzaChoYW5kbGVyW2ldLmNhbGwodGhpcywgYXJndW1lbnRzWzFdLCBhcmd1bWVudHNbMl0pKTtcclxuICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgICBwcm9taXNlcy5wdXNoKGhhbmRsZXJbaV0uYXBwbHkodGhpcywgYXJncykpO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgfSBlbHNlIGlmICghdGhpcy5fYWxsICYmIHR5cGUgPT09ICdlcnJvcicpIHtcclxuICAgICAgaWYgKGFyZ3VtZW50c1sxXSBpbnN0YW5jZW9mIEVycm9yKSB7XHJcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KGFyZ3VtZW50c1sxXSk7IC8vIFVuaGFuZGxlZCAnZXJyb3InIGV2ZW50XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KFwiVW5jYXVnaHQsIHVuc3BlY2lmaWVkICdlcnJvcicgZXZlbnQuXCIpO1xyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIFByb21pc2UuYWxsKHByb21pc2VzKTtcclxuICB9O1xyXG5cclxuICBFdmVudEVtaXR0ZXIucHJvdG90eXBlLm9uID0gZnVuY3Rpb24odHlwZSwgbGlzdGVuZXIpIHtcclxuICAgIHJldHVybiB0aGlzLl9vbih0eXBlLCBsaXN0ZW5lciwgZmFsc2UpO1xyXG4gIH07XHJcblxyXG4gIEV2ZW50RW1pdHRlci5wcm90b3R5cGUucHJlcGVuZExpc3RlbmVyID0gZnVuY3Rpb24odHlwZSwgbGlzdGVuZXIpIHtcclxuICAgIHJldHVybiB0aGlzLl9vbih0eXBlLCBsaXN0ZW5lciwgdHJ1ZSk7XHJcbiAgfTtcclxuXHJcbiAgRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5vbkFueSA9IGZ1bmN0aW9uKGZuKSB7XHJcbiAgICByZXR1cm4gdGhpcy5fb25BbnkoZm4sIGZhbHNlKTtcclxuICB9O1xyXG5cclxuICBFdmVudEVtaXR0ZXIucHJvdG90eXBlLnByZXBlbmRBbnkgPSBmdW5jdGlvbihmbikge1xyXG4gICAgcmV0dXJuIHRoaXMuX29uQW55KGZuLCB0cnVlKTtcclxuICB9O1xyXG5cclxuICBFdmVudEVtaXR0ZXIucHJvdG90eXBlLmFkZExpc3RlbmVyID0gRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5vbjtcclxuXHJcbiAgRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5fb25BbnkgPSBmdW5jdGlvbihmbiwgcHJlcGVuZCl7XHJcbiAgICBpZiAodHlwZW9mIGZuICE9PSAnZnVuY3Rpb24nKSB7XHJcbiAgICAgIHRocm93IG5ldyBFcnJvcignb25Bbnkgb25seSBhY2NlcHRzIGluc3RhbmNlcyBvZiBGdW5jdGlvbicpO1xyXG4gICAgfVxyXG5cclxuICAgIGlmICghdGhpcy5fYWxsKSB7XHJcbiAgICAgIHRoaXMuX2FsbCA9IFtdO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIEFkZCB0aGUgZnVuY3Rpb24gdG8gdGhlIGV2ZW50IGxpc3RlbmVyIGNvbGxlY3Rpb24uXHJcbiAgICBpZihwcmVwZW5kKXtcclxuICAgICAgdGhpcy5fYWxsLnVuc2hpZnQoZm4pO1xyXG4gICAgfWVsc2V7XHJcbiAgICAgIHRoaXMuX2FsbC5wdXNoKGZuKTtcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gdGhpcztcclxuICB9XHJcblxyXG4gIEV2ZW50RW1pdHRlci5wcm90b3R5cGUuX29uID0gZnVuY3Rpb24odHlwZSwgbGlzdGVuZXIsIHByZXBlbmQpIHtcclxuICAgIGlmICh0eXBlb2YgdHlwZSA9PT0gJ2Z1bmN0aW9uJykge1xyXG4gICAgICB0aGlzLl9vbkFueSh0eXBlLCBsaXN0ZW5lcik7XHJcbiAgICAgIHJldHVybiB0aGlzO1xyXG4gICAgfVxyXG5cclxuICAgIGlmICh0eXBlb2YgbGlzdGVuZXIgIT09ICdmdW5jdGlvbicpIHtcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdvbiBvbmx5IGFjY2VwdHMgaW5zdGFuY2VzIG9mIEZ1bmN0aW9uJyk7XHJcbiAgICB9XHJcbiAgICB0aGlzLl9ldmVudHMgfHwgaW5pdC5jYWxsKHRoaXMpO1xyXG5cclxuICAgIC8vIFRvIGF2b2lkIHJlY3Vyc2lvbiBpbiB0aGUgY2FzZSB0aGF0IHR5cGUgPT0gXCJuZXdMaXN0ZW5lcnNcIiEgQmVmb3JlXHJcbiAgICAvLyBhZGRpbmcgaXQgdG8gdGhlIGxpc3RlbmVycywgZmlyc3QgZW1pdCBcIm5ld0xpc3RlbmVyc1wiLlxyXG4gICAgdGhpcy5lbWl0KCduZXdMaXN0ZW5lcicsIHR5cGUsIGxpc3RlbmVyKTtcclxuXHJcbiAgICBpZiAodGhpcy53aWxkY2FyZCkge1xyXG4gICAgICBncm93TGlzdGVuZXJUcmVlLmNhbGwodGhpcywgdHlwZSwgbGlzdGVuZXIpO1xyXG4gICAgICByZXR1cm4gdGhpcztcclxuICAgIH1cclxuXHJcbiAgICBpZiAoIXRoaXMuX2V2ZW50c1t0eXBlXSkge1xyXG4gICAgICAvLyBPcHRpbWl6ZSB0aGUgY2FzZSBvZiBvbmUgbGlzdGVuZXIuIERvbid0IG5lZWQgdGhlIGV4dHJhIGFycmF5IG9iamVjdC5cclxuICAgICAgdGhpcy5fZXZlbnRzW3R5cGVdID0gbGlzdGVuZXI7XHJcbiAgICB9XHJcbiAgICBlbHNlIHtcclxuICAgICAgaWYgKHR5cGVvZiB0aGlzLl9ldmVudHNbdHlwZV0gPT09ICdmdW5jdGlvbicpIHtcclxuICAgICAgICAvLyBDaGFuZ2UgdG8gYXJyYXkuXHJcbiAgICAgICAgdGhpcy5fZXZlbnRzW3R5cGVdID0gW3RoaXMuX2V2ZW50c1t0eXBlXV07XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIC8vIElmIHdlJ3ZlIGFscmVhZHkgZ290IGFuIGFycmF5LCBqdXN0IGFkZFxyXG4gICAgICBpZihwcmVwZW5kKXtcclxuICAgICAgICB0aGlzLl9ldmVudHNbdHlwZV0udW5zaGlmdChsaXN0ZW5lcik7XHJcbiAgICAgIH1lbHNle1xyXG4gICAgICAgIHRoaXMuX2V2ZW50c1t0eXBlXS5wdXNoKGxpc3RlbmVyKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgLy8gQ2hlY2sgZm9yIGxpc3RlbmVyIGxlYWtcclxuICAgICAgaWYgKFxyXG4gICAgICAgICF0aGlzLl9ldmVudHNbdHlwZV0ud2FybmVkICYmXHJcbiAgICAgICAgdGhpcy5fbWF4TGlzdGVuZXJzID4gMCAmJlxyXG4gICAgICAgIHRoaXMuX2V2ZW50c1t0eXBlXS5sZW5ndGggPiB0aGlzLl9tYXhMaXN0ZW5lcnNcclxuICAgICAgKSB7XHJcbiAgICAgICAgdGhpcy5fZXZlbnRzW3R5cGVdLndhcm5lZCA9IHRydWU7XHJcbiAgICAgICAgbG9nUG9zc2libGVNZW1vcnlMZWFrLmNhbGwodGhpcywgdGhpcy5fZXZlbnRzW3R5cGVdLmxlbmd0aCwgdHlwZSk7XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gdGhpcztcclxuICB9XHJcblxyXG4gIEV2ZW50RW1pdHRlci5wcm90b3R5cGUub2ZmID0gZnVuY3Rpb24odHlwZSwgbGlzdGVuZXIpIHtcclxuICAgIGlmICh0eXBlb2YgbGlzdGVuZXIgIT09ICdmdW5jdGlvbicpIHtcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdyZW1vdmVMaXN0ZW5lciBvbmx5IHRha2VzIGluc3RhbmNlcyBvZiBGdW5jdGlvbicpO1xyXG4gICAgfVxyXG5cclxuICAgIHZhciBoYW5kbGVycyxsZWFmcz1bXTtcclxuXHJcbiAgICBpZih0aGlzLndpbGRjYXJkKSB7XHJcbiAgICAgIHZhciBucyA9IHR5cGVvZiB0eXBlID09PSAnc3RyaW5nJyA/IHR5cGUuc3BsaXQodGhpcy5kZWxpbWl0ZXIpIDogdHlwZS5zbGljZSgpO1xyXG4gICAgICBsZWFmcyA9IHNlYXJjaExpc3RlbmVyVHJlZS5jYWxsKHRoaXMsIG51bGwsIG5zLCB0aGlzLmxpc3RlbmVyVHJlZSwgMCk7XHJcbiAgICB9XHJcbiAgICBlbHNlIHtcclxuICAgICAgLy8gZG9lcyBub3QgdXNlIGxpc3RlbmVycygpLCBzbyBubyBzaWRlIGVmZmVjdCBvZiBjcmVhdGluZyBfZXZlbnRzW3R5cGVdXHJcbiAgICAgIGlmICghdGhpcy5fZXZlbnRzW3R5cGVdKSByZXR1cm4gdGhpcztcclxuICAgICAgaGFuZGxlcnMgPSB0aGlzLl9ldmVudHNbdHlwZV07XHJcbiAgICAgIGxlYWZzLnB1c2goe19saXN0ZW5lcnM6aGFuZGxlcnN9KTtcclxuICAgIH1cclxuXHJcbiAgICBmb3IgKHZhciBpTGVhZj0wOyBpTGVhZjxsZWFmcy5sZW5ndGg7IGlMZWFmKyspIHtcclxuICAgICAgdmFyIGxlYWYgPSBsZWFmc1tpTGVhZl07XHJcbiAgICAgIGhhbmRsZXJzID0gbGVhZi5fbGlzdGVuZXJzO1xyXG4gICAgICBpZiAoaXNBcnJheShoYW5kbGVycykpIHtcclxuXHJcbiAgICAgICAgdmFyIHBvc2l0aW9uID0gLTE7XHJcblxyXG4gICAgICAgIGZvciAodmFyIGkgPSAwLCBsZW5ndGggPSBoYW5kbGVycy5sZW5ndGg7IGkgPCBsZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAgaWYgKGhhbmRsZXJzW2ldID09PSBsaXN0ZW5lciB8fFxyXG4gICAgICAgICAgICAoaGFuZGxlcnNbaV0ubGlzdGVuZXIgJiYgaGFuZGxlcnNbaV0ubGlzdGVuZXIgPT09IGxpc3RlbmVyKSB8fFxyXG4gICAgICAgICAgICAoaGFuZGxlcnNbaV0uX29yaWdpbiAmJiBoYW5kbGVyc1tpXS5fb3JpZ2luID09PSBsaXN0ZW5lcikpIHtcclxuICAgICAgICAgICAgcG9zaXRpb24gPSBpO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmIChwb3NpdGlvbiA8IDApIHtcclxuICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYodGhpcy53aWxkY2FyZCkge1xyXG4gICAgICAgICAgbGVhZi5fbGlzdGVuZXJzLnNwbGljZShwb3NpdGlvbiwgMSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGVsc2Uge1xyXG4gICAgICAgICAgdGhpcy5fZXZlbnRzW3R5cGVdLnNwbGljZShwb3NpdGlvbiwgMSk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBpZiAoaGFuZGxlcnMubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgICAgICBpZih0aGlzLndpbGRjYXJkKSB7XHJcbiAgICAgICAgICAgIGRlbGV0ZSBsZWFmLl9saXN0ZW5lcnM7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgICBlbHNlIHtcclxuICAgICAgICAgICAgZGVsZXRlIHRoaXMuX2V2ZW50c1t0eXBlXTtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMuZW1pdChcInJlbW92ZUxpc3RlbmVyXCIsIHR5cGUsIGxpc3RlbmVyKTtcclxuXHJcbiAgICAgICAgcmV0dXJuIHRoaXM7XHJcbiAgICAgIH1cclxuICAgICAgZWxzZSBpZiAoaGFuZGxlcnMgPT09IGxpc3RlbmVyIHx8XHJcbiAgICAgICAgKGhhbmRsZXJzLmxpc3RlbmVyICYmIGhhbmRsZXJzLmxpc3RlbmVyID09PSBsaXN0ZW5lcikgfHxcclxuICAgICAgICAoaGFuZGxlcnMuX29yaWdpbiAmJiBoYW5kbGVycy5fb3JpZ2luID09PSBsaXN0ZW5lcikpIHtcclxuICAgICAgICBpZih0aGlzLndpbGRjYXJkKSB7XHJcbiAgICAgICAgICBkZWxldGUgbGVhZi5fbGlzdGVuZXJzO1xyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNlIHtcclxuICAgICAgICAgIGRlbGV0ZSB0aGlzLl9ldmVudHNbdHlwZV07XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLmVtaXQoXCJyZW1vdmVMaXN0ZW5lclwiLCB0eXBlLCBsaXN0ZW5lcik7XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiByZWN1cnNpdmVseUdhcmJhZ2VDb2xsZWN0KHJvb3QpIHtcclxuICAgICAgaWYgKHJvb3QgPT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgIHJldHVybjtcclxuICAgICAgfVxyXG4gICAgICB2YXIga2V5cyA9IE9iamVjdC5rZXlzKHJvb3QpO1xyXG4gICAgICBmb3IgKHZhciBpIGluIGtleXMpIHtcclxuICAgICAgICB2YXIga2V5ID0ga2V5c1tpXTtcclxuICAgICAgICB2YXIgb2JqID0gcm9vdFtrZXldO1xyXG4gICAgICAgIGlmICgob2JqIGluc3RhbmNlb2YgRnVuY3Rpb24pIHx8ICh0eXBlb2Ygb2JqICE9PSBcIm9iamVjdFwiKSB8fCAob2JqID09PSBudWxsKSlcclxuICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgIGlmIChPYmplY3Qua2V5cyhvYmopLmxlbmd0aCA+IDApIHtcclxuICAgICAgICAgIHJlY3Vyc2l2ZWx5R2FyYmFnZUNvbGxlY3Qocm9vdFtrZXldKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKE9iamVjdC5rZXlzKG9iaikubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgICAgICBkZWxldGUgcm9vdFtrZXldO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgfVxyXG4gICAgcmVjdXJzaXZlbHlHYXJiYWdlQ29sbGVjdCh0aGlzLmxpc3RlbmVyVHJlZSk7XHJcblxyXG4gICAgcmV0dXJuIHRoaXM7XHJcbiAgfTtcclxuXHJcbiAgRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5vZmZBbnkgPSBmdW5jdGlvbihmbikge1xyXG4gICAgdmFyIGkgPSAwLCBsID0gMCwgZm5zO1xyXG4gICAgaWYgKGZuICYmIHRoaXMuX2FsbCAmJiB0aGlzLl9hbGwubGVuZ3RoID4gMCkge1xyXG4gICAgICBmbnMgPSB0aGlzLl9hbGw7XHJcbiAgICAgIGZvcihpID0gMCwgbCA9IGZucy5sZW5ndGg7IGkgPCBsOyBpKyspIHtcclxuICAgICAgICBpZihmbiA9PT0gZm5zW2ldKSB7XHJcbiAgICAgICAgICBmbnMuc3BsaWNlKGksIDEpO1xyXG4gICAgICAgICAgdGhpcy5lbWl0KFwicmVtb3ZlTGlzdGVuZXJBbnlcIiwgZm4pO1xyXG4gICAgICAgICAgcmV0dXJuIHRoaXM7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICBmbnMgPSB0aGlzLl9hbGw7XHJcbiAgICAgIGZvcihpID0gMCwgbCA9IGZucy5sZW5ndGg7IGkgPCBsOyBpKyspXHJcbiAgICAgICAgdGhpcy5lbWl0KFwicmVtb3ZlTGlzdGVuZXJBbnlcIiwgZm5zW2ldKTtcclxuICAgICAgdGhpcy5fYWxsID0gW107XHJcbiAgICB9XHJcbiAgICByZXR1cm4gdGhpcztcclxuICB9O1xyXG5cclxuICBFdmVudEVtaXR0ZXIucHJvdG90eXBlLnJlbW92ZUxpc3RlbmVyID0gRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5vZmY7XHJcblxyXG4gIEV2ZW50RW1pdHRlci5wcm90b3R5cGUucmVtb3ZlQWxsTGlzdGVuZXJzID0gZnVuY3Rpb24odHlwZSkge1xyXG4gICAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPT09IDApIHtcclxuICAgICAgIXRoaXMuX2V2ZW50cyB8fCBpbml0LmNhbGwodGhpcyk7XHJcbiAgICAgIHJldHVybiB0aGlzO1xyXG4gICAgfVxyXG5cclxuICAgIGlmICh0aGlzLndpbGRjYXJkKSB7XHJcbiAgICAgIHZhciBucyA9IHR5cGVvZiB0eXBlID09PSAnc3RyaW5nJyA/IHR5cGUuc3BsaXQodGhpcy5kZWxpbWl0ZXIpIDogdHlwZS5zbGljZSgpO1xyXG4gICAgICB2YXIgbGVhZnMgPSBzZWFyY2hMaXN0ZW5lclRyZWUuY2FsbCh0aGlzLCBudWxsLCBucywgdGhpcy5saXN0ZW5lclRyZWUsIDApO1xyXG5cclxuICAgICAgZm9yICh2YXIgaUxlYWY9MDsgaUxlYWY8bGVhZnMubGVuZ3RoOyBpTGVhZisrKSB7XHJcbiAgICAgICAgdmFyIGxlYWYgPSBsZWFmc1tpTGVhZl07XHJcbiAgICAgICAgbGVhZi5fbGlzdGVuZXJzID0gbnVsbDtcclxuICAgICAgfVxyXG4gICAgfVxyXG4gICAgZWxzZSBpZiAodGhpcy5fZXZlbnRzKSB7XHJcbiAgICAgIHRoaXMuX2V2ZW50c1t0eXBlXSA9IG51bGw7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gdGhpcztcclxuICB9O1xyXG5cclxuICBFdmVudEVtaXR0ZXIucHJvdG90eXBlLmxpc3RlbmVycyA9IGZ1bmN0aW9uKHR5cGUpIHtcclxuICAgIGlmICh0aGlzLndpbGRjYXJkKSB7XHJcbiAgICAgIHZhciBoYW5kbGVycyA9IFtdO1xyXG4gICAgICB2YXIgbnMgPSB0eXBlb2YgdHlwZSA9PT0gJ3N0cmluZycgPyB0eXBlLnNwbGl0KHRoaXMuZGVsaW1pdGVyKSA6IHR5cGUuc2xpY2UoKTtcclxuICAgICAgc2VhcmNoTGlzdGVuZXJUcmVlLmNhbGwodGhpcywgaGFuZGxlcnMsIG5zLCB0aGlzLmxpc3RlbmVyVHJlZSwgMCk7XHJcbiAgICAgIHJldHVybiBoYW5kbGVycztcclxuICAgIH1cclxuXHJcbiAgICB0aGlzLl9ldmVudHMgfHwgaW5pdC5jYWxsKHRoaXMpO1xyXG5cclxuICAgIGlmICghdGhpcy5fZXZlbnRzW3R5cGVdKSB0aGlzLl9ldmVudHNbdHlwZV0gPSBbXTtcclxuICAgIGlmICghaXNBcnJheSh0aGlzLl9ldmVudHNbdHlwZV0pKSB7XHJcbiAgICAgIHRoaXMuX2V2ZW50c1t0eXBlXSA9IFt0aGlzLl9ldmVudHNbdHlwZV1dO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIHRoaXMuX2V2ZW50c1t0eXBlXTtcclxuICB9O1xyXG5cclxuICBFdmVudEVtaXR0ZXIucHJvdG90eXBlLmV2ZW50TmFtZXMgPSBmdW5jdGlvbigpe1xyXG4gICAgcmV0dXJuIE9iamVjdC5rZXlzKHRoaXMuX2V2ZW50cyk7XHJcbiAgfVxyXG5cclxuICBFdmVudEVtaXR0ZXIucHJvdG90eXBlLmxpc3RlbmVyQ291bnQgPSBmdW5jdGlvbih0eXBlKSB7XHJcbiAgICByZXR1cm4gdGhpcy5saXN0ZW5lcnModHlwZSkubGVuZ3RoO1xyXG4gIH07XHJcblxyXG4gIEV2ZW50RW1pdHRlci5wcm90b3R5cGUubGlzdGVuZXJzQW55ID0gZnVuY3Rpb24oKSB7XHJcblxyXG4gICAgaWYodGhpcy5fYWxsKSB7XHJcbiAgICAgIHJldHVybiB0aGlzLl9hbGw7XHJcbiAgICB9XHJcbiAgICBlbHNlIHtcclxuICAgICAgcmV0dXJuIFtdO1xyXG4gICAgfVxyXG5cclxuICB9O1xyXG5cclxuICBpZiAodHlwZW9mIGRlZmluZSA9PT0gJ2Z1bmN0aW9uJyAmJiBkZWZpbmUuYW1kKSB7XHJcbiAgICAgLy8gQU1ELiBSZWdpc3RlciBhcyBhbiBhbm9ueW1vdXMgbW9kdWxlLlxyXG4gICAgZGVmaW5lKGZ1bmN0aW9uKCkge1xyXG4gICAgICByZXR1cm4gRXZlbnRFbWl0dGVyO1xyXG4gICAgfSk7XHJcbiAgfSBlbHNlIGlmICh0eXBlb2YgZXhwb3J0cyA9PT0gJ29iamVjdCcpIHtcclxuICAgIC8vIENvbW1vbkpTXHJcbiAgICBtb2R1bGUuZXhwb3J0cyA9IEV2ZW50RW1pdHRlcjtcclxuICB9XHJcbiAgZWxzZSB7XHJcbiAgICAvLyBCcm93c2VyIGdsb2JhbC5cclxuICAgIHdpbmRvdy5FdmVudEVtaXR0ZXIyID0gRXZlbnRFbWl0dGVyO1xyXG4gIH1cclxufSgpO1xyXG4iLCIvLyBzaGltIGZvciB1c2luZyBwcm9jZXNzIGluIGJyb3dzZXJcbnZhciBwcm9jZXNzID0gbW9kdWxlLmV4cG9ydHMgPSB7fTtcblxuLy8gY2FjaGVkIGZyb20gd2hhdGV2ZXIgZ2xvYmFsIGlzIHByZXNlbnQgc28gdGhhdCB0ZXN0IHJ1bm5lcnMgdGhhdCBzdHViIGl0XG4vLyBkb24ndCBicmVhayB0aGluZ3MuICBCdXQgd2UgbmVlZCB0byB3cmFwIGl0IGluIGEgdHJ5IGNhdGNoIGluIGNhc2UgaXQgaXNcbi8vIHdyYXBwZWQgaW4gc3RyaWN0IG1vZGUgY29kZSB3aGljaCBkb2Vzbid0IGRlZmluZSBhbnkgZ2xvYmFscy4gIEl0J3MgaW5zaWRlIGFcbi8vIGZ1bmN0aW9uIGJlY2F1c2UgdHJ5L2NhdGNoZXMgZGVvcHRpbWl6ZSBpbiBjZXJ0YWluIGVuZ2luZXMuXG5cbnZhciBjYWNoZWRTZXRUaW1lb3V0O1xudmFyIGNhY2hlZENsZWFyVGltZW91dDtcblxuZnVuY3Rpb24gZGVmYXVsdFNldFRpbW91dCgpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3NldFRpbWVvdXQgaGFzIG5vdCBiZWVuIGRlZmluZWQnKTtcbn1cbmZ1bmN0aW9uIGRlZmF1bHRDbGVhclRpbWVvdXQgKCkge1xuICAgIHRocm93IG5ldyBFcnJvcignY2xlYXJUaW1lb3V0IGhhcyBub3QgYmVlbiBkZWZpbmVkJyk7XG59XG4oZnVuY3Rpb24gKCkge1xuICAgIHRyeSB7XG4gICAgICAgIGlmICh0eXBlb2Ygc2V0VGltZW91dCA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgY2FjaGVkU2V0VGltZW91dCA9IHNldFRpbWVvdXQ7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjYWNoZWRTZXRUaW1lb3V0ID0gZGVmYXVsdFNldFRpbW91dDtcbiAgICAgICAgfVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgY2FjaGVkU2V0VGltZW91dCA9IGRlZmF1bHRTZXRUaW1vdXQ7XG4gICAgfVxuICAgIHRyeSB7XG4gICAgICAgIGlmICh0eXBlb2YgY2xlYXJUaW1lb3V0ID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICBjYWNoZWRDbGVhclRpbWVvdXQgPSBjbGVhclRpbWVvdXQ7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjYWNoZWRDbGVhclRpbWVvdXQgPSBkZWZhdWx0Q2xlYXJUaW1lb3V0O1xuICAgICAgICB9XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBjYWNoZWRDbGVhclRpbWVvdXQgPSBkZWZhdWx0Q2xlYXJUaW1lb3V0O1xuICAgIH1cbn0gKCkpXG5mdW5jdGlvbiBydW5UaW1lb3V0KGZ1bikge1xuICAgIGlmIChjYWNoZWRTZXRUaW1lb3V0ID09PSBzZXRUaW1lb3V0KSB7XG4gICAgICAgIC8vbm9ybWFsIGVudmlyb21lbnRzIGluIHNhbmUgc2l0dWF0aW9uc1xuICAgICAgICByZXR1cm4gc2V0VGltZW91dChmdW4sIDApO1xuICAgIH1cbiAgICAvLyBpZiBzZXRUaW1lb3V0IHdhc24ndCBhdmFpbGFibGUgYnV0IHdhcyBsYXR0ZXIgZGVmaW5lZFxuICAgIGlmICgoY2FjaGVkU2V0VGltZW91dCA9PT0gZGVmYXVsdFNldFRpbW91dCB8fCAhY2FjaGVkU2V0VGltZW91dCkgJiYgc2V0VGltZW91dCkge1xuICAgICAgICBjYWNoZWRTZXRUaW1lb3V0ID0gc2V0VGltZW91dDtcbiAgICAgICAgcmV0dXJuIHNldFRpbWVvdXQoZnVuLCAwKTtcbiAgICB9XG4gICAgdHJ5IHtcbiAgICAgICAgLy8gd2hlbiB3aGVuIHNvbWVib2R5IGhhcyBzY3Jld2VkIHdpdGggc2V0VGltZW91dCBidXQgbm8gSS5FLiBtYWRkbmVzc1xuICAgICAgICByZXR1cm4gY2FjaGVkU2V0VGltZW91dChmdW4sIDApO1xuICAgIH0gY2F0Y2goZSl7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICAvLyBXaGVuIHdlIGFyZSBpbiBJLkUuIGJ1dCB0aGUgc2NyaXB0IGhhcyBiZWVuIGV2YWxlZCBzbyBJLkUuIGRvZXNuJ3QgdHJ1c3QgdGhlIGdsb2JhbCBvYmplY3Qgd2hlbiBjYWxsZWQgbm9ybWFsbHlcbiAgICAgICAgICAgIHJldHVybiBjYWNoZWRTZXRUaW1lb3V0LmNhbGwobnVsbCwgZnVuLCAwKTtcbiAgICAgICAgfSBjYXRjaChlKXtcbiAgICAgICAgICAgIC8vIHNhbWUgYXMgYWJvdmUgYnV0IHdoZW4gaXQncyBhIHZlcnNpb24gb2YgSS5FLiB0aGF0IG11c3QgaGF2ZSB0aGUgZ2xvYmFsIG9iamVjdCBmb3IgJ3RoaXMnLCBob3BmdWxseSBvdXIgY29udGV4dCBjb3JyZWN0IG90aGVyd2lzZSBpdCB3aWxsIHRocm93IGEgZ2xvYmFsIGVycm9yXG4gICAgICAgICAgICByZXR1cm4gY2FjaGVkU2V0VGltZW91dC5jYWxsKHRoaXMsIGZ1biwgMCk7XG4gICAgICAgIH1cbiAgICB9XG5cblxufVxuZnVuY3Rpb24gcnVuQ2xlYXJUaW1lb3V0KG1hcmtlcikge1xuICAgIGlmIChjYWNoZWRDbGVhclRpbWVvdXQgPT09IGNsZWFyVGltZW91dCkge1xuICAgICAgICAvL25vcm1hbCBlbnZpcm9tZW50cyBpbiBzYW5lIHNpdHVhdGlvbnNcbiAgICAgICAgcmV0dXJuIGNsZWFyVGltZW91dChtYXJrZXIpO1xuICAgIH1cbiAgICAvLyBpZiBjbGVhclRpbWVvdXQgd2Fzbid0IGF2YWlsYWJsZSBidXQgd2FzIGxhdHRlciBkZWZpbmVkXG4gICAgaWYgKChjYWNoZWRDbGVhclRpbWVvdXQgPT09IGRlZmF1bHRDbGVhclRpbWVvdXQgfHwgIWNhY2hlZENsZWFyVGltZW91dCkgJiYgY2xlYXJUaW1lb3V0KSB7XG4gICAgICAgIGNhY2hlZENsZWFyVGltZW91dCA9IGNsZWFyVGltZW91dDtcbiAgICAgICAgcmV0dXJuIGNsZWFyVGltZW91dChtYXJrZXIpO1xuICAgIH1cbiAgICB0cnkge1xuICAgICAgICAvLyB3aGVuIHdoZW4gc29tZWJvZHkgaGFzIHNjcmV3ZWQgd2l0aCBzZXRUaW1lb3V0IGJ1dCBubyBJLkUuIG1hZGRuZXNzXG4gICAgICAgIHJldHVybiBjYWNoZWRDbGVhclRpbWVvdXQobWFya2VyKTtcbiAgICB9IGNhdGNoIChlKXtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIC8vIFdoZW4gd2UgYXJlIGluIEkuRS4gYnV0IHRoZSBzY3JpcHQgaGFzIGJlZW4gZXZhbGVkIHNvIEkuRS4gZG9lc24ndCAgdHJ1c3QgdGhlIGdsb2JhbCBvYmplY3Qgd2hlbiBjYWxsZWQgbm9ybWFsbHlcbiAgICAgICAgICAgIHJldHVybiBjYWNoZWRDbGVhclRpbWVvdXQuY2FsbChudWxsLCBtYXJrZXIpO1xuICAgICAgICB9IGNhdGNoIChlKXtcbiAgICAgICAgICAgIC8vIHNhbWUgYXMgYWJvdmUgYnV0IHdoZW4gaXQncyBhIHZlcnNpb24gb2YgSS5FLiB0aGF0IG11c3QgaGF2ZSB0aGUgZ2xvYmFsIG9iamVjdCBmb3IgJ3RoaXMnLCBob3BmdWxseSBvdXIgY29udGV4dCBjb3JyZWN0IG90aGVyd2lzZSBpdCB3aWxsIHRocm93IGEgZ2xvYmFsIGVycm9yLlxuICAgICAgICAgICAgLy8gU29tZSB2ZXJzaW9ucyBvZiBJLkUuIGhhdmUgZGlmZmVyZW50IHJ1bGVzIGZvciBjbGVhclRpbWVvdXQgdnMgc2V0VGltZW91dFxuICAgICAgICAgICAgcmV0dXJuIGNhY2hlZENsZWFyVGltZW91dC5jYWxsKHRoaXMsIG1hcmtlcik7XG4gICAgICAgIH1cbiAgICB9XG5cblxuXG59XG52YXIgcXVldWUgPSBbXTtcbnZhciBkcmFpbmluZyA9IGZhbHNlO1xudmFyIGN1cnJlbnRRdWV1ZTtcbnZhciBxdWV1ZUluZGV4ID0gLTE7XG5cbmZ1bmN0aW9uIGNsZWFuVXBOZXh0VGljaygpIHtcbiAgICBpZiAoIWRyYWluaW5nIHx8ICFjdXJyZW50UXVldWUpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBkcmFpbmluZyA9IGZhbHNlO1xuICAgIGlmIChjdXJyZW50UXVldWUubGVuZ3RoKSB7XG4gICAgICAgIHF1ZXVlID0gY3VycmVudFF1ZXVlLmNvbmNhdChxdWV1ZSk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgcXVldWVJbmRleCA9IC0xO1xuICAgIH1cbiAgICBpZiAocXVldWUubGVuZ3RoKSB7XG4gICAgICAgIGRyYWluUXVldWUoKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGRyYWluUXVldWUoKSB7XG4gICAgaWYgKGRyYWluaW5nKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgdmFyIHRpbWVvdXQgPSBydW5UaW1lb3V0KGNsZWFuVXBOZXh0VGljayk7XG4gICAgZHJhaW5pbmcgPSB0cnVlO1xuXG4gICAgdmFyIGxlbiA9IHF1ZXVlLmxlbmd0aDtcbiAgICB3aGlsZShsZW4pIHtcbiAgICAgICAgY3VycmVudFF1ZXVlID0gcXVldWU7XG4gICAgICAgIHF1ZXVlID0gW107XG4gICAgICAgIHdoaWxlICgrK3F1ZXVlSW5kZXggPCBsZW4pIHtcbiAgICAgICAgICAgIGlmIChjdXJyZW50UXVldWUpIHtcbiAgICAgICAgICAgICAgICBjdXJyZW50UXVldWVbcXVldWVJbmRleF0ucnVuKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcXVldWVJbmRleCA9IC0xO1xuICAgICAgICBsZW4gPSBxdWV1ZS5sZW5ndGg7XG4gICAgfVxuICAgIGN1cnJlbnRRdWV1ZSA9IG51bGw7XG4gICAgZHJhaW5pbmcgPSBmYWxzZTtcbiAgICBydW5DbGVhclRpbWVvdXQodGltZW91dCk7XG59XG5cbnByb2Nlc3MubmV4dFRpY2sgPSBmdW5jdGlvbiAoZnVuKSB7XG4gICAgdmFyIGFyZ3MgPSBuZXcgQXJyYXkoYXJndW1lbnRzLmxlbmd0aCAtIDEpO1xuICAgIGlmIChhcmd1bWVudHMubGVuZ3RoID4gMSkge1xuICAgICAgICBmb3IgKHZhciBpID0gMTsgaSA8IGFyZ3VtZW50cy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgYXJnc1tpIC0gMV0gPSBhcmd1bWVudHNbaV07XG4gICAgICAgIH1cbiAgICB9XG4gICAgcXVldWUucHVzaChuZXcgSXRlbShmdW4sIGFyZ3MpKTtcbiAgICBpZiAocXVldWUubGVuZ3RoID09PSAxICYmICFkcmFpbmluZykge1xuICAgICAgICBydW5UaW1lb3V0KGRyYWluUXVldWUpO1xuICAgIH1cbn07XG5cbi8vIHY4IGxpa2VzIHByZWRpY3RpYmxlIG9iamVjdHNcbmZ1bmN0aW9uIEl0ZW0oZnVuLCBhcnJheSkge1xuICAgIHRoaXMuZnVuID0gZnVuO1xuICAgIHRoaXMuYXJyYXkgPSBhcnJheTtcbn1cbkl0ZW0ucHJvdG90eXBlLnJ1biA9IGZ1bmN0aW9uICgpIHtcbiAgICB0aGlzLmZ1bi5hcHBseShudWxsLCB0aGlzLmFycmF5KTtcbn07XG5wcm9jZXNzLnRpdGxlID0gJ2Jyb3dzZXInO1xucHJvY2Vzcy5icm93c2VyID0gdHJ1ZTtcbnByb2Nlc3MuZW52ID0ge307XG5wcm9jZXNzLmFyZ3YgPSBbXTtcbnByb2Nlc3MudmVyc2lvbiA9ICcnOyAvLyBlbXB0eSBzdHJpbmcgdG8gYXZvaWQgcmVnZXhwIGlzc3Vlc1xucHJvY2Vzcy52ZXJzaW9ucyA9IHt9O1xuXG5mdW5jdGlvbiBub29wKCkge31cblxucHJvY2Vzcy5vbiA9IG5vb3A7XG5wcm9jZXNzLmFkZExpc3RlbmVyID0gbm9vcDtcbnByb2Nlc3Mub25jZSA9IG5vb3A7XG5wcm9jZXNzLm9mZiA9IG5vb3A7XG5wcm9jZXNzLnJlbW92ZUxpc3RlbmVyID0gbm9vcDtcbnByb2Nlc3MucmVtb3ZlQWxsTGlzdGVuZXJzID0gbm9vcDtcbnByb2Nlc3MuZW1pdCA9IG5vb3A7XG5wcm9jZXNzLnByZXBlbmRMaXN0ZW5lciA9IG5vb3A7XG5wcm9jZXNzLnByZXBlbmRPbmNlTGlzdGVuZXIgPSBub29wO1xuXG5wcm9jZXNzLmxpc3RlbmVycyA9IGZ1bmN0aW9uIChuYW1lKSB7IHJldHVybiBbXSB9XG5cbnByb2Nlc3MuYmluZGluZyA9IGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdwcm9jZXNzLmJpbmRpbmcgaXMgbm90IHN1cHBvcnRlZCcpO1xufTtcblxucHJvY2Vzcy5jd2QgPSBmdW5jdGlvbiAoKSB7IHJldHVybiAnLycgfTtcbnByb2Nlc3MuY2hkaXIgPSBmdW5jdGlvbiAoZGlyKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdwcm9jZXNzLmNoZGlyIGlzIG5vdCBzdXBwb3J0ZWQnKTtcbn07XG5wcm9jZXNzLnVtYXNrID0gZnVuY3Rpb24oKSB7IHJldHVybiAwOyB9O1xuIiwiaW1wb3J0ICcuL2pzL21vZHVsZXMvZ2xvYmFsJztcbmltcG9ydCAnLi9qcy9tb2R1bGVzL2NvbmZpZyc7XG5pbXBvcnQgJy4vanMvbW9kdWxlcy91dGlscyc7XG5pbXBvcnQgJy4vanMvbW9kdWxlcy9zaWRlYmFyJztcbmltcG9ydCAnLi9qcy9tb2R1bGVzL2Ryb3BsZXQnO1xuaW1wb3J0ICcuL2pzL21vZHVsZXMveW91dHViZURhdGEnO1xuXG5pbXBvcnQgeyBjbGlja0hhbmRsZXJzIH0gZnJvbSAnLi9qcy9tb2R1bGVzL2hhbmRsZUNsaWNrcyc7XG5cbkVWVC5vbignaW5pdCcsIGNsaWNrSGFuZGxlcnMpO1xuXG5cblxuXG4iLCJjb25zdCBjb25maWcgPSBKQy5jb25maWcgPSB7fTtcbiAgY29uZmlnLnByb2plY3QgPSAnanVzdHluQ2xhcmstbmV3JztcbiAgY29uZmlnLmRldmVsb3BlciA9ICdqdXN0eW4gY2xhcmsnO1xuICBjb25maWcudmVyc2lvbiA9IFwiMS4wLjBcIjtcblxuIiwidmFyIGNvb2tpZU1hcDtcbi8vIENvb2tpZXNcbkpDLnV0aWxzLmdldENvb2tpZXMgPSB1cGRhdGUgPT4geyAvLyBHZXQgY29va2llc1xuICBpZighY29va2llTWFwIHx8IHVwZGF0ZSkge1xuICAgIGNvb2tpZU1hcCA9IHt9O1xuICAgIHZhciBpLCBjb29raWVzID0gZG9jdW1lbnQuY29va2llLnNwbGl0KFwiO1wiKTtcbiAgICBmb3IgKGkgPSAwOyBpIDwgY29va2llcy5sZW5ndGg7IGkrKykge1xuICAgICAgdmFyIGluZGV4ID0gY29va2llc1tpXS5pbmRleE9mKCc9Jyk7XG4gICAgICB2YXIgeCA9IGNvb2tpZXNbaV0uc3Vic3RyKDAsIGluZGV4KTtcbiAgICAgIHZhciB5ID0gY29va2llc1tpXS5zdWJzdHIoaW5kZXggKyAxKTtcbiAgICAgIHggPSB4LnJlcGxhY2UoL15cXHMrfFxccyskL2csICcnKTtcbiAgICAgIGlmKHgpIGNvb2tpZU1hcFt4XSA9IGRlY29kZVVSSSh5KTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIGNvb2tpZU1hcDtcbn07XG5cbkpDLnV0aWxzLmdldENvb2tpZSA9IChjLCB1cGRhdGUpID0+IHsgLy8gR2V0IGNvb2tpZVxuICByZXR1cm4gdGhpcy5nZXRDb29raWVzKHVwZGF0ZSlbY107XG59O1xuXG5KQy51dGlscy5zZXRDb29raWUgPSAobmFtZSwgdmFsdWUsIG9wdHMpID0+IHsgLy8gU2V0IGNvb2tpZSBKQy51dGlscy5zZXRDb29raWUoJ2pjQ29va2llJyx0cnVlLCB7ZXhwaXJlRGF0ZTogKDM2MDAgKiAyNCAqIDM2NSl9KTtcbiAgdmFyIHZhbHVlID0gZW5jb2RlVVJJKHZhbHVlKTtcbiAgb3B0cyA9IG9wdHMgfHwge307XG4gIHZhbHVlICs9IFwiO3BhdGg9XCIgKyAob3B0cy5wYXRoIHx8IFwiL1wiKTtcbiAgaWYob3B0cy5kb21haW4pIHZhbHVlICs9IFwiO2RvbWFpbj1cIiArIG9wdHMuZG9tYWluO1xuICB2YXIgdCA9IHR5cGVvZiBvcHRzLm1heEFnZTtcbiAgaWYodCA9PSBcIm51bWJlclwiIHx8IHQgPT0gXCJzdHJpbmdcIikgdmFsdWUgKz0gXCI7bWF4LWFnZT1cIiArIG9wdHMubWF4QWdlO1xuICB2YXIgZSA9IG9wdHMuZXhwaXJlRGF0ZTtcbiAgaWYodHlwZW9mIGUgPT0gXCJudW1iZXJcIikgZSA9IG5ldyBEYXRlKChuZXcgRGF0ZSgpKS5nZXRUaW1lKCkgKyBlICogMTAwMCk7XG4gIGlmKGUpIHZhbHVlICs9ICc7ZXhwaXJlcz0nICsgZS50b1VUQ1N0cmluZygpO1xuICBpZihvcHRzLnNlY3VyZSkgdmFsdWUgKz0gXCI7c2VjdXJlXCI7XG4gIGRvY3VtZW50LmNvb2tpZSA9IG5hbWUgKyAnPScgKyB2YWx1ZTtcbiAgY29va2llTWFwID0gbnVsbDtcbn07XG5cbnNldFRpbWVvdXQoKCk9PiB7XG4gIGlmICghZG9jdW1lbnQuY29va2llLm1hdGNoKCdqY0Nvb2tpZScpKSB7XG4gICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLmNvb2tpZS1wb2xpY3knKS5jbGFzc0xpc3QuYWRkKCdjb29raWUtcG9saWN5LS1zaG93Jyk7XG4gIH0gZWxzZSB7XG4gICAgY29uc29sZS5sb2coJ2Nvb2tpZSBwb2xpY3kgaXMgaGlkZGVuJyk7XG4gICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLmNvb2tpZS1wb2xpY3knKS5jbGFzc0xpc3QuYWRkKCdjb29raWUtcG9saWN5LS1oaWRlJyk7XG4gIH1cbn0sMTAwMCk7XG5cbmV4cG9ydCBmdW5jdGlvbiBzZXRQb2xpY3lDb29raWUoKSB7XG4gIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5jb29raWUtcG9saWN5JykuY2xhc3NMaXN0LmFkZCgnY29va2llLXBvbGljeS0taGlkZScpO1xuICBjb25zb2xlLmxvZygnY29va2llIHNldCcpO1xuICBKQy51dGlscy5zZXRDb29raWUoJ2pjQ29va2llJywgdHJ1ZSwge2V4cGlyZURhdGU6ICgzNjAwICogMjQgKiAzNjUpfSk7XG59XG4iLCIoZnVuY3Rpb24oKSB7XG4gIHZhciBkcm9wbGV0ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLmRyb3BsZXQnKVxuICBkcm9wbGV0LnN0eWxlLm9wYWNpdHkgPSAwXG4gIGZ1bmN0aW9uIGZhZGVJbkRyb3BsZXQoKSB7XG4gICAgc2V0VGltZW91dChmdW5jdGlvbigpIHtcbiAgICAgIGRyb3BsZXQuc3R5bGUub3BhY2l0eSA9IDFcbiAgICB9LCAyMDAwKVxuICB9XG4gIEVWVC5vbignaW5pdCcsIGZhZGVJbkRyb3BsZXQpXG59KSgpO1xuIiwiaW1wb3J0IEV2ZW50RW1pdHRlcjIgZnJvbSAnZXZlbnRlbWl0dGVyMic7XG5cbihmdW5jdGlvbihnbG9iYWwpe1xuXG4gIGdsb2JhbC5KQyA9IGdsb2JhbC5KQyAhPT0gdW5kZWZpbmVkID8gSkMgOiB7fTsgLy8gRGVjbGFyZSBHbG9iYWwgT2JqZWN0XG4gIGdsb2JhbC5FVlQgPSBuZXcgRXZlbnRFbWl0dGVyMigpO1xuXG4gIEpDLmNvbXBvbmVudHMgPSB7fTtcbiAgSkMuY29uZmlnID0ge307XG4gIEpDLm1lbnUgPSB7fTtcbiAgSkMudXRpbHMgPSB7fTtcblxuICBnbG9iYWwuYWRkRXZlbnRMaXN0ZW5lcignRE9NQ29udGVudExvYWRlZCcsIGZ1bmN0aW9uKCkge1xuICAgIEVWVC5lbWl0KCdpbml0Jyk7XG4gIH0pO1xuXG4gIGNvbnNvbGUubG9nKEpDKTtcblxufSkod2luZG93KTtcbiIsImltcG9ydCB7IHNldFBvbGljeUNvb2tpZSB9IGZyb20gJy4vY29va2llcyc7XG5sZXQgeyAkb24sIHFzIH0gPSBKQy5oZWxwZXJzIDtcbmltcG9ydCB7IHBsYXlSYW5kb21Zb3VUdWJlVmlkZW8gfSBmcm9tICcuL3lvdVR1YmVQbGF5ZXInO1xuXG5leHBvcnQgZnVuY3Rpb24gY2xpY2tIYW5kbGVycygpIHtcblxuICBsZXQgbG9nbyA9IHFzKCcubG9nbycpO1xuICBsZXQgYm9keSA9IHFzKCdib2R5Jyk7XG4gIGxldCBtZW51TGlua18xID0gcXMoJ1tyZWw9XCIxXCJdJyk7XG4gIGxldCBvdmVybGF5ID0gcXMoJy5vdmVybGF5Jyk7XG5cbiAgJG9uKHFzKCcuY29va2llLXBvbGljeV9fY2xvc2UnKSwgJ2NsaWNrJywgc2V0UG9saWN5Q29va2llKTsgLy8gQ29va2llIFBvbGljeVxuICAkb24obWVudUxpbmtfMSwgJ2NsaWNrJywgSkMudXRpbHMub3Blbk92ZXJsYXkpOyAvLyBvcGVuIG92ZXJsYXlcbiAgJG9uKG92ZXJsYXksICdjbGljaycsIEpDLnV0aWxzLmNsb3NlT3ZlcmxheSk7IC8vIGNsb3NlIG92ZXJsYXlcbiAgJG9uKG1lbnVMaW5rXzEsICdjbGljaycsIHBsYXlSYW5kb21Zb3VUdWJlVmlkZW8pOyAvLyBvcGVuIG92ZXJsYXlcbiAgJG9uKGxvZ28sICdjbGljaycsIGZ1bmN0aW9uICgpIHtcbiAgICBsZXQgaGVhZGVyID0gcXMoJy5oZWFkZXInKTtcbiAgICBoZWFkZXIuY2xhc3NMaXN0LnRvZ2dsZSgnaGVhZGVyLS1vcGVuJyk7XG4gICAgaWYgKCFib2R5LmNsYXNzTGlzdC5jb250YWlucygnb3ZlcmxheS0tb3BlbicpKSB7XG4gICAgICBib2R5LmNsYXNzTGlzdC5hZGQoJ292ZXJsYXktLW9wZW4nKTtcbiAgICB9IGVsc2Uge1xuICAgICAgYm9keS5jbGFzc0xpc3QucmVtb3ZlKCdvdmVybGF5LS1vcGVuJyk7XG4gICAgfVxuICB9KTtcbn1cbiIsIihmdW5jdGlvbigpIHtcblxuICBjb25zdCBzYiA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5zaWRlYmFyJyk7XG5cbiAgdmFyIHNpZGViYXIgPSBKQy5jb21wb25lbnRzLnNpZGViYXIgPSB7XG4gICAgb3BlblNpZGViYXIoKSB7XG4gICAgICBzYi5jbGFzc0xpc3QuYWRkKCdzaWRlYmFyLS1vcGVuJyk7XG4gICAgfSxcbiAgICBjbG9zZVNpZGViYXIoKSB7XG4gICAgICBzYi5jbGFzc0xpc3QucmVtb3ZlKCdzaWRlYmFyLS1vcGVuJyk7XG4gICAgfSxcbiAgICBkZWxheShjYWxsYmFjaywgdGltZSkge1xuICAgICAgc2V0VGltZW91dChjYWxsYmFjaywgdGltZSlcbiAgICB9LFxuICAgIGludGVydmFsKGNhbGxiYWNrLCB0aW1lKSB7XG4gICAgICBzZXRJbnRlcnZhbChjYWxsYmFjaywgdGltZSlcbiAgICB9LFxuICAgIHNsaWRlVG9nZ2xlKCkge1xuICAgICAgc2IuY2xhc3NMaXN0LnRvZ2dsZSgnc2lkZWJhci0tb3BlbicpO1xuICAgIH0sXG4gICAgaW5pdCgpIHtcbiAgICAgIC8vc2lkZWJhci5pbnRlcnZhbChzaWRlYmFyLnNsaWRlVG9nZ2xlLCAyMDAwKTtcbiAgICAgIHNpZGViYXIuZGVsYXkoc2lkZWJhci5vcGVuU2lkZWJhciwgMjAwMCk7XG4gICAgfVxuICB9XG5cbiAgRVZULm9uKCdpbml0Jywgc2lkZWJhci5pbml0KTtcblxufSgpKTtcbiIsImltcG9ydCAnLi9jb29raWVzJztcblxuSkMuaGVscGVycyA9IHtcbiAgcXM6IChzZWxlY3Rvciwgc2NvcGUpID0+IChzY29wZSB8fCBkb2N1bWVudCkucXVlcnlTZWxlY3RvcihzZWxlY3RvciksXG4gIHFzYTogKHNlbGVjdG9yLCBzY29wZSkgPT4gKHNjb3BlIHx8IGRvY3VtZW50KS5xdWVyeVNlbGVjdG9yQWxsKHNlbGVjdG9yKSxcbiAgJG9uOiAodGFyZ2V0LCBldnQsIGNhbGxiYWNrLCB1c2VDYXB0dXJlKSA9PiB7XG4gICAgdGFyZ2V0LmFkZEV2ZW50TGlzdGVuZXIoZXZ0LCBjYWxsYmFjaywgISF1c2VDYXB0dXJlKVxuICB9XG59XG5cblxuSkMudXRpbHMgPSB7XG4gIGFkZGVyKCkge1xuICAgIGxldCBpbmNyZW1lbnQgPSAoKSA9PiB7XG4gICAgICBsZXQgY291bnRlciA9IDA7XG4gICAgICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgICAgIHJldHVybiBjb3VudGVyID0gY291bnRlciArIDE7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBpbmNyZW1lbnQoKVxuICB9LFxuICB0aGlzQ2hlY2soKSB7XG4gICAgY29uc29sZS5sb2codGhpcyk7XG4gIH0sXG4gIHJhbmRvbU51bWJlcihsZW4pIHtcbiAgICByZXR1cm4gTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogbGVuKVxuICB9LFxuICBpbnRlcnZhbChjYWxsYmFjaywgdGltZSkge1xuICAgIHNldEludGVydmFsKGNhbGxiYWNrLCB0aW1lKVxuICB9LFxuICBvdXRwdXQoeCkge1xuICAgIGNvbnNvbGUubG9nKHgpO1xuICB9LFxuICBjaGFyc0luRWxlbWVudChlbG0pIHtcbiAgICBpZiAoZWxtLm5vZGVUeXBlID09IDMpIHsgLy8gVEVYVF9OT0RFXG4gICAgICByZXR1cm4gZWxtLm5vZGVWYWx1ZS5sZW5ndGg7XG4gICAgfVxuICAgIHZhciBjb3VudCA9IDA7XG4gICAgZm9yICh2YXIgaSA9IDAsIGNoaWxkOyBjaGlsZCA9IGVsbS5jaGlsZE5vZGVzW2ldOyBpKyspIHtcbiAgICAgIGNvdW50ICs9IEpDLnV0aWxzLmNoYXJzSW5FbGVtZW50KGNoaWxkKTtcbiAgICB9XG4gICAgcmV0dXJuIGNvdW50O1xuICB9LFxuICBzaG93Qm9keUNoYXJOdW0oKSB7XG4gICAgdmFyIGVsbSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ2JvZHknKTtcbiAgICBjb25zb2xlLmxvZyhcIlRoaXMgcGFnZSBoYXMgXCIgKyBKQy51dGlscy5jaGFyc0luRWxlbWVudChlbG0pICsgXCIgY2hhcmFjdGVycyBpbiB0aGUgYm9keVwiKTtcbiAgfSxcbiAgb3Blbk92ZXJsYXkoKSB7XG4gICAgdmFyIG92ZXJsYXkgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcub3ZlcmxheScpO1xuICAgIHZhciBib2R5ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignYm9keScpO1xuICAgIHZhciBvdmVybGF5SW5uZXIgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcub3ZlcmxheV9faW5uZXInKTtcbiAgICBvdmVybGF5LmNsYXNzTGlzdC50b2dnbGUoJ292ZXJsYXktLW9wZW4nKTtcbiAgICBib2R5LmNsYXNzTGlzdC5hZGQoJ292ZXJsYXktLW9wZW4nKTtcbiAgICBvdmVybGF5SW5uZXIuY2xhc3NMaXN0LmFkZCgnb3ZlcmxheS0tb3BlbicpO1xuICB9LFxuICBjbG9zZU92ZXJsYXkoKSB7XG4gICAgdmFyIG92ZXJsYXkgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcub3ZlcmxheScpO1xuICAgIHZhciBib2R5ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignYm9keScpO1xuICAgIHZhciBvdmVybGF5SW5uZXIgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcub3ZlcmxheV9faW5uZXInKTtcbiAgICB2YXIgdmlkID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLnZpZGVvX19tb2RhbCcpO1xuICAgIG92ZXJsYXkuY2xhc3NMaXN0LnRvZ2dsZSgnb3ZlcmxheS0tb3BlbicpO1xuICAgIGJvZHkuY2xhc3NMaXN0LnRvZ2dsZSgnb3ZlcmxheS0tb3BlbicpO1xuICAgIG92ZXJsYXlJbm5lci5jbGFzc0xpc3QudG9nZ2xlKCdvdmVybGF5LS1vcGVuJyk7XG4gICAgYm9keS5yZW1vdmVDaGlsZCh2aWQpO1xuICB9LFxuICB5b3VUdWJlUGxheWVyKGlkKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uICgpIHtcbiAgICAgIHZhciBib2R5ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignYm9keScpO1xuICAgICAgdmFyIHZpZGVvX19tb2RhbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgICAgdmFyIGlmcmFtZVdyYXBwZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICAgIHZhciBpZnJhbWVEaXYgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdpRnJhbWUnKTtcbiAgICAgIGlmcmFtZURpdi5zZXRBdHRyaWJ1dGUoJ2RhdGEteW91dHViZS1pZCcsIGlkKTtcbiAgICAgIGlmcmFtZURpdi5zZXRBdHRyaWJ1dGUoJ3NyYycsICdodHRwczovL3d3dy55b3V0dWJlLmNvbS9lbWJlZC8nICsgaWQgKyAnP3JlbD0wJmFtcDtjb250cm9scz0wJmFtcCcpO1xuICAgICAgdmlkZW9fX21vZGFsLnNldEF0dHJpYnV0ZSgnY2xhc3MnLCAndmlkZW9fX21vZGFsJyk7XG4gICAgICBpZnJhbWVXcmFwcGVyLnNldEF0dHJpYnV0ZSgnY2xhc3MnLCAnaWZyYW1lV3JhcHBlcicpO1xuICAgICAgdmlkZW9fX21vZGFsLmFwcGVuZENoaWxkKGlmcmFtZVdyYXBwZXIpO1xuICAgICAgaWZyYW1lV3JhcHBlci5hcHBlbmRDaGlsZChpZnJhbWVEaXYpO1xuICAgICAgYm9keS5hcHBlbmRDaGlsZCh2aWRlb19fbW9kYWwpO1xuICAgICAgY29uc29sZS5sb2coJ3JldHVybicpO1xuICAgIH1cbiAgfVxufVxuLyo8aWZyYW1lIHdpZHRoPVwiMTI4MFwiIGhlaWdodD1cIjcyMFwiIHNyYz1cImh0dHBzOi8vd3d3LnlvdXR1YmUuY29tL2VtYmVkL1JLWWpkVGlNa1hNP3JlbD0wJmFtcDtjb250cm9scz0wJmFtcDtzaG93aW5mbz0wXCIgZnJhbWVib3JkZXI9XCIwXCIgYWxsb3dmdWxsc2NyZWVuPVwiXCI+PC9pZnJhbWU+Ki9cbiIsImltcG9ydCAnLi95b3V0dWJlRGF0YSc7XG5sZXQgeyBpdGVtcyB9ID0gSkMudXRpbHMuZGF0YTtcblxuZnVuY3Rpb24gZ2V0WW91VHViZUlEcygpIHtcbiAgbGV0IGlkcyA9IFtdO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IGl0ZW1zLmxlbmd0aDsgaSsrKSB7XG4gICAgaWRzW2ldID0gaXRlbXNbaV0uY29udGVudERldGFpbHMudmlkZW9JZDtcbiAgfVxuICByZXR1cm4gaWRzO1xufTtcblxuZXhwb3J0IGZ1bmN0aW9uIHBsYXlSYW5kb21Zb3VUdWJlVmlkZW8oKSB7XG4gIGxldCBpZHMgPSBnZXRZb3VUdWJlSURzKCk7IC8vIGFycmF5XG4gIGxldCBnZXRSYW5kSWQgPSBpZHNbSkMudXRpbHMucmFuZG9tTnVtYmVyKGlkcy5sZW5ndGgpXTtcbiAgbGV0IHBsYXlWaWRlbyA9IEpDLnV0aWxzLnlvdVR1YmVQbGF5ZXIoZ2V0UmFuZElkKTtcbiAgcGxheVZpZGVvKCk7XG59O1xuIiwiSkMudXRpbHMuZGF0YSA9IHtcbiAgXCJraW5kXCI6IFwieW91dHViZSNwbGF5bGlzdEl0ZW1MaXN0UmVzcG9uc2VcIixcbiAgXCJldGFnXCI6IFwiXFxcImNiejNsSVEyTjI1QWZ3TnItQmR4VVZ4Sl9RWS9obGNnSVhEQURDLXExRkkxR1BzS0tOdm92YU1cXFwiXCIsXG4gIFwibmV4dFBhZ2VUb2tlblwiOiBcIkNCa1FBQVwiLFxuICBcInBhZ2VJbmZvXCI6IHtcbiAgICBcInRvdGFsUmVzdWx0c1wiOiA0MSxcbiAgICBcInJlc3VsdHNQZXJQYWdlXCI6IDI1XG4gIH0sXG4gIFwiaXRlbXNcIjogW1xuICAgIHtcbiAgICAgIFwia2luZFwiOiBcInlvdXR1YmUjcGxheWxpc3RJdGVtXCIsXG4gICAgICBcImV0YWdcIjogXCJcXFwiY2J6M2xJUTJOMjVBZndOci1CZHhVVnhKX1FZL0JuaVpXbDZVckYyejYxQzNCMHR2TnRyQmpEZ1xcXCJcIixcbiAgICAgIFwiaWRcIjogXCJVRXhSWVVwRWQweFllVUowV0hJeFJtVXlSbEo2U1dSVU0xSkdaVWMxTWxGV1JpNDFOa0kwTkVZMlJERXdOVFUzUTBNMlwiLFxuICAgICAgXCJzbmlwcGV0XCI6IHtcbiAgICAgICAgXCJwdWJsaXNoZWRBdFwiOiBcIjIwMTUtMDItMThUMDU6NTc6MzEuMDAwWlwiLFxuICAgICAgICBcImNoYW5uZWxJZFwiOiBcIlVDVk00QzFmQjlRY3d5N2ROamJYZVVWd1wiLFxuICAgICAgICBcInRpdGxlXCI6IFwiTGVhcm5pbmcgaG93IHRvIHVzZSBqUXVlcnkgQUpBWCB3aXRoIFBIUFwiLFxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiR2V0dGluZyBzdGFydGVkIHdpdGggQUpBWCBpcyBzdXBlciBlYXN5IHdoZW4geW91IHVzZSB0aGUgalF1ZXJ5IGxpYnJhcnkuIFRoYXQgd29ya3Mgd2VsbCBmb3IgdGhlIGNsaWVudCBzaWRlLCBidXQgaG93IGRvIHlvdSB3b3JrIHdpdGggYSBzZXJ2ZXIgc2lkZSBsYW5ndWFnZSBsaWtlIFBIUD8gSXQncyBlYXNpZXIgdGhhbiB5b3UgdGhpbmsuXCIsXG4gICAgICAgIFwidGh1bWJuYWlsc1wiOiB7XG4gICAgICAgICAgXCJkZWZhdWx0XCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9UUjBna0diTXdXMC9kZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiAxMjAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiA5MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJtZWRpdW1cIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL1RSMGdrR2JNd1cwL21xZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogMzIwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogMTgwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImhpZ2hcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL1RSMGdrR2JNd1cwL2hxZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogNDgwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogMzYwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInN0YW5kYXJkXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9UUjBna0diTXdXMC9zZGRlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDY0MCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDQ4MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJtYXhyZXNcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL1RSMGdrR2JNd1cwL21heHJlc2RlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDEyODAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiA3MjBcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIFwiY2hhbm5lbFRpdGxlXCI6IFwiSnVzdHluIENsYXJrXCIsXG4gICAgICAgIFwicGxheWxpc3RJZFwiOiBcIlBMUWFKRHdMWHlCdFhyMUZlMkZSeklkVDNSRmVHNTJRVkZcIixcbiAgICAgICAgXCJwb3NpdGlvblwiOiAwLFxuICAgICAgICBcInJlc291cmNlSWRcIjoge1xuICAgICAgICAgIFwia2luZFwiOiBcInlvdXR1YmUjdmlkZW9cIixcbiAgICAgICAgICBcInZpZGVvSWRcIjogXCJUUjBna0diTXdXMFwiXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcImNvbnRlbnREZXRhaWxzXCI6IHtcbiAgICAgICAgXCJ2aWRlb0lkXCI6IFwiVFIwZ2tHYk13VzBcIixcbiAgICAgICAgXCJ2aWRlb1B1Ymxpc2hlZEF0XCI6IFwiMjAxMy0wMS0wMVQwMjozNTo1MC4wMDBaXCJcbiAgICAgIH1cbiAgICB9LFxuICAgIHtcbiAgICAgIFwia2luZFwiOiBcInlvdXR1YmUjcGxheWxpc3RJdGVtXCIsXG4gICAgICBcImV0YWdcIjogXCJcXFwiY2J6M2xJUTJOMjVBZndOci1CZHhVVnhKX1FZL3JBWEVhbnhic0tWVUlCZWpaZzVmbXNpV3lYY1xcXCJcIixcbiAgICAgIFwiaWRcIjogXCJVRXhSWVVwRWQweFllVUowV0hJeFJtVXlSbEo2U1dSVU0xSkdaVWMxTWxGV1JpNHlPRGxHTkVFME5rUkdNRUV6TUVReVwiLFxuICAgICAgXCJzbmlwcGV0XCI6IHtcbiAgICAgICAgXCJwdWJsaXNoZWRBdFwiOiBcIjIwMTUtMDItMjdUMTg6MzY6NDkuMDAwWlwiLFxuICAgICAgICBcImNoYW5uZWxJZFwiOiBcIlVDVk00QzFmQjlRY3d5N2ROamJYZVVWd1wiLFxuICAgICAgICBcInRpdGxlXCI6IFwiR2l0aHViIFR1dG9yaWFsIEZvciBCZWdpbm5lcnMgLSBHaXRodWIgQmFzaWNzIGZvciBNYWMgb3IgV2luZG93cyAmIFNvdXJjZSBDb250cm9sIEJhc2ljc1wiLFxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiR2l0aHViIFR1dG9yaWFsIEZvciBCZWdpbm5lcnMgLSBsZWFybiBHaXRodWIgZm9yIE1hYyBvciBHaXRodWIgZm9yIHdpbmRvd3NcXG5JZiB5b3UndmUgYmVlbiB3YW50aW5nIHRvIGxlYXJuIEdpdGh1Yiwgbm93J3MgdGhlIHBlcmZlY3QgdGltZSEgIEdpdGh1YiBpcyBzZWVuIGFzIGEgYmlnIHJlcXVpcmVtZW50IGJ5IG1vc3QgZW1wbG95ZXJzIHRoZXNlIGRheXMgYW5kIGlzIHZlcnkgY3JpdGljYWwgdG8gYnVzaW5lc3Mgd29ya2Zsb3cuICBUaGlzIEdpdGh1YiB0dXRvcmlhbCB3aWxsIGNvdmVyIHRoZSBiYXNpY3Mgb2YgaG93IHRvIHVzZSBHaXRodWIgYW5kIHRoZSBjb21tYW5kIGxpbmUuXFxuXFxuTGVzc29uICMyOiBQdWxsIHJlcXVlc3RzLCBCcmFuY2hpbmcgbWVyZ2luZ1xcbmh0dHBzOi8vd3d3LnlvdXR1YmUuY29tL3dhdGNoP3Y9b0ZZeVRad015QWdcXG5cXG5PdGhlciBWaWRlb3M6XFxualF1ZXJ5IHJhcGlkLWxlYXJuaW5nIENvdXJzZVxcbmh0dHBzOi8vd3d3LnlvdXR1YmUuY29tL3dhdGNoP3Y9aE14R2hITk9rQ1VcIixcbiAgICAgICAgXCJ0aHVtYm5haWxzXCI6IHtcbiAgICAgICAgICBcImRlZmF1bHRcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpLzBmS2c3ZTM3YlFFL2RlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDEyMCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDkwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcIm1lZGl1bVwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvMGZLZzdlMzdiUUUvbXFkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiAzMjAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiAxODBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiaGlnaFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvMGZLZzdlMzdiUUUvaHFkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiA0ODAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiAzNjBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwic3RhbmRhcmRcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpLzBmS2c3ZTM3YlFFL3NkZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogNjQwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogNDgwXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcImNoYW5uZWxUaXRsZVwiOiBcIkp1c3R5biBDbGFya1wiLFxuICAgICAgICBcInBsYXlsaXN0SWRcIjogXCJQTFFhSkR3TFh5QnRYcjFGZTJGUnpJZFQzUkZlRzUyUVZGXCIsXG4gICAgICAgIFwicG9zaXRpb25cIjogMSxcbiAgICAgICAgXCJyZXNvdXJjZUlkXCI6IHtcbiAgICAgICAgICBcImtpbmRcIjogXCJ5b3V0dWJlI3ZpZGVvXCIsXG4gICAgICAgICAgXCJ2aWRlb0lkXCI6IFwiMGZLZzdlMzdiUUVcIlxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgXCJjb250ZW50RGV0YWlsc1wiOiB7XG4gICAgICAgIFwidmlkZW9JZFwiOiBcIjBmS2c3ZTM3YlFFXCIsXG4gICAgICAgIFwidmlkZW9QdWJsaXNoZWRBdFwiOiBcIjIwMTQtMDEtMTZUMjA6MDU6MjcuMDAwWlwiXG4gICAgICB9XG4gICAgfSxcbiAgICB7XG4gICAgICBcImtpbmRcIjogXCJ5b3V0dWJlI3BsYXlsaXN0SXRlbVwiLFxuICAgICAgXCJldGFnXCI6IFwiXFxcImNiejNsSVEyTjI1QWZ3TnItQmR4VVZ4Sl9RWS9CZUZ1N2tVYVNKSEg5akc4UDNFN2tEZ3hUQUVcXFwiXCIsXG4gICAgICBcImlkXCI6IFwiVUV4UllVcEVkMHhZZVVKMFdISXhSbVV5UmxKNlNXUlVNMUpHWlVjMU1sRldSaTR3TVRjeU1EaEdRVUU0TlRJek0wWTVcIixcbiAgICAgIFwic25pcHBldFwiOiB7XG4gICAgICAgIFwicHVibGlzaGVkQXRcIjogXCIyMDE1LTAzLTAyVDIyOjQ3OjA4LjAwMFpcIixcbiAgICAgICAgXCJjaGFubmVsSWRcIjogXCJVQ1ZNNEMxZkI5UWN3eTdkTmpiWGVVVndcIixcbiAgICAgICAgXCJ0aXRsZVwiOiBcIkFuZ3VsYXJKUyBUdXRvcmlhbFwiLFxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiQSB2aWRlbyB0dXRvcmlhbCB0byBoZWxwIHlvdSBnZXQgc3RhcnRlZCB3aXRoIEFuZ3VsYXJKUy4gWW91IGNhbiBwbGF5IGFyb3VuZCB3aXRoIHRoZSBmaW5hbCByZXN1bHQgaW4gdGhlIGZvbGxvd2luZyBqc2ZpZGRsZTpcXG5cXG5odHRwOi8vanNmaWRkbGUubmV0L2pvaG5saW5kcXVpc3QvVTNjMlEvXFxuXFxuUGxlYXNlIHRha2UgYW55IHRlY2huaWNhbCBxdWVzdGlvbnMgYWJvdXQgQW5ndWxhckpTIHRvIHRoZSB2ZXJ5IGFjdGl2ZSBhbmQgaGVscGZ1bCBBbmd1bGFySlMgbWFpbGluZyBsaXN0Olxcbmh0dHBzOi8vZ3JvdXBzLmdvb2dsZS5jb20vZm9ydW0vP2Zyb21ncm91cHMjIWZvcnVtL2FuZ3VsYXJcIixcbiAgICAgICAgXCJ0aHVtYm5haWxzXCI6IHtcbiAgICAgICAgICBcImRlZmF1bHRcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL1d1aUh1WnFfY2c0L2RlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDEyMCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDkwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcIm1lZGl1bVwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvV3VpSHVacV9jZzQvbXFkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiAzMjAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiAxODBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiaGlnaFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvV3VpSHVacV9jZzQvaHFkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiA0ODAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiAzNjBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwic3RhbmRhcmRcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL1d1aUh1WnFfY2c0L3NkZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogNjQwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogNDgwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcIm1heHJlc1wiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvV3VpSHVacV9jZzQvbWF4cmVzZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogMTI4MCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDcyMFxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJjaGFubmVsVGl0bGVcIjogXCJKdXN0eW4gQ2xhcmtcIixcbiAgICAgICAgXCJwbGF5bGlzdElkXCI6IFwiUExRYUpEd0xYeUJ0WHIxRmUyRlJ6SWRUM1JGZUc1MlFWRlwiLFxuICAgICAgICBcInBvc2l0aW9uXCI6IDIsXG4gICAgICAgIFwicmVzb3VyY2VJZFwiOiB7XG4gICAgICAgICAgXCJraW5kXCI6IFwieW91dHViZSN2aWRlb1wiLFxuICAgICAgICAgIFwidmlkZW9JZFwiOiBcIld1aUh1WnFfY2c0XCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwiY29udGVudERldGFpbHNcIjoge1xuICAgICAgICBcInZpZGVvSWRcIjogXCJXdWlIdVpxX2NnNFwiLFxuICAgICAgICBcInZpZGVvUHVibGlzaGVkQXRcIjogXCIyMDEyLTA0LTA0VDA2OjU1OjE2LjAwMFpcIlxuICAgICAgfVxuICAgIH0sXG4gICAge1xuICAgICAgXCJraW5kXCI6IFwieW91dHViZSNwbGF5bGlzdEl0ZW1cIixcbiAgICAgIFwiZXRhZ1wiOiBcIlxcXCJjYnozbElRMk4yNUFmd05yLUJkeFVWeEpfUVkvS0ZfT0JHcTNzUkNDUTZfM2cwVkRHR1dkVldZXFxcIlwiLFxuICAgICAgXCJpZFwiOiBcIlVFeFJZVXBFZDB4WWVVSjBXSEl4Um1VeVJsSjZTV1JVTTFKR1pVYzFNbEZXUmk0MU1qRTFNa0kwT1RRMlF6SkdOek5HXCIsXG4gICAgICBcInNuaXBwZXRcIjoge1xuICAgICAgICBcInB1Ymxpc2hlZEF0XCI6IFwiMjAxNS0wMy0xMFQwNTo1NDowOC4wMDBaXCIsXG4gICAgICAgIFwiY2hhbm5lbElkXCI6IFwiVUNWTTRDMWZCOVFjd3k3ZE5qYlhlVVZ3XCIsXG4gICAgICAgIFwidGl0bGVcIjogXCJJbnRyb2R1Y3Rpb24gdG8gQW5ndWxhci5qcyBpbiA1MCBFeGFtcGxlcyAocGFydCAxKVwiLFxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiQ29kZSBhdCBodHRwczovL2dpdGh1Yi5jb20vY3VycmFuL3NjcmVlbmNhc3RzL3RyZWUvZ2gtcGFnZXMvaW50cm9Ub0FuZ3VsYXIgQW4gaW50cm9kdWN0aW9uIHRvIEFuZ3VsYXIuanMgY292ZXJpbmcgc2luZ2xlLXBhZ2UtYXBwIGNvbmNlcHRzLCByZWxhdGVkIGxpYnJhcmllcyBhbmQgYW5ndWxhciBmZWF0dXJlcyBieSBleGFtcGxlLiBUaGlzIGluc3RhbGxtZW50IChwYXJ0IDEpIGNvdmVycyAzNiBvZiB0aGUgNTAgQW5ndWxhciBleGFtcGxlcy4gUGFydCAyIGNvdmVycyB0aGUgcmVzdCBodHRwczovL3d3dy55b3V0dWJlLmNvbS93YXRjaD92PTZKMDhtMUgyQk1FJmZlYXR1cmU9eW91dHUuYmUgRXhhbXBsZXMgc3RhcnQgYXQgMTE6MzAgaW4gdGhlIHZpZGVvLlxcblxcbklmIHlvdSBhcHByZWNpYXRlIHRoaXMgd29yaywgcGxlYXNlIGNvbnNpZGVyIHN1cHBvcnRpbmcgbWUgb24gUGF0cmVvbiBodHRwczovL3d3dy5wYXRyZW9uLmNvbS91c2VyP3U9MjkxNjI0MiZ0eT1oXFxuXFxuVGhpcyBsZWN0dXJlIHdhcyBnaXZlbiBieSBDdXJyYW4gS2VsbGVoZXIgYXQgdGhlIFVuaXZlcnNpdHkgb2YgTWFzc2FjaHVzZXR0cyBMb3dlbGwgb24gTWFyY2ggNiwgMjAxNCBhcyBwYXJ0IG9mIHRoZSB1bmRlcmdyYWR1YXRlIGNvdXJzZSBHVUkgUHJvZ3JhbW1pbmcgSUkgdGF1Z2h0IGJ5IFByb2Zlc3NvciBKZXNzZSBIZWluZXMuXCIsXG4gICAgICAgIFwidGh1bWJuYWlsc1wiOiB7XG4gICAgICAgICAgXCJkZWZhdWx0XCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9UUnJMNWozTUl2by9kZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiAxMjAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiA5MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJtZWRpdW1cIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL1RSckw1ajNNSXZvL21xZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogMzIwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogMTgwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImhpZ2hcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL1RSckw1ajNNSXZvL2hxZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogNDgwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogMzYwXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcImNoYW5uZWxUaXRsZVwiOiBcIkp1c3R5biBDbGFya1wiLFxuICAgICAgICBcInBsYXlsaXN0SWRcIjogXCJQTFFhSkR3TFh5QnRYcjFGZTJGUnpJZFQzUkZlRzUyUVZGXCIsXG4gICAgICAgIFwicG9zaXRpb25cIjogMyxcbiAgICAgICAgXCJyZXNvdXJjZUlkXCI6IHtcbiAgICAgICAgICBcImtpbmRcIjogXCJ5b3V0dWJlI3ZpZGVvXCIsXG4gICAgICAgICAgXCJ2aWRlb0lkXCI6IFwiVFJyTDVqM01Jdm9cIlxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgXCJjb250ZW50RGV0YWlsc1wiOiB7XG4gICAgICAgIFwidmlkZW9JZFwiOiBcIlRSckw1ajNNSXZvXCIsXG4gICAgICAgIFwidmlkZW9QdWJsaXNoZWRBdFwiOiBcIjIwMTQtMDMtMDhUMDM6MDY6MjUuMDAwWlwiXG4gICAgICB9XG4gICAgfSxcbiAgICB7XG4gICAgICBcImtpbmRcIjogXCJ5b3V0dWJlI3BsYXlsaXN0SXRlbVwiLFxuICAgICAgXCJldGFnXCI6IFwiXFxcImNiejNsSVEyTjI1QWZ3TnItQmR4VVZ4Sl9RWS9jWlJJOFkybF9FSUFxT1p2bno5SkZNQWlDM01cXFwiXCIsXG4gICAgICBcImlkXCI6IFwiVUV4UllVcEVkMHhZZVVKMFdISXhSbVV5UmxKNlNXUlVNMUpHWlVjMU1sRldSaTR3T1RBM09UWkJOelZFTVRVek9UTXlcIixcbiAgICAgIFwic25pcHBldFwiOiB7XG4gICAgICAgIFwicHVibGlzaGVkQXRcIjogXCIyMDE1LTAzLTExVDEwOjU3OjU0LjAwMFpcIixcbiAgICAgICAgXCJjaGFubmVsSWRcIjogXCJVQ1ZNNEMxZkI5UWN3eTdkTmpiWGVVVndcIixcbiAgICAgICAgXCJ0aXRsZVwiOiBcIlVzaW5nIEFuaW1hdGUuY3NzIGFuZCBqUXVlcnkgZm9yIGVhc3kgV2ViIEFuaW1hdGlvblwiLFxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiU2ltcGxlIHR1dG9yaWFsIG9uIGhvdyB0byB1c2UgQW5pbWF0ZS5jc3MgYW5kIGpRdWVyeSB0b2dldGhlciBpbiB5b3VyIHdlYnNpdGUgb3Igd2ViIGFwcCEg8J+UpVN1YnNjcmliZSBmb3IgbW9yZSBsaWtlIHRoaXM6IGh0dHBzOi8vZ29vLmdsL0xVRWtOMVwiLFxuICAgICAgICBcInRodW1ibmFpbHNcIjoge1xuICAgICAgICAgIFwiZGVmYXVsdFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvQ0JRR2w2em9rTXMvZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogMTIwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogOTBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwibWVkaXVtXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9DQlFHbDZ6b2tNcy9tcWRlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDMyMCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDE4MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJoaWdoXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9DQlFHbDZ6b2tNcy9ocWRlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDQ4MCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDM2MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJzdGFuZGFyZFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvQ0JRR2w2em9rTXMvc2RkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiA2NDAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiA0ODBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwibWF4cmVzXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9DQlFHbDZ6b2tNcy9tYXhyZXNkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiAxMjgwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogNzIwXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcImNoYW5uZWxUaXRsZVwiOiBcIkp1c3R5biBDbGFya1wiLFxuICAgICAgICBcInBsYXlsaXN0SWRcIjogXCJQTFFhSkR3TFh5QnRYcjFGZTJGUnpJZFQzUkZlRzUyUVZGXCIsXG4gICAgICAgIFwicG9zaXRpb25cIjogNCxcbiAgICAgICAgXCJyZXNvdXJjZUlkXCI6IHtcbiAgICAgICAgICBcImtpbmRcIjogXCJ5b3V0dWJlI3ZpZGVvXCIsXG4gICAgICAgICAgXCJ2aWRlb0lkXCI6IFwiQ0JRR2w2em9rTXNcIlxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgXCJjb250ZW50RGV0YWlsc1wiOiB7XG4gICAgICAgIFwidmlkZW9JZFwiOiBcIkNCUUdsNnpva01zXCIsXG4gICAgICAgIFwidmlkZW9QdWJsaXNoZWRBdFwiOiBcIjIwMTQtMDYtMDVUMTk6NTk6NDMuMDAwWlwiXG4gICAgICB9XG4gICAgfSxcbiAgICB7XG5cblxuICAgICAgXCJraW5kXCI6IFwieW91dHViZSNwbGF5bGlzdEl0ZW1cIixcbiAgICAgIFwiZXRhZ1wiOiBcIlxcXCJjYnozbElRMk4yNUFmd05yLUJkeFVWeEpfUVkvMm9RdTE1QlE5NWdqUWN6SVJIVnVTcDY2Zk5BXFxcIlwiLFxuICAgICAgXCJpZFwiOiBcIlVFeFJZVXBFZDB4WWVVSjBXSEl4Um1VeVJsSjZTV1JVTTFKR1pVYzFNbEZXUmk0eE1rVkdRak5DTVVNMU4wUkZORVV4XCIsXG4gICAgICBcInNuaXBwZXRcIjoge1xuICAgICAgICBcInB1Ymxpc2hlZEF0XCI6IFwiMjAxNS0wMy0xNFQwNzo0MjoyMC4wMDBaXCIsXG4gICAgICAgIFwiY2hhbm5lbElkXCI6IFwiVUNWTTRDMWZCOVFjd3k3ZE5qYlhlVVZ3XCIsXG4gICAgICAgIFwidGl0bGVcIjogXCJXRUIgREVWRUxPUE1FTlQgLSBTRUNSRVRTIFRPIFNUQVJUSU5HIEEgQ0FSRUVSIGluIHRoZSBXZWIgRGV2ZWxvcG1lbnQgSW5kdXN0cnlcIixcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkV2ZXJ5b25lIGtlZXBzIHNheWluZyBob3cgZ3JlYXQgd2ViIGRldmVsb3BtZW50IGlzLCBidXQgaG93IGRvIHlvdSBnZXQgdGhhdCBmaXJzdCBqb2I/ICBUaGlzIHZpZGVvIGlzIGEgcmVzcG9uc2UgdG8gdGhlIHF1ZXN0aW9ucyBJJ3ZlIGJlZW4gZ2V0dGluZyBhYm91dCBob3cgdG8gbGFuZCB0aGF0IGZpcnN0IHdlYiBkZXZlbG9wbWVudCBqb2IgYW5kIGhvdyB0byBrbm93IHdoZW4geW91J3JlIHJlYWR5IHRvIHRha2UgdGhlIGxlYXAgYW5kIGxvb2sgZm9yIG9uZS5cXG5cXG5UaGUgZmlyc3QgdGhpbmcgeW91IGhhdmUgdG8ga25vdyBpcyB0aGF0IHlvdSBkb24ndCBoYXZlIHRvIGJlIGEgc2Vhc29uZWQgcHJvIHRvIGdldCBhIGpvYiBhcyBhIGZ1bGwtdGltZSB3ZWIgZGV2ZWxvcGVyLiAgVGhlcmUgYXJlIExPVFMgb2YgY29tcGFuaWVzIGxvb2tpbmcgZm9yIHdlYiBkZXZlbG9wZXJzIHRoYXQgZG9uJ3QgaGF2ZSBtdWNoIGV4cGVyaWVuY2UuXFxuXFxuQWxzbywgdGhlcmUgYXJlIGEgbG90IG9mIHRoaW5ncyB5b3UgY2FuIGRvIHRvIHByZXBhcmUgeW91ciByZXN1bWUgdG8gcmVhbGx5IHN0aWNrIG91dCB0byBhIHByb3NwZWN0aXZlIGVtcGxveWVyLlxcblxcblRoaXMgdmlkZW8gd2lsbCBnaXZlIHlvdSBhIGZlZWwgZm9yIHdoYXQgYW4gZW1wbG95ZXIgd2lsbCBiZSBsb29raW5nIGZvciBhbmQgd2hhdCB0aGV5J2xsIGJlIFxcXCJncmFkaW5nXFxcIiB5b3Ugb24gYXMgeW91IGxvb2sgZm9yIGEgam9iIGluIHRoaXMgaW5kdXN0cnkuXFxuXFxuR2l0aHViIEludHJvOiBcXG5odHRwczovL3d3dy55b3V0dWJlLmNvbS93YXRjaD92PTBmS2c3ZTM3YlFFXFxuR2l0aHViIFB1bGwgUmVxdWVzdHM6IFxcbmh0dHBzOi8vd3d3LnlvdXR1YmUuY29tL3dhdGNoP3Y9b0ZZeVRad015QWdcXG5cXG5qUXVlcnkgQ291cnNlOlxcbmh0dHBzOi8vd3d3LnlvdXR1YmUuY29tL3BsYXlsaXN0P2xpc3Q9UExvWUNnTk9JeUdBQmRJMlY4SV9TV28yMnRGcGdoMnM2X1wiLFxuICAgICAgICBcInRodW1ibmFpbHNcIjoge1xuICAgICAgICAgIFwiZGVmYXVsdFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvSmlsZlhtSTJJalEvZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogMTIwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogOTBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwibWVkaXVtXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9KaWxmWG1JMklqUS9tcWRlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDMyMCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDE4MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJoaWdoXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9KaWxmWG1JMklqUS9ocWRlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDQ4MCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDM2MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJzdGFuZGFyZFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvSmlsZlhtSTJJalEvc2RkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiA2NDAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiA0ODBcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIFwiY2hhbm5lbFRpdGxlXCI6IFwiSnVzdHluIENsYXJrXCIsXG4gICAgICAgIFwicGxheWxpc3RJZFwiOiBcIlBMUWFKRHdMWHlCdFhyMUZlMkZSeklkVDNSRmVHNTJRVkZcIixcbiAgICAgICAgXCJwb3NpdGlvblwiOiA1LFxuICAgICAgICBcInJlc291cmNlSWRcIjoge1xuICAgICAgICAgIFwia2luZFwiOiBcInlvdXR1YmUjdmlkZW9cIixcbiAgICAgICAgICBcInZpZGVvSWRcIjogXCJKaWxmWG1JMklqUVwiXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcImNvbnRlbnREZXRhaWxzXCI6IHtcbiAgICAgICAgXCJ2aWRlb0lkXCI6IFwiSmlsZlhtSTJJalFcIixcbiAgICAgICAgXCJ2aWRlb1B1Ymxpc2hlZEF0XCI6IFwiMjAxNC0wNC0yMVQxODowMDowMi4wMDBaXCJcbiAgICAgIH1cbiAgICB9LFxuICAgIHtcblxuXG4gICAgICBcImtpbmRcIjogXCJ5b3V0dWJlI3BsYXlsaXN0SXRlbVwiLFxuICAgICAgXCJldGFnXCI6IFwiXFxcImNiejNsSVEyTjI1QWZ3TnItQmR4VVZ4Sl9RWS9hcnY0cXFDNkJqOXdMZ29La1g0Wk5yVWJ0YWNcXFwiXCIsXG4gICAgICBcImlkXCI6IFwiVUV4UllVcEVkMHhZZVVKMFdISXhSbVV5UmxKNlNXUlVNMUpHWlVjMU1sRldSaTQxTXpKQ1FqQkNOREl5UmtKRE4wVkRcIixcbiAgICAgIFwic25pcHBldFwiOiB7XG4gICAgICAgIFwicHVibGlzaGVkQXRcIjogXCIyMDE1LTAzLTIwVDA4OjUxOjE3LjAwMFpcIixcbiAgICAgICAgXCJjaGFubmVsSWRcIjogXCJVQ1ZNNEMxZkI5UWN3eTdkTmpiWGVVVndcIixcbiAgICAgICAgXCJ0aXRsZVwiOiBcIlJlYWx0aW1lIFxcXCJFeWUgQ2FuZHlcXFwiIHdpdGggQW5ndWxhckpTXCIsXG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJMZWFybiBob3cgdG8gbWFrZSBhIGZ1bGx5IGludGVyYWN0aXZlLCByZWFsdGltZSBBbmd1bGFySlMgYXBwbGljYXRpb24gd2l0aCBzbmFwcHkgYW5pbWF0aW9uIGVmZmVjdHMsIHNsZWVrIHBlcmZvcm1hbmNlIGFuZCBjbGVhbiwgb3JnYW5pemVkIGNvZGUuIFRvcCB0aGF0IG9mZiBieSB0ZXN0aW5nIGFsbCBhc3BlY3RzIG9mIHRoZSBhcHBsaWNhdGlvbiB1c2luZyBQcm90cmFjdG9yIGFuZCBVbml0IHRlc3RpbmcgYWNyb3NzIG11bHRpcGxlIGJyb3dzZXJzIHVzaW5nIEthcm1hICsgU2F1Y2UgTGFicy5cIixcbiAgICAgICAgXCJ0aHVtYm5haWxzXCI6IHtcbiAgICAgICAgICBcImRlZmF1bHRcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpLzh1ajdZU3FieTdzL2RlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDEyMCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDkwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcIm1lZGl1bVwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvOHVqN1lTcWJ5N3MvbXFkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiAzMjAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiAxODBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiaGlnaFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvOHVqN1lTcWJ5N3MvaHFkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiA0ODAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiAzNjBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwic3RhbmRhcmRcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpLzh1ajdZU3FieTdzL3NkZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogNjQwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogNDgwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcIm1heHJlc1wiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvOHVqN1lTcWJ5N3MvbWF4cmVzZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogMTI4MCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDcyMFxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJjaGFubmVsVGl0bGVcIjogXCJKdXN0eW4gQ2xhcmtcIixcbiAgICAgICAgXCJwbGF5bGlzdElkXCI6IFwiUExRYUpEd0xYeUJ0WHIxRmUyRlJ6SWRUM1JGZUc1MlFWRlwiLFxuICAgICAgICBcInBvc2l0aW9uXCI6IDYsXG4gICAgICAgIFwicmVzb3VyY2VJZFwiOiB7XG4gICAgICAgICAgXCJraW5kXCI6IFwieW91dHViZSN2aWRlb1wiLFxuICAgICAgICAgIFwidmlkZW9JZFwiOiBcIjh1ajdZU3FieTdzXCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwiY29udGVudERldGFpbHNcIjoge1xuICAgICAgICBcInZpZGVvSWRcIjogXCI4dWo3WVNxYnk3c1wiLFxuICAgICAgICBcInZpZGVvUHVibGlzaGVkQXRcIjogXCIyMDE0LTAxLTE1VDE0OjAwOjAzLjAwMFpcIlxuICAgICAgfVxuICAgIH0sXG4gICAge1xuXG5cbiAgICAgIFwia2luZFwiOiBcInlvdXR1YmUjcGxheWxpc3RJdGVtXCIsXG4gICAgICBcImV0YWdcIjogXCJcXFwiY2J6M2xJUTJOMjVBZndOci1CZHhVVnhKX1FZL2JoY3hQZkN1UWdfa0dTdlVBMXNzTlpiZUIxTVxcXCJcIixcbiAgICAgIFwiaWRcIjogXCJVRXhSWVVwRWQweFllVUowV0hJeFJtVXlSbEo2U1dSVU0xSkdaVWMxTWxGV1JpNURRVU5FUkRRMk5rSXpSVVF4TlRZMVwiLFxuICAgICAgXCJzbmlwcGV0XCI6IHtcbiAgICAgICAgXCJwdWJsaXNoZWRBdFwiOiBcIjIwMTUtMDMtMzFUMTk6NTc6NTMuMDAwWlwiLFxuICAgICAgICBcImNoYW5uZWxJZFwiOiBcIlVDVk00QzFmQjlRY3d5N2ROamJYZVVWd1wiLFxuICAgICAgICBcInRpdGxlXCI6IFwiSnVuaW9yIERldmVsb3BlciAxMDE6IFRpcHMgZm9yIEhvdyB0byBTY29yZSBhIEpvYlwiLFxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiVHJ5aW5nIHRvIGJlY29tZSBhIGp1bmlvciBkZXZlbG9wZXI/IEhhdmUgYW54aWV0eSBhYm91dCB0aGUgaW50ZXJ2aWV3IHByb2Nlc3M/IFdlIGFyZSBicmluZ2luZyB0b2dldGhlciBqdW5pb3IgZGV2cyB3aG8gbWFkZSBpdCB0aHJvdWdoIG9uIHRoZSBvdGhlciBzaWRlIGFuZCBsaXZlZCB0byB0ZWxsIHRoZSB0YWxlLlxcblxcbkpvaW4gdXMgZm9yIGFub3RoZXIgRysgSGFuZ291dCB0byB0YWxrIGFib3V0IFxcXCJJbnRlcnZpZXcgMTAxXFxcIiB3aXRoIGRldnMsIHJlY3J1aXRlcnMgYW5kIGVtcGxveWVycy4gIFxcblxcbldlJ2xsIGFuc3dlciBxdWVzdGlvbnMgbGlrZTpcXG5cXG4xLiBXaGF0IGFyZSBzb21lIG9mIHRoZSBiZXN0IHJlc291cmNlcyBmb3IgbXkgam9iIHNlYXJjaD9cXG4yLiBEbyBJIG5lZWQgcHJpb3IgZXhwZXJpZW5jZSBpbiBjb2Rpbmcgb3IgdGhlIGluZHVzdHJ5IHRvIGdldCBhIGpvYj9cXG4zLiBXaGF0IGtpbmQgb2Ygam9icyBzaG91bGQgSSBiZSBsb29raW5nIGZvcj8gSXMgZnJlZWxhbmNpbmcgYSBnb29kIG9wdGlvbj8gXFxuNC4gSXMgeW91ciBwb3J0Zm9saW8gdGhlIG1vc3QgaW1wb3J0YW50IHRoaW5nPyBIb3cgY2FuIEkgbWFrZSBtaW5lIGJldHRlcj9cXG41LiBXaGF0IGRvIGhpcmluZyBtYW5hZ2VycyB3YW50IHRvIHNlZSBvbiBhIHJlc3VtZT9cXG42LiBXaGF0IGhlbHBzIG1lIGFjdHVhbGx5IGdldCBhbiBpbnRlcnZpZXc/XFxuNy4gV2hhdCBkbyBJIG5lZWQgdG8gZG8gdG8gcHJlcGFyZT8gV2hhdCB0ZXN0IHByb2dyYW1zIHNob3VsZCBJIGtub3c/XFxuOC4gSG93IGRvIEkgZXhwbGFpbiBteSBiYWNrZ3JvdW5kIGlmIEkndmUgbGVhcm5lZCBjb2RpbmcgaW4gYSBub24tdHJhZGl0aW9uYWwgd2F5P1xcbjkuIFdoYXQga2luZCBvZiBxdWVzdGlvbnMgc2hvdWxkIEkgYmUgYXNraW5nIHRoZW0/IEhvdyBkbyBJIGtub3cgaWYgaXQncyBhIGdvb2QgY3VsdHVyZSBmaXQ/XFxuMTAuIEFueSB0aXBzIG9uIGhvdyB0byBzdGFuZCBvdXQgYW5kIGZvbGxvdyB1cCBhZnRlciB0aGUgZmFjdD8gXFxuXFxuQXNrIHF1ZXN0aW9ucyBhbmQgam9pbiB0aGUgY29udmVyc2F0aW9uIHVzaW5nICAjVGhpbmtKb2JzICFcXG5cXG5QYW5lbGlzdHM6XFxuR3JhZSBEcmFrZSAoQEdyYWVfRHJha2UpIC0gSGVhZCBvZiBFZHVjYXRpb24gT3BlcmF0aW9ucywgVGhpbmtmdWwgKE1vZGVyYXRvcilcXG5MYXVyYSBIb3JhayAoQGxhdXJhc2hvcmFrICkgIC0gSGVhZCBvZiBDb21tdW5pdHksIFRoaW5rZnVsXFxuVGhvbWFzIFBldGVyc29uIChAcmlwbGV5YWZmZWN0KSAtIEVuZ2luZWVyLCBUaGlua2Z1bFxcbkxlZSBFZHdhcmRzIChAdGVycm9uaykgLSBFbmdpbmVlciBNYW5hZ2VyLCBHcm91cG9uXFxuUm9ja21hbiBIYSAoQFJvY2t0b3RoZW1hbikgLSBDaGllZiBQZW9wbGUgT2ZmaWNlcjsgZm9ybWVybHkgTW9uZ28gREJcXG5FbGkgR29vZG1hbiAoQGVsaW1nb29kbWFuKSAtIENoaWVmIFRlY2hub2xvZ3kgT2ZmaWNlciwgTGl0dGxlIEJvcnJvd2VkIERyZXNzXCIsXG4gICAgICAgIFwidGh1bWJuYWlsc1wiOiB7XG4gICAgICAgICAgXCJkZWZhdWx0XCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS85cUVGRHFoUERDay9kZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiAxMjAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiA5MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJtZWRpdW1cIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpLzlxRUZEcWhQRENrL21xZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogMzIwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogMTgwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImhpZ2hcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpLzlxRUZEcWhQRENrL2hxZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogNDgwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogMzYwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInN0YW5kYXJkXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS85cUVGRHFoUERDay9zZGRlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDY0MCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDQ4MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJtYXhyZXNcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpLzlxRUZEcWhQRENrL21heHJlc2RlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDEyODAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiA3MjBcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIFwiY2hhbm5lbFRpdGxlXCI6IFwiSnVzdHluIENsYXJrXCIsXG4gICAgICAgIFwicGxheWxpc3RJZFwiOiBcIlBMUWFKRHdMWHlCdFhyMUZlMkZSeklkVDNSRmVHNTJRVkZcIixcbiAgICAgICAgXCJwb3NpdGlvblwiOiA3LFxuICAgICAgICBcInJlc291cmNlSWRcIjoge1xuICAgICAgICAgIFwia2luZFwiOiBcInlvdXR1YmUjdmlkZW9cIixcbiAgICAgICAgICBcInZpZGVvSWRcIjogXCI5cUVGRHFoUERDa1wiXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcImNvbnRlbnREZXRhaWxzXCI6IHtcbiAgICAgICAgXCJ2aWRlb0lkXCI6IFwiOXFFRkRxaFBEQ2tcIixcbiAgICAgICAgXCJ2aWRlb1B1Ymxpc2hlZEF0XCI6IFwiMjAxNC0wNy0xMVQxOTo1MjoyMC4wMDBaXCJcbiAgICAgIH1cbiAgICB9LFxuICAgIHtcblxuXG4gICAgICBcImtpbmRcIjogXCJ5b3V0dWJlI3BsYXlsaXN0SXRlbVwiLFxuICAgICAgXCJldGFnXCI6IFwiXFxcImNiejNsSVEyTjI1QWZ3TnItQmR4VVZ4Sl9RWS9jQlVCZnhwTklBVGRGRi13WWdZY3hDcXZlYjhcXFwiXCIsXG4gICAgICBcImlkXCI6IFwiVUV4UllVcEVkMHhZZVVKMFdISXhSbVV5UmxKNlNXUlVNMUpHWlVjMU1sRldSaTQ1TkRrMVJFWkVOemhFTXpVNU1EUXpcIixcbiAgICAgIFwic25pcHBldFwiOiB7XG4gICAgICAgIFwicHVibGlzaGVkQXRcIjogXCIyMDE1LTA5LTI5VDA2OjI5OjEzLjAwMFpcIixcbiAgICAgICAgXCJjaGFubmVsSWRcIjogXCJVQ1ZNNEMxZkI5UWN3eTdkTmpiWGVVVndcIixcbiAgICAgICAgXCJ0aXRsZVwiOiBcIkNTUyBwcmVwcm9jZXNzb3JzIHdpdGggSm9uYXRoYW4gVmVycmVjY2hpYVwiLFxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiWWVscCBmcm9udC1lbmQgZW5naW5lZXIgSm9uYXRoYW4gVmVycmVjY2hpYSB3aWxsIGRlbW9uc3RyYXRlIHRoZSBwb3dlciBvZiBDU1MgcHJlcHJvY2Vzc29ycyBhbmQgZXhwbGFpbiB3aHkgaGUgYmVsaWV2ZXMgdGhlc2UgYXJlIGEgZ2FtZSBjaGFuZ2VyIGZvciBmcm9udC1lbmQgZGV2ZWxvcG1lbnQgaW4gdGhpcyBwcmVzZW50YXRpb24gZ2l2ZW4gYXQgdGhlIFNhbiBGcmFuY2lzY28gSFRNTDUgVXNlciBHcm91cC5cXG5cXG5Kb25hdGhhbidzIHRhbGsgd2lsbCBjb3ZlcjpcXG4tIENTUyB3ZWFrbmVzc2VzXFxuLSBQcmVwcm9jZXNzb3IgZmVhdHVyZXNcXG4tIENvbW1vbiBtaXNjb25jZXB0aW9uc1xcbi0gU2FzcywgTGVzcywgb3IgU3R5bHVzP1xcbi0gV29ya2Zsb3cgYW5kIHRlY2huaXF1ZXNcXG4tIFByZXByb2Nlc3NvcnMgKyBPT0NTXFxuXFxuKiogTW9yZSB2aWRlb3Mgb24gb3BlbiBzb3VyY2UgZGV2ZWxvcG1lbnQgYXQgaHR0cDovL21hcmFrYW5hLmNvbS9zL1xcbioqIFNsaWRlcyBhdCBodHRwOi8vbXJrbi5jby91Y3ZwbVwiLFxuICAgICAgICBcInRodW1ibmFpbHNcIjoge1xuICAgICAgICAgIFwiZGVmYXVsdFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvRmxXMnZ2bDB5dm8vZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogMTIwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogOTBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwibWVkaXVtXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9GbFcydnZsMHl2by9tcWRlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDMyMCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDE4MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJoaWdoXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9GbFcydnZsMHl2by9ocWRlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDQ4MCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDM2MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJzdGFuZGFyZFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvRmxXMnZ2bDB5dm8vc2RkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiA2NDAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiA0ODBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwibWF4cmVzXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9GbFcydnZsMHl2by9tYXhyZXNkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiAxMjgwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogNzIwXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcImNoYW5uZWxUaXRsZVwiOiBcIkp1c3R5biBDbGFya1wiLFxuICAgICAgICBcInBsYXlsaXN0SWRcIjogXCJQTFFhSkR3TFh5QnRYcjFGZTJGUnpJZFQzUkZlRzUyUVZGXCIsXG4gICAgICAgIFwicG9zaXRpb25cIjogOCxcbiAgICAgICAgXCJyZXNvdXJjZUlkXCI6IHtcbiAgICAgICAgICBcImtpbmRcIjogXCJ5b3V0dWJlI3ZpZGVvXCIsXG4gICAgICAgICAgXCJ2aWRlb0lkXCI6IFwiRmxXMnZ2bDB5dm9cIlxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgXCJjb250ZW50RGV0YWlsc1wiOiB7XG4gICAgICAgIFwidmlkZW9JZFwiOiBcIkZsVzJ2dmwweXZvXCIsXG4gICAgICAgIFwidmlkZW9QdWJsaXNoZWRBdFwiOiBcIjIwMTItMDYtMTJUMjE6MDM6MzEuMDAwWlwiXG4gICAgICB9XG4gICAgfSxcbiAgICB7XG5cblxuICAgICAgXCJraW5kXCI6IFwieW91dHViZSNwbGF5bGlzdEl0ZW1cIixcbiAgICAgIFwiZXRhZ1wiOiBcIlxcXCJjYnozbElRMk4yNUFmd05yLUJkeFVWeEpfUVkvNlFmNkxhQVNDQlptRkZJQkZvcWZhNldOSFN3XFxcIlwiLFxuICAgICAgXCJpZFwiOiBcIlVFeFJZVXBFZDB4WWVVSjBXSEl4Um1VeVJsSjZTV1JVTTFKR1pVYzFNbEZXUmk1R05qTkRSRFJFTURReE9UaENNRFEyXCIsXG4gICAgICBcInNuaXBwZXRcIjoge1xuICAgICAgICBcInB1Ymxpc2hlZEF0XCI6IFwiMjAxNS0xMi0wM1QwNzoxMjowNy4wMDBaXCIsXG4gICAgICAgIFwiY2hhbm5lbElkXCI6IFwiVUNWTTRDMWZCOVFjd3k3ZE5qYlhlVVZ3XCIsXG4gICAgICAgIFwidGl0bGVcIjogXCJSRVNUIEFQSSBjb25jZXB0cyBhbmQgZXhhbXBsZXNcIixcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIlRoaXMgdmlkZW8gaW50cm9kdWNlcyB0aGUgdmlld2VyIHRvIHNvbWUgQVBJIGNvbmNlcHRzIGJ5IG1ha2luZyBleGFtcGxlIGNhbGxzIHRvIEZhY2Vib29rJ3MgR3JhcGggQVBJLCBHb29nbGUgTWFwcycgQVBJLCBJbnN0YWdyYW0ncyBNZWRpYSBTZWFyY2ggQVBJLCBhbmQgVHdpdHRlcidzIFN0YXR1cyBVcGRhdGUgQVBJLlxcblxcbi8qKioqKioqKioqIFZJREVPIExJTktTICoqKioqKioqKiovXFxuXFxuWW91dHViZSdzIEZhY2Vib29rIFBhZ2UgdmlhIHRoZSBGYWNlYm9vayBHcmFwaCBBUElcXG5odHRwOi8vZ3JhcGguZmFjZWJvb2suY29tL3lvdXR1YmVcXG5cXG5TYW1lIHRoaW5nLCB0aGlzIHRpbWUgd2l0aCBmaWx0ZXJzXFxuaHR0cHM6Ly9ncmFwaC5mYWNlYm9vay5jb20veW91dHViZT9maWVsZHM9aWQsbmFtZSxsaWtlc1xcblxcbkdvb2dsZSBNYXBzIEdlb2NvZGUgQVBJIGNhbGwgZm9yIHRoZSBjaXR5IG9mIENoaWNhZ29cXG5odHRwOi8vbWFwcy5nb29nbGVhcGlzLmNvbS9tYXBzL2FwaS9nZW9jb2RlL2pzb24/YWRkcmVzcz1DaGljYWdvXFxuXFxuQXBpZ2VlIEluc3RhZ3JhbSBBUEkgY29uc29sZVxcbmh0dHBzOi8vYXBpZ2VlLmNvbS9jb25zb2xlL2luc3RhZ3JhbVxcblxcbkhUVFAgUmVxdWVzdCBNZXRob2RzXFxuaHR0cDovL2VuLndpa2lwZWRpYS5vcmcvd2lraS9IeXBlcnRleHRfVHJhbnNmZXJfUHJvdG9jb2wjUmVxdWVzdF9tZXRob2RzXFxuXFxuUG9zdG1hbiBDaHJvbWUgRXh0ZW5zaW9uXFxuaHR0cHM6Ly9jaHJvbWUuZ29vZ2xlLmNvbS93ZWJzdG9yZS9kZXRhaWwvcG9zdG1hbi1yZXN0LWNsaWVudC9mZG1tZ2lsZ25wamlnZG9qb2pwam9vb2lka21jb21jbT9obD1lblxcblxcblR3aXR0ZXIncyBTdGF0dXMgVXBkYXRlIGRvY3VtZW50YXRpb24uXFxuaHR0cHM6Ly9kZXYudHdpdHRlci5jb20vZG9jcy9hcGkvMS4xL3Bvc3Qvc3RhdHVzZXMvdXBkYXRlXCIsXG4gICAgICAgIFwidGh1bWJuYWlsc1wiOiB7XG4gICAgICAgICAgXCJkZWZhdWx0XCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS83WWNXMjVQSG5BQS9kZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiAxMjAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiA5MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJtZWRpdW1cIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpLzdZY1cyNVBIbkFBL21xZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogMzIwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogMTgwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImhpZ2hcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpLzdZY1cyNVBIbkFBL2hxZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogNDgwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogMzYwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInN0YW5kYXJkXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS83WWNXMjVQSG5BQS9zZGRlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDY0MCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDQ4MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJtYXhyZXNcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpLzdZY1cyNVBIbkFBL21heHJlc2RlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDEyODAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiA3MjBcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIFwiY2hhbm5lbFRpdGxlXCI6IFwiSnVzdHluIENsYXJrXCIsXG4gICAgICAgIFwicGxheWxpc3RJZFwiOiBcIlBMUWFKRHdMWHlCdFhyMUZlMkZSeklkVDNSRmVHNTJRVkZcIixcbiAgICAgICAgXCJwb3NpdGlvblwiOiA5LFxuICAgICAgICBcInJlc291cmNlSWRcIjoge1xuICAgICAgICAgIFwia2luZFwiOiBcInlvdXR1YmUjdmlkZW9cIixcbiAgICAgICAgICBcInZpZGVvSWRcIjogXCI3WWNXMjVQSG5BQVwiXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcImNvbnRlbnREZXRhaWxzXCI6IHtcbiAgICAgICAgXCJ2aWRlb0lkXCI6IFwiN1ljVzI1UEhuQUFcIixcbiAgICAgICAgXCJ2aWRlb1B1Ymxpc2hlZEF0XCI6IFwiMjAxNC0wNy0xNFQwODowNjo0OS4wMDBaXCJcbiAgICAgIH1cbiAgICB9LFxuICAgIHtcblxuXG4gICAgICBcImtpbmRcIjogXCJ5b3V0dWJlI3BsYXlsaXN0SXRlbVwiLFxuICAgICAgXCJldGFnXCI6IFwiXFxcImNiejNsSVEyTjI1QWZ3TnItQmR4VVZ4Sl9RWS96UzY4ZVM3SGl0WnRVWHMwLTRxWFRBS3BqYWNcXFwiXCIsXG4gICAgICBcImlkXCI6IFwiVUV4UllVcEVkMHhZZVVKMFdISXhSbVV5UmxKNlNXUlVNMUpHWlVjMU1sRldSaTQwTnpaQ01FUkRNalZFTjBSRlJUaEJcIixcbiAgICAgIFwic25pcHBldFwiOiB7XG4gICAgICAgIFwicHVibGlzaGVkQXRcIjogXCIyMDE1LTEyLTA3VDA2OjE5OjAzLjAwMFpcIixcbiAgICAgICAgXCJjaGFubmVsSWRcIjogXCJVQ1ZNNEMxZkI5UWN3eTdkTmpiWGVVVndcIixcbiAgICAgICAgXCJ0aXRsZVwiOiBcIlZlbG9jaXR5LmpzOiBVSSBQYWNrIE92ZXJ2aWV3XCIsXG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJQbGF5IHdpdGggdGhlIFVJIHBhY2sgYXQgaHR0cDovL1ZlbG9jaXR5SlMub3JnLyN1aVBhY2suXFxuXFxuUmVhZCB0aGUgZnVsbCB0dXRvcmlhbDogaHR0cDovL3d3dy5zbWFzaGluZ21hZ2F6aW5lLmNvbS8yMDE0LzA2LzE4L2Zhc3Rlci11aS1hbmltYXRpb25zLXdpdGgtdmVsb2NpdHktanMvXCIsXG4gICAgICAgIFwidGh1bWJuYWlsc1wiOiB7XG4gICAgICAgICAgXCJkZWZhdWx0XCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9DZHd2UjZhMzlUZy9kZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiAxMjAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiA5MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJtZWRpdW1cIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL0Nkd3ZSNmEzOVRnL21xZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogMzIwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogMTgwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImhpZ2hcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL0Nkd3ZSNmEzOVRnL2hxZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogNDgwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogMzYwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInN0YW5kYXJkXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9DZHd2UjZhMzlUZy9zZGRlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDY0MCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDQ4MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJtYXhyZXNcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL0Nkd3ZSNmEzOVRnL21heHJlc2RlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDEyODAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiA3MjBcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIFwiY2hhbm5lbFRpdGxlXCI6IFwiSnVzdHluIENsYXJrXCIsXG4gICAgICAgIFwicGxheWxpc3RJZFwiOiBcIlBMUWFKRHdMWHlCdFhyMUZlMkZSeklkVDNSRmVHNTJRVkZcIixcbiAgICAgICAgXCJwb3NpdGlvblwiOiAxMCxcbiAgICAgICAgXCJyZXNvdXJjZUlkXCI6IHtcbiAgICAgICAgICBcImtpbmRcIjogXCJ5b3V0dWJlI3ZpZGVvXCIsXG4gICAgICAgICAgXCJ2aWRlb0lkXCI6IFwiQ2R3dlI2YTM5VGdcIlxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgXCJjb250ZW50RGV0YWlsc1wiOiB7XG4gICAgICAgIFwidmlkZW9JZFwiOiBcIkNkd3ZSNmEzOVRnXCIsXG4gICAgICAgIFwidmlkZW9QdWJsaXNoZWRBdFwiOiBcIjIwMTQtMDUtMjhUMTY6MjA6MzkuMDAwWlwiXG4gICAgICB9XG4gICAgfSxcbiAgICB7XG5cblxuICAgICAgXCJraW5kXCI6IFwieW91dHViZSNwbGF5bGlzdEl0ZW1cIixcbiAgICAgIFwiZXRhZ1wiOiBcIlxcXCJjYnozbElRMk4yNUFmd05yLUJkeFVWeEpfUVkvY2RxelhJRjVheUkwUGR2TXRxZEtXYkN2TllrXFxcIlwiLFxuICAgICAgXCJpZFwiOiBcIlVFeFJZVXBFZDB4WWVVSjBXSEl4Um1VeVJsSjZTV1JVTTFKR1pVYzFNbEZXUmk1RU1FRXdSVVk1TTBSRFJUVTNOREpDXCIsXG4gICAgICBcInNuaXBwZXRcIjoge1xuICAgICAgICBcInB1Ymxpc2hlZEF0XCI6IFwiMjAxNi0wMS0wOVQxODo1MDoyNC4wMDBaXCIsXG4gICAgICAgIFwiY2hhbm5lbElkXCI6IFwiVUNWTTRDMWZCOVFjd3k3ZE5qYlhlVVZ3XCIsXG4gICAgICAgIFwidGl0bGVcIjogXCJUb3AgMTAgUHJvZ3JhbW1pbmcgTGFuZ3VhZ2VzIHRvIExlYXJuIGluIDIwMTZcIixcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIlRISVMgVklERU8gSVMgU1BPTlNPUkVEIEJZXFxuXFxuVGhlIFRlY2ggQWNhZGVteSBodHRwOi8vb3cubHkvUkFNTzMwZkU3T2NcXG5cXG5IaXBzdGVyQ29kZSBodHRwczovL3d3dy5oaXBzdGVyY29kZS5jb20vXCIsXG4gICAgICAgIFwidGh1bWJuYWlsc1wiOiB7XG4gICAgICAgICAgXCJkZWZhdWx0XCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9aNTZHTFJYeGg4OC9kZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiAxMjAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiA5MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJtZWRpdW1cIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL1o1NkdMUlh4aDg4L21xZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogMzIwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogMTgwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImhpZ2hcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL1o1NkdMUlh4aDg4L2hxZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogNDgwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogMzYwXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcImNoYW5uZWxUaXRsZVwiOiBcIkp1c3R5biBDbGFya1wiLFxuICAgICAgICBcInBsYXlsaXN0SWRcIjogXCJQTFFhSkR3TFh5QnRYcjFGZTJGUnpJZFQzUkZlRzUyUVZGXCIsXG4gICAgICAgIFwicG9zaXRpb25cIjogMTEsXG4gICAgICAgIFwicmVzb3VyY2VJZFwiOiB7XG4gICAgICAgICAgXCJraW5kXCI6IFwieW91dHViZSN2aWRlb1wiLFxuICAgICAgICAgIFwidmlkZW9JZFwiOiBcIlo1NkdMUlh4aDg4XCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwiY29udGVudERldGFpbHNcIjoge1xuICAgICAgICBcInZpZGVvSWRcIjogXCJaNTZHTFJYeGg4OFwiLFxuICAgICAgICBcInZpZGVvUHVibGlzaGVkQXRcIjogXCIyMDE1LTA4LTA3VDAxOjE4OjM5LjAwMFpcIlxuICAgICAgfVxuICAgIH0sXG4gICAge1xuXG5cbiAgICAgIFwia2luZFwiOiBcInlvdXR1YmUjcGxheWxpc3RJdGVtXCIsXG4gICAgICBcImV0YWdcIjogXCJcXFwiY2J6M2xJUTJOMjVBZndOci1CZHhVVnhKX1FZL2pkQ3k3ampncmJkVjFaU3h5NUV0SUpCTDktMFxcXCJcIixcbiAgICAgIFwiaWRcIjogXCJVRXhSWVVwRWQweFllVUowV0hJeFJtVXlSbEo2U1dSVU0xSkdaVWMxTWxGV1JpNDVPRFJETlRnMFFqQTROa0ZCTmtReVwiLFxuICAgICAgXCJzbmlwcGV0XCI6IHtcbiAgICAgICAgXCJwdWJsaXNoZWRBdFwiOiBcIjIwMTYtMDEtMTVUMDA6MTc6NDYuMDAwWlwiLFxuICAgICAgICBcImNoYW5uZWxJZFwiOiBcIlVDVk00QzFmQjlRY3d5N2ROamJYZVVWd1wiLFxuICAgICAgICBcInRpdGxlXCI6IFwiRWRnZSBDb25mZXJlbmNlIDIwMTUgLSA0IENvbXBvbmVudHMgYW5kIE1vZHVsZXNcIixcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIlwiLFxuICAgICAgICBcInRodW1ibmFpbHNcIjoge1xuICAgICAgICAgIFwiZGVmYXVsdFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvSlFnQmI5V2VZSEkvZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogMTIwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogOTBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwibWVkaXVtXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9KUWdCYjlXZVlISS9tcWRlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDMyMCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDE4MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJoaWdoXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9KUWdCYjlXZVlISS9ocWRlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDQ4MCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDM2MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJzdGFuZGFyZFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvSlFnQmI5V2VZSEkvc2RkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiA2NDAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiA0ODBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwibWF4cmVzXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9KUWdCYjlXZVlISS9tYXhyZXNkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiAxMjgwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogNzIwXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcImNoYW5uZWxUaXRsZVwiOiBcIkp1c3R5biBDbGFya1wiLFxuICAgICAgICBcInBsYXlsaXN0SWRcIjogXCJQTFFhSkR3TFh5QnRYcjFGZTJGUnpJZFQzUkZlRzUyUVZGXCIsXG4gICAgICAgIFwicG9zaXRpb25cIjogMTIsXG4gICAgICAgIFwicmVzb3VyY2VJZFwiOiB7XG4gICAgICAgICAgXCJraW5kXCI6IFwieW91dHViZSN2aWRlb1wiLFxuICAgICAgICAgIFwidmlkZW9JZFwiOiBcIkpRZ0JiOVdlWUhJXCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwiY29udGVudERldGFpbHNcIjoge1xuICAgICAgICBcInZpZGVvSWRcIjogXCJKUWdCYjlXZVlISVwiLFxuICAgICAgICBcInZpZGVvUHVibGlzaGVkQXRcIjogXCIyMDE1LTA3LTEzVDExOjA2OjA1LjAwMFpcIlxuICAgICAgfVxuICAgIH0sXG4gICAge1xuXG5cbiAgICAgIFwia2luZFwiOiBcInlvdXR1YmUjcGxheWxpc3RJdGVtXCIsXG4gICAgICBcImV0YWdcIjogXCJcXFwiY2J6M2xJUTJOMjVBZndOci1CZHhVVnhKX1FZLy1OMVBWd3R6X25RaVBkNFRVVVA2LVgzcEtOUVxcXCJcIixcbiAgICAgIFwiaWRcIjogXCJVRXhSWVVwRWQweFllVUowV0hJeFJtVXlSbEo2U1dSVU0xSkdaVWMxTWxGV1JpNHpNRGc1TWtRNU1FVkRNRU0xTlRnMlwiLFxuICAgICAgXCJzbmlwcGV0XCI6IHtcbiAgICAgICAgXCJwdWJsaXNoZWRBdFwiOiBcIjIwMTYtMDEtMjRUMDk6NTU6MzcuMDAwWlwiLFxuICAgICAgICBcImNoYW5uZWxJZFwiOiBcIlVDVk00QzFmQjlRY3d5N2ROamJYZVVWd1wiLFxuICAgICAgICBcInRpdGxlXCI6IFwiW0VwLiAxXSBBbmd1bGFyIHRvIFJlYWN0XCIsXG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJcIixcbiAgICAgICAgXCJ0aHVtYm5haWxzXCI6IHtcbiAgICAgICAgICBcImRlZmF1bHRcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpLzBUc2dlYmlkRmZvL2RlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDEyMCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDkwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcIm1lZGl1bVwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvMFRzZ2ViaWRGZm8vbXFkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiAzMjAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiAxODBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiaGlnaFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvMFRzZ2ViaWRGZm8vaHFkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiA0ODAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiAzNjBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwic3RhbmRhcmRcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpLzBUc2dlYmlkRmZvL3NkZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogNjQwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogNDgwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcIm1heHJlc1wiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvMFRzZ2ViaWRGZm8vbWF4cmVzZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogMTI4MCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDcyMFxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJjaGFubmVsVGl0bGVcIjogXCJKdXN0eW4gQ2xhcmtcIixcbiAgICAgICAgXCJwbGF5bGlzdElkXCI6IFwiUExRYUpEd0xYeUJ0WHIxRmUyRlJ6SWRUM1JGZUc1MlFWRlwiLFxuICAgICAgICBcInBvc2l0aW9uXCI6IDEzLFxuICAgICAgICBcInJlc291cmNlSWRcIjoge1xuICAgICAgICAgIFwia2luZFwiOiBcInlvdXR1YmUjdmlkZW9cIixcbiAgICAgICAgICBcInZpZGVvSWRcIjogXCIwVHNnZWJpZEZmb1wiXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcImNvbnRlbnREZXRhaWxzXCI6IHtcbiAgICAgICAgXCJ2aWRlb0lkXCI6IFwiMFRzZ2ViaWRGZm9cIixcbiAgICAgICAgXCJ2aWRlb1B1Ymxpc2hlZEF0XCI6IFwiMjAxNS0xMi0yOFQyMjowNzo0OC4wMDBaXCJcbiAgICAgIH1cbiAgICB9LFxuICAgIHtcblxuXG4gICAgICBcImtpbmRcIjogXCJ5b3V0dWJlI3BsYXlsaXN0SXRlbVwiLFxuICAgICAgXCJldGFnXCI6IFwiXFxcImNiejNsSVEyTjI1QWZ3TnItQmR4VVZ4Sl9RWS94TGljck9tdmJJbjJiTDhaOFMxejdGaFZuQTRcXFwiXCIsXG4gICAgICBcImlkXCI6IFwiVUV4UllVcEVkMHhZZVVKMFdISXhSbVV5UmxKNlNXUlVNMUpHWlVjMU1sRldSaTQxTXprMlFUQXhNVGt6TkRrNE1EaEZcIixcbiAgICAgIFwic25pcHBldFwiOiB7XG4gICAgICAgIFwicHVibGlzaGVkQXRcIjogXCIyMDE2LTAxLTI5VDA4OjI4OjU3LjAwMFpcIixcbiAgICAgICAgXCJjaGFubmVsSWRcIjogXCJVQ1ZNNEMxZkI5UWN3eTdkTmpiWGVVVndcIixcbiAgICAgICAgXCJ0aXRsZVwiOiBcIlJlYWN0IGFuZCBSZWR1eFwiLFxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiKiogSSBoYXZlIGNyZWF0ZWQgYSBiZXR0ZXIsIG1vcmUgY29tcHJlaGVuc2l2ZSB2aWRlbyBzZXJpZXMgYWJvdXQgdXNpbmcgUmVhY3QsIFJlZHV4IGFuZCBXZWJwYWNrIHRvIGJ1aWxkIHdlYiBhcHBzLiBDaGVjayBpdCBvdXQgYXQgaHR0cDovL3d3dy55b3V0dWJlLmNvbS9wbGF5bGlzdD9saXN0PVBMUURueFhxVjIxM0pKRnREYUcwYUU5dnF2cDZXbTduQmcgKipcXG5cXG5BIHRhbGsgYW5kIGxpdmUgZGVtbyBhYm91dCBob3cgKGFuZCB3aHkpIHRvIHVzZSBSZWFjdCBhbmQgUmVkdXguIFByZXNlbnRhdGlvbiByZWNvcmRlZCBhdCBIYWNrIFJlYWN0b3Igb24gTm92LiAzMCwgMjAxNS4gR2l0aHViIHJlcG8gdG8gZm9sbG93IGFsb25nIGNhbiBiZSBmb3VuZCBhdCBodHRwczovL2dpdGh1Yi5jb20va3dlaWJlcnRoL3JlYWN0LXJlZHV4LXRvZG8tZGVtby4gVGhlIG1hc3RlciBicmFuY2ggaXMgdGhlIGZpbmlzaGVkIHByb2R1Y3QgYWZ0ZXIgdGhlIGRlbW8gaXMgY29tcGxldGVkLiBUaGUgcmVhY3QtZGVtby1zdGFydCBicmFuY2ggaXMgdGhlIHN0YXJ0aW5nIHBvaW50IGZvciB0aGUgZmlyc3QgZGVtbyBhbmQgdGhlIHJlZHV4LWRlbW8tc3RhcnQgYnJhbmNoIGlzIHRoZSBzdGFydGluZyBwb2ludCBmb3IgdGhlIHNlY29uZCBkZW1vLlwiLFxuICAgICAgICBcInRodW1ibmFpbHNcIjoge1xuICAgICAgICAgIFwiZGVmYXVsdFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvN2VMcUtncDBlZVkvZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogMTIwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogOTBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwibWVkaXVtXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS83ZUxxS2dwMGVlWS9tcWRlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDMyMCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDE4MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJoaWdoXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS83ZUxxS2dwMGVlWS9ocWRlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDQ4MCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDM2MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJzdGFuZGFyZFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvN2VMcUtncDBlZVkvc2RkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiA2NDAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiA0ODBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwibWF4cmVzXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS83ZUxxS2dwMGVlWS9tYXhyZXNkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiAxMjgwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogNzIwXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcImNoYW5uZWxUaXRsZVwiOiBcIkp1c3R5biBDbGFya1wiLFxuICAgICAgICBcInBsYXlsaXN0SWRcIjogXCJQTFFhSkR3TFh5QnRYcjFGZTJGUnpJZFQzUkZlRzUyUVZGXCIsXG4gICAgICAgIFwicG9zaXRpb25cIjogMTQsXG4gICAgICAgIFwicmVzb3VyY2VJZFwiOiB7XG4gICAgICAgICAgXCJraW5kXCI6IFwieW91dHViZSN2aWRlb1wiLFxuICAgICAgICAgIFwidmlkZW9JZFwiOiBcIjdlTHFLZ3AwZWVZXCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwiY29udGVudERldGFpbHNcIjoge1xuICAgICAgICBcInZpZGVvSWRcIjogXCI3ZUxxS2dwMGVlWVwiLFxuICAgICAgICBcInZpZGVvUHVibGlzaGVkQXRcIjogXCIyMDE1LTEyLTEyVDIyOjM3OjE2LjAwMFpcIlxuICAgICAgfVxuICAgIH0sXG4gICAge1xuXG5cbiAgICAgIFwia2luZFwiOiBcInlvdXR1YmUjcGxheWxpc3RJdGVtXCIsXG4gICAgICBcImV0YWdcIjogXCJcXFwiY2J6M2xJUTJOMjVBZndOci1CZHhVVnhKX1FZL0hGVmhBajE4ZHQtMHJ2Y0s2WnFYMVBjcjNIVVxcXCJcIixcbiAgICAgIFwiaWRcIjogXCJVRXhSWVVwRWQweFllVUowV0hJeFJtVXlSbEo2U1dSVU0xSkdaVWMxTWxGV1JpNUVRVUUxTlRGRFJqY3dNRGcwTkVNelwiLFxuICAgICAgXCJzbmlwcGV0XCI6IHtcbiAgICAgICAgXCJwdWJsaXNoZWRBdFwiOiBcIjIwMTYtMDEtMjlUMDg6Mjk6MDcuMDAwWlwiLFxuICAgICAgICBcImNoYW5uZWxJZFwiOiBcIlVDVk00QzFmQjlRY3d5N2ROamJYZVVWd1wiLFxuICAgICAgICBcInRpdGxlXCI6IFwiUmVhY3QgRm9yIEV2ZXJ5b25lICM4IC0gQmFzaWMgV2VicGFjayBDb25maWd1cmF0aW9uICYgU2VydmVyXCIsXG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJJbiB0aGlzIFJlYWN0IHZpZGVvIHR1dG9yaWFsLCB3ZSBmaW5pc2ggb3VyIHNldHVwIGJ5IHdyaXRpbmcgb3VyIHdlYnBhY2sgY29uZmlnIGZpbGUuIFN1YnNjcmliZSBmb3IgbW9yZSBmcmVlIHR1dG9yaWFscyBodHRwczovL2dvby5nbC82bGpvRmMsIG1vcmUgUmVhY3QgVHV0b3JpYWxzOiBodHRwczovL2dvby5nbC90UlVBQjlcXG5cXG5TdXBwb3J0IEZyZWUgVHV0b3JpYWxzXFxuaHR0cHM6Ly93d3cubGV2ZWx1cHR1dG9yaWFscy5jb20vc3RvcmUvXFxuXFxuVGhlIGJlc3Qgc2hhcmVkIHdlYiBob3N0aW5nXFxuaHR0cDovL3d3dy5ibHVlaG9zdC5jb20vdHJhY2svbGV2ZWx1cHR1dG9yaWFscy9cXG5cXG5TdWJzY3JpYmUgdG8gTGV2ZWwgVXAgUHJvIGZvciBleHRyYSBmZWF0dXJlcyFcXG5odHRwczovL3d3dy5sZXZlbHVwdHV0b3JpYWxzLmNvbS9zdG9yZS9wcm9kdWN0cy9wcm9cXG5cXG5TdWJzY3JpYmUgdG8gdGhlIExldmVsIFVwIE5ld3NsZXR0ZXJcXG5odHRwOi8vZWVwdXJsLmNvbS9BV2pHelxcblxcblRvIFN1cHBvcnQgTGV2ZWwgVXAgVHV0czpcXG5odHRwOi8vbGV2ZWx1cHR1dHMuY29tL2RvbmF0aW9uc1xcblxcblNpbXBsZSBjbG91ZCBob3N0aW5nLCBidWlsdCBmb3IgZGV2ZWxvcGVycy46XFxuaHR0cHM6Ly93d3cuZGlnaXRhbG9jZWFuLmNvbS8/cmVmY29kZT02NzM1NzE3NGIwOWVcXG5cXG5MZWFybiBSZWFjdCBqcyBmcm9tIHNjcmF0Y2ggaW4gdGhlIG5ldyB2aWRlbyB0dXRvcmlhbCBzZXJpZXMgUmVhY3QgRm9yIEJlZ2lubmVycy4gV2UnbGwgYmUgaW50cm9kdWNpbmcgY29yZSBjb25jZXB0cyBhbmQgZXhwbG9yaW5nIHJlYWwgd29ybGQgYXBwbGljYXRpb24gdGVjaG5pcXVlcyBhcyB3ZSBnby4gTmV3IHZpZGVvcyBldmVyeSB3ZWVrIVwiLFxuICAgICAgICBcInRodW1ibmFpbHNcIjoge1xuICAgICAgICAgIFwiZGVmYXVsdFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvQXRLaDZ0cDQ0Q2svZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogMTIwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogOTBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwibWVkaXVtXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9BdEtoNnRwNDRDay9tcWRlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDMyMCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDE4MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJoaWdoXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9BdEtoNnRwNDRDay9ocWRlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDQ4MCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDM2MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJzdGFuZGFyZFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvQXRLaDZ0cDQ0Q2svc2RkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiA2NDAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiA0ODBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwibWF4cmVzXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9BdEtoNnRwNDRDay9tYXhyZXNkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiAxMjgwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogNzIwXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcImNoYW5uZWxUaXRsZVwiOiBcIkp1c3R5biBDbGFya1wiLFxuICAgICAgICBcInBsYXlsaXN0SWRcIjogXCJQTFFhSkR3TFh5QnRYcjFGZTJGUnpJZFQzUkZlRzUyUVZGXCIsXG4gICAgICAgIFwicG9zaXRpb25cIjogMTUsXG4gICAgICAgIFwicmVzb3VyY2VJZFwiOiB7XG4gICAgICAgICAgXCJraW5kXCI6IFwieW91dHViZSN2aWRlb1wiLFxuICAgICAgICAgIFwidmlkZW9JZFwiOiBcIkF0S2g2dHA0NENrXCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwiY29udGVudERldGFpbHNcIjoge1xuICAgICAgICBcInZpZGVvSWRcIjogXCJBdEtoNnRwNDRDa1wiLFxuICAgICAgICBcInZpZGVvUHVibGlzaGVkQXRcIjogXCIyMDE2LTAxLTE1VDAwOjI0OjI5LjAwMFpcIlxuICAgICAgfVxuICAgIH0sXG4gICAge1xuXG5cbiAgICAgIFwia2luZFwiOiBcInlvdXR1YmUjcGxheWxpc3RJdGVtXCIsXG4gICAgICBcImV0YWdcIjogXCJcXFwiY2J6M2xJUTJOMjVBZndOci1CZHhVVnhKX1FZLzVfYnVyZ1NnU0JKVWpvcDlJVmg5OXFHbGJUTVxcXCJcIixcbiAgICAgIFwiaWRcIjogXCJVRXhSWVVwRWQweFllVUowV0hJeFJtVXlSbEo2U1dSVU0xSkdaVWMxTWxGV1JpNDFRVFkxUTBVeE1UVkNPRGN6TlRoRVwiLFxuICAgICAgXCJzbmlwcGV0XCI6IHtcbiAgICAgICAgXCJwdWJsaXNoZWRBdFwiOiBcIjIwMTYtMTItMDdUMDQ6MjE6MjQuMDAwWlwiLFxuICAgICAgICBcImNoYW5uZWxJZFwiOiBcIlVDVk00QzFmQjlRY3d5N2ROamJYZVVWd1wiLFxuICAgICAgICBcInRpdGxlXCI6IFwiTGVhcm4gUmVhY3Qgd2l0aCBwcm9ncmVzc2l2ZSBib2lsZXJwbGF0ZXNcIixcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkluIHRoaXMgdmlkZW8gSSBpbnRyb2R1Y2UgdGhlIGNvbmNlcHQgb2YgcHJvZ3Jlc3NpdmUgYm9pbGVycGxhdGUgYW5kIHNob3cgeW91IGhvdyB0byBsZWFybiBSZWFjdCB3aXRoIHByb2dyZXNzaXZlIGJvaWxlcnBsYXRlcy5cXG5cXG5BUmMgKEF0b21pYyBSZWFjdCksIHRoZSBwcm9ncmVzc2l2ZSBib2lsZXJwbGF0ZTogaHR0cHM6Ly9naXRodWIuY29tL2RpZWdvaGF6L2FyY1xcblxcbnJlYWN0LWNyZWF0ZS1hcHA6IGh0dHBzOi8vZ2l0aHViLmNvbS9mYWNlYm9va2luY3ViYXRvci9jcmVhdGUtcmVhY3QtYXBwXFxuXFxucmVhY3QtYm9pbGVycGxhdGU6IGh0dHBzOi8vZ2l0aHViLmNvbS9teHN0YnIvcmVhY3QtYm9pbGVycGxhdGVcXG5cXG5yZWFjdC1yZWR1eC11bml2ZXJzYWwtaG90LWV4YW1wbGU6IGh0dHBzOi8vZ2l0aHViLmNvbS9lcmlrcmFzL3JlYWN0LXJlZHV4LXVuaXZlcnNhbC1ob3QtZXhhbXBsZVwiLFxuICAgICAgICBcInRodW1ibmFpbHNcIjoge1xuICAgICAgICAgIFwiZGVmYXVsdFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvVmNIYnFwZFo5bU0vZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogMTIwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogOTBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwibWVkaXVtXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9WY0hicXBkWjltTS9tcWRlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDMyMCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDE4MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJoaWdoXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9WY0hicXBkWjltTS9ocWRlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDQ4MCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDM2MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJzdGFuZGFyZFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvVmNIYnFwZFo5bU0vc2RkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiA2NDAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiA0ODBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwibWF4cmVzXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9WY0hicXBkWjltTS9tYXhyZXNkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiAxMjgwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogNzIwXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcImNoYW5uZWxUaXRsZVwiOiBcIkp1c3R5biBDbGFya1wiLFxuICAgICAgICBcInBsYXlsaXN0SWRcIjogXCJQTFFhSkR3TFh5QnRYcjFGZTJGUnpJZFQzUkZlRzUyUVZGXCIsXG4gICAgICAgIFwicG9zaXRpb25cIjogMTYsXG4gICAgICAgIFwicmVzb3VyY2VJZFwiOiB7XG4gICAgICAgICAgXCJraW5kXCI6IFwieW91dHViZSN2aWRlb1wiLFxuICAgICAgICAgIFwidmlkZW9JZFwiOiBcIlZjSGJxcGRaOW1NXCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwiY29udGVudERldGFpbHNcIjoge1xuICAgICAgICBcInZpZGVvSWRcIjogXCJWY0hicXBkWjltTVwiLFxuICAgICAgICBcInZpZGVvUHVibGlzaGVkQXRcIjogXCIyMDE2LTExLTE3VDIxOjM0OjQ1LjAwMFpcIlxuICAgICAgfVxuICAgIH0sXG4gICAge1xuXG5cbiAgICAgIFwia2luZFwiOiBcInlvdXR1YmUjcGxheWxpc3RJdGVtXCIsXG4gICAgICBcImV0YWdcIjogXCJcXFwiY2J6M2xJUTJOMjVBZndOci1CZHhVVnhKX1FZL0pnYVpZSEJnZW1ibDIwRVVEU0t3bm9ob290TVxcXCJcIixcbiAgICAgIFwiaWRcIjogXCJVRXhSWVVwRWQweFllVUowV0hJeFJtVXlSbEo2U1dSVU0xSkdaVWMxTWxGV1JpNHlNVVF5UVRRek1qUkROek15UVRNeVwiLFxuICAgICAgXCJzbmlwcGV0XCI6IHtcbiAgICAgICAgXCJwdWJsaXNoZWRBdFwiOiBcIjIwMTYtMTItMDdUMDQ6MjY6MjAuMDAwWlwiLFxuICAgICAgICBcImNoYW5uZWxJZFwiOiBcIlVDVk00QzFmQjlRY3d5N2ROamJYZVVWd1wiLFxuICAgICAgICBcInRpdGxlXCI6IFwiQ3JlYXRlIGFuZCBkZXBsb3kgYSBSRVNUZnVsIEFQSSBpbiAxMCBtaW51dGVzXCIsXG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJDcmVhdGUgYSBSRVNUIEFQSSB3aXRoIE5vZGVKUywgTW9uZ29EQiBhbmQgRXhwcmVzcy5cXG5HaXRIdWIgcmVwbzogaHR0cHM6Ly9naXRodWIuY29tL2RpZWdvaGF6L2dlbmVyYXRvci1yZXN0XFxuXFxuSW4gdGhpcyB0dXRvcmlhbCBJIHNob3cgeW91IGhvdyB0byBjcmVhdGUgYSBSRVNUIEFQSSB3aXRoIE5vZGVKUywgTW9uZ29EQiAoTW9uZ29vc2UpLCBFeHByZXNzLCBFUzYsIGludGVncmF0aW9uIGFuZCB1bml0IHRlc3RzLCBkb2N1bWVudGF0aW9uIChhcGlkb2MpLCBlcnJvciBoYW5kbGluZywgSlNPTiByZXNwb25zZXMgYW5kIG11Y2ggbW9yZSB1c2luZyBZZW9tYW4gYW5kIGRlcGxveSBpdCB0byBIZXJva3UuXFxuXFxuLS0tLS0tLS0tLS0tLS0gTElOS1MgLS0tLS0tLS0tLS0tLVxcblxcbk5vZGVKUzogaHR0cHM6Ly9ub2RlanMub3JnXFxuTW9uZ29EQjogaHR0cHM6Ly9tb25nb2RiLmNvbVxcblBvc3RtYW46IGh0dHBzOi8vd3d3LmdldHBvc3RtYW4uY29tXFxuXFxuLS0tLS0tLS0tLS0tIFJFTEFURUQgLS0tLS0tLS0tLVxcblxcbldoYXQgaXMgTm9kZS5qcyBFeGFjdGx5P1xcblVzaW5nIE5vZGUuanMgZm9yIEV2ZXJ5dGhpbmdcXG5SRVNUIEFQSSBjb25jZXB0cyBhbmQgZXhhbXBsZXNcXG5JbnRybyB0byBSRVNUXFxuTm9kZS5qcyBUdXRvcmlhbHM6IEZyb20gWmVybyB0byBIZXJvIHdpdGggTm9kZWpzXFxuUkVTVCtKU09OIEFQSSBEZXNpZ24gLSBCZXN0IFByYWN0aWNlcyBmb3IgRGV2ZWxvcGVyc1xcblVzaW5nIFJFU1QgQVBJcyBpbiBhIHdlYiBhcHBsaWNhdGlvblxcblJFU1QtRnVsIEFQSSBEZXNpZ25cXG5DcmVhdGUgYSBXZWJzaXRlIG9yIEJsb2dcXG5Ob2RlLmpzIFR1dG9yaWFscyBmb3IgQmVnaW5uZXJzXFxuTm9kZUpTIE1vbmdvREIgVHV0b3JpYWxcXG5Ob2RlLmpzIEZ1bmRhbWVudGFsc1xcbkJ1aWxkIGEgUkVTVGZ1bCBBUEkgaW4gNSBNaW51dGVzIHdpdGggTm9kZUpTXFxuQnVpbGQgYSBUd2l0Y2gudHYgQ2hhdCBCb3QgaW4gMTAgTWludXRlcyB3aXRoIE5vZGUuanNcXG5Ob2RlLmpzIExvZ2luIFN5c3RlbSBXaXRoIFBhc3Nwb3J0XFxuQnVpbGRpbmcgYSBNaWNyb3NlcnZpY2UgdXNpbmcgTm9kZS5qcyAmIERvY2tlclxcblRoZSBBQkNzIG9mIEFQSXMgd2l0aCBOb2RlLmpzXFxuRXZlcnl0aGluZyBZb3UgRXZlciBXYW50ZWQgVG8gS25vdyBBYm91dCBBdXRoZW50aWNhdGlvbiBpbiBOb2RlLmpzXFxuQ8OzbW8gaW1wbGVtZW50YXIgdW4gQVBJIFJFU1QgZGVzZGUgY2VybyBjb24gTm9kZS5qcyB5IE1vbmdvREJcXG5PdmVydmlldyBvZiBOb2RlLmpzIE1pY3Jvc2VydmljZXMgQXJjaGl0ZWN0dXJlc1xcbk5vZGUuanMgRXhwbGFpbmVkXFxuSmF2YVNjcmlwdCB3aXRoIFJlYWN0SlMgYW5kIE5vZGVqc1xcbk5vZGVKUyAvIEV4cHJlc3MgLyBNb25nb0RCIC0gQnVpbGQgYSBTaG9wcGluZyBDYXJ0XFxuRGVwbG95aW5nIE5vZGUuanMgQXBwIHRvIEhlcm9rdVxcblRlc3QgZHJpdmVuIERldmVsb3BtZW50IG9mIFdlYiBBcHBzIGluIE5vZGUuSnNcXG5Ib3cgdG8gc2VuZCBzZXJ2ZXIgZW1haWwgd2l0aCBOb2RlLmpzXFxuRGVwbG95aW5nIG5vZGUuanMgYXBwbGljYXRpb25zXFxuUkVTVGZ1bCBBUEkgRnJvbSBTY3JhdGNoIFVzaW5nIE5vZGUsIEV4cHJlc3MgYW5kIE1vbmdvREJcXG5JbnRybyB0byBSRVNUIChha2EuIFdoYXQgSXMgUkVTVCBBbnl3YXk/KVwiLFxuICAgICAgICBcInRodW1ibmFpbHNcIjoge1xuICAgICAgICAgIFwiZGVmYXVsdFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvNngtaWp5Ry1hY2svZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogMTIwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogOTBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwibWVkaXVtXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS82eC1panlHLWFjay9tcWRlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDMyMCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDE4MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJoaWdoXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS82eC1panlHLWFjay9ocWRlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDQ4MCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDM2MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJzdGFuZGFyZFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvNngtaWp5Ry1hY2svc2RkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiA2NDAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiA0ODBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwibWF4cmVzXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS82eC1panlHLWFjay9tYXhyZXNkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiAxMjgwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogNzIwXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcImNoYW5uZWxUaXRsZVwiOiBcIkp1c3R5biBDbGFya1wiLFxuICAgICAgICBcInBsYXlsaXN0SWRcIjogXCJQTFFhSkR3TFh5QnRYcjFGZTJGUnpJZFQzUkZlRzUyUVZGXCIsXG4gICAgICAgIFwicG9zaXRpb25cIjogMTcsXG4gICAgICAgIFwicmVzb3VyY2VJZFwiOiB7XG4gICAgICAgICAgXCJraW5kXCI6IFwieW91dHViZSN2aWRlb1wiLFxuICAgICAgICAgIFwidmlkZW9JZFwiOiBcIjZ4LWlqeUctYWNrXCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwiY29udGVudERldGFpbHNcIjoge1xuICAgICAgICBcInZpZGVvSWRcIjogXCI2eC1panlHLWFja1wiLFxuICAgICAgICBcInZpZGVvUHVibGlzaGVkQXRcIjogXCIyMDE2LTA5LTE0VDAyOjM4OjU0LjAwMFpcIlxuICAgICAgfVxuICAgIH0sXG4gICAge1xuXG5cbiAgICAgIFwia2luZFwiOiBcInlvdXR1YmUjcGxheWxpc3RJdGVtXCIsXG4gICAgICBcImV0YWdcIjogXCJcXFwiY2J6M2xJUTJOMjVBZndOci1CZHhVVnhKX1FZL2NSVXBCMjlmMUdxalVsVE1KTnA0V2l3aDZVSVxcXCJcIixcbiAgICAgIFwiaWRcIjogXCJVRXhSWVVwRWQweFllVUowV0hJeFJtVXlSbEo2U1dSVU0xSkdaVWMxTWxGV1JpNDVSVGd4TkRSQk16VXdSalEwTURoQ1wiLFxuICAgICAgXCJzbmlwcGV0XCI6IHtcbiAgICAgICAgXCJwdWJsaXNoZWRBdFwiOiBcIjIwMTctMDEtMThUMTc6Mjg6MDAuMDAwWlwiLFxuICAgICAgICBcImNoYW5uZWxJZFwiOiBcIlVDVk00QzFmQjlRY3d5N2ROamJYZVVWd1wiLFxuICAgICAgICBcInRpdGxlXCI6IFwiVG9kZCBNb3R0byAtIERlbXlzdGlmeWluZyBKYXZhU2NyaXB0OiB5b3UgZG9uJ3QgbmVlZCBqUXVlcnkgKEZPV0QgMjAxNClcIixcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcImh0dHBzOi8vc3BlYWtlcmRlY2suY29tL3RvZGRtb3R0by9kZW15c3RpZnlpbmctamF2YXNjcmlwdC15b3UtZG9udC1uZWVkLWpxdWVyeVwiLFxuICAgICAgICBcInRodW1ibmFpbHNcIjoge1xuICAgICAgICAgIFwiZGVmYXVsdFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkva2V5Q2cyNTNTLW8vZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogMTIwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogOTBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwibWVkaXVtXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9rZXlDZzI1M1Mtby9tcWRlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDMyMCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDE4MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJoaWdoXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9rZXlDZzI1M1Mtby9ocWRlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDQ4MCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDM2MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJzdGFuZGFyZFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkva2V5Q2cyNTNTLW8vc2RkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiA2NDAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiA0ODBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwibWF4cmVzXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9rZXlDZzI1M1Mtby9tYXhyZXNkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiAxMjgwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogNzIwXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcImNoYW5uZWxUaXRsZVwiOiBcIkp1c3R5biBDbGFya1wiLFxuICAgICAgICBcInBsYXlsaXN0SWRcIjogXCJQTFFhSkR3TFh5QnRYcjFGZTJGUnpJZFQzUkZlRzUyUVZGXCIsXG4gICAgICAgIFwicG9zaXRpb25cIjogMTgsXG4gICAgICAgIFwicmVzb3VyY2VJZFwiOiB7XG4gICAgICAgICAgXCJraW5kXCI6IFwieW91dHViZSN2aWRlb1wiLFxuICAgICAgICAgIFwidmlkZW9JZFwiOiBcImtleUNnMjUzUy1vXCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwiY29udGVudERldGFpbHNcIjoge1xuICAgICAgICBcInZpZGVvSWRcIjogXCJrZXlDZzI1M1Mtb1wiLFxuICAgICAgICBcInZpZGVvUHVibGlzaGVkQXRcIjogXCIyMDE0LTA2LTAzVDA5OjU1OjQwLjAwMFpcIlxuICAgICAgfVxuICAgIH0sXG4gICAge1xuXG5cbiAgICAgIFwia2luZFwiOiBcInlvdXR1YmUjcGxheWxpc3RJdGVtXCIsXG4gICAgICBcImV0YWdcIjogXCJcXFwiY2J6M2xJUTJOMjVBZndOci1CZHhVVnhKX1FZL3IxTzBSQ2IyN08zWksta2tEMmNVWWJIaGxCMFxcXCJcIixcbiAgICAgIFwiaWRcIjogXCJVRXhSWVVwRWQweFllVUowV0hJeFJtVXlSbEo2U1dSVU0xSkdaVWMxTWxGV1JpNUVORFU0UTBNNFJERXhOek0xTWpjeVwiLFxuICAgICAgXCJzbmlwcGV0XCI6IHtcbiAgICAgICAgXCJwdWJsaXNoZWRBdFwiOiBcIjIwMTctMDMtMDNUMTY6MDM6MTQuMDAwWlwiLFxuICAgICAgICBcImNoYW5uZWxJZFwiOiBcIlVDVk00QzFmQjlRY3d5N2ROamJYZVVWd1wiLFxuICAgICAgICBcInRpdGxlXCI6IFwiSmFjayBMZW5veDogQnVpbGRpbmcgVGhlbWVzIHdpdGggdGhlIFdQIFJFU1QgQVBJXCIsXG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJXaXRoIHRoZSBSRVNUIEFQSSBzaG9ydGx5IGR1ZSB0byBiZSBtZXJnZWQgaW50byBXb3JkUHJlc3MgY29yZSwgaXTigJlzIGFib3V0IHRpbWUgZGV2ZWxvcGVycyBzdGFydGVkIHRoaW5raW5nIGFib3V0IGJ1aWxkaW5nIHRoZW1lcyB0aGF0IHVzZSBpdC4gVGhlIFJFU1QgQVBJIGFsbG93cyBkZXZlbG9wZXJzIHRvIGNyZWF0ZSBtdWNoIG1vcmUgZW5nYWdpbmcgdXNlciBleHBlcmllbmNlcy4gVGhpcyBpcyBhIHRhbGsgdGhhdCBjb3ZlcnMgdGhlIGNoYWxsZW5nZXMgb25lIGZhY2VzIHdoZW4gd29ya2luZyB3aXRoIHRoZSBSRVNUIEFQSSwgaG93IHRvIGV4dGVuZCB0aGUgUkVTVCBBUEkgaXRzZWxmIGZyb20gd2l0aGluIHlvdXIgdGhlbWUsIGFuZCBzdWdnZXN0ZWQgd2F5cyB0aGF0IHRoZW1lcyBjYW4gYmUgYnVpbHQgdG8gdXNlIGl0LlxcblxcblNsaWRlczogaHR0cHM6Ly9zcGVha2VyZGVjay5jb20vamFja2xlbm94L2J1aWxkaW5nLXRoZW1lcy13aXRoLXRoZS13cC1yZXN0LWFwaVwiLFxuICAgICAgICBcInRodW1ibmFpbHNcIjoge1xuICAgICAgICAgIFwiZGVmYXVsdFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvMXN5a1ZqSlJJZ00vZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogMTIwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogOTBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwibWVkaXVtXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS8xc3lrVmpKUklnTS9tcWRlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDMyMCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDE4MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJoaWdoXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS8xc3lrVmpKUklnTS9ocWRlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDQ4MCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDM2MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJzdGFuZGFyZFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvMXN5a1ZqSlJJZ00vc2RkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiA2NDAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiA0ODBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwibWF4cmVzXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS8xc3lrVmpKUklnTS9tYXhyZXNkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiAxMjgwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogNzIwXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcImNoYW5uZWxUaXRsZVwiOiBcIkp1c3R5biBDbGFya1wiLFxuICAgICAgICBcInBsYXlsaXN0SWRcIjogXCJQTFFhSkR3TFh5QnRYcjFGZTJGUnpJZFQzUkZlRzUyUVZGXCIsXG4gICAgICAgIFwicG9zaXRpb25cIjogMTksXG4gICAgICAgIFwicmVzb3VyY2VJZFwiOiB7XG4gICAgICAgICAgXCJraW5kXCI6IFwieW91dHViZSN2aWRlb1wiLFxuICAgICAgICAgIFwidmlkZW9JZFwiOiBcIjFzeWtWakpSSWdNXCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwiY29udGVudERldGFpbHNcIjoge1xuICAgICAgICBcInZpZGVvSWRcIjogXCIxc3lrVmpKUklnTVwiLFxuICAgICAgICBcInZpZGVvUHVibGlzaGVkQXRcIjogXCIyMDE2LTA2LTI4VDE3OjUzOjI1LjAwMFpcIlxuICAgICAgfVxuICAgIH0sXG4gICAge1xuXG5cbiAgICAgIFwia2luZFwiOiBcInlvdXR1YmUjcGxheWxpc3RJdGVtXCIsXG4gICAgICBcImV0YWdcIjogXCJcXFwiY2J6M2xJUTJOMjVBZndOci1CZHhVVnhKX1FZL0hINFZjQm0wYmg2M2hJTVpIcnJjNUlOYkFaZ1xcXCJcIixcbiAgICAgIFwiaWRcIjogXCJVRXhSWVVwRWQweFllVUowV0hJeFJtVXlSbEo2U1dSVU0xSkdaVWMxTWxGV1JpNHlNRGhCTWtOQk5qUkRNalF4UVRnMVwiLFxuICAgICAgXCJzbmlwcGV0XCI6IHtcbiAgICAgICAgXCJwdWJsaXNoZWRBdFwiOiBcIjIwMTctMDMtMDZUMTc6NDE6MDAuMDAwWlwiLFxuICAgICAgICBcImNoYW5uZWxJZFwiOiBcIlVDVk00QzFmQjlRY3d5N2ROamJYZVVWd1wiLFxuICAgICAgICBcInRpdGxlXCI6IFwiT2JqZWN0IE9yaWVudGVkIEphdmFTY3JpcHRcIixcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkdldCB0aGUgQ2hlYXQgU2hlZXQgSGVyZSA6IGh0dHA6Ly9nb28uZ2wvQ1FWWnNXXFxuQmVzdCBPYmplY3QgT3JpZW50ZWQgSmF2YVNjcmlwdCBCb29rIDogaHR0cDovL2Ftem4udG8vMUwwTXZzOFxcblxcblN1cHBvcnQgbWUgb24gUGF0cmVvbiA6IGh0dHBzOi8vd3d3LnBhdHJlb24uY29tL2RlcmVrYmFuYXNcXG5cXG4wMTo1MCBKYXZhU2NyaXB0IE9iamVjdHNcXG4wMjozNiBPYmplY3RzIGluIE9iamVjdHNcXG4wNDoxMiBDb25zdHJ1Y3RvciBGdW5jdGlvbnNcXG4wNTo1OCBpbnN0YW5jZW9mXFxuMDY6MjggUGFzc2luZyBPYmplY3RzIHRvIEZ1bmN0aW9uc1xcbjA4OjA5IFByb3RvdHlwZXNcXG4wOTozNCBBZGRpbmcgUHJvcGVydGllcyB0byBPYmplY3RzXFxuMTA6NDQgTGlzdCBQcm9wZXJ0aWVzIGluIE9iamVjdHNcXG4xMTozOCBoYXNPd25Qcm9wZXJ0eVxcbjEyOjQyIEFkZCBQcm9wZXJ0aWVzIHRvIEJ1aWx0IGluIE9iamVjdHNcXG4xNDozMSBQcml2YXRlIFByb3BlcnRpZXNcXG4xODowMSBHZXR0ZXJzIC8gU2V0dGVyc1xcbjIxOjIwIGRlZmluZUdldHRlciAvIGRlZmluZVNldHRlclxcbjI0OjM4IGRlZmluZVByb3BlcnR5XFxuMjc6MDcgQ29uc3RydWN0b3IgRnVuY3Rpb24gR2V0dGVycyAvIFNldHRlcnNcXG4yOTo0MCBJbmhlcml0YW5jZVxcbjM3OjEzIEludGVybWVkaWF0ZSBGdW5jdGlvbiBJbmhlcml0YW5jZVxcbjM5OjE0IENhbGwgUGFyZW50IEZ1bmN0aW9uc1xcbjQxOjUxIEVDTUFTY3JpcHQgNlxcbjQ3OjMxIFNpbmdsZXRvbiBQYXR0ZXJuXFxuNDk6MzIgRmFjdG9yeSBQYXR0ZXJuXFxuNTI6NTMgRGVjb3JhdG9yIFBhdHRlcm5cXG41NDo1MiBPYnNlcnZlciBQYXR0ZXJuXCIsXG4gICAgICAgIFwidGh1bWJuYWlsc1wiOiB7XG4gICAgICAgICAgXCJkZWZhdWx0XCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9POHd3bmhka1BFNC9kZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiAxMjAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiA5MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJtZWRpdW1cIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL084d3duaGRrUEU0L21xZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogMzIwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogMTgwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImhpZ2hcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL084d3duaGRrUEU0L2hxZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogNDgwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogMzYwXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcImNoYW5uZWxUaXRsZVwiOiBcIkp1c3R5biBDbGFya1wiLFxuICAgICAgICBcInBsYXlsaXN0SWRcIjogXCJQTFFhSkR3TFh5QnRYcjFGZTJGUnpJZFQzUkZlRzUyUVZGXCIsXG4gICAgICAgIFwicG9zaXRpb25cIjogMjAsXG4gICAgICAgIFwicmVzb3VyY2VJZFwiOiB7XG4gICAgICAgICAgXCJraW5kXCI6IFwieW91dHViZSN2aWRlb1wiLFxuICAgICAgICAgIFwidmlkZW9JZFwiOiBcIk84d3duaGRrUEU0XCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwiY29udGVudERldGFpbHNcIjoge1xuICAgICAgICBcInZpZGVvSWRcIjogXCJPOHd3bmhka1BFNFwiLFxuICAgICAgICBcInZpZGVvUHVibGlzaGVkQXRcIjogXCIyMDE1LTA5LTI4VDIxOjUyOjQ2LjAwMFpcIlxuICAgICAgfVxuICAgIH0sXG4gICAge1xuXG5cbiAgICAgIFwia2luZFwiOiBcInlvdXR1YmUjcGxheWxpc3RJdGVtXCIsXG4gICAgICBcImV0YWdcIjogXCJcXFwiY2J6M2xJUTJOMjVBZndOci1CZHhVVnhKX1FZL29xS0I5SFJ4UUQxS0Y4aklVLUhyMVA2aDdCVVxcXCJcIixcbiAgICAgIFwiaWRcIjogXCJVRXhSWVVwRWQweFllVUowV0hJeFJtVXlSbEo2U1dSVU0xSkdaVWMxTWxGV1JpNUdNMFEzTTBNek16WTVOVEpGTlRkRVwiLFxuICAgICAgXCJzbmlwcGV0XCI6IHtcbiAgICAgICAgXCJwdWJsaXNoZWRBdFwiOiBcIjIwMTctMDMtMTBUMDI6Mzc6MzkuMDAwWlwiLFxuICAgICAgICBcImNoYW5uZWxJZFwiOiBcIlVDVk00QzFmQjlRY3d5N2ROamJYZVVWd1wiLFxuICAgICAgICBcInRpdGxlXCI6IFwiV29yZFByZXNzIFJFU1QgQVBJIFR1dG9yaWFsIChSZWFsIEV4YW1wbGVzKVwiLFxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiTGV0J3MgbGVhcm4gYWJvdXQgdGhlIG5ldyBXb3JkUHJlc3MgUkVTVCBBUEkuXFxuXFxuTGluayB0byBteSB3ZWJzaXRlOiBodHRwOi8vbGVhcm53ZWJjb2RlLmNvbS9cXG5cXG5NeSBIVE1MICYgQ1NTIENvdXJzZTogaHR0cHM6Ly93d3cudWRlbXkuY29tL3dlYi1kZXNpZ24tZm9yLWJlZ2lubmVycy1yZWFsLXdvcmxkLWNvZGluZy1pbi1odG1sLWNzcy8/Y291cG9uQ29kZT1ZT1VUVUJFLUhBTEYtT0ZGXFxuXFxuTXkgXFxcIkdldCBhIERldmVsb3BlciBKb2JcXFwiIGNvdXJzZTogaHR0cHM6Ly93d3cudWRlbXkuY29tL2dpdC1hLXdlYi1kZXZlbG9wZXItam9iLW1hc3RlcmluZy10aGUtbW9kZXJuLXdvcmtmbG93Lz9jb3Vwb25Db2RlPVlPVVRVQkUtSEFMRi1PRkZcXG5cXG5TdGFydGVyIEFKQVggQ29kZTogaHR0cDovL2NvZGVwZW4uaW8vYW5vbi9wZW4vT2JCUXF2P2VkaXRvcnM9MDAxMFxcblxcblN0YXJ0ZXIgRm9ybSBIVE1MICYgQ1NTOiBodHRwOi8vY29kZXBlbi5pby9hbm9uL3Blbi9qVlFQTHo/ZWRpdG9ycz0xMTAwXFxuXFxuTGluayB0byBkb3dubG9hZCB6aXAgb2YgZmluaXNoZWQgdGhlbWUgZmlsZXM6IGh0dHA6Ly9sZWFybndlYmNvZGUuY29tL3dvcmRwcmVzcy1yZXN0LWFwaS10dXRvcmlhbC1yZWFsLWV4YW1wbGVzL1xcblxcbkFkZCBtZSBvbiBUd2l0dGVyIGZvciB3ZWJEZXYgcmVzb3VyY2VzIGFuZCBjYXQgcGljczogaHR0cHM6Ly90d2l0dGVyLmNvbS9sZWFybndlYmNvZGVcIixcbiAgICAgICAgXCJ0aHVtYm5haWxzXCI6IHtcbiAgICAgICAgICBcImRlZmF1bHRcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL3JHT2JXdGp4R0JjL2RlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDEyMCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDkwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcIm1lZGl1bVwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvckdPYld0anhHQmMvbXFkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiAzMjAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiAxODBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiaGlnaFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvckdPYld0anhHQmMvaHFkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiA0ODAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiAzNjBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwic3RhbmRhcmRcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL3JHT2JXdGp4R0JjL3NkZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogNjQwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogNDgwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcIm1heHJlc1wiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvckdPYld0anhHQmMvbWF4cmVzZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogMTI4MCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDcyMFxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJjaGFubmVsVGl0bGVcIjogXCJKdXN0eW4gQ2xhcmtcIixcbiAgICAgICAgXCJwbGF5bGlzdElkXCI6IFwiUExRYUpEd0xYeUJ0WHIxRmUyRlJ6SWRUM1JGZUc1MlFWRlwiLFxuICAgICAgICBcInBvc2l0aW9uXCI6IDIxLFxuICAgICAgICBcInJlc291cmNlSWRcIjoge1xuICAgICAgICAgIFwia2luZFwiOiBcInlvdXR1YmUjdmlkZW9cIixcbiAgICAgICAgICBcInZpZGVvSWRcIjogXCJyR09iV3RqeEdCY1wiXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcImNvbnRlbnREZXRhaWxzXCI6IHtcbiAgICAgICAgXCJ2aWRlb0lkXCI6IFwickdPYld0anhHQmNcIixcbiAgICAgICAgXCJ2aWRlb1B1Ymxpc2hlZEF0XCI6IFwiMjAxNi0xMi0xNlQwNDo1NzoxMy4wMDBaXCJcbiAgICAgIH1cbiAgICB9LFxuICAgIHtcblxuXG4gICAgICBcImtpbmRcIjogXCJ5b3V0dWJlI3BsYXlsaXN0SXRlbVwiLFxuICAgICAgXCJldGFnXCI6IFwiXFxcImNiejNsSVEyTjI1QWZ3TnItQmR4VVZ4Sl9RWS9rajF2UXM4U0V6UFkyNmhvWGYzbERKcUZnZ2NcXFwiXCIsXG4gICAgICBcImlkXCI6IFwiVUV4UllVcEVkMHhZZVVKMFdISXhSbVV5UmxKNlNXUlVNMUpHWlVjMU1sRldSaTR6UmpNME1rVkNSVGcwTWtZeVFUTTBcIixcbiAgICAgIFwic25pcHBldFwiOiB7XG4gICAgICAgIFwicHVibGlzaGVkQXRcIjogXCIyMDE3LTA0LTAxVDA3OjA4OjAyLjAwMFpcIixcbiAgICAgICAgXCJjaGFubmVsSWRcIjogXCJVQ1ZNNEMxZkI5UWN3eTdkTmpiWGVVVndcIixcbiAgICAgICAgXCJ0aXRsZVwiOiBcIkNhcnRvb25zIEZvciBDaGlsZHJlbiB8IFN1bm55IEJ1bm5pZXMgRUxVU0lWRSBDQUtFIHwgTkVXIFNFQVNPTiB8IEZ1bm55IENhcnRvb25zIEZvciBDaGlsZHJlbiB8XCIsXG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCLilrogU3Vic2NyaWJlIHRvIFN1bm55IEJ1bm5pZXMgZm9yIG5ldyB2aWRlb3M6ICBodHRwOi8vYml0Lmx5LzFVZE1HVXlcXG5cXG7ilrogV2F0Y2ggbW9yZSBGdW5ueSBDYXJ0b29ucyBmb3IgQ2hpbGRyZW4gLVxcbmh0dHBzOi8vd3d3LnlvdXR1YmUuY29tL3dhdGNoP3Y9Z3A1TUF5Ni1OWUEmbGlzdD1QTG9RbHg3ZjZOeC1QeXNva2RjT1J5SDFfVkdBREZsdHR5JmluZGV4PTJcXG5cXG7ilrogV2F0Y2ggbW9yZSBDYXJ0b29ucyBmb3IgQ2hpbGRyZW4gLVxcbmh0dHBzOi8vd3d3LnlvdXR1YmUuY29tL3dhdGNoP3Y9NDZjX1NkTlpsV2smbGlzdD1QTG9RbHg3ZjZOeC1QeXNva2RjT1J5SDFfVkdBREZsdHR5JmluZGV4PTNcXG5cXG7ilrogV2F0Y2ggbW9yZSBTdW5ueSBCdW5uaWVzIC1cXG5odHRwczovL3d3dy55b3V0dWJlLmNvbS93YXRjaD92PThqWV9OcXlnS0xVJmxpc3Q9UExvUWx4N2Y2TngtUHlzb2tkY09SeUgxX1ZHQURGbHR0eSZpbmRleD00XFxuXFxuS2lkcyBhcmUgY2FwYWJsZSBvZiBjb21pbmcgdXAgd2l0aCB0aGUgbW9zdCB1bnJlYWwgYW5kIGZhbnRhc3RpYyBjcmVhdHVyZXMgaW4gdGhlaXIgbWluZHMuIFNoYWRvd3MgYXJlIHNlZW4gYXMgYmxlYWsgYW5kIGdsb29teSwgd2hpbGUgc3VuYmVhbXMgYXJlIGFzc29jaWF0ZWQgd2l0aCBsaWdodCBhbmQgaGFwcGluZXNzLCBhbmQgY2FuIGNyZWF0ZSBmdW5ueSBpbWFnZXMuIFdoYXQgaWYgdGhlc2UgZmFudGFzaWVzIGNhbWUgYWxpdmU/IFdoYXQgaWYgdGhleSBjb3VsZCBqdW1wIG91dCBvZiB0aGUgc3VubGlnaHQ/XFxuXFxuVGhlIFN1bm55IEJ1bm5pZXMgYXJlIGZpdmUgYmVhbWluZyBiYWxscyBvZiBsaWdodCB0aGF0IGNhbiBhcHBlYXIgYW55d2hlcmUgdGhlcmUgaXMgYSBsaWdodCBzb3VyY2UuIFdoZXRoZXIgaXQgaXMgc3VubGlnaHQgb3IgbW9vbmxpZ2h0LCB0aGV5IGJyaW5nIGZ1biBhbmQgaGFwcGluZXNzIGV2ZXJ5d2hlcmUgdGhleSBnby4gSG93ZXZlciwgZWFjaCB0aW1lIHRoZXkgYXBwZWFyIHRoZWlyIGFjdGlvbnMgdHVybiBpbnRvIGEgbWlzY2hpZXZvdXMgZ2FtZS4gU29tZXRpbWVzIHRvbyBtaXNjaGlldm91cy5cXG5cXG5JbiBlYWNoIGVwaXNvZGUsIFN1bm55IEJ1bm5pZXMgYXBwZWFyIGF0IGEgZGlmZmVyZW50IGxvY2F0aW9uOiBhIGNpcmN1cywgYSBzdGFkaXVtLCBhIGNhcnJvdXNlbCwgYSBwYXJrLCBhIHN0YWdl4oCmIFRoZXkgaW1tZWRpYXRlbHkgc3RhcnQgdG8gaW52ZXN0aWdhdGUgdGhlaXIgc3Vycm91bmRpbmdzIGFuZCB0aGF04oCZcyB3aGVuIHRoZSBmdW4gYW5kIG1pc2NoaWVmIGJlZ2luISBBdCB0aGUgdmVyeSBlbmQgb2YgZXZlcnkgZXBpc29kZSwgdGhlIGxhdWdodGVyIGNvbnRpbnVlcyB3aXRoIGEgY29sbGVjdGlvbiBvZiBibG9vcGVycy5cIixcbiAgICAgICAgXCJ0aHVtYm5haWxzXCI6IHtcbiAgICAgICAgICBcImRlZmF1bHRcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL1FYN2lhR2NBeVQ0L2RlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDEyMCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDkwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcIm1lZGl1bVwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvUVg3aWFHY0F5VDQvbXFkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiAzMjAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiAxODBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiaGlnaFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvUVg3aWFHY0F5VDQvaHFkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiA0ODAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiAzNjBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwic3RhbmRhcmRcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL1FYN2lhR2NBeVQ0L3NkZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogNjQwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogNDgwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcIm1heHJlc1wiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvUVg3aWFHY0F5VDQvbWF4cmVzZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogMTI4MCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDcyMFxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJjaGFubmVsVGl0bGVcIjogXCJKdXN0eW4gQ2xhcmtcIixcbiAgICAgICAgXCJwbGF5bGlzdElkXCI6IFwiUExRYUpEd0xYeUJ0WHIxRmUyRlJ6SWRUM1JGZUc1MlFWRlwiLFxuICAgICAgICBcInBvc2l0aW9uXCI6IDIyLFxuICAgICAgICBcInJlc291cmNlSWRcIjoge1xuICAgICAgICAgIFwia2luZFwiOiBcInlvdXR1YmUjdmlkZW9cIixcbiAgICAgICAgICBcInZpZGVvSWRcIjogXCJRWDdpYUdjQXlUNFwiXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcImNvbnRlbnREZXRhaWxzXCI6IHtcbiAgICAgICAgXCJ2aWRlb0lkXCI6IFwiUVg3aWFHY0F5VDRcIixcbiAgICAgICAgXCJ2aWRlb1B1Ymxpc2hlZEF0XCI6IFwiMjAxNy0wMi0xMFQxMTo0Nzo1NC4wMDBaXCJcbiAgICAgIH1cbiAgICB9LFxuICAgIHtcblxuXG4gICAgICBcImtpbmRcIjogXCJ5b3V0dWJlI3BsYXlsaXN0SXRlbVwiLFxuICAgICAgXCJldGFnXCI6IFwiXFxcImNiejNsSVEyTjI1QWZ3TnItQmR4VVZ4Sl9RWS8zcmNwWkJkWXgyTVJIeWFxMWg5emZEWnI5UUVcXFwiXCIsXG4gICAgICBcImlkXCI6IFwiVUV4UllVcEVkMHhZZVVKMFdISXhSbVV5UmxKNlNXUlVNMUpHWlVjMU1sRldSaTQ1TnpVd1FrSTFNMFV4TlRoQk1rVTBcIixcbiAgICAgIFwic25pcHBldFwiOiB7XG4gICAgICAgIFwicHVibGlzaGVkQXRcIjogXCIyMDE3LTA0LTE2VDE3OjI4OjE3LjAwMFpcIixcbiAgICAgICAgXCJjaGFubmVsSWRcIjogXCJVQ1ZNNEMxZkI5UWN3eTdkTmpiWGVVVndcIixcbiAgICAgICAgXCJ0aXRsZVwiOiBcIkphdmFTY3JpcHQgYW5kIHRoZSBET00gKFBhcnQgMSBvZiAyKVwiLFxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiVG9kYXkgQGFkYW1yZWN2bG9oZSB3YWxrcyB1cyB0aHJvdWdoIHNvbWUgZnVuY3Rpb25hbCBKUyBwcm9ncmFtbWluZyB0ZWNobmlxdWVzIGluIFBhcnQgMSBvZiBhIDIgcGFydCBKYXZhc2NyaXB0IHNlcmllcyFcXG5cXG5Qcm9qZWN0IENvZGUgLSBodHRwOi8vY29kZXBlbi5pby9hcmVjdmxvaGUvcGVuL3JlcFhkZVxcblxcbi0gLSAtXFxuXFxuVGhpcyB2aWRlbyB3YXMgc3BvbnNvcmVkIGJ5IHRoZSBEZXZUaXBzIFBhdHJvbiBDb21tdW5pdHkgLSBodHRwczovL3d3dy5wYXRyZW9uLmNvbS9EZXZUaXBzXFxuXFxuTGlzdGVuIHRvIFRyYXZpcycgUG9kY2FzdCAtIGh0dHA6Ly93d3cudHJhdmFuZGxvcy5jb20vXFxuXFxuR2V0IGF3ZXNvbWVuZXNzIGVtYWlsZWQgdG8geW91IGV2ZXJ5IHRodXJzZGF5IC0gaHR0cDovL3RyYXZpc25laWxzb24uY29tL25vdGVzIFxcblxcbllvdSBzaG91bGQgZm9sbG93IERldlRpcHMgb24gVHdpdHRlciAtIGh0dHBzOi8vdHdpdHRlci5jb20vRGV2VGlwc1Nob3dcIixcbiAgICAgICAgXCJ0aHVtYm5haWxzXCI6IHtcbiAgICAgICAgICBcImRlZmF1bHRcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL2hNOWgxd040cmZVL2RlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDEyMCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDkwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcIm1lZGl1bVwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvaE05aDF3TjRyZlUvbXFkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiAzMjAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiAxODBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiaGlnaFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvaE05aDF3TjRyZlUvaHFkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiA0ODAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiAzNjBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwic3RhbmRhcmRcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL2hNOWgxd040cmZVL3NkZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogNjQwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogNDgwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcIm1heHJlc1wiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvaE05aDF3TjRyZlUvbWF4cmVzZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogMTI4MCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDcyMFxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJjaGFubmVsVGl0bGVcIjogXCJKdXN0eW4gQ2xhcmtcIixcbiAgICAgICAgXCJwbGF5bGlzdElkXCI6IFwiUExRYUpEd0xYeUJ0WHIxRmUyRlJ6SWRUM1JGZUc1MlFWRlwiLFxuICAgICAgICBcInBvc2l0aW9uXCI6IDIzLFxuICAgICAgICBcInJlc291cmNlSWRcIjoge1xuICAgICAgICAgIFwia2luZFwiOiBcInlvdXR1YmUjdmlkZW9cIixcbiAgICAgICAgICBcInZpZGVvSWRcIjogXCJoTTloMXdONHJmVVwiXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcImNvbnRlbnREZXRhaWxzXCI6IHtcbiAgICAgICAgXCJ2aWRlb0lkXCI6IFwiaE05aDF3TjRyZlVcIixcbiAgICAgICAgXCJ2aWRlb1B1Ymxpc2hlZEF0XCI6IFwiMjAxNi0wNS0wMlQxNTozNDozNy4wMDBaXCJcbiAgICAgIH1cbiAgICB9LFxuICAgIHtcblxuXG4gICAgICBcImtpbmRcIjogXCJ5b3V0dWJlI3BsYXlsaXN0SXRlbVwiLFxuICAgICAgXCJldGFnXCI6IFwiXFxcImNiejNsSVEyTjI1QWZ3TnItQmR4VVZ4Sl9RWS9UZ2ozUkNBSWZmNjc5bXhoeFVManVyUzFrbjBcXFwiXCIsXG4gICAgICBcImlkXCI6IFwiVUV4UllVcEVkMHhZZVVKMFdISXhSbVV5UmxKNlNXUlVNMUpHWlVjMU1sRldSaTVETnpFMVJqWkVNVVpDTWpBMFJEQkJcIixcbiAgICAgIFwic25pcHBldFwiOiB7XG4gICAgICAgIFwicHVibGlzaGVkQXRcIjogXCIyMDE3LTA1LTA1VDA1OjE4OjM4LjAwMFpcIixcbiAgICAgICAgXCJjaGFubmVsSWRcIjogXCJVQ1ZNNEMxZkI5UWN3eTdkTmpiWGVVVndcIixcbiAgICAgICAgXCJ0aXRsZVwiOiBcIkxlYXJuIE51bWJlcnMgd2l0aCBDb3VudGluZyBhbmQgTGVhcm4gQ29sb3JzIHdpdGggV2F0ZXIgQmFsbG9vbnMgZm9yIENoaWxkcmVuLCBUb2RkbGVycyBhbmQgQmFiaWVzXCIsXG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJBIEdyZWF0IGFuZCBGdW4gV2F5IHRvIExlYXJuIE51bWJlcnMgYW5kIFRvIExlYXJuIHRvIENvdW50IGlzIGJ5IHVzaW5nIENvbG91cnMgV2F0ZXIgQmFsbG9vbnMhIFdlIExpbmVkIHRoZW0gdXAgaW4gZGlmZmVyZW50cyBDb2xvcnMsIHNvIENoaWxkcmVuLCBUb2RkbGVycyBhbmQgQmFiaWVzIGFsc28gY2FuIExlYXJuIENvbG9ycyEgSGF2ZSBGdW4gd2F0Y2hpbmcgdGhpcyBFZHVjYXRpb25hbCB2aWRlbywgaGF2ZSBmdW4gTGVhcm5pbmchXFxuXFxuV2VsY29tZSB0byBvdXIgY2hhbm5lbCwgRnVuVG95c01lZGlhLiBcXG5cXG5XZSBDcmVhdGUgRWR1Y2F0aW9uYWwgYW5kIFRveXMgdmlkZW9zIGZvciBLaWRzIGJ5IGEgS2lkIVxcbk91ciBLaWQgSmFzb24gcGxheXMgaW4gdGhlIFZpZGVvcyBhbmQgaGUgbG92ZXMgdG8gdGVhY2ggQ29sb3JzLCBOdW1iZXJzLCBMZXR0ZXJzIGFuZCBtb3JlISBcXG5XZSBhbHNvIGRvIEZ1biBTa2V0Y2hlcy5cXG5PdXIgS2lkcyB2aWRlb3MgYXJlIGZ1biBhbmQgZXhjaXRpbmcgdG8gd2F0Y2guIFxcblxcbkJhZCBCYWJ5IE1hZ2ljIGFuZCBMZWFybiBDb2xvcnMgd2l0aCBCYWQgR2hvc3RzIGZvciBLaWRzIHwgQmFkIEtpZCBMZWFybnMgQ29sb3VycyBcXG5odHRwczovL3d3dy55b3V0dWJlLmNvbS93YXRjaD92PVo2MHZuRGhjZ2dnXFxuXFxuU3VwZXIgSGVybyBTYWNrIFJhY2UgRm9yIEtpZHMgd2l0aCBTdXBlcm1hbiBhbmQgU3BpZGVybWFuIHwgTGVhcm4gTnVtYmVycyBmb3IgQ2hpbGRyZW4gUGxheSBBY3Rpdml0eSBcXG5odHRwczovL3d3dy55b3V0dWJlLmNvbS93YXRjaD92PUNfTlpzVUl3bmswXFxuXFxuTGVhcm4gRnJ1aXRzIHdpdGggU21vb3RoaWVzIGZvciBDaGlsZHJlbiBhbmQgVG9kZGxlcnMgfCBMZWFybiBDb2xvcnMgd2l0aCBGcnVpdHMgVGFzdGUgQ2hhbGxlbmdlIFxcbmh0dHBzOi8vd3d3LnlvdXR1YmUuY29tL3dhdGNoP3Y9NS1TdnY3NUlFeXdcXG5cXG5MZWFybiBDb2xvdXJzIGFuZCBQb3BwaW5nIFdhdGVyIEJhbGxvb25zIGZvciBDaGlsZHJlbiBhbmQgVG9kZGxlcnMgfCBCYWQgS2lkIExlYXJucyBDb2xvcnMgXFxuaHR0cHM6Ly93d3cueW91dHViZS5jb20vd2F0Y2g/dj1OS1ZJN192SnowNFxcblxcbkxlYXJuIENvbG9ycyB3aXRoIEJhZCBCYWJ5IENyeWluZyBHdW1iYWxsIEJvdHRsZXMgZm9yIEJhYmllcyB8IEZpbmdlciBGYW1pbHkgU29uZyBOdXJzZXJ5IFJoeW1lcyBcXG5odHRwczovL3d3dy55b3V0dWJlLmNvbS93YXRjaD92PXp1SUtIVjhsM1c4XFxuXFxuQmFkIEJhYnkgQ3J5aW5nIExlYXJuIENvbG9ycyBmb3IgVG9kZGxlcnMgYW5kIEJhYmllcyB8IEZpbmdlciBGYW1pbHkgU29uZyBCYWJ5IE51cnNlcnkgUmh5bWVzIFxcbmh0dHBzOi8vd3d3LnlvdXR1YmUuY29tL3dhdGNoP3Y9U09lTzRSbHdCZHNcXG5cXG5MZWFybiBDb2xvcnMgd2l0aCBTa2lwcHkgQmFsbHMgZm9yIENoaWxkcmVuLCBUb2RkbGVycyBhbmQgQmFiaWVzIHwgRnVubnkgRmFjZXMgU2tpcHB5IEJhbGxzIENvbG91cnMgXFxuaHR0cHM6Ly93d3cueW91dHViZS5jb20vd2F0Y2g/dj1TeWg0RnFqQ2hlUVxcblxcbkxlYXJuIENvbG9ycyB3aXRoIEZvb3QgTnVyc2VyeSBTb25ncyBmb3IgQ2hpbGRyZW4sIFRvZGRsZXJzIGFuZCBCYWJpZXMgfCBLaWRzIEZpbmdlciBGYW1pbHkgU29uZ3MgXFxuaHR0cHM6Ly93d3cueW91dHViZS5jb20vd2F0Y2g/dj1yZ2N6N0QyYXIxVVxcblxcbkxlYXJuIE1vbnRocyBvZiB0aGUgWWVhciBmb3IgQ2hpbGRyZW4gYW5kIFRvZGRsZXJzIGFuZCBMZWFybiBDb2xvcnMgZm9yIEtpZHMgRWR1Y2F0aW9uYWwgVmlkZW8gXFxuaHR0cHM6Ly93d3cueW91dHViZS5jb20vd2F0Y2g/dj1YSDVYdWkwVUpVTVxcblxcbkxlYXJuIE51bWJlcnMgYW5kIENvbG9ycyB3aXRoIEJ1Y2tldHMgZm9yIENoaWxkcmVuIGFuZCBUb2RkbGVycyB8IFRocm93IENvbG91cnMgV2F0ZXIgQmFsbG9vbnMgR2FtZSBcXG5odHRwczovL3d3dy55b3V0dWJlLmNvbS93YXRjaD92PTVyNl8tZ3VWQU1nXFxuXFxuTGVhcm4gTnVtYmVycyBhbmQgQ29sb3JzIHdpdGggQ2hvY29sYXRlIEVhc3RlciBFZ2dzIGZvciBDaGlsZHJlbiwgVG9kZGxlcnMgYW5kIEJhYmllcyBcXG5odHRwczovL3d3dy55b3V0dWJlLmNvbS93YXRjaD92PUxOVlItdFFyTVQwXCIsXG4gICAgICAgIFwidGh1bWJuYWlsc1wiOiB7XG4gICAgICAgICAgXCJkZWZhdWx0XCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9WTEk5UnVCWW5kNC9kZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiAxMjAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiA5MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJtZWRpdW1cIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL1ZMSTlSdUJZbmQ0L21xZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogMzIwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogMTgwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImhpZ2hcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL1ZMSTlSdUJZbmQ0L2hxZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogNDgwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogMzYwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInN0YW5kYXJkXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9WTEk5UnVCWW5kNC9zZGRlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDY0MCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDQ4MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJtYXhyZXNcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL1ZMSTlSdUJZbmQ0L21heHJlc2RlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDEyODAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiA3MjBcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIFwiY2hhbm5lbFRpdGxlXCI6IFwiSnVzdHluIENsYXJrXCIsXG4gICAgICAgIFwicGxheWxpc3RJZFwiOiBcIlBMUWFKRHdMWHlCdFhyMUZlMkZSeklkVDNSRmVHNTJRVkZcIixcbiAgICAgICAgXCJwb3NpdGlvblwiOiAyNCxcbiAgICAgICAgXCJyZXNvdXJjZUlkXCI6IHtcbiAgICAgICAgICBcImtpbmRcIjogXCJ5b3V0dWJlI3ZpZGVvXCIsXG4gICAgICAgICAgXCJ2aWRlb0lkXCI6IFwiVkxJOVJ1QlluZDRcIlxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgXCJjb250ZW50RGV0YWlsc1wiOiB7XG4gICAgICAgIFwidmlkZW9JZFwiOiBcIlZMSTlSdUJZbmQ0XCIsXG4gICAgICAgIFwidmlkZW9QdWJsaXNoZWRBdFwiOiBcIjIwMTctMDUtMDRUMDI6MDA6MzYuMDAwWlwiXG4gICAgICB9XG4gICAgfVxuICBdXG59XG4iXX0=
