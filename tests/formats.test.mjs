/* The hand-written file formats. check() is plain JavaScript so it also runs in a browser where Node is not installed. */
import { MERCATOR_WKT, arcgisXml, auxXml, bandStats, csv, featureCollection, geoTiff, geoTiffClasses, geoTiffRgb, kmlGroundOverlay, kmlPolygons, mercatorX, mercatorY, pdfFromJpeg, shapefile, worldFile, zip } from "../js/formats.js";

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

  /* tags that carry the result inside the file */
  const tagsOf = (u8) => {
    const d = new DataView(u8.buffer), tags = new Map();
    for (let i = 0; i < d.getUint16(8, true); i++) tags.set(d.getUint16(10 + i * 12, true), { at: 10 + i * 12, n: d.getUint32(14 + i * 12, true), off: d.getUint32(18 + i * 12, true) });
    return { d, tags, str: (id) => dec.decode(u8.slice(tags.get(id).off, tags.get(id).off + tags.get(id).n - 1)) };
  };
  const noted = tagsOf(geoTiff({ w: 2, h: 1, bands: [Float32Array.from([10, -9999]), Float32Array.from([4, -9999])], names: ["score", "U95"], west: 100, north: 50, dx: 1, dy: 1, description: "Өндөр: mean 10 +-4", meta: { U95_points: 4, skip: null } }));
  yes("tiff tags ascend with the notes added", [...noted.tags.keys()].every((k, i, a) => !i || k > a[i - 1]));
  yes("tiff description is plain ascii", noted.str(270) === "?????: mean 10 +-4");
  yes("tiff names its software", noted.str(305) === "Mongolia Hazard Watch");
  const gdal = noted.str(42112);
  yes("gdal metadata holds the error", gdal.includes('<Item name="U95_points">4</Item>') && !gdal.includes("skip"));
  yes("gdal metadata names the bands", gdal.includes('<Item name="DESCRIPTION" sample="1" role="description">U95</Item>'));
  yes("gdal metadata statistics skip no data", gdal.includes('<Item name="STATISTICS_MINIMUM" sample="0">10</Item>'));
  yes("band statistics leave out no data", bandStats(Float32Array.from([2, 4, -9999])).mean === 3);
  yes("band statistics of an empty band", bandStats(Float32Array.from([-9999])) === null);

  const rgba = Uint8ClampedArray.from([1, 2, 3, 255, 4, 5, 6, 255]), rgb = geoTiffRgb({ w: 2, h: 1, rgba, box: { n: 10, s: 0, e: 20, w: 10 }, description: "x" }), R = tagsOf(rgb);
  yes("rgb tiff is rgb", R.d.getUint16(R.tags.get(262).at + 8, true) === 2 && R.d.getUint16(R.tags.get(277).at + 8, true) === 3);
  yes("rgb tiff drops alpha", [...rgb.slice(rgb.length - 6)].join() === "1,2,3,4,5,6");
  near("rgb tiff west in metres", R.d.getFloat64(R.tags.get(33922).off + 24, true), mercatorX(10), 1e-6);
  near("rgb tiff north in metres", R.d.getFloat64(R.tags.get(33922).off + 32, true), mercatorY(10), 1e-6);
  yes("rgb tiff is web mercator", R.d.getUint16(R.tags.get(34735).off + 30, true) === 3857);

  const pam = auxXml({ wkt: "W<1>", meta: { U95: 4 }, names: ["a"], bands: [Float32Array.from([1, 3])] });
  yes("aux file holds the projection", pam.includes("<SRS>W&lt;1&gt;</SRS>"));
  yes("aux file holds the result", pam.includes('<MDI key="U95">4</MDI>'));
  yes("aux file holds band statistics", pam.includes('<PAMRasterBand band="1"><Description>a</Description>') && pam.includes('<MDI key="STATISTICS_MAXIMUM">3</MDI>'));
  /* class raster with colours and its class table */
  const C = tagsOf(geoTiffClasses({ w: 3, h: 1, codes: Uint8Array.from([0, 2, 255]), palette: [[2, [10, 20, 30]]], west: 1, north: 2, dx: 0.5, dy: 0.5, noData: 255 }));
  yes("class tiff is one byte band with a palette", C.d.getUint16(C.tags.get(262).at + 8, true) === 3 && C.d.getUint16(C.tags.get(258).at + 8, true) === 8 && C.tags.get(320).n === 768);
  yes("class tiff colour of code 2 in 16 bits", C.d.getUint16(C.tags.get(320).off + 2 * 2, true) === 10 * 257 && C.d.getUint16(C.tags.get(320).off + (256 + 2) * 2, true) === 20 * 257 && C.d.getUint16(C.tags.get(320).off + (512 + 2) * 2, true) === 30 * 257);
  yes("class tiff keeps the codes", [...new Uint8Array(C.d.buffer).slice(-3)].join() === "0,2,255");
  yes("class tiff no data", dec.decode(new Uint8Array(C.d.buffer, C.tags.get(42113).at + 8, 3)) === "255");
  const rat = auxXml({ names: ["c"], bands: [Uint8Array.from([1, 2])], noData: 255, tables: [{ fields: [{ name: "Value", type: 0, usage: 5 }, { name: "Class_mn", type: 2, usage: 2 }], rows: [[1, "Ус & шавар"]] }] });
  yes("aux file holds the class table", rat.includes('<GDALRasterAttributeTable tableType="thematic"><FieldDefn index="0"><Name>Value</Name><Type>0</Type><Usage>5</Usage></FieldDefn>') && rat.includes('<Row index="0"><F>1</F><F>Ус &amp; шавар</F></Row>'));
  const esriXml = arcgisXml({ title: "a & b", summary: "s", description: "d", credits: "c" });
  yes("arcgis metadata", esriXml.startsWith("<?xml") && esriXml.includes("<resTitle>a &amp; b</resTitle>") && esriXml.includes("<idPurp>s</idPurp>") && esriXml.includes("<idAbs>d</idAbs>"));

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
  const pi = Array.from(pdfFromJpeg(jpeg, 200, 100, { title: "Үер", subject: "a" }), (b) => String.fromCharCode(b)).join("");
  yes("pdf title is utf-16", pi.includes("/Title <FEFF04AE04350440>"));
  yes("pdf points at its properties", pi.includes("/Info 6 0 R"));

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
  yes("kml line style comes before the polygon style", k.indexOf("<LineStyle>") < k.indexOf("<PolyStyle>"));
  yes("kml document can hold the result", kmlPolygons("n", [], "mean 10").includes("<name>n</name><description>mean 10</description>"));
  const fc = JSON.parse(featureCollection([], { U95: 4 }));
  yes("geojson holds the result beside the features", fc.metadata.U95 === 4 && fc.type === "FeatureCollection");
  yes("geojson without notes stays plain", !("metadata" in JSON.parse(featureCollection([]))));
  yes("kml overlay box", kmlGroundOverlay({ name: "n", description: "d", href: "r.png", box: { n: 2, s: 1, e: 4, w: 3 } }).includes("<north>2</north><south>1</south><east>4</east><west>3</west>"));
  return out;
}

/** Reads the first date and time of a ZIP back, as the format has them. */
export async function zipStamp(now) {
  const d = new DataView(await zip([{ name: "a", data: new Uint8Array(1) }], undefined, now).arrayBuffer());
  return { time: d.getUint16(10, true), date: d.getUint16(12, true) };
}

if (typeof process !== "undefined" && process.versions?.node) {
  const { default: test } = await import("node:test");
  const { default: assert } = await import("node:assert/strict");
  test("file formats", () => assert.deepEqual(check().filter((r) => !r.ok), []));
  test("zip keeps the time of the download", async () => {
    const z = await zipStamp(new Date(2026, 10, 8, 13, 30, 10));
    assert.equal(z.date, ((2026 - 1980) << 9) | (11 << 5) | 8);
    assert.equal(z.time, (13 << 11) | (30 << 5) | 5);
  });
}
