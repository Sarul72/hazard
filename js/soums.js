/* Settlement-zone view: every soum coloured by the area-weighted mean of the grid cells inside it.
 * data/soums.geojson is optional; without it the panel says so instead of showing anything. */

function inRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function inFeature(x, y, geom) {
  const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
  return polys.some((p) => inRing(x, y, p[0]) && !p.slice(1).some((h) => inRing(x, y, h)));
}

function bounds(geom) {
  let w = 180, e = -180, s = 90, n = -90;
  const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
  for (const p of polys) for (const [x, y] of p[0]) { if (x < w) w = x; if (x > e) e = x; if (y < s) s = y; if (y > n) n = y; }
  return { w, e, s, n };
}

/** Grid cells whose centre lies in the soum. A soum smaller than a cell takes the cell under its centre. */
export function soumCells(geom, grid) {
  const { west, north, dx, dy, nx, ny } = grid, b = bounds(geom), cells = [];
  const c0 = Math.max(0, Math.floor((b.w - west) / dx)), c1 = Math.min(nx - 1, Math.floor((b.e - west) / dx));
  const r0 = Math.max(0, Math.floor((north - b.n) / dy)), r1 = Math.min(ny - 1, Math.floor((north - b.s) / dy));
  for (let r = r0; r <= r1; r++) {
    const lat = north - (r + 0.5) * dy, cos = Math.cos(lat * Math.PI / 180);
    for (let c = c0; c <= c1; c++) if (inFeature(west + (c + 0.5) * dx, lat, geom)) cells.push({ i: r * nx + c, r, c, w: cos });
  }
  if (!cells.length) {
    const r = Math.min(ny - 1, Math.max(0, Math.floor((north - (b.s + b.n) / 2) / dy)));
    const c = Math.min(nx - 1, Math.max(0, Math.floor(((b.w + b.e) / 2 - west) / dx)));
    cells.push({ i: r * nx + c, r, c, w: Math.cos((north - (r + 0.5) * dy) * Math.PI / 180) });
  }
  return cells;
}

export async function loadSoums(grid) {
  const res = await fetch("data/soums.geojson");
  if (!res.ok) return null;
  const gj = await res.json();
  gj.features.forEach((f, id) => {
    const p = f.properties ?? {};
    f.id = id;
    f.names = { mn: p.name_mn ?? p.name ?? String(id), en: p.name ?? p.name_mn ?? String(id) };
    f.aimags = { mn: p.aimag_mn ?? p.aimag ?? "", en: p.aimag ?? "" };
    f.cells = soumCells(f.geometry, grid);
  });
  return gj;
}

export function createSoumLayer(map, gj, { color, tip, onPick }) {
  const L = window.L;
  map.createPane("soumPane").style.zIndex = 380;
  const scores = new Map();
  let picked = null;
  const style = (f) => ({
    pane: "soumPane", fillColor: color(scores.get(f.id)), fillOpacity: 0.72,
    color: f.id === picked ? "#ffffff" : "rgba(255,255,255,.45)", weight: f.id === picked ? 2.5 : 0.7,
  });
  const layer = L.geoJSON(gj, {
    style,
    onEachFeature: (f, l) => {
      l.bindTooltip(() => tip(f, scores.get(f.id)), { sticky: true });
      l.on("click", () => onPick(f));
    },
  });
  return {
    setScores(fn) { for (const f of gj.features) scores.set(f.id, fn(f)); layer.setStyle(style); },
    score: (f) => scores.get(f.id),
    pick(id) { picked = id; layer.setStyle(style); },
    show(on) { if (on) layer.addTo(map); else layer.remove(); },
    bounds: (f) => L.geoJSON(f).getBounds(),
  };
}
