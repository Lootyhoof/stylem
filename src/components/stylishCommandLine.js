"use strict";

Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");

function StylishCommandLine() {}

StylishCommandLine.prototype = {

  classID: Components.ID("{9682c01e-071a-45c4-8846-abccc00f3675}"),
  contractID: "@mozilla.org/commandlinehandler/general-startup;1?type=stylem",

  /* nsISupports */
  QueryInterface : XPCOMUtils.generateQI([Components.interfaces.nsICommandLineHandler, Components.interfaces.nsIFactory, Components.interfaces.nsISupports, Components.interfaces.nsIObserver]),

  /* nsICommandLineHandler */

	handle: function(commandLine) {
		var index = commandLine.findFlag("stylem-disable", false);
		if (index > -1) {
			var prefs = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefBranch)
			prefs.setBoolPref("extensions.stylem.styleRegistrationEnabled", false);
			commandLine.removeArguments(index, index);
		}
	},

	helpInfo: "  -stylem-disable               Turn off style registration in Stylem\n",

  /* nsIFactory */

  createInstance : function clh_CI(outer, iid)
  {
    if (outer != null)
      throw Components.results.NS_ERROR_NO_AGGREGATION;

    return this.QueryInterface(iid);
  },

  lockFactory : function clh_lock(lock)
  {
    /* no-op */
  },

	/* nsIObserver - just to prevent warns */
	observe: function(aSubject, aTopic, aData) {}


};

if (XPCOMUtils.generateNSGetFactory)
    var NSGetFactory = XPCOMUtils.generateNSGetFactory([StylishCommandLine]);
else
    var NSGetModule = XPCOMUtils.generateNSGetModule([StylishCommandLine]);

// Does not work in Fx 4
try {
Components.classes["@mozilla.org/categorymanager;1"].getService(Components.interfaces.nsICategoryManager).addCategoryEntry("command-line-handler", "m-stylem", StylishCommandLine.prototype.contractID, true, true);
} catch (ex) {}