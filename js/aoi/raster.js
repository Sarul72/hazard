/* Raster steps for the detailed hazard check that runs in the browser. Plain functions on typed arrays, no DOM, so the
 * tests can run them anywhere. The grid is in degrees (EPSG:4326) with square pixels in metres at the centre latitude,
 * which is what Earth Engine does when a result is asked for at a given scale; the Planetary Computer's data API cuts
 * every layer straight onto it. */

const RAD = Math.PI / 180;
export const M_PER_DEG = 111320;

/** Output grid for a box {s, n, w, e} at `scale` metres. */
export function makeGrid(box, scale) {
  const lat0 = (box.s + box.n) / 2;
  const dy = scale / M_PER_DEG, dx = scale / (M_PER_DEG * Math.cos(lat0 * RAD));
  const w = Math.max(1, Math.round((box.e - box.w) / dx)), h = Math.max(1, Math.round((box.n - box.s) / dy));
  return { west: box.w, north: box.n, dx, dy, w, h, scale, lat0 };
}

/** Area of one pixel of each row in km2. */
export function rowAreaKm2(g) {
  const out = new Float64Array(g.h);
  for (let r = 0; r < g.h; r++) {
    const lat = g.north - (r + 0.5) * g.dy;
    out[r] = (g.dy * M_PER_DEG / 1000) * (g.dx * M_PER_DEG * Math.cos(lat * RAD) / 1000);
  }
  return out;
}

export function boxAreaKm2(box) {
  const lat0 = (box.s + box.n) / 2;
  return (box.n - box.s) * M_PER_DEG / 1000 * (box.e - box.w) * M_PER_DEG * Math.cos(lat0 * RAD) / 1000;
}

/** Mean over a circle of `radius` pixels (centres within the radius, as ee.Kernel.circle), skipping NaN. */
export function focalMeanCircle(v, w, h, radius) {
  const R = Math.floor(radius), half = [];
  for (let d = -R; d <= R; d++) half.push(Math.floor(Math.sqrt(radius * radius - d * d) + 1e-9));
  const sum = new Float64Array((w + 1) * h), cnt = new Int32Array((w + 1) * h);
  for (let r = 0; r < h; r++) {
    const o = r * (w + 1);
    for (let c = 0; c < w; c++) {
      const x = v[r * w + c], ok = !Number.isNaN(x);
      sum[o + c + 1] = sum[o + c] + (ok ? x : 0);
      cnt[o + c + 1] = cnt[o + c] + (ok ? 1 : 0);
    }
  }
  const out = new Float32Array(w * h);
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
    let s = 0, n = 0;
    for (let k = 0; k < half.length; k++) {
      const rr = r + k - R;
      if (rr < 0 || rr >= h) continue;
      const o = rr * (w + 1), a = Math.max(0, c - half[k]), b = Math.min(w, c + half[k] + 1);
      s += sum[o + b] - sum[o + a]; n += cnt[o + b] - cnt[o + a];
    }
    out[r * w + c] = n ? s / n : NaN;
  }
  return out;
}

/** Size of the 8-connected group each set pixel belongs to (0 where the mask is 0), as connectedPixelCount. */
export function connectedSizes(mask, w, h) {
  const parent = new Int32Array(w * h).fill(-1);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const join = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[b] = a; };
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
    const i = r * w + c;
    if (!mask[i]) continue;
    parent[i] = i;
    if (c > 0 && mask[i - 1]) join(i - 1, i);
    if (r > 0) {
      const u = i - w;
      if (mask[u]) join(u, i);
      if (c > 0 && mask[u - 1]) join(u - 1, i);
      if (c < w - 1 && mask[u + 1]) join(u + 1, i);
    }
  }
  const size = new Int32Array(w * h);
  for (let i = 0; i < w * h; i++) if (mask[i]) size[find(i)]++;
  const out = new Int32Array(w * h);
  for (let i = 0; i < w * h; i++) if (mask[i]) out[i] = size[find(i)];
  return out;
}

/** Slope in degrees (Horn 1981) of a DEM on a grid of rx by ry degrees, edges repeated. */
export function slopeDeg(dem, w, h, rx, ry, lat0) {
  const dxm = rx * M_PER_DEG * Math.cos(lat0 * RAD), dym = Math.abs(ry) * M_PER_DEG;
  const z = (r, c) => dem[Math.min(h - 1, Math.max(0, r)) * w + Math.min(w - 1, Math.max(0, c))];
  const out = new Float32Array(w * h);
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
    const a = z(r - 1, c - 1), b = z(r - 1, c), cc = z(r - 1, c + 1), d = z(r, c - 1), f = z(r, c + 1), g = z(r + 1, c - 1), hh = z(r + 1, c), i = z(r + 1, c + 1);
    const gx = ((cc + 2 * f + i) - (a + 2 * d + g)) / (8 * dxm), gy = ((g + 2 * hh + i) - (a + 2 * b + cc)) / (8 * dym);
    out[r * w + c] = Math.atan(Math.hypot(gx, gy)) / RAD;
  }
  return out;
}

/** Smallest kept group in pixels so that it stays near `minPixels` pixels of 10 m at every scale. */
export const minCount = (minPixels, scale) => Math.max(1, Math.ceil(minPixels * 100 / (scale * scale)));

/** Scene classes that are not clear ground: no data, cloud shadow, cloud medium and high, cirrus, snow. */
export const CLOUDY_SCL = new Set([0, 3, 8, 9, 10, 11]);
