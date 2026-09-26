# Houston Blackout Map

A satellite map of Houston with residential areas blacked out, so only non-residential land shows.
It installs as an app on phone and desktop and works offline.

- **Imagery:** USGS The National Map orthoimagery (public domain, down to zoom 16) can be saved for
  offline use. Esri World Imagery is sharper (zoom 19) but view only.
- **Houston packs:** prebuilt by `tools/pack.py` into a few chunk files so a device installs them in a
  handful of requests. Region pack: the square 161 km (100 statute miles) out from downtown, zoom 8–13.
  City pack: the Houston box, zoom 14–15. The deploy workflow builds both and caches the tiles.
- **Blackout:** OpenStreetMap `landuse=residential` areas (ODbL), fetched through Overpass, plus
  anything you draw, plus grid squares you mark as not of interest.
- **Grid:** MGRS squares (UTM zone 15), 500 m to 10 km, any square split N×N as many levels deep as needed.
- **Areas of interest:** named shapes in your own categories, each category with a colour and opacity.
- **Places:** OSM place pips by category, city/town/neighborhood labels, and search.

Everything you make stays in the browser on each device; export and import GeoJSON to move it.

## Run and build

    ./run.sh          # build dist/ and open it at http://127.0.0.1:8787/
    LAN=1 ./run.sh    # also serve it to phones on the same Wi-Fi (browser only, no install)
    python3 build.py  # build dist/ only
    ./tools/packs.sh  # build both Houston packs into dist/packs (about 290 MB)

Edit `src/app.html`; `build.py` inlines `vendor/` (Leaflet 1.9.4, Leaflet-Geoman 2.17.0) so the app
needs no CDN. Pushing to `main` deploys to GitHub Pages.
