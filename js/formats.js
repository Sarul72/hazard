/* File formats for the downloads, written by hand because the site has no build step and no libraries.
 * Plain data in, bytes or text out. Nothing here touches the page, so all of it can be tested on its own. */

export const MIME = {
  jpg: "image/jpeg", png: "image/png", pdf: "application/pdf", tif: "image/tiff", csv: "text/csv;charset=utf-8", json: "application/json",
  geojson: "application/geo+json", kml: "application/vnd.google-earth.kml+xml", kmz: "application/vnd.google-earth.kmz", zip: "application/zip",
};

export const WGS84_WKT = 'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]';
export const MERCATOR_WKT = `PROJCS["WGS_1984_Web_Mercator_Auxiliary_Sphere",${WGS84_WKT},PROJECTION["Mercator_Auxiliary_Sphere"],PARAMETER["False_Easting",0.0],PARAMETER["False_Northing",0.0],PARAMETER["Central_Meridian",0.0],PARAMETER["Standard_Parallel_1",0.0],PARAMETER["Auxiliary_Sphere_Type",0.0],UNIT["Meter",1.0]]`;

const enc = new TextEncoder();

function concat(parts) {
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

/* ------------------------------------------------------------------ text */
/** Comma separated, with a byte order mark so that Excel reads Cyrillic correctly. */
export function csv(header, rows) {
  const q = (v) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + [header, ...rows].map((r) => r.map(q).join(",")).join("\r\n");
}

/** `metadata` sits beside the features: GeoJSON allows extra members and GIS programs step over them. */
export const featureCollection = (features, metadata) => JSON.stringify({ type: "FeatureCollection", ...(metadata ? { metadata } : {}), features });
export const pointFeature = (lon, lat, properties) => ({ type: "Feature", geometry: { type: "Point", coordinates: [lon, lat] }, properties });

/* ------------------------------------------------------------------- KML */
const esc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
/** KML writes colours as alpha, blue, green, red. */
const kmlColor = (hex, alpha) => `${alpha}${hex.slice(5, 7)}${hex.slice(3, 5)}${hex.slice(1, 3)}`;
const kmlRing = (ring) => `<LinearRing><coordinates>${ring.map(([x, y]) => `${x},${y}`).join(" ")}</coordinates></LinearRing>`;
const kmlPolygon = (p) => `<Polygon><outerBoundaryIs>${kmlRing(p[0])}</outerBoundaryIs>${p.slice(1).map((r) => `<innerBoundaryIs>${kmlRing(r)}</innerBoundaryIs>`).join("")}</Polygon>`;
const kmlDoc = (name, body, description) => `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${esc(name)}</name>${description ? `<description>${esc(description)}</description>` : ""}${body}</Document></kml>`;

/** Coloured polygons for Google Earth. features: [{ name, description, color, geometry }] */
export function kmlPolygons(name, features, description) {
  return kmlDoc(name, features.map((f) => {
    const g = f.geometry, shape = g.type === "Polygon" ? kmlPolygon(g.coordinates) : `<MultiGeometry>${g.coordinates.map(kmlPolygon).join("")}</MultiGeometry>`;
    return `<Placemark><name>${esc(f.name)}</name><description>${esc(f.description)}</description><Style><LineStyle><color>ffffffff</color><width>0.7</width></LineStyle><PolyStyle><color>${kmlColor(f.color, "b3")}</color></PolyStyle></Style>${shape}</Placemark>`;
  }).join(""), description);
}

/** One image laid over the ground. The image must be regular in latitude and longitude. */
export function kmlGroundOverlay({ name, description, href, box }) {
  return kmlDoc(name, `<GroundOverlay><name>${esc(name)}</name><description>${esc(description)}</description><Icon><href>${esc(href)}</href></Icon><LatLonBox><north>${box.n}</north><south>${box.s}</south><east>${box.e}</east><west>${box.w}</west></LatLonBox></GroundOverlay>`);
}

/* --------------------------------------------------------------- GeoTIFF */
const SHORT = 3, LONG = 4, ASCII = 2, DOUBLE = 12;
const TYPE_SIZE = { [SHORT]: 2, [LONG]: 4, [DOUBLE]: 8, [ASCII]: 1 };
/** TIFF text is plain ASCII, so anything else becomes a question mark. */
const ascii = (s) => [...enc.encode(`${String(s).replace(/[^\x20-\x7e]/g, "?")}\0`)];

/** A little-endian TIFF with one strip. `tags` are [id, type, values]; the value "data" stands for the offset of the pixels. */
function tiff(tags, pixels) {
  tags.sort((a, b) => a[0] - b[0]);
  let extra = 8 + 2 + tags.length * 12 + 4;
  const place = tags.map(([, type, v]) => { const n = v.length * TYPE_SIZE[type]; if (n <= 4) return null; const at = extra; extra += n + (n % 2); return at; });
  const dataAt = (extra + 3) & ~3, out = new ArrayBuffer(dataAt + pixels.byteLength), d = new DataView(out);
  d.setUint16(0, 0x4949, true); d.setUint16(2, 42, true); d.setUint32(4, 8, true); d.setUint16(8, tags.length, true);
  const put = (at, type, v) => v.forEach((x, i) => {
    const o = at + i * TYPE_SIZE[type], value = x === "data" ? dataAt : x;
    if (type === SHORT) d.setUint16(o, value, true); else if (type === LONG) d.setUint32(o, value, true);
    else if (type === DOUBLE) d.setFloat64(o, value, true); else d.setUint8(o, value);
  });
  tags.forEach(([tag, type, v], i) => {
    const at = 10 + i * 12;
    d.setUint16(at, tag, true); d.setUint16(at + 2, type, true); d.setUint32(at + 4, v.length, true);
    if (place[i] === null) put(at + 8, type, v); else { d.setUint32(at + 8, place[i], true); put(place[i], type, v); }
  });
  new Uint8Array(out, dataAt).set(new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength));
  return new Uint8Array(out);
}

/** Lowest, highest, mean and spread of a band, leaving out cells without data. */
export function bandStats(band, noData = -9999) {
  let n = 0, sum = 0, sq = 0, min = Infinity, max = -Infinity;
  for (const v of band) { if (v === noData) continue; n++; sum += v; sq += v * v; if (v < min) min = v; if (v > max) max = v; }
  if (!n) return null;
  const mean = sum / n;
  return { min, max, mean, sd: Math.sqrt(Math.max(sq / n - mean * mean, 0)) };
}

const STATS = [["MINIMUM", "min"], ["MAXIMUM", "max"], ["MEAN", "mean"], ["STDDEV", "sd"]];

/** What GDAL and the programs built on it read as band names, statistics and notes. */
function gdalMetadata(meta, names, bands, noData) {
  const item = (name, value, more = "") => `<Item name="${esc(name)}"${more}>${esc(value)}</Item>`;
  const rows = Object.entries(meta).filter(([, v]) => v !== null && v !== undefined).map(([k, v]) => item(k, v));
  bands.forEach((band, i) => {
    if (names[i]) rows.push(item("DESCRIPTION", names[i], ` sample="${i}" role="description"`));
    const s = bandStats(band, noData);
    if (s) for (const [k, f] of STATS) rows.push(item(`STATISTICS_${k}`, +s[f].toFixed(4), ` sample="${i}"`));
  });
  return `<GDALMetadata>${rows.join("")}</GDALMetadata>`;
}

const notes = (description, xml) => [...(description ? [[270, ASCII, ascii(description)]] : []), [305, ASCII, ascii("Mongolia Hazard Watch")], [42112, ASCII, ascii(xml)]];

/** Float GeoTIFF in EPSG:4326, band interleaved by pixel. bands: arrays of w*h values, row 0 at the north edge. */
export function geoTiff({ w, h, bands, west, north, dx, dy, noData = -9999, names = [], description = "", meta = {} }) {
  const n = bands.length, px = new Float32Array(w * h * n);
  for (let i = 0; i < w * h; i++) for (let b = 0; b < n; b++) px[i * n + b] = bands[b][i];
  return tiff([
    [256, LONG, [w]], [257, LONG, [h]], [258, SHORT, Array(n).fill(32)], [259, SHORT, [1]], [262, SHORT, [1]], [273, LONG, ["data"]],
    [277, SHORT, [n]], [278, LONG, [h]], [279, LONG, [px.byteLength]], [284, SHORT, [1]],
    ...(n > 1 ? [[338, SHORT, Array(n - 1).fill(0)]] : []),
    [339, SHORT, Array(n).fill(3)], [33550, DOUBLE, [dx, dy, 0]], [33922, DOUBLE, [0, 0, 0, west, north, 0]],
    [34735, SHORT, [1, 1, 0, 3, 1024, 0, 1, 2, 1025, 0, 1, 1, 2048, 0, 1, 4326]], [42113, ASCII, ascii(noData)],
    ...notes(description, gdalMetadata(meta, names, bands, noData)),
  ], px);
}

/** One-band Byte GeoTIFF of class codes with its colours, in EPSG:4326, so GIS programs show it coloured at once.
 * palette: [[code, [r, g, b]]]; codes without a colour are black. */
export function geoTiffClasses({ w, h, codes, palette, west, north, dx, dy, noData = 255, name = "class", description = "", meta = {} }) {
  const map = new Array(768).fill(0);
  for (const [v, [r, g, b]] of palette) { map[v] = r * 257; map[256 + v] = g * 257; map[512 + v] = b * 257; }
  return tiff([
    [256, LONG, [w]], [257, LONG, [h]], [258, SHORT, [8]], [259, SHORT, [1]], [262, SHORT, [3]], [273, LONG, ["data"]],
    [277, SHORT, [1]], [278, LONG, [h]], [279, LONG, [codes.length]], [284, SHORT, [1]], [320, SHORT, map], [339, SHORT, [1]],
    [33550, DOUBLE, [dx, dy, 0]], [33922, DOUBLE, [0, 0, 0, west, north, 0]],
    [34735, SHORT, [1, 1, 0, 3, 1024, 0, 1, 2, 1025, 0, 1, 1, 2048, 0, 1, 4326]], [42113, ASCII, ascii(noData)],
    ...notes(description, gdalMetadata(meta, [name], [codes], noData)),
  ], codes);
}

/** The map as one RGB GeoTIFF in Web Mercator. rgba: the pixels of a canvas; box: its corners in degrees. */
export function geoTiffRgb({ w, h, rgba, box, description = "", meta = {} }) {
  const px = new Uint8Array(w * h * 3);
  for (let i = 0, o = 0; i < w * h; i++, o += 3) { px[o] = rgba[i * 4]; px[o + 1] = rgba[i * 4 + 1]; px[o + 2] = rgba[i * 4 + 2]; }
  const x0 = mercatorX(box.w), y0 = mercatorY(box.n), sx = (mercatorX(box.e) - x0) / w, sy = (y0 - mercatorY(box.s)) / h;
  return tiff([
    [256, LONG, [w]], [257, LONG, [h]], [258, SHORT, [8, 8, 8]], [259, SHORT, [1]], [262, SHORT, [2]], [273, LONG, ["data"]],
    [277, SHORT, [3]], [278, LONG, [h]], [279, LONG, [px.byteLength]], [284, SHORT, [1]],
    [33550, DOUBLE, [sx, sy, 0]], [33922, DOUBLE, [0, 0, 0, x0, y0, 0]],
    [34735, SHORT, [1, 1, 0, 3, 1024, 0, 1, 1, 1025, 0, 1, 1, 3072, 0, 1, 3857]],
    ...notes(description, gdalMetadata(meta, [], [], null)),
  ], px);
}

/* -------------------------------------------------------------- metadata */
/** The metadata ArcGIS shows for a dataset, written beside it as <file>.xml. */
export const arcgisXml = ({ title, summary, description, credits }) => `<?xml version="1.0" encoding="UTF-8"?>
<metadata xml:lang="en"><Esri><ArcGISFormat>1.0</ArcGISFormat></Esri><dataIdInfo><idCitation><resTitle>${esc(title)}</resTitle></idCitation><idPurp>${esc(summary)}</idPurp><idAbs>${esc(description)}</idAbs><idCredit>${esc(credits)}</idCredit></dataIdInfo></metadata>
`;

/** A table of class names, areas and colours for a band of codes. ArcGIS Pro and QGIS use it for the legend.
 * fields: [{ name, type: 0 integer | 1 real | 2 text, usage: 0 plain | 1 count | 2 name | 5 value | 6, 7, 8 red, green, blue }] */
const ratXml = ({ fields, rows }) => `<GDALRasterAttributeTable tableType="thematic">${fields.map((f, i) => `<FieldDefn index="${i}"><Name>${esc(f.name)}</Name><Type>${f.type}</Type><Usage>${f.usage}</Usage></FieldDefn>`).join("")}${rows.map((r, i) => `<Row index="${i}">${r.map((v) => `<F>${esc(v)}</F>`).join("")}</Row>`).join("")}</GDALRasterAttributeTable>`;

/** The companion file GDAL and ArcGIS read for a raster or image: its projection, notes, the name and statistics of each
 * band and, where given, the class table of a band (tables[i]). */
export function auxXml({ wkt = null, meta = {}, names = [], bands = [], noData = -9999, tables = [] }) {
  const mdi = (k, v) => `<MDI key="${esc(k)}">${esc(v)}</MDI>`;
  const rows = Object.entries(meta).filter(([, v]) => v !== null && v !== undefined).map(([k, v]) => mdi(k, v));
  const perBand = bands.map((band, i) => {
    const s = bandStats(band, noData);
    return `<PAMRasterBand band="${i + 1}">${names[i] ? `<Description>${esc(names[i])}</Description>` : ""}${s ? `<Metadata>${STATS.map(([k, f]) => mdi(`STATISTICS_${k}`, +s[f].toFixed(4))).join("")}</Metadata>` : ""}${tables[i] ? ratXml(tables[i]) : ""}</PAMRasterBand>`;
  });
  return `<PAMDataset>${wkt ? `<SRS>${esc(wkt)}</SRS>` : ""}${rows.length ? `<Metadata>${rows.join("")}</Metadata>` : ""}${perBand.join("")}</PAMDataset>\n`;
}

/* ------------------------------------------------------------- Shapefile */
/** Positive for a clockwise ring. A shapefile wants outer rings clockwise and holes the other way, GeoJSON the reverse. */
const turn = (ring) => ring.reduce((s, [x, y], i) => { const [x2, y2] = ring[(i + 1) % ring.length]; return s + (x2 - x) * (y2 + y); }, 0);

function shpRings(geom) {
  const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
  return polys.flatMap((p) => p.map((ring, i) => (turn(ring) > 0 === (i === 0) ? ring : [...ring].reverse())));
}

function textField(s, size) {
  const out = new Uint8Array(size).fill(0x20);
  let at = 0;
  for (const ch of String(s ?? "")) { // whole characters only: a cut through a Cyrillic letter makes the field unreadable
    const b = enc.encode(ch);
    if (at + b.length > size) break;
    out.set(b, at);
    at += b.length;
  }
  return out;
}

function dbf(fields, rows, now) {
  const recordSize = 1 + fields.reduce((s, f) => s + f.size, 0), headerSize = 32 + 32 * fields.length + 1;
  const out = new Uint8Array(headerSize + recordSize * rows.length + 1), d = new DataView(out.buffer);
  out[0] = 3; out[1] = now.getUTCFullYear() - 1900; out[2] = now.getUTCMonth() + 1; out[3] = now.getUTCDate();
  d.setUint32(4, rows.length, true); d.setUint16(8, headerSize, true); d.setUint16(10, recordSize, true);
  fields.forEach((f, i) => {
    const at = 32 + i * 32;
    out.set(enc.encode(f.name.slice(0, 10)), at);
    out[at + 11] = f.type.charCodeAt(0); out[at + 16] = f.size; out[at + 17] = f.decimals ?? 0;
  });
  out[headerSize - 1] = 0x0d;
  rows.forEach((r, k) => {
    let at = headerSize + k * recordSize;
    out[at++] = 0x20;
    for (const f of fields) {
      const v = r[f.name];
      const text = f.type === "N" ? (typeof v === "number" ? v.toFixed(f.decimals ?? 0).padStart(f.size) : "") : v;
      out.set(textField(text, f.size), at);
      at += f.size;
    }
  });
  out[out.length - 1] = 0x1a;
  return out;
}

/** Polygons with attributes. features: [{ geometry, values }], fields: [{ name, type: "C"|"N", size, decimals }]. */
export function shapefile({ features, fields, now = new Date() }) {
  const shapes = features.map((f) => shpRings(f.geometry));
  const box = (points) => points.reduce((b, [x, y]) => [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)], [Infinity, Infinity, -Infinity, -Infinity]);
  const lengths = shapes.map((rings) => 44 + 4 * rings.length + 16 * rings.reduce((s, r) => s + r.length, 0));
  const shpBytes = 100 + lengths.reduce((s, n) => s + n + 8, 0), shxBytes = 100 + 8 * shapes.length;
  const shp = new DataView(new ArrayBuffer(shpBytes)), shx = new DataView(new ArrayBuffer(shxBytes));
  const all = box(shapes.flat(2));
  for (const [v, bytes] of [[shp, shpBytes], [shx, shxBytes]]) {
    v.setInt32(0, 9994); v.setInt32(24, bytes / 2); v.setInt32(28, 1000, true); v.setInt32(32, 5, true);
    all.forEach((x, i) => v.setFloat64(36 + i * 8, x, true));
  }
  let at = 100;
  shapes.forEach((rings, k) => {
    shx.setInt32(100 + k * 8, at / 2); shx.setInt32(104 + k * 8, lengths[k] / 2);
    shp.setInt32(at, k + 1); shp.setInt32(at + 4, lengths[k] / 2);
    let o = at + 8;
    shp.setInt32(o, 5, true);
    box(rings.flat()).forEach((x, i) => shp.setFloat64(o + 4 + i * 8, x, true));
    shp.setInt32(o + 36, rings.length, true);
    shp.setInt32(o + 40, rings.reduce((s, r) => s + r.length, 0), true);
    o += 44;
    let first = 0;
    for (const r of rings) { shp.setInt32(o, first, true); o += 4; first += r.length; }
    for (const r of rings) for (const [x, y] of r) { shp.setFloat64(o, x, true); shp.setFloat64(o + 8, y, true); o += 16; }
    at += 8 + lengths[k];
  });
  return { shp: new Uint8Array(shp.buffer), shx: new Uint8Array(shx.buffer), dbf: dbf(fields, features.map((f) => f.values), now), prj: enc.encode(WGS84_WKT), cpg: enc.encode("UTF-8") };
}

/* ------------------------------------------------------------------- PDF */
/** PDF text in UTF-16, the one encoding of the format that holds Cyrillic. */
const pdfText = (s) => `<FEFF${Array.from({ length: s.length }, (_, i) => s.charCodeAt(i).toString(16).padStart(4, "0")).join("").toUpperCase()}>`;

/** One A4 page holding a JPEG, scaled to fit. `info` goes into the properties of the document. */
export function pdfFromJpeg(jpeg, w, h, info = {}) {
  const [pw, ph] = w >= h ? [842, 595] : [595, 842], k = Math.min((pw - 36) / w, (ph - 36) / h);
  const iw = (w * k).toFixed(2), ih = (h * k).toFixed(2), x = ((pw - w * k) / 2).toFixed(2), y = ((ph - h * k) / 2).toFixed(2);
  const draw = `q ${iw} 0 0 ${ih} ${x} ${y} cm /Im0 Do Q`;
  const objects = [
    ["<< /Type /Catalog /Pages 2 0 R >>"],
    ["<< /Type /Pages /Kids [3 0 R] /Count 1 >>"],
    [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`],
    [`<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>`, jpeg],
    [`<< /Length ${draw.length} >>`, enc.encode(draw)],
    [`<< /Title ${pdfText(info.title ?? "")} /Subject ${pdfText(info.subject ?? "")} /Producer (Mongolia Hazard Watch) >>`],
  ];
  const parts = [enc.encode("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n")], offsets = [];
  let at = parts[0].length;
  const push = (p) => { parts.push(p); at += p.length; };
  objects.forEach(([dict, stream], i) => {
    offsets.push(at);
    push(enc.encode(`${i + 1} 0 obj\n${dict}\n`));
    if (stream) { push(enc.encode("stream\n")); push(stream); push(enc.encode("\nendstream\n")); }
    push(enc.encode("endobj\n"));
  });
  const xref = at, n = objects.length + 1;
  push(enc.encode(`xref\n0 ${n}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${n} /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF\n`));
  return concat(parts);
}

/* ------------------------------------------------------------ world file */
const R = 6378137;
export const mercatorX = (lon) => R * lon * Math.PI / 180;
export const mercatorY = (lat) => R * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360));

/** Six lines that place an image in Web Mercator. The last two are the centre of the top left pixel. */
export function worldFile({ n, s, e, w }, width, height) {
  const sx = (mercatorX(e) - mercatorX(w)) / width, sy = (mercatorY(s) - mercatorY(n)) / height;
  return [sx, 0, 0, sy, mercatorX(w) + sx / 2, mercatorY(n) + sy / 2].map((v) => v.toFixed(6)).join("\r\n") + "\r\n";
}

/* ------------------------------------------------------------------- ZIP */
const crcTable = Uint32Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
function crc32(b) { let c = -1; for (let i = 0; i < b.length; i++) c = crcTable[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; }

/** A plain ZIP with stored (uncompressed) files: [{ name, data: Uint8Array }]. The files carry the time of the download. */
export function zip(files, type = MIME.zip, now = new Date()) {
  const parts = [], central = [];
  const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1), date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name), crc = crc32(f.data), head = new DataView(new ArrayBuffer(30));
    [[0, 0x04034b50, 4], [4, 20, 2], [6, 0x0800, 2], [8, 0, 2], [10, time, 2], [12, date, 2], [14, crc, 4], [18, f.data.length, 4], [22, f.data.length, 4], [26, name.length, 2], [28, 0, 2]]
      .forEach(([o, v, n]) => (n === 4 ? head.setUint32(o, v, true) : head.setUint16(o, v, true)));
    parts.push(new Uint8Array(head.buffer), name, f.data);
    const c = new DataView(new ArrayBuffer(46));
    [[0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [8, 0x0800, 2], [10, 0, 2], [12, time, 2], [14, date, 2], [16, crc, 4], [20, f.data.length, 4], [24, f.data.length, 4], [28, name.length, 2], [42, offset, 4]]
      .forEach(([o, v, n]) => (n === 4 ? c.setUint32(o, v, true) : c.setUint16(o, v, true)));
    central.push(new Uint8Array(c.buffer), name);
    offset += 30 + name.length + f.data.length;
  }
  const size = central.reduce((s, p) => s + p.length, 0), end = new DataView(new ArrayBuffer(22));
  [[0, 0x06054b50, 4], [8, files.length, 2], [10, files.length, 2], [12, size, 4], [16, offset, 4]].forEach(([o, v, n]) => (n === 4 ? end.setUint32(o, v, true) : end.setUint16(o, v, true)));
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type });
}
