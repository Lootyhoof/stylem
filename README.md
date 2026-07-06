# Stylem

A UserCSS-compatible user style manager for Pale Moon and other Mozilla-based
software. Install, write, and manage styles that change the appearance of web
pages and applications.

## Features

- **[Style editor](docs/editor.md)** - syntax highlighting, error checking,
  preview, applies-to rule editor, and CSS namespace/image utilities
- **[UserCSS support](docs/usercss.md)** - metadata parsing, variable rendering,
  and install flows for `.user.css` files
- **[URL matching](docs/url-matching.md)** - reference for `@-moz-document`
  rules (domain, URL, URL prefix, regexp)
- **[Advanced techniques](docs/advanced.md)** - overwriting page styles,
  `!important` and specificity, AGENT_SHEET, replacing images, element
  selectors, DOM Inspector tool
- **Install from userstyles.world** or any raw `.user.css` URL
- **Import/export** styles to/from a JSON backup file
- **Per-style and bulk update checking** from `about:addons`

## Quick start

1. Install Stylem from the
   [Pale Moon Add-Ons Site](https://addons.palemoon.org/addon/stylem/).
2. Click the Stylem toolbar button to view your installed styles.
3. Select **Write new style** to create one.
4. Browse for styles at [userstyles.world](https://userstyles.world/).

See the [getting-started guide](docs/getting-started.md) for more detail.

## Installing from XPI

Download the latest `.xpi` from the
[Releases](https://github.com/Lootyhoof/stylem/releases) page and drag it into
the browser. Ensure **Stylish** is disabled or removed first - Stylem will
pick up any existing styles automatically.

## Building

```sh
git clone https://github.com/Lootyhoof/stylem
cd stylem
./build.sh          # produces stylem-dev-pm.xpi
./build.sh 42       # produces stylem-42-pm.xpi
```

The script zips the contents of `src/` into an `.xpi` file.

## Contributing

Pull requests are welcome. Translations can be submitted via pull request -
see the existing locale files under `src/locale/` as a template.

## License

Copyright (C) 2005–2014 Jason Barnabe &lt;jason.barnabe@gmail.com&gt;  
Copyright (C) 2018–2026 Stylem Contributors

GPLv3 - see [COPYING](COPYING) for the full text.
