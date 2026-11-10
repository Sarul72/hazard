/* Dust check of a chosen box and day, computed in the browser. Two parts, both measured, no new score:
 *  - Surface: the clearest Sentinel-2 L2A passes of the 30 days up to the day (Microsoft Planetary Computer) sort the
 *    ground into bare soil and sand (NDVI < 0.15), sparse vegetation (0.15-0.30), vegetation, snow and water, at 20 m
 *    up to 2,000 km2 and 60 m up to 20,000 km2. Bare dry ground is where wind can lift dust.
 *  - Weather: Open-Meteo hourly wind, gusts, precipitation, snow depth and topsoil moisture at nine points of the box for
 *    the day and the two after it (forecast within 85 days, ERA5 archive before), and CAMS dust near the ground.
 * Wind onset 6 m/s and the wet-day rule (0.254 mm/day stops emission, US EPA AP-42 13.2.2) are those of the national
 * dust score; 10 and 14 m/s are reported as strong and severe. The NDVI limits are common conventions, not fitted to
 * Mongolian dust events. Observed dust (TROPOMI) is not read here: its files are too large for a browser. */
import { search, passes, bandOnGrid } from "./stac.js";
import { CLOUDY_SCL, boxAreaKm2, makeGrid, rowAreaKm2 } from "./raster.js";
import { API, TZ } from "../config.js";

export const DUST = {
  fineKm2: 2000, hardKm2: 20000, bareNdvi: 0.15, sparseNdvi: 0.30, lookbackDays: 30, maxPasses: 3, enoughClear: 0.95,
  onset: 6, strong: 10, severe: 14, wetDayMm: 0.254, snowM: 0.01, who: 45, archiveAfterDays: 85, hours: 72,
};
export const LAND = { none: 0, bare: 1, sparse: 2, veg: 3, snow: 4, water: 5, cloud: 6 };
export const scaleFor = (km2) => (km2 <= DUST.fineKm2 ? 20 : 60);

const DAY = 86400000;
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const addDays = (d, n) => iso(Date.parse(d + "T00:00:00Z") + n * DAY);
const asIs = (v) => v;

/** NDVI in harmonized reflectance (baseline 04.00 and later adds 1000 to both bands). */
const ndviQuery = (item) => ({
  expression: Number(item.properties["s2:processing_baseline"]) >= 4 ? "(B08*1.0-B04)/(B08*1.0+B04-2000)" : "(B08*1.0-B04)/(B08*1.0+B04)",
  asset_as_band: "True", rescale: "-1,1",
});
const fromNdvi = (v) => -1 + v * 2 / 255;

/** Land class of one pixel from its scene class and NDVI. */
export function landClass(scl, ndvi) {
  if (Number.isNaN(scl)) return LAND.none;
  if (scl === 11) return LAND.snow;
  if (scl === 6) return LAND.water;
  if (CLOUDY_SCL.has(scl)) return LAND.cloud;
  if (Number.isNaN(ndvi)) return LAND.none;
  return ndvi < DUST.bareNdvi ? LAND.bare : ndvi < DUST.sparseNdvi ? LAND.sparse : LAND.veg;
}

async function band(g, items, query, decode) {
  let out = null;
  for (const it of items) out = await bandOnGrid(g, it, query, decode, out);
  return out ?? new Float32Array(g.w * g.h).fill(NaN);
}

/** Ground classes from the clearest passes before the day; later passes fill only what earlier ones could not see. */
export async function surface(box, day, step = () => {}) {
  const km2 = boxAreaKm2(box), g = makeGrid(box, scaleFor(km2)), n = g.w * g.h;
  const items = await search("sentinel-2-l2a", box, addDays(day, -DUST.lookbackDays), day);
  const ps = passes(items);
  if (!ps.length) return { grid: g, km2, land: null, dates: [] };
  const cg = makeGrid(box, Math.max(240, g.scale));
  const shares = await Promise.all(ps.map(async (p) => {
    const scl = await band(cg, p.items, { assets: "SCL", rescale: "0,255" }, asIs);
    let ok = 0; for (const v of scl) if (!Number.isNaN(v) && !CLOUDY_SCL.has(v)) ok++;
    return ok / scl.length;
  }));
  const order = ps.map((p, i) => ({ p, s: shares[i] })).filter((x) => x.s > 0.05).sort((a, b) => b.s - a.s || b.p.t0 - a.p.t0);
  const land = new Uint8Array(n), dates = [];
  for (const { p } of order.slice(0, DUST.maxPasses)) {
    step("surface_read");
    const scl = await band(g, p.items, { assets: "SCL", rescale: "0,255" }, asIs);
    let ndvi = null;
    for (const it of p.items) ndvi = await bandOnGrid(g, it, ndviQuery(it), fromNdvi, ndvi);
    let filled = 0, seen = 0;
    for (let i = 0; i < n; i++) {
      if (land[i] === LAND.none || land[i] === LAND.cloud) {
        const c = landClass(scl[i], ndvi[i]);
        if (c !== LAND.none && (c !== LAND.cloud || land[i] === LAND.none)) { land[i] = c; filled++; }
      }
      if (land[i] !== LAND.none && land[i] !== LAND.cloud) seen++;
    }
    if (filled) dates.push(iso(p.t0));
    if (seen / n >= DUST.enoughClear) break;
  }
  return { grid: g, km2, land, dates };
}

/** Area of each class in km2 and as a share of the part seen without cloud. */
export function landShares(g, land) {
  const rows = rowAreaKm2(g), km2 = new Array(7).fill(0);
  for (let r = 0, i = 0; r < g.h; r++) for (let c = 0; c < g.w; c++, i++) km2[land[i]] += rows[r];
  const seen = km2[LAND.bare] + km2[LAND.sparse] + km2[LAND.veg] + km2[LAND.snow] + km2[LAND.water];
  const total = km2.reduce((a, b) => a + b, 0);
  return { km2, seen, total, share: km2.map((v) => (seen > 0 ? v / seen : null)), seenShare: total > 0 ? seen / total : 0 };
}

/** Nine points of the box: centres of a 3 by 3 split. */
export const points = (b) => [1, 3, 5].flatMap((i) => [1, 3, 5].map((j) => ({ lat: b.s + (b.n - b.s) * i / 6, lon: b.w + (b.e - b.w) * j / 6 })));

async function getJson(url, timeoutMs = 30000) {
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`${r.status}${j.reason ? ": " + j.reason : ""}`);
    return j;
  } finally { clearTimeout(timer); }
}

/** Hourly weather and CAMS dust at the nine points for the day and the two after it, cut to what exists. */
export async function weather(box, day, now = Date.now()) {
  const pts = points(box), end = addDays(day, 2), ageDays = (now - Date.parse(day + "T00:00:00Z")) / DAY;
  const archive = ageDays > DUST.archiveAfterDays;
  const lastDay = archive ? iso(now - 6 * DAY) : iso(now + 3 * DAY);
  const stop = end < lastDay ? end : lastDay;
  if (stop < day) return { error: "no_weather" };
  const ll = { latitude: pts.map((p) => p.lat.toFixed(3)).join(","), longitude: pts.map((p) => p.lon.toFixed(3)).join(","), start_date: day, end_date: stop, timezone: TZ };
  const wq = new URLSearchParams({ ...ll, hourly: "wind_speed_10m,wind_gusts_10m,precipitation,snow_depth,soil_moisture_0_to_7cm", wind_speed_unit: "ms" });
  const aq = new URLSearchParams({ ...ll, hourly: "dust" });
  const [w, a] = await Promise.all([getJson(`${archive ? API.archive : API.forecast}?${wq}`), getJson(`${API.air}?${aq}`).catch(() => null)]);
  const list = (x) => (Array.isArray(x) ? x : x ? [x] : []);
  return { source: archive ? "era5" : "forecast", hours: list(w).map((p) => p.hourly), dust: list(a).map((p) => p.hourly).filter(Boolean), from: day, to: stop };
}

const mean = (xs) => { const v = xs.filter(Number.isFinite); return v.length ? v.reduce((p, q) => p + q, 0) / v.length : null; };

/** Hour by hour over the box: mean wind, highest gust, wet days, snow, soil water, and the CAMS peak. */
export function windStats(wx) {
  const H = wx.hours;
  if (!H.length || !H[0]?.time) return null;
  const times = H[0].time, n = Math.min(times.length, DUST.hours);
  const wind = [], gust = [], rainByDay = new Map(), snow = [], soil = [];
  for (let k = 0; k < n; k++) {
    wind.push(mean(H.map((h) => h.wind_speed_10m?.[k])));
    gust.push(Math.max(...H.map((h) => h.wind_gusts_10m?.[k] ?? -Infinity)));
    const d = times[k].slice(0, 10);
    rainByDay.set(d, (rainByDay.get(d) ?? 0) + (mean(H.map((h) => h.precipitation?.[k])) ?? 0));
    snow.push(mean(H.map((h) => h.snow_depth?.[k])));
    soil.push(mean(H.map((h) => h.soil_moisture_0_to_7cm?.[k])));
  }
  const wet = new Set([...rainByDay].filter(([, mm]) => mm >= DUST.wetDayMm).map(([d]) => d));
  const dry = (k) => !wet.has(times[k].slice(0, 10)) && !((snow[k] ?? 0) >= DUST.snowM);
  const count = (lim) => wind.filter((v, k) => v !== null && v >= lim && dry(k)).length;
  const peak = wind.reduce((b, v, k) => (v !== null && (b === null || v > wind[b]) ? k : b), null);
  let cams = null;
  if (wx.dust.length && wx.dust[0].time) {
    for (let k = 0; k < Math.min(wx.dust[0].time.length, DUST.hours); k++) for (const d of wx.dust) {
      const v = d.dust?.[k];
      if (Number.isFinite(v) && (!cams || v > cams.max)) cams = { max: v, time: wx.dust[0].time[k] };
    }
  }
  return {
    hours: n, from: times[0], to: times[n - 1], onset: count(DUST.onset), strong: count(DUST.strong), severe: count(DUST.severe),
    maxWind: peak === null ? null : wind[peak], maxWindTime: peak === null ? null : times[peak], maxGust: Number.isFinite(Math.max(...gust)) ? Math.max(...gust) : null,
    wetDays: [...wet], rainMm: [...rainByDay.values()].reduce((a, b) => a + b, 0), snowM: snow[0], soil: mean(soil), cams,
  };
}

/** The plain conclusion, built only from what was measured. Returns a key and the reasons behind it. */
export function verdict(sh, ws) {
  const bare = sh?.share?.[LAND.bare] ?? null, snowShare = sh?.share?.[LAND.snow] ?? 0;
  const why = [];
  if (!ws) return { key: "unknown", why: ["no_weather"] };
  if ((ws.snowM ?? 0) >= DUST.snowM) why.push("snow_now");
  if (bare !== null && bare < 0.05) why.push("little_bare");
  if (snowShare > 0.5) why.push("snow_ground");
  if (ws.onset === 0) why.push("calm");
  if (ws.wetDays.length && ws.onset === 0) why.push("wet");
  const camsHigh = ws.cams && ws.cams.max >= DUST.who;
  if (why.length) return { key: camsHigh ? "not_local" : "no", why, camsHigh };
  const key = ws.severe > 0 ? "severe" : ws.strong > 0 ? "strong" : "possible";
  return { key, why, camsHigh };
}

/** Runs both parts; `step(key)` reports progress. */
export async function computeDust({ box, day, step = () => {}, now = Date.now() }) {
  const km2 = boxAreaKm2(box);
  if (km2 > DUST.hardKm2) throw Object.assign(new Error("too_big"), { km2 });
  step("weather");
  const wxP = weather(box, day, now).catch((e) => ({ error: e.message }));
  step("surface_search");
  const sf = await surface(box, day, step);
  const wx = await wxP;
  step("numbers");
  const sh = sf.land ? landShares(sf.grid, sf.land) : null;
  const ws = wx.error ? null : windStats(wx);
  return { day, km2, grid: sf.grid, scale: sf.grid.scale, land: sf.land, dates: sf.dates, shares: sh, wind: ws, weatherSource: wx.source ?? null, weatherError: wx.error ?? null, verdict: verdict(sh, ws) };
}
