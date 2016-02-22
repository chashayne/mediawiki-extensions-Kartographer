( function ( $, mw ) {

	// Load this script after lib/mapbox-lib.js

	var scale, urlFormat,
		mapServer = mw.config.get( 'wgKartographerMapServer' ),
		forceHttps = mapServer[ 4 ] === 's',
		config = L.mapbox.config;

	config.REQUIRE_ACCESS_TOKEN = false;
	config.FORCE_HTTPS = forceHttps;
	config.HTTP_URL = forceHttps ? false : mapServer;
	config.HTTPS_URL = !forceHttps ? false : mapServer;

	function bracketDevicePixelRatio() {
		var i, scale,
			brackets = mw.config.get( 'wgKartographerSrcsetScales' ),
			baseRatio = window.devicePixelRatio || 1;
		if ( !brackets ) {
			return 1;
		}
		brackets.unshift( 1 );
		for ( i = 0; i < brackets.length; i++ ) {
			scale = brackets[ i ];
			if ( scale >= baseRatio || ( baseRatio - scale ) < 0.1 ) {
				return scale;
			}
		}
		return brackets[ brackets.length - 1 ];
	}

	function isPrivateGroup( groupName ) {
		return groupName[ 0 ] === '_';
	}

	scale = bracketDevicePixelRatio();
	scale = ( scale === 1 ) ? '' : ( '@' + scale + 'x' );
	urlFormat = '/{z}/{x}/{y}' + scale + '.png';

	mw.kartographer = {};

	/**
	 * Create a new interactive map
	 *
	 * @param {HTMLElement} container Map container
	 * @param {Object} data Map data
	 * @param {number} data.latitude Latitude
	 * @param {number} data.longitude Longitude
	 * @param {number} data.zoom Zoom
	 * @param {string} [data.style] Map style
	 * @param {string[]} [data.overlays] Names of overlay groups to show
	 * @return {L.mapbox.Map} Map object
	 */
	mw.kartographer.createMap = function ( container, data ) {
		var map,
			style = data.style || mw.config.get( 'wgKartographerDfltStyle' ),
			mapData = mw.config.get( 'wgKartographerLiveData' ) || {};

		map = L.map( container );
		if ( !container.clientWidth ) {
			// HACK: If the container is not naturally measurable, try jQuery
			// which will pick up CSS dimensions. T125263
			/*jscs:disable disallowDanglingUnderscores */
			map._size = new L.Point(
				$( container ).width(),
				$( container ).height()
			);
			/*jscs:enable disallowDanglingUnderscores */
		}
		map.setView( [ data.latitude, data.longitude ], data.zoom );
		map.attributionControl.setPrefix( '' );
		L.tileLayer( mapServer + '/' + style + urlFormat, {
			maxZoom: 18,
			attribution: mw.message( 'kartographer-attribution' ).parse()
		} ).addTo( map );

		if ( data.overlays ) {
			$.each( data.overlays, function ( index, group ) {
				if ( group === '*' ) {
					$.each( mapData, function ( k, d ) {
						if ( !isPrivateGroup( k ) ) {
							mw.kartographer.addDataLayer( map, d );
						}
					} );
				} else if ( mapData.hasOwnProperty( group ) ) {
					if ( index + 1 === data.overlays.length ) {
						map.kartographerLayer =
							mw.kartographer.addDataLayer( map, mapData[ group ] );
					} else {
						mw.kartographer.addDataLayer( map, mapData[ group ] );
					}
				}
			} );
		}

		return map;
	};

	/**
	 * Create a new GeoJSON layer and add it to map.
	 *
	 * @param {L.mapbox.Map} map Map to get layers from
	 * @param {Object} geoJson
	 */
	mw.kartographer.addDataLayer = function ( map, geoJson ) {
		try {
			return L.mapbox.featureLayer( geoJson ).addTo( map );
		} catch ( e ) {
			mw.log( e );
		}
	};

	/**
	 * Get "editable" geojson layer for the map.
	 *
	 * If a layer doesn't exist, create and attach one.
	 *
	 * @param {L.mapbox.Map} map Map to get layers from
	 * @param {L.mapbox.FeatureLayer} map.kartographerLayer show tag-specific info in this layer
	 * @return {L.mapbox.FeatureLayer|null} GeoJSON layer, if present
	 */
	mw.kartographer.getKartographerLayer = function ( map ) {
		if ( !map.kartographerLayer ) {
			map.kartographerLayer = L.mapbox.featureLayer().addTo( map );
		}
		return map.kartographerLayer;
	};

	/**
	 * Update "editable" geojson layer from a string
	 *
	 * @param {L.mapbox.Map} map Map to set the GeoJSON for
	 * @param {string} geoJsonString GeoJSON data, empty string to clear
	 * @return {boolean} The GeoJSON string provided was valid as was applied
	 */
	mw.kartographer.updateKartographerLayer = function ( map, geoJsonString ) {
		var geoJson, layer, isValid = true;

		if ( geoJsonString ) {
			try {
				geoJson = JSON.parse( geoJsonString );
			} catch ( e ) {
				// Invalid JSON, clear it
				isValid = false;
			}
		}

		try {
			layer = mw.kartographer.getKartographerLayer( map );
			layer.setGeoJSON( !isValid || geoJson === undefined ? [] : geoJson );
			return isValid;
		} catch ( e ) {
			return false;
		}
	};

	mw.hook( 'wikipage.content' ).add( function ( $content ) {
		$content.find( '.mw-kartographer-interactive' ).each( function () {
			var $this = $( this );

			// Prevent users from adding map divs directly via wikitext
			if ( $this.attr( 'mw-data' ) !== 'interface' ) {
				return;
			}

			mw.kartographer.createMap( this, {
				latitude: +$this.data( 'lat' ),
				longitude: +$this.data( 'lon' ),
				zoom: +$this.data( 'zoom' ),
				style: $this.data( 'style' ),
				overlays: $this.data( 'overlays' )
			} );
		} );
	} );
}( jQuery, mediaWiki ) );
