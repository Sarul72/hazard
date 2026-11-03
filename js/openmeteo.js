/* Open-Meteo access (forecast, CAMS air quality, GloFAS river discharge).
 * Works in the browser and in Node 20+ (global fetch). Each API fails independently: one error
 * leaves the other two intact and is reported in `errors`, never replaced by zeros. */
import { API, TZ, TZ_OFFSET_HOURS } from "./config.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chunk = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };

/** "YYYY-MM-DDTHH:mm" in Ulaanbaatar time (UTC+8). */
export function nowLocalString(d = new Date()) {
  return new Date(d.getTime() + TZ_OFFSET_HOURS * 3600e3).toISOString().slice(0, 16);
}

function coords(points) {
  return { latitude: points.map((p) => p.lat.toFixed(4)).join(","), longitude: points.map((p) => p.lon.toFixed(4)).join(",") };
}

export function forecastUrl(points) {
  const q = new URLSearchParams({
    ...coords(points), hourly: API.hourlyVars.join(","), wind_speed_unit: "ms",
    past_days: String(API.pastDays), forecast_days: String(API.forecastDays), timezone: TZ,
  });
  return `${API.forecast}?${q}`;
}
export function airUrl(points) {
  const q = new URLSearchParams({
    ...coords(points), hourly: API.airVars.join(","),
    past_days: "0", forecast_days: "5", timezone: TZ,
  });
  return `${API.air}?${q}`;
}
export function floodUrl(points) {
  const q = new URLSearchParams({
    ...coords(points), daily: "river_discharge",
    past_days: String(API.floodPastDays), forecast_days: String(API.floodForecastDays), timezone: TZ,
  });
  return `${API.flood}?${q}`;
}

async function getJson(url, { fetchImpl = fetch, retries = 1, timeoutMs = 20000 } = {}) {
  let last;
  for (let a = 0; a <= retries; a++) {
    const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null;
    try {
      const res = await fetchImpl(url, ctl ? { signal: ctl.signal } : undefined);
      if (res.ok) return await res.json();
      const body = await res.json().catch(() => ({}));
      last = new Error(`HTTP ${res.status}${body.reason ? ": " + body.reason : ""}`);
      last.status = res.status;
      if (res.status !== 429 && res.status < 500) break; // a client error will not fix itself
    } catch (e) { last = e; }
    finally { if (timer) clearTimeout(timer); }
    if (a < retries) await sleep(700 * 2 ** a);
  }
  throw last;
}

const asArray = (j) => (Array.isArray(j) ? j : [j]);

async function fetchBatched(points, urlFn, key, opts, perPointFallback) {
  const out = new Array(points.length).fill(null);
  const errors = [];
  const parts = chunk(points, opts.chunkSize || 11);
  await Promise.all(parts.map(async (part, pi) => {
    const offset = pi * (opts.chunkSize || 11);
    try {
      const arr = asArray(await getJson(urlFn(part), opts));
      if (arr.length !== part.length) throw new Error(`expected ${part.length} locations, got ${arr.length}`);
      arr.forEach((r, i) => { out[offset + i] = r[key] ? r[key] : null; });
    } catch (e) {
      // Per-point retry only when the server answered with a client error (e.g. no river at one location).
      // A network failure would just repeat itself for every point.
      if (perPointFallback && e.status && e.status >= 400 && e.status < 500) {
        for (let i = 0; i < part.length; i++) {
          try { const r = await getJson(urlFn([part[i]]), { ...opts, retries: 0 }); out[offset + i] = asArray(r)[0][key] || null; }
          catch (e2) { errors.push(`${part[i].id}: ${e2.message}`); }
        }
      } else errors.push(e.message);
    }
  }));
  return { data: out, errors };
}

/**
 * Fetch everything for all points.
 * Returns { raw: [{id, forecast, air, flood}], errors: {forecast:[], air:[], flood:[]}, fetched_at }.
 */
export async function fetchAll(points, opts = {}) {
  const [fc, air, flood] = await Promise.all([
    fetchBatched(points, forecastUrl, "hourly", opts, false),
    fetchBatched(points, airUrl, "hourly", opts, false),
    fetchBatched(points, floodUrl, "daily", opts, true),
  ]);
  return {
    raw: points.map((p, i) => ({ id: p.id, forecast: fc.data[i], air: air.data[i], flood: flood.data[i] })),
    errors: { forecast: fc.errors, air: air.errors, flood: flood.errors },
    fetched_at: new Date().toISOString(),
  };
}
