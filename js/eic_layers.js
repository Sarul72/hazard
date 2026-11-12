/* Map layers of the Environmental Information Center of Mongolia (Байгаль орчны мэдээллийн сан, eic.mn) shown in the
 * mine-dust tool. They are WMS images drawn straight from eic.mn's map server: nothing is copied here, and eic.mn sends
 * no CORS headers, so images are all a browser can take from it. The source is named beside each switch, as
 * Government Resolution 85 (2010) asks.
 *  - licences: valid mineral licences (MRPAM's cadastre as EIC holds it);
 *  - sources: protection zones of river sources, and waterzones: those of water bodies, the receptors a plume should
 *    miss. They are two layers because eic.mn draws the water bodies in about 50 s a tile and the sources in half a
 *    second; asked together, both wait.
 * EIC's layer of land degraded by mining (envimpactdb_deglocation) is not here: on 2026-11-13 eic.mn answered every
 * request for it with a PostGIS query error instead of an image. */
const SERVER = "https://eic.mn/cgi-bin/mapserver?map=/var/www/html/";

export const EIC_MINE_LAYERS = {
  licences: { map: "mineral/mininginfo/maps/mining.map", layers: "miningdb_miningcadasre", opacity: 0.6 },
  sources: { map: "envimpact/envimpactinfo/maps/envimpact.map", layers: "envimpactdb_sourcezone", opacity: 0.6 },
  waterzones: { map: "envimpact/envimpactinfo/maps/envimpact.map", layers: "envimpactdb_waterzone", opacity: 0.6 },
};

/** The WMS address of one of the layers above. */
export function eicWmsUrl(key) {
  const v = EIC_MINE_LAYERS[key];
  if (!v) throw new Error(`no EIC layer ${key}`);
  return SERVER + v.map;
}

/** Whether a round of tiles shows eic.mn is not answering: every tile failed. eic.mn is one CGI server taking 0.5-1.6 s
 * a tile, so a single slow tile among thirty says nothing, and the layer stays. */
export const giveUp = ({ loaded, failed }) => failed > 0 && loaded === 0;

/** A WMS layer from eic.mn's map server, in 512 px tiles (a quarter of the requests of 256 px ones, for a slow server).
 * onFail runs when a whole round of tiles failed, so the switch can say so; Leaflet's "load" ends a round. */
export function eicWms(L, url, { layers, opacity, pane }, onFail) {
  const n = { loaded: 0, failed: 0 };
  const layer = L.tileLayer.wms(url, { layers, format: "image/png", transparent: true, version: "1.1.1", tileSize: 512,
    opacity, attribution: "© EIC Mongolia (eic.mn)", ...(pane ? { pane } : {}) });
  return layer.on("loading", () => { n.loaded = 0; n.failed = 0; })
    .on("tileload", () => { n.loaded++; })
    .on("tileerror", () => { n.failed++; })
    .on("load", () => { if (giveUp(n)) onFail?.(); });
}

/** One of the mine-dust tool's layers above. */
export function eicLayer(L, key, onFail) {
  const v = EIC_MINE_LAYERS[key];
  return eicWms(L, eicWmsUrl(key), v, onFail);
}
