# Houston Blackout Map

A satellite map of Houston with residential areas blacked out, so only non-residential land shows.
It installs as an app on phone and desktop and works offline.

- **Imagery:** USGS The National Map orthoimagery (public domain, down to zoom 16) can be saved for
  offline use. Esri World Imagery is sharper (zoom 19) but view only.
- **Houston packs:** prebuilt by `tools/pack.py` into a few chunk files so a device installs them in a
  handful of requests. Region pack: the square 80.5 km (50 statute miles) out from downtown, zoom 8–13.
  City pack: the Houston box, zoom 14–15. The deploy workflow builds both and caches the tiles.
- **Blackout:** OpenStreetMap `landuse=residential` areas (ODbL), fetched through Overpass, plus
  anything you draw, plus grid squares you mark as not of interest.
- **Grid:** MGRS squares in the package's UTM zone, 500 m to 10 km. The main map only shows the grid; tapping a
  square opens it in a focus pane. There you select squares (tap, or press and drag for several), split them 5×5
  as many levels deep as needed, paint blackout, draw and reshape areas of interest, and see the square's places.
  Opening a square fetches its places and saves USGS NAIP 0.3 m imagery (zoom 17–19) for it, so it works offline.
- **Areas of interest:** named shapes in your own categories, each category with a colour and opacity. They are
  drawn and reshaped in the focus pane; the side panel renames, recolours, sorts and deletes them.
- **Places:** OSM place pips by category, city/town/neighborhood labels, and search.

Everything you make stays in the browser on each device; export and import GeoJSON to move it.

## Run and build

    ./run.sh          # build dist/ and open it at http://127.0.0.1:8787/
    LAN=1 ./run.sh    # also serve it to phones on the same Wi-Fi (browser only, no install)
    python3 build.py  # build dist/ only
    ./tools/packs.sh  # build both Houston packs into dist/packs (about 290 MB)

Edit `src/app.html`; `build.py` inlines `vendor/` (Leaflet 1.9.4, Leaflet-Geoman 2.17.0) so the app
needs no CDN. Pushing to `main` deploys to GitHub Pages.
