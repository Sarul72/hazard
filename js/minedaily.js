/* Dust from the mine alone, day by day, on a 100 m grid. Pure functions, no DOM, so the tests can run them.
 *
 * Satellites see all the dust in the air together; only a transport model can tell the part that comes from the mine.
 * The puff model of js/plume.js is run with:
 *  - the release spread over the pit outline (an area source) instead of one point;
 *  - hourly wind at about 9 km (ERA5-Land for the archive, ECMWF IFS for recent days) on nodes 0.1 degree apart;
 *  - an emission that follows the hour: haul roads, loading and dumping (AP-42 13.2.4 wind term) whenever the ground is dry
 *    and free of snow, plus wind erosion of the bare pit and dumps above 6 m/s, the dust onset used on the rest of the site;
 *    rain of 0.254 mm in the hour (AP-42 13.2.2), wet topsoil or snow stop both.
 * Each day is the mean of the ground-level index over 48 half-hour snapshots of that day, on one scale for the whole
 * period: 100 = the strongest daily value found more than 3 km from the pit. It is a RELATIVE index, not ug/m3: the
 * mine's emission rate is not public. */
import { KM_PER_DEG_LAT, kmPerDegLon, pointInPolygon } from "./geo.js";
import { concGrid } from "./plume.js";

export const DAILY = {
  radiusKm: 30, cellM: 100, nodes: 7, nodeDeg: 0.1, onset: 6, wetMm: 0.254, wetSoil: 0.25, snowM: 0.01,
  dtMin: 5, snapMin: 30, maxAgeH: 8, sources: 12, spinupH: 8, minIndex: 5, nearKm: 3,
};

/** AP-42 13.2.4 wind term for material handling, relative. */
const handling = (u) => (Math.max(u, 0.5) / 2.2) ** 1.3;

/** Relative emission of the mine in one hour, from the 10 m wind (m/s), rain (mm in the hour), topsoil water (m3/m3)
 * and snow depth (m). Below the onset only handling emits; above it wind erosion of bare ground adds a term that grows
 * with the cube of the wind and starts from zero at the onset. */
export function mineEmission(u, rainMm = 0, soil = null, snowM = 0) {
  if (!(u >= 0)) return 0;
  if (rainMm >= DAILY.wetMm || (soil !== null && soil >= DAILY.wetSoil) || snowM >= DAILY.snowM) return 0;
  const erosion = u > DAILY.onset ? handling(DAILY.onset) * ((u / DAILY.onset) ** 3 - 1) : 0;
  return handling(u) + erosion;
}

/** Up to `n` release points spread evenly inside a polygon ring [[lon, lat], ...], or around a point when there is none. */
export function pitPoints(ring, n = DAILY.sources, fallback = null) {
  if (!ring) {
    const { lat, lon } = fallback, r = 1.5 / KM_PER_DEG_LAT, out = [{ lat, lon }];
    for (let k = 0; out.length < n; k++) {
      const a = (2 * Math.PI * k) / (n - 1);
      out.push({ lat: lat + r * Math.sin(a), lon: lon + (r * KM_PER_DEG_LAT * Math.cos(a)) / kmPerDegLon(lat) });
    }
    return out;
  }
  const poly = ring.map(([x, y]) => [y, x]); // pointInPolygon wants [lat, lon]
  const lats = ring.map((p) => p[1]), lons = ring.map((p) => p[0]);
  const s = Math.min(...lats), nn = Math.max(...lats), w = Math.min(...lons), e = Math.max(...lons);
  for (let k = Math.ceil(Math.sqrt(n)); k < 60; k++) {
    const out = [];
    for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) {
      const lat = s + ((i + 0.5) / k) * (nn - s), lon = w + ((j + 0.5) / k) * (e - w);
      if (pointInPolygon(lat, lon, poly)) out.push({ lat, lon });
    }
    if (out.length >= n) {
      const step = out.length / n; // keep n of them, spread along the grid
      return Array.from({ length: n }, (_, i) => out[Math.floor(i * step)]);
    }
  }
  return pitPoints(null, n, { lat: (s + nn) / 2, lon: (w + e) / 2 });
}

/** The square raster of the domain: about `radiusKm` around the mine at `cellM` metres. */
export function domain(lat, lon, radiusKm = DAILY.radiusKm, cellM = DAILY.cellM) {
  const dLat = radiusKm / KM_PER_DEG_LAT, dLon = radiusKm / kmPerDegLon(lat), n = Math.round((2 * radiusKm * 1000) / cellM);
  return { extent: { s: lat - dLat, n: lat + dLat, w: lon - dLon, e: lon + dLon }, w: n, h: n };
}

/** Mean ground-level index of a set of snapshots on the domain raster. */
export function doseGrid(snaps, dom) {
  const out = new Float32Array(dom.w * dom.h);
  for (const s of snaps) {
    const g = concGrid(s, dom.extent, dom.w, dom.h);
    for (let i = 0; i < out.length; i++) out[i] += g[i];
  }
  if (snaps.length) for (let i = 0; i < out.length; i++) out[i] /= snaps.length;
  return out;
}

/** Distance in km of each raster cell from the nearest release point, for the "more than 3 km away" rule. */
export function distanceFrom(points, dom) {
  const { extent: e, w, h } = dom, lat0 = (e.n + e.s) / 2, kx = kmPerDegLon(lat0), ky = KM_PER_DEG_LAT;
  const dLon = (e.e - e.w) / w, dLat = (e.n - e.s) / h, out = new Float32Array(w * h).fill(Infinity);
  for (let r = 0; r < h; r++) {
    const lat = e.n - (r + 0.5) * dLat;
    for (let c = 0; c < w; c++) {
      const lon = e.w + (c + 0.5) * dLon;
      let best = Infinity;
      for (const p of points) { const dx = (lon - p.lon) * kx, dy = (lat - p.lat) * ky, d = dx * dx + dy * dy; if (d < best) best = d; }
      out[r * w + c] = Math.sqrt(best);
    }
  }
  return out;
}

/** The scale of the period: the strongest daily value more than `nearKm` from the pit. */
export function periodScale(doses, dist, nearKm = DAILY.nearKm) {
  let ref = 0;
  for (const d of doses) for (let i = 0; i < d.length; i++) if (dist[i] > nearKm && d[i] > ref) ref = d[i];
  return ref;
}

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

/** Numbers of one day on the period scale: direction the dust went (index-weighted centre beyond 3 km, as a bearing
 * from the mine), farthest reach and area at or above `minIndex` percent, and the strongest value beyond 3 km. */
export function dayStats(dose, dist, dom, mine, ref, minIndex = DAILY.minIndex) {
  const { extent: e, w, h } = dom, kx = kmPerDegLon(mine.lat), ky = KM_PER_DEG_LAT;
  const dLon = (e.e - e.w) / w, dLat = (e.n - e.s) / h, cellKm2 = (dLon * kx) * (dLat * ky);
  let sx = 0, sy = 0, sw = 0, reach = 0, area = 0, peak = 0, edge = false;
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
    const i = r * w + c, v = ref > 0 ? (100 * dose[i]) / ref : 0;
    if (dist[i] > DAILY.nearKm) {
      if (v > peak) peak = v;
      const dx = (e.w + (c + 0.5) * dLon - mine.lon) * kx, dy = (e.n - (r + 0.5) * dLat - mine.lat) * ky;
      sx += v * dx; sy += v * dy; sw += v;
      if (v >= minIndex) {
        area += cellKm2;
        const d = Math.hypot(dx, dy);
        if (d > reach) reach = d;
        if (r === 0 || c === 0 || r === h - 1 || c === w - 1) edge = true;
      }
    }
  }
  const bearing = sw > 0 ? ((Math.atan2(sx, sy) * 180) / Math.PI + 360) % 360 : null;
  return { bearing, dir: bearing === null ? null : COMPASS[Math.round(bearing / 45) % 8], reach, area, peak: Math.min(peak, 100), edge };
}

/** Local days (YYYY-MM-DD) from a start day, `n` of them. */
export function dayList(start, n) {
  return Array.from({ length: n }, (_, i) => new Date(Date.parse(start + "T00:00:00Z") + i * 86400000).toISOString().slice(0, 10));
}
