#!/usr/bin/env bash
# Run once on server to strip SW unregister from index.html and add manifest + sw-register
set -euo pipefail
ROOT="${1:-.}"
INDEX="$ROOT/index.html"
if [[ ! -f "$INDEX" ]]; then
  echo "index.html not found at $INDEX"
  exit 1
fi
cp "$INDEX" "$INDEX.bak.$(date +%s)"
# Remove unregister/caches purge block (best-effort)
python3 - <<'PY' "$INDEX"
import re, sys
path = sys.argv[1]
text = open(path, encoding='utf-8').read()
new, n = re.subn(
    r"\s*<script>\s*if \('serviceWorker' in navigator\) \{.*?caches\.delete\(keys\[i\]\);\s*\}\s*\);\s*\}\s*function purgeStuckLoader",
    "\n  <link rel=\"manifest\" href=\"./manifest.json\"/>\n  <script>\n    function purgeStuckLoader",
    text,
    count=1,
    flags=re.S,
)
if n == 0:
    print('WARN: unregister block not matched; manual edit may be needed')
else:
    text = new
    print('OK: removed unregister block')
if 'sw-register.js' not in text:
    text = text.replace('</body>', '  <script src="js/sw-register.js"></script>\n</body>', 1)
    print('OK: added sw-register.js')
if 'rel="manifest"' not in text:
    text = text.replace('</head>', '  <link rel="manifest" href="./manifest.json"/>\n</head>', 1)
    print('OK: added manifest link')
open(path, 'w', encoding='utf-8').write(text)
print('Done', path)
PY
