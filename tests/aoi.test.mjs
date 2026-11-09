/* The raster steps of the detailed flood check (js/aoi), each against a case worked out by hand.
 * check() is plain JavaScript so it also runs in a browser where Node is not installed. */
import { boxAreaKm2, connectedSizes, focalMeanCircle, makeGrid, minCount, rowAreaKm2, slopeDeg } from "../js/aoi/raster.js";
import { parseNpy, passes } from "../js/aoi/stac.js";
import { scaleFor } from "../js/aoi/flood.js";

export function check() {
  const out = [];
  const yes = (name, cond) => out.push({ name, got: cond, want: true, ok: cond === true });
  const near = (name, got, want, tol) => out.push({ name, got, want, ok: Math.abs(got - want) <= tol });

  // grid: square 10 m pixels at the centre latitude, areas that add up to the box
  const box = { s: 50.12, n: 50.28, w: 106.05, e: 106.33 }, g = makeGrid(box, 10);
  near("pixel height 10 m", g.dy * 111320, 10, 1e-9);
  near("pixel width 10 m at the centre", g.dx * 111320 * Math.cos(50.2 * Math.PI / 180), 10, 1e-9);
  near("rows add up to the box area", rowAreaKm2(g).reduce((a, b) => a + b, 0) * g.w, boxAreaKm2(box), 0.005 * boxAreaKm2(box));
  near("Selenge test box is 355 km2", boxAreaKm2(box), 355.4, 0.5);
  yes("10 m up to 500 km2, then 20 m, then 30 m", scaleFor(355) === 10 && scaleFor(1500) === 20 && scaleFor(4000) === 30);
  yes("smallest group stays near 800 m2", minCount(8, 10) === 8 && minCount(8, 20) === 2 && minCount(8, 30) === 1);

  // circle of radius 5 pixels holds 81 pixels, as ee.Kernel.circle(50, 'meters') at 10 m
  const w = 21, h = 21, one = new Float32Array(w * h);
  one[10 * w + 10] = 81;
  near("circle mean of a single 81 is 1", focalMeanCircle(one, w, h, 5)[10 * w + 10], 1, 1e-6);
  near("radius 5 reaches 5 pixels along a row", focalMeanCircle(one, w, h, 5)[10 * w + 15], 1, 1e-6);
  near("but not 4 + 4 on the diagonal", focalMeanCircle(one, w, h, 5)[14 * w + 14], 0, 1e-9);
  const holes = new Float32Array(9).fill(-20); holes[4] = NaN;
  near("missing pixels are left out of the mean", focalMeanCircle(holes, 3, 3, 1.5)[4], -20, 1e-6);

  // groups touch along edges and corners (8 neighbours), as connectedPixelCount
  const m = new Uint8Array(16);
  for (const i of [0, 5, 10, 12]) m[i] = 1; // (0,0) (1,1) (2,2) on a diagonal, (3,0) alone
  const s = connectedSizes(m, 4, 4);
  yes("a diagonal line is one group of 3", s[0] === 3 && s[5] === 3 && s[10] === 3 && s[12] === 1 && s[1] === 0);

  // a plane rising 1 m per 10 m to the east has a slope of atan(0.1)
  const dg = makeGrid(box, 30), dem = new Float32Array(25);
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) dem[r * 5 + c] = c * 3; // 3 m per 30 m pixel
  near("slope of a plane", slopeDeg(dem, 5, 5, dg.dx, -dg.dy, dg.lat0)[12], Math.atan(0.1) * 180 / Math.PI, 0.01);

  // a NumPy file of two bands (value and mask), as the data API sends
  const header = "{'descr': '<f4', 'fortran_order': False, 'shape': (2, 1, 2), }";
  const pad = 64 - ((10 + header.length + 1) % 64), text = header + " ".repeat(pad) + "\n";
  const buf = new Uint8Array(10 + text.length + 16), dv = new DataView(buf.buffer);
  buf.set([0x93, ...[..."NUMPY"].map((ch) => ch.charCodeAt(0)), 1, 0]); dv.setUint16(8, text.length, true);
  buf.set([...text].map((ch) => ch.charCodeAt(0)), 10);
  new Float32Array(buf.buffer, 10 + text.length, 4).set([1.5, -2, 255, 0]);
  const npy = parseNpy(buf.buffer);
  yes("npy shape and values", npy.shape.join() === "2,1,2" && npy.data[0] === 1.5 && npy.data[1] === -2 && npy.data[3] === 0);

  // frames of one pass are grouped, a pass 12 days later is not
  const it = (d) => ({ properties: { datetime: d } });
  const p = passes([it("2021-09-13T23:07:23Z"), it("2021-08-20T23:07:22Z"), it("2021-09-13T23:07:48Z")]);
  yes("frames of a pass are grouped in time order", p.length === 2 && p[1].items.length === 2 && p[0].items.length === 1);
  return out;
}

if (typeof process !== "undefined" && process.versions?.node) {
  const { default: test } = await import("node:test");
  const { default: assert } = await import("node:assert/strict");
  test("detailed flood check: raster steps", () => assert.deepEqual(check().filter((r) => !r.ok), []));
}
