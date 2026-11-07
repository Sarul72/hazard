/* Dust-plume model for a fixed source (a mine). Pure functions, no DOM, usable in Node tests.
 *
 * Method: Lagrangian Gaussian puffs.
 *  - A puff is released from the source every `dtMin` minutes.
 *  - Each puff is carried by the hourly 10 m wind interpolated in space and time (Open-Meteo, ERA5 or forecast model).
 *  - Its horizontal spread grows with the distance travelled: Briggs (1973) open-country curve for neutral
 *    air (class D), sigma_y = 0.11 x / sqrt(1 + 0.0001 x), plus a 150 m source size.
 *  - Coarse dust settles out. With `material`, as in AERMOD deposition Method 1, each puff carries size bins and every bin
 *    settles at its own Stokes speed, which depends on particle size and density (see settlingVelocity, depositionRate).
 *    Without `material` the puff mass decays with a fixed time constant `tauH` hours.
 *  - Ground-level index = sum of the puffs' 2-D Gaussian footprints (vertically well mixed).
 *
 * The result is a RELATIVE index, not a concentration in ug/m3: the emission rate of a real mine is not
 * known. It is shown as a percentage of the strongest spot more than 3 km from the source during the run.
 * See docs/METHODS.md for the assumptions and the worst-case checks. */
import { KM_PER_DEG_LAT, kmPerDegLon } from "./geo.js";

export const SIGMA0_M = 150;
export const CALM_MS = 0.3;

const fin = (v) => typeof v === "number" && Number.isFinite(v);

/** Wind components (east, north) in m/s of the air flow, from speed and the meteorological direction the wind blows FROM. */
export function windVec(speed, dirFromDeg) {
  const r = (dirFromDeg * Math.PI) / 180;
  return [-speed * Math.sin(r), -speed * Math.cos(r)];
}

/** Direction the air moves TOWARD, in degrees clockwise from north. */
export function toward(dirFromDeg) { return (dirFromDeg + 180) % 360; }

/** Horizontal spread (m) after travelling xMeters. `spreadDeg` adds an angular wind-direction uncertainty
 * (hourly model winds are typically 10-30 degrees off), added in quadrature so the mass stays conserved. */
export function sigmaY(xMeters, spreadDeg = 0) {
  const x = Math.max(0, xMeters);
  return Math.hypot(SIGMA0_M, (0.11 * x) / Math.sqrt(1 + 0.0001 * x), x * Math.tan((spreadDeg * Math.PI) / 180));
}

/* Size bins from the particle size multipliers of US EPA AP-42 13.2.4: 0.74 below 30 um, 0.48 below 15, 0.35 below 10,
 * 0.20 below 5, 0.053 below 2.5. Mass fraction of each bin among particles below 30 um, at the geometric middle of the bin.
 * AP-42 gives aerodynamic sizes; here they are read as physical sizes shared by all materials, so that a denser mineral
 * of the same crushed size falls faster. That is an assumption: no measured distribution of Mongolian mine dust was found. */
export const SIZE_BINS = [
  { d: 1.6, f: 0.053 / 0.74 }, { d: 3.5, f: (0.2 - 0.053) / 0.74 }, { d: 7.1, f: (0.35 - 0.2) / 0.74 },
  { d: 12.2, f: (0.48 - 0.35) / 0.74 }, { d: 21.2, f: (0.74 - 0.48) / 0.74 },
];
const AIR_VISCOSITY = 1.8e-5, AIR_DENSITY = 1.2, GRAVITY = 9.81, MEAN_FREE_PATH_UM = 0.066;
const MIXED_LAYER_M = 1000, SOURCE_SIGMA_Z_M = 10;

/** Stokes settling speed in m/s with the Cunningham slip correction (the Vg of AERMOD Method 1). dUm in um, rho in g/cm3. */
export function settlingVelocity(dUm, rho) {
  const kn = (2 * MEAN_FREE_PATH_UM) / dUm;
  const slip = 1 + kn * (1.257 + 0.4 * Math.exp(-1.1 / kn));
  return ((rho * 1000 - AIR_DENSITY) * GRAVITY * (dUm * 1e-6) ** 2 * slip) / (18 * AIR_VISCOSITY);
}

/** Vertical spread (m) after xMeters: Briggs open-country class D, from a 10 m source, capped when the layer is well mixed. */
export function sigmaZ(xMeters) {
  const x = Math.max(0, xMeters);
  return Math.min(Math.hypot(SOURCE_SIGMA_Z_M, (0.06 * x) / Math.sqrt(1 + 0.0015 * x)), MIXED_LAYER_M * Math.sqrt(2 / Math.PI));
}

/** Share of the airborne mass lost per second: the surface concentration of a half-Gaussian column is sqrt(2/pi)/sigma_z of its
 * mass per square metre, and the ground takes up vg times that (source depletion, Chamberlain). */
export function depositionRate(vg, xMeters) { return (vg * Math.sqrt(2 / Math.PI)) / sigmaZ(xMeters); }

/** Share of the emitted mass still airborne after xMeters at a steady wind u. */
export function airborneShare(rho, xMeters, u) {
  const steps = 400, dx = xMeters / steps;
  return SIZE_BINS.reduce((sum, b) => {
    const vg = settlingVelocity(b.d, rho);
    let loss = 0;
    for (let i = 0; i < steps; i++) loss += (depositionRate(vg, (i + 0.5) * dx) * dx) / u;
    return sum + b.f * Math.exp(-loss);
  }, 0) / SIZE_BINS.reduce((sum, b) => sum + b.f, 0);
}

/** Distance in km at which half of the emitted mass has reached the ground, or null beyond maxKm. */
export function halfDepositionKm(rho, u, maxKm = 500) {
  if (airborneShare(rho, maxKm * 1000, u) > 0.5) return null;
  let lo = 0, hi = maxKm;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (airborneShare(rho, mid * 1000, u) > 0.5) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Relative emission factor for wind speed u (m/s): dust lift grows steeply with wind speed (cube law above calm). */
export function emissionFactor(u) { return fin(u) ? Math.min(20, 0.2 + (u / 6) ** 3) : 0.2; }

/**
 * Wind field from Open-Meteo hourly results.
 * `grid` is makeGrid()-style {lats, lons, ny, nx}; `results[k]` (k = iy*nx+ix) holds
 * {time, wind_speed_10m (m/s), wind_direction_10m (deg), wind_gusts_10m?}.
 */
export function buildField(grid, results) {
  const { ny, nx } = grid;
  const n = results[0].time.length;
  const u = new Float32Array(n * ny * nx).fill(NaN), v = new Float32Array(n * ny * nx).fill(NaN);
  const spd = new Float32Array(n * ny * nx).fill(NaN);
  for (let k = 0; k < results.length; k++) {
    const r = results[k];
    for (let h = 0; h < n; h++) {
      const s = r.wind_speed_10m[h], d = r.wind_direction_10m[h];
      if (!fin(s) || !fin(d)) continue;
      const [uu, vv] = windVec(s, d);
      u[h * ny * nx + k] = uu; v[h * ny * nx + k] = vv; spd[h * ny * nx + k] = s;
    }
  }
  return { ...grid, hours: n, time: results[0].time, u, v, spd };
}

/** Wind (east, north) at fractional hour `tH` (0..hours-1) and a location. Returns null when no node has data. */
export function windAt(field, tH, lat, lon) {
  const { lats, lons, ny, nx, hours } = field;
  const t = Math.min(Math.max(tH, 0), hours - 1);
  const h0 = Math.min(Math.floor(t), hours - 2 < 0 ? 0 : hours - 2), h1 = Math.min(h0 + 1, hours - 1), ft = t - h0;
  const fy = Math.min(Math.max((lat - lats[0]) / (lats[1] - lats[0]), 0), ny - 1);
  const fx = Math.min(Math.max((lon - lons[0]) / (lons[1] - lons[0]), 0), nx - 1);
  const y0 = Math.min(Math.floor(fy), ny - 2), x0 = Math.min(Math.floor(fx), nx - 2);
  const ty = fy - y0, tx = fx - x0;
  let au = 0, av = 0, ws = 0;
  for (const [dy, dx, wt] of [[0, 0, (1 - ty) * (1 - tx)], [0, 1, (1 - ty) * tx], [1, 0, ty * (1 - tx)], [1, 1, ty * tx]]) {
    if (wt <= 0) continue;
    const k = (y0 + dy) * nx + (x0 + dx);
    for (const [hh, wh] of [[h0, 1 - ft], [h1, ft]]) {
      if (wh <= 0) continue;
      const uu = field.u[hh * ny * nx + k], vv = field.v[hh * ny * nx + k];
      if (!fin(uu) || !fin(vv)) continue;
      au += uu * wt * wh; av += vv * wt * wh; ws += wt * wh;
    }
  }
  return ws > 0 ? [au / ws, av / ws] : null;
}

/**
 * Run the puff model. Returns { snaps } where snaps[h] is the puff cloud at the start of hour h (h = 0..hours-1),
 * each snap = { n, lat, lon, q, x, sp } (typed arrays).
 */
export function simulate({ source, field, dtMin = 3, tauH = 6, emission = emissionFactor, spreadDeg = 0, rho = null }) {
  const dt = dtMin * 60, steps = Math.round(3600 / dt);
  const tauS = tauH * 3600, maxAge = rho === null ? 5 * tauS : 24 * 3600;
  const vg = rho === null ? null : SIZE_BINS.map((b) => settlingVelocity(b.d, rho));
  const share = SIZE_BINS.reduce((a, b) => a + b.f, 0);
  const snaps = [];
  let P = []; // {lat, lon, q, x, sp, age}
  for (let h = 0; h < field.hours; h++) {
    snaps.push(snapshot(P, spreadDeg));
    for (let s = 0; s < steps; s++) {
      const tH = h + s / steps;
      const w0 = windAt(field, tH, source.lat, source.lon);
      if (w0) {
        const sp = Math.hypot(w0[0], w0[1]);
        const q = emission(sp) * dt;
        P.push({ lat: source.lat, lon: source.lon, q, q0: q, bins: vg && SIZE_BINS.map((b) => (b.f / share) * q), x: 0, sp: Math.max(sp, CALM_MS) * dt, age: 0 });
      }
      const decay = Math.exp(-dt / tauS);
      for (const p of P) {
        const w = windAt(field, tH, p.lat, p.lon);
        if (w) {
          p.lat += (w[1] * dt) / (KM_PER_DEG_LAT * 1000);
          p.lon += (w[0] * dt) / (kmPerDegLon(p.lat) * 1000);
          p.x += Math.hypot(w[0], w[1]) * dt;
        }
        if (vg) {
          let q = 0;
          for (let b = 0; b < vg.length; b++) { p.bins[b] *= Math.exp(-depositionRate(vg[b], p.x) * dt); q += p.bins[b]; }
          p.q = q;
        } else p.q *= decay;
        p.age += dt;
      }
      P = P.filter((p) => p.age < maxAge);
    }
  }
  return { snaps, field };
}

function snapshot(P, spreadDeg) {
  const n = P.length;
  const out = { n, spreadDeg, lat: new Float64Array(n), lon: new Float64Array(n), q: new Float64Array(n), q0: new Float64Array(n), x: new Float64Array(n), sp: new Float64Array(n) };
  P.forEach((p, i) => { out.lat[i] = p.lat; out.lon[i] = p.lon; out.q[i] = p.q; out.q0[i] = p.q0; out.x[i] = p.x; out.sp[i] = p.sp; });
  return out;
}

/** Puff widths: neutral-air spread, but never narrower than a third of the release spacing (avoids a beaded trail). */
const sig = (snap, i) => Math.max(sigmaY(snap.x[i], snap.spreadDeg || 0), 0.35 * snap.sp[i]);

/** Index at one point. */
export function concAt(snap, lat, lon) {
  const kx = kmPerDegLon(lat) * 1000, ky = KM_PER_DEG_LAT * 1000;
  let c = 0;
  for (let i = 0; i < snap.n; i++) {
    const dx = (lon - snap.lon[i]) * kx, dy = (lat - snap.lat[i]) * ky;
    const s = sig(snap, i), r2 = dx * dx + dy * dy;
    if (r2 > 16 * s * s) continue;
    c += (snap.q[i] / (2 * Math.PI * s * s)) * Math.exp(-r2 / (2 * s * s));
  }
  return c;
}

/** Index on a w x h raster covering `extent` {s, w, n, e}; rows run north to south. With `emitted`, the mass as released, before
 * settling: a scale built on it stays the same for every material, so that a heavy mineral really shows a smaller plume. */
export function concGrid(snap, extent, w, h, emitted = false) {
  const out = new Float32Array(w * h);
  const latMid = (extent.n + extent.s) / 2;
  const kx = kmPerDegLon(latMid) * 1000, ky = KM_PER_DEG_LAT * 1000;
  const dLon = (extent.e - extent.w) / w, dLat = (extent.n - extent.s) / h;
  for (let i = 0; i < snap.n; i++) {
    const s = sig(snap, i), reach = 4 * s;
    const c0 = Math.max(0, Math.floor((snap.lon[i] - reach / kx - extent.w) / dLon)), c1 = Math.min(w - 1, Math.ceil((snap.lon[i] + reach / kx - extent.w) / dLon));
    const r0 = Math.max(0, Math.floor((extent.n - (snap.lat[i] + reach / ky)) / dLat)), r1 = Math.min(h - 1, Math.ceil((extent.n - (snap.lat[i] - reach / ky)) / dLat));
    if (c0 > c1 || r0 > r1) continue;
    const a = (emitted ? snap.q0[i] : snap.q[i]) / (2 * Math.PI * s * s);
    for (let r = r0; r <= r1; r++) {
      const dy = (extent.n - (r + 0.5) * dLat - snap.lat[i]) * ky;
      for (let c = c0; c <= c1; c++) {
        const dx = (extent.w + (c + 0.5) * dLon - snap.lon[i]) * kx;
        const r2 = dx * dx + dy * dy;
        if (r2 <= 16 * s * s) out[r * w + c] += a * Math.exp(-r2 / (2 * s * s));
      }
    }
  }
  return out;
}

/** Reference value for the 0..100 scale: the strongest raster value >= minKm from the source over all frames. */
export function referenceMax(frames, extent, w, h, source, minKm = 3) {
  const kx = kmPerDegLon(source.lat), ky = KM_PER_DEG_LAT;
  const dLon = (extent.e - extent.w) / w, dLat = (extent.n - extent.s) / h;
  let ref = 0;
  for (const f of frames) {
    for (let r = 0; r < h; r++) {
      const dy = (extent.n - (r + 0.5) * dLat - source.lat) * ky;
      for (let c = 0; c < w; c++) {
        const dx = (extent.w + (c + 0.5) * dLon - source.lon) * kx;
        if (dx * dx + dy * dy < minKm * minKm) continue;
        const v = f[r * w + c]; if (v > ref) ref = v;
      }
    }
  }
  return ref;
}

export const PLUME_CLASSES = [
  { key: "p_none", min: 0, max: 2, color: null },
  { key: "p_low", min: 2, max: 10, color: "#f2e24a" },
  { key: "p_moderate", min: 10, max: 35, color: "#f29a2e" },
  { key: "p_high", min: 35, max: 70, color: "#e0412b" },
  { key: "p_very_high", min: 70, max: Infinity, color: "#8e1b6b" },
];
export function plumeClass(index) { return PLUME_CLASSES.find((c) => index >= c.min && index < c.max) || PLUME_CLASSES[0]; }

/** Peak index of many points from the frames already drawn: [index 0..100 for each {lat, lon}]. */
export function peakFromFrames(frames, extent, w, h, points, ref) {
  const dLon = (extent.e - extent.w) / w, dLat = (extent.n - extent.s) / h;
  const peak = new Float32Array(w * h);
  for (const f of frames) for (let i = 0; i < peak.length; i++) if (f[i] > peak[i]) peak[i] = f[i];
  return points.map((p) => {
    const c = Math.floor((p.lon - extent.w) / dLon), r = Math.floor((extent.n - p.lat) / dLat);
    if (c < 0 || c >= w || r < 0 || r >= h || !(ref > 0)) return 0;
    return Math.min(100, (100 * peak[r * w + c]) / ref);
  });
}

/** Peak exposure of fixed points (households): [{ idx, index (0..100, relative), hour }]. */
export function exposure(snaps, points, ref) {
  return points.map((pt, idx) => {
    let best = 0, hour = -1;
    for (let h = 0; h < snaps.length; h++) {
      const c = concAt(snaps[h], pt.lat, pt.lon);
      if (c > best) { best = c; hour = h; }
    }
    return { idx, index: ref > 0 ? Math.min(100, (100 * best) / ref) : 0, hour };
  });
}
