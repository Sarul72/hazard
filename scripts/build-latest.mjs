#!/usr/bin/env node
/* Build data/latest.json (and optionally data/fires.json) from live sources.
 * Run by .github/workflows/update-data.yml every 3 hours, or by hand: `npm run update`.
 * Needs outbound HTTPS to open-meteo.com. FIRMS detections need a free MAP_KEY in FIRMS_MAP_KEY. */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { POINTS, MONGOLIA_BBOX } from "../js/config.js";
import { fetchAll, nowLocalString } from "../js/openmeteo.js";
import { computePoint } from "../js/risk.js";
import { parseFirmsCsv, firmsUrl, nearestPointCounts } from "../js/firms.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = join(root, "data");
await mkdir(dataDir, { recursive: true });

let thresholds = {};
const thPath = join(dataDir, "flood_thresholds.json");
if (existsSync(thPath)) thresholds = JSON.parse(await readFile(thPath, "utf8")).points || {};

const { raw, errors, fetched_at } = await fetchAll(POINTS);
const nowLocal = nowLocalString();
const points = {};
let ok = 0;
for (const r of raw) {
  const res = computePoint({ ...r, thresholds: thresholds[r.id] || null }, nowLocal);
  if (res.overall) ok++;
  points[r.id] = res;
}
const errCount = Object.values(errors).reduce((s, a) => s + a.length, 0);
if (ok === 0) {
  console.error("No point produced any score; keeping the previous data/latest.json. Errors:", JSON.stringify(errors));
  process.exit(1);
}
const out = {
  schema: 1,
  generated_at: fetched_at,
  now_local: nowLocal,
  sources: {
    forecast: "Open-Meteo forecast API (best_match, hourly)",
    air: "Open-Meteo air quality API (CAMS global, 0.4 deg)",
    flood: "Open-Meteo flood API (GloFAS v4, 0.05 deg)",
  },
  flood_thresholds: Object.keys(thresholds).length ? "GloFAS reanalysis Gumbel fit, see data/flood_thresholds.json" : "absent: rise-factor fallback",
  errors,
  points,
};
await writeFile(join(dataDir, "latest.json"), JSON.stringify(out));
console.log(`latest.json: ${ok}/${POINTS.length} points scored, ${errCount} fetch errors`);

// Optional: active fire detections (needs a free NASA FIRMS MAP_KEY).
const key = process.env.FIRMS_MAP_KEY;
if (key) {
  try {
    const all = [];
    for (const src of ["VIIRS_SNPP_NRT", "VIIRS_NOAA20_NRT", "MODIS_NRT"]) {
      const res = await fetch(firmsUrl(key, src, MONGOLIA_BBOX, 3));
      if (!res.ok) throw new Error(`${src}: HTTP ${res.status}`);
      all.push(...parseFirmsCsv(await res.text(), src));
    }
    await writeFile(join(dataDir, "fires.json"), JSON.stringify({ schema: 1, generated_at: new Date().toISOString(), days: 3, count: all.length, detections: all, near_points: nearestPointCounts(all, POINTS, 50) }));
    console.log(`fires.json: ${all.length} detections`);
  } catch (e) { console.error("FIRMS fetch failed:", e.message); }
} else console.log("FIRMS_MAP_KEY not set: skipping fires.json");
