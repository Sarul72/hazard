/* The dzud tab's plain functions (js/dzud_data.js). */
import test from "node:test";
import assert from "node:assert/strict";
import { borrowedDensity, chanceOf, classCounts, coldSoFar, topSoums, winterFile, winterLabel, winterOf } from "../js/dzud_data.js";

test("a day belongs to the winter that starts in October", () => {
  assert.equal(winterOf("2026-11-12"), "2026-27");
  assert.equal(winterOf("2027-03-31"), "2026-27");
  assert.equal(winterOf("2026-10-01"), "2026-27");
  assert.equal(winterOf("2026-09-30"), "2025-26", "summer shows the winter that has just ended");
  assert.equal(winterOf("2000-01-15"), "1999-00");
  assert.equal(winterOf("2009-12-01"), "2009-10");
  assert.equal(winterLabel("2009-10"), "2009/10");
});

test("the outlook file while the winter runs, the hindcast after, nothing where ZudRisk has neither", () => {
  const ix = { winters: ["2023-24", "2024-25"], outlook: { winter: "2026-27", stage: "oct" } };
  assert.equal(winterFile("2026-27", ix), "data/outlook_2026-27.geojson");
  assert.equal(winterFile("2024-25", ix), "data/risk_2024-25.geojson");
  assert.equal(winterFile("2025-26", ix), null);
  assert.equal(winterFile("2024-25", { winters: ["2024-25"] }), "data/risk_2024-25.geojson", "no outlook published");
});

test("the chance follows ZudRisk's calibration and is withheld without skill", () => {
  const cal = { stages: { mar: { a: 1.6733, b: -1.914, bss: 0.087 }, oct: { a: 1, b: -2, bss: 0 } } };
  assert.ok(Math.abs(chanceOf(cal, null, 0) - 1 / (1 + Math.exp(1.914))) < 1e-12, "a hindcast is the whole winter");
  assert.ok(chanceOf(cal, "mar", 2) > chanceOf(cal, "mar", 0), "more risk, more chance");
  assert.equal(chanceOf(cal, "oct", 1), null, "Brier skill 0: no chance shown");
  assert.equal(chanceOf(cal, "mar", null), null);
  assert.equal(chanceOf(null, "mar", 1), null);
  assert.equal(chanceOf(cal, "dec", 1), null, "a stage with no calibration");
});

test("class counts and the highest-risk soums", () => {
  const f = (risk, risk_class) => ({ properties: { risk, risk_class } });
  const fs = [f(1.2, 4), f(-0.3, 2), f(null, null), f(0.7, 3), f(-1.5, 0)];
  assert.deepEqual(classCounts(fs), { counts: [1, 0, 1, 1, 1], none: 1 });
  assert.deepEqual(topSoums(fs, 2).map((x) => x.properties.risk), [1.2, 0.7]);
  assert.equal(topSoums(fs).length, 4, "soums with no risk are left out");
});

test("the cold label says so while the winter is under way", () => {
  assert.equal(coldSoFar("nov"), true);
  assert.equal(coldSoFar("dec"), true);
  assert.equal(coldSoFar("jan"), true);
  assert.equal(coldSoFar("feb"), false, "November to February is complete from the February stage");
  assert.equal(coldSoFar("mar"), false);
  assert.equal(coldSoFar(undefined), false, "a hindcast is the whole winter");
  assert.equal(coldSoFar("oct"), false, "no winter month yet: no cold to label");
});

test("aimag centres and Ulaanbaatar districts carry a borrowed herd density", () => {
  assert.equal(borrowedDensity({ is_centre: true, is_ub: false }), "centre");
  assert.equal(borrowedDensity({ is_centre: false, is_ub: true }), "ub");
  assert.equal(borrowedDensity({ is_centre: false, is_ub: false }), null);
  assert.equal(borrowedDensity({}), null, "files without the flags");
});
