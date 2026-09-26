"use strict";
// MGRS/UTM grid in the open package's zone. The overview only shows it; a square opens in the focus pane,
// where it is split N×N (nested) and parts are blacked out as "not of interest".
const Grid = (() => {
  let ZONE = 15, ZONE_W = -96.202, ZONE_E = -90;   // the zone is stretched to cover the whole package square
  const g = {base:1000, splits:new Map(), black:new Set(), show:true, focus:null, selected:null, fmode:"select", seeThrough:false};
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

  function cellAt(ll){
    const p = toUtm(ll);
    let c = cell(g.base, Math.floor(p.e/g.base)*g.base, Math.floor(p.n/g.base)*g.base);
    for (let depth = 0; depth < 12; depth++){
      const f = g.splits.get(c.id); if (!f) break;
      const s = c.size/f;
      const i = Math.min(f-1, Math.max(0, Math.floor((p.e-c.e0)/s))), j = Math.min(f-1, Math.max(0, Math.floor((p.n-c.n0)/s)));
      c = cell(s, c.e0+i*s, c.n0+j*s, c.zone);
    }
    return c;
  }
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
    const baseStyle = {renderer:view.lineR, color:"#ffffff", opacity:.6, weight:1, interactive:false};
    const subStyle = {renderer:view.lineR, color:"#ffffff", opacity: focus ? .75 : .42, weight: focus ? 1.2 : .8, interactive:false};
    const s = g.base;
    if (!focus && s*ppm >= 24){
      for (let e = Math.floor(v.e0/s)*s; e <= v.e1; e += s) segment(view, e, v.n0, e, v.n1, baseStyle);
      for (let n = Math.floor(v.n0/s)*s; n <= v.n1; n += s) segment(view, v.e0, n, v.e1, n, baseStyle);
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
      if (g.selected && g.selected.id !== focus.id)
        view.lines.addLayer(L.polygon(corners(g.selected), {renderer:view.lineR, color:"#f5b301", weight:2.5, dashArray:"6 4", fill:false, interactive:false}));
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
  let fmap = null, fview = null, fbase = null, fcontext = null, fsource = null;
  function ensureFocusMap(){
    if (fmap) return;
    fmap = L.map("focusMap", {zoomControl:true, attributionControl:false, maxZoom:19, zoomSnap:0.25, boxZoom:false, doubleClickZoom:false});
    fview = makeView(fmap, "focus");
    fmap.on("moveend", () => g.focus && draw(fview, g.focus));
    fmap.on("click", e => { if (g.fmode !== "select" || !g.focus) return;
      const c = cellAt(e.latlng); if (!within(c, g.focus)) return; g.selected = c; draw(fview, g.focus); tools(); });
    const el = fmap.getContainer(); let painting = null;
    const paint = c => { if (!within(c, g.focus) || painting.seen.has(c.id)) return; painting.seen.add(c.id);
      if (painting.val){ dropSubtree(c); g.black.add(c.id); } else g.black.delete(c.id); scheduleRender(); };
    el.addEventListener("pointerdown", e => {
      if (g.fmode !== "paint" || e.button > 0 || e.target.closest(".leaflet-control")) return;
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
    mask.eachLayer(l => { if (l.getBounds().intersects(b)) fcontext.addLayer(L.polygon(l.getLatLngs(), style)); });
    L.geoJSON(Aoi.exportGeoJSON(), {interactive:false, style:f => ({color:f.properties.color, weight:2, fillColor:f.properties.color, fillOpacity:f.properties.opacity}),
      filter:f => L.geoJSON(f).getBounds().intersects(b),
      onEachFeature:(f, l) => l.bindTooltip(escapeHtml(f.properties.name), {permanent:true, direction:"center", className:"aoi-label"})}).addTo(fcontext);
  }
  function open(c){
    g.focus = c; g.selected = c; $("focus").hidden = false; ensureFocusMap();
    if (fsource !== state.source){ if (fbase) fmap.removeLayer(fbase); fbase = baseLayerFor(state.source).addTo(fmap); fsource = state.source; }
    fmap.invalidateSize();
    const b = L.latLngBounds(corners(c));
    fmap.setMaxBounds(null); fmap.setMinZoom(0);
    fmap.fitBounds(b, {padding:[16,16], animate:false});
    fmap.setMinZoom(fmap.getZoom()); fmap.setMaxBounds(b.pad(0.15));
    context(b); setFMode(g.fmode); draw(fview, c); tools();
    $("focusTitle").textContent = ref(c); $("focusSub").textContent = `${sizeText(c.size)} square · grid ${ref(c).slice(0, 3)}`;
  }
  function close(){ if (!g.focus) return; g.focus = null; g.selected = null; $("focus").hidden = true; render(); }
  function setFMode(m){
    g.fmode = m; document.querySelectorAll("[data-fmode]").forEach(b => b.setAttribute("aria-pressed", b.dataset.fmode === m));
    if (fmap) m === "paint" ? fmap.dragging.disable() : fmap.dragging.enable();
    $("focusHint").textContent = m === "paint" ? "Tap or drag across squares to black them out. Tap a black square to clear it."
      : "Tap a square to select it, then split it or black it out.";
  }
  function tools(){
    const c = g.selected || g.focus; if (!c) return;
    const isSplit = g.splits.has(c.id), isBlack = g.black.has(c.id);
    const inside = [...g.black].filter(id => within(parse(id), g.focus)).length;
    $("focusSel").innerHTML = `Selected <b>${ref(c)}</b> · ${sizeText(c.size)}${isSplit ? ` · split ${g.splits.get(c.id)}×${g.splits.get(c.id)}` : ""}${isBlack ? ` · <span class="pill bad">blacked out</span>` : ""}`;
    $("fSplit").textContent = isSplit ? "Re-split" : "Split"; $("fUnsplit").disabled = !isSplit;
    $("fBlack").textContent = isBlack ? "Clear blackout" : "Black out selected";
    $("fClearAll").disabled = inside === 0; $("focusStats").textContent = `${fmtN(inside)} blacked-out squares in this square`;
  }
  const after = () => { save(); render(); tools(); };
  $("fSplit").onclick = () => { const c = g.selected || g.focus; pushUndo("split square"); split(c, +$("fSplitN").value); after(); };
  $("fUnsplit").onclick = () => { const c = g.selected || g.focus; pushUndo("remove split"); unsplit(c); after(); };
  $("fBlack").onclick = () => { const c = g.selected || g.focus; pushUndo("grid black out");
    g.black.has(c.id) ? g.black.delete(c.id) : (dropSubtree(c), g.black.add(c.id)); after(); };
  $("fClearAll").onclick = () => { pushUndo("clear square"); clearBlack(g.focus); after(); };
  $("fAoi").onclick = () => { const c = g.selected || g.focus; const a = Aoi.addArea(ref(c), {type:"Polygon", coordinates:[ring(c)]});
    log(`Added area of interest ${a.name}`); context(L.latLngBounds(corners(g.focus))); };
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
  return {init, render, setZone, snapshot:() => ({splits:[...g.splits], black:[...g.black]}),
    restore:s => { g.splits = new Map(s.splits); g.black = new Set(s.black); save(); render(); if (g.focus) tools(); },
    exportGeoJSON, mgrsAt};
})();
