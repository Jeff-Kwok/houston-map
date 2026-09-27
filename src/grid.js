"use strict";
// MGRS/UTM grid in the open package's zone. The overview only shows it; a square opens in the focus pane,
// where it is split N×N (nested) and parts are blacked out as "not of interest".
const Grid = (() => {
  let ZONE = 15, ZONE_W = -96.202, ZONE_E = -90;   // the zone is stretched to cover the whole package square
  const g = {base:1000, splits:new Map(), black:new Set(), show:true, focus:null, sel:new Map(), fmode:"select", seeThrough:false};
  const SPLIT = 5, MAX_DEPTH = 2;   // base → 1/5 → 1/25 (1 km → 200 m → 40 m)
  const depthOf = c => Math.round(Math.log(g.base/c.size)/Math.log(SPLIT));
  const canSplit = c => depthOf(c) < MAX_DEPTH;
  const fmt = v => String(+v.toFixed(2));
  const cell = (size, e0, n0, zone = ZONE) => ({zone, size, e0, n0, id:`${zone}/${fmt(size)}/${fmt(e0)}/${fmt(n0)}`});
  const parse = id => { const [zone, size, e0, n0] = id.split("/").map(Number); return {zone, size, e0, n0, id}; };
  const zoneOf = lng => Math.min(60, Math.floor((lng + 180)/6) + 1);
  const toUtm = ll => UTM.forward(ll.lat, ll.lng, ZONE);
  const toLL = (e, n, zone = ZONE) => { const p = UTM.inverse(e, n, zone); return [p.lat, p.lng]; };
  const corners = c => [toLL(c.e0,c.n0,c.zone), toLL(c.e0+c.size,c.n0,c.zone), toLL(c.e0+c.size,c.n0+c.size,c.zone), toLL(c.e0,c.n0+c.size,c.zone)];
  const digitsFor = size => Math.max(0, Math.min(5, 5 - Math.floor(Math.log10(size) + 1e-9)));
  const ref = c => UTM.mgrs(c.e0 + 1e-6, c.n0 + 1e-6, c.zone, toLL(c.e0, c.n0, c.zone)[0], digitsFor(c.size));
  const sizeText = s => s >= 1000 ? `${+(s/1000).toFixed(2)} km` : `${+s.toFixed(1)} m`;

  // Squares from the base square down to the smallest split square under ll.
  function chainAt(ll){
    const p = toUtm(ll);
    const chain = [cell(g.base, Math.floor(p.e/g.base)*g.base, Math.floor(p.n/g.base)*g.base)];
    for (let depth = 0; depth < 12; depth++){
      const c = chain.at(-1), f = g.splits.get(c.id); if (!f) break;
      const s = c.size/f;
      const i = Math.min(f-1, Math.max(0, Math.floor((p.e-c.e0)/s))), j = Math.min(f-1, Math.max(0, Math.floor((p.n-c.n0)/s)));
      chain.push(cell(s, c.e0+i*s, c.n0+j*s, c.zone));
    }
    return chain;
  }
  const cellAt = ll => chainAt(ll).at(-1);
  function children(c){
    const f = g.splits.get(c.id); if (!f) return [];
    const s = c.size/f, out = [];
    for (let i=0;i<f;i++) for (let j=0;j<f;j++) out.push(cell(s, c.e0+i*s, c.n0+j*s, c.zone));
    return out;
  }
  function dropSubtree(c){ for (const k of children(c)){ dropSubtree(k); g.black.delete(k.id); } g.splits.delete(c.id); }
  function split(c, f){
    if (g.splits.has(c.id)) dropSubtree(c);
    const wasBlack = g.black.delete(c.id);
    g.splits.set(c.id, f);
    if (wasBlack) for (const k of children(c)) g.black.add(k.id);
  }
  function clearBlack(c){ g.black.delete(c.id); children(c).forEach(clearBlack); }
  const within = (c, outer) => c.zone === outer.zone && c.e0 >= outer.e0 - 1e-6 && c.n0 >= outer.n0 - 1e-6
    && c.e0 + c.size <= outer.e0 + outer.size + 1e-6 && c.n0 + c.size <= outer.n0 + outer.size + 1e-6;
  const ring = c => [...corners(c), corners(c)[0]].map(([la, lo]) => [lo, la]);
  function unsplit(c){
    const kids = children(c), allBlack = kids.length > 0 && kids.every(k => g.black.has(k.id));
    dropSubtree(c); if (allBlack) g.black.add(c.id);
  }

  /* ---------- drawing (one "view" per map: the overview and the focus pane) ---------- */
  function makeView(m, prefix){
    const pane = (n, z) => { const el = m.createPane(prefix + n); el.style.zIndex = z; el.style.pointerEvents = "none"; return prefix + n; };
    const fp = pane("Fill", 410), lp = pane("Lines", 430);
    return {m, labelPane:pane("Labels", 615), fillR:L.canvas({pane:fp, padding:0.3}), lineR:L.canvas({pane:lp, padding:0.3}),
      fills:L.layerGroup().addTo(m), lines:L.layerGroup().addTo(m), labels:L.layerGroup().addTo(m)};
  }
  const pxPerM = m => { const c = m.getCenter(); return 2**m.getZoom()/(156543.034*Math.cos(c.lat*Math.PI/180)); };
  function viewUtm(m){
    const b = m.getBounds(), c = b.getCenter();
    const pts = [b.getSouthWest(), b.getNorthWest(), b.getNorthEast(), b.getSouthEast(),
      L.latLng(b.getNorth(), c.lng), L.latLng(b.getSouth(), c.lng)].map(toUtm);
    const es = pts.map(p=>p.e), ns = pts.map(p=>p.n);
    return {e0:Math.min(...es), e1:Math.max(...es), n0:Math.min(...ns), n1:Math.max(...ns)};
  }
  const inView = (c, v) => c.zone === ZONE && !(c.e0 > v.e1 || c.e0+c.size < v.e0 || c.n0 > v.n1 || c.n0+c.size < v.n0);
  function segment(view, e0, n0, e1, n1, style){
    const pts = []; for (let k=0;k<=6;k++) pts.push(toLL(e0+(e1-e0)*k/6, n0+(n1-n0)*k/6));
    view.lines.addLayer(L.polyline(pts, style));
  }
  function draw(view, focus){
    view.fills.clearLayers(); view.lines.clearLayers(); view.labels.clearLayers();
    const v = viewUtm(view.m), ppm = pxPerM(view.m);
    const keep = c => inView(c, v) && (!focus || within(c, focus));
    const opacity = focus && g.seeThrough ? Math.min(state.maskOpacity, .5) : state.maskOpacity;
    const fillStyle = {renderer:view.fillR, stroke:false, fill:true, fillColor:"#000", fillOpacity:opacity, interactive:false};
    let nb = 0;
    for (const id of g.black){ const c = parse(id); if (!keep(c)) continue; if (++nb > 8000) break; view.fills.addLayer(L.polygon(corners(c), fillStyle)); }
    if (focus){
      const b = view.m.getBounds().pad(1);
      view.fills.addLayer(L.polygon([[[b.getSouth(), b.getWest()], [b.getNorth(), b.getWest()], [b.getNorth(), b.getEast()], [b.getSouth(), b.getEast()]], corners(focus)],
        {renderer:view.fillR, stroke:false, fillColor:"#0b0f0d", fillOpacity:.62, interactive:false}));
    }
    if (!g.show && !focus) return;
    // Overview lines are bold white over a dark halo so they read on bright ground as well as dark.
    const haloStyle = {renderer:view.lineR, color:"#000000", opacity:.45, weight:4, interactive:false};
    const baseStyle = {renderer:view.lineR, color:"#ffffff", opacity:.9, weight:2, interactive:false};
    const subStyle = {renderer:view.lineR, color:"#ffffff", opacity: focus ? .75 : .6, weight: focus ? 1.2 : 1.2, interactive:false};
    const s = g.base;
    if (!focus && s*ppm >= 24){
      for (const st of [haloStyle, baseStyle]){
        for (let e = Math.floor(v.e0/s)*s; e <= v.e1; e += s) segment(view, e, v.n0, e, v.n1, st);
        for (let n = Math.floor(v.n0/s)*s; n <= v.n1; n += s) segment(view, v.e0, n, v.e1, n, st);
      }
    }
    for (const [id, f] of g.splits){
      const c = parse(id); if (!keep(c)) continue;
      const st = c.size/f; if (st*ppm < 5) continue;
      for (let k=1;k<f;k++){ segment(view, c.e0+k*st, c.n0, c.e0+k*st, c.n0+c.size, subStyle); segment(view, c.e0, c.n0+k*st, c.e0+c.size, c.n0+k*st, subStyle); }
    }
    let nl = 0; const minPx = focus ? 64 : 110;
    const label = c => { if (++nl > 400) return;
      view.labels.addLayer(L.marker(toLL(c.e0, c.n0+c.size), {pane:view.labelPane, interactive:false, keyboard:false,
        icon:L.divIcon({className:"glbl", iconSize:[0,0], html:`<span>${ref(c).slice(4)}</span>`})})); };
    const walk = c => { if (!inView(c, v) || nl > 400) return;
      if (g.splits.has(c.id)) { children(c).forEach(walk); return; }
      if (c.size*ppm >= minPx) label(c); };
    if (focus) walk(focus);
    else if (s*ppm >= 110){ for (let e = Math.floor(v.e0/s)*s; e <= v.e1; e += s) for (let n = Math.floor(v.n0/s)*s; n <= v.n1; n += s) walk(cell(s, e, n)); }
    else for (const [id] of g.splits){ const c = parse(id); if (c.size === s) walk(c); }
    if (focus){
      view.lines.addLayer(L.polygon(corners(focus), {renderer:view.lineR, color:"#f5b301", weight:3, fill:false, interactive:false}));
      let ns = 0;
      for (const c of g.sel.values()){ if (++ns > 400) break;
        view.fills.addLayer(L.polygon(corners(c), {renderer:view.fillR, stroke:false, fillColor:"#f5b301", fillOpacity:.28, interactive:false}));
        view.lines.addLayer(L.polygon(corners(c), {renderer:view.lineR, color:"#f5b301", weight:2, fill:false, interactive:false})); }
    }
  }
  const overview = makeView(map, "grid");
  let raf = 0;
  const scheduleRender = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; render(); }); };
  function render(){
    const lng = map.getCenter().lng;
    $("gridNote").textContent = (lng < ZONE_W || lng > ZONE_E) ? "The grid stops at the edge of this package." : "";
    draw(overview, null);
    if (g.focus && fview) draw(fview, g.focus);
    $("gridStats").textContent = `${fmtN(g.splits.size)} split squares · ${fmtN(g.black.size)} blacked-out squares`;
  }

  /* ---------- overview: tap a square to open it ---------- */
  let lastPopupClose = 0;
  map.on("popupclose", () => { lastPopupClose = Date.now(); });
  map.on("click", e => {
    if (state.mode !== "pan" || !g.show || Packages.isPicking() || Aoi.selectedId() || Date.now() - lastPopupClose < 400) return;
    if (g.base*pxPerM(map) < 24 || e.latlng.lng < ZONE_W || e.latlng.lng > ZONE_E) return;
    const p = toUtm(e.latlng);
    open(cell(g.base, Math.floor(p.e/g.base)*g.base, Math.floor(p.n/g.base)*g.base));
  });
  map.on("moveend", render);

  /* ---------- focus pane ---------- */
  let fmap = null, fview = null, fbase = null, fcontext = null, fsource = null, fnaip = null, fplaces = null, flabels = null, ftoken = null;
  let shownPlaces = [];
  const relabel = () => { const n = Places.labelOn(fmap, flabels, shownPlaces, "fpoiLabels");
    $("fLabelNote").textContent = shownPlaces.length > n ? `Names shown for ${fmtN(n)} of ${fmtN(shownPlaces.length)} places; zoom in for more.` : ""; };
  function ensureFocusMap(){
    if (fmap) return;
    fmap = L.map("focusMap", {zoomControl:true, attributionControl:false, maxZoom:FOCUS_MAX_ZOOM, zoomSnap:0.25, boxZoom:false, doubleClickZoom:false});
    fview = makeView(fmap, "focus");
    fnaip = naipLayer().addTo(fmap); fplaces = L.layerGroup().addTo(fmap); flabels = L.layerGroup().addTo(fmap);
    { const el = fmap.createPane("fpoiLabels"); el.style.zIndex = 645; el.style.pointerEvents = "none"; }
    fmap.on("moveend", () => g.focus && relabel());
    fmap.on("pm:create", e => { if (g.fmode === "aoiPoly" || g.fmode === "aoiRect"){ Aoi.focusCreated(e.layer); setFMode("select"); } });
    fmap.on("zoomend", zoomNote);
    fmap.on("moveend", () => g.focus && draw(fview, g.focus));
    const el = fmap.getContainer(); let painting = null, selecting = null;
    const pick = c => { if (!within(c, g.focus) || selecting.seen.has(c.id)) return; selecting.seen.add(c.id); g.sel.set(c.id, c); scheduleRender(); };
    el.addEventListener("pointerdown", e => {
      if (g.fmode !== "select" || e.button > 0 || e.target.closest(".leaflet-control, .leaflet-popup")) return;
      if (selecting){ selecting = null; return; }
      const c = cellAt(fmap.mouseEventToLatLng(e)); if (!within(c, g.focus)) { g.sel.clear(); scheduleRender(); tools(); return; }
      if (!(e.shiftKey || e.ctrlKey || e.metaKey)) g.sel.clear();
      selecting = {pid:e.pointerId, seen:new Set()}; pick(c);
    });
    el.addEventListener("pointermove", e => { if (selecting && e.pointerId === selecting.pid) pick(cellAt(fmap.mouseEventToLatLng(e))); });
    const endSel = () => { if (!selecting) return; selecting = null; render(); tools(); };
    // Double-click selects the square one level up: the whole 5×5 block the clicked square belongs to.
    el.addEventListener("dblclick", e => {
      if (g.fmode !== "select" || e.target.closest(".leaflet-control, .leaflet-popup")) return;
      const chain = chainAt(fmap.mouseEventToLatLng(e)), up = chain.length > 1 ? chain.at(-2) : chain[0];
      if (!within(up, g.focus)) return;
      if (!(e.shiftKey || e.ctrlKey || e.metaKey)) g.sel.clear();
      g.sel.set(up.id, up); render(); tools();
    });
    el.addEventListener("pointerup", endSel); el.addEventListener("pointercancel", endSel);
    const paint = c => { if (!within(c, g.focus) || painting.seen.has(c.id)) return; painting.seen.add(c.id);
      if (painting.val){ dropSubtree(c); g.black.add(c.id); } else g.black.delete(c.id); scheduleRender(); };
    el.addEventListener("pointerdown", e => {
      if (g.fmode !== "paint" || e.button > 0 || e.target.closest(".leaflet-control, .leaflet-popup")) return;
      if (painting){ painting = null; return; }
      const c = cellAt(fmap.mouseEventToLatLng(e)); if (!within(c, g.focus)) return;
      pushUndo("grid black out"); painting = {pid:e.pointerId, val:!g.black.has(c.id), seen:new Set()}; paint(c);
    });
    el.addEventListener("pointermove", e => { if (painting && e.pointerId === painting.pid) paint(cellAt(fmap.mouseEventToLatLng(e))); });
    const end = () => { if (!painting) return; painting = null; save(); render(); tools(); };
    el.addEventListener("pointerup", end); el.addEventListener("pointercancel", end);
  }
  function context(b){
    if (fcontext) fmap.removeLayer(fcontext);
    fcontext = L.layerGroup().addTo(fmap);
    const style = {stroke:false, fill:true, fillColor:"#000", fillOpacity: g.seeThrough ? Math.min(state.maskOpacity, .5) : state.maskOpacity, interactive:false};
    mask.eachLayer(l => { if (l.getBounds().intersects(b)) fcontext.addLayer(L.polygon(l.getLatLngs(), {...style, pmIgnore:true})); });
  }
  let fesri = null;
  const zoomNote = () => { const z = fmap.getZoom(), esri = fesri && fmap.hasLayer(fesri) && z >= 17;
    $("fZoomNote").textContent = esri ? `Showing Esri World Imagery (online) · zoom ${z.toFixed(1)}${z > 19 ? " (enlarged past its detail)" : ""}`
      : z >= NAIP.zmin - 0.5 ? `Showing NAIP 0.6 m aerial imagery · zoom ${z.toFixed(1)}${z > 18 ? " (enlarged past its detail)" : ""}`
      : "Zoom in for NAIP 0.6 m detail"; };
  function esriToggle(on){
    if (!fmap) return;
    if (!fesri){ const s = SOURCES.esri; fesri = L.tileLayer(s.url, {minZoom:17, maxZoom:FOCUS_MAX_ZOOM, maxNativeZoom:s.maxNative, keepBuffer:2}); }
    on && navigator.onLine ? fesri.addTo(fmap) : fesri.remove(); zoomNote();
    kvPut("focusEsri", !!on).catch(()=>{});
  }
  let flist = [];
  function placesList(list){
    if (list) flist = list;
    const q = $("fPlacesFilter").value.trim().toLowerCase();
    list = q ? flist.filter(x => x.n.toLowerCase().includes(q) || x.k.replace(/_/g, " ").includes(q)) : flist;
    shownPlaces = list; relabel();
    const counts = {}; list.forEach(x => counts[x.g] = (counts[x.g] || 0) + 1);
    $("fPlacesStats").textContent = list.length ? `${fmtN(list.length)} places: ` + Places.groups.filter(gr => counts[gr.id]).map(gr => `${gr.label} ${counts[gr.id]}`).join(" · ") : "No saved places in this square.";
    const ul = $("fPlaces"); ul.textContent = "";
    for (const x of list.slice().sort((u, w) => u.n.localeCompare(w.n)).slice(0, 300)){
      const gr = Places.groups.find(q => q.id === x.g), li = document.createElement("li"), btn = document.createElement("button");
      btn.innerHTML = `<span class="swatch" style="background:${gr.color}"></span><span><b>${escapeHtml(x.n)}</b> <span class="stat">${escapeHtml(Places.pretty(x.k))}</span></span>`;
      btn.onclick = () => { fmap.setView([x.a, x.o], Math.max(fmap.getZoom(), 18));
        fplaces.eachLayer(mk => { if (mk.poi === x) mk.openPopup(); }); };
      li.append(btn); ul.append(li);
    }
  }
  async function focusPlaces(c, fetchIfNew){
    const b = L.latLngBounds(corners(c));
    placesList(Places.drawOn(fmap, fplaces, b));
    if (fetchIfNew && navigator.onLine){
      $("fPlacesMsg").textContent = "Loading places for this square…";
      await Places.loadOverture(b);
      if (g.focus?.id !== c.id) return;
      $("fPlacesMsg").textContent = ""; placesList(Places.drawOn(fmap, fplaces, b));
    }
    if (!fetchIfNew || !navigator.onLine || await Places.squareFetched(c.id)) return;
    $("fPlacesMsg").textContent = "Fetching places for this square…";
    const ok = await Places.fetchSquare(c.id, b);
    if (g.focus?.id !== c.id) return;
    $("fPlacesMsg").textContent = ok ? "" : "Some places could not be fetched. Try Refresh places.";
    placesList(Places.drawOn(fmap, fplaces, b));
  }
  async function hiRes(c, force){
    const b = L.latLngBounds(corners(c)).pad(0.05), bb = {s:b.getSouth(), w:b.getWest(), n:b.getNorth(), e:b.getEast()};
    let zmax = NAIP.zmax; while (zmax >= NAIP.zmin && countTiles(tileRanges(bb, NAIP.zmin, zmax)) > (force ? 3000 : 700)) zmax--;
    if (zmax < NAIP.zmin){ $("fHiRes").textContent = "This square is too big to save in full detail at once. Tiles you look at are still saved."; return; }
    if (!navigator.onLine){ $("fHiRes").textContent = "Offline: showing the detail already saved for this square."; return; }
    const token = ftoken = {}, ranges = tileRanges(bb, NAIP.zmin, zmax);
    const res = await saveTiles(NAIP.key, NAIP.url, ranges, pr => { if (ftoken === token)
      $("fHiRes").textContent = `High detail, zoom ${NAIP.zmin}–${zmax}: ${fmtN(pr.done)} of ${fmtN(pr.total)} tiles ready · ${fmtN(pr.saved)} new, ${fmtBytes(pr.bytes)}`; }, 4, () => ftoken !== token);
    if (ftoken === token){ $("fHiRes").textContent = `High detail, zoom ${NAIP.zmin}–${zmax}: ${fmtN(res.done - res.failed)} of ${fmtN(res.total)} tiles saved for offline`
        + (res.saved ? ` · ${fmtBytes(res.bytes)} new` : "") + (res.failed ? ` · ${res.failed} failed` : "");
      fnaip.redraw(); }
  }
  function open(c){
    g.focus = c; g.sel.clear(); $("focus").hidden = false; ensureFocusMap();
    if (fsource !== state.source){ if (fbase) fmap.removeLayer(fbase); fbase = baseLayerFor(state.source, undefined, FOCUS_MAX_ZOOM).addTo(fmap); fsource = state.source; }
    fmap.invalidateSize();
    const b = L.latLngBounds(corners(c));
    fmap.setMaxBounds(null); fmap.setMinZoom(0);
    fmap.fitBounds(b, {padding:[16,16], animate:false});
    fmap.setMinZoom(fmap.getZoom()); fmap.setMaxBounds(b.pad(0.15));
    context(b); setFMode("select"); draw(fview, c); tools();
    Aoi.focusOpen(fmap, b); $("fPlacesMsg").textContent = ""; $("fPlacesFilter").value = ""; focusPlaces(c, true); hiRes(c, false);
    kvGet("focusEsri").catch(() => undefined).then(v => { const on = v !== false; $("fEsri").checked = on; esriToggle(on); });
    zoomNote();
    $("focusTitle").textContent = ref(c); $("focusSub").textContent = `${sizeText(c.size)} square · grid ${ref(c).slice(0, 3)}`;
  }
  function close(){ if (!g.focus) return; ftoken = null; Aoi.focusClose(); if (fmap) fmap.pm.disableDraw();
    g.focus = null; g.sel.clear(); $("focus").hidden = true; render(); }
  const HINTS = {paint:"Tap or drag across squares to black them out. Tap a black square to clear it.",
    select:"Tap a square to select it, press and drag across several, or double-click to select its whole 5×5 block.",
    move:"Drag to move the map. Scroll or pinch to zoom.",
    aoiPoly:"Click the corners of the area, then click the first corner to finish.", aoiRect:"Click two opposite corners of the area."};
  function setFMode(m){
    if (fmap){ fmap.pm.disableDraw(); Aoi.focusStopReshape(); }
    g.fmode = m; document.querySelectorAll("[data-fmode]").forEach(b => b.setAttribute("aria-pressed", b.dataset.fmode === m));
    if (fmap) (m === "paint" || m === "select") ? fmap.dragging.disable() : fmap.dragging.enable();
    $("focusHint").textContent = HINTS[m];
    const color = Aoi.currentColor(), opts = {snappable:false, continueDrawing:false, pathOptions:{color, weight:2, fillColor:color, fillOpacity:.3}};
    if (fmap && m === "aoiPoly") fmap.pm.enableDraw("Polygon", opts);
    if (fmap && m === "aoiRect") fmap.pm.enableDraw("Rectangle", opts);
  }
  const targets = () => g.sel.size ? [...g.sel.values()] : [g.focus];
  function tools(){
    if (!g.focus) return;
    const sel = [...g.sel.values()], t = targets(), n = sel.length;
    const splittable = t.filter(c => !g.splits.has(c.id) && canSplit(c)), splitNow = t.filter(c => g.splits.has(c.id));
    const inside = [...g.black].filter(id => within(parse(id), g.focus)).length;
    $("focusSel").innerHTML = n === 0 ? "Nothing selected. Split applies to the whole square."
      : n === 1 ? `Selected <b>${ref(sel[0])}</b> · ${sizeText(sel[0].size)}${g.splits.has(sel[0].id) ? " · split 5×5" : ""}${g.black.has(sel[0].id) ? ` · <span class="pill bad">blacked out</span>` : ""}`
      : `<b>${fmtN(n)}</b> squares selected`;
    const smallest = n > 0 && t.every(c => !canSplit(c));
    $("fSplit").textContent = smallest ? `Smallest size (${sizeText(g.base/SPLIT**MAX_DEPTH)})`
      : n > 1 ? `Split ${fmtN(splittable.length)} squares 5×5` : n === 1 ? "Split 5×5" : "Split whole square 5×5";
    $("fSplit").disabled = splittable.length === 0;
    $("fUnsplit").disabled = splitNow.length === 0; $("fSelClear").disabled = n === 0;
    $("fAoi").textContent = n > 1 ? `Selected ${fmtN(n)} → one area` : "Selected → area";
    $("fClearAll").disabled = inside === 0; $("focusStats").textContent = `${fmtN(inside)} blacked-out squares in this square`;
  }
  const after = () => { save(); render(); tools(); };
  $("fSplit").onclick = () => { const t = targets().filter(c => !g.splits.has(c.id) && canSplit(c)); if (!t.length) return;
    pushUndo(t.length > 1 ? `split ${t.length} squares` : "split square"); t.forEach(c => split(c, SPLIT)); g.sel.clear(); after(); };
  $("fUnsplit").onclick = () => { const t = targets().filter(c => g.splits.has(c.id)); if (!t.length) return;
    pushUndo("remove split"); t.forEach(unsplit); g.sel.clear(); after(); };
  $("fSelClear").onclick = () => { g.sel.clear(); render(); tools(); };
  $("fClearAll").onclick = () => { pushUndo("clear square"); clearBlack(g.focus); after(); };
  $("fAoi").onclick = () => {
    const t = targets(), zone = t[0].zone;
    const geometry = cellUnion(t, (e, n) => { const [la, lo] = toLL(e, n, zone); return [lo, la]; });
    const name = t.length > 1 ? `${ref(t[0])} +${t.length - 1}` : ref(t[0]);
    Aoi.addArea(name, geometry, null, true); g.sel.clear(); render(); tools();
    log(t.length > 1 ? `Added one area of interest from ${t.length} squares` : `Added area of interest ${name}`); };
  $("fAoiCat").onchange = e => Aoi.setCurrent(e.target.value);
  $("fPlacesRefresh").onclick = async () => { if (!g.focus) return; const c = g.focus; $("fPlacesMsg").textContent = "Fetching places for this square…";
    const ok = await Places.fetchSquare(c.id, L.latLngBounds(corners(c))); if (g.focus?.id !== c.id) return;
    $("fPlacesMsg").textContent = ok ? "" : "Some places could not be fetched. Try again."; focusPlaces(c, false); };
  $("fHiResGet").onclick = () => g.focus && hiRes(g.focus, true);
  $("fPlacesFilter").oninput = () => placesList();
  $("fEsri").onchange = e => esriToggle(e.target.checked);
  $("fSee").onchange = e => { g.seeThrough = e.target.checked; context(L.latLngBounds(corners(g.focus))); draw(fview, g.focus); };
  $("fUndo").onclick = () => { undo(); if (g.focus){ context(L.latLngBounds(corners(g.focus))); tools(); } };
  $("focusClose").onclick = close;
  document.querySelectorAll("[data-fmode]").forEach(b => b.onclick = () => setFMode(b.dataset.fmode));
  document.addEventListener("keydown", e => { if (e.key === "Escape") close(); });

  /* ---------- persistence ---------- */
  const save = () => kvPut("grid", {base:g.base, show:g.show, splits:[...g.splits], black:[...g.black]}).catch(()=>{});
  async function init(){
    const s = await kvGet("grid").catch(()=>null);
    const zoned = id => id.split("/").length === 4 ? id : `15/${id}`;
    if (s){ g.base = s.base || 1000; g.show = s.show !== false;
      g.splits = new Map((s.splits||[]).map(([id, f]) => [zoned(id), f])); g.black = new Set((s.black||[]).map(zoned)); }
    const tooDeep = [...g.splits.keys()].map(parse).filter(c => c.size <= g.base && !canSplit(c)).sort((x, y) => x.size - y.size);
    if (tooDeep.length){ tooDeep.forEach(c => { if (g.splits.has(c.id)) unsplit(c); }); save(); log(`Merged ${tooDeep.length} splits below the smallest square size`); }
    $("gridBase").value = String(g.base); $("showGrid").checked = g.show;
    $("gridBase").onchange = e => { g.base = +e.target.value; close(); save(); render(); };
    $("showGrid").onchange = e => { g.show = e.target.checked; save(); render(); };
    render();
  }
  const exportGeoJSON = () => ({type:"FeatureCollection", features:[...g.black].map(id => { const c = parse(id);
    return {type:"Feature", properties:{mgrs:ref(c), size_m:c.size, status:"not of interest"},
      geometry:{type:"Polygon", coordinates:[ring(c)]}}; })});
  const mgrsAt = ll => { const z = zoneOf(ll.lng), p = UTM.forward(ll.lat, ll.lng, z); return UTM.mgrs(p.e, p.n, z, ll.lat, 5); };
  function setZone(bbox){
    ZONE = zoneOf((bbox.w + bbox.e)/2);
    ZONE_W = Math.min(-180 + (ZONE-1)*6, bbox.w); ZONE_E = Math.max(-180 + ZONE*6, bbox.e);
    close(); render();
  }
  const openAt = ll => { const p = toUtm(ll); open(cell(g.base, Math.floor(p.e/g.base)*g.base, Math.floor(p.n/g.base)*g.base)); };
  return {init, render, setZone, openAt, focusMode:() => g.fmode, setFocusMode:m => setFMode(m), snapshot:() => ({splits:[...g.splits], black:[...g.black]}),
    restore:s => { g.splits = new Map(s.splits); g.black = new Set(s.black); save(); render(); if (g.focus) tools(); },
    exportGeoJSON, mgrsAt};
})();
