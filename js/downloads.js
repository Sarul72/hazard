/* The download menu. Every kind of data is offered in the formats that suit it: pictures as images, gridded values as a
 * raster, tables as CSV, boundaries as vector files. Data files follow the selected area, and every download is one ZIP that
 * also holds a text file explaining the result and its possible error, so a number never travels without its error. */
import { CLASSES, GIBS } from "./config.js";
import { decode } from "./dataset.js";
import { boxCells } from "./stats.js";
import { dayReport, toCsv } from "./area.js";
import { el } from "./dom.js";
import { versionAt } from "./gibs.js";
import { cellRows, drawMap, save, toJpeg, toPng } from "./export.js";
import { MERCATOR_WKT, MIME, csv, featureCollection, geoTiff, kmlGroundOverlay, kmlPolygons, pdfFromJpeg, pointFeature, shapefile, worldFile, zip } from "./formats.js";

const SOUM_FIELDS = [
  { name: "soum", type: "C", size: 60 }, { name: "aimag", type: "C", size: 60 }, { name: "soum_en", type: "C", size: 40 }, { name: "aimag_en", type: "C", size: 40 },
  { name: "hazard", type: "C", size: 8 }, { name: "date", type: "C", size: 10 }, { name: "score", type: "N", size: 6, decimals: 1 }, { name: "class", type: "C", size: 30 },
  { name: "U95", type: "N", size: 6, decimals: 1 }, { name: "U95_min", type: "C", size: 1 },
];

const text = new TextEncoder();
const round = (v, d = 1) => (typeof v === "number" ? +v.toFixed(d) : null);
const bytesOf = async (b) => new Uint8Array(await b.arrayBuffer());
const entry = async (name, data) => ({ name, data: data instanceof Blob ? await bytesOf(data) : typeof data === "string" ? text.encode(data) : data });
/** A job gives the base name of the download and its files. */
const single = async (name, data) => ({ base: name.replace(/\.([^.]+)$/, "_$1"), files: [await entry(name, data)] });

export function initDownloads({ box, state, t, frameNow, uFrameNow, classOf, classLabel, classes, soumsReady, borders }) {
  const fill = (k, o) => Object.entries(o).reduce((a, [x, y]) => a.replace(`{${x}}`, y), t(k));
  const baseLayer = () => versionAt(GIBS.layers.find((l) => l.kind === "base" && state.sat[l.key].on), state.date);
  const fileBase = (c) => `mongolia_${c.day ? state.hazard : "image"}_${state.date}${c.s ? "_area" : ""}`;

  /** Everything the files are made from: the selection if there is one, otherwise the view. Without results, only the image. */
  function context() {
    const m = state.manifest, fr = frameNow(), s = state.sel, b = state.map.getBounds();
    const view = { s: b.getSouth(), n: b.getNorth(), w: b.getWest(), e: b.getEast() }, plume = state.tools.plumeSnapshot();
    if (!m || !fr) return { view, plume, s: null };
    const cells = s?.cells?.length ? s.cells : boxCells(m.grid, view);
    const uModel = m.uncertainty?.[state.hazard]?.u_model ?? null;
    const day = dayReport({ frame: fr, uframe: uFrameNow(), cells, grid: m.grid, classes: CLASSES, uModel });
    return day ? { m, fr, s, cells, uModel, day, view, plume } : { view, plume, s: null };
  }

  /* ----------------------------------------------------------- map image */
  function errorLines(c) {
    const f = (v) => (typeof v === "number" ? `±${v.toFixed(1)}` : t("u_none")), b = c.day.budget, v = c.m.verification?.[state.hazard];
    const at = b.missing.length ? "≥" : "";
    const lines = [{ text: t("x_error"), strong: true },
      { text: `${c.s ? t("x_sel") : t("x_view")}: ${c.day.mean.toFixed(0)} ± ${at}${b.U.toFixed(0)} ${t("points")} (95%)`, strong: true },
      { text: fill("x_parts", { i: f(b.parts.input), m: f(b.parts.model), s: f(b.parts.sampling) }) }];
    if (b.missing.length) lines.push({ text: t("x_missing"), warn: true });
    if (v?.auc) lines.push({ text: fill("x_verify", { a: v.auc.toFixed(2), p: v.period ?? "" }) });
    if (c.m.bridge_from && state.date >= c.m.bridge_from) lines.push({ text: t("x_bridge"), warn: true });
    const camps = c.s?.campReport?.parcels;
    if (camps) lines.push({ text: fill("x_camps", { n: camps.total.toLocaleString("en-US"), h: camps.high.toLocaleString("en-US") }) });
    if (c.plume) lines.push({ text: fill("x_plume", { m: c.plume.materialName, t: c.plume.time.replace("T", " ") }) });
    lines.push({ text: t("x_grid") }, { text: t("x_not_official"), warn: true });
    return lines;
  }

  function imageLines(c) {
    const b = baseLayer(), lines = [{ text: fill("x_image", { s: b.sensor, d: state.date }), strong: true }, { text: fill("x_image_src", { r: b.res }) }];
    if (c.plume) lines.push({ text: fill("x_plume", { m: c.plume.materialName, t: c.plume.time.replace("T", " ") }) }, { text: t("x_not_official"), warn: true });
    return lines;
  }

  function mapCanvas(c, clean = false) {
    const risky = Boolean(c.day), base = baseLayer();
    return drawMap({
      map: state.map, base, date: state.date, clean,
      title: t(risky ? "title" : "x_image_title"),
      subtitle: risky ? [`${t(state.hazard)} · ${state.date}`, c.s ? c.s.label : t("x_view")] : [`${base.sensor} · ${state.date}`],
      risk: risky && state.mode === "zones" ? { canvas: state.risk.canvas, box: state.risk.box } : null,
      soums: risky && state.mode === "soums" && state.soums ? state.soums.features.map((f) => { const v = state.soumLayer.score(f); return { geometry: f.geometry, color: v === null || v === undefined ? "#555" : classOf(v).color }; }) : null,
      borders: borders(), camps: risky ? state.campsImage : null, plume: c.plume, selection: c.s ? { box: c.s.box, geom: c.s.geom } : null,
      legend: risky ? classes().map((k) => ({ color: k.color, label: classLabel(k.key) })) : [], error: risky ? errorLines(c) : imageLines(c),
    });
  }

  const asJpg = async (c) => single(`${fileBase(c)}.jpg`, await toJpeg((await mapCanvas(c)).canvas));
  const asPng = async (c) => single(`${fileBase(c)}.png`, await toPng((await mapCanvas(c)).canvas));
  async function asPdf(c) {
    const { canvas } = await mapCanvas(c), jpeg = await bytesOf(await toJpeg(canvas));
    return single(`${fileBase(c)}.pdf`, pdfFromJpeg(jpeg, canvas.width, canvas.height));
  }
  /** The image with what GIS software needs to place it. ArcGIS reads the projection from the .aux.xml, others from the .prj.
   * A plain satellite image stays free of any labels. */
  async function asGisImage(c) {
    const name = fileBase(c), { canvas, bounds } = await mapCanvas(c, !c.day);
    return { base: `${name}_gis`, files: [await entry(`${name}.jpg`, await toJpeg(canvas)), await entry(`${name}.jgw`, worldFile(bounds, canvas.width, canvas.height)),
      await entry(`${name}.prj`, MERCATOR_WKT), await entry(`${name}.jpg.aux.xml`, `<PAMDataset><SRS>${MERCATOR_WKT}</SRS></PAMDataset>`)] };
  }

  /* --------------------------------------------------------- grid values */
  function extent(c) {
    const g = c.m.grid, rows = c.cells.map((x) => x.r), cols = c.cells.map((x) => x.c);
    const r0 = Math.min(...rows), r1 = Math.max(...rows), c0 = Math.min(...cols), c1 = Math.max(...cols);
    return { r0, c0, w: c1 - c0 + 1, h: r1 - r0 + 1, west: g.west + c0 * g.dx, north: g.north - r0 * g.dy };
  }
  const rowsOf = (c) => cellRows({ grid: c.m.grid, cells: c.cells, frame: c.fr, uframe: uFrameNow(), uModel: c.uModel, decode, classOf, label: classLabel });

  function asTif(c) {
    const e = extent(c), score = new Float32Array(e.w * e.h).fill(-9999), u = new Float32Array(e.w * e.h).fill(-9999);
    for (const r of rowsOf(c)) {
      const i = (r.r - e.r0) * e.w + (r.c - e.c0);
      score[i] = r.score;
      if (r.U95 !== null) u[i] = r.U95;
    }
    return single(`${fileBase(c)}_score_U95.tif`, geoTiff({ w: e.w, h: e.h, bands: [score, u], west: e.west, north: e.north, dx: c.m.grid.dx, dy: c.m.grid.dy }));
  }

  /** The risk classes as a picture for Google Earth, one square per cell, regular in latitude and longitude. */
  async function asKmz(c) {
    const e = extent(c), K = 6, cv = document.createElement("canvas");
    cv.width = e.w * K; cv.height = e.h * K;
    const ctx = cv.getContext("2d");
    ctx.globalAlpha = 0.75;
    for (const r of rowsOf(c)) { ctx.fillStyle = classOf(r.score).color; ctx.fillRect((r.c - e.c0) * K, (r.r - e.r0) * K, K, K); }
    const g = c.m.grid, png = await bytesOf(await toPng(cv));
    const doc = kmlGroundOverlay({ name: `${t(state.hazard)} ${state.date}`, description: `${c.day.mean.toFixed(0)} ± ${c.day.budget.missing.length ? "≥" : ""}${c.day.budget.U.toFixed(0)} ${t("points")} (95%). ${t("x_not_official")}`, href: "risk.png", box: { n: e.north, s: e.north - e.h * g.dy, w: e.west, e: e.west + e.w * g.dx } });
    return single(`${fileBase(c)}.kmz`, zip([{ name: "doc.kml", data: text.encode(doc) }, { name: "risk.png", data: png }], MIME.kmz));
  }

  const CELL_HEAD = ["lat", "lon", "score", "class", "u_input", "u_model", "U95", "U95_is_lower_bound"];
  const asCellsCsv = (c) => single(`${fileBase(c)}_cells.csv`, csv(CELL_HEAD, rowsOf(c).map((r) => [r.lat, r.lon, r.score, r.label, r.u_input, r.u_model, r.U95, r.U95_min])));
  const asCellsGeoJson = (c) => single(`${fileBase(c)}_cells.geojson`, featureCollection(rowsOf(c).map((r) => pointFeature(r.lon, r.lat, { score: r.score, class: r.label, u_input: r.u_input, u_model: r.u_model, U95: r.U95, U95_is_lower_bound: r.U95_min }))));

  /* --------------------------------------------------------------- soums */
  /** The soums touched by the selection, or all of them when nothing is selected. */
  async function soumRows(c) {
    const soums = await soumsReady();
    if (!soums) throw new Error(t("soum_none"));
    const inside = c.s ? new Set(c.s.cells.map((x) => x.i)) : null;
    return soums.features.filter((f) => !inside || f.cells.some((x) => inside.has(x.i))).map((f) => {
      const d = dayReport({ frame: c.fr, uframe: uFrameNow(), cells: f.cells, grid: c.m.grid, classes: CLASSES, uModel: c.uModel });
      return { geometry: f.geometry, color: d ? classOf(d.mean).color : "#555555", values: { soum: f.names.mn, aimag: f.aimags.mn, soum_en: f.names.en, aimag_en: f.aimags.en, hazard: state.hazard, date: state.date, score: d ? round(d.mean) : null, class: d ? classLabel(classOf(d.mean).key) : "", U95: d ? round(d.budget.U) : null, U95_min: d?.budget.missing.length ? "Y" : "N" } };
    });
  }
  const soumName = (c) => `${fileBase(c)}_soums`;
  const asSoumCsv = async (c) => { const r = await soumRows(c), k = SOUM_FIELDS.map((f) => f.name); return single(`${soumName(c)}.csv`, csv(k, r.map((x) => k.map((n) => x.values[n])))); };
  const asSoumGeoJson = async (c) => single(`${soumName(c)}.geojson`, featureCollection((await soumRows(c)).map((x) => ({ type: "Feature", geometry: x.geometry, properties: x.values }))));
  async function asSoumKml(c) {
    const r = await soumRows(c), v = (x) => x.values;
    return single(`${soumName(c)}.kml`, kmlPolygons(`${t(state.hazard)} ${state.date}`, r.map((x) => ({ name: `${v(x).soum} (${v(x).aimag})`, description: v(x).score === null ? t("no_data") : `${v(x).score} ± ${v(x).U95_min === "Y" ? "≥" : ""}${v(x).U95} ${t("points")} (95%) · ${v(x).class}`, color: x.color, geometry: x.geometry }))));
  }
  async function asSoumShp(c) {
    const name = soumName(c), s = shapefile({ features: await soumRows(c), fields: SOUM_FIELDS });
    return { base: `${name}_shp`, files: ["shp", "shx", "dbf", "prj", "cpg"].map((x) => ({ name: `${name}.${x}`, data: s[x] })) };
  }

  /* -------------------------------------------------------------- series */
  const hasSeries = (c) => Boolean(c.s?.long);
  const asSeriesCsv = (c) => single(`${fileBase(c)}_series.csv`, "﻿" + toCsv({ label: c.s.label, hazard: state.hazard, months: c.s.months, years: c.s.long.years, high: c.s.long.high }));
  function asSeriesJson(c) {
    const s = c.s, days = new Map(s.long.high.map((r) => [r.y, r.v]));
    const data = { area: s.label, hazard: state.hazard, unit: "score 0-100",
      months: s.months.map((r) => ({ period: `${r.y}-${String(r.m).padStart(2, "0")}`, mean_score: round(r.v, 2) })),
      years: s.long.years.map((r) => ({ year: r.y, mean_score: round(r.v, 2), high_risk_days: round(days.get(r.y)) })), trend: s.long.trend };
    return single(`${fileBase(c)}_series.json`, JSON.stringify(data, null, 1));
  }

  /* --------------------------------------------------------------- plume */
  function asPlumeTif(c) {
    const p = c.plume, e = p.box;
    return single(`${fileBase(c)}_dust_${p.material}.tif`, geoTiff({ w: p.w, h: p.h, bands: [p.index], west: e.w, north: e.n, dx: (e.e - e.w) / p.w, dy: (e.n - e.s) / p.h }));
  }
  const asWindCsv = (c) => single(`${fileBase(c)}_wind.csv`, csv(["lat", "lon", "u_m_s", "v_m_s", "speed_m_s", "from_deg", "time"], c.plume.wind.map((w) => [round(w.lat, 4), round(w.lon, 4), round(w.u, 2), round(w.v, 2), round(w.speed, 2), round(w.from), c.plume.time])));

  /* -------------------------------------------------------------- report */
  function reportOf(c) {
    const b = c.day.budget, v = c.m.verification?.[state.hazard] ?? null;
    return {
      title: `${t("title")}: ${t(state.hazard)}`, date: state.date, hazard: state.hazard, generated: new Date().toISOString(),
      area: c.s ? { label: c.s.label, kind: c.s.kind, bbox: c.s.box } : { label: t("x_view"), bbox: c.view },
      reference_system: "EPSG:4326 (WGS 84)", spatial_resolution_deg: c.m.grid.dx, data_version: c.m.generated_at, weather_from_gfs: Boolean(c.m.bridge_from && state.date >= c.m.bridge_from),
      result: { mean_score: +c.day.mean.toFixed(1), max_score: +c.day.max.toFixed(1), coverage: +c.day.coverage.toFixed(3), area_km2: Math.round(c.day.area), class_shares: Object.fromEntries(CLASSES.map((k, i) => [k.key, +c.day.share[i].toFixed(3)])) },
      uncertainty: { method: "JCGM 100 (GUM), quadrature, k = 2", u_input: b.parts.input ?? null, u_model: b.parts.model ?? null, u_sampling: b.parts.sampling ?? null, u_combined: +b.uc.toFixed(2), U_expanded: +b.U.toFixed(2), not_estimated: b.missing, is_lower_bound: b.missing.length > 0 },
      verification: v, score_classes: CLASSES.map((k) => ({ class: k.key, from: k.min, to: Math.min(k.max, 100) })), lineage: c.m.sources?.[state.hazard] ?? c.m.sources ?? null,
      camps: c.s?.campReport ? { cadastre: c.s.campReport.parcels, herder_points: c.s.campReport.herders, note: "Positions rounded to 0.01 degree; the two registers may overlap and must not be added." } : null,
      plume: c.plume ? { material: c.plume.material, density_g_cm3: c.plume.density, source: [c.plume.lat, c.plume.lon], time: c.plume.time, wind_spread_deg: c.plume.spread, exposed_camps: c.plume.camps, note: "Relative index, not a concentration." } : null,
      disclaimer: t("footer"),
    };
  }
  const asReport = (c) => single(`${fileBase(c)}_report.json`, JSON.stringify(reportOf(c), null, 1));

  /* ------------------------------------------------- the explanation text */
  function explanation(c, what, files) {
    const L = [], pair = (k, v) => L.push(`${t(k)}: ${v}`), section = (k) => L.push("", t(k).toUpperCase(), "-".repeat(46));
    const num = (v) => v.toLocaleString("en-US"), part = (v) => (typeof v === "number" ? `±${v.toFixed(1)}` : t("u_none"));
    L.push(t(c.day ? "title" : "x_image_title").toUpperCase(), "=".repeat(46));
    if (c.day) {
      const d = c.day, b = d.budget, at = b.missing.length ? "≥" : "", all = classes(), v = c.m.verification?.[state.hazard];
      const nameAt = (x) => classLabel(all.find((k) => Math.min(Math.max(x, 0), 100) < k.max).key);
      const lo = Math.max(0, d.mean - b.U), hi = Math.min(100, d.mean + b.U);
      pair("n_hazard", t(state.hazard));
      pair("n_date", state.date);
      pair("n_area", `${c.s ? c.s.label : t("x_view")} (${num(Math.round(d.area))} ${t("km2")})`);
      pair("n_file", what);
      section("n_result");
      pair("n_mean", d.mean.toFixed(1));
      pair("n_class", classLabel(all.find((k) => d.mean < k.max).key));
      pair("n_range", `${lo.toFixed(0)}–${hi.toFixed(0)} ${t("points")} (${nameAt(lo)} – ${nameAt(hi)})`);
      pair("n_max", d.max.toFixed(0));
      pair("n_cover", `${Math.round(d.coverage * 100)}%`);
      pair("n_shares", all.map((k, i) => `${classLabel(k.key)} ${Math.round(d.share[i] * 100)}%`).join(", "));
      section("n_error");
      pair("n_total", `±${at}${b.U.toFixed(1)} ${t("points")}`);
      pair("n_pct_scale", `${at}${b.U.toFixed(0)}%`);
      if (d.mean >= 1) pair("n_pct_value", `${at}${(b.U / d.mean * 100).toFixed(0)}%`);
      pair("u_input", part(b.parts.input));
      pair("u_model", part(b.parts.model));
      pair("u_sampling", part(b.parts.sampling));
      if (b.missing.length) L.push(t("u_note"));
      if (c.m.bridge_from && state.date >= c.m.bridge_from) L.push(t("x_bridge"));
      section("k_verify");
      if (!v) L.push(t(state.hazard === "all" ? "v_all" : "v_none"));
      else {
        if (v.reference) pair("v_reference", v.reference);
        if (v.period) pair("n_period", v.period);
        if (typeof v.auc === "number") pair("v_auc", v.auc_ci ? `${v.auc.toFixed(2)} [${v.auc_ci[0].toFixed(2)}, ${v.auc_ci[1].toFixed(2)}]` : v.auc.toFixed(2));
        if (typeof v.pod === "number") pair("v_pod_far", `${v.pod.toFixed(2)} · ${v.far.toFixed(3)}`);
        if (typeof v.events_hit === "number") pair("v_events", `${v.events_hit} / ${v.n}`);
      }
      section("n_read");
      L.push(t("n_read1"), t("n_read2"), all.map((k) => `  ${k.min}–${Math.min(Math.round(k.max), 100)}: ${classLabel(k.key)}`).join("\r\n"));
      const p = c.s?.campReport?.parcels, h = c.s?.campReport?.herders;
      if (p) {
        section("k_camps");
        pair("camps_parcels", num(p.total));
        pair("camps_herders", num(h.total));
        pair("camps_high_p", `${num(p.high)} (${t("camps_range")}: ${num(p.highLow)}–${num(p.highHigh)})`);
        pair("camps_high_h", num(h.high));
        L.push(t("camps_note"));
      }
    } else {
      const b = baseLayer();
      pair("n_date", state.date);
      pair("n_file", what);
      pair("n_sensor", `${b.sensor}, ${b.res}`);
      L.push("", t("n_image"));
    }
    if (c.plume) {
      section("dl_plume");
      pair("n_material", `${c.plume.materialName} (${c.plume.density} g/cm³)`);
      pair("n_time", c.plume.time.replace("T", " "));
      L.push(t("n_plume"));
    }
    section("n_files");
    for (const f of files) L.push(`  ${f.name}`);
    L.push(t("n_unzip"));
    section("n_sources");
    L.push(c.day ? t("x_grid") : fill("x_image_src", { r: baseLayer().res }));
    if (c.day) pair("n_version", c.m.generated_at);
    L.push("", t("footer"));
    return "﻿" + L.join("\r\n") + "\r\n";
  }

  /* ----------------------------------------------------------- all at once */
  async function asBundle(c) {
    const jobs = [asJpg, asTif, asCellsCsv, asSoumGeoJson, asReport];
    if (hasSeries(c)) jobs.push(asSeriesCsv);
    if (c.plume) jobs.push(asPlumeTif, asWindCsv);
    const files = [];
    for (const job of jobs) files.push(...(await job(c)).files);
    return { base: `${fileBase(c)}_all`, files };
  }

  /* ---------------------------------------------------------------- menu */
  const message = el("p", { class: "dl-msg" });

  /** One ZIP with the file and its explanation: two separate downloads could be stopped by the browser and lose the text. */
  async function deliver(c, job, what) {
    const { base, files } = await job(c);
    save(zip([...files, await entry(`${base}_tailbar.txt`, explanation(c, what, files))]), `${base}.zip`);
  }

  async function run(button, job, what) {
    const label = button.textContent;
    message.textContent = "";
    button.disabled = true;
    button.textContent = "…";
    try {
      await deliver(context(), job, what);
    } catch (e) {
      console.error(e);
      message.textContent = t("dl_fail") + e.message;
    }
    button.disabled = false;
    button.textContent = label;
  }

  const row = (key, formats, sub = key + "_sub") => el("div", { class: "dl-row" },
    el("div", {}, el("b", { text: t(key) }), el("small", { text: t(sub) })),
    el("div", { class: "dl-fmt" }, formats.map(([label, job, tip]) => el("button", { type: "button", title: tip ?? null, text: label, onclick: (e) => run(e.currentTarget, job, `${t(key)} (${label})`) }))));

  function render() {
    const c = context(), rows = [];
    const image = [["JPG", asJpg], ["PNG", asPng], ["PDF", asPdf], ["JPG+JGW", asGisImage, t("dl_gis_tip")]];
    if (c.day) {
      rows.push(row("dl_map", image));
      if (c.s) {
        rows.push(row("dl_raster", [["GeoTIFF", asTif], ["KMZ", asKmz]]));
        rows.push(row("dl_table", [["CSV", asCellsCsv], ["GeoJSON", asCellsGeoJson]]));
        rows.push(row("dl_soums", [["SHP", asSoumShp], ["GeoJSON", asSoumGeoJson], ["KML", asSoumKml], ["CSV", asSoumCsv]]));
        if (hasSeries(c)) rows.push(row("dl_series", [["CSV", asSeriesCsv], ["JSON", asSeriesJson]]));
      }
    } else rows.push(row("dl_image", image));
    if (c.plume) rows.push(row("dl_plume", [["GeoTIFF", asPlumeTif], ["CSV", asWindCsv]]));
    if (c.day) {
      if (c.s) rows.push(row("dl_report", [["JSON", asReport]]));
      rows.push(row(c.s ? "dl_all" : "dl_view", [["ZIP", asBundle]]));
    }
    const scope = c.day ? `${t(state.hazard)} · ${state.date} · ${c.s ? t("x_sel") : t("x_view")}` : `${baseLayer().sensor} · ${state.date}`;
    message.textContent = "";
    box.replaceChildren(el("p", { class: "dl-scope", text: scope }), el("p", { class: "dl-note", text: t(c.day && !c.s ? "dl_pick" : "dl_note") }), ...rows, message);
  }

  return {
    toggle() { box.hidden = !box.hidden; if (!box.hidden) render(); },
    /** The menu lists what exists right now, so it follows every change while it is open. */
    refresh() { if (!box.hidden) render(); },
    seriesCsv() { const c = context(); if (hasSeries(c)) deliver(c, asSeriesCsv, t("dl_series")).catch(console.error); },
  };
}
