/*
	----------------------------------------------------
	Sketch.js : 0.2.0 : 2014-12-16 : MIT License
	----------------------------------------------------
	https://github.com/SketchIO/Sketch.js
*/

var Sketch = function(config) { 'use strict';
	var that = this;

	// Utility for cloning objects
	var clone = function(obj) {
		if (!obj || typeof obj !== 'object') {
			return obj;
		} else {
			var temp = new obj.constructor();
			for (var key in obj) {
				if (!obj[key] || typeof obj[key] !== 'object') {
					temp[key] = obj[key];
				} else { // clone sub-object
					temp[key] = clone(obj[key]);
				}
			}
			return temp;
		}
	};

	// Setting up <canvas> layers
	var layer = this.layer = {
		0: document.createElement('canvas'), // Background bitmap layer
		1: document.createElement('canvas'), // Overlay drawing layer
		2: document.createElement('canvas') // Active drawing layer
	};

	// Setting up <canvas> contexts
	var layer2d = this.layer2d = {
		0: this.layer[0].getContext('2d'), // Background ctx
		1: this.layer[1].getContext('2d'), // Overlay drawing ctx
		2: this.layer[2].getContext('2d') // Active drawing ctx
	};

	// Variables for fast access
	var innerWidth = window.innerWidth;
	var innerHeight = window.innerHeight;
	var layer0 = layer[0];
	var layer1 = layer[1];
	var layer2 = layer[2];
	var ctx0 = layer2d[0];
	var ctx1 = layer2d[1];
	var ctx2 = layer2d[2];

	// Style object
	this.zoom = 1.0;
	this.style = {
		tool: 'brush',
		globalAlpha: 0.5,
		globalCompositeOperation: 'source-over',
		strokeStyle: '#FF0000',
		lineWidth: 10,
		lineCap: 'round',
		lineJoin: 'round'
	};

	// Style caching object
	this.styleCache = undefined;
	this.rendering = false;
	this.path = [];
	this.speed = 200; // fast-forward through the paths
	this.maxTimeLapse = 500; // maximum time to wait between draw calls (type of fast-forward)

	///
	this.init = function(config) {
		config = config || this;
		this.zoom = config.zoom || 1.0;
		this.element = config.element || document.body;
		this.path = config.path || [];
		for (var key in layer) {
			this.element.appendChild(layer[key]);
		}
		///
		if (config.width && config.height) {
			this.resize(config.width, config.height);
		}
		///
		eventjs.add(this.element, 'mousedown', this.record);
		///
		return this;
	};

	//
	this.destroy = function() {
		this.path = [];
		if (this.element.hasChildNodes()) {
			while (this.element.childNodes.length >= 1) {
				this.element.removeChild(this.element.firstChild);
			}
		}
		///
		eventjs.remove(this.element, 'mousedown', this.record);
		return this;
	};

	// Resize the <canvas> elements
	this.resize = function(width, height) {
		innerWidth = width;
		innerHeight = height;

		// Adjust the size of the layers
		for (var key in layer) {
			layer[key].width = innerWidth;
			layer[key].height = innerHeight;
		}
		
		///
		this.element.style.width = width + 'px';
		this.element.style.height = height + 'px';
		
		// Redraw the content
		that.layerReset();
		that.redrawFast();
		return this;
	};

	// Record the vector commands from mouse movements
	this.record = function(event) {
		if (that.rendering) {
			return;
		}
		///
		var timer = new timeCapsule();
		var dstEraser = that.style.globalCompositeOperation === 'destination-out';
		var dstDirect = false; // Draw on the layer (true), or the active layer (false)
		var ctx = dstDirect ? ctx1 : ctx2;
		var currentPath = [];

		/// Capture mouse movements for drawing
		eventjs.proxy.drag({
			event: event,
			target: layer2,
			listener: function(event, self) {
				eventjs.cancel(event);
				///
				var coords = {};
				coords.x = self.x * 1.0 / that.zoom;
				coords.y = self.y * 1.0 / that.zoom;
				///
				if (self.pointerStart) {
					coords.beginPath = true;
					for (var key in that.style) {
						coords[key] = that.style[key];
						ctx[key] = that.style[key];
					}
				}

				// Record ms since last update
				coords.lapse = timer.getLapse();
				// Push coords to current path
				currentPath.push(coords);
				// Push coords to global path
				that.path.push(coords);
				// Reset the composite operation
				ctx.globalCompositeOperation = 'source-over';
				//
				if (!dstDirect) {
					// Clear the path being actively drawn
					ctx.clearRect(0, 0, innerWidth, innerHeight);
					// Setup for eraser mode
					if (dstEraser) {
						layer1.style.display = 'none';
						ctx.save();
						ctx.globalAlpha = 1.0;
						ctx.drawImage(layer1, 0, 0);
						ctx.restore();
						ctx.globalCompositeOperation = 'destination-out';
					}
				} else if (dstEraser) {
					ctx.globalCompositeOperation = 'destination-out';
				}
				// Draw the entire path
				ctx.save();
				ctx.scale(that.zoom, that.zoom);
				that.catmull({
					path: currentPath,
					ctx: ctx
				});
				ctx.restore();

				// Record active to layer, and cleanup
				if (self.pointerEnd && !dstDirect) {
					if (dstEraser) {
						layer1.style.display = 'block';
						ctx1.clearRect(0, 0, innerWidth, innerHeight);
					}
					ctx1.drawImage(layer2, 0, 0);
					ctx.clearRect(0, 0, innerWidth, innerHeight);
					///
					that.onRecordEnd && that.onRecordEnd();
				}
			}
		});
		return this;
	};

	// Redraw the vectors as quickly as possible
	this.redrawFast = function(ctx) {
		ctx = ctx || ctx1;

		// Setting the properties
		var nid = -1;
		var path = this.path;
		var length = path.length;
		var batches = [];
		///
		for (var n = 0; n < length; n ++) {
			var item = path[n];
			if (item.beginPath) nid ++;
			var batch = batches[nid] || (batches[nid] = []);
			batch.push(item);
		}

		// Drawing the batches
		ctx.save();
		ctx.scale(that.zoom, that.zoom);
		for (var n = 0; n < batches.length; n ++) {
			var batch = batches[n];
			this.setStyle(ctx, batch[0]);
			this.catmull({
				path: batch,
				ctx: ctx
			});
		}
		ctx.restore();
		//
		this.layerRestore();
		return this;
	};

	// Redraw the vectors animated as they were drawn
	this.redrawAnimate = function() {
		// Clearing layers
		this.layerReset();
		// Setting the properties
		var nid = 0;
		var path = this.path;
		var startId = 0;
		var dstOut;
		///
		var animate = function() {
			// Stoping rendering animation
			if (that.interval) {
				clearInterval(that.interval);
			}

			// Grab the current path
			var coord = path[nid ++];

			// Drawing is complete
			if (coord === undefined) {
				ctx1.drawImage(layer2, 0, 0);
				ctx2.clearRect(0, 0, innerWidth, innerHeight);
				that.layerRestore();
				return;
			}

			// Record to the background layer
			if (coord.beginPath) {
				that.setStyle(ctx2, coord);
				dstOut = ctx2.globalCompositeOperation === 'destination-out';
				startId = nid - 1;
			}

			// Loop through current section
			var currentPath = [];
			for (var n = startId; n < nid; n ++) {
				currentPath.push(path[n]);
			}

			// Clear the path being actively drawn
			ctx2.globalCompositeOperation = 'source-over';
			ctx2.clearRect(0, 0, innerWidth, innerHeight);

			// Setup for eraser mode
			if (dstOut) {
				layer1.style.display = 'none';
				ctx2.save();
				ctx2.globalAlpha = 1;
				ctx2.drawImage(layer1, 0, 0);
				ctx2.restore();
				ctx2.globalCompositeOperation = 'destination-out';
			}
			// Draw the entire path
			ctx2.save();
			ctx2.scale(that.zoom, that.zoom);
			that.catmull({
				path: currentPath,
				ctx: ctx2
			});
			ctx2.restore();		

			// Record active to layer, and cleanup
			if (!path[nid] || path[nid].beginPath) {
				if (dstOut) {
					layer1.style.display = 'block';
					ctx1.clearRect(0, 0, innerWidth, innerHeight);
				}
				ctx1.drawImage(layer2, 0, 0);
				ctx2.clearRect(0, 0, innerWidth, innerHeight);
			}

			// Replay using timestamps
			var speed = coord.lapse * (1 / that.speed);
			var timeout = Math.min(that.maxTimeLapse, speed);
			that.interval = setInterval(animate, timeout);
		};

		// Start animation
		animate();
		return this;
	};

	// Catmull-Rom spline
	this.catmull = function(config) {
		var path = clone(config.path);
		var tension = 1 - (config.tension || 0);
		var ctx = config.ctx;
		var length = path.length - 3;
		path.splice(0, 0, path[0]);
		path.push(path[path.length - 1]);
		if (length > 0) {
			for (var n = 0; n < length; n ++) {
				var p1 = path[n];
				var p2 = path[n + 1];
				var p3 = path[n + 2];
				var p4 = path[n + 3];
				if (n == 0) {
					ctx.beginPath();
					ctx.moveTo(p2.x, p2.y);
				}
				ctx.bezierCurveTo(
					p2.x + (tension * p3.x - tension * p1.x) / 6, 
					p2.y + (tension * p3.y - tension * p1.y) / 6,
					p3.x + (tension * p2.x - tension * p4.x) / 6, 
					p3.y + (tension * p2.y - tension * p4.y) / 6, 
					p3.x, p3.y
				);
			}
			ctx.stroke();
		}
		return this;
	};

	// Clear the recording
	this.clearRecording = function() {
		this.path = [];
		this.layerReset();
		this.layerRestore();
		return this;
	};

	// Undo the last command
	this.undo = function() {
		var length = this.path.length;
		for (var n = length - 1; n >= 0; n --) {
			var coord = this.path[n];
			if (coord.beginPath) {
				this.path.splice(n, length - n);
				this.layerReset();
				this.redrawFast();
				break;
			}
		}
		return this;
	};

	// Change the current tool
	this.setTool = function(tool) {
		if ((this.style.tool = tool) === 'eraser') {
			this.style.globalCompositeOperation = 'destination-out';
		} else {
			this.style.globalCompositeOperation = 'source-over';
		}
		return this;
	};

	// Change the current style of a layer
	this.setStyle = function(ctx, props) {
		for (var key in props) {
			if (ctx[key] !== undefined && that.style[key] !== undefined) {
				ctx[key] = props[key];
			}
		}
		return this;
	};
	
	// Reset and Restore the settings on the <canvas>
	this.layerReset = function() {
		if (this.interval) { // Style is cached
			clearInterval(this.interval);
		} else if (this.rendering === false) { // Cache the style
			this.styleCache = clone(this.style);
		}
		layer1.style.display = 'block';
		ctx1.clearRect(0, 0, innerWidth, innerHeight);
		ctx2.clearRect(0, 0, innerWidth, innerHeight);
		this.rendering = true;
		return this;
	};

	this.layerRestore = function() {
		this.rendering = false;
		if (this.styleCache !== undefined) {
			this.style = clone(this.styleCache);
			delete this.styleCache;
		}
		return this;
	};

	// Utility for keeping track of time
	var timeCapsule = function() {
		var time = 0;
		this.getLapse = function() {
			if (time === 0) time = (new Date()).getTime();
			var newTime = (new Date()).getTime();
			var delay = newTime - time;
			time = newTime;
			return delay;
		};
		return this;
	};

	// Auto-boot
	if (typeof config === 'object') {
		this.init(config);
	}
	
	return this;
};