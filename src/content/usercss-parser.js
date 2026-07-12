"use strict";

var EXPORTED_SYMBOLS = ["userCSSParser"];

/**
 * UserCSS metadata parser and variable substitution engine.
 * Compatible with the Stylus/openstyles UserCSS spec:
 * https://github.com/openstyles/stylus/wiki/Writing-UserCSS
 *
 * Supported @var types: color, text, checkbox, select, number, range
 * Supported metadata: @name, @namespace, @version, @description, @author,
 *   @homepageURL, @updateURL, @license, @preprocessor
 */
var userCSSParser = {

	/**
	 * Returns true if the given CSS text contains a UserCSS metadata block.
	 */
	isUserCSS: function(css) {
		return css.indexOf("==UserStyle==") !== -1;
	},

	/**
	 * Parse a full UserCSS file. Returns:
	 * {
	 *   meta: { name, namespace, version, description, author, homepageURL,
	 *           updateURL, license, preprocessor },
	 *   vars: [ { type, name, label, defaultValue, value, options } ],
	 *   error: null | string
	 * }
	 */
	parse: function(css) {
		var result = { meta: {}, vars: [], error: null };
		if (!css) { result.error = "Empty CSS"; return result; }

		var startMark = "==UserStyle==";
		var endMark   = "==/UserStyle==";
		var startIdx  = css.indexOf(startMark);
		if (startIdx === -1) { result.error = "No ==UserStyle== block found"; return result; }
		var endIdx = css.indexOf(endMark, startIdx);
		if (endIdx === -1) { result.error = "Unclosed ==UserStyle== block"; return result; }

		var block = css.substring(startIdx + startMark.length, endIdx);
		var lines = block.split("\n");
		var i = 0;

		while (i < lines.length) {
			var line = lines[i].replace(/^\s*\*?\s*/, "").trim();
			i++;
			if (!line || line.charAt(0) !== "@") continue;

			// @var type name "label" default  (supports "label" or 'label')
			var varMatch = line.match(/^@var\s+(\S+)\s+(\S+)\s+(["'])(.*?)\3\s+([\s\S]*)$/);
			if (varMatch) {
				var rest = varMatch[5].trim();
				// Multi-line @var: if rest ends with {, accumulate lines until matching }
				if (/{\s*$/.test(rest)) {
					while (i < lines.length) {
						var continuation = lines[i].replace(/^\s*\*?\s*/, "").trim();
						i++;
						rest += "\n" + continuation;
						if (/}\s*$/.test(continuation)) break;
					}
				}
				var v = userCSSParser._parseVar(varMatch[1], varMatch[2], varMatch[4], rest);
				if (v) result.vars.push(v);
				continue;
			}

			// @advanced type name "label" default  (same as @var but flagged advanced)
			var advMatch = line.match(/^@advanced\s+(\S+)\s+(\S+)\s+(["'])(.*?)\3\s+([\s\S]*)$/);
			if (advMatch) {
				var rest = advMatch[5].trim();
				if (/{\s*$/.test(rest)) {
					while (i < lines.length) {
						var continuation = lines[i].replace(/^\s*\*?\s*/, "").trim();
						i++;
						rest += "\n" + continuation;
						if (/}\s*$/.test(continuation)) break;
					}
				}
				var v = userCSSParser._parseVar(advMatch[1], advMatch[2], advMatch[4], rest);
				if (v) { v.advanced = true; result.vars.push(v); }
				continue;
			}

			// Generic meta tags
			var metaMatch = line.match(/^@(\S+)\s+(.*)/);
			if (metaMatch) {
				var key = metaMatch[1];
				var val = metaMatch[2].trim();
				if (key !== "var" && key !== "advanced") {
					result.meta[key] = val;
				}
			}
		}

		// Validate required fields
		if (!result.meta["name"]) result.meta["name"] = "";

		return result;
	},

	_parseVar: function(type, name, label, rest) {
		var v = { type: type, name: name, label: label, defaultValue: null, value: null, options: null };
		switch (type) {
			case "color":
				// default: a CSS colour value
				v.defaultValue = rest;
				v.value = rest;
				break;

			case "text":
				// default: bare text (may be quoted)
				v.defaultValue = userCSSParser._stripQuotes(rest);
				v.value = v.defaultValue;
				break;

			case "checkbox":
				// default: 0 or 1
				v.defaultValue = rest === "1" ? "1" : "0";
				v.value = v.defaultValue;
				break;

			case "select":
			case "dropdown":
				// options block: { "Label": "value", ... }
				// rest may be a single-line { } or split across lines (we have the whole rest)
				var opts = userCSSParser._parseSelectOptions(rest);
				if (!opts || opts.length === 0) return null;
				v.options = opts;
				v.defaultValue = opts[0].value;
				v.value = v.defaultValue;
				break;

			case "number":
				// default [min max step unit]  e.g.  60  0  100  1  px
				var numParts = rest.split(/\s+/);
				v.defaultValue = numParts[0] || "0";
				v.value = v.defaultValue;
				v.min    = numParts[1] !== undefined ? numParts[1] : null;
				v.max    = numParts[2] !== undefined ? numParts[2] : null;
				v.step   = numParts[3] !== undefined ? numParts[3] : null;
				v.unit   = numParts[4] !== undefined ? numParts[4] : "";
				break;

			case "range":
				// same format as number
				var rangeParts = rest.split(/\s+/);
				v.defaultValue = rangeParts[0] || "0";
				v.value = v.defaultValue;
				v.min    = rangeParts[1] !== undefined ? rangeParts[1] : "0";
				v.max    = rangeParts[2] !== undefined ? rangeParts[2] : "100";
				v.step   = rangeParts[3] !== undefined ? rangeParts[3] : "1";
				v.unit   = rangeParts[4] !== undefined ? rangeParts[4] : "";
				break;

			default:
				// Unknown type — treat as text
				v.type = "text";
				v.defaultValue = userCSSParser._stripQuotes(rest);
				v.value = v.defaultValue;
				break;
		}
		return v;
	},

	_parseSelectOptions: function(str) {
		// Handles:
		//   USO format: { "Label A": "value-a", "Label B": "value-b" }
		//   Stylus format: { key "Label" <<<EOT\n  css-value EOT; ... }
		var opts = [];
		var inner = str.replace(/^\s*\{/, "").replace(/\}\s*$/, "").trim();

		// Try Stylus heredoc format first:  key "Label" <<<EOT ... EOT;
		var stylusRe = /(\S+)\s+"([^"]+)"\s*<<<EOT([\s\S]*?)EOT;\s*/g;
		var m;
		var found = false;
		while ((m = stylusRe.exec(inner)) !== null) {
			var cssVal = m[3].trim();
			opts.push({ label: m[2], value: m[1], cssValue: cssVal });
			found = true;
		}
		if (found) return opts;

		// USO format: "Label": "value" or 'Label': 'value'
		// Values may contain quotes of the opposite kind (e.g. url('...') inside "...").
		var pairRe = /(["'])([^"']+)\1\s*:\s*(?:"([^"]*)"|'([^']*)'|([\w@\/:#.\-]+))/g;
		while ((m = pairRe.exec(inner)) !== null) {
			opts.push({ label: m[2], value: m[3] !== undefined ? m[3] : (m[4] !== undefined ? m[4] : m[5]) });
		}
		return opts;
	},

	_stripQuotes: function(s) {
		if (!s) return s;
		// Strip outer quotes (both ' and ") — may be nested if the value
		// itself is a Stylus string literal (e.g. '"You"' → "You" → You)
		while (true) {
			if ((s.charAt(0) === '"' && s.charAt(s.length - 1) === '"') ||
			    (s.charAt(0) === "'" && s.charAt(s.length - 1) === "'")) {
				s = s.substring(1, s.length - 1);
			} else {
				break;
			}
		}
		return s;
	},

	/**
	 * Apply variable values to CSS.
	 *
	 * For `@preprocessor default` (plain CSS): injects CSS custom properties
	 * into a :root {} block prepended to the CSS, and replaces var(--name)
	 * references throughout.
	 *
	 * For other preprocessors: performs direct token substitution of bare
	 * variable names (Stylus/LESS/USO convention).
	 *
	 * vars: array of { name, value, type, unit }
	 * preprocessor: "default" | "uso" | "less" | "stylus" | undefined
	 */
	applyVars: function(css, vars, preprocessor) {
		// Always strip the ==UserStyle== block from the output CSS,
		// even when there are no variables to substitute.
		css = userCSSParser._stripMetaBlock(css);

		if (!vars || vars.length === 0) return css;

		if (!preprocessor || preprocessor === "default") {
			return userCSSParser._applyVarsDefault(css, vars);
		}
		// For preprocessor modes: direct substitution of bare names
		return userCSSParser._applyVarsDirect(css, vars, preprocessor);
	},

	_stripMetaBlock: function(css) {
		var start = css.indexOf("/*");
		if (start === -1) return css;
		// Find the comment that contains ==UserStyle==
		var searchFrom = 0;
		while (true) {
			var cs = css.indexOf("/*", searchFrom);
			if (cs === -1) break;
			var ce = css.indexOf("*/", cs + 2);
			if (ce === -1) break;
			var comment = css.substring(cs, ce + 2);
			if (comment.indexOf("==UserStyle==") !== -1) {
				return css.substring(0, cs) + css.substring(ce + 2);
			}
			searchFrom = ce + 2;
		}
		return css;
	},

	_applyVarsDefault: function(css, vars) {
		// Replace var(--name) with the resolved value inline, so the
		// final CSS has no remaining variable references.  This avoids
		// relying on CSS custom-property resolution in user stylesheets
		// (which Goanna may not fully support in that context).
		vars.forEach(function(v) {
			var val = userCSSParser._cssValue(v);
			var re = new RegExp("\\bvar\\(--" + userCSSParser._escapeRegex(v.name) + "\\)", "g");
			css = css.replace(re, val);
		});

		// Also append a :root block so the variable values are available
		// to any other var(--name) references (e.g. in other styles on
		// the same page, or manual use in the browser console).
		var rootVars = vars.map(function(v) {
			var val = userCSSParser._cssValue(v);
			return "  --" + v.name + ": " + val + ";";
		}).join("\n");

		var rootBlock = ":root {\n" + rootVars + "\n}\n";
		return css + "\n" + rootBlock;
	},

	_applyVarsDirect: function(css, vars, preprocessor) {
		// For uso/less/stylus: substitute bare variable names with values.
		// uso uses /*[[name]]*/ tokens; stylus/less use plain variable names.
		if (preprocessor === "stylus") {
			css = userCSSParser._resolveStylusConditionals(css, vars);
		}
		vars.forEach(function(v) {
			var val = userCSSParser._cssValue(v);
			if (preprocessor === "uso") {
				// USO format: /*[[name]]*/ tokens
				var usoToken = new RegExp("\\/\\*\\[\\[" + userCSSParser._escapeRegex(v.name) + "\\]\\]\\*\\/", "g");
				css = css.replace(usoToken, val);
			} else {
				// LESS/stylus: bare variable name used as a value token.
				// For stylus, conditionals have already been resolved above.
				var varRe = new RegExp("\\b" + userCSSParser._escapeRegex(v.name) + "\\b", "g");
				css = css.replace(varRe, val);
			}
		});
		return css;
	},

	_resolveStylusConditionals: function(css, vars) {
		// Build a map of @var name → selected value
		var varMap = {};
		vars.forEach(function(v) { varMap[v.name] = v.value !== null ? v.value : v.defaultValue; });
		// Full Stylus-to-CSS pipeline
		return userCSSParser._compileStylus(css, varMap);
	},

	/**
	 * Mini Stylus-to-CSS compiler.
	 * Handles the subset of Stylus-lang commonly used in userstyles:
	 *   - // comments
	 *   - name = value assignments (shorthand variables like i = !important)
	 *   - name = @block { ... } block variables
	 *   - { name } block / variable interpolation
	 *   - if VAR { … } else if VAR { … } else { … } (truthy)
	 *   - if !VAR { … } (negated)
	 *   - if VAR is VALUE { … } (equality comparison, existing syntax)
	 *   - (cond) ? a : b ternary expressions
	 *   - transparentify(color, bg, alpha) — returns first arg as fallback
	 *   - implicit semicolons on property declarations
	 */
	_compileStylus: function(css, varMap) {
		var self = this;
		var stylusVars = {};
		var blocks = {};

		// --- Phase 1: Pre-processing ---

		// 1a. Strip // comments (only at line start or preceded by whitespace/operators, not in URLs)
		css = css.replace(/(^|[\s;{}()])\/\/.*$/gm, '$1');

		// 1b. Extract @block definitions (name = @block { content })
		css = css.replace(/(\w[\w-]*)\s*=\s*@block\s*\{([\s\S]*?)\}\s*/g, function(m, name, content) {
			blocks[name] = content;
			return '';
		});

		// 1c. Extract stylus variable assignments at any indent
		css = css.replace(/^[ \t]*([a-zA-Z_$][\w]*)[ \t]*=[ \t]*(.*?)[ \t]*$/gm, function(m, name, value) {
			value = value.trim();
			// Strip surrounding quotes for string values
			if ((value.charAt(0) === "'" && value.charAt(value.length - 1) === "'") ||
			    (value.charAt(0) === '"' && value.charAt(value.length - 1) === '"')) {
				value = value.substring(1, value.length - 1);
			}
			stylusVars[name] = value;
			return '';
		});

		// 1d. Expand { name } interpolation (iterate for chained refs)
		var expandedNames = {};
		for (var iter = 0; iter < 10; iter++) {
			var before = css;
			css = css.replace(/\{\s*([a-zA-Z_$][\w]*)\s*\}/g, function(m, name) {
				if (blocks[name]) {
					expandedNames[name] = true;
					return blocks[name];
				}
				if (stylusVars[name]) {
					expandedNames[name] = true;
					return stylusVars[name];
				}
				return m;
			});
			if (css === before) break;
		}

		// --- Phase 2: Walk structure, resolving conditionals ---

		css = self._resolveStylusIfElse(css, varMap, stylusVars);

		// --- Phase 3: Post-processing (iterate until stable) ---
		// Stylus vars may reference other vars or contain ternaries,
		// so we substitute, resolve ternaries, and handle transparentify
		// in a single loop until no further changes.
		for (var iter = 0; iter < 10; iter++) {
			var before = css;

			// a. Substitute stylus shorthand variables (skip names already expanded via {name})
			Object.keys(stylusVars).forEach(function(name) {
				if (expandedNames[name]) return;
				var val = stylusVars[name];
				var re = new RegExp('(^|[^\\w])' + self._escapeRegex(name) + '(?!\\w)', 'g');
				css = css.replace(re, function(m, before) {
					return before + val;
				});
			});

			// b. Resolve ternary expressions
			css = self._resolveStylusTernaries(css, varMap, stylusVars);

			// c. Handle transparentify() — fallback: return first color argument
			css = css.replace(/transparentify\s*\(([^)]*)\)/g, function(m, args) {
				var parts = args.split(',');
				return parts[0] ? parts[0].trim() : 'transparent';
			});

			// d. Add semicolons to property declarations (harmless if already present)
			//    Property: indent, word-chars, colon, space, value, no { } ; at end.
			css = css.replace(/^([ \t]*[\w-]+\s*:\s*[^;{}\n][^\n;{}]*)(\n|$)/gm, '$1;$2');

			if (css === before) break;
		}

		return css;
	},

	/**
	 * Walk CSS character-by-character, resolving stylus if/else if/else blocks.
	 * Handles truthy (if VAR {), negated (if !VAR {), and equality (if VAR is VALUE {).
	 */
	_resolveStylusIfElse: function(css, varMap, stylusVars) {
		function isTruthy(name) {
			if (stylusVars.hasOwnProperty(name)) {
				var v = stylusVars[name];
				// Empty parens () in stylus = null/falsy; non-empty strings are truthy
				return v !== '' && v !== '()' && v !== '0' && v !== 'false';
			}
			if (varMap.hasOwnProperty(name)) {
				var v = varMap[name];
				return v === '1' || v === 'true';
			}
			return false;
		}

		var result = '';
		var i = 0;
		while (i < css.length) {
			var rest = css.substring(i);
			var conditionMatch = null;
			var isElse = false;

			// Patterns in priority order: if !VAR {, if VAR is VALUE {, if VAR {, else if …, else {
			var m = null;
			if (!m) m = rest.match(/^else\s*\{/);
			if (!m) m = rest.match(/^else\s+\n?\s*\{/);
			if (!m) m = rest.match(/^else\s+if\s+!([\w-]+)\s*\{/);   // else if !VAR {
			if (!m) m = rest.match(/^else\s+if\s+([\w-]+)\s+is\s+([\w.-]+)\s*\{/);
			if (!m) m = rest.match(/^else\s+if\s+([\w-]+)\s*\{/);     // else if VAR {
			if (!m) m = rest.match(/^if\s+!([\w-]+)\s*\{/);            // if !VAR {
			if (!m) m = rest.match(/^if\s+([\w-]+)\s+is\s+([\w.-]+)\s*\{/);
			if (!m) m = rest.match(/^if\s+([\w-]+)\s*\{/);             // if VAR {

			if (m) {
				var fullMatch = m[0];
				// Determine condition type
				if (fullMatch.indexOf('else') === 0) {
					isElse = true;
					if (fullMatch === 'else{' || /^else\s+\{/.test(fullMatch)) {
						conditionMatch = { elseBlock: true };
					} else if (fullMatch.indexOf('!') !== -1) {
						// else if !VAR {
						conditionMatch = { truthy: false, varName: m[1], negated: true };
					} else if (fullMatch.indexOf(' is ') !== -1) {
						conditionMatch = { varName: m[1], cmpVal: m[2] };
					} else {
						conditionMatch = { truthy: true, varName: m[1], negated: false };
					}
				} else {
					if (fullMatch.indexOf('!') !== -1) {
						conditionMatch = { truthy: true, varName: m[1], negated: true };
					} else if (fullMatch.indexOf(' is ') !== -1) {
						conditionMatch = { varName: m[1], cmpVal: m[2] };
					} else {
						conditionMatch = { truthy: true, varName: m[1], negated: false };
					}
				}
			}

			if (!conditionMatch) {
				result += css.charAt(i);
				i++;
				continue;
			}

			// Find the matching brace for this block
			var blockStart = i;
			var braceDepth = 0;
			var started = false;
			var j = i;
			for (; j < css.length; j++) {
				var ch = css.charAt(j);
				if (ch === '{') { braceDepth++; started = true; }
				else if (ch === '}') { braceDepth--; }
				if (started && braceDepth === 0) {
					j++; // include the closing brace
					break;
				}
			}
			var blockEnd = j;

			// Evaluate this branch
			var matches = false;
			if (conditionMatch.elseBlock) {
				matches = true; // else always matches if reached
			} else if (conditionMatch.cmpVal !== undefined) {
				// Equality comparison: if VAR is VALUE
				var cmpName = conditionMatch.varName;
				var cmpVal = stylusVars.hasOwnProperty(cmpName) ? stylusVars[cmpName] : varMap[cmpName];
				matches = (cmpVal === conditionMatch.cmpVal);
			} else {
				// Truthy check
				var val = isTruthy(conditionMatch.varName);
				matches = conditionMatch.negated ? !val : val;
			}

			// Collect all branches (if / else-if / else) in this chain
			var branches = [];
			branches.push({
				isElse: isElse,
				matches: matches,
				blockStart: blockStart,
				blockEnd: blockEnd
			});

			var chainEnd = blockEnd;
			var looking = true;
			while (looking && chainEnd < css.length) {
				var afterBlock = css.substring(chainEnd);
				var nextBrM = null;
				if (!nextBrM) nextBrM = afterBlock.match(/^\s*else\s+\{/);
				if (!nextBrM) nextBrM = afterBlock.match(/^\s*else\s*\{/);
				if (!nextBrM) nextBrM = afterBlock.match(/^\s*else\s+if\s+!([\w-]+)\s*\{/);
				if (!nextBrM) nextBrM = afterBlock.match(/^\s*else\s+if\s+([\w-]+)\s+is\s+([\w.-]+)\s*\{/);
				if (!nextBrM) nextBrM = afterBlock.match(/^\s*else\s+if\s+([\w-]+)\s*\{/);
				if (!nextBrM) break;

				var brIdx = chainEnd + nextBrM.index;
				var brText = nextBrM[0];
				var isElseBlock = /^else\s*\{/.test(brText);
				var isElseIf = brText.indexOf('if') !== -1;

				// Find brace depth for this branch
				var brEnd = brIdx;
				var bd = 0;
				var startedBr = false;
				for (var k = brIdx; k < css.length; k++) {
					var c = css.charAt(k);
					if (c === '{') { bd++; startedBr = true; }
					else if (c === '}') { bd--; }
					if (startedBr && bd === 0) {
						k++;
						brEnd = k;
						break;
					}
				}

				var brMatch = false;
				if (isElseBlock) {
					brMatch = true;
				} else if (isElseIf) {
					if (brText.indexOf('!') !== -1) {
						var varNm = nextBrM[1];
						brMatch = !isTruthy(varNm);
					} else if (brText.indexOf(' is ') !== -1) {
						var varNm = nextBrM[1];
						var cmpVal = nextBrM[2];
						var resolvedCmp = stylusVars.hasOwnProperty(varNm) ? stylusVars[varNm] : (varMap.hasOwnProperty(varNm) ? varMap[varNm] : null);
						brMatch = (resolvedCmp === cmpVal);
					} else {
						var varNm = isElseBlock ? null : (brText.indexOf(' is ') !== -1 ? nextBrM[1] : nextBrM[1]);
						brMatch = isTruthy(nextBrM[1]);
					}
				}

				branches.push({
					isElse: isElseBlock,
					matches: brMatch,
					blockStart: brIdx,
					blockEnd: brEnd
				});
				chainEnd = brEnd;
				looking = true;
			}

			// Pick the first matching branch
			var keptBranch = null;
			for (var b = 0; b < branches.length; b++) {
				if (branches[b].matches) {
					keptBranch = branches[b];
					break;
				}
			}

			// Extract content from the kept branch (strip condition line and outer braces)
			if (keptBranch) {
				var blockCss = css.substring(keptBranch.blockStart, keptBranch.blockEnd);
				var firstBrace = blockCss.indexOf('{');
				var lastBrace = blockCss.lastIndexOf('}');
				if (firstBrace !== -1 && lastBrace > firstBrace) {
					result += blockCss.substring(firstBrace + 1, lastBrace);
				}
			}

			i = chainEnd;
		}
		return result;
	},

	/**
	 * Resolve Stylus ternary expressions: (cond) ? a : b
	 * Handles simple conditions: VAR == VALUE, &&, ||, !VAR
	 */
	_resolveStylusTernaries: function(css, varMap, stylusVars) {
		var self = this;
		return css.replace(/\(\s*([^)]+)\s*\)\s*\?\s*([^:]+?)\s*:\s*([^;}\n,]+?)(?=\s*[;}\n,{]|$)/g, function(m, cond, a, b) {
			var result = self._evaluateStylusCond(cond.trim(), varMap, stylusVars);
			var val = result ? a.trim() : b.trim();
			// Strip outer quotes
			if ((val.charAt(0) === "'" && val.charAt(val.length - 1) === "'") ||
			    (val.charAt(0) === '"' && val.charAt(val.length - 1) === '"')) {
				val = val.substring(1, val.length - 1);
			}
			// Stylus null
			if (val === '()') return '';
			return val;
		});
	},

	/**
	 * Evaluate a Stylus boolean expression.
	 * Supports: VAR, !VAR, VAR == VALUE, &&, ||
	 */
	_evaluateStylusCond: function(cond, varMap, stylusVars) {
		var self = userCSSParser;

		function truthy(name) {
			if (stylusVars.hasOwnProperty(name)) {
				var v = stylusVars[name];
				return v !== '' && v !== '()' && v !== '0' && v !== 'false';
			}
			if (varMap.hasOwnProperty(name)) {
				return varMap[name] === '1' || varMap[name] === 'true';
			}
			return false;
		}

		function getVal(name) {
			if (stylusVars.hasOwnProperty(name)) return stylusVars[name];
			if (varMap.hasOwnProperty(name)) return varMap[name];
			return name;
		}

		// Handle && and || with simple left-to-right evaluation
		var andParts = cond.split(/\s*&&\s*/);
		if (andParts.length > 1) {
			for (var ai = 0; ai < andParts.length; ai++) {
				if (!self._evaluateStylusCond(andParts[ai], varMap, stylusVars)) return false;
			}
			return true;
		}

		var orParts = cond.split(/\s*\|\|\s*/);
		if (orParts.length > 1) {
			for (var oi = 0; oi < orParts.length; oi++) {
				if (self._evaluateStylusCond(orParts[oi], varMap, stylusVars)) return true;
			}
			return false;
		}

		cond = cond.trim();

		// VAR == VALUE
		var eqM = cond.match(/^(\w+)\s*==\s*(.+)$/);
		if (eqM) {
			var v = getVal(eqM[1]);
			var target = eqM[2].trim().replace(/^["']|["']$/g, '');
			return String(v) === String(target);
		}

		// VAR != VALUE
		var neqM = cond.match(/^(\w+)\s*!=\s*(.+)$/);
		if (neqM) {
			var v = getVal(neqM[1]);
			var target = neqM[2].trim().replace(/^["']|["']$/g, '');
			return String(v) !== String(target);
		}

		// !VAR
		if (cond.indexOf('!') === 0) {
			var name = cond.substring(1).trim();
			return !truthy(name);
		}

		// Bare VAR — truthy check
		if (/^\w+$/.test(cond)) {
			return truthy(cond);
		}

		return false;
	},

	_cssValue: function(v) {
		var val = v.value !== null ? v.value : v.defaultValue;
		// For select/dropdown vars with Stylus heredoc options, use the
		// CSS value (heredoc content) of the selected option.
		if (v.options && v.options.length > 0) {
			var selected = null;
			for (var k = 0; k < v.options.length; k++) {
				if (v.options[k].value === val && v.options[k].cssValue) {
					selected = v.options[k];
					break;
				}
			}
			if (selected) val = selected.cssValue;
		}
		if (v.type === "number" || v.type === "range") {
			return val + (v.unit || "");
		}
		if (v.type === "checkbox") {
			return val === "1" ? "1" : "0";
		}
		return val;
	},

	_escapeRegex: function(s) {
		return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	},

	/**
	 * Produce an idUrl for a UserCSS based on @namespace + @name,
	 * falling back to the source URL.
	 */
	makeIdUrl: function(meta, sourceUrl) {
		if (meta["namespace"] && meta["name"]) {
			return "usercss:" + encodeURIComponent(meta["namespace"]) + ":" + encodeURIComponent(meta["name"]);
		}
		return sourceUrl || null;
	},

	/**
	 * Serialise variable values to a JSON string for storage in style metadata.
	 */
	serializeVars: function(vars) {
		var obj = {};
		vars.forEach(function(v) { obj[v.name] = v.value; });
		return JSON.stringify(obj);
	},

	/**
	 * Restore variable values from a serialised string into a vars array.
	 */
	deserializeVars: function(vars, serialized) {
		if (!serialized) return vars;
		var obj;
		try { obj = JSON.parse(serialized); } catch(e) { return vars; }
		return vars.map(function(v) {
			if (obj.hasOwnProperty(v.name)) {
				var val = obj[v.name];
				if (v.type === "text") {
					val = userCSSParser._stripQuotes(val);
				}
				return Object.assign({}, v, { value: val });
			}
			return v;
		});
	},

	/**
	 * Returns a warning string for preprocessors with limited/unknown support,
	 * or null if the preprocessor is fully supported.
	 */
	getPreprocessorWarning: function(preprocessor) {
		if (!preprocessor || preprocessor === "default") return null;
		if (preprocessor === "stylus") {
			return "Stylus preprocessor support is limited to basic variables, @block, conditionals, and ternaries. Complex Stylus features (functions, loops, color manipulation) are not available.";
		}
		if (preprocessor === "uso") return null;
		if (preprocessor === "less") {
			return "LESS preprocessor support is limited to basic variable name substitution. Full LESS syntax (mixins, nesting, functions) is not available.";
		}
		return "Unknown preprocessor: \"" + preprocessor + "\"";
	}
};
