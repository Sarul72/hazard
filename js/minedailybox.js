/* "Day by day": the dust of the mine alone, one map for every day of a chosen period (js/minedaily.js), inside the mine
 * dust tool. Wind at about 9 km and the hourly ground state come from Open-Meteo, free and without a key; the day's
 * Sentinel-2 picture, where there is a clear one, comes from the Planetary Computer (js/aoi/backdrop.js). */
import { el } from "./dom.js";
import { API, TZ } from "./config.js";
import { buildField, buildMet, simulate, windAt, plumeColor } from "./plume.js";
import { DAILY, dayList, dayStats, distanceFrom, domain, doseGrid, mineEmission, periodScale, pitPoints } from "./minedaily.js";
import { backdrop } from "./aoi/backdrop.js";
import { MIME, auxXml, csv, geoTiff, zip } from "./formats.js";
import { save } from "./export.js";

const fin = (v) => typeof v === "number" && Number.isFinite(v);
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const addDays = (d, n) => iso(Date.parse(d + "T00:00:00Z") + n * 86400000);
const PIT_FILE = { uhg: { url: "docs/uhg/quarries.geojson", feature: 0 } };

async function getJson(url, tries = 3) {
  for (let k = 0; ; k++) {
    const r = await fetch(url);
    if (r.ok) return r.json();
    if (k + 1 >= tries || (r.status !== 429 && r.status < 500)) throw new Error(`${r.status} ${(await r.json().catch(() => ({}))).reason ?? url.split("?")[0]}`);
    await new Promise((ok) => setTimeout(ok, 4000 * (k + 1))); // Open-Meteo asks clients to slow down on 429
  }
}

/** Where the wind comes from, finest first: ECMWF IFS at about 9 km (archive from 2017, then the forecast service for the
 * last days), else ERA5 at about 25 km. Open-Meteo's ERA5-Land has no 10 m wind or rain, so it is not used. */
function windSources(end, now = Date.now()) {
  const age = (now - Date.parse(end + "T00:00:00Z")) / 86400000;
  return [
    { api: API.archive, model: "ecmwf_ifs", label: "ECMWF IFS (≈9 км)" },
    ...(age < 90 ? [{ api: API.forecast, model: "ecmwf_ifs", label: "ECMWF IFS (≈9 км)" }] : []),
    { api: API.archive, model: "era5", label: "ERA5 (≈25 км)" },
  ];
}
const SOIL = "soil_moisture_0_to_7cm";
/** Share of hours with a wind value over all nodes. */
const filled = (arr) => { let n = 0, ok = 0; for (const r of arr) for (const v of r.hourly?.wind_speed_10m ?? []) { n++; if (fin(v)) ok++; } return n ? ok / n : 0; };

export function createMineDaily({ map, t, getMine, busy = () => {} }) {
  const pane = map.getPane("mineDaily") ?? map.createPane("mineDaily");
  pane.style.zIndex = 420;
  pane.style.pointerEvents = "none";
  const st = { start: addDays(iso(Date.now()), -31), days: 31, running: false, status: "", error: false, res: null, day: 0, overlay: null, satOn: false, sat: new Map(), satLayer: null, active: false };

  const box = el("section", { class: "md-box" });

  /* ---------------------------------------------------------------- run */
  async function pitRing(mine) {
    const f = PIT_FILE[mine.id];
    if (!f) return null;
    try { return (await getJson(f.url, 1)).features[f.feature].geometry.coordinates[0]; } catch { return null; }
  }

  async function run() {
    const mine = getMine();
    if (!mine) { st.error = true; st.status = t("md_no_mine"); render(); return; }
    st.running = true; st.error = false; st.res = null; st.sat.clear(); paint();
    const t0 = performance.now();
    busy(true);
    try {
      const days = dayList(st.start, st.days), from = addDays(st.start, -1), to = days[days.length - 1];
      st.status = t("md_fetch"); render();
      // nodes 0.1 degree apart in latitude and a little wider in longitude, so that the 7 x 7 nodes cover the domain
      const lats = Array.from({ length: DAILY.nodes }, (_, i) => mine.lat + (i - 3) * DAILY.nodeDeg), lons = Array.from({ length: DAILY.nodes }, (_, i) => mine.lon + (i - 3) * DAILY.nodeDeg * 1.3);
      const nodes = []; for (const la of lats) for (const lo of lons) nodes.push([la, lo]);
      const g = { lats, lons, ny: DAILY.nodes, nx: DAILY.nodes, nodes };
      const q = (extra) => new URLSearchParams({ start_date: from, end_date: to, timezone: TZ, wind_speed_unit: "ms", ...extra });
      let src = null, arr = null;
      for (const s of windSources(to)) {
        const j = await getJson(`${s.api}?${q({ latitude: nodes.map((n) => n[0].toFixed(3)).join(","), longitude: nodes.map((n) => n[1].toFixed(3)).join(","), hourly: "wind_speed_10m,wind_direction_10m", models: s.model })}`).catch(() => null);
        const a = j ? (Array.isArray(j) ? j : [j]) : null;
        if (a && a.length === nodes.length && filled(a) > 0.9) { src = s; arr = a; break; }
      }
      if (!src) throw new Error(t("md_no_wind"));
      const ground = await getJson(`${src.api}?${q({ latitude: mine.lat.toFixed(3), longitude: mine.lon.toFixed(3), hourly: `precipitation,snow_depth,${SOIL}`, models: src.model })}`);
      const air = await getJson(`${src.api}?${q({ latitude: mine.lat.toFixed(3), longitude: mine.lon.toFixed(3), hourly: "precipitation,cloud_cover,shortwave_radiation,boundary_layer_height,temperature_2m" })}`).catch(() => null);
      const results = arr.map((r) => ({ time: r.hourly.time, wind_speed_10m: r.hourly.wind_speed_10m, wind_direction_10m: r.hourly.wind_direction_10m }));
      const field = buildField(g, results), hours = field.hours;
      const rain = ground.hourly.precipitation ?? [], snow = ground.hourly.snow_depth ?? [], soil = ground.hourly[SOIL] ?? [];
      const ring = await pitRing(mine), points = pitPoints(ring, DAILY.sources, mine), dom = domain(mine.lat, mine.lon);
      const keep = (() => { const e = dom.extent, mLat = 0.15 * (e.n - e.s), mLon = 0.15 * (e.e - e.w); return (la, lo) => la > e.s - mLat && la < e.n + mLat && lo > e.w - mLon && lo < e.e + mLon; })();
      const doses = [], hoursOn = [], hoursErosion = [];
      for (let d = 0; d < days.length; d++) {
        st.status = t("md_busy").replace("{d}", d + 1).replace("{n}", days.length); render();
        await new Promise((ok) => setTimeout(ok, 0)); // let the page draw the progress
        const h0 = 24 + d * 24 - DAILY.spinupH, h1 = Math.min(hours, 48 + d * 24);
        const sl = (a) => Array.from({ length: h1 - h0 }, (_, i) => a?.[h0 + i]);
        const part = { ...field, hours: h1 - h0, time: field.time.slice(h0, h1), u: field.u.subarray(h0 * g.ny * g.nx, h1 * g.ny * g.nx), v: field.v.subarray(h0 * g.ny * g.nx, h1 * g.ny * g.nx), spd: field.spd.subarray(h0 * g.ny * g.nx, h1 * g.ny * g.nx) };
        const spd = Array.from({ length: part.hours }, (_, i) => { const w = windAt(part, i, mine.lat, mine.lon); return w ? Math.hypot(w[0], w[1]) : NaN; });
        const met = air?.hourly ? buildMet(Object.fromEntries(Object.entries(air.hourly).map(([k, v]) => [k, sl(v)])), spd) : null;
        const rainS = sl(rain), snowS = sl(snow), soilS = sl(soil);
        const emission = (u, r, h) => mineEmission(u, fin(rainS[h]) ? rainS[h] : r, fin(soilS[h]) ? soilS[h] : null, fin(snowS[h]) ? snowS[h] : 0);
        const sim = simulate({ sources: points, field: part, met, emission, dtMin: DAILY.dtMin, snapMin: DAILY.snapMin, maxAgeH: DAILY.maxAgeH, keep });
        const skip = (DAILY.spinupH * 60) / DAILY.snapMin;
        doses.push(doseGrid(sim.snaps.slice(skip), dom));
        let on = 0, ero = 0;
        for (let h = DAILY.spinupH; h < part.hours; h++) {
          if (mineEmission(spd[h], rainS[h] ?? 0, fin(soilS[h]) ? soilS[h] : null, snowS[h] ?? 0) > 0) { on++; if (spd[h] > DAILY.onset) ero++; }
        }
        hoursOn.push(on); hoursErosion.push(ero);
      }
      const dist = distanceFrom(points, dom), ref = periodScale(doses, dist);
      const stats = doses.map((dose, i) => ({ day: days[i], ...dayStats(dose, dist, dom, mine, ref), hours: hoursOn[i], erosion: hoursErosion[i] }));
      st.res = { mine, days, doses, dist, ref, stats, dom, points, ring: Boolean(ring), source: src.label };
      st.day = stats.reduce((b, s, i) => (s.peak > stats[b].peak ? i : b), 0);
      st.status = t("md_done").replace("{s}", Math.round((performance.now() - t0) / 1000));
      paint();
    } catch (e) {
      console.error(e);
      st.error = true;
      st.status = t("md_err") + e.message;
    }
    busy(false);
    st.running = false;
    render();
  }

  /* -------------------------------------------------------------- map */
  function dayCanvas(i, size = null) {
    const r = st.res, { w, h } = r.dom, dose = r.doses[i];
    const cv = document.createElement("canvas");
    cv.width = w; cv.height = h;
    const ctx = cv.getContext("2d"), img = ctx.createImageData(w, h), px = img.data;
    for (let k = 0; k < dose.length; k++) {
      const c = plumeColor(r.ref > 0 ? (100 * dose[k]) / r.ref : 0);
      if (!c) continue;
      px[k * 4] = c[0]; px[k * 4 + 1] = c[1]; px[k * 4 + 2] = c[2]; px[k * 4 + 3] = c[3];
    }
    ctx.putImageData(img, 0, 0);
    if (!size) return cv;
    const small = document.createElement("canvas");
    small.width = small.height = size;
    const sc = small.getContext("2d");
    sc.fillStyle = "#1b222b"; sc.fillRect(0, 0, size, size);
    sc.drawImage(cv, 0, 0, size, size);
    sc.fillStyle = "#ff4d4d"; sc.fillRect(size / 2 - 1.5, size / 2 - 1.5, 3, 3); // the mine
    return small;
  }

  function paint() {
    st.overlay?.remove(); st.overlay = null;
    st.satLayer?.remove(); st.satLayer = null;
    const r = st.res;
    if (!r || !st.active) return;
    const e = r.dom.extent, bounds = [[e.s, e.w], [e.n, e.e]];
    if (st.satOn) {
      const s = st.sat.get(r.days[st.day]);
      if (s?.canvas) st.satLayer = window.L.imageOverlay(s.canvas.toDataURL(), bounds, { pane: "mineDaily", interactive: false, opacity: 1 }).addTo(map);
    }
    st.overlay = window.L.imageOverlay(dayCanvas(st.day).toDataURL(), bounds, { pane: "mineDaily", interactive: false }).addTo(map);
  }

  async function loadSat() {
    const r = st.res, day = r?.days[st.day];
    if (!r || !st.satOn || st.sat.has(day)) { paint(); render(); return; }
    st.sat.set(day, { state: "loading" }); render();
    try {
      const { w, h, extent: e } = r.dom, step = 2; // 200 m is enough under a 100 m dose and keeps the request small
      const grid = { west: e.w, north: e.n, dx: (e.e - e.w) / (w / step), dy: (e.n - e.s) / (h / step), w: w / step, h: h / step };
      const b = await backdrop(grid, day, day);
      st.sat.set(day, b ? { state: "ready", canvas: b.canvas, cloud: b.cloud } : { state: "none" });
    } catch (err) {
      console.error(err);
      st.sat.set(day, { state: "none" });
    }
    paint(); render();
  }

  /* --------------------------------------------------------- downloads */
  function dayTif(i) {
    const r = st.res, d = r.doses[i], e = r.dom.extent, band = Float32Array.from(d, (v) => (r.ref > 0 ? Math.min(100, (100 * v) / r.ref) : 0));
    const meta = { project: "Mongolia Hazard Watch", product: "Mine dust only, daily mean ground-level index 0-100 (relative, not ug/m3)", mine: r.mine.name, day: r.days[i], wind: r.source, source_area: r.ring ? "pit outline (OpenStreetMap)" : "1.5 km circle around the point", grid_m: DAILY.cellM, scale: "100 = strongest daily value more than 3 km from the pit in the period", note: "Not an official warning." };
    const names = ["mine_dust_index"], name = `mongolia_minedust_${r.mine.id ?? "point"}_${r.days[i].replaceAll("-", "")}`;
    const tif = geoTiff({ w: r.dom.w, h: r.dom.h, bands: [band], names, west: e.w, north: e.n, dx: (e.e - e.w) / r.dom.w, dy: (e.n - e.s) / r.dom.h, description: `${meta.product}. ${meta.mine}, ${meta.day}.`, meta });
    const readme = "﻿" + [t("md_title"), `${r.mine.name} · ${r.days[i]}`, "", t("md_note"), t("md_scale"), `${t("md_wind")}: ${r.source}`, "", "Mongolia Hazard Watch"].join("\r\n");
    save(zip([{ name: `${name}.tif`, data: tif }, { name: `${name}.tif.aux.xml`, data: new TextEncoder().encode(auxXml({ names, bands: [band] })) }, { name: `${name}_README.txt`, data: new TextEncoder().encode(readme) }], MIME.zip), `${name}_tif.zip`);
  }
  function daysCsv() {
    const r = st.res, rows = r.stats.map((s) => [s.day, s.dir ?? "", s.bearing === null ? "" : Math.round(s.bearing), +s.reach.toFixed(1), +s.area.toFixed(2), +s.peak.toFixed(1), s.hours, s.erosion, s.edge ? "Y" : "N"]);
    save(new Blob([csv(["day", "direction", "bearing_deg", "reach_km", "area_km2", "peak_index", "emission_hours", "erosion_hours", "reach_at_edge"], rows)], { type: MIME.csv }), `mongolia_minedust_${r.mine.id ?? "point"}_${r.days[0].replaceAll("-", "")}_days.csv`);
  }

  /* --------------------------------------------------------------- panel */
  function dayLine(s) {
    if (!s.hours) return t("md_none");
    if (s.peak < DAILY.minIndex) return t("md_weak").replace("{h}", s.hours);
    return t("md_day").replace("{dir}", s.dir ? t("dirs")[["N", "NE", "E", "SE", "S", "SW", "W", "NW"].indexOf(s.dir)] : "—").replace("{r}", `${s.edge ? "≥ " : ""}${s.reach.toFixed(1)}`)
      .replace("{a}", s.area.toFixed(1)).replace("{p}", Math.round(s.peak)).replace("{h}", s.hours).replace("{e}", s.erosion);
  }

  function render() {
    const r = st.res, s = r?.stats[st.day], sat = r ? st.sat.get(r.days[st.day]) : null;
    box.replaceChildren(...[
      el("h4", { class: "md-title", text: t("md_title") }),
      el("p", { class: "note", text: t("md_help") }),
      el("div", { class: "md-form" },
        el("label", {}, el("span", { text: t("md_start") }), el("input", { class: "field", type: "date", value: st.start, max: iso(Date.now()), min: "2010-01-01", onchange: (e) => { st.start = e.target.value || st.start; } })),
        el("label", {}, el("span", { text: t("md_days") }), el("select", { class: "field", onchange: (e) => { st.days = Number(e.target.value); } }, ...[7, 14, 31].map((n) => el("option", { value: n, text: n, selected: n === st.days }))))),
      el("button", { class: "btn aoi-run", type: "button", text: t("md_run"), disabled: st.running, onclick: run }),
      st.status && el("p", { class: "aoi-status" + (st.error ? " err" : ""), role: "status", text: st.status }),
      r && el("div", { class: "md-strip" }, ...r.stats.map((x, i) => {
        const b = el("button", { type: "button", class: "md-day" + (i === st.day ? " on" : ""), title: `${x.day}: ${dayLine(x)}`, onclick: () => { st.day = i; paint(); render(); if (st.satOn) loadSat(); } }, dayCanvas(i, 46), el("span", { text: x.day.slice(5).replace("-", "/") }));
        return b;
      })),
      r && el("input", { type: "range", class: "md-slider", min: "0", max: String(r.days.length - 1), value: String(st.day), "aria-label": t("md_start"), oninput: (e) => { st.day = Number(e.target.value); paint(); render(); if (st.satOn) loadSat(); } }),
      r && el("p", { class: "md-line" }, el("b", { text: `${r.days[st.day]} · ` }), dayLine(s)),
      r && el("label", { class: "check" }, el("input", { type: "checkbox", checked: st.satOn, onchange: (e) => { st.satOn = e.target.checked; loadSat(); } }), el("span", { text: t("md_sat") })),
      r && st.satOn && el("p", { class: "note small", text: !sat || sat.state === "loading" ? t("md_sat_loading") : sat.state === "ready" ? t("md_sat_ready").replace("{c}", sat.cloud) : t("md_sat_none") }),
      r && el("div", { class: "btnrow" }, el("button", { class: "btn", type: "button", text: t("md_tif"), onclick: () => dayTif(st.day) }), el("button", { class: "btn", type: "button", text: t("md_csv"), onclick: daysCsv })),
      r && el("p", { class: "note small", text: `${t("md_wind")}: ${r.source} · ${t(r.ring ? "md_src_pit" : "md_src_circle")} · ${t("md_grid")}` }),
      el("p", { class: "note small", text: t("md_note") }),
      el("p", { class: "note small", text: t("md_scale") }),
      el("p", { class: "note small", text: t("md_check") }),
    ].filter(Boolean));
  }
  render();

  return {
    el: box,
    render,
    show(on) { st.active = on; paint(); },
  };
}
