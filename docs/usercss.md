# UserCSS format

UserCSS is a metadata format originally popularised by the Stylus extension. A
UserCSS style embeds metadata - name, author, version, variables - inside a
`/* ==UserStyle== */` comment block at the top of the CSS.

Stylem fully supports the UserCSS format for install, editing, and update
checking. Metadata fields you add to the block are parsed and displayed in the
install dialog and editor.

## Metadata fields

```css
/* ==UserStyle==
@name         Example Style
@namespace    author-namespace
@version      1.0.0
@description  Makes the web beautiful
@author       You
@homepageURL  https://example.com
@supportURL   https://example.com/issues
@updateURL    https://example.com/style.user.css
@license      MIT
@preprocessor default
==/UserStyle== */
```

| Field          | Required | Displayed | Used functionally |
|----------------|----------|-----------|-------------------|
| `@name`        | yes      | Install & editor title | Style name, combined with `@namespace` for dedup |
| `@namespace`   | yes*     | No        | Forms unique install ID with `@name` |
| `@version`     | yes*     | Metadata panel | Update comparison |
| `@description` | no       | Metadata panel | No |
| `@author`      | no       | Metadata panel | Mapped to `creator` in AddonManager |
| `@homepageURL` | no       | Clickable link in metadata | AddonManager homepage URL |
| `@supportURL`  | no       | Clickable link in Add-ons Manager detail view | No |
| `@updateURL`   | no       | Not shown in UI (used from metadata) | Update checking engine |
| `@license`     | no       | Metadata panel | No |
| `@preprocessor` | no      | Metadata panel | Determines variable substitution method |
| `@var`         | no       | Interactive controls | Variable substitution engine |
| `@advanced`    | no       | Interactive controls (collapsible) | Same as `@var` (xStyle compat) |

*Strictly required by the spec; Stylem works without them but they're recommended
for deduplication and update support.
**Note on partially supported metadata:** `@tag` and `@note`
are parsed but not rendered anywhere in the Stylem UI.

## Variables (`@var` / `@advanced`)

Variables let users customise a style without editing CSS. They are declared in
the metadata block and rendered as native UI controls on install and in the
editor.

### Supported types

| Type      | Syntax | Control | Default value |
|-----------|--------|---------|---------------|
| `color`   | `@var color <name> "<label>" <color>` | Colour picker + hex input | CSS colour (`#4488ff`, `rgb(...)`, etc.) |
| `text`    | `@var text <name> "<label>" <default>` | Text input | String (quote-wrapped if it contains spaces) |
| `checkbox`| `@var checkbox <name> "<label>" <0\|1>` | Checkbox | `1` (checked) or `0` (unchecked) |
| `select`  | `@var select <name> "<label>" <options>` | Dropdown | See below |
| `number`  | `@var number <name> "<label>" <default> [min(n) max(n) step(n)]` | Number input | Numeric with optional constraints |
| `range`   | `@var range <name> "<label>" <default> [min(n) max(n) step(n)]` | Slider | Numeric with optional constraints |

#### Select options

Two syntaxes are supported:

```
# JSON map
@var select theme "Theme" {
  "Light": "light",
  "Dark": "dark"
}

# Array shorthand (value = label)
@var select font "Font" ["Arial", "Helvetica", "monospace"]
```

Mark a default with `*` appended to the key: `"Dark*": "dark"`.

#### Number / Range constraints

Constraints are optional and order-independent:

```
@var number width "Max width" 960 min(480) max(1280) step(10)
@var range  size "Font size"  16px min(10px) max(48px) step(1)
```

### Preprocessors

The `@preprocessor` field selects how variables are injected into the CSS:

| Value      | Method | Support |
|------------|--------|---------|
| `default`  | CSS custom properties (`--var-name`) injected into `:root {}` | Full — recommended for modern styles |
| `uso`      | Replaces `/*[[name]]*/` tokens | Full — legacy userstyles.org compat |
| `less`     | Blind regex substitution of `@var-name` references | Limited — replaces `@var-name` tokens in the CSS with the variable's value. No actual LESS compilation. |
| `stylus`   | [Mini-compiler](#stylus-mini-compiler) — assigns `name = value`, `@block` variables, `{name}` interpolation, `if`/`else`, ternaries, `transparentify()` | Partial — see [specifics below](#stylus-mini-compiler). |

`@advanced` is supported as a prefix alias for `@var` (for xStyle compatibility)
and is treated identically except variables are shown in a collapsible section.

### Stylus mini-compiler <a id="stylus-mini-compiler"></a>

For `@preprocessor stylus`, Stylem runs a lightweight brace-delimited compiler.
Pure indentation-based Stylus (no braces) is not supported.

**Supported:**
- `//` single-line comments (stripped)
- `name = value` variable assignments (`i = !important`)
- `name = @block { ... }` block variables and `{name}` interpolation
- `if VAR { }` / `if !VAR { }` / `if VAR is VALUE { }` conditionals with
  `else if` / `else` chains (variable names may contain hyphens)
- `(cond) ? a : b` ternary expressions with `&&`, `||`, `==`, `!=`, and `!`
- `transparentify(color, bg, alpha)` — returns the first color argument as a fallback
- Implicit semicolons added to property declarations

**Not supported:**
- Indentation-based syntax (no braces)
- Arithmetic operators (`+`, `-`, `*`, `/`) — variable values are plain-text substitution only
- Color manipulation functions beyond `transparentify()` (e.g. `lighten()`, `darken()`, `mix()`, `rgba()` extraction)
- Lexical scoping — variable assignments inside conditionals use the last-defined value globally; shadowing inside nested blocks is not tracked
- `@extends`, `@import`, `@mixin`, loops, iteration, or `for/in`
- Built-in Stylus functions (`unit()`, `typeof()`, `opposite-position()`, etc.)

### LESS

`@preprocessor less` performs a simple regex substitution: every occurrence of
`@var-name` in the CSS is replaced with the variable's value. There is no
actual LESS compilation — nested rules, mixins, guards, arithmetic, and all
other LESS language features are not processed.

## Install flow

When you browse to a `.user.css` URL, Stylem detects it automatically, fetches
the content, parses the metadata block, and shows the install dialog. The dialog
displays the parsed metadata, variable controls (options), applies-to summary,
and a read-only preview of the CSS. On save, the metadata and variable values
are stored alongside the CSS.

For `.user.css` files hosted locally, drag the file into the Stylem manager page
to install.
