#!/usr/bin/env node
/* Threshold sensitivity: how often does a +-20 % change of one threshold move a point to another class?
 * Uses random synthetic scenarios (seeded), so it is a robustness check of the formulas, not a validation. */
import { THRESHOLDS } from "../js/config.js";
import { fireRisk, dustRisk, floodRisk, classOf } from "../js/risk.js";

const NOW = "2026-07-15T10:00";
const START = Date.parse("2026-04-15T00:00:00Z");
const N = 96 * 24;
let seed = 2026;
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const pick = (a, b) => a + rnd() * (b - a);

function scenario() {
  const T0 = pick(8, 26), RH0 = pick(20, 70), W0 = pick(1.5, 9), pRain = pick(0, 0.08), mm = pick(0.5, 14);
  const time = [], o = { temperature_2m: [], relative_humidity_2m: [], wind_speed_10m: [], precipitation: [], rain: [], snow_depth: [] };
  for (let i = 0; i < N; i++) {
    time.push(new Date(START + i * 3600e3).toISOString().slice(0, 16));
    const h = i % 24, r = rnd() < pRain ? mm * rnd() : 0;
    o.temperature_2m.push(T0 + 7 * Math.sin((h - 9) / 24 * 6.283) + pick(-2, 2));
    o.relative_humidity_2m.push(Math.min(100, Math.max(5, RH0 - 12 * Math.sin((h - 9) / 24 * 6.283) + pick(-8, 8))));
    o.wind_speed_10m.push(Math.max(0, W0 + pick(-2, 6) * rnd()));
    o.precipitation.push(r); o.rain.push(r); o.snow_depth.push(0);
  }
  const dust = time.map(() => (rnd() < 0.05 ? pick(0, 300) : pick(0, 15)));
  const qBase = pick(5, 60);
  const dt = []; for (let d = -30; d <= 10; d++) dt.push(new Date(Date.parse("2026-07-15T00:00:00Z") + d * 86400000).toISOString().slice(0, 10));
  return { fc: { time, ...o }, air: { time, dust, pm10: dust, aerosol_optical_depth: dust.map(() => 0.1) }, fl: { time: dt, river_discharge: dt.map((_, k) => qBase * (k > 32 && k < 38 ? pick(1, 4) : pick(0.8, 1.2))) }, th: { q2: qBase * 1.8, q5: qBase * 2.6, q20: qBase * 3.8 } };
}
const scen = Array.from({ length: 150 }, scenario);

const clone = (o) => JSON.parse(JSON.stringify(o));
function scores(cfg) {
  return scen.map((s) => ({
    fire: fireRisk(s.fc, NOW, cfg.fire)?.score ?? null,
    dust: dustRisk(s.fc, s.air, NOW, cfg.dust)?.score ?? null,
    flood: floodRisk(s.fc, s.fl, s.th, NOW, cfg.flood)?.score ?? null,
  }));
}
const base = scores(THRESHOLDS);
const cls = (v) => (v === null ? "none" : classOf(v).key);
const rows = [];
function test(hazard, name, mutate) {
  for (const f of [0.8, 1.2]) {
    const cfg = clone(THRESHOLDS); mutate(cfg, f);
    const alt = scores(cfg);
    const changed = base.filter((b, i) => cls(b[hazard]) !== cls(alt[i][hazard])).length;
    rows.push(`| ${hazard} | ${name} x${f} | ${(100 * changed / scen.length).toFixed(0)} % |`);
  }
}
test("fire", "all FWI class limits", (c, f) => { c.fire.fwiBreaks = c.fire.fwiBreaks.map((x) => x * f); });
test("dust", "wind onset and strong", (c, f) => { c.dust.windOnset *= f; c.dust.windStrong *= f; });
test("dust", "CAMS breakpoints", (c, f) => { c.dust.camsBreaks = c.dust.camsBreaks.map((x) => x * f); });
test("flood", "24-h rain breakpoints", (c, f) => { c.flood.rain24Breaks = c.flood.rain24Breaks.map((x) => x * f); });
test("flood", "hourly rain breakpoints", (c, f) => { c.flood.rain1Breaks = c.flood.rain1Breaks.map((x) => x * f); });
console.log("| hazard | change | scenarios that change class |\n|---|---|---|\n" + rows.join("\n"));
console.log("\nbase class counts:", ["fire", "dust", "flood"].map((h) => `${h}: ` + JSON.stringify(base.reduce((a, b) => { const k = cls(b[h]); a[k] = (a[k] || 0) + 1; return a; }, {}))).join("; "));
