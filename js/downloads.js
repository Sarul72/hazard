/* The download menu. Every kind of data is offered in the formats that suit it: pictures as images, gridded values as a
 * raster, tables as CSV, boundaries as vector files. Data files follow the selected area.
 *
 * Every download is one ZIP that holds the file and a README with the result and its possible error, so a number never travels
 * without its error, and the same figures are written into the file itself wherever its format has a place for them.
 * File and field names are plain letters, digits and underscores, because GIS software rejects or rewrites anything else. */
import { CLASSES, GIBS } from "./config.js";
import { decode } from "./dataset.js";
import { boxCells } from "./stats.js";
import { dayReport } from "./area.js";
import { el } from "./dom.js";
import { periodStart, versionAt } from "./gibs.js";
import { addDays } from "./datebar.js";
import { U } from "./ui_text.js";
import { cellRows, drawMap, save, toJpeg, toPng } from "./export.js";
import { initDetailFiles } from "./aoi/files.js";
import { MERCATOR_WKT, MIME, arcgisXml, auxXml, csv, featureCollection, geoTiff, geoTiffRgb, kmlGroundOverlay, kmlPolygons, pdfFromJpeg, pointFeature, shapefile, worldFile, zip } from "./formats.js";

const SOUM_FIELDS = [
  { name: "soum_mn", type: "C", size: 60 }, { name: "aimag_mn", type: "C", size: 60 }, { name: "soum_en", type: "C", size: 40 }, { name: "aimag_en", type: "C", size: 40 },
  { name: "hazard", type: "C", size: 8 }, { name: "obs_date", type: "C", size: 10 }, { name: "score", type: "N", size: 8, decimals: 1 }, { name: "risk_cls", type: "C", size: 30 },
  { name: "U95", type: "N", size: 8, decimals: 1 }, { name: "err_pct", type: "N", size: 8, decimals: 0 }, { name: "U95_lb", type: "C", size: 1 },
];

const text = new TextEncoder();
const round = (v, d = 1) => (typeof v === "number" && Number.isFinite(v) ? +v.toFixed(d) : null);
const bytesOf = async (b) => new Uint8Array(await b.arrayBuffer());
const entry = async (name, data) => ({ name, data: data instanceof Blob ? await bytesOf(data) : typeof data === "string" ? text.encode(data) : data });
/** A job gives the base name of the download and its files. */
const single = async (name, data) => ({ base: name.replace(/\.([^.]+)$/, "_$1"), files: [await entry(name, data)] });
/** Error as a share of the score. Near zero the share says nothing, so it stays empty. */
const relative = (u, score) => (typeof u === "number" && score >= 1 ? Math.round((u / score) * 100) : null);

export function initDownloads({ box, state, t, frameNow, uFrameNow, classOf, classLabel, classes, soumsReady, borders, busy, detailLayers = () => [] }) {
  const detailFiles = initDetailFiles({ t });
  const fill = (k, o) => Object.entries(o).reduce((a, [x, y]) => a.replace(`{${x}}`, y), t(k));
  const baseLayer = () => versionAt(GIBS.layers.find((l) => l.kind === "base" && state.sat[l.key].on), state.date);
  const stamp = () => state.date.replaceAll("-", "");
  // An 8-day composite is not one day's image: its labels name the whole period.
  const imgDate = () => { const b = baseLayer(); if (!b?.period) return state.date; const a = periodStart(b, state.date); return `${a}…${addDays(a, b.period - 1)}`; };
  const fileBase = (c) => `mongolia_${c.day ? state.hazard : "image"}_${stamp()}${c.s ? "_area" : ""}`;

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

  /* ------------------------------------------------- the result in figures */
  /** The result as plain facts, in English and ASCII: file headers of GIS formats hold nothing else. */
  function facts(c) {
    const d = c.day, b = d.budget, v = c.m.verification?.[state.hazard], area = c.s?.box ?? c.view;
    return {
      project: "Mongolia Hazard Watch", hazard: U.en[state.hazard], obs_date: state.date, area_bbox_wsen: [area.w, area.s, area.e, area.n].map((x) => x.toFixed(3)).join(","),
      area_km2: Math.round(d.area), mean_score: round(d.mean), risk_class: CLASSES.find((k) => d.mean < k.max).key, max_score: round(d.max),
      U95_points: round(b.U), U95_is_lower_bound: b.missing.length ? "yes" : "no", confidence: "95 percent, k=2 (JCGM 100)", error_pct_of_scale: Math.round(b.U), error_pct_of_mean: relative(b.U, d.mean),
      u_input: round(b.parts.input), u_model: round(b.parts.model), u_sampling: round(b.parts.sampling),
      verification_auc: round(v?.auc, 2), verification_period: v?.period ?? null, data_version: c.m.generated_at, grid_deg: c.m.grid.dx,
      sources: "Google Earth Engine, NASA GIBS", note: "Not an official warning. The score is a relative index, not a probability.",
    };
  }

  const imageFacts = () => ({ project: "Mongolia Hazard Watch", product: "Satellite image, no risk calculation", sensor: baseLayer().sensor, obs_date: imgDate(), source: "NASA GIBS" });

  const summaryEn = (c) => {
    const f = facts(c);
    return `Mongolia Hazard Watch: ${f.hazard}, ${f.obs_date}. Mean score ${f.mean_score} of 100 (${f.risk_class}). Possible error ${f.U95_is_lower_bound === "yes" ? "at least " : ""}+-${f.U95_points} points at 95%, which is ${f.error_pct_of_scale}% of the scale${f.error_pct_of_mean === null ? "" : ` and ${f.error_pct_of_mean}% of the mean`}. Not an official warning.`;
  };

  const summaryHere = (c) => {
    const d = c.day, b = d.budget, at = b.missing.length ? "≥" : "", pct = relative(b.U, d.mean);
    return `${t(state.hazard)}, ${state.date}. ${t("n_mean")}: ${d.mean.toFixed(1)}. ${t("n_total")}: ±${at}${b.U.toFixed(1)} ${t("points")}${pct === null ? "" : ` (${t("n_pct_value")}: ${at}${pct}%)`}. ${t("x_not_official")}.`;
  };

  const detail = (o) => Object.entries(o).filter(([, v]) => v !== null && v !== undefined).map(([k, v]) => `${k}: ${v}`).join("\n");
  const sidecar = (c, title, extra = {}) => arcgisXml({ title, summary: summaryEn(c), description: detail({ ...facts(c), ...extra }), credits: "Google Earth Engine, NASA GIBS. Copyright holders of the source data keep their rights." });

  /* ----------------------------------------------------------- map image */
  function errorLines(c) {
    const f = (v) => (typeof v === "number" ? `±${v.toFixed(1)}` : t("u_none")), b = c.day.budget, v = c.m.verification?.[state.hazard];
    const at = b.missing.length ? "≥" : "", pct = relative(b.U, c.day.mean);
    const lines = [{ text: t("x_error"), strong: true },
      { text: `${c.s ? t("x_sel") : t("x_view")}: ${c.day.mean.toFixed(0)} ± ${at}${b.U.toFixed(0)} ${t("points")} (95%)`, strong: true },
      { text: fill("x_pct", { a: `${at}${b.U.toFixed(0)}`, b: pct === null ? "—" : `${at}${pct}` }) },
      { text: fill("x_parts", { i: f(b.parts.input), m: f(b.parts.model), s: f(b.parts.sampling) }) }];
    if (b.missing.length) lines.push({ text: t("x_missing"), warn: true });
    if (v?.auc) lines.push({ text: fill("x_verify", { a: v.auc.toFixed(2), p: v.period ?? "" }) });
    if (c.m.bridge_from && state.date >= c.m.bridge_from) lines.push({ text: t("x_bridge"), warn: true });
    lines.push(...plumeLines(c), { text: t("x_grid") }, { text: t("x_not_official"), warn: true });
    return lines;
  }

  function plumeLines(c) {
    if (!c.plume) return [];
    const s = c.plume.stats, lines = [{ text: fill("x_plume", { m: c.plume.materialName, t: c.plume.time.replace("T", " ") }) }];
    if (s?.area) lines.push({ text: fill("x_reach", { r: `${s.edge ? "≥ " : ""}${Math.round(s.reach)}`, a: Math.round(s.area).toLocaleString("en-US") }) });
    return lines;
  }

  function imageLines(c) {
    const b = baseLayer(), lines = [{ text: fill("x_image", { s: b.sensor, d: imgDate() }), strong: true }, { text: fill("x_image_src", { r: b.res }) }, ...plumeLines(c)];
    if (c.plume) lines.push({ text: t("x_not_official"), warn: true });
    return lines;
  }

  function mapCanvas(c, clean = false) {
    const risky = Boolean(c.day), base = baseLayer();
    return drawMap({
      map: state.map, base, date: state.date, clean,
      title: t(risky ? "title" : "x_image_title"),
      subtitle: risky ? [`${t(state.hazard)} · ${state.date}`, c.s ? c.s.label : t("x_view")] : [`${base.sensor} · ${imgDate()}`],
      risk: risky && state.mode === "zones" ? { canvas: state.risk.canvas, box: state.risk.box } : null,
      soums: risky && state.mode === "soums" && state.soums ? state.soums.features.map((f) => { const v = state.soumLayer.score(f); return { geometry: f.geometry, color: v === null || v === undefined ? "#555" : classOf(v).color }; }) : null,
      borders: borders(), plume: c.plume, selection: c.s ? { box: c.s.box, geom: c.s.geom } : null,
      legend: risky ? classes().map((k) => ({ color: k.color, label: classLabel(k.key) })) : [], error: risky ? errorLines(c) : imageLines(c),
    });
  }

  /** An image with what GIS software needs to place it: without these three small files a picture lands at 0, 0 with an unknown
   * reference. ArcGIS reads the projection from the .aux.xml, other programs from the .prj. */
  async function placedImage(c, ext, clean = false) {
    const name = fileBase(c), { canvas, bounds } = await mapCanvas(c, clean);
    return [await entry(`${name}.${ext}`, await (ext === "png" ? toPng : toJpeg)(canvas)), await entry(`${name}.${ext === "png" ? "pgw" : "jgw"}`, worldFile(bounds, canvas.width, canvas.height)),
      await entry(`${name}.prj`, MERCATOR_WKT), await entry(`${name}.${ext}.aux.xml`, auxXml({ wkt: MERCATOR_WKT, meta: c.day ? facts(c) : imageFacts() }))];
  }
  const asJpg = async (c) => ({ base: `${fileBase(c)}_jpg`, files: await placedImage(c, "jpg") });
  const asPng = async (c) => ({ base: `${fileBase(c)}_png`, files: await placedImage(c, "png") });
  /** A clean layer to lay over other data in GIS: no frame or labels, with the figures in its companion file and the README. */
  const asGisImage = async (c) => ({ base: `${fileBase(c)}_gis`, files: await placedImage(c, "jpg", true) });
  async function asPdf(c) {
    const { canvas } = await mapCanvas(c), jpeg = await bytesOf(await toJpeg(canvas));
    return single(`${fileBase(c)}.pdf`, pdfFromJpeg(jpeg, canvas.width, canvas.height, { title: t(c.day ? "title" : "x_image_title"), subject: c.day ? summaryHere(c) : `${baseLayer().sensor}, ${imgDate()}` }));
  }
  /** The map as one georeferenced file, with no companions to lose. */
  async function asMapTif(c) {
    const name = `${fileBase(c)}_map`, { canvas, bounds } = await mapCanvas(c, !c.day);
    const rgba = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
    const about = c.day ? summaryEn(c) : `Mongolia Hazard Watch: satellite image, ${baseLayer().sensor}, ${imgDate()}. Source: NASA GIBS.`;
    const tif = geoTiffRgb({ w: canvas.width, h: canvas.height, rgba, box: bounds, description: about, meta: c.day ? facts(c) : imageFacts() });
    const notes = c.day ? sidecar(c, `Mongolia Hazard Watch: ${U.en[state.hazard]} map, ${state.date}`) : arcgisXml({ title: `Mongolia Hazard Watch: satellite image, ${imgDate()}`, summary: about, description: detail(imageFacts()), credits: "NASA GIBS" });
    return { base: `${name}_tif`, files: [await entry(`${name}.tif`, tif), await entry(`${name}.tif.xml`, notes)] };
  }

  /* --------------------------------------------------------- grid values */
  function extent(c) {
    const g = c.m.grid, rows = c.cells.map((x) => x.r), cols = c.cells.map((x) => x.c);
    const r0 = Math.min(...rows), r1 = Math.max(...rows), c0 = Math.min(...cols), c1 = Math.max(...cols);
    return { r0, c0, w: c1 - c0 + 1, h: r1 - r0 + 1, west: g.west + c0 * g.dx, north: g.north - r0 * g.dy };
  }
  const rowsOf = (c) => cellRows({ grid: c.m.grid, cells: c.cells, frame: c.fr, uframe: uFrameNow(), uModel: c.uModel, decode, classOf, label: classLabel });

  async function asTif(c) {
    const e = extent(c), score = new Float32Array(e.w * e.h).fill(-9999), u = new Float32Array(e.w * e.h).fill(-9999), name = `${fileBase(c)}_score_U95`;
    for (const r of rowsOf(c)) {
      const i = (r.r - e.r0) * e.w + (r.c - e.c0);
      score[i] = r.score;
      if (r.U95 !== null) u[i] = r.U95;
    }
    const names = ["score_0_100", "U95_points"], tif = geoTiff({ w: e.w, h: e.h, bands: [score, u], names, west: e.west, north: e.north, dx: c.m.grid.dx, dy: c.m.grid.dy, description: summaryEn(c), meta: facts(c) });
    return { base: `${name}_tif`, files: [await entry(`${name}.tif`, tif), await entry(`${name}.tif.aux.xml`, auxXml({ names, bands: [score, u] })), await entry(`${name}.tif.xml`, sidecar(c, `Mongolia Hazard Watch: ${U.en[state.hazard]} score and error, ${state.date}`, { band_1: "score 0-100", band_2: "U95, points" }))] };
  }

  /** The risk classes as a picture for Google Earth, one square per cell, regular in latitude and longitude. */
  async function asKmz(c) {
    const e = extent(c), K = 6, cv = document.createElement("canvas");
    cv.width = e.w * K; cv.height = e.h * K;
    const ctx = cv.getContext("2d");
    ctx.globalAlpha = 0.75;
    for (const r of rowsOf(c)) { ctx.fillStyle = classOf(r.score).color; ctx.fillRect((r.c - e.c0) * K, (r.r - e.r0) * K, K, K); }
    const g = c.m.grid, png = await bytesOf(await toPng(cv));
    const doc = kmlGroundOverlay({ name: `${t(state.hazard)} ${state.date}`, description: summaryHere(c), href: "risk.png", box: { n: e.north, s: e.north - e.h * g.dy, w: e.west, e: e.west + e.w * g.dx } });
    return single(`${fileBase(c)}.kmz`, zip([{ name: "doc.kml", data: text.encode(doc) }, { name: "risk.png", data: png }], MIME.kmz));
  }

  const CELL_HEAD = ["lat", "lon", "hazard", "obs_date", "score", "risk_cls", "u_input", "u_model", "U95", "err_pct", "U95_lb", "area_mean", "area_U95"];
  const cellValues = (c, r) => ({ hazard: state.hazard, obs_date: state.date, score: r.score, risk_cls: r.label, u_input: r.u_input, u_model: r.u_model, U95: r.U95, err_pct: relative(r.U95, r.score), U95_lb: r.U95_min ? "Y" : "N", area_mean: round(c.day.mean), area_U95: round(c.day.budget.U) });
  const asCellsCsv = (c) => single(`${fileBase(c)}_cells.csv`, csv(CELL_HEAD, rowsOf(c).map((r) => { const v = { lat: r.lat, lon: r.lon, ...cellValues(c, r) }; return CELL_HEAD.map((k) => v[k]); })));
  const asCellsGeoJson = (c) => single(`${fileBase(c)}_cells.geojson`, featureCollection(rowsOf(c).map((r) => pointFeature(r.lon, r.lat, cellValues(c, r))), facts(c)));

  /* --------------------------------------------------------------- soums */
  /** The soums touched by the selection, or all of them when nothing is selected. */
  async function soumRows(c) {
    const soums = await soumsReady();
    if (!soums) throw new Error(t("soum_none"));
    const inside = c.s ? new Set(c.s.cells.map((x) => x.i)) : null;
    return soums.features.filter((f) => !inside || f.cells.some((x) => inside.has(x.i))).map((f) => {
      const d = dayReport({ frame: c.fr, uframe: uFrameNow(), cells: f.cells, grid: c.m.grid, classes: CLASSES, uModel: c.uModel });
      return { geometry: f.geometry, color: d ? classOf(d.mean).color : "#555555", values: { soum_mn: f.names.mn, aimag_mn: f.aimags.mn, soum_en: f.names.en, aimag_en: f.aimags.en, hazard: state.hazard, obs_date: state.date, score: d ? round(d.mean) : null, risk_cls: d ? classLabel(classOf(d.mean).key) : "", U95: d ? round(d.budget.U) : null, err_pct: d ? relative(d.budget.U, d.mean) : null, U95_lb: d?.budget.missing.length ? "Y" : "N" } };
    });
  }
  const soumName = (c) => `${fileBase(c)}_soums`;
  const asSoumCsv = async (c) => { const r = await soumRows(c), k = SOUM_FIELDS.map((f) => f.name); return single(`${soumName(c)}.csv`, csv(k, r.map((x) => k.map((n) => x.values[n])))); };
  const asSoumGeoJson = async (c) => single(`${soumName(c)}.geojson`, featureCollection((await soumRows(c)).map((x) => ({ type: "Feature", geometry: x.geometry, properties: x.values })), facts(c)));
  async function asSoumKml(c) {
    const r = await soumRows(c), v = (x) => x.values;
    return single(`${soumName(c)}.kml`, kmlPolygons(`${t(state.hazard)} ${state.date}`, r.map((x) => ({ name: `${v(x).soum_mn} (${v(x).aimag_mn})`, description: v(x).score === null ? t("no_data") : `${v(x).score} ± ${v(x).U95_lb === "Y" ? "≥" : ""}${v(x).U95} ${t("points")} (95%) · ${v(x).risk_cls}`, color: x.color, geometry: x.geometry })), summaryHere(c)));
  }
  async function asSoumShp(c) {
    // A shapefile has no empty number: GIS reads a blank as 0, which would look like no error, so a missing value gets the mark of the rasters.
    const mark = (v) => v ?? -9999, rows = (await soumRows(c)).map((x) => ({ ...x, values: { ...x.values, score: mark(x.values.score), U95: mark(x.values.U95), err_pct: mark(x.values.err_pct) } }));
    const name = soumName(c), s = shapefile({ features: rows, fields: SOUM_FIELDS });
    const parts = ["shp", "shx", "dbf", "prj", "cpg"].map((x) => ({ name: `${name}.${x}`, data: s[x] }));
    return { base: `${name}_shp`, files: [...parts, await entry(`${name}.shp.xml`, sidecar(c, `Mongolia Hazard Watch: ${U.en[state.hazard]} by soum, ${state.date}`))] };
  }

  /* -------------------------------------------------------------- series */
  const hasSeries = (c) => Boolean(c.s?.long);
  function asSeriesCsv(c) {
    const s = c.s, tr = s.long.trend, days = new Map(s.long.high.map((r) => [r.y, r.v])), slope = round(tr?.slopeDecade, 3), lo = round(tr?.ciDecade?.[0], 3), hi = round(tr?.ciDecade?.[1], 3);
    const head = ["area", "hazard", "period", "kind", "mean_score", "high_days", "trend_dec", "trend_lo", "trend_hi"];
    const rows = [...s.months.map((r) => [s.label, state.hazard, `${r.y}-${String(r.m).padStart(2, "0")}`, "month", round(r.v, 2), null, null, null, null]),
      ...s.long.years.map((r) => [s.label, state.hazard, r.y, "year", round(r.v, 2), round(days.get(r.y)), slope, lo, hi])];
    return single(`${fileBase(c)}_series.csv`, csv(head, rows));
  }
  function asSeriesJson(c) {
    const s = c.s, days = new Map(s.long.high.map((r) => [r.y, r.v]));
    const data = { area: s.label, hazard: state.hazard, unit: "score 0-100", summary: summaryEn(c),
      months: s.months.map((r) => ({ period: `${r.y}-${String(r.m).padStart(2, "0")}`, mean_score: round(r.v, 2) })),
      years: s.long.years.map((r) => ({ year: r.y, mean_score: round(r.v, 2), high_risk_days: round(days.get(r.y)) })), trend: s.long.trend };
    return single(`${fileBase(c)}_series.json`, JSON.stringify(data, null, 1));
  }

  /* --------------------------------------------------------------- plume */
  const span = (a) => (a ? `${Math.round(Math.min(...a))}-${Math.round(Math.max(...a))}` : null);
  function plumeFacts(c) {
    const p = c.plume, s = p.stats, r = p.range;
    return { project: "Mongolia Hazard Watch", product: "Dust plume index 0-100, relative, not a concentration", material: p.material, density_g_cm3: p.density, source_lat: round(p.lat, 4), source_lon: round(p.lon, 4), time: p.time,
      reach_km: round(s?.reach, 0), reach_range_km: span(r?.reach), reach_at_view_edge: s?.edge ? "yes" : "no", area_km2: round(s?.area, 0), area_range_km2: span(r?.area), range_method: "wind direction +-20 degrees, speed +-20 percent; not a statistical error", note: "Not an official warning." };
  }
  async function asPlumeTif(c) {
    const p = c.plume, e = p.box, f = plumeFacts(c), name = `${fileBase(c)}_dust_${p.material}`;
    const about = `Mongolia Hazard Watch: dust plume index 0-100, relative, not a concentration. Material ${p.material}, time ${p.time}.${f.reach_km === null ? "" : ` Reach ${f.reach_km} km (${f.reach_range_km}), area ${f.area_km2} km2 (${f.area_range_km2}) when the wind moves by 20 degrees and 20 percent.`}`;
    const names = ["dust_index_0_100"], tif = geoTiff({ w: p.w, h: p.h, bands: [p.index], names, west: e.w, north: e.n, dx: (e.e - e.w) / p.w, dy: (e.n - e.s) / p.h, description: about, meta: f });
    return { base: `${name}_tif`, files: [await entry(`${name}.tif`, tif), await entry(`${name}.tif.aux.xml`, auxXml({ names, bands: [p.index] })), await entry(`${name}.tif.xml`, arcgisXml({ title: `Mongolia Hazard Watch: dust plume, ${p.material}`, summary: about, description: detail(f), credits: "Open-Meteo, NASA GIBS" }))] };
  }
  function asWindCsv(c) {
    const p = c.plume, f = plumeFacts(c), lo = (a) => (a ? Math.round(Math.min(...a)) : null), hi = (a) => (a ? Math.round(Math.max(...a)) : null), r = p.range;
    // The two test columns say how far the wind was moved to get the ranges: they are a sensitivity test, not a measured error.
    return single(`${fileBase(c)}_wind.csv`, csv(["lat", "lon", "u_m_s", "v_m_s", "speed_m_s", "from_deg", "obs_time", "test_spd_pct", "test_dir_deg", "reach_km", "reach_min", "reach_max", "area_km2", "area_min", "area_max"],
      p.wind.map((w) => [round(w.lat, 4), round(w.lon, 4), round(w.u, 2), round(w.v, 2), round(w.speed, 2), round(w.from), p.time, 20, 20, f.reach_km, lo(r?.reach), hi(r?.reach), f.area_km2, lo(r?.area), hi(r?.area)])));
  }

  /* -------------------------------------------------------------- report */
  function reportOf(c) {
    const b = c.day.budget, v = c.m.verification?.[state.hazard] ?? null, L = c.s?.long;
    return {
      title: `${t("title")}: ${t(state.hazard)}`, date: state.date, hazard: state.hazard, generated: new Date().toISOString(), summary: summaryEn(c),
      area: c.s ? { label: c.s.label, kind: c.s.kind, bbox: c.s.box } : { label: t("x_view"), bbox: c.view },
      reference_system: "EPSG:4326 (WGS 84)", spatial_resolution_deg: c.m.grid.dx, data_version: c.m.generated_at, weather_from_gfs: Boolean(c.m.bridge_from && state.date >= c.m.bridge_from),
      result: { mean_score: +c.day.mean.toFixed(1), max_score: +c.day.max.toFixed(1), coverage: +c.day.coverage.toFixed(3), area_km2: Math.round(c.day.area), class_shares: Object.fromEntries(CLASSES.map((k, i) => [k.key, +c.day.share[i].toFixed(3)])) },
      uncertainty: { method: "JCGM 100 (GUM), quadrature, k = 2", u_input: b.parts.input ?? null, u_model: b.parts.model ?? null, u_sampling: b.parts.sampling ?? null, u_combined: +b.uc.toFixed(2), U_expanded: +b.U.toFixed(2), error_pct_of_scale: Math.round(b.U), error_pct_of_mean: relative(b.U, c.day.mean), not_estimated: b.missing, is_lower_bound: b.missing.length > 0 },
      long_term: L ? { trend_points_per_decade: round(L.trend?.slopeDecade, 3), trend_ci95: L.trend?.ciDecade ?? null, high_risk_days_per_year: round(L.highMean), worst_year: L.highWorst ?? null } : null,
      verification: v, score_classes: CLASSES.map((k) => ({ class: k.key, from: k.min, to: Math.min(k.max, 100) })), lineage: c.m.sources?.[state.hazard] ?? c.m.sources ?? null,
      plume: c.plume ? { ...plumeFacts(c), wind_spread_deg: c.plume.spread, exposed_camps: c.plume.camps, range_with_wind_changed: c.plume.range, water_reached: c.plume.water } : null,
      disclaimer: t("footer"),
      copyright: t("copyright"),
    };
  }
  const asReport = (c) => single(`${fileBase(c)}_report.json`, JSON.stringify(reportOf(c), null, 1));

  /* ------------------------------------------------- the explanation text */
  function explanation(c, what, files) {
    const L = [], pair = (k, v) => L.push(`${t(k)}: ${v}`), section = (k) => L.push("", t(k).toUpperCase(), "-".repeat(46));
    const num = (v) => v.toLocaleString("en-US"), part = (v) => (typeof v === "number" ? `±${v.toFixed(1)}` : t("u_none"));
    L.push(t(c.day ? "title" : "x_image_title").toUpperCase(), "=".repeat(46));
    if (c.day) {
      const d = c.day, b = d.budget, at = b.missing.length ? "≥" : "", all = classes(), v = c.m.verification?.[state.hazard], pct = relative(b.U, d.mean);
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
      if (pct !== null) pair("n_pct_value", `${at}${pct}%`);
      pair("u_input", part(b.parts.input));
      pair("u_model", part(b.parts.model));
      pair("u_sampling", part(b.parts.sampling));
      if (b.missing.length) L.push(t("u_note"));
      if (c.m.bridge_from && state.date >= c.m.bridge_from) L.push(t("x_bridge"));
      if (c.s?.long) {
        const g = c.s.long, tr = g.trend;
        section("k_trend");
        if (tr) {
          pair("per_decade", tr.slopeDecade.toFixed(2));
          if (tr.ciDecade) pair("ci95", `[${tr.ciDecade[0].toFixed(2)}, ${tr.ciDecade[1].toFixed(2)}]`);
        } else L.push(t("too_short"));
        if (typeof g.highMean === "number") pair("high_days", g.highMean.toFixed(1));
        if (g.highWorst?.v >= 0.05) pair("high_worst", `${g.highWorst.y}: ${g.highWorst.v.toFixed(1)}`);
      }
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
      L.push(t("n_read1"), t("n_read2"), all.map((k) => `  ${k.min}–${Math.min(Math.round(k.max), 100)}: ${classLabel(k.key)}`).join("\r\n"), t("n_fields"));
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
      const s = c.plume.stats, r = c.plume.range, whole = (v) => num(Math.round(v)), range = (a) => `${whole(Math.min(...a))}–${whole(Math.max(...a))}`;
      if (s?.area) {
        pair("n_reach", `${s.edge ? "≥ " : ""}${whole(s.reach)} ${t("n_km")} (${range(r.reach)})`);
        pair("n_reach_area", `${whole(s.area)} ${t("km2")} (${range(r.area)})`);
        pair("n_reach_dir", c.plume.direction);
        if (r.parcels) pair("n_reach_camps", range(r.parcels));
        if (c.plume.water) pair("n_reach_water", `${c.plume.water.n}, ${whole(c.plume.water.km2)} ${t("km2")}`);
        L.push(t("n_range_note"));
      }
      L.push(t("n_plume"));
    }
    section("n_files");
    for (const f of files) L.push(`  ${f.name}`);
    section("n_open");
    const has = (re) => files.some((f) => re.test(f.name));
    L.push(t("n_unzip"));
    for (const [re, key] of [[/\.tif$/, "n_open_tif"], [/\.shp$/, "n_open_shp"], [/\.csv$/, "n_open_csv"], [/\.(jpg|png)$/, "n_open_img"], [/\.km[lz]$/, "n_open_kml"], [/\.geojson$/, "n_open_json"]]) if (has(re)) L.push(t(key));
    section("n_sources");
    L.push(c.day ? t("x_grid") : fill("x_image_src", { r: baseLayer().res }));
    if (c.day) pair("n_version", c.m.generated_at);
    L.push("", t("footer"), t("copyright"));
    return "﻿" + L.join("\r\n") + "\r\n";
  }

  /* ----------------------------------------------------------- all at once */
  async function asBundle(c) {
    const jobs = [asJpg, asTif, asCellsCsv, asSoumShp, asSoumGeoJson, asReport];
    if (hasSeries(c)) jobs.push(asSeriesCsv);
    if (c.plume) jobs.push(asPlumeTif, asWindCsv);
    const files = [];
    for (const job of jobs) for (const f of (await job(c)).files) if (!files.some((x) => x.name === f.name)) files.push(f);
    return { base: `${fileBase(c)}_all`, files };
  }

  /* ---------------------------------------------------------------- menu */
  const message = el("p", { class: "dl-msg" });

  /** One ZIP with the file and its explanation: two separate downloads could be stopped by the browser and lose the text. */
  async function deliver(c, job, what) {
    const { base, files } = await job(c), name = `${base}.zip`;
    const url = save(zip([...files, await entry(`${base}_README.txt`, explanation(c, what, files))]), name);
    // A browser may hold back a download that starts long after the click, and then this link still works.
    message.replaceChildren(el("a", { href: url, download: name, text: fill("dl_ready", { n: name }) }));
  }

  /** The files of a detailed check (flood, fire or dust computed on the page), with their own README. */
  async function deliverDetail(L, kind, what) {
    const { name, blob } = await detailFiles.build(L, kind, what), url = save(blob, name);
    message.replaceChildren(el("a", { href: url, download: name, text: fill("dl_ready", { n: name }) }));
  }

  async function run(button, work) {
    const label = button.textContent;
    message.textContent = "";
    button.disabled = true;
    button.textContent = "…";
    busy(true);
    try {
      await new Promise((ok) => setTimeout(ok, 60)); // let the computing screen appear before the page is busy
      await work();
    } catch (e) {
      console.error(e);
      message.textContent = t("dl_fail") + e.message;
    }
    busy(false);
    button.disabled = false;
    button.textContent = label;
  }

  const row = (key, formats, sub = key + "_sub") => el("div", { class: "dl-row" },
    el("div", {}, el("b", { text: t(key) }), el("small", { text: t(sub) })),
    el("div", { class: "dl-fmt" }, formats.map(([label, job, tip]) => el("button", { type: "button", title: tip ?? null, text: label, onclick: (e) => run(e.currentTarget, () => deliver(context(), job, `${t(key)} (${label})`)) }))));

  /** A table of a detailed check that is not a GIS file: one CSV, as it is. */
  function deliverExtra(x) {
    const url = save(new Blob([x.make()], { type: MIME.csv ?? "text/csv;charset=utf-8" }), x.name);
    message.replaceChildren(el("a", { href: url, download: x.name, text: fill("dl_ready", { n: x.name }) }));
  }

  /** The row of a detailed check of the hazard on screen, at the top: it is the finest result the page has. A check
   * may add tables of its own (`extras`) after the GIS formats. */
  const detailRow = (L) => el("div", { class: "dl-row dl-detail" },
    el("div", {}, el("b", { text: L.title }), el("small", { text: `${L.periodShort.replace("_", " – ")} · ${L.scale} ${t("dd_m")} · ${t("dl_detail_sub")}` })),
    el("div", { class: "dl-fmt" }, detailFiles.formats().map(([label, kind, tip]) => el("button", { type: "button", title: tip ?? null, text: label, onclick: (e) => run(e.currentTarget, () => deliverDetail(L, kind, `${L.title} (${label})`)) })),
      ...(L.extras ?? []).map((x) => el("button", { type: "button", class: "dl-extra", title: x.title, text: `${x.label} · ${x.title}`, onclick: (e) => run(e.currentTarget, async () => deliverExtra(x)) }))));

  function render() {
    const c = context(), rows = [];
    for (const L of detailLayers()) rows.push(detailRow(L));
    const image = [["JPG", asJpg], ["PNG", asPng], ["PDF", asPdf], ["JPG+JGW", asGisImage, t("dl_gis_tip")], ["GeoTIFF", asMapTif, t("dl_tif_tip")]];
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
    const scope = c.day ? `${t(state.hazard)} · ${state.date} · ${c.s ? t("x_sel") : t("x_view")}` : `${baseLayer().sensor} · ${imgDate()}`;
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
