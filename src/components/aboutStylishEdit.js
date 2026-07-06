"use strict";

const Cc = Components.classes;
const Ci = Components.interfaces;

Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");
Components.utils.import("resource://gre/modules/Services.jsm");

function AboutStylishEdit() { }
AboutStylishEdit.prototype = {
	classDescription: "about:stylem-edit",
	contractID: "@mozilla.org/network/protocol/about;1?what=stylem-edit",
	classID: Components.ID("{20fd33cc-9c23-4489-87a2-d3eb24028e18}"),
	QueryInterface: XPCOMUtils.generateQI([Ci.nsIAboutModule]),

	getURIFlags: function(aURI) {
		return Ci.nsIAboutModule.ALLOW_SCRIPT;
	},

	newChannel: function(aURI, aSecurity_or_aLoadInfo) {
		var channel;
		if (Services.io.newChannel2) {
			// greater than or equal to Gecko 48 / Goanna 4 so aSecurity_or_aLoadInfo is aLoadInfo
			let uri = Services.io.newURI("chrome://stylem/content/edit.xul", null, null);
			channel = Services.io.newChannelFromURIWithLoadInfo(uri, aSecurity_or_aLoadInfo);
		} else {
			// less than Gecko 48 / Goanna 4 aSecurity_or_aLoadInfo is aSecurity
			channel = Services.io.newChannel("chrome://stylem/content/edit.xul", null, null);
		}
		channel.originalURI = aURI;
		return channel;
	}
};
const NSGetFactory = XPCOMUtils.generateNSGetFactory([AboutStylishEdit]);