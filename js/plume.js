/* Dust-plume model for a fixed source (a mine). Pure functions, no DOM, usable in Node tests.
 *
 * Method: Lagrangian Gaussian puffs.
 *  - A puff is released from the source every `dtMin` minutes.
 *  - Each puff is carried by the hourly 10 m wind interpolated in space and time (Open-Meteo, ERA5 or forecast model).
 *  - Its spread grows with the distance travelled, along the Briggs (1973) open-country curves of the stability class of each
 *    hour, plus a 150 m source size. The class comes from wind and solar radiation (US EPA SRDT table), so a clear night holds
 *    dust near the ground and a sunny afternoon mixes it upward. Without weather data the air is taken as neutral (class D).
 *  - Rain stops the emission (AP-42 13.2.2) and washes dust out of the air (CALPUFF scavenging coefficient).
 *  - Coarse dust settles out. With `material`, as in AERMOD deposition Method 1, each puff carries size bins and every bin
 *    settles at its own Stokes speed, which depends on particle size and density (see settlingVelocity, depositionRate).
 *    Without `material` the puff mass decays with a fixed time constant `tauH` hours.
 *  - Ground-level index = sum of the puffs' Gaussian footprints at the surface: mass / (2 pi sigma_y^2) times the surface share
 *    of the column, sqrt(2/pi) / sigma_z, which stops falling once the dust fills the mixed layer.
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

/* Briggs (1973) open-country curves, A very unstable to F very stable. */
const BRIGGS_Y = { A: 0.22, B: 0.16, C: 0.11, D: 0.08, E: 0.06, F: 0.04 };
const briggsY = (x, cls) => (BRIGGS_Y[cls] * x) / Math.sqrt(1 + 0.0001 * x);
const BRIGGS_Z = {
  A: (x) => 0.2 * x, B: (x) => 0.12 * x, C: (x) => (0.08 * x) / Math.sqrt(1 + 0.0002 * x), D: (x) => (0.06 * x) / Math.sqrt(1 + 0.0015 * x),
  E: (x) => (0.03 * x) / (1 + 0.0003 * x), F: (x) => (0.016 * x) / (1 + 0.0003 * x),
};

/** Stability class from 10 m wind (m/s) and solar radiation (W/m2): Table 6-7 of US EPA-454/R-99-005 (SRDT). That table reads the
 * night from a temperature gradient, which is not available here, so the cloud rule of Turner stands in: clear (up to 3/8) is stable. */
export function stabilityClass(wind, solar, cloudPct) {
  if (!fin(wind)) return "D";
  if (fin(solar) && solar > 0) {
    const row = wind < 2 ? "AABD" : wind < 3 ? "ABCD" : wind < 5 ? "BBCD" : wind < 6 ? "CCDD" : "CDDD";
    return row[solar >= 925 ? 0 : solar >= 675 ? 1 : solar >= 175 ? 2 : 3];
  }
  const clear = !fin(cloudPct) || cloudPct <= 37.5;
  if (wind < 2) return clear ? "F" : "E";
  if (wind < 2.5) return clear ? "E" : "D";
  return "D";
}

/** Horizontal spread (m) after travelling xMeters. `spreadDeg` adds an angular wind-direction uncertainty
 * (hourly model winds are typically 10-30 degrees off), added in quadrature so the mass stays conserved. */
export function sigmaY(xMeters, spreadDeg = 0, cls = "D") {
  const x = Math.max(0, xMeters);
  return Math.hypot(SIGMA0_M, briggsY(x, cls), x * Math.tan((spreadDeg * Math.PI) / 180));
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

const zCap = (mixedM) => mixedM * Math.sqrt(2 / Math.PI);

/** Vertical spread (m) after xMeters: Briggs open-country curve, from a 10 m source, capped when the layer is well mixed. */
export function sigmaZ(xMeters, cls = "D", mixedM = MIXED_LAYER_M) {
  const x = Math.max(0, xMeters);
  return Math.min(Math.hypot(SOURCE_SIGMA_Z_M, BRIGGS_Z[cls](x)), zCap(mixedM));
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

const WET_MM = 0.254; // AP-42 13.2.2: a period with this much rain gives no dust
const WASHOUT = { rain: 1e-4, snow: 3e-5 }; // CALPUFF defaults for PM10, per second at 1 mm/h

/** Relative emission for wind speed u (m/s) and rain (mm in the hour): the wind term (U / 2.2)^1.3 of AP-42 13.2.4 for material
 * handling. Pits and haul roads also emit without wind, which this share of the mine leaves out. */
export function emissionFactor(u, rainMm = 0) {
  if (fin(rainMm) && rainMm >= WET_MM) return 0;
  return (Math.max(fin(u) ? u : 0, 0.5) / 2.2) ** 1.3;
}

/** The hourly weather of the source as the model needs it. `h` holds Open-Meteo arrays, `wind` the speed at the source. */
export function buildMet(h, wind) {
  return {
    cls: wind.map((u, i) => stabilityClass(u, h.shortwave_radiation?.[i], h.cloud_cover?.[i])),
    rain: wind.map((_, i) => (fin(h.precipitation?.[i]) ? h.precipitation[i] : 0)),
    frozen: wind.map((_, i) => fin(h.temperature_2m?.[i]) && h.temperature_2m[i] < 0),
    zi: wind.map((_, i) => (fin(h.boundary_layer_height?.[i]) ? Math.max(h.boundary_layer_height[i], 100) : MIXED_LAYER_M)),
  };
}

/** The same wind turned clockwise by `deg` and scaled, to see how far the result leans on the wind. */
export function shiftField(field, deg, scale) {
  const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  const u = field.u.map((a, i) => scale * (a * c + field.v[i] * s)), v = field.v.map((b, i) => scale * (b * c - field.u[i] * s));
  return { ...field, u, v, spd: field.spd.map((a) => a * scale) };
}

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
export function simulate({ source, field, dtMin = 3, tauH = 6, emission = emissionFactor, spreadDeg = 0, rho = null, met = null }) {
  const dt = dtMin * 60, steps = Math.round(3600 / dt);
  const tauS = tauH * 3600, maxAge = rho === null ? 5 * tauS : 24 * 3600;
  const vg = rho === null ? null : SIZE_BINS.map((b) => settlingVelocity(b.d, rho));
  const share = SIZE_BINS.reduce((a, b) => a + b.f, 0);
  const snaps = [];
  let P = []; // {lat, lon, q, x, sp, age, vy, vz}: vy and vz are the variances of the puff, which grow with the air of each hour
  for (let h = 0; h < field.hours; h++) {
    const cls = met?.cls[h] ?? "D", rain = met?.rain[h] ?? 0, zi = met?.zi[h] ?? MIXED_LAYER_M;
    const wash = rain > 0 ? (met?.frozen[h] ? WASHOUT.snow : WASHOUT.rain) * rain : 0;
    snaps.push(snapshot(P, spreadDeg, zi));
    for (let s = 0; s < steps; s++) {
      const tH = h + s / steps;
      const w0 = windAt(field, tH, source.lat, source.lon);
      if (w0) {
        const sp = Math.hypot(w0[0], w0[1]);
        const q = emission(sp, rain) * dt;
        if (q > 0) P.push({ lat: source.lat, lon: source.lon, q, q0: q, bins: vg && SIZE_BINS.map((b) => (b.f / share) * q), x: 0, sp: Math.max(sp, CALM_MS) * dt, age: 0, vy: SIGMA0_M ** 2, vz: SOURCE_SIGMA_Z_M ** 2 });
      }
      const decay = Math.exp(-dt / tauS);
      for (const p of P) {
        const w = windAt(field, tH, p.lat, p.lon);
        if (w) {
          p.lat += (w[1] * dt) / (KM_PER_DEG_LAT * 1000);
          p.lon += (w[0] * dt) / (kmPerDegLon(p.lat) * 1000);
          const x1 = p.x + Math.hypot(w[0], w[1]) * dt;
          p.vy += Math.max(0, briggsY(x1, cls) ** 2 - briggsY(p.x, cls) ** 2);
          p.vz += Math.max(0, BRIGGS_Z[cls](x1) ** 2 - BRIGGS_Z[cls](p.x) ** 2);
          p.x = x1;
        }
        const surface = Math.sqrt(2 / Math.PI) / Math.min(Math.sqrt(p.vz), zCap(zi));
        if (vg) {
          let q = 0;
          for (let b = 0; b < vg.length; b++) { p.bins[b] *= Math.exp(-(vg[b] * surface + wash) * dt); q += p.bins[b]; }
          p.q = q;
        } else p.q *= decay * Math.exp(-wash * dt);
        p.age += dt;
      }
      P = P.filter((p) => p.age < maxAge);
    }
  }
  return { snaps, field };
}

function snapshot(P, spreadDeg, zi) {
  const n = P.length, f = () => new Float64Array(n);
  const out = { n, spreadDeg, lat: f(), lon: f(), q: f(), q0: f(), x: f(), sp: f(), sy: f(), surf: f() };
  P.forEach((p, i) => {
    out.lat[i] = p.lat; out.lon[i] = p.lon; out.q[i] = p.q; out.q0[i] = p.q0; out.x[i] = p.x; out.sp[i] = p.sp;
    out.sy[i] = Math.sqrt(p.vy); out.surf[i] = Math.sqrt(2 / Math.PI) / Math.min(Math.sqrt(p.vz), zCap(zi));
  });
  return out;
}

/** Puff widths: the spread of the air it crossed, but never narrower than a third of the release spacing (avoids a beaded trail). */
const sig = (snap, i) => Math.max(Math.hypot(snap.sy[i], snap.x[i] * Math.tan(((snap.spreadDeg || 0) * Math.PI) / 180)), 0.35 * snap.sp[i]);

/** Index at one point. */
export function concAt(snap, lat, lon) {
  const kx = kmPerDegLon(lat) * 1000, ky = KM_PER_DEG_LAT * 1000;
  let c = 0;
  for (let i = 0; i < snap.n; i++) {
    const dx = (lon - snap.lon[i]) * kx, dy = (lat - snap.lat[i]) * ky;
    const s = sig(snap, i), r2 = dx * dx + dy * dy;
    if (r2 > 16 * s * s) continue;
    c += ((snap.q[i] * snap.surf[i]) / (2 * Math.PI * s * s)) * Math.exp(-r2 / (2 * s * s));
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
  const gx = new Float64Array(w), px = new Float64Array(w); // a Gaussian splits into a row and a column, so exp runs per line, not per cell
  for (let i = 0; i < snap.n; i++) {
    const s = sig(snap, i), reach = 4 * s, lim = 16 * s * s, k = 1 / (2 * s * s);
    const c0 = Math.max(0, Math.floor((snap.lon[i] - reach / kx - extent.w) / dLon)), c1 = Math.min(w - 1, Math.ceil((snap.lon[i] + reach / kx - extent.w) / dLon));
    const r0 = Math.max(0, Math.floor((extent.n - (snap.lat[i] + reach / ky)) / dLat)), r1 = Math.min(h - 1, Math.ceil((extent.n - (snap.lat[i] - reach / ky)) / dLat));
    if (c0 > c1 || r0 > r1) continue;
    const a = ((emitted ? snap.q0[i] : snap.q[i]) * snap.surf[i]) / (2 * Math.PI * s * s);
    if (!(a > 0)) continue;
    for (let c = c0; c <= c1; c++) { const dx = (extent.w + (c + 0.5) * dLon - snap.lon[i]) * kx; px[c] = dx * dx; gx[c] = Math.exp(-px[c] * k); }
    for (let r = r0; r <= r1; r++) {
      const dy = (extent.n - (r + 0.5) * dLat - snap.lat[i]) * ky, dy2 = dy * dy, ay = a * Math.exp(-dy2 * k), row = r * w;
      for (let c = c0; c <= c1; c++) if (px[c] + dy2 <= lim) out[row + c] += ay * gx[c];
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

/* One sand-to-dark-brown family, so that dust is never read as one of the hazard colours. */
export const PLUME_CLASSES = [
  { key: "p_none", min: 0, max: 2, color: null },
  { key: "p_low", min: 2, max: 10, color: "#f6e3a1" },
  { key: "p_moderate", min: 10, max: 35, color: "#e8b04a" },
  { key: "p_high", min: 35, max: 70, color: "#bb6a1e" },
  { key: "p_very_high", min: 70, max: Infinity, color: "#5f2a0c" },
];
export function plumeClass(index) { return PLUME_CLASSES.find((c) => index >= c.min && index < c.max) || PLUME_CLASSES[0]; }

/** RGBA of an index 0..100. Classes stay clearly apart, with a short soft step at each limit on the logarithmic scale the index
 * falls along, and only the outer edge of the plume fades out. */
export function plumeColor(index) {
  if (!(index > 1)) return null;
  const stops = PLUME_CLASSES.slice(1).map((c) => [1, 3, 5].map((i) => parseInt(c.color.slice(i, i + 2), 16)));
  const limits = [1, Math.log10(35), Math.log10(70)], opacity = [0.5, 0.66, 0.78, 0.88], band = 0.04, x = Math.log10(Math.min(index, 100));
  let k = 0;
  while (k < 3 && x >= limits[k] + band) k++;
  const f = k < 3 && x > limits[k] - band ? (x - limits[k] + band) / (2 * band) : 0, j = Math.min(k + 1, 3);
  const mix = (a, b) => a + (b - a) * f;
  return [...stops[k].map((a, i) => mix(a, stops[j][i])), mix(opacity[k], opacity[j]) * Math.min(1, index - 1) * 255];
}

/** What the run comes to: how far and over how much land the index reached `limit`, in which direction, and at what hour. */
export function plumeStats(frames, extent, w, h, source, ref, limit = 2) {
  const peak = new Float32Array(w * h), load = frames.map((f) => { let s = 0; for (let i = 0; i < f.length; i++) { s += f[i]; if (f[i] > peak[i]) peak[i] = f[i]; } return s; });
  const dLon = (extent.e - extent.w) / w, dLat = (extent.n - extent.s) / h, kx = kmPerDegLon(source.lat), ky = KM_PER_DEG_LAT;
  let reach = 0, area = 0, ex = 0, ny = 0, edge = false;
  for (let r = 0; r < h; r++) {
    const dy = (extent.n - (r + 0.5) * dLat - source.lat) * ky;
    for (let c = 0; c < w; c++) {
      if (!(ref > 0) || (100 * peak[r * w + c]) / ref < limit) continue;
      const dx = (extent.w + (c + 0.5) * dLon - source.lon) * kx, d = Math.hypot(dx, dy);
      if (d > reach) reach = d;
      area += dLon * kx * dLat * ky;
      if (d > 0) { ex += (dx / d) * peak[r * w + c]; ny += (dy / d) * peak[r * w + c]; }
      if (r === 0 || c === 0 || r === h - 1 || c === w - 1) edge = true;
    }
  }
  return { reach, area, edge, bearing: area > 0 ? ((Math.atan2(ex, ny) * 180) / Math.PI + 360) % 360 : null, peakHour: load.indexOf(Math.max(...load)) };
}

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
