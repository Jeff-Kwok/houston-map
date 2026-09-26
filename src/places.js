"use strict";
// OSM places: category pips (restaurants, shops, …), city/town/neighborhood labels, and name search. Stored offline.
const Places = (() => {
  const GROUPS = [
    {id:"food", label:"Food & drink", color:"#e8710a"},
    {id:"shop", label:"Shopping", color:"#1a73e8"},
    {id:"lodging", label:"Hotels", color:"#e52592"},
    {id:"attraction", label:"Attractions & nightlife", color:"#12b5cb"},
    {id:"park", label:"Parks & recreation", color:"#1e8e3e"},
    {id:"health", label:"Health", color:"#d93025"},
    {id:"education", label:"Schools & libraries", color:"#a1887f"},
    {id:"worship", label:"Places of worship", color:"#8e24aa"},
    {id:"transport", label:"Fuel, parking & transport", color:"#5c6bc0"},
    {id:"service", label:"Services & offices", color:"#90a4ae"},
  ];
  const GROUP = Object.fromEntries(GROUPS.map(g => [g.id, g]));
  const AMENITY = {
    food:"restaurant fast_food cafe bar pub ice_cream food_court biergarten",
    health:"hospital clinic doctors dentist pharmacy veterinary",
    education:"school university college kindergarten library childcare",
    worship:"place_of_worship",
    transport:"fuel parking charging_station bus_station car_rental car_wash ferry_terminal bicycle_rental taxi",
    attraction:"theatre cinema arts_centre nightclub casino events_venue",
    skip:"bench waste_basket toilets vending_machine parking_space shelter drinking_water post_box recycling fountain clock telephone bicycle_parking grave_yard parking_entrance loading_dock atm"};
  const AMENITY_G = {}; for (const [g, list] of Object.entries(AMENITY)) for (const k of list.split(" ")) AMENITY_G[k] = g;
  const LODGING = new Set("hotel motel guest_house hostel apartment".split(" "));
  const SIGHTS = new Set("museum attraction gallery zoo theme_park aquarium viewpoint".split(" "));
  const LEISURE = new Set("park garden nature_reserve playground sports_centre stadium golf_course fitness_centre marina swimming_pool pitch water_park dog_park track ice_rink".split(" "));
  const FOOD_SHOPS = new Set("bakery deli coffee confectionery".split(" "));
  function classify(t){
    if (t.amenity){ const g = AMENITY_G[t.amenity]; if (g === "skip") return null; return {g: g || "service", k:t.amenity}; }
    if (t.shop) return {g: FOOD_SHOPS.has(t.shop) ? "food" : "shop", k:`${t.shop === "yes" ? "shop" : t.shop}`};
    if (t.tourism){ if (LODGING.has(t.tourism)) return {g:"lodging", k:t.tourism}; if (SIGHTS.has(t.tourism)) return {g:"attraction", k:t.tourism}; return null; }
    if (t.leisure) return LEISURE.has(t.leisure) ? {g:"park", k:t.leisure} : null;
    if (t.healthcare) return {g:"health", k:t.healthcare};
    if (t.office) return {g:"service", k:t.office === "yes" ? "office" : `${t.office} office`};
    return null;
  }
  const PLACE_ZOOM = {city:7, town:10, village:11, suburb:12, quarter:13, neighbourhood:14, hamlet:14};
  const PLACE_CLASS = {city:"city", town:"town", village:"town", suburb:"suburb", quarter:"hood", neighbourhood:"hood", hamlet:"hood"};

  const p = {pois:[], places:[], bins:new Map(), off:new Set(), showPois:true, showCities:true, showHoods:true};
  const binKey = (la, lo) => `${Math.floor(la*50)}:${Math.floor(lo*50)}`;
  function index(){ p.bins.clear(); for (const x of p.pois){ const k = binKey(x.a, x.o); (p.bins.get(k) || p.bins.set(k, []).get(k)).push(x); } }

  const pane = map.createPane("pois"); pane.style.zIndex = 640;
  const lpane = map.createPane("labels"); lpane.style.zIndex = 630; lpane.style.pointerEvents = "none";
  const poiR = L.canvas({pane:"pois", padding:0.3});
  const pips = L.layerGroup().addTo(map), labels = L.layerGroup().addTo(map);
  const pretty = k => k.replace(/_/g, " ").replace(/^./, c => c.toUpperCase());

  function popupHtml(x){
    const g = GROUP[x.g], e = escapeHtml;
    const web = x.w && /^https?:\/\//i.test(x.w) ? `<a href="${e(x.w)}" target="_blank" rel="noopener">Website</a>` : "";
    const [type, id] = [{n:"node", w:"way", r:"relation"}[x.i[0]], x.i.slice(1)];
    return `<div class="pop"><b>${e(x.n)}</b><div class="pop-cat" style="color:${g.color}">${e(pretty(x.k))}${x.c ? " · " + e(x.c.replace(/;/g, ", ").replace(/_/g, " ")) : ""}</div>
      ${x.ad ? `<div>${e(x.ad)}</div>` : ""}${x.h ? `<div class="stat">${e(x.h)}</div>` : ""}${x.p ? `<div class="stat">${e(x.p)}</div>` : ""}
      <div class="stat">${Grid.mgrsAt(L.latLng(x.a, x.o))}</div>
      <div class="row">${web}<a href="https://www.openstreetmap.org/${type}/${id}" target="_blank" rel="noopener">OpenStreetMap</a></div></div>`;
  }
  function render(){
    pips.clearLayers(); labels.clearLayers();
    const z = map.getZoom(), b = map.getBounds().pad(0.1);
    if (p.showCities || p.showHoods){
      let n = 0;
      for (const pl of p.places){
        const minZ = pl.n === "Houston" && pl.p === "city" ? 0 : PLACE_ZOOM[pl.p];
        const cls = PLACE_CLASS[pl.p], isHood = cls === "hood" || cls === "suburb";
        if (z < minZ || (isHood ? !p.showHoods : !p.showCities) || !b.contains([pl.a, pl.o])) continue;
        if (++n > 500) break;
        labels.addLayer(L.marker([pl.a, pl.o], {pane:"labels", interactive:false, keyboard:false,
          icon:L.divIcon({className:`plbl plbl-${cls}`, iconSize:[0,0], html:`<span>${escapeHtml(pl.n)}</span>`})}));
      }
    }
    if (!p.showPois || z < 14) return;
    const r = z >= 17 ? 7 : z >= 16 ? 6 : 5, found = [];
    for (let la = Math.floor(b.getSouth()*50); la <= Math.floor(b.getNorth()*50); la++)
      for (let lo = Math.floor(b.getWest()*50); lo <= Math.floor(b.getEast()*50); lo++)
        for (const x of p.bins.get(`${la}:${lo}`) || []) if (!p.off.has(x.g) && b.contains([x.a, x.o])) found.push(x);
    found.sort((u, v) => GROUPS.findIndex(g => g.id === u.g) - GROUPS.findIndex(g => g.id === v.g));
    found.slice(0, 3000).forEach(x => {
      const m = L.circleMarker([x.a, x.o], {renderer:poiR, radius:r, color:"#ffffff", weight:1.5, fillColor:GROUP[x.g].color, fillOpacity:1});
      m.bindPopup(() => popupHtml(x), {maxWidth:260}); pips.addLayer(m);
    });
    if (z >= 17) found.slice(0, 250).forEach(x => labels.addLayer(L.marker([x.a, x.o], {pane:"labels", interactive:false, keyboard:false,
      icon:L.divIcon({className:"poilbl", iconSize:[0,0], html:`<span style="color:${GROUP[x.g].color}">${escapeHtml(x.n)}</span>`})})));
  }

  /* ---------- fetching ---------- */
  function toPoi(el){
    const t = el.tags || {}; if (!t.name) return null;
    const c = classify(t); if (!c) return null;
    const a = el.lat ?? el.center?.lat, o = el.lon ?? el.center?.lon; if (a == null) return null;
    const ad = [[t["addr:housenumber"], t["addr:street"]].filter(Boolean).join(" "), t["addr:city"]].filter(Boolean).join(", ");
    return {i:el.type[0] + el.id, a, o, n:t.name, g:c.g, k:c.k, c:t.cuisine, ad, h:t.opening_hours, p:t.phone || t["contact:phone"], w:t.website || t["contact:website"]};
  }
  let busy = false;
  async function fetchPois(b, label){
    if (busy) return; busy = true; $("poiView").disabled = $("poiCity").disabled = true;
    const step = 0.1, cells = [];
    for (let s = b.s; s < b.n; s += step) for (let w = b.w; w < b.e; w += step) cells.push([s, w, Math.min(s+step, b.n), Math.min(w+step, b.e)]);
    log(`Fetching places for ${label} in ${cells.length} pieces`);
    const byId = new Map(p.pois.map(x => [x.i, x])); let added = 0, failed = 0;
    for (let i = 0; i < cells.length; i++){
      const bb = cells[i].map(v => v.toFixed(5)).join(",");
      const q = `[out:json][timeout:120];(${["amenity","shop","tourism","leisure","office","healthcare"].map(k => `nwr["${k}"]["name"](${bb});`).join("")});out center tags qt;`;
      try {
        const data = await overpass(q);
        for (const el of data.elements){ const x = toPoi(el); if (!x) continue; if (!byId.has(x.i)) added++; byId.set(x.i, x); }
        p.pois = [...byId.values()]; index(); render(); counts();
        if (i % 8 === 7) await kvPut("pois", p.pois).catch(()=>{});
      } catch(e){ failed++; log(`Places piece ${i+1} failed: ${e.message}`); }
      $("poiBar").style.width = (100*(i+1)/cells.length).toFixed(0) + "%";
      await new Promise(s => setTimeout(s, 1000));
    }
    await kvPut("pois", p.pois).catch(()=>{});
    log(`Added ${fmtN(added)} places` + (failed ? `; ${failed} pieces failed, run it again to fill them` : ""));
    busy = false; $("poiView").disabled = $("poiCity").disabled = false;
  }
  let namesBusy = false;
  function ensureNames(b){ if (!p.places.some(x => x.a > b.s && x.a < b.n && x.o > b.w && x.o < b.e) && navigator.onLine) fetchPlaceNames(b); }
  async function fetchPlaceNames(b = Packages.bbox()){
    if (namesBusy) return; namesBusy = true; $("placeFetch").disabled = true;
    try {
      const data = await overpass(`[out:json][timeout:90];node["place"~"^(city|town|village|suburb|quarter|neighbourhood|hamlet)$"]["name"](${b.s},${b.w},${b.n},${b.e});out body qt;`);
      const inBox = x => x.a > b.s && x.a < b.n && x.o > b.w && x.o < b.e;
      p.places = [...p.places.filter(x => !inBox(x)),
        ...data.elements.map(el => ({n:el.tags.name, p:el.tags.place, a:el.lat, o:el.lon, pop:+(el.tags.population || 0)}))]
        .sort((x, y) => y.pop - x.pop);
      await kvPut("placeNames", p.places).catch(()=>{});
      log(`Loaded ${fmtN(p.places.length)} city, town and neighborhood names`); counts(); render();
    } catch(e){ log(`Place names failed: ${e.message}. Try again in a minute.`); }
    $("placeFetch").disabled = false; namesBusy = false;
  }

  /* ---------- search ---------- */
  function search(q){
    const out = $("searchResults"); out.textContent = ""; q = q.trim().toLowerCase(); if (q.length < 2) return;
    const hits = [];
    for (const pl of p.places) if (pl.n.toLowerCase().includes(q)) { hits.push({kind:"place", x:pl}); if (hits.length >= 6) break; }
    for (const x of p.pois) if (x.n.toLowerCase().includes(q)) { hits.push({kind:"poi", x}); if (hits.length >= 14) break; }
    if (!hits.length){ out.innerHTML = `<li class="note">No saved place matches. Fetch places for the area first.</li>`; return; }
    for (const h of hits){
      const li = document.createElement("li"); const btn = document.createElement("button");
      const sub = h.kind === "place" ? pretty(h.x.p) : pretty(h.x.k) + (h.x.ad ? " · " + h.x.ad : "");
      btn.innerHTML = `<span class="swatch" style="background:${h.kind === "place" ? "#ffffff" : GROUP[h.x.g].color}"></span><span><b>${escapeHtml(h.x.n)}</b><br><span class="stat">${escapeHtml(sub)}</span></span>`;
      btn.onclick = () => {
        const z = h.kind === "place" ? Math.max(PLACE_ZOOM[h.x.p] + 2, 11) : 17;
        map.setView([h.x.a, h.x.o], z);
        if (h.kind === "poi") L.popup({maxWidth:260}).setLatLng([h.x.a, h.x.o]).setContent(popupHtml(h.x)).openOn(map);
        out.textContent = ""; if (matchMedia("(max-width:720px)").matches) document.body.classList.add("panel-closed");
      };
      li.append(btn); out.append(li);
    }
  }

  /* ---------- panel ---------- */
  function counts(){
    const n = {}; for (const x of p.pois) n[x.g] = (n[x.g] || 0) + 1;
    GROUPS.forEach(g => { const el = document.querySelector(`[data-count="${g.id}"]`); if (el) el.textContent = fmtN(n[g.id] || 0); });
    $("poiStats").textContent = `${fmtN(p.pois.length)} places saved · ${fmtN(p.places.length)} place names`;
  }
  const saveSettings = () => kvPut("placesSettings", {off:[...p.off], showPois:p.showPois, showCities:p.showCities, showHoods:p.showHoods}).catch(()=>{});
  async function init(){
    const s = await kvGet("placesSettings").catch(()=>null) || {};
    p.off = new Set(s.off || []); p.showPois = s.showPois !== false; p.showCities = s.showCities !== false; p.showHoods = s.showHoods !== false;
    $("poiGroups").innerHTML = GROUPS.map(g => `<label><input type="checkbox" data-group="${g.id}" ${p.off.has(g.id) ? "" : "checked"}>
      <span class="swatch" style="background:${g.color}"></span>${g.label} <span class="stat" data-count="${g.id}">0</span></label>`).join("");
    document.querySelectorAll("[data-group]").forEach(cb => cb.onchange = () => { cb.checked ? p.off.delete(cb.dataset.group) : p.off.add(cb.dataset.group); render(); saveSettings(); });
    for (const [id, key] of [["showPois","showPois"],["showCities","showCities"],["showHoods","showHoods"]]){
      $(id).checked = p[key]; $(id).onchange = e => { p[key] = e.target.checked; render(); saveSettings(); };
    }
    $("poiView").onclick = () => { if (map.getZoom() < 13){ log("Zoom in to 13 or closer, or use Fetch for Houston area"); return; } const b = map.getBounds();
      fetchPois({s:b.getSouth(), w:b.getWest(), n:b.getNorth(), e:b.getEast()}, "this view"); };
    $("poiCity").onclick = () => fetchPois(Packages.core(), "city core");
    $("placeFetch").onclick = () => fetchPlaceNames();
    let t = 0; $("search").oninput = e => { clearTimeout(t); t = setTimeout(() => search(e.target.value), 150); };
    p.pois = await kvGet("pois").catch(()=>null) || []; p.places = (await kvGet("placeNames").catch(()=>null) || []).filter(x => Number.isFinite(x.a) && Number.isFinite(x.o));
    index(); counts(); render();
  }
  map.on("moveend", render);
  return {init, ensureNames};
})();
