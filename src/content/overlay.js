"use strict";

Components.utils.import("chrome://stylem/content/modules/stylishStyleModule.jsm");
Components.utils.import("resource://gre/modules/Services.jsm");
Components.utils.import("chrome://stylem/content/usercss-parser.js");

var stylishOverlay = {
	service: null,
	styleMenuItemTemplate: null,
	bundle: null,

	globalCount: null,
	uiElementIds: ["stylem-toolbar-button"],
	TOPICS: ["stylem-style-add", "stylem-style-change", "stylem-style-delete"],

	init: function() {
		stylishOverlay.service = styleService;
		stylishOverlay.bundle = Components.classes["@mozilla.org/intl/stringbundle;1"]
			.createInstance(Components.interfaces.nsIStringBundleService)
			.createBundle("chrome://stylem/locale/overlay.properties");
		stylishOverlay.STRINGS = document.getElementById("stylem-strings");
		stylishOverlay.URL_STRINGS = document.getElementById("stylem-url-strings");

		// Detect and warn if legacy Stylish is also active
		try {
			var addons = Services.prefs.getCharPref("extensions.enabledAddons");
			if (addons.indexOf("%7B46551EC9-40F0-4e47-8E18-8E5CF550CFB8%7D") !== -1) {
				Services.prompt.alert(null,
					stylishOverlay.STRINGS.getString("stylishwarning"),
					stylishOverlay.STRINGS.getString("stylishdisable"));
				Components.utils.import("resource://gre/modules/AddonManager.jsm");
				AddonManager.getAddonByID("{46551EC9-40F0-4e47-8E18-8E5CF550CFB8}", function(addon) {
					addon.userDisabled = true;
				});
				Services.startup.quit(Services.startup.eRestart | Services.startup.eAttemptQuit);
			}
		} catch(e) {}

		// First-run handling
		var prefService = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService).QueryInterface(Components.interfaces.nsIPrefBranch);
		switch (prefService.getIntPref("extensions.stylem.firstRun")) {
			case 0:
				if (typeof openUILinkIn != "undefined") {
					setTimeout(function() { openUILinkIn(stylishOverlay.URL_STRINGS.getString("firstrun"), "tab"); }, 100);
				}
				/* falls through */
			case 2:
				// Add toolbar button to nav-bar on first install
				var navbar = document.getElementById("nav-bar");
				var button = document.getElementById("stylem-toolbar-button");
				if (navbar && !button) {
					var newCurrentSet = navbar.currentSet.split(",").concat(["stylem-toolbar-button"]).join(",");
					navbar.currentSet = newCurrentSet;
					navbar.setAttribute("currentset", newCurrentSet);
					document.persist(navbar.id, "currentset");
				}
				prefService.setIntPref("extensions.stylem.firstRun", 3);
		}

		// Build menu item template
		stylishOverlay.styleMenuItemTemplate = document.createElementNS(stylishCommon.XULNS, "menuitem");
		stylishCommon.domApplyAttributes(stylishOverlay.styleMenuItemTemplate, {
			"type": "checkbox",
			"class": "style-menu-item",
			"context": "stylem-style-context"
		});

		// Time-based attributes for per-hour/day CSS styling
		function updateTimes() {
			var date = new Date();
			document.documentElement.setAttribute("stylem-hour", date.getHours());
			document.documentElement.setAttribute("stylem-day", date.getDay());
			document.documentElement.setAttribute("stylem-date", date.getDate());
			document.documentElement.setAttribute("stylem-month", date.getMonth() + 1);
		}
		setInterval(updateTimes, 1000 * 60);
		updateTimes();

		// URL tracking
		if (typeof gBrowser != "undefined") {
			gBrowser.addProgressListener(stylishOverlay.urlLoadedListener);
			gBrowser.tabContainer.addEventListener("TabSelect", stylishOverlay.urlUpdated, false);
		}
		stylishOverlay.urlUpdated();

		// App info attributes for CSS targeting
		var appInfo = Components.classes["@mozilla.org/xre/app-info;1"].getService(Components.interfaces.nsIXULAppInfo);
		document.documentElement.setAttribute("stylem-platform", window.navigator.platform);
		document.documentElement.setAttribute("stylem-application", appInfo.name);
		document.documentElement.setAttribute("stylem-application-version", appInfo.version);

		// Preferences observer
		prefService.addObserver("extensions.stylem.styleRegistrationEnabled", stylishOverlay, false);

		// Style change observers
		var observerService = Components.classes["@mozilla.org/observer-service;1"].getService(Components.interfaces.nsIObserverService);
		stylishOverlay.TOPICS.forEach(function(t) { observerService.addObserver(stylishOverlay, t, false); });
	},

	destroy: function() {
		if (typeof gBrowser != "undefined") {
			gBrowser.removeProgressListener(stylishOverlay.urlLoadedListener, Components.interfaces.nsIWebProgress.NOTIFY_STATE_DOCUMENT);
			gBrowser.tabContainer.removeEventListener("TabSelect", stylishOverlay.urlUpdated, false);
		}
		var prefService = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService).QueryInterface(Components.interfaces.nsIPrefBranch);
		prefService.removeObserver("extensions.stylem.styleRegistrationEnabled", stylishOverlay);
		var observerService = Components.classes["@mozilla.org/observer-service;1"].getService(Components.interfaces.nsIObserverService);
		stylishOverlay.TOPICS.forEach(function(t) { observerService.removeObserver(stylishOverlay, t); });
	},

	observe: function(subject, topic, data) {
		stylishOverlay.globalCount = null;
		stylishOverlay.updateStatus();
	},

	urlLoadedListener: {
		QueryInterface: function(aIID) {
			if (aIID.equals(Components.interfaces.nsIWebProgressListener) ||
				aIID.equals(Components.interfaces.nsISupportsWeakReference) ||
				aIID.equals(Components.interfaces.nsISupports))
				return this;
			throw Components.results.NS_NOINTERFACE;
		},
		onLocationChange: function(progress, request, uri) {
			if (uri && uri.spec == stylishOverlay.currentURI.spec) {
				stylishOverlay.urlUpdated();
			}
		},
		onStateChange: function(progress, request, state, status) {
			// Detect completed load of a .user.css file.
			// Use STATE_IS_WINDOW (document fully loaded) not STATE_IS_NETWORK
			// (network done but body may not yet be parsed).
			var STOP   = Components.interfaces.nsIWebProgressListener.STATE_STOP;
			var WINDOW = Components.interfaces.nsIWebProgressListener.STATE_IS_WINDOW;
			if (!(state & STOP) || !(state & WINDOW)) return;
			// Only fire for the top-level document, not iframes
			if (progress.DOMWindow !== progress.DOMWindow.top) return;
			var uri = stylishOverlay.currentURI;
			if (!uri) return;
			var spec = uri.spec;

			// userstyles.world: remove the "Get Stylus" button
			try {
				var host = uri.host;
				if (host === "userstyles.world" || (host && host.indexOf(".userstyles.world") === host.length - ".userstyles.world".length)) {
					var doc = progress.DOMWindow.document;
					var stylusBtn = doc.getElementById("stylus");
					if (stylusBtn) stylusBtn.remove();
				}
			} catch(e) {}

			if (!stylishOverlay._isUserCSSUrl(spec)) return;
			// Avoid re-prompting if already showing install dialog for this URL
			if (stylishOverlay._pendingUserCSSUrl === spec) return;
			stylishOverlay._pendingUserCSSUrl = spec;
			// Grab the raw text from the content document
			stylishOverlay.getFromContent("stylem:page-content", function(message) {
				stylishOverlay._pendingUserCSSUrl = null;
				var css = message.data && message.data.content;
				if (!css) return;
				if (userCSSParser.isUserCSS(css)) {
					stylishOverlay._promptUserCSSInstall(css, spec);
				} else {
					// Plain .user.css without UserCSS metadata block
					stylishCommon.installFromString(css, spec, null);
				}
			});
		},
		onProgressChange: function() {},
		onStatusChange: function() {},
		onSecurityChange: function() {},
		onLinkIconAvailable: function() {}
	},

	lastUrl: null,

	urlUpdated: function() {
		var uri = stylishOverlay.currentURI;
		if (!uri || stylishOverlay.lastUrl == uri.spec) return;
		stylishOverlay.lastUrl = uri.spec;
		document.documentElement.setAttribute("stylem-url", uri.spec);
		try {
			document.documentElement.setAttribute("stylem-domain", uri.host || "");
		} catch (ex) {
			document.documentElement.setAttribute("stylem-domain", "");
		}
		stylishOverlay.updateStatus();
	},

	updateStatus: function() {
		function updateAttribute(value) {
			stylishOverlay.uiElementIds.forEach(function(id) {
				var e = document.getElementById(id);
				if (e) e.setAttribute("styles-applied", value);
			});
		}
		function updateTooltip(string) {
			var tooltip = document.getElementById("stylem-tooltip");
			if (!tooltip) return;
			var label = tooltip.firstChild;
			while (label && label.hasChildNodes()) label.removeChild(label.lastChild);
			if (label) label.appendChild(document.createTextNode(string));
		}

		var prefService = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefBranch);
		if (!prefService.getBoolPref("extensions.stylem.styleRegistrationEnabled")) {
			updateAttribute("styles-off");
			updateTooltip(stylishOverlay.STRINGS.getString("tooltipStylesOff"));
			return;
		}

		var uri = stylishOverlay.currentURI;
		if (!uri) { updateAttribute(""); return; }

		if (!stylishOverlay.service) { updateAttribute(""); return; }
		var siteStyles = stylishOverlay.service.findForUrl(uri.spec, false, 0, {}).filter(function(s) { return s.enabled; }).length;

		if (stylishOverlay.globalCount == null) {
			stylishOverlay.globalCount = stylishOverlay.service.findByMeta("type", "global", 0, {}).filter(function(s) { return s.enabled; }).length;
		}

		var attributeValues = [];
		if (siteStyles) attributeValues.push("site");
		if (stylishOverlay.globalCount) attributeValues.push("global");
		updateAttribute(attributeValues.join(" "));
		updateTooltip(stylishOverlay.STRINGS.getFormattedString("tooltip", [siteStyles, stylishOverlay.globalCount]));
	},

	toggleStyle: function(style) {
		style.enabled = !style.enabled;
		style.save();
	},

	writeStylePopupShowing: function(event) {
		var popup = event.target;

		var addSite = document.createElementNS(stylishCommon.XULNS, "menuitem");
		addSite.setAttribute("label", stylishOverlay.STRINGS.getString("writeforsite"));
		addSite.setAttribute("accesskey", stylishOverlay.STRINGS.getString("writeforsiteaccesskey"));
		addSite.addEventListener("command", stylishOverlay.addSite, false);
		popup.appendChild(addSite);

		var domain = null;
		try { domain = stylishOverlay.currentURI.host; } catch (ex) {}
		if (domain) {
			var domains = [];
			stylishOverlay.getDomainList(domain, domains);
			domains.forEach(function(d) {
				popup.appendChild(stylishOverlay.getDomainMenuItem(d));
			});
		}

		var addBlank = document.createElementNS(stylishCommon.XULNS, "menuitem");
		addBlank.setAttribute("label", stylishOverlay.STRINGS.getString("writeblank"));
		addBlank.setAttribute("accesskey", stylishOverlay.STRINGS.getString("writeblankaccesskey"));
		addBlank.addEventListener("command", function() { stylishOverlay.addCode(""); }, false);
		popup.appendChild(addBlank);
	},

	popupShowing: function(event) {
		var popup = event.target;
		if (popup.id != "stylem-popup") return;

		if (popup.triggerNode) popup.triggerNode.setAttribute("open", "true");

		// Hide "add CSS file" by default
		document.getElementById("stylem-add-file").style.display = "none";
		stylishOverlay.getFromContent("stylem:page-info", function(message) {
			if (message.data.contentType == "text/css") {
				document.getElementById("stylem-add-file").style.display = "-moz-box";
			}
		});

		function addStyleMenuItems(styles, parent, startIndex) {
			if (!startIndex) startIndex = 0;
			styles.forEach(function(style, index) {
				var menuitem = stylishOverlay.styleMenuItemTemplate.cloneNode(true);
				menuitem.addEventListener("command", function(event) {
					stylishOverlay.toggleStyle(this.stylishStyle);
					event.stopPropagation();
				}, false);
				stylishCommon.domApplyAttributes(menuitem, {
					"label": style.name,
					"checked": style.enabled,
					"style-type": style.getTypes({}).join(" ")
				});
				if ((startIndex + index) < 9) {
					menuitem.setAttribute("accesskey", startIndex + index + 1);
				}
				menuitem.stylishStyle = style;
				parent.appendChild(menuitem);
			});
		}

		function addStylesInSubmenu(styles, menuLabel) {
			if (styles.length == 0) return;
			addSeparatorIfNecessary();
			var menu = document.createElementNS(stylishCommon.XULNS, "menu");
			stylishCommon.domApplyAttributes(menu, {label: menuLabel, class: "style-menu-item"});
			var menupopup = document.createElementNS(stylishCommon.XULNS, "menupopup");
			menu.appendChild(menupopup);
			addStyleMenuItems(styles, menupopup);
			popup.appendChild(menu);
		}

		var separatorAdded = false;
		function addSeparatorIfNecessary() {
			if (!separatorAdded) {
				var sep = document.createElementNS(stylishCommon.XULNS, "menuseparator");
				sep.className = "stylem-menuseparator";
				popup.appendChild(sep);
				separatorAdded = true;
			}
		}

		var _stylesForCurrentSite = null;
		function stylesForCurrentSite() {
			if (_stylesForCurrentSite == null) {
				_stylesForCurrentSite = stylishOverlay.service.findForUrl(stylishOverlay.currentURI.spec, false, stylishOverlay.service.REGISTER_STYLE_ON_CHANGE, {});
			}
			return _stylesForCurrentSite;
		}

		function nonMatchingStyles() {
			var styles = stylishOverlay.service.findByMeta("type", "site", stylishOverlay.service.REGISTER_STYLE_ON_CHANGE, {});
			stylesForCurrentSite().forEach(function(style) {
				var i = styles.indexOf(style);
				if (i != -1) styles.splice(i, 1);
			});
			return styles;
		}

		function globalStyles() { return stylishOverlay.service.findByMeta("type", "global", stylishOverlay.service.REGISTER_STYLE_ON_CHANGE, {}); }
		function appStyles() { return stylishOverlay.service.findByMeta("type", "app", stylishOverlay.service.REGISTER_STYLE_ON_CHANGE, {}); }

		const SHOW = "show";
		const SHOW_IN_SUBMENU = "submenu";
		const DONT_SHOW = "hide";

		var prefService = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefBranch);
		var showMatchingSite = prefService.getCharPref("extensions.stylem.buttonStylesDisplay.siteMatching");
		var showNonMatchingSite = prefService.getCharPref("extensions.stylem.buttonStylesDisplay.siteNonMatching");
		var showGlobal = prefService.getCharPref("extensions.stylem.buttonStylesDisplay.global");
		var showApp = prefService.getCharPref("extensions.stylem.buttonStylesDisplay.app");

		if (showMatchingSite == SHOW_IN_SUBMENU) addStylesInSubmenu(stylesForCurrentSite(), stylishOverlay.bundle.GetStringFromName("submenuformatchingsite"));
		if (showNonMatchingSite == SHOW_IN_SUBMENU) addStylesInSubmenu(nonMatchingStyles(), stylishOverlay.bundle.GetStringFromName("submenufornonmatchingsite"));
		if (showGlobal == SHOW_IN_SUBMENU) addStylesInSubmenu(globalStyles(), stylishOverlay.bundle.GetStringFromName("submenuforglobal"));
		if (showApp == SHOW_IN_SUBMENU) addStylesInSubmenu(appStyles(), stylishOverlay.bundle.GetStringFromName("submenuforapp"));

		var mainMenuIndex = 0;
		function addStylesToMainMenu(styles) {
			if (styles.length == 0) return;
			addSeparatorIfNecessary();
			addStyleMenuItems(styles, popup, mainMenuIndex);
			mainMenuIndex += styles.length;
		}
		if (showMatchingSite == SHOW) addStylesToMainMenu(stylesForCurrentSite());
		if (showNonMatchingSite == SHOW) addStylesToMainMenu(nonMatchingStyles());
		if (showGlobal == SHOW) addStylesToMainMenu(globalStyles());
		if (showApp == SHOW) addStylesToMainMenu(appStyles());

		var stylesOn = prefService.getBoolPref("extensions.stylem.styleRegistrationEnabled");
		document.getElementById("stylem-turn-on").style.display = stylesOn ? "none" : "-moz-box";
		document.getElementById("stylem-turn-off").style.display = stylesOn ? "-moz-box" : "none";
	},

	popupHiding: function(event) {
		var popup = event.target;
		if (popup.id != "stylem-popup") return;
		if (popup.triggerNode) popup.triggerNode.removeAttribute("open");
		stylishOverlay.clearStyleMenuItems(event);
	},

	getDomainList: function(domain, array) {
		if (Components.interfaces.nsIEffectiveTLDService) {
			try {
				var tld = Components.classes["@mozilla.org/network/effective-tld-service;1"].getService(Components.interfaces.nsIEffectiveTLDService);
				if (domain == tld.getPublicSuffixFromHost(domain)) return;
			} catch(ex) { return; }
		}
		array.push(domain);
		var firstDot = domain.indexOf(".");
		var lastDot = domain.lastIndexOf(".");
		if (firstDot != lastDot) {
			if (!isNaN(parseInt(domain.substring(lastDot + 1), 10))) return;
			stylishOverlay.getDomainList(domain.substring(firstDot + 1), array);
		}
	},

	getDomainMenuItem: function(domain) {
		var item = document.createElementNS(stylishCommon.XULNS, "menuitem");
		item.setAttribute("label", stylishOverlay.STRINGS.getFormattedString("writefordomain", [domain]));
		item.addEventListener("command", function() { stylishOverlay.addDomain(domain); }, false);
		return item;
	},

	findStyle: function(e) {
		var host = stylishOverlay.currentURI.host || "";
		openUILinkIn(stylishOverlay.URL_STRINGS.getFormattedString("findstylesforthissiteurl", [host]), "tab");
	},

	menuItemClassesToClear: ["stylem-menuseparator", "style-menu-item", "no-style-menu-item"],
	clearStyleMenuItems: function(event) {
		var popup = event.target;
		for (var i = popup.childNodes.length - 1; i >= 0; i--) {
			for (var j = 0; j < stylishOverlay.menuItemClassesToClear.length; j++) {
				if (popup.childNodes[i].className.indexOf(stylishOverlay.menuItemClassesToClear[j]) != -1) {
					popup.removeChild(popup.childNodes[i]);
					break;
				}
			}
		}
	},

	addSite: function() {
		stylishOverlay.getFromContent("stylem:page-info", function(message) {
			var code = "@namespace url(" + message.data.namespace + ");\n\n@-moz-document url(\"" + message.data.url + "\") {\n\n}";
			stylishOverlay.addCode(code);
		});
	},

	addDomain: function(domain) {
		var code = "@namespace url(http://www.w3.org/1999/xhtml);\n\n@-moz-document domain(\"" + domain + "\") {\n\n}";
		stylishOverlay.addCode(code);
	},

	addCode: function(code) {
		stylishCommon.addCode(code);
	},

	openManage: function() {
		stylishCommon.openManage(window);
	},

	showApplicableContextItems: function(event) {
		var style = document.popupNode.stylishStyle;
		document.getElementById("stylem-style-context-enable").hidden = style.enabled;
		document.getElementById("stylem-style-context-disable").hidden = !style.enabled;
	},

	contextSetEnabled: function(enabled) {
		var style = document.popupNode.stylishStyle;
		style.enabled = enabled;
		style.save();
	},

	contextEdit: function() {
		stylishCommon.openEditForStyle(document.popupNode.stylishStyle);
	},

	contextDelete: function() {
		stylishCommon.deleteWithPrompt(document.popupNode.stylishStyle);
	},

	turnOnOff: function(on) {
		Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefBranch).setBoolPref("extensions.stylem.styleRegistrationEnabled", on);
	},

	handleStatusClick: function(event) {
		if (event.target.id == "stylem-toolbar-button" && event.button == 1) {
			stylishOverlay.openManage();
		}
	},

	installFromFile: function(event) {
		stylishOverlay.getFromContent("stylem:page-content", function(message) {
			stylishCommon.installFromString(message.data.content, message.data.url);
		});
	},

	get currentURI() {
		return (typeof gBrowser != "undefined") ? gBrowser.currentURI : null;
	},

	getFromContent: function(contentMessage, callback) {
		if (typeof gBrowser === "undefined") return;
		var replyName = "stylem:" + Date.now();
		var mm = gBrowser.selectedBrowser.messageManager;
		mm.addMessageListener(replyName, function stylemReplyHandler(message) {
			mm.removeMessageListener(replyName, stylemReplyHandler);
			callback(message);
		});
		mm.sendAsyncMessage(contentMessage, {reply: replyName});
	},

	_pendingUserCSSUrl: null,

	_usercssUrlPattern: /\.user\.css(\?.*)?$/i,

	_isUserCSSUrl: function(spec) {
		return stylishOverlay._usercssUrlPattern.test(spec);
	},

	_promptUserCSSInstall: function(css, sourceUrl) {
		// Parse and check if already installed — the tab page will show
		// either the install UI or an "already installed" message.
		var parsed = userCSSParser.parse(css);
		var alreadyInstalled = false;
		if (!parsed.error) {
			var idUrl = userCSSParser.makeIdUrl(parsed.meta, sourceUrl);
			if (idUrl) {
				var service = styleService;
				if (service.findByUrl(idUrl, 0)) {
					alreadyInstalled = true;
				}
			}
		}

		// Pass data to the chrome tab page via the browser window global
		window.stylemPendingInstallCSS = css;
		window.stylemPendingInstallSourceUrl = sourceUrl || null;
		window.stylemPendingInstallAlreadyInstalled = alreadyInstalled;

		// Redirect the current tab to our install/review page
		if (typeof gBrowser != "undefined") {
			gBrowser.loadURI("chrome://stylem/content/install.xul");
		}
	}
};

addEventListener("load", stylishOverlay.init, false);
addEventListener("unload", stylishOverlay.destroy, false);
