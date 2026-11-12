/* The day-by-day mine dust model (js/minedaily.js) and the area source added to js/plume.js, each against a case worked
 * out by hand. check() is plain JavaScript so it also runs in a browser where Node is not installed. */
import { DAILY, dayList, dayStats, distanceFrom, domain, doseGrid, mineEmission, periodScale, pitPoints } from "../js/minedaily.js";
import { buildField, simulate } from "../js/plume.js";

export function check() {
  const out = [];
  const yes = (name, cond) => out.push({ name, got: cond, want: true, ok: cond === true });
  const near = (name, got, want, tol = 1e-9) => out.push({ name, got, want, ok: Math.abs(got - want) <= tol });

  // emission: handling at any wind when dry, erosion added from the onset, nothing when wet or snowy
  const h6 = (6 / 2.2) ** 1.3;
  near("calm still emits from haulage", mineEmission(1), (1 / 2.2) ** 1.3);
  near("at the onset only haulage", mineEmission(6), h6);
  near("at 12 m/s erosion adds 7 times the onset haulage", mineEmission(12) - (12 / 2.2) ** 1.3, 7 * h6, 1e-9);
  yes("rain of 0.254 mm stops it", mineEmission(10, 0.254) === 0 && mineEmission(10, 0.2) > 0);
  yes("wet topsoil stops it", mineEmission(10, 0, 0.25) === 0 && mineEmission(10, 0, 0.05) > 0);
  yes("snow of 1 cm stops it", mineEmission(10, 0, null, 0.01) === 0);
  yes("no wind value gives nothing", mineEmission(NaN) === 0);

  // release points fall inside the outline, or around the point without one
  const ring = [[105.48, 43.67], [105.54, 43.67], [105.54, 43.69], [105.48, 43.69], [105.48, 43.67]];
  const pts = pitPoints(ring, 12);
  yes("12 points inside the pit", pts.length === 12 && pts.every((p) => p.lat > 43.67 && p.lat < 43.69 && p.lon > 105.48 && p.lon < 105.54));
  const circ = pitPoints(null, 7, { lat: 44, lon: 105 });
  yes("without an outline: the point and a 1.5 km ring", circ.length === 7 && circ[0].lat === 44 && Math.abs(Math.hypot((circ[1].lat - 44) * 110.574, (circ[1].lon - 105) * 111.32 * Math.cos(44 * Math.PI / 180)) - 1.5) < 0.01);

  // the domain is 600 x 600 cells of 100 m for 30 km
  const dom = domain(43.6678, 105.5181);
  yes("600 x 600 cells", dom.w === 600 && dom.h === 600);
  near("cell height 100 m", ((dom.extent.n - dom.extent.s) / dom.h) * 110.574 * 1000, 100, 0.01);

  // steady wind from the north-west carries the dust to the south-east, on the model itself
  const g = { lats: [43.4, 43.9], lons: [105.2, 105.8], ny: 2, nx: 2 };
  const res = Array.from({ length: 4 }, () => ({ time: ["0", "1", "2", "3", "4", "5"], wind_speed_10m: Array(6).fill(8), wind_direction_10m: Array(6).fill(315) }));
  const mine = { lat: 43.6678, lon: 105.5181 }, small = domain(mine.lat, mine.lon, 30, 500);
  const sim = simulate({ sources: [mine, { lat: 43.67, lon: 105.52 }], field: buildField(g, res), dtMin: 5, snapMin: 30, maxAgeH: 4 });
  yes("half-hour snapshots in time order", sim.snaps.length === 12);
  const dose = doseGrid(sim.snaps.slice(4), small), dist = distanceFrom([mine], small), ref = periodScale([dose], dist);
  const s = dayStats(dose, dist, small, mine, ref);
  yes("north-west wind sends it south-east", s.dir === "SE" && Math.abs(s.bearing - 135) < 5);
  yes("it reaches the edge of the 30 km domain at 8 m/s", s.edge === true && s.peak === 100);
  const one = simulate({ source: mine, field: buildField(g, res), dtMin: 5 });
  yes("one source still gives hourly snapshots", one.snaps.length === 6);

  // the scale ignores the pit itself
  const d = new Float32Array(small.w * small.h), di = distanceFrom([mine], small), centre = Math.floor(small.h / 2) * small.w + Math.floor(small.w / 2);
  d[centre] = 50; d[centre + 20] = 4;
  near("period scale skips cells within 3 km", periodScale([d], di), 4);
  yes("days in order", dayList("2025-06-29", 3).join() === "2025-06-29,2025-06-30,2025-07-01");
  yes("defaults: 100 m, 30 km, 6 m/s onset", DAILY.cellM === 100 && DAILY.radiusKm === 30 && DAILY.onset === 6);
  return out;
}

if (typeof process !== "undefined" && process.versions?.node) {
  const { default: test } = await import("node:test");
  const { default: assert } = await import("node:assert/strict");
  test("mine dust day by day", () => assert.deepEqual(check().filter((r) => !r.ok), []));
}
