#!/usr/bin/env bash
set -e
ROOT="$(dirname "$0")/src/content/codemirror"

REQUIRED=(
	"codemirror.js"
	"codemirror.css"
	"LICENSE"
	"mode/css/css.js"
	"addon/edit/matchbrackets.js"
	"addon/edit/closebrackets.js"
	"addon/search/searchcursor.js"
	"addon/search/search.js"
	"addon/search/jump-to-line.js"
	"addon/search/dialog.js"
	"addon/search/dialog.css"
	"addon/hint/show-hint.js"
	"addon/hint/show-hint.css"
	"addon/hint/css-hint.js"
	"addon/selection/active-line.js"
)

missing=0
for f in "${REQUIRED[@]}"; do
	if [ ! -f "$ROOT/$f" ]; then
		echo "MISSING: src/content/codemirror/$f"
		missing=1
	fi
done

if [ "$missing" -eq 1 ]; then
	echo ""
	echo "See src/content/codemirror/VENDOR_FILES.md for download instructions."
	exit 1
fi

echo "All CodeMirror files present."
exit 0
