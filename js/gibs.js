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

export function tileTemplate(layer, date) {
  return `${GIBS.base}/${layer.id}/default/${date}/${layer.tms}/{z}/{y}/{x}.${layer.ext}`;
}

/** Leaflet layer for a GIBS definition and a UTC date. Needs the global `L`. */
export function makeLayer(L, def, date) {
  const common = { opacity: def.opacity ?? (def.kind === "base" ? 1 : 0.8), zIndex: def.kind === "base" ? 1 : 5, maxZoom: 12, attribution: "Imagery: NASA GIBS/ESDIS" };
  if (def.type === "wms") {
    return L.tileLayer.wms(GIBS.wms, { ...common, layers: def.id, format: "image/png", transparent: true, version: "1.1.1", styles: "", TIME: date });
  }
  return L.tileLayer(tileTemplate(def, date), { ...common, maxNativeZoom: maxNativeZoom(def.tms) });
}
