/* The physics of the dust model, each part against a published table or an analytic result.
 * check() is plain JavaScript so it also runs in a browser where Node is not installed. */
import { buildField, buildMet, concAt, emissionFactor, plumeColor, plumeStats, shiftField, sigmaY, sigmaZ, simulate, stabilityClass } from "../js/plume.js";
import { KM_PER_DEG_LAT, kmPerDegLon } from "../js/geo.js";

const SRC = { lat: 43.67, lon: 105.52 };

function steady(speed, dirFrom, hours) {
  const grid = { lats: [SRC.lat - 3, SRC.lat, SRC.lat + 3], lons: [SRC.lon - 4, SRC.lon, SRC.lon + 4], ny: 3, nx: 3 };
  const time = Array.from({ length: hours }, (_, h) => `t${h}`);
  return buildField(grid, Array.from({ length: 9 }, () => ({ time, wind_speed_10m: Array(hours).fill(speed), wind_direction_10m: Array(hours).fill(dirFrom) })));
}
const met = (hours, cls, rain = 0, zi = 1000, frozen = false) => ({ cls: Array(hours).fill(cls), rain: Array(hours).fill(rain), zi: Array(hours).fill(zi), frozen: Array(hours).fill(frozen) });

export function check() {
  const out = [];
  const yes = (name, cond) => out.push({ name, got: cond, want: true, ok: cond === true });
  const same = (name, got, want) => out.push({ name, got, want, ok: got === want });
  const near = (name, got, want, tol) => out.push({ name, got, want, ok: Math.abs(got - want) <= tol });

  /* EPA-454/R-99-005 Table 6-7, every daytime cell */
  const table = [[1, "AABD"], [2.5, "ABCD"], [4, "BBCD"], [5.5, "CCDD"], [7, "CDDD"]];
  for (const [wind, row] of table) [1000, 800, 400, 100].forEach((solar, i) => same(`SRDT day ${wind} m/s, ${solar} W/m2`, stabilityClass(wind, solar, 0), row[i]));
  same("clear night, light wind", stabilityClass(1, 0, 10), "F");
  same("cloudy night, light wind", stabilityClass(1, 0, 90), "E");
  same("clear night, moderate wind", stabilityClass(2.2, 0, 10), "E");
  same("cloudy night, moderate wind", stabilityClass(2.2, 0, 90), "D");
  same("night, strong wind", stabilityClass(6, 0, 10), "D");
  same("no wind data is neutral", stabilityClass(null, 500, 10), "D");

  /* Briggs open country at 1 km */
  const q = Math.sqrt(1.1);
  [["A", 0.22], ["B", 0.16], ["C", 0.11], ["D", 0.08], ["E", 0.06], ["F", 0.04]].forEach(([c, k]) => near(`sigma y class ${c}`, sigmaY(1000, 0, c), Math.hypot(150, (k * 1000) / q), 1e-6));
  [["A", 200], ["B", 120], ["C", 80 / Math.sqrt(1.2)], ["D", 60 / Math.sqrt(2.5)], ["E", 30 / 1.3], ["F", 16 / 1.3]].forEach(([c, z]) => near(`sigma z class ${c}`, sigmaZ(1000, c, 1e6), Math.hypot(10, z), 1e-6));
  yes("the mixed layer caps sigma z", sigmaZ(1e6, "A", 500) < 500);

  /* A steady plume against the analytic ground-level Gaussian plume, C = Q / (pi u sigma_y sigma_z) */
  const u = 5, hours = 14, field = steady(u, 270, hours), kx = kmPerDegLon(SRC.lat);
  const snap = simulate({ source: SRC, field, tauH: 1e6, met: met(hours, "D", 0, 1e6), emission: () => 1 }).snaps[hours - 1];
  // Puffs leave every 3 minutes, 900 m apart here, so the level ripples along the plume: read it as the mean over one spacing.
  const model = (km) => [-0.45, -0.3, -0.15, 0, 0.15, 0.3].reduce((s, d) => s + concAt(snap, SRC.lat, SRC.lon + (km + d) / kx), 0) / 6;
  const exact = (km) => 1 / (sigmaY(km * 1000) * sigmaZ(km * 1000, "D", 1e6));
  for (const [a, b] of [[5, 20], [10, 40], [20, 60]]) {
    const ratio = model(a) / model(b) / (exact(a) / exact(b));
    near(`plume falls off like the equation, ${a} to ${b} km`, ratio, 1, 0.08);
  }
  near("plume level matches the equation at 20 km", model(20) / (1 / (Math.PI * u * sigmaY(20000) * sigmaZ(20000, "D", 1e6))), 1, 0.1);

  /* stability */
  const at = (cls) => { const s = simulate({ source: SRC, field: steady(3, 270, 6), tauH: 1e6, met: met(6, cls, 0, 1e6) }).snaps[5]; return concAt(s, SRC.lat, SRC.lon + 8 / kx); };
  yes("stable air keeps dust near the ground", at("F") > at("D") && at("D") > at("A"));

  /* rain */
  same("rain stops the emission", emissionFactor(8, 1), 0);
  yes("a trace of rain does not", emissionFactor(8, 0.1) > 0);
  near("AP-42 wind term", emissionFactor(4.4) / emissionFactor(2.2), 2 ** 1.3, 1e-9);
  const washed = (rain, frozen) => {
    const run = (r) => simulate({ source: SRC, field: steady(4, 270, 3), tauH: 1e6, emission: (s, w) => (w > 0 ? 1 : 1), met: { ...met(3, "D"), rain: [0, r, r], frozen: Array(3).fill(frozen) } }).snaps[2];
    const a = run(0), b = run(rain);
    return b.q[0] / a.q[0];
  };
  near("rain washes out by exp(-1e-4 R t)", washed(2, false), Math.exp(-1e-4 * 2 * 3600 * 1.0), 0.03);
  yes("snow washes out less than rain", washed(2, true) > washed(2, false));

  /* weather table */
  const m = buildMet({ shortwave_radiation: [800, 0], cloud_cover: [0, 0], precipitation: [0.3, null], temperature_2m: [-3, 5], boundary_layer_height: [40, null] }, [4, 1]);
  same("weather gives classes by hour", m.cls.join(""), "BF");
  same("missing rain is none", m.rain[1], 0);
  yes("frost means snow", m.frozen[0] === true && m.frozen[1] === false);
  yes("mixed layer has a floor and a default", m.zi[0] === 100 && m.zi[1] === 1000);

  /* wind shift */
  const f2 = shiftField(steady(10, 270, 2), 90, 0.5); // wind from the west, blowing east, turned clockwise: blowing south
  near("turned wind, east part", f2.u[0], 0, 1e-6);
  near("turned wind, north part", f2.v[0], -5, 1e-6);

  /* summary of a run */
  const ext = { s: SRC.lat - 1, n: SRC.lat + 1, w: SRC.lon - 1, e: SRC.lon + 1 }, W = 40, H = 40, frame = new Float32Array(W * H);
  frame[20 * W + 30] = 50; frame[20 * W + 31] = 100;
  const s = plumeStats([new Float32Array(W * H), frame], ext, W, H, SRC, 100);
  near("reach of the far cell in km", s.reach, ((31.5 / W) * 2 - 1) * kmPerDegLon(SRC.lat), 3);
  near("area of two cells", s.area, 2 * (2 / W) * kx * (2 / H) * KM_PER_DEG_LAT, 0.5);
  near("main direction is east", s.bearing, 90, 8);
  same("peak hour", s.peakHour, 1);
  same("nothing reaches the edge", s.edge, false);

  /* colours */
  same("below the visible limit nothing is drawn", plumeColor(0.9), null);
  yes("the edge fades out", plumeColor(1.3)[3] < plumeColor(5)[3] && plumeColor(5)[3] <= plumeColor(100)[3]);
  same("a class holds one colour", plumeColor(4).slice(0, 3).join(), plumeColor(7).slice(0, 3).join());
  yes("high index is darker", plumeColor(100)[0] < plumeColor(5)[0]);
  return out;
}

if (typeof process !== "undefined" && process.versions?.node) {
  const { default: test } = await import("node:test");
  const { default: assert } = await import("node:assert/strict");
  test("dust physics", () => assert.deepEqual(check().filter((r) => !r.ok), []));
}
