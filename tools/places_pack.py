#!/usr/bin/env python3
"""Build Overture Maps places for a package square into small per-cell JSON files the app loads on demand.

Keeps places with a category, confidence >= --min-confidence, and not marked permanently closed.
Cells are 0.05 degrees (about 5.5 km); a focus square touches at most four.
"""
import argparse, collections, json, math, pathlib, time
import duckdb

GROUP = {"food_and_drink": "food", "shopping": "shop", "lodging": "lodging", "arts_and_entertainment": "attraction",
         "sports_and_recreation": "park", "geographic_entities": "park", "health_care": "health", "education": "education",
         "travel_and_transportation": "transport", "lifestyle_services": "service", "services_and_business": "service",
         "community_and_government": "service"}
CELL = 20  # cells per degree

def group_of(top, basic):
    if top == "cultural_and_historic":
        return "worship" if ("worship" in basic or "religious" in basic) else "attraction"
    return GROUP.get(top, "service")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--bbox", default="29.035,-96.202,30.486,-94.537", help="south,west,north,east")
    ap.add_argument("--release", default="2026-09-23.0")
    ap.add_argument("--min-confidence", type=float, default=0.7)
    ap.add_argument("--out", default="dist/packs/places")
    a = ap.parse_args()
    s, w, n, e = (float(v) for v in a.bbox.split(","))
    out = pathlib.Path(a.out); out.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect()
    con.execute("INSTALL httpfs; LOAD httpfs; SET s3_region='us-west-2';")
    t0 = time.time()
    rows = con.execute(f"""
      SELECT id, names.primary, taxonomy.hierarchy[1], basic_category, bbox.ymin, bbox.xmin,
             addresses[1].freeform, addresses[1].locality, phones[1], websites[1], confidence
      FROM read_parquet('s3://overturemaps-us-west-2/release/{a.release}/theme=places/type=place/*', hive_partitioning=1)
      WHERE bbox.xmin BETWEEN ? AND ? AND bbox.ymin BETWEEN ? AND ?
        AND confidence >= ? AND basic_category IS NOT NULL AND names.primary IS NOT NULL
        AND coalesce(operating_status, '') <> 'permanently_closed'""", [w, e, s, n, a.min_confidence]).fetchall()
    cells = collections.defaultdict(list)
    for pid, name, top, basic, lat, lon, street, city, phone, web, conf in rows:
        addr = ", ".join(x for x in (street, city) if x)
        cells[f"{math.floor(lat*CELL)}_{math.floor(lon*CELL)}"].append(
            [pid[:16], round(lat, 6), round(lon, 6), name, group_of(top, basic), basic, addr, phone or "", web or "", round(conf, 2)])
    size = 0
    for key, recs in cells.items():
        text = json.dumps(recs, separators=(",", ":"), ensure_ascii=False)
        (out / f"{key}.json").write_text(text); size += len(text.encode())
    index = {"source": "Overture Maps Foundation places", "license": "CDLA-Permissive-2.0", "release": a.release,
             "bbox": [s, w, n, e], "cell_per_degree": CELL, "min_confidence": a.min_confidence, "places": len(rows),
             "bytes": size, "built_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
             "cells": {k: len(v) for k, v in sorted(cells.items())}}
    (out / "index.json").write_text(json.dumps(index, separators=(",", ":")))
    print(f"{len(rows)} places in {len(cells)} cells, {size/1e6:.1f} MB, {time.time()-t0:.0f} s")

if __name__ == "__main__":
    main()
