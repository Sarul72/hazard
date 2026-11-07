/* NASA GIBS (Global Imagery Browse Services) helpers for Leaflet, EPSG:3857 "best" endpoint.
 * WMTS REST pattern: {base}/{layer}/default/{date}/{TileMatrixSet}/{z}/{row}/{col}.{ext}
 * Layer ids and matrix sets in config.js come from GIBS's GetCapabilities. Sparse layers (flood, water, HLS
 * swaths) answer 404 for tiles without data; Leaflet simply leaves those tiles empty. */
import { GIBS } from "./config.js";

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

/** Share of a zoom 4 tile holding image, not the black of a place the satellite has not passed yet. */
function tileLit(def, date, x, y) {
  return new Promise((ok) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onerror = () => ok(0);
    img.onload = () => {
      const cv = document.createElement("canvas");
      cv.width = cv.height = 256;
      const ctx = cv.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      const px = ctx.getImageData(0, 0, 256, 256).data;
      let lit = 0;
      for (let k = 0; k < px.length; k += 4) if (px[k] + px[k + 1] + px[k + 2] > 12) lit++;
      ok(lit / 65536);
    };
    img.src = tileTemplate(def, date).replace("{z}", 4).replace("{y}", y).replace("{x}", x);
  });
}

/** Newest day whose image already covers Mongolia. Today's passes arrive during the day and the service answers with black
 * until then, so the pixels decide. A first request can fail for no lasting reason, so a miss is tried once more.
 * If the check is slow or fails, yesterday is the safe answer. */
export function newestImageDate(def, now = new Date(), waitMs = 4000) {
  const today = utcDate(0, now), yesterday = utcDate(-1, now);
  const covered = () => Promise.all([11, 12, 13].map((x) => tileLit(def, today, x, 5))).then((lit) => lit.every((v) => v >= 0.9), () => false);
  const check = covered().then((yes) => yes || new Promise((ok) => setTimeout(ok, 500)).then(covered)).then((yes) => (yes ? today : yesterday));
  return Promise.race([check, new Promise((ok) => setTimeout(() => ok(yesterday), waitMs))]);
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
