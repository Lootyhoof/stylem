# Style editor

The editor is the main tool for creating and modifying styles. It uses
CodeMirror 5 for syntax-highlighted CSS editing with a fallback to a plain
textbox if CodeMirror is unavailable.

## Opening the editor

- From the toolbar popup: **Edit** on any style, or **Write new style**
- From `about:addons` → **User Styles**: select a style and click **Edit**

## Editor layout

```
┌─────────────────────────────────────┐
│ Toolbar: Save Preview Check Insert  │
├─────────────────────────────────────┤
│ Name field                Update URL │
├─────────────────────────────────────┤
│ Applies To section                  │
├─────────────────────────────────────┤
│ Options panel (if any @var)         │
│   [Reset to defaults]               │
├─────────────────────────────────────┤
│ Code editor                         │
│ (CodeMirror with CSS mode)          │
└─────────────────────────────────────┘
```

## Toolbar

- **Save** - saves the current style
- **Preview** - temporarily applies the current code so you can see changes
  without saving
- **Check for Errors** - runs CSS syntax checking
- **Insert** - inserts common code snippets at the cursor:
  - HTML/XUL namespace declarations
  - Chrome folder path
  - Data URI (opens a file picker)
  - UserCSS Metadata template

## Applies To

Controls which pages the style applies to. The summary shows the current rules;
click **Edit** to add or remove conditions. For full details on rule syntax,
see [URL matching](url-matching.md).

- **URL** - matches an exact URL (including protocol)
- **URL Prefix** - matches any URL starting with the given string (including
  protocol)
- **Domain** - matches all pages on a domain and its subdomains (do not include
  protocol or wildcards)
- **RegExp** - matches URLs against a regular expression (enclosed in quotes,
  backslashes escaped per CSS rules)

Changes are written as an `@-moz-document` wrapper in the code.

## Options

When the style contains a `==UserStyle==` metadata block with `@var`
declarations, the **Options** panel renders interactive controls
for each variable — colour pickers, checkboxes, dropdowns, sliders, etc.
Click **Reset to defaults** to restore all variables to their original values.

## CSS namespaces

CSS namespaces restrict selectors to elements in a certain XML namespace. In
most cases you don't need one - the style's `@-moz-document` rules are
sufficient to scope it.

- **For web pages:** `@namespace url(http://www.w3.org/1999/xhtml);`
- **For browser chrome (XUL):**
  `@namespace url(http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul);`

If a style is global (applies to all sites), include the HTML namespace so
selectors match as expected. For styles that only target a specific site via
`@-moz-document`, the namespace is optional.

Use **Insert → HTML namespace** or **Insert → XUL namespace** in the toolbar
to add these automatically.

## Embedding images with data URIs

To embed an image directly in a style (avoiding external dependencies and
loading delays), use a data URI:

```css
#my-element {
    background: url(data:image/png;base64,...) no-repeat;
}
```

From the editor toolbar, choose **Insert → Data URI…** and select a file. The
data URI is inserted at the cursor. You can also use external tools like
[the data URI kitchen](https://software.hixie.ch/utilities/cgi/data/data) to
generate data URIs.

## Checking for errors

Click **Check for Errors** to run the CSS parser against your code. Warnings
and errors appear inline in the editor and in the browser console.

## Themes

The editor supports several color themes: Default, Eclipse, Monokai, Material,
and Dracula. Change the theme from the drop-down in the toolbar.
