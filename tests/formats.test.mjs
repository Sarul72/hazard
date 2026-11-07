/* The hand-written file formats. check() is plain JavaScript so it also runs in a browser where Node is not installed. */
import { MERCATOR_WKT, csv, geoTiff, kmlGroundOverlay, kmlPolygons, mercatorX, mercatorY, pdfFromJpeg, shapefile, worldFile } from "../js/formats.js";

const dec = new TextDecoder();

export function check() {
  const out = [];
  const yes = (name, cond) => out.push({ name, got: cond, want: true, ok: cond === true });
  const near = (name, got, want, tol = 1e-6) => out.push({ name, got, want, ok: Math.abs(got - want) <= tol });

  /* csv */
  const c = csv(["a", "b"], [["x,y", 'he said "hi"'], [null, 1]]);
  yes("csv starts with a byte order mark", c.charCodeAt(0) === 0xfeff);
  yes("csv quotes commas and quotes", c.includes('"x,y","he said ""hi"""'));
  yes("csv leaves missing values empty", c.endsWith("\r\n,1"));

  /* geotiff */
  for (const n of [1, 2]) {
    const bands = Array.from({ length: n }, (_, b) => Float32Array.from([1 + b, 2, 3, 4, 5, 6]));
    const t = geoTiff({ w: 3, h: 2, bands, west: 100, north: 50, dx: 0.1, dy: 0.1 }), d = new DataView(t.buffer);
    yes(`tiff ${n} band header`, d.getUint16(0, true) === 0x4949 && d.getUint16(2, true) === 42);
    const tags = new Map(), count = d.getUint16(8, true);
    for (let i = 0; i < count; i++) tags.set(d.getUint16(10 + i * 12, true), 10 + i * 12);
    const keys = [...tags.keys()];
    yes(`tiff ${n} band tags ascend`, keys.every((k, i) => !i || k > keys[i - 1]));
    yes(`tiff ${n} band samples`, d.getUint16(tags.get(277) + 8, true) === n);
    const data = d.getUint32(tags.get(273) + 8, true);
    yes(`tiff ${n} band data is aligned`, data % 4 === 0);
    near(`tiff ${n} band first value`, d.getFloat32(data, true), 1);
    near(`tiff ${n} band last value`, d.getFloat32(t.length - 4, true), 6);
    const tie = d.getUint32(tags.get(33922) + 8, true);
    near(`tiff ${n} band west`, d.getFloat64(tie + 24, true), 100);
    near(`tiff ${n} band north`, d.getFloat64(tie + 32, true), 50);
  }

  /* shapefile: GeoJSON order goes in, outer ring counter-clockwise and hole clockwise */
  const ccw = [[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]], cw = [[1, 1], [1, 2], [2, 2], [2, 1], [1, 1]];
  const fields = [{ name: "name", type: "C", size: 7 }, { name: "score", type: "N", size: 6, decimals: 1 }];
  const s = shapefile({ features: [{ geometry: { type: "Polygon", coordinates: [ccw, cw] }, values: { name: "Өлгий", score: 42.25 } }, { geometry: { type: "MultiPolygon", coordinates: [[ccw]] }, values: { name: "ab", score: null } }], fields, now: new Date(Date.UTC(2026, 10, 7)) });
  const shp = new DataView(s.shp.buffer), shx = new DataView(s.shx.buffer);
  yes("shp file code", shp.getInt32(0) === 9994 && shp.getInt32(28, true) === 1000 && shp.getInt32(32, true) === 5);
  yes("shp length in the header", shp.getInt32(24) * 2 === s.shp.length);
  yes("shx length in the header", shx.getInt32(24) * 2 === s.shx.length && s.shx.length === 116);
  yes("shx offset of the second record", shx.getInt32(108) * 2 === 100 + 8 + shx.getInt32(104) * 2);
  const point = (k) => [shp.getFloat64(100 + 8 + 44 + 8 + k * 16, true), shp.getFloat64(100 + 8 + 44 + 8 + k * 16 + 8, true)];
  yes("shp has two rings and ten points", shp.getInt32(100 + 8 + 36, true) === 2 && shp.getInt32(100 + 8 + 40, true) === 10);
  const ring = (a) => Array.from({ length: 5 }, (_, i) => point(a + i));
  const turn = (r) => r.reduce((t, [x, y], i) => { const [x2, y2] = r[(i + 1) % r.length]; return t + (x2 - x) * (y2 + y); }, 0);
  yes("shp outer ring runs clockwise", turn(ring(0)) > 0);
  yes("shp hole runs the other way", turn(ring(5)) < 0);
  const head = 32 + 32 * 2 + 1, dbf = new DataView(s.dbf.buffer);
  yes("dbf counts", dbf.getUint32(4, true) === 2 && dbf.getUint16(8, true) === head && dbf.getUint16(10, true) === 14);
  const rec = dec.decode(s.dbf.slice(head + 1, head + 14));
  yes("dbf keeps whole letters", rec.startsWith("Өлг") && !rec.includes("�"));
  yes("dbf writes numbers to the right", rec.endsWith("  42.3") || rec.endsWith("  42.2"));
  yes("dbf leaves a missing number blank", dec.decode(s.dbf.slice(head + 14 + 8, head + 28)) === "      ");
  yes("dbf ends properly", s.dbf[s.dbf.length - 1] === 0x1a && s.dbf.length === head + 28 + 1);

  /* pdf */
  const jpeg = new Uint8Array([0xff, 0xd8, 1, 2, 3, 0xff, 0xd9]), p = pdfFromJpeg(jpeg, 200, 100), text = Array.from(p, (b) => String.fromCharCode(b)).join("");
  yes("pdf header", text.startsWith("%PDF-1.4"));
  const start = Number(/startxref\n(\d+)/.exec(text)[1]);
  yes("pdf startxref points at the table", text.slice(start, start + 4) === "xref");
  const rows = text.slice(start).split("\n").slice(3, 8).map((r) => Number(r.slice(0, 10)));
  yes("pdf table points at every object", rows.every((o, i) => text.slice(o, o + 8).startsWith(`${i + 1} 0 obj`)));
  yes("pdf page is A4 landscape for a wide image", text.includes("/MediaBox [0 0 842 595]"));

  /* world file */
  const lines = worldFile({ n: 10, s: 0, e: 20, w: 10 }, 100, 50).trim().split("\r\n").map(Number);
  near("world file x size", lines[0], (mercatorX(20) - mercatorX(10)) / 100, 1e-5);
  near("world file y size is negative", lines[3], (mercatorY(0) - mercatorY(10)) / 50, 1e-5);
  near("world file names the centre of the first pixel", lines[4], mercatorX(10) + lines[0] / 2, 1e-5);
  near("mercator at 45 N", mercatorY(45), 5621521.486, 0.01);
  yes("web mercator wkt", MERCATOR_WKT.startsWith('PROJCS["WGS_1984_Web_Mercator'));

  /* kml */
  const k = kmlPolygons("a & b", [{ name: "<x>", description: "d", color: "#d4231f", geometry: { type: "Polygon", coordinates: [ccw, cw] } }]);
  yes("kml escapes text", k.includes("a &amp; b") && k.includes("&lt;x&gt;"));
  yes("kml colour is alpha blue green red", k.includes("<color>b31f23d4</color>"));
  yes("kml has the hole", k.includes("<innerBoundaryIs>"));
  yes("kml overlay box", kmlGroundOverlay({ name: "n", description: "d", href: "r.png", box: { n: 2, s: 1, e: 4, w: 3 } }).includes("<north>2</north><south>1</south><east>4</east><west>3</west>"));
  return out;
}

if (typeof process !== "undefined" && process.versions?.node) {
  const { default: test } = await import("node:test");
  const { default: assert } = await import("node:assert/strict");
  test("file formats", () => assert.deepEqual(check().filter((r) => !r.ok), []));
}
