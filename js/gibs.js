/* NASA GIBS (Global Imagery Browse Services) helpers for Leaflet, EPSG:3857 "best" endpoint.
 * WMTS REST pattern: {base}/{layer}/default/{date}/{TileMatrixSet}/{z}/{row}/{col}.{ext}
 * Layer ids and matrix sets in config.js come from GIBS's GetCapabilities. Sparse layers (flood, water, HLS
 * swaths) answer 404 for tiles without data; Leaflet simply leaves those tiles empty. */
import { GIBS, MONGOLIA_BBOX } from "./config.js";

/** UTC date "YYYY-MM-DD", `offsetDays` from today (negative = past). */
export function utcDate(offsetDays = 0, now = new Date()) {
  return new Date(now.getTime() + offsetDays * 86400000).toISOString().slice(0, 10);
}

export function maxNativeZoom(tms) {
  const m = /Level(\d+)$/.exec(tms);
  return m ? Number(m[1]) : 6;
}

/** The layer as it stands on a day: the satellite that serves it then, or null if its record has not begun. */
export function versionAt(def, date) {
  if (!def.versions) return !def.from || date >= def.from ? def : null;
  const v = def.versions.find((x) => date >= x.from);
  return v ? { ...def, ...v } : null;
}

export const firstDate = (def) => def.versions?.at(-1).from ?? def.from ?? null;

export function tileTemplate(layer, date) {
  const l = versionAt(layer, date) ?? layer;
  return `${GIBS.base}/${l.id}/default/${date}/${l.tms}/{z}/{y}/{x}.${l.ext}`;
}

/** Zoom 5 tiles over Mongolia and, for each, the share of its pixels inside the country's bounding box. */
const MN_TILES = (() => {
  const [s, w, n, e] = MONGOLIA_BBOX, z = 32, out = [];
  const tx = (lon) => ((lon + 180) / 360) * z;
  const ty = (lat) => ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * z;
  for (let x = Math.floor(tx(w)); x <= Math.floor(tx(e)); x++)
    for (let y = Math.floor(ty(n)); y <= Math.floor(ty(s)); y++) {
      const c = (v, a) => Math.min(256, Math.max(0, Math.round((v - a) * 256)));
      out.push({ x, y, px0: c(tx(w), x), px1: c(tx(e), x), py0: c(ty(n), y), py1: c(ty(s), y) });
    }
  return out;
})();

/** Share of the Mongolian part of one zoom 5 tile that holds image, not the black of a pass that has not arrived. */
function tileLit(def, date, t) {
  return new Promise((ok) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onerror = () => ok(0);
    img.onload = () => {
      const cv = document.createElement("canvas");
      cv.width = cv.height = 256;
      const ctx = cv.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      const w = t.px1 - t.px0, h = t.py1 - t.py0;
      if (w <= 0 || h <= 0) return ok(1);
      const px = ctx.getImageData(t.px0, t.py0, w, h).data;
      let lit = 0;
      for (let k = 0; k < px.length; k += 4) if (px[k] + px[k + 1] + px[k + 2] > 12) lit++;
      ok(lit / (w * h));
    };
    img.src = tileTemplate(def, date).replace("{z}", 5).replace("{y}", t.y).replace("{x}", t.x);
  });
}

/** Newest UTC day whose image already covers Mongolia. A day's passes reach GIBS a few hours after the satellite flies over
 * and the service answers with black until then, so the pixels over Mongolia decide. A first request can fail for no
 * lasting reason, so a miss is tried once more. If the check is slow or fails, yesterday is the safe answer. */
export function newestImageDate(def, now = new Date(), waitMs = 12000) {
  const today = utcDate(0, now), yesterday = utcDate(-1, now);
  const covered = () => Promise.all(MN_TILES.map((t) => tileLit(def, today, t))).then((lit) => lit.every((v) => v >= 0.97), () => false);
  const check = covered().then((yes) => yes || new Promise((ok) => setTimeout(ok, 800)).then(covered)).then((yes) => (yes ? today : yesterday));
  return Promise.race([check, new Promise((ok) => setTimeout(() => ok(yesterday), waitMs))]);
}

/** First day of the composite a day falls in: MODIS 8-day composites restart on 1 January. */
export function periodStart(def, date) {
  if (!def.period) return date;
  const d = new Date(date + "T00:00:00Z"), jan1 = Date.UTC(d.getUTCFullYear(), 0, 1);
  const k = Math.floor((d.getTime() - jan1) / 86400000 / def.period);
  return new Date(jan1 + k * def.period * 86400000).toISOString().slice(0, 10);
}

const published = new Map();
/** Whether GIBS has published a layer for a day: one tile over central Mongolia answers 200 when it has, 400 or 404 when it
 * has not (yet). Fire layers (WMS) and sparse 30 m layers are not tested. null = the check itself failed. */
export function hasDay(def, date) {
  const l = versionAt(def, date);
  if (!l) return Promise.resolve(false);
  if (def.type === "wms" || def.sparse) return Promise.resolve(true);
  const key = l.id + "|" + periodStart(def, date);
  if (!published.has(key)) {
    const url = tileTemplate(def, date).replace("{z}", 4).replace("{y}", 5).replace("{x}", 12);
    const ask = fetch(url).then((r) => r.ok, () => null);
    published.set(key, ask);
    ask.then((v) => { if (v === null) published.delete(key); });
  }
  return published.get(key);
}

/** The latest day before `date` that the layer has, looked for up to `back` days. */
export async function lastDay(def, date, back = def.period ? 20 : 10) {
  const base = new Date(date + "T12:00:00Z");
  for (let k = 1; k <= back; k++) {
    const d = utcDate(-k, base);
    if (await hasDay(def, d)) return d;
  }
  return null;
}

/** Leaflet layer for a GIBS definition and a UTC date. Needs the global `L`. */
export function makeLayer(L, def, date) {
  const common = { opacity: def.opacity ?? (def.kind === "base" ? 1 : 0.8), zIndex: def.kind === "base" ? 1 : 5, maxZoom: 12, attribution: "Imagery: NASA GIBS/ESDIS" };
  if (def.type === "wms") {
    return L.tileLayer.wms(GIBS.wms, { ...common, layers: def.id, format: "image/png", transparent: true, version: "1.1.1", styles: "", TIME: date });
  }
  // Asked for with CORS, like the tiles the pixel check and the downloads read, so that the browser cache serves them all.
  return L.tileLayer(tileTemplate(def, date), { ...common, crossOrigin: "anonymous", maxNativeZoom: maxNativeZoom(def.tms) });
}
