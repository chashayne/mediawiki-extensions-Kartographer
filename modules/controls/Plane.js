// import L from 'leaflet';

// @if KARTOGRAPHER=true
module.Plane =
// @endif
// @if KARTOGRAPHER=false
// module.exports.Plane =
// @endif
L.Control.extend({
  options: {
    position: 'bottomright',

    planeMin: 0,
    planeMax: 3,

    upicon: '<svg viewBox="0 0 64 64" height="24px" width="24px"><g style="display:inline" transform="translate(0,-233)"> <path d="m 27,238 -19,-0 7,7 -11,11 5,5 11,-11 7,7 z" style="fill:#000000;fill-opacity:1" /><path d="M 4,61 V 47 H 19 V 33 H 33 V 18 H 47 V 4 H 61 V 12 L 12,61 Z" style="display:inline;fill:#000000" transform="translate(0,233)"/></g></svg>',
    downicon: '<svg viewBox="0 0 64 64" height="24px" width="24px"><g style="display:inline" transform="translate(0,-233)"> <path d="m 4,261 19,0 -7,-7 11,-11 -5,-5 -11,11 -7,-7 z" style="fill:#000000;fill-opacity:1" /><path d="M 4,61 V 47 H 19 V 33 H 33 V 18 H 47 V 4 H 61 V 12 L 12,61 Z" style="display:inline;fill:#000000" transform="translate(0,233)"/></g></svg>',
  },

  initialize: function(options) {
    L.setOptions(this, options);
    this._map = null;
    this._plane = this.options.planeMin || 0;
    if('visible' in options){
      this._visible = options.visible;
    }else{
      this._visible = true;
    }
  },

  onAdd: function(map) {
    this._map = map;

    let containerName = 'leaflet-control-plane';
    let container = L.DomUtil.create('div', containerName + ' leaflet-bar');
    let className = 'leaflet-disabled';

    let listenerUp = () => this.setPlane(this._plane + 1);
    let listenerDown = () => this.setPlane(this._plane - 1);
    let listenerLabel = () => this.setPlane(this.options.planeMin || 0); // Reset plane

    if(this._visible){
      this._buttonUp = this._createButton(this, this.options.upicon, 'Move up', containerName + '-up ' + (this._plane + 1 > this.options.planeMax ? className : ''), container, listenerUp);
      this._buttonPlane = this._createButton(this, this._plane, 'Current plane', containerName + '-plane', container, listenerLabel);
      this._buttonDown = this._createButton(this, this.options.downicon, 'Move down', containerName + '-down ' + (this._plane - 1 < this.options.planeMin ? className : ''), container, listenerDown);
    }

    map.on('planechanging', this._planeChanging, this);

    return container;
  },

  onRemove: function(map) {
    map.off('planechanging', this._planeChanging, this);
  },

  _planeChanging: function(e) {
    let className = 'leaflet-disabled';
    this._plane = e.plane;

    if(this._visible){
      this._buttonPlane.textContent = e.plane;

      // Disable buttons
      L.DomUtil.removeClass(this._buttonUp, className);
      L.DomUtil.removeClass(this._buttonDown, className);

      if(this._plane - 1 < this.options.planeMin){
        L.DomUtil.addClass(this._buttonDown, className);
      }
      if(this._plane + 1 > this.options.planeMax){
        L.DomUtil.addClass(this._buttonUp, className);
      }
    }
  },

  setPlane: function(plane) {
    var old = this._plane;
    if(plane === old){
      // Plane didn't change
      return;
    }

    if(plane < this.options.planeMin || plane > this.options.planeMax){
      // New plane is not within bounds
      return;
    }

    this._map.fire('planechanging', {
      current: old,
      plane: Number(plane),
      userChanged: true,
    });
  },

  getPlane: function() {
    return this._plane;
  },
});
