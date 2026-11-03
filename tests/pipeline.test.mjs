import test from "node:test";
import assert from "node:assert/strict";
import { forecastUrl, airUrl, floodUrl, fetchAll, nowLocalString } from "../js/openmeteo.js";
import { POINTS } from "../js/config.js";
import { parseFirmsCsv, firmsUrl, haversineKm, nearestPointCounts } from "../js/firms.js";
import { annualMaxima, gumbelFit, returnLevel, thresholdsFromSeries } from "../js/flood_stats.js";

test("every monitoring point has unique id and plausible Mongolian coordinates", () => {
  assert.equal(POINTS.length, 22);
  assert.equal(new Set(POINTS.map((p) => p.id)).size, 22);
  for (const p of POINTS) {
    assert.ok(p.lat > 41.5 && p.lat < 52.3 && p.lon > 87.5 && p.lon < 120, p.id);
  }
});

test("URLs carry all locations, units and time zone", () => {
  const u = forecastUrl(POINTS.slice(0, 2));
  assert.match(u, /latitude=47\.9186%2C47\.4750/);
  assert.match(u, /wind_speed_unit=ms/);
  assert.match(u, /past_days=92/);
  assert.match(u, /timezone=Asia%2FUlaanbaatar/);
  assert.match(airUrl(POINTS.slice(0, 1)), /dust/);
  assert.match(floodUrl(POINTS.slice(0, 1)), /river_discharge/);
});

test("nowLocalString is UTC+8", () => {
  assert.equal(nowLocalString(new Date("2026-11-03T02:30:00Z")), "2026-11-03T10:30");
});

/** Mock fetch that answers like Open-Meteo: one object for one location, an array for several. */
function mockFetch({ failAir = false, failFloodFor = null } = {}) {
  return async (url) => {
    const u = new URL(url);
    const lats = u.searchParams.get("latitude").split(",");
    const mk = (n) => lats.map(() => n());
    let body;
    if (u.hostname.startsWith("api.")) body = mk(() => ({ hourly: { time: ["2026-11-03T00:00"], temperature_2m: [1] } }));
    else if (u.hostname.startsWith("air-quality")) {
      if (failAir) return { ok: false, status: 500, json: async () => ({ reason: "boom" }) };
      body = mk(() => ({ hourly: { time: ["2026-11-03T00:00"], dust: [3] } }));
    } else {
      if (failFloodFor && lats.length > 1) return { ok: false, status: 400, json: async () => ({ reason: "no data" }) };
      if (failFloodFor && lats[0] === failFloodFor) return { ok: false, status: 400, json: async () => ({ reason: "no river" }) };
      body = mk(() => ({ daily: { time: ["2026-11-03"], river_discharge: [12] } }));
    }
    return { ok: true, status: 200, json: async () => (lats.length === 1 ? body[0] : body) };
  };
}

test("fetchAll maps results to points in order and handles single-location chunks", async () => {
  const pts = POINTS.slice(0, 3);
  const r = await fetchAll(pts, { fetchImpl: mockFetch(), chunkSize: 2 });
  assert.equal(r.raw.length, 3);
  assert.deepEqual(r.raw.map((x) => x.id), pts.map((p) => p.id));
  assert.ok(r.raw.every((x) => x.forecast && x.air && x.flood));
  assert.equal(r.errors.forecast.length + r.errors.air.length + r.errors.flood.length, 0);
});

test("one failing API leaves the others intact and is reported, never zero-filled", async () => {
  const r = await fetchAll(POINTS.slice(0, 2), { fetchImpl: mockFetch({ failAir: true }), retries: 0 });
  assert.ok(r.raw.every((x) => x.air === null && x.forecast && x.flood));
  assert.equal(r.errors.air.length > 0, true);
});

test("flood: a failing chunk falls back to per-point requests; only the bad point is null", async () => {
  const pts = POINTS.slice(0, 3);
  const bad = pts[1].lat.toFixed(4);
  const r = await fetchAll(pts, { fetchImpl: mockFetch({ failFloodFor: bad }), retries: 0, chunkSize: 3 });
  assert.ok(r.raw[0].flood && r.raw[2].flood);
  assert.equal(r.raw[1].flood, null);
  assert.equal(r.errors.flood.length, 1);
});

test("FIRMS CSV parsing, URL and distance counting", () => {
  const csv = "latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,confidence,version,bright_ti5,frp,daynight\n" +
    "47.95,106.95,330.1,0.4,0.4,2026-11-02,0612,N,n,2.0NRT,290.0,4.5,D\n" +
    "bad,row\n" +
    "49.00,100.00,340.0,0.4,0.4,2026-11-02,0700,N,h,2.0NRT,291.0,12.1,D\n";
  const d = parseFirmsCsv(csv, "VIIRS_SNPP_NRT");
  assert.equal(d.length, 2);
  assert.equal(d[0].frp, 4.5);
  assert.equal(d[1].conf, "h");
  assert.equal(parseFirmsCsv("", "x").length, 0);
  assert.equal(parseFirmsCsv("a,b\n1,2", "x").length, 0);
  assert.equal(firmsUrl("KEY", "VIIRS_SNPP_NRT", [41.5, 87.5, 52.3, 120], 3), "https://firms.modaps.eosdis.nasa.gov/api/area/csv/KEY/VIIRS_SNPP_NRT/87.5,41.5,120,52.3/3");
  assert.ok(Math.abs(haversineKm(0, 0, 0, 1) - 111.19) < 0.1);
  const counts = nearestPointCounts(d, POINTS, 50);
  assert.equal(counts.UB, 1);
  assert.equal(counts.TOV >= 1, true);
});

test("Gumbel L-moment fit recovers known return levels from a large synthetic sample", () => {
  let seed = 7;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return (seed + 1) / 4294967297; };
  const mu = 100, beta = 30;
  const sample = Array.from({ length: 20000 }, () => mu - beta * Math.log(-Math.log(rnd())));
  const fit = gumbelFit(sample);
  assert.ok(Math.abs(fit.mu - mu) < 1.5 && Math.abs(fit.beta - beta) < 1);
  const q20 = returnLevel(fit, 20);
  const trueQ20 = mu - beta * Math.log(-Math.log(1 - 1 / 20));
  assert.ok(Math.abs(q20 - trueQ20) / trueQ20 < 0.02);
});

test("annual maxima ignore incomplete years; thresholds need enough years and a real river", () => {
  const times = [], vals = [];
  for (let y = 1990; y <= 2024; y++) {
    for (let d = 0; d < 365; d++) {
      const t = new Date(Date.UTC(y, 0, 1 + d)).toISOString().slice(0, 10);
      times.push(t);
      vals.push(50 + 40 * Math.sin((d / 365) * Math.PI) + (y % 7) * 5);
    }
  }
  const am = annualMaxima(times, vals);
  assert.ok(am.length >= 34);
  const th = thresholdsFromSeries(times, vals);
  assert.ok(th && th.q2 < th.q5 && th.q5 < th.q20);
  assert.equal(thresholdsFromSeries(times.slice(0, 365 * 5), vals.slice(0, 365 * 5)), null, "5 years is too short");
  assert.equal(thresholdsFromSeries(times, vals.map(() => 0.01)), null, "a trickle has no return levels");
  assert.equal(annualMaxima(["2020-01-01"], [5]).length, 0, "one day does not make a year");
});
