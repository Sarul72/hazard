/* Winter and spring camps for the mine dust tool. data/camps.bin.gz holds positions rounded to about 1 km and counts only:
 * no person, parcel or phone. */
import { bytes } from "./dataset.js";
import { inFeature } from "./soums.js";

const STEP = 0.01, LON0 = 87, LAT0 = 41;
let camps = null;

export function loadCamps() {
  camps ??= bytes("data/camps.bin.gz").then((b) => new Uint16Array(b.buffer, b.byteOffset, b.byteLength / 2)).catch(() => null);
  return camps;
}

/** Camp locations inside a box {s, n, w, e}, and inside `geom` when it is given. */
export function campsInside(a, box, geom) {
  const out = [];
  for (let i = 0; i < a.length; i += 4) {
    const lon = LON0 + a[i] * STEP, lat = LAT0 + a[i + 1] * STEP;
    if (lat < box.s || lat > box.n || lon < box.w || lon > box.e) continue;
    if (geom && !inFeature(lon, lat, geom)) continue;
    out.push({ lon, lat, herders: a[i + 2], parcels: a[i + 3] });
  }
  return out;
}
