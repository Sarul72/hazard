/* The wind-sector vegetation contrast (js/minedust_veg.js) against cases worked out by hand. check() is plain
 * JavaScript so it also runs in a browser where Node is not installed. */
import { VEG, anomalyGrid, attribute, bearingKm, campsExposed, classify, combineRoses, deficits, emissionWeight, episodes, footprintKm2, geometry, hoursSinceRain, innerRingCells, rain24, reaches, sectorOf, sectorRingStats, soilThreshold, spearman, washedBetween, windRose } from "../js/minedust_veg.js";
import { domain } from "../js/minedaily.js";

export function check() {
  const out = [];
  const yes = (name, cond) => out.push({ name, got: cond, want: true, ok: cond === true });
  const near = (name, got, want, tol = 1e-9) => out.push({ name, got, want, ok: Math.abs(got - want) <= tol });

  // sectors: 0 is centred on north and spans [-11.25, 11.25)
  yes("north is sector 0", sectorOf(0) === 0 && sectorOf(359) === 0 && sectorOf(348.75) === 0);
  yes("11.25 opens sector 1", sectorOf(11.25) === 1);
  yes("east is sector 4", sectorOf(90) === 4);

  const bk = bearingKm(47, 108, 47, 108.5);
  near("half a degree east: bearing 90", bk.bearing, 90, 1);
  near("half a degree east at 47 N: 37.96 km", bk.km, 37.96, 0.3);

  // the rose: dust-carrying hours by downwind sector, weighted by speed; calm hours ignored
  const rose = windRose([8, 8, 2, 8], [0, 0, 90, 180]);
  near("two hours from the north land in the south sector", rose[8], 2 / 3, 1e-6);
  near("one hour from the south lands in the north sector", rose[0], 1 / 3, 1e-6);
  yes("the calm hour is ignored", rose[12] === 0 && rose[4] === 0);
  yes("no dust-carrying hour: all zero", windRose([1, 2], [0, 0]).every((v) => v === 0));

  // ring and sector statistics on a synthetic grid: 199 vegetation pixels give nothing, 200 give the mean
  const mine = { lat: 47.7506, lon: 108.3249 }, dom = domain(mine.lat, mine.lon, VEG.radiusKm, VEG.cellM);
  const geo = geometry(mine, dom);
  yes("600 x 600 cells with sector and ring", geo.sector.length === 360000 && geo.ring.length === 360000);
  const centre = Math.floor(dom.h / 2) * dom.w + Math.floor(dom.w / 2);
  yes("the pit is outside every ring", geo.ring[centre] === -1 && geo.km[centre] < 0.1);
  const southCell = centre + 45 * dom.w; // 4.5 km south: ring 0, sector 8
  yes("4.5 km south is ring 0 of sector 8", geo.ring[southCell] === 0 && geo.sector[southCell] === 8);
  const n = dom.w * dom.h, ndvi = new Float32Array(n).fill(NaN), veg = new Uint8Array(n);
  const cells = [];
  for (let i = 0; i < n; i++) if (geo.ring[i] === 0 && geo.sector[i] === 8) cells.push(i);
  for (let k = 0; k < 199; k++) { ndvi[cells[k]] = 0.5; veg[cells[k]] = 1; }
  let st = sectorRingStats(ndvi, veg, geo, VEG);
  yes("199 pixels: the cell is empty", Number.isNaN(st.mean[8 * 5 + 0]) && st.count[8 * 5 + 0] === 199);
  ndvi[cells[199]] = 0.7; veg[cells[199]] = 1;
  st = sectorRingStats(ndvi, veg, geo, VEG);
  near("200 pixels: the mean", st.mean[8 * 5 + 0], (199 * 0.5 + 0.7) / 200, 1e-6);

  // deficits against the ring median, with the noise of the ring
  const d = deficits({ mean: Float32Array.from([0.5, 0.5, 0.4, 0.5]), count: Int32Array.from([300, 300, 300, 300]) }, 1);
  near("ring median", d.ringMedian[0], 0.5, 1e-6);
  near("deficit of the dusty sector", d.deficit[2], -0.1, 1e-6);
  yes("threshold floor 0.02 when the ring is quiet", d.mad[0] === 0 && Math.abs(d.thr[0] - 0.02) < 1e-6);

  // reach: rings under the threshold, from the inside out, without a gap
  const r = reaches({ deficit: Float32Array.from([-0.05, -0.05, 0.0, -0.05]), thr: Float32Array.from([0.02, 0.02, 0.02, 0.02]) }, { n: 1, rings: [3, 6, 10, 15, 20] });
  yes("reach stops at the first ring that is not under", r[0] === 10);
  const r0 = reaches({ deficit: Float32Array.from([0.0, -0.05, -0.05, -0.05]), thr: Float32Array.from([0.02, 0.02, 0.02, 0.02]) }, { n: 1, rings: [3, 6, 10, 15, 20] });
  yes("no mark in the inner ring: reach 0", r0[0] === 0);

  const pad = (a) => { const o = new Float32Array(16); o.set(a); return o; };
  const c = classify(pad([10, 10, 0, 0]), pad([0.1, 0.01, 0.2, 0.05]), 16);
  yes("mark and wind: dusty", c[0] === 2);
  yes("mark without wind: unclear", c[1] === 1);
  yes("wind without a mark: unclear", c[2] === 1);
  yes("neither: clear", c[3] === 0);

  const calm = classify(pad([10, 0]), new Float32Array(16), 16);
  yes("calm summer: a mark is unclear, no mark is clear, nothing is dusty", calm[0] === 1 && calm[1] === 0 && !calm.includes(2));

  // how many inner-ring sectors hold enough vegetation to be measured
  const sparse = { mean: new Float32Array(16 * 5).fill(NaN), count: new Int32Array(16 * 5) };
  for (let s = 0; s < 7; s++) sparse.mean[s * 5] = 0.4;
  yes("seven measured inner-ring sectors", innerRingCells(sparse, 5) === 7);

  near("spearman of a reversed order", spearman([1, 2, 3, 4], [4, 3, 2, 1]), -1, 1e-9);
  yes("spearman needs four pairs", Number.isNaN(spearman([1, 2, 3], [1, 2, 3])));

  // area: one dusty sector of 16 reaching 10 km holds (10^2 - 3^2) pi / 16
  const reach = new Float32Array(16), cls = new Uint8Array(16); reach[8] = 10; cls[8] = 2;
  near("footprint area", footprintKm2(reach, cls, { rings: [3, 6, 10, 15, 20, 30], n: 16 }), (Math.PI * (100 - 9)) / 16, 1e-6);

  // camps: inside a dusty sector within its reach, beyond 3 km
  const south = (km) => ({ lat: mine.lat - km / 110.574, lon: mine.lon, parcels: 1, herders: 2 });
  const e = campsExposed([south(5), south(2.9), south(7), { lat: mine.lat + 5 / 110.574, lon: mine.lon, parcels: 1, herders: 1 }], mine, Float32Array.from([...Array(8).fill(0), 6, ...Array(7).fill(0)]), cls, 16);
  yes("one camp 5 km south is exposed", e.parcels === 1 && e.herders === 2 && e.points.length === 1);
  const edge = campsExposed([south(3), south(6)], mine, Float32Array.from([...Array(8).fill(0), 6, ...Array(7).fill(0)]), cls, 16);
  yes("camps exactly at 3 km and exactly at the reach are counted", edge.points.length === 2);

  // the anomaly map: vegetation pixels minus their ring median, nothing elsewhere
  const an = anomalyGrid(ndvi, veg, geo, Float32Array.from([0.6, 0.6, 0.6, 0.6, 0.6]));
  near("anomaly of a vegetation pixel", an[cells[0]], -0.1, 1e-6);
  yes("no anomaly outside vegetation or rings", Number.isNaN(an[centre]) && Number.isNaN(an[cells[250]]));

  // emission episodes: rolling rain, hours since rain, the soil quantile, the weight gate
  const p = new Float32Array(72); p[10] = 1.5; p[11] = 1; // 2.5 mm over hours 10-11
  const r24 = rain24(p);
  near("24 h sum at hour 11", r24[11], 2.5, 1e-6);
  near("24 h sum still holds at hour 33", r24[33], 2.5, 1e-6);
  near("24 h sum drops to 1 at hour 34 and 0 at hour 35", r24[34] + r24[35], 1, 1e-6);
  const since = hoursSinceRain(p, 2);
  yes("before any rain: Infinity", since[5] === Infinity);
  yes("the hour the qualifying rain fell: 0; 1.5 mm alone at hour 10 does not qualify", since[11] === 0 && since[10] === Infinity);
  yes("hours since the rain fell, not since the rolling sum fell", since[12] === 1 && since[35] === 24);
  const p2 = new Float32Array(72); p2[10] = 3; p2[40] = 0.2; // a later drizzle inside no qualifying 24 h sum does not reset
  yes("a drizzle after the rain does not reset the count", hoursSinceRain(p2, 2)[50] === 40);
  near("soil threshold is the median", soilThreshold(Float32Array.from([0.3, NaN, 0.1, 0.2]), 0.5), 0.2, 1e-6);
  yes("soil threshold NaN without values", Number.isNaN(soilThreshold(Float32Array.from([NaN, NaN]), 0.5)));
  const sp = new Float32Array(72).fill(8), soil = new Float32Array(72).fill(0.15); soil[60] = 0.4;
  const wt = emissionWeight({ speed: sp, precip: p, soil });
  yes("windy hour before the rain counts", Math.abs(wt[5] - 2 * 64) < 1e-6);
  yes("windy hour 9 h and 23 h after rain does not", wt[20] === 0 && wt[34] === 0);
  yes("24 h after rain it counts again", Math.abs(wt[35] - 128) < 1e-6);
  const nanDir = emissionWeight({ speed: Float32Array.from([8, 8]), dir: Float32Array.from([NaN, 90]), precip: Float32Array.from([0, 0]), soil: Float32Array.from([0.1, 0.1]) });
  yes("an hour without a wind direction carries no weight", nanDir[0] === 0 && Math.abs(nanDir[1] - 128) < 1e-6);
  yes("wet soil blocks the hour", wt[60] === 0 && Math.abs(wt[61] - 128) < 1e-6);
  const noSoil = emissionWeight({ speed: sp, precip: p, soil: new Float32Array(72).fill(NaN) });
  yes("unknown soil: no soil condition", Math.abs(noSoil[60] - 128) < 1e-6);
  yes("calm hour: 0", emissionWeight({ speed: Float32Array.from([5.9]), precip: Float32Array.from([0]), soil: Float32Array.from([0.1]) })[0] === 0);

  // runs of weighted hours join across a gap of six zero hours, not seven; under two weighted hours they are dropped
  const times = Array.from({ length: 40 }, (_, h) => `2025-07-01T${String(h % 24).padStart(2, "0")}:00`);
  const w = new Float32Array(40), dirs = new Float32Array(40).fill(0), spd = new Float32Array(40).fill(8), sm = new Float32Array(40).fill(0.1), sr = new Float32Array(40).fill(100);
  w[0] = 1; w[1] = 1; w[8] = 1; w[9] = 1; w[17] = 1; w[30] = 1;
  const ep = episodes({ time: times, speed: spd, dir: dirs, soil: sm, sinceRain: sr }, w);
  yes("one episode: 0-9 joined over six zeros; 17 alone and 30 alone dropped", ep.length === 1 && ep[0].i0 === 0 && ep[0].i1 === 9 && ep[0].hours === 4);
  w[16] = 1; // 10..15 is a gap of six: joins
  const ep2 = episodes({ time: times, speed: spd, dir: dirs, soil: sm, sinceRain: sr }, w);
  yes("a gap of six joins", ep2.length === 1 && ep2[0].i1 === 17);
  w[16] = 0; w[17] = 0; w[18] = 1; w[19] = 1; // 10..17 is a gap of eight: a new episode
  const ep3 = episodes({ time: times, speed: spd, dir: dirs, soil: sm, sinceRain: sr }, w);
  yes("a gap of eight splits", ep3.length === 2 && ep3[1].i0 === 18 && ep3[1].i1 === 19);
  near("north wind: the episode's rose points south", ep3[0].rose[8], 1, 1e-6);
  yes("the episode keeps its weight, top speed, soil and hours since rain", ep3[0].weight === 4 && ep3[0].umax === 8 && Math.abs(ep3[0].soil - 0.1) < 1e-6 && ep3[0].sinceRain === 100 && ep3[0].start === times[0] && ep3[0].end === times[9]);

  // washed: a 24 h sum of 5 mm between the episode's end and the pass
  const pw = new Float32Array(100); pw[50] = 5;
  yes("rain of 5 mm after the episode washes it", washedBetween(pw, 40, 80, 5) === true);
  yes("rain before the episode does not", washedBetween(pw, 60, 80, 5) === false);
  yes("4 mm does not wash", washedBetween(Float32Array.from(pw, (v) => v * 0.8), 40, 80, 5) === false);

  // the combined rose of the picked episodes, by weight
  const eA = { weight: 3, rose: pad([1]) }, eB = { weight: 1, rose: pad([0, 0, 0, 0, 1]) };
  const cr = combineRoses([eA, eB], [true, true]);
  near("three quarters north", cr[0], 0.75, 1e-6); near("one quarter east", cr[4], 0.25, 1e-6);
  yes("nothing picked: all zero", combineRoses([eA, eB], [false, false]).every((v) => v === 0));

  // attribution: a dusted pixel off the wind becomes 6, a clean or bare pixel stays
  const at = attribute(Uint8Array.from([2, 3, 4, 5, 1, 0, 2]), Int8Array.from([0, 0, 4, 4, 4, 4, 8]), pad([0.5, 0, 0, 0, 0.0625]), 16);
  yes("downwind dusted pixels keep their class", at[0] === 2 && at[1] === 3 && at[2] === 4);
  yes("clean, bare and outside stay", at[3] === 5 && at[4] === 1 && at[5] === 0);
  yes("a dusted pixel off the wind is another cause", at[6] === 6);
  return out;
}

if (typeof process !== "undefined" && process.versions?.node) {
  const { default: test } = await import("node:test");
  const { default: assert } = await import("node:assert/strict");
  test("mine dust and vegetation", () => assert.deepEqual(check().filter((r) => !r.ok), []));
}
