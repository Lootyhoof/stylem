# Getting started with Stylem

## Installation

Install Stylem from the
[Pale Moon Add-Ons Site](https://addons.palemoon.org/addon/stylem/) or drag a
built `.xpi` into the browser. On first run the toolbar button is added to the
nav bar and the documentation opens in a new tab.

If you have Stylish installed, disable or remove it before installing Stylem.
Stylem will automatically discover and import any existing styles.

## The toolbar button

Click the Stylem icon ![icon](../src/skin/16w.svg) in the nav bar to open the
toolbar popup. From here you can:

- **Toggle styles** on/off with a click
- **Write a new style** - blank, for the current site, or for the current domain
- **Find styles** for the current site on userstyles.world
- **Manage styles** - opens `about:addons` where you can edit, uninstall, and
  check for updates
- **Turn all styles on/off** globally

## Creating a style

Choose **Write new style** from the toolbar menu. The editor opens with a
UserCSS metadata template prefilled. Fill in the name and add your CSS below.
See the [editor guide](editor.md) for details on the editor features, toolbar,
and applies-to section.

To have the style only apply to certain pages, use the **Applies To** section
in the editor or write `@-moz-document` rules directly. See the
[URL matching guide](url-matching.md) for a full reference on rule types and
syntax.

## Finding and installing styles

### userstyles.world

1. Click **Find styles for this site** in the toolbar menu (or visit
   [userstyles.world](https://userstyles.world/)).
2. Click **Install** on a style page.
3. The install dialog opens - review the metadata, adjust any variables, and
   click **Save**.

### Raw .user.css URLs

Navigating to a URL ending in `.user.css` triggers the install flow
automatically. This works with any host.

## Managing styles

Right-click a style in the toolbar popup for quick enable/disable, edit, and
uninstall. For full management (including update checks and import/export),
open `about:addons` and select the **User Styles** category.

## Further reading

- [Editor guide](editor.md) - editor layout, toolbar, themes, embedding images
- [URL matching](url-matching.md) - @-moz-document rule reference and examples
- [UserCSS format](usercss.md) - metadata fields, variables, preprocessors
- [Advanced techniques](advanced.md) - overwriting styles, element selectors,
  AGENT_SHEET
- [FAQ](faq.md) - compatibility, updates, troubleshooting, backup
