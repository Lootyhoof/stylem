"use strict";

Components.utils.import("chrome://stylem/content/modules/stylishStyleModule.jsm");
Components.utils.import("resource://gre/modules/Services.jsm");
Components.utils.import("chrome://stylem/content/usercss-parser.js");

var installTab = {

	css: null,
	sourceUrl: null,
	parsed: null,
	style: null,
	vars: null,
	previewing: false,

	_str: function(key, args) {
		var bundle = document.getElementById("strings");
		if (args) {
			return bundle.getFormattedString(key, args);
		}
		return bundle.getString(key);
	},

	init: function() {
		// Read data set by the overlay on the browser window
		var browserWin = Services.wm.getMostRecentWindow("navigator:browser");
		if (!browserWin) return;

		this.css       = browserWin.stylemPendingInstallCSS || null;
		this.sourceUrl = browserWin.stylemPendingInstallSourceUrl || null;
		var alreadyInstalled = browserWin.stylemPendingInstallAlreadyInstalled || false;

		// Clean up globals
		delete browserWin.stylemPendingInstallCSS;
		delete browserWin.stylemPendingInstallSourceUrl;
		delete browserWin.stylemPendingInstallAlreadyInstalled;

		if (alreadyInstalled && this.css) {
			this.parsed = userCSSParser.parse(this.css);
			this._showAlreadyInstalled();
			return;
		}

		if (!this.css) {
			this._showError(this._str("cssNotFound"));
			return;
		}

		this.parsed = userCSSParser.parse(this.css);
		if (this.parsed.error && !this.parsed.meta["name"]) {
			this._showError(this._str("invalidUserCSS", [this.parsed.error]));
			return;
		}

		// Show the install view
		document.getElementById("install-view").hidden = false;

		// Deep-copy vars so we can mutate values
		this.vars = this.parsed.vars.map(function(v) { return Object.assign({}, v); });

		// Restore saved variable values if this style is already installed
		this._restoreSavedVars();

		var name = this.parsed.meta["name"] || (this.sourceUrl ? this.sourceUrl.split("/").pop().replace(".user.css", "") : this._str("untitledStyle"));
		this.installName = name;
		this.installUpdateUrl = this.parsed.meta["updateURL"] || this.sourceUrl || null;
		document.getElementById("install-confirm").setAttribute("value", this._str("installConfirm", [name]));

		this._showPreprocessorWarning();
		this._populateVars();
		this._buildStyle();
		this._updateAppliesToDisplay();

		// Show the raw CSS in the code pane via CodeMirror iframe
		this._setCSSDisplay(this.css);

		// Set the window title
		document.title = this._str("installTitle", [name]);
	},

	_showAlreadyInstalled: function() {
		document.getElementById("already-installed-view").hidden = false;
		var name = this.parsed && this.parsed.meta && this.parsed.meta["name"]
			|| (this.sourceUrl ? this.sourceUrl.split("/").pop().replace(".user.css", "") : this._str("untitledStyle"));
		var msg = this._str("usercss.alreadyinstalled.message", [name]);
		document.getElementById("already-installed-label").setAttribute("value", msg);
		document.title = this._str("alreadyInstalledTitle", [name]);

		// Look up the existing style so we can open it in the editor
		this._existingStyleId = null;
		try {
			var idUrl = userCSSParser.makeIdUrl(this.parsed.meta, this.sourceUrl);
			if (idUrl) {
				var existing = styleService.findByUrl(idUrl, 0);
				if (existing) {
					this._existingStyleId = existing.id;
				}
			}
		} catch (e) {}
		var editBtn = document.getElementById("edit-style-button");
		editBtn.hidden = !this._existingStyleId;
	},

	editExistingStyle: function() {
		if (this._existingStyleId) {
			stylishCommon.openEditForId(this._existingStyleId);
		}
	},

	_showPreprocessorWarning: function() {
		var meta = this.parsed.meta;
		var warning = userCSSParser.getPreprocessorWarning(meta["preprocessor"]);
		var el = document.getElementById("preprocessor-warning");
		if (warning) {
			el.textContent = warning;
			el.removeAttribute("hidden");
		} else {
			el.setAttribute("hidden", "true");
		}
	},

	_populateVars: function() {
		if (!this.vars || this.vars.length === 0) return;

		var rows = document.getElementById("vars-rows");
		var that = this;

		var regularVars = this.vars.filter(function(v) { return !v.advanced; });
		var advancedVars = this.vars.filter(function(v) { return v.advanced; });

		function appendVar(v, idx) {
			var row = document.createElementNS(stylishCommon.XULNS, "row");
			row.setAttribute("align", "center");
			row.setAttribute("class", "var-row");

			var labelCell = document.createElementNS(stylishCommon.XULNS, "label");
			labelCell.setAttribute("value", v.label);
			labelCell.setAttribute("class", "var-label");
			labelCell.setAttribute("crop", "end");

			var controlCell = document.createElementNS(stylishCommon.XULNS, "hbox");
			controlCell.setAttribute("flex", "1");
			controlCell.setAttribute("align", "center");

			var control = that._makeControl(v, idx);
			if (control) controlCell.appendChild(control);

			row.appendChild(labelCell);
			row.appendChild(controlCell);
			rows.appendChild(row);
		}

		if (regularVars.length > 0) {
			document.getElementById("vars-box").removeAttribute("hidden");
			regularVars.forEach(function(v) {
				appendVar(v, that.vars.indexOf(v));
			});
		}

		if (advancedVars.length > 0) {
			var varsBox = document.getElementById("vars-box");
			var advRows = [];
			advancedVars.forEach(function(v) {
				appendVar(v, that.vars.indexOf(v));
				advRows.push(rows.lastChild);
			});

			var advToggle = document.createElementNS(stylishCommon.XULNS, "checkbox");
			advToggle.setAttribute("label", this._str("advancedToggle", [advancedVars.length]));
			advToggle.setAttribute("style", "margin: 2px 0 4px 2px;");

			function updateAdvanced(show) {
				advRows.forEach(function(r) { r.hidden = !show; });
				if (regularVars.length === 0) {
					varsBox.hidden = !show;
				}
			}
			advToggle.addEventListener("command", function() {
				updateAdvanced(this.checked);
			}, false);
			updateAdvanced(false);

			varsBox.parentNode.insertBefore(advToggle, varsBox);
		}
	},

	_makeControl: function(v, idx) {
		var that = this;
		var XULNS = stylishCommon.XULNS;

		function onChange(newVal) {
			that.vars[idx].value = newVal;
			that._buildStyle();
			that._updateAppliesToDisplay();
			if (that.previewing) that._applyPreview();
		}

		switch (v.type) {
			case "color": {
				var cp = document.createElementNS(XULNS, "colorpicker");
				cp.setAttribute("type", "button");
				cp.setAttribute("color", v.value || v.defaultValue);
				cp.setAttribute("class", "var-colorpicker");
				cp.addEventListener("change", function() {
					onChange(this.color);
				}, false);
				var hbox = document.createElementNS(XULNS, "hbox");
				hbox.setAttribute("align", "center");
				var colorText = document.createElementNS(XULNS, "textbox");
				colorText.setAttribute("value", v.value || v.defaultValue);
				colorText.setAttribute("size", "9");
				colorText.setAttribute("class", "var-color-text");
				colorText.addEventListener("change", function() {
					var val = this.value.trim();
					cp.setAttribute("color", val);
					onChange(val);
				}, false);
				cp.addEventListener("change", function() {
					colorText.value = this.color;
				}, false);
				hbox.appendChild(cp);
				hbox.appendChild(colorText);
				return hbox;
			}
			case "checkbox": {
				var cb = document.createElementNS(XULNS, "checkbox");
				cb.setAttribute("checked", v.value === "1");
				cb.setAttribute("class", "var-checkbox");
				cb.addEventListener("command", function() {
					onChange(this.checked ? "1" : "0");
				}, false);
				return cb;
			}
			case "select":
		case "dropdown": {
				var ml = document.createElementNS(XULNS, "menulist");
				ml.setAttribute("class", "var-menulist");
				var mp = document.createElementNS(XULNS, "menupopup");
				(v.options || []).forEach(function(opt) {
					var mi = document.createElementNS(XULNS, "menuitem");
					mi.setAttribute("label", opt.label);
					mi.setAttribute("value", opt.value);
					if (opt.value === (v.value || v.defaultValue)) {
						mi.setAttribute("selected", "true");
					}
					mp.appendChild(mi);
				});
				ml.appendChild(mp);
				ml.addEventListener("command", function() {
					onChange(this.selectedItem ? this.selectedItem.getAttribute("value") : this.value);
				}, false);
				ml.value = v.value || v.defaultValue;
				return ml;
			}
			case "text": {
				var tb = document.createElementNS(XULNS, "textbox");
				tb.setAttribute("value", v.value || v.defaultValue || "");
				tb.setAttribute("flex", "1");
				tb.setAttribute("class", "var-textbox");
				tb.addEventListener("change", function() {
					onChange(this.value);
				}, false);
				return tb;
			}
			case "number": {
				var nbx = document.createElementNS(XULNS, "textbox");
				nbx.setAttribute("value", v.value || v.defaultValue || "0");
				nbx.setAttribute("size", "8");
				nbx.setAttribute("class", "var-number");
				nbx.setAttribute("type", "number");
				if (v.min !== null) nbx.setAttribute("min", v.min);
				if (v.max !== null) nbx.setAttribute("max", v.max);
				nbx.addEventListener("change", function() {
					var n = parseFloat(this.value);
					if (!isNaN(n)) {
						if (v.min !== null && n < parseFloat(v.min)) n = parseFloat(v.min);
						if (v.max !== null && n > parseFloat(v.max)) n = parseFloat(v.max);
						this.value = String(n);
						onChange(String(n));
					}
				}, false);
				if (v.unit) {
					var unitHbox = document.createElementNS(XULNS, "hbox");
					unitHbox.setAttribute("align", "center");
					var unitLabel = document.createElementNS(XULNS, "label");
					unitLabel.setAttribute("value", v.unit);
					unitLabel.setAttribute("class", "var-unit");
					unitHbox.appendChild(nbx);
					unitHbox.appendChild(unitLabel);
					return unitHbox;
				}
				return nbx;
			}
			case "range": {
				var outer = document.createElementNS(XULNS, "hbox");
				outer.setAttribute("align", "center");
				outer.setAttribute("flex", "1");
				var scale = document.createElementNS(XULNS, "scale");
				scale.setAttribute("flex", "1");
				scale.setAttribute("min", v.min || "0");
				scale.setAttribute("max", v.max || "100");
				scale.setAttribute("increment", v.step || "1");
				scale.setAttribute("value", parseFloat(v.value || v.defaultValue) || 0);
				scale.setAttribute("class", "var-scale");
				var valLabel = document.createElementNS(XULNS, "label");
				valLabel.setAttribute("value", (v.value || v.defaultValue) + (v.unit || ""));
				valLabel.setAttribute("class", "var-range-value");
				valLabel.setAttribute("style", "min-width: 4em; text-align: right;");
				scale.addEventListener("change", function() {
					var newVal = String(this.value);
					valLabel.setAttribute("value", newVal + (v.unit || ""));
					onChange(newVal);
				}, false);
				outer.appendChild(scale);
				outer.appendChild(valLabel);
				return outer;
			}
			default:
				return null;
		}
	},

	_buildStyle: function() {
		var meta    = this.parsed.meta;
		var css     = this.css;
		var rawCss  = css;

		var sourceUrl = this.sourceUrl;
		var idUrl     = userCSSParser.makeIdUrl(meta, sourceUrl);

		if (!this.style) {
			this.style = new Style();
		}

		if (this.vars.length > 0) {
			this.style.removeAllMeta("usercssVars");
			this.style.addMeta("usercssVars", userCSSParser.serializeVars(this.vars));
		}

		this.style.mode = this.style.CALCULATE_META | this.style.REGISTER_STYLE_ON_CHANGE;
		this.style.init(
			sourceUrl,
			idUrl,
			this.installUpdateUrl,
			null,
			this.installName,
			rawCss,
			false,
			rawCss,
			null,
			null
		);
	},

	_applyPreview: function() {
		this._buildStyle();
		this.style.setPreview(true);
		this.previewing = true;
	},

	_restoreSavedVars: function() {
		var idUrl = userCSSParser.makeIdUrl(this.parsed.meta, this.sourceUrl);
		if (!idUrl) return;
		try {
			var svc = styleService;
			var existing = svc.findByUrl(idUrl, 0);
			if (existing) {
				var savedVarsJson = existing.getMeta("usercssVars", {})[0];
				if (savedVarsJson) {
					this.vars = userCSSParser.deserializeVars(this.vars, savedVarsJson);
				}
			}
		} catch(e) {}
	},

	_updateAppliesToDisplay: function() {
		if (!this.style) return;
		var applies = this.style.getPrettyAppliesTo({});
		var list = document.getElementById("applies-list");
		while (list.firstChild) list.removeChild(list.firstChild);
		if (applies.length === 0) {
			var label = document.createElementNS(stylishCommon.XULNS, "label");
			label.setAttribute("value", this._str("globalStyle"));
			label.setAttribute("class", "applies-to-text");
			list.appendChild(label);
		} else {
			var max = Math.min(applies.length, 5);
			for (var i = 0; i < max; i++) {
				var label = document.createElementNS(stylishCommon.XULNS, "label");
				label.setAttribute("value", applies[i]);
				label.setAttribute("class", "applies-to-text");
				label.setAttribute("crop", "end");
				list.appendChild(label);
			}
			if (applies.length > 5) {
				var more = document.createElementNS(stylishCommon.XULNS, "label");
				more.setAttribute("value", "…");
				more.setAttribute("class", "applies-to-text");
				list.appendChild(more);
			}
		}
	},

	preview: function() {
		this._buildStyle();
		this._updateAppliesToDisplay();
		this._applyPreview();
	},

	install: function() {
		if (!this.style) { this._buildStyle(); }

		if (!this.installName) {
			var status = document.getElementById("status-message");
			status.setAttribute("value", this._str("nameRequired"));
			status.removeAttribute("hidden");
			return false;
		}
		this.style.name = this.installName;

		if (this.previewing) {
			this.style.setPreview(false);
			this.previewing = false;
		}

		this.style.enabled = true;
		this.style.save();
		this.closeTab();
		return true;
	},

	cancel: function() {
		if (this.previewing) {
			this.style.setPreview(false);
			this.previewing = false;
		}
		this.closeTab();
	},

	closeTab: function() {
		try {
			var browserWin = Services.wm.getMostRecentWindow("navigator:browser");
			if (browserWin && browserWin.gBrowser) {
				browserWin.gBrowser.removeCurrentTab();
			} else {
				window.close();
			}
		} catch(e) {
			window.close();
		}
	},

	resetVars: function() {
		this.vars = this.parsed.vars.map(function(v) { return Object.assign({}, v, { value: v.defaultValue }); });
		var rows = document.getElementById("vars-rows");
		while (rows.firstChild) rows.removeChild(rows.firstChild);
		this._populateVars();
		this._buildStyle();
		if (this.previewing) this._applyPreview();
	},

	_setCSSDisplay: function(css) {
		var iframe = document.getElementById("css-display");
		var prefs = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefBranch);
		var theme = "default";
		try { theme = prefs.getCharPref("extensions.stylem.editorTheme"); } catch(e) {}
		function getWin() {
			try { return iframe.contentWindow || iframe.contentDocument.defaultView; } catch(e) {}
			return null;
		}
		var attempts = 0;
		var poll = setInterval(function() {
			attempts++;
			var win = getWin();
			if (win && win.stylemEditor && win.stylemEditor.cm) {
				win.stylemEditor.setValue(css);
				if (theme !== "default") win.stylemEditor.setTheme(theme);
				clearInterval(poll);
			}
			if (attempts > 40) clearInterval(poll);
		}, 100);
	},

	_showError: function(msg) {
		var status = document.getElementById("status-message");
		status.setAttribute("value", msg);
		status.removeAttribute("hidden");
	}
};
