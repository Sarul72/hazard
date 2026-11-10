/* Raster classes to polygons, for the GIS downloads of the detailed checks. Plain functions on typed arrays, no DOM.
 *
 * Every pixel edge between two groups becomes a line, so the polygons follow the pixels exactly, as gdal_polygonize does.
 * Pixels of one class that share an edge form one polygon (4-connected). Two pixels that touch only at a corner are
 * joined there when they belong to the same polygon anyway and kept apart otherwise: with this rule no ring ever passes
 * a point twice, so the polygons are valid for ArcGIS, QGIS and GEOS alike (a hole may touch its outer ring at a corner). */

/** Edge-connected groups of pixels with the same code. `keep(code)` says which codes count; others get the label −1.
 * Returns the labels and, per group, its code, pixel count and area in km2 (rowKm2: area of one pixel in each row). */
export function groups(code, w, h, keep, rowKm2) {
  const parent = new Int32Array(w * h).fill(-1);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
    const i = r * w + c, v = code[i];
    if (!keep(v)) continue;
    parent[i] = i;
    if (c > 0 && parent[i - 1] >= 0 && code[i - 1] === v) parent[find(i)] = find(i - 1);
    if (r > 0 && parent[i - w] >= 0 && code[i - w] === v) { const a = find(i - w), b = find(i); if (a !== b) parent[b] = a; }
  }
  const label = new Int32Array(w * h).fill(-1), at = new Int32Array(w * h).fill(-1);
  const value = [], pixels = [], km2 = [];
  for (let i = 0; i < w * h; i++) {
    if (parent[i] < 0) continue;
    const root = find(i);
    if (at[root] < 0) { at[root] = value.length; value.push(code[i]); pixels.push(0); km2.push(0); }
    const g = at[root];
    label[i] = g;
    pixels[g]++;
    km2[g] += rowKm2[Math.floor(i / w)];
  }
  return { label, value, pixels, km2 };
}

// sides of a pixel: 0 top, 1 right, 2 bottom, 3 left; the neighbour beyond each side and the corner each side starts at.
// A side is walked so that its pixel lies on the right: top eastward, right southward and so on, clockwise on a north-up map.
const OUT = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const START = [[0, 0], [1, 0], [1, 1], [0, 1]];

/** Rings of every group, in pixel corners (x to the east from the west edge, y to the south from the north edge).
 * The outer ring of a group runs clockwise on the map, its holes the other way. Groups below minPixels are left out. */
export function traceRings({ label, pixels }, w, h, minPixels = 1) {
  const lab = (c, r) => (c < 0 || r < 0 || c >= w || r >= h ? -1 : label[r * w + c]);
  const done = new Uint8Array(w * h), rings = [];
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
    const i = r * w + c, g = label[i];
    if (g < 0 || pixels[g] < minPixels) continue;
    for (let d = 0; d < 4; d++) {
      if (done[i] & (1 << d) || lab(c + OUT[d][0], r + OUT[d][1]) === g) continue;
      const pts = [];
      let cc = c, rr = r, dd = d;
      do {
        done[rr * w + cc] |= 1 << dd;
        const T = OUT[(dd + 1) % 4], O = OUT[dd];
        const ac = cc + T[0], ar = rr + T[1], dc = ac + O[0], dr = ar + O[1];
        let nc = cc, nr = rr, nd = (dd + 1) % 4;               // the side turns: go on along the next side of this pixel
        if (lab(dc, dr) === g) { nc = dc; nr = dr; nd = (dd + 3) % 4; } // the pixel ahead on the outer diagonal: turn the other way
        else if (lab(ac, ar) === g) { nc = ac; nr = ar; nd = dd; }     // the pixel ahead: straight on
        if (nd !== dd) { const s = START[(dd + 1) % 4]; pts.push([cc + s[0], rr + s[1]]); }
        cc = nc; rr = nr; dd = nd;
      } while (cc !== c || rr !== r || dd !== d);
      pts.push(pts[0]);
      rings.push({ g, pts });
    }
  }
  return rings;
}

/** Twice the signed area of a ring in pixel corners: positive for an outer ring (clockwise with y to the south). */
export const ringTurn = (pts) => { let s = 0; for (let k = 0; k + 1 < pts.length; k++) s += pts[k][0] * pts[k + 1][1] - pts[k + 1][0] * pts[k][1]; return s; };

/** Polygons per code, in longitude and latitude on `grid` {west, north, dx, dy, w, h}.
 * Returns Map(code → { polygons: [[outer, ...holes]], km2, n, smallKm2, smallN }), in GeoJSON order: outer rings
 * counterclockwise, holes clockwise. km2 counts every pixel of the code; smallKm2 and smallN the left-out groups. */
export function polygonize(code, grid, { keep = (v) => v > 0, rowKm2, minPixels = 1, digits = 7 } = {}) {
  const { w, h } = grid, gr = groups(code, w, h, keep, rowKm2), byCode = new Map();
  const slot = (v) => { if (!byCode.has(v)) byCode.set(v, { polygons: [], km2: 0, n: 0, smallKm2: 0, smallN: 0 }); return byCode.get(v); };
  for (let g = 0; g < gr.value.length; g++) {
    const s = slot(gr.value[g]);
    s.km2 += gr.km2[g];
    if (gr.pixels[g] < minPixels) { s.smallKm2 += gr.km2[g]; s.smallN++; }
  }
  const k = 10 ** digits, lon = (x) => Math.round((grid.west + x * grid.dx) * k) / k, lat = (y) => Math.round((grid.north - y * grid.dy) * k) / k;
  const shells = new Map();
  for (const { g, pts } of traceRings(gr, w, h, minPixels)) {
    // traced clockwise on the map for an outer ring and the other way for a hole; GeoJSON wants the opposite of both
    const outer = ringTurn(pts) > 0, ll = pts.map(([x, y]) => [lon(x), lat(y)]).reverse();
    if (!shells.has(g)) shells.set(g, { outer: null, holes: [] });
    const p = shells.get(g);
    if (outer) p.outer = ll; else p.holes.push(ll);
  }
  for (const [g, p] of shells) {
    const s = slot(gr.value[g]);
    s.polygons.push([p.outer, ...p.holes]);
    s.n++;
  }
  return byCode;
}
