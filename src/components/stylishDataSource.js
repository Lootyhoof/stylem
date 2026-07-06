"use strict";

/**
 * XPCOM wrapper for the Stylem data source.
 * All actual SQLite logic is in stylishDataSourceModule.jsm.
 */

Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");
Components.utils.import("chrome://stylem/content/modules/stylishDataSourceModule.jsm");

function StylishDataSource() {}
StylishDataSource.prototype = {
	classID:          Components.ID("{034c0c63-b55e-4022-a291-a542db4ea930}"),
	contractID:       "@stylem.ext/stylem-data-source;1",
	classDescription: "Stylem Data Source",
	flags:            0,

	QueryInterface: function(iid) {
		if (iid.equals(Components.interfaces.nsISupports) ||
		    iid.equals(Components.interfaces.nsIClassInfo)) {
			return this;
		}
		throw Components.results.NS_ERROR_NO_INTERFACE;
	},
	getInterfaces: function(aCount) {
		var ifaces = [Components.interfaces.nsIClassInfo, Components.interfaces.nsISupports];
		aCount.value = ifaces.length;
		return ifaces;
	},
	getHelperForLanguage: function() { return null; },

	// Delegate all real methods to the jsm singleton
	getConnection: function() { return dataSource.getConnection(); },
	getFile:       function() { return dataSource.getFile(); }
};

var components = [StylishDataSource];
if (XPCOMUtils.generateNSGetFactory)
	var NSGetFactory = XPCOMUtils.generateNSGetFactory(components);
else
	var NSGetModule = XPCOMUtils.generateNSGetModule(components);
