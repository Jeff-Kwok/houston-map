#!/usr/bin/env bash
# Builds the street/water/park label pack: a Protomaps (OpenStreetMap) vector extract of the Houston package square.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=dist/packs/labels; BBOX="-96.202,29.035,-94.537,30.486"; MAXZOOM=14
mkdir -p "$OUT" .tools
if [ ! -x .tools/pmtiles ]; then
  curl -sL https://github.com/protomaps/go-pmtiles/releases/download/v1.31.2/go-pmtiles_1.31.2_Linux_x86_64.tar.gz | tar xz -C .tools pmtiles
fi
BUILD=$(curl -s https://build-metadata.protomaps.dev/builds.json | python3 -c "import json,sys;print(json.load(sys.stdin)[-1]['key'])")
.tools/pmtiles extract "https://build.protomaps.com/$BUILD" "$OUT/houston.pmtiles" --bbox="$BBOX" --maxzoom=$MAXZOOM
python3 - "$OUT" "$BUILD" <<'PY'
import json, os, sys, time
out, build = sys.argv[1], sys.argv[2]
size = os.path.getsize(f"{out}/houston.pmtiles")
json.dump({"file": "houston.pmtiles", "build": build, "bytes": size, "maxzoom": 14,
           "built_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}, open(f"{out}/index.json", "w"))
PY
