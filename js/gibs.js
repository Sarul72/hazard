/* NASA GIBS (Global Imagery Browse Services) tile helpers for Leaflet, EPSG:3857 "best" endpoint.
 * REST pattern: {base}/{layer}/default/{date}/{TileMatrixSet}/{z}/{row}/{col}.{ext}
 * Layer ids and tile matrix sets are probed at runtime: a layer whose id or matrix set is wrong
 * is reported as unavailable instead of showing a blank map. */
import { GIBS } from "./config.js";

/** UTC date "YYYY-MM-DD", `offsetDays` from today (negative = past). */
export function utcDate(offsetDays = 0, now = new Date()) {
  return new Date(now.getTime() + offsetDays * 86400000).toISOString().slice(0, 10);
}

export function maxNativeZoom(tms) {
  const m = /Level(\d+)$/.exec(tms);
  return m ? Number(m[1]) : 6;
}

export function tileTemplate(layer, tms, date) {
  const time = layer.dated ? `${date}/` : "";
  return `${GIBS.base}/${layer.id}/default/${time}${tms}/{z}/{y}/{x}.${layer.ext}`;
}

/** Probe tile: zoom 4, column 12, row 5 covers central Mongolia in Web Mercator. */
export function probeUrl(layer, tms, date) {
  return tileTemplate(layer, tms, date).replace("{z}", "4").replace("{y}", "5").replace("{x}", "12");
}

function loadImage(src, timeoutMs = 12000) {
  return new Promise((resolve) => {
    const img = new Image();
    const t = setTimeout(() => { img.src = ""; resolve(false); }, timeoutMs);
    img.onload = () => { clearTimeout(t); resolve(true); };
    img.onerror = () => { clearTimeout(t); resolve(false); };
    img.src = src;
  });
}

/**
 * Find a working {tms, date} for a layer: tries each candidate matrix set on the selected date and the
 * two days before (some products lag by a day or two). Returns null if none answers.
 */
export async function resolveLayer(layer, date, imageLoader = loadImage) {
  const dates = layer.dated ? [date, utcDate(-1, new Date(date + "T12:00:00Z")), utcDate(-2, new Date(date + "T12:00:00Z"))] : [date];
  for (const d of dates) {
    for (const tms of layer.tms) {
      if (await imageLoader(probeUrl(layer, tms, d))) return { tms, date: d };
    }
  }
  return null;
}
