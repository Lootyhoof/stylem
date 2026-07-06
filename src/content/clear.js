"use strict";

Components.utils.import("chrome://stylem/content/modules/stylishStyleModule.jsm");
var prefService = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService).QueryInterface(Components.interfaces.nsIPrefBranch);
if (!prefService.getBoolPref("extensions.stylem.promptOnClear") || confirm("Are you sure you want to delete all Stylem styles?")) {
	var service = styleService;
	service.list(service.REGISTER_STYLE_ON_CHANGE, {}).forEach(function(style) {
		style.delete();
	});
}