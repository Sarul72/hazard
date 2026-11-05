/* Small geometry helpers for the polygon tool. Pure functions, no DOM, usable in Node tests.
 * Polygons are arrays of [lat, lon]. */

export const KM_PER_DEG_LAT = 110.574; // near 45 N; good enough for areas and pixel sizes at Mongolian latitudes

const fin = (v) => typeof v === "number" && Number.isFinite(v);

export function kmPerDegLon(lat) { return 111.320 * Math.cos((lat * Math.PI) / 180); }

export function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371.0088, rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad, dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function bboxOf(poly) {
  let s = Infinity, w = Infinity, n = -Infinity, e = -Infinity;
  for (const [la, lo] of poly) { if (la < s) s = la; if (la > n) n = la; if (lo < w) w = lo; if (lo > e) e = lo; }
  return { s, w, n, e };
}

/** Ray casting. Points exactly on an edge may fall either way, which is irrelevant for pixel colouring. */
export function pointInPolygon(lat, lon, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [yi, xi] = poly[i], [yj, xj] = poly[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Area in km² by the shoelace formula on a local equirectangular projection. */
export function polygonAreaKm2(poly) {
  if (poly.length < 3) return 0;
  const lat0 = poly.reduce((s, p) => s + p[0], 0) / poly.length;
  const kx = kmPerDegLon(lat0), ky = KM_PER_DEG_LAT;
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    a += (poly[j][1] * kx) * (poly[i][0] * ky) - (poly[i][1] * kx) * (poly[j][0] * ky);
  }
  return Math.abs(a) / 2;
}

/**
 * Regular lat/lon grid of sample nodes covering the polygon's bounding box.
 * `minStepDeg` is the finest useful spacing: the weather and CAMS models behind the scores have a native
 * resolution of roughly 0.1 to 0.4 degrees, so a finer grid would only repeat the same model cell.
 * `maxPerSide` caps the number of API locations (nodes = at most maxPerSide²).
 */
export function makeGrid(poly, { minStepDeg = 0.1, maxPerSide = 7 } = {}) {
  const { s, w, n, e } = bboxOf(poly);
  const span = Math.max(n - s, e - w, 1e-6);
  const step = Math.max(minStepDeg, span / (maxPerSide - 1));
  const ny = Math.max(2, Math.ceil((n - s) / step - 1e-9) + 1);
  const nx = Math.max(2, Math.ceil((e - w) / step - 1e-9) + 1);
  const lats = Array.from({ length: ny }, (_, i) => s + i * step);
  const lons = Array.from({ length: nx }, (_, i) => w + i * step);
  const nodes = [];
  for (let iy = 0; iy < ny; iy++) for (let ix = 0; ix < nx; ix++) nodes.push({ id: `g${iy}_${ix}`, lat: lats[iy], lon: lons[ix] });
  return { lats, lons, ny, nx, step, nodes };
}

/** Bilinear interpolation on a makeGrid() grid. `values[iy * nx + ix]` may be null; missing corners are skipped. */
export function bilinear(grid, values, lat, lon) {
  const { lats, lons, ny, nx } = grid;
  const fy = Math.min(Math.max((lat - lats[0]) / (lats[1] - lats[0]), 0), ny - 1);
  const fx = Math.min(Math.max((lon - lons[0]) / (lons[1] - lons[0]), 0), nx - 1);
  const y0 = Math.min(Math.floor(fy), ny - 2), x0 = Math.min(Math.floor(fx), nx - 2);
  const ty = fy - y0, tx = fx - x0;
  let acc = 0, wsum = 0;
  for (const [dy, dx, wt] of [[0, 0, (1 - ty) * (1 - tx)], [0, 1, (1 - ty) * tx], [1, 0, ty * (1 - tx)], [1, 1, ty * tx]]) {
    const v = values[(y0 + dy) * nx + (x0 + dx)];
    if (fin(v) && wt > 0) { acc += v * wt; wsum += wt; }
  }
  return wsum > 0 ? acc / wsum : null;
}

/**
 * Pixel raster of the polygon: returns { w, h, bbox, cells: Float32Array|null per pixel (NaN outside polygon),
 * pixelKm: [dx, dy] }. Rows run north to south so the array can be used directly as image rows.
 */
export function rasterize(poly, grid, values, maxSide = 180) {
  const b = bboxOf(poly);
  const lat0 = (b.n + b.s) / 2;
  const widthKm = (b.e - b.w) * kmPerDegLon(lat0), heightKm = (b.n - b.s) * KM_PER_DEG_LAT;
  const k = maxSide / Math.max(widthKm, heightKm, 1e-6);
  const w = Math.max(2, Math.round(widthKm * k)), h = Math.max(2, Math.round(heightKm * k));
  const cells = new Float32Array(w * h).fill(NaN);
  for (let r = 0; r < h; r++) {
    const lat = b.n - ((r + 0.5) / h) * (b.n - b.s);
    for (let c = 0; c < w; c++) {
      const lon = b.w + ((c + 0.5) / w) * (b.e - b.w);
      if (!pointInPolygon(lat, lon, poly)) continue;
      const v = bilinear(grid, values, lat, lon);
      if (fin(v)) cells[r * w + c] = v;
    }
  }
  return { w, h, bbox: b, cells, pixelKm: [widthKm / w, heightKm / h] };
}

/** Share of valid pixels in each class, plus mean and max. `classify(score)` returns a class key or null. */
export function summarize(cells, classify) {
  const counts = {}; let n = 0, sum = 0, max = -Infinity;
  for (const v of cells) {
    if (!fin(v)) continue;
    n++; sum += v; if (v > max) max = v;
    const k = classify(v); counts[k] = (counts[k] || 0) + 1;
  }
  const share = {}; for (const k of Object.keys(counts)) share[k] = counts[k] / n;
  return { n, mean: n ? sum / n : null, max: n ? max : null, share };
}
