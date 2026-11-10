/* Raster classes to polygons (js/aoi/vector.js), each against a case worked out by hand.
 * check() is plain JavaScript so it also runs in a browser where Node is not installed. */
import { groups, polygonize, ringTurn, traceRings } from "../js/aoi/vector.js";

/** Signed area of a lon/lat ring, positive when counterclockwise (GeoJSON's outer rings). */
const area = (ring) => { let s = 0; for (let k = 0; k + 1 < ring.length; k++) s += ring[k][0] * ring[k + 1][1] - ring[k + 1][0] * ring[k][1]; return s / 2; };
/** How often each point appears in a ring, the closing point left out: a valid ring has every point once. */
const repeats = (ring) => { const seen = new Map(); for (const p of ring.slice(0, -1)) seen.set(p.join(), (seen.get(p.join()) ?? 0) + 1); return Math.max(...seen.values()); };
const rows = (s) => s.trim().split("\n").map((r) => r.trim());
const raster = (s) => { const r = rows(s); return { w: r[0].length, h: r.length, code: Uint8Array.from(r.join(""), (ch) => Number(ch)) }; };

export function check() {
  const out = [];
  const yes = (name, cond) => out.push({ name, got: cond, want: true, ok: cond === true });
  const near = (name, got, want, tol = 1e-9) => out.push({ name, got, want, ok: Math.abs(got - want) <= tol });
  const unit = (w, h) => ({ west: 0, north: h, dx: 1, dy: 1, w, h }), ones = (h) => new Float64Array(h).fill(1);

  // a single pixel: one square, four corners, outer ring counterclockwise in GeoJSON
  let r = raster("000\n010\n000"), p = polygonize(r.code, unit(r.w, r.h), { rowKm2: ones(r.h) });
  let ring = p.get(1).polygons[0][0];
  yes("one pixel gives one polygon of 4 corners", p.get(1).n === 1 && ring.length === 5 && ring[0].join() === ring[4].join());
  near("its area is one pixel", area(ring), 1);
  yes("the square sits on the pixel", ring.every(([x, y]) => (x === 1 || x === 2) && (y === 1 || y === 2)));

  // straight edges keep only their corners: a 3 by 2 block is a rectangle of 4 corners
  r = raster("0000\n0111\n0111"); p = polygonize(r.code, unit(r.w, r.h), { rowKm2: ones(r.h) });
  ring = p.get(1).polygons[0][0];
  yes("a block keeps only its 4 corners", ring.length === 5);
  near("a block of 6 pixels has area 6", area(ring), 6);

  // a ring of pixels: outer ring and one hole, the hole clockwise
  r = raster("11111\n10001\n10001\n11111"); p = polygonize(r.code, unit(r.w, r.h), { rowKm2: ones(r.h) });
  let poly = p.get(1).polygons[0];
  yes("a pixel ring is one polygon with one hole", p.get(1).polygons.length === 1 && poly.length === 2);
  near("outer area 20, hole area -6", area(poly[0]) + area(poly[1]), 14);
  yes("the hole runs clockwise", area(poly[1]) < 0);
  near("area in km2 counts the pixels", p.get(1).km2, 14);

  // two classes side by side: each gets its own polygon, their shared edge is in both
  r = raster("1122\n1122"); p = polygonize(r.code, unit(r.w, r.h), { rowKm2: ones(r.h) });
  near("class 1 area 4", area(p.get(1).polygons[0][0]), 4);
  near("class 2 area 4", area(p.get(2).polygons[0][0]), 4);

  // pixels touching only at a corner stay two polygons, and neither ring passes the corner twice
  r = raster("10\n01"); p = polygonize(r.code, unit(r.w, r.h), { rowKm2: ones(r.h) });
  yes("corner-touching pixels of different groups stay apart", p.get(1).n === 2 && p.get(1).polygons.every((q) => q.length === 1 && repeats(q[0]) === 1));
  r = raster("01\n10"); p = polygonize(r.code, unit(r.w, r.h), { rowKm2: ones(r.h) });
  yes("the other diagonal too", p.get(1).n === 2 && p.get(1).polygons.every((q) => repeats(q[0]) === 1));

  // a hole that touches the outside at one corner: the group's own pixels join at the corner, so the hole stays a hole
  r = raster("1111\n1001\n1001\n1110"); p = polygonize(r.code, unit(r.w, r.h), { rowKm2: ones(r.h) });
  poly = p.get(1).polygons[0];
  yes("a hole touching the outer ring at a corner is still a hole", p.get(1).n === 1 && poly.length === 2 && poly.every((q) => repeats(q) === 1));
  near("and the areas add up", area(poly[0]) + area(poly[1]), 11);

  // groups below the minimum are left out of the polygons but counted
  r = raster("1000\n0011\n0011"); p = polygonize(r.code, unit(r.w, r.h), { rowKm2: ones(r.h), minPixels: 2 });
  yes("a 1-pixel group is left out at minimum 2", p.get(1).n === 1 && p.get(1).smallN === 1);
  near("its area is reported apart", p.get(1).smallKm2, 1);
  near("the total still counts it", p.get(1).km2, 5);

  // codes not kept give no polygons; real coordinates and row areas are used
  r = raster("12\n21"); p = polygonize(r.code, { west: 100, north: 50, dx: 0.5, dy: 0.25, w: 2, h: 2 }, { rowKm2: Float64Array.from([2, 3]), keep: (v) => v === 2 });
  yes("only kept codes are traced", !p.has(1) && p.get(2).n === 2);
  near("row areas are summed", p.get(2).km2, 5);
  ring = p.get(2).polygons.find((q) => q[0].some(([x]) => x === 101))[0];
  yes("corners are in degrees", ring.every(([x, y]) => (x === 100.5 || x === 101) && (y === 50 || y === 49.75)));

  // a noisy field: every pixel area ends up in exactly one ring, outer rings positive, holes negative
  const w = 40, h = 30, code = new Uint8Array(w * h);
  let seed = 7;
  for (let i = 0; i < w * h; i++) { seed = (seed * 16807) % 2147483647; code[i] = seed % 3; }
  const gr = groups(code, w, h, (v) => v > 0, ones(h)), rings = traceRings(gr, w, h);
  const total = rings.reduce((s, x) => s + ringTurn(x.pts) / 2, 0), kept = code.reduce((s, v) => s + (v > 0 ? 1 : 0), 0);
  near("noise: ring areas add up to the pixel count", total, kept);
  yes("noise: no ring passes a point twice", rings.every((x) => repeats(x.pts) === 1));
  const outer = new Map();
  for (const x of rings) if (ringTurn(x.pts) > 0) outer.set(x.g, (outer.get(x.g) ?? 0) + 1);
  yes("noise: every group has exactly one outer ring", outer.size === gr.value.length && [...outer.values()].every((n) => n === 1));
  return out;
}

if (typeof process !== "undefined" && process.versions?.node) {
  const { default: test } = await import("node:test");
  const { default: assert } = await import("node:assert/strict");
  test("raster classes to polygons", () => assert.deepEqual(check().filter((r) => !r.ok), []));
}
