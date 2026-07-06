# Frequently asked questions

## Is Stylem compatible with the old Stylish?

Yes. Stylem is a fork of Stylish refactored for Pale Moon. It uses the same
storage format and will automatically discover any existing styles when
installed.

## Can I use styles from userstyles.org?

Userstyles.org is no longer maintained. Most styles have been archived at
[userstyles.world](https://userstyles.world/). Stylem can still install from
legacy userstyles.org URLs if you have one.

## How are styles categorised?

Stylem classifies styles into three types based on their `@-moz-document` and
`@namespace` rules:

- **App** - targets browser chrome (XUL namespace, or rules using `chrome:`,
  `about:`, or `x-jsd:` protocols)
- **Global** - applies to all sites (no `@-moz-document` rules, or rules
  covering entire protocols like `url-prefix(http:)`)
- **Site** - restricted to specific domains or URLs

You can see the type in the style manager (`about:addons` → **User Styles**).

## How do updates work?

If a style has an `@updateURL` (UserCSS) or an update URL set, Stylem
registers it with the browser's addon manager. Open `about:addons` → **User
Styles** and use **Check for Updates** on individual styles or use the gear
menu for bulk checking. You can disable global update checking in the
preferences (`extensions.stylem.updatesEnabled`).

## My style doesn't apply

Make sure the style's **Applies To** rules match the page you're viewing. If
the style targets browser chrome (toolbars, menus, etc.), ensure the style is
set as a **global** or **app** style (not restricted to a specific site). If
the code editor reports errors, fix those first.

## How do I back up my styles?

Open the manager (`about:addons` → **User Styles**), click the gear menu, and
select **Export**. This saves all your styles as a JSON file. Use **Import** to
restore them later.

## Can I disable all styles at once?

Yes - from the toolbar button popup, click **Turn all styles off**. Toggle it
back on with **Turn all styles on**.

## I found a bug. Where do I report it?

Open an issue on the
[GitHub repository](https://github.com/Lootyhoof/stylem/issues)
with a description of the problem, the Pale Moon version, and steps to
reproduce.
