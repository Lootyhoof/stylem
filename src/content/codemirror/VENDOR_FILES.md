# CodeMirror 5 — Files to Vendor

Download: https://codemirror.net/5/codemirror-5.65.21.zip (v5.65.21, MIT License)

Extract **only** the following files from the zip into the matching paths
under `src/content/codemirror/`. Do not copy the whole zip — Stylem only
needs the CSS mode and a handful of addons.

## Required — copy exactly these paths

```
From zip:                                  To:
lib/codemirror.js                       -> src/content/codemirror/codemirror.js
lib/codemirror.css                      -> src/content/codemirror/codemirror.css
LICENSE                                 -> src/content/codemirror/LICENSE

mode/css/css.js                         -> src/content/codemirror/mode/css/css.js

addon/edit/matchbrackets.js             -> src/content/codemirror/addon/edit/matchbrackets.js
addon/edit/closebrackets.js             -> src/content/codemirror/addon/edit/closebrackets.js

addon/search/searchcursor.js            -> src/content/codemirror/addon/search/searchcursor.js
addon/search/search.js                  -> src/content/codemirror/addon/search/search.js
addon/search/jump-to-line.js            -> src/content/codemirror/addon/search/jump-to-line.js
addon/dialog/dialog.js                  -> src/content/codemirror/addon/search/dialog.js
addon/dialog/dialog.css                 -> src/content/codemirror/addon/search/dialog.css

addon/hint/show-hint.js                 -> src/content/codemirror/addon/hint/show-hint.js
addon/hint/show-hint.css                -> src/content/codemirror/addon/hint/show-hint.css
addon/hint/css-hint.js                  -> src/content/codemirror/addon/hint/css-hint.js

addon/selection/active-line.js          -> src/content/codemirror/addon/selection/active-line.js

theme/default.css (already in codemirror.css, no action needed)
```

Note: `addon/dialog/dialog.js` and `dialog.css` are renamed to live under
`addon/search/` purely for tidiness in this project's folder layout — the
content is unchanged, only the destination folder differs from upstream.
If you'd rather keep upstream paths exactly, that's fine too — just update
the `<script>`/`<link>` paths in `edit.xul` to match.

## After copying

Run `./verify_codemirror.sh` (included in this project) to confirm every
required file is present before building the XPI.

## License compliance

**Compatibility confirmed:** CodeMirror 5 is MIT licensed; Stylem is
GPLv3 licensed (see `COPYING` in the project root). MIT is a permissive
license with no copyleft requirement, and is explicitly compatible with
inclusion in a GPLv3 work — this is a one-directional compatibility (MIT
code may be folded into GPLv3 distributions; the reverse does not hold).
Full details and the compliance checklist are in
`THIRD_PARTY_LICENSES.md` at the project root.

The `LICENSE` file from the CodeMirror zip MUST be copied into
`src/content/codemirror/LICENSE` and is referenced from Stylem's own
`THIRD_PARTY_LICENSES.md`.

## Applying patches when upgrading

A unified diff of all local modifications against the v5.65.21 upstream
is at `codemirror-patches.patch`. Apply it after replacing files:

```
patch -p0 < codemirror-patches.patch
(assuming you run the command from the repo root)
```
