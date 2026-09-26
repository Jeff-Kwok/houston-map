"use strict";
// Union of axis-aligned grid squares (any mix of sizes) into GeoJSON Polygon/MultiPolygon rings, traced on the
// finest lattice in UTM metres. toLonLat(e, n) maps a lattice corner to [lon, lat].
function cellUnion(cells, toLonLat){
  if (!cells.length) return null;
  const u = Math.min(...cells.map(c => c.size));
  const E0 = Math.min(...cells.map(c => c.e0)), N0 = Math.min(...cells.map(c => c.n0));
  const units = new Set();
  for (const c of cells){
    const i0 = Math.round((c.e0 - E0)/u), j0 = Math.round((c.n0 - N0)/u), k = Math.round(c.size/u);
    for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) units.add(`${i0+i},${j0+j}`);
  }
  // Boundary edges, oriented so the filled side is on the left (outer rings CCW, holes CW).
  const out = new Map(), has = (i, j) => units.has(`${i},${j}`);
  const edge = (a, b) => { const k = a.join(","); (out.get(k) || out.set(k, []).get(k)).push(b); };
  for (const key of units){
    const [i, j] = key.split(",").map(Number);
    if (!has(i, j-1)) edge([i, j], [i+1, j]);
    if (!has(i+1, j)) edge([i+1, j], [i+1, j+1]);
    if (!has(i, j+1)) edge([i+1, j+1], [i, j+1]);
    if (!has(i-1, j)) edge([i, j+1], [i, j]);
  }
  const rings = [];
  for (const [startKey, ends] of out){
    while (ends.length){
      const start = startKey.split(",").map(Number), ring = [start];
      let prev = start, cur = ends.pop();
      while (cur.join(",") !== startKey){
        ring.push(cur);
        const nexts = out.get(cur.join(","));
        // At a pinch point take the left-most turn: the filled side stays on the left, so diagonal neighbours stay separate rings.
        const din = [cur[0]-prev[0], cur[1]-prev[1]];
        nexts.sort((a, b) => turn(din, [b[0]-cur[0], b[1]-cur[1]]) - turn(din, [a[0]-cur[0], a[1]-cur[1]]));
        prev = cur; cur = nexts.shift();
      }
      rings.push(simplify(ring));
    }
  }
  const area = r => r.reduce((s, p, k) => { const q = r[(k+1) % r.length]; return s + p[0]*q[1] - q[0]*p[1]; }, 0) / 2;
  const inside = (pt, r) => { let c = false; for (let a = 0, b = r.length-1; a < r.length; b = a++){
    const [xa, ya] = r[a], [xb, yb] = r[b];
    if ((ya > pt[1]) !== (yb > pt[1]) && pt[0] < (xb-xa)*(pt[1]-ya)/(yb-ya) + xa) c = !c; } return c; };
  const outers = rings.filter(r => area(r) > 0), holes = rings.filter(r => area(r) < 0);
  const polys = outers.map(o => [o]);
  for (const h of holes){
    // A point half a unit to the left of the hole's first edge is filled ground, so it lies inside the host ring.
    const [a, b] = h, d = [Math.sign(b[0]-a[0]), Math.sign(b[1]-a[1])];
    const probe = [(a[0]+b[0])/2 - 0.5*d[1], (a[1]+b[1])/2 + 0.5*d[0]];
    const host = polys.find(p => inside(probe, p[0]));
    if (host) host.push(h);
  }
  const toGeo = r => { const pts = r.map(([i, j]) => toLonLat(E0 + i*u, N0 + j*u)); pts.push(pts[0]); return pts; };
  const coords = polys.map(p => p.map(toGeo));
  return coords.length === 1 ? {type:"Polygon", coordinates:coords[0]} : {type:"MultiPolygon", coordinates:coords};
}
// Turn from direction a to b: -1 right, 0 straight, 1 left, 2 back.
function turn(a, b){ const cross = a[0]*b[1] - a[1]*b[0], dot = a[0]*b[0] + a[1]*b[1]; return cross < 0 ? -1 : cross > 0 ? 1 : dot > 0 ? 0 : 2; }
function simplify(r){
  const keep = r.filter((p, k) => { const a = r[(k-1+r.length) % r.length], b = r[(k+1) % r.length];
    return (p[0]-a[0])*(b[1]-p[1]) - (p[1]-a[1])*(b[0]-p[0]) !== 0; });
  return keep.length >= 3 ? keep : r;
}
if (typeof module !== "undefined") module.exports = cellUnion;
