"use strict";
// Street, water, park and transit labels drawn over the imagery from a Protomaps (OpenStreetMap) vector extract,
// the way Google's hybrid view does it: ranked labels with collision checks. Every byte range read is kept offline.
const Labels = (() => {
  const DIR = "packs/labels/";
  let pm = null, version = null, show = true, roads = true;
  const layers = new Map();   // map -> layer

  class CachedSource {
    constructor(url, ver){ this.url = url; this.ver = ver; }
    getKey(){ return this.url; }
    async getBytes(offset, length, signal){
      const key = `labels/${this.ver}/${offset}/${length}`;
      const hit = await tileGet(key);
      if (hit) return {data: await hit.arrayBuffer()};
      const r = await fetch(this.url, {headers:{Range:`bytes=${offset}-${offset + length - 1}`}, signal});
      if (r.status !== 206 && r.status !== 200) throw new Error(`labels: ${r.status}`);
      let data = await r.arrayBuffer();
      if (r.status === 200) data = data.slice(offset, offset + length);
      tilePut(key, new Blob([data])).catch(()=>{});
      return {data};
    }
  }

  // Protomaps "dark" theme with hybrid-view label colours: white names on a dark halo, water names in pale blue.
  const HYBRID = {background:"#34373d", earth:"#1f1f1f", water:"#31353f", buildings:"#111111",
    roads_label_minor:"#ffffff", roads_label_minor_halo:"#000000", roads_label_major:"#ffffff", roads_label_major_halo:"#000000",
    ocean_label:"#bfe3ff", subplace_label:"#f0f0f0", subplace_label_halo:"#000000", city_label:"#ffffff", city_label_halo:"#000000",
    state_label:"#dddddd", state_label_halo:"#000000", country_label:"#dddddd", address_label:"#e8e8e8", address_label_halo:"#000000",
    pois:{blue:"#9fd8ee", green:"#8ff0b5", lapis:"#a9c1ff", pink:"#ffb3e1", red:"#ffb0c0", slategray:"#d0d0da", tangerine:"#ffc9a8", turquoise:"#8ff2fb"}};
  const scaled = (base, cap) => z => Math.min(cap, Math.max(0.6, base * 2 ** (z - 15)));
  function roadRules(){
    const LS = protomapsL.LineSymbolizer;
    return [
      {dataLayer:"roads", filter:(z, f) => ["minor_road", "other"].includes(f.props.kind), symbolizer:new LS({color:"#ffffff", opacity:.28, width:scaled(2.4, 4)})},
      {dataLayer:"roads", filter:(z, f) => f.props.kind === "major_road", symbolizer:new LS({color:"#ffffff", opacity:.4, width:scaled(4, 6)})},
      {dataLayer:"roads", filter:(z, f) => f.props.kind === "highway", symbolizer:new LS({color:"#ffcf4a", opacity:.5, width:scaled(5, 7)})},
    ];
  }
  function makeLayer(m, pane){
    // Our own pips and place names already cover POIs and places; keep roads, water, parks and transit.
    const labelRules = protomapsL.labelRules(HYBRID, "en").filter(r => r.dataLayer !== "pois" && r.dataLayer !== "places");
    return protomapsL.leafletLayer({url:pm, paintRules: roads ? roadRules() : [], labelRules, maxDataZoom:14, pane, attribution:""});
  }
  function attach(m, pane){
    if (!pm || !show) return;
    if (!m.getPane(pane)){ const el = m.createPane(pane); el.style.zIndex = 635; el.style.pointerEvents = "none"; }
    detach(m);
    const l = makeLayer(m, pane); l.addTo(m); layers.set(m, {l, pane});
  }
  function detach(m){ const e = layers.get(m); if (e){ m.removeLayer(e.l); layers.delete(m); } }
  const refresh = () => [...layers.entries()].forEach(([m, e]) => attach(m, e.pane));

  // Fetch every tile the square needs so its labels work offline.
  async function prefetch(bbox, zmin, zmax, onProgress, cancelled = () => false){
    if (!pm) return {done:0, total:0};
    const ranges = tileRanges(bbox, zmin, zmax), total = countTiles(ranges), it = tileIter(ranges); let done = 0;
    const one = async () => { for (let n = it.next(); !n.done && !cancelled(); n = it.next()){
      try { await pm.getZxy(n.value.z, n.value.x, n.value.y); } catch {}
      done++; onProgress?.(done, total); } };
    await Promise.all(Array.from({length:6}, one));
    return {done, total};
  }

  async function init(){
    const s = await kvGet("labelsSettings").catch(()=>null) || {};
    show = s.show !== false; roads = s.roads !== false;
    $("showStreetLabels").checked = show; $("showRoads").checked = roads;
    let idx = null;
    try { const r = await fetch(DIR + "index.json", {cache:"no-cache"}); if (r.ok) idx = await r.json(); } catch {}
    if (idx){ kvPut("labelsIndex", idx).catch(()=>{}); } else idx = await kvGet("labelsIndex").catch(()=>null);
    if (!idx){ $("labelsNote").textContent = "Street labels are not available for this package yet."; return; }
    version = idx.build;
    pm = new pmtiles.PMTiles(new CachedSource(DIR + idx.file, version));
    $("labelsNote").textContent = `Streets, water, parks and transit from OpenStreetMap (Protomaps ${idx.build.replace(".pmtiles", "")}).`;
    const save = () => kvPut("labelsSettings", {show, roads}).catch(()=>{});
    $("showStreetLabels").onchange = e => { show = e.target.checked; save(); show ? (attach(map, "streetLabels"), Grid.labelsChanged()) : [...layers.keys()].forEach(detach); };
    $("showRoads").onchange = e => { roads = e.target.checked; save(); refresh(); };
    attach(map, "streetLabels");
  }
  return {init, attach, detach, prefetch, ready:() => !!pm};
})();
