/* globals module */
/**
 * # Kartographer Map class.
 *
 * Creates a map with layers, markers, and interactivity.
 *
 * @alias KartographerMap
 * @class Kartographer.Box.MapClass
 * @extends L.Map
 */
module.Map = ( function ( mw, OpenFullScreenControl, CloseFullScreenControl, dataLayerOpts, ScaleControl, document, undefined ) {

	var scale, urlFormat,
		mapServer = mw.config.get( 'wgKartographerMapServer' ),
		worldLatLng = new L.LatLngBounds( [ -90, -180 ], [ 90, 180 ] ),
		Map,
		isMobile = mw.config.get( 'skin' ) === 'minerva',
		precisionPerZoom = [ 0, 0, 1, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 5, 5 ];

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

	scale = bracketDevicePixelRatio();
	scale = ( scale === 1 ) ? '' : ( '@' + scale + 'x' );
	urlFormat = '/{z}/{x}/{y}' + scale + '.png';

	L.Map.mergeOptions( {
		sleepTime: 250,
		wakeTime: 1000,
		sleepNote: false,
		sleepOpacity: 1,
		// the default zoom applied when `longitude` and `latitude` were
		// specified, but zoom was not.å
		fallbackZoom: 13
	} );

	/**
	 * Gets the valid bounds of a map/layer.
	 *
	 * @param {L.Map|L.Layer} layer
	 * @return {L.LatLngBounds} Extended bounds
	 * @private
	 */
	function getValidBounds( layer ) {
		var layerBounds = new L.LatLngBounds();
		if ( typeof layer.eachLayer === 'function' ) {
			layer.eachLayer( function ( child ) {
				layerBounds.extend( getValidBounds( child ) );
			} );
		} else {
			layerBounds.extend( validateBounds( layer ) );
		}
		return layerBounds;
	}

	/*jscs:disable disallowDanglingUnderscores */
	/**
	 * Validate that the bounds contain no outlier.
	 *
	 * An outlier is a layer whom bounds do not fit into the world,
	 * i.e. `-180 <= longitude <= 180  &&  -90 <= latitude <= 90`
	 *
	 * There is a special case for **masks** (polygons that cover the entire
	 * globe with a hole to highlight a specific area). In this case the
	 * algorithm tries to validate the hole bounds.
	 *
	 * @param {L.Layer} layer Layer to get and validate the bounds.
	 * @return {L.LatLng|boolean} Bounds if valid.
	 * @private
	 */
	function validateBounds( layer ) {
		var bounds = ( typeof layer.getBounds === 'function' ) && layer.getBounds();

		bounds = bounds || ( typeof layer.getLatLng === 'function' ) && layer.getLatLng();

		if ( bounds && worldLatLng.contains( bounds ) ) {
			return bounds;
		} else if ( layer instanceof L.Polygon && layer._holes && layer._holes[ 0 ] ) {
			bounds = new L.LatLngBounds( layer._convertLatLngs( layer._holes[ 0 ] ) );
			if ( worldLatLng.contains( bounds ) ) {
				return bounds;
			}
		}
		return false;
	}
	/*jscs:enable disallowDanglingUnderscores */

	/**
	 * Returns the data for the list of groups.
	 *
	 * If the data is not already loaded (`wgKartographerLiveData`), an
	 * asynchronous request will be made to fetch the missing groups.
	 * The new data is then added to `wgKartographerLiveData`.
	 *
	 * @param {string[]} dataGroups Data group names.
	 * @return {jQuery.Promise} Promise which resolves with the group data,
	 *   an object keyed by group name
	 * @private
	 */
	function getMapGroupData( dataGroups ) {
		var deferred = $.Deferred(),
			groupsLoaded = mw.config.get( 'wgKartographerLiveData' ),
			groupsToLoad = [],
			promises = [];

		if ( !groupsLoaded ) {
			// Keep the reference to groupsLoaded, as it shouldn't change again
			groupsLoaded = {};
			mw.config.set( 'wgKartographerLiveData', groupsLoaded );
		}

		// For each requested layer, make sure it is loaded or is promised to be loaded
		$( dataGroups ).each( function ( key, value ) {
			var data = groupsLoaded[ value ];
			if ( data === undefined ) {
				groupsToLoad.push( value );
				// Once loaded, this value will be replaced with the received data
				groupsLoaded[ value ] = deferred.promise();
			} else if ( data !== null && $.isFunction( data.then ) ) {
				promises.push( data );
			}
		} );

		if ( groupsToLoad.length ) {
			promises.push( deferred.promise() );
		}
		if ( !promises.length ) {
			return deferred.resolve( groupsLoaded ).promise();
		}

		new mw.Api().get( {
			action: 'query',
			formatversion: '2',
			titles: mw.config.get( 'wgPageName' ),
			prop: 'mapdata',
			mpdgroups: groupsToLoad.join( '|' )
		} ).done( function ( data ) {
			var rawMapData = data.query.pages[ 0 ].mapdata,
				mapData = rawMapData && JSON.parse( rawMapData ) || {};
			$.extend( groupsLoaded, mapData );
			deferred.resolve( groupsLoaded );
		} );

		return $.when.apply( $, promises ).then( function () {
			// All pending promises are done
			return groupsLoaded;
		} ).promise();
	}

	/*jscs:disable disallowDanglingUnderscores */
	Map = L.Map.extend( {
		/**
		 * @constructor
		 * @param {Object} options **Configuration and options:**
		 * @param {HTMLElement} options.container **Map container.**
		 * @param {boolean} [options.allowFullScreen=false] **Whether the map
		 *   can be opened in a full screen dialog.**
		 * @param {string[]} [options.dataGroups] **List of known data groups,
		 *   fetchable from the server, to add as overlays onto the map.**
		 * @param {Object|Array} [options.data] **Inline GeoJSON features to
		 *   add to the map.**
		 * @param {Array|L.LatLng} [options.center] **Initial map center.**
		 * @param {number} [options.zoom] **Initial map zoom.**
		 * @param {string} [options.style] Map style. _Defaults to
		 *  `mw.config.get( 'wgKartographerDfltStyle' )`, or `'osm-intl'`._
		 * @param {Kartographer.Box.MapClass} [options.parentMap] Parent map
		 *   _(internal, used by the full screen map to refer its parent map)_.
		 * @param {boolean} [options.fullscreen=false] Whether the map is a map
		 *   opened in a full screen dialog _(internal, used to indicate it is
		 *   a full screen map)_.
		 * @param {string} [options.fullScreenRoute] Route associated to this map
		 *   _(internal, used by "`<maplink>`" and "`<mapframe>`")_.
		 * @member Kartographer.Box.MapClass
		 */
		initialize: function ( options ) {

			var args,
				style = options.style || mw.config.get( 'wgKartographerDfltStyle' ) || 'osm-intl';

			if ( options.center === 'auto' ) {
				options.center = undefined;
			}
			if ( options.zoom === 'auto' ) {
				options.zoom = undefined;
			}

			if ( isMobile && !options.fullscreen ) {
				options.container = this._responsiveContainerWrap( options.container );
			}

			$( options.container ).addClass( 'mw-kartographer-map' );

			args = L.extend( {}, L.Map.prototype.options, options, {
				// `center` and `zoom` are to undefined to avoid calling
				// setView now. setView is called later when the data is
				// loaded.
				center: undefined,
				zoom: undefined
			} );

			L.Map.prototype.initialize.call( this, options.container, args );

			/**
			 * @property {jQuery} $container Reference to the map
			 *   container.
			 * @protected
			 */
			this.$container = $( this._container );

			this.on( 'kartographerisready', function () {
				/*jscs:disable requireCamelCaseOrUpperCaseIdentifiers*/
				this._kartographer_ready = true;
				/*jscs:enable requireCamelCaseOrUpperCaseIdentifiers*/
			}, this );

			/**
			 * @property {Kartographer.Box.MapClass} [parentMap=null] Reference
			 *   to the parent map.
			 * @protected
			 */
			this.parentMap = options.parentMap || null;

			/**
			 * @property {Kartographer.Box.MapClass} [fullScreenMap=null] Reference
			 *   to the child full screen map.
			 * @protected
			 */
			this.fullScreenMap = null;

			/**
			 * @property {boolean} useRouter Whether the map uses the Mediawiki Router.
			 * @protected
			 */
			this.useRouter = !!options.fullScreenRoute;

			/**
			 * @property {string} [fullScreenRoute=null] Route associated to this map.
			 * @protected
			 */
			this.fullScreenRoute = options.fullScreenRoute || null;

			/**
			 * @property {Array} dataLayers References to the data layers.
			 * @protected
			 */
			this.dataLayers = [];

			/* Add base layer */

			/**
			 * @property {L.TileLayer} wikimediaLayer Reference to `Wikimedia`
			 *   tile layer.
			 * @protected
			 */
			this.wikimediaLayer = L.tileLayer( mapServer + '/' + style + urlFormat, {
				maxZoom: 18,
				attribution: mw.message( 'kartographer-attribution' ).parse()
			} ).addTo( this );

			/* Add map controls */

			/**
			 * @property {L.Control.Attribution} attributionControl Reference
			 *   to attribution control.
			 */
			this.attributionControl.setPrefix( '' );

			/**
			 * @property {Kartographer.Box.ScaleControl} scaleControl Reference
			 *   to scale control.
			 */
			this.scaleControl = new ScaleControl( { position: 'bottomright' } ).addTo( this );

			if ( options.allowFullScreen ) {
				// embed maps, and full screen is allowed
				this.on( 'dblclick', function () {
					this.openFullScreen();
				}, this );

				/**
				 * @property {Kartographer.Box.OpenFullScreenControl|undefined} [openFullScreenControl=undefined]
				 * Reference to open full screen control.
				 */
				this.openFullScreenControl = new OpenFullScreenControl( { position: 'topright' } ).addTo( this );
			} else if ( options.fullscreen ) {
				// full screen maps
				/**
				 * @property {Kartographer.Box.CloseFullScreenControl|undefined} [closeFullScreenControl=undefined]
				 * Reference to close full screen control.
				 */
				this.closeFullScreenControl = new CloseFullScreenControl( { position: 'topright' } ).addTo( this );
			}

			/* Initialize map */

			if ( !this._container.clientWidth || !this._container.clientHeight ) {
				this._fixMapSize();
			}
			this.doubleClickZoom.disable();

			if ( !this.options.fullscreen ) {
				this._invalidateInterative();
			}

			this.addDataGroups( options.dataGroups ).then( L.Util.bind( function () {
				if ( typeof options.data === 'object' ) {
					this.addDataLayer( options.data );
				}

				this.initView( options.center, options.zoom );
				this.fire(
					/**
					 * @event
					 * Fired when the Kartographer Map object is ready.
					 */
					'kartographerisready' );
			}, this ) );
		},

		/**
		 * Runs the given callback **when the Kartographer map has finished
		 * loading the data layers and positioning** the map with a center and
		 * zoom, **or immediately if it happened already**.
		 *
		 * @param {Function} callback
		 * @param {Object} [context]
		 * @chainable
		 */
		doWhenReady: function ( callback, context ) {
			/*jscs:disable requireCamelCaseOrUpperCaseIdentifiers*/
			if ( this._kartographer_ready ) {
				callback.call( context || this, this );
			} else {
				this.on( 'kartographerisready', callback, context );
			}
			/*jscs:enable requireCamelCaseOrUpperCaseIdentifiers*/
			return this;
		},

		/**
		 * Sets the initial center and zoom of the map, and optionally calls
		 * {@link #setView} to reposition the map.
		 *
		 * @param {L.LatLng|Array} [center]
		 * @param {number} [zoom]
		 * @param {boolean} [setView=false]
		 * @chainable
		 */
		initView: function ( center, zoom, setView ) {
			setView = setView === false ? false : true;

			if ( center ) {
				center = L.latLng( center );
			}
			this._initialPosition = {
				center: center,
				zoom: zoom
			};
			if ( setView ) {
				this.setView( center, zoom, null, true );
			}
			return this;
		},

		/**
		 * Gets and adds known data groups as layers onto the map.
		 *
		 * The data is loaded from the server if not found in memory.
		 *
		 * @param {string[]} dataGroups
		 * @return {jQuery.Promise}
		 */
		addDataGroups: function ( dataGroups ) {
			var map = this,
				deferred = $.Deferred();
			if ( !dataGroups ) {
				return deferred.resolveWith().promise();
			}
			getMapGroupData( dataGroups ).then( function ( mapData ) {
				$.each( dataGroups, function ( index, group ) {
					if ( !$.isEmptyObject( mapData[ group ] ) ) {
						map.addDataLayer( group, mapData[ group ] );
					} else {
						mw.log.warn( 'Layer not found or contains no data: "' + group + '"' );
					}
				} );
				deferred.resolveWith().promise();
			} );
			return deferred.promise();
		},

		/**
		 * Creates a new GeoJSON layer and adds it to the map.
		 *
		 * @param {string} groupName The layer name (id without special
		 *   characters or spaces).
		 * @param {Object} geoJson Features
		 */
		addDataLayer: function ( groupName, geoJson ) {
			var layer;
			try {
				layer = L.mapbox.featureLayer( geoJson, dataLayerOpts ).addTo( this );
				this.dataLayers[ groupName ] = layer;
				return layer;
			} catch ( e ) {
				mw.log( e );
			}
		},

		/**
		 * Opens the map in a full screen dialog.
		 *
		 * **Uses Resource Loader module: {@link Kartographer.Dialog ext.kartographer.dialog}**
		 *
		 * @param {Object} [position] Map `center` and `zoom`.
		 */
		openFullScreen: function ( position ) {

			this.doWhenReady( function () {

				var map = this.options.link ? this : this.fullScreenMap;
				position = position || this._initialPosition;

				if ( map && map._updatingHash ) {
					// Skip - there is nothing to do.
					map._updatingHash = false;
					return;

				} else if ( map ) {

					this.doWhenReady( function () {
						map.setView(
							position.center,
							position.zoom
						);
					} );
				} else {
					map = this.fullScreenMap = new Map( {
						container: L.DomUtil.create( 'div', 'mw-kartographer-mapDialog-map' ),
						center: position.center,
						zoom: position.zoom,
						fullscreen: true,
						dataGroups: this.options.dataGroups,
						fullScreenRoute: this.fullScreenRoute,
						parentMap: this
					} );
					// resets the right initial position silently afterwards.
					map.initView(
						this._initialPosition.center,
						this._initialPosition.zoom,
						false
					);
				}

				mw.loader.using( 'ext.kartographer.dialog' ).done( function () {
					map.doWhenReady( function () {
						mw.loader.require( 'ext.kartographer.dialog' ).render( map );
					} );
				} );
			}, this );
		},

		/**
		 * Closes full screen dialog.
		 *
		 * @chainable
		 */
		closeFullScreen: function () {
			mw.loader.require( 'ext.kartographer.dialog' ).close();
			return this;
		},

		/**
		 * Gets initial map center and zoom.
		 *
		 * @return {Object}
		 * @return {L.LatLng} return.center
		 * @return {number} return.zoom
		 */
		getInitialMapPosition: function () {
			return this._initialPosition;
		},

		/**
		 * Gets current map center and zoom.
		 *
		 * @return {Object}
		 * @return {L.LatLng} return.center
		 * @return {number} return.zoom
		 */
		getMapPosition: function () {
			var center = this.getCenter();
			return {
				center: center,
				zoom: this.getZoom()
			};
		},

		/**
		 * Formats the full screen route of the map, such as:
		 *   `/map/:maptagId(/:zoom/:longitude/:latitude)`
		 *
		 * The hash will contain the portion between parenthesis if and only if
		 * one of these 3 values differs from the initial setting.
		 *
		 * @return {string} The route to open the map in full screen mode.
		 */
		getHash: function () {
			/*jscs:disable requireVarDeclFirst*/
			if ( !this._initialPosition ) {
				return this.fullScreenRoute;
			}

			var hash = this.fullScreenRoute,
				currentPosition = this.getMapPosition(),
				initialPosition = this._initialPosition,
				newHash = currentPosition.zoom + '/' + this.getScaleLatLng(
						currentPosition.center.lat,
						currentPosition.center.lng,
						currentPosition.zoom
					).join( '/' ),
				initialHash = initialPosition.center && (
						initialPosition.zoom + '/' +
						this.getScaleLatLng(
							initialPosition.center.lat,
							initialPosition.center.lng,
							initialPosition.zoom
						).join( '/' )
					);

			if ( newHash !== initialHash ) {
				hash += '/' + newHash;
			}

			/*jscs:enable requireVarDeclFirst*/
			return hash;
		},

		/**
		 * Sets the map at a certain zoom and position.
		 *
		 * When the zoom and map center are provided, it falls back to the
		 * original `L.Map#setView`.
		 *
		 * If the zoom or map center are not provided, this method will
		 * calculate some values so that all the point of interests fit within the
		 * map.
		 *
		 * **Note:** Unlike the original `L.Map#setView`, it accepts an optional
		 * fourth parameter to decide whether to update the container's data
		 * attribute with the calculated values (for performance).
		 *
		 * @param {L.LatLng|Array|string} [center] Map center.
		 * @param {number} [zoom]
		 * @param {Object} [options] See [L.Map#setView](https://www.mapbox.com/mapbox.js/api/v2.3.0/l-map-class/)
		 *   documentation for the full list of options.
		 * @param {boolean} [save=false] Whether to update the data attributes.
		 * @chainable
		 */
		setView: function ( center, zoom, options, save ) {
			var maxBounds,
				initial = this.getInitialMapPosition();

			if ( center ) {
				center = L.latLng( center );
				zoom = isNaN( zoom ) ? this.options.fallbackZoom : zoom;
				L.Map.prototype.setView.call( this, center, zoom, options );
			} else {
				// Determines best center of the map
				maxBounds = getValidBounds( this );

				if ( maxBounds.isValid() ) {
					this.fitBounds( maxBounds );
				} else {
					this.fitWorld();
				}
				// (Re-)Applies expected zoom

				if ( initial && initial.zoom ) {
					this.setZoom( initial.zoom );
				}

				if ( save ) {
					// Updates map data.
					this.initView( this.getCenter(), this.getZoom(), false );
					// Updates container's data attributes to avoid `NaN` errors
					if ( !this.fullscreen ) {
						this.$container.closest( '.mw-kartographer-interactive' ).data( {
							zoom: this.getZoom(),
							longitude: this.getCenter().lng,
							latitude: this.getCenter().lat
						} );
					}
				}
			}
			return this;
		},

		/**
		 * Convenient method that formats the coordinates based on the zoom level.
		 *
		 * @param {number} lat
		 * @param {number} lng
		 * @param {number} [zoom]
		 * @return {Array} Array with the zoom (number), the latitude (string) and
		 *   the longitude (string).
		 */
		getScaleLatLng: function ( lat, lng, zoom ) {
			zoom = typeof zoom === 'undefined' ? this.getZoom() : zoom;

			return [
				lat.toFixed( precisionPerZoom[ zoom ] ),
				lng.toFixed( precisionPerZoom[ zoom ] )
			];
		},

		/**
		 * @localdoc Extended to also destroy the {@link #fullScreenMap} when
		 *   it exists.
		 *
		 * @override
		 * @chainable
		 */
		remove: function () {
			if ( this.fullScreenMap ) {
				L.Map.prototype.remove.call( this.fullScreenMap );
				this.fullScreenMap = null;
			}
			if ( this.parentMap ) {
				this.parentMap.fullScreenMap = null;
			}

			return L.Map.prototype.remove.call( this );
		},

		/**
		 * Fixes map size when the container is not visible yet, thus has no
		 * physical size.
		 *
		 * - In full screen, we take the viewport width and height.
		 * - Otherwise, the hack is to try jQuery which will pick up CSS
		 *   dimensions. (T125263)
		 * - Finally, if the calculated size is still [0,0], the script looks
		 *   for the first visible parent and takes its `height` and `width`
		 *   to initialize the map.
		 *
		 * @protected
		 */
		_fixMapSize: function () {
			var width, height, $visibleParent;

			if ( this.options.fullscreen ) {
				this._size = new L.Point(
					document.body.clientWidth,
					document.body.clientHeight
				);
				return;
			}

			$visibleParent = this.$container.closest( ':visible' );

			// Get `max` properties in case the container was wrapped
			// with {@link #responsiveContainerWrap}.
			width = $visibleParent.css( 'max-width' );
			height = $visibleParent.css( 'max-height' );
			width = ( !width || width === 'none' ) ? $visibleParent.width() : width;
			height = ( !height || height === 'none' ) ? $visibleParent.height() : height;

			while ( ( !height && $visibleParent.parent().length ) ) {
				$visibleParent = $visibleParent.parent();
				width = $visibleParent.outerWidth( true );
				height = $visibleParent.outerHeight( true );
			}

			this._size = new L.Point( width, height );
		},

		/**
		 * Adds Leaflet.Sleep handler and overrides `invalidateSize` when the map
		 * is not in full screen mode.
		 *
		 * The new `invalidateSize` method calls {@link #toggleStaticState} to
		 * determine the new state and make the map either static or interactive.
		 *
		 * @chainable
		 * @protected
		 */
		_invalidateInterative: function () {

			// add Leaflet.Sleep when the map isn't full screen.
			this.addHandler( 'sleep', L.Map.Sleep );

			// `invalidateSize` is triggered on window `resize` events.
			this.invalidateSize = function ( options ) {
				L.Map.prototype.invalidateSize.call( this, options );

				if ( this.options.fullscreen ) {
					// skip if the map is full screen
					return this;
				}
				// Local debounce because oojs is not yet available.
				if ( this._staticTimer ) {
					clearTimeout( this._staticTimer );
				}
				this._staticTimer = setTimeout( this.toggleStaticState, 200 );
				return this;
			};
			// Initialize static state.
			this.toggleStaticState = L.Util.bind( this.toggleStaticState, this );
			this.toggleStaticState();
			return this;
		},

		/**
		 * Makes the map interactive IIF :
		 *
		 * - the `device width > 480px`,
		 * - there is at least a 200px horizontal margin.
		 *
		 * Otherwise makes it static.
		 *
		 * @chainable
		 */
		toggleStaticState: function () {
			var deviceWidth = window.innerWidth,
				// All maps static if deviceWitdh < 480px
				isSmallWindow = deviceWidth <= 480,
				staticMap;

			// If the window is wide enough, make sure there is at least
			// a 200px margin to scroll, otherwise make the map static.
			staticMap = isSmallWindow || ( this.getSize().x + 200 ) > deviceWidth;

			// Skip if the map is already static
			if ( this._static === staticMap ) {
				return;
			}

			// Toggle static/interactive state of the map
			this._static = staticMap;

			if ( staticMap ) {
				this.sleep._sleepMap();
				this.sleep.disable();
				this.scrollWheelZoom.disable();
			} else {
				this.sleep.enable();
			}
			this.$container.toggleClass( 'mw-kartographer-static', staticMap );
			return this;
		},

		/**
		 * Wraps a map container to make it (and its map) responsive on
		 * mobile (MobileFrontend).
		 *
		 * The initial `mapContainer`:
		 *
		 *     <div class="mw-kartographer-interactive" style="height: Y; width: X;">
		 *         <!-- this is the component carrying Leaflet.Map -->
		 *     </div>
		 *
		 * Becomes :
		 *
		 *     <div class="mw-kartographer-interactive mw-kartographer-responsive" style="max-height: Y; max-width: X;">
		 *         <div class="mw-kartographer-responder" style="padding-bottom: (100*Y/X)%">
		 *             <div>
		 *                 <!-- this is the component carrying Leaflet.Map -->
		 *             </div>
		 *         </div>
		 *     </div>
		 *
		 * **Note:** the container that carries the map data remains the initial
		 * `mapContainer` passed in arguments. Its selector remains `.mw-kartographer-interactive`.
		 * However it is now a sub-child that carries the map.
		 *
		 * **Note 2:** the CSS applied to these elements vary whether the map width
		 * is absolute (px) or relative (%). The example above describes the absolute
		 * width case.
		 *
		 * @param {HTMLElement} mapContainer Initial component to carry the map.
		 * @return {HTMLElement} New map container to carry the map.
		 * @protected
		 */
		_responsiveContainerWrap: function ( mapContainer ) {
			var $container = $( mapContainer ),
				$responder, map,
				width = mapContainer.style.width,
				isRelativeWidth = width.slice( -1 ) === '%',
				height = +( mapContainer.style.height.slice( 0, -2 ) ),
				containerCss, responderCss;

			// Convert the value to a string.
			width = isRelativeWidth ? width : +( width.slice( 0, -2 ) );

			if ( isRelativeWidth ) {
				containerCss = {};
				responderCss = {
					// The inner container must occupy the full height
					height: height
				};
			} else {
				containerCss = {
					// Remove explicitly set dimensions
					width: '',
					height: '',
					// Prevent over-sizing
					'max-width': width,
					'max-height': height
				};
				responderCss = {
					// Use padding-bottom trick to maintain original aspect ratio
					'padding-bottom': ( 100 * height / width ) + '%'
				};
			}
			$container.addClass( 'mw-kartographer-responsive' ).css( containerCss );
			$responder = $( '<div>' ).addClass( 'mw-kartographer-responder' ).css( responderCss );

			map = document.createElement( 'div' );
			this.$outerContainer = $container.append( $responder.append( map ) );
			return map;
		}
	} );

	return Map;
} )(
	mediaWiki,
	module.OpenFullScreenControl,
	module.CloseFullScreenControl,
	module.dataLayerOpts,
	module.ScaleControl,
	document
);

module.map = ( function ( Map ) {
	return function ( options ) {
		return new Map( options );
	};
} )( module.Map );