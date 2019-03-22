// import L from 'leaflet';

// @if KARTOGRAPHER=true
module.MapSelect =
// @endif
// @if KARTOGRAPHER=false
// module.exports.MapSelect =
// @endif
L.Control.extend({
  options: {
    position: 'bottomleft',

    buttonText: 'RuneScape Surface', // The text set on the 'options' button.
    buttonTitle: 'Select Map', // The title set on the 'options' button.
  },

  initialize: function(options){
    if(!options){
      options = {};
    }
    this._baseMaps = {};
    this._overlayMaps = {};
    this._visibleOverlayMaps = [];
    this._mapID = 0;
    this._plane = 0;
    this._location = null;
    this._zoom = 2;
    this._selectedPlane = 0;
    this._selectedZoom = 0;
    this._selectedMapID = 0;
    if('visible' in options){
      this._visible = options.visible;
    }else{
      this._visible = true;
    }
    if('baseMaps' in options){
      this._loadMapID(this._mapID, this._plane);
    }
    this._map = null;
  },

  setBaseMaps: function(baseMaps){
    // Remove loaded baseMaps
    if(this._selectedMapID !== null && this._selectedMapID in this._baseMaps){
      this._map.removeLayer(this._baseMaps[this._selectedMapID].layerBuilder.layer);
    }

    this._baseMaps = baseMaps;
    // Force reloading of maps
    this._selectedMapID = null;
    this._resetSelect();

    this._loadMapID(this._mapID, this._plane);
    this._changeSelectedOption(this._mapID);
  },

  _changeSelectedOption: function(mapID){
    if(!this._visible){
      return;
    }
    var options = this._optionsSelect.options;
    var option;
    for (var i = 0; i < options.length; i++) {
      option = options[i];
      if (option.value === mapID.toString()) {
        options.selectedIndex = i;
        break;
      }
    }
  },

  setOverlayMaps: function(overlayMaps){
    this._overlayMaps = overlayMaps;
    this._loadMapID(this._mapID, this._plane);
  },

  setView: function(mapID, plane, loc, zoom){
    this._mapID = mapID;
    this._plane = plane;
    this._location = [ loc.lat, loc.lng ];
    this._zoom = zoom;
  },

  onAdd: function(map) {
    let containerName = 'leaflet-control-mapSelect',
      container = L.DomUtil.create('div', containerName + ' leaflet-bar');
    this._map = map;

    // build innerHTML
    var innerHTML = '';
    for(var i in this._baseMaps){
      var layerInfo = this._baseMaps[i];
      innerHTML += '<option value="'+layerInfo.mapId+'">'+layerInfo.name+'</option>';
    }

    if(this._visible){
      this._optionsSelect = this._createSelect(this, innerHTML, this.options.buttonTitle,
        containerName + '-select', container, this._mapChange.bind(this));
    }
    this._map.on('planechange', this._planeChange, this);
    this._map.on('zoomend', this._zoomChange, this);

    return container;
  },

  _resetSelect: function(){
    // build innerHTML
    var innerHTML = '';
    for(var i in this._baseMaps){
      var layerInfo = this._baseMaps[i];
      innerHTML += '<option value="'+layerInfo.mapId+'">'+layerInfo.name+'</option>';
    }
    if(this._visible){
      this._optionsSelect.innerHTML = innerHTML;
    }
  },

  _loadMapID: function(mapId, plane){
    if(!(mapId in this._baseMaps)){
      console.error('Selected MapID does not exists: ', mapId);
      return;
    }

    this._loadBaseMaps(mapId);
    this._loadOverlays();

    var loc = [ this._baseMaps[mapId].center[1],
      this._baseMaps[mapId].center[0] ];

    // Quick set
    if(this._location){
      this._map.setView(this._location, this._zoom);
    }else{
      this._map.setView(loc, this._baseMaps[mapId].defaultZoom);
    }
    // Move view smoothly
    // this._map.flyTo(loc, this.options.baseMaps[mapId].defaultZoom);
  },

  _loadPlane: function(plane){
    this._map._plane = Number(plane);
    this._selectedPlane = Number(plane);
    this._loadOverlays();
  },

  _loadZoom: function(zoom){
    this._selectedZoom = Number(zoom);
    this._loadOverlays();
  },

  _loadBaseMaps: function(mapId){
    // Check if mapID exists
    if(!(mapId in this._baseMaps)){
      console.error('Selected MapID does not exists: ', mapId);
      return;
    }

    // Check if map changed
    if(this._selectedMapID === null){
      this._map.addLayer(this._baseMaps[mapId].layerBuilder.layer);
      this._map.setMaxBounds(this._translateBounds(this._baseMaps[mapId].bounds));
      this._selectedMapID = Number(mapId);
    }else if(this._selectedMapID !== mapId){
      console.log('map Changed to :', mapId);
      this._map.removeLayer(this._baseMaps[this._selectedMapID].layerBuilder.layer);
      this._map.addLayer(this._baseMaps[mapId].layerBuilder.layer);
      this._map.setMaxBounds(this._translateBounds(this._baseMaps[mapId].bounds));
      this._selectedMapID = Number(mapId);
      // reset location so map moves to new positions.
      this._location = null;
    }
    this._map._mapID = this._selectedMapID;
  },

  _translateBounds: function(bounds){
    var newbounds = [ [ 0, 0 ], [ 12000, 12000 ] ];
    if(Array.isArray(bounds) && bounds.length === 2){
      // South-West
      if(Array.isArray(bounds[0]) && bounds[0].length === 2){
        newbounds[0][0] = bounds[0][1];
        newbounds[0][1] = bounds[0][0];
      }
      // North-East
      if(Array.isArray(bounds[1]) && bounds[1].length === 2){
        newbounds[1][0] = bounds[1][1];
        newbounds[1][1] = bounds[1][0];
      }
    }
    return newbounds;
  },

  _loadOverlays: function(){
    // Clear previous overlayMaps
    for(let i in this._visibleOverlayMaps){
      this._map.removeLayer(this._visibleOverlayMaps[i]);
    }
    this._visibleOverlayMaps.length = 0;
    for(let i in this._overlayMaps){
      if(this._overlayMaps[i].displayOnLoad){
        // console.log('added Layer: ', this._overlayMaps[i]);
        // Load overlay async and non blocking
        this._addOverlayMap(this._overlayMaps[i]);
      }
    }
  },

  _addOverlayMap: async function(layerInfo){
    await layerInfo.layerBuilder.dataLoader;
    layerInfo.layerBuilder.dataLoader = null;

    layerInfo.layer = layerInfo.layerBuilder.createLayer(this._selectedMapID, this._selectedPlane, this._selectedZoom);
    this._visibleOverlayMaps.push(layerInfo.layer);
    this._map.addLayer(layerInfo.layer);
  },

  _mapChange: function(event){
    this._loadMapID(Number(event.target.value), this._selectedPlane);
    this._map.fire('mapIDChanged', {
      previous: this._selectedZoom,
      plane: Number(event.target.value),
    });
  },

  _planeChange: function(event){
    this._loadPlane(Number(event.plane));
  },

  _zoomChange: function(event){
    this._loadZoom(Number(event.target.getZoom()));
  },

  onRemove: function(map) {
    // Do nothing
  },
});
