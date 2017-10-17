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

console.log(randTubeVid());

// Set up click handlers
function clickHandlers() {

  var header = document.querySelector('.header');
  var content1 = document.querySelector('.logo');
  var body = document.querySelector('body');
  content1.addEventListener('click', function () {
    header.classList.toggle('--open');
    body.classList.toggle('overlay--open');
  });

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

function randNumGen(max) {
  return Math.floor(Math.random() * max);
};

function coolFunk() {
  console.log('this love is taking a hold of me');
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvZXZlbnRlbWl0dGVyMi9saWIvZXZlbnRlbWl0dGVyMi5qcyIsIm5vZGVfbW9kdWxlcy9wcm9jZXNzL2Jyb3dzZXIuanMiLCJzcmMvYXBwLmpzIiwic3JjL2pzL21vZHVsZXMvY29uZmlnLmpzIiwic3JjL2pzL21vZHVsZXMvY29va2llcy5qcyIsInNyYy9qcy9tb2R1bGVzL2Ryb3BsZXQuanMiLCJzcmMvanMvbW9kdWxlcy9nbG9iYWwuanMiLCJzcmMvanMvbW9kdWxlcy9oYW5kbGVDbGlja3MuanMiLCJzcmMvanMvbW9kdWxlcy9zaWRlYmFyLmpzIiwic3JjL2pzL21vZHVsZXMvdXRpbHMuanMiLCJzcmMvanMvbW9kdWxlcy95b3V0dWJlLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOztBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7OztBQ3h3QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7OztBQ3hMQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFHQTs7QUFDQTs7QUFHQTs7Ozs7QUNWQSxJQUFNLFNBQVMsR0FBRyxNQUFILEdBQVksRUFBM0I7QUFDRSxPQUFPLE9BQVAsR0FBaUIsaUJBQWpCO0FBQ0EsT0FBTyxTQUFQLEdBQW1CLGNBQW5CO0FBQ0EsT0FBTyxPQUFQLEdBQWlCLE9BQWpCOzs7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dXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3ZhciBmPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIik7dGhyb3cgZi5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGZ9dmFyIGw9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGwuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sbCxsLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsIi8qIVxyXG4gKiBFdmVudEVtaXR0ZXIyXHJcbiAqIGh0dHBzOi8vZ2l0aHViLmNvbS9oaWoxbngvRXZlbnRFbWl0dGVyMlxyXG4gKlxyXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTMgaGlqMW54XHJcbiAqIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgbGljZW5zZS5cclxuICovXHJcbjshZnVuY3Rpb24odW5kZWZpbmVkKSB7XHJcblxyXG4gIHZhciBpc0FycmF5ID0gQXJyYXkuaXNBcnJheSA/IEFycmF5LmlzQXJyYXkgOiBmdW5jdGlvbiBfaXNBcnJheShvYmopIHtcclxuICAgIHJldHVybiBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwob2JqKSA9PT0gXCJbb2JqZWN0IEFycmF5XVwiO1xyXG4gIH07XHJcbiAgdmFyIGRlZmF1bHRNYXhMaXN0ZW5lcnMgPSAxMDtcclxuXHJcbiAgZnVuY3Rpb24gaW5pdCgpIHtcclxuICAgIHRoaXMuX2V2ZW50cyA9IHt9O1xyXG4gICAgaWYgKHRoaXMuX2NvbmYpIHtcclxuICAgICAgY29uZmlndXJlLmNhbGwodGhpcywgdGhpcy5fY29uZik7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBjb25maWd1cmUoY29uZikge1xyXG4gICAgaWYgKGNvbmYpIHtcclxuICAgICAgdGhpcy5fY29uZiA9IGNvbmY7XHJcblxyXG4gICAgICBjb25mLmRlbGltaXRlciAmJiAodGhpcy5kZWxpbWl0ZXIgPSBjb25mLmRlbGltaXRlcik7XHJcbiAgICAgIHRoaXMuX21heExpc3RlbmVycyA9IGNvbmYubWF4TGlzdGVuZXJzICE9PSB1bmRlZmluZWQgPyBjb25mLm1heExpc3RlbmVycyA6IGRlZmF1bHRNYXhMaXN0ZW5lcnM7XHJcblxyXG4gICAgICBjb25mLndpbGRjYXJkICYmICh0aGlzLndpbGRjYXJkID0gY29uZi53aWxkY2FyZCk7XHJcbiAgICAgIGNvbmYubmV3TGlzdGVuZXIgJiYgKHRoaXMubmV3TGlzdGVuZXIgPSBjb25mLm5ld0xpc3RlbmVyKTtcclxuICAgICAgY29uZi52ZXJib3NlTWVtb3J5TGVhayAmJiAodGhpcy52ZXJib3NlTWVtb3J5TGVhayA9IGNvbmYudmVyYm9zZU1lbW9yeUxlYWspO1xyXG5cclxuICAgICAgaWYgKHRoaXMud2lsZGNhcmQpIHtcclxuICAgICAgICB0aGlzLmxpc3RlbmVyVHJlZSA9IHt9O1xyXG4gICAgICB9XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICB0aGlzLl9tYXhMaXN0ZW5lcnMgPSBkZWZhdWx0TWF4TGlzdGVuZXJzO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gbG9nUG9zc2libGVNZW1vcnlMZWFrKGNvdW50LCBldmVudE5hbWUpIHtcclxuICAgIHZhciBlcnJvck1zZyA9ICcobm9kZSkgd2FybmluZzogcG9zc2libGUgRXZlbnRFbWl0dGVyIG1lbW9yeSAnICtcclxuICAgICAgICAnbGVhayBkZXRlY3RlZC4gJyArIGNvdW50ICsgJyBsaXN0ZW5lcnMgYWRkZWQuICcgK1xyXG4gICAgICAgICdVc2UgZW1pdHRlci5zZXRNYXhMaXN0ZW5lcnMoKSB0byBpbmNyZWFzZSBsaW1pdC4nO1xyXG5cclxuICAgIGlmKHRoaXMudmVyYm9zZU1lbW9yeUxlYWspe1xyXG4gICAgICBlcnJvck1zZyArPSAnIEV2ZW50IG5hbWU6ICcgKyBldmVudE5hbWUgKyAnLic7XHJcbiAgICB9XHJcblxyXG4gICAgaWYodHlwZW9mIHByb2Nlc3MgIT09ICd1bmRlZmluZWQnICYmIHByb2Nlc3MuZW1pdFdhcm5pbmcpe1xyXG4gICAgICB2YXIgZSA9IG5ldyBFcnJvcihlcnJvck1zZyk7XHJcbiAgICAgIGUubmFtZSA9ICdNYXhMaXN0ZW5lcnNFeGNlZWRlZFdhcm5pbmcnO1xyXG4gICAgICBlLmVtaXR0ZXIgPSB0aGlzO1xyXG4gICAgICBlLmNvdW50ID0gY291bnQ7XHJcbiAgICAgIHByb2Nlc3MuZW1pdFdhcm5pbmcoZSk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICBjb25zb2xlLmVycm9yKGVycm9yTXNnKTtcclxuXHJcbiAgICAgIGlmIChjb25zb2xlLnRyYWNlKXtcclxuICAgICAgICBjb25zb2xlLnRyYWNlKCk7XHJcbiAgICAgIH1cclxuICAgIH1cclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIEV2ZW50RW1pdHRlcihjb25mKSB7XHJcbiAgICB0aGlzLl9ldmVudHMgPSB7fTtcclxuICAgIHRoaXMubmV3TGlzdGVuZXIgPSBmYWxzZTtcclxuICAgIHRoaXMudmVyYm9zZU1lbW9yeUxlYWsgPSBmYWxzZTtcclxuICAgIGNvbmZpZ3VyZS5jYWxsKHRoaXMsIGNvbmYpO1xyXG4gIH1cclxuICBFdmVudEVtaXR0ZXIuRXZlbnRFbWl0dGVyMiA9IEV2ZW50RW1pdHRlcjsgLy8gYmFja3dhcmRzIGNvbXBhdGliaWxpdHkgZm9yIGV4cG9ydGluZyBFdmVudEVtaXR0ZXIgcHJvcGVydHlcclxuXHJcbiAgLy9cclxuICAvLyBBdHRlbnRpb24sIGZ1bmN0aW9uIHJldHVybiB0eXBlIG5vdyBpcyBhcnJheSwgYWx3YXlzICFcclxuICAvLyBJdCBoYXMgemVybyBlbGVtZW50cyBpZiBubyBhbnkgbWF0Y2hlcyBmb3VuZCBhbmQgb25lIG9yIG1vcmVcclxuICAvLyBlbGVtZW50cyAobGVhZnMpIGlmIHRoZXJlIGFyZSBtYXRjaGVzXHJcbiAgLy9cclxuICBmdW5jdGlvbiBzZWFyY2hMaXN0ZW5lclRyZWUoaGFuZGxlcnMsIHR5cGUsIHRyZWUsIGkpIHtcclxuICAgIGlmICghdHJlZSkge1xyXG4gICAgICByZXR1cm4gW107XHJcbiAgICB9XHJcbiAgICB2YXIgbGlzdGVuZXJzPVtdLCBsZWFmLCBsZW4sIGJyYW5jaCwgeFRyZWUsIHh4VHJlZSwgaXNvbGF0ZWRCcmFuY2gsIGVuZFJlYWNoZWQsXHJcbiAgICAgICAgdHlwZUxlbmd0aCA9IHR5cGUubGVuZ3RoLCBjdXJyZW50VHlwZSA9IHR5cGVbaV0sIG5leHRUeXBlID0gdHlwZVtpKzFdO1xyXG4gICAgaWYgKGkgPT09IHR5cGVMZW5ndGggJiYgdHJlZS5fbGlzdGVuZXJzKSB7XHJcbiAgICAgIC8vXHJcbiAgICAgIC8vIElmIGF0IHRoZSBlbmQgb2YgdGhlIGV2ZW50KHMpIGxpc3QgYW5kIHRoZSB0cmVlIGhhcyBsaXN0ZW5lcnNcclxuICAgICAgLy8gaW52b2tlIHRob3NlIGxpc3RlbmVycy5cclxuICAgICAgLy9cclxuICAgICAgaWYgKHR5cGVvZiB0cmVlLl9saXN0ZW5lcnMgPT09ICdmdW5jdGlvbicpIHtcclxuICAgICAgICBoYW5kbGVycyAmJiBoYW5kbGVycy5wdXNoKHRyZWUuX2xpc3RlbmVycyk7XHJcbiAgICAgICAgcmV0dXJuIFt0cmVlXTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICBmb3IgKGxlYWYgPSAwLCBsZW4gPSB0cmVlLl9saXN0ZW5lcnMubGVuZ3RoOyBsZWFmIDwgbGVuOyBsZWFmKyspIHtcclxuICAgICAgICAgIGhhbmRsZXJzICYmIGhhbmRsZXJzLnB1c2godHJlZS5fbGlzdGVuZXJzW2xlYWZdKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIFt0cmVlXTtcclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGlmICgoY3VycmVudFR5cGUgPT09ICcqJyB8fCBjdXJyZW50VHlwZSA9PT0gJyoqJykgfHwgdHJlZVtjdXJyZW50VHlwZV0pIHtcclxuICAgICAgLy9cclxuICAgICAgLy8gSWYgdGhlIGV2ZW50IGVtaXR0ZWQgaXMgJyonIGF0IHRoaXMgcGFydFxyXG4gICAgICAvLyBvciB0aGVyZSBpcyBhIGNvbmNyZXRlIG1hdGNoIGF0IHRoaXMgcGF0Y2hcclxuICAgICAgLy9cclxuICAgICAgaWYgKGN1cnJlbnRUeXBlID09PSAnKicpIHtcclxuICAgICAgICBmb3IgKGJyYW5jaCBpbiB0cmVlKSB7XHJcbiAgICAgICAgICBpZiAoYnJhbmNoICE9PSAnX2xpc3RlbmVycycgJiYgdHJlZS5oYXNPd25Qcm9wZXJ0eShicmFuY2gpKSB7XHJcbiAgICAgICAgICAgIGxpc3RlbmVycyA9IGxpc3RlbmVycy5jb25jYXQoc2VhcmNoTGlzdGVuZXJUcmVlKGhhbmRsZXJzLCB0eXBlLCB0cmVlW2JyYW5jaF0sIGkrMSkpO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gbGlzdGVuZXJzO1xyXG4gICAgICB9IGVsc2UgaWYoY3VycmVudFR5cGUgPT09ICcqKicpIHtcclxuICAgICAgICBlbmRSZWFjaGVkID0gKGkrMSA9PT0gdHlwZUxlbmd0aCB8fCAoaSsyID09PSB0eXBlTGVuZ3RoICYmIG5leHRUeXBlID09PSAnKicpKTtcclxuICAgICAgICBpZihlbmRSZWFjaGVkICYmIHRyZWUuX2xpc3RlbmVycykge1xyXG4gICAgICAgICAgLy8gVGhlIG5leHQgZWxlbWVudCBoYXMgYSBfbGlzdGVuZXJzLCBhZGQgaXQgdG8gdGhlIGhhbmRsZXJzLlxyXG4gICAgICAgICAgbGlzdGVuZXJzID0gbGlzdGVuZXJzLmNvbmNhdChzZWFyY2hMaXN0ZW5lclRyZWUoaGFuZGxlcnMsIHR5cGUsIHRyZWUsIHR5cGVMZW5ndGgpKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGZvciAoYnJhbmNoIGluIHRyZWUpIHtcclxuICAgICAgICAgIGlmIChicmFuY2ggIT09ICdfbGlzdGVuZXJzJyAmJiB0cmVlLmhhc093blByb3BlcnR5KGJyYW5jaCkpIHtcclxuICAgICAgICAgICAgaWYoYnJhbmNoID09PSAnKicgfHwgYnJhbmNoID09PSAnKionKSB7XHJcbiAgICAgICAgICAgICAgaWYodHJlZVticmFuY2hdLl9saXN0ZW5lcnMgJiYgIWVuZFJlYWNoZWQpIHtcclxuICAgICAgICAgICAgICAgIGxpc3RlbmVycyA9IGxpc3RlbmVycy5jb25jYXQoc2VhcmNoTGlzdGVuZXJUcmVlKGhhbmRsZXJzLCB0eXBlLCB0cmVlW2JyYW5jaF0sIHR5cGVMZW5ndGgpKTtcclxuICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgbGlzdGVuZXJzID0gbGlzdGVuZXJzLmNvbmNhdChzZWFyY2hMaXN0ZW5lclRyZWUoaGFuZGxlcnMsIHR5cGUsIHRyZWVbYnJhbmNoXSwgaSkpO1xyXG4gICAgICAgICAgICB9IGVsc2UgaWYoYnJhbmNoID09PSBuZXh0VHlwZSkge1xyXG4gICAgICAgICAgICAgIGxpc3RlbmVycyA9IGxpc3RlbmVycy5jb25jYXQoc2VhcmNoTGlzdGVuZXJUcmVlKGhhbmRsZXJzLCB0eXBlLCB0cmVlW2JyYW5jaF0sIGkrMikpO1xyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgIC8vIE5vIG1hdGNoIG9uIHRoaXMgb25lLCBzaGlmdCBpbnRvIHRoZSB0cmVlIGJ1dCBub3QgaW4gdGhlIHR5cGUgYXJyYXkuXHJcbiAgICAgICAgICAgICAgbGlzdGVuZXJzID0gbGlzdGVuZXJzLmNvbmNhdChzZWFyY2hMaXN0ZW5lclRyZWUoaGFuZGxlcnMsIHR5cGUsIHRyZWVbYnJhbmNoXSwgaSkpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBsaXN0ZW5lcnM7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGxpc3RlbmVycyA9IGxpc3RlbmVycy5jb25jYXQoc2VhcmNoTGlzdGVuZXJUcmVlKGhhbmRsZXJzLCB0eXBlLCB0cmVlW2N1cnJlbnRUeXBlXSwgaSsxKSk7XHJcbiAgICB9XHJcblxyXG4gICAgeFRyZWUgPSB0cmVlWycqJ107XHJcbiAgICBpZiAoeFRyZWUpIHtcclxuICAgICAgLy9cclxuICAgICAgLy8gSWYgdGhlIGxpc3RlbmVyIHRyZWUgd2lsbCBhbGxvdyBhbnkgbWF0Y2ggZm9yIHRoaXMgcGFydCxcclxuICAgICAgLy8gdGhlbiByZWN1cnNpdmVseSBleHBsb3JlIGFsbCBicmFuY2hlcyBvZiB0aGUgdHJlZVxyXG4gICAgICAvL1xyXG4gICAgICBzZWFyY2hMaXN0ZW5lclRyZWUoaGFuZGxlcnMsIHR5cGUsIHhUcmVlLCBpKzEpO1xyXG4gICAgfVxyXG5cclxuICAgIHh4VHJlZSA9IHRyZWVbJyoqJ107XHJcbiAgICBpZih4eFRyZWUpIHtcclxuICAgICAgaWYoaSA8IHR5cGVMZW5ndGgpIHtcclxuICAgICAgICBpZih4eFRyZWUuX2xpc3RlbmVycykge1xyXG4gICAgICAgICAgLy8gSWYgd2UgaGF2ZSBhIGxpc3RlbmVyIG9uIGEgJyoqJywgaXQgd2lsbCBjYXRjaCBhbGwsIHNvIGFkZCBpdHMgaGFuZGxlci5cclxuICAgICAgICAgIHNlYXJjaExpc3RlbmVyVHJlZShoYW5kbGVycywgdHlwZSwgeHhUcmVlLCB0eXBlTGVuZ3RoKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIEJ1aWxkIGFycmF5cyBvZiBtYXRjaGluZyBuZXh0IGJyYW5jaGVzIGFuZCBvdGhlcnMuXHJcbiAgICAgICAgZm9yKGJyYW5jaCBpbiB4eFRyZWUpIHtcclxuICAgICAgICAgIGlmKGJyYW5jaCAhPT0gJ19saXN0ZW5lcnMnICYmIHh4VHJlZS5oYXNPd25Qcm9wZXJ0eShicmFuY2gpKSB7XHJcbiAgICAgICAgICAgIGlmKGJyYW5jaCA9PT0gbmV4dFR5cGUpIHtcclxuICAgICAgICAgICAgICAvLyBXZSBrbm93IHRoZSBuZXh0IGVsZW1lbnQgd2lsbCBtYXRjaCwgc28ganVtcCB0d2ljZS5cclxuICAgICAgICAgICAgICBzZWFyY2hMaXN0ZW5lclRyZWUoaGFuZGxlcnMsIHR5cGUsIHh4VHJlZVticmFuY2hdLCBpKzIpO1xyXG4gICAgICAgICAgICB9IGVsc2UgaWYoYnJhbmNoID09PSBjdXJyZW50VHlwZSkge1xyXG4gICAgICAgICAgICAgIC8vIEN1cnJlbnQgbm9kZSBtYXRjaGVzLCBtb3ZlIGludG8gdGhlIHRyZWUuXHJcbiAgICAgICAgICAgICAgc2VhcmNoTGlzdGVuZXJUcmVlKGhhbmRsZXJzLCB0eXBlLCB4eFRyZWVbYnJhbmNoXSwgaSsxKTtcclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICBpc29sYXRlZEJyYW5jaCA9IHt9O1xyXG4gICAgICAgICAgICAgIGlzb2xhdGVkQnJhbmNoW2JyYW5jaF0gPSB4eFRyZWVbYnJhbmNoXTtcclxuICAgICAgICAgICAgICBzZWFyY2hMaXN0ZW5lclRyZWUoaGFuZGxlcnMsIHR5cGUsIHsgJyoqJzogaXNvbGF0ZWRCcmFuY2ggfSwgaSsxKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgfSBlbHNlIGlmKHh4VHJlZS5fbGlzdGVuZXJzKSB7XHJcbiAgICAgICAgLy8gV2UgaGF2ZSByZWFjaGVkIHRoZSBlbmQgYW5kIHN0aWxsIG9uIGEgJyoqJ1xyXG4gICAgICAgIHNlYXJjaExpc3RlbmVyVHJlZShoYW5kbGVycywgdHlwZSwgeHhUcmVlLCB0eXBlTGVuZ3RoKTtcclxuICAgICAgfSBlbHNlIGlmKHh4VHJlZVsnKiddICYmIHh4VHJlZVsnKiddLl9saXN0ZW5lcnMpIHtcclxuICAgICAgICBzZWFyY2hMaXN0ZW5lclRyZWUoaGFuZGxlcnMsIHR5cGUsIHh4VHJlZVsnKiddLCB0eXBlTGVuZ3RoKTtcclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiBsaXN0ZW5lcnM7XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBncm93TGlzdGVuZXJUcmVlKHR5cGUsIGxpc3RlbmVyKSB7XHJcblxyXG4gICAgdHlwZSA9IHR5cGVvZiB0eXBlID09PSAnc3RyaW5nJyA/IHR5cGUuc3BsaXQodGhpcy5kZWxpbWl0ZXIpIDogdHlwZS5zbGljZSgpO1xyXG5cclxuICAgIC8vXHJcbiAgICAvLyBMb29rcyBmb3IgdHdvIGNvbnNlY3V0aXZlICcqKicsIGlmIHNvLCBkb24ndCBhZGQgdGhlIGV2ZW50IGF0IGFsbC5cclxuICAgIC8vXHJcbiAgICBmb3IodmFyIGkgPSAwLCBsZW4gPSB0eXBlLmxlbmd0aDsgaSsxIDwgbGVuOyBpKyspIHtcclxuICAgICAgaWYodHlwZVtpXSA9PT0gJyoqJyAmJiB0eXBlW2krMV0gPT09ICcqKicpIHtcclxuICAgICAgICByZXR1cm47XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICB2YXIgdHJlZSA9IHRoaXMubGlzdGVuZXJUcmVlO1xyXG4gICAgdmFyIG5hbWUgPSB0eXBlLnNoaWZ0KCk7XHJcblxyXG4gICAgd2hpbGUgKG5hbWUgIT09IHVuZGVmaW5lZCkge1xyXG5cclxuICAgICAgaWYgKCF0cmVlW25hbWVdKSB7XHJcbiAgICAgICAgdHJlZVtuYW1lXSA9IHt9O1xyXG4gICAgICB9XHJcblxyXG4gICAgICB0cmVlID0gdHJlZVtuYW1lXTtcclxuXHJcbiAgICAgIGlmICh0eXBlLmxlbmd0aCA9PT0gMCkge1xyXG5cclxuICAgICAgICBpZiAoIXRyZWUuX2xpc3RlbmVycykge1xyXG4gICAgICAgICAgdHJlZS5fbGlzdGVuZXJzID0gbGlzdGVuZXI7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGVsc2Uge1xyXG4gICAgICAgICAgaWYgKHR5cGVvZiB0cmVlLl9saXN0ZW5lcnMgPT09ICdmdW5jdGlvbicpIHtcclxuICAgICAgICAgICAgdHJlZS5fbGlzdGVuZXJzID0gW3RyZWUuX2xpc3RlbmVyc107XHJcbiAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgdHJlZS5fbGlzdGVuZXJzLnB1c2gobGlzdGVuZXIpO1xyXG5cclxuICAgICAgICAgIGlmIChcclxuICAgICAgICAgICAgIXRyZWUuX2xpc3RlbmVycy53YXJuZWQgJiZcclxuICAgICAgICAgICAgdGhpcy5fbWF4TGlzdGVuZXJzID4gMCAmJlxyXG4gICAgICAgICAgICB0cmVlLl9saXN0ZW5lcnMubGVuZ3RoID4gdGhpcy5fbWF4TGlzdGVuZXJzXHJcbiAgICAgICAgICApIHtcclxuICAgICAgICAgICAgdHJlZS5fbGlzdGVuZXJzLndhcm5lZCA9IHRydWU7XHJcbiAgICAgICAgICAgIGxvZ1Bvc3NpYmxlTWVtb3J5TGVhay5jYWxsKHRoaXMsIHRyZWUuX2xpc3RlbmVycy5sZW5ndGgsIG5hbWUpO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgfVxyXG4gICAgICBuYW1lID0gdHlwZS5zaGlmdCgpO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIHRydWU7XHJcbiAgfVxyXG5cclxuICAvLyBCeSBkZWZhdWx0IEV2ZW50RW1pdHRlcnMgd2lsbCBwcmludCBhIHdhcm5pbmcgaWYgbW9yZSB0aGFuXHJcbiAgLy8gMTAgbGlzdGVuZXJzIGFyZSBhZGRlZCB0byBpdC4gVGhpcyBpcyBhIHVzZWZ1bCBkZWZhdWx0IHdoaWNoXHJcbiAgLy8gaGVscHMgZmluZGluZyBtZW1vcnkgbGVha3MuXHJcbiAgLy9cclxuICAvLyBPYnZpb3VzbHkgbm90IGFsbCBFbWl0dGVycyBzaG91bGQgYmUgbGltaXRlZCB0byAxMC4gVGhpcyBmdW5jdGlvbiBhbGxvd3NcclxuICAvLyB0aGF0IHRvIGJlIGluY3JlYXNlZC4gU2V0IHRvIHplcm8gZm9yIHVubGltaXRlZC5cclxuXHJcbiAgRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5kZWxpbWl0ZXIgPSAnLic7XHJcblxyXG4gIEV2ZW50RW1pdHRlci5wcm90b3R5cGUuc2V0TWF4TGlzdGVuZXJzID0gZnVuY3Rpb24obikge1xyXG4gICAgaWYgKG4gIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICB0aGlzLl9tYXhMaXN0ZW5lcnMgPSBuO1xyXG4gICAgICBpZiAoIXRoaXMuX2NvbmYpIHRoaXMuX2NvbmYgPSB7fTtcclxuICAgICAgdGhpcy5fY29uZi5tYXhMaXN0ZW5lcnMgPSBuO1xyXG4gICAgfVxyXG4gIH07XHJcblxyXG4gIEV2ZW50RW1pdHRlci5wcm90b3R5cGUuZXZlbnQgPSAnJztcclxuXHJcblxyXG4gIEV2ZW50RW1pdHRlci5wcm90b3R5cGUub25jZSA9IGZ1bmN0aW9uKGV2ZW50LCBmbikge1xyXG4gICAgcmV0dXJuIHRoaXMuX29uY2UoZXZlbnQsIGZuLCBmYWxzZSk7XHJcbiAgfTtcclxuXHJcbiAgRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5wcmVwZW5kT25jZUxpc3RlbmVyID0gZnVuY3Rpb24oZXZlbnQsIGZuKSB7XHJcbiAgICByZXR1cm4gdGhpcy5fb25jZShldmVudCwgZm4sIHRydWUpO1xyXG4gIH07XHJcblxyXG4gIEV2ZW50RW1pdHRlci5wcm90b3R5cGUuX29uY2UgPSBmdW5jdGlvbihldmVudCwgZm4sIHByZXBlbmQpIHtcclxuICAgIHRoaXMuX21hbnkoZXZlbnQsIDEsIGZuLCBwcmVwZW5kKTtcclxuICAgIHJldHVybiB0aGlzO1xyXG4gIH07XHJcblxyXG4gIEV2ZW50RW1pdHRlci5wcm90b3R5cGUubWFueSA9IGZ1bmN0aW9uKGV2ZW50LCB0dGwsIGZuKSB7XHJcbiAgICByZXR1cm4gdGhpcy5fbWFueShldmVudCwgdHRsLCBmbiwgZmFsc2UpO1xyXG4gIH1cclxuXHJcbiAgRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5wcmVwZW5kTWFueSA9IGZ1bmN0aW9uKGV2ZW50LCB0dGwsIGZuKSB7XHJcbiAgICByZXR1cm4gdGhpcy5fbWFueShldmVudCwgdHRsLCBmbiwgdHJ1ZSk7XHJcbiAgfVxyXG5cclxuICBFdmVudEVtaXR0ZXIucHJvdG90eXBlLl9tYW55ID0gZnVuY3Rpb24oZXZlbnQsIHR0bCwgZm4sIHByZXBlbmQpIHtcclxuICAgIHZhciBzZWxmID0gdGhpcztcclxuXHJcbiAgICBpZiAodHlwZW9mIGZuICE9PSAnZnVuY3Rpb24nKSB7XHJcbiAgICAgIHRocm93IG5ldyBFcnJvcignbWFueSBvbmx5IGFjY2VwdHMgaW5zdGFuY2VzIG9mIEZ1bmN0aW9uJyk7XHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gbGlzdGVuZXIoKSB7XHJcbiAgICAgIGlmICgtLXR0bCA9PT0gMCkge1xyXG4gICAgICAgIHNlbGYub2ZmKGV2ZW50LCBsaXN0ZW5lcik7XHJcbiAgICAgIH1cclxuICAgICAgcmV0dXJuIGZuLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XHJcbiAgICB9XHJcblxyXG4gICAgbGlzdGVuZXIuX29yaWdpbiA9IGZuO1xyXG5cclxuICAgIHRoaXMuX29uKGV2ZW50LCBsaXN0ZW5lciwgcHJlcGVuZCk7XHJcblxyXG4gICAgcmV0dXJuIHNlbGY7XHJcbiAgfTtcclxuXHJcbiAgRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5lbWl0ID0gZnVuY3Rpb24oKSB7XHJcblxyXG4gICAgdGhpcy5fZXZlbnRzIHx8IGluaXQuY2FsbCh0aGlzKTtcclxuXHJcbiAgICB2YXIgdHlwZSA9IGFyZ3VtZW50c1swXTtcclxuXHJcbiAgICBpZiAodHlwZSA9PT0gJ25ld0xpc3RlbmVyJyAmJiAhdGhpcy5uZXdMaXN0ZW5lcikge1xyXG4gICAgICBpZiAoIXRoaXMuX2V2ZW50cy5uZXdMaXN0ZW5lcikge1xyXG4gICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHZhciBhbCA9IGFyZ3VtZW50cy5sZW5ndGg7XHJcbiAgICB2YXIgYXJncyxsLGksajtcclxuICAgIHZhciBoYW5kbGVyO1xyXG5cclxuICAgIGlmICh0aGlzLl9hbGwgJiYgdGhpcy5fYWxsLmxlbmd0aCkge1xyXG4gICAgICBoYW5kbGVyID0gdGhpcy5fYWxsLnNsaWNlKCk7XHJcbiAgICAgIGlmIChhbCA+IDMpIHtcclxuICAgICAgICBhcmdzID0gbmV3IEFycmF5KGFsKTtcclxuICAgICAgICBmb3IgKGogPSAwOyBqIDwgYWw7IGorKykgYXJnc1tqXSA9IGFyZ3VtZW50c1tqXTtcclxuICAgICAgfVxyXG5cclxuICAgICAgZm9yIChpID0gMCwgbCA9IGhhbmRsZXIubGVuZ3RoOyBpIDwgbDsgaSsrKSB7XHJcbiAgICAgICAgdGhpcy5ldmVudCA9IHR5cGU7XHJcbiAgICAgICAgc3dpdGNoIChhbCkge1xyXG4gICAgICAgIGNhc2UgMTpcclxuICAgICAgICAgIGhhbmRsZXJbaV0uY2FsbCh0aGlzLCB0eXBlKTtcclxuICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgMjpcclxuICAgICAgICAgIGhhbmRsZXJbaV0uY2FsbCh0aGlzLCB0eXBlLCBhcmd1bWVudHNbMV0pO1xyXG4gICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSAzOlxyXG4gICAgICAgICAgaGFuZGxlcltpXS5jYWxsKHRoaXMsIHR5cGUsIGFyZ3VtZW50c1sxXSwgYXJndW1lbnRzWzJdKTtcclxuICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgICBoYW5kbGVyW2ldLmFwcGx5KHRoaXMsIGFyZ3MpO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGlmICh0aGlzLndpbGRjYXJkKSB7XHJcbiAgICAgIGhhbmRsZXIgPSBbXTtcclxuICAgICAgdmFyIG5zID0gdHlwZW9mIHR5cGUgPT09ICdzdHJpbmcnID8gdHlwZS5zcGxpdCh0aGlzLmRlbGltaXRlcikgOiB0eXBlLnNsaWNlKCk7XHJcbiAgICAgIHNlYXJjaExpc3RlbmVyVHJlZS5jYWxsKHRoaXMsIGhhbmRsZXIsIG5zLCB0aGlzLmxpc3RlbmVyVHJlZSwgMCk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICBoYW5kbGVyID0gdGhpcy5fZXZlbnRzW3R5cGVdO1xyXG4gICAgICBpZiAodHlwZW9mIGhhbmRsZXIgPT09ICdmdW5jdGlvbicpIHtcclxuICAgICAgICB0aGlzLmV2ZW50ID0gdHlwZTtcclxuICAgICAgICBzd2l0Y2ggKGFsKSB7XHJcbiAgICAgICAgY2FzZSAxOlxyXG4gICAgICAgICAgaGFuZGxlci5jYWxsKHRoaXMpO1xyXG4gICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSAyOlxyXG4gICAgICAgICAgaGFuZGxlci5jYWxsKHRoaXMsIGFyZ3VtZW50c1sxXSk7XHJcbiAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIDM6XHJcbiAgICAgICAgICBoYW5kbGVyLmNhbGwodGhpcywgYXJndW1lbnRzWzFdLCBhcmd1bWVudHNbMl0pO1xyXG4gICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgIGFyZ3MgPSBuZXcgQXJyYXkoYWwgLSAxKTtcclxuICAgICAgICAgIGZvciAoaiA9IDE7IGogPCBhbDsgaisrKSBhcmdzW2ogLSAxXSA9IGFyZ3VtZW50c1tqXTtcclxuICAgICAgICAgIGhhbmRsZXIuYXBwbHkodGhpcywgYXJncyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgICB9IGVsc2UgaWYgKGhhbmRsZXIpIHtcclxuICAgICAgICAvLyBuZWVkIHRvIG1ha2UgY29weSBvZiBoYW5kbGVycyBiZWNhdXNlIGxpc3QgY2FuIGNoYW5nZSBpbiB0aGUgbWlkZGxlXHJcbiAgICAgICAgLy8gb2YgZW1pdCBjYWxsXHJcbiAgICAgICAgaGFuZGxlciA9IGhhbmRsZXIuc2xpY2UoKTtcclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGlmIChoYW5kbGVyICYmIGhhbmRsZXIubGVuZ3RoKSB7XHJcbiAgICAgIGlmIChhbCA+IDMpIHtcclxuICAgICAgICBhcmdzID0gbmV3IEFycmF5KGFsIC0gMSk7XHJcbiAgICAgICAgZm9yIChqID0gMTsgaiA8IGFsOyBqKyspIGFyZ3NbaiAtIDFdID0gYXJndW1lbnRzW2pdO1xyXG4gICAgICB9XHJcbiAgICAgIGZvciAoaSA9IDAsIGwgPSBoYW5kbGVyLmxlbmd0aDsgaSA8IGw7IGkrKykge1xyXG4gICAgICAgIHRoaXMuZXZlbnQgPSB0eXBlO1xyXG4gICAgICAgIHN3aXRjaCAoYWwpIHtcclxuICAgICAgICBjYXNlIDE6XHJcbiAgICAgICAgICBoYW5kbGVyW2ldLmNhbGwodGhpcyk7XHJcbiAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIDI6XHJcbiAgICAgICAgICBoYW5kbGVyW2ldLmNhbGwodGhpcywgYXJndW1lbnRzWzFdKTtcclxuICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgMzpcclxuICAgICAgICAgIGhhbmRsZXJbaV0uY2FsbCh0aGlzLCBhcmd1bWVudHNbMV0sIGFyZ3VtZW50c1syXSk7XHJcbiAgICAgICAgICBicmVhaztcclxuICAgICAgICBkZWZhdWx0OlxyXG4gICAgICAgICAgaGFuZGxlcltpXS5hcHBseSh0aGlzLCBhcmdzKTtcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICB9IGVsc2UgaWYgKCF0aGlzLl9hbGwgJiYgdHlwZSA9PT0gJ2Vycm9yJykge1xyXG4gICAgICBpZiAoYXJndW1lbnRzWzFdIGluc3RhbmNlb2YgRXJyb3IpIHtcclxuICAgICAgICB0aHJvdyBhcmd1bWVudHNbMV07IC8vIFVuaGFuZGxlZCAnZXJyb3InIGV2ZW50XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiVW5jYXVnaHQsIHVuc3BlY2lmaWVkICdlcnJvcicgZXZlbnQuXCIpO1xyXG4gICAgICB9XHJcbiAgICAgIHJldHVybiBmYWxzZTtcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gISF0aGlzLl9hbGw7XHJcbiAgfTtcclxuXHJcbiAgRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5lbWl0QXN5bmMgPSBmdW5jdGlvbigpIHtcclxuXHJcbiAgICB0aGlzLl9ldmVudHMgfHwgaW5pdC5jYWxsKHRoaXMpO1xyXG5cclxuICAgIHZhciB0eXBlID0gYXJndW1lbnRzWzBdO1xyXG5cclxuICAgIGlmICh0eXBlID09PSAnbmV3TGlzdGVuZXInICYmICF0aGlzLm5ld0xpc3RlbmVyKSB7XHJcbiAgICAgICAgaWYgKCF0aGlzLl9ldmVudHMubmV3TGlzdGVuZXIpIHsgcmV0dXJuIFByb21pc2UucmVzb2x2ZShbZmFsc2VdKTsgfVxyXG4gICAgfVxyXG5cclxuICAgIHZhciBwcm9taXNlcz0gW107XHJcblxyXG4gICAgdmFyIGFsID0gYXJndW1lbnRzLmxlbmd0aDtcclxuICAgIHZhciBhcmdzLGwsaSxqO1xyXG4gICAgdmFyIGhhbmRsZXI7XHJcblxyXG4gICAgaWYgKHRoaXMuX2FsbCkge1xyXG4gICAgICBpZiAoYWwgPiAzKSB7XHJcbiAgICAgICAgYXJncyA9IG5ldyBBcnJheShhbCk7XHJcbiAgICAgICAgZm9yIChqID0gMTsgaiA8IGFsOyBqKyspIGFyZ3Nbal0gPSBhcmd1bWVudHNbal07XHJcbiAgICAgIH1cclxuICAgICAgZm9yIChpID0gMCwgbCA9IHRoaXMuX2FsbC5sZW5ndGg7IGkgPCBsOyBpKyspIHtcclxuICAgICAgICB0aGlzLmV2ZW50ID0gdHlwZTtcclxuICAgICAgICBzd2l0Y2ggKGFsKSB7XHJcbiAgICAgICAgY2FzZSAxOlxyXG4gICAgICAgICAgcHJvbWlzZXMucHVzaCh0aGlzLl9hbGxbaV0uY2FsbCh0aGlzLCB0eXBlKSk7XHJcbiAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIDI6XHJcbiAgICAgICAgICBwcm9taXNlcy5wdXNoKHRoaXMuX2FsbFtpXS5jYWxsKHRoaXMsIHR5cGUsIGFyZ3VtZW50c1sxXSkpO1xyXG4gICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSAzOlxyXG4gICAgICAgICAgcHJvbWlzZXMucHVzaCh0aGlzLl9hbGxbaV0uY2FsbCh0aGlzLCB0eXBlLCBhcmd1bWVudHNbMV0sIGFyZ3VtZW50c1syXSkpO1xyXG4gICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgIHByb21pc2VzLnB1c2godGhpcy5fYWxsW2ldLmFwcGx5KHRoaXMsIGFyZ3MpKTtcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBpZiAodGhpcy53aWxkY2FyZCkge1xyXG4gICAgICBoYW5kbGVyID0gW107XHJcbiAgICAgIHZhciBucyA9IHR5cGVvZiB0eXBlID09PSAnc3RyaW5nJyA/IHR5cGUuc3BsaXQodGhpcy5kZWxpbWl0ZXIpIDogdHlwZS5zbGljZSgpO1xyXG4gICAgICBzZWFyY2hMaXN0ZW5lclRyZWUuY2FsbCh0aGlzLCBoYW5kbGVyLCBucywgdGhpcy5saXN0ZW5lclRyZWUsIDApO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgaGFuZGxlciA9IHRoaXMuX2V2ZW50c1t0eXBlXTtcclxuICAgIH1cclxuXHJcbiAgICBpZiAodHlwZW9mIGhhbmRsZXIgPT09ICdmdW5jdGlvbicpIHtcclxuICAgICAgdGhpcy5ldmVudCA9IHR5cGU7XHJcbiAgICAgIHN3aXRjaCAoYWwpIHtcclxuICAgICAgY2FzZSAxOlxyXG4gICAgICAgIHByb21pc2VzLnB1c2goaGFuZGxlci5jYWxsKHRoaXMpKTtcclxuICAgICAgICBicmVhaztcclxuICAgICAgY2FzZSAyOlxyXG4gICAgICAgIHByb21pc2VzLnB1c2goaGFuZGxlci5jYWxsKHRoaXMsIGFyZ3VtZW50c1sxXSkpO1xyXG4gICAgICAgIGJyZWFrO1xyXG4gICAgICBjYXNlIDM6XHJcbiAgICAgICAgcHJvbWlzZXMucHVzaChoYW5kbGVyLmNhbGwodGhpcywgYXJndW1lbnRzWzFdLCBhcmd1bWVudHNbMl0pKTtcclxuICAgICAgICBicmVhaztcclxuICAgICAgZGVmYXVsdDpcclxuICAgICAgICBhcmdzID0gbmV3IEFycmF5KGFsIC0gMSk7XHJcbiAgICAgICAgZm9yIChqID0gMTsgaiA8IGFsOyBqKyspIGFyZ3NbaiAtIDFdID0gYXJndW1lbnRzW2pdO1xyXG4gICAgICAgIHByb21pc2VzLnB1c2goaGFuZGxlci5hcHBseSh0aGlzLCBhcmdzKSk7XHJcbiAgICAgIH1cclxuICAgIH0gZWxzZSBpZiAoaGFuZGxlciAmJiBoYW5kbGVyLmxlbmd0aCkge1xyXG4gICAgICBoYW5kbGVyID0gaGFuZGxlci5zbGljZSgpO1xyXG4gICAgICBpZiAoYWwgPiAzKSB7XHJcbiAgICAgICAgYXJncyA9IG5ldyBBcnJheShhbCAtIDEpO1xyXG4gICAgICAgIGZvciAoaiA9IDE7IGogPCBhbDsgaisrKSBhcmdzW2ogLSAxXSA9IGFyZ3VtZW50c1tqXTtcclxuICAgICAgfVxyXG4gICAgICBmb3IgKGkgPSAwLCBsID0gaGFuZGxlci5sZW5ndGg7IGkgPCBsOyBpKyspIHtcclxuICAgICAgICB0aGlzLmV2ZW50ID0gdHlwZTtcclxuICAgICAgICBzd2l0Y2ggKGFsKSB7XHJcbiAgICAgICAgY2FzZSAxOlxyXG4gICAgICAgICAgcHJvbWlzZXMucHVzaChoYW5kbGVyW2ldLmNhbGwodGhpcykpO1xyXG4gICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSAyOlxyXG4gICAgICAgICAgcHJvbWlzZXMucHVzaChoYW5kbGVyW2ldLmNhbGwodGhpcywgYXJndW1lbnRzWzFdKSk7XHJcbiAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIDM6XHJcbiAgICAgICAgICBwcm9taXNlcy5wdXNoKGhhbmRsZXJbaV0uY2FsbCh0aGlzLCBhcmd1bWVudHNbMV0sIGFyZ3VtZW50c1syXSkpO1xyXG4gICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgIHByb21pc2VzLnB1c2goaGFuZGxlcltpXS5hcHBseSh0aGlzLCBhcmdzKSk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICB9IGVsc2UgaWYgKCF0aGlzLl9hbGwgJiYgdHlwZSA9PT0gJ2Vycm9yJykge1xyXG4gICAgICBpZiAoYXJndW1lbnRzWzFdIGluc3RhbmNlb2YgRXJyb3IpIHtcclxuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QoYXJndW1lbnRzWzFdKTsgLy8gVW5oYW5kbGVkICdlcnJvcicgZXZlbnRcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QoXCJVbmNhdWdodCwgdW5zcGVjaWZpZWQgJ2Vycm9yJyBldmVudC5cIik7XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gUHJvbWlzZS5hbGwocHJvbWlzZXMpO1xyXG4gIH07XHJcblxyXG4gIEV2ZW50RW1pdHRlci5wcm90b3R5cGUub24gPSBmdW5jdGlvbih0eXBlLCBsaXN0ZW5lcikge1xyXG4gICAgcmV0dXJuIHRoaXMuX29uKHR5cGUsIGxpc3RlbmVyLCBmYWxzZSk7XHJcbiAgfTtcclxuXHJcbiAgRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5wcmVwZW5kTGlzdGVuZXIgPSBmdW5jdGlvbih0eXBlLCBsaXN0ZW5lcikge1xyXG4gICAgcmV0dXJuIHRoaXMuX29uKHR5cGUsIGxpc3RlbmVyLCB0cnVlKTtcclxuICB9O1xyXG5cclxuICBFdmVudEVtaXR0ZXIucHJvdG90eXBlLm9uQW55ID0gZnVuY3Rpb24oZm4pIHtcclxuICAgIHJldHVybiB0aGlzLl9vbkFueShmbiwgZmFsc2UpO1xyXG4gIH07XHJcblxyXG4gIEV2ZW50RW1pdHRlci5wcm90b3R5cGUucHJlcGVuZEFueSA9IGZ1bmN0aW9uKGZuKSB7XHJcbiAgICByZXR1cm4gdGhpcy5fb25BbnkoZm4sIHRydWUpO1xyXG4gIH07XHJcblxyXG4gIEV2ZW50RW1pdHRlci5wcm90b3R5cGUuYWRkTGlzdGVuZXIgPSBFdmVudEVtaXR0ZXIucHJvdG90eXBlLm9uO1xyXG5cclxuICBFdmVudEVtaXR0ZXIucHJvdG90eXBlLl9vbkFueSA9IGZ1bmN0aW9uKGZuLCBwcmVwZW5kKXtcclxuICAgIGlmICh0eXBlb2YgZm4gIT09ICdmdW5jdGlvbicpIHtcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdvbkFueSBvbmx5IGFjY2VwdHMgaW5zdGFuY2VzIG9mIEZ1bmN0aW9uJyk7XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKCF0aGlzLl9hbGwpIHtcclxuICAgICAgdGhpcy5fYWxsID0gW107XHJcbiAgICB9XHJcblxyXG4gICAgLy8gQWRkIHRoZSBmdW5jdGlvbiB0byB0aGUgZXZlbnQgbGlzdGVuZXIgY29sbGVjdGlvbi5cclxuICAgIGlmKHByZXBlbmQpe1xyXG4gICAgICB0aGlzLl9hbGwudW5zaGlmdChmbik7XHJcbiAgICB9ZWxzZXtcclxuICAgICAgdGhpcy5fYWxsLnB1c2goZm4pO1xyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiB0aGlzO1xyXG4gIH1cclxuXHJcbiAgRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5fb24gPSBmdW5jdGlvbih0eXBlLCBsaXN0ZW5lciwgcHJlcGVuZCkge1xyXG4gICAgaWYgKHR5cGVvZiB0eXBlID09PSAnZnVuY3Rpb24nKSB7XHJcbiAgICAgIHRoaXMuX29uQW55KHR5cGUsIGxpc3RlbmVyKTtcclxuICAgICAgcmV0dXJuIHRoaXM7XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKHR5cGVvZiBsaXN0ZW5lciAhPT0gJ2Z1bmN0aW9uJykge1xyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ29uIG9ubHkgYWNjZXB0cyBpbnN0YW5jZXMgb2YgRnVuY3Rpb24nKTtcclxuICAgIH1cclxuICAgIHRoaXMuX2V2ZW50cyB8fCBpbml0LmNhbGwodGhpcyk7XHJcblxyXG4gICAgLy8gVG8gYXZvaWQgcmVjdXJzaW9uIGluIHRoZSBjYXNlIHRoYXQgdHlwZSA9PSBcIm5ld0xpc3RlbmVyc1wiISBCZWZvcmVcclxuICAgIC8vIGFkZGluZyBpdCB0byB0aGUgbGlzdGVuZXJzLCBmaXJzdCBlbWl0IFwibmV3TGlzdGVuZXJzXCIuXHJcbiAgICB0aGlzLmVtaXQoJ25ld0xpc3RlbmVyJywgdHlwZSwgbGlzdGVuZXIpO1xyXG5cclxuICAgIGlmICh0aGlzLndpbGRjYXJkKSB7XHJcbiAgICAgIGdyb3dMaXN0ZW5lclRyZWUuY2FsbCh0aGlzLCB0eXBlLCBsaXN0ZW5lcik7XHJcbiAgICAgIHJldHVybiB0aGlzO1xyXG4gICAgfVxyXG5cclxuICAgIGlmICghdGhpcy5fZXZlbnRzW3R5cGVdKSB7XHJcbiAgICAgIC8vIE9wdGltaXplIHRoZSBjYXNlIG9mIG9uZSBsaXN0ZW5lci4gRG9uJ3QgbmVlZCB0aGUgZXh0cmEgYXJyYXkgb2JqZWN0LlxyXG4gICAgICB0aGlzLl9ldmVudHNbdHlwZV0gPSBsaXN0ZW5lcjtcclxuICAgIH1cclxuICAgIGVsc2Uge1xyXG4gICAgICBpZiAodHlwZW9mIHRoaXMuX2V2ZW50c1t0eXBlXSA9PT0gJ2Z1bmN0aW9uJykge1xyXG4gICAgICAgIC8vIENoYW5nZSB0byBhcnJheS5cclxuICAgICAgICB0aGlzLl9ldmVudHNbdHlwZV0gPSBbdGhpcy5fZXZlbnRzW3R5cGVdXTtcclxuICAgICAgfVxyXG5cclxuICAgICAgLy8gSWYgd2UndmUgYWxyZWFkeSBnb3QgYW4gYXJyYXksIGp1c3QgYWRkXHJcbiAgICAgIGlmKHByZXBlbmQpe1xyXG4gICAgICAgIHRoaXMuX2V2ZW50c1t0eXBlXS51bnNoaWZ0KGxpc3RlbmVyKTtcclxuICAgICAgfWVsc2V7XHJcbiAgICAgICAgdGhpcy5fZXZlbnRzW3R5cGVdLnB1c2gobGlzdGVuZXIpO1xyXG4gICAgICB9XHJcblxyXG4gICAgICAvLyBDaGVjayBmb3IgbGlzdGVuZXIgbGVha1xyXG4gICAgICBpZiAoXHJcbiAgICAgICAgIXRoaXMuX2V2ZW50c1t0eXBlXS53YXJuZWQgJiZcclxuICAgICAgICB0aGlzLl9tYXhMaXN0ZW5lcnMgPiAwICYmXHJcbiAgICAgICAgdGhpcy5fZXZlbnRzW3R5cGVdLmxlbmd0aCA+IHRoaXMuX21heExpc3RlbmVyc1xyXG4gICAgICApIHtcclxuICAgICAgICB0aGlzLl9ldmVudHNbdHlwZV0ud2FybmVkID0gdHJ1ZTtcclxuICAgICAgICBsb2dQb3NzaWJsZU1lbW9yeUxlYWsuY2FsbCh0aGlzLCB0aGlzLl9ldmVudHNbdHlwZV0ubGVuZ3RoLCB0eXBlKTtcclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiB0aGlzO1xyXG4gIH1cclxuXHJcbiAgRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5vZmYgPSBmdW5jdGlvbih0eXBlLCBsaXN0ZW5lcikge1xyXG4gICAgaWYgKHR5cGVvZiBsaXN0ZW5lciAhPT0gJ2Z1bmN0aW9uJykge1xyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ3JlbW92ZUxpc3RlbmVyIG9ubHkgdGFrZXMgaW5zdGFuY2VzIG9mIEZ1bmN0aW9uJyk7XHJcbiAgICB9XHJcblxyXG4gICAgdmFyIGhhbmRsZXJzLGxlYWZzPVtdO1xyXG5cclxuICAgIGlmKHRoaXMud2lsZGNhcmQpIHtcclxuICAgICAgdmFyIG5zID0gdHlwZW9mIHR5cGUgPT09ICdzdHJpbmcnID8gdHlwZS5zcGxpdCh0aGlzLmRlbGltaXRlcikgOiB0eXBlLnNsaWNlKCk7XHJcbiAgICAgIGxlYWZzID0gc2VhcmNoTGlzdGVuZXJUcmVlLmNhbGwodGhpcywgbnVsbCwgbnMsIHRoaXMubGlzdGVuZXJUcmVlLCAwKTtcclxuICAgIH1cclxuICAgIGVsc2Uge1xyXG4gICAgICAvLyBkb2VzIG5vdCB1c2UgbGlzdGVuZXJzKCksIHNvIG5vIHNpZGUgZWZmZWN0IG9mIGNyZWF0aW5nIF9ldmVudHNbdHlwZV1cclxuICAgICAgaWYgKCF0aGlzLl9ldmVudHNbdHlwZV0pIHJldHVybiB0aGlzO1xyXG4gICAgICBoYW5kbGVycyA9IHRoaXMuX2V2ZW50c1t0eXBlXTtcclxuICAgICAgbGVhZnMucHVzaCh7X2xpc3RlbmVyczpoYW5kbGVyc30pO1xyXG4gICAgfVxyXG5cclxuICAgIGZvciAodmFyIGlMZWFmPTA7IGlMZWFmPGxlYWZzLmxlbmd0aDsgaUxlYWYrKykge1xyXG4gICAgICB2YXIgbGVhZiA9IGxlYWZzW2lMZWFmXTtcclxuICAgICAgaGFuZGxlcnMgPSBsZWFmLl9saXN0ZW5lcnM7XHJcbiAgICAgIGlmIChpc0FycmF5KGhhbmRsZXJzKSkge1xyXG5cclxuICAgICAgICB2YXIgcG9zaXRpb24gPSAtMTtcclxuXHJcbiAgICAgICAgZm9yICh2YXIgaSA9IDAsIGxlbmd0aCA9IGhhbmRsZXJzLmxlbmd0aDsgaSA8IGxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgICBpZiAoaGFuZGxlcnNbaV0gPT09IGxpc3RlbmVyIHx8XHJcbiAgICAgICAgICAgIChoYW5kbGVyc1tpXS5saXN0ZW5lciAmJiBoYW5kbGVyc1tpXS5saXN0ZW5lciA9PT0gbGlzdGVuZXIpIHx8XHJcbiAgICAgICAgICAgIChoYW5kbGVyc1tpXS5fb3JpZ2luICYmIGhhbmRsZXJzW2ldLl9vcmlnaW4gPT09IGxpc3RlbmVyKSkge1xyXG4gICAgICAgICAgICBwb3NpdGlvbiA9IGk7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYgKHBvc2l0aW9uIDwgMCkge1xyXG4gICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBpZih0aGlzLndpbGRjYXJkKSB7XHJcbiAgICAgICAgICBsZWFmLl9saXN0ZW5lcnMuc3BsaWNlKHBvc2l0aW9uLCAxKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZSB7XHJcbiAgICAgICAgICB0aGlzLl9ldmVudHNbdHlwZV0uc3BsaWNlKHBvc2l0aW9uLCAxKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmIChoYW5kbGVycy5sZW5ndGggPT09IDApIHtcclxuICAgICAgICAgIGlmKHRoaXMud2lsZGNhcmQpIHtcclxuICAgICAgICAgICAgZGVsZXRlIGxlYWYuX2xpc3RlbmVycztcclxuICAgICAgICAgIH1cclxuICAgICAgICAgIGVsc2Uge1xyXG4gICAgICAgICAgICBkZWxldGUgdGhpcy5fZXZlbnRzW3R5cGVdO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5lbWl0KFwicmVtb3ZlTGlzdGVuZXJcIiwgdHlwZSwgbGlzdGVuZXIpO1xyXG5cclxuICAgICAgICByZXR1cm4gdGhpcztcclxuICAgICAgfVxyXG4gICAgICBlbHNlIGlmIChoYW5kbGVycyA9PT0gbGlzdGVuZXIgfHxcclxuICAgICAgICAoaGFuZGxlcnMubGlzdGVuZXIgJiYgaGFuZGxlcnMubGlzdGVuZXIgPT09IGxpc3RlbmVyKSB8fFxyXG4gICAgICAgIChoYW5kbGVycy5fb3JpZ2luICYmIGhhbmRsZXJzLl9vcmlnaW4gPT09IGxpc3RlbmVyKSkge1xyXG4gICAgICAgIGlmKHRoaXMud2lsZGNhcmQpIHtcclxuICAgICAgICAgIGRlbGV0ZSBsZWFmLl9saXN0ZW5lcnM7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGVsc2Uge1xyXG4gICAgICAgICAgZGVsZXRlIHRoaXMuX2V2ZW50c1t0eXBlXTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMuZW1pdChcInJlbW92ZUxpc3RlbmVyXCIsIHR5cGUsIGxpc3RlbmVyKTtcclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIHJlY3Vyc2l2ZWx5R2FyYmFnZUNvbGxlY3Qocm9vdCkge1xyXG4gICAgICBpZiAocm9vdCA9PT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgICB9XHJcbiAgICAgIHZhciBrZXlzID0gT2JqZWN0LmtleXMocm9vdCk7XHJcbiAgICAgIGZvciAodmFyIGkgaW4ga2V5cykge1xyXG4gICAgICAgIHZhciBrZXkgPSBrZXlzW2ldO1xyXG4gICAgICAgIHZhciBvYmogPSByb290W2tleV07XHJcbiAgICAgICAgaWYgKChvYmogaW5zdGFuY2VvZiBGdW5jdGlvbikgfHwgKHR5cGVvZiBvYmogIT09IFwib2JqZWN0XCIpIHx8IChvYmogPT09IG51bGwpKVxyXG4gICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgaWYgKE9iamVjdC5rZXlzKG9iaikubGVuZ3RoID4gMCkge1xyXG4gICAgICAgICAgcmVjdXJzaXZlbHlHYXJiYWdlQ29sbGVjdChyb290W2tleV0pO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAoT2JqZWN0LmtleXMob2JqKS5sZW5ndGggPT09IDApIHtcclxuICAgICAgICAgIGRlbGV0ZSByb290W2tleV07XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgICByZWN1cnNpdmVseUdhcmJhZ2VDb2xsZWN0KHRoaXMubGlzdGVuZXJUcmVlKTtcclxuXHJcbiAgICByZXR1cm4gdGhpcztcclxuICB9O1xyXG5cclxuICBFdmVudEVtaXR0ZXIucHJvdG90eXBlLm9mZkFueSA9IGZ1bmN0aW9uKGZuKSB7XHJcbiAgICB2YXIgaSA9IDAsIGwgPSAwLCBmbnM7XHJcbiAgICBpZiAoZm4gJiYgdGhpcy5fYWxsICYmIHRoaXMuX2FsbC5sZW5ndGggPiAwKSB7XHJcbiAgICAgIGZucyA9IHRoaXMuX2FsbDtcclxuICAgICAgZm9yKGkgPSAwLCBsID0gZm5zLmxlbmd0aDsgaSA8IGw7IGkrKykge1xyXG4gICAgICAgIGlmKGZuID09PSBmbnNbaV0pIHtcclxuICAgICAgICAgIGZucy5zcGxpY2UoaSwgMSk7XHJcbiAgICAgICAgICB0aGlzLmVtaXQoXCJyZW1vdmVMaXN0ZW5lckFueVwiLCBmbik7XHJcbiAgICAgICAgICByZXR1cm4gdGhpcztcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIGZucyA9IHRoaXMuX2FsbDtcclxuICAgICAgZm9yKGkgPSAwLCBsID0gZm5zLmxlbmd0aDsgaSA8IGw7IGkrKylcclxuICAgICAgICB0aGlzLmVtaXQoXCJyZW1vdmVMaXN0ZW5lckFueVwiLCBmbnNbaV0pO1xyXG4gICAgICB0aGlzLl9hbGwgPSBbXTtcclxuICAgIH1cclxuICAgIHJldHVybiB0aGlzO1xyXG4gIH07XHJcblxyXG4gIEV2ZW50RW1pdHRlci5wcm90b3R5cGUucmVtb3ZlTGlzdGVuZXIgPSBFdmVudEVtaXR0ZXIucHJvdG90eXBlLm9mZjtcclxuXHJcbiAgRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5yZW1vdmVBbGxMaXN0ZW5lcnMgPSBmdW5jdGlvbih0eXBlKSB7XHJcbiAgICBpZiAoYXJndW1lbnRzLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICAhdGhpcy5fZXZlbnRzIHx8IGluaXQuY2FsbCh0aGlzKTtcclxuICAgICAgcmV0dXJuIHRoaXM7XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKHRoaXMud2lsZGNhcmQpIHtcclxuICAgICAgdmFyIG5zID0gdHlwZW9mIHR5cGUgPT09ICdzdHJpbmcnID8gdHlwZS5zcGxpdCh0aGlzLmRlbGltaXRlcikgOiB0eXBlLnNsaWNlKCk7XHJcbiAgICAgIHZhciBsZWFmcyA9IHNlYXJjaExpc3RlbmVyVHJlZS5jYWxsKHRoaXMsIG51bGwsIG5zLCB0aGlzLmxpc3RlbmVyVHJlZSwgMCk7XHJcblxyXG4gICAgICBmb3IgKHZhciBpTGVhZj0wOyBpTGVhZjxsZWFmcy5sZW5ndGg7IGlMZWFmKyspIHtcclxuICAgICAgICB2YXIgbGVhZiA9IGxlYWZzW2lMZWFmXTtcclxuICAgICAgICBsZWFmLl9saXN0ZW5lcnMgPSBudWxsO1xyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgICBlbHNlIGlmICh0aGlzLl9ldmVudHMpIHtcclxuICAgICAgdGhpcy5fZXZlbnRzW3R5cGVdID0gbnVsbDtcclxuICAgIH1cclxuICAgIHJldHVybiB0aGlzO1xyXG4gIH07XHJcblxyXG4gIEV2ZW50RW1pdHRlci5wcm90b3R5cGUubGlzdGVuZXJzID0gZnVuY3Rpb24odHlwZSkge1xyXG4gICAgaWYgKHRoaXMud2lsZGNhcmQpIHtcclxuICAgICAgdmFyIGhhbmRsZXJzID0gW107XHJcbiAgICAgIHZhciBucyA9IHR5cGVvZiB0eXBlID09PSAnc3RyaW5nJyA/IHR5cGUuc3BsaXQodGhpcy5kZWxpbWl0ZXIpIDogdHlwZS5zbGljZSgpO1xyXG4gICAgICBzZWFyY2hMaXN0ZW5lclRyZWUuY2FsbCh0aGlzLCBoYW5kbGVycywgbnMsIHRoaXMubGlzdGVuZXJUcmVlLCAwKTtcclxuICAgICAgcmV0dXJuIGhhbmRsZXJzO1xyXG4gICAgfVxyXG5cclxuICAgIHRoaXMuX2V2ZW50cyB8fCBpbml0LmNhbGwodGhpcyk7XHJcblxyXG4gICAgaWYgKCF0aGlzLl9ldmVudHNbdHlwZV0pIHRoaXMuX2V2ZW50c1t0eXBlXSA9IFtdO1xyXG4gICAgaWYgKCFpc0FycmF5KHRoaXMuX2V2ZW50c1t0eXBlXSkpIHtcclxuICAgICAgdGhpcy5fZXZlbnRzW3R5cGVdID0gW3RoaXMuX2V2ZW50c1t0eXBlXV07XHJcbiAgICB9XHJcbiAgICByZXR1cm4gdGhpcy5fZXZlbnRzW3R5cGVdO1xyXG4gIH07XHJcblxyXG4gIEV2ZW50RW1pdHRlci5wcm90b3R5cGUuZXZlbnROYW1lcyA9IGZ1bmN0aW9uKCl7XHJcbiAgICByZXR1cm4gT2JqZWN0LmtleXModGhpcy5fZXZlbnRzKTtcclxuICB9XHJcblxyXG4gIEV2ZW50RW1pdHRlci5wcm90b3R5cGUubGlzdGVuZXJDb3VudCA9IGZ1bmN0aW9uKHR5cGUpIHtcclxuICAgIHJldHVybiB0aGlzLmxpc3RlbmVycyh0eXBlKS5sZW5ndGg7XHJcbiAgfTtcclxuXHJcbiAgRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5saXN0ZW5lcnNBbnkgPSBmdW5jdGlvbigpIHtcclxuXHJcbiAgICBpZih0aGlzLl9hbGwpIHtcclxuICAgICAgcmV0dXJuIHRoaXMuX2FsbDtcclxuICAgIH1cclxuICAgIGVsc2Uge1xyXG4gICAgICByZXR1cm4gW107XHJcbiAgICB9XHJcblxyXG4gIH07XHJcblxyXG4gIGlmICh0eXBlb2YgZGVmaW5lID09PSAnZnVuY3Rpb24nICYmIGRlZmluZS5hbWQpIHtcclxuICAgICAvLyBBTUQuIFJlZ2lzdGVyIGFzIGFuIGFub255bW91cyBtb2R1bGUuXHJcbiAgICBkZWZpbmUoZnVuY3Rpb24oKSB7XHJcbiAgICAgIHJldHVybiBFdmVudEVtaXR0ZXI7XHJcbiAgICB9KTtcclxuICB9IGVsc2UgaWYgKHR5cGVvZiBleHBvcnRzID09PSAnb2JqZWN0Jykge1xyXG4gICAgLy8gQ29tbW9uSlNcclxuICAgIG1vZHVsZS5leHBvcnRzID0gRXZlbnRFbWl0dGVyO1xyXG4gIH1cclxuICBlbHNlIHtcclxuICAgIC8vIEJyb3dzZXIgZ2xvYmFsLlxyXG4gICAgd2luZG93LkV2ZW50RW1pdHRlcjIgPSBFdmVudEVtaXR0ZXI7XHJcbiAgfVxyXG59KCk7XHJcbiIsIi8vIHNoaW0gZm9yIHVzaW5nIHByb2Nlc3MgaW4gYnJvd3NlclxudmFyIHByb2Nlc3MgPSBtb2R1bGUuZXhwb3J0cyA9IHt9O1xuXG4vLyBjYWNoZWQgZnJvbSB3aGF0ZXZlciBnbG9iYWwgaXMgcHJlc2VudCBzbyB0aGF0IHRlc3QgcnVubmVycyB0aGF0IHN0dWIgaXRcbi8vIGRvbid0IGJyZWFrIHRoaW5ncy4gIEJ1dCB3ZSBuZWVkIHRvIHdyYXAgaXQgaW4gYSB0cnkgY2F0Y2ggaW4gY2FzZSBpdCBpc1xuLy8gd3JhcHBlZCBpbiBzdHJpY3QgbW9kZSBjb2RlIHdoaWNoIGRvZXNuJ3QgZGVmaW5lIGFueSBnbG9iYWxzLiAgSXQncyBpbnNpZGUgYVxuLy8gZnVuY3Rpb24gYmVjYXVzZSB0cnkvY2F0Y2hlcyBkZW9wdGltaXplIGluIGNlcnRhaW4gZW5naW5lcy5cblxudmFyIGNhY2hlZFNldFRpbWVvdXQ7XG52YXIgY2FjaGVkQ2xlYXJUaW1lb3V0O1xuXG5mdW5jdGlvbiBkZWZhdWx0U2V0VGltb3V0KCkge1xuICAgIHRocm93IG5ldyBFcnJvcignc2V0VGltZW91dCBoYXMgbm90IGJlZW4gZGVmaW5lZCcpO1xufVxuZnVuY3Rpb24gZGVmYXVsdENsZWFyVGltZW91dCAoKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdjbGVhclRpbWVvdXQgaGFzIG5vdCBiZWVuIGRlZmluZWQnKTtcbn1cbihmdW5jdGlvbiAoKSB7XG4gICAgdHJ5IHtcbiAgICAgICAgaWYgKHR5cGVvZiBzZXRUaW1lb3V0ID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICBjYWNoZWRTZXRUaW1lb3V0ID0gc2V0VGltZW91dDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNhY2hlZFNldFRpbWVvdXQgPSBkZWZhdWx0U2V0VGltb3V0O1xuICAgICAgICB9XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBjYWNoZWRTZXRUaW1lb3V0ID0gZGVmYXVsdFNldFRpbW91dDtcbiAgICB9XG4gICAgdHJ5IHtcbiAgICAgICAgaWYgKHR5cGVvZiBjbGVhclRpbWVvdXQgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgIGNhY2hlZENsZWFyVGltZW91dCA9IGNsZWFyVGltZW91dDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNhY2hlZENsZWFyVGltZW91dCA9IGRlZmF1bHRDbGVhclRpbWVvdXQ7XG4gICAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGNhY2hlZENsZWFyVGltZW91dCA9IGRlZmF1bHRDbGVhclRpbWVvdXQ7XG4gICAgfVxufSAoKSlcbmZ1bmN0aW9uIHJ1blRpbWVvdXQoZnVuKSB7XG4gICAgaWYgKGNhY2hlZFNldFRpbWVvdXQgPT09IHNldFRpbWVvdXQpIHtcbiAgICAgICAgLy9ub3JtYWwgZW52aXJvbWVudHMgaW4gc2FuZSBzaXR1YXRpb25zXG4gICAgICAgIHJldHVybiBzZXRUaW1lb3V0KGZ1biwgMCk7XG4gICAgfVxuICAgIC8vIGlmIHNldFRpbWVvdXQgd2Fzbid0IGF2YWlsYWJsZSBidXQgd2FzIGxhdHRlciBkZWZpbmVkXG4gICAgaWYgKChjYWNoZWRTZXRUaW1lb3V0ID09PSBkZWZhdWx0U2V0VGltb3V0IHx8ICFjYWNoZWRTZXRUaW1lb3V0KSAmJiBzZXRUaW1lb3V0KSB7XG4gICAgICAgIGNhY2hlZFNldFRpbWVvdXQgPSBzZXRUaW1lb3V0O1xuICAgICAgICByZXR1cm4gc2V0VGltZW91dChmdW4sIDApO1xuICAgIH1cbiAgICB0cnkge1xuICAgICAgICAvLyB3aGVuIHdoZW4gc29tZWJvZHkgaGFzIHNjcmV3ZWQgd2l0aCBzZXRUaW1lb3V0IGJ1dCBubyBJLkUuIG1hZGRuZXNzXG4gICAgICAgIHJldHVybiBjYWNoZWRTZXRUaW1lb3V0KGZ1biwgMCk7XG4gICAgfSBjYXRjaChlKXtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIC8vIFdoZW4gd2UgYXJlIGluIEkuRS4gYnV0IHRoZSBzY3JpcHQgaGFzIGJlZW4gZXZhbGVkIHNvIEkuRS4gZG9lc24ndCB0cnVzdCB0aGUgZ2xvYmFsIG9iamVjdCB3aGVuIGNhbGxlZCBub3JtYWxseVxuICAgICAgICAgICAgcmV0dXJuIGNhY2hlZFNldFRpbWVvdXQuY2FsbChudWxsLCBmdW4sIDApO1xuICAgICAgICB9IGNhdGNoKGUpe1xuICAgICAgICAgICAgLy8gc2FtZSBhcyBhYm92ZSBidXQgd2hlbiBpdCdzIGEgdmVyc2lvbiBvZiBJLkUuIHRoYXQgbXVzdCBoYXZlIHRoZSBnbG9iYWwgb2JqZWN0IGZvciAndGhpcycsIGhvcGZ1bGx5IG91ciBjb250ZXh0IGNvcnJlY3Qgb3RoZXJ3aXNlIGl0IHdpbGwgdGhyb3cgYSBnbG9iYWwgZXJyb3JcbiAgICAgICAgICAgIHJldHVybiBjYWNoZWRTZXRUaW1lb3V0LmNhbGwodGhpcywgZnVuLCAwKTtcbiAgICAgICAgfVxuICAgIH1cblxuXG59XG5mdW5jdGlvbiBydW5DbGVhclRpbWVvdXQobWFya2VyKSB7XG4gICAgaWYgKGNhY2hlZENsZWFyVGltZW91dCA9PT0gY2xlYXJUaW1lb3V0KSB7XG4gICAgICAgIC8vbm9ybWFsIGVudmlyb21lbnRzIGluIHNhbmUgc2l0dWF0aW9uc1xuICAgICAgICByZXR1cm4gY2xlYXJUaW1lb3V0KG1hcmtlcik7XG4gICAgfVxuICAgIC8vIGlmIGNsZWFyVGltZW91dCB3YXNuJ3QgYXZhaWxhYmxlIGJ1dCB3YXMgbGF0dGVyIGRlZmluZWRcbiAgICBpZiAoKGNhY2hlZENsZWFyVGltZW91dCA9PT0gZGVmYXVsdENsZWFyVGltZW91dCB8fCAhY2FjaGVkQ2xlYXJUaW1lb3V0KSAmJiBjbGVhclRpbWVvdXQpIHtcbiAgICAgICAgY2FjaGVkQ2xlYXJUaW1lb3V0ID0gY2xlYXJUaW1lb3V0O1xuICAgICAgICByZXR1cm4gY2xlYXJUaW1lb3V0KG1hcmtlcik7XG4gICAgfVxuICAgIHRyeSB7XG4gICAgICAgIC8vIHdoZW4gd2hlbiBzb21lYm9keSBoYXMgc2NyZXdlZCB3aXRoIHNldFRpbWVvdXQgYnV0IG5vIEkuRS4gbWFkZG5lc3NcbiAgICAgICAgcmV0dXJuIGNhY2hlZENsZWFyVGltZW91dChtYXJrZXIpO1xuICAgIH0gY2F0Y2ggKGUpe1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgLy8gV2hlbiB3ZSBhcmUgaW4gSS5FLiBidXQgdGhlIHNjcmlwdCBoYXMgYmVlbiBldmFsZWQgc28gSS5FLiBkb2Vzbid0ICB0cnVzdCB0aGUgZ2xvYmFsIG9iamVjdCB3aGVuIGNhbGxlZCBub3JtYWxseVxuICAgICAgICAgICAgcmV0dXJuIGNhY2hlZENsZWFyVGltZW91dC5jYWxsKG51bGwsIG1hcmtlcik7XG4gICAgICAgIH0gY2F0Y2ggKGUpe1xuICAgICAgICAgICAgLy8gc2FtZSBhcyBhYm92ZSBidXQgd2hlbiBpdCdzIGEgdmVyc2lvbiBvZiBJLkUuIHRoYXQgbXVzdCBoYXZlIHRoZSBnbG9iYWwgb2JqZWN0IGZvciAndGhpcycsIGhvcGZ1bGx5IG91ciBjb250ZXh0IGNvcnJlY3Qgb3RoZXJ3aXNlIGl0IHdpbGwgdGhyb3cgYSBnbG9iYWwgZXJyb3IuXG4gICAgICAgICAgICAvLyBTb21lIHZlcnNpb25zIG9mIEkuRS4gaGF2ZSBkaWZmZXJlbnQgcnVsZXMgZm9yIGNsZWFyVGltZW91dCB2cyBzZXRUaW1lb3V0XG4gICAgICAgICAgICByZXR1cm4gY2FjaGVkQ2xlYXJUaW1lb3V0LmNhbGwodGhpcywgbWFya2VyKTtcbiAgICAgICAgfVxuICAgIH1cblxuXG5cbn1cbnZhciBxdWV1ZSA9IFtdO1xudmFyIGRyYWluaW5nID0gZmFsc2U7XG52YXIgY3VycmVudFF1ZXVlO1xudmFyIHF1ZXVlSW5kZXggPSAtMTtcblxuZnVuY3Rpb24gY2xlYW5VcE5leHRUaWNrKCkge1xuICAgIGlmICghZHJhaW5pbmcgfHwgIWN1cnJlbnRRdWV1ZSkge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIGRyYWluaW5nID0gZmFsc2U7XG4gICAgaWYgKGN1cnJlbnRRdWV1ZS5sZW5ndGgpIHtcbiAgICAgICAgcXVldWUgPSBjdXJyZW50UXVldWUuY29uY2F0KHF1ZXVlKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICBxdWV1ZUluZGV4ID0gLTE7XG4gICAgfVxuICAgIGlmIChxdWV1ZS5sZW5ndGgpIHtcbiAgICAgICAgZHJhaW5RdWV1ZSgpO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gZHJhaW5RdWV1ZSgpIHtcbiAgICBpZiAoZHJhaW5pbmcpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICB2YXIgdGltZW91dCA9IHJ1blRpbWVvdXQoY2xlYW5VcE5leHRUaWNrKTtcbiAgICBkcmFpbmluZyA9IHRydWU7XG5cbiAgICB2YXIgbGVuID0gcXVldWUubGVuZ3RoO1xuICAgIHdoaWxlKGxlbikge1xuICAgICAgICBjdXJyZW50UXVldWUgPSBxdWV1ZTtcbiAgICAgICAgcXVldWUgPSBbXTtcbiAgICAgICAgd2hpbGUgKCsrcXVldWVJbmRleCA8IGxlbikge1xuICAgICAgICAgICAgaWYgKGN1cnJlbnRRdWV1ZSkge1xuICAgICAgICAgICAgICAgIGN1cnJlbnRRdWV1ZVtxdWV1ZUluZGV4XS5ydW4oKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBxdWV1ZUluZGV4ID0gLTE7XG4gICAgICAgIGxlbiA9IHF1ZXVlLmxlbmd0aDtcbiAgICB9XG4gICAgY3VycmVudFF1ZXVlID0gbnVsbDtcbiAgICBkcmFpbmluZyA9IGZhbHNlO1xuICAgIHJ1bkNsZWFyVGltZW91dCh0aW1lb3V0KTtcbn1cblxucHJvY2Vzcy5uZXh0VGljayA9IGZ1bmN0aW9uIChmdW4pIHtcbiAgICB2YXIgYXJncyA9IG5ldyBBcnJheShhcmd1bWVudHMubGVuZ3RoIC0gMSk7XG4gICAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPiAxKSB7XG4gICAgICAgIGZvciAodmFyIGkgPSAxOyBpIDwgYXJndW1lbnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBhcmdzW2kgLSAxXSA9IGFyZ3VtZW50c1tpXTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBxdWV1ZS5wdXNoKG5ldyBJdGVtKGZ1biwgYXJncykpO1xuICAgIGlmIChxdWV1ZS5sZW5ndGggPT09IDEgJiYgIWRyYWluaW5nKSB7XG4gICAgICAgIHJ1blRpbWVvdXQoZHJhaW5RdWV1ZSk7XG4gICAgfVxufTtcblxuLy8gdjggbGlrZXMgcHJlZGljdGlibGUgb2JqZWN0c1xuZnVuY3Rpb24gSXRlbShmdW4sIGFycmF5KSB7XG4gICAgdGhpcy5mdW4gPSBmdW47XG4gICAgdGhpcy5hcnJheSA9IGFycmF5O1xufVxuSXRlbS5wcm90b3R5cGUucnVuID0gZnVuY3Rpb24gKCkge1xuICAgIHRoaXMuZnVuLmFwcGx5KG51bGwsIHRoaXMuYXJyYXkpO1xufTtcbnByb2Nlc3MudGl0bGUgPSAnYnJvd3Nlcic7XG5wcm9jZXNzLmJyb3dzZXIgPSB0cnVlO1xucHJvY2Vzcy5lbnYgPSB7fTtcbnByb2Nlc3MuYXJndiA9IFtdO1xucHJvY2Vzcy52ZXJzaW9uID0gJyc7IC8vIGVtcHR5IHN0cmluZyB0byBhdm9pZCByZWdleHAgaXNzdWVzXG5wcm9jZXNzLnZlcnNpb25zID0ge307XG5cbmZ1bmN0aW9uIG5vb3AoKSB7fVxuXG5wcm9jZXNzLm9uID0gbm9vcDtcbnByb2Nlc3MuYWRkTGlzdGVuZXIgPSBub29wO1xucHJvY2Vzcy5vbmNlID0gbm9vcDtcbnByb2Nlc3Mub2ZmID0gbm9vcDtcbnByb2Nlc3MucmVtb3ZlTGlzdGVuZXIgPSBub29wO1xucHJvY2Vzcy5yZW1vdmVBbGxMaXN0ZW5lcnMgPSBub29wO1xucHJvY2Vzcy5lbWl0ID0gbm9vcDtcbnByb2Nlc3MucHJlcGVuZExpc3RlbmVyID0gbm9vcDtcbnByb2Nlc3MucHJlcGVuZE9uY2VMaXN0ZW5lciA9IG5vb3A7XG5cbnByb2Nlc3MubGlzdGVuZXJzID0gZnVuY3Rpb24gKG5hbWUpIHsgcmV0dXJuIFtdIH1cblxucHJvY2Vzcy5iaW5kaW5nID0gZnVuY3Rpb24gKG5hbWUpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3Byb2Nlc3MuYmluZGluZyBpcyBub3Qgc3VwcG9ydGVkJyk7XG59O1xuXG5wcm9jZXNzLmN3ZCA9IGZ1bmN0aW9uICgpIHsgcmV0dXJuICcvJyB9O1xucHJvY2Vzcy5jaGRpciA9IGZ1bmN0aW9uIChkaXIpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3Byb2Nlc3MuY2hkaXIgaXMgbm90IHN1cHBvcnRlZCcpO1xufTtcbnByb2Nlc3MudW1hc2sgPSBmdW5jdGlvbigpIHsgcmV0dXJuIDA7IH07XG4iLCJpbXBvcnQgJy4vanMvbW9kdWxlcy9nbG9iYWwnO1xuaW1wb3J0ICcuL2pzL21vZHVsZXMvY29uZmlnJztcbmltcG9ydCAnLi9qcy9tb2R1bGVzL3V0aWxzJztcbmltcG9ydCAnLi9qcy9tb2R1bGVzL2hhbmRsZUNsaWNrcyc7XG4vL2ltcG9ydCAnLi9qcy9tb2R1bGVzL2NhbklVc2VEYXRhJztcbi8vaW1wb3J0ICcuL2pzL21vZHVsZXMvaW5wdXQnO1xuaW1wb3J0ICcuL2pzL21vZHVsZXMvc2lkZWJhcic7XG5pbXBvcnQgJy4vanMvbW9kdWxlcy9kcm9wbGV0Jztcbi8vaW1wb3J0ICcuL2pzL21vZHVsZXMvd2VpcmRDYXNlJztcbi8vaW1wb3J0ICcuL2pzL21vZHVsZXMvcmFuZG9tTmFtZXMnO1xuaW1wb3J0ICcuL2pzL21vZHVsZXMveW91dHViZSc7XG4vL2ltcG9ydCB7cGxheTJ9IGZyb20gJy4vanMvbW9kdWxlcy9oYW5kbGVDbGlja3MnO1xuXG4vL2ltcG9ydCB7IGxvYWRWaWRlb3MgfSBmcm9tICcuL2pzL21vZHVsZXMvbG9hZFZpZGVvcyc7XG4vL2ltcG9ydCB7IGxvYWROYW1lcyB9IGZyb20gJy4vanMvbW9kdWxlcy9sb2FkTmFtZXMnO1xuXG4vL0VWVC5vbignaW5pdCcsIGxvYWRWaWRlb3MpXG4vL0VWVC5vbignaW5pdCcsIGxvYWROYW1lcylcblxuLy9jb25zb2xlLmxvZyhKQy51dGlscy5kYXRhLml0ZW1zLmxlbmd0aCk7XG5cblxuXG5cbiIsImNvbnN0IGNvbmZpZyA9IEpDLmNvbmZpZyA9IHt9O1xuICBjb25maWcucHJvamVjdCA9ICdqdXN0eW5DbGFyay1uZXcnO1xuICBjb25maWcuZGV2ZWxvcGVyID0gJ2p1c3R5biBjbGFyayc7XG4gIGNvbmZpZy52ZXJzaW9uID0gXCIxLjAuMFwiO1xuXG4iLCJ2YXIgY29va2llTWFwO1xuLy8gQ29va2llc1xuSkMudXRpbHMuZ2V0Q29va2llcyA9IHVwZGF0ZSA9PiB7IC8vIEdldCBjb29raWVzXG4gIGlmKCFjb29raWVNYXAgfHwgdXBkYXRlKSB7XG4gICAgY29va2llTWFwID0ge307XG4gICAgdmFyIGksIGNvb2tpZXMgPSBkb2N1bWVudC5jb29raWUuc3BsaXQoXCI7XCIpO1xuICAgIGZvciAoaSA9IDA7IGkgPCBjb29raWVzLmxlbmd0aDsgaSsrKSB7XG4gICAgICB2YXIgaW5kZXggPSBjb29raWVzW2ldLmluZGV4T2YoJz0nKTtcbiAgICAgIHZhciB4ID0gY29va2llc1tpXS5zdWJzdHIoMCwgaW5kZXgpO1xuICAgICAgdmFyIHkgPSBjb29raWVzW2ldLnN1YnN0cihpbmRleCArIDEpO1xuICAgICAgeCA9IHgucmVwbGFjZSgvXlxccyt8XFxzKyQvZywgJycpO1xuICAgICAgaWYoeCkgY29va2llTWFwW3hdID0gZGVjb2RlVVJJKHkpO1xuICAgIH1cbiAgfVxuICByZXR1cm4gY29va2llTWFwO1xufTtcblxuSkMudXRpbHMuZ2V0Q29va2llID0gKGMsIHVwZGF0ZSkgPT4geyAvLyBHZXQgY29va2llXG4gIHJldHVybiB0aGlzLmdldENvb2tpZXModXBkYXRlKVtjXTtcbn07XG5cbkpDLnV0aWxzLnNldENvb2tpZSA9IChuYW1lLCB2YWx1ZSwgb3B0cykgPT4geyAvLyBTZXQgY29va2llIEpDLnV0aWxzLnNldENvb2tpZSgnamNDb29raWUnLHRydWUsIHtleHBpcmVEYXRlOiAoMzYwMCAqIDI0ICogMzY1KX0pO1xuICB2YXIgdmFsdWUgPSBlbmNvZGVVUkkodmFsdWUpO1xuICBvcHRzID0gb3B0cyB8fCB7fTtcbiAgdmFsdWUgKz0gXCI7cGF0aD1cIiArIChvcHRzLnBhdGggfHwgXCIvXCIpO1xuICBpZihvcHRzLmRvbWFpbikgdmFsdWUgKz0gXCI7ZG9tYWluPVwiICsgb3B0cy5kb21haW47XG4gIHZhciB0ID0gdHlwZW9mIG9wdHMubWF4QWdlO1xuICBpZih0ID09IFwibnVtYmVyXCIgfHwgdCA9PSBcInN0cmluZ1wiKSB2YWx1ZSArPSBcIjttYXgtYWdlPVwiICsgb3B0cy5tYXhBZ2U7XG4gIHZhciBlID0gb3B0cy5leHBpcmVEYXRlO1xuICBpZih0eXBlb2YgZSA9PSBcIm51bWJlclwiKSBlID0gbmV3IERhdGUoKG5ldyBEYXRlKCkpLmdldFRpbWUoKSArIGUgKiAxMDAwKTtcbiAgaWYoZSkgdmFsdWUgKz0gJztleHBpcmVzPScgKyBlLnRvVVRDU3RyaW5nKCk7XG4gIGlmKG9wdHMuc2VjdXJlKSB2YWx1ZSArPSBcIjtzZWN1cmVcIjtcbiAgZG9jdW1lbnQuY29va2llID0gbmFtZSArICc9JyArIHZhbHVlO1xuICBjb29raWVNYXAgPSBudWxsO1xufTtcblxuc2V0VGltZW91dCgoKT0+IHtcbiAgaWYgKCFkb2N1bWVudC5jb29raWUubWF0Y2goJ2pjQ29va2llJykpIHtcbiAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcuY29va2llLXBvbGljeScpLmNsYXNzTGlzdC5hZGQoJ2Nvb2tpZS1wb2xpY3ktLXNob3cnKTtcbiAgfSBlbHNlIHtcbiAgICBjb25zb2xlLmxvZygnY29va2llIHBvbGljeSBpcyBoaWRkZW4nKTtcbiAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcuY29va2llLXBvbGljeScpLmNsYXNzTGlzdC5hZGQoJ2Nvb2tpZS1wb2xpY3ktLWhpZGUnKTtcbiAgfVxufSwxMDAwKTtcblxuZXhwb3J0IGZ1bmN0aW9uIHNldFBvbGljeUNvb2tpZSgpIHtcbiAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLmNvb2tpZS1wb2xpY3knKS5jbGFzc0xpc3QuYWRkKCdjb29raWUtcG9saWN5LS1oaWRlJyk7XG4gIGNvbnNvbGUubG9nKCdjb29raWUgc2V0Jyk7XG4gIEpDLnV0aWxzLnNldENvb2tpZSgnamNDb29raWUnLCB0cnVlLCB7ZXhwaXJlRGF0ZTogKDM2MDAgKiAyNCAqIDM2NSl9KTtcbn1cbiIsIihmdW5jdGlvbigpIHtcbiAgdmFyIGRyb3BsZXQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcuZHJvcGxldCcpXG4gIGRyb3BsZXQuc3R5bGUub3BhY2l0eSA9IDBcbiAgZnVuY3Rpb24gZmFkZUluRHJvcGxldCgpIHtcbiAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uKCkge1xuICAgICAgZHJvcGxldC5zdHlsZS5vcGFjaXR5ID0gMVxuICAgIH0sIDIwMDApXG4gIH1cbiAgRVZULm9uKCdpbml0JywgZmFkZUluRHJvcGxldClcbn0pKCk7XG4iLCJpbXBvcnQgRXZlbnRFbWl0dGVyMiBmcm9tICdldmVudGVtaXR0ZXIyJztcblxuKGZ1bmN0aW9uKGdsb2JhbCl7XG5cbiAgZ2xvYmFsLkpDID0gZ2xvYmFsLkpDICE9PSB1bmRlZmluZWQgPyBKQyA6IHt9OyAvLyBEZWNsYXJlIEdsb2JhbCBPYmplY3RcbiAgZ2xvYmFsLkVWVCA9IG5ldyBFdmVudEVtaXR0ZXIyKCk7XG5cbiAgSkMuY29tcG9uZW50cyA9IHt9O1xuICBKQy5jb25maWcgPSB7fTtcbiAgSkMubWVudSA9IHt9O1xuICBKQy51dGlscyA9IHt9O1xuXG4gIGdsb2JhbC5hZGRFdmVudExpc3RlbmVyKCdET01Db250ZW50TG9hZGVkJywgZnVuY3Rpb24oKSB7XG4gICAgRVZULmVtaXQoJ2luaXQnKTtcbiAgfSk7XG5cbiAgY29uc29sZS5sb2coSkMpO1xuXG59KSh3aW5kb3cpO1xuIiwiaW1wb3J0IHsgc2V0UG9saWN5Q29va2llIH0gZnJvbSAnLi9jb29raWVzJztcbmltcG9ydCAnLi95b3V0dWJlJztcblxuXG5leHBvcnQgZnVuY3Rpb24gcGxheSgpIHtcbiAgdmFyIHZpZGVvcyA9IHJhbmRUdWJlVmlkKCk7XG4gIHZhciB2aWRlb0lEID0gdmlkZW9zW0pDLnV0aWxzLnJhbmRvbU51bWJlcih2aWRlb3MubGVuZ3RoKV07XG4gIHZhciB2aWRlbyA9IEpDLnV0aWxzLnlvdVR1YmVQbGF5ZXIodmlkZW9JRCk7XG4gIHZpZGVvKCk7XG59O1xuXG5mdW5jdGlvbiByYW5kVHViZVZpZCgpIHtcbiAgdmFyIHZpZExpc3QgPSBbXTtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBKQy51dGlscy5kYXRhLml0ZW1zLmxlbmd0aDsgaSsrKSB7XG4gICAgdmlkTGlzdFtpXSA9IEpDLnV0aWxzLmRhdGEuaXRlbXNbaV0uY29udGVudERldGFpbHMudmlkZW9JZDtcbiAgfVxuICByZXR1cm4gdmlkTGlzdDtcbn07XG5cbmNvbnNvbGUubG9nKHJhbmRUdWJlVmlkKCkpO1xuXG4vLyBTZXQgdXAgY2xpY2sgaGFuZGxlcnNcbmZ1bmN0aW9uIGNsaWNrSGFuZGxlcnMoKSB7XG5cbiAgdmFyIGhlYWRlciA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5oZWFkZXInKTtcbiAgdmFyIGNvbnRlbnQxID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLmxvZ28nKTtcbiAgdmFyIGJvZHkgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdib2R5Jyk7XG4gIGNvbnRlbnQxLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgZnVuY3Rpb24gKCkge1xuICAgIGhlYWRlci5jbGFzc0xpc3QudG9nZ2xlKCctLW9wZW4nKTtcbiAgICBib2R5LmNsYXNzTGlzdC50b2dnbGUoJ292ZXJsYXktLW9wZW4nKTtcbiAgfSlcblxuICB2YXIgb3Blbk92ZXJsYXkgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbcmVsPVwiMVwiXScpO1xuICB2YXIgb3ZlcmxheSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5vdmVybGF5JylcblxuICAvL2RvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tyZWw9XCJtYWluX19sb2FkTmFtZXNcIl0nKS5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIGxvYWROYW1lcyk7XG5cbiAgLypkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbcmVsPVwibWFpbl9fY2xpY2tlclwiXScpLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgZnVuY3Rpb24oKSB7XG4gICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcignW3JlbD1cIm1haW5fX2NsaWNrZXJcIl0nKS5pbm5lckhUTUwgPSBhZGRlcigpO1xuICB9KTsqL1xuXG4gIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5jb29raWUtcG9saWN5X19jbG9zZScpLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgc2V0UG9saWN5Q29va2llKTsgLy8gQ29va2llIFBvbGljeVxuXG4gIG92ZXJsYXkuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBKQy51dGlscy5jbG9zZU92ZXJsYXkpOyAvLyBjbG9zZSBvdmVybGF5XG4gIG9wZW5PdmVybGF5LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgSkMudXRpbHMub3Blbk92ZXJsYXkpOyAvLyBvcGVuIG92ZXJsYXlcbiAgb3Blbk92ZXJsYXkuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBwbGF5KTsgLy8gb3BlbiBvdmVybGF5XG59XG5cbkVWVC5vbignaW5pdCcsIGNsaWNrSGFuZGxlcnMpO1xuXG4iLCIoZnVuY3Rpb24oSkMpIHtcblxuICB2YXIgc2lkZWJhciA9IEpDLmNvbXBvbmVudHMuc2lkZWJhciA9IHt9XG5cbiAgY29uc3QgZiA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5zaWRlYmFyJyk7XG5cbiAgc2lkZWJhci5vcGVuU2lkZWJhciA9IGZ1bmN0aW9uKCkge1xuICAgIGYuY2xhc3NMaXN0LmFkZCgnc2lkZWJhci0tb3BlbicpO1xuICB9XG4gIHNpZGViYXIuY2xvc2VTaWRlYmFyID0gZnVuY3Rpb24oKSB7XG4gICAgZi5jbGFzc0xpc3QucmVtb3ZlKCdzaWRlYmFyLS1vcGVuJyk7XG4gIH07XG5cbiAgc2lkZWJhci5kZWxheSA9IGZ1bmN0aW9uKGNhbGxiYWNrLCB0aW1lKSB7XG4gICAgc2V0VGltZW91dChjYWxsYmFjaywgdGltZSlcbiAgfTtcblxuICBzaWRlYmFyLmludGVydmFsID0gZnVuY3Rpb24oY2FsbGJhY2ssIHRpbWUpIHtcbiAgICBzZXRJbnRlcnZhbChjYWxsYmFjaywgdGltZSlcbiAgfTtcblxuICBzaWRlYmFyLnNsaWRlVG9nZ2xlID0gZnVuY3Rpb24oKSB7XG4gICAgZi5jbGFzc0xpc3QudG9nZ2xlKCdzaWRlYmFyLS1vcGVuJyk7XG4gIH07XG5cbiAgc2lkZWJhci5pbml0ID0gZnVuY3Rpb24oKSB7XG4gICAgLy9zaWRlYmFyLmludGVydmFsKHNpZGViYXIuc2xpZGVUb2dnbGUsIDIwMDApO1xuICAgIHNpZGViYXIuZGVsYXkoc2lkZWJhci5vcGVuU2lkZWJhciwgMjAwMCk7XG4gIH07XG5cbiAgRVZULm9uKCdpbml0Jywgc2lkZWJhci5pbml0KTtcblxufSkoSkMpO1xuIiwiaW1wb3J0ICcuL2Nvb2tpZXMnO1xuXG5KQy51dGlscy5hZGRlciA9ICgpPT4ge1xuICB2YXIgcGx1cyA9IGZ1bmN0aW9uKCkge1xuICAgIHZhciBjb3VudGVyID0gMDtcbiAgICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgICByZXR1cm4gY291bnRlcisrXG4gICAgfVxuICB9XG4gIHJldHVybiBwbHVzKClcbn1cblxuLy8gdGhpcyBjaGVja2VyXG5KQy51dGlscy50aGlzQ2hlY2sgPSBmdW5jdGlvbigpIHtcbiAgY29uc29sZS5sb2codGhpcyk7XG59XG5cbkpDLnV0aWxzLnJhbmRvbU51bWJlciA9IGZ1bmN0aW9uKGxlbikge1xuICByZXR1cm4gTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogbGVuKVxufTtcblxuSkMudXRpbHMub3V0cHV0ID0gZnVuY3Rpb24oeCkge1xuICBjb25zb2xlLmxvZyh4KTtcbn1cblxuLy8gQ2hhcmFjdGVyIGNvdW50IGluIEVsZW1lbnRcbkpDLnV0aWxzLmNoYXJzSW5FbGVtZW50ID0gZWxtID0+IHtcbiAgaWYgKGVsbS5ub2RlVHlwZSA9PSAzKSB7IC8vIFRFWFRfTk9ERVxuICAgIHJldHVybiBlbG0ubm9kZVZhbHVlLmxlbmd0aDtcbiAgfVxuICB2YXIgY291bnQgPSAwO1xuICBmb3IgKHZhciBpID0gMCwgY2hpbGQ7IGNoaWxkID0gZWxtLmNoaWxkTm9kZXNbaV07IGkrKykge1xuICAgIGNvdW50ICs9IEpDLnV0aWxzLmNoYXJzSW5FbGVtZW50KGNoaWxkKTtcbiAgfVxuICByZXR1cm4gY291bnQ7XG59XG5cbi8vIEFsZXJ0IHV0aWxpdHlcbkpDLnV0aWxzLmFsZXJ0ID0gYSA9PiB7XG4gIGFsZXJ0KGEpO1xufVxuXG5KQy51dGlscy5zaG93Qm9keUNoYXJOdW0gPSAoKSA9PiB7XG4gIHZhciBlbG0gPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdib2R5Jyk7XG4gIGNvbnNvbGUubG9nKFwiVGhpcyBwYWdlIGhhcyBcIiArIEpDLnV0aWxzLmNoYXJzSW5FbGVtZW50KGVsbSkgKyBcIiBjaGFyYWN0ZXJzIGluIHRoZSBib2R5XCIpO1xufTtcblxuSkMudXRpbHMub3Blbk92ZXJsYXkgPSAoKSA9PiAge1xuICB2YXIgb3ZlcmxheSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5vdmVybGF5Jyk7XG4gIHZhciBib2R5ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignYm9keScpO1xuICB2YXIgb3ZlcmxheUlubmVyID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLm92ZXJsYXlfX2lubmVyJyk7XG4gIG92ZXJsYXkuY2xhc3NMaXN0LnRvZ2dsZSgnb3ZlcmxheS0tb3BlbicpO1xuICBib2R5LmNsYXNzTGlzdC5hZGQoJ292ZXJsYXktLW9wZW4nKTtcbiAgb3ZlcmxheUlubmVyLmNsYXNzTGlzdC5hZGQoJ292ZXJsYXktLW9wZW4nKTtcbn1cblxuSkMudXRpbHMuY2xvc2VPdmVybGF5ID0gKCkgPT4gIHtcbiAgdmFyIG92ZXJsYXkgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcub3ZlcmxheScpO1xuICB2YXIgYm9keSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ2JvZHknKTtcbiAgdmFyIG92ZXJsYXlJbm5lciA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5vdmVybGF5X19pbm5lcicpO1xuICB2YXIgdmlkID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLnZpZGVvX193cmFwJyk7XG5cbiAgICAgIG92ZXJsYXkuY2xhc3NMaXN0LnRvZ2dsZSgnb3ZlcmxheS0tb3BlbicpO1xuICAgICAgYm9keS5jbGFzc0xpc3QudG9nZ2xlKCdvdmVybGF5LS1vcGVuJyk7XG4gICAgICBvdmVybGF5SW5uZXIuY2xhc3NMaXN0LnRvZ2dsZSgnb3ZlcmxheS0tb3BlbicpO1xuXG4gICAgICB2aWQucmVtb3ZlKCk7XG59XG5cblxuXG5leHBvcnQgZnVuY3Rpb24gcmFuZE51bUdlbihtYXgpIHtcbiAgcmV0dXJuIE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIG1heClcbn07XG5cblxuZXhwb3J0IGZ1bmN0aW9uIGNvb2xGdW5rKCkge1xuICBjb25zb2xlLmxvZygndGhpcyBsb3ZlIGlzIHRha2luZyBhIGhvbGQgb2YgbWUnKTtcbn07XG5cblxuXG5cblxuSkMudXRpbHMueW91VHViZVBsYXllciA9IChpZCkgPT4ge1xuICAgIHJldHVybiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBib2R5ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignYm9keScpO1xuICAgICAgICB2YXIgdmlkZW9fX3dyYXAgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICAgICAgdmFyIHZpZGVvV3JhcHBlciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgICAgICB2YXIgaWZyYW1lRGl2ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnaUZyYW1lJyk7XG5cbiAgICAgICAgaWZyYW1lRGl2LnNldEF0dHJpYnV0ZSgnZGF0YS15b3V0dWJlLWlkJywgaWQpO1xuICAgICAgICBpZnJhbWVEaXYuc2V0QXR0cmlidXRlKCdzcmMnLCAnaHR0cHM6Ly93d3cueW91dHViZS5jb20vZW1iZWQvJyArIGlkICsgJz9yZWw9MCZhbXA7Y29udHJvbHM9MCZhbXAnKTtcbiAgICAgICAgdmlkZW9fX3dyYXAuc2V0QXR0cmlidXRlKCdjbGFzcycsICd2aWRlb19fd3JhcCcpO1xuICAgICAgICB2aWRlb1dyYXBwZXIuc2V0QXR0cmlidXRlKCdjbGFzcycsICd2aWRlb1dyYXBwZXInKTtcbiAgICAgICAgdmlkZW9fX3dyYXAuYXBwZW5kQ2hpbGQodmlkZW9XcmFwcGVyKTtcbiAgICAgICAgdmlkZW9XcmFwcGVyLmFwcGVuZENoaWxkKGlmcmFtZURpdik7XG4gICAgICAgIGJvZHkuYXBwZW5kQ2hpbGQodmlkZW9fX3dyYXApO1xuXG4gICAgICAgIGNvbnNvbGUubG9nKCdyZXR1cm4nKTtcbiAgICAgIH1cblxufTtcblxuXG5cbi8qPGlmcmFtZSB3aWR0aD1cIjEyODBcIiBoZWlnaHQ9XCI3MjBcIiBzcmM9XCJodHRwczovL3d3dy55b3V0dWJlLmNvbS9lbWJlZC9SS1lqZFRpTWtYTT9yZWw9MCZhbXA7Y29udHJvbHM9MCZhbXA7c2hvd2luZm89MFwiIGZyYW1lYm9yZGVyPVwiMFwiIGFsbG93ZnVsbHNjcmVlbj1cIlwiPjwvaWZyYW1lPiovXG4iLCJKQy51dGlscy5kYXRhID0ge1xuICBcImtpbmRcIjogXCJ5b3V0dWJlI3BsYXlsaXN0SXRlbUxpc3RSZXNwb25zZVwiLFxuICBcImV0YWdcIjogXCJcXFwiY2J6M2xJUTJOMjVBZndOci1CZHhVVnhKX1FZL2hsY2dJWERBREMtcTFGSTFHUHNLS052b3ZhTVxcXCJcIixcbiAgXCJuZXh0UGFnZVRva2VuXCI6IFwiQ0JrUUFBXCIsXG4gIFwicGFnZUluZm9cIjoge1xuICAgIFwidG90YWxSZXN1bHRzXCI6IDQxLFxuICAgIFwicmVzdWx0c1BlclBhZ2VcIjogMjVcbiAgfSxcbiAgXCJpdGVtc1wiOiBbXG4gICAge1xuICAgICAgXCJraW5kXCI6IFwieW91dHViZSNwbGF5bGlzdEl0ZW1cIixcbiAgICAgIFwiZXRhZ1wiOiBcIlxcXCJjYnozbElRMk4yNUFmd05yLUJkeFVWeEpfUVkvQm5pWldsNlVyRjJ6NjFDM0IwdHZOdHJCakRnXFxcIlwiLFxuICAgICAgXCJpZFwiOiBcIlVFeFJZVXBFZDB4WWVVSjBXSEl4Um1VeVJsSjZTV1JVTTFKR1pVYzFNbEZXUmk0MU5rSTBORVkyUkRFd05UVTNRME0yXCIsXG4gICAgICBcInNuaXBwZXRcIjoge1xuICAgICAgICBcInB1Ymxpc2hlZEF0XCI6IFwiMjAxNS0wMi0xOFQwNTo1NzozMS4wMDBaXCIsXG4gICAgICAgIFwiY2hhbm5lbElkXCI6IFwiVUNWTTRDMWZCOVFjd3k3ZE5qYlhlVVZ3XCIsXG4gICAgICAgIFwidGl0bGVcIjogXCJMZWFybmluZyBob3cgdG8gdXNlIGpRdWVyeSBBSkFYIHdpdGggUEhQXCIsXG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJHZXR0aW5nIHN0YXJ0ZWQgd2l0aCBBSkFYIGlzIHN1cGVyIGVhc3kgd2hlbiB5b3UgdXNlIHRoZSBqUXVlcnkgbGlicmFyeS4gVGhhdCB3b3JrcyB3ZWxsIGZvciB0aGUgY2xpZW50IHNpZGUsIGJ1dCBob3cgZG8geW91IHdvcmsgd2l0aCBhIHNlcnZlciBzaWRlIGxhbmd1YWdlIGxpa2UgUEhQPyBJdCdzIGVhc2llciB0aGFuIHlvdSB0aGluay5cIixcbiAgICAgICAgXCJ0aHVtYm5haWxzXCI6IHtcbiAgICAgICAgICBcImRlZmF1bHRcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL1RSMGdrR2JNd1cwL2RlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDEyMCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDkwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcIm1lZGl1bVwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvVFIwZ2tHYk13VzAvbXFkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiAzMjAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiAxODBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiaGlnaFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvVFIwZ2tHYk13VzAvaHFkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiA0ODAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiAzNjBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwic3RhbmRhcmRcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL1RSMGdrR2JNd1cwL3NkZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogNjQwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogNDgwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcIm1heHJlc1wiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvVFIwZ2tHYk13VzAvbWF4cmVzZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogMTI4MCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDcyMFxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJjaGFubmVsVGl0bGVcIjogXCJKdXN0eW4gQ2xhcmtcIixcbiAgICAgICAgXCJwbGF5bGlzdElkXCI6IFwiUExRYUpEd0xYeUJ0WHIxRmUyRlJ6SWRUM1JGZUc1MlFWRlwiLFxuICAgICAgICBcInBvc2l0aW9uXCI6IDAsXG4gICAgICAgIFwicmVzb3VyY2VJZFwiOiB7XG4gICAgICAgICAgXCJraW5kXCI6IFwieW91dHViZSN2aWRlb1wiLFxuICAgICAgICAgIFwidmlkZW9JZFwiOiBcIlRSMGdrR2JNd1cwXCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwiY29udGVudERldGFpbHNcIjoge1xuICAgICAgICBcInZpZGVvSWRcIjogXCJUUjBna0diTXdXMFwiLFxuICAgICAgICBcInZpZGVvUHVibGlzaGVkQXRcIjogXCIyMDEzLTAxLTAxVDAyOjM1OjUwLjAwMFpcIlxuICAgICAgfVxuICAgIH0sXG4gICAge1xuICAgICAgXCJraW5kXCI6IFwieW91dHViZSNwbGF5bGlzdEl0ZW1cIixcbiAgICAgIFwiZXRhZ1wiOiBcIlxcXCJjYnozbElRMk4yNUFmd05yLUJkeFVWeEpfUVkvckFYRWFueGJzS1ZVSUJlalpnNWZtc2lXeVhjXFxcIlwiLFxuICAgICAgXCJpZFwiOiBcIlVFeFJZVXBFZDB4WWVVSjBXSEl4Um1VeVJsSjZTV1JVTTFKR1pVYzFNbEZXUmk0eU9EbEdORUUwTmtSR01FRXpNRVF5XCIsXG4gICAgICBcInNuaXBwZXRcIjoge1xuICAgICAgICBcInB1Ymxpc2hlZEF0XCI6IFwiMjAxNS0wMi0yN1QxODozNjo0OS4wMDBaXCIsXG4gICAgICAgIFwiY2hhbm5lbElkXCI6IFwiVUNWTTRDMWZCOVFjd3k3ZE5qYlhlVVZ3XCIsXG4gICAgICAgIFwidGl0bGVcIjogXCJHaXRodWIgVHV0b3JpYWwgRm9yIEJlZ2lubmVycyAtIEdpdGh1YiBCYXNpY3MgZm9yIE1hYyBvciBXaW5kb3dzICYgU291cmNlIENvbnRyb2wgQmFzaWNzXCIsXG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJHaXRodWIgVHV0b3JpYWwgRm9yIEJlZ2lubmVycyAtIGxlYXJuIEdpdGh1YiBmb3IgTWFjIG9yIEdpdGh1YiBmb3Igd2luZG93c1xcbklmIHlvdSd2ZSBiZWVuIHdhbnRpbmcgdG8gbGVhcm4gR2l0aHViLCBub3cncyB0aGUgcGVyZmVjdCB0aW1lISAgR2l0aHViIGlzIHNlZW4gYXMgYSBiaWcgcmVxdWlyZW1lbnQgYnkgbW9zdCBlbXBsb3llcnMgdGhlc2UgZGF5cyBhbmQgaXMgdmVyeSBjcml0aWNhbCB0byBidXNpbmVzcyB3b3JrZmxvdy4gIFRoaXMgR2l0aHViIHR1dG9yaWFsIHdpbGwgY292ZXIgdGhlIGJhc2ljcyBvZiBob3cgdG8gdXNlIEdpdGh1YiBhbmQgdGhlIGNvbW1hbmQgbGluZS5cXG5cXG5MZXNzb24gIzI6IFB1bGwgcmVxdWVzdHMsIEJyYW5jaGluZyBtZXJnaW5nXFxuaHR0cHM6Ly93d3cueW91dHViZS5jb20vd2F0Y2g/dj1vRll5VFp3TXlBZ1xcblxcbk90aGVyIFZpZGVvczpcXG5qUXVlcnkgcmFwaWQtbGVhcm5pbmcgQ291cnNlXFxuaHR0cHM6Ly93d3cueW91dHViZS5jb20vd2F0Y2g/dj1oTXhHaEhOT2tDVVwiLFxuICAgICAgICBcInRodW1ibmFpbHNcIjoge1xuICAgICAgICAgIFwiZGVmYXVsdFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvMGZLZzdlMzdiUUUvZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogMTIwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogOTBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwibWVkaXVtXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS8wZktnN2UzN2JRRS9tcWRlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDMyMCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDE4MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJoaWdoXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS8wZktnN2UzN2JRRS9ocWRlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDQ4MCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDM2MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJzdGFuZGFyZFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvMGZLZzdlMzdiUUUvc2RkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiA2NDAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiA0ODBcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIFwiY2hhbm5lbFRpdGxlXCI6IFwiSnVzdHluIENsYXJrXCIsXG4gICAgICAgIFwicGxheWxpc3RJZFwiOiBcIlBMUWFKRHdMWHlCdFhyMUZlMkZSeklkVDNSRmVHNTJRVkZcIixcbiAgICAgICAgXCJwb3NpdGlvblwiOiAxLFxuICAgICAgICBcInJlc291cmNlSWRcIjoge1xuICAgICAgICAgIFwia2luZFwiOiBcInlvdXR1YmUjdmlkZW9cIixcbiAgICAgICAgICBcInZpZGVvSWRcIjogXCIwZktnN2UzN2JRRVwiXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcImNvbnRlbnREZXRhaWxzXCI6IHtcbiAgICAgICAgXCJ2aWRlb0lkXCI6IFwiMGZLZzdlMzdiUUVcIixcbiAgICAgICAgXCJ2aWRlb1B1Ymxpc2hlZEF0XCI6IFwiMjAxNC0wMS0xNlQyMDowNToyNy4wMDBaXCJcbiAgICAgIH1cbiAgICB9LFxuICAgIHtcbiAgICAgIFwia2luZFwiOiBcInlvdXR1YmUjcGxheWxpc3RJdGVtXCIsXG4gICAgICBcImV0YWdcIjogXCJcXFwiY2J6M2xJUTJOMjVBZndOci1CZHhVVnhKX1FZL0JlRnU3a1VhU0pISDlqRzhQM0U3a0RneFRBRVxcXCJcIixcbiAgICAgIFwiaWRcIjogXCJVRXhSWVVwRWQweFllVUowV0hJeFJtVXlSbEo2U1dSVU0xSkdaVWMxTWxGV1JpNHdNVGN5TURoR1FVRTROVEl6TTBZNVwiLFxuICAgICAgXCJzbmlwcGV0XCI6IHtcbiAgICAgICAgXCJwdWJsaXNoZWRBdFwiOiBcIjIwMTUtMDMtMDJUMjI6NDc6MDguMDAwWlwiLFxuICAgICAgICBcImNoYW5uZWxJZFwiOiBcIlVDVk00QzFmQjlRY3d5N2ROamJYZVVWd1wiLFxuICAgICAgICBcInRpdGxlXCI6IFwiQW5ndWxhckpTIFR1dG9yaWFsXCIsXG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJBIHZpZGVvIHR1dG9yaWFsIHRvIGhlbHAgeW91IGdldCBzdGFydGVkIHdpdGggQW5ndWxhckpTLiBZb3UgY2FuIHBsYXkgYXJvdW5kIHdpdGggdGhlIGZpbmFsIHJlc3VsdCBpbiB0aGUgZm9sbG93aW5nIGpzZmlkZGxlOlxcblxcbmh0dHA6Ly9qc2ZpZGRsZS5uZXQvam9obmxpbmRxdWlzdC9VM2MyUS9cXG5cXG5QbGVhc2UgdGFrZSBhbnkgdGVjaG5pY2FsIHF1ZXN0aW9ucyBhYm91dCBBbmd1bGFySlMgdG8gdGhlIHZlcnkgYWN0aXZlIGFuZCBoZWxwZnVsIEFuZ3VsYXJKUyBtYWlsaW5nIGxpc3Q6XFxuaHR0cHM6Ly9ncm91cHMuZ29vZ2xlLmNvbS9mb3J1bS8/ZnJvbWdyb3VwcyMhZm9ydW0vYW5ndWxhclwiLFxuICAgICAgICBcInRodW1ibmFpbHNcIjoge1xuICAgICAgICAgIFwiZGVmYXVsdFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvV3VpSHVacV9jZzQvZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogMTIwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogOTBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwibWVkaXVtXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9XdWlIdVpxX2NnNC9tcWRlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDMyMCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDE4MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJoaWdoXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9XdWlIdVpxX2NnNC9ocWRlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDQ4MCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDM2MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJzdGFuZGFyZFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvV3VpSHVacV9jZzQvc2RkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiA2NDAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiA0ODBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwibWF4cmVzXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9XdWlIdVpxX2NnNC9tYXhyZXNkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiAxMjgwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogNzIwXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcImNoYW5uZWxUaXRsZVwiOiBcIkp1c3R5biBDbGFya1wiLFxuICAgICAgICBcInBsYXlsaXN0SWRcIjogXCJQTFFhSkR3TFh5QnRYcjFGZTJGUnpJZFQzUkZlRzUyUVZGXCIsXG4gICAgICAgIFwicG9zaXRpb25cIjogMixcbiAgICAgICAgXCJyZXNvdXJjZUlkXCI6IHtcbiAgICAgICAgICBcImtpbmRcIjogXCJ5b3V0dWJlI3ZpZGVvXCIsXG4gICAgICAgICAgXCJ2aWRlb0lkXCI6IFwiV3VpSHVacV9jZzRcIlxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgXCJjb250ZW50RGV0YWlsc1wiOiB7XG4gICAgICAgIFwidmlkZW9JZFwiOiBcIld1aUh1WnFfY2c0XCIsXG4gICAgICAgIFwidmlkZW9QdWJsaXNoZWRBdFwiOiBcIjIwMTItMDQtMDRUMDY6NTU6MTYuMDAwWlwiXG4gICAgICB9XG4gICAgfSxcbiAgICB7XG4gICAgICBcImtpbmRcIjogXCJ5b3V0dWJlI3BsYXlsaXN0SXRlbVwiLFxuICAgICAgXCJldGFnXCI6IFwiXFxcImNiejNsSVEyTjI1QWZ3TnItQmR4VVZ4Sl9RWS9LRl9PQkdxM3NSQ0NRNl8zZzBWREdHV2RWV1lcXFwiXCIsXG4gICAgICBcImlkXCI6IFwiVUV4UllVcEVkMHhZZVVKMFdISXhSbVV5UmxKNlNXUlVNMUpHWlVjMU1sRldSaTQxTWpFMU1rSTBPVFEyUXpKR056TkdcIixcbiAgICAgIFwic25pcHBldFwiOiB7XG4gICAgICAgIFwicHVibGlzaGVkQXRcIjogXCIyMDE1LTAzLTEwVDA1OjU0OjA4LjAwMFpcIixcbiAgICAgICAgXCJjaGFubmVsSWRcIjogXCJVQ1ZNNEMxZkI5UWN3eTdkTmpiWGVVVndcIixcbiAgICAgICAgXCJ0aXRsZVwiOiBcIkludHJvZHVjdGlvbiB0byBBbmd1bGFyLmpzIGluIDUwIEV4YW1wbGVzIChwYXJ0IDEpXCIsXG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJDb2RlIGF0IGh0dHBzOi8vZ2l0aHViLmNvbS9jdXJyYW4vc2NyZWVuY2FzdHMvdHJlZS9naC1wYWdlcy9pbnRyb1RvQW5ndWxhciBBbiBpbnRyb2R1Y3Rpb24gdG8gQW5ndWxhci5qcyBjb3ZlcmluZyBzaW5nbGUtcGFnZS1hcHAgY29uY2VwdHMsIHJlbGF0ZWQgbGlicmFyaWVzIGFuZCBhbmd1bGFyIGZlYXR1cmVzIGJ5IGV4YW1wbGUuIFRoaXMgaW5zdGFsbG1lbnQgKHBhcnQgMSkgY292ZXJzIDM2IG9mIHRoZSA1MCBBbmd1bGFyIGV4YW1wbGVzLiBQYXJ0IDIgY292ZXJzIHRoZSByZXN0IGh0dHBzOi8vd3d3LnlvdXR1YmUuY29tL3dhdGNoP3Y9NkowOG0xSDJCTUUmZmVhdHVyZT15b3V0dS5iZSBFeGFtcGxlcyBzdGFydCBhdCAxMTozMCBpbiB0aGUgdmlkZW8uXFxuXFxuSWYgeW91IGFwcHJlY2lhdGUgdGhpcyB3b3JrLCBwbGVhc2UgY29uc2lkZXIgc3VwcG9ydGluZyBtZSBvbiBQYXRyZW9uIGh0dHBzOi8vd3d3LnBhdHJlb24uY29tL3VzZXI/dT0yOTE2MjQyJnR5PWhcXG5cXG5UaGlzIGxlY3R1cmUgd2FzIGdpdmVuIGJ5IEN1cnJhbiBLZWxsZWhlciBhdCB0aGUgVW5pdmVyc2l0eSBvZiBNYXNzYWNodXNldHRzIExvd2VsbCBvbiBNYXJjaCA2LCAyMDE0IGFzIHBhcnQgb2YgdGhlIHVuZGVyZ3JhZHVhdGUgY291cnNlIEdVSSBQcm9ncmFtbWluZyBJSSB0YXVnaHQgYnkgUHJvZmVzc29yIEplc3NlIEhlaW5lcy5cIixcbiAgICAgICAgXCJ0aHVtYm5haWxzXCI6IHtcbiAgICAgICAgICBcImRlZmF1bHRcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL1RSckw1ajNNSXZvL2RlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDEyMCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDkwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcIm1lZGl1bVwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvVFJyTDVqM01Jdm8vbXFkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiAzMjAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiAxODBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiaGlnaFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvVFJyTDVqM01Jdm8vaHFkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiA0ODAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiAzNjBcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIFwiY2hhbm5lbFRpdGxlXCI6IFwiSnVzdHluIENsYXJrXCIsXG4gICAgICAgIFwicGxheWxpc3RJZFwiOiBcIlBMUWFKRHdMWHlCdFhyMUZlMkZSeklkVDNSRmVHNTJRVkZcIixcbiAgICAgICAgXCJwb3NpdGlvblwiOiAzLFxuICAgICAgICBcInJlc291cmNlSWRcIjoge1xuICAgICAgICAgIFwia2luZFwiOiBcInlvdXR1YmUjdmlkZW9cIixcbiAgICAgICAgICBcInZpZGVvSWRcIjogXCJUUnJMNWozTUl2b1wiXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcImNvbnRlbnREZXRhaWxzXCI6IHtcbiAgICAgICAgXCJ2aWRlb0lkXCI6IFwiVFJyTDVqM01Jdm9cIixcbiAgICAgICAgXCJ2aWRlb1B1Ymxpc2hlZEF0XCI6IFwiMjAxNC0wMy0wOFQwMzowNjoyNS4wMDBaXCJcbiAgICAgIH1cbiAgICB9LFxuICAgIHtcbiAgICAgIFwia2luZFwiOiBcInlvdXR1YmUjcGxheWxpc3RJdGVtXCIsXG4gICAgICBcImV0YWdcIjogXCJcXFwiY2J6M2xJUTJOMjVBZndOci1CZHhVVnhKX1FZL2NaUkk4WTJsX0VJQXFPWnZuejlKRk1BaUMzTVxcXCJcIixcbiAgICAgIFwiaWRcIjogXCJVRXhSWVVwRWQweFllVUowV0hJeFJtVXlSbEo2U1dSVU0xSkdaVWMxTWxGV1JpNHdPVEEzT1RaQk56VkVNVFV6T1RNeVwiLFxuICAgICAgXCJzbmlwcGV0XCI6IHtcbiAgICAgICAgXCJwdWJsaXNoZWRBdFwiOiBcIjIwMTUtMDMtMTFUMTA6NTc6NTQuMDAwWlwiLFxuICAgICAgICBcImNoYW5uZWxJZFwiOiBcIlVDVk00QzFmQjlRY3d5N2ROamJYZVVWd1wiLFxuICAgICAgICBcInRpdGxlXCI6IFwiVXNpbmcgQW5pbWF0ZS5jc3MgYW5kIGpRdWVyeSBmb3IgZWFzeSBXZWIgQW5pbWF0aW9uXCIsXG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJTaW1wbGUgdHV0b3JpYWwgb24gaG93IHRvIHVzZSBBbmltYXRlLmNzcyBhbmQgalF1ZXJ5IHRvZ2V0aGVyIGluIHlvdXIgd2Vic2l0ZSBvciB3ZWIgYXBwISDwn5SlU3Vic2NyaWJlIGZvciBtb3JlIGxpa2UgdGhpczogaHR0cHM6Ly9nb28uZ2wvTFVFa04xXCIsXG4gICAgICAgIFwidGh1bWJuYWlsc1wiOiB7XG4gICAgICAgICAgXCJkZWZhdWx0XCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9DQlFHbDZ6b2tNcy9kZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiAxMjAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiA5MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJtZWRpdW1cIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL0NCUUdsNnpva01zL21xZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogMzIwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogMTgwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImhpZ2hcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL0NCUUdsNnpva01zL2hxZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogNDgwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogMzYwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInN0YW5kYXJkXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9DQlFHbDZ6b2tNcy9zZGRlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDY0MCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDQ4MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJtYXhyZXNcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL0NCUUdsNnpva01zL21heHJlc2RlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDEyODAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiA3MjBcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIFwiY2hhbm5lbFRpdGxlXCI6IFwiSnVzdHluIENsYXJrXCIsXG4gICAgICAgIFwicGxheWxpc3RJZFwiOiBcIlBMUWFKRHdMWHlCdFhyMUZlMkZSeklkVDNSRmVHNTJRVkZcIixcbiAgICAgICAgXCJwb3NpdGlvblwiOiA0LFxuICAgICAgICBcInJlc291cmNlSWRcIjoge1xuICAgICAgICAgIFwia2luZFwiOiBcInlvdXR1YmUjdmlkZW9cIixcbiAgICAgICAgICBcInZpZGVvSWRcIjogXCJDQlFHbDZ6b2tNc1wiXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcImNvbnRlbnREZXRhaWxzXCI6IHtcbiAgICAgICAgXCJ2aWRlb0lkXCI6IFwiQ0JRR2w2em9rTXNcIixcbiAgICAgICAgXCJ2aWRlb1B1Ymxpc2hlZEF0XCI6IFwiMjAxNC0wNi0wNVQxOTo1OTo0My4wMDBaXCJcbiAgICAgIH1cbiAgICB9LFxuICAgIHtcblxuXG4gICAgICBcImtpbmRcIjogXCJ5b3V0dWJlI3BsYXlsaXN0SXRlbVwiLFxuICAgICAgXCJldGFnXCI6IFwiXFxcImNiejNsSVEyTjI1QWZ3TnItQmR4VVZ4Sl9RWS8yb1F1MTVCUTk1Z2pRY3pJUkhWdVNwNjZmTkFcXFwiXCIsXG4gICAgICBcImlkXCI6IFwiVUV4UllVcEVkMHhZZVVKMFdISXhSbVV5UmxKNlNXUlVNMUpHWlVjMU1sRldSaTR4TWtWR1FqTkNNVU0xTjBSRk5FVXhcIixcbiAgICAgIFwic25pcHBldFwiOiB7XG4gICAgICAgIFwicHVibGlzaGVkQXRcIjogXCIyMDE1LTAzLTE0VDA3OjQyOjIwLjAwMFpcIixcbiAgICAgICAgXCJjaGFubmVsSWRcIjogXCJVQ1ZNNEMxZkI5UWN3eTdkTmpiWGVVVndcIixcbiAgICAgICAgXCJ0aXRsZVwiOiBcIldFQiBERVZFTE9QTUVOVCAtIFNFQ1JFVFMgVE8gU1RBUlRJTkcgQSBDQVJFRVIgaW4gdGhlIFdlYiBEZXZlbG9wbWVudCBJbmR1c3RyeVwiLFxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiRXZlcnlvbmUga2VlcHMgc2F5aW5nIGhvdyBncmVhdCB3ZWIgZGV2ZWxvcG1lbnQgaXMsIGJ1dCBob3cgZG8geW91IGdldCB0aGF0IGZpcnN0IGpvYj8gIFRoaXMgdmlkZW8gaXMgYSByZXNwb25zZSB0byB0aGUgcXVlc3Rpb25zIEkndmUgYmVlbiBnZXR0aW5nIGFib3V0IGhvdyB0byBsYW5kIHRoYXQgZmlyc3Qgd2ViIGRldmVsb3BtZW50IGpvYiBhbmQgaG93IHRvIGtub3cgd2hlbiB5b3UncmUgcmVhZHkgdG8gdGFrZSB0aGUgbGVhcCBhbmQgbG9vayBmb3Igb25lLlxcblxcblRoZSBmaXJzdCB0aGluZyB5b3UgaGF2ZSB0byBrbm93IGlzIHRoYXQgeW91IGRvbid0IGhhdmUgdG8gYmUgYSBzZWFzb25lZCBwcm8gdG8gZ2V0IGEgam9iIGFzIGEgZnVsbC10aW1lIHdlYiBkZXZlbG9wZXIuICBUaGVyZSBhcmUgTE9UUyBvZiBjb21wYW5pZXMgbG9va2luZyBmb3Igd2ViIGRldmVsb3BlcnMgdGhhdCBkb24ndCBoYXZlIG11Y2ggZXhwZXJpZW5jZS5cXG5cXG5BbHNvLCB0aGVyZSBhcmUgYSBsb3Qgb2YgdGhpbmdzIHlvdSBjYW4gZG8gdG8gcHJlcGFyZSB5b3VyIHJlc3VtZSB0byByZWFsbHkgc3RpY2sgb3V0IHRvIGEgcHJvc3BlY3RpdmUgZW1wbG95ZXIuXFxuXFxuVGhpcyB2aWRlbyB3aWxsIGdpdmUgeW91IGEgZmVlbCBmb3Igd2hhdCBhbiBlbXBsb3llciB3aWxsIGJlIGxvb2tpbmcgZm9yIGFuZCB3aGF0IHRoZXknbGwgYmUgXFxcImdyYWRpbmdcXFwiIHlvdSBvbiBhcyB5b3UgbG9vayBmb3IgYSBqb2IgaW4gdGhpcyBpbmR1c3RyeS5cXG5cXG5HaXRodWIgSW50cm86IFxcbmh0dHBzOi8vd3d3LnlvdXR1YmUuY29tL3dhdGNoP3Y9MGZLZzdlMzdiUUVcXG5HaXRodWIgUHVsbCBSZXF1ZXN0czogXFxuaHR0cHM6Ly93d3cueW91dHViZS5jb20vd2F0Y2g/dj1vRll5VFp3TXlBZ1xcblxcbmpRdWVyeSBDb3Vyc2U6XFxuaHR0cHM6Ly93d3cueW91dHViZS5jb20vcGxheWxpc3Q/bGlzdD1QTG9ZQ2dOT0l5R0FCZEkyVjhJX1NXbzIydEZwZ2gyczZfXCIsXG4gICAgICAgIFwidGh1bWJuYWlsc1wiOiB7XG4gICAgICAgICAgXCJkZWZhdWx0XCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9KaWxmWG1JMklqUS9kZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiAxMjAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiA5MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJtZWRpdW1cIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL0ppbGZYbUkySWpRL21xZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogMzIwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogMTgwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImhpZ2hcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL0ppbGZYbUkySWpRL2hxZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogNDgwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogMzYwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInN0YW5kYXJkXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9KaWxmWG1JMklqUS9zZGRlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDY0MCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDQ4MFxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJjaGFubmVsVGl0bGVcIjogXCJKdXN0eW4gQ2xhcmtcIixcbiAgICAgICAgXCJwbGF5bGlzdElkXCI6IFwiUExRYUpEd0xYeUJ0WHIxRmUyRlJ6SWRUM1JGZUc1MlFWRlwiLFxuICAgICAgICBcInBvc2l0aW9uXCI6IDUsXG4gICAgICAgIFwicmVzb3VyY2VJZFwiOiB7XG4gICAgICAgICAgXCJraW5kXCI6IFwieW91dHViZSN2aWRlb1wiLFxuICAgICAgICAgIFwidmlkZW9JZFwiOiBcIkppbGZYbUkySWpRXCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwiY29udGVudERldGFpbHNcIjoge1xuICAgICAgICBcInZpZGVvSWRcIjogXCJKaWxmWG1JMklqUVwiLFxuICAgICAgICBcInZpZGVvUHVibGlzaGVkQXRcIjogXCIyMDE0LTA0LTIxVDE4OjAwOjAyLjAwMFpcIlxuICAgICAgfVxuICAgIH0sXG4gICAge1xuXG5cbiAgICAgIFwia2luZFwiOiBcInlvdXR1YmUjcGxheWxpc3RJdGVtXCIsXG4gICAgICBcImV0YWdcIjogXCJcXFwiY2J6M2xJUTJOMjVBZndOci1CZHhVVnhKX1FZL2FydjRxcUM2Qmo5d0xnb0trWDRaTnJVYnRhY1xcXCJcIixcbiAgICAgIFwiaWRcIjogXCJVRXhSWVVwRWQweFllVUowV0hJeFJtVXlSbEo2U1dSVU0xSkdaVWMxTWxGV1JpNDFNekpDUWpCQ05ESXlSa0pETjBWRFwiLFxuICAgICAgXCJzbmlwcGV0XCI6IHtcbiAgICAgICAgXCJwdWJsaXNoZWRBdFwiOiBcIjIwMTUtMDMtMjBUMDg6NTE6MTcuMDAwWlwiLFxuICAgICAgICBcImNoYW5uZWxJZFwiOiBcIlVDVk00QzFmQjlRY3d5N2ROamJYZVVWd1wiLFxuICAgICAgICBcInRpdGxlXCI6IFwiUmVhbHRpbWUgXFxcIkV5ZSBDYW5keVxcXCIgd2l0aCBBbmd1bGFySlNcIixcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkxlYXJuIGhvdyB0byBtYWtlIGEgZnVsbHkgaW50ZXJhY3RpdmUsIHJlYWx0aW1lIEFuZ3VsYXJKUyBhcHBsaWNhdGlvbiB3aXRoIHNuYXBweSBhbmltYXRpb24gZWZmZWN0cywgc2xlZWsgcGVyZm9ybWFuY2UgYW5kIGNsZWFuLCBvcmdhbml6ZWQgY29kZS4gVG9wIHRoYXQgb2ZmIGJ5IHRlc3RpbmcgYWxsIGFzcGVjdHMgb2YgdGhlIGFwcGxpY2F0aW9uIHVzaW5nIFByb3RyYWN0b3IgYW5kIFVuaXQgdGVzdGluZyBhY3Jvc3MgbXVsdGlwbGUgYnJvd3NlcnMgdXNpbmcgS2FybWEgKyBTYXVjZSBMYWJzLlwiLFxuICAgICAgICBcInRodW1ibmFpbHNcIjoge1xuICAgICAgICAgIFwiZGVmYXVsdFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvOHVqN1lTcWJ5N3MvZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogMTIwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogOTBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwibWVkaXVtXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS84dWo3WVNxYnk3cy9tcWRlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDMyMCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDE4MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJoaWdoXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS84dWo3WVNxYnk3cy9ocWRlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDQ4MCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDM2MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJzdGFuZGFyZFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvOHVqN1lTcWJ5N3Mvc2RkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiA2NDAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiA0ODBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwibWF4cmVzXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS84dWo3WVNxYnk3cy9tYXhyZXNkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiAxMjgwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogNzIwXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcImNoYW5uZWxUaXRsZVwiOiBcIkp1c3R5biBDbGFya1wiLFxuICAgICAgICBcInBsYXlsaXN0SWRcIjogXCJQTFFhSkR3TFh5QnRYcjFGZTJGUnpJZFQzUkZlRzUyUVZGXCIsXG4gICAgICAgIFwicG9zaXRpb25cIjogNixcbiAgICAgICAgXCJyZXNvdXJjZUlkXCI6IHtcbiAgICAgICAgICBcImtpbmRcIjogXCJ5b3V0dWJlI3ZpZGVvXCIsXG4gICAgICAgICAgXCJ2aWRlb0lkXCI6IFwiOHVqN1lTcWJ5N3NcIlxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgXCJjb250ZW50RGV0YWlsc1wiOiB7XG4gICAgICAgIFwidmlkZW9JZFwiOiBcIjh1ajdZU3FieTdzXCIsXG4gICAgICAgIFwidmlkZW9QdWJsaXNoZWRBdFwiOiBcIjIwMTQtMDEtMTVUMTQ6MDA6MDMuMDAwWlwiXG4gICAgICB9XG4gICAgfSxcbiAgICB7XG5cblxuICAgICAgXCJraW5kXCI6IFwieW91dHViZSNwbGF5bGlzdEl0ZW1cIixcbiAgICAgIFwiZXRhZ1wiOiBcIlxcXCJjYnozbElRMk4yNUFmd05yLUJkeFVWeEpfUVkvYmhjeFBmQ3VRZ19rR1N2VUExc3NOWmJlQjFNXFxcIlwiLFxuICAgICAgXCJpZFwiOiBcIlVFeFJZVXBFZDB4WWVVSjBXSEl4Um1VeVJsSjZTV1JVTTFKR1pVYzFNbEZXUmk1RFFVTkVSRFEyTmtJelJVUXhOVFkxXCIsXG4gICAgICBcInNuaXBwZXRcIjoge1xuICAgICAgICBcInB1Ymxpc2hlZEF0XCI6IFwiMjAxNS0wMy0zMVQxOTo1Nzo1My4wMDBaXCIsXG4gICAgICAgIFwiY2hhbm5lbElkXCI6IFwiVUNWTTRDMWZCOVFjd3k3ZE5qYlhlVVZ3XCIsXG4gICAgICAgIFwidGl0bGVcIjogXCJKdW5pb3IgRGV2ZWxvcGVyIDEwMTogVGlwcyBmb3IgSG93IHRvIFNjb3JlIGEgSm9iXCIsXG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJUcnlpbmcgdG8gYmVjb21lIGEganVuaW9yIGRldmVsb3Blcj8gSGF2ZSBhbnhpZXR5IGFib3V0IHRoZSBpbnRlcnZpZXcgcHJvY2Vzcz8gV2UgYXJlIGJyaW5naW5nIHRvZ2V0aGVyIGp1bmlvciBkZXZzIHdobyBtYWRlIGl0IHRocm91Z2ggb24gdGhlIG90aGVyIHNpZGUgYW5kIGxpdmVkIHRvIHRlbGwgdGhlIHRhbGUuXFxuXFxuSm9pbiB1cyBmb3IgYW5vdGhlciBHKyBIYW5nb3V0IHRvIHRhbGsgYWJvdXQgXFxcIkludGVydmlldyAxMDFcXFwiIHdpdGggZGV2cywgcmVjcnVpdGVycyBhbmQgZW1wbG95ZXJzLiAgXFxuXFxuV2UnbGwgYW5zd2VyIHF1ZXN0aW9ucyBsaWtlOlxcblxcbjEuIFdoYXQgYXJlIHNvbWUgb2YgdGhlIGJlc3QgcmVzb3VyY2VzIGZvciBteSBqb2Igc2VhcmNoP1xcbjIuIERvIEkgbmVlZCBwcmlvciBleHBlcmllbmNlIGluIGNvZGluZyBvciB0aGUgaW5kdXN0cnkgdG8gZ2V0IGEgam9iP1xcbjMuIFdoYXQga2luZCBvZiBqb2JzIHNob3VsZCBJIGJlIGxvb2tpbmcgZm9yPyBJcyBmcmVlbGFuY2luZyBhIGdvb2Qgb3B0aW9uPyBcXG40LiBJcyB5b3VyIHBvcnRmb2xpbyB0aGUgbW9zdCBpbXBvcnRhbnQgdGhpbmc/IEhvdyBjYW4gSSBtYWtlIG1pbmUgYmV0dGVyP1xcbjUuIFdoYXQgZG8gaGlyaW5nIG1hbmFnZXJzIHdhbnQgdG8gc2VlIG9uIGEgcmVzdW1lP1xcbjYuIFdoYXQgaGVscHMgbWUgYWN0dWFsbHkgZ2V0IGFuIGludGVydmlldz9cXG43LiBXaGF0IGRvIEkgbmVlZCB0byBkbyB0byBwcmVwYXJlPyBXaGF0IHRlc3QgcHJvZ3JhbXMgc2hvdWxkIEkga25vdz9cXG44LiBIb3cgZG8gSSBleHBsYWluIG15IGJhY2tncm91bmQgaWYgSSd2ZSBsZWFybmVkIGNvZGluZyBpbiBhIG5vbi10cmFkaXRpb25hbCB3YXk/XFxuOS4gV2hhdCBraW5kIG9mIHF1ZXN0aW9ucyBzaG91bGQgSSBiZSBhc2tpbmcgdGhlbT8gSG93IGRvIEkga25vdyBpZiBpdCdzIGEgZ29vZCBjdWx0dXJlIGZpdD9cXG4xMC4gQW55IHRpcHMgb24gaG93IHRvIHN0YW5kIG91dCBhbmQgZm9sbG93IHVwIGFmdGVyIHRoZSBmYWN0PyBcXG5cXG5Bc2sgcXVlc3Rpb25zIGFuZCBqb2luIHRoZSBjb252ZXJzYXRpb24gdXNpbmcgICNUaGlua0pvYnMgIVxcblxcblBhbmVsaXN0czpcXG5HcmFlIERyYWtlIChAR3JhZV9EcmFrZSkgLSBIZWFkIG9mIEVkdWNhdGlvbiBPcGVyYXRpb25zLCBUaGlua2Z1bCAoTW9kZXJhdG9yKVxcbkxhdXJhIEhvcmFrIChAbGF1cmFzaG9yYWsgKSAgLSBIZWFkIG9mIENvbW11bml0eSwgVGhpbmtmdWxcXG5UaG9tYXMgUGV0ZXJzb24gKEByaXBsZXlhZmZlY3QpIC0gRW5naW5lZXIsIFRoaW5rZnVsXFxuTGVlIEVkd2FyZHMgKEB0ZXJyb25rKSAtIEVuZ2luZWVyIE1hbmFnZXIsIEdyb3Vwb25cXG5Sb2NrbWFuIEhhIChAUm9ja3RvdGhlbWFuKSAtIENoaWVmIFBlb3BsZSBPZmZpY2VyOyBmb3JtZXJseSBNb25nbyBEQlxcbkVsaSBHb29kbWFuIChAZWxpbWdvb2RtYW4pIC0gQ2hpZWYgVGVjaG5vbG9neSBPZmZpY2VyLCBMaXR0bGUgQm9ycm93ZWQgRHJlc3NcIixcbiAgICAgICAgXCJ0aHVtYm5haWxzXCI6IHtcbiAgICAgICAgICBcImRlZmF1bHRcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpLzlxRUZEcWhQRENrL2RlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDEyMCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDkwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcIm1lZGl1bVwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvOXFFRkRxaFBEQ2svbXFkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiAzMjAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiAxODBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiaGlnaFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvOXFFRkRxaFBEQ2svaHFkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiA0ODAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiAzNjBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwic3RhbmRhcmRcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpLzlxRUZEcWhQRENrL3NkZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogNjQwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogNDgwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcIm1heHJlc1wiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvOXFFRkRxaFBEQ2svbWF4cmVzZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogMTI4MCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDcyMFxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJjaGFubmVsVGl0bGVcIjogXCJKdXN0eW4gQ2xhcmtcIixcbiAgICAgICAgXCJwbGF5bGlzdElkXCI6IFwiUExRYUpEd0xYeUJ0WHIxRmUyRlJ6SWRUM1JGZUc1MlFWRlwiLFxuICAgICAgICBcInBvc2l0aW9uXCI6IDcsXG4gICAgICAgIFwicmVzb3VyY2VJZFwiOiB7XG4gICAgICAgICAgXCJraW5kXCI6IFwieW91dHViZSN2aWRlb1wiLFxuICAgICAgICAgIFwidmlkZW9JZFwiOiBcIjlxRUZEcWhQRENrXCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwiY29udGVudERldGFpbHNcIjoge1xuICAgICAgICBcInZpZGVvSWRcIjogXCI5cUVGRHFoUERDa1wiLFxuICAgICAgICBcInZpZGVvUHVibGlzaGVkQXRcIjogXCIyMDE0LTA3LTExVDE5OjUyOjIwLjAwMFpcIlxuICAgICAgfVxuICAgIH0sXG4gICAge1xuXG5cbiAgICAgIFwia2luZFwiOiBcInlvdXR1YmUjcGxheWxpc3RJdGVtXCIsXG4gICAgICBcImV0YWdcIjogXCJcXFwiY2J6M2xJUTJOMjVBZndOci1CZHhVVnhKX1FZL2NCVUJmeHBOSUFUZEZGLXdZZ1ljeENxdmViOFxcXCJcIixcbiAgICAgIFwiaWRcIjogXCJVRXhSWVVwRWQweFllVUowV0hJeFJtVXlSbEo2U1dSVU0xSkdaVWMxTWxGV1JpNDVORGsxUkVaRU56aEVNelU1TURRelwiLFxuICAgICAgXCJzbmlwcGV0XCI6IHtcbiAgICAgICAgXCJwdWJsaXNoZWRBdFwiOiBcIjIwMTUtMDktMjlUMDY6Mjk6MTMuMDAwWlwiLFxuICAgICAgICBcImNoYW5uZWxJZFwiOiBcIlVDVk00QzFmQjlRY3d5N2ROamJYZVVWd1wiLFxuICAgICAgICBcInRpdGxlXCI6IFwiQ1NTIHByZXByb2Nlc3NvcnMgd2l0aCBKb25hdGhhbiBWZXJyZWNjaGlhXCIsXG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJZZWxwIGZyb250LWVuZCBlbmdpbmVlciBKb25hdGhhbiBWZXJyZWNjaGlhIHdpbGwgZGVtb25zdHJhdGUgdGhlIHBvd2VyIG9mIENTUyBwcmVwcm9jZXNzb3JzIGFuZCBleHBsYWluIHdoeSBoZSBiZWxpZXZlcyB0aGVzZSBhcmUgYSBnYW1lIGNoYW5nZXIgZm9yIGZyb250LWVuZCBkZXZlbG9wbWVudCBpbiB0aGlzIHByZXNlbnRhdGlvbiBnaXZlbiBhdCB0aGUgU2FuIEZyYW5jaXNjbyBIVE1MNSBVc2VyIEdyb3VwLlxcblxcbkpvbmF0aGFuJ3MgdGFsayB3aWxsIGNvdmVyOlxcbi0gQ1NTIHdlYWtuZXNzZXNcXG4tIFByZXByb2Nlc3NvciBmZWF0dXJlc1xcbi0gQ29tbW9uIG1pc2NvbmNlcHRpb25zXFxuLSBTYXNzLCBMZXNzLCBvciBTdHlsdXM/XFxuLSBXb3JrZmxvdyBhbmQgdGVjaG5pcXVlc1xcbi0gUHJlcHJvY2Vzc29ycyArIE9PQ1NcXG5cXG4qKiBNb3JlIHZpZGVvcyBvbiBvcGVuIHNvdXJjZSBkZXZlbG9wbWVudCBhdCBodHRwOi8vbWFyYWthbmEuY29tL3MvXFxuKiogU2xpZGVzIGF0IGh0dHA6Ly9tcmtuLmNvL3VjdnBtXCIsXG4gICAgICAgIFwidGh1bWJuYWlsc1wiOiB7XG4gICAgICAgICAgXCJkZWZhdWx0XCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9GbFcydnZsMHl2by9kZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiAxMjAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiA5MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJtZWRpdW1cIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL0ZsVzJ2dmwweXZvL21xZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogMzIwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogMTgwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImhpZ2hcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL0ZsVzJ2dmwweXZvL2hxZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogNDgwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogMzYwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInN0YW5kYXJkXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9GbFcydnZsMHl2by9zZGRlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDY0MCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDQ4MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJtYXhyZXNcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL0ZsVzJ2dmwweXZvL21heHJlc2RlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDEyODAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiA3MjBcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIFwiY2hhbm5lbFRpdGxlXCI6IFwiSnVzdHluIENsYXJrXCIsXG4gICAgICAgIFwicGxheWxpc3RJZFwiOiBcIlBMUWFKRHdMWHlCdFhyMUZlMkZSeklkVDNSRmVHNTJRVkZcIixcbiAgICAgICAgXCJwb3NpdGlvblwiOiA4LFxuICAgICAgICBcInJlc291cmNlSWRcIjoge1xuICAgICAgICAgIFwia2luZFwiOiBcInlvdXR1YmUjdmlkZW9cIixcbiAgICAgICAgICBcInZpZGVvSWRcIjogXCJGbFcydnZsMHl2b1wiXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcImNvbnRlbnREZXRhaWxzXCI6IHtcbiAgICAgICAgXCJ2aWRlb0lkXCI6IFwiRmxXMnZ2bDB5dm9cIixcbiAgICAgICAgXCJ2aWRlb1B1Ymxpc2hlZEF0XCI6IFwiMjAxMi0wNi0xMlQyMTowMzozMS4wMDBaXCJcbiAgICAgIH1cbiAgICB9LFxuICAgIHtcblxuXG4gICAgICBcImtpbmRcIjogXCJ5b3V0dWJlI3BsYXlsaXN0SXRlbVwiLFxuICAgICAgXCJldGFnXCI6IFwiXFxcImNiejNsSVEyTjI1QWZ3TnItQmR4VVZ4Sl9RWS82UWY2TGFBU0NCWm1GRklCRm9xZmE2V05IU3dcXFwiXCIsXG4gICAgICBcImlkXCI6IFwiVUV4UllVcEVkMHhZZVVKMFdISXhSbVV5UmxKNlNXUlVNMUpHWlVjMU1sRldSaTVHTmpORFJEUkVNRFF4T1RoQ01EUTJcIixcbiAgICAgIFwic25pcHBldFwiOiB7XG4gICAgICAgIFwicHVibGlzaGVkQXRcIjogXCIyMDE1LTEyLTAzVDA3OjEyOjA3LjAwMFpcIixcbiAgICAgICAgXCJjaGFubmVsSWRcIjogXCJVQ1ZNNEMxZkI5UWN3eTdkTmpiWGVVVndcIixcbiAgICAgICAgXCJ0aXRsZVwiOiBcIlJFU1QgQVBJIGNvbmNlcHRzIGFuZCBleGFtcGxlc1wiLFxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiVGhpcyB2aWRlbyBpbnRyb2R1Y2VzIHRoZSB2aWV3ZXIgdG8gc29tZSBBUEkgY29uY2VwdHMgYnkgbWFraW5nIGV4YW1wbGUgY2FsbHMgdG8gRmFjZWJvb2sncyBHcmFwaCBBUEksIEdvb2dsZSBNYXBzJyBBUEksIEluc3RhZ3JhbSdzIE1lZGlhIFNlYXJjaCBBUEksIGFuZCBUd2l0dGVyJ3MgU3RhdHVzIFVwZGF0ZSBBUEkuXFxuXFxuLyoqKioqKioqKiogVklERU8gTElOS1MgKioqKioqKioqKi9cXG5cXG5Zb3V0dWJlJ3MgRmFjZWJvb2sgUGFnZSB2aWEgdGhlIEZhY2Vib29rIEdyYXBoIEFQSVxcbmh0dHA6Ly9ncmFwaC5mYWNlYm9vay5jb20veW91dHViZVxcblxcblNhbWUgdGhpbmcsIHRoaXMgdGltZSB3aXRoIGZpbHRlcnNcXG5odHRwczovL2dyYXBoLmZhY2Vib29rLmNvbS95b3V0dWJlP2ZpZWxkcz1pZCxuYW1lLGxpa2VzXFxuXFxuR29vZ2xlIE1hcHMgR2VvY29kZSBBUEkgY2FsbCBmb3IgdGhlIGNpdHkgb2YgQ2hpY2Fnb1xcbmh0dHA6Ly9tYXBzLmdvb2dsZWFwaXMuY29tL21hcHMvYXBpL2dlb2NvZGUvanNvbj9hZGRyZXNzPUNoaWNhZ29cXG5cXG5BcGlnZWUgSW5zdGFncmFtIEFQSSBjb25zb2xlXFxuaHR0cHM6Ly9hcGlnZWUuY29tL2NvbnNvbGUvaW5zdGFncmFtXFxuXFxuSFRUUCBSZXF1ZXN0IE1ldGhvZHNcXG5odHRwOi8vZW4ud2lraXBlZGlhLm9yZy93aWtpL0h5cGVydGV4dF9UcmFuc2Zlcl9Qcm90b2NvbCNSZXF1ZXN0X21ldGhvZHNcXG5cXG5Qb3N0bWFuIENocm9tZSBFeHRlbnNpb25cXG5odHRwczovL2Nocm9tZS5nb29nbGUuY29tL3dlYnN0b3JlL2RldGFpbC9wb3N0bWFuLXJlc3QtY2xpZW50L2ZkbW1naWxnbnBqaWdkb2pvanBqb29vaWRrbWNvbWNtP2hsPWVuXFxuXFxuVHdpdHRlcidzIFN0YXR1cyBVcGRhdGUgZG9jdW1lbnRhdGlvbi5cXG5odHRwczovL2Rldi50d2l0dGVyLmNvbS9kb2NzL2FwaS8xLjEvcG9zdC9zdGF0dXNlcy91cGRhdGVcIixcbiAgICAgICAgXCJ0aHVtYm5haWxzXCI6IHtcbiAgICAgICAgICBcImRlZmF1bHRcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpLzdZY1cyNVBIbkFBL2RlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDEyMCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDkwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcIm1lZGl1bVwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvN1ljVzI1UEhuQUEvbXFkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiAzMjAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiAxODBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiaGlnaFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvN1ljVzI1UEhuQUEvaHFkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiA0ODAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiAzNjBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwic3RhbmRhcmRcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpLzdZY1cyNVBIbkFBL3NkZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogNjQwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogNDgwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcIm1heHJlc1wiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvN1ljVzI1UEhuQUEvbWF4cmVzZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogMTI4MCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDcyMFxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJjaGFubmVsVGl0bGVcIjogXCJKdXN0eW4gQ2xhcmtcIixcbiAgICAgICAgXCJwbGF5bGlzdElkXCI6IFwiUExRYUpEd0xYeUJ0WHIxRmUyRlJ6SWRUM1JGZUc1MlFWRlwiLFxuICAgICAgICBcInBvc2l0aW9uXCI6IDksXG4gICAgICAgIFwicmVzb3VyY2VJZFwiOiB7XG4gICAgICAgICAgXCJraW5kXCI6IFwieW91dHViZSN2aWRlb1wiLFxuICAgICAgICAgIFwidmlkZW9JZFwiOiBcIjdZY1cyNVBIbkFBXCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwiY29udGVudERldGFpbHNcIjoge1xuICAgICAgICBcInZpZGVvSWRcIjogXCI3WWNXMjVQSG5BQVwiLFxuICAgICAgICBcInZpZGVvUHVibGlzaGVkQXRcIjogXCIyMDE0LTA3LTE0VDA4OjA2OjQ5LjAwMFpcIlxuICAgICAgfVxuICAgIH0sXG4gICAge1xuXG5cbiAgICAgIFwia2luZFwiOiBcInlvdXR1YmUjcGxheWxpc3RJdGVtXCIsXG4gICAgICBcImV0YWdcIjogXCJcXFwiY2J6M2xJUTJOMjVBZndOci1CZHhVVnhKX1FZL3pTNjhlUzdIaXRadFVYczAtNHFYVEFLcGphY1xcXCJcIixcbiAgICAgIFwiaWRcIjogXCJVRXhSWVVwRWQweFllVUowV0hJeFJtVXlSbEo2U1dSVU0xSkdaVWMxTWxGV1JpNDBOelpDTUVSRE1qVkVOMFJGUlRoQlwiLFxuICAgICAgXCJzbmlwcGV0XCI6IHtcbiAgICAgICAgXCJwdWJsaXNoZWRBdFwiOiBcIjIwMTUtMTItMDdUMDY6MTk6MDMuMDAwWlwiLFxuICAgICAgICBcImNoYW5uZWxJZFwiOiBcIlVDVk00QzFmQjlRY3d5N2ROamJYZVVWd1wiLFxuICAgICAgICBcInRpdGxlXCI6IFwiVmVsb2NpdHkuanM6IFVJIFBhY2sgT3ZlcnZpZXdcIixcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIlBsYXkgd2l0aCB0aGUgVUkgcGFjayBhdCBodHRwOi8vVmVsb2NpdHlKUy5vcmcvI3VpUGFjay5cXG5cXG5SZWFkIHRoZSBmdWxsIHR1dG9yaWFsOiBodHRwOi8vd3d3LnNtYXNoaW5nbWFnYXppbmUuY29tLzIwMTQvMDYvMTgvZmFzdGVyLXVpLWFuaW1hdGlvbnMtd2l0aC12ZWxvY2l0eS1qcy9cIixcbiAgICAgICAgXCJ0aHVtYm5haWxzXCI6IHtcbiAgICAgICAgICBcImRlZmF1bHRcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL0Nkd3ZSNmEzOVRnL2RlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDEyMCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDkwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcIm1lZGl1bVwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvQ2R3dlI2YTM5VGcvbXFkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiAzMjAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiAxODBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiaGlnaFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvQ2R3dlI2YTM5VGcvaHFkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiA0ODAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiAzNjBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwic3RhbmRhcmRcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL0Nkd3ZSNmEzOVRnL3NkZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogNjQwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogNDgwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcIm1heHJlc1wiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvQ2R3dlI2YTM5VGcvbWF4cmVzZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogMTI4MCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDcyMFxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJjaGFubmVsVGl0bGVcIjogXCJKdXN0eW4gQ2xhcmtcIixcbiAgICAgICAgXCJwbGF5bGlzdElkXCI6IFwiUExRYUpEd0xYeUJ0WHIxRmUyRlJ6SWRUM1JGZUc1MlFWRlwiLFxuICAgICAgICBcInBvc2l0aW9uXCI6IDEwLFxuICAgICAgICBcInJlc291cmNlSWRcIjoge1xuICAgICAgICAgIFwia2luZFwiOiBcInlvdXR1YmUjdmlkZW9cIixcbiAgICAgICAgICBcInZpZGVvSWRcIjogXCJDZHd2UjZhMzlUZ1wiXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcImNvbnRlbnREZXRhaWxzXCI6IHtcbiAgICAgICAgXCJ2aWRlb0lkXCI6IFwiQ2R3dlI2YTM5VGdcIixcbiAgICAgICAgXCJ2aWRlb1B1Ymxpc2hlZEF0XCI6IFwiMjAxNC0wNS0yOFQxNjoyMDozOS4wMDBaXCJcbiAgICAgIH1cbiAgICB9LFxuICAgIHtcblxuXG4gICAgICBcImtpbmRcIjogXCJ5b3V0dWJlI3BsYXlsaXN0SXRlbVwiLFxuICAgICAgXCJldGFnXCI6IFwiXFxcImNiejNsSVEyTjI1QWZ3TnItQmR4VVZ4Sl9RWS9jZHF6WElGNWF5STBQZHZNdHFkS1diQ3ZOWWtcXFwiXCIsXG4gICAgICBcImlkXCI6IFwiVUV4UllVcEVkMHhZZVVKMFdISXhSbVV5UmxKNlNXUlVNMUpHWlVjMU1sRldSaTVFTUVFd1JVWTVNMFJEUlRVM05ESkNcIixcbiAgICAgIFwic25pcHBldFwiOiB7XG4gICAgICAgIFwicHVibGlzaGVkQXRcIjogXCIyMDE2LTAxLTA5VDE4OjUwOjI0LjAwMFpcIixcbiAgICAgICAgXCJjaGFubmVsSWRcIjogXCJVQ1ZNNEMxZkI5UWN3eTdkTmpiWGVVVndcIixcbiAgICAgICAgXCJ0aXRsZVwiOiBcIlRvcCAxMCBQcm9ncmFtbWluZyBMYW5ndWFnZXMgdG8gTGVhcm4gaW4gMjAxNlwiLFxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiVEhJUyBWSURFTyBJUyBTUE9OU09SRUQgQllcXG5cXG5UaGUgVGVjaCBBY2FkZW15IGh0dHA6Ly9vdy5seS9SQU1PMzBmRTdPY1xcblxcbkhpcHN0ZXJDb2RlIGh0dHBzOi8vd3d3LmhpcHN0ZXJjb2RlLmNvbS9cIixcbiAgICAgICAgXCJ0aHVtYm5haWxzXCI6IHtcbiAgICAgICAgICBcImRlZmF1bHRcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL1o1NkdMUlh4aDg4L2RlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDEyMCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDkwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcIm1lZGl1bVwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvWjU2R0xSWHhoODgvbXFkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiAzMjAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiAxODBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiaGlnaFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvWjU2R0xSWHhoODgvaHFkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiA0ODAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiAzNjBcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIFwiY2hhbm5lbFRpdGxlXCI6IFwiSnVzdHluIENsYXJrXCIsXG4gICAgICAgIFwicGxheWxpc3RJZFwiOiBcIlBMUWFKRHdMWHlCdFhyMUZlMkZSeklkVDNSRmVHNTJRVkZcIixcbiAgICAgICAgXCJwb3NpdGlvblwiOiAxMSxcbiAgICAgICAgXCJyZXNvdXJjZUlkXCI6IHtcbiAgICAgICAgICBcImtpbmRcIjogXCJ5b3V0dWJlI3ZpZGVvXCIsXG4gICAgICAgICAgXCJ2aWRlb0lkXCI6IFwiWjU2R0xSWHhoODhcIlxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgXCJjb250ZW50RGV0YWlsc1wiOiB7XG4gICAgICAgIFwidmlkZW9JZFwiOiBcIlo1NkdMUlh4aDg4XCIsXG4gICAgICAgIFwidmlkZW9QdWJsaXNoZWRBdFwiOiBcIjIwMTUtMDgtMDdUMDE6MTg6MzkuMDAwWlwiXG4gICAgICB9XG4gICAgfSxcbiAgICB7XG5cblxuICAgICAgXCJraW5kXCI6IFwieW91dHViZSNwbGF5bGlzdEl0ZW1cIixcbiAgICAgIFwiZXRhZ1wiOiBcIlxcXCJjYnozbElRMk4yNUFmd05yLUJkeFVWeEpfUVkvamRDeTdqamdyYmRWMVpTeHk1RXRJSkJMOS0wXFxcIlwiLFxuICAgICAgXCJpZFwiOiBcIlVFeFJZVXBFZDB4WWVVSjBXSEl4Um1VeVJsSjZTV1JVTTFKR1pVYzFNbEZXUmk0NU9EUkROVGcwUWpBNE5rRkJOa1F5XCIsXG4gICAgICBcInNuaXBwZXRcIjoge1xuICAgICAgICBcInB1Ymxpc2hlZEF0XCI6IFwiMjAxNi0wMS0xNVQwMDoxNzo0Ni4wMDBaXCIsXG4gICAgICAgIFwiY2hhbm5lbElkXCI6IFwiVUNWTTRDMWZCOVFjd3k3ZE5qYlhlVVZ3XCIsXG4gICAgICAgIFwidGl0bGVcIjogXCJFZGdlIENvbmZlcmVuY2UgMjAxNSAtIDQgQ29tcG9uZW50cyBhbmQgTW9kdWxlc1wiLFxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiXCIsXG4gICAgICAgIFwidGh1bWJuYWlsc1wiOiB7XG4gICAgICAgICAgXCJkZWZhdWx0XCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9KUWdCYjlXZVlISS9kZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiAxMjAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiA5MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJtZWRpdW1cIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL0pRZ0JiOVdlWUhJL21xZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogMzIwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogMTgwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImhpZ2hcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL0pRZ0JiOVdlWUhJL2hxZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogNDgwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogMzYwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInN0YW5kYXJkXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9KUWdCYjlXZVlISS9zZGRlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDY0MCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDQ4MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJtYXhyZXNcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL0pRZ0JiOVdlWUhJL21heHJlc2RlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDEyODAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiA3MjBcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIFwiY2hhbm5lbFRpdGxlXCI6IFwiSnVzdHluIENsYXJrXCIsXG4gICAgICAgIFwicGxheWxpc3RJZFwiOiBcIlBMUWFKRHdMWHlCdFhyMUZlMkZSeklkVDNSRmVHNTJRVkZcIixcbiAgICAgICAgXCJwb3NpdGlvblwiOiAxMixcbiAgICAgICAgXCJyZXNvdXJjZUlkXCI6IHtcbiAgICAgICAgICBcImtpbmRcIjogXCJ5b3V0dWJlI3ZpZGVvXCIsXG4gICAgICAgICAgXCJ2aWRlb0lkXCI6IFwiSlFnQmI5V2VZSElcIlxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgXCJjb250ZW50RGV0YWlsc1wiOiB7XG4gICAgICAgIFwidmlkZW9JZFwiOiBcIkpRZ0JiOVdlWUhJXCIsXG4gICAgICAgIFwidmlkZW9QdWJsaXNoZWRBdFwiOiBcIjIwMTUtMDctMTNUMTE6MDY6MDUuMDAwWlwiXG4gICAgICB9XG4gICAgfSxcbiAgICB7XG5cblxuICAgICAgXCJraW5kXCI6IFwieW91dHViZSNwbGF5bGlzdEl0ZW1cIixcbiAgICAgIFwiZXRhZ1wiOiBcIlxcXCJjYnozbElRMk4yNUFmd05yLUJkeFVWeEpfUVkvLU4xUFZ3dHpfblFpUGQ0VFVVUDYtWDNwS05RXFxcIlwiLFxuICAgICAgXCJpZFwiOiBcIlVFeFJZVXBFZDB4WWVVSjBXSEl4Um1VeVJsSjZTV1JVTTFKR1pVYzFNbEZXUmk0ek1EZzVNa1E1TUVWRE1FTTFOVGcyXCIsXG4gICAgICBcInNuaXBwZXRcIjoge1xuICAgICAgICBcInB1Ymxpc2hlZEF0XCI6IFwiMjAxNi0wMS0yNFQwOTo1NTozNy4wMDBaXCIsXG4gICAgICAgIFwiY2hhbm5lbElkXCI6IFwiVUNWTTRDMWZCOVFjd3k3ZE5qYlhlVVZ3XCIsXG4gICAgICAgIFwidGl0bGVcIjogXCJbRXAuIDFdIEFuZ3VsYXIgdG8gUmVhY3RcIixcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIlwiLFxuICAgICAgICBcInRodW1ibmFpbHNcIjoge1xuICAgICAgICAgIFwiZGVmYXVsdFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvMFRzZ2ViaWRGZm8vZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogMTIwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogOTBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwibWVkaXVtXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS8wVHNnZWJpZEZmby9tcWRlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDMyMCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDE4MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJoaWdoXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS8wVHNnZWJpZEZmby9ocWRlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDQ4MCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDM2MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJzdGFuZGFyZFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvMFRzZ2ViaWRGZm8vc2RkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiA2NDAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiA0ODBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwibWF4cmVzXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS8wVHNnZWJpZEZmby9tYXhyZXNkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiAxMjgwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogNzIwXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcImNoYW5uZWxUaXRsZVwiOiBcIkp1c3R5biBDbGFya1wiLFxuICAgICAgICBcInBsYXlsaXN0SWRcIjogXCJQTFFhSkR3TFh5QnRYcjFGZTJGUnpJZFQzUkZlRzUyUVZGXCIsXG4gICAgICAgIFwicG9zaXRpb25cIjogMTMsXG4gICAgICAgIFwicmVzb3VyY2VJZFwiOiB7XG4gICAgICAgICAgXCJraW5kXCI6IFwieW91dHViZSN2aWRlb1wiLFxuICAgICAgICAgIFwidmlkZW9JZFwiOiBcIjBUc2dlYmlkRmZvXCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwiY29udGVudERldGFpbHNcIjoge1xuICAgICAgICBcInZpZGVvSWRcIjogXCIwVHNnZWJpZEZmb1wiLFxuICAgICAgICBcInZpZGVvUHVibGlzaGVkQXRcIjogXCIyMDE1LTEyLTI4VDIyOjA3OjQ4LjAwMFpcIlxuICAgICAgfVxuICAgIH0sXG4gICAge1xuXG5cbiAgICAgIFwia2luZFwiOiBcInlvdXR1YmUjcGxheWxpc3RJdGVtXCIsXG4gICAgICBcImV0YWdcIjogXCJcXFwiY2J6M2xJUTJOMjVBZndOci1CZHhVVnhKX1FZL3hMaWNyT212YkluMmJMOFo4UzF6N0ZoVm5BNFxcXCJcIixcbiAgICAgIFwiaWRcIjogXCJVRXhSWVVwRWQweFllVUowV0hJeFJtVXlSbEo2U1dSVU0xSkdaVWMxTWxGV1JpNDFNemsyUVRBeE1Ua3pORGs0TURoRlwiLFxuICAgICAgXCJzbmlwcGV0XCI6IHtcbiAgICAgICAgXCJwdWJsaXNoZWRBdFwiOiBcIjIwMTYtMDEtMjlUMDg6Mjg6NTcuMDAwWlwiLFxuICAgICAgICBcImNoYW5uZWxJZFwiOiBcIlVDVk00QzFmQjlRY3d5N2ROamJYZVVWd1wiLFxuICAgICAgICBcInRpdGxlXCI6IFwiUmVhY3QgYW5kIFJlZHV4XCIsXG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCIqKiBJIGhhdmUgY3JlYXRlZCBhIGJldHRlciwgbW9yZSBjb21wcmVoZW5zaXZlIHZpZGVvIHNlcmllcyBhYm91dCB1c2luZyBSZWFjdCwgUmVkdXggYW5kIFdlYnBhY2sgdG8gYnVpbGQgd2ViIGFwcHMuIENoZWNrIGl0IG91dCBhdCBodHRwOi8vd3d3LnlvdXR1YmUuY29tL3BsYXlsaXN0P2xpc3Q9UExRRG54WHFWMjEzSkpGdERhRzBhRTl2cXZwNldtN25CZyAqKlxcblxcbkEgdGFsayBhbmQgbGl2ZSBkZW1vIGFib3V0IGhvdyAoYW5kIHdoeSkgdG8gdXNlIFJlYWN0IGFuZCBSZWR1eC4gUHJlc2VudGF0aW9uIHJlY29yZGVkIGF0IEhhY2sgUmVhY3RvciBvbiBOb3YuIDMwLCAyMDE1LiBHaXRodWIgcmVwbyB0byBmb2xsb3cgYWxvbmcgY2FuIGJlIGZvdW5kIGF0IGh0dHBzOi8vZ2l0aHViLmNvbS9rd2VpYmVydGgvcmVhY3QtcmVkdXgtdG9kby1kZW1vLiBUaGUgbWFzdGVyIGJyYW5jaCBpcyB0aGUgZmluaXNoZWQgcHJvZHVjdCBhZnRlciB0aGUgZGVtbyBpcyBjb21wbGV0ZWQuIFRoZSByZWFjdC1kZW1vLXN0YXJ0IGJyYW5jaCBpcyB0aGUgc3RhcnRpbmcgcG9pbnQgZm9yIHRoZSBmaXJzdCBkZW1vIGFuZCB0aGUgcmVkdXgtZGVtby1zdGFydCBicmFuY2ggaXMgdGhlIHN0YXJ0aW5nIHBvaW50IGZvciB0aGUgc2Vjb25kIGRlbW8uXCIsXG4gICAgICAgIFwidGh1bWJuYWlsc1wiOiB7XG4gICAgICAgICAgXCJkZWZhdWx0XCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS83ZUxxS2dwMGVlWS9kZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiAxMjAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiA5MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJtZWRpdW1cIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpLzdlTHFLZ3AwZWVZL21xZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogMzIwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogMTgwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImhpZ2hcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpLzdlTHFLZ3AwZWVZL2hxZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogNDgwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogMzYwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInN0YW5kYXJkXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS83ZUxxS2dwMGVlWS9zZGRlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDY0MCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDQ4MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJtYXhyZXNcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpLzdlTHFLZ3AwZWVZL21heHJlc2RlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDEyODAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiA3MjBcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIFwiY2hhbm5lbFRpdGxlXCI6IFwiSnVzdHluIENsYXJrXCIsXG4gICAgICAgIFwicGxheWxpc3RJZFwiOiBcIlBMUWFKRHdMWHlCdFhyMUZlMkZSeklkVDNSRmVHNTJRVkZcIixcbiAgICAgICAgXCJwb3NpdGlvblwiOiAxNCxcbiAgICAgICAgXCJyZXNvdXJjZUlkXCI6IHtcbiAgICAgICAgICBcImtpbmRcIjogXCJ5b3V0dWJlI3ZpZGVvXCIsXG4gICAgICAgICAgXCJ2aWRlb0lkXCI6IFwiN2VMcUtncDBlZVlcIlxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgXCJjb250ZW50RGV0YWlsc1wiOiB7XG4gICAgICAgIFwidmlkZW9JZFwiOiBcIjdlTHFLZ3AwZWVZXCIsXG4gICAgICAgIFwidmlkZW9QdWJsaXNoZWRBdFwiOiBcIjIwMTUtMTItMTJUMjI6Mzc6MTYuMDAwWlwiXG4gICAgICB9XG4gICAgfSxcbiAgICB7XG5cblxuICAgICAgXCJraW5kXCI6IFwieW91dHViZSNwbGF5bGlzdEl0ZW1cIixcbiAgICAgIFwiZXRhZ1wiOiBcIlxcXCJjYnozbElRMk4yNUFmd05yLUJkeFVWeEpfUVkvSEZWaEFqMThkdC0wcnZjSzZacVgxUGNyM0hVXFxcIlwiLFxuICAgICAgXCJpZFwiOiBcIlVFeFJZVXBFZDB4WWVVSjBXSEl4Um1VeVJsSjZTV1JVTTFKR1pVYzFNbEZXUmk1RVFVRTFOVEZEUmpjd01EZzBORU16XCIsXG4gICAgICBcInNuaXBwZXRcIjoge1xuICAgICAgICBcInB1Ymxpc2hlZEF0XCI6IFwiMjAxNi0wMS0yOVQwODoyOTowNy4wMDBaXCIsXG4gICAgICAgIFwiY2hhbm5lbElkXCI6IFwiVUNWTTRDMWZCOVFjd3k3ZE5qYlhlVVZ3XCIsXG4gICAgICAgIFwidGl0bGVcIjogXCJSZWFjdCBGb3IgRXZlcnlvbmUgIzggLSBCYXNpYyBXZWJwYWNrIENvbmZpZ3VyYXRpb24gJiBTZXJ2ZXJcIixcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkluIHRoaXMgUmVhY3QgdmlkZW8gdHV0b3JpYWwsIHdlIGZpbmlzaCBvdXIgc2V0dXAgYnkgd3JpdGluZyBvdXIgd2VicGFjayBjb25maWcgZmlsZS4gU3Vic2NyaWJlIGZvciBtb3JlIGZyZWUgdHV0b3JpYWxzIGh0dHBzOi8vZ29vLmdsLzZsam9GYywgbW9yZSBSZWFjdCBUdXRvcmlhbHM6IGh0dHBzOi8vZ29vLmdsL3RSVUFCOVxcblxcblN1cHBvcnQgRnJlZSBUdXRvcmlhbHNcXG5odHRwczovL3d3dy5sZXZlbHVwdHV0b3JpYWxzLmNvbS9zdG9yZS9cXG5cXG5UaGUgYmVzdCBzaGFyZWQgd2ViIGhvc3RpbmdcXG5odHRwOi8vd3d3LmJsdWVob3N0LmNvbS90cmFjay9sZXZlbHVwdHV0b3JpYWxzL1xcblxcblN1YnNjcmliZSB0byBMZXZlbCBVcCBQcm8gZm9yIGV4dHJhIGZlYXR1cmVzIVxcbmh0dHBzOi8vd3d3LmxldmVsdXB0dXRvcmlhbHMuY29tL3N0b3JlL3Byb2R1Y3RzL3Byb1xcblxcblN1YnNjcmliZSB0byB0aGUgTGV2ZWwgVXAgTmV3c2xldHRlclxcbmh0dHA6Ly9lZXB1cmwuY29tL0FXakd6XFxuXFxuVG8gU3VwcG9ydCBMZXZlbCBVcCBUdXRzOlxcbmh0dHA6Ly9sZXZlbHVwdHV0cy5jb20vZG9uYXRpb25zXFxuXFxuU2ltcGxlIGNsb3VkIGhvc3RpbmcsIGJ1aWx0IGZvciBkZXZlbG9wZXJzLjpcXG5odHRwczovL3d3dy5kaWdpdGFsb2NlYW4uY29tLz9yZWZjb2RlPTY3MzU3MTc0YjA5ZVxcblxcbkxlYXJuIFJlYWN0IGpzIGZyb20gc2NyYXRjaCBpbiB0aGUgbmV3IHZpZGVvIHR1dG9yaWFsIHNlcmllcyBSZWFjdCBGb3IgQmVnaW5uZXJzLiBXZSdsbCBiZSBpbnRyb2R1Y2luZyBjb3JlIGNvbmNlcHRzIGFuZCBleHBsb3JpbmcgcmVhbCB3b3JsZCBhcHBsaWNhdGlvbiB0ZWNobmlxdWVzIGFzIHdlIGdvLiBOZXcgdmlkZW9zIGV2ZXJ5IHdlZWshXCIsXG4gICAgICAgIFwidGh1bWJuYWlsc1wiOiB7XG4gICAgICAgICAgXCJkZWZhdWx0XCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9BdEtoNnRwNDRDay9kZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiAxMjAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiA5MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJtZWRpdW1cIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL0F0S2g2dHA0NENrL21xZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogMzIwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogMTgwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImhpZ2hcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL0F0S2g2dHA0NENrL2hxZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogNDgwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogMzYwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInN0YW5kYXJkXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9BdEtoNnRwNDRDay9zZGRlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDY0MCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDQ4MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJtYXhyZXNcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL0F0S2g2dHA0NENrL21heHJlc2RlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDEyODAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiA3MjBcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIFwiY2hhbm5lbFRpdGxlXCI6IFwiSnVzdHluIENsYXJrXCIsXG4gICAgICAgIFwicGxheWxpc3RJZFwiOiBcIlBMUWFKRHdMWHlCdFhyMUZlMkZSeklkVDNSRmVHNTJRVkZcIixcbiAgICAgICAgXCJwb3NpdGlvblwiOiAxNSxcbiAgICAgICAgXCJyZXNvdXJjZUlkXCI6IHtcbiAgICAgICAgICBcImtpbmRcIjogXCJ5b3V0dWJlI3ZpZGVvXCIsXG4gICAgICAgICAgXCJ2aWRlb0lkXCI6IFwiQXRLaDZ0cDQ0Q2tcIlxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgXCJjb250ZW50RGV0YWlsc1wiOiB7XG4gICAgICAgIFwidmlkZW9JZFwiOiBcIkF0S2g2dHA0NENrXCIsXG4gICAgICAgIFwidmlkZW9QdWJsaXNoZWRBdFwiOiBcIjIwMTYtMDEtMTVUMDA6MjQ6MjkuMDAwWlwiXG4gICAgICB9XG4gICAgfSxcbiAgICB7XG5cblxuICAgICAgXCJraW5kXCI6IFwieW91dHViZSNwbGF5bGlzdEl0ZW1cIixcbiAgICAgIFwiZXRhZ1wiOiBcIlxcXCJjYnozbElRMk4yNUFmd05yLUJkeFVWeEpfUVkvNV9idXJnU2dTQkpVam9wOUlWaDk5cUdsYlRNXFxcIlwiLFxuICAgICAgXCJpZFwiOiBcIlVFeFJZVXBFZDB4WWVVSjBXSEl4Um1VeVJsSjZTV1JVTTFKR1pVYzFNbEZXUmk0MVFUWTFRMFV4TVRWQ09EY3pOVGhFXCIsXG4gICAgICBcInNuaXBwZXRcIjoge1xuICAgICAgICBcInB1Ymxpc2hlZEF0XCI6IFwiMjAxNi0xMi0wN1QwNDoyMToyNC4wMDBaXCIsXG4gICAgICAgIFwiY2hhbm5lbElkXCI6IFwiVUNWTTRDMWZCOVFjd3k3ZE5qYlhlVVZ3XCIsXG4gICAgICAgIFwidGl0bGVcIjogXCJMZWFybiBSZWFjdCB3aXRoIHByb2dyZXNzaXZlIGJvaWxlcnBsYXRlc1wiLFxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiSW4gdGhpcyB2aWRlbyBJIGludHJvZHVjZSB0aGUgY29uY2VwdCBvZiBwcm9ncmVzc2l2ZSBib2lsZXJwbGF0ZSBhbmQgc2hvdyB5b3UgaG93IHRvIGxlYXJuIFJlYWN0IHdpdGggcHJvZ3Jlc3NpdmUgYm9pbGVycGxhdGVzLlxcblxcbkFSYyAoQXRvbWljIFJlYWN0KSwgdGhlIHByb2dyZXNzaXZlIGJvaWxlcnBsYXRlOiBodHRwczovL2dpdGh1Yi5jb20vZGllZ29oYXovYXJjXFxuXFxucmVhY3QtY3JlYXRlLWFwcDogaHR0cHM6Ly9naXRodWIuY29tL2ZhY2Vib29raW5jdWJhdG9yL2NyZWF0ZS1yZWFjdC1hcHBcXG5cXG5yZWFjdC1ib2lsZXJwbGF0ZTogaHR0cHM6Ly9naXRodWIuY29tL214c3Rici9yZWFjdC1ib2lsZXJwbGF0ZVxcblxcbnJlYWN0LXJlZHV4LXVuaXZlcnNhbC1ob3QtZXhhbXBsZTogaHR0cHM6Ly9naXRodWIuY29tL2VyaWtyYXMvcmVhY3QtcmVkdXgtdW5pdmVyc2FsLWhvdC1leGFtcGxlXCIsXG4gICAgICAgIFwidGh1bWJuYWlsc1wiOiB7XG4gICAgICAgICAgXCJkZWZhdWx0XCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9WY0hicXBkWjltTS9kZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiAxMjAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiA5MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJtZWRpdW1cIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL1ZjSGJxcGRaOW1NL21xZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogMzIwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogMTgwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImhpZ2hcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL1ZjSGJxcGRaOW1NL2hxZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogNDgwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogMzYwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInN0YW5kYXJkXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9WY0hicXBkWjltTS9zZGRlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDY0MCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDQ4MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJtYXhyZXNcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL1ZjSGJxcGRaOW1NL21heHJlc2RlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDEyODAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiA3MjBcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIFwiY2hhbm5lbFRpdGxlXCI6IFwiSnVzdHluIENsYXJrXCIsXG4gICAgICAgIFwicGxheWxpc3RJZFwiOiBcIlBMUWFKRHdMWHlCdFhyMUZlMkZSeklkVDNSRmVHNTJRVkZcIixcbiAgICAgICAgXCJwb3NpdGlvblwiOiAxNixcbiAgICAgICAgXCJyZXNvdXJjZUlkXCI6IHtcbiAgICAgICAgICBcImtpbmRcIjogXCJ5b3V0dWJlI3ZpZGVvXCIsXG4gICAgICAgICAgXCJ2aWRlb0lkXCI6IFwiVmNIYnFwZFo5bU1cIlxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgXCJjb250ZW50RGV0YWlsc1wiOiB7XG4gICAgICAgIFwidmlkZW9JZFwiOiBcIlZjSGJxcGRaOW1NXCIsXG4gICAgICAgIFwidmlkZW9QdWJsaXNoZWRBdFwiOiBcIjIwMTYtMTEtMTdUMjE6MzQ6NDUuMDAwWlwiXG4gICAgICB9XG4gICAgfSxcbiAgICB7XG5cblxuICAgICAgXCJraW5kXCI6IFwieW91dHViZSNwbGF5bGlzdEl0ZW1cIixcbiAgICAgIFwiZXRhZ1wiOiBcIlxcXCJjYnozbElRMk4yNUFmd05yLUJkeFVWeEpfUVkvSmdhWllIQmdlbWJsMjBFVURTS3dub2hvb3RNXFxcIlwiLFxuICAgICAgXCJpZFwiOiBcIlVFeFJZVXBFZDB4WWVVSjBXSEl4Um1VeVJsSjZTV1JVTTFKR1pVYzFNbEZXUmk0eU1VUXlRVFF6TWpSRE56TXlRVE15XCIsXG4gICAgICBcInNuaXBwZXRcIjoge1xuICAgICAgICBcInB1Ymxpc2hlZEF0XCI6IFwiMjAxNi0xMi0wN1QwNDoyNjoyMC4wMDBaXCIsXG4gICAgICAgIFwiY2hhbm5lbElkXCI6IFwiVUNWTTRDMWZCOVFjd3k3ZE5qYlhlVVZ3XCIsXG4gICAgICAgIFwidGl0bGVcIjogXCJDcmVhdGUgYW5kIGRlcGxveSBhIFJFU1RmdWwgQVBJIGluIDEwIG1pbnV0ZXNcIixcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkNyZWF0ZSBhIFJFU1QgQVBJIHdpdGggTm9kZUpTLCBNb25nb0RCIGFuZCBFeHByZXNzLlxcbkdpdEh1YiByZXBvOiBodHRwczovL2dpdGh1Yi5jb20vZGllZ29oYXovZ2VuZXJhdG9yLXJlc3RcXG5cXG5JbiB0aGlzIHR1dG9yaWFsIEkgc2hvdyB5b3UgaG93IHRvIGNyZWF0ZSBhIFJFU1QgQVBJIHdpdGggTm9kZUpTLCBNb25nb0RCIChNb25nb29zZSksIEV4cHJlc3MsIEVTNiwgaW50ZWdyYXRpb24gYW5kIHVuaXQgdGVzdHMsIGRvY3VtZW50YXRpb24gKGFwaWRvYyksIGVycm9yIGhhbmRsaW5nLCBKU09OIHJlc3BvbnNlcyBhbmQgbXVjaCBtb3JlIHVzaW5nIFllb21hbiBhbmQgZGVwbG95IGl0IHRvIEhlcm9rdS5cXG5cXG4tLS0tLS0tLS0tLS0tLSBMSU5LUyAtLS0tLS0tLS0tLS0tXFxuXFxuTm9kZUpTOiBodHRwczovL25vZGVqcy5vcmdcXG5Nb25nb0RCOiBodHRwczovL21vbmdvZGIuY29tXFxuUG9zdG1hbjogaHR0cHM6Ly93d3cuZ2V0cG9zdG1hbi5jb21cXG5cXG4tLS0tLS0tLS0tLS0gUkVMQVRFRCAtLS0tLS0tLS0tXFxuXFxuV2hhdCBpcyBOb2RlLmpzIEV4YWN0bHk/XFxuVXNpbmcgTm9kZS5qcyBmb3IgRXZlcnl0aGluZ1xcblJFU1QgQVBJIGNvbmNlcHRzIGFuZCBleGFtcGxlc1xcbkludHJvIHRvIFJFU1RcXG5Ob2RlLmpzIFR1dG9yaWFsczogRnJvbSBaZXJvIHRvIEhlcm8gd2l0aCBOb2RlanNcXG5SRVNUK0pTT04gQVBJIERlc2lnbiAtIEJlc3QgUHJhY3RpY2VzIGZvciBEZXZlbG9wZXJzXFxuVXNpbmcgUkVTVCBBUElzIGluIGEgd2ViIGFwcGxpY2F0aW9uXFxuUkVTVC1GdWwgQVBJIERlc2lnblxcbkNyZWF0ZSBhIFdlYnNpdGUgb3IgQmxvZ1xcbk5vZGUuanMgVHV0b3JpYWxzIGZvciBCZWdpbm5lcnNcXG5Ob2RlSlMgTW9uZ29EQiBUdXRvcmlhbFxcbk5vZGUuanMgRnVuZGFtZW50YWxzXFxuQnVpbGQgYSBSRVNUZnVsIEFQSSBpbiA1IE1pbnV0ZXMgd2l0aCBOb2RlSlNcXG5CdWlsZCBhIFR3aXRjaC50diBDaGF0IEJvdCBpbiAxMCBNaW51dGVzIHdpdGggTm9kZS5qc1xcbk5vZGUuanMgTG9naW4gU3lzdGVtIFdpdGggUGFzc3BvcnRcXG5CdWlsZGluZyBhIE1pY3Jvc2VydmljZSB1c2luZyBOb2RlLmpzICYgRG9ja2VyXFxuVGhlIEFCQ3Mgb2YgQVBJcyB3aXRoIE5vZGUuanNcXG5FdmVyeXRoaW5nIFlvdSBFdmVyIFdhbnRlZCBUbyBLbm93IEFib3V0IEF1dGhlbnRpY2F0aW9uIGluIE5vZGUuanNcXG5Dw7NtbyBpbXBsZW1lbnRhciB1biBBUEkgUkVTVCBkZXNkZSBjZXJvIGNvbiBOb2RlLmpzIHkgTW9uZ29EQlxcbk92ZXJ2aWV3IG9mIE5vZGUuanMgTWljcm9zZXJ2aWNlcyBBcmNoaXRlY3R1cmVzXFxuTm9kZS5qcyBFeHBsYWluZWRcXG5KYXZhU2NyaXB0IHdpdGggUmVhY3RKUyBhbmQgTm9kZWpzXFxuTm9kZUpTIC8gRXhwcmVzcyAvIE1vbmdvREIgLSBCdWlsZCBhIFNob3BwaW5nIENhcnRcXG5EZXBsb3lpbmcgTm9kZS5qcyBBcHAgdG8gSGVyb2t1XFxuVGVzdCBkcml2ZW4gRGV2ZWxvcG1lbnQgb2YgV2ViIEFwcHMgaW4gTm9kZS5Kc1xcbkhvdyB0byBzZW5kIHNlcnZlciBlbWFpbCB3aXRoIE5vZGUuanNcXG5EZXBsb3lpbmcgbm9kZS5qcyBhcHBsaWNhdGlvbnNcXG5SRVNUZnVsIEFQSSBGcm9tIFNjcmF0Y2ggVXNpbmcgTm9kZSwgRXhwcmVzcyBhbmQgTW9uZ29EQlxcbkludHJvIHRvIFJFU1QgKGFrYS4gV2hhdCBJcyBSRVNUIEFueXdheT8pXCIsXG4gICAgICAgIFwidGh1bWJuYWlsc1wiOiB7XG4gICAgICAgICAgXCJkZWZhdWx0XCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS82eC1panlHLWFjay9kZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiAxMjAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiA5MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJtZWRpdW1cIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpLzZ4LWlqeUctYWNrL21xZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogMzIwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogMTgwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImhpZ2hcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpLzZ4LWlqeUctYWNrL2hxZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogNDgwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogMzYwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInN0YW5kYXJkXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS82eC1panlHLWFjay9zZGRlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDY0MCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDQ4MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJtYXhyZXNcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpLzZ4LWlqeUctYWNrL21heHJlc2RlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDEyODAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiA3MjBcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIFwiY2hhbm5lbFRpdGxlXCI6IFwiSnVzdHluIENsYXJrXCIsXG4gICAgICAgIFwicGxheWxpc3RJZFwiOiBcIlBMUWFKRHdMWHlCdFhyMUZlMkZSeklkVDNSRmVHNTJRVkZcIixcbiAgICAgICAgXCJwb3NpdGlvblwiOiAxNyxcbiAgICAgICAgXCJyZXNvdXJjZUlkXCI6IHtcbiAgICAgICAgICBcImtpbmRcIjogXCJ5b3V0dWJlI3ZpZGVvXCIsXG4gICAgICAgICAgXCJ2aWRlb0lkXCI6IFwiNngtaWp5Ry1hY2tcIlxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgXCJjb250ZW50RGV0YWlsc1wiOiB7XG4gICAgICAgIFwidmlkZW9JZFwiOiBcIjZ4LWlqeUctYWNrXCIsXG4gICAgICAgIFwidmlkZW9QdWJsaXNoZWRBdFwiOiBcIjIwMTYtMDktMTRUMDI6Mzg6NTQuMDAwWlwiXG4gICAgICB9XG4gICAgfSxcbiAgICB7XG5cblxuICAgICAgXCJraW5kXCI6IFwieW91dHViZSNwbGF5bGlzdEl0ZW1cIixcbiAgICAgIFwiZXRhZ1wiOiBcIlxcXCJjYnozbElRMk4yNUFmd05yLUJkeFVWeEpfUVkvY1JVcEIyOWYxR3FqVWxUTUpOcDRXaXdoNlVJXFxcIlwiLFxuICAgICAgXCJpZFwiOiBcIlVFeFJZVXBFZDB4WWVVSjBXSEl4Um1VeVJsSjZTV1JVTTFKR1pVYzFNbEZXUmk0NVJUZ3hORFJCTXpVd1JqUTBNRGhDXCIsXG4gICAgICBcInNuaXBwZXRcIjoge1xuICAgICAgICBcInB1Ymxpc2hlZEF0XCI6IFwiMjAxNy0wMS0xOFQxNzoyODowMC4wMDBaXCIsXG4gICAgICAgIFwiY2hhbm5lbElkXCI6IFwiVUNWTTRDMWZCOVFjd3k3ZE5qYlhlVVZ3XCIsXG4gICAgICAgIFwidGl0bGVcIjogXCJUb2RkIE1vdHRvIC0gRGVteXN0aWZ5aW5nIEphdmFTY3JpcHQ6IHlvdSBkb24ndCBuZWVkIGpRdWVyeSAoRk9XRCAyMDE0KVwiLFxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiaHR0cHM6Ly9zcGVha2VyZGVjay5jb20vdG9kZG1vdHRvL2RlbXlzdGlmeWluZy1qYXZhc2NyaXB0LXlvdS1kb250LW5lZWQtanF1ZXJ5XCIsXG4gICAgICAgIFwidGh1bWJuYWlsc1wiOiB7XG4gICAgICAgICAgXCJkZWZhdWx0XCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9rZXlDZzI1M1Mtby9kZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiAxMjAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiA5MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJtZWRpdW1cIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL2tleUNnMjUzUy1vL21xZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogMzIwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogMTgwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImhpZ2hcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL2tleUNnMjUzUy1vL2hxZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogNDgwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogMzYwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInN0YW5kYXJkXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9rZXlDZzI1M1Mtby9zZGRlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDY0MCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDQ4MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJtYXhyZXNcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL2tleUNnMjUzUy1vL21heHJlc2RlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDEyODAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiA3MjBcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIFwiY2hhbm5lbFRpdGxlXCI6IFwiSnVzdHluIENsYXJrXCIsXG4gICAgICAgIFwicGxheWxpc3RJZFwiOiBcIlBMUWFKRHdMWHlCdFhyMUZlMkZSeklkVDNSRmVHNTJRVkZcIixcbiAgICAgICAgXCJwb3NpdGlvblwiOiAxOCxcbiAgICAgICAgXCJyZXNvdXJjZUlkXCI6IHtcbiAgICAgICAgICBcImtpbmRcIjogXCJ5b3V0dWJlI3ZpZGVvXCIsXG4gICAgICAgICAgXCJ2aWRlb0lkXCI6IFwia2V5Q2cyNTNTLW9cIlxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgXCJjb250ZW50RGV0YWlsc1wiOiB7XG4gICAgICAgIFwidmlkZW9JZFwiOiBcImtleUNnMjUzUy1vXCIsXG4gICAgICAgIFwidmlkZW9QdWJsaXNoZWRBdFwiOiBcIjIwMTQtMDYtMDNUMDk6NTU6NDAuMDAwWlwiXG4gICAgICB9XG4gICAgfSxcbiAgICB7XG5cblxuICAgICAgXCJraW5kXCI6IFwieW91dHViZSNwbGF5bGlzdEl0ZW1cIixcbiAgICAgIFwiZXRhZ1wiOiBcIlxcXCJjYnozbElRMk4yNUFmd05yLUJkeFVWeEpfUVkvcjFPMFJDYjI3TzNaSy1ra0QyY1VZYkhobEIwXFxcIlwiLFxuICAgICAgXCJpZFwiOiBcIlVFeFJZVXBFZDB4WWVVSjBXSEl4Um1VeVJsSjZTV1JVTTFKR1pVYzFNbEZXUmk1RU5EVTRRME00UkRFeE56TTFNamN5XCIsXG4gICAgICBcInNuaXBwZXRcIjoge1xuICAgICAgICBcInB1Ymxpc2hlZEF0XCI6IFwiMjAxNy0wMy0wM1QxNjowMzoxNC4wMDBaXCIsXG4gICAgICAgIFwiY2hhbm5lbElkXCI6IFwiVUNWTTRDMWZCOVFjd3k3ZE5qYlhlVVZ3XCIsXG4gICAgICAgIFwidGl0bGVcIjogXCJKYWNrIExlbm94OiBCdWlsZGluZyBUaGVtZXMgd2l0aCB0aGUgV1AgUkVTVCBBUElcIixcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIldpdGggdGhlIFJFU1QgQVBJIHNob3J0bHkgZHVlIHRvIGJlIG1lcmdlZCBpbnRvIFdvcmRQcmVzcyBjb3JlLCBpdOKAmXMgYWJvdXQgdGltZSBkZXZlbG9wZXJzIHN0YXJ0ZWQgdGhpbmtpbmcgYWJvdXQgYnVpbGRpbmcgdGhlbWVzIHRoYXQgdXNlIGl0LiBUaGUgUkVTVCBBUEkgYWxsb3dzIGRldmVsb3BlcnMgdG8gY3JlYXRlIG11Y2ggbW9yZSBlbmdhZ2luZyB1c2VyIGV4cGVyaWVuY2VzLiBUaGlzIGlzIGEgdGFsayB0aGF0IGNvdmVycyB0aGUgY2hhbGxlbmdlcyBvbmUgZmFjZXMgd2hlbiB3b3JraW5nIHdpdGggdGhlIFJFU1QgQVBJLCBob3cgdG8gZXh0ZW5kIHRoZSBSRVNUIEFQSSBpdHNlbGYgZnJvbSB3aXRoaW4geW91ciB0aGVtZSwgYW5kIHN1Z2dlc3RlZCB3YXlzIHRoYXQgdGhlbWVzIGNhbiBiZSBidWlsdCB0byB1c2UgaXQuXFxuXFxuU2xpZGVzOiBodHRwczovL3NwZWFrZXJkZWNrLmNvbS9qYWNrbGVub3gvYnVpbGRpbmctdGhlbWVzLXdpdGgtdGhlLXdwLXJlc3QtYXBpXCIsXG4gICAgICAgIFwidGh1bWJuYWlsc1wiOiB7XG4gICAgICAgICAgXCJkZWZhdWx0XCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS8xc3lrVmpKUklnTS9kZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiAxMjAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiA5MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJtZWRpdW1cIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpLzFzeWtWakpSSWdNL21xZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogMzIwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogMTgwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImhpZ2hcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpLzFzeWtWakpSSWdNL2hxZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogNDgwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogMzYwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInN0YW5kYXJkXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS8xc3lrVmpKUklnTS9zZGRlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDY0MCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDQ4MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJtYXhyZXNcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpLzFzeWtWakpSSWdNL21heHJlc2RlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDEyODAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiA3MjBcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIFwiY2hhbm5lbFRpdGxlXCI6IFwiSnVzdHluIENsYXJrXCIsXG4gICAgICAgIFwicGxheWxpc3RJZFwiOiBcIlBMUWFKRHdMWHlCdFhyMUZlMkZSeklkVDNSRmVHNTJRVkZcIixcbiAgICAgICAgXCJwb3NpdGlvblwiOiAxOSxcbiAgICAgICAgXCJyZXNvdXJjZUlkXCI6IHtcbiAgICAgICAgICBcImtpbmRcIjogXCJ5b3V0dWJlI3ZpZGVvXCIsXG4gICAgICAgICAgXCJ2aWRlb0lkXCI6IFwiMXN5a1ZqSlJJZ01cIlxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgXCJjb250ZW50RGV0YWlsc1wiOiB7XG4gICAgICAgIFwidmlkZW9JZFwiOiBcIjFzeWtWakpSSWdNXCIsXG4gICAgICAgIFwidmlkZW9QdWJsaXNoZWRBdFwiOiBcIjIwMTYtMDYtMjhUMTc6NTM6MjUuMDAwWlwiXG4gICAgICB9XG4gICAgfSxcbiAgICB7XG5cblxuICAgICAgXCJraW5kXCI6IFwieW91dHViZSNwbGF5bGlzdEl0ZW1cIixcbiAgICAgIFwiZXRhZ1wiOiBcIlxcXCJjYnozbElRMk4yNUFmd05yLUJkeFVWeEpfUVkvSEg0VmNCbTBiaDYzaElNWkhycmM1SU5iQVpnXFxcIlwiLFxuICAgICAgXCJpZFwiOiBcIlVFeFJZVXBFZDB4WWVVSjBXSEl4Um1VeVJsSjZTV1JVTTFKR1pVYzFNbEZXUmk0eU1EaEJNa05CTmpSRE1qUXhRVGcxXCIsXG4gICAgICBcInNuaXBwZXRcIjoge1xuICAgICAgICBcInB1Ymxpc2hlZEF0XCI6IFwiMjAxNy0wMy0wNlQxNzo0MTowMC4wMDBaXCIsXG4gICAgICAgIFwiY2hhbm5lbElkXCI6IFwiVUNWTTRDMWZCOVFjd3k3ZE5qYlhlVVZ3XCIsXG4gICAgICAgIFwidGl0bGVcIjogXCJPYmplY3QgT3JpZW50ZWQgSmF2YVNjcmlwdFwiLFxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiR2V0IHRoZSBDaGVhdCBTaGVldCBIZXJlIDogaHR0cDovL2dvby5nbC9DUVZac1dcXG5CZXN0IE9iamVjdCBPcmllbnRlZCBKYXZhU2NyaXB0IEJvb2sgOiBodHRwOi8vYW16bi50by8xTDBNdnM4XFxuXFxuU3VwcG9ydCBtZSBvbiBQYXRyZW9uIDogaHR0cHM6Ly93d3cucGF0cmVvbi5jb20vZGVyZWtiYW5hc1xcblxcbjAxOjUwIEphdmFTY3JpcHQgT2JqZWN0c1xcbjAyOjM2IE9iamVjdHMgaW4gT2JqZWN0c1xcbjA0OjEyIENvbnN0cnVjdG9yIEZ1bmN0aW9uc1xcbjA1OjU4IGluc3RhbmNlb2ZcXG4wNjoyOCBQYXNzaW5nIE9iamVjdHMgdG8gRnVuY3Rpb25zXFxuMDg6MDkgUHJvdG90eXBlc1xcbjA5OjM0IEFkZGluZyBQcm9wZXJ0aWVzIHRvIE9iamVjdHNcXG4xMDo0NCBMaXN0IFByb3BlcnRpZXMgaW4gT2JqZWN0c1xcbjExOjM4IGhhc093blByb3BlcnR5XFxuMTI6NDIgQWRkIFByb3BlcnRpZXMgdG8gQnVpbHQgaW4gT2JqZWN0c1xcbjE0OjMxIFByaXZhdGUgUHJvcGVydGllc1xcbjE4OjAxIEdldHRlcnMgLyBTZXR0ZXJzXFxuMjE6MjAgZGVmaW5lR2V0dGVyIC8gZGVmaW5lU2V0dGVyXFxuMjQ6MzggZGVmaW5lUHJvcGVydHlcXG4yNzowNyBDb25zdHJ1Y3RvciBGdW5jdGlvbiBHZXR0ZXJzIC8gU2V0dGVyc1xcbjI5OjQwIEluaGVyaXRhbmNlXFxuMzc6MTMgSW50ZXJtZWRpYXRlIEZ1bmN0aW9uIEluaGVyaXRhbmNlXFxuMzk6MTQgQ2FsbCBQYXJlbnQgRnVuY3Rpb25zXFxuNDE6NTEgRUNNQVNjcmlwdCA2XFxuNDc6MzEgU2luZ2xldG9uIFBhdHRlcm5cXG40OTozMiBGYWN0b3J5IFBhdHRlcm5cXG41Mjo1MyBEZWNvcmF0b3IgUGF0dGVyblxcbjU0OjUyIE9ic2VydmVyIFBhdHRlcm5cIixcbiAgICAgICAgXCJ0aHVtYm5haWxzXCI6IHtcbiAgICAgICAgICBcImRlZmF1bHRcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL084d3duaGRrUEU0L2RlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDEyMCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDkwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcIm1lZGl1bVwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvTzh3d25oZGtQRTQvbXFkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiAzMjAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiAxODBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiaGlnaFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvTzh3d25oZGtQRTQvaHFkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiA0ODAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiAzNjBcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIFwiY2hhbm5lbFRpdGxlXCI6IFwiSnVzdHluIENsYXJrXCIsXG4gICAgICAgIFwicGxheWxpc3RJZFwiOiBcIlBMUWFKRHdMWHlCdFhyMUZlMkZSeklkVDNSRmVHNTJRVkZcIixcbiAgICAgICAgXCJwb3NpdGlvblwiOiAyMCxcbiAgICAgICAgXCJyZXNvdXJjZUlkXCI6IHtcbiAgICAgICAgICBcImtpbmRcIjogXCJ5b3V0dWJlI3ZpZGVvXCIsXG4gICAgICAgICAgXCJ2aWRlb0lkXCI6IFwiTzh3d25oZGtQRTRcIlxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgXCJjb250ZW50RGV0YWlsc1wiOiB7XG4gICAgICAgIFwidmlkZW9JZFwiOiBcIk84d3duaGRrUEU0XCIsXG4gICAgICAgIFwidmlkZW9QdWJsaXNoZWRBdFwiOiBcIjIwMTUtMDktMjhUMjE6NTI6NDYuMDAwWlwiXG4gICAgICB9XG4gICAgfSxcbiAgICB7XG5cblxuICAgICAgXCJraW5kXCI6IFwieW91dHViZSNwbGF5bGlzdEl0ZW1cIixcbiAgICAgIFwiZXRhZ1wiOiBcIlxcXCJjYnozbElRMk4yNUFmd05yLUJkeFVWeEpfUVkvb3FLQjlIUnhRRDFLRjhqSVUtSHIxUDZoN0JVXFxcIlwiLFxuICAgICAgXCJpZFwiOiBcIlVFeFJZVXBFZDB4WWVVSjBXSEl4Um1VeVJsSjZTV1JVTTFKR1pVYzFNbEZXUmk1R00wUTNNME16TXpZNU5USkZOVGRFXCIsXG4gICAgICBcInNuaXBwZXRcIjoge1xuICAgICAgICBcInB1Ymxpc2hlZEF0XCI6IFwiMjAxNy0wMy0xMFQwMjozNzozOS4wMDBaXCIsXG4gICAgICAgIFwiY2hhbm5lbElkXCI6IFwiVUNWTTRDMWZCOVFjd3k3ZE5qYlhlVVZ3XCIsXG4gICAgICAgIFwidGl0bGVcIjogXCJXb3JkUHJlc3MgUkVTVCBBUEkgVHV0b3JpYWwgKFJlYWwgRXhhbXBsZXMpXCIsXG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJMZXQncyBsZWFybiBhYm91dCB0aGUgbmV3IFdvcmRQcmVzcyBSRVNUIEFQSS5cXG5cXG5MaW5rIHRvIG15IHdlYnNpdGU6IGh0dHA6Ly9sZWFybndlYmNvZGUuY29tL1xcblxcbk15IEhUTUwgJiBDU1MgQ291cnNlOiBodHRwczovL3d3dy51ZGVteS5jb20vd2ViLWRlc2lnbi1mb3ItYmVnaW5uZXJzLXJlYWwtd29ybGQtY29kaW5nLWluLWh0bWwtY3NzLz9jb3Vwb25Db2RlPVlPVVRVQkUtSEFMRi1PRkZcXG5cXG5NeSBcXFwiR2V0IGEgRGV2ZWxvcGVyIEpvYlxcXCIgY291cnNlOiBodHRwczovL3d3dy51ZGVteS5jb20vZ2l0LWEtd2ViLWRldmVsb3Blci1qb2ItbWFzdGVyaW5nLXRoZS1tb2Rlcm4td29ya2Zsb3cvP2NvdXBvbkNvZGU9WU9VVFVCRS1IQUxGLU9GRlxcblxcblN0YXJ0ZXIgQUpBWCBDb2RlOiBodHRwOi8vY29kZXBlbi5pby9hbm9uL3Blbi9PYkJRcXY/ZWRpdG9ycz0wMDEwXFxuXFxuU3RhcnRlciBGb3JtIEhUTUwgJiBDU1M6IGh0dHA6Ly9jb2RlcGVuLmlvL2Fub24vcGVuL2pWUVBMej9lZGl0b3JzPTExMDBcXG5cXG5MaW5rIHRvIGRvd25sb2FkIHppcCBvZiBmaW5pc2hlZCB0aGVtZSBmaWxlczogaHR0cDovL2xlYXJud2ViY29kZS5jb20vd29yZHByZXNzLXJlc3QtYXBpLXR1dG9yaWFsLXJlYWwtZXhhbXBsZXMvXFxuXFxuQWRkIG1lIG9uIFR3aXR0ZXIgZm9yIHdlYkRldiByZXNvdXJjZXMgYW5kIGNhdCBwaWNzOiBodHRwczovL3R3aXR0ZXIuY29tL2xlYXJud2ViY29kZVwiLFxuICAgICAgICBcInRodW1ibmFpbHNcIjoge1xuICAgICAgICAgIFwiZGVmYXVsdFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvckdPYld0anhHQmMvZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogMTIwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogOTBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwibWVkaXVtXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9yR09iV3RqeEdCYy9tcWRlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDMyMCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDE4MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJoaWdoXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9yR09iV3RqeEdCYy9ocWRlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDQ4MCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDM2MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJzdGFuZGFyZFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvckdPYld0anhHQmMvc2RkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiA2NDAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiA0ODBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwibWF4cmVzXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9yR09iV3RqeEdCYy9tYXhyZXNkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiAxMjgwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogNzIwXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcImNoYW5uZWxUaXRsZVwiOiBcIkp1c3R5biBDbGFya1wiLFxuICAgICAgICBcInBsYXlsaXN0SWRcIjogXCJQTFFhSkR3TFh5QnRYcjFGZTJGUnpJZFQzUkZlRzUyUVZGXCIsXG4gICAgICAgIFwicG9zaXRpb25cIjogMjEsXG4gICAgICAgIFwicmVzb3VyY2VJZFwiOiB7XG4gICAgICAgICAgXCJraW5kXCI6IFwieW91dHViZSN2aWRlb1wiLFxuICAgICAgICAgIFwidmlkZW9JZFwiOiBcInJHT2JXdGp4R0JjXCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwiY29udGVudERldGFpbHNcIjoge1xuICAgICAgICBcInZpZGVvSWRcIjogXCJyR09iV3RqeEdCY1wiLFxuICAgICAgICBcInZpZGVvUHVibGlzaGVkQXRcIjogXCIyMDE2LTEyLTE2VDA0OjU3OjEzLjAwMFpcIlxuICAgICAgfVxuICAgIH0sXG4gICAge1xuXG5cbiAgICAgIFwia2luZFwiOiBcInlvdXR1YmUjcGxheWxpc3RJdGVtXCIsXG4gICAgICBcImV0YWdcIjogXCJcXFwiY2J6M2xJUTJOMjVBZndOci1CZHhVVnhKX1FZL2tqMXZRczhTRXpQWTI2aG9YZjNsREpxRmdnY1xcXCJcIixcbiAgICAgIFwiaWRcIjogXCJVRXhSWVVwRWQweFllVUowV0hJeFJtVXlSbEo2U1dSVU0xSkdaVWMxTWxGV1JpNHpSak0wTWtWQ1JUZzBNa1l5UVRNMFwiLFxuICAgICAgXCJzbmlwcGV0XCI6IHtcbiAgICAgICAgXCJwdWJsaXNoZWRBdFwiOiBcIjIwMTctMDQtMDFUMDc6MDg6MDIuMDAwWlwiLFxuICAgICAgICBcImNoYW5uZWxJZFwiOiBcIlVDVk00QzFmQjlRY3d5N2ROamJYZVVWd1wiLFxuICAgICAgICBcInRpdGxlXCI6IFwiQ2FydG9vbnMgRm9yIENoaWxkcmVuIHwgU3VubnkgQnVubmllcyBFTFVTSVZFIENBS0UgfCBORVcgU0VBU09OIHwgRnVubnkgQ2FydG9vbnMgRm9yIENoaWxkcmVuIHxcIixcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIuKWuiBTdWJzY3JpYmUgdG8gU3VubnkgQnVubmllcyBmb3IgbmV3IHZpZGVvczogIGh0dHA6Ly9iaXQubHkvMVVkTUdVeVxcblxcbuKWuiBXYXRjaCBtb3JlIEZ1bm55IENhcnRvb25zIGZvciBDaGlsZHJlbiAtXFxuaHR0cHM6Ly93d3cueW91dHViZS5jb20vd2F0Y2g/dj1ncDVNQXk2LU5ZQSZsaXN0PVBMb1FseDdmNk54LVB5c29rZGNPUnlIMV9WR0FERmx0dHkmaW5kZXg9MlxcblxcbuKWuiBXYXRjaCBtb3JlIENhcnRvb25zIGZvciBDaGlsZHJlbiAtXFxuaHR0cHM6Ly93d3cueW91dHViZS5jb20vd2F0Y2g/dj00NmNfU2ROWmxXayZsaXN0PVBMb1FseDdmNk54LVB5c29rZGNPUnlIMV9WR0FERmx0dHkmaW5kZXg9M1xcblxcbuKWuiBXYXRjaCBtb3JlIFN1bm55IEJ1bm5pZXMgLVxcbmh0dHBzOi8vd3d3LnlvdXR1YmUuY29tL3dhdGNoP3Y9OGpZX05xeWdLTFUmbGlzdD1QTG9RbHg3ZjZOeC1QeXNva2RjT1J5SDFfVkdBREZsdHR5JmluZGV4PTRcXG5cXG5LaWRzIGFyZSBjYXBhYmxlIG9mIGNvbWluZyB1cCB3aXRoIHRoZSBtb3N0IHVucmVhbCBhbmQgZmFudGFzdGljIGNyZWF0dXJlcyBpbiB0aGVpciBtaW5kcy4gU2hhZG93cyBhcmUgc2VlbiBhcyBibGVhayBhbmQgZ2xvb215LCB3aGlsZSBzdW5iZWFtcyBhcmUgYXNzb2NpYXRlZCB3aXRoIGxpZ2h0IGFuZCBoYXBwaW5lc3MsIGFuZCBjYW4gY3JlYXRlIGZ1bm55IGltYWdlcy4gV2hhdCBpZiB0aGVzZSBmYW50YXNpZXMgY2FtZSBhbGl2ZT8gV2hhdCBpZiB0aGV5IGNvdWxkIGp1bXAgb3V0IG9mIHRoZSBzdW5saWdodD9cXG5cXG5UaGUgU3VubnkgQnVubmllcyBhcmUgZml2ZSBiZWFtaW5nIGJhbGxzIG9mIGxpZ2h0IHRoYXQgY2FuIGFwcGVhciBhbnl3aGVyZSB0aGVyZSBpcyBhIGxpZ2h0IHNvdXJjZS4gV2hldGhlciBpdCBpcyBzdW5saWdodCBvciBtb29ubGlnaHQsIHRoZXkgYnJpbmcgZnVuIGFuZCBoYXBwaW5lc3MgZXZlcnl3aGVyZSB0aGV5IGdvLiBIb3dldmVyLCBlYWNoIHRpbWUgdGhleSBhcHBlYXIgdGhlaXIgYWN0aW9ucyB0dXJuIGludG8gYSBtaXNjaGlldm91cyBnYW1lLiBTb21ldGltZXMgdG9vIG1pc2NoaWV2b3VzLlxcblxcbkluIGVhY2ggZXBpc29kZSwgU3VubnkgQnVubmllcyBhcHBlYXIgYXQgYSBkaWZmZXJlbnQgbG9jYXRpb246IGEgY2lyY3VzLCBhIHN0YWRpdW0sIGEgY2Fycm91c2VsLCBhIHBhcmssIGEgc3RhZ2XigKYgVGhleSBpbW1lZGlhdGVseSBzdGFydCB0byBpbnZlc3RpZ2F0ZSB0aGVpciBzdXJyb3VuZGluZ3MgYW5kIHRoYXTigJlzIHdoZW4gdGhlIGZ1biBhbmQgbWlzY2hpZWYgYmVnaW4hIEF0IHRoZSB2ZXJ5IGVuZCBvZiBldmVyeSBlcGlzb2RlLCB0aGUgbGF1Z2h0ZXIgY29udGludWVzIHdpdGggYSBjb2xsZWN0aW9uIG9mIGJsb29wZXJzLlwiLFxuICAgICAgICBcInRodW1ibmFpbHNcIjoge1xuICAgICAgICAgIFwiZGVmYXVsdFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvUVg3aWFHY0F5VDQvZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogMTIwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogOTBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwibWVkaXVtXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9RWDdpYUdjQXlUNC9tcWRlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDMyMCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDE4MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJoaWdoXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9RWDdpYUdjQXlUNC9ocWRlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDQ4MCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDM2MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJzdGFuZGFyZFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvUVg3aWFHY0F5VDQvc2RkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiA2NDAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiA0ODBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwibWF4cmVzXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9RWDdpYUdjQXlUNC9tYXhyZXNkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiAxMjgwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogNzIwXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcImNoYW5uZWxUaXRsZVwiOiBcIkp1c3R5biBDbGFya1wiLFxuICAgICAgICBcInBsYXlsaXN0SWRcIjogXCJQTFFhSkR3TFh5QnRYcjFGZTJGUnpJZFQzUkZlRzUyUVZGXCIsXG4gICAgICAgIFwicG9zaXRpb25cIjogMjIsXG4gICAgICAgIFwicmVzb3VyY2VJZFwiOiB7XG4gICAgICAgICAgXCJraW5kXCI6IFwieW91dHViZSN2aWRlb1wiLFxuICAgICAgICAgIFwidmlkZW9JZFwiOiBcIlFYN2lhR2NBeVQ0XCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwiY29udGVudERldGFpbHNcIjoge1xuICAgICAgICBcInZpZGVvSWRcIjogXCJRWDdpYUdjQXlUNFwiLFxuICAgICAgICBcInZpZGVvUHVibGlzaGVkQXRcIjogXCIyMDE3LTAyLTEwVDExOjQ3OjU0LjAwMFpcIlxuICAgICAgfVxuICAgIH0sXG4gICAge1xuXG5cbiAgICAgIFwia2luZFwiOiBcInlvdXR1YmUjcGxheWxpc3RJdGVtXCIsXG4gICAgICBcImV0YWdcIjogXCJcXFwiY2J6M2xJUTJOMjVBZndOci1CZHhVVnhKX1FZLzNyY3BaQmRZeDJNUkh5YXExaDl6ZkRacjlRRVxcXCJcIixcbiAgICAgIFwiaWRcIjogXCJVRXhSWVVwRWQweFllVUowV0hJeFJtVXlSbEo2U1dSVU0xSkdaVWMxTWxGV1JpNDVOelV3UWtJMU0wVXhOVGhCTWtVMFwiLFxuICAgICAgXCJzbmlwcGV0XCI6IHtcbiAgICAgICAgXCJwdWJsaXNoZWRBdFwiOiBcIjIwMTctMDQtMTZUMTc6Mjg6MTcuMDAwWlwiLFxuICAgICAgICBcImNoYW5uZWxJZFwiOiBcIlVDVk00QzFmQjlRY3d5N2ROamJYZVVWd1wiLFxuICAgICAgICBcInRpdGxlXCI6IFwiSmF2YVNjcmlwdCBhbmQgdGhlIERPTSAoUGFydCAxIG9mIDIpXCIsXG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJUb2RheSBAYWRhbXJlY3Zsb2hlIHdhbGtzIHVzIHRocm91Z2ggc29tZSBmdW5jdGlvbmFsIEpTIHByb2dyYW1taW5nIHRlY2huaXF1ZXMgaW4gUGFydCAxIG9mIGEgMiBwYXJ0IEphdmFzY3JpcHQgc2VyaWVzIVxcblxcblByb2plY3QgQ29kZSAtIGh0dHA6Ly9jb2RlcGVuLmlvL2FyZWN2bG9oZS9wZW4vcmVwWGRlXFxuXFxuLSAtIC1cXG5cXG5UaGlzIHZpZGVvIHdhcyBzcG9uc29yZWQgYnkgdGhlIERldlRpcHMgUGF0cm9uIENvbW11bml0eSAtIGh0dHBzOi8vd3d3LnBhdHJlb24uY29tL0RldlRpcHNcXG5cXG5MaXN0ZW4gdG8gVHJhdmlzJyBQb2RjYXN0IC0gaHR0cDovL3d3dy50cmF2YW5kbG9zLmNvbS9cXG5cXG5HZXQgYXdlc29tZW5lc3MgZW1haWxlZCB0byB5b3UgZXZlcnkgdGh1cnNkYXkgLSBodHRwOi8vdHJhdmlzbmVpbHNvbi5jb20vbm90ZXMgXFxuXFxuWW91IHNob3VsZCBmb2xsb3cgRGV2VGlwcyBvbiBUd2l0dGVyIC0gaHR0cHM6Ly90d2l0dGVyLmNvbS9EZXZUaXBzU2hvd1wiLFxuICAgICAgICBcInRodW1ibmFpbHNcIjoge1xuICAgICAgICAgIFwiZGVmYXVsdFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvaE05aDF3TjRyZlUvZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogMTIwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogOTBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwibWVkaXVtXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9oTTloMXdONHJmVS9tcWRlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDMyMCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDE4MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJoaWdoXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9oTTloMXdONHJmVS9ocWRlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDQ4MCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDM2MFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJzdGFuZGFyZFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvaE05aDF3TjRyZlUvc2RkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiA2NDAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiA0ODBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwibWF4cmVzXCI6IHtcbiAgICAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9oTTloMXdONHJmVS9tYXhyZXNkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiAxMjgwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogNzIwXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcImNoYW5uZWxUaXRsZVwiOiBcIkp1c3R5biBDbGFya1wiLFxuICAgICAgICBcInBsYXlsaXN0SWRcIjogXCJQTFFhSkR3TFh5QnRYcjFGZTJGUnpJZFQzUkZlRzUyUVZGXCIsXG4gICAgICAgIFwicG9zaXRpb25cIjogMjMsXG4gICAgICAgIFwicmVzb3VyY2VJZFwiOiB7XG4gICAgICAgICAgXCJraW5kXCI6IFwieW91dHViZSN2aWRlb1wiLFxuICAgICAgICAgIFwidmlkZW9JZFwiOiBcImhNOWgxd040cmZVXCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwiY29udGVudERldGFpbHNcIjoge1xuICAgICAgICBcInZpZGVvSWRcIjogXCJoTTloMXdONHJmVVwiLFxuICAgICAgICBcInZpZGVvUHVibGlzaGVkQXRcIjogXCIyMDE2LTA1LTAyVDE1OjM0OjM3LjAwMFpcIlxuICAgICAgfVxuICAgIH0sXG4gICAge1xuXG5cbiAgICAgIFwia2luZFwiOiBcInlvdXR1YmUjcGxheWxpc3RJdGVtXCIsXG4gICAgICBcImV0YWdcIjogXCJcXFwiY2J6M2xJUTJOMjVBZndOci1CZHhVVnhKX1FZL1RnajNSQ0FJZmY2NzlteGh4VUxqdXJTMWtuMFxcXCJcIixcbiAgICAgIFwiaWRcIjogXCJVRXhSWVVwRWQweFllVUowV0hJeFJtVXlSbEo2U1dSVU0xSkdaVWMxTWxGV1JpNUROekUxUmpaRU1VWkNNakEwUkRCQlwiLFxuICAgICAgXCJzbmlwcGV0XCI6IHtcbiAgICAgICAgXCJwdWJsaXNoZWRBdFwiOiBcIjIwMTctMDUtMDVUMDU6MTg6MzguMDAwWlwiLFxuICAgICAgICBcImNoYW5uZWxJZFwiOiBcIlVDVk00QzFmQjlRY3d5N2ROamJYZVVWd1wiLFxuICAgICAgICBcInRpdGxlXCI6IFwiTGVhcm4gTnVtYmVycyB3aXRoIENvdW50aW5nIGFuZCBMZWFybiBDb2xvcnMgd2l0aCBXYXRlciBCYWxsb29ucyBmb3IgQ2hpbGRyZW4sIFRvZGRsZXJzIGFuZCBCYWJpZXNcIixcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkEgR3JlYXQgYW5kIEZ1biBXYXkgdG8gTGVhcm4gTnVtYmVycyBhbmQgVG8gTGVhcm4gdG8gQ291bnQgaXMgYnkgdXNpbmcgQ29sb3VycyBXYXRlciBCYWxsb29ucyEgV2UgTGluZWQgdGhlbSB1cCBpbiBkaWZmZXJlbnRzIENvbG9ycywgc28gQ2hpbGRyZW4sIFRvZGRsZXJzIGFuZCBCYWJpZXMgYWxzbyBjYW4gTGVhcm4gQ29sb3JzISBIYXZlIEZ1biB3YXRjaGluZyB0aGlzIEVkdWNhdGlvbmFsIHZpZGVvLCBoYXZlIGZ1biBMZWFybmluZyFcXG5cXG5XZWxjb21lIHRvIG91ciBjaGFubmVsLCBGdW5Ub3lzTWVkaWEuIFxcblxcbldlIENyZWF0ZSBFZHVjYXRpb25hbCBhbmQgVG95cyB2aWRlb3MgZm9yIEtpZHMgYnkgYSBLaWQhXFxuT3VyIEtpZCBKYXNvbiBwbGF5cyBpbiB0aGUgVmlkZW9zIGFuZCBoZSBsb3ZlcyB0byB0ZWFjaCBDb2xvcnMsIE51bWJlcnMsIExldHRlcnMgYW5kIG1vcmUhIFxcbldlIGFsc28gZG8gRnVuIFNrZXRjaGVzLlxcbk91ciBLaWRzIHZpZGVvcyBhcmUgZnVuIGFuZCBleGNpdGluZyB0byB3YXRjaC4gXFxuXFxuQmFkIEJhYnkgTWFnaWMgYW5kIExlYXJuIENvbG9ycyB3aXRoIEJhZCBHaG9zdHMgZm9yIEtpZHMgfCBCYWQgS2lkIExlYXJucyBDb2xvdXJzIFxcbmh0dHBzOi8vd3d3LnlvdXR1YmUuY29tL3dhdGNoP3Y9WjYwdm5EaGNnZ2dcXG5cXG5TdXBlciBIZXJvIFNhY2sgUmFjZSBGb3IgS2lkcyB3aXRoIFN1cGVybWFuIGFuZCBTcGlkZXJtYW4gfCBMZWFybiBOdW1iZXJzIGZvciBDaGlsZHJlbiBQbGF5IEFjdGl2aXR5IFxcbmh0dHBzOi8vd3d3LnlvdXR1YmUuY29tL3dhdGNoP3Y9Q19OWnNVSXduazBcXG5cXG5MZWFybiBGcnVpdHMgd2l0aCBTbW9vdGhpZXMgZm9yIENoaWxkcmVuIGFuZCBUb2RkbGVycyB8IExlYXJuIENvbG9ycyB3aXRoIEZydWl0cyBUYXN0ZSBDaGFsbGVuZ2UgXFxuaHR0cHM6Ly93d3cueW91dHViZS5jb20vd2F0Y2g/dj01LVN2djc1SUV5d1xcblxcbkxlYXJuIENvbG91cnMgYW5kIFBvcHBpbmcgV2F0ZXIgQmFsbG9vbnMgZm9yIENoaWxkcmVuIGFuZCBUb2RkbGVycyB8IEJhZCBLaWQgTGVhcm5zIENvbG9ycyBcXG5odHRwczovL3d3dy55b3V0dWJlLmNvbS93YXRjaD92PU5LVkk3X3ZKejA0XFxuXFxuTGVhcm4gQ29sb3JzIHdpdGggQmFkIEJhYnkgQ3J5aW5nIEd1bWJhbGwgQm90dGxlcyBmb3IgQmFiaWVzIHwgRmluZ2VyIEZhbWlseSBTb25nIE51cnNlcnkgUmh5bWVzIFxcbmh0dHBzOi8vd3d3LnlvdXR1YmUuY29tL3dhdGNoP3Y9enVJS0hWOGwzVzhcXG5cXG5CYWQgQmFieSBDcnlpbmcgTGVhcm4gQ29sb3JzIGZvciBUb2RkbGVycyBhbmQgQmFiaWVzIHwgRmluZ2VyIEZhbWlseSBTb25nIEJhYnkgTnVyc2VyeSBSaHltZXMgXFxuaHR0cHM6Ly93d3cueW91dHViZS5jb20vd2F0Y2g/dj1TT2VPNFJsd0Jkc1xcblxcbkxlYXJuIENvbG9ycyB3aXRoIFNraXBweSBCYWxscyBmb3IgQ2hpbGRyZW4sIFRvZGRsZXJzIGFuZCBCYWJpZXMgfCBGdW5ueSBGYWNlcyBTa2lwcHkgQmFsbHMgQ29sb3VycyBcXG5odHRwczovL3d3dy55b3V0dWJlLmNvbS93YXRjaD92PVN5aDRGcWpDaGVRXFxuXFxuTGVhcm4gQ29sb3JzIHdpdGggRm9vdCBOdXJzZXJ5IFNvbmdzIGZvciBDaGlsZHJlbiwgVG9kZGxlcnMgYW5kIEJhYmllcyB8IEtpZHMgRmluZ2VyIEZhbWlseSBTb25ncyBcXG5odHRwczovL3d3dy55b3V0dWJlLmNvbS93YXRjaD92PXJnY3o3RDJhcjFVXFxuXFxuTGVhcm4gTW9udGhzIG9mIHRoZSBZZWFyIGZvciBDaGlsZHJlbiBhbmQgVG9kZGxlcnMgYW5kIExlYXJuIENvbG9ycyBmb3IgS2lkcyBFZHVjYXRpb25hbCBWaWRlbyBcXG5odHRwczovL3d3dy55b3V0dWJlLmNvbS93YXRjaD92PVhINVh1aTBVSlVNXFxuXFxuTGVhcm4gTnVtYmVycyBhbmQgQ29sb3JzIHdpdGggQnVja2V0cyBmb3IgQ2hpbGRyZW4gYW5kIFRvZGRsZXJzIHwgVGhyb3cgQ29sb3VycyBXYXRlciBCYWxsb29ucyBHYW1lIFxcbmh0dHBzOi8vd3d3LnlvdXR1YmUuY29tL3dhdGNoP3Y9NXI2Xy1ndVZBTWdcXG5cXG5MZWFybiBOdW1iZXJzIGFuZCBDb2xvcnMgd2l0aCBDaG9jb2xhdGUgRWFzdGVyIEVnZ3MgZm9yIENoaWxkcmVuLCBUb2RkbGVycyBhbmQgQmFiaWVzIFxcbmh0dHBzOi8vd3d3LnlvdXR1YmUuY29tL3dhdGNoP3Y9TE5WUi10UXJNVDBcIixcbiAgICAgICAgXCJ0aHVtYm5haWxzXCI6IHtcbiAgICAgICAgICBcImRlZmF1bHRcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL1ZMSTlSdUJZbmQ0L2RlZmF1bHQuanBnXCIsXG4gICAgICAgICAgICBcIndpZHRoXCI6IDEyMCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDkwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcIm1lZGl1bVwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvVkxJOVJ1QlluZDQvbXFkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiAzMjAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiAxODBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiaGlnaFwiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvVkxJOVJ1QlluZDQvaHFkZWZhdWx0LmpwZ1wiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiA0ODAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiAzNjBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwic3RhbmRhcmRcIjoge1xuICAgICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2kueXRpbWcuY29tL3ZpL1ZMSTlSdUJZbmQ0L3NkZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogNjQwLFxuICAgICAgICAgICAgXCJoZWlnaHRcIjogNDgwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcIm1heHJlc1wiOiB7XG4gICAgICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vaS55dGltZy5jb20vdmkvVkxJOVJ1QlluZDQvbWF4cmVzZGVmYXVsdC5qcGdcIixcbiAgICAgICAgICAgIFwid2lkdGhcIjogMTI4MCxcbiAgICAgICAgICAgIFwiaGVpZ2h0XCI6IDcyMFxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJjaGFubmVsVGl0bGVcIjogXCJKdXN0eW4gQ2xhcmtcIixcbiAgICAgICAgXCJwbGF5bGlzdElkXCI6IFwiUExRYUpEd0xYeUJ0WHIxRmUyRlJ6SWRUM1JGZUc1MlFWRlwiLFxuICAgICAgICBcInBvc2l0aW9uXCI6IDI0LFxuICAgICAgICBcInJlc291cmNlSWRcIjoge1xuICAgICAgICAgIFwia2luZFwiOiBcInlvdXR1YmUjdmlkZW9cIixcbiAgICAgICAgICBcInZpZGVvSWRcIjogXCJWTEk5UnVCWW5kNFwiXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcImNvbnRlbnREZXRhaWxzXCI6IHtcbiAgICAgICAgXCJ2aWRlb0lkXCI6IFwiVkxJOVJ1QlluZDRcIixcbiAgICAgICAgXCJ2aWRlb1B1Ymxpc2hlZEF0XCI6IFwiMjAxNy0wNS0wNFQwMjowMDozNi4wMDBaXCJcbiAgICAgIH1cbiAgICB9XG4gIF1cbn1cbiJdfQ==
