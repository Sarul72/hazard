/* Map layers of the Environmental Information Center of Mongolia (Байгаль орчны мэдээллийн сан, eic.mn) shown in the
 * mine-dust tool. They are WMS images drawn straight from eic.mn's map server: nothing is copied here, and eic.mn sends
 * no CORS headers, so images are all a browser can take from it. The source is named beside each switch, as
 * Government Resolution 85 (2010) asks.
 *  - licences: valid mineral licences (MRPAM's cadastre as EIC holds it);
 *  - degraded: land degraded by mining, from EIC's inventory, which covers only the north (Selenge, Töv, Khentii);
 *  - waterzones: protection zones of water bodies and river sources, the receptors a plume should miss. */
const SERVER = "https://eic.mn/cgi-bin/mapserver?map=/var/www/html/";

export const EIC_MINE_LAYERS = {
  licences: { map: "mineral/mininginfo/maps/mining.map", layers: "miningdb_miningcadasre", opacity: 0.6 },
  degraded: { map: "envimpact/envimpactinfo/maps/envimpact.map", layers: "envimpactdb_deglocation,envimpactdb_deglocationpoint", opacity: 0.9 },
  waterzones: { map: "envimpact/envimpactinfo/maps/envimpact.map", layers: "envimpactdb_waterzone,envimpactdb_sourcezone", opacity: 0.6 },
};

/** The WMS address of one of the layers above. */
export function eicWmsUrl(key) {
  const v = EIC_MINE_LAYERS[key];
  if (!v) throw new Error(`no EIC layer ${key}`);
  return SERVER + v.map;
}

/** A Leaflet WMS layer for one of them; onFail runs once if eic.mn sends no tile, so the switch can say so. */
export function eicLayer(L, key, onFail) {
  const v = EIC_MINE_LAYERS[key];
  return L.tileLayer.wms(eicWmsUrl(key), { layers: v.layers, format: "image/png", transparent: true, version: "1.1.1",
    opacity: v.opacity, attribution: "© EIC Mongolia (eic.mn)" }).once("tileerror", () => onFail?.());
}
