/* The download menu. Every kind of data is offered in the formats that suit it: pictures as images, gridded values as a
 * raster, tables as CSV, boundaries as vector files. Only what exists on the screen at that moment is listed. */
import { CLASSES, GIBS } from "./config.js";
import { decode } from "./dataset.js";
import { boxCells } from "./stats.js";
import { dayReport, toCsv } from "./area.js";
import { el } from "./dom.js";
import { cellRows, drawMap, save, toJpeg, toPng } from "./export.js";
import { MERCATOR_WKT, MIME, csv, featureCollection, geoTiff, kmlGroundOverlay, kmlPolygons, pdfFromJpeg, pointFeature, shapefile, worldFile, zip } from "./formats.js";

const SOUM_FIELDS = [
  { name: "soum", type: "C", size: 60 }, { name: "aimag", type: "C", size: 60 }, { name: "soum_en", type: "C", size: 40 }, { name: "aimag_en", type: "C", size: 40 },
  { name: "hazard", type: "C", size: 8 }, { name: "date", type: "C", size: 10 }, { name: "score", type: "N", size: 6, decimals: 1 }, { name: "class", type: "C", size: 30 },
  { name: "U95", type: "N", size: 6, decimals: 1 }, { name: "U95_min", type: "C", size: 1 },
];

const text = new TextEncoder();
const blob = (data, ext) => new Blob([data], { type: MIME[ext] });
const round = (v, d = 1) => (typeof v === "number" ? +v.toFixed(d) : null);

export function initDownloads({ box, state, t, frameNow, uFrameNow, classOf, classLabel, soumsReady }) {
  const fill = (k, o) => Object.entries(o).reduce((a, [x, y]) => a.replace(`{${x}}`, y), t(k));
  const baseLayer = () => GIBS.layers.find((l) => l.kind === "base" && state.sat[l.key].on);
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
      { text: `${c.s ? t("x_sel") : t("x_view")}: ${c.day.mean.toFixed(0)} ± ${at}${b.U.toFixed(0)} ${t("points")} (k=2, ≈95%)`, strong: true },
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
      outline: risky ? state.outline : null, camps: risky ? state.campsImage : null, plume: c.plume, selection: c.s ? { box: c.s.box, geom: c.s.geom } : null,
      legend: risky ? CLASSES.map((k) => ({ color: k.color, label: classLabel(k.key) })) : [], error: risky ? errorLines(c) : imageLines(c),
    });
  }

  const asJpg = async (c) => [await toJpeg((await mapCanvas(c)).canvas), `${fileBase(c)}.jpg`];
  const asPng = async (c) => [await toPng((await mapCanvas(c)).canvas), `${fileBase(c)}.png`];
  async function asPdf(c) {
    const { canvas } = await mapCanvas(c), jpeg = new Uint8Array(await (await toJpeg(canvas)).arrayBuffer());
    return [blob(pdfFromJpeg(jpeg, canvas.width, canvas.height), "pdf"), `${fileBase(c)}.pdf`];
  }
  /** The image with what GIS software needs to place it. A plain satellite image stays free of any labels. */
  async function asGisImage(c) {
    const name = fileBase(c), { canvas, bounds } = await mapCanvas(c, !c.day);
    const jpeg = new Uint8Array(await (await toJpeg(canvas)).arrayBuffer());
    return [zip([{ name: `${name}.jpg`, data: jpeg }, { name: `${name}.jgw`, data: text.encode(worldFile(bounds, canvas.width, canvas.height)) }, { name: `${name}.prj`, data: text.encode(MERCATOR_WKT) }]), `${name}_gis.zip`];
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
    return [blob(geoTiff({ w: e.w, h: e.h, bands: [score, u], west: e.west, north: e.north, dx: c.m.grid.dx, dy: c.m.grid.dy }), "tif"), `${fileBase(c)}_score_U95.tif`];
  }

  /** The risk classes as a picture for Google Earth, one square per cell, regular in latitude and longitude. */
  async function asKmz(c) {
    const e = extent(c), K = 6, cv = document.createElement("canvas");
    cv.width = e.w * K; cv.height = e.h * K;
    const ctx = cv.getContext("2d");
    ctx.globalAlpha = 0.75;
    for (const r of rowsOf(c)) { ctx.fillStyle = classOf(r.score).color; ctx.fillRect((r.c - e.c0) * K, (r.r - e.r0) * K, K, K); }
    const g = c.m.grid, png = new Uint8Array(await (await toPng(cv)).arrayBuffer());
    const doc = kmlGroundOverlay({ name: `${t(state.hazard)} ${state.date}`, description: `${c.day.mean.toFixed(0)} ± ${c.day.budget.missing.length ? "≥" : ""}${c.day.budget.U.toFixed(0)} ${t("points")} (k=2). ${t("x_not_official")}`, href: "risk.png", box: { n: e.north, s: e.north - e.h * g.dy, w: e.west, e: e.west + e.w * g.dx } });
    return [zip([{ name: "doc.kml", data: text.encode(doc) }, { name: "risk.png", data: png }], MIME.kmz), `${fileBase(c)}.kmz`];
  }

  const CELL_HEAD = ["lat", "lon", "score", "class", "u_input", "u_model", "U95", "U95_is_lower_bound"];
  const asCellsCsv = (c) => [blob(csv(CELL_HEAD, rowsOf(c).map((r) => [r.lat, r.lon, r.score, r.label, r.u_input, r.u_model, r.U95, r.U95_min])), "csv"), `${fileBase(c)}_cells.csv`];
  const asCellsGeoJson = (c) => [blob(featureCollection(rowsOf(c).map((r) => pointFeature(r.lon, r.lat, { score: r.score, class: r.label, u_input: r.u_input, u_model: r.u_model, U95: r.U95, U95_is_lower_bound: r.U95_min }))), "geojson"), `${fileBase(c)}_cells.geojson`];

  /* --------------------------------------------------------------- soums */
  async function soumRows(c) {
    const soums = await soumsReady();
    if (!soums) throw new Error(t("soum_none"));
    return soums.features.map((f) => {
      const d = dayReport({ frame: c.fr, uframe: uFrameNow(), cells: f.cells, grid: c.m.grid, classes: CLASSES, uModel: c.uModel });
      return { geometry: f.geometry, color: d ? classOf(d.mean).color : "#555555", values: { soum: f.names.mn, aimag: f.aimags.mn, soum_en: f.names.en, aimag_en: f.aimags.en, hazard: state.hazard, date: state.date, score: d ? round(d.mean) : null, class: d ? classLabel(classOf(d.mean).key) : "", U95: d ? round(d.budget.U) : null, U95_min: d?.budget.missing.length ? "Y" : "N" } };
    });
  }
  const soumName = () => `mongolia_${state.hazard}_${state.date}_soums`;
  const asSoumCsv = async (c) => { const r = await soumRows(c), k = SOUM_FIELDS.map((f) => f.name); return [blob(csv(k, r.map((x) => k.map((n) => x.values[n]))), "csv"), `${soumName()}.csv`]; };
  const asSoumGeoJson = async (c) => [blob(featureCollection((await soumRows(c)).map((x) => ({ type: "Feature", geometry: x.geometry, properties: x.values }))), "geojson"), `${soumName()}.geojson`];
  async function asSoumKml(c) {
    const r = await soumRows(c), v = (x) => x.values;
    return [blob(kmlPolygons(`${t(state.hazard)} ${state.date}`, r.map((x) => ({ name: `${v(x).soum} (${v(x).aimag})`, description: v(x).score === null ? t("no_data") : `${v(x).score} ± ${v(x).U95_min === "Y" ? "≥" : ""}${v(x).U95} ${t("points")} (k=2) · ${v(x).class}`, color: x.color, geometry: x.geometry }))), "kml"), `${soumName()}.kml`];
  }
  async function shpFiles(c) {
    const name = soumName(), s = shapefile({ features: await soumRows(c), fields: SOUM_FIELDS });
    return ["shp", "shx", "dbf", "prj", "cpg"].map((x) => ({ name: `${name}.${x}`, data: s[x] }));
  }
  const asSoumShp = async (c) => [zip(await shpFiles(c)), `${soumName()}_shp.zip`];

  /* -------------------------------------------------------------- series */
  const hasSeries = (c) => Boolean(c.s?.long);
  const asSeriesCsv = (c) => [blob("﻿" + toCsv({ label: c.s.label, hazard: state.hazard, months: c.s.months, years: c.s.long.years, high: c.s.long.high }), "csv"), `${fileBase(c)}_series.csv`];
  function asSeriesJson(c) {
    const s = c.s, days = new Map(s.long.high.map((r) => [r.y, r.v]));
    const data = { area: s.label, hazard: state.hazard, unit: "score 0-100",
      months: s.months.map((r) => ({ period: `${r.y}-${String(r.m).padStart(2, "0")}`, mean_score: round(r.v, 2) })),
      years: s.long.years.map((r) => ({ year: r.y, mean_score: round(r.v, 2), high_risk_days: round(days.get(r.y)) })), trend: s.long.trend };
    return [blob(JSON.stringify(data, null, 1), "json"), `${fileBase(c)}_series.json`];
  }

  /* --------------------------------------------------------------- plume */
  function asPlumeTif(c) {
    const p = c.plume, e = p.box;
    return [blob(geoTiff({ w: p.w, h: p.h, bands: [p.index], west: e.w, north: e.n, dx: (e.e - e.w) / p.w, dy: (e.n - e.s) / p.h }), "tif"), `${fileBase(c)}_dust_${p.material}.tif`];
  }
  const asWindCsv = (c) => [blob(csv(["lat", "lon", "u_m_s", "v_m_s", "speed_m_s", "from_deg", "time"], c.plume.wind.map((w) => [round(w.lat, 4), round(w.lon, 4), round(w.u, 2), round(w.v, 2), round(w.speed, 2), round(w.from), c.plume.time])), "csv"), `${fileBase(c)}_wind.csv`];

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
  const asReport = (c) => [blob(JSON.stringify(reportOf(c), null, 1), "json"), `${fileBase(c)}_report.json`];

  /* ----------------------------------------------------------- all at once */
  async function asBundle(c) {
    const jobs = [[asJpg, "dl_map"], [asTif, "dl_raster"], [asCellsCsv, "dl_table"], [asSoumGeoJson, "dl_soums"], [asReport, "dl_report"]];
    if (hasSeries(c)) jobs.push([asSeriesCsv, "dl_series"]);
    if (c.plume) jobs.push([asPlumeTif, "dl_plume"], [asWindCsv, "dl_plume"]);
    const files = [], list = [];
    for (const [job, key] of jobs) {
      const [b, name] = await job(c);
      files.push({ name, data: new Uint8Array(await b.arrayBuffer()) });
      list.push(`${name}: ${t(key)}`);
    }
    files.push({ name: "README.txt", data: text.encode("﻿" + [t("title"), `${t(state.hazard)} · ${state.date}`, "", ...list, "", t("footer")].join("\r\n")) });
    return [zip(files), `${fileBase(c)}_all.zip`];
  }

  /* ---------------------------------------------------------------- menu */
  const message = el("p", { class: "dl-msg" });

  async function run(button, job) {
    const label = button.textContent;
    message.textContent = "";
    button.disabled = true;
    button.textContent = "…";
    try {
      const [b, name] = await job(context());
      save(b, name);
    } catch (e) {
      console.error(e);
      message.textContent = t("dl_fail") + e.message;
    }
    button.disabled = false;
    button.textContent = label;
  }

  const row = (key, formats) => el("div", { class: "dl-row" },
    el("div", {}, el("b", { text: t(key) }), el("small", { text: t(key + "_sub") })),
    el("div", { class: "dl-fmt" }, formats.map(([label, job, tip]) => el("button", { type: "button", title: tip ?? null, text: label, onclick: (e) => run(e.currentTarget, job) }))));

  function render() {
    const c = context(), rows = [];
    const image = [["JPG", asJpg], ["PNG", asPng], ["PDF", asPdf], ["JPG+JGW", asGisImage, t("dl_gis_tip")]];
    if (c.day) {
      rows.push(row("dl_map", image));
      rows.push(row("dl_raster", [["GeoTIFF", asTif], ["KMZ", asKmz]]));
      rows.push(row("dl_table", [["CSV", asCellsCsv], ["GeoJSON", asCellsGeoJson]]));
      rows.push(row("dl_soums", [["SHP", asSoumShp], ["GeoJSON", asSoumGeoJson], ["KML", asSoumKml], ["CSV", asSoumCsv]]));
      if (hasSeries(c)) rows.push(row("dl_series", [["CSV", asSeriesCsv], ["JSON", asSeriesJson]]));
    } else rows.push(row("dl_image", image));
    if (c.plume) rows.push(row("dl_plume", [["GeoTIFF", asPlumeTif], ["CSV", asWindCsv]]));
    if (c.day) { rows.push(row("dl_report", [["JSON", asReport]])); rows.push(row("dl_all", [["ZIP", asBundle]])); }
    const scope = c.day ? `${t(state.hazard)} · ${state.date} · ${c.s ? t("x_sel") : t("x_view")}` : `${baseLayer().sensor} · ${state.date}`;
    message.textContent = "";
    box.replaceChildren(el("p", { class: "dl-scope", text: scope }), ...rows, message);
  }

  return {
    toggle() { box.hidden = !box.hidden; if (!box.hidden) render(); },
    /** The menu lists what exists right now, so it follows every change while it is open. */
    refresh() { if (!box.hidden) render(); },
    seriesCsv() { const c = context(); if (hasSeries(c)) { const [b, name] = asSeriesCsv(c); save(b, name); } },
  };
}
