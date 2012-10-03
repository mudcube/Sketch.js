/*
	Toying with the idea of compression, this file is not used, and is a work in progress.
*/

(function() {

var style = {
	tool: "brush",
	// compositing
	globalAlpha: 1,
	globalCompositeOperation: "source-over",
	// colors and styles
	strokeStyle: "#000000",
	fillStyle: "#000000",
	// shadows
	shadowOffsetX: 0,
	shadowOffsetY: 0,
	shadowBlur: 0,
	shadowColor: "rgba(0,0,0,0)",
	// line caps/joins
	lineWidth: 1, 
	lineCap: "butt",
	lineJoin: "miter",
	miterLimit: 10,		
	// text
	font: "10px sans-serif",
	textAlign: "start",
	textBaseline: "alphabetic"
};

var styleOptions = {
	tool: { "brush": 0, "eraser": 1, "text": 2 },
	globalCompositeOperation: { "source-over": 0, "source-in": 1, "source-out": 2, "source-atop": 3, "destination-over": 4, "destination-in": 5, "destination-out": 6, "destination-atop": 7, "lighter": 8, "darker": 9, "copy": 10, "xor": 11 },
	lineCap: { "butt": 0, "round": 1, "square": 2 },
	lineJoin: { "round": 0, "bevel": 1, "miter": 2 },
	textAlign: { "start": 0, "end": 1, "left": 2, "right": 3, "center": 4 },
	textBaseline: { "top": 0, "hanging": 1, "middle": 2, "alphabetic": 3, "ideographic": 4, "bottom": 5 }
};

var styleShorthand = {};
(function() { // create mapping to shorthand code.
	for (var i in styleOptions) {
		var key = i.split(/(?=[A-Z])/);
		for (var n = 0; n < key.length; n ++) key[n] = key[n][0].toLowerCase();
		styleShorthand[key.join()] = i;
	}
})();

sketch.encode = function() {
	for (var p in sketch.path) {
		//// Compress the path to SVG (+timeLapse).
	
		//// Compress the style.
		for (var i in sketch.style) {
			// this makes "fillStyle" === "fs", and "textAlign" === "ta"
			var key = styleShorthand[i];
			/// this makes "start" === 0, and "hanging" === 1
			var value = sketch.style[i];
			if (styleOptions[i]) value = styleOptions[i][value];
		}
	}
};

sketch.decode = function() {

};

})();