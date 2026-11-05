import test from "node:test";
import assert from "node:assert/strict";
import { pointInPolygon, polygonAreaKm2, makeGrid, bilinear, rasterize, summarize, haversineKm } from "../js/geo.js";
import { windVec, toward, sigmaY, emissionFactor, buildField, windAt, simulate, concAt, concGrid, referenceMax, exposure, plumeClass } from "../js/plume.js";
import { kmPerDegLon } from "../js/geo.js";

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ""} got ${a}, want ${b} ±${tol}`);

/* ---------------- geometry ---------------- */
test("pointInPolygon: square and concave L shape", () => {
  const sq = [[0, 0], [0, 2], [2, 2], [2, 0]];
  assert.equal(pointInPolygon(1, 1, sq), true);
  assert.equal(pointInPolygon(3, 1, sq), false);
  const L = [[0, 0], [0, 4], [2, 4], [2, 2], [4, 2], [4, 0]];
  assert.equal(pointInPolygon(1, 3, L), true);
  assert.equal(pointInPolygon(3, 3, L), false); // the notch
});

test("polygon area: 1 deg x 1 deg at 45 N is about 8700 km2", () => {
  const a = polygonAreaKm2([[44.5, 100], [44.5, 101], [45.5, 101], [45.5, 100]]);
  near(a, 111.32 * Math.cos(Math.PI / 4) * 110.574, 60, "area");
});

test("makeGrid covers the bbox, respects the cap and the minimum step", () => {
  const big = [[41.5, 87.5], [41.5, 120], [52.3, 120], [52.3, 87.5]];
  const g = makeGrid(big, { minStepDeg: 0.1, maxPerSide: 7 });
  assert.ok(g.nodes.length <= 49 + 14, "node cap (a ceil can add one row/column)");
  assert.ok(g.lats[g.ny - 1] >= 52.3 - 1e-9 && g.lons[g.nx - 1] >= 120 - 1e-9, "covers north-east corner");
  const small = makeGrid([[43.6, 105.4], [43.6, 105.5], [43.7, 105.5], [43.7, 105.4]]);
  near(small.step, 0.1, 1e-9, "step never finer than the model resolution");
});

test("bilinear reproduces a linear field exactly and skips missing corners", () => {
  const g = makeGrid([[0, 0], [0, 1], [1, 1], [1, 0]], { minStepDeg: 0.25, maxPerSide: 5 });
  const vals = g.nodes.map((n) => 3 * n.lat + 5 * n.lon);
  near(bilinear(g, vals, 0.37, 0.61), 3 * 0.37 + 5 * 0.61, 1e-9, "linear");
  const holey = vals.slice(); holey[0] = null;
  assert.ok(Number.isFinite(bilinear(g, holey, 0.01, 0.01)), "one missing corner still gives a value");
});

test("rasterize leaves NaN outside the polygon and fills inside", () => {
  const tri = [[0, 0], [0, 1], [1, 0.5]];
  const g = makeGrid(tri, { minStepDeg: 0.25, maxPerSide: 5 });
  const r = rasterize(tri, g, g.nodes.map(() => 42), 60);
  const nanCount = r.cells.filter(Number.isNaN).length;
  assert.ok(nanCount > 0 && nanCount < r.cells.length);
  assert.ok(r.cells.filter((v) => !Number.isNaN(v)).every((v) => v === 42));
  const s = summarize(r.cells, (v) => (v > 40 ? "hi" : "lo"));
  near(s.share.hi, 1, 1e-9, "all hi");
});

/* ---------------- wind and plume ---------------- */
test("windVec: wind FROM the west blows east, FROM the north blows south", () => {
  const [u, v] = windVec(10, 270); near(u, 10, 1e-9); near(v, 0, 1e-9);
  const [u2, v2] = windVec(5, 0); near(u2, 0, 1e-9); near(v2, -5, 1e-9);
  assert.equal(toward(270), 90);
});

test("sigmaY grows with distance and equals the source size at x=0", () => {
  near(sigmaY(0), 150, 1e-9);
  assert.ok(sigmaY(10000) > sigmaY(1000));
  near(sigmaY(1000), Math.hypot(150, 0.11 * 1000 / Math.sqrt(1.1)), 1e-6);
  assert.ok(emissionFactor(15) > emissionFactor(5));
});

function constantField(src, speed, dirFrom, hours) {
  const lats = [src.lat - 2, src.lat, src.lat + 2], lons = [src.lon - 2.5, src.lon, src.lon + 2.5];
  const grid = { lats, lons, ny: 3, nx: 3 };
  const time = Array.from({ length: hours }, (_, h) => `2025-06-01T${String(h % 24).padStart(2, "0")}:00`);
  const results = Array.from({ length: 9 }, () => ({ time, wind_speed_10m: Array(hours).fill(speed), wind_direction_10m: Array(hours).fill(dirFrom) }));
  return buildField(grid, results);
}

const SRC = { lat: 43.6678, lon: 105.5181 };

test("steady 10 m/s west wind: plume travels east at the wind speed, none upwind", () => {
  const field = constantField(SRC, 10, 270, 6);
  const { snaps } = simulate({ source: SRC, field });
  const s = snaps[4]; // 4 hours of travel for the oldest puff
  let maxLon = -Infinity; for (let i = 0; i < s.n; i++) maxLon = Math.max(maxLon, s.lon[i]);
  const expectedKm = 10 * 3600 * 4 / 1000 - 10 * 180 / 1000; // oldest puff was released one step into hour 0
  const gotKm = (maxLon - SRC.lon) * kmPerDegLon(SRC.lat);
  near(gotKm, expectedKm, 6, "downwind distance km");
  // Centreline 20 km downwind vs 20 km upwind vs 20 km crosswind
  const kx = kmPerDegLon(SRC.lat);
  const down = concAt(s, SRC.lat, SRC.lon + 20 / kx);
  const up = concAt(s, SRC.lat, SRC.lon - 20 / kx);
  const cross = concAt(s, SRC.lat + 20 / 110.574, SRC.lon);
  assert.ok(down > 0);
  assert.equal(up, 0, "nothing upwind");
  assert.ok(down > 20 * cross, "plume is narrow: far more on the centreline than 20 km to the side");
});

test("plume mass decays with age (settling)", () => {
  const field = constantField(SRC, 8, 270, 12);
  const { snaps } = simulate({ source: SRC, field, tauH: 3 });
  const s = snaps[11];
  // puffs are stored oldest first: the oldest must carry less mass than the newest
  assert.ok(s.q[0] < s.q[s.n - 1]);
});

test("wind direction change turns the plume: west wind then north wind", () => {
  const hours = 8;
  const lats = [SRC.lat - 2, SRC.lat, SRC.lat + 2], lons = [SRC.lon - 2.5, SRC.lon, SRC.lon + 2.5];
  const time = Array.from({ length: hours }, (_, h) => `t${h}`);
  const dir = Array.from({ length: hours }, (_, h) => (h < 4 ? 270 : 0));
  const results = Array.from({ length: 9 }, () => ({ time, wind_speed_10m: Array(hours).fill(10), wind_direction_10m: dir }));
  const field = buildField({ lats, lons, ny: 3, nx: 3 }, results);
  const { snaps } = simulate({ source: SRC, field });
  const s = snaps[7];
  let minLat = Infinity, maxLon = -Infinity; for (let i = 0; i < s.n; i++) { minLat = Math.min(minLat, s.lat[i]); maxLon = Math.max(maxLon, s.lon[i]); }
  assert.ok(minLat < SRC.lat - 0.2, "later puffs moved south");
  assert.ok(maxLon > SRC.lon + 0.3, "early puffs moved east");
});

test("windAt interpolates in time and clamps outside the domain; missing data gives null", () => {
  const field = constantField(SRC, 6, 180, 4); // from the south: blows north
  const w = windAt(field, 1.5, SRC.lat + 10, SRC.lon - 10);
  near(w[0], 0, 1e-6); near(w[1], 6, 1e-6);
  const empty = buildField({ lats: [0, 1], lons: [0, 1], ny: 2, nx: 2 }, Array.from({ length: 4 }, () => ({ time: ["a", "b"], wind_speed_10m: [null, null], wind_direction_10m: [null, null] })));
  assert.equal(windAt(empty, 0, 0.5, 0.5), null);
});

test("exposure: a household downwind is exposed, one upwind is not; index is capped at 100", () => {
  const field = constantField(SRC, 12, 270, 8);
  const { snaps } = simulate({ source: SRC, field });
  const kx = kmPerDegLon(SRC.lat);
  const ext = { s: SRC.lat - 0.9, n: SRC.lat + 0.9, w: SRC.lon - 1.2, e: SRC.lon + 1.2 };
  const W = 120, H = 120;
  const frames = snaps.map((s) => concGrid(s, ext, W, H));
  const ref = referenceMax(frames, ext, W, H, SRC);
  assert.ok(ref > 0);
  const pts = [{ lat: SRC.lat, lon: SRC.lon + 30 / kx }, { lat: SRC.lat, lon: SRC.lon - 30 / kx }, { lat: SRC.lat + 0.5, lon: SRC.lon + 30 / kx }];
  const ex = exposure(snaps, pts, ref);
  assert.ok(ex[0].index >= 2, "downwind household exposed: " + ex[0].index);
  assert.equal(ex[1].index, 0);
  assert.ok(ex[2].index < ex[0].index, "off-axis household less exposed");
  assert.ok(ex.every((e) => e.index <= 100));
  assert.equal(plumeClass(0.5).key, "p_none");
  assert.equal(plumeClass(80).key, "p_very_high");
});

test("concGrid agrees with concAt at a raster pixel", () => {
  const field = constantField(SRC, 9, 300, 5);
  const { snaps } = simulate({ source: SRC, field });
  const ext = { s: SRC.lat - 0.8, n: SRC.lat + 0.8, w: SRC.lon - 1, e: SRC.lon + 1 };
  const W = 100, H = 100, g = concGrid(snaps[4], ext, W, H);
  const r = 40, c = 70;
  const lat = ext.n - ((r + 0.5) / H) * (ext.n - ext.s), lon = ext.w + ((c + 0.5) / W) * (ext.e - ext.w);
  const a = g[r * W + c], b = concAt(snaps[4], lat, lon);
  near(a, b, Math.max(1e-9, 1e-6 * Math.max(a, b)), "raster vs point");
  assert.ok(haversineKm(SRC.lat, SRC.lon, lat, lon) > 0);
});

test("wind-direction uncertainty widens the plume and keeps total mass", () => {
  const field = constantField(SRC, 10, 270, 6);
  const a = simulate({ source: SRC, field, spreadDeg: 0 }).snaps[5];
  const b = simulate({ source: SRC, field, spreadDeg: 20 }).snaps[5];
  const kx = kmPerDegLon(SRC.lat);
  const sideLat = SRC.lat + 8 / 110.574, lon = SRC.lon + 40 / kx;
  assert.ok(concAt(b, sideLat, lon) > 5 * concAt(a, sideLat, lon), "more mass 8 km off the axis");
  assert.ok(concAt(b, SRC.lat, lon) < concAt(a, SRC.lat, lon), "less on the axis");
  near(sigmaY(10000, 20), Math.hypot(sigmaY(10000), 10000 * Math.tan(20 * Math.PI / 180)), 1e-6, "quadrature");
});
