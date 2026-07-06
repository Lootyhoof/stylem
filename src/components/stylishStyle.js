"use strict";

/**
 * XPCOM wrapper for the Stylem style service.
 * The actual implementation lives in stylishStyleModule.jsm.
 *
 * This file exists only so that Components.classes["@stylem.ext/style;1"]
 * resolves to a valid XPCOM component for external consumers.
 * All internal Stylem code uses Cu.import of stylishStyleModule.jsm directly.
 */

Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");
try {
	Components.utils.import("chrome://stylem/content/modules/stylishStyleModule.jsm");
} catch(e) {
	Components.utils.reportError("Stylem: stylishStyle.js could not import module: " + e);
}

// Style is exported by the jsm. Attach XPCOM registration metadata.
Style.prototype.classID    = Components.ID("{152f4e0f-2b9a-4bb8-b058-736b687f7555}");
Style.prototype.contractID = "@stylem.ext/style;1";
Style.prototype.classDescription = "Stylem Style";
Style.prototype.flags      = 0;
Style.prototype.QueryInterface = function(iid) {
	if (iid.equals(Components.interfaces.nsISupports) ||
	    iid.equals(Components.interfaces.nsIClassInfo)) {
		return this;
	}
	throw Components.results.NS_ERROR_NO_INTERFACE;
};
Style.prototype.getInterfaces = function(aCount) {
	var ifaces = [Components.interfaces.nsIClassInfo, Components.interfaces.nsISupports];
	aCount.value = ifaces.length;
	return ifaces;
};
Style.prototype.getHelperForLanguage = function() { return null; };

if (XPCOMUtils.generateNSGetFactory)
	var NSGetFactory = XPCOMUtils.generateNSGetFactory([Style]);
else
	var NSGetModule = XPCOMUtils.generateNSGetModule([Style]);
