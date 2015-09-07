/*:
	----------------------------------------------------
	event.js : 1.2.2 : 2014-12-12 : MIT License
	----------------------------------------------------
	https://github.com/mudcube/Event.js
	----------------------------------------------------
	1  : click, dblclick, dbltap, hover
	1+ : tap, longpress, drag, swipe
	2+ : pinch, rotate
	   : mousewheel, devicemotion, shake
	----------------------------------------------------
	eventjs.elementsFromEvent
	eventjs.elementsFromPoint
	----------------------------------------------------
	http://www.w3.org/TR/2011/WD-touch-events-20110505/
	----------------------------------------------------
*/

if (typeof eventjs === 'undefined') eventjs = {};

(function(root) {'use strict';

/// Add custom *EventListener commands to HTMLElements (set false to prevent funkiness)
root.modifyEventListener = false;

/// Add bulk *EventListener commands on NodeLists from querySelectorAll and others  (set false to prevent funkiness)
root.modifySelectors = false;

/// Event maintenance
root.add = function(target, type, listener, configure) {
	return eventManager(target, type, listener, configure, 'add');
};

root.remove = function(target, type, listener, configure) {
	return eventManager(target, type, listener, configure, 'remove');
};

root.removeEvents = function(events) {
	for (var key in events) {
		var remove = events[key].remove;
		remove && remove();
	}
};

root.stop = function(event) {
	if (event) {
		event.stopPropagation && event.stopPropagation();
		event.cancelBubble = true; /// <= IE8
		event.cancelBubbleCount = 0;
	}
};

root.prevent = function(event) {
	if (event) {
		if (event.preventDefault) {
			event.preventDefault();
		} else if (event.preventManipulation) {
			event.preventManipulation(); // MS
		} else {
			event.returnValue = false; // <= IE8
		}
	}
};

root.cancel = function(event) {
	root.stop(event);
	root.prevent(event);
};

root.blur = function() { // blur focused element
	if (root.isEditingText()) {
		var node = document.activeElement;
		node.blur && node.blur();
	}
};

root.isEditingText = function() { // detect whether user is in an editable field
	var node = document.activeElement;
	if (node) {
		var nodeName = node.nodeName;
		if (nodeName === 'INPUT' || nodeName === 'TEXTAREA' || node.contentEditable === 'true') {
			return true;
		}
	}
	return false;
};

/// Check whether event is natively supported - via @kangax
root.getEventSupport = function(target, type) {
	if (typeof target === 'string') {
		type = target;
		target = window;
	}
	///
	type = 'on' + type;
	///
	if (type in target) {
		return true;
	} else {
		if (!target.setAttribute) {
			target = document.createElement('div');
		}
		if (target.setAttribute && target.removeAttribute) {
			target.setAttribute(type, '');
			var isSupported = typeof target[type] === 'function';
			if (typeof target[type] !== 'undefined') {
				target[type] = null;
			}
			target.removeAttribute(type);
			return isSupported;
		}
	}
};

var clone = function(obj) {
	if (!obj || obj.nodeName || typeof obj !== 'object') {
		return obj;
	}
	var temp = new obj.constructor();
	for (var key in obj) {
		if (!obj[key] || obj.nodeName || typeof obj[key] !== 'object') {
			temp[key] = obj[key];
		} else { // clone sub-object
			temp[key] = clone(obj[key]);
		}
	}
	return temp;
};


/// Handle custom *EventListener commands
var eventManager = function(target, type, listener, configure, trigger, fromOverwrite) {
	configure = configure || {};
	
	/// Target is a configuration variable
	if (String(target) === '[object Object]') {
		return addFromConfigure(target, trigger);
	}

	if (!target || !type || !listener) {
		logError('target, type and listener are required', arguments);
		return;
	}

	/// Check for element to load on interval - before onload
	if (typeof target === 'string' && type === 'ready') {
		if (window.eventjs_stallOnReady) { // force stall for scripts to load
			type = 'load';
			target = window;
		} else {
			onReadyWait(target, configure, listener);
			return;
		}
	}

	/// Get DOM element from Query Selector
	if (typeof target === 'string') {
		target = document.querySelectorAll(target);
		if (target.length === 0) {
			logError('target does not exist', arguments);
			return;
		}
	}

	/// Multiple targets in array or DOMList
	if (target.length > 0 && target !== window) {
		if (target.length === 1) { // single target
			target = target[0];
		} else { // multiple targets
			var events = {};
			for (var n0 = 0, length0 = target.length; n0 < length0; n0++) {
				var event = eventManager(target[n0], type, listener, clone(configure), trigger);
				if (event) events[n0] = event;
			}
			return createBatchCommands(events);
		}
	}

	/// Multiple events in one string
	if (typeof type === 'string') {
		type = splitCommand(type);
		if (type.length === 1) {
			type = type.shift();
		}
	}

	/// Multiple events associated with a target
	if (typeof type !== 'string') { // multiple events
		return addMultipleCommands(target, type, listener, configure, trigger);
	} else if (type.indexOf('on') === 0) { // to support things like 'onclick' instead of 'click'
		type = type.substr(2);
	}

	/// Ensure data types
	if (typeof target !== 'object') {
		return logError('target must be an element', arguments);
	}
	if (typeof listener !== 'function') {
		return logError('listener must be a function', arguments);
	}

	/// Generate a unique wrapper identifier
	var useCapture = configure.useCapture || false;
	var uid = getID(target) + '.' + getID(listener) + '.' + (useCapture ? 1 : 0);

	/// Handle the event
	if (root.gestureHandler[type]) { // Custom events
		uid = type + uid;
		if (trigger === 'remove') { // Remove event
			if (wrappers[uid]) {
				wrappers[uid].remove();
				delete wrappers[uid];
			}
		} else if (trigger === 'add') { // Attach event
			if (wrappers[uid]) {
				if (wrappers[uid].attach) {
					wrappers[uid].attach();
				} else {
					wrappers[uid].add(); //-
				}
				return wrappers[uid];
			} else {
				/// Retains 'this' orientation
				if (configure.useCall && !root.modifyEventListener) {
					var listenerOnCall = listener;
					listener = function(event, self) {
						for (var key in self) event[key] = self[key];
						return listenerOnCall.call(target, event);
					};
				}

				/// Create listener proxy
				configure.uid = uid;
				configure.gesture = type;
				configure.target = target;
				configure.listener = listener;
				configure.fromOverwrite = fromOverwrite;

				/// Record wrapper
				return wrappers[uid] = root.proxy[type](configure);
			}
		}
	} else { // Fire native event
		var eventList = getEventList(type, configure.strict);
		var eventListLength = eventList.length;
		for (var n = 0; n < eventListLength; n++) {
			var type = eventList[n];
			var eventId = type + '.' + uid;
			if (trigger === 'remove') { // Remove event
				if (wrappers[eventId]) {
					target[remove](type, listener, useCapture);
					delete wrappers[eventId];
				}
			} else if (trigger === 'add') { // Attach event
				if (wrappers[eventId]) {
					continue;
				} else {
					target[add](type, listener, useCapture);

					/// Record wrapper
					wrappers[eventId] = {
						uid: eventId,
						type: type,
						target: target,
						listener: listener,
						add: function() {
							for (var n = 0; n < eventListLength; n++) {
								root.add(target, eventList[n], listener, configure);
							}
						},
						remove: function() {
							for (var n = 0; n < eventListLength; n++) {
								root.remove(target, eventList[n], listener, configure);
							}
						}
					};
				}
			}
		}
		return wrappers[eventId];
	}
};

var splitCommand = function(type, toString) {
	return type.toLowerCase().split(/[, ]/);
};

var addMultipleCommands = function(target, commands, listener, configure, trigger) {
	var event;
	var events = {};
	if (isFinite(commands.length)) { // multiple listeners in array
		for (var key = 0, length = commands.length; key < length; key++) {
			var command = commands[key];
			if (command) {
				event = eventManager(target, command, listener, clone(configure), trigger);
				if (event) events[command] = event;
			}
		}
	} else { // multiple listeners in object
		for (var key in commands) {
			var command = commands[key];
			if (command) {
				if (command.listener) { // command is configure
					event = eventManager(target, key, command.listener, clone(command), trigger);
				} else { // command is function
					event = eventManager(target, key, command, clone(configure), trigger);
				}
				if (event) events[key] = event;
			}
		}
	}
	return createBatchCommands(events);
};

var addFromConfigure = function(data, trigger) {
	var target = data.target;
	///
	if (data.type && data.listener) {
		var type = data.type;
		var listener = data.listener;
		return eventManager(target, type, listener, data, trigger);
	} else { // {target: target, click: function});
		var configure = {};
		for (var param in data) {
			var value = data[param];
			var typeOf = typeof value;
			if (typeOf === 'string' || typeOf === 'number' || typeOf === 'boolean') {
				configure[param] = value;
			}
		}
		///
		var res = {};
		for (var k1 in data) {
			var o = data[k1];
			if (typeof o === 'function') { // without configuration
				var listener = o;
				var conf = clone(configure);
			} else if (typeof o.listener === 'function') { // with configuration
				var listener = o.listener;
				var conf = clone(configure);
				for (var k2 in o) { // merge configure into base configuration
					conf[k2] = o[k2];
				}
			} else { /// not a listener
				continue;
			}
			///
			var param = splitCommand(k1);			
			for (var n = 0; n < param.length; n++) {
				res[k1] = root.add(target, param[n], listener, conf, trigger);
			}
		}
		return res;
	}
};


/// Wait for target to become available in DOM
var onReadyWait = function(target, configure, listener) {
	var time = root.getTime();
	var timeout = configure.timeout;
	var ms = configure.interval || 1000 / 60;
	var interval = setInterval(function() {
		if (root.getTime() - time > timeout) {
			window.clearInterval(interval);
		}
		if (document.querySelector(target)) {
			window.clearInterval(interval);
			setTimeout(listener, 1);
		}
	}, ms);
};

/// Perform batch actions on multiple events
var createBatchCommands = function(events) {
	return {
		remove: function() { // Remove multiple events
			for (var key in events) {
				events[key].remove();
			}
		},
		add: function() { // Add multiple events
			for (var key in events) {
				events[key].add();
			}
		}
	};
};

/// Display error message in console
var logError = function(message, data) {
	if (typeof console === 'undefined') return;
	if (typeof console.error === 'undefined') return;
	console.error(message, data);
};

/// Handle naming discrepancies between platforms
var pointerDefs = {
	'msPointer': ['MSPointerDown', 'MSPointerMove', 'MSPointerUp'],
	'touch': ['touchstart', 'touchmove', 'touchend'],
	'mouse': ['mousedown', 'mousemove', 'mouseup']
};

var pointerDetect = {
	/// MSPointer
	'MSPointerDown': 0,
	'MSPointerMove': 1,
	'MSPointerUp': 2,
	/// Touch
	'touchstart': 0,
	'touchmove': 1,
	'touchend': 2,
	/// Mouse
	'mousedown': 0,
	'mousemove': 1,
	'mouseup': 2
};

var getEventSupport = (function() {
	root.supports = {};
	if (window.navigator.msPointerEnabled) {
		root.supports.msPointer = true;
	}
	if (root.getEventSupport('touchstart')) {
		root.supports.touch = true;
	}
	if (root.getEventSupport('mousedown')) {
		root.supports.mouse = true;
	}
})();

var getEventList = (function() {
	return function(type, strict) {
		var prefix = document.addEventListener ? '' : 'on'; /// IE
		var idx = pointerDetect[type];
		if (isFinite(idx) && !strict) {
			var types = [];
			for (var key in root.supports) {
				types.push(prefix + pointerDefs[key][idx]);
			}
			return types;
		} else {
			return [prefix + type];
		}
	};
})();

/// Event wrappers to keep track of all events placed in the window
var wrappers = root.wrappers = {};
var counter = 0;
var getID = function(object) {
	if (object === window) {
		return '#window';
	} else if (object === document) {
		return '#document';
	} else {
		if (object.eventId) {
			return object.eventId;
		} else {
			return object.eventId = 'e' + counter ++;
		}
	}
};

/// Detect platforms native *EventListener command
var add = document.addEventListener ? 'addEventListener' : 'attachEvent';
var remove = document.removeEventListener ? 'removeEventListener' : 'detachEvent';

/*
	Pointer.js
	----------------------------------------
	Modified from; https://github.com/borismus/pointer.js
*/

root.createPointerEvent = function(event, self, preventRecord) {
	var eventName = self.gesture;
	var target = self.target;
	var pts = event.changedTouches || root.getCoords(event);
	if (pts.length) {
		var point = pts[0];
		self.pointers = preventRecord ? [] : pts;
		self.pageX = point.pageX;
		self.pageY = point.pageY;
		self.x = self.pageX;
		self.y = self.pageY;
	}
	///
	var newEvent = document.createEvent('Event');
	newEvent.initEvent(eventName, true, true);
	newEvent.originalEvent = event;
	///
	for (var key in self) {
		if (key !== 'target') {
			newEvent[key] = self[key];
		}
	}
	///
	var type = newEvent.type;
	if (root.gestureHandler[type]) { // capture custom events
// 		target.dispatchEvent(newEvent);
		self.oldListener.call(target, newEvent, self, false);
	}
};

/// Allows *EventListener to use custom event proxies
if (root.modifyEventListener && window.HTMLElement) {
	(function() {
		var augmentEventListener = function(proto) {
			var recall = function(trigger) { /// overwrite native *EventListener’s
				var handle = trigger + 'EventListener';
				var handler = proto[handle];
				proto[handle] = function(type, listener, useCapture) {
					if (root.gestureHandler[type]) { /// capture custom events
						var configure = useCapture;
						if (typeof useCapture === 'object') {
							configure.useCall = true;
						} else { /// convert to configuration object
							configure = {useCall: true, useCapture: useCapture};
						}
						eventManager(this, type, listener, configure, trigger, true);
// 	 					handler.call(this, type, listener, useCapture);
					} else { /// use native function
						var types = getEventList(type);
						for (var n = 0; n < types.length; n++) {
							handler.call(this, types[n], listener, useCapture);
						}
					}
				};
			};
			recall('add');
			recall('remove');
		};
		/// NOTE: overwriting HTMLElement doesn't do anything in Firefox
		if (navigator.userAgent.match(/Firefox/)) {
			/// TODO: fix Firefox for the general case
			augmentEventListener(HTMLDivElement.prototype);
			augmentEventListener(HTMLCanvasElement.prototype);
		} else {
			augmentEventListener(HTMLElement.prototype);
		}
		augmentEventListener(document);
		augmentEventListener(window);
	})();
}

/// Allows querySelectorAll and other NodeLists to perform *EventListener commands in bulk
if (root.modifySelectors) {
	(function() {
		var proto = NodeList.prototype;
		proto.removeEventListener = function(type, listener, useCapture) {
			for (var n = 0, length = this.length; n < length; n++) {
				this[n].removeEventListener(type, listener, useCapture);
			}
		};
		proto.addEventListener = function(type, listener, useCapture) {
			for (var n = 0, length = this.length; n < length; n++) {
				this[n].addEventListener(type, listener, useCapture);
			}
		};
	})();
}

return root;

})(eventjs);

/*:
	----------------------------------------------------
	eventjs.proxy : 0.4.2 : 2013/07/17 : MIT License
	----------------------------------------------------
	https://github.com/mudcube/eventjs.js
	----------------------------------------------------
*/

if (typeof eventjs === 'undefined') eventjs = {};

(function(root) {'use strict';

var proxy = root.proxy || (root.proxy = {});

/*
	Create a new pointer gesture instance
*/

proxy.pointerSetup = function(conf) {
	conf.points = {};
	conf.target = conf.target || window;
	conf.doc = conf.target.ownerDocument || conf.target; /// active document
	conf.minFingers = conf.minFingers || conf.fingers || 1; /// minimum required fingers
	conf.maxFingers = conf.maxFingers || conf.fingers || Infinity; /// maximum allowed fingers
	conf.position = conf.position || 'relative'; /// determines what coordinate system points are returned
	conf.listenerOnSetup = conf.listener; // for resetting once a proxy is complete
	///
// 	delete conf.fingers; //-
	///
	var self = {};
	///
	self.gesture = conf.gesture;
	self.target = conf.target;
	self.env = conf.env || {};
	///
	if (root.modifyEventListener && conf.fromOverwrite) {
		conf.oldListener = conf.listener;
		conf.listener = root.createPointerEvent;
	}

	/// Convenience commands
	var fingers = 0;
	var type = self.gesture.indexOf('pointer') === 0 && root.modifyEventListener ? 'pointer' : 'mouse';
	///
	if (conf.oldListener) {
		self.oldListener = conf.oldListener;
	}

	/// Listener
	self.listener = conf.listener;

	/// Proxy listener to another event
	self.proxy = function(listener) {
		conf.listener = listener;
		listener(conf.event, self);
	};

	/// Remove listener
	self.remove = function() {
		self.detatch();
		delete root.wrappers[conf.uid];
	};

	/// Attach listener
	self.attached = true;
	self.attach = function() {
		if (self.attached === false) {
			self.attached = true;
			///
			conf._pointerOver && conf._pointerOver.add();
			conf._pointerOut && conf._pointerOut.add();
			conf._pointerDown && conf._pointerDown.add();
			conf._pointerMove && conf._pointerMove.add();
			conf._pointerUp && conf._pointerUp.add();
		}
	};
	
	/// Detach listener
	self.detatch = function() {
		if (self.attached === true) {
			self.attached = false;
			self.resetPoints();
			///
			conf._pointerOver && conf._pointerOver.remove();
			conf._pointerOut && conf._pointerOut.remove();
			conf._pointerDown && conf._pointerDown.remove();
			conf._pointerMove && conf._pointerMove.remove();
			conf._pointerUp && conf._pointerUp.remove();
		}
	};

	/// Pause listener
	self.pause = function(opt) {
		if (conf._pointerMove && (!opt || opt.move)) conf._pointerMove.remove();
		if (conf._pointerUp && (!opt || opt.up)) conf._pointerUp.remove();
		fingers = conf.fingers;
		conf.fingers = 0;
	};

	/// Resume listener
	self.resume = function(opt) {
		if (conf._pointerMove && (!opt || opt.move)) conf._pointerMove.add();
		if (conf._pointerUp && (!opt || opt.up)) conf._pointerUp.add();
		conf.fingers = fingers;
	};

 	/// Cancel listener
	self.cancel = function(opt) { // see select.js
		proxy.animation.stop();
		self.pause(opt);
	};

	/// Reset points
	self.resetPoints = function(sid) {
		if (typeof sid === 'string') {
			var points = conf.points;
			if (points[sid]) {
				delete points[sid]
				conf.fingers--;
			}
		} else {
			conf.points = {};
			conf.fingers = 0;
		}
	};

	/// Reset bbox
	self.resetBoundingBox = function() {
		self.bbox = conf.bbox = root.getBBox(conf.target);
		var points = conf.points;
		for (var sid in points) {
			points[sid].dirty = true;
		}
	};

	/// Helpers
	self.hasMoved = function() {
		return self.start.x !== self.x || self.start.y !== self.y;
	};

	self.distanceMoved = function() {
		var x = self.start.x - self.x;
		var y = self.start.y - self.y;
		return Math.sqrt(x * x + y * y);
	};

	return self;
};

/// create animationFrame for drag events
proxy.animation = new function() {
	var that = this;
	///
	var enabled = false;
	var fn = null;
	var animate = function() {
		fn();
		if (enabled) {
			requestAnimationFrame(animate);
		}
	};

	///
	this.stop = function() {
		enabled = false;
	};

	this.listener = function(event, self, listener) {
		if (self.state === 'down') {
			var lx = null;
			var ly = null;
			fn = function() {
				if (lx === self.x && ly === self.y && self.state !== 'up') {
					return;
				} else {
					listener(event, self);
					lx = self.x;
					ly = self.y;
				}
			};
			///
			if (enabled === false) {
				enabled = true;
				animate();
			}
		} else if (self.state === 'up') {
			that.stop();
		}
	};

	return this;
};

/*
	Begin proxied pointer command
*/

var supports = root.supports;
///
root.isMouse = !!supports.mouse;
root.isMSPointer = !!supports.touch;
root.isTouch = !!supports.msPointer;
///
proxy.defaultSID = 1; // mouse pointer is 1 or breaks in MSIE
proxy.isPointerStart = function(event, self, conf) {

	conf.event = event;
	conf.listener = conf.listenerOnSetup;

	/// Track multiple inputs
	var type = (event.type || 'mousedown').toLowerCase();
	if (type.indexOf('mouse') === 0) {
		root.isMouse = true;
		root.isTouch = false;
		root.isMSPointer = false;
	} else if (type.indexOf('touch') === 0) {
		root.isMouse = false;
		root.isTouch = true;
		root.isMSPointer = false;
	} else if (type.indexOf('mspointer') === 0) {
		root.isMouse = false;
		root.isTouch = false;
		root.isMSPointer = true;
	}

	///
	self.startTime = root.getTime();

	///
	var isTouchStart = !conf.fingers;
	var points = conf.points;
	var touches = event.changedTouches || root.getCoords(event);
	var length = touches.length;

	/// Adding touch events to tracking
	for (var i = 0; i < length; i++) {
		var touch = touches[i];
		var sid = touch.identifier || proxy.defaultSID;
		var point = points[sid];
		///
		if (conf.fingers) {
			if (conf.fingers >= conf.maxFingers) {
				self.identifier = proxy.getPointerID(points);
				return isTouchStart;
			}
			///
			for (var rid in points) {
				if (points[rid].up) { // Replace removed finger
					delete points[rid];
					proxy.setPointerStart(conf, touch, sid);
					conf.fingers++;
					conf.cancel = true;
					break;
				}
			}
			/// Add finger
			if (point === undefined) {
				conf.fingers++;
				proxy.setPointerStart(conf, touch, sid);
			}
		} else { // Start tracking fingers
			points = conf.points = {};
			self.resetBoundingBox();
			conf.fingers = 1;
			conf.cancel = false;
			proxy.setPointerStart(conf, touch, sid);
		}
	}
	///
	self.identifier = proxy.getPointerID(points);
	///
	return isTouchStart;
};

proxy.getPointerID = function(points) {
	return Object.keys(points).join(',');
};

proxy.setPointerStart = function(conf, event, sid) {
	var bbox = conf.bbox;
	var point = conf.points[sid] = {};
	///
	switch(conf.position) {
		case 'absolute': // Absolute from within window
			point.offsetX = 0;
			point.offsetY = 0;
			break;
		case 'differenceFromLast': // Since last coordinate recorded
			point.offsetX = event.pageX;
			point.offsetY = event.pageY;
			break;
		case 'difference': // Relative from origin
			point.offsetX = event.pageX;
			point.offsetY = event.pageY;
			break;
		case 'move': // Move target element
			point.offsetX = event.pageX - bbox.x1;
			point.offsetY = event.pageY - bbox.y1;
			break;
		default: // Relative from within target
			point.offsetX = bbox.x1 - bbox.scrollLeft;
			point.offsetY = bbox.y1 - bbox.scrollTop;
			break;
	}
	///
	var x = event.pageX - point.offsetX;
	var y = event.pageY - point.offsetY;
	///
	point.rotation = 0.0; // used in gesture
	point.scale = 1.0; // used in gesture
	point.startTime = self.startTime; // used in swipe | hover
	point.moveTime = self.startTime; // used in swipe
	point.move = {x: x, y: y}; // used in gesture
	point.start = {x: x, y: y}; // used in drag | tap | longpress
	///
	return point;
};

/*
	End proxied pointer command
*/

proxy.isPointerEnd = function(event, self, conf, onPointerUp) {
	/// Record changed touches have ended (iOS changedTouches is not reliable)
	var touches = event.touches || [];
	var length = touches.length;
	var exists = {};
	for (var i = 0; i < length; i++) {
		var touch = touches[i];
		var sid = touch.identifier || proxy.defaultSID;
		exists[sid] = true;
	}
	///
	var points = conf.points;
	var fingers = conf.fingers;
	for (var sid in points) {
		var point = points[sid];
		if (exists[sid] || point.up) {
			continue;
		} else {
			point.up = true;
			conf.fingers --;
		}
	}
	///
	if (fingers !== conf.fingers) {
		if (onPointerUp) {
			onPointerUp(event, 'up');
		}
	}

/*	/// This should work but fails in Safari on iOS4 so not using it
	var touches = event.changedTouches || root.getCoords(event);
	var length = touches.length;
	/// Record changed touches have ended (this should work)
	for (var i = 0; i < length; i++) {
		var touch = touches[i];
		var sid = touch.identifier || proxy.defaultSID;
		var point = points[sid];
		if (point && !point.up) {
			if (onPointerUp) onPointerUp(event, 'up');
			point.up = true;
			conf.fingers --;
		}
	} */

	/// Wait for all fingers to be released
	if (conf.fingers > 0) {
		return false;
	} else {
		/// Record total number of fingers gesture used
		var ids = Object.keys(points);
		///
		conf.fingers = 0; // self.resetPoints can throw off finger tracking
		conf.gestureFingers = ids.length;
		///
		self.identifier = ids.join(',');
		///
		return true; // Pointer gesture has ended
	}
};

/*
	Returns mouse coords in an array to match event.*Touches
	------------------------------------------------------------
	var touch = event.changedTouches || root.getCoords(event);
*/

root.getCoords = function(event) {
	if (isFinite(event.pageX + event.pageY)) { // Desktop browsers
		root.getCoords = function(event) {
			return [{
				type: 'mouse',
				x: event.pageX,
				y: event.pageY,
				pageX: event.pageX,
				pageY: event.pageY,
				identifier: event.pointerId || proxy.defaultSID // pointerId is MSPointer
			}];
		};
	} else { /// Internet Explorer <= 8.0
		root.getCoords = function(event) {
			event = event || window.event;
			var doc = document.documentElement;
			return [{
				type: 'mouse',
				x: event.clientX + doc.scrollLeft,
				y: event.clientY + doc.scrollTop,
				pageX: event.clientX + doc.scrollLeft,
				pageY: event.clientY + doc.scrollTop,
				identifier: proxy.defaultSID
			}];
		};
	}
	return root.getCoords(event);
};

/*
	Returns single coords in an object
	------------------------------------------------------------
	var mouse = root.getCoord(event);
*/

(function() {
	var px = 0;
	var py = 0;
	root.getCoord = function(event) {
		if (event.changedTouches) { // Mobile browsers
			var touches = event.changedTouches;
			if (touches && touches.length) { // ontouchstart + ontouchmove
				var touch = touches[0];
				return {
					x: px = touch.pageX,
					y: py = touch.pageY
				};
			} else { /// ontouchend
				return {
					x: px,
					y: py
				};
			}
		} else if (isFinite(event.pageX + event.pageY)) { // Desktop browsers
			return {
				x: event.pageX,
				y: event.pageY
			};
		} else { // Internet Explorer <= 8.0
			var element = document.documentElement;
			event = event || window.event;
			return {
				x: event.clientX + element.scrollLeft,
				y: event.clientY + element.scrollTop
			};
		}
	};

	root.getClientXY = function(event) {
		if (event.changedTouches) { // Mobile browsers
			var touches = event.changedTouches;
			if (touches && touches.length) { // ontouchstart + ontouchmove
				var touch = touches[0];
				return {
					x: px = touch.clientX,
					y: py = touch.clientY
				};
			} else { // ontouchend
				return {
					x: px,
					y: py
				};
			}
		} else {
			event = event || window.event;
			return {
				x: event.clientX,
				y: event.clientY
			};
		}
	};
})();

/*
	Get target scale and position in space
*/

var getPropertyAsFloat = function(o, type) {
	var n = parseFloat(o.getPropertyValue(type), 10);
	return isFinite(n) ? n : 0;
};

root.getDocumentScroll = function(bbox) {
	bbox = bbox || {};
	if (window.pageXOffset !== undefined && window.pageYOffset !== undefined) {
		bbox.scrollBodyLeft = window.pageXOffset;
		bbox.scrollBodyTop = window.pageYOffset;
	} else {
		bbox.scrollBodyLeft = (document.documentElement || document.body.parentNode || document.body).scrollLeft;
		bbox.scrollBodyTop = (document.documentElement || document.body.parentNode || document.body).scrollTop;
	}
	return bbox;
};

root.getBBox = function(o) {
	if (o === window || o === document) {
		o = document.body;
	}
	///
	var bbox = {};
	var bcr = o.getBoundingClientRect();
	bbox.width = bcr.width;
	bbox.height = bcr.height;
	bbox.x1 = bcr.left;
	bbox.y1 = bcr.top;
	bbox.scaleX = bcr.width / o.offsetWidth || 1.0;
	bbox.scaleY = bcr.height / o.offsetHeight || 1.0;
	bbox.scrollLeft = 0;
	bbox.scrollTop = 0;
	///
	var style = window.getComputedStyle(o);
	var borderBox = style.getPropertyValue('box-sizing') === 'border-box';
	///
	if (borderBox === false) {
		var left = getPropertyAsFloat(style, 'border-left-width');
		var right = getPropertyAsFloat(style, 'border-right-width');
		var bottom = getPropertyAsFloat(style, 'border-bottom-width');
		var top = getPropertyAsFloat(style, 'border-top-width');
		bbox.border = [left, right, top, bottom];
		bbox.x1 += left;
		bbox.y1 += top;
		bbox.width -= right + left;
		bbox.height -= bottom + top;
	}

/*	var left = getPropertyAsFloat(style, 'padding-left');
	var right = getPropertyAsFloat(style, 'padding-right');
	var bottom = getPropertyAsFloat(style, 'padding-bottom');
	var top = getPropertyAsFloat(style, 'padding-top');
	bbox.padding = [left, right, top, bottom];*/
	///
	bbox.x2 = bbox.x1 + bbox.width;
	bbox.y2 = bbox.y1 + bbox.height;

	/// Get the scroll of container element
	var position = style.getPropertyValue('position');
	var tmp = position === 'fixed' ? o : o.parentNode;
	while (tmp !== null) {
		if (tmp === document.body || tmp.scrollTop === undefined) {
			break;
		}
		var style = window.getComputedStyle(tmp);
		var position = style.getPropertyValue('position');
		if (position === 'absolute') {

		} else if (position === 'fixed') { //- more testing required
//			bbox.scrollTop += document.body.scrollTop;
//			bbox.scrollLeft += document.body.scrollLeft;
// 			bbox.scrollTop -= tmp.parentNode.scrollTop;
// 			bbox.scrollLeft -= tmp.parentNode.scrollLeft;
			bbox.scrollTop = tmp.scrollLeft;
			bbox.scrollLeft = tmp.scrollTop;
			break;
		} else {
			bbox.scrollLeft += tmp.scrollLeft;
			bbox.scrollTop += tmp.scrollTop;
		}
		///
		tmp = tmp.parentNode;
	};
	///
	root.getDocumentScroll(bbox);
	///
	bbox.scrollLeft -= bbox.scrollBodyLeft;
	bbox.scrollTop -= bbox.scrollBodyTop;
	///
	return bbox;
};

/// Timestamp
root.getTime = (function() {
	var performance = window.performance;
	if (performance && performance.now) {
		return performance.now.bind(performance);
	} else {
		return Date.now;
	}
})();

/// Register events
root.gestureHandler = root.gestureHandler || {};
root.register = function(name) {
	root.gestureHandler[name] = proxy[name];
};

})(eventjs);

/*:
	----------------------------------------------------
	'MutationObserver' event
	----------------------------------------------------
	author: Selvakumar Arumugam - MIT LICENSE
	   src: http://stackoverflow.com/questions/10868104/can-you-have-a-javascript-hook-trigger-after-a-dom-elements-style-object-change
	----------------------------------------------------
*/

// if (typeof eventjs === 'undefined') eventjs = {};
// 
// eventjs.MutationObserver = (function() {
// 	var MutationObserver = window.MutationObserver || window.WebKitMutationObserver || window.MozMutationObserver;
// 	var DOMAttrModifiedSupported = !MutationObserver && (function() {
// 		var p = document.createElement('p');
// 		var flag = false;
// 		var fn = function() {flag = true};
// 		if (p.addEventListener) {
// 			p.addEventListener('DOMAttrModified', fn, false);
// 		} else if (p.attachEvent) {
// 			p.attachEvent('onDOMAttrModified', fn);
// 		} else {
// 			return false;
// 		}
// 		//
// 		p.setAttribute('id', 'target');
// 		//
// 		return flag;
// 	})();
// 	//
// 	return function(container, callback) {
// 		if (MutationObserver) {
// 			var options = {
// 				subtree: false,
// 				attributes: true
// 			};
// 			var observer = new MutationObserver(function(mutations) {
// 				mutations.forEach(function(e) {
// 					callback.call(e.target, e.attributeName);
// 				});
// 			});
// 			observer.observe(container, options)
// 		} else if (DOMAttrModifiedSupported) {
// 			eventjs.add(container, 'DOMAttrModified', function(e) {
// 				callback.call(container, e.attrName);
// 			});
// 		} else if ('onpropertychange' in document.body) {
// 			eventjs.add(container, 'propertychange', function(e) {
// 				callback.call(container, window.event.propertyName);
// 			});
// 		}
// 	}
// })();

/*:
	'Click' event
	----------------------------------------------------
	eventjs.add(window, 'click', function(event, self) {});
*/

if (typeof eventjs === 'undefined') eventjs = {};

(function(root) {'use strict';

var proxy = root.proxy || (root.proxy = {});
var ios = /iPhone|iPad|iPod/i.test(navigator.userAgent);

proxy.click = function(conf) {
	conf.gesture = conf.gesture || 'click';
	conf.maxFingers = conf.maxFingers || conf.fingers || 1;

	///
	conf.onPointerDown = function(event) {
		if (proxy.isPointerStart(event, self, conf)) {
			conf._pointerUp = root.add(conf.target, 'mouseup', conf.onPointerUp);
		}
	};

	conf.onPointerUp = function(event) {
		if (ios && event.type === 'mouseup') {
			return; // iOS fires mouseup + touchend
		}
		if (proxy.isPointerEnd(event, self, conf)) {
			conf._pointerUp.remove();
			var pointers = event.changedTouches || root.getCoords(event);
			var pointer = pointers[0];
			var bbox = conf.bbox;
			var newbbox = root.getBBox(conf.target);
			var y = pointer.pageY - newbbox.scrollBodyTop;
			var x = pointer.pageX - newbbox.scrollBodyLeft;
			///
			if (x > bbox.x1 && y > bbox.y1 &&
				x < bbox.x2 && y < bbox.y2 &&
				bbox.scrollTop === newbbox.scrollTop) { /// has not been scrolled
				///
				for (var key in conf.points) break;
				var point = conf.points[key];
				self.x = point.start.x;
				self.y = point.start.y;
				self.state = 'click';
				conf.listener(event, self);
			}
		}
	};

	/// Attach events
	conf._pointerDown = root.add(conf.target, 'mousedown', conf.onPointerDown);

	/// Setup from configuration
	var self = proxy.pointerSetup(conf);
	return self;
};

root.register('click');

})(eventjs);

/*:
	'Double-Click' aka 'Double-Tap' event
	----------------------------------------------------
	eventjs.add(window, 'dblclick', function(event, self) {});
	----------------------------------------------------
	Touch an target twice for <= 700ms, with less than 25 pixel drift
*/

if (typeof eventjs === 'undefined') eventjs = {};

(function(root) {'use strict';

var proxy = root.proxy || (root.proxy = {});

proxy.dbltap =
proxy.dblclick = function(conf) {
	conf.gesture = conf.gesture || 'dbltap';
	conf.maxFingers = conf.maxFingers || conf.fingers || 1;

	/// Setting up local variables
	var delay = 700; /// in milliseconds
	var time0, time1, timeout;
	var pointer0, pointer1;

	conf.onPointerDown = function(event) {
		var pointers = event.changedTouches || root.getCoords(event);
		if (time0 && !time1) { /// Click #2
			pointer1 = pointers[0];
			time1 = root.getTime() - time0;
		} else { /// Click #1
			pointer0 = pointers[0];
			time0 = root.getTime();
			time1 = 0;
			clearTimeout(timeout);
			timeout = setTimeout(function() {
				time0 = 0;
			}, delay);
		}
		if (proxy.isPointerStart(event, self, conf)) {
			(conf._pointerMove = root.add(conf.target, 'mousemove', conf.onPointerMove)).listener(event);
			conf._pointerUp = root.add(conf.target, 'mouseup', conf.onPointerUp);
		}
	};

	conf.onPointerMove = function(event) {
		if (time0 && !time1) {
			var pointers = event.changedTouches || root.getCoords(event);
			pointer1 = pointers[0];
		} else if (!pointer1) {
			return; //-?
		}
		var bbox = conf.bbox;
		var ax = (pointer1.pageX - bbox.x1);
		var ay = (pointer1.pageY - bbox.y1);
		if (!(ax > 0 && ax < bbox.width && /// Within target coordinates.
			  ay > 0 && ay < bbox.height &&
			  Math.abs(pointer1.pageX - pointer0.pageX) <= 25 && /// Within drift deviance
			  Math.abs(pointer1.pageY - pointer0.pageY) <= 25)) {
			/// Cancel out this listener
			conf._pointerMove.remove();
			clearTimeout(timeout);
			time0 = time1 = 0;
		}
	};

	conf.onPointerUp = function(event) {
		if (proxy.isPointerEnd(event, self, conf)) {
			conf._pointerMove.remove();
			conf._pointerUp.remove();
		}
		if (time0 && time1) {
			if (time1 <= delay) { /// && !(event.cancelBubble &&++event.cancelBubbleCount > 1)) {
				self.state = conf.gesture;
				for (var key in conf.points) {
					break;
				}
				var point = conf.points[key];
				self.x = point.start.x;
				self.y = point.start.y;
				conf.listener(event, self);
			}
			clearTimeout(timeout);
			time0 = time1 = 0;
		}
	};

	/// Attach events
	conf._pointerDown = root.add(conf.target, 'mousedown', conf.onPointerDown);

	/// Setup from configuration
	var self = proxy.pointerSetup(conf);
	return self;
};

root.register('dbltap');
root.register('dblclick');

})(eventjs);

/*:
	'Drag' event (1+ fingers)
	----------------------------------------------------
	CONFIGURE: maxFingers, position, monitor, event
	----------------------------------------------------
	eventjs.add(window, 'drag', function(event, self) {
		console.log(self.gesture, self.state, self.start, self.x, self.y, self.bbox);
	});
*/

if (typeof eventjs === 'undefined') eventjs = {};

(function(root) {'use strict';

var proxy = root.proxy || (root.proxy = {});

proxy.dragElement = function(target, event) {
	proxy.drag({
		event: event,
		target: target,
		position: 'move',
		listener: function(event, self) {
			target.style.left = self.x + 'px';
			target.style.top = self.y + 'px';
			root.prevent(event);
		}
	});
};

proxy.drag = function(conf) {
	conf.gesture = 'drag';
	///
	var event = conf.event;
	var position = conf.position;
	var useMonitor = conf.monitor;
	var useAnimationFrame = conf.animationFrame;
	var useDifference = position === 'differenceFromLast';
	/// 
	var sendPointer = function(event, state) {
		self.fingers = conf.fingers;
		self.state = state;
		///
		var bbox = conf.bbox;
		var touches = event.changedTouches || root.getCoords(event);
		var length = touches.length;
		for (var i = 0; i < length; i++) {
			var touch = touches[i];
			var sid = touch.identifier || proxy.defaultSID;
			var point = conf.points[sid];
			if (point) {
				if (point.dirty) {
					point = proxy.setPointerStart(conf, touch, sid);
				}
				///
				var pageX = point.pageX = touch.pageX;
				var pageY = point.pageY = touch.pageY;
				var x = pageX - point.offsetX;
				var y = pageY - point.offsetY;
				///
				if (useDifference) {
					point.offsetX = pageX;
					point.offsetY = pageY;
				}
				///
				self.identifier = sid;
				self.start = point.start;
				self.x = x;
				self.y = y;
				///
				if (useAnimationFrame) { // put listener inside of animation frame
					proxy.animation.listener(event, self, conf.listener);
				} else {
					conf.listener(event, self);
				}
			}
		}
	};

	var sendPointerUp = function(event) {
		self.pointerDown = false;
		self.pointerMove = false;
		self.pointerUp = true;
		self.pointerStart = false;
		self.pointerDrag = false;
		self.pointerEnd = true;
		///
		sendPointer(event, 'up');
	};

	///
	var PointerTrack = function(event) {
		if (proxy.isPointerStart(event, self, conf)) {
			if (useMonitor) {	
				conf._pointerMove.remove();
			}
			///
			conf._pointerMove = root.add(conf.doc, 'mousemove', onPointerMove);
			conf._pointerUp = root.add(conf.doc, 'mouseup', onPointerUp);
		}
	};

	var PointerMonitor = function() {
		conf._pointerMove = root.add(conf.target, 'mousemove', onPointerMove);
	};

	/// Event listeners
	var onPointerDown = conf.onPointerDown = function(event) {
		self.pointerDown = true;
		self.pointerMove = false;
		self.pointerUp = false;
		self.pointerStart = true;
		self.pointerDrag = false;
		self.pointerEnd = false;
		///
		if (useMonitor) {
			self.resetBoundingBox();
		}
		///
		PointerTrack(event);
		sendPointer(event, 'down');
	};

	var onPointerMove = conf.onPointerMove = function(event) {
		self.pointerMove = true;
		self.pointerStart = false;
		self.pointerDrag = self.pointerDown;
		self.pointerEnd = false;
		///
		if (conf.points) {
			sendPointer(event, 'move');
		} else { // begin 'monitor' mode
			PointerTrack(event);
			sendPointer(event, 'move');
		}
	};

	var onPointerUp = conf.onPointerUp = function(event) {
		if (proxy.isPointerEnd(event, self, conf, sendPointerUp)) {
			conf._pointerMove.remove();
			conf._pointerUp.remove();
			///
			if (useMonitor) {
				PointerMonitor();
			}
		}
	};

	/// Setup from configuration
	var self = proxy.pointerSetup(conf);
	self.pointerDown = false;
	self.pointerMove = false;
	self.pointerUp = true;
	self.pointerStart = false;
	self.pointerDrag = false;
	self.pointerEnd = false;

	/// Attach events
	if (event) {
		onPointerDown(event);
	} else {
		if (useMonitor) {
			PointerMonitor();
		}
		///
		conf._pointerDown = root.add(conf.target, 'mousedown', onPointerDown);
	}

	return self;
};

root.register('drag');

})(eventjs);

/*:
	'gestureHandler' event (2+ fingers)
	----------------------------------------------------
	CONFIGURE: minFingers, maxFingers
	----------------------------------------------------
	eventjs.add(window, 'gesture', function(event, self) {
		console.log(
			self.x, /// centroid
			self.y,
			self.rotation,
			self.scale,
			self.fingers,
			self.state
		);
	});
*/

if (typeof eventjs === 'undefined') eventjs = {};

(function(root) {'use strict';

var proxy = root.proxy || (root.proxy = {});
///
var RAD_DEG = Math.PI / 180;
var getCentroid = function(self, points) {
	var centroidx = 0;
	var centroidy = 0;
	var length = 0;
	for (var sid in points) {
		var touch = points[sid];
		if (touch.up) continue;
		centroidx += touch.move.x;
		centroidy += touch.move.y;
		length++;
	}
	self.x = centroidx /= length;
	self.y = centroidy /= length;
	return self;
};

proxy.gesture = function(conf) {
	conf.gesture = conf.gesture || 'gesture';
	conf.minFingers = conf.minFingers || conf.fingers || 2;

	conf.onPointerDown = function(event) {
		var fingers = conf.fingers;
		if (proxy.isPointerStart(event, self, conf)) {
			conf._pointerMove = root.add(conf.doc, 'mousemove', conf.onPointerMove);
			conf._pointerUp = root.add(conf.doc, 'mouseup', conf.onPointerUp);
		}
		/// Record gesture start
		if (conf.fingers === conf.minFingers && fingers !== conf.fingers) {
			var points = conf.points;
			self.fingers = conf.minFingers;
			self.scale = 1.0;
			self.rotation = 0;
			self.state = 'start';
			self.identifier = proxy.getPointerID(points);
			getCentroid(self, points);
			conf.listener(event, self);
		}
	};

	conf.onPointerMove = function(event, state) {
		var bbox = conf.bbox;
		var points = conf.points;
		var touches = event.changedTouches || root.getCoords(event);
		var length = touches.length;
		/// Update tracker coordinates
		for (var i = 0; i < length; i++) {
			var touch = touches[i];
			var sid = touch.identifier || proxy.defaultSID;
			var point = points[sid];
			if (point) {
				point.move.x = touch.pageX - bbox.x1;
				point.move.y = touch.pageY - bbox.y1;
			}
		}
		///
		if (conf.fingers < conf.minFingers) {
			return;
		}
		///
		var touches = [];
		var scale = 0;
		var rotation = 0;

		/// Calculate centroid of gesture
		getCentroid(self, points);
		///
		for (var sid in points) {
			var touch = points[sid];
			if (touch.up) continue;
			var start = touch.start;
			if (!start.distance) {
				var dx = start.x - self.x;
				var dy = start.y - self.y;
				start.distance = Math.sqrt(dx * dx + dy * dy);
				start.angle = Math.atan2(dx, dy) / RAD_DEG;
			}

			/// Calculate scale
			var dx = touch.move.x - self.x;
			var dy = touch.move.y - self.y;
			var distance = Math.sqrt(dx * dx + dy * dy);
			scale += distance / start.distance;

			/// Calculate rotation
			var angle = Math.atan2(dx, dy) / RAD_DEG;
			var rotate = (start.angle - angle + 360) % 360 - 180;
			touch.DEG2 = touch.DEG1; /// Previous degree
			touch.DEG1 = rotate > 0 ? rotate : -rotate; /// Current degree
			if (isFinite(touch.DEG2)) {
				if (rotate > 0) {
					touch.rotation += touch.DEG1 - touch.DEG2;
				} else {
					touch.rotation -= touch.DEG1 - touch.DEG2;
				}
				rotation += touch.rotation;
			}

			/// Attach current points to self
			touches.push(touch.move);
		}
		///
		self.touches = touches;
		self.fingers = conf.fingers;
		self.scale = scale / conf.fingers;
		self.rotation = rotation / conf.fingers;
		self.state = 'change';
		conf.listener(event, self);
	};

	conf.onPointerUp = function(event) {
		var fingers = conf.fingers;
		if (proxy.isPointerEnd(event, self, conf)) {
			conf._pointerMove.remove();
			conf._pointerUp.remove();
		}

		/// Check whether fingers has dropped below minFingers
		if (fingers === conf.minFingers && conf.fingers < conf.minFingers) {
			self.fingers = conf.fingers;
			self.state = 'end';
			conf.listener(event, self);
		}
	};

	/// Attach events
	conf._pointerDown = root.add(conf.target, 'mousedown', conf.onPointerDown);

	/// Setup from configuration
	var self = proxy.pointerSetup(conf);
	return self;
};

root.register('gesture');

})(eventjs);

/*:
	'Device Motion' and 'Shake' event
	----------------------------------------------------
	http://developer.android.com/reference/android/hardware/Sensoreventjs.html#values
	----------------------------------------------------
	eventjs.add(window, 'shake', function(event, self) {});
	eventjs.add(window, 'devicemotion', function(event, self) {
		console.log(self.acceleration, self.accelerationIncludingGravity);
	});
*/

// if (typeof eventjs === 'undefined') eventjs = {};
// 
// (function(root) {'use strict';
// 
// var proxy = root.proxy || (root.proxy = {});
// 
// proxy.shake = function(conf) {
// 	/// Externally accessible data
// 	var self = {
// 		gesture: 'devicemotion',
// 		acceleration: {},
// 		accelerationIncludingGravity: {},
// 		target: conf.target,
// 		listener: conf.listener,
// 		remove: function() {
// 			window.removeEventListener('devicemotion', onDeviceMotion, false);
// 		}
// 	};
// 
// 	/// Setting up local variables
// 	var threshold = 4; /// Gravitational threshold
// 	var timeout = 1000; /// Timeout between shake events
// 	var timeframe = 200; /// Time between shakes
// 	var shakes = 3; /// Minimum shakes to trigger event
// 	var lastShake = root.getTime();
// 	var gravity = {
// 		x: 0,
// 		y: 0,
// 		z: 0
// 	};
// 	var delta = {
// 		x: {count: 0, value: 0},
// 		y: {count: 0, value: 0},
// 		z: {count: 0, value: 0}
// 	};
// 
// 	/// Tracking the events
// 	var onDeviceMotion = function(e) {
// 		var alpha = 0.8; /// Low pass filter
// 		var o = e.accelerationIncludingGravity;
// 		gravity.x = alpha * gravity.x + (1 - alpha) * o.x;
// 		gravity.y = alpha * gravity.y + (1 - alpha) * o.y;
// 		gravity.z = alpha * gravity.z + (1 - alpha) * o.z;
// 		self.accelerationIncludingGravity = gravity;
// 		self.acceleration.x = o.x - gravity.x;
// 		self.acceleration.y = o.y - gravity.y;
// 		self.acceleration.z = o.z - gravity.z;
// 		///
// 		if (conf.gesture === 'devicemotion') {
// 			conf.listener(e, self);
// 			return;
// 		}
// 		///
// 		var data = 'xyz';
// 		var now = root.getTime();
// 		for (var n = 0, length = data.length; n < length; n++) {
// 			var letter = data[n];
// 			var ACCELERATION = self.acceleration[letter];
// 			var DELTA = delta[letter];
// 			var abs = Math.abs(ACCELERATION);
// 			/// Check whether another shake event was recently registered
// 			if (now - lastShake < timeout) continue;
// 			/// Check whether delta surpasses threshold
// 			if (abs > threshold) {
// 				var idx = now * ACCELERATION / abs;
// 				var span = Math.abs(idx + DELTA.value);
// 				/// Check whether last delta was registered within timeframe
// 				if (DELTA.value && span < timeframe) {
// 					DELTA.value = idx;
// 					DELTA.count++;
// 					/// Check whether delta count has enough shakes
// 					if (DELTA.count === shakes) {
// 						conf.listener(e, self);
// 						/// Reset tracking
// 						lastShake = now;
// 						DELTA.value = 0;
// 						DELTA.count = 0;
// 					}
// 				} else {
// 					/// Track first shake
// 					DELTA.value = idx;
// 					DELTA.count = 1;
// 				}
// 			}
// 		}
// 	};
// 
// 	/// Attach events
// 	if (!window.addEventListener) return;
// 	window.addEventListener('devicemotion', onDeviceMotion, false);
// 
// 	return self;
// };
// 
// root.register('shake');
// 
// })(eventjs);

/*:
	'Swipe' event (1+ fingers)
	----------------------------------------------------
	CONFIGURE: snap, threshold, maxFingers
	----------------------------------------------------
	eventjs.add(window, 'swipe', function(event, self) {
		console.log(self.velocity, self.angle);
	});
*/

// if (typeof eventjs === 'undefined') eventjs = {};
// 
// (function(root) {'use strict';
// 
// var proxy = root.proxy || (root.proxy = {});
// var RAD_DEG = Math.PI / 180;
// 
// proxy.swipe = function(conf) {
// 	conf.snap = conf.snap || 90; /// angle snap
// 	conf.threshold = conf.threshold || 0.75; /// velocity threshold
// 	conf.gesture = conf.gesture || 'swipe';
// 
// 	conf.onPointerDown = function(event) {
// 		if (proxy.isPointerStart(event, self, conf)) {
// 			(conf._pointerMove = root.add(conf.doc, 'mousemove', conf.onPointerMove)).listener(event);
// 			conf._pointerUp = root.add(conf.doc, 'mouseup', conf.onPointerUp);
// 		}
// 	};
// 
// 	conf.onPointerMove = function(event) {
// 		var touches = event.changedTouches || root.getCoords(event);
// 		var length = touches.length;
// 		for (var i = 0; i < length; i++) {
// 			var touch = touches[i];
// 			var sid = touch.identifier || proxy.defaultSID;
// 			var o = conf.points[sid];
// 			/// Identifier defined outside of listener
// 			if (!o) continue;
// 			o.move.x = touch.pageX;
// 			o.move.y = touch.pageY;
// 			o.moveTime = root.getTime();
// 		}
// 	};
// 
// 	conf.onPointerUp = function(event) {
// 		if (proxy.isPointerEnd(event, self, conf)) {
// 			conf._pointerMove.remove();
// 			conf._pointerUp.remove();
// 			///
// 			var velocity1;
// 			var velocity2
// 			var degree1;
// 			var degree2;
// 			/// Calculate centroid of gesture
// 			var start = {x: 0, y: 0};
// 			var endx = 0;
// 			var endy = 0;
// 			var length = 0;
// 			///
// 			for (var sid in conf.points) {
// 				var touch = conf.points[sid];
// 				var xdist = touch.move.x - touch.start.x;
// 				var ydist = touch.move.y - touch.start.y;
// 				///
// 				endx += touch.move.x;
// 				endy += touch.move.y;
// 				start.x += touch.start.x;
// 				start.y += touch.start.y;
// 				length++;
// 				///
// 				var distance = Math.sqrt(xdist * xdist + ydist * ydist);
// 				var ms = touch.moveTime - touch.startTime;
// 				var degree2 = Math.atan2(xdist, ydist) / RAD_DEG + 180;
// 				var velocity2 = ms ? distance / ms : 0;
// 				if (typeof degree1 === 'undefined') {
// 					degree1 = degree2;
// 					velocity1 = velocity2;
// 				} else if (Math.abs(degree2 - degree1) <= 20) {
// 					degree1 = (degree1 + degree2) / 2.0;
// 					velocity1 = (velocity1 + velocity2) / 2.0;
// 				} else {
// 					return;
// 				}
// 			}
// 			///
// 			var fingers = conf.gestureFingers;
// 			if (conf.minFingers <= fingers && conf.maxFingers >= fingers) {
// 				if (velocity1 > conf.threshold) {
// 					start.x /= length;
// 					start.y /= length;
// 					self.start = start;
// 					self.x = endx / length;
// 					self.y = endy / length;
// 					self.angle = -((((degree1 / conf.snap + 0.5) >> 0) * conf.snap || 360) - 360);
// 					self.velocity = velocity1;
// 					self.fingers = fingers;
// 					self.state = 'swipe';
// 					conf.listener(event, self);
// 				}
// 			}
// 		}
// 	};
// 
// 	/// Attach events
// 	conf._pointerDown = root.add(conf.target, 'mousedown', conf.onPointerDown);
// 
// 	/// Setup from configuration
// 	var self = proxy.pointerSetup(conf);
// 	return self;
// };
// 
// root.register('swipe');
// 
// })(eventjs);

/*:
	'Tap' and 'Longpress' event
	----------------------------------------------------
	CONFIGURE: delay (longpress), timeout (tap)
	----------------------------------------------------
	eventjs.add(window, 'tap', function(event, self) {
		console.log(self.fingers);
	});
	----------------------------------------------------
	multi-finger tap /// touch an target for <= 250ms
	multi-finger longpress /// touch an target for >= 500ms
*/

if (typeof eventjs === 'undefined') eventjs = {};

(function(root) {'use strict';

var proxy = root.proxy || (root.proxy = {});

proxy.longpress = function(conf) {
	conf.gesture = 'longpress';
	return proxy.tap(conf);
};

proxy.tap = function(conf) {
	conf.gesture = conf.gesture || 'tap';
	conf.delay = conf.delay || 500;
	conf.driftDeviance = conf.driftDeviance || 10;
	conf.timeout = conf.timeout || 250;

	/// Setting up local variables
	var timestamp, timeout;

	conf.onPointerDown = function(event) {
		if (proxy.isPointerStart(event, self, conf)) {
			timestamp = root.getTime();

			/// Initialize event listeners
			(conf._pointerMove = root.add(conf.doc, 'mousemove', conf.onPointerMove)).listener(event);
			conf._pointerUp = root.add(conf.doc, 'mouseup', conf.onPointerUp);

			/// Make sure this is a 'longpress' event
			if (conf.gesture !== 'longpress') {
				return;
			}
			///
			timeout = setTimeout(function() {
				if (event.cancelBubble &&++event.cancelBubbleCount > 1) {
					return;
				}

				/// Make sure no fingers have been changed
				var fingers = 0;
				for (var key in conf.points) {
					var point = conf.points[key];
					if (point.end === true) return;
					if (conf.cancel) return;
					fingers++;
				}

				/// Send callback
				if (conf.minFingers <= fingers && conf.maxFingers >= fingers) {
					self.state = 'start';
					self.fingers = fingers;
					self.x = point.start.x;
					self.y = point.start.y;
					conf.listener(event, self);
				}
			}, conf.delay);
		}
	};

	conf.onPointerMove = function(event) {
		var bbox = conf.bbox;
		var touches = event.changedTouches || root.getCoords(event);
		var length = touches.length;
		for (var i = 0; i < length; i++) {
			var touch = touches[i];
			var sid = touch.identifier || proxy.defaultSID;
			var point = conf.points[sid];
			if (point) {
				var x = (touch.pageX - bbox.x1);
				var y = (touch.pageY - bbox.y1);
				///
				var dx = x - point.start.x;
				var dy = y - point.start.y;
				var distance = Math.sqrt(dx * dx + dy * dy);
				if (!(x > 0 && x < bbox.width && // Within target coordinates.
					  y > 0 && y < bbox.height &&
					  distance <= conf.driftDeviance)) { // Within drift deviance
					/// Cancel out this listener
					conf._pointerMove.remove();
					conf.cancel = true;
					return;
				}
			}
		}
	};

	conf.onPointerUp = function(event) {
		if (proxy.isPointerEnd(event, self, conf)) {
			clearTimeout(timeout);
			conf._pointerMove.remove();
			conf._pointerUp.remove();
			if (event.cancelBubble &&++event.cancelBubbleCount > 1) {
				return;
			}
			/// Callback release on longpress
			if (conf.gesture === 'longpress') {
				if (self.state === 'start') {
					self.state = 'end';
					conf.listener(event, self);
				}
				return;
			}
			if (conf.cancel) {
				return; // Cancel event due to movement
			}
			if (root.getTime() - timestamp > conf.timeout) {
				return; // delay is greater than allowed
			}
			/// Send callback
			var fingers = conf.gestureFingers;
			if (conf.minFingers <= fingers && conf.maxFingers >= fingers) {
				self.state = 'tap';
				self.fingers = conf.gestureFingers;
				conf.listener(event, self);
			}
		}
	};

	/// Attach events
	conf._pointerDown = root.add(conf.target, 'mousedown', conf.onPointerDown);

	/// Setup from configuration
	var self = proxy.pointerSetup(conf);
	return self;
};

root.register('tap');
root.register('longpress');

})(eventjs);

/*:
	'Hover' event
	----------------------------------------------------
	eventjs.add(window, 'hover', function(event, self) {
		console.log(self.iterate, self.lapse);
	});
*/

if (typeof eventjs === 'undefined') eventjs = {};

(function(root) {'use strict';

var proxy = root.proxy || (root.proxy = {});

proxy.hover = function(conf) {
	conf.gesture = conf.gesture || 'hover';
	conf.maxFingers = conf.maxFingers || conf.fingers || 1;
	conf.delay = conf.delay || 150; /// delay to start sampling hover state
	conf.interval = conf.interval || 30; /// speed to sample hover state
	conf.timeout = conf.timeout || 10000; /// length hover state continues to execute
	///
	var timeout;
	var interval;
	var lapse = 0;
	var iterate = 0;
	var clearTracking = function() {
		clearTimeout(timeout);
		clearInterval(interval);
	};
	///
	conf.onPointerOver = function(event) {
		if (proxy.isPointerStart(event, self, conf)) {
			conf._pointerOut = root.add(conf.target, 'mouseout', conf.onPointerOut);
			///
			clearTracking();
			timeout = setTimeout(function() {
				interval = setInterval(function() {
					var lapse = root.getTime() - self.startTime;
					if (lapse > conf.timeout) {
						clearTracking();
					} else {
						self.state = 'hover';
						self.iterate = iterate++;
						self.lapse = lapse;
						conf.listener(event, self);
					}
				}, conf.interval);
			}, conf.delay);
		}
	};

	conf.onPointerOut = function(event) {
		if (proxy.isPointerEnd(event, self, conf)) {
			conf._pointerOut.remove();
			clearTracking();
		}
	};

	/// Attach events
	conf._pointerOver = root.add(conf.target, 'mouseover', conf.onPointerOver);

	/// Setup from configuration
	var self = proxy.pointerSetup(conf);
	return self;
};

root.register('hover');

})(eventjs);

/*:
	'Mouse Wheel' event
	----------------------------------------------------
	eventjs.add(window, 'wheel', function(event, self) {
		console.log(self.state, self.wheelDelta);
	});
*/

if (typeof eventjs === 'undefined') eventjs = {};

(function(root) {'use strict';

var proxy = root.proxy || (root.proxy = {});

proxy.wheelPreventElasticBounce = function(el) {
	if (el) {
		if (typeof el === 'string') el = document.querySelector(el);
		root.add(el, 'wheel', function(event, self) {
			self.preventElasticBounce();
			root.stop(event);
		});
	}
};

proxy.wheel = function(conf) {
	/// Configure event listener
	var interval;
	var timeout = conf.timeout || 150;
	var count = 0;

	/// Externally accessible data
	var self = {
		gesture: 'wheel',
		state: 'start',
		wheelDelta: 0,
		target: conf.target,
		listener: conf.listener,
		preventElasticBounce: function(event) {
			var target = this.target;
			var scrollTop = target.scrollTop;
			var top = scrollTop + target.offsetHeight;
			var height = target.scrollHeight;
			if (top === height && this.wheelDelta <= 0) {
				root.cancel(event);
			} else if (scrollTop === 0 && this.wheelDelta >= 0) {
				root.cancel(event);
			}
			root.stop(event);
		},
		add: function() {
			conf.target[add](type, onMouseWheel, false);
		},
		remove: function() {
			conf.target[remove](type, onMouseWheel, false);
		}
	};

	/// Tracking the events
	var onMouseWheel = function(event) {
		event = event || window.event;
		self.state = count++ ? 'change' : 'start';
		self.wheelDelta = event.detail ? event.detail * -20 : event.wheelDelta;
		conf.listener(event, self);
		clearTimeout(interval);
		interval = setTimeout(function() {
			count = 0;
			self.state = 'end';
			self.wheelDelta = 0;
			conf.listener(event, self);
		}, timeout);
	};

	/// Attach events
	var add = document.addEventListener ? 'addEventListener' : 'attachEvent';
	var remove = document.removeEventListener ? 'removeEventListener' : 'detachEvent';
	var type = root.getEventSupport('mousewheel') ? 'mousewheel' : 'DOMMouseScroll';
	conf.target[add](type, onMouseWheel, false);

	return self;
};

root.register('wheel');

})(eventjs);

/*:
	----------------------------------------------------
	elementsFromEvent + elementsFromPoint
	----------------------------------------------------
*/

(function(root) {
	/// https://gist.github.com/mariohelbing/4048626 - WTFPL
	/// test for ie: turn on conditional comments
	var jscript /*@cc_on=@_jscript_version@*/ ;
	var styleProp = jscript ? 'display' : 'pointerEvents';
	root.elementsFromEvent = function(event, top) {
		var pt = root.getClientXY(event);
		return root.elementsFromPoint(pt.x, pt.y, top);
	};
	root.elementsFromPoint = function(x, y, top) {
		var d = top ? top.ownerDocument : document; /// support for child iframes
		top = top || d.getElementsByTagName('html')[0]; /// the last element in the list
		var element = d.elementFromPoint(x, y);
		if (element === top || element.nodeName === 'HTML') {
			return [element];
		} else {
			var style = element.style[styleProp];
			element.style[styleProp] = 'none'; /// let us peak at the next layer
			var result = [element].concat(root.elementsFromPoint(x, y, top));
			element.style[styleProp] = style; /// restore
			return result;
		}
	};
})(eventjs);

/*:
	----------------------------------------------------
	Keep track of metaKey, the proper ctrlKey for users platform
	----------------------------------------------------
	http://www.quirksmode.org/js/keys.html
	----------------------------------------------------
	http://unixpapa.com/js/key.html
	----------------------------------------------------
*/

(function(root) {

	var proxy = root.proxy;
	///
	(root.keyTrackerReset = function() {
		root.fnKey = proxy.fnKey = false;
		root.metaKey = proxy.metaKey = false;
		root.escKey = proxy.escKey = false;
		root.ctrlKey = proxy.ctrlKey = false;
		root.shiftKey = proxy.shiftKey = false;
		root.altKey = proxy.altKey = false;
	})();

	root.keyTracker = function(event) {
		var isKeyDown = event.type === 'keydown';
		if (event.keyCode === 27) {
			root.escKey = proxy.escKey = isKeyDown;
		}
		if (metaKeys[event.keyCode]) {
			root.metaKey = proxy.metaKey = isKeyDown;
		}
		root.ctrlKey = proxy.ctrlKey = event.ctrlKey;
		root.shiftKey = proxy.shiftKey = event.shiftKey;
		root.altKey = proxy.altKey = event.altKey;
	};

	root.getKeyID = function(event) {
		return keyIdentifier[event.keyCode] || '';
	};

	///
	var keyIdentifier = {
		8: 'Backspace',
		9: 'Tab',
		13: 'Enter',
		16: 'Shift',
		17: 'Ctrl',
		18: 'Alt',
		19: 'PauseBreak',
		20: 'CapsLock',
		27: 'Escape',
		33: 'PageUp',
		34: 'PageDown',
		35: 'End',
		36: 'Home',
		37: 'Left',
		38: 'Up',
		39: 'Right',
		40: 'Down',
		45: 'Insert',
		46: 'Delete',
		48: '0',
		49: '1',
		50: '2',
		51: '3',
		52: '4',
		53: '5',
		54: '6',
		55: '7',
		56: '8',
		57: '9',
		65: 'A',
		66: 'B',
		67: 'C',
		68: 'D',
		69: 'E',
		70: 'F',
		71: 'G',
		72: 'H',
		73: 'I',
		74: 'J',
		75: 'K',
		76: 'L',
		77: 'M',
		78: 'N',
		79: 'O',
		80: 'P',
		81: 'Q',
		82: 'R',
		83: 'S',
		84: 'T',
		85: 'U',
		86: 'V',
		87: 'W',
		88: 'X',
		89: 'Y',
		90: 'Z',
		91: 'LeftWindow',
		92: 'RightWindow',
		93: 'Select',
		96: 'Numpad0',
		97: 'Numpad1',
		98: 'Numpad2',
		99: 'Numpad3',
		100: 'Numpad4',
		101: 'Numpad5',
		102: 'Numpad6',
		103: 'Numpad7',
		104: 'Numpad8',
		105: 'Numpad9',
		106: 'Multiply',
		107: 'Add',
		109: 'Subtract',
		110: 'DecimalPoint',
		111: 'Divide',
		112: 'F1',
		113: 'F2',
		114: 'F3',
		115: 'F4',
		116: 'F5',
		117: 'F6',
		118: 'F7',
		119: 'F8',
		120: 'F9',
		121: 'F10',
		122: 'F11',
		123: 'F12',
		144: 'NumLock',
		145: 'ScrollLock',
		186: 'SemiColon',
		187: 'EqualSign',
		188: 'Comma',
		189: 'Dash',
		190: 'Period',
		191: 'ForwardSlash',
		192: 'GraveAccent',
		219: 'OpenBracket',
		220: 'Backslash',
		221: 'CloseBracket',
		222: 'SingleQuote'
	};
	
	var agent = navigator.userAgent.toLowerCase();
	var mac = agent.indexOf('macintosh') !== -1;
	var metaKeys;
	(function() {
		if (mac && agent.indexOf('khtml') !== -1) { /// chrome, safari
			metaKeys = {91: true, 93: true};
		} else if (mac && agent.indexOf('firefox') !== -1) { /// mac firefox
			metaKeys = {224: true};
		} else { /// windows, linux, or mac opera
			metaKeys = {17: true};
		}
		for (var key in metaKeys) {
			keyIdentifier[key] = 'Meta';
		}
	})();
})(eventjs);