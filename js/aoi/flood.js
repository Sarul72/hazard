/* Detailed flood mapping in a chosen box, computed in the browser. The steps are those of gee_app/flood_aoi.js
 * (UN-SPIDER Recommended Practice for Sentinel-1): VH ratio after/before of 50 m means in dB above 1.25, JRC permanent
 * water and slopes of 5 degrees or more removed, groups smaller than about 800 m2 removed, built-up land shown apart,
 * new water checked with Sentinel-2 MNDWI within 3 days. Differences from the GEE App, all from the archives:
 * Sentinel-1 is the Planetary Computer's terrain-corrected RTC (gamma0) instead of GEE's sigma0, JRC Global Surface
 * Water is version 1.3 instead of 1.4, radar dB arrive in steps of 0.2 dB, and the slope is taken on the DEM at 30 m.
 * Water depth (FwDET) is not computed here; the GEE App still has it. */
import { search, passes, bandOnGrid, floatOnGrid } from "./stac.js";
import { CLOUDY_SCL, boxAreaKm2, connectedSizes, focalMeanCircle, makeGrid, minCount, rowAreaKm2, slopeDeg } from "./raster.js";

/* The threshold is 1.20, not the App's 1.25: RTC dB are about 2 dB higher than GEE's sigma0 and change less, so the
 * same rule finds less water. On the three test floods (docs/METHODS.md) 1.20 gave radar areas of 26.2, 1.37 and
 * 1.98 km2 against GEE's 24.5, 1.4 and 2.6 at 1.25, and agreement with Sentinel-2 (F1) of 0.38, 0.35 and 0.21. */
export const FLOOD = {
  maxKm2: 500, hardKm2: 5000, threshold: 1.20, smoothing: 50, permanentMonths: 10, slopeMax: 5, minPixels: 8, opticalDays: 3,
};

/** 0 nothing, 1 radar flood outside towns, 2 radar flood in built-up land, 3 radar flood confirmed by Sentinel-2. */
export const CODE = { none: 0, rural: 1, city: 2, confirmed: 3 };

export const scaleFor = (km2) => (km2 <= FLOOD.maxKm2 ? 10 : km2 <= 4 * FLOOD.maxKm2 ? 20 : 30);

const day = (ms) => new Date(ms).toISOString().slice(0, 10);
const addDays = (iso, n) => day(Date.parse(iso + "T00:00:00Z") + n * 86400000);
const DAY = 86400000;

// bytes from the data API back to values
const DB = { expression: "10*log10(vh)", asset_as_band: "True", rescale: "-40,10" };
const fromDb = (v) => -40 + v * 50 / 255;
const asIs = (v) => v;
const ID = (asset) => ({ assets: asset, rescale: "0,255" });

/** The orbit to use and the last pass before and the first pass after, as the App does. */
export async function radarPair(box, before, after) {
  const [itB, itA] = await Promise.all([search("sentinel-1-rtc", box, before[0], before[1]), search("sentinel-1-rtc", box, after[0], after[1])]);
  const orbitsB = new Set(itB.map((i) => i.properties["sat:relative_orbit"]));
  const shared = itA.filter((i) => orbitsB.has(i.properties["sat:relative_orbit"])).sort((a, b) => Date.parse(a.properties.datetime) - Date.parse(b.properties.datetime));
  if (!shared.length) return null;
  const orbit = shared[0].properties["sat:relative_orbit"];
  const pa = passes(itA.filter((i) => i.properties["sat:relative_orbit"] === orbit));
  const pb = passes(itB.filter((i) => i.properties["sat:relative_orbit"] === orbit));
  return { orbit, pass: shared[0].properties["sat:orbit_state"], after: pa[0], before: pb[pb.length - 1] };
}

async function band(g, items, query, decode) {
  let out = null;
  for (const it of items) out = await bandOnGrid(g, it, query, decode, out);
  return out ?? new Float32Array(g.w * g.h).fill(NaN);
}

/** MNDWI above 0 in harmonized reflectance (baseline 04.00 and later adds 1000 to both bands). */
const waterQuery = (item) => ({
  expression: Number(item.properties["s2:processing_baseline"]) >= 4 ? "(B03*1.0-B11)/(B03*1.0+B11-2000)>0" : "(B03*1.0-B11)/(B03*1.0+B11)>0",
  asset_as_band: "True", rescale: "0,1",
});

/** Slope on the DEM at 30 m (or the result's scale if coarser), then taken onto the result grid. */
async function slopeOnGrid(g, box) {
  const items = await search("cop-dem-glo-30", box);
  const dg = makeGrid(box, Math.max(30, g.scale));
  let dem = null;
  for (const it of items) dem = await floatOnGrid(dg, it, { assets: "data" }, dem);
  const sl = slopeDeg(dem, dg.w, dg.h, dg.dx, -dg.dy, dg.lat0), out = new Float32Array(g.w * g.h);
  for (let r = 0; r < g.h; r++) {
    const rr = Math.min(dg.h - 1, Math.floor((r + 0.5) * g.dy / dg.dy));
    for (let c = 0; c < g.w; c++) out[r * g.w + c] = sl[rr * dg.w + Math.min(dg.w - 1, Math.floor((c + 0.5) * g.dx / dg.dx))];
  }
  return out;
}

/** Runs the whole method. `step(key)` reports progress; the result holds the grid, the code layer and the numbers. */
export async function computeFlood({ box, before, after, threshold = FLOOD.threshold, step = () => {} }) {
  const km2 = boxAreaKm2(box);
  if (km2 > FLOOD.hardKm2) throw Object.assign(new Error("too_big"), { km2 });
  const scale = scaleFor(km2), g = makeGrid(box, scale), n = g.w * g.h;
  const gbox = { s: g.north - g.h * g.dy, n: g.north, w: g.west, e: g.west + g.w * g.dx };

  step("radar_search");
  const pair = await radarPair(gbox, before, after);
  if (!pair) throw new Error("no_radar");

  step("radar_read");
  const [vhB, vhA] = await Promise.all([band(g, pair.before.items, DB, fromDb), band(g, pair.after.items, DB, fromDb)]);

  step("masks");
  const [gsw, wc] = await Promise.all([search("jrc-gsw", gbox), search("esa-worldcover", gbox)]);
  const [seasonality, cover, slope] = await Promise.all([
    band(g, gsw, ID("seasonality"), asIs), band(g, wc.filter((i) => /2021/.test(i.id)), ID("map"), asIs), slopeOnGrid(g, gbox)]);

  step("flood");
  const permanent = new Uint8Array(n), built = new Uint8Array(n);
  for (let i = 0; i < n; i++) { permanent[i] = seasonality[i] >= FLOOD.permanentMonths ? 1 : 0; built[i] = cover[i] === 50 ? 1 : 0; }
  const radius = FLOOD.smoothing / scale;
  const mB = focalMeanCircle(vhB, g.w, g.h, radius), mA = focalMeanCircle(vhA, g.w, g.h, radius);
  const water = new Uint8Array(n);
  for (let i = 0; i < n; i++) water[i] = mB[i] < 0 && mA[i] / mB[i] > threshold && !permanent[i] ? 1 : 0;
  const size = connectedSizes(water, g.w, g.h), keep = minCount(FLOOD.minPixels, scale);
  const flood = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (water[i] && size[i] >= keep && slope[i] < FLOOD.slopeMax) flood[i] = built[i] ? CODE.city : CODE.rural;

  step("optical");
  const t = pair.after.t0;
  // as filterDate(t - 3 days, t + 4 days) in the App
  const s2 = await search("sentinel-2-l2a", gbox, addDays(day(t), -FLOOD.opticalDays), addDays(day(t), FLOOD.opticalDays + 1));
  const s2passes = passes(s2.filter((it) => { const d = Date.parse(it.properties.datetime) - t; return d >= -FLOOD.opticalDays * DAY && d < (FLOOD.opticalDays + 1) * DAY; }));
  let optical = null;
  if (s2passes.length) {
    // the clearest pass over the whole box, judged on a coarse grid
    const cg = makeGrid(gbox, Math.max(60, scale)), shares = await Promise.all(s2passes.map(async (p) => {
      const scl = await band(cg, p.items, ID("SCL"), asIs);
      let clear = 0;
      for (const v of scl) if (!Number.isNaN(v) && !CLOUDY_SCL.has(v)) clear++;
      return clear / scl.length;
    }));
    const k = shares.indexOf(Math.max(...shares)), items = s2passes[k].items;
    const scl = await band(g, items, ID("SCL"), asIs);
    let wet = null;
    for (const it of items) wet = await bandOnGrid(g, it, waterQuery(it), (v) => (v > 0 ? 1 : 0), wet); // a true/false expression arrives as 0 and 1
    const clear = new Uint8Array(n), s2water = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      clear[i] = !Number.isNaN(scl[i]) && !CLOUDY_SCL.has(scl[i]) ? 1 : 0;
      s2water[i] = clear[i] && wet[i] === 1 && !permanent[i] ? 1 : 0;
    }
    optical = { date: day(s2passes[k].t0), share: shares[k], clear, water: s2water };
  }

  step("numbers");
  const rowKm2 = rowAreaKm2(g), code = new Uint8Array(n);
  const sums = { rural: 0, city: 0, seen: 0, optical: 0, both: 0, permanent: 0 };
  for (let r = 0, i = 0; r < g.h; r++) for (let c = 0; c < g.w; c++, i++) {
    const a = rowKm2[r];
    code[i] = flood[i];
    if (flood[i] === CODE.rural) sums.rural += a;
    if (flood[i] === CODE.city) sums.city += a;
    if (permanent[i]) sums.permanent += a;
    if (optical) {
      if (flood[i] === CODE.rural && optical.clear[i]) sums.seen += a;
      if (optical.water[i] && !built[i]) sums.optical += a;
      if (flood[i] === CODE.rural && optical.water[i]) { sums.both += a; code[i] = CODE.confirmed; }
    }
  }
  return {
    grid: g, km2, scale, code, permanent, s2water: optical?.water ?? null, s2clear: optical?.clear ?? null, sums,
    radar: { orbit: pair.orbit, pass: pair.pass, before: pair.before.t0, after: pair.after.t0, nBefore: pair.before.items.length, nAfter: pair.after.items.length },
    optical: optical ? { date: optical.date, share: optical.share } : null,
  };
}
