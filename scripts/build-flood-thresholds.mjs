#!/usr/bin/env node
/* One-off (re-run yearly): 2-, 5- and 20-year discharge return levels per monitoring point from the
 * GloFAS daily reanalysis served by Open-Meteo. Writes data/flood_thresholds.json.
 * Heavy: one long request per point, spaced out to respect the free-tier limits. */
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { POINTS, API } from "../js/config.js";
import { thresholdsFromSeries } from "../js/flood_stats.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const START = process.env.START_DATE || "1990-01-01";
const END = process.env.END_DATE || "2024-12-31";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const points = {};
for (const p of POINTS) {
  const q = new URLSearchParams({ latitude: p.lat.toFixed(4), longitude: p.lon.toFixed(4), daily: "river_discharge", start_date: START, end_date: END });
  try {
    const res = await fetch(`${API.flood}?${q}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = await res.json();
    const th = thresholdsFromSeries(j.daily.time, j.daily.river_discharge);
    points[p.id] = th;
    console.log(p.id, th ? `q2=${th.q2.toFixed(1)} q5=${th.q5.toFixed(1)} q20=${th.q20.toFixed(1)} (${th.years} y)` : "no usable river / record");
  } catch (e) {
    console.error(p.id, "failed:", e.message);
    points[p.id] = null;
  }
  await sleep(4000);
}
await mkdir(join(root, "data"), { recursive: true });
await writeFile(join(root, "data", "flood_thresholds.json"), JSON.stringify({ schema: 1, generated_at: new Date().toISOString(), period: [START, END], source: "Open-Meteo flood API (GloFAS v4 reanalysis), annual maxima, Gumbel by L-moments", points }, null, 1));
