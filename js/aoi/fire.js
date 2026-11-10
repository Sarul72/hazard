/* Burned area and burn severity in a chosen box, computed in the browser. The steps are those of gee_app/fire_aoi.js:
 * Sentinel-2 NBR (B8, B12) medians of cloud-free pixels before and after the fire, dNBR = pre - post in the classes
 * of Key and Benson (2006), burned from 0.10; for spring fires (March-May) the pre-fire image comes from the previous
 * autumn (09-15 to 10-31), because March snow and melt water make unburned land look burned; MODIS MCD64A1 burned
 * area counted only on the days from the end of the typed pre-fire period to the end of the post-fire period.
 * Differences from the App: active fire comes from MODIS MOD14A1/MYD14A1 (1 km, Planetary Computer) instead of FIRMS,
 * whose API needs a key that cannot sit in a public page; each median uses the 4 clearest passes of the period, not
 * every image; NBR arrives in steps of 0.008. */
import { search, searchModis, passes, bandOnGrid } from "./stac.js";
import { CLOUDY_SCL, boxAreaKm2, makeGrid, rowAreaKm2 } from "./raster.js";

export const FIRE = { maxKm2: 500, hardKm2: 5000, burned: 0.10, maxCloud: 70, maxPasses: 4, fireMask: 7 };

// Key and Benson (2006), dNBR as a ratio (their table uses dNBR x 1000); same order and colours as the App
export const CLASSES = [
  { from: -2, to: -0.25, key: "regrow_high", color: [26, 152, 80] },
  { from: -0.25, to: -0.10, key: "regrow_low", color: [145, 207, 96] },
  { from: -0.10, to: 0.10, key: "unburned", color: [217, 217, 217] },
  { from: 0.10, to: 0.27, key: "low", color: [254, 224, 139] },
  { from: 0.27, to: 0.44, key: "mod_low", color: [253, 174, 97] },
  { from: 0.44, to: 0.66, key: "mod_high", color: [244, 109, 67] },
  { from: 0.66, to: 3, key: "high", color: [165, 0, 38] },
];

export const scaleFor = (km2) => (km2 <= FIRE.maxKm2 ? 20 : km2 <= 4 * FIRE.maxKm2 ? 40 : 60);
export const classOf = (d) => (Number.isNaN(d) ? 255 : CLASSES.findIndex((c) => d >= c.from && d < c.to));

const DAY = 86400000;
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const addDays = (d, n) => iso(Date.parse(d + "T00:00:00Z") + n * DAY);

/** The periods to compare, as readDates() of the App: spring fires take the previous autumn before. */
export function periods(before, after, autumn) {
  const month = Number(after[0].slice(5, 7));
  const spring = Boolean(autumn) && month >= 3 && month <= 5;
  const y = Number(after[0].slice(0, 4)) - 1;
  return { before: spring ? [`${y}-09-15`, `${y}-10-31`] : [...before], after: [...after], spring, compareFrom: before[1] };
}

/** Days of year in the image's own year for [from, to): a period across the new year is counted right. */
export function burnWindow(imageYear, from, toExclusive) {
  const jan1 = Date.parse(`${imageYear}-01-01T00:00:00Z`);
  return [Math.round((Date.parse(from + "T00:00:00Z") - jan1) / DAY) + 1, Math.round((Date.parse(toExclusive + "T00:00:00Z") - jan1) / DAY) + 1];
}

/** Bands of an 8-day MODIS fire file that fall in [from, to). */
export function fireBands(start, from, toExclusive) {
  const out = [];
  for (let b = 1; b <= 8; b++) { const d = addDays(start, b - 1); if (d >= from && d < toExclusive) out.push(b); }
  return out;
}

const nbrQuery = (item) => ({
  expression: Number(item.properties["s2:processing_baseline"]) >= 4 ? "(B08*1.0-B12)/(B08*1.0+B12-2000)" : "(B08*1.0-B12)/(B08*1.0+B12)",
  asset_as_band: "True", rescale: "-1,1",
});
const fromUnit = (v) => -1 + v * 2 / 255;
const asIs = (v) => v;
const flag = (v) => (v > 0 ? 1 : 0); // a true/false expression arrives as 0 and 1

async function band(g, items, query, decode) {
  let out = null;
  for (const it of items) out = await bandOnGrid(g, it, query, decode, out);
  return out ?? new Float32Array(g.w * g.h).fill(NaN);
}

/** Median NBR of the clear pixels of the clearest passes of a period; also how many images the period had. */
async function nbrMedian(g, box, from, to, step) {
  const items = (await search("sentinel-2-l2a", box, from, to)).filter((i) => (i.properties["eo:cloud_cover"] ?? 0) < FIRE.maxCloud);
  const ps = passes(items);
  if (!ps.length) return { count: 0, nbr: null };
  const cg = makeGrid(box, Math.max(120, g.scale));
  const shares = await Promise.all(ps.map(async (p) => {
    const scl = await band(cg, p.items, { assets: "SCL", rescale: "0,255" }, asIs);
    let ok = 0; for (const v of scl) if (!Number.isNaN(v) && !CLOUDY_SCL.has(v)) ok++;
    return ok / scl.length;
  }));
  const best = ps.map((p, i) => ({ p, s: shares[i] })).filter((x) => x.s > 0.02).sort((a, b) => b.s - a.s).slice(0, FIRE.maxPasses);
  const n = g.w * g.h, stack = [];
  for (const { p } of best) {
    step();
    const scl = await band(g, p.items, { assets: "SCL", rescale: "0,255" }, asIs);
    let v = null;
    for (const it of p.items) v = await bandOnGrid(g, it, nbrQuery(it), fromUnit, v);
    for (let i = 0; i < n; i++) if (Number.isNaN(scl[i]) || CLOUDY_SCL.has(scl[i])) v[i] = NaN;
    stack.push(v);
  }
  const out = new Float32Array(n).fill(NaN), tmp = [];
  for (let i = 0; i < n; i++) {
    tmp.length = 0;
    for (const s of stack) if (!Number.isNaN(s[i])) tmp.push(s[i]);
    if (!tmp.length) continue;
    tmp.sort((a, b) => a - b);
    const m = tmp.length >> 1;
    out[i] = tmp.length % 2 ? tmp[m] : (tmp[m - 1] + tmp[m]) / 2;
  }
  return { count: items.length, used: best.length, nbr: out };
}

/** Runs the whole method. `step(key)` reports progress. */
export async function computeFire({ box, before, after, autumn = true, step = () => {} }) {
  const km2 = boxAreaKm2(box);
  if (km2 > FIRE.hardKm2) throw Object.assign(new Error("too_big"), { km2 });
  const scale = scaleFor(km2), g = makeGrid(box, scale), n = g.w * g.h;
  const gbox = { s: g.north - g.h * g.dy, n: g.north, w: g.west, e: g.west + g.w * g.dx };
  const per = periods(before, after, autumn), end = addDays(per.after[1], 1);

  step("pre");
  const pre = await nbrMedian(g, gbox, per.before[0], per.before[1], () => step("pre"));
  step("post");
  const post = await nbrMedian(g, gbox, per.after[0], per.after[1], () => step("post"));
  if (!pre.count || !post.count) throw Object.assign(new Error("no_images"), { pre: pre.count, post: post.count });

  step("modis");
  const burnItems = await searchModis("modis-64A1-061", gbox, `${per.compareFrom.slice(0, 7)}-01`, per.after[1]);
  // monthly files are joined with "or": filling only gaps would let a month without burns hide the next month's burns
  const modis = new Float32Array(n).fill(0);
  for (const it of burnItems) {
    const [a, b] = burnWindow(Number(it.properties.start_datetime?.slice(0, 4) ?? it.properties.datetime.slice(0, 4)), per.compareFrom, end);
    const m = await bandOnGrid(g, it, { expression: `(Burn_Date>=${a})&(Burn_Date<${b})`, asset_as_band: "True", rescale: "0,1" }, flag);
    for (let i = 0; i < n; i++) if (m[i] === 1) modis[i] = 1;
  }
  const fireItems = await searchModis("modis-14A1-061", gbox, addDays(per.compareFrom, -8), per.after[1]);
  const fire = new Float32Array(n).fill(0);
  for (const it of fireItems) {
    const bands = fireBands((it.properties.start_datetime ?? it.properties.datetime).slice(0, 10), per.compareFrom, end);
    if (!bands.length) continue;
    const f = await bandOnGrid(g, it, { expression: bands.map((b) => `(FireMask_b${b}>=${FIRE.fireMask})`).join("|"), rescale: "0,1" }, flag);
    for (let i = 0; i < n; i++) if (f[i] === 1) fire[i] = 1;
  }

  step("numbers");
  const dnbr = new Float32Array(n), severity = new Uint8Array(n), modisOn = new Uint8Array(n), rows = rowAreaKm2(g);
  const sums = { seen: 0, burned: 0, modis: 0, both: 0, fire: 0, classes: new Array(CLASSES.length).fill(0) };
  for (let r = 0, i = 0; r < g.h; r++) for (let c = 0; c < g.w; c++, i++) {
    const a = rows[r], d = pre.nbr[i] - post.nbr[i];
    dnbr[i] = d;
    severity[i] = classOf(d);
    modisOn[i] = modis[i] === 1 ? 1 : 0;
    if (!Number.isNaN(d)) { sums.seen += a; sums.classes[severity[i]] += a; }
    const burned = d >= FIRE.burned;
    if (burned) sums.burned += a;
    if (modisOn[i]) sums.modis += a;
    if (burned && modisOn[i]) sums.both += a;
    if (fire[i]) sums.fire += a;
  }
  if (!sums.seen) throw new Error("no_clear");
  return { grid: g, km2, scale, periods: per, dnbr, severity, modis: modisOn, fire, sums, images: { pre: pre.count, post: post.count, preUsed: pre.used, postUsed: post.used } };
}
