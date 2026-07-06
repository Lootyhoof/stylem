"use strict";

Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");
try {
	Components.utils.import("resource://gre/modules/AddonManager.jsm");
} catch (ex) {}
var observerService = Components.classes["@mozilla.org/observer-service;1"].getService(Components.interfaces.nsIObserverService);

// Unwrap an XPCOM object to its raw JS object, handling both
// XPCWrappedNative (.wrappedJSObject) and already-unwrapped cases.
function stylemUnwrap(obj) {
	if (!obj) return obj;
	return obj.wrappedJSObject || obj;
}

// Lazily import the style module and return the singleton service.
// The chrome:// URI is only resolvable after profile-after-change fires,
// so we cannot import it at component-parse time.
var _styleServiceCache = null;
function getStyleService() {
	if (!_styleServiceCache) {
		try {
			Components.utils.import("chrome://stylem/content/modules/stylishStyleModule.jsm");
			_styleServiceCache = styleService; // exported by the jsm
		} catch(e) {
			Components.utils.reportError("Stylem: could not import style service: " + e);
		}
	}
	return _styleServiceCache;
}

// Lazy bundle getter - defers chrome: URI resolution until after profile is ready
var _bundle = null;
function getBundle() {
	if (!_bundle) {
		_bundle = Components.classes["@mozilla.org/intl/stringbundle;1"]
			.getService(Components.interfaces.nsIStringBundleService)
			.createBundle("chrome://stylem/locale/manage.properties");
	}
	return _bundle;
}

function StylishStartup() {}

StylishStartup.prototype = {
	classID: Components.ID("{dd9897e8-168b-44c7-960d-63202b78f1a6}"),
	contractID: "@stylem/startup;2",
	classDescription: "Stylem Startup",

	QueryInterface: XPCOMUtils.generateQI([Components.interfaces.nsISupports, Components.interfaces.nsIObserver]),

	observe: function(aSubject, aTopic, aData) {
		// Load enabled styles - wrapped separately so a failure here doesn't
		// block provider registration or messaging setup
		try {
			var service = getStyleService();
			service.findEnabled(true, service.REGISTER_STYLE_ON_LOAD, {});
		} catch(e) {
			Components.utils.reportError("Stylem: could not load enabled styles: " + e);
		}
		// Register the User Styles category in about:addons
		if (typeof AddonManagerPrivate != "undefined") {
			try {
				// Create bundle here - chrome: URIs are safe to resolve after profile-after-change
				var localBundle = Components.classes["@mozilla.org/intl/stringbundle;1"]
					.getService(Components.interfaces.nsIStringBundleService)
					.createBundle("chrome://stylem/locale/manage.properties");
				var categoryName = localBundle.GetStringFromName("manageaddonstitle");
				AddonManagerPrivate.registerProvider(UserStyleManager, [{
					id: "userstyle",
					name: categoryName,
					uiPriority: 4600,
					// Use the literal string "list" - extensions.js maps viewObjects["list"]
					// to gListView. AddonManager.VIEW_TYPE_LIST may be undefined in some
					// versions of Pale Moon's AddonManager.jsm.
					viewType: "list"
				}]);
			} catch(e) {
				Components.utils.reportError("Stylem: could not register addon provider: " + e);
			}
		}
		try {
			wireUpMessaging();
		} catch(e) {
			Components.utils.reportError("Stylem: wireUpMessaging failed: " + e);
		}
	}
}

var turnOnOffObserver = {
	observe: function(subject, topic, data) {
		var service = getStyleService();
		service.findEnabled(true, subject.QueryInterface(Components.interfaces.nsIPrefBranch).getBoolPref(data) ? service.REGISTER_STYLE_ON_LOAD : service.UNREGISTER_STYLE_ON_LOAD, {});
	}
}

var prefService = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefBranch);

var UserStyleManager = {

	getAddonsByTypes: function(aTypes, aCallback) {
		if (aTypes && aTypes.indexOf("userstyle") == -1) {
			aCallback([]);
			return;
		}
		try {
			var service = getStyleService();
			var countObj = {};
			var styles = service.list(0, countObj);
			var wrappers = [];
			for (var i = 0; i < styles.length; i++) {
				try {
					wrappers.push(getUserStyleWrapper(styles[i]));
				} catch(e) {
					Components.utils.reportError("Stylem: failed to wrap style id=" + (styles[i] && styles[i].id) + ": " + e);
				}
			}
			aCallback(wrappers);
		} catch(e) {
			Components.utils.reportError("Stylem: getAddonsByTypes failed: " + e);
			aCallback([]);
		}
	},

	getAddonByID: function(id, callback) {
		try {
			var service = getStyleService();
			var style = service.find(id, 0);
			if (style == null) {
				callback(null);
				return;
			}
			callback(getUserStyleWrapper(style));
		} catch(e) {
			Components.utils.reportError("Stylem: getAddonByID failed: " + e);
			callback(null);
		}
	},

	getInstallForURL: function(url, callback, mimetype, hash, name, iconURL, version, loadGroup) {
		Components.utils.reportError("getInstallForURL not implemented for user styles.");
		throw "Not implemented";
	},

	getInstallForFile: function(file, callback, mimetype) {
		Components.utils.reportError("getInstallForFile not implemented for user styles.");
		throw "Not implemented";
	},

	getAllInstalls: function(callback) {
		callback(pendingUpdates);
	},

	getInstallsByTypes: function(types, callback) {
		callback(pendingUpdates);
	},

	installAddonsFromWebpage: function(mimetype, source, uri, installs) {
		Components.utils.reportError("installAddonsFromWebpage not implemented for user styles.");
		throw "Not implemented";
	},

	addInstallListener: function(listener) {
		Components.utils.reportError("addInstallListener not implemented for user styles.");
		throw "Not implemented";
	},
	
	removeInstallListener: function(listener) {
		Components.utils.reportError("removeInstallListener not implemented for user styles.");
		throw "Not implemented";
	},

	getAllAddons: function(callback) {
		Components.utils.reportError("getAllAddons not implemented for user styles.");
		throw "Not implemented";
	},

	getAddonsByIDs: function(ids, callback) {
		Components.utils.reportError("getAddonsByIDs not implemented for user styles.");
		throw "Not implemented";
	},

	getAddonsWithOperationsByTypes: function(types, callback) {
		Components.utils.reportError("getAddonsWithOperationsByTypes not implemented for user styles.");
		throw "Not implemented";
	},

	addAddonListener: function(listener) {
		Components.utils.reportError("addAddonListener not implemented for user styles.");
		throw "Not implemented";
	},

	removeAddonListener: function(listener) {
		Components.utils.reportError("removeAddonListener not implemented for user styles.");
		throw "Not implemented";
	}
};

function getUserStyleWrapper(s) {
	var w = {
		style: s,
		type: "userstyle",
		appDisabled: false,
		pendingOperations: AddonManager.PENDING_NONE,
		isCompatible: true,
		isPlatformCompatible: true,
		get iconURL() {
			return "chrome://stylem/skin/32.svg";
		},
		scope: AddonManager.SCOPE_PROFILE,
		blocklistState: (Components.interfaces.nsIBlocklistService && "STATE_NOT_BLOCKED" in Components.interfaces.nsIBlocklistService)
			? Components.interfaces.nsIBlocklistService.STATE_NOT_BLOCKED
			: 0,
		get version() {
			var ucss = this._getUserCSSMeta();
			return ucss.version || "";
		},
		operationsRequiringRestart: AddonManager.OP_NEEDS_RESTART_NONE,

		get creator() {
			var ucss = this._getUserCSSMeta();
			if (!ucss.author) return null;
			return {name: ucss.author, toString: function() { return this.name; }};
		},

		_usercssMeta: null,
		_getUserCSSMeta: function() {
			if (this._usercssMeta) return this._usercssMeta;
			try {
				var code = this.style.code;
				if (code && code.indexOf("==UserStyle==") !== -1) {
					this._usercssMeta = this.style.parseUserCSSMetadata(code);
				}
			} catch(e) {}
			return this._usercssMeta || {};
		},

		get id() {
			return this.style.id.toString();
		},

		get name() {
			return this.style.name;
		},

		get homepageURL() {
			var ucss = this._getUserCSSMeta();
			return ucss.homepageURL || this.style.url;
		},

		get supportURL() {
			var ucss = this._getUserCSSMeta();
			return ucss.supportURL || null;
		},

		get size() {
			return this.style.code.length;
		},

		get providesUpdatesSecurely() {
			return this.style.updateUrl == null || this.style.updateUrl == "";
		},

		get styleTypes() {
			return this.style.getTypes({}).sort().join(",");
		},

		get optionsURL() {
			return null;
		},

		get permissions() {
			return AddonManager.PERM_CAN_UNINSTALL | 
				(this.style.enabled ? AddonManager.PERM_CAN_DISABLE : AddonManager.PERM_CAN_ENABLE) |
				(this.style.updateUrl != null && this.style.updateUrl != "" && this.style.updateUrl.length <= 2000 && prefService.getBoolPref("extensions.stylem.updatesEnabled") ? AddonManager.PERM_CAN_UPGRADE : 0); // if the url length is too long, a GET won't work, and it's probably going to be too much server-side to handle
		},

		get isActive() {
			return !this.userDisabled;
		},

		get userDisabled() {
			return !this.style.enabled;
		},

		set userDisabled(val) {
			if (this.style.enabled == !val) {
				// no op
				return;
			}
			this.style.enabled = !val;
			this.style.save();
			AddonManagerPrivate.callAddonListeners(val ? "onEnabling" : "onDisabling", this, false);
		},

		get description() {
			var ucss = this._getUserCSSMeta();
			if (ucss.description) return ucss.description;
			return this.getAppliesString();
		},

		getAppliesString: function() {
			var types = this.style.getTypes({});
			if (types.length == 1) {
				if (types[0] == "global") {
					return getBundle().GetStringFromName("globalstyledescription");
				}
				if (types[0] == "app") {
					return getBundle().GetStringFromName("appstyledescription");
				}
			}
			var affects = this.style.getPrettyAppliesTo({});
			if (affects.length > 0) {
				return getBundle().formatStringFromName("sitestyledescription", [affects.join(", ")], 1);
			}
			return "";
		},

		uninstall: function() {
			this.style.delete();
		},

		findUpdates: function(listener, flags) {
			this.style.checkForUpdates(getUserStyleUpdateCheckObserver(this, listener));
		},

		isCompatibleWith: function(appVersion, platformVersion) {
			return true;
		},

		get applyBackgroundUpdates() {
			return parseInt(this.style.applyBackgroundUpdates);
		},

		set applyBackgroundUpdates(abu) {
			this.style.applyBackgroundUpdates = abu;
			this.style.save();
		},

		observe: function(subject, topic, data) {
			// Update our stuff if the style was changed
			if (this.style.id == subject.id) {
				this.style = subject;
			}
		},

		QueryInterface: function(iid) {
			if (iid.equals(Components.interfaces.nsISupports) ||
			    iid.equals(Components.interfaces.nsIObserver)) {
				return this;
			}
			throw Components.results.NS_ERROR_NO_INTERFACE;
		}
	};
	var observerService = Components.classes["@mozilla.org/observer-service;1"].getService(Components.interfaces.nsIObserverService);
	try {
		observerService.addObserver(w, "stylem-style-change", false);
	} catch(e) {
		Components.utils.reportError("Stylem: addObserver on style wrapper failed: " + e);
	}
	return w;
}

// An observer for style update checks.
function getUserStyleUpdateCheckObserver(addonItem, listener) {
	return {
		addonItem: addonItem,
		listener: listener,
		observe: function(subject, topic, data) {
			var mainUpdateObject = this;
			if (subject.id == this.addonItem.id) {
				// Results of "check for updates"
				switch (topic) {
					case "stylem-style-update-check-done":
						if (data == "update-available" && "onUpdateAvailable" in this.listener) {
							var installItem = getUserStyleUpdateInstallItem(this.addonItem);
							if (!pendingUpdates.some(function(item) {
								return item.addon.id == installItem.addon.id;
							})) {
								pendingUpdates.push(installItem);
							}
							mainUpdateObject.listener.onUpdateAvailable(mainUpdateObject.addonItem, installItem);
							AddonManagerPrivate.callInstallListeners("onNewInstall", [], installItem);
						} else if ((data == "no-update-available" || data == "update-check-error") && "onNoUpdateAvailable" in this.listener) {
							mainUpdateObject.listener.onNoUpdateAvailable(mainUpdateObject.addonItem);
						}
						if ("onUpdateFinished" in mainUpdateObject.listener) {
							mainUpdateObject.listener.onUpdateFinished(mainUpdateObject.addonItem, (data == "update-available" || data == "no-update-available") ? AddonManager.UPDATE_STATUS_NO_ERROR : AddonManager.UPDATE_STATUS_DOWNLOAD_ERROR);
						}
				}
			}
		}
	}
}

// Returns an InstallItem representing an update to the user style
function getUserStyleUpdateInstallItem(addonItem) {
	return {
		name: addonItem.name,
		type: "userstyle",
		state: AddonManager.STATE_AVAILABLE,
		addon: addonItem,
		existingAddon: addonItem,
		listeners: [],
		install: function() {
			this.listeners.forEach(function(l) {
				if ("onInstallStarted" in l) {
					l.onInstallStarted(this, this.addon);
				}
			}, this);
			var service = getStyleService();
			var that = this;

			// Results for "apply updates"
			var updateAttemptObserver = {
				observe: function(subject, topic, data) {
					if (topic != "stylem-style-update-done") {
						return;
					}
					switch (data) {
						case "update-failure":
						case "no-update-possible":
							// This is what XPIProvider.jsm does, but for some reason this isn't giving us the right message in the addons manager on an individual check.
							that.state = AddonManager.STATE_DOWNLOAD_FAILED;
							that.error = AddonManager.ERROR_FILE_ACCESS;
							AddonManagerPrivate.callInstallListeners("onDownloadFailed", that.listeners, that);
							break;
						case "update-success":
							AddonManagerPrivate.callInstallListeners("onInstallEnded", that.listeners, that, that.addon);
							break;
					}

					pendingUpdates = pendingUpdates.filter(function(item) {
						return item.addon.id != this.addon.id;
					}, that);
				}
			}
			service.find(this.existingAddon.id, service.CALCULATE_META | service.REGISTER_STYLE_ON_CHANGE).applyUpdate(updateAttemptObserver);
		},
		cancel: function() {
			throw "Cancelling updates not implemented.";
		},
		addListener: function(listener) {
			if (this.listeners.indexOf(listener) == -1) {
				this.listeners.push(listener);
			}
		},
		removeListener: function(listener) {
			this.listeners = this.listeners.filter(function(l) {
				return l != listener;
			});
		}
	}

}

var pendingUpdates = [];


var addonsObserver = {
	observe: function(subject, topic, data) {
		// subject arrives as nsISupports from the observer service.
		// Unwrap to the raw Style JS object.
		var style = subject.wrappedJSObject || subject;
		// If unwrapping didn't give us a Style (e.g. id is missing),
		// try to locate it by id from the data string.
		if (!style || style.id === undefined) {
			var svc = getStyleService();
			if (svc && data) {
				style = svc.find(parseInt(data), 0) || style;
			}
		}
		if (!style || style.id === undefined) return;
		var itemWrapper = getUserStyleWrapper(style);
		switch (topic) {
			case "stylem-style-add":
				var install = {
					name: subject.name,
					type: "userstyle",
					state: AddonManager.STATE_INSTALLED,
					addon: itemWrapper
				};
				AddonManagerPrivate.callInstallListeners("onNewInstall", [], install);
				AddonManagerPrivate.callInstallListeners("onInstallStarted", [], install);
				AddonManagerPrivate.callInstallListeners("onInstallEnded", [], install, itemWrapper);
				break;
			case "stylem-style-change":
				AddonManagerPrivate.callInstallListeners("onExternalInstall", [], itemWrapper, itemWrapper, false);
				break;
			case "stylem-style-delete":
				AddonManagerPrivate.callAddonListeners("onUninstalled", itemWrapper);
				break;
		}
	}
}
try {
	var observerService = Components.classes["@mozilla.org/observer-service;1"].getService(Components.interfaces.nsIObserverService);
	observerService.addObserver(addonsObserver, "stylem-style-add", false);
	observerService.addObserver(addonsObserver, "stylem-style-change", false);
	observerService.addObserver(addonsObserver, "stylem-style-delete", false);
} catch(e) {
	Components.utils.reportError("Stylem: could not register style observers: " + e);
}

try {
	Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService).QueryInterface(Components.interfaces.nsIPrefBranch).addObserver("extensions.stylem.styleRegistrationEnabled", turnOnOffObserver, false);
} catch(e) {
	Components.utils.reportError("Stylem: could not register pref observer: " + e);
}

function wireUpMessaging() {
	Components.utils.import("chrome://stylem/content/common.js");
	var service = getStyleService();
	var STRINGS = Components.classes["@mozilla.org/intl/stringbundle;1"].getService(Components.interfaces.nsIStringBundleService).createBundle("chrome://stylem/locale/overlay.properties");

	var globalMM = Components.classes["@mozilla.org/globalmessagemanager;1"].getService(Components.interfaces.nsIMessageListenerManager);
	globalMM.loadFrameScript("chrome://stylem/content/install-frame-script.js", true);

	function reply(incomingMessage, name, data) {
		incomingMessage.target.messageManager.sendAsyncMessage(name, data);
	}

	function messageToWindow(message) {
		return message.target.ownerDocument.defaultView;
	}

}

if (XPCOMUtils.generateNSGetFactory)

if (XPCOMUtils.generateNSGetFactory)
    var NSGetFactory = XPCOMUtils.generateNSGetFactory([StylishStartup]);
else
    var NSGetModule = XPCOMUtils.generateNSGetModule([StylishStartup]);