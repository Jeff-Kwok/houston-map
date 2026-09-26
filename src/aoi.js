"use strict";
// Areas of interest: named shapes, each in a user-made category with its own colour and opacity.
const Aoi = (() => {
  const pane = map.createPane("aoi"); pane.style.zIndex = 420;
  const renderer = L.svg({pane:"aoi"});
  const group = L.layerGroup().addTo(map);
  const layers = new Map();
  const a = {cats:[], areas:[], showNames:true, current:null, selected:null, reshaping:null};
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`);
  const cat = id => a.cats.find(c => c.id === id) || a.cats[0];
  const esc = escapeHtml;

  const styleFor = area => { const c = cat(area.cat);
    return {color:c.color, weight: area.id === a.selected ? 4 : 2, opacity:.95, fillColor:c.color, fillOpacity:c.opacity}; };
  function draw(area){
    const old = layers.get(area.id); if (old){ group.removeLayer(old); layers.delete(area.id); }
    if (!cat(area.cat).visible) return;
    const poly = L.geoJSON(area.geometry, {renderer, style:() => styleFor(area)}).getLayers()[0]; if (!poly) return;
    if (a.showNames) poly.bindTooltip(esc(area.name), {permanent:true, direction:"center", className:"aoi-label", interactive:false});
    poly.on("click", e => { if (state.mode === "pan"){ select(area.id); L.DomEvent.stop(e); } });
    poly.on("pm:edit", () => { area.geometry = poly.toGeoJSON().geometry; save(); });
    group.addLayer(poly); layers.set(area.id, poly);
  }
  const redrawAll = () => a.areas.forEach(draw);

  function addArea(name, geometry, catId){
    if (!a.cats.length) addCat();
    pushUndo("add area");
    const area = {id:uid(), name, cat:catId || a.current || a.cats[0].id, geometry, created_utc:new Date().toISOString()};
    a.areas.push(area); draw(area); select(area.id); save();
    const input = document.querySelector(`[data-area="${area.id}"] input.aname`); input?.focus(); input?.select();
    return area;
  }
  function created(layer){
    map.removeLayer(layer);
    const c = cat(a.current); const n = a.areas.filter(x => x.cat === c.id).length + 1;
    addArea(`${c.name} ${n}`, layer.toGeoJSON().geometry, c.id);
  }
  function addCat(){
    const palette = ["#f5b301","#16a3c2","#e0457b","#6cc24a","#9b6cff","#ff7a1a"];
    const c = {id:uid(), name:`Category ${a.cats.length+1}`, color:palette[a.cats.length % palette.length], opacity:.35, visible:true};
    a.cats.push(c); a.current = c.id; renderPanel(); save(); return c;
  }
  function select(id){
    a.selected = id; redrawAll(); renderPanel();
    document.querySelector(`[data-area="${id}"]`)?.scrollIntoView({block:"nearest"});
    if (document.body.classList.contains("panel-closed") && id) document.body.classList.remove("panel-closed");
  }
  function stopReshape(){ if (!a.reshaping) return; layers.get(a.reshaping)?.pm.disable(); a.reshaping = null; renderPanel(); }

  function renderPanel(){
    const cs = $("aoiCats"); cs.textContent = "";
    for (const c of a.cats){
      const n = a.areas.filter(x => x.cat === c.id).length;
      const li = document.createElement("li"); li.className = "cat-row";
      li.innerHTML = `<input type="color" value="${c.color}" aria-label="Colour for ${esc(c.name)}">
        <input type="text" class="cname" value="${esc(c.name)}" aria-label="Category name">
        <input type="range" min="0" max="1" step="0.05" value="${c.opacity}" aria-label="Opacity for ${esc(c.name)}">
        <label class="stat" title="Show this category"><input type="checkbox" ${c.visible ? "checked" : ""}> ${n}</label>
        <button class="del" aria-label="Delete category ${esc(c.name)}">✕</button>`;
      const [color, name, op, vis] = li.querySelectorAll("input");
      color.oninput = () => { c.color = color.value; redrawAll(); refreshSwatches(); };
      color.onchange = save;
      name.onchange = () => { c.name = name.value.trim() || c.name; renderPanel(); save(); };
      op.oninput = () => { c.opacity = +op.value; redrawAll(); }; op.onchange = save;
      vis.onchange = () => { c.visible = vis.checked; redrawAll(); save(); };
      const del = li.querySelector(".del");
      del.onclick = () => {
        if (a.cats.length === 1){ log("Keep at least one category"); return; }
        if (n && del.dataset.armed !== "1"){ del.dataset.armed = "1"; del.textContent = `Delete + ${n}?`; setTimeout(() => renderPanel(), 4000); return; }
        pushUndo("delete category");
        a.areas = a.areas.filter(x => x.cat !== c.id); a.cats = a.cats.filter(x => x !== c);
        if (a.current === c.id) a.current = a.cats[0].id;
        [...layers.keys()].forEach(id => { if (!a.areas.some(x => x.id === id)){ group.removeLayer(layers.get(id)); layers.delete(id); } });
        renderPanel(); save();
      };
      cs.append(li);
    }
    const sel = $("aoiCurrent"); sel.innerHTML = a.cats.map(c => `<option value="${c.id}"${c.id===a.current?" selected":""}>${esc(c.name)}</option>`).join("");
    const q = $("aoiFilter").value.trim().toLowerCase();
    const list = $("aoiList"); list.textContent = "";
    const rows = a.areas.filter(x => !q || x.name.toLowerCase().includes(q))
      .sort((x,y) => cat(x.cat).name.localeCompare(cat(y.cat).name) || x.name.localeCompare(y.name));
    for (const area of rows){
      const li = document.createElement("li"); li.dataset.area = area.id; if (area.id === a.selected) li.className = "sel";
      li.innerHTML = `<span class="swatch" style="background:${cat(area.cat).color}"></span>
        <input type="text" class="aname" value="${esc(area.name)}" aria-label="Area name">
        <select aria-label="Category">${a.cats.map(c => `<option value="${c.id}"${c.id===area.cat?" selected":""}>${esc(c.name)}</option>`).join("")}</select>
        <div class="row"><button data-act="zoom">Zoom to</button><button data-act="shape">${a.reshaping===area.id?"Done":"Reshape"}</button><button data-act="del">Delete</button></div>`;
      li.querySelector(".aname").onchange = e => { area.name = e.target.value.trim() || area.name; draw(area); save(); };
      li.querySelector("select").onchange = e => { area.cat = e.target.value; draw(area); renderPanel(); save(); };
      li.onclick = e => { if (e.target === li || e.target.classList.contains("swatch")) select(area.id); };
      li.querySelector('[data-act="zoom"]').onclick = () => { const l = layers.get(area.id); if (l) map.fitBounds(l.getBounds(), {padding:[40,40]}); select(area.id); };
      li.querySelector('[data-act="shape"]').onclick = () => {
        if (a.reshaping === area.id){ stopReshape(); return; }
        stopReshape(); setMode("pan"); const l = layers.get(area.id); if (!l) return;
        pushUndo("reshape area"); a.reshaping = area.id; l.pm.enable({snappable:false, allowSelfIntersection:false}); renderPanel();
      };
      const del = li.querySelector('[data-act="del"]');
      del.onclick = () => {
        if (del.dataset.armed !== "1"){ del.dataset.armed = "1"; del.textContent = "Confirm"; setTimeout(() => { del.dataset.armed = ""; del.textContent = "Delete"; }, 3000); return; }
        pushUndo("delete area"); a.areas = a.areas.filter(x => x !== area);
        const l = layers.get(area.id); if (l){ group.removeLayer(l); layers.delete(area.id); }
        renderPanel(); save();
      };
      list.append(li);
    }
    $("aoiStats").textContent = `${fmtN(a.areas.length)} areas in ${fmtN(a.cats.length)} categories`;
  }
  const refreshSwatches = () => document.querySelectorAll("#aoiList li").forEach(li => {
    const area = a.areas.find(x => x.id === li.dataset.area); if (area) li.querySelector(".swatch").style.background = cat(area.cat).color; });

  const save = () => kvPut("aoi", {cats:a.cats, areas:a.areas, showNames:a.showNames, current:a.current}).catch(()=>{});
  async function init(){
    const s = await kvGet("aoi").catch(()=>null);
    if (s){ a.cats = s.cats || []; a.areas = s.areas || []; a.showNames = s.showNames !== false; a.current = s.current; }
    if (!a.cats.length) a.cats.push({id:uid(), name:"Of interest", color:"#f5b301", opacity:.35, visible:true});
    if (!cat(a.current) || !a.cats.some(c => c.id === a.current)) a.current = a.cats[0].id;
    $("aoiNames").checked = a.showNames;
    $("aoiNames").onchange = e => { a.showNames = e.target.checked; redrawAll(); save(); };
    $("aoiCurrent").onchange = e => { a.current = e.target.value; save(); };
    $("aoiAddCat").onclick = () => addCat();
    $("aoiFilter").oninput = renderPanel;
    redrawAll(); renderPanel();
  }
  function exportGeoJSON(){
    return {type:"FeatureCollection", features:a.areas.map(x => { const c = cat(x.cat);
      return {type:"Feature", properties:{id:x.id, name:x.name, category:c.name, color:c.color, opacity:c.opacity, created_utc:x.created_utc}, geometry:x.geometry}; })};
  }
  function importGeoJSON(gj){
    const feats = (gj.type === "FeatureCollection" ? gj.features : [gj]).filter(f => /Polygon/.test(f.geometry?.type || ""));
    pushUndo("import areas");
    for (const f of feats){
      const p = f.properties || {};
      let c = a.cats.find(x => x.name === p.category);
      if (!c && p.category){ c = {id:uid(), name:String(p.category), color:/^#[0-9a-f]{6}$/i.test(p.color) ? p.color : "#16a3c2",
        opacity: typeof p.opacity === "number" ? p.opacity : .35, visible:true}; a.cats.push(c); }
      const parts = f.geometry.type === "MultiPolygon" ? f.geometry.coordinates.map(co => ({type:"Polygon", coordinates:co})) : [f.geometry];
      parts.forEach((geometry, i) => a.areas.push({id: i === 0 && p.id && !a.areas.some(x => x.id === p.id) ? p.id : uid(),
        name:String(p.name || "Imported area") + (parts.length > 1 ? ` (${i+1})` : ""),
        cat:(c || cat(a.current)).id, geometry, created_utc:p.created_utc || new Date().toISOString()}));
    }
    redrawAll(); renderPanel(); save(); return feats.length;
  }
  map.on("zoomend", () => map.getContainer().classList.toggle("z-lo", map.getZoom() < 12));
  map.on("click", () => { if (state.mode === "pan" && a.selected){ a.selected = null; redrawAll(); renderPanel(); } });
  return {init, created, addArea, selectedId:() => a.selected, exportGeoJSON, importGeoJSON, stopReshape,
    snapshot:() => JSON.parse(JSON.stringify({cats:a.cats, areas:a.areas})),
    restore:s => { stopReshape(); a.cats = s.cats; a.areas = s.areas; [...layers.values()].forEach(l => group.removeLayer(l)); layers.clear(); redrawAll(); renderPanel(); save(); }};
})();
