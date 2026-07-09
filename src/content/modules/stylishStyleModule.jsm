"use strict";

var EXPORTED_SYMBOLS = ["Style", "styleService"];

Components.utils.import("resource://gre/modules/Services.jsm");
Components.utils.import("chrome://stylem/content/modules/stylishDataSourceModule.jsm");
Components.utils.import("chrome://stylem/content/usercss-parser.js");

function Style() {
	this.id = 0;
	this.url = null;
	this.idUrl = null;
	this.updateUrl = null;
	this.md5Url = null;
	this.originalCode = null;
	this.originalMd5 = null;
	this.appliedInfo = null;
	this.lastSavedCode = null;
	this.applyBackgroundUpdates = null;
	this.mode = this.CALCULATE_META | this.REGISTER_STYLE_ON_CHANGE;

	// these have getters and setters
	this._name = null;
	this._code = null;
	this._enabled = false;

	this.meta = [];
	this.previewOn = false;
	this.appliedInfoToBeCalculated = false;

	// UserCSS metadata
	this.usercssData = null;
}

Style.prototype = {



	CALCULATE_META: 1,
	REGISTER_STYLE_ON_CHANGE: 2,
	REGISTER_STYLE_ON_LOAD: 4,
	INTERNAL_LOAD_EVENT: 8,
	UNREGISTER_STYLE_ON_LOAD: 16,

	list: function(mode, count) {
		var styles = this.findSql("SELECT * FROM styles;", {}, mode);
		styles.sort(this.nameSort);
		count.value = styles.length;
		return styles;
	},

	find: function(id, mode, connection) {
		var styles = this.findSql("SELECT * FROM styles WHERE id = :id;", {id: id}, mode, connection);
		return styles.length > 0 ? styles[0] : null;
	},

	findByUrl: function(url, mode) {
		var styles = this.findSql("SELECT * FROM styles WHERE idUrl = :url;", {url: url}, mode);
		return styles.length > 0 ? styles[0] : null;
	},

	findEnabled: function(enabled, mode, count) {
		var styles = this.findSql("SELECT * FROM styles WHERE enabled = :enabled;", {enabled: enabled}, mode);
		styles.sort(this.nameSort);
		count.value = styles.length;
		return styles;
	},

	findForUrl: function(url, includeGlobal, mode, count) {
		var styles = this.list(mode, {});
		styles = styles.filter(function(style) {
			var isGlobal = style.getTypes({}).indexOf("global") > -1;
			return includeGlobal ? (isGlobal || style.appliesToUrl(url)) : (!isGlobal && style.appliesToUrl(url));
		});
		styles.sort(this.nameSort);
		count.value = styles.length;
		return styles;
	},

	findByMeta: function(name, value, mode, count) {
		var that = this;
		var connection = this.getConnection();
		var statement = connection.createStatement("SELECT style_id FROM style_meta WHERE style_meta.name = :name AND style_meta.value = :value;");
		try {
			this.bind(statement, {name: name, value: value});
			var styles = [];
			while (statement.executeStep()) {
				var s = this.find(this.extract(statement, "style_id"), mode, connection);
				if (s) {
					styles.push(s);
				}
			}
			styles.sort(this.nameSort);
			count.value = styles.length;
			return styles;
		} catch (ex) {
			Components.utils.reportError(ex);
		} finally {
			statement.reset();
			statement.finalize();
			connection.close();
		}
	},

	checkForErrors: function(css, errorListener) {
		var consoleService = Components.classes["@mozilla.org/consoleservice;1"].getService(Components.interfaces.nsIConsoleService);
		consoleService.registerListener(errorListener);
		var windowless = null;
		try {
			try {
				windowless = Services.appShell.createWindowlessBrowser();
				var doc = windowless.document;
				var ns = "http://www.w3.org/1999/xhtml";
				var style = doc.createElementNS(ns, "style");
				style.appendChild(doc.createTextNode(css));
				doc.documentElement.appendChild(style);
				try { style.sheet.cssRules; } catch(e) {}
			} catch(ex) {
				this.getStyleSheet(css);
			}
		} finally {
			var self = this;
			Components.classes["@mozilla.org/timer;1"].createInstance(Components.interfaces.nsITimer).initWithCallback(function() {
				consoleService.unregisterListener(errorListener);
				if (windowless) {
					try { windowless.close(); } catch(e) {}
				}
			}, 10, Components.interfaces.nsITimer.TYPE_ONE_SHOT);
		}
	},

	regexToSample: function(r) {
		var re = /[\.\(\)\[\]]/g;
		var match;
		while ((match = re.exec(r)) !== null) {
			if (r[match.index - 1] != "\\") {
				break;
			}
		}
		if (match == null) {
			return this.unescapeRegexLiterals(r);
		}
		return this.unescapeRegexLiterals(r.substring(0, match.index)) + "...";
	},

	// --- UserCSS metadata parsing (Stylus-compatible) ---
	parseUserCSSMetadata: function(code) {
		if (!code) return null;
		var startMark = "==UserStyle==";
		var endMark = "==/UserStyle==";
		var startIdx = code.indexOf(startMark);
		if (startIdx === -1) return null;
		var endIdx = code.indexOf(endMark, startIdx);
		if (endIdx === -1) return null;
		var block = code.substring(startIdx + startMark.length, endIdx);
		var data = {};
		var lineRe = /@([\w-]+)\s+(.+)/g;
		var m;
		while ((m = lineRe.exec(block)) !== null) {
			var key = m[1].trim();
			var val = m[2].trim();
			if (data[key] === undefined) {
				data[key] = val;
			} else if (Array.isArray(data[key])) {
				data[key].push(val);
			} else {
				data[key] = [data[key], val];
			}
		}
		return data;
	},

	// --- Instance methods ---
	init: function(url, idUrl, updateUrl, md5Url, name, code, enabled, originalCode, originalMd5, applyBackgroundUpdates) {
		var shouldRegister;
		if (this.mode & this.INTERNAL_LOAD_EVENT) {
			this.mode -= this.INTERNAL_LOAD_EVENT;
			shouldRegister = this.shouldRegisterOnLoad();
		} else {
			shouldRegister = this.shouldRegisterOnChange();
		}
		this.initInternal(url, idUrl, updateUrl, md5Url, name, code, enabled, originalCode, originalMd5, shouldRegister, applyBackgroundUpdates);
	},

	get name() { return this._name; },
	set name(name) {
		this.appliedInfo;
		this._name = name;
	},

	get code() { return this._code; },
	set code(code) {
		this.setCode(code, this.shouldRegisterOnChange());
	},

	get enabled() { return this._enabled; },
	set enabled(enabled) {
		if (this.enabled == enabled) return;
		if (enabled) {
			if (this.previewOn) {
				this.previewOn = false;
			} else {
				this.register();
			}
		} else if (!this.previewOn) {
			this.unregister();
		}
		this._enabled = enabled;
	},

	delete: function() {
		if (this.id == 0) throw "Style can't be deleted; it hasn't been saved.";
		this.unregister();
		var connection = this.getConnection();
		var statement = connection.createStatement("DELETE FROM styles WHERE id = :id;");
		this.bind(statement, {id: this.id});
		try {
			statement.execute();
		} finally {
			statement.reset();
			statement.finalize();
		}
		statement = connection.createStatement("DELETE FROM style_meta WHERE style_id = :id;");
		this.bind(statement, {id: this.id});
		try {
			statement.execute();
		} finally {
			statement.reset();
			statement.finalize();
			connection.close();
		}
		Components.classes["@mozilla.org/observer-service;1"].getService(Components.interfaces.nsIObserverService).notifyObservers(this, "stylem-style-delete", String(this.id));
		this.id = 0;
	},

	save: function(reason) {
		var connection = this.getConnection();
		var statement;
		var newStyle = this.id == 0;
		var that = this;
		var data = {};

		if (this.id == 0) {
			statement = connection.createStatement("INSERT INTO styles (`url`, `idUrl`, `updateUrl`, `md5Url`, `name`, `code`, `enabled`, `originalCode`, `applyBackgroundUpdates`, `originalMd5`) VALUES (:url, :idUrl, :updateUrl, :md5Url, :name, :code, :enabled, :originalCode, :applyBackgroundUpdates, :originalMd5);");
		} else {
			statement = connection.createStatement("UPDATE styles SET `url` = :url, `idUrl` = :idUrl, `updateUrl` = :updateUrl, `md5Url` = :md5Url, `name` = :name, `code` = :code, `enabled` = :enabled, `originalCode` = :originalCode, `applyBackgroundUpdates` = :applyBackgroundUpdates, `originalMd5` = :originalMd5 WHERE `id` = :id;");
			data.id = this.id;
		}

		if (!this.updateUrl && !this.md5Url) {
			this.originalCode = null;
			data.originalCode = this.originalCode;
		} else if (this.originalCode == this.code) {
			this.originalCode = null;
			data.originalCode = this.originalCode;
		} else if (this.originalCode) {
			data.originalCode = this.originalCode;
		} else if (this.lastSavedCode != this.code) {
			this.originalCode = this.lastSavedCode;
			data.originalCode = this.originalCode;
		} else {
			data.originalCode = null;
		}

		data.url = this.url;
		data.idUrl = this.idUrl;
		data.updateUrl = this.updateUrl;
		data.md5Url = this.md5Url;
		data.name = this.name;
		data.code = this.code;
		data.enabled = this.enabled;
		data.applyBackgroundUpdates = this.applyBackgroundUpdates;
		data.originalMd5 = this.originalMd5;
		this.bind(statement, data);

		try {
			statement.execute();
		} catch (ex) {
			statement.reset();
			statement.finalize();
			var err = connection.lastError;
			var text = connection.lastErrorString;
			connection.close();
			if (err == 0) throw ex;
			throw err + " " + text;
		}
		if (newStyle) this.id = connection.lastInsertRowID;
		statement.reset();
		statement.finalize();
		this.lastSavedCode = null;

		if (this.meta.length > 0) {
			try {
				connection.beginTransaction();
				if (!newStyle) {
					statement = connection.createStatement("DELETE FROM style_meta WHERE style_id = :id;");
					this.bind(statement, {id: this.id});
					statement.execute();
					statement.finalize();
				}
				statement = connection.createStatement("INSERT INTO style_meta (`style_id`, `name`, `value`) VALUES (:id, :name, :value);");
				this.meta.forEach(function(a) {
					that.bind(statement, {id: that.id, name: a[0], value: a[1]});
					statement.execute();
				});
				connection.commitTransaction();
			} finally {
				statement.reset();
				statement.finalize();
			}
		}

		connection.close();
		Components.classes["@mozilla.org/observer-service;1"].getService(Components.interfaces.nsIObserverService).notifyObservers(this, newStyle ? "stylem-style-add" : "stylem-style-change", String(this.id));
	},

	appliesToUrl: function(url) {
		if (this.urlRules.some(function(rule) { return url == rule; })) return true;
		if (this.urlPrefixRules.some(function(rule) { return url.indexOf(rule) == 0; })) return true;
		var domain;
		try {
			domain = this.ios.newURI(url, null, null).host;
		} catch (ex) {
			return false;
		}
		if (this.domainRules.some(function(rule) {
			if (rule == domain) return true;
			var i = domain.lastIndexOf("." + rule);
			return i != -1 && (i + 1 + rule.length == domain.length);
		})) {
			return true;
		}
		return this.regexpRules.some(function(rule) {
			if (!rule || rule.length > 200 || /\(.+[{*+][?+*]/.test(rule)) return false;
			try {
				var re = new RegExp(this.ensureFullMatchRegexp(rule));
			} catch (ex) {
				return false;
			}
			return re.test(url);
		}, this);
	},

	setPreview: function(on) {
		if (this.previewOn == on) return;
		if (!this.enabled) {
			if (on) this.register();
			else this.unregister();
		}
		this.previewOn = on;
	},

	revert: function() {
		if (this.lastSavedCode) {
			this.code = this.lastSavedCode;
			this.lastSavedCode = null;
		}
	},

	addMeta: function(name, value) {
		this.meta.push([name, value]);
	},

	removeMeta: function(name, value) {
		this.meta = this.meta.filter(function(e) {
			return e[0] != name || e[1] != value;
		});
	},

	removeAllMeta: function(name) {
		this.meta = this.meta.filter(function(e) {
			return e[0] != name;
		});
	},

	getMeta: function(name, count) {
		var vals = this.meta.filter(function(e) {
			return e[0] == name;
		}).map(function(e) {
			return e[1];
		});
		count.value = vals.length;
		return vals;
	},

	getTypes: function(count) {
		count.value = this.types.length;
		return this.types;
	},

	get md5() {
		if (this.originalMd5 != null) return this.originalMd5;
		var converter = Components.classes["@mozilla.org/intl/scriptableunicodeconverter"].createInstance(Components.interfaces.nsIScriptableUnicodeConverter);
		converter.charset = "UTF-8";
		var result = {};
		var data = converter.convertToByteArray(this.originalCode || this.code, {});
		var ch = Components.classes["@mozilla.org/security/hash;1"].createInstance(Components.interfaces.nsICryptoHash);
		ch.init(ch.MD5);
		ch.update(data, data.length);
		var hash = ch.finish(false);
		function toHexString(charCode) { return ("0" + charCode.toString(16)).slice(-2); }
		var res = "";
		for (var i in hash) { res += toHexString(hash.charCodeAt(i)); }
		return res;
	},

	checkForUpdates: function(observer) {
		var that = this;
		var observerService = Components.classes["@mozilla.org/observer-service;1"].getService(Components.interfaces.nsIObserverService);
		observerService.notifyObservers(that, "stylem-style-update-check-start", null);
		if (observer) observer.observe(that, "stylem-style-update-check-start", null);

		function notifyDone(result) {
			observerService.notifyObservers(that, "stylem-style-update-check-done", result);
			if (observer) observer.observe(that, "stylem-style-update-check-done", result);
		}
		function handleFailure() { notifyDone("update-check-error"); }

		if (this.md5Url) {
			var handleMd5 = function(text) {
				if (text.length != 32) {
					Components.utils.reportError("Could not update '" + that.name + "' - '" + that.md5Url + "' did not return a md5 hash.");
					notifyDone("no-update-available");
				} else if (text == that.md5) {
					notifyDone("no-update-available");
				} else {
					notifyDone("update-available");
				}
			};
			this.download(this.md5Url, handleMd5, handleFailure);
		} else if (this.updateUrl) {
			var handleUpdateUrl = function(text, contentType) {
				if (contentType != "text/css") {
					Components.utils.reportError("Could not update '" + that.name + "' - '" + that.updateUrl + "' returned content type '" + contentType + "'.");
					notifyDone("no-update-available");
				} else if (text.replace(/\s/g,"") == (that.originalCode || that.code).replace(/\s/g,"")) {
					notifyDone("no-update-available");
				} else {
					notifyDone("update-available");
				}
			};
			this.download(this.updateUrl, handleUpdateUrl, handleFailure);
		} else {
			notifyDone("no-update-possible");
		}
	},

	applyUpdate: function(observer) {
		var observerService = Components.classes["@mozilla.org/observer-service;1"].getService(Components.interfaces.nsIObserverService);
		observerService.notifyObservers(this, "stylem-style-update-start", null);
		var that = this;

		function notifyDone(result) {
			observerService.notifyObservers(that, "stylem-style-update-done", result);
			if (observer) observer.observe(that, "stylem-style-update-done", result);
		}
		function handleFailure() { notifyDone("update-failure"); }
		function handleSuccess(code, contentType) {
			if (contentType != "text/css") {
				Components.utils.reportError("Could not update '" + that.name + "' - '" + that.updateUrl + "' returned content type '" + contentType + "'.");
				notifyDone("update-failure");
				return;
			}
			that.originalCode = code;
			that.code = code;
			that.downloadMd5(that.md5Url, function(md5Sum) {
				if (md5Sum != null) that.originalMd5 = md5Sum;
				that.save("update");
				notifyDone("update-success");
			});
		}
		if (this.updateUrl) {
			this.download(this.updateUrl, handleSuccess, handleFailure);
		} else {
			notifyDone("no-update-possible");
		}
	},

	getPrettyAppliesTo: function(count) {
		var urls = this.getMeta("url", {});
		var urlPrefixes = this.getMeta("url-prefix", {});
		var domains = this.getMeta("domain", {});
		var regexps = this.getMeta("regexp", {});

		domains = domains.filter(function(possibleSubdomain) {
			return !domains.some(function(possibleRootDomain) {
				return possibleSubdomain.endsWith("." + possibleRootDomain);
			});
		});

		function doesntMatchDomainRule(url) {
			var domain;
			try {
				domain = this.ios.newURI(url, null, null).host;
			} catch (ex) {
				return true;
			}
			return !domains.some(function(d) {
				return domain == d || domain.endsWith("." + d);
			});
		}
		urls = urls.filter(doesntMatchDomainRule, this);
		// Don't filter urlPrefixes — they may target subpaths that are
		// more specific than a broad domain rule (e.g. /monitor vs *).

		var r = domains
			.concat(urlPrefixes.map(function(up) { return up + "*"; }))
			.concat(urls)
			.concat(regexps);

		count.value = r.length;
		return r;
	},

	// --- Private helpers ---
	get ds() {
		var ds = dataSource;
		this.__defineGetter__("ds", function() { return ds; });
		return ds;
	},
	HTMLNS: "http://www.w3.org/1999/xhtml",
	ios: Components.classes["@mozilla.org/network/io-service;1"].getService(Components.interfaces.nsIIOService),
	sss: Components.classes["@mozilla.org/content/style-sheet-service;1"].getService(Components.interfaces.nsIStyleSheetService),

	getStyleSheet: function(code) {
		var parser = Components.classes["@mozilla.org/xmlextras/domparser;1"].createInstance(Components.interfaces.nsIDOMParser);
		var doc1 = parser.parseFromString("<html xmlns='" + this.HTMLNS + "'/>", "application/xhtml+xml");
		var doc = doc1.implementation.createDocument(this.HTMLNS, "stylem-parse", null);
		var style = doc.createElementNS(this.HTMLNS, "style");
		style.appendChild(doc.createTextNode(code));

		var mozDocContentEnabledPrefName = "layout.css.moz-document.content.enabled";
		var initialMozDocContentEnabled, currentMozDocContentEnabled;
		try {
			initialMozDocContentEnabled = currentMozDocContentEnabled = Services.prefs.getBoolPref(mozDocContentEnabledPrefName);
		} catch (ex) {}
		if (currentMozDocContentEnabled === false) {
			Services.prefs.setBoolPref(mozDocContentEnabledPrefName, true);
			currentMozDocContentEnabled = true;
		}
		doc.documentElement.appendChild(style);
		if (currentMozDocContentEnabled !== initialMozDocContentEnabled) {
			Services.prefs.setBoolPref(mozDocContentEnabledPrefName, initialMozDocContentEnabled);
		}
		return doc.styleSheets[0];
	},

	calculateInternalMeta: function() {
		if (!this.shouldCalculateMeta()) return;

		// Try to parse UserCSS metadata first
		var ucssData = this.parseUserCSSMetadata(this._code);
		if (ucssData) {
			this.usercssData = ucssData;
		}

		var sheet = this.getStyleSheet(this._code);

		this.removeAllMeta("url");
		this.removeAllMeta("url-prefix");
		this.removeAllMeta("domain");
		this.removeAllMeta("regexp");
		this.removeAllMeta("type");

		// Extract @-moz-document conditions by scanning the raw code.
		// Handles both CSS-style braces blocks (including multi-line conditions)
		// and preprocessor styles (Stylus, LESS) whose body uses no braces.
		var condRe = /(?:(url|domain|url-prefix|regexp)\s*\('([^']+?)'\)\s*)|(?:(url|domain|url-prefix|regexp)\s*\("([^"]+?)"\)\s*),?\s*|(?:(url|domain|url-prefix)\s*\(([^\)]+?)\)\s*)/g;
		var searchFrom = 0;
		while (true) {
			var docIdx = this._code.indexOf("@-moz-document", searchFrom);
			if (docIdx === -1) break;
			var condStart = docIdx + 14;
			var parenDepth = 0;
			var condEnd = -1;
			for (var j = condStart; j < this._code.length; j++) {
				var c = this._code[j];
				if (c === '(') parenDepth++;
				else if (c === ')') parenDepth--;
				else if (c === '{' && parenDepth === 0) { condEnd = j; break; }
				else if (c === '\n' && parenDepth === 0) {
					var k = j - 1;
					while (k >= condStart && (this._code[k] === ' ' || this._code[k] === '\t')) k--;
					if (k < condStart || (this._code[k] !== ',' && this._code[k] !== '(')) {
						condEnd = j;
						break;
					}
				}
			}
			if (condEnd === -1) condEnd = this._code.length;
			var conditionText = this._code.substring(condStart, condEnd).trim();
			if (conditionText) {
				var match;
				condRe.lastIndex = 0;
				while ((match = condRe.exec(conditionText)) != null) {
					var type = match[1] || match[3] || match[5];
					var value = this.unescapeCss(match[2] || match[4] || match[6]);
					switch (type) {
						case "url":        this.addMeta("url", value); break;
						case "url-prefix": this.addMeta("url-prefix", value); break;
						case "domain":     this.addMeta("domain", value); break;
						case "regexp":     this.addMeta("regexp", value); break;
						default:
							Components.utils.reportError("Unknown -moz-doc rule type '" + type + "'");
					}
				}
			}
			searchFrom = condStart;
		}

		var namespaces = Array.filter(sheet.cssRules, function(rule) {
			if ("NAMESPACE_RULE" in Components.interfaces.nsIDOMCSSRule) {
				return rule.type == Components.interfaces.nsIDOMCSSRule.NAMESPACE_RULE;
			}
			return rule.type == Components.interfaces.nsIDOMCSSRule.UNKNOWN_RULE && rule.cssText.indexOf("@namespace") == 0;
		}).map(function(rule) {
			var text = rule.cssText.replace(/\"/g, "");
			var start = text.indexOf("url(");
			var end = text.lastIndexOf(")");
			return text.substring(start + 4, end);
		});

		var hasGlobal = Array.some(sheet.cssRules, function(rule) {
			return rule.type == Components.interfaces.nsIDOMCSSRule.STYLE_RULE;
		});

		var appPattern = /^(chrome|about|x-jsd)/;
		var genericPattern = /^[^:]+:?\/*$/;
		var that = this;
		var urlLikeRules = this.urlRules.concat(this.urlPrefixRules);

		if (namespaces.indexOf("http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul") != -1 || urlLikeRules.some(function(url) { return appPattern.test(url); }))
			this.addMeta("type", "app");
		else if (
			(hasGlobal && (namespaces.length == 0 || namespaces.indexOf(this.HTMLNS) != -1))
			|| urlLikeRules.some(function(url) { return genericPattern.test(url); })
			|| this.regexpRules.some(function(r) { return (new RegExp(that.ensureFullMatchRegexp(r))).test("http://www.somesiteimadeup.com/"); })
		)
			this.addMeta("type", "global");
		else
			this.addMeta("type", "site");
	},

	get dataUrl() {
		if (!this.code) return null;
		var css = this.code;
		// Apply UserCSS variables if we have serialised values stored
		var userCSSVals = this.getMeta("usercssVars", {});
		if (userCSSVals.length > 0 && typeof userCSSParser !== "undefined") {
			var parsed = userCSSParser.parse(css);
			if (!parsed.error && parsed.vars.length > 0) {
				parsed.vars = userCSSParser.deserializeVars(parsed.vars, userCSSVals[0]);
				css = userCSSParser.applyVars(css, parsed.vars, parsed.meta.preprocessor);
			}
		}
		var nameComment = this.name ? "/*" + this.name.replace(/\*\//g, "").replace(/#/g, "") + "*/" : "";
		css = nameComment + css;
		return this.ios.newURI("data:text/css," + encodeURIComponent(css), null, null);
	},

	register: function() {
		if (!this.stylishOn) {
			Components.utils.reportError("Stylem: register() called but styleRegistrationEnabled is false");
			return;
		}
		var dataUrl = this.dataUrl;
		if (!dataUrl) {
			Components.utils.reportError("Stylem: register() called but dataUrl is null (code may be empty)");
			return;
		}
		var registrationMethod = this.calculateRegistrationMethod();
		this.appliedInfo = [dataUrl, registrationMethod];
		if (!this.sss.sheetRegistered(dataUrl, registrationMethod)) {
			try {
				this.sss.loadAndRegisterSheet(dataUrl, registrationMethod);
			} catch (ex) {
				Components.utils.reportError("Stylem: loadAndRegisterSheet failed for style #" + this.id + " (" + (this.name || "unnamed") + "): " + ex);
			}
		}
	},

	unregister: function() {
		var unregisterUrl;
		var unregisterMethod;
		if (this.shouldUnregisterOnLoad()) {
			unregisterUrl = this.dataUrl;
			unregisterMethod = this.calculateRegistrationMethod();
		} else if (this.appliedInfo == null) {
			return;
		} else {
			unregisterUrl = this.appliedInfo[0];
			unregisterMethod = this.appliedInfo[1];
		}

		if (this.sss.sheetRegistered(unregisterUrl, unregisterMethod)) {
			try {
				this.sss.unregisterSheet(unregisterUrl, unregisterMethod);
			} catch (ex) {
				Components.utils.reportError("Stylem: unregisterSheet failed: " + ex);
			}
		} else if (this.stylishOn) {
			Components.utils.reportError("Stylem: stylesheet is supposed to be unregistered, but it's not registered in the first place.");
		}
		this.appliedInfo = null;
	},

	bind: function(statement, data) {
		let params = statement.newBindingParamsArray();
		let binding = params.newBindingParams();
		for (let [name, value] of Object.entries(data)) {
			let index;
			try {
				index = statement.getParameterIndex(":" + name);
			} catch (ex) {
				if (ex.name == "NS_ERROR_ILLEGAL_VALUE") {
					index = statement.getParameterIndex(name);
				} else {
					throw ex;
				}
			}
			if (value === undefined) throw "Attempted to bind undefined parameter '" + name + "'";
			else if (value !== null && !["string", "number", "boolean"].includes(typeof value))
				throw "Unknown value type '" + typeof value + "' for value '" + value + "'";
			if (typeof value === "boolean") value = +value;
			binding.bindByIndex(index, value);
		}
		params.addParams(binding);
		statement.bindParameters(params);
	},

	extract: function(statement, name) {
		var index = statement.getColumnIndex(name);
		var type = statement.getTypeOfIndex(index);
		switch (type) {
			case statement.VALUE_TYPE_NULL:    return null;
			case statement.VALUE_TYPE_INTEGER: return statement.getInt32(index);
			case statement.VALUE_TYPE_FLOAT:   return statement.getDouble(index);
			case statement.VALUE_TYPE_TEXT:    return statement.getString(index);
			case statement.VALUE_TYPE_BLOB:    return statement.getBlob(index);
			default: throw "Unrecognized column type " + type;
		}
	},

	get appliedInfo() {
		if (this.appliedInfoToBeCalculated) {
			this.appliedInfo = [this.dataUrl, this.calculateRegistrationMethod()];
			this.appliedInfoToBeCalculated = false;
		}
		return this._appliedInfo;
	},
	set appliedInfo(info) { this._appliedInfo = info; },

	findSql: function(sql, parameters, mode, connection) {
		var closeConnection = false;
		if (!connection) {
			connection = this.getConnection();
			closeConnection = true;
		}
		var statement = connection.createStatement(sql);
		this.bind(statement, parameters);
		try {
			var that = this;
			var e = function(name) { return that.extract(statement, name); };
			var styles = [];
			var styleMap = [];
			while (statement.executeStep()) {
				var style = new Style();
				if (mode & this.CALCULATE_META)
					style.mode = mode - this.CALCULATE_META;
				else
					style.mode = mode;
				style.mode += this.INTERNAL_LOAD_EVENT;
				style.init(e("url"), e("idUrl"), e("updateUrl"), e("md5Url"), e("name"), e("code"), e("enabled"), e("originalCode"), e("originalMd5"), e("applyBackgroundUpdates"));
				style.id = e("id");
				styles.push(style);
				styleMap[style.id] = style;
			}
		} finally {
			statement.reset();
			statement.finalize();
		}

		var styleIds = styles.map(function(style) { return style.id; });
		if (styleIds.length > 0) {
			var metaStatement = connection.createStatement("SELECT * FROM style_meta WHERE style_id IN (" + styleIds.join(",") + ");");
			try {
				while (metaStatement.executeStep()) {
					styleMap[this.extract(metaStatement, "style_id")].addMeta(this.extract(metaStatement, "name"), this.extract(metaStatement, "value"));
				}
			} finally {
				metaStatement.reset();
				metaStatement.finalize();
			}
		}

		styles.forEach(function(style) {
			if (style.mode != mode) style.mode = mode;
		});

		// Re-register styles that have UserCSS variables now that metadata is loaded.
		// During init(), register() is called before metadata is available, so the
		// dataUrl getter couldn't apply variable substitutions. Only re-register if
		// the original mode requested registration (not for lookup-only queries).
		var needsRegistrationMode = (mode & this.REGISTER_STYLE_ON_LOAD) || (mode & this.REGISTER_STYLE_ON_CHANGE);
		if (needsRegistrationMode && typeof userCSSParser !== "undefined") {
			styles.forEach(function(style) {
				if (!style.enabled && !style.previewOn) return;
				var userCSSVals = style.getMeta("usercssVars", {});
				if (userCSSVals.length === 0) return;
				style.unregister();
				style.register();
			});
		}

		if (closeConnection) connection.close();
		return styles;
	},

	shouldCalculateMeta: function() { return this.mode & this.CALCULATE_META; },
	shouldRegisterOnChange: function() { return this.mode & this.REGISTER_STYLE_ON_CHANGE; },
	shouldRegisterOnLoad: function() { return this.mode & this.REGISTER_STYLE_ON_LOAD; },
	shouldUnregisterOnLoad: function() { return this.mode & this.UNREGISTER_STYLE_ON_LOAD; },

	setCode: function(code, shouldRegister) {
		this.appliedInfo;
		if (!this.lastSavedCode && this.code && this.id)
			this.lastSavedCode = this.code;
		this._code = code;
		if ((this.enabled || this.previewOn) && shouldRegister) {
			this.unregister();
			this.register();
		}
		this.calculateInternalMeta();
	},

	initInternal: function(url, idUrl, updateUrl, md5Url, name, code, enabled, originalCode, originalMd5, shouldRegister, applyBackgroundUpdates) {
		this.url = url;
		this.idUrl = idUrl;
		this.updateUrl = updateUrl;
		this.md5Url = md5Url;
		this.name = name;
		this._enabled = enabled;
		this.originalCode = originalCode;
		this.originalMd5 = originalMd5;
		this.setCode(code, shouldRegister);
		if (!shouldRegister && this.enabled) {
			this.appliedInfoToBeCalculated = true;
		}
		if (this.shouldUnregisterOnLoad()) this.unregister();
		var abu = 1;
		if (applyBackgroundUpdates != null) {
			try { abu = parseInt(applyBackgroundUpdates); } catch (ex) {}
		}
		this.applyBackgroundUpdates = abu;
	},

	get urlRules() { return this.getMeta("url", {}); },
	get urlPrefixRules() { return this.getMeta("url-prefix", {}); },
	get domainRules() { return this.getMeta("domain", {}); },
	get regexpRules() { return this.getMeta("regexp", {}); },
	get types() { return this.getMeta("type", {}); },

	download: function(url, successCallback, failureCallback) {
		if (!/^https?:\/\//i.test(url)) {
			Components.utils.reportError("Download of '" + url + "' failed - only http and https URLs are allowed.");
			if (failureCallback) failureCallback();
			return;
		}
		var request = Components.classes["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance();
		var me = this;
		request.QueryInterface(Components.interfaces.nsIDOMEventTarget);
		request.addEventListener("readystatechange", function(event) {
			if (request.readyState == 4) {
				if (request.status == 200 && request.responseText) {
					var contentType = request.getResponseHeader("Content-type");
					if (contentType != null && contentType.indexOf(";") > -1) {
						contentType = contentType.split(";")[0];
					}
					successCallback(request.responseText, contentType);
				} else {
					Components.utils.reportError("Download of '" + url + "' resulted in status " + request.status);
					if (failureCallback) failureCallback();
				}
			}
		}, false);
		request.QueryInterface(Components.interfaces.nsIXMLHttpRequest);
		try {
			request.open("GET", url, true);
		} catch(ex) {
			Components.utils.reportError("Could not download URL '" + url + "'.");
			if (failureCallback) failureCallback();
			return;
		}
		request.send(null);
	},

	get stylishOn() {
		return Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefBranch).getBoolPref("extensions.stylem.styleRegistrationEnabled");
	},

	getConnection: function() { return this.ds.getConnection(); },

	unescapeCss: function(s) {
		return s.replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
	},
	unescapeRegexLiterals: function(s) { return s.replace(/\\/g, ""); },

	calculateRegistrationMethod: function() {
		// Use USER_SHEET for correct cascade priority.
		//
		// Cascade order (lowest → highest):
		//   AGENT_SHEET (<html> default styles)
		//   USER_SHEET  (user styles — this is where user CSS belongs)
		//   AUTHOR_SHEET (page's own CSS, normal declarations)
		//   AUTHOR !important
		//   USER !important
		//   AGENT !important
		//
		// With AGENT_SHEET the rule `body { color: red }` is immediately
		// overridden by any page stylesheet that sets `color` on `body`,
		// which most pages do — so user styles appear broken.
		// USER_SHEET gives a user style the correct weight: it beats normal
		// page declarations but is still overridden by page !important.
		//
		// Both USER_SHEET and AGENT_SHEET apply to all documents (content
		// and chrome) immediately upon registration — only AUTHOR_SHEET
		// has the restriction that it only affects documents created after
		// registration.
		return this.sss.USER_SHEET;
	},

	downloadMd5: function(md5Url, callback) {
		if (!md5Url) { callback(null); return; }
		this.download(md5Url, function(text, contentType) {
			if (text.length == 32) {
				callback(text);
			} else {
				Components.utils.reportError("Invalid md5 at URL '" + md5Url + "'.");
				callback(null);
			}
		}, null);
	},

	ensureFullMatchRegexp: function(pattern) {
		if (pattern == null) return pattern;
		if (pattern[0] != "^") pattern = "^" + pattern;
		if (pattern[pattern.length - 1] != "$") pattern = pattern + "$";
		return pattern;
	},

	nameSort: function(a, b) { return a.name.localeCompare(b.name); }
};


// Singleton service instance — the one object returned by
// Components.classes["@stylem.ext/style;1"].getService()
var styleService = new Style();
