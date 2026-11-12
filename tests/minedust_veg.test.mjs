/* The wind-sector vegetation contrast (js/minedust_veg.js) against cases worked out by hand. check() is plain
 * JavaScript so it also runs in a browser where Node is not installed. */
import { VEG, anomalyGrid, bearingKm, campsExposed, classify, deficits, footprintKm2, geometry, innerRingCells, reaches, sectorOf, sectorRingStats, spearman, windRose } from "../js/minedust_veg.js";
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
  return out;
}

if (typeof process !== "undefined" && process.versions?.node) {
  const { default: test } = await import("node:test");
  const { default: assert } = await import("node:assert/strict");
  test("mine dust and vegetation", () => assert.deepEqual(check().filter((r) => !r.ok), []));
}
