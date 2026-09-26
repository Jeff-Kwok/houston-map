# Houston Blackout Map

A satellite map of Houston with residential areas blacked out, so only non-residential land shows.
It installs as an app on phone and desktop and works offline.

- **Imagery:** USGS The National Map orthoimagery (public domain, down to zoom 16) can be saved for
  offline use. Esri World Imagery is sharper (zoom 19) but view only.
- **Blackout:** OpenStreetMap `landuse=residential` areas (ODbL), fetched through Overpass, plus
  anything you draw. Edits, saved tiles and overlays stay in the browser on each device.

## Run and build

    ./run.sh          # build dist/ and open it at http://127.0.0.1:8787/
    LAN=1 ./run.sh    # also serve it to phones on the same Wi-Fi (browser only, no install)
    python3 build.py  # build dist/ only

Edit `src/app.html`; `build.py` inlines `vendor/` (Leaflet 1.9.4, Leaflet-Geoman 2.17.0) so the app
needs no CDN. Pushing to `main` deploys to GitHub Pages.
