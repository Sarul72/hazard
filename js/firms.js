/* NASA FIRMS active fire detections (VIIRS 375 m, MODIS 1 km).
 * Area API: https://firms.modaps.eosdis.nasa.gov/api/area/csv/{MAP_KEY}/{SOURCE}/{west,south,east,north}/{days}
 * Needs a free MAP_KEY, so it runs only in the scheduled build, never in the browser. */

export function firmsUrl(mapKey, source, bbox, days) {
  const [s, w, n, e] = bbox;
  return `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${mapKey}/${source}/${w},${s},${e},${n}/${days}`;
}

/** Parse FIRMS CSV into compact detections. Unknown columns are ignored; bad rows are dropped. */
export function parseFirmsCsv(text, source) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const head = lines[0].split(",");
  const ix = Object.fromEntries(head.map((h, i) => [h.trim(), i]));
  if (!("latitude" in ix) || !("longitude" in ix) || !("acq_date" in ix)) return [];
  const out = [];
  for (const line of lines.slice(1)) {
    const c = line.split(",");
    const lat = Number(c[ix.latitude]), lon = Number(c[ix.longitude]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const frp = ix.frp !== undefined ? Number(c[ix.frp]) : NaN;
    out.push({
      lat, lon, date: c[ix.acq_date], time: ix.acq_time !== undefined ? c[ix.acq_time] : null,
      frp: Number.isFinite(frp) ? frp : null,
      conf: ix.confidence !== undefined ? c[ix.confidence].trim() : null,
      dn: ix.daynight !== undefined ? c[ix.daynight].trim() : null,
      src: source,
    });
  }
  return out;
}

export function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad, dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Number of detections within `km` of each point. */
export function nearestPointCounts(dets, points, km) {
  const out = {};
  for (const p of points) out[p.id] = dets.filter((d) => haversineKm(p.lat, p.lon, d.lat, d.lon) <= km).length;
  return out;
}
