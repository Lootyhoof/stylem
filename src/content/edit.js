"use strict";

Components.utils.import("chrome://stylem/content/modules/stylishStyleModule.jsm");
Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");
Components.utils.import("resource://gre/modules/Services.jsm");

var skipConfirmClosePrompt = false;
var style = null;
var strings = null;
var nameE, updateUrlE;
var initialCode;
var prefs = Services.prefs.getBranch("extensions.stylem.");

const CSSXULNS = "@namespace url(http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul);";
const CSSHTMLNS = "@namespace url(http://www.w3.org/1999/xhtml);";

// --- Editor abstraction layer ---------------------------------------------
// Wraps either the CodeMirror iframe (preferred) or the plain <textbox>
// fallback behind one interface, so the rest of edit.js doesn't need to
// know which is active.
var stylemCodeEditor = {
	usingCodeMirror: false,
	_frame: null,
	_fallback: null,
	_ready: false,
	_pendingValue: null,
	_onReadyCallback: null,

	init: function(initialValue, onReady) {
		this._frame = document.getElementById("cm-frame");
		this._fallback = document.getElementById("cm-fallback");
		this._onReadyCallback = onReady;
		this._pendingValue = initialValue || "";

		var that = this;
		var settled = false;

		function tryUseCodeMirror() {
			if (settled) return false;
			try {
				var win = that._frame.contentWindow;
				if (win && win.stylemEditor && typeof win.stylemEditor.init === "function") {
					settled = true;
					win.stylemEditor.init(that._pendingValue, prefs.getBoolPref("wrap_lines"), prefs.getCharPref("editorTheme"));
					that.usingCodeMirror = true;
					that._ready = true;
					win.stylemEditor.onChangeCallback = function() {
						if (that._changeCallback) that._changeCallback();
					};
					win.stylemEditor.onSaveRequested = function() {
						if (typeof save === "function") save();
					};
					setTimeout(function() { win.stylemEditor.refresh(); }, 50);
					setTimeout(function() { win.stylemEditor.focus(); }, 100);
					if (that._onReadyCallback) that._onReadyCallback();
					return true;
				}
			} catch (e) {
				// contentWindow not accessible — frame not yet fully loaded,
				// or CodeMirror scripts failed to load/initialise
			}
			return false;
		}

		function useFallback() {
			if (settled) return;
			settled = true;
			that.usingCodeMirror = false;
			that._ready = true;
			that._frame.style.display = "none";
			that._fallback.hidden = false;
			that._fallback.value = that._pendingValue || "";
			that._fallback.setAttribute("wrap", prefs.getBoolPref("wrap_lines") ? "on" : "off");
			that._fallback.addEventListener("input", function() {
				if (that._changeCallback) that._changeCallback();
			});
			setTimeout(function() { that._fallback.focus(); }, 100);
			var statusE = document.getElementById("editor-status");
			if (statusE) statusE.setAttribute("value", "CodeMirror not found — using plain text editor.");
			if (that._onReadyCallback) that._onReadyCallback();
		}

		// The iframe may already be loaded (cached) or still loading.
		this._frame.addEventListener("load", function() { tryUseCodeMirror(); }, false);
		// Poll for up to 4s in case the load event already fired before we attached
		// the listener.  Only fall back to the plain textbox after that window
		// expires — tryUseCodeMirror itself never calls useFallback.
		var attempts = 0;
		var poll = setInterval(function() {
			attempts++;
			if (settled) { clearInterval(poll); return; }
			if (attempts > 40) { clearInterval(poll); useFallback(); return; }
			tryUseCodeMirror();
		}, 100);
	},

	onChange: function(callback) {
		this._changeCallback = callback;
	},

	getValue: function() {
		if (!this._ready) return this._pendingValue || "";
		if (this.usingCodeMirror) return this._frame.contentWindow.stylemEditor.getValue();
		return this._fallback.value;
	},

	setValue: function(value) {
		this._pendingValue = value;
		if (!this._ready) return;
		if (this.usingCodeMirror) this._frame.contentWindow.stylemEditor.setValue(value);
		else this._fallback.value = value;
	},

	focus: function() {
		if (!this._ready) return;
		if (this.usingCodeMirror) this._frame.contentWindow.stylemEditor.focus();
		else this._fallback.focus();
	},

	setWordWrap: function(on) {
		if (!this._ready) return;
		if (this.usingCodeMirror) this._frame.contentWindow.stylemEditor.setWordWrap(on);
		else this._fallback.setAttribute("wrap", on ? "on" : "off");
	},

	setTheme: function(name) {
		if (!this._ready) return;
		if (this.usingCodeMirror) this._frame.contentWindow.stylemEditor.setTheme(name);
	},

	gotoLineCol: function(line, col) {
		if (!this._ready) return;
		if (this.usingCodeMirror) {
			this._frame.contentWindow.stylemEditor.gotoLineCol(line, col);
			return;
		}
		// Fallback: compute character offset for the plain textbox
		var text = this._fallback.value;
		var index = 0, currentLine = 1;
		while (currentLine < line) {
			var nl = text.indexOf("\n", index);
			if (nl === -1) break;
			index = nl + 1;
			currentLine++;
		}
		this._fallback.focus();
		this._fallback.setSelectionRange(index + col, index + col);
	},

	insertAtCaret: function(text) {
		if (!this._ready) return;
		if (this.usingCodeMirror) {
			this._frame.contentWindow.stylemEditor.insertAtCursor(text);
			return;
		}
		var selStart = this._fallback.selectionStart;
		var scrollTop = this._fallback.scrollTop;
		this._fallback.value = this._fallback.value.substring(0, selStart) + text + this._fallback.value.substring(this._fallback.selectionEnd);
		this._fallback.focus();
		this._fallback.scrollTop = scrollTop;
		this._fallback.setSelectionRange(selStart, selStart + text.length);
	},

	insertAtStart: function(text) {
		if (!this._ready) return;
		if (this.usingCodeMirror) {
			this._frame.contentWindow.stylemEditor.insertAtStart(text);
			return;
		}
		if (this._fallback.value.indexOf(text) === -1) {
			this._fallback.value = this._fallback.value.length > 0 ? text + "\n" + this._fallback.value : text + "\n";
		}
		this._fallback.setSelectionRange(text.length + 1, text.length + 1);
		this._fallback.focus();
	},

	markErrorLine: function(line) {
		if (this.usingCodeMirror) this._frame.contentWindow.stylemEditor.markErrorLine(line);
	},

	clearErrorMarks: function() {
		if (this.usingCodeMirror) this._frame.contentWindow.stylemEditor.clearErrorMarks();
	},

	replaceMetaKey: function(key, newValue) {
		if (!this._ready) return;
		var code = this.getValue();
		var startMark = "==UserStyle==";
		var endMark = "==/UserStyle==";
		var startIdx = code.indexOf(startMark);
		if (startIdx === -1) return;
		var metaStart = code.lastIndexOf("/*", startIdx);
		if (metaStart === -1) return;
		var endIdx = code.indexOf(endMark, startIdx);
		if (endIdx === -1) return;
		var metaEnd = endIdx + endMark.length;
		if (code.charAt(metaEnd) === ' ') metaEnd++;
		if (code.charAt(metaEnd) === '*') metaEnd++;

		var metaBlock = code.substring(metaStart, metaEnd);
		var keyRe = new RegExp("(^|\\n)\\s*\\*?\\s*(@" + key + "\\s+)(\\S|\\S.*\\S)(?=\\s*\\n|\\s*$)", "m");
		var match = metaBlock.match(keyRe);

		var newBlock;
		if (match) {
			if (newValue === "") {
				newBlock = metaBlock.substring(0, match.index) + metaBlock.substring(match.index + match[0].length);
			} else {
				var prefix = match[2];
				var before = metaBlock.substring(0, match.index + match[1].length);
				var after = metaBlock.substring(match.index + match[1].length + match[2].length + match[3].length);
				newBlock = before + prefix + newValue + after;
			}
		} else {
			if (newValue === "") return;
			var insertAt = metaBlock.indexOf(endMark);
			newBlock = metaBlock.substring(0, insertAt) + "@" + key + "    " + newValue + "\n" + metaBlock.substring(insertAt);
		}
		if (newBlock === metaBlock) return;

		if (this.usingCodeMirror) {
			var cm = this._frame.contentWindow.stylemEditor.cm;
			var from = cm.posFromIndex(metaStart);
			var to = cm.posFromIndex(metaEnd);
			cm.operation(function() {
				cm.replaceRange(newBlock, from, to);
			});
		} else {
			this._fallback.value = code.substring(0, metaStart) + newBlock + code.substring(metaEnd);
		}
	}
};
// ---------------------------------------------------------------------------

// Persist window position/size
if (window.opener) {
	var windowPersist = JSON.parse(prefs.getCharPref("editorWindowPersist"));
	if (windowPersist.windowState == 1) {
		window.addEventListener("load", function() {
			setTimeout(function() { window.maximize(); }, 100);
		});
	} else {
		window.moveTo(windowPersist.screenX, windowPersist.screenY);
		window.resizeTo(windowPersist.width, windowPersist.height);
	}
	window.addEventListener("unload", function() {
		var ws = window.windowState;
		if (ws === 3) {
			try {
				windowPersist = {
					width: window.outerWidth,
					height: window.outerHeight,
					screenX: window.screenX,
					screenY: window.screenY
				};
			} catch (ex) { return; }
		}
		if (ws === 1 || ws === 3) windowPersist.windowState = ws;
		prefs.setCharPref("editorWindowPersist", JSON.stringify(windowPersist));
	});
}

function init() {
	nameE = document.getElementById("name");
	nameE.addEventListener("input", function() {
		enableSave(true);
		stylemCodeEditor.replaceMetaKey("name", nameE.value);
	});
	updateUrlE = document.getElementById("update-url");
	updateUrlE.addEventListener("input", function() {
		enableSave(true);
		stylemCodeEditor.replaceMetaKey("updateURL", updateUrlE.value);
	});
	strings = document.getElementById("strings");

	initStyle();

	// Show UserCSS inline variable editor if style has UserCSS metadata
	if (style && style.code && typeof userCSSParser !== "undefined" && userCSSParser.isUserCSS(style.code)) {
		renderInlineVars();
		showPreprocessorWarning();
	}

	// Pass the initial code directly into init() so it's available at the
	// moment the CodeMirror instance is created, avoiding any race between
	// the iframe's load event and a separate setValue() call.
	var initialValue = style ? (style.code || "") : "";
	stylemCodeEditor.onChange(function() {
		enableSave(true);
		enablePreview(true);
		enableCheckForErrors(true);
	});
	stylemCodeEditor.init(initialValue, function() {
		initialCode = stylemCodeEditor.getValue();
	});

	var wrapLines = prefs.getBoolPref("wrap_lines");
	var wrapLinesE = document.getElementById("wrap-lines");
	wrapLinesE.checked = wrapLines;
	wrapLinesE.style.display = "";

	var themeVal = prefs.getCharPref("editorTheme");
	var themeRow = document.getElementById("theme-row");
	var themeSel = document.getElementById("theme-selector");
	if (themeRow && themeSel) {
		themeSel.value = themeVal;
		themeRow.style.display = "";
	}
}

function initStyle() {
	var service = styleService;
	var id;
	var code = null;
	var urlParts = location.href.split("?");
	if (urlParts.length > 1) {
		let params = urlParts[1].split("&");
		params.forEach(function(param) {
			var kv = param.split("=");
			if (kv.length > 1) {
				if (kv[0] == "id") id = decodeURIComponent(kv[1]);
				else if (kv[0] == "code") code = decodeURIComponent(kv[1]);
			}
		});
	}
	if (id) {
		style = service.find(id, service.CALCULATE_META | service.REGISTER_STYLE_ON_CHANGE);
		enableSave(false);
		enablePreview(true);
		if (style) {
			document.documentElement.setAttribute("windowtype", stylishCommon.getWindowName("stylishEdit", id));
		}
	} else {
		if (code == null) code = "";
		style = new Style();
		style.mode = style.CALCULATE_META | style.REGISTER_STYLE_ON_CHANGE;
		style.init(null, null, null, null, null, code, false, null, null, null);
		enableSave(true);
		enablePreview(true);
	}

	if (style) {
		nameE.value = style.name || "";
		// For new styles with UserCSS metadata, populate name from @name
		if (!style.name && style.code && typeof userCSSParser !== "undefined" && userCSSParser.isUserCSS(style.code)) {
			var parsed = userCSSParser.parse(style.code);
			if (parsed && parsed.meta && parsed.meta["name"]) {
				nameE.value = parsed.meta["name"];
			}
		}
		updateUrlE.value = style.updateUrl || "";
		updateTitle();
		updateAppliesToSummary();
	}
}

function updateTitle() {
	if (style.id) {
		document.title = strings.getFormattedString("editstyletitle", [style.name]);
	} else {
		document.title = strings.getString("newstyletitle");
	}
}

function save() {
	style.name = nameE.value;
	if (!style.name) {
		alert(strings.getString("missingname"));
		return false;
	}
	var code = stylemCodeEditor.getValue();
	if (!code) {
		alert(strings.getString("missingcode"));
		return false;
	}

	// Stop preview BEFORE enabling — the enabled setter checks previewOn
	// to decide whether register() needs to run, so preview must be off first.
	if (!style.enabled) style.setPreview(false);

	if (code != initialCode) {
		style.code = code;
		initialCode = style.code;
	} else {
		style.revert();
	}

	if (!style.id) style.enabled = true;

	style.updateUrl = updateUrlE.value;
	var newStyle = !style.id;
	style.save();
	if (newStyle) {
		location.href = location.href.split("?")[0] + "?id=" + style.id;
		return true;
	}
	updateTitle();
	enableSave(false);
	enablePreview(true);
	updateAppliesToSummary();
	return true;
}

function enableSave(enabled) { document.getElementById("save-button").disabled = !enabled; }
function enablePreview(enabled) { document.getElementById("preview-button").disabled = !enabled; }
function enableCheckForErrors(enabled) { document.getElementById("check-for-errors-button").disabled = !enabled; }

function preview() {
	style.name = nameE.value;
	style.code = stylemCodeEditor.getValue();
	setTimeout(function() { style.setPreview(true); }, 50);
	enablePreview(false);
}

function checkForErrors() {
	stylemCodeEditor.clearErrorMarks();
	var errors = document.getElementById("errors");
	errors.hidden = true;
	while (errors.hasChildNodes()) errors.removeChild(errors.lastChild);
	var currentMessages = [];

	var css = stylemCodeEditor.getValue();
	// Detect preprocessor from metadata (e.g., @preprocessor stylus)
	var preprocessor;
	var ppMatch = css.match(/@preprocessor\s+(\S+)/i);
	if (ppMatch) {
		preprocessor = ppMatch[1].toLowerCase();
	}

	if (preprocessor && preprocessor !== "default") {
		errors.hidden = false;
		var label = document.createElementNS(stylishCommon.XULNS, "label");
		label.setAttribute("class", "css-error-label");
		label.appendChild(document.createTextNode("Preprocessor style (" + preprocessor + ") — use the preprocessor to validate"));
		errors.appendChild(label);
		enableCheckForErrors(false);
		enableCheckForErrors(true);
		return;
	}

	// Check for unbalanced braces — Goanna's parser auto-closes them
	// without reporting an error, but they're still a user mistake.
	var openBraces = (css.match(/\{/g) || []).length;
	var closeBraces = (css.match(/\}/g) || []).length;
	if (openBraces !== closeBraces) {
		errors.hidden = false;
		var label = document.createElementNS(stylishCommon.XULNS, "label");
		label.setAttribute("class", "css-error-label");
		label.appendChild(document.createTextNode("Unbalanced braces: " + openBraces + " opening vs " + closeBraces + " closing"));
		errors.appendChild(label);
		enableCheckForErrors(false);
		enableCheckForErrors(true);
		return;
	}

	// Enable @-moz-document parsing so UserCSS styles don't false-positive
	var mozDocPref = "layout.css.moz-document.content.enabled";
	var hadMozDocPref = false;
	try { hadMozDocPref = Services.prefs.getBoolPref(mozDocPref); } catch(e) {}
	if (!hadMozDocPref) Services.prefs.setBoolPref(mozDocPref, true);

	// Structural integrity check — cssRules throws for unparseable CSS
	try {
		var sheet = style.getStyleSheet(css);
		if (sheet) {
			sheet.cssRules;
		}
	} catch(e) {
		errors.hidden = false;
		var label = document.createElementNS(stylishCommon.XULNS, "label");
		label.setAttribute("class", "css-error-label");
		label.appendChild(document.createTextNode("CSS parse error" + (e.message ? ": " + e.message : "")));
		errors.appendChild(label);
	}

	// Property-level validation: Goanna drops unknown properties from the
	// CSSOM, so we extract declarations from the raw CSS text and validate
	// each with CSS.supports().
	var decls = extractDeclarations(css);
	for (var di = 0; di < decls.length; di++) {
		var d = decls[di];
		if (!validDeclaration(d.prop, d.val)) {
			var msg = d.line + ":0 '" + d.prop + "': " + d.val + " — invalid property or value";
			if (currentMessages.indexOf(msg) == -1) {
				currentMessages.push(msg);
				errors.hidden = false;
				var label = document.createElementNS(stylishCommon.XULNS, "label");
				label.setAttribute("class", "css-error-label");
				label.appendChild(document.createTextNode(msg));
				label.addEventListener("click", function(l) { return function() { goToLine(l, 0); }; }(d.line), false);
				errors.appendChild(label);
			}
		}
	}

	// Restore pref
	if (!hadMozDocPref) {
		try { Services.prefs.setBoolPref(mozDocPref, false); } catch(e) {}
	}

	enableCheckForErrors(false);
	enableCheckForErrors(true);
}

function validDeclaration(prop, val) {
	// CSS custom properties (--*) are valid by definition
	if (prop.indexOf("--") === 0) return true;
	// Vendor-prefixed properties — skip validation since Goanna's
	// CSS.supports may not recognize cross-browser prefixes
	if (prop.indexOf("-moz-") === 0 || prop.indexOf("-webkit-") === 0 ||
		prop.indexOf("-ms-") === 0 || prop.indexOf("-o-") === 0) return true;
	// Strip !important from value before checking
	var cleanVal = val.replace(/\s*!important\s*$/, "");
	// Can't resolve var() at check time — skip
	if (cleanVal.indexOf("var(") !== -1) return true;
	// Remove leading/trailing whitespace
	cleanVal = cleanVal.trim();
	if (!cleanVal) return true;
	if (typeof CSS !== "undefined" && CSS.supports) {
		return CSS.supports(prop, cleanVal);
	}
	return true;
}

function stripMozDocument(css) {
	var result = "";
	var lastPos = 0;
	var re = /@-moz-document\s*([^{]*)\{/gi;
	var match;
	while ((match = re.exec(css)) !== null) {
		result += css.substring(lastPos, match.index);
		// Count braces to find the matching } of @-moz-document
		var depth = 1;
		var pos = match.index + match[0].length;
		var innerStart = pos;
		while (pos < css.length && depth > 0) {
			if (css[pos] === "{") depth++;
			if (css[pos] === "}") depth--;
			pos++;
		}
		// Keep the inner content (without the @-moz-document wrapper)
		result += css.substring(innerStart, pos - 1);
		lastPos = pos;
	}
	result += css.substring(lastPos);
	return result;
}

function extractDeclarations(css) {
	var decls = [];
	// Strip @-moz-document blocks — their URL patterns (domain, url-prefix, etc.)
	// look like CSS selectors to the regex, causing false positives.
	var clean = stripMozDocument(css);
	// Strip comments so they don't confuse the regex
	clean = clean.replace(/\/\*[\s\S]*?\*\//g, "");
	// Match {...} blocks whose selector (text before {) starts with
	// a valid selector character — NOT @ (which would be an @-rule).
	var blockRe = /(?:^|[\s;}])([a-zA-Z#.\[:*_-][^{]*)\{([^}]*)\}/gm;
	var match;
	while ((match = blockRe.exec(clean)) !== null) {
		var block = match[2];
		var parts = block.split(";");
		for (var i = 0; i < parts.length; i++) {
			var part = parts[i].trim();
			if (!part) continue;
			var colonIdx = part.indexOf(":");
			if (colonIdx === -1) continue;
			var prop = part.substring(0, colonIdx).trim();
			var val = part.substring(colonIdx + 1).trim();
			if (!prop || !val) continue;
			// Line number of the opening brace in the clean string
			var bracePos = match.index + match[0].indexOf("{");
			var line = clean.substring(0, bracePos).split("\n").length;
			decls.push({prop: prop, val: val, line: line});
		}
	}
	return decls;
}

function goToLine(line, col) {
	stylemCodeEditor.gotoLineCol(line, col);
}

function insertCodeAtStart(snippet) {
	stylemCodeEditor.insertAtStart(snippet);
	enableSave(true);
}

function insertCodeAtCaret(snippet) {
	stylemCodeEditor.insertAtCaret(snippet);
	enableSave(true);
}

function changeWordWrap(on) {
	prefs.setBoolPref("wrap_lines", on);
	stylemCodeEditor.setWordWrap(on);
}

function changeTheme(name) {
	prefs.setCharPref("editorTheme", name);
	stylemCodeEditor.setTheme(name);
}

function insertChromePath() {
	var ios = Components.classes["@mozilla.org/network/io-service;1"].getService(Components.interfaces.nsIIOService);
	var fileHandler = ios.getProtocolHandler("file").QueryInterface(Components.interfaces.nsIFileProtocolHandler);
	var chromePath = fileHandler.getURLSpecFromFile(Components.classes["@mozilla.org/file/directory_service;1"].getService(Components.interfaces.nsIProperties).get("UChrm", Components.interfaces.nsIFile));
	insertCodeAtCaret(chromePath);
}

function insertUserCSSMeta() {
	insertCodeAtCaret("/* ==UserStyle==\n@name         New UserStyle\n@namespace    your-namespace\n@version      1.0.0\n@description  Enter a description\n@author       You\n==/UserStyle== */");
}

function insertDataURI() {
	const ci = Components.interfaces;
	const cc = Components.classes;
	const nsIFilePicker = ci.nsIFilePicker;
	var fp = cc["@mozilla.org/filepicker;1"].createInstance(nsIFilePicker);
	fp.init(window, strings.getString("dataURIDialogTitle"), nsIFilePicker.modeOpen);
	if (fp.show() != nsIFilePicker.returnOK) return;
	var file = fp.file;
	var contentType = cc["@mozilla.org/mime;1"].getService(ci.nsIMIMEService).getTypeFromFile(file);
	var inputStream = cc["@mozilla.org/network/file-input-stream;1"].createInstance(ci.nsIFileInputStream);
	inputStream.init(file, parseInt("01", 16), parseInt("0600", 8), 0);
	var stream = cc["@mozilla.org/binaryinputstream;1"].createInstance(ci.nsIBinaryInputStream);
	stream.setInputStream(inputStream);
	var encoded = btoa(stream.readBytes(stream.available()));
	stream.close();
	inputStream.close();
	insertCodeAtCaret("data:" + contentType + ";base64," + encoded);
}

// --- Applies-to editor ---
var appliesEditorOpen = false;
function toggleAppliesToEditor() {
	appliesEditorOpen = !appliesEditorOpen;
	document.getElementById("applies-to-editor").hidden = !appliesEditorOpen;
	if (appliesEditorOpen) renderAppliesRules();
}

function renderAppliesRules() {
	var list = document.getElementById("applies-rules");
	while (list.firstChild) list.removeChild(list.firstChild);
	var rules = [
		{meta: "url", values: style.getMeta("url", {})},
		{meta: "url-prefix", values: style.getMeta("url-prefix", {})},
		{meta: "domain", values: style.getMeta("domain", {})},
		{meta: "regexp", values: style.getMeta("regexp", {})}
	];
	rules.forEach(function(r) {
		r.values.forEach(function(val) {
			addAppliesRuleItem(list, r.meta, val);
		});
	});
}

function addAppliesRuleItem(list, type, value) {
	var item = document.createElementNS(stylishCommon.XULNS, "richlistitem");
	item.setAttribute("align", "center");
	var typeLabel = document.createElementNS(stylishCommon.XULNS, "label");
	typeLabel.setAttribute("value", type);
	typeLabel.setAttribute("style", "min-width: 8em; font-weight: bold;");
	var valueLabel = document.createElementNS(stylishCommon.XULNS, "label");
	valueLabel.setAttribute("value", value);
	valueLabel.setAttribute("flex", "1");
	valueLabel.setAttribute("crop", "end");
	var removeBtn = document.createElementNS(stylishCommon.XULNS, "button");
	removeBtn.setAttribute("label", "✕");
	removeBtn.setAttribute("style", "min-width: 2em;");
	removeBtn.addEventListener("command", function() {
		style.removeMeta(type, value);
		item.parentNode.removeChild(item);
		rebuildDocumentWrapper();
		stylemCodeEditor.setValue(style.code);
		updateAppliesToSummary();
		enableSave(true);
	}, false);
	item.appendChild(typeLabel);
	item.appendChild(valueLabel);
	item.appendChild(removeBtn);
	list.appendChild(item);
}

function addAppliesRule() {
	var type = document.getElementById("new-rule-type").value;
	var value = document.getElementById("new-rule-value").value.trim();
	if (!value) return;
	style.addMeta(type, value);
	rebuildDocumentWrapper();
	stylemCodeEditor.setValue(style.code);
	document.getElementById("new-rule-value").value = "";
	renderAppliesRules();
	updateAppliesToSummary();
	enableSave(true);
}

// Rebuild the @-moz-document wrapper in the CSS to match the current
// applies-to metadata (url, url-prefix, domain, regexp).
// This ensures that rules added/removed via the UI actually take effect
// by wrapping the inner CSS code in @-moz-document conditions.
function rebuildDocumentWrapper() {
	if (!style || !style.code) return;
	var code = style.code;
	// Preserve any UserCSS metadata block at the top
	var metaBlock = "";
	var metaMatch = code.match(/^\/\* ==UserStyle==[\s\S]*?==\/UserStyle== \*\//);
	if (metaMatch) {
		metaBlock = metaMatch[0];
		code = code.substring(metaMatch[0].length);
	}
	var trimmed = code.trim();
	var innerCode = code;
	// If the code is already wrapped in a single @-moz-document block,
	// strip the wrapper to get the inner CSS
	if (trimmed.indexOf("@-moz-document") === 0) {
		var braceStart = trimmed.indexOf("{");
		var braceEnd = trimmed.lastIndexOf("}");
		if (braceStart > 0 && braceEnd > braceStart) {
			var rest = trimmed.substring(braceStart + 1, braceEnd).trim();
			if (rest.indexOf("@-moz-document") === -1) {
				innerCode = rest;
			}
		}
	}
	// Collect all applies-to conditions from metadata
	var conditions = [];
	["url", "url-prefix", "domain", "regexp"].forEach(function(t) {
		var vals = style.getMeta(t, {});
		vals.forEach(function(v) {
			conditions.push(t + "(\"" + v + "\")");
		});
	});
	if (conditions.length > 0) {
		style.code = metaBlock + (metaBlock ? "\n" : "") + "@-moz-document " + conditions.join(", ") + " {\n" + innerCode + "\n}";
	} else if (innerCode !== code) {
		style.code = metaBlock + (metaBlock ? "\n" : "") + innerCode;
	} else {
		style.code = metaBlock + (metaBlock ? "\n" : "") + code;
	}
}

function updateAppliesToSummary() {
	var applies = style.getPrettyAppliesTo({});
	var list = document.getElementById("applies-to-summary");
	while (list.firstChild) list.removeChild(list.firstChild);
	if (applies.length === 0) {
		var label = document.createElementNS(stylishCommon.XULNS, "label");
		label.setAttribute("value", "All pages (global style)");
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
}

// --- UserCSS inline variable editor ---
function renderInlineVars() {
	if (!style || !style.code || typeof userCSSParser === "undefined") return;
	var parsed = userCSSParser.parse(style.code);
	if (parsed.error || parsed.vars.length === 0) return;

	// Load previously saved values from metadata
	var saved = style.getMeta("usercssVars", {});
	var serialized = saved.length > 0 ? saved[0] : null;
	if (serialized) {
		parsed.vars = userCSSParser.deserializeVars(parsed.vars, serialized);
	}

	var section = document.getElementById("usercss-vars-section");
	var scroll = document.getElementById("usercss-vars-rows");
	while (scroll.firstChild) scroll.removeChild(scroll.firstChild);

	function onVarChange() {
		style.removeAllMeta("usercssVars");
		var sv = userCSSParser.serializeVars(parsed.vars);
		style.addMeta("usercssVars", sv);
		try {
			if (style.enabled || style.previewOn) {
				style.unregister();
				style.register();
			}
		} catch(e) {}
		enableSave(true);
	}

	var XULNS = stylishCommon.XULNS;

	function createVarControl(v, idx) {
		var row = document.createElementNS(XULNS, "row");
		row.setAttribute("align", "center");
		row.setAttribute("class", "var-row");

		var label = document.createElementNS(XULNS, "label");
		label.setAttribute("value", v.label);
		label.setAttribute("class", "var-label");
		label.setAttribute("crop", "end");
		row.appendChild(label);

		var control = null;

		switch (v.type) {
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
					parsed.vars[idx].value = this.selectedItem ? this.selectedItem.getAttribute("value") : this.value;
					onVarChange();
				}, false);
				ml.value = v.value || v.defaultValue;
				control = ml;
				break;
			}
			case "color": {
				var hbox = document.createElementNS(XULNS, "hbox");
				hbox.setAttribute("align", "center");
				hbox.setAttribute("flex", "1");
				var cp = document.createElementNS(XULNS, "colorpicker");
				cp.setAttribute("type", "button");
				cp.setAttribute("color", v.value || v.defaultValue);
				cp.addEventListener("change", function() {
					parsed.vars[idx].value = this.color;
					colorText.value = this.color;
					onVarChange();
				}, false);
				var colorText = document.createElementNS(XULNS, "textbox");
				colorText.setAttribute("value", v.value || v.defaultValue);
				colorText.setAttribute("size", "9");
				colorText.addEventListener("change", function() {
					var val = this.value.trim();
					cp.setAttribute("color", val);
					parsed.vars[idx].value = val;
					onVarChange();
				}, false);
				hbox.appendChild(cp);
				hbox.appendChild(colorText);
				control = hbox;
				break;
			}
			case "checkbox": {
				var cb = document.createElementNS(XULNS, "checkbox");
				cb.setAttribute("checked", v.value === "1");
				cb.addEventListener("command", function() {
					parsed.vars[idx].value = this.checked ? "1" : "0";
					onVarChange();
				}, false);
				control = cb;
				break;
			}
			case "number": {
				var nb = document.createElementNS(XULNS, "textbox");
				nb.setAttribute("value", v.value || v.defaultValue || "0");
				nb.setAttribute("size", "8");
				nb.setAttribute("type", "number");
				if (v.min !== null) nb.setAttribute("min", v.min);
				if (v.max !== null) nb.setAttribute("max", v.max);
				nb.addEventListener("change", function() {
					parsed.vars[idx].value = this.value;
					onVarChange();
				}, false);
				control = nb;
				break;
			}
			case "range": {
				var outer = document.createElementNS(XULNS, "hbox");
				outer.setAttribute("align", "center");
				outer.setAttribute("flex", "1");
				var sc = document.createElementNS(XULNS, "scale");
				sc.setAttribute("flex", "1");
				sc.setAttribute("min", v.min || "0");
				sc.setAttribute("max", v.max || "100");
				sc.setAttribute("increment", v.step || "1");
				sc.setAttribute("value", parseFloat(v.value || v.defaultValue) || 0);
				var valLabel = document.createElementNS(XULNS, "label");
				valLabel.setAttribute("value", (v.value || v.defaultValue) + (v.unit || ""));
				valLabel.setAttribute("style", "min-width: 4em; text-align: right;");
				sc.addEventListener("change", function() {
					var newVal = String(this.value);
					valLabel.setAttribute("value", newVal + (v.unit || ""));
					parsed.vars[idx].value = newVal;
					onVarChange();
				}, false);
				outer.appendChild(sc);
				outer.appendChild(valLabel);
				control = outer;
				break;
			}
			default: {
				var tb = document.createElementNS(XULNS, "textbox");
				tb.setAttribute("value", v.value || v.defaultValue || "");
				tb.setAttribute("flex", "1");
				tb.addEventListener("change", function() {
					parsed.vars[idx].value = this.value;
					onVarChange();
				}, false);
				control = tb;
				break;
			}
		}

		if (control) {
			control.setAttribute("flex", "1");
			row.appendChild(control);
		}
		return row;
	}

	var regularVars = parsed.vars.filter(function(v) { return !v.advanced; });
	var advancedVars = parsed.vars.filter(function(v) { return v.advanced; });

	// Render regular vars
	regularVars.forEach(function(v, idx) {
		var realIdx = parsed.vars.indexOf(v);
		scroll.appendChild(createVarControl(v, realIdx));
	});

	// Render advanced vars in a collapsible groupbox
	if (advancedVars.length > 0) {
		var advGroup = document.createElementNS(XULNS, "groupbox");
		var advCaption = document.createElementNS(XULNS, "caption");
		var advCheckbox = document.createElementNS(XULNS, "checkbox");
		advCheckbox.setAttribute("label", "Advanced (" + advancedVars.length + ")");
		advCheckbox.setAttribute("checked", "false");
		advCaption.appendChild(advCheckbox);
		advGroup.appendChild(advCaption);
		var advBody = document.createElementNS(XULNS, "grid");
		advBody.setAttribute("hidden", "true");
		var advCols = document.createElementNS(XULNS, "columns");
		var advCol1 = document.createElementNS(XULNS, "column");
		advCol1.setAttribute("style", "min-width: 10em;");
		var advCol2 = document.createElementNS(XULNS, "column");
		advCol2.setAttribute("flex", "1");
		advCols.appendChild(advCol1);
		advCols.appendChild(advCol2);
		advBody.appendChild(advCols);
		var advRows = document.createElementNS(XULNS, "rows");
		advBody.appendChild(advRows);
		advGroup.appendChild(advBody);
		advCheckbox.addEventListener("command", function() {
			advBody.hidden = !this.checked;
		}, false);
		advancedVars.forEach(function(v) {
			var realIdx = parsed.vars.indexOf(v);
			advRows.appendChild(createVarControl(v, realIdx));
		});
		scroll.appendChild(advGroup);
	}

	section.removeAttribute("hidden");
}

function resetVars() {
	style.removeAllMeta("usercssVars");
	renderInlineVars();
	enableSave(true);
}

function showPreprocessorWarning() {
	var parsed = userCSSParser.parse(style.code);
	if (parsed.error) return;
	var warning = userCSSParser.getPreprocessorWarning(parsed.meta["preprocessor"]);
	var el = document.getElementById("preprocessor-warning");
	if (warning) {
		el.textContent = warning;
		el.removeAttribute("hidden");
	} else {
		el.setAttribute("hidden", "true");
	}
}
// ---------------------------------------------------------------------------

// --- Change/delete observers ---
// subject arrives wrapped as nsISupports via the observer service;
// unwrap to the raw Style JS object before reading .id.
var changeObserver = {
	observe: function(subject, topic, data) {
		var s = subject && (subject.wrappedJSObject || subject);
		if (!s || s.id === undefined) return;
		if (s.id == style.id) {
			style.setPreview(false);
			style.code = s.code;
			stylemCodeEditor.setValue(s.code);
			initialCode = s.code;
			style.enabled = s.enabled;
		}
	}
};
Components.classes["@mozilla.org/observer-service;1"].getService(Components.interfaces.nsIObserverService).addObserver(changeObserver, "stylem-style-change", false);

var deleteObserver = {
	observe: function(subject, topic, data) {
		var s = subject && (subject.wrappedJSObject || subject);
		if (!s || s.id === undefined) return;
		if (s.id == style.id) {
			style.enabled = false;
			style.setPreview(false);
			skipConfirmClosePrompt = true;
			window.close();
		}
	}
};
Components.classes["@mozilla.org/observer-service;1"].getService(Components.interfaces.nsIObserverService).addObserver(deleteObserver, "stylem-style-delete", false);

var lastBeforeUnload = null;
window.addEventListener("beforeunload", function(event) {
	if (!skipConfirmClosePrompt && initialCode != stylemCodeEditor.getValue() && (lastBeforeUnload == null || Date.now() - lastBeforeUnload > 5000)) {
		lastBeforeUnload = Date.now();
		event.returnValue = "You have unsaved changes. Close anyway?";
	}
});

window.addEventListener("close", function(event) {
	event.preventDefault();
	window.close();
});

window.addEventListener("unload", function(event) {
	style.setPreview(false);
	if (initialCode != stylemCodeEditor.getValue()) {
		style.revert();
	}
});

window.addEventListener("load", init);
