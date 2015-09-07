(function() {

var proto = Sketch.prototype;

// Export to image/png
proto.toDataURL = function() {
	var canvas = document.createElement('canvas');
	var ctx = canvas.getContext('2d');
	canvas.width = innerWidth;
	canvas.height = innerHeight;
	ctx.drawImage(layer0, 0, 0);
	ctx.drawImage(layer1, 0, 0);
	ctx.drawImage(layer2, 0, 0);
	return canvas.toDataURL('image/png');
};

// Export to string
proto.toString = function() {
	return JSON.stringify(this.path);
};

// Export to svg data
proto.toSVGPathData = function(precision) {
	var path = this.toVOBPath();
	///
	if (isFinite(precision)) {
		this.roundPath(path, precision);
	}
	///	
	var res = '';
	for (var n = 0, data, pcmd; n < path.length; n ++) {
		switch ((data = path[n]).cmd) {
			case 'M': // MoveTo()
				if (pcmd !== 'M') res += 'M';
				res += data.x + ' ' + data.y + ' ';
				break;
			case 'L': // LineTo()
				if (pcmd !== 'L') res += 'L';
				res += data.x + ' ' + data.y + ' ';
				break;
			case 'C': // Bezier CurveTo()
				if (pcmd !== 'C') res += 'C';
				res += data.x1 + ' ' + data.y1 + ' ' + data.x2 + ' ' + data.y2 + ' ' + data.x + ' ' + data.y + ' ';
				break;
			case 'Q': // Quadratic CurveTo()
				if (pcmd !== 'Q') res += 'Q';
				res += data.x1 + ' ' + data.y1 + ' ' + data.x + ' ' + data.y + ' ';
				break;
			case 'Z': // ClosePath()
				res += 'Z';
				break;
		}
		pcmd = data.cmd;
	}
	return res.slice(0, -1);
};

// Export to svg path
proto.toSVGPath = function(precision) {
	var d = this.toSVGPathData(precision);
	var style = this.style;
	var stroke = style.strokeStyle || 'none';
	var strokeWidth = style.lineWidth;
	var strokeLinecap = style.lineCap;
	var fill = style.fillStyle || 'none';
	return '<path fill="' + fill + '" stroke="' + stroke + '" stroke-linecap="' + strokeLinecap + '" stroke-width="' + strokeWidth + '" d="' + d + '" />';
};

// proto.relativePath = function(path) {
// 	var bbox = {x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity};
// 	path.forEach(function(point) {
// 		if (point.x < bbox.x1) bbox.x1 = point.x;
// 		if (point.y < bbox.y1) bbox.y1 = point.y;
// 		if (point.x > bbox.x2) bbox.x2 = point.x;
// 		if (point.y > bbox.y2) bbox.y2 = point.y;
// 	});
// 	path.forEach(function(point) {
// 		
// 	});
// 	return path;
// };

// Round path data
proto.roundPath = function(path, precision) {
	var hundredth = Math.pow(10, precision);
	path.forEach(function(data) {
		for (var key in data) {
			var value = data[key];
			if (isFinite(value)) {
				data[key] = Math.round(value * hundredth) / hundredth;
			}
		}
	});
	return path;
};

// Export to vob
proto.toVOBPath = function() {
	var ctx = new this.fakeContext();
	this.redrawFast(ctx);
	return ctx.data;
};

// Fake context for exporting
proto.fakeContext = function() {
	var start;
	this.data = [];
	this.save = function() {};
	this.restore = function(){};
	this.translate = function() {};
	this.rotate = function() {};
	this.scale = function() {};
	this.stroke = function() {};
	this.fill = function() {};
	this.beginPath = function() {
		this.data = [];
	};
	this.moveTo = function(x, y) {
		this.data.push(start = {cmd: 'M', x: x, y: y});
	};
	this.lineTo = function(x, y) {
		this.data.push({cmd: 'L', x: x, y: y});
	};
	this.bezierCurveTo = function(x1, y1, x2, y2, x, y) {
		this.data.push({cmd: 'C', x1: x1, y1: y1, x2: x2, y2: y2, x: x, y: y});
	};
	this.quadraticCurveTo = function(x1, y1, x, y) {
		this.data.push({cmd: 'Q', x1: x1, y1: y1, x: x, y: y});
	};
	this.arcTo = function(x1, y1, x2, y2, radius) {
		this.data.push({cmd: 'A', x1: x1, y1: y1, x2: x2, y2: y2, radius: radius});
	};
	this.closePath = function() {
		this.data.push({cmd: 'Z', x: start.x, y: start.y});
	};
};

})();