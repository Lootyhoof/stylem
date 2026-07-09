"use strict";

Components.utils.import("chrome://stylem/content/modules/stylishStyleModule.jsm");
Components.utils.import("chrome://stylem/content/usercss-parser.js");

var EXPORTED_SYMBOLS = ["stylishCommon", "stylemUnwrap"];

/**
 * Unwrap an XPCOM service/instance to its underlying JS object.
 * In some calling contexts getService()/createInstance() return an
 * XPCWrappedNative whose .wrappedJSObject gives the raw JS object;
 * in other contexts (e.g. component-to-component calls within the
 * same compartment) the object returned IS already the raw JS object
 * and .wrappedJSObject is undefined. This handles both cases.
 */
function stylemUnwrap(obj) {
	if (!obj) return obj;
	return obj.wrappedJSObject || obj;
}

var stylishCommon = {

	XULNS: "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul",

	cssAreEqual: function(css1, css2) {
		if (css1 == null && css2 == null) return true;
		if (css1 == null || css2 == null) return false;
		return css1.replace(/\s/g, "") == css2.replace(/\s/g, "");
	},

	domApplyAttributes: function(element, json) {
		for (var i in json) element.setAttribute(i, json[i]);
	},

	getAppName: function() {
		var appInfo = Components.classes["@mozilla.org/xre/app-info;1"].getService(Components.interfaces.nsIXULAppInfo);
		return appInfo.name;
	},

	isXULAvailable: Components.classes["@mozilla.org/xre/app-info;1"].getService(Components.interfaces.nsIXULRuntime).widgetToolkit.toLowerCase() != "android",

	deleteWithPrompt: function(style) {
		const STRINGS = Components.classes["@mozilla.org/intl/stringbundle;1"].getService(Components.interfaces.nsIStringBundleService).createBundle("chrome://stylem/locale/common.properties");
		var title = STRINGS.GetStringFromName("deleteStyleTitle");
		var prompt = STRINGS.formatStringFromName("deleteStyle", [style.name], 1);
		var prompts = Components.classes["@mozilla.org/embedcomp/prompt-service;1"].getService(Components.interfaces.nsIPromptService);
		if (prompts.confirmEx(window, title, prompt, prompts.BUTTON_POS_0 * prompts.BUTTON_TITLE_IS_STRING + prompts.BUTTON_POS_1 * prompts.BUTTON_TITLE_CANCEL, STRINGS.GetStringFromName("deleteStyleOK"), null, null, null, {})) {
			return false;
		}
		style.delete();
		return true;
	},

	getWindowName: function(prefix, id) {
		return (prefix + (id || Math.random())).replace(/\W/g, "");
	},

	clearAllMenuItems: function(event) {
		var popup = event.target;
		for (var i = popup.childNodes.length - 1; i >= 0; i--) {
			var child = popup.childNodes[i];
			if (child.getAttribute("stylem-dont-clear") != "true") {
				popup.removeChild(child);
			}
		}
	},

	focusWindow: function(name) {
		var windowsMediator = Components.classes["@mozilla.org/appshell/window-mediator;1"].getService(Components.interfaces.nsIWindowMediator);
		var win = windowsMediator.getMostRecentWindow(name);
		if (win) { win.focus(); return true; }
		var tbEnumerator = windowsMediator.getEnumerator("navigator:browser");
		while (tbEnumerator.hasMoreElements()) {
			var tbWin = tbEnumerator.getNext();
			var browsers = tbWin.gBrowser.browsers;
			for (var i = 0; i < browsers.length; i++) {
				if (!(browsers[i].isRemoteBrowser) && browsers[i].currentURI.schemeIs("about")) {
					let doc = browsers[i].contentDocument;
					if (doc == null) continue;
					let de = doc.documentElement;
					if (de && de.getAttribute("windowtype") == name) {
						tbWin.gBrowser.selectTabAtIndex(i);
						tbWin.focus();
						return true;
					}
				}
			}
		}
		return false;
	},

	openEdit: function(name, params, win) {
		if (stylishCommon.focusWindow(name)) return;
		if (!win) win = window;
		var url = "about:stylem-edit";
		var first = true;
		for (var i in params) {
			if (params[i]) {
				url += (first ? "?" : "&") + encodeURIComponent(i) + "=" + encodeURIComponent(params[i]);
				first = false;
			}
		}
		if (typeof win.gBrowser != "undefined" && Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefBranch).getIntPref("extensions.stylem.editorWindowMode") == 0) {
			win.gBrowser.loadOneTab(url, {inBackground: false, relatedToCurrent: true});
			return;
		}
		// Mail client tabbed interface (Epyrus/Thunderbird)
		if (typeof win.gBrowser == "undefined") {
			var tabmail = win.document.getElementById("tabmail");
			if (tabmail && typeof tabmail.openTab == "function") {
				try {
					tabmail.openTab("chromeTab", {chromePage: url});
					return;
				} catch(e) {}
			}
		}
		params.windowType = name;
		return win.openDialog(url, name, "chrome,resizable,dialog=no");
	},

	openEditForStyle: function(style, win) {
		return stylishCommon.openEditForId(style.id, win);
	},

	openEditForId: function(id, win) {
		return stylishCommon.openEdit(stylishCommon.getWindowName("stylishEdit", id), {id: id}, win);
	},

	openManage: function(win) {
		// Open about:addons in a browser window.
		// The "User Styles" category is registered by stylishStartup on profile-after-change
		// and appears in the sidebar automatically. We just open the manager.
		var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
			.getService(Components.interfaces.nsIWindowMediator);
		var browserWin = (win && typeof win.BrowserOpenAddonsMgr === "function")
			? win
			: wm.getMostRecentWindow("navigator:browser");
		if (!browserWin) return;
		// Check if about:addons is already open in a tab
		if (browserWin.gBrowser) {
			var browsers = browserWin.gBrowser.browsers;
			for (var i = 0; i < browsers.length; i++) {
				try {
					if (browsers[i].currentURI && browsers[i].currentURI.spec === "about:addons") {
						browserWin.gBrowser.selectTabAtIndex(i);
						browserWin.focus();
						return;
					}
				} catch(e) {}
			}
			browserWin.gBrowser.loadOneTab("about:addons", {inBackground: false});
		}
	},

	// --- Install flow ---
	startInstallFromUrls: function(startedCallback, endedCallback) {
		const STRINGS = Components.classes["@mozilla.org/intl/stringbundle;1"].getService(Components.interfaces.nsIStringBundleService).createBundle("chrome://stylem/locale/manage.properties");
		var promptService = Components.classes["@mozilla.org/embedcomp/prompt-service;1"].getService(Components.interfaces.nsIPromptService);
		var o = {value: ""};
		if (!promptService.prompt(window, STRINGS.GetStringFromName("installfromurlsprompttitle"), STRINGS.GetStringFromName("installfromurlsprompt"), o, null, {})) return;
		var urls = o.value.split(/\s+/);
		if (urls.length == 0) return;
		if (startedCallback) startedCallback();
		var currentIndex = 0;
		var results = {successes: [], failures: []};
		function processResult(result) {
			(result != "failure" ? results.successes : results.failures).push(urls[currentIndex]);
			currentIndex++;
			if (currentIndex < urls.length) {
				stylishCommon.installFromUrl(urls[currentIndex], processResult);
			} else {
				stylishCommon.endInstallFromUrls(results, endedCallback);
			}
		}
		stylishCommon.installFromUrl(urls[currentIndex], processResult);
	},

	endInstallFromUrls: function(results, endedCallback) {
		if (endedCallback) endedCallback();
		if (results.failures.length > 0) {
			const STRINGS = Components.classes["@mozilla.org/intl/stringbundle;1"].getService(Components.interfaces.nsIStringBundleService).createBundle("chrome://stylem/locale/manage.properties");
			var promptService = Components.classes["@mozilla.org/embedcomp/prompt-service;1"].getService(Components.interfaces.nsIPromptService);
			promptService.alert(window, STRINGS.GetStringFromName("installfromurlsprompttitle"), STRINGS.formatStringFromName("installfromurlserror", [results.failures.join(", ")], 1));
		}
	},

	installFromUrl: function(url, callback) {
		stylishCommon.installFromUrlHtml(url, function(result) {
			if (result == "css") {
				stylishCommon.installFromUrlCss(url, callback);
				return;
			}
			callback(result);
		});
	},

	installFromUrlHtml: function(url, callback) {
		if (/^file:.*/i.test(url)) { callback("css"); return; }
		var xhr = new XMLHttpRequest();
		xhr.onload = function() {
			if (this.status != 200) {
				Components.utils.reportError("Stylem install from URL '" + url + "' resulted in HTTP error code " + this.status + ".");
				callback("failure");
				return;
			}
			var contentType = this.getResponseHeader("Content-Type");
			if (contentType.indexOf("text/css") == 0 || contentType.indexOf("text/plain") == 0) {
				callback("css");
				return;
			}
			if (contentType.indexOf("text/html") == 0) {
				Components.utils.reportError("Stylem install from URL '" + url + "' failed - HTML pages are not supported for style installation.");
				callback("failure");
				return;
			}
			Components.utils.reportError("Stylem install from URL '" + url + "' resulted in unknown content type " + contentType + ".");
			callback("failure");
		};
		try {
			xhr.open("GET", url);
		} catch (ex) {
			Components.utils.reportError("Stylem install from URL '" + url + "' failed - not a valid URL.");
			callback("failure");
			return;
		}
		xhr.responseType = "document";
		xhr.send();
	},

	installFromUrlCss: function(url, callback) {
		var xhr = new XMLHttpRequest();
		xhr.overrideMimeType("text/css");
		xhr.onload = function() {
			if (xhr.status >= 400) {
				Components.utils.reportError("Stylem install from URL '" + url + "' resulted in HTTP error code " + this.status + ".");
				callback("failure");
				return;
			}
			stylishCommon.installFromString(this.responseText, url, callback);
		};
		xhr.open("GET", url);
		xhr.send();
	},

	installFromString: function(css, uri, callback, win) {
		uri = stylishFrameUtils.cleanURI(uri);
		if (userCSSParser.isUserCSS(css)) {
			stylishCommon.openUserCSSInstall(css, uri, callback, win);
			return;
		}
		var style = new Style();
		style.mode = style.CALCULATE_META | style.REGISTER_STYLE_ON_CHANGE;
		style.init(uri, uri, uri, null, null, css, false, css, null, null);
		try {
			style.save();
			if (callback) callback(style.id);
		} catch (ex) {
			Components.utils.reportError("Stylem install from string failed: " + ex);
			if (callback) callback("failure");
		}
	},

	openUserCSSInstall: function(css, sourceUrl, callback, win) {
		// Check if already installed
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
		var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"].getService(Components.interfaces.nsIWindowMediator);
		var browserWin = wm.getMostRecentWindow("navigator:browser");
		if (browserWin) {
			browserWin.stylemPendingInstallCSS = css;
			browserWin.stylemPendingInstallSourceUrl = sourceUrl || null;
			browserWin.stylemPendingInstallAlreadyInstalled = alreadyInstalled;
			browserWin.gBrowser.loadURI("chrome://stylem/content/install.xul");
			return;
		}
		// Try mail window (Epyrus/Thunderbird)
		var mailWin = wm.getMostRecentWindow("mail:3pane");
		if (mailWin) {
			var tabmail = mailWin.document.getElementById("tabmail");
			if (tabmail && typeof tabmail.openTab == "function") {
				mailWin.stylemPendingInstallCSS = css;
				mailWin.stylemPendingInstallSourceUrl = sourceUrl || null;
				mailWin.stylemPendingInstallAlreadyInstalled = alreadyInstalled;
				try {
					tabmail.openTab("chromeTab", {chromePage: "chrome://stylem/content/install.xul"});
					return;
				} catch(e) {}
			}
		}
		if (callback) callback("error");
	},

	addCode: function(code, win) {
		var meta = "/* ==UserStyle==\n@name         New UserStyle\n@namespace    your-namespace\n@version      1.0.0\n@description  Enter a description\n@author       You\n==/UserStyle== */";
		if (code.indexOf("==UserStyle==") === -1) {
			code = code ? meta + "\n\n" + code : meta;
		}
		stylishCommon.openEdit(stylishCommon.getWindowName("stylishEdit"), {code: code}, win);
	},

	// --- Export/Import (Stylus-compatible JSON) ---

	/**
	 * Reconstruct full CSS code from Stylus sections array.
	 */
	_sectionsToCode: function(sections) {
		return sections.map(function(sec) {
			var secCode = sec.code || "";
			if (!secCode) return "";
			var conditions = [];
			(sec.urls || []).forEach(function(u) { conditions.push("url(\"" + u + "\")"); });
			(sec.urlPrefixes || []).forEach(function(u) { conditions.push("url-prefix(\"" + u + "\")"); });
			(sec.domains || []).forEach(function(d) { conditions.push("domain(\"" + d + "\")"); });
			(sec.regexps || []).forEach(function(r) { conditions.push("regexp(\"" + r + "\")"); });
			if (conditions.length === 0) return secCode;
			return "@-moz-document " + conditions.join(", ") + " {\n\t" + secCode.split("\n").join("\n\t") + "\n}";
		}).filter(function(c) { return c; }).join("\n\n");
	},

	/**
	 * Parse CSS code into Stylus-style sections array by splitting
	 * on @-moz-document blocks with proper brace-depth counting.
	 */
	_parseSections: function(code) {
		if (!code) return [];
		var sections = [];
		var i = 0;
		var len = code.length;
		while (i < len) {
			// Find the next @-moz-document rule
			var docIdx = code.indexOf("@-moz-document", i);
			if (docIdx === -1) break;
			// Find the opening brace of this block
			var openIdx = code.indexOf("{", docIdx);
			if (openIdx === -1) break;
			// Extract the condition text between @-moz-document and {
			var conditionText = code.substring(docIdx + 14, openIdx).trim();
			// Count braces to find the matching close brace
			var depth = 1;
			var closeIdx = openIdx + 1;
			while (closeIdx < len && depth > 0) {
				if (code[closeIdx] === "{") depth++;
				else if (code[closeIdx] === "}") depth--;
				closeIdx++;
			}
			if (depth !== 0) break;
			var innerCode = code.substring(openIdx + 1, closeIdx - 1).trim();
			// Parse URL conditions
			var urls = [], urlPrefixes = [], domains = [], regexps = [];
			var condRegex = /(url|domain|url-prefix|regexp)\s*\(\s*(['"]?)(.*?)\2\s*\)/g;
			var m;
			while ((m = condRegex.exec(conditionText))) {
				var val = m[3];
				switch (m[1]) {
					case "url":        urls.push(val); break;
					case "url-prefix": urlPrefixes.push(val); break;
					case "domain":     domains.push(val); break;
					case "regexp":     regexps.push(val); break;
				}
			}
			if (innerCode) {
				sections.push({code: innerCode, urls: urls, urlPrefixes: urlPrefixes, domains: domains, regexps: regexps});
			}
			i = closeIdx;
		}
		if (sections.length === 0) {
			// No @-moz-document blocks found — global style
			sections.push({code: code.trim(), urls: [], urlPrefixes: [], domains: [], regexps: []});
		}
		return sections;
	},

	exportStyles: function() {
		var service = styleService;
		var styles = service.list(0, {});
		var data = styles.map(function(s) {
			return {
				name: s.name,
				code: s.code,
				enabled: s.enabled,
				url: s.url,
				idUrl: s.idUrl,
				updateUrl: s.updateUrl,
				md5Url: s.md5Url,
				originalCode: s.originalCode,
				originalMd5: s.originalMd5,
				sections: stylishCommon._parseSections(s.code)
			};
		});
		var json = JSON.stringify(data, null, 2);

		const ci = Components.interfaces;
		const cc = Components.classes;
		var fp = cc["@mozilla.org/filepicker;1"].createInstance(ci.nsIFilePicker);
		fp.init(window, "Export Styles", ci.nsIFilePicker.modeSave);
		fp.appendFilter("JSON Files", "*.json");
		var now = new Date();
		var dateStr = now.getFullYear()
			+ "-" + String(now.getMonth() + 1).padStart(2, "0")
			+ "-" + String(now.getDate()).padStart(2, "0")
			+ "_" + String(now.getHours()).padStart(2, "0")
			+ "-" + String(now.getMinutes()).padStart(2, "0");
		fp.defaultString = "stylem-backup-" + dateStr + ".json";
		var result = fp.show();
		if (result == ci.nsIFilePicker.returnOK || result == ci.nsIFilePicker.returnReplace) {
			var stream = cc["@mozilla.org/network/file-output-stream;1"].createInstance(ci.nsIFileOutputStream);
			stream.init(fp.file, 0x02 | 0x08 | 0x20, 0o644, 0);
			var conv = cc["@mozilla.org/intl/converter-output-stream;1"].createInstance(ci.nsIConverterOutputStream);
			conv.init(stream, "UTF-8", 0, 0);
			conv.writeString(json);
			conv.close();
		}
	},

	importStyles: function() {
		const ci = Components.interfaces;
		const cc = Components.classes;
		var fp = cc["@mozilla.org/filepicker;1"].createInstance(ci.nsIFilePicker);
		fp.init(window, "Import Styles", ci.nsIFilePicker.modeOpen);
		fp.appendFilter("JSON Files", "*.json");
		if (fp.show() != ci.nsIFilePicker.returnOK) return;

		var stream = cc["@mozilla.org/network/file-input-stream;1"].createInstance(ci.nsIFileInputStream);
		stream.init(fp.file, 0x01, 0, 0);
		var conv = cc["@mozilla.org/intl/converter-input-stream;1"].createInstance(ci.nsIConverterInputStream);
		conv.init(stream, "UTF-8", 0, 0);
		var str = {};
		var json = "";
		while (conv.readString(4096, str) != 0) json += str.value;
		conv.close();

		var raw;
		try {
			raw = JSON.parse(json);
		} catch (ex) {
			alert("Invalid backup file: " + ex.message);
			return;
		}

		// Accept both Stylus format (raw array) and wrapped format (object with .styles array)
		var stylesData;
		if (Array.isArray(raw)) {
			stylesData = raw;
		} else if (raw && raw.type === "stylem-export" && Array.isArray(raw.styles)) {
			stylesData = raw.styles;
		} else {
			alert("This doesn't look like a Stylem or Stylus backup file.");
			return;
		}

		var service = styleService;
		var imported = 0;
		var skipped = 0;
		var errors = 0;
		stylesData.forEach(function(styleData) {
			// Fallback name if the style has no name field
			var name = styleData.name || styleData._name || "";
			if (!name) {
				name = styleData.id ? "Style #" + styleData.id : "Unnamed Style";
			}

			// Determine code — try top-level code first, then sections
			var code = styleData.code || null;
			if (!code && styleData.sections && Array.isArray(styleData.sections)) {
				code = stylishCommon._sectionsToCode(styleData.sections);
			}
			// Some Stylus exports put the raw CSS in sourceCode instead
			if (!code && styleData.sourceCode) {
				code = styleData.sourceCode;
			}
			if (!code) {
				Components.utils.reportError("Stylem import: skipped \"" + name + "\" — no CSS code");
				return;
			}
			// Skip if already installed with same idUrl
			if (styleData.idUrl && service.findByUrl(styleData.idUrl, 0)) {
				Components.utils.reportError("Stylem import: skipped \"" + name + "\" — already installed");
				skipped++;
				return;
			}
			try {
				var style = new Style();
				style.mode = style.CALCULATE_META | style.REGISTER_STYLE_ON_CHANGE;
				style.init(styleData.url || null, styleData.idUrl || null, styleData.updateUrl || null, styleData.md5Url || null, name, code, styleData.enabled || false, styleData.originalCode || null, styleData.originalMd5 || null, null);
				style.save();
				imported++;
			} catch (ex) {
				Components.utils.reportError("Stylem import: failed to import \"" + name + "\": " + ex);
				errors++;
			}
		});
		var msg = "Import complete: " + imported + " imported";
		if (skipped > 0) msg += ", " + skipped + " skipped (already installed)";
		if (errors > 0) msg += ", " + errors + " failed (see Browser Console for details)";
		alert(msg + ".");
	},

	// --- DOM Inspector helpers ---
	generateSelectors: function(node) {
		if (!(node instanceof Element)) return;
		var selectors = [];
		selectors.push(node.nodeName);
		if (node.hasAttribute("id")) selectors.push("#" + node.getAttribute("id"));
		if (node.hasAttribute("class")) {
			var classes = node.getAttribute("class").split(/\s+/);
			selectors.push("." + classes.join("."));
		}
		if (node.attributes.length > 1 || (node.attributes.length == 1 && node.attributes[0].name != "id" && node.attributes[0].name != "class")) {
			var selector = node.nodeName;
			for (var i = 0; i < node.attributes.length; i++) {
				if (node.attributes[i].name != "id") {
					selector += "[" + node.attributes[i].name + "=\"" + node.attributes[i].value + "\"]";
				}
			}
			selectors.push(selector);
		}
		if (!node.hasAttribute("id") && node != node.ownerDocument.documentElement) {
			selectors.push(stylishCommon.getPositionalSelector(node));
		}
		return selectors;
	},

	getPositionalSelector: function(node) {
		if (node instanceof Document) return "";
		if (node.hasAttribute("id")) return "#" + node.getAttribute("id");
		var uniqueChild = true;
		var nodeName = node.nodeName;
		for (var i = 0; i < node.parentNode.childNodes.length; i++) {
			var currentNode = node.parentNode.childNodes[i];
			if (!(currentNode instanceof Element)) continue;
			if (node != currentNode && node.nodeName == currentNode.nodeName) { uniqueChild = false; break; }
		}
		if (uniqueChild) return stylishCommon.getParentPositionalSelector(node) + node.nodeName;
		if (stylishCommon.isCSSFirstChild(node)) return stylishCommon.getParentPositionalSelector(node) + node.nodeName + ":first-child";
		if (stylishCommon.isCSSLastChild(node)) return stylishCommon.getParentPositionalSelector(node) + node.nodeName + ":last-child";
		var elementPosition = 1;
		for (var i = 0; i < node.parentNode.childNodes.length; i++) {
			var currentNode = node.parentNode.childNodes[i];
			if (!(currentNode instanceof Element)) continue;
			if (currentNode == node) break;
			elementPosition++;
		}
		return stylishCommon.getParentPositionalSelector(node) + node.nodeName + ":nth-child(" + elementPosition + ")";
	},

	isCSSFirstChild: function(node) {
		for (var i = 0; i < node.parentNode.childNodes.length; i++) {
			var currentNode = node.parentNode.childNodes[i];
			if (currentNode instanceof Element) return currentNode == node;
		}
		return false;
	},

	isCSSLastChild: function(node) {
		for (var i = node.parentNode.childNodes.length - 1; i >= 0; i--) {
			var currentNode = node.parentNode.childNodes[i];
			if (currentNode instanceof Element) return currentNode == node;
		}
		return false;
	},

	getParentPositionalSelector: function(node) {
		if (node.parentNode instanceof Document) return "";
		return stylishCommon.getPositionalSelector(node.parentNode) + " > ";
	}
};
