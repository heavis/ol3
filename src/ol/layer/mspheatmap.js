goog.provide('ol.layer.MspHeatmap');

goog.require('ol.events');
goog.require('ol');
goog.require('ol.Object');
goog.require('ol.dom');
goog.require('ol.layer.Vector');
goog.require('ol.math');
goog.require('ol.obj');
goog.require('ol.render.Event');
goog.require('ol.style.Icon');
goog.require('ol.style.Style');


/**
 * @classdesc
 * Layer for rendering vector data as a MspHeatmap.
 * Note that any property set in the options is set as a {@link ol.Object}
 * property on the layer object; for example, setting `title: 'My Title'` in the
 * options means that `title` is observable, and has get/set accessors.
 *
 * @constructor
 * @extends {ol.layer.Vector}
 * @fires ol.render.Event
 * @param {olx.layer.HeatmapOptions=} opt_options Options.
 * @api
 */
ol.layer.MspHeatmap = function(opt_options) {
  var options = opt_options ? opt_options : {};

  var baseOptions = ol.obj.assign({}, options);

  delete baseOptions.gradient;
  delete baseOptions.radius;
  delete baseOptions.blur;
  delete baseOptions.shadow;
  delete baseOptions.weight;
  ol.layer.Vector.call(this, /** @type {olx.layer.VectorOptions} */ (baseOptions));

  /**
   * @private
   * @type {Uint8ClampedArray}
   */
  this.gradient_ = null;

  /**
   * @private
   * @type {number}
   */
  this.shadow_ = options.shadow !== undefined ? options.shadow : 250;

  /**
   * @private
   * @type {string|undefined}
   */
  this.circleImage_ = undefined;

  /**
   * @private
   * @type {Array.<Array.<ol.style.Style>>}
   */
  this.styleCache_ = null;

  ol.events.listen(this,
    ol.Object.getChangeEventType(ol.layer.MspHeatmap.Property.GRADIENT),
    this.handleGradientChanged_, this);

  console.assert(options.gradient !== undefined,
    'gradient should be defined');

  this.min_ = Number.NEGATIVE_INFINITY;
  this.max_ = Number.POSITIVE_INFINITY;

  console.assert(options.dataType !== undefined,
    'dataType should be defined');
  this.setDataType(options.dataType);

  this.setGradient(options.gradient ?
    options.gradient : ol.layer.MspHeatmap.DEFAULT_GRADIENT);

  this.setBlur(options.blur !== undefined ? options.blur : 15);

  this.setRadius(options.radius !== undefined ? options.radius : 8);

  ol.events.listen(this,
    ol.Object.getChangeEventType(ol.layer.MspHeatmap.Property.BLUR),
    this.handleStyleChanged_, this);
  ol.events.listen(this,
    ol.Object.getChangeEventType(ol.layer.MspHeatmap.Property.RADIUS),
    this.handleStyleChanged_, this);

  this.handleStyleChanged_();

  var weight = options.weight ? options.weight : 'weight';
  var weightFunction;
  if (typeof weight === 'string') {
    weightFunction = function(feature) {
      return feature.get(weight);
    };
  } else {
    weightFunction = weight;
  }
  ol.DEBUG && console.assert(typeof weightFunction === 'function',
    'weightFunction should be a function');
  this.setStyle(function(feature, resolution) {
    ol.DEBUG && console.assert(this.styleCache_, 'this.styleCache_ expected');
    ol.DEBUG && console.assert(this.circleImage_ !== undefined,
      'this.circleImage_ should be defined');
    var self = this;
    //function getIndex(weight){
    //  if(weight === undefined) return 255;
    //  if(self.get(ol.layer.MspHeatmap.Property.DATATYPE) === ol.layer.MspHeatmap.dataTypes.PERCENT){
    //    return (255 * ol.math.clamp(weight, 0, 1)) | 0;
    //  }
    //  return (weight - self.min_)/ ((self.max_ - self.min_ ) / 256);
    //}

    function getOpacity(weight){
      if(weight === undefined) return 1;
      if(self.get(ol.layer.MspHeatmap.Property.DATATYPE) === ol.layer.MspHeatmap.dataTypes.PERCENT){
        return ol.math.clamp(weight, 0, 1);
      }
      return (weight - self.min_)/ (self.max_ - self.min_ );
    }

    var weight = weightFunction(feature);
//var opacity = weight !== undefined ? ol.math.clamp(weight, 0, 1) : 1;
// cast to 8 bits
    //var index = getIndex(weight), opacity = index / 255;
    var opacity = getOpacity(weight), index = (255 * opacity) | 0;
    var style = this.styleCache_[index];
    if (!style) {
      style = [
        new ol.style.Style({
          image: new ol.style.Icon({
            opacity: opacity,
            src: this.circleImage_
          })
        })
      ];
      this.styleCache_[index] = style;
    }
    return style;
  }.bind(this));

// For performance reasons, don't sort the features before rendering.
// The render order is not relevant for a MspHeatmap representation.
  this.setRenderOrder(null);

  ol.events.listen(this, ol.render.Event.Type.RENDER, this.handleRender_, this);

};
ol.inherits(ol.layer.MspHeatmap, ol.layer.Vector);


/**
 * @const
 * @type {Array.<string>}
 */
ol.layer.MspHeatmap.DEFAULT_GRADIENT = ['#00f', '#0ff', '#0f0', '#ff0', '#f00'];


/**
 * @param {Array.<string>} colors A list of colored.
 * @return {Uint8ClampedArray} An array.
 * @private
 */
ol.layer.MspHeatmap.prototype.createGradient_ = function(colors) {
  var width = 1;
  var height = 256;
  var context = ol.dom.createCanvasContext2D(width, height);

  var gradient = context.createLinearGradient(0, 0, width, height);
//步长step
//增加代码
  var min = Number.POSITIVE_INFINITY, max = Number.NEGATIVE_INFINITY, colorArr = [];
  for(var i = 0; i < colors.length; i++){
    var item = colors[i], values = item.range.split("-");
    var colorItem = {min: parseInt(values[0]), max: parseInt(values[1]), color: item.color};
    min = Math.min(min, colorItem.min);
    max = Math.max(max, colorItem.max);
    colorArr.push(colorItem);
  }
  this.max_ = max;
  this.min_ = min;

  var rang = max - min, stepLen = rang/height;/* 每一步的实际长度(len/step) */

  function getColor(value){
    var actualValue = min + value * stepLen;
    var color = undefined;
    for(var i = 0; i < colorArr.length; i++){
      var item = colorArr[i];
      if(actualValue >= item.min && actualValue <= item.max){
        color = item.color;
        break;
      }
    }

    return color || "#FFF";
  }

  var step = 1 / (height - 1);
  for (var i = 0, ii = height; i < ii; ++i) {
    gradient.addColorStop(i * step, getColor(i));
  }

  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  return context.getImageData(0, 0, width, height).data;
};
/**
 * @return {string} Data URL for a circle.
 * 一个从中心渐变的圆
 * @private
 */
ol.layer.MspHeatmap.prototype.createCircle_ = function() {
  var radius = this.getRadius();
  var blur = this.getBlur();
  ol.DEBUG && console.assert(radius !== undefined && blur !== undefined,
    'radius and blur should be defined');
  var halfSize = radius + blur + 1;
  var size = 2 * halfSize;
  var context = ol.dom.createCanvasContext2D(size, size);
  context.shadowOffsetX = context.shadowOffsetY = this.shadow_;
  context.shadowBlur = blur;
  context.shadowColor = '#000';
  context.beginPath();
  var center = halfSize - this.shadow_;
  context.arc(center, center, radius, 0, Math.PI * 2, true);
  context.fill();
  return context.canvas.toDataURL();
};


/**
 * Return the blur size in pixels.
 * @return {number} Blur size in pixels.
 * @api
 * @observable
 */
ol.layer.MspHeatmap.prototype.getBlur = function() {
  return /** @type {number} */ (this.get(ol.layer.MspHeatmap.Property.BLUR));
};


/**
 * Return the gradient colors as array of strings.
 * @return {Array.<string>} Colors.
 * @api
 * @observable
 */
ol.layer.MspHeatmap.prototype.getGradient = function() {
  return /** @type {Array.<string>} */ (
    this.get(ol.layer.MspHeatmap.Property.GRADIENT));
};


/**
 * Return the size of the radius in pixels.
 * @return {number} Radius size in pixel.
 * @api
 * @observable
 */
ol.layer.MspHeatmap.prototype.getRadius = function() {
  return /** @type {number} */ (this.get(ol.layer.MspHeatmap.Property.RADIUS));
};


/**
 * @private
 */
ol.layer.MspHeatmap.prototype.handleGradientChanged_ = function() {
  this.gradient_ = this.createGradient_(this.getGradient());
};


/**
 * @private
 */
ol.layer.MspHeatmap.prototype.handleStyleChanged_ = function() {
  this.circleImage_ = this.createCircle_();
  this.styleCache_ = new Array(256);
  this.changed();
};


/**
 * @param {ol.render.Event} event Post compose event
 * @private
 */
ol.layer.MspHeatmap.prototype.handleRender_ = function(event) {
  ol.DEBUG && console.assert(event.type == ol.render.Event.Type.RENDER,
    'event.type should be RENDER');
  ol.DEBUG && console.assert(this.gradient_, 'this.gradient_ expected');
  var context = event.context;
  var canvas = context.canvas;
  var image = context.getImageData(0, 0, canvas.width, canvas.height);
  var view8 = image.data;
  var i, ii, alpha;
  for (i = 0, ii = view8.length; i < ii; i += 4) {
    alpha = view8[i + 3] * 4;
    if (alpha) {
      view8[i] = this.gradient_[alpha];
      view8[i + 1] = this.gradient_[alpha + 1];
      view8[i + 2] = this.gradient_[alpha + 2];
    }
  }
  context.putImageData(image, 0, 0);
};
/**
 * Set the blur size in pixels.
 * @param {number} blur Blur size in pixels.
 * @api
 * @observable
 */
ol.layer.MspHeatmap.prototype.setBlur = function(blur) {
  this.set(ol.layer.MspHeatmap.Property.BLUR, blur);
};


/**
 * Set the gradient colors as array of strings.
 * @param {Array.<string>} colors Gradient.
 * @api
 * @observable
 */
ol.layer.MspHeatmap.prototype.setGradient = function(colors) {
  this.set(ol.layer.MspHeatmap.Property.GRADIENT, colors);
};


/**
 * Set the size of the radius in pixels.
 * @param {number} radius Radius size in pixel.
 * @api
 * @observable
 */
ol.layer.MspHeatmap.prototype.setRadius = function(radius) {
  this.set(ol.layer.MspHeatmap.Property.RADIUS, radius);
};

ol.layer.MspHeatmap.prototype.setDataType = function(type) {
  this.set(ol.layer.MspHeatmap.Property.DATATYPE, type);
};


/**
 * @enum {string}
 */
ol.layer.MspHeatmap.Property = {
  BLUR: 'blur',
  GRADIENT: 'gradient',
  RADIUS: 'radius',
  DATATYPE: 'dataType'
};

ol.layer.MspHeatmap.dataTypes = {
  PERCENT: "percent",
  VALUE: "value"
}
