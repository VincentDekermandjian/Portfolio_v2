
var MOSAIC_BASE_UNIT_PIXELS = 80; // counts as the ideal '1'
var MOSAIC_MAX_UNITS = 2; // (ie. 2x2 units)
var MOSAIC_BASE_UPLOAD_PATH = 'http://kitmoda.localhost/ktmaterial/uploads/';
var MOSAIC_DEFAULT_ROW_COUNT = 5;
var MOSAIC_ANIMATION_TIME = 700;
var MOSAIC_EASING_FUNCTION = 'easeInOutQuart';

(function($,sr){

  var debounce = function (func, threshold, execAsap) {
      var timeout;

      return function debounced () {
          var obj = this, args = arguments;
          function delayed () {
              if (!execAsap)
                  func.apply(obj, args);
              timeout = null;
          };

          if (timeout)
              clearTimeout(timeout);
          else if (execAsap)
              func.apply(obj, args);

          timeout = setTimeout(delayed, threshold || 50);
      };
  }
  // smartresize 
  jQuery.fn[sr] = function(fn){  return fn ? this.bind('resize', debounce(fn)) : this.trigger(sr); };

})(jQuery,'smartresize');


var Base = function() {};

Base.extend = function(_instance, _static) { // subclass
	var extend = Base.prototype.extend;
	
	// build the prototype
	Base._prototyping = true;
	var proto = new this;
	extend.call(proto, _instance);
  proto.base = function() {
    // call this method from any other method to invoke that method's ancestor
  };
	delete Base._prototyping;
	
	// create the wrapper for the constructor function
	//var constructor = proto.constructor.valueOf(); //-dean
	var constructor = proto.constructor;
	var klass = proto.constructor = function() {
		if (!Base._prototyping) {
			if (this._constructing || this.constructor == klass) { // instantiation
				this._constructing = true;
				constructor.apply(this, arguments);
				delete this._constructing;
			} else if (arguments[0] != null) { // casting
				return (arguments[0].extend || extend).call(arguments[0], proto);
			}
		}
	};
	
	// build the class interface
	klass.ancestor = this;
	klass.extend = this.extend;
	klass.forEach = this.forEach;
	klass.implement = this.implement;
	klass.prototype = proto;
	klass.toString = this.toString;
	klass.valueOf = function(type) {
		//return (type == "object") ? klass : constructor; //-dean
		return (type == "object") ? klass : constructor.valueOf();
	};
	extend.call(klass, _static);
	// class initialisation
	if (typeof klass.init == "function") klass.init();
	return klass;
};

Base.prototype = {	
	extend: function(source, value) {
		if (arguments.length > 1) { // extending with a name/value pair
			var ancestor = this[source];
			if (ancestor && (typeof value == "function") && // overriding a method?
				// the valueOf() comparison is to avoid circular references
				(!ancestor.valueOf || ancestor.valueOf() != value.valueOf()) &&
				/\bbase\b/.test(value)) {
				// get the underlying method
				var method = value.valueOf();
				// override
				value = function() {
					var previous = this.base || Base.prototype.base;
					this.base = ancestor;
					var returnValue = method.apply(this, arguments);
					this.base = previous;
					return returnValue;
				};
				// point to the underlying method
				value.valueOf = function(type) {
					return (type == "object") ? value : method;
				};
				value.toString = Base.toString;
			}
			this[source] = value;
		} else if (source) { // extending with an object literal
			var extend = Base.prototype.extend;
			// if this object has a customised extend method then use it
			if (!Base._prototyping && typeof this != "function") {
				extend = this.extend || extend;
			}
			var proto = {toSource: null};
			// do the "toString" and other methods manually
			var hidden = ["constructor", "toString", "valueOf"];
			// if we are prototyping then include the constructor
			var i = Base._prototyping ? 0 : 1;
			while (key = hidden[i++]) {
				if (source[key] != proto[key]) {
					extend.call(this, key, source[key]);

				}
			}
			// copy each of the source object's properties to this object
			for (var key in source) {
				if (!proto[key]) extend.call(this, key, source[key]);
			}
		}
		return this;
	}
};

// initialise
Base = Base.extend({
	constructor: function() {
		this.extend(arguments[0]);
	}
}, {
	ancestor: Object,
	version: "1.1",
	
	forEach: function(object, block, context) {
		for (var key in object) {
			if (this.prototype[key] === undefined) {
				block.call(context, object[key], key, object);
			}
		}
	},
		
	implement: function() {
		for (var i = 0; i < arguments.length; i++) {
			if (typeof arguments[i] == "function") {
				// if it's a function, call it
				arguments[i](this.prototype);
			} else {
				// add the interface using the extend method
				this.prototype.extend(arguments[i]);
			}
		}
		return this;
	},
	
	toString: function() {
		return String(this.valueOf());
	}
});

var Mosaic = Base.extend({

    constructor: function(container, images) {
    	var self = this;

 		if ( typeof container == 'undefined' || !container.length ) {
 			throw new Exception("Cannot create a mosaic without a container.");
 		}

 		this.images = images;
 		this.container = container;
 		this.imageContainer = container.find('ul');
    	self.totalRowUnits = this.calculateTotalRowUnits();

    	if (this.images) {
    		this.prepareImages(this.images);
    		// pass a clone as we'll be splicing it
    		this.makeGridFromImages(images.slice(0));
    		this.layoutGrid(this.grid);
    	}

    	$(window).smartresize(function() {
    		var newRowUnits = self.calculateTotalRowUnits();
    		if ( newRowUnits != self.totalRowUnits ) {
    			var prevRowUnits = self.totalRowUnits;
    			self.totalRowUnits = newRowUnits;
    			self.resizeGrid(prevRowUnits, newRowUnits);
    		}
    	});
    },

    prepareImages: function(images) {
		// TODO: Move this to the backend (should be done on image upload)
		// First go through all images and calculate their unit size
    	$.each(images, function(i, img) {
    		/* 
	    		How sizing/classification works:
				-Images that are favored to a 1x2 or 2x1 should be kept as is.
				-Images that end up as 1x1 or 2x2 should be set to 1x1 (for now).
			*/

    		// ensures range between min and max
    		var hUnits = Math.max( Math.min( Math.floor( img.height/MOSAIC_BASE_UNIT_PIXELS ), MOSAIC_MAX_UNITS ), 1);
    		var wUnits = Math.max( Math.min( Math.floor( img.width/MOSAIC_BASE_UNIT_PIXELS ), MOSAIC_MAX_UNITS ), 1);

    		if (hUnits == 2 && wUnits == 2) {
    			hUnits = 1; wUnits = 1;
    		}

    		img.hUnits = hUnits;
    		img.wUnits = wUnits;
    	});
    },

    // Returns a grid (array) with the images in their fitting x,y position.
    makeGridFromImages: function(images) {
    	var self = this;
    	console.log("MAKING GRID FROM IMAGES...", images.length, images);

    	//////////////////////////////////////////////////////////////////

    	self.grid = this.makeDefaultGrid(self.totalRowUnits); // makes aself.grid of rowLength x some default height
    	var x = 0, y = 0; // current unit positions in theself.grid
    	var breakAtMax = 100, curr = 0; // for dev, remove

    	function _gridHasRoom() {
    		console.log("grid has room?", x, y);
    		// iterates through remaining rows and columns to ensure all are filled
    		for ( var r=y; r < MOSAIC_DEFAULT_ROW_COUNT; r++) {
    			for ( var c=x; c < self.totalRowUnits; c++) {
    				console.log("room?", c, r, _gridPos(c, r), self.grid[ _gridPos(c, r) ], self.grid);
    				var val = self.grid[ _gridPos(c, r) ];
    				if ( val == null || val == undefined )
    					return true;
    			}
    		}
    		return false;
    	}

    	function _step(xSteps) {
    		x += xSteps ? xSteps : 1;
    		if (x >= self.totalRowUnits) {
				console.log("starting new row -------");
				x = 0; y++;
			}
    	}

    	function _gridPos(x, y) {
    		return y*self.totalRowUnits + x;		
    	}

    	function _getImageSizeClass(img) {
    		if (img.wUnits == 1 && img.hUnits == 1) return 'S';
    		if (img.wUnits == 1 && img.hUnits == 2) return 'T';
    		if (img.wUnits == 2 && img.hUnits == 1) return 'W';
    		return '-'; // shouldn't happen
    	}

    	function _imageFits( img, x, y ) {
    		if ( y+img.wUnits > MOSAIC_DEFAULT_ROW_COUNT ) {
    			return false;
    		}
    		
    		console.log("? image fits at", x, y, 'gridsize: ', self.totalRowUnits, MOSAIC_DEFAULT_ROW_COUNT);
    		//if (y == MOSAIC_DEFAULT_ROW_COUNTconsole.log("img too big for last row", y, img.wUnits, MOSAIC_DEFAULT_ROW_COUNT)


    		//console.log("image fits?", img.wUnits, img.hUnits)
 			// see ifself.grid has empty space where the image wants to go
			for ( var c=0; c < img.wUnits; c++) {
				//console.log("image fits at col?", x+c, y, 'gpos: ' + _gridPos(x+c,y), img.wUnits, 
					//( _gridPos(x+c, y) >= endOfRowIdx || self.grid[ _gridPos(x+c, y) ] != null ) );
				
				var endOfRowIdx = y*self.totalRowUnits + self.totalRowUnits;
				// if we're past end of row or cell is occupied
 				if ( _gridPos(x+c, y) >= endOfRowIdx || self.grid[ _gridPos(x+c, y) ] != null )
 					return false;

 				// check all rows under this column
				for ( var r=0; r < img.hUnits; r++) {
					//console.log("image fits at row?", x+c, y+r, self.grid[ _gridPos(x+c,y+r) ] == null );
					if ( y+r >= MOSAIC_DEFAULT_ROW_COUNT )
						return false;

 					if ( self.grid[ _gridPos(x+c, y+r) ] != null )
 						return false;
				}
 			}
 			return true;
    	}

    	function _addImageToGrid( img, x, y ) {
    		var gridPos = y*self.totalRowUnits + x;

			// set all columns and rows for this image
			for ( var c=0; c < img.wUnits; c++) {
				//console.log("set col", x+c, y, self.grid[ _gridPos(x+c,y) ] );
				if ( self.grid[ _gridPos(x+c,y) ] == null )
					self.grid[ _gridPos(x+c,y) ] = '-';
 
				for (var r=0; r < img.hUnits; r++) {
				//console.log("set row", x+c, y+r, self.grid[ _gridPos(x+c,y+r) ] );
 					if ( self.grid[ _gridPos(x+c, y+r) ] == null )
						self.grid[ _gridPos(x+c, y+r) ] = '-';
				}
 			}

 			// make first position the image instance
			self.grid[ gridPos ] = img; // _getImageSizeClass(img);
 			// todo: step self.gridCurrX ?
    	}

    	while ( _gridHasRoom() ) {
    		console.log("grid has room");
    		if (breakAtMax == curr) break; curr++;
    		var addedImage = false;

    		// if grid's current position is occupied, skip to next
    		if ( self.gridValAt(x, y) != null ) { _step(); continue; }

    		// goes through all images, trying to find the next one that will fit in the current position
    		for ( var i=0; i < images.length; i++ ) {
    			var img = images[i]; if (typeof img == 'undefined') return;
    			//console.log("checking fit", img.file, img.wUnits, img.hUnits, 'at', x, y);
	    		if ( _imageFits( img, x, y ) ) {
	    			console.log("FITS", img.file, 'at', x, y);
	    			_addImageToGrid( img, x, y ); addedImage = true;
    				_step( img.wUnits );

	    			images.splice(i, 1);
	    			break; // restart loop so we always get most recent images that will fit in the next available spot
	    		} 
	    	}
    		console.log("---end of images---", images.length);

	    	if ( ! addedImage ) {
	    		console.log( "Could not find image to fit!! at", x, y, images, 'grid has room?', _gridHasRoom() );
	    		break;
	    	}
    	}
    },

    makeDefaultGrid: function(rowLength, numRows) {
		var grid = [];
		var gridCells = rowLength * (numRows ? numRows : MOSAIC_DEFAULT_ROW_COUNT) - 1;
		grid[ gridCells ] = null;
		console.log("Made grid",gridCells,grid,grid[gridCells ] );
		return grid;
	},

    // Uses a minimum width for given mosaic elements, and what the ideal number would be in a row.
	calculateTotalRowUnits: function() {
		var ww = this.imageContainer.width();
		return  ww <= 400 ? 	3 :
				ww < 600 ? 	4 :
				ww < 800 ? 	5 :
				ww < 1000 ? 6 :
				ww < 1200 ? 7 :
							8;
	},

	gridValAt: function(x, y) {
		return this.grid[ y*this.totalRowUnits + x ];
	},

	// If previousGrid is supplied, we'll look for items that match and animate them into the new grid
	layoutGrid: function(grid, previousGrid) {
		var self = this;
		var unitSize = this.getUnitPercentSize();
		var mosaicHeight = (MOSAIC_DEFAULT_ROW_COUNT * unitSize);
		
		if (previousGrid) {
			// Mark all previous elements to signify they haven't been touched/moved.
			// They will be removed after if they haven't been touched.
			for (var i =0; i < previousGrid.length; i++) {
				var pi = previousGrid[i];
				if (typeof pi == 'object' && pi != null) {
					pi.dirty = false;
				}
			}
		}

		//self.imageContainer.children().remove();

		console.log("Layout grid", self.totalRowUnits, unitSize);

		// puts each item in absolute positions within the parent container
		// go through all rows / columns
		for ( var r=0; r < MOSAIC_DEFAULT_ROW_COUNT; r++) {
			for ( var c=0; c < self.totalRowUnits;) {
				var item = self.gridValAt(c, r);

				if (typeof item == 'object' && item != null) {
					self.calculateScreenPosition(item, c, r, unitSize);

					var previousItem = previousGrid ? self.findItemInGrid(previousGrid, item) : null;
					if ( previousItem ) {
						// animate the new item to a new position
						console.log("Found previous", item, previousItem);
						console.log("moving", 
							previousItem.screenX, previousItem.screenY,
							item.screenX, item.screenY);

						previousItem.dirty = true;

						// animate the top
						item.itemEl = previousItem.itemEl;
						item.itemEl.stop().animate({
							top: item.screenY + 'vw',
							left: item.screenX + 'vw',
							width: item.wUnits*unitSize + 'vw',
							height: item.hUnits*unitSize + 'vw'
						}, { "duration": MOSAIC_ANIMATION_TIME, "queue":false, easing: MOSAIC_EASING_FUNCTION });

						// previousItem.itemEl.css('top', item.screenY + 'vw');
						// previousItem.itemEl.css('left', item.screenX + 'vw');
						// previousItem.itemEl.css('width', item.wUnits*unitSize + 'vw');
					} else {
						//f ( ! previousGrid ) {
							// add the new item
							var itemEl = self.generateItemElement(item, unitSize);
							item.itemEl = itemEl;
							var topVal = item.itemEl.css('top');

							// Only animate if we're moving it onto an existing grid
							if (previousGrid) {
								item.itemEl.css('top', mosaicHeight + 'vw');
								this.imageContainer.append(itemEl);
								item.itemEl.stop().animate({
									top: item.screenY + 'vw'
								}, { "duration": MOSAIC_ANIMATION_TIME, "queue":false, easing: MOSAIC_EASING_FUNCTION });
							} else {
								this.imageContainer.append(itemEl);
							}
						//}
					}

					// See if item exists in other array already, and therefore remove it from 
					// put the object in the container
					// console.log("placed item at: ", c, r, 
					// 	'- rowmax:', self.totalRowUnits, 
					// 	'- itemsize:', item.wUnits, item.hUnits, 
					// 	'- coords:', item.screenY, item.screenX, item.file, itemEl[0]);
					c += item.wUnits;
				} else {
					console.log('skip (taken)', c, r, item);
					c++;
				}
			}
		}

		if (previousGrid) {
			// remove all previous image elements that don't fit
			for (var i =0; i < previousGrid.length; i++) {
				var pi = previousGrid[i];
				if (typeof pi == 'object' && pi != null) {
					if ( ! pi.dirty ) {
						console.log("removing previous", pi);
            pi.itemEl.animate({
              opacity: 0,
              top: mosaicHeight + 'vw'
            }, { "duration": MOSAIC_ANIMATION_TIME, 
                "queue":false, 
                "easing": MOSAIC_EASING_FUNCTION }, function() {
              pi.itemEl.remove();
            });
					}
				}
			}
		}

		// set the mosaic container to be the whole height
		self.imageContainer.css('height', mosaicHeight + 'vw');
	},

	calculateScreenPosition: function(item, c, r, unitSize) {
		item.screenX = c*unitSize;
		item.screenY = r*unitSize;
		//console.log("Calc screen pos", item.wUnits, item.hUnits, r, c, unitSize);
	},

	// Returns the width that each row element should be based on 100% screen width
	getUnitPercentSize: function() {
		return 100 / this.totalRowUnits;
	},

	// Creates an html element from the given image item
	generateItemElement: function(item, unitSize) {
		var el = $('<li id="item-' + item.id + '" style="'
			+ 'background-image: url(' + MOSAIC_BASE_UPLOAD_PATH + item.file + ');'
			+ 'top: ' + item.screenY + 'vw; left: ' + item.screenX + 'vw;'
			+ 'width: ' + item.wUnits*unitSize + 'vw; height: ' + item.hUnits*unitSize + 'vw;'
			+ '"></li>');
		return el;
	},

	// returns the index
	findItemInGrid: function(grid, item) {
		for (var i=0; i < grid.length; i++) {
			var si = grid[i];
			if (si.id == item.id && si.file == item.file) {
				console.log("MATCH", si);
				return si;
			}
		}
		return null;
	},

	// Called when the window is resized and the grid should be rebuilt
	resizeGrid: function(previousRowLength, newRowLength) {
		var previousGrid = this.grid;
		this.makeGridFromImages(this.images.slice(0));

		console.log("Rebuilt", previousGrid.length, this.grid.length, previousGrid, this.grid);

		this.layoutGrid(this.grid, previousGrid);

		// // foreach image in the new grid, find it in the previous grid, and reposition it
		// for (var i=0; i < this.grid.length; i++) {
		// 	var item = this.grid[i];
		// 	var itemPrevious = this.findItemInGrid(previousGrid, item);
		// 	console.log("Found previous item", itemPrevious);
		// }
	}

});
        

var data = [{"file":"edd\/2017\/04\/mtn_cropped-1-50x101.jpg","width":50,"height":101,"mime-type":"image\/jpeg","ratio":2.02,"id":1542},{"file":"edd\/2017\/04\/mtn_cropped-50x101.jpg","width":50,"height":101,"mime-type":"image\/jpeg","ratio":2.02,"id":1540},{"file":"edd\/2017\/04\/Screen-Shot-2017-01-24-at-16.48.14-300x169.png","width":300,"height":169,"mime-type":"image\/png","ratio":0.56333333333333,"id":1538},{"file":"edd\/2017\/04\/00D0D_43Ts5J1AeQp_600x450-261x196.jpg","width":261,"height":196,"mime-type":"image\/jpeg","ratio":0.75095785440613,"id":1536},{"file":"edd\/2017\/03\/bigstock-153400379-1-128x196.jpg","width":128,"height":196,"mime-type":"image\/jpeg","ratio":1.53125,"id":1521},{"file":"edd\/2017\/03\/bigstock-151978775-8-291x196.jpg","width":291,"height":196,"mime-type":"image\/jpeg","ratio":0.67353951890034,"id":1521},{"file":"edd\/2017\/03\/bigstock-150556103-10-294x196.jpg","width":294,"height":196,"mime-type":"image\/jpeg","ratio":0.66666666666667,"id":1521},{"file":"edd\/2017\/03\/bigstock-149868680-12-215x125.jpg","width":215,"height":125,"mime-type":"image\/jpeg","ratio":0.58139534883721,"id":1521},{"file":"edd\/2017\/03\/bigstock-Ruins-of-a-city-Apocalyptic-l-156775049-3-261x196.jpg","width":261,"height":196,"mime-type":"image\/jpeg","ratio":0.75095785440613,"id":1514},{"file":"edd\/2017\/03\/bigstock-Military-armored-tank-moving-a-98830124-3-261x196.jpg","width":261,"height":196,"mime-type":"image\/jpeg","ratio":0.75095785440613,"id":1514},{"file":"edd\/2017\/03\/bigstock-142228145-9-261x196.jpg","width":261,"height":196,"mime-type":"image\/jpeg","ratio":0.75095785440613,"id":1493},{"file":"edd\/2017\/03\/bigstock-147285014-7-282x196.jpg","width":282,"height":196,"mime-type":"image\/jpeg","ratio":0.69503546099291,"id":1448},{"file":"edd\/2017\/03\/abstract-painting-print-green-andrada-anghel-18-135x135.jpg","width":135,"height":135,"mime-type":"image\/jpeg","ratio":1,"id":1291},{"file":"edd\/2017\/02\/robot-135x135.jpg","width":135,"height":135,"mime-type":"image\/jpeg","ratio":1,"id":332},{"file":"edd\/2017\/01\/gold-3-300x160.jpg","width":300,"height":160,"mime-type":"image\/jpeg","ratio":0.53333333333333,"id":298},{"file":"edd\/2017\/01\/dsc_0004-3-291x196.jpg","width":291,"height":196,"mime-type":"image\/jpeg","ratio":0.67353951890034,"id":298},{"file":"edd\/2017\/01\/nature_wallpaper7-261x196.jpg","width":261,"height":196,"mime-type":"image\/jpeg","ratio":0.75095785440613,"id":295},{"file":"edd\/2017\/01\/nature-wallpaper_5-261x196.jpg","width":261,"height":196,"mime-type":"image\/jpeg","ratio":0.75095785440613,"id":295},{"file":"edd\/2017\/01\/Large_IMG_1036-300x171.jpg","width":300,"height":171,"mime-type":"image\/jpeg","ratio":0.57,"id":295},{"file":"edd\/2017\/01\/jj-3-294x196.jpg","width":294,"height":196,"mime-type":"image\/jpeg","ratio":0.66666666666667,"id":295},{"file":"edd\/2017\/01\/jj-2-294x196.jpg","width":294,"height":196,"mime-type":"image\/jpeg","ratio":0.66666666666667,"id":290},{"file":"edd\/2017\/01\/gold_bronze_brown-2-261x196.jpg","width":261,"height":196,"mime-type":"image\/jpeg","ratio":0.75095785440613,"id":290},{"file":"edd\/2017\/01\/gold-2-300x160.jpg","width":300,"height":160,"mime-type":"image\/jpeg","ratio":0.53333333333333,"id":290},{"file":"edd\/2017\/01\/dsc_0004-2-291x196.jpg","width":291,"height":196,"mime-type":"image\/jpeg","ratio":0.67353951890034,"id":290},{"file":"edd\/2017\/01\/39-512-135x135.png","width":135,"height":135,"mime-type":"image\/png","ratio":1,"id":222},{"file":"edd\/2017\/01\/8560906308_dd6af54531_o-147x196.jpg","width":147,"height":196,"mime-type":"image\/jpeg","ratio":1.3333333333333,"id":219},{"file":"edd\/2017\/01\/8551767165_e771104e70_o-261x196.jpg","width":261,"height":196,"mime-type":"image\/jpeg","ratio":0.75095785440613,"id":219},{"file":"edd\/2016\/12\/The-sun-peeking-through-the-trees-in-the-woods-of-the-Smoky-Mountains-300x169.jpg","width":300,"height":169,"mime-type":"image\/jpeg","ratio":0.56333333333333,"id":205},{"width":275,"height":183,"file":"edd\/2016\/12\/images-1.jpg","ratio":0.66545454545455,"id":201},{"width":300,"height":168,"file":"edd\/2016\/12\/index.jpg","ratio":0.56,"id":201},{"width":290,"height":174,"file":"edd\/2016\/12\/forest.jpg","ratio":0.6,"id":201},{"file":"edd\/2016\/12\/Forrest-293x196.jpg","width":293,"height":196,"mime-type":"image\/jpeg","ratio":0.66894197952218,"id":196},{"file":"edd\/2016\/12\/48-2-135x135.png","width":135,"height":135,"mime-type":"image\/png","ratio":1,"id":189},{"file":"edd\/2016\/12\/adjustable-wrench-512-135x135.png","width":135,"height":135,"mime-type":"image\/png","ratio":1,"id":189},{"file":"edd\/2016\/12\/contractor-135x135.png","width":135,"height":135,"mime-type":"image\/png","ratio":1,"id":189},{"width":275,"height":183,"file":"edd\/2016\/12\/images.jpg","ratio":0.66545454545455,"id":188},{"file":"edd\/2016\/11\/4495849521_b886296039-2-135x135.jpg","width":135,"height":135,"mime-type":"image\/jpeg","ratio":1,"id":167},{"file":"edd\/2016\/09\/adjustable-wrench-512-135x135.png","width":135,"height":135,"mime-type":"../src/Culture/the-sinner.jpg","ratio":1,"id":34}];

var mosaic = new Mosaic($('.mosaic-images'), data);

<script src="/path/to/masonry.pkgd.min.js"></script>