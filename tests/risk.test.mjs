import test from "node:test";
import assert from "node:assert/strict";
import { interp, classOf, fireRisk, dustRisk, floodRisk, computePoint } from "../js/risk.js";

const NOW = "2026-11-03T10:00";
const START = Date.parse("2026-08-03T00:00:00Z");
const N_HOURS = 96 * 24;

/** Hourly synthetic forecast block; each variable is a constant or a function of the hour index. */
function block(over = {}) {
  const f = (v) => (typeof v === "function" ? v : () => v);
  const def = { T: 15, RH: 40, W: 3, P: 0, R: 0, S: 0, SM: 0.15 };
  const c = { ...def, ...over };
  const time = [], o = { temperature_2m: [], relative_humidity_2m: [], wind_speed_10m: [], precipitation: [], rain: [], snow_depth: [], soil_moisture_0_to_7cm: [] };
  for (let i = 0; i < N_HOURS; i++) {
    time.push(new Date(START + i * 3600e3).toISOString().slice(0, 16));
    o.temperature_2m.push(f(c.T)(i)); o.relative_humidity_2m.push(f(c.RH)(i)); o.wind_speed_10m.push(f(c.W)(i));
    o.precipitation.push(f(c.P)(i)); o.rain.push(f(c.R)(i)); o.snow_depth.push(f(c.S)(i)); o.soil_moisture_0_to_7cm.push(f(c.SM)(i));
  }
  return { time, ...o };
}
const idxNow = () => Math.round((Date.parse("2026-11-03T10:00:00Z") - START) / 3600e3);
const air = (dust) => {
  const time = [];
  for (let i = 0; i < N_HOURS; i++) time.push(new Date(START + i * 3600e3).toISOString().slice(0, 16));
  return { time, dust: time.map((_, i) => (typeof dust === "function" ? dust(i) : dust)), pm10: time.map(() => 10), aerosol_optical_depth: time.map(() => 0.1) };
};

test("interp clamps and interpolates; null for non-finite", () => {
  assert.equal(interp(-5, [0, 10], [0, 100]), 0);
  assert.equal(interp(5, [0, 10], [0, 100]), 50);
  assert.equal(interp(99, [0, 10], [0, 100]), 100);
  assert.equal(interp(NaN, [0, 10], [0, 100]), null);
  assert.equal(interp(null, [0, 10], [0, 100]), null);
});

test("classOf covers 0..100 and gives null for missing", () => {
  assert.equal(classOf(0).key, "very_low");
  assert.equal(classOf(19.99).key, "very_low");
  assert.equal(classOf(20).key, "low");
  assert.equal(classOf(79.99).key, "high");
  assert.equal(classOf(100).key, "very_high");
  assert.equal(classOf(null), null);
});

/* ---- fire ---- */
test("fire: hot, dry, windy, rainless run gives a higher score than a wet cool run", () => {
  const hot = fireRisk(block({ T: 28, RH: 20, W: 8 }), NOW);
  const wet = fireRisk(block({ T: 8, RH: 80, W: 3, P: (i) => (i % 24 === 5 ? 3 : 0) }), NOW);
  assert.ok(hot.score > wet.score, `${hot.score} vs ${wet.score}`);
  assert.ok(hot.score >= 60);
  assert.ok(wet.score <= 20);
});

test("fire: snow cover forces a zero score but keeps the FWI visible", () => {
  const r = fireRisk(block({ T: 28, RH: 20, W: 8, S: 0.2 }), NOW);
  assert.equal(r.score, 0);
  assert.ok(r.fwiToday > 0);
  assert.ok(r.flags.includes("snow_covered"));
});

test("fire: missing or short data gives null, never 0", () => {
  const b = block();
  const short = {}; for (const k of Object.keys(b)) short[k] = b[k].slice(0, 24 * 5);
  assert.equal(fireRisk(short, NOW).score, null);
  assert.equal(fireRisk(null, NOW), null);
  const nulls = block({ T: null });
  assert.equal(fireRisk(nulls, NOW).score, null);
});

/* ---- dust ---- */
test("dust: strong wind on a dry, snow-free day gives high emission potential, capped at 79", () => {
  const i = idxNow();
  const fc = block({ W: (k) => (k >= i && k < i + 30 ? 16 : 3) });
  const r = dustRisk(fc, null, NOW);
  assert.equal(r.score, 79);
  assert.ok(r.flags.includes("no_cams"));
});

test("dust: the AP-42 wet-day rule and snow cover both switch emission off", () => {
  const i = idxNow();
  const wind = (k) => (k >= i && k < i + 12 ? 16 : 3); // strong wind only until 22:00 today
  const wet = dustRisk(block({ W: wind, P: (k) => (Math.floor(k / 24) === Math.floor(i / 24) ? 0.1 : 0) }), null, NOW);
  assert.equal(wet.score, 0, "0.1 mm every hour of a day is far above 0.254 mm");
  const snow = dustRisk(block({ W: wind, S: 0.05 }), null, NOW);
  assert.equal(snow.score, 0);
});

test("dust: CAMS surface dust alone can reach very high and the score is the larger of the two terms", () => {
  const i = idxNow();
  const r = dustRisk(block({ W: 2 }), air((k) => (k === i + 5 ? 600 : 5)), NOW);
  assert.equal(r.score, 100);
  const mid = dustRisk(block({ W: 2 }), air((k) => (k === i + 5 ? 45 : 5)), NOW);
  assert.ok(Math.abs(mid.score - 40) < 1e-9, "45 ug/m3 (WHO PM10 24 h guideline) maps to score 40");
});

test("dust: no wind and no CAMS gives null, not 0", () => {
  assert.equal(dustRisk(null, null, NOW).score, null);
});

test("dust: score is monotone non-decreasing in peak wind", () => {
  const i = idxNow();
  let prev = -1;
  for (const u of [0, 4, 6, 8, 10, 12, 14, 20]) {
    const s = dustRisk(block({ W: (k) => (k === i + 3 ? u : 1) }), null, NOW).score;
    assert.ok(s >= prev, `wind ${u}: ${s} < ${prev}`);
    prev = s;
  }
});

/* ---- flood ---- */
function discharge(vals) {
  // 30 past days + 11 days from today
  const time = [];
  for (let d = -30; d <= 10; d++) time.push(new Date(Date.parse("2026-11-03T00:00:00Z") + d * 86400000).toISOString().slice(0, 10));
  return { time, river_discharge: time.map((_, k) => (typeof vals === "function" ? vals(k - 30) : vals)) };
}

test("flood: heavy forecast rain raises the score; dry weather leaves it at 0", () => {
  const i = idxNow();
  const dry = floodRisk(block(), null, null, NOW);
  assert.equal(dry.score, 0);
  const heavy = floodRisk(block({ R: (k) => (k >= i + 2 && k < i + 8 ? 12 : 0) }), null, null, NOW);
  assert.ok(heavy.score >= 75, `score ${heavy.score}`);
  assert.equal(heavy.R1, 12);
  assert.equal(heavy.R24, 72);
});

test("flood: discharge scored against return levels, 2-yr level = 40, 20-yr level = 80", () => {
  const th = { q2: 100, q5: 200, q20: 400 };
  const at = (q) => floodRisk(null, discharge((d) => (d === 3 ? q : 10)), th, NOW).score;
  assert.equal(at(100), 40);
  assert.equal(at(200), 60);
  assert.equal(at(400), 80);
  assert.equal(at(600), 100);
  assert.equal(at(10), 0);
  assert.ok(at(150) > at(100) && at(150) < at(200));
});

test("flood: without return levels the rise-factor fallback is flagged and a trickle is ignored", () => {
  const r = floodRisk(null, discharge((d) => (d === 3 ? 50 : 10)), null, NOW);
  assert.equal(r.method, "rise_factor");
  assert.ok(r.flags.includes("no_return_levels"));
  assert.ok(r.score >= 70);
  const trickle = floodRisk(null, discharge((d) => (d === 3 ? 0.4 : 0.05)), null, NOW);
  assert.equal(trickle.score, null);
});

test("flood: rain on snow adds the bonus", () => {
  const i = idxNow();
  const plain = floodRisk(block({ R: (k) => (k >= i + 2 && k < i + 5 ? 3 : 0), T: 4 }), null, null, NOW);
  const ros = floodRisk(block({ R: (k) => (k >= i + 2 && k < i + 5 ? 3 : 0), T: 4, S: 0.2 }), null, null, NOW);
  assert.ok(ros.rainOnSnow && ros.score === Math.min(100, plain.score + 15));
});

test("flood: missing inputs give null", () => {
  assert.equal(floodRisk(null, null, null, NOW).score, null);
});

/* ---- whole point, stress ---- */
test("computePoint combines the three hazards and reports the largest", () => {
  const i = idxNow();
  const p = computePoint({ id: "X", forecast: block({ R: (k) => (k >= i + 2 && k < i + 8 ? 12 : 0) }), air: air(5), flood: null, thresholds: null }, NOW);
  assert.equal(p.overall.hazard, "flood");
  assert.equal(p.overall.score, p.flood.score);
});

test("stress: random extreme inputs never produce NaN, out-of-range scores or exceptions", () => {
  let seed = 12345;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  for (let n = 0; n < 60; n++) {
    const pick = (lo, hi) => lo + rnd() * (hi - lo);
    const T = pick(-45, 48), RH = pick(0, 100), W = pick(0, 45), R = rnd() < 0.2 ? pick(0, 90) : 0;
    const fc = block({ T: () => T + pick(-5, 5), RH: () => RH, W: () => W * rnd(), P: () => R * rnd(), R: () => R * rnd(), S: () => (rnd() < 0.3 ? pick(0, 1) : 0), SM: () => pick(0, 0.6) });
    const p = computePoint({ id: "S", forecast: fc, air: air(() => pick(0, 5000)), flood: discharge(() => pick(0, 3000)), thresholds: rnd() < 0.5 ? { q2: 100, q5: 250, q20: 600 } : null }, NOW);
    for (const h of ["fire", "dust", "flood"]) {
      const s = p[h]?.score;
      if (s !== null && s !== undefined) assert.ok(Number.isFinite(s) && s >= 0 && s <= 100, `${h} score ${s}`);
    }
  }
});

test("stress: nulls scattered through every input array are tolerated", () => {
  const fc = block({ T: (k) => (k % 7 === 0 ? null : 18), RH: (k) => (k % 5 === 0 ? null : 30), W: (k) => (k % 11 === 0 ? null : 9), P: (k) => (k % 13 === 0 ? null : 0), R: (k) => (k % 3 === 0 ? null : 0) });
  const p = computePoint({ id: "N", forecast: fc, air: air((k) => (k % 2 ? null : 20)), flood: discharge((d) => (d % 2 ? null : 5)), thresholds: null }, NOW);
  for (const h of ["fire", "dust", "flood"]) {
    const s = p[h]?.score;
    assert.ok(s === null || s === undefined || (Number.isFinite(s) && s >= 0 && s <= 100));
  }
});
