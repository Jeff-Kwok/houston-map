"use strict";
// MGRS/UTM grid in the open package's zone: base squares, any square split N×N (nested), squares blacked out as "not of interest".
const Grid = (() => {
  let ZONE = 15, ZONE_W = -97.035, ZONE_E = -90;   // the zone is stretched to cover the whole package square
  const g = {base:1000, splits:new Map(), black:new Set(), show:true, selected:null};
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
  function unsplit(c){
    const kids = children(c), allBlack = kids.length > 0 && kids.every(k => g.black.has(k.id));
    dropSubtree(c); if (allBlack) g.black.add(c.id);
  }

  /* ---------- drawing ---------- */
  const mkPane = (name, z) => { const p = map.createPane(name); p.style.zIndex = z; p.style.pointerEvents = "none"; };
  mkPane("gridFill", 410); mkPane("gridLines", 430); mkPane("gridLabels", 615);
  const fillR = L.canvas({pane:"gridFill", padding:0.3}), lineR = L.canvas({pane:"gridLines", padding:0.3});
  const fills = L.layerGroup().addTo(map), lines = L.layerGroup().addTo(map), labels = L.layerGroup().addTo(map);
  const pxPerM = () => { const c = map.getCenter(); return 2**map.getZoom()/(156543.034*Math.cos(c.lat*Math.PI/180)); };
  function viewUtm(){
    const b = map.getBounds(), c = b.getCenter();
    const pts = [b.getSouthWest(), b.getNorthWest(), b.getNorthEast(), b.getSouthEast(),
      L.latLng(b.getNorth(), c.lng), L.latLng(b.getSouth(), c.lng)].map(toUtm);
    const es = pts.map(p=>p.e), ns = pts.map(p=>p.n);
    return {e0:Math.min(...es), e1:Math.max(...es), n0:Math.min(...ns), n1:Math.max(...ns)};
  }
  const inView = (c, v) => c.zone === ZONE && !(c.e0 > v.e1 || c.e0+c.size < v.e0 || c.n0 > v.n1 || c.n0+c.size < v.n0);
  function segment(e0, n0, e1, n1, style){
    const pts = []; for (let k=0;k<=6;k++) pts.push(toLL(e0+(e1-e0)*k/6, n0+(n1-n0)*k/6));
    lines.addLayer(L.polyline(pts, style));
  }
  let raf = 0;
  const scheduleRender = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; render(); }); };
  function render(){
    fills.clearLayers(); lines.clearLayers(); labels.clearLayers();
    const lng = map.getCenter().lng;
    $("gridNote").textContent = (lng < ZONE_W || lng > ZONE_E) ? "The grid stops at the edge of this package." : "";
    const v = viewUtm(), ppm = pxPerM();
    const fillStyle = {renderer:fillR, stroke:false, fill:true, fillColor:"#000", fillOpacity:state.maskOpacity, interactive:false};
    let nb = 0;
    for (const id of g.black){ const c = parse(id); if (!inView(c, v)) continue; if (++nb > 8000) break; fills.addLayer(L.polygon(corners(c), fillStyle)); }
    if (g.show){
      const base = {renderer:lineR, color:"#ffffff", opacity:.6, weight:1, interactive:false};
      const sub = {renderer:lineR, color:"#ffffff", opacity:.42, weight:.8, interactive:false};
      const s = g.base;
      if (s*ppm >= 24){
        const ea = Math.floor(v.e0/s)*s, na = Math.floor(v.n0/s)*s;
        for (let e = ea; e <= v.e1; e += s) segment(e, v.n0, e, v.n1, base);
        for (let n = na; n <= v.n1; n += s) segment(v.e0, n, v.e1, n, base);
      }
      for (const [id, f] of g.splits){
        const c = parse(id); if (!inView(c, v)) continue;
        const st = c.size/f; if (st*ppm < 5) continue;
        for (let k=1;k<f;k++){ segment(c.e0+k*st, c.n0, c.e0+k*st, c.n0+c.size, sub); segment(c.e0, c.n0+k*st, c.e0+c.size, c.n0+k*st, sub); }
      }
      let nl = 0;
      const label = c => { if (++nl > 300) return;
        labels.addLayer(L.marker(toLL(c.e0, c.n0+c.size), {pane:"gridLabels", interactive:false, keyboard:false,
          icon:L.divIcon({className:"glbl", iconSize:[0,0], html:`<span>${ref(c).slice(4)}</span>`})})); };
      const walk = c => { if (!inView(c, v) || nl > 300) return;
        if (g.splits.has(c.id)) { children(c).forEach(walk); return; }
        if (c.size*ppm >= 110) label(c); };
      if (s*ppm >= 110){
        for (let e = Math.floor(v.e0/s)*s; e <= v.e1; e += s) for (let n = Math.floor(v.n0/s)*s; n <= v.n1; n += s) walk(cell(s, e, n));
      } else for (const [id] of g.splits){ const c = parse(id); if (c.size === s) walk(c); }
    }
    if (g.selected) lines.addLayer(L.polygon(corners(g.selected), {renderer:lineR, color:"#f5b301", weight:3, fill:false, interactive:false}));
    $("gridStats").textContent = `${fmtN(g.splits.size)} split squares · ${fmtN(g.black.size)} blacked-out squares`;
  }

  /* ---------- selection panel ---------- */
  function showSelected(){
    const box = $("gridSel"), c = g.selected;
    if (!c){ box.innerHTML = `<p class="note">Choose <b>Pick square</b>, then tap a square.</p>`; return; }
    const isSplit = g.splits.has(c.id), isBlack = g.black.has(c.id);
    box.innerHTML = `<div class="stat"><b>${ref(c)}</b> · ${sizeText(c.size)} square${isBlack ? ` · <span class="pill bad">blacked out</span>` : ""}${isSplit ? ` · split ${g.splits.get(c.id)}×${g.splits.get(c.id)}` : ""}</div>
      <div class="row"><label>Split into <select id="splitN">${[2,3,4,5,10].map(n=>`<option value="${n}"${n===10?" selected":""}>${n}×${n}</option>`).join("")}</select></label>
        <button id="gSplit">${isSplit ? "Re-split" : "Split"}</button>${isSplit ? `<button id="gUnsplit">Remove split</button>` : ""}</div>
      <div class="row"><button id="gBlack">${isBlack ? "Clear blackout" : "Black out"}</button><button id="gAoi">Make area of interest</button><button id="gZoom">Zoom to</button></div>`;
    $("gSplit").onclick = () => { pushUndo("split square"); split(c, +$("splitN").value); done(); };
    if (isSplit) $("gUnsplit").onclick = () => { pushUndo("remove split"); unsplit(c); done(); };
    $("gBlack").onclick = () => { pushUndo("grid black out"); isBlack ? g.black.delete(c.id) : (dropSubtree(c), g.black.add(c.id)); done(); };
    $("gAoi").onclick = () => Aoi.addArea(ref(c), {type:"Polygon", coordinates:[[...corners(c), corners(c)[0]].map(([la,lo]) => [lo, la])]});
    $("gZoom").onclick = () => map.fitBounds(corners(c), {padding:[40,40]});
  }
  function done(){ save(); render(); showSelected(); }

  /* ---------- input ---------- */
  map.on("click", e => { if (state.mode !== "gpick") return; g.selected = cellAt(e.latlng); render(); showSelected(); });
  const el = map.getContainer(); let painting = null;
  function paint(c){ if (painting.seen.has(c.id)) return; painting.seen.add(c.id);
    if (painting.val){ dropSubtree(c); g.black.add(c.id); } else g.black.delete(c.id); scheduleRender(); }
  el.addEventListener("pointerdown", e => {
    if (state.mode !== "gblack" || e.button > 0 || e.target.closest(".leaflet-control")) return;
    if (painting){ painting = null; return; }
    const c = cellAt(map.mouseEventToLatLng(e));
    pushUndo("grid black out"); painting = {pid:e.pointerId, val:!g.black.has(c.id), seen:new Set()}; paint(c);
  });
  el.addEventListener("pointermove", e => { if (painting && e.pointerId === painting.pid) paint(cellAt(map.mouseEventToLatLng(e))); });
  const end = () => { if (!painting) return; painting = null; save(); render(); };
  el.addEventListener("pointerup", end); el.addEventListener("pointercancel", end);
  map.on("moveend", render);

  /* ---------- persistence ---------- */
  const save = () => kvPut("grid", {base:g.base, show:g.show, splits:[...g.splits], black:[...g.black]}).catch(()=>{});
  async function init(){
    const s = await kvGet("grid").catch(()=>null);
    const zoned = id => id.split("/").length === 4 ? id : `15/${id}`;
    if (s){ g.base = s.base || 1000; g.show = s.show !== false;
      g.splits = new Map((s.splits||[]).map(([id, f]) => [zoned(id), f])); g.black = new Set((s.black||[]).map(zoned)); }
    $("gridBase").value = String(g.base); $("showGrid").checked = g.show;
    $("gridBase").onchange = e => { g.base = +e.target.value; g.selected = null; save(); render(); showSelected(); };
    $("showGrid").onchange = e => { g.show = e.target.checked; save(); render(); };
    render(); showSelected();
  }
  const exportGeoJSON = () => ({type:"FeatureCollection", features:[...g.black].map(id => { const c = parse(id);
    return {type:"Feature", properties:{mgrs:ref(c), size_m:c.size, status:"not of interest"},
      geometry:{type:"Polygon", coordinates:[[...corners(c), corners(c)[0]].map(([la,lo]) => [lo, la])]}}; })});
  const mgrsAt = ll => { const z = zoneOf(ll.lng), p = UTM.forward(ll.lat, ll.lng, z); return UTM.mgrs(p.e, p.n, z, ll.lat, 5); };
  function setZone(bbox){
    ZONE = zoneOf((bbox.w + bbox.e)/2);
    ZONE_W = Math.min(-180 + (ZONE-1)*6, bbox.w); ZONE_E = Math.max(-180 + ZONE*6, bbox.e);
    g.selected = null; render(); showSelected();
  }
  return {init, render, setZone, snapshot:() => ({splits:[...g.splits], black:[...g.black]}),
    restore:s => { g.splits = new Map(s.splits); g.black = new Set(s.black); save(); render(); showSelected(); },
    exportGeoJSON, mgrsAt};
})();
