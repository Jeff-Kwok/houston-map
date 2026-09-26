#!/usr/bin/env python3
"""Build a prebuilt USGS imagery pack: tiles concatenated into a few chunk files plus index.json.

The app fetches index.json, streams each chunk once and slices tiles out of it, instead of one request per tile.
"""
import argparse, concurrent.futures as cf, json, math, pathlib, time, urllib.request

URL = "https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}"

def tx(lon, z): return int((lon + 180) / 360 * 2**z)
def ty(lat, z):
    r = math.radians(lat)
    return int((1 - math.log(math.tan(r) + 1 / math.cos(r)) / math.pi) / 2 * 2**z)

def tiles(bbox, zmin, zmax):
    s, w, n, e = bbox
    for z in range(zmin, zmax + 1):
        for x in range(tx(w, z), tx(e, z) + 1):
            for y in range(ty(n, z), ty(s, z) + 1):
                yield z, x, y

def fetch(cache, t):
    z, x, y = t
    path = cache / str(z) / str(x) / f"{y}.jpg"
    if path.exists():
        return t, path
    for attempt in range(4):
        try:
            req = urllib.request.Request(URL.format(z=z, x=x, y=y), headers={"User-Agent": "houston-map-pack/1"})
            with urllib.request.urlopen(req, timeout=60) as r:
                data = r.read()
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
            return t, path
        except urllib.error.HTTPError as err:
            if err.code == 404:
                return t, None
        except Exception:
            pass
        time.sleep(2 * (attempt + 1))
    return t, None

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--bbox", default="29.52,-95.79,30.11,-95.01", help="south,west,north,east")
    ap.add_argument("--zmin", type=int, default=9)
    ap.add_argument("--zmax", type=int, default=15)
    ap.add_argument("--chunk-mb", type=float, default=45)
    ap.add_argument("--cache", default=".tilecache")
    ap.add_argument("--out", default="dist/packs/city")
    ap.add_argument("--name", default="Houston city")
    a = ap.parse_args()
    bbox = [float(v) for v in a.bbox.split(",")]
    cache, out = pathlib.Path(a.cache), pathlib.Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    want = list(tiles(bbox, a.zmin, a.zmax))
    print(f"{len(want)} tiles, zoom {a.zmin}-{a.zmax}")
    with cf.ThreadPoolExecutor(8) as ex:
        got = sorted((t, p) for t, p in ex.map(lambda t: fetch(cache, t), want) if p)
    missing = len(want) - len(got)
    chunks, cur, buf, limit = [], None, None, int(a.chunk_mb * 1e6)
    for t, p in got:
        data = p.read_bytes()
        if cur is None or cur["bytes"] + len(data) > limit:
            if cur: buf.close()
            cur = {"file": f"chunk-{len(chunks):02d}.bin", "bytes": 0, "tiles": []}
            chunks.append(cur); buf = open(out / cur["file"], "wb")
        buf.write(data)
        cur["tiles"].append([*t, cur["bytes"], len(data)])
        cur["bytes"] += len(data)
    if buf: buf.close()
    index = {"name": a.name, "source": "usgs", "bbox": bbox, "zmin": a.zmin, "zmax": a.zmax,
             "tiles": len(got), "missing": missing, "bytes": sum(c["bytes"] for c in chunks),
             "built_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "chunks": chunks}
    (out / "index.json").write_text(json.dumps(index, separators=(",", ":")))
    print(f"packed {len(got)} tiles ({missing} missing) into {len(chunks)} chunks, {index['bytes']/1e6:.1f} MB")

if __name__ == "__main__":
    main()
