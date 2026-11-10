/* GIS files of a detailed check (flood, fire or dust computed on the page) for the download menu.
 *
 * A check hands over a layer: its grid, one class code per pixel with names and colours, any value bands, the lines of
 * its result and what is known of its error. From that come a class raster with its colours and class table, a value
 * raster, polygons of each class (SHP, GeoJSON, KML), a Google Earth overlay (KMZ) and a placed picture (PNG + PGW),
 * each as one ZIP with a README in the language of the page. The pixels stay the pixels of the check: nothing is
 * resampled, so the files hold exactly what the map shows. */
import { MIME, WGS84_WKT, arcgisXml, auxXml, featureCollection, geoTiff, geoTiffClasses, kmlGroundOverlay, kmlPolygons, shapefile, zip } from "../formats.js";
import { toPng } from "../export.js";
import { polygonize } from "./vector.js";
import { rowAreaKm2 } from "./raster.js";

const text = new TextEncoder();
const NO = -9999;
const hex = (c) => "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");
const r4 = (v) => Math.round(v * 1e4) / 1e4;
const entry = (name, data) => ({ name, data: typeof data === "string" ? text.encode(data) : data });

/** The six lines that place a picture or raster on a grid in degrees. The last two are the centre of the top left pixel. */
export const worldFileDeg = (g) => [g.dx, 0, 0, -g.dy, g.west + g.dx / 2, g.north - g.dy / 2].map((v) => v.toFixed(10)).join("\r\n") + "\r\n";

/** Polygon fields: the class, its area and how much of it was too small to draw. */
export const FIELDS = [
  { name: "code", type: "N", size: 4 }, { name: "cls_key", type: "C", size: 12 }, { name: "cls_mn", type: "C", size: 80 }, { name: "cls_en", type: "C", size: 60 },
  { name: "area_km2", type: "N", size: 14, decimals: 4 }, { name: "share_pct", type: "N", size: 7, decimals: 2 }, { name: "n_poly", type: "N", size: 9 },
  { name: "small_km2", type: "N", size: 12, decimals: 4 }, { name: "hazard", type: "C", size: 8 }, { name: "period", type: "C", size: 23 }, { name: "px_m", type: "N", size: 4 },
];

/** Smallest group drawn as a polygon, in pixels: about 1,000 m2, so that single noisy pixels do not swell the files.
 * Smaller groups stay in the rasters and their area is counted in small_km2. */
export const minPixelsFor = (scale) => Math.max(1, Math.round(1000 / (scale * scale)));

export function initDetailFiles({ t }) {
  const fill = (k, o) => Object.entries(o).reduce((a, [x, y]) => a.replaceAll(`{${x}}`, y), t(k));
  const cache = new WeakMap();

  /** Areas and polygons of every class, worked out once per result. */
  function shapes(L) {
    if (cache.has(L)) return cache.get(L);
    const rowKm2 = rowAreaKm2(L.grid), wanted = new Set(L.classes.filter((c) => c.vector).map((c) => c.code));
    const all = new Map(), byRow = L.grid.w;
    for (let i = 0; i < L.codes.length; i++) { const v = L.codes[i]; all.set(v, (all.get(v) ?? 0) + rowKm2[Math.floor(i / byRow)]); }
    const poly = polygonize(L.codes, L.grid, { keep: (v) => wanted.has(v), rowKm2, minPixels: minPixelsFor(L.scale) });
    const seen = [...all].filter(([v]) => !L.missing.includes(v)).reduce((s, [, a]) => s + a, 0);
    const out = { area: all, poly, seen, total: [...all.values()].reduce((s, a) => s + a, 0) };
    cache.set(L, out);
    return out;
  }

  const base = (L) => `mongolia_${L.hazard}_detail_${L.stamp}`;
  const facts = (L) => ({ project: "Mongolia Hazard Watch", product: L.titleEn, hazard: L.hazard, period: L.period, area_bbox_wsen: [L.box.w, L.box.s, L.box.e, L.box.n].map((x) => x.toFixed(5)).join(","), area_km2: r4(L.km2), pixel_m: L.scale, reference_system: "EPSG:4326 (WGS 84)", ...L.meta, note: "Not an official warning." });
  const sidecar = (L, title) => arcgisXml({ title, summary: L.summaryEn, description: Object.entries(facts(L)).map(([k, v]) => `${k}: ${v}`).join("\n"), credits: L.creditsEn });

  /* ------------------------------------------------------------- rasters */
  function classTable(L) {
    const s = shapes(L);
    return {
      fields: [{ name: "Value", type: 0, usage: 5 }, { name: "Class_mn", type: 2, usage: 2 }, { name: "Class_en", type: 2, usage: 0 }, { name: "Area_km2", type: 1, usage: 0 }, { name: "Red", type: 0, usage: 6 }, { name: "Green", type: 0, usage: 7 }, { name: "Blue", type: 0, usage: 8 }],
      rows: L.classes.map((c) => [c.code, c.mn, c.en, (s.area.get(c.code) ?? 0).toFixed(4), ...c.color]),
    };
  }

  function rasterFiles(L) {
    const g = L.grid, name = base(L), cls = `${name}_classes`, files = [];
    const tif = geoTiffClasses({ w: g.w, h: g.h, codes: L.codes, palette: L.classes.map((c) => [c.code, c.color]), west: g.west, north: g.north, dx: g.dx, dy: g.dy, noData: L.noData, name: `${L.hazard}_class`, description: L.summaryEn, meta: facts(L) });
    files.push(entry(`${cls}.tif`, tif), entry(`${cls}.tif.aux.xml`, auxXml({ names: [`${L.hazard}_class`], bands: [L.codes], noData: L.noData, tables: [classTable(L)] })),
      entry(`${cls}.tfw`, worldFileDeg(g)), entry(`${cls}.prj`, WGS84_WKT), entry(`${cls}.tif.xml`, sidecar(L, `Mongolia Hazard Watch: ${L.titleEn}, classes`)));
    if (L.bands.length) {
      const val = `${name}_values`, names = L.bands.map((b) => b.name), bands = L.bands.map((b) => b.data);
      files.push(entry(`${val}.tif`, geoTiff({ w: g.w, h: g.h, bands, names, west: g.west, north: g.north, dx: g.dx, dy: g.dy, noData: NO, description: L.summaryEn, meta: facts(L) })),
        entry(`${val}.tif.aux.xml`, auxXml({ names, bands, noData: NO })), entry(`${val}.tfw`, worldFileDeg(g)), entry(`${val}.prj`, WGS84_WKT),
        entry(`${val}.tif.xml`, sidecar(L, `Mongolia Hazard Watch: ${L.titleEn}, values`)));
    }
    return files;
  }

  /* -------------------------------------------------------------- vectors */
  function features(L) {
    const s = shapes(L), out = [];
    for (const c of L.classes) {
      const p = s.poly.get(c.code);
      if (!c.vector || !p || !p.polygons.length) continue;
      out.push({
        geometry: p.polygons.length === 1 ? { type: "Polygon", coordinates: p.polygons[0] } : { type: "MultiPolygon", coordinates: p.polygons },
        color: hex(c.color), name: c.mn,
        values: { code: c.code, cls_key: c.key, cls_mn: c.mn, cls_en: c.en, area_km2: r4(p.km2), share_pct: s.seen ? Math.round(10000 * p.km2 / s.seen) / 100 : 0, n_poly: p.n, small_km2: r4(p.smallKm2), hazard: L.hazard, period: L.periodShort, px_m: L.scale },
      });
    }
    if (!out.length) throw new Error(t("dd_no_poly"));
    return out;
  }

  function shpFiles(L) {
    const f = features(L), s = shapefile({ features: f, fields: FIELDS }), name = `${base(L)}_polygons`;
    return [...["shp", "shx", "dbf", "prj", "cpg"].map((x) => entry(`${name}.${x}`, s[x])), entry(`${name}.shp.xml`, sidecar(L, `Mongolia Hazard Watch: ${L.titleEn}, polygons by class`))];
  }
  const geojsonFiles = (L) => [entry(`${base(L)}_polygons.geojson`, featureCollection(features(L).map((x) => ({ type: "Feature", geometry: x.geometry, properties: x.values })), facts(L)))];
  const kmlFiles = (L) => [entry(`${base(L)}_polygons.kml`, kmlPolygons(`${L.title} ${L.periodShort}`, features(L).map((x) => ({
    name: x.name, color: x.color, geometry: x.geometry, description: `${x.values.area_km2} ${t("km2")} · ${x.values.n_poly} ${t("dd_pieces")}`,
  })), L.summaryHere))];

  /* -------------------------------------------------------------- pictures */
  async function picture(L) {
    const g = L.grid, cv = document.createElement("canvas");
    cv.width = g.w; cv.height = g.h;
    const ctx = cv.getContext("2d"), img = ctx.createImageData(g.w, g.h), px = img.data, color = new Map(L.classes.filter((c) => c.paint).map((c) => [c.code, c.color]));
    for (let i = 0; i < L.codes.length; i++) {
      const c = color.get(L.codes[i]);
      if (!c) continue;
      px[i * 4] = c[0]; px[i * 4 + 1] = c[1]; px[i * 4 + 2] = c[2]; px[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return new Uint8Array(await (await toPng(cv)).arrayBuffer());
  }
  const outline = (L) => ({ n: L.grid.north, s: L.grid.north - L.grid.h * L.grid.dy, w: L.grid.west, e: L.grid.west + L.grid.w * L.grid.dx });

  async function pngFiles(L) {
    const name = `${base(L)}_map`;
    return [entry(`${name}.png`, await picture(L)), entry(`${name}.pgw`, worldFileDeg(L.grid)), entry(`${name}.prj`, WGS84_WKT), entry(`${name}.png.aux.xml`, auxXml({ wkt: WGS84_WKT, meta: facts(L) }))];
  }
  async function kmzFiles(L) {
    const doc = kmlGroundOverlay({ name: `${L.title} ${L.periodShort}`, description: L.summaryHere, href: "classes.png", box: outline(L) });
    const kmz = zip([{ name: "doc.kml", data: text.encode(doc) }, { name: "classes.png", data: await picture(L) }], MIME.kmz);
    return [entry(`${base(L)}.kmz`, new Uint8Array(await kmz.arrayBuffer()))];
  }

  /* ------------------------------------------------------------- README */
  function readme(L, what, files) {
    const out = [], pair = (k, v) => out.push(`${t(k)}: ${v}`), section = (k) => out.push("", t(k).toUpperCase(), "-".repeat(46));
    const s = shapes(L), km = (v) => (v < 10 ? v.toFixed(2) : v < 1000 ? v.toFixed(1) : Math.round(v).toLocaleString("en-US"));
    out.push(L.title.toUpperCase(), "=".repeat(46));
    pair("dd_period", L.period);
    pair("n_area", `${km(L.km2)} ${t("km2")} (${t("dd_bbox")} ${L.box.w.toFixed(4)}, ${L.box.s.toFixed(4)}, ${L.box.e.toFixed(4)}, ${L.box.n.toFixed(4)})`);
    pair("dd_pixel", `${L.scale} ${t("dd_m")}`);
    pair("n_file", what);
    if (L.verdict) { section("dd_verdict"); out.push(L.verdict); }
    section("n_result");
    for (const l of L.lines) out.push(`• ${l}`);
    section("dd_classes");
    // shares of the part with data, as in the polygon files; a class that stands for missing data is a share of the whole box
    for (const c of L.classes) {
      const a = s.area.get(c.code) ?? 0, p = s.poly.get(c.code), gap = L.missing.includes(c.code), of = gap ? s.total : s.seen;
      if (gap && !a) continue;
      out.push(`  ${c.code} = ${c.mn}: ${km(a)} ${t("km2")}${of ? ` (${(100 * a / of).toFixed(1)}%${gap ? ` ${t("dd_of_box")}` : ""})` : ""}${p ? ` · ${fill("dd_class_poly", { n: p.n, s: km(p.smallKm2) })}` : ""}`);
    }
    const least = minPixelsFor(L.scale);
    out.push(least > 1 ? fill("dd_small", { a: Math.round(least * L.scale * L.scale) }) : t("dd_small_all"));
    section("n_error");
    for (const l of L.error) out.push(l);
    section("dd_warn");
    out.push(L.warn);
    section("n_files");
    for (const f of files) out.push(`  ${f.name}`);
    section("n_open");
    const has = (re) => files.some((f) => re.test(f.name));
    out.push(t("n_unzip"));
    if (has(/_classes\.tif$/)) out.push(fill("dd_open_classes", { nd: L.noData }), L.noDataNote);
    if (has(/_values\.tif$/)) out.push(t("dd_open_values"), ...L.bands.map((b, i) => `  ${i + 1}: ${b.name} — ${b.about}`));
    if (has(/\.shp$/)) out.push(t("n_open_shp"));
    if (has(/\.(shp|geojson|kml)$/)) out.push(t("dd_fields"));
    if (has(/\.geojson$/)) out.push(t("n_open_json"));
    if (has(/\.km[lz]$/)) out.push(t("n_open_kml"));
    if (has(/\.png$/)) out.push(t("dd_open_png"));
    section("n_sources");
    out.push(L.method, L.src);
    out.push("", t("dd_footer"));
    return "﻿" + out.join("\r\n") + "\r\n";
  }

  /* --------------------------------------------------------------- jobs */
  const job = (suffix, make) => async (L) => ({ base: `${base(L)}_${suffix}`, files: await make(L) });
  const jobs = {
    tif: job("tif", rasterFiles), shp: job("shp", shpFiles), geojson: job("geojson", geojsonFiles), kml: job("kml", kmlFiles), kmz: job("kmz", kmzFiles), png: job("png", pngFiles),
    all: async (L) => {
      const files = [...rasterFiles(L), ...await pngFiles(L), ...await kmzFiles(L)];
      // a check that found nothing to draw still gives its rasters and README
      try { files.push(...shpFiles(L), ...geojsonFiles(L), ...kmlFiles(L)); } catch { /* the README says no polygons */ }
      return { base: `${base(L)}_all`, files };
    },
  };

  /** The ZIP of one format: its files and the README. */
  async function build(L, kind, what) {
    const { base: name, files } = await jobs[kind](L);
    return { name: `${name}.zip`, blob: zip([...files, entry(`${name}_README.txt`, readme(L, what, files))]) };
  }

  /** The buttons of the menu row: label, kind and tip. */
  const formats = () => [["GeoTIFF", "tif", t("dd_tip_tif")], ["SHP", "shp", t("dd_tip_shp")], ["GeoJSON", "geojson"], ["KML", "kml"], ["KMZ", "kmz", t("dd_tip_kmz")], ["PNG+PGW", "png", t("dd_tip_png")], ["ZIP", "all", t("dd_tip_all")]];

  return { build, formats, shapes, readme };
}
