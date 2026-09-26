"use strict";
// Packages: a 100 statute mi (161 km) square around a centre. The open package bounds the map, the grid zone and downloads.
const Packages = (() => {
  const HALF_KM = 160.934;
  const HOUSTON = {id:"houston", name:"Houston", lat:29.7604, lon:-95.3698, builtin:true, core:HOUSTON_BBOX, prebuilt:true};
  let list = [HOUSTON], current = null;
  const squareAround = (lat, lon, halfKm) => { const dlat = halfKm/110.95, dlon = halfKm/(111.32*Math.cos(lat*Math.PI/180));
    return {s:lat-dlat, w:lon-dlon, n:lat+dlat, e:lon+dlon}; };
  const bboxOf = p => squareAround(p.lat, p.lon, HALF_KM);
  const coreOf = p => p.core || squareAround(p.lat, p.lon, 33);
  const fmtLL = (lat, lon) => `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? "N" : "S"}, ${Math.abs(lon).toFixed(4)}° ${lon >= 0 ? "E" : "W"}`;

  function open(p, fit = true){
    current = p; $("pkgName").textContent = p.name; $("pkgClose").hidden = false; hide();
    applyDomainLock(); Grid.setZone(bboxOf(p)); updatePackInfo();
    if (fit){ const c = coreOf(p); map.fitBounds([[c.s, c.w], [c.n, c.e]]); }
    kvPut("package", p.id).catch(()=>{});
    Places.ensureNames(bboxOf(p));
    log(`Opened package ${p.name}`);
  }
  function show(){ render(); $("pkgScreen").hidden = false; }
  function hide(){ $("pkgScreen").hidden = true; }
  function render(){
    const ul = $("pkgList"); ul.textContent = "";
    for (const p of list){
      const li = document.createElement("li"); li.className = "pkg" + (p === current ? " cur" : "");
      li.innerHTML = `<div><b>${escapeHtml(p.name)}</b>${p === current ? ` <span class="pill ok">open</span>` : ""}
          <div class="stat">${fmtLL(p.lat, p.lon)} · 322 km (200 mi) square</div>
          <div class="note">${p.prebuilt ? "Prebuilt imagery packs available" : "Imagery downloads tile by tile"}</div></div>
        <div class="row"><button class="primary" data-act="open">Open</button>${p.builtin ? "" : `<button data-act="del">Delete</button>`}</div>`;
      li.querySelector('[data-act="open"]').onclick = () => open(p);
      const del = li.querySelector('[data-act="del"]');
      if (del) del.onclick = () => {
        if (del.dataset.armed !== "1"){ del.dataset.armed = "1"; del.textContent = "Confirm"; setTimeout(render, 3000); return; }
        list = list.filter(x => x !== p); save(); if (current === p) open(HOUSTON); else render();
      };
      ul.append(li);
    }
  }
  const save = () => kvPut("packages", list.filter(p => !p.builtin)).catch(()=>{});
  function create(){
    const name = $("pkgNewName").value.trim(), lat = +$("pkgNewLat").value, lon = +$("pkgNewLon").value;
    if (!name){ $("pkgNewMsg").textContent = "Give the package a name."; return; }
    if (!(Math.abs(lat) <= 80 && Math.abs(lon) <= 180) || $("pkgNewLat").value === "" || $("pkgNewLon").value === ""){
      $("pkgNewMsg").textContent = "Enter the centre as decimal degrees, for example 32.7767 and -96.7970."; return; }
    const p = {id:(crypto.randomUUID ? crypto.randomUUID() : String(Date.now())), name, lat, lon};
    list.push(p); save(); $("pkgNewName").value = ""; $("pkgNewMsg").textContent = ""; open(p);
  }
  function updatePackInfo(){
    if (!current) return;
    const b = bboxOf(current), core = coreOf(current);
    const n = (bb, a, z) => fmtN(countTiles(tileRanges(bb, a, z)));
    $("packRegion14Text").textContent = `Add zoom 14 across the package (${n(b,14,14)} more tiles${current.prebuilt ? ", about 473 MB" : ""})`;
    $("packZ16Text").textContent = `Add zoom 16 over the city core (${n(core,16,16)} more tiles${current.prebuilt ? ", about 507 MB" : ""})`;
    if (!current.prebuilt){ $("packInfo").textContent = `Zoom 8–13 over the whole square and 14–15 over the city core: ${n(b,8,13)} + ${n(core,14,15)} tiles.`; return; }
    Promise.all(PACKS.map(pk => fetch(`packs/${pk.id}/index.json`, {cache:"no-cache"}).then(r => r.ok ? r.json() : null).catch(() => null)))
      .then(ix => { $("packInfo").textContent = ix.every(Boolean)
        ? ix.map(i => `${i.name}: zoom ${i.zmin}–${i.zmax}, ${fmtN(i.tiles)} tiles, ${fmtBytes(i.bytes)}`).join(" · ")
        : "Region: zoom 8–13, about 8,000 tiles / 125 MB. City: zoom 14–15, about 5,700 tiles / 164 MB."; });
  }
  let picking = false;
  function pickOnMap(){ picking = true; hide(); $("modeBanner").hidden = false; $("modeBannerText").textContent = "Tap the centre of the new package."; }
  map.on("click", e => { if (!picking) return; picking = false; $("modeBanner").hidden = true;
    $("pkgNewLat").value = e.latlng.lat.toFixed(4); $("pkgNewLon").value = e.latlng.lng.toFixed(4); show(); });

  async function init(){
    list = [HOUSTON, ...((await kvGet("packages").catch(()=>null)) || [])];
    $("pkgSwitch").onclick = show; $("pkgClose").onclick = () => current && hide();
    $("pkgCreate").onclick = create; $("pkgPick").onclick = pickOnMap;
    const id = await kvGet("package").catch(()=>null), p = list.find(x => x.id === id);
    if (p) open(p, false); else { render(); $("pkgClose").hidden = true; show(); }
  }
  const cancelPick = () => { if (picking){ picking = false; show(); } };
  return {init, cancelPick, current:() => current, bbox:() => current ? bboxOf(current) : bboxOf(HOUSTON), core:() => current ? coreOf(current) : HOUSTON_BBOX,
    prebuilt:() => !current || !!current.prebuilt, show};
})();
