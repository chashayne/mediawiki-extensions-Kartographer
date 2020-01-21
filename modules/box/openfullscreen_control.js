/* eslint-disable no-underscore-dangle */
/**
 * # Control to open the map in a full screen dialog.
 *
 * See [L.Control](https://www.mapbox.com/mapbox.js/api/v2.3.0/l-control/)
 * documentation for more details.
 *
 * @class Kartographer.Box.OpenFullScreenControl
 * @extends L.Control
 */
module.OpenFullScreenControl = L.Control.extend( {
	options: {
		// Do not switch for RTL because zoom also stays in place
		position: 'topright'
	},

	/**
	 * Creates the control element.
	 *
	 * @override
	 * @protected
	 */
	onAdd: function () {
		var container = L.DomUtil.create( 'div', 'leaflet-bar leaflet-control-static' );

		this.link = L.DomUtil.create( 'a', 'oo-ui-icon-fullScreen', container );
		this.link.title = mw.msg( 'kartographer-fullscreen-text' );

		L.DomEvent.addListener( this.link, 'click', this.openFullScreen, this );
		L.DomEvent.disableClickPropagation( container );

		return container;
	},

	/**
	 * Ability to log an `open` event on click.
	 *
	 * @protected
	 */
	logOpenEvent: function () {
		// We need this hack to differentiate these events from `hashopen` events.
		this._map.clicked = true;
		mw.track( 'mediawiki.kartographer', {
			action: 'open',
			isFullScreen: true,
			feature: this._map
		} );
	},

	/**
	 * Opens the full screen dialog on `click`.
	 *
	 * @param {Event} e
	 * @protected
	 */
	openFullScreen: function ( e ) {
		L.DomEvent.stop( e );
		this.logOpenEvent();
		this._map.openFullScreen();
	}
} );
