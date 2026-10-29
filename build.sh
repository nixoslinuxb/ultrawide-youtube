#!/usr/bin/env sh
# UltraWide YouTube — .xpi paketi üretir (aslında yeniden adlandırılmış bir zip).
set -eu
cd "$(dirname "$0")"

name="ultrawide-youtube"
version="$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' manifest.json | head -n 1)"
out="dist/${name}-${version}.xpi"

mkdir -p dist
rm -f dist/*.xpi

files="manifest.json src popup icons"

if command -v zip >/dev/null 2>&1; then
  zip -r -q -X "$out" $files
else
  python3 - "$out" $files <<'PY'
import sys
import zipfile
from pathlib import Path

out, *items = sys.argv[1:]
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as archive:
    for item in items:
        path = Path(item)
        if path.is_file():
            archive.write(path, path.as_posix())
        else:
            for file in sorted(path.rglob("*")):
                if file.is_file():
                    archive.write(file, file.as_posix())
PY
fi

echo "Paket hazır: $out"
