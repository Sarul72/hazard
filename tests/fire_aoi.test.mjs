/* The burned area check of a chosen area (js/aoi/fire.js): periods, MODIS day windows and severity classes, each on a
 * case worked out by hand. check() is plain JavaScript so it also runs in a browser where Node is not installed. */
import { CLASSES, burnWindow, classOf, fireBands, periods, scaleFor } from "../js/aoi/fire.js";
import { modisTiles } from "../js/aoi/stac.js";

export function check() {
  const out = [];
  const yes = (name, cond) => out.push({ name, got: cond, want: true, ok: cond === true });

  // spring fires take the previous autumn before, and MODIS and fires are compared from the typed date
  const sp = periods(["2019-04-01", "2019-04-27"], ["2019-05-02", "2019-05-30"], true);
  yes("spring: autumn of the year before", sp.spring && sp.before[0] === "2018-09-15" && sp.before[1] === "2018-10-31");
  yes("spring: comparison from the typed pre-fire end", sp.compareFrom === "2019-04-27");
  const su = periods(["2020-07-01", "2020-07-20"], ["2020-07-25", "2020-08-20"], true);
  yes("summer: the typed periods stay", !su.spring && su.before[0] === "2020-07-01" && su.compareFrom === "2020-07-20");
  yes("spring option off: the typed periods stay", !periods(["2019-04-01", "2019-04-27"], ["2019-05-02", "2019-05-30"], false).spring);

  // MODIS BurnDate is a day of the image's own year
  const [a, b] = burnWindow(2019, "2019-04-27", "2019-05-31");
  yes("April 27 to May 30 is days 117 to 150", a === 117 && b === 151);
  const [dA, dB] = burnWindow(2020, "2020-12-20", "2021-01-11"), [jA, jB] = burnWindow(2021, "2020-12-20", "2021-01-11");
  yes("December image: days 355 to 376", dA === 355 && dB === 377);
  yes("January image: days -11 to 10", jA === -11 && jB === 11);

  // an 8-day fire file keeps only the days in the period
  yes("bands of 8 days inside the period", fireBands("2019-04-23", "2019-04-27", "2019-05-31").join() === "5,6,7,8");
  yes("a file before the period gives none", fireBands("2019-04-01", "2019-04-27", "2019-05-31").length === 0);

  // Key and Benson classes and sizes
  yes("class limits", classOf(0.0999) === 2 && classOf(0.10) === 3 && classOf(0.27) === 4 && classOf(0.66) === 6 && classOf(-0.3) === 0);
  yes("no data is 255", classOf(NaN) === 255);
  yes("seven classes in order", CLASSES.length === 7 && CLASSES.every((c, i) => !i || c.from === CLASSES[i - 1].to));
  yes("20 m up to 500 km2, 40 m up to 2,000, then 60 m", scaleFor(500) === 20 && scaleFor(1500) === 40 && scaleFor(4000) === 60);

  // MODIS sinusoidal tiles: western Dornod is h25v04, eastern Dornod h26v04
  const tiles = (b) => modisTiles(b).map((x) => `h${x.h}v${String(x.v).padStart(2, "0")}`).join();
  yes("April 2019 fire is in h25v04", tiles({ w: 115.60, s: 48.95, e: 115.90, n: 49.10 }) === "h25v04");
  yes("April 2023 fire is in h26v04", tiles({ w: 117.50, s: 46.90, e: 117.80, n: 47.05 }) === "h26v04");
  return out;
}

if (typeof process !== "undefined" && process.versions?.node) {
  const { default: test } = await import("node:test");
  const { default: assert } = await import("node:assert/strict");
  test("burned area check of a chosen area", () => assert.deepEqual(check().filter((r) => !r.ok), []));
}
