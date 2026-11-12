/* Where the dust of a coal mine settles, read from the vegetation around it: the wind-sector vegetation contrast.
 * Dust that lies on leaves lowers the near-infrared reflectance and so the NDVI of the canopy, and it falls off with
 * distance from the pit and the haul roads. At one distance from the mine the grass is alike in every direction except
 * for what the wind brings from the mine, so the NDVI of each wind sector, compared with the same distance in the other
 * sectors, measures the settled dust, and the sectors the wind blows toward should carry the deficit.
 * Plain functions on typed arrays, no DOM, no fetch, so the tests run anywhere. The grid is the 100 m square of
 * js/minedaily.js (domain()); the data come from the box that calls these (js/minedust_vegbox.js). */
import { KM_PER_DEG_LAT, kmPerDegLon } from "./geo.js";

export const VEG = {
  radiusKm: 30, cellM: 100, sectors: 16, rings: [3, 6, 10, 15, 20, 30], minPixels: 200, onset: 6, minThr: 0.02, madK: 1.5, vegNdvi: 0.30,
};

/** Sector of a bearing in degrees clockwise from north: sector 0 is centred on north. */
export function sectorOf(bearingDeg, n = VEG.sectors) {
  const w = 360 / n;
  return Math.floor((((bearingDeg + w / 2) % 360) + 360) % 360 / w) % n;
}

/** Bearing (degrees clockwise from north, 0..360) and distance in km from point 1 to point 2, flat earth. */
export function bearingKm(lat1, lon1, lat2, lon2) {
  const dy = (lat2 - lat1) * KM_PER_DEG_LAT, dx = (lon2 - lon1) * kmPerDegLon((lat1 + lat2) / 2);
  return { bearing: ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360, km: Math.hypot(dx, dy) };
}

/** Sector, ring and distance of every cell of the domain, from the mine. Ring -1 lies inside the first ring edge or
 * beyond the last one. */
export function geometry(mine, dom, { n = VEG.sectors, rings = VEG.rings } = {}) {
  const e = dom.extent, dy = (e.n - e.s) / dom.h, dx = (e.e - e.w) / dom.w, N = dom.w * dom.h;
  const sector = new Int8Array(N), ring = new Int8Array(N).fill(-1), km = new Float32Array(N);
  for (let r = 0; r < dom.h; r++) {
    const lat = e.n - (r + 0.5) * dy;
    for (let c = 0; c < dom.w; c++) {
      const i = r * dom.w + c, b = bearingKm(mine.lat, mine.lon, lat, e.w + (c + 0.5) * dx);
      sector[i] = sectorOf(b.bearing, n); km[i] = b.km; ring[i] = ringOf(b.km, rings);
    }
  }
  return { sector, ring, km };
}
export function ringOf(km, rings = VEG.rings) {
  for (let k = 0; k + 1 < rings.length; k++) if (km >= rings[k] && km < rings[k + 1]) return k;
  return -1;
}

/** Share of dust-carrying hours (speed >= onset) by the sector the wind blows toward, weighted by speed; sums to 1,
 * or all zero when no hour carries dust. */
export function windRose(speeds, dirs, { n = VEG.sectors, onset = VEG.onset } = {}) {
  const out = new Float32Array(n);
  let sum = 0;
  for (let h = 0; h < speeds.length; h++) {
    const u = speeds[h], d = dirs[h];
    if (!Number.isFinite(u) || !Number.isFinite(d) || u < onset) continue;
    out[sectorOf((d + 180) % 360, n)] += u; sum += u;
  }
  if (sum > 0) for (let s = 0; s < n; s++) out[s] /= sum;
  return out;
}

/** Mean NDVI of the vegetation pixels of every sector and ring (index sector * rings + ring); NaN under minPixels. */
export function sectorRingStats(ndvi, veg, geo, { n = VEG.sectors, rings = VEG.rings, minPixels = VEG.minPixels } = {}) {
  const nr = rings.length - 1, sum = new Float64Array(n * nr), count = new Int32Array(n * nr);
  for (let i = 0; i < ndvi.length; i++) {
    const r = geo.ring[i];
    if (r < 0 || !veg[i] || !Number.isFinite(ndvi[i])) continue;
    const k = geo.sector[i] * nr + r;
    sum[k] += ndvi[i]; count[k]++;
  }
  const mean = new Float32Array(n * nr).fill(NaN);
  for (let k = 0; k < n * nr; k++) if (count[k] >= minPixels) mean[k] = sum[k] / count[k];
  return { mean, count };
}

/** How many sectors of the inner ring hold enough vegetation to be measured: under half, the mine stands in ground too
 * bare for this method, and "no mark" would mean "no measurement". */
export function innerRingCells(stats, nr) {
  let k = 0;
  for (let s = 0; s * nr < stats.mean.length; s++) if (Number.isFinite(stats.mean[s * nr])) k++;
  return k;
}

function median(values) {
  const a = values.filter(Number.isFinite).sort((x, y) => x - y);
  if (!a.length) return NaN;
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

/** Each sector's departure from the median of its ring, and the ring's noise: the median absolute deviation, with a
 * threshold of madK times it, never under minThr. */
export function deficits(stats, nr, { minThr = VEG.minThr, madK = VEG.madK } = {}) {
  const n = stats.mean.length / nr;
  const ringMedian = new Float32Array(nr), mad = new Float32Array(nr), thr = new Float32Array(nr), deficit = new Float32Array(n * nr).fill(NaN);
  for (let r = 0; r < nr; r++) {
    const means = []; for (let s = 0; s < n; s++) means.push(stats.mean[s * nr + r]);
    ringMedian[r] = median(means);
    mad[r] = median(means.map((m) => Math.abs(m - ringMedian[r])));
    thr[r] = Math.max(minThr, madK * (Number.isFinite(mad[r]) ? mad[r] : 0));
    for (let s = 0; s < n; s++) deficit[s * nr + r] = stats.mean[s * nr + r] - ringMedian[r];
  }
  return { ringMedian, mad, thr, deficit };
}

/** How far each sector's mark reaches: the outer edge of the last ring, counted from the inside without a gap, whose
 * deficit is at or under minus the ring's threshold; 0 when the inner ring carries no mark. */
export function reaches(def, { n = VEG.sectors, rings = VEG.rings } = {}) {
  const nr = rings.length - 1, out = new Float32Array(n);
  for (let s = 0; s < n; s++) {
    for (let r = 0; r < nr; r++) {
      const d = def.deficit[s * nr + r];
      if (!(d <= -def.thr[r])) break;
      out[s] = rings[r + 1];
    }
  }
  return out;
}

/** 0 clear, 1 unclear, 2 dusty: a mark where the wind blows is dusty; a mark without wind, or wind without a mark, is
 * unclear. */
export function classify(reach, rose, n = VEG.sectors) {
  const out = new Uint8Array(n), one = 1 / n;
  for (let s = 0; s < n; s++) {
    if (reach[s] > 0) out[s] = rose[s] >= one ? 2 : 1;
    else out[s] = rose[s] >= 2 * one ? 1 : 0;
  }
  return out;
}

/** Spearman rank correlation over the pairs where both values are finite; NaN with fewer than four pairs. */
export function spearman(a, b) {
  const pairs = [];
  for (let i = 0; i < a.length; i++) if (Number.isFinite(a[i]) && Number.isFinite(b[i])) pairs.push([a[i], b[i]]);
  if (pairs.length < 4) return NaN;
  const rank = (vals) => {
    const idx = vals.map((v, i) => i).sort((i, j) => vals[i] - vals[j]), out = new Array(vals.length);
    for (let k = 0; k < idx.length;) {
      let m = k; while (m + 1 < idx.length && vals[idx[m + 1]] === vals[idx[k]]) m++;
      for (let q = k; q <= m; q++) out[idx[q]] = (k + m) / 2 + 1;
      k = m + 1;
    }
    return out;
  };
  const ra = rank(pairs.map((p) => p[0])), rb = rank(pairs.map((p) => p[1])), m = pairs.length;
  const ma = ra.reduce((x, y) => x + y, 0) / m, mb = rb.reduce((x, y) => x + y, 0) / m;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < m; i++) { sab += (ra[i] - ma) * (rb[i] - mb); saa += (ra[i] - ma) ** 2; sbb += (rb[i] - mb) ** 2; }
  return saa && sbb ? sab / Math.sqrt(saa * sbb) : NaN;
}

/** Area in km2 of the dusty sectors inside their reach, from the first ring edge. */
export function footprintKm2(reach, cls, { rings = VEG.rings, n = VEG.sectors } = {}) {
  let out = 0;
  for (let s = 0; s < n; s++) if (cls[s] === 2 && reach[s] > rings[0]) out += (Math.PI * (reach[s] ** 2 - rings[0] ** 2)) / n;
  return out;
}

/** Camps that lie in a dusty sector, inside its reach and beyond the first ring edge. */
export function campsExposed(camps, mine, reach, cls, n = VEG.sectors, rings = VEG.rings) {
  const points = [];
  let parcels = 0, herders = 0;
  for (const c of camps ?? []) {
    const b = bearingKm(mine.lat, mine.lon, c.lat, c.lon), s = sectorOf(b.bearing, n);
    if (cls[s] !== 2 || b.km < rings[0] - 1e-6 || b.km > reach[s] + 1e-6) continue; // a metre of slack: the edges are rounded km
    points.push({ ...c, sector: s, km: b.km }); parcels += c.parcels ?? 0; herders += c.herders ?? 0;
  }
  return { parcels, herders, points };
}

/** Camps in one sector inside its reach, whatever its class: the hour view of the wind. */
export function campsInSector(camps, mine, sector, reachKm, n = VEG.sectors, rings = VEG.rings) {
  const cls = new Uint8Array(n), reach = new Float32Array(n);
  cls[sector] = 2; reach[sector] = Math.max(reachKm, 0);
  return campsExposed(camps, mine, reach, cls, n, rings);
}

/** NDVI of each vegetation pixel minus the median of its ring, for the map; NaN elsewhere. */
export function anomalyGrid(ndvi, veg, geo, ringMedian) {
  const out = new Float32Array(ndvi.length).fill(NaN);
  for (let i = 0; i < ndvi.length; i++) {
    const r = geo.ring[i];
    if (r < 0 || !veg[i] || !Number.isFinite(ndvi[i]) || !Number.isFinite(ringMedian[r])) continue;
    out[i] = ndvi[i] - ringMedian[r];
  }
  return out;
}
