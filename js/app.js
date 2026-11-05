/* Mongolia hazard watch: map, ranking, detail panel, satellite layers. No framework, no build step. */
import { POINTS, CLASSES, GIBS, MONGOLIA_BBOX } from "./config.js";
import { T } from "./i18n.js";
import { fetchAll, nowLocalString } from "./openmeteo.js";
import { computePoint, classOf } from "./risk.js";
import { makeLayer, utcDate } from "./gibs.js";
import { initTools } from "./tools.js";

const $ = (id) => document.getElementById(id);
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode: ignore */ } },
};

const state = {
  lang: store.get("hw.lang") || "mn",
  hazard: "all",
  data: null,            // { points: {id: result}, generated_at, now_local, source, stale }
  selected: null,
  satDate: utcDate(-1),
  sat: {},               // key -> { on, status, res, layer }
  markers: new Map(),
  fires: null,
  view: "aimag",
  tools: null,
};

const t = (k) => (T[state.lang] && T[state.lang][k]) ?? T.mn[k] ?? k;
const pName = (p) => (state.lang === "mn" ? p.mn : p.en);
const fmt = (v, d = 1) => (typeof v === "number" && Number.isFinite(v) ? v.toFixed(d) : "—");

function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") n.className = v;
    else if (k === "text") n.textContent = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) n.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat()) if (c != null) n.append(c.nodeType ? c : document.createTextNode(String(c)));
  return n;
}

/* ------------------------------------------------------------------ data */
async function getJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

async function liveCompute() {
  const cached = store.get("hw.live.v1");
  if (cached) {
    try {
      const c = JSON.parse(cached);
      if ((Date.now() - Date.parse(c.generated_at)) / 60000 < 90) return { ...c, source: "cache" };
    } catch { /* ignore corrupt cache */ }
  }
  let thresholds = {};
  try { thresholds = (await getJson("data/flood_thresholds.json")).points || {}; } catch { /* optional */ }
  const { raw, errors, fetched_at } = await fetchAll(POINTS);
  const now_local = nowLocalString();
  const points = {};
  for (const r of raw) points[r.id] = computePoint({ ...r, thresholds: thresholds[r.id] || null }, now_local);
  if (!Object.values(points).some((p) => p.overall)) throw new Error("no point produced a score: " + JSON.stringify(errors));
  const out = { generated_at: fetched_at, now_local, points, errors };
  store.set("hw.live.v1", JSON.stringify(out));
  return { ...out, source: "live" };
}

async function loadData() {
  let latest = null;
  try { latest = await getJson("data/latest.json"); } catch { /* not built yet */ }
  const ageH = latest ? (Date.now() - Date.parse(latest.generated_at)) / 3.6e6 : Infinity;
  if (latest && ageH <= 6) return { ...latest, source: "prebuilt" };
  try { return await liveCompute(); }
  catch (e) {
    if (latest) return { ...latest, source: "prebuilt", stale: true };
    throw e;
  }
}

/* --------------------------------------------------------------- scoring */
const scoreOf = (id, hazard) => {
  const r = state.data?.points?.[id];
  if (!r) return null;
  const s = hazard === "all" ? r.overall?.score : r[hazard]?.score;
  return typeof s === "number" ? s : null;
};
const colorOf = (s) => classOf(s)?.color || "#6b7785";
const classLabel = (s) => (classOf(s) ? t("class_" + classOf(s).key) : t("no_data"));

/* ------------------------------------------------------------------- UI */
function renderStatic() {
  document.documentElement.lang = state.lang === "mn" ? "mn" : "en";
  $("t-title").textContent = t("title");
  $("t-subtitle").textContent = t("subtitle");
  $("btn-lang").textContent = t("lang");
  $("btn-methods").textContent = t("methods");
  $("btn-close").textContent = t("close");
  $("t-ranking").textContent = t("ranking");
  $("note").textContent = t("live_note");
  $("t-sat").textContent = t("sat_title");
  $("t-sat-date").textContent = t("sat_date");
  $("btn-yesterday").textContent = t("sat_yesterday");
  $("btn-today").textContent = t("sat_today");
  $("t-sat-base").textContent = t("sat_base");
  $("t-sat-overlay").textContent = t("sat_overlay");
  $("t-fires").textContent = t("fires_detected");
  $("t-sat-note").textContent = t("sat_note");
  $("footer").textContent = t("footer");
  $("methods-body").innerHTML = t("methods_html"); // trusted static strings from i18n.js
}

/** Sub-sections: every hazard has the province ranking and the polygon tool; the mine plume belongs to dust storms. */
const viewsFor = (hz) => (hz === "dust" ? ["aimag", "mine", "poly"] : ["aimag", "poly"]);

function renderViews() {
  if (!viewsFor(state.hazard).includes(state.view)) state.view = "aimag";
  $("views").replaceChildren(...viewsFor(state.hazard).map((v) =>
    el("button", { class: "tab", role: "tab", "aria-selected": String(state.view === v), text: t("nav_" + v), onclick: () => setView(v) })));
  for (const v of ["aimag", "poly", "mine"]) $("view-" + v).hidden = state.view !== v;
}

function setHazard(h) {
  state.hazard = h;
  if (!viewsFor(h).includes(state.view)) { state.view = "aimag"; if (state.tools) state.tools.setView("aimag"); }
  if (state.tools) state.tools.setHazard(h);
  renderAll();
}

function setView(v) {
  state.view = v;
  renderViews(); renderMarkers();
  if (state.tools) state.tools.setView(v);
}

function renderTabs() {
  const tabs = $("tabs");
  tabs.replaceChildren(...["all", "flood", "fire", "dust"].map((h) =>
    el("button", { class: "tab", role: "tab", "aria-selected": String(state.hazard === h), text: t("hazard_" + h), onclick: () => setHazard(h) })));
}

function renderLegend() {
  $("legend").replaceChildren(
    ...CLASSES.map((c) => el("span", {}, el("i", { style: `background:${c.color}` }), t("class_" + c.key))),
    el("span", {}, el("i", { style: "background:#6b7785" }), t("no_data")));
}

function renderStatus() {
  const d = state.data;
  const chip = $("status");
  if (!d) { chip.textContent = t("loading"); chip.className = "chip"; return; }
  chip.textContent = `${t("updated")}: ${d.now_local.replace("T", " ")} ${t("local_time")}`;
  chip.className = "chip " + (d.stale ? "warn" : "ok");
  const b = $("banner");
  if (d.stale) { b.hidden = false; b.className = "banner"; b.textContent = t("stale"); } else b.hidden = true;
}

function renderRanking() {
  const rows = POINTS.map((p) => ({ p, s: scoreOf(p.id, state.hazard) }))
    .sort((a, b) => (b.s ?? -1) - (a.s ?? -1));
  $("ranking").replaceChildren(...rows.map(({ p, s }, i) => {
    const li = el("li", { tabindex: "0", "aria-current": String(state.selected === p.id), onclick: () => select(p.id), onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(p.id); } } },
      el("span", { class: "rank", text: String(i + 1) }),
      el("span", { class: "name" }, pName(p), el("small", { text: `${classLabel(s)} · ${p.centre_mn}` }),
        el("span", { class: "bar" }, el("b", { style: `width:${s ?? 0}%;background:${colorOf(s)}` }))),
      el("span", { class: "val", text: s === null ? "—" : String(Math.round(s)) }));
    return li;
  }));
}

function renderMarkers() {
  for (const m of state.markers.values()) m.remove();
  state.markers.clear();
  if (!state.map || state.view !== "aimag") return;
  for (const p of POINTS) {
    const s = scoreOf(p.id, state.hazard);
    const m = L.circleMarker([p.lat, p.lon], { radius: p.id === state.selected ? 13 : 10, color: p.id === state.selected ? "#ffffff" : "#101820", weight: p.id === state.selected ? 3 : 1.5, fillColor: colorOf(s), fillOpacity: 0.92 })
      .bindTooltip(`${pName(p)}: ${s === null ? t("no_data") : Math.round(s) + " · " + classLabel(s)}`)
      .on("click", () => select(p.id))
      .addTo(state.map);
    state.markers.set(p.id, m);
  }
}

function sparkline(series) {
  const bars = series.map((d) => {
    const h = d.fwi === null || d.fwi === undefined ? 2 : Math.max(2, Math.min(d.fwi, 50) / 50 * 44);
    const col = d.fwi === null || d.fwi === undefined ? "#6b7785" : colorOf(d.snowCovered ? 0 : d.score);
    return el("b", { style: `height:${h}px;background:${col}`, title: `${d.date}: FWI ${fmt(d.fwi)}${d.snowCovered ? " ❄" : ""}` });
  });
  return el("div", {}, el("div", { class: "spark" }, bars), el("div", { class: "spark-axis" }, el("span", { text: series[0]?.date.slice(5) ?? "" }), el("span", { text: series[series.length - 1]?.date.slice(5) ?? "" })));
}

function row(label, value) { return el("tr", {}, el("td", { text: label }), el("td", { text: value })); }

function detailBlocks(r, hazard) {
  const rows = [];
  if (hazard === "fire" && r.fire) {
    const f = r.fire;
    rows.push(row(t("d_fwi_today"), fmt(f.fwiToday)), row(t("d_fwi_max"), fmt(f.fwiMax)));
    if (f.today) rows.push(row(t("d_codes"), `${fmt(f.today.ffmc)} / ${fmt(f.today.dmc)} / ${fmt(f.today.dc, 0)}`), row(t("d_isi_bui"), `${fmt(f.today.isi)} / ${fmt(f.today.bui)}`));
  } else if (hazard === "dust" && r.dust) {
    const d = r.dust;
    rows.push(row(t("d_wind_max"), d.windMax == null ? "—" : `${fmt(d.windMax)} m/s`), row(t("d_potential"), d.potential == null ? "—" : fmt(d.potential, 0)),
      row(t("d_cams"), d.dustMax == null ? "—" : `${fmt(d.dustMax, 0)} µg/m³`), row(t("d_cams_now"), d.dustNow == null ? "—" : `${fmt(d.dustNow, 0)} µg/m³`),
      row(t("d_cams_score"), d.camsScore == null ? "—" : fmt(d.camsScore, 0)), row(t("d_pm10"), d.pm10Max == null ? "—" : `${fmt(d.pm10Max, 0)} µg/m³`), row(t("d_aod"), fmt(d.aodMax, 2)));
    if (d.gated?.hours) rows.push(row(t("d_gate"), `${d.gated.snow + d.gated.wet} / ${d.gated.hours}`));
  } else if (hazard === "flood" && r.flood) {
    const f = r.flood;
    rows.push(row(t("d_r1"), f.R1 == null ? "—" : `${fmt(f.R1)} mm/h`), row(t("d_r24"), f.R24 == null ? "—" : `${fmt(f.R24, 0)} mm`), row(t("d_rain_score"), f.rainScore == null ? "—" : fmt(f.rainScore, 0)),
      row(t("d_q_now"), f.Qnow == null ? "—" : `${fmt(f.Qnow)} m³/s`), row(t("d_q_max"), f.Qmax == null ? "—" : `${fmt(f.Qmax)} m³/s`), row(t("d_q_med"), f.Qmedian == null ? "—" : `${fmt(f.Qmedian)} m³/s`));
    if (f.rise != null) rows.push(row(t("d_rise"), `×${fmt(f.rise, 1)}`));
    rows.push(row(t("d_q_score"), f.dischargeScore == null ? "—" : fmt(f.dischargeScore, 0)));
    if (f.method) rows.push(row(t("d_method"), t("m_" + f.method)));
  }
  return rows;
}

function renderDetail() {
  const box = $("detail");
  const p = POINTS.find((x) => x.id === state.selected);
  const r = p && state.data?.points?.[p.id];
  if (!p || !r) { box.hidden = true; return; }
  box.hidden = false;
  const hz = state.hazard === "all" ? (r.overall?.hazard ?? "fire") : state.hazard;
  const s = scoreOf(p.id, state.hazard);
  const flags = (r[hz]?.flags || []).map((f) => el("li", { text: t("f_" + f) }));
  const hzInfo = r[hz];
  box.replaceChildren(...[
    el("h3", { text: `${pName(p)} · ${t("hazard_" + hz)}` }),
    el("span", { class: "cls", style: `background:${colorOf(hzInfo?.score ?? null)}`, text: `${hzInfo?.score == null ? t("no_data") : Math.round(hzInfo.score) + " · " + classLabel(hzInfo.score)}` }),
    state.hazard === "all" && r.overall ? el("p", { class: "note", text: `${t("score")}: ${Math.round(s)} (${t("hazard_" + r.overall.hazard)})` }) : null,
    el("h4", { text: t("why") }),
    el("table", {}, ...detailBlocks(r, hz)),
    hz === "fire" && r.fire?.series?.length ? sparkline(r.fire.series) : null,
    flags.length ? el("ul", { class: "flags" }, ...flags) : null].filter(Boolean));
}

function select(id) {
  state.selected = id;
  const p = POINTS.find((x) => x.id === id);
  if (p && state.map) state.map.panTo([p.lat, p.lon], { animate: true });
  renderRanking(); renderMarkers(); renderDetail();
}

function renderAll() { renderStatic(); renderLabels(); renderViews(); renderTabs(); renderLegend(); renderStatus(); renderRanking(); renderMarkers(); renderDetail(); renderSat(); if (state.tools) state.tools.relabel(); }

/* ------------------------------------------------------------- satellite */
function initSatState() {
  for (const l of GIBS.layers) state.sat[l.key] = { on: l.key === "truecolor_viirs" || l.key === "fire_viirs", layer: null, date: null };
}

function applySat(key) {
  const def = GIBS.layers.find((l) => l.key === key), st = state.sat[key];
  if (!state.map) return;
  if (!st.on) { if (st.layer) st.layer.remove(); renderSat(); return; }
  if (!st.layer || st.date !== state.satDate) {
    if (st.layer) st.layer.remove();
    st.layer = makeLayer(L, def, state.satDate);
    st.date = state.satDate;
  }
  if (!state.map.hasLayer(st.layer)) st.layer.addTo(state.map);
  renderSat();
}

function setBase(key) {
  for (const l of GIBS.layers.filter((x) => x.kind === "base")) {
    const st = state.sat[l.key];
    const want = l.key === key;
    if (want !== st.on) { st.on = want; if (!want && st.layer) st.layer.remove(); }
  }
  applySat(key);
}

function renderSat() {
  const mk = (l) => {
    const st = state.sat[l.key];
    const isBase = l.kind === "base";
    const input = el("input", { type: isBase ? "radio" : "checkbox", name: isBase ? "base" : null, checked: st.on,       onchange: (e) => { if (isBase) setBase(l.key); else { st.on = e.target.checked; applySat(l.key); } } });
    const info = `${l.sensor} · ${l.res}`;
    return el("label", { class: "check", "data-state": "on" }, input, el("span", {}, t("layer_" + l.key), el("small", { text: info })));
  };
  $("sat-base").replaceChildren(...GIBS.layers.filter((l) => l.kind === "base").map(mk));
  $("sat-overlay").replaceChildren(...GIBS.layers.filter((l) => l.kind === "overlay").map(mk));
  $("sat-date").value = state.satDate;
  $("sat-date").max = utcDate(0);
}

/** Used by the tools panel: set the imagery date and/or switch one overlay. */
function requestSat({ key, on, date }) {
  if (date) { const d = date > utcDate(0) ? utcDate(0) : date; if (d !== state.satDate) setSatDate(d); }
  if (key && state.sat[key] && typeof on === "boolean" && state.sat[key].on !== on) { state.sat[key].on = on; applySat(key); }
}

function setSatDate(d) {
  state.satDate = d;
  $("sat-date").value = d;
  for (const l of GIBS.layers) if (state.sat[l.key].on) applySat(l.key);
}

/* ----------------------------------------------------------------- fires */
async function loadFires() {
  try {
    const f = await getJson("data/fires.json");
    state.fires = L.layerGroup();
    for (const d of f.detections) {
      L.circleMarker([d.lat, d.lon], { radius: 3.5, color: "#fff4", weight: 0.5, fillColor: "#ff5a1f", fillOpacity: 0.9 })
        .bindTooltip(`${d.date} ${d.time ?? ""} · ${d.src} · FRP ${d.frp ?? "—"} MW · ${d.conf ?? ""}`).addTo(state.fires);
    }
    if ($("chk-fires").checked) state.fires.addTo(state.map);
    $("chk-fires").parentElement.hidden = false;
  } catch { $("chk-fires").parentElement.hidden = true; }
}

/* ------------------------------------------------------------------ boot */
function initMap() {
  const [s, w, n, e] = MONGOLIA_BBOX;
  state.map = L.map("map", { minZoom: 4, maxBounds: [[35, 75], [58, 135]], zoomSnap: 0.25 });
  state.map.fitBounds([[s, w], [n, e]]);
  state.map.attributionControl.setPrefix(false);
  state.map.on("zoomend", () => { if (!state.labels) return; if (state.map.getZoom() >= 6) state.labels.addTo(state.map); else state.labels.remove(); });
}

async function loadOutline() {
  try {
    const gj = await getJson("data/mongolia.geojson");
    L.geoJSON(gj, { style: { color: "#ffffff", weight: 1.6, opacity: 0.85, fill: false, dashArray: "5 4" }, interactive: false }).addTo(state.map);
  } catch { /* outline is cosmetic */ }
}

function renderLabels() {
  if (!state.map) return;
  if (state.labels) state.labels.remove();
  state.labels = L.layerGroup(POINTS.map((p) => L.marker([p.lat, p.lon], { interactive: false, icon: L.divIcon({ className: "lbl", html: pName(p), iconSize: [0, 0], iconAnchor: [-12, 6] }) })));
  if (state.map.getZoom() >= 6) state.labels.addTo(state.map);
}

function wire() {
  $("btn-lang").onclick = () => { state.lang = state.lang === "mn" ? "en" : "mn"; store.set("hw.lang", state.lang); renderAll(); };
  $("btn-methods").onclick = () => $("dlg-methods").showModal();
  $("btn-close").onclick = () => $("dlg-methods").close();
  $("sat-date").onchange = (e) => { if (e.target.value) setSatDate(e.target.value); };
  $("btn-yesterday").onclick = () => setSatDate(utcDate(-1));
  $("btn-today").onclick = () => setSatDate(utcDate(0));
  $("chk-fires").onchange = (e) => { if (!state.fires) return; e.target.checked ? state.fires.addTo(state.map) : state.fires.remove(); };
}

async function boot() {
  initSatState();
  renderAll();
  initMap();
  state.tools = initTools({ map: state.map, getLang: () => state.lang, requestSat, containers: { poly: $("view-poly"), mine: $("view-mine") } });
  wire();
  renderMarkers();
  renderLabels();
  loadOutline();
  for (const l of GIBS.layers) if (state.sat[l.key].on) applySat(l.key);
  loadFires();
  try {
    state.data = await loadData();
  } catch (e) {
    console.error(e);
    const b = $("banner");
    b.hidden = false; b.className = "banner error"; b.textContent = t("load_failed");
    $("status").textContent = t("no_data");
    return;
  }
  const first = [...POINTS].sort((a, b) => (scoreOf(b.id, "all") ?? -1) - (scoreOf(a.id, "all") ?? -1))[0];
  state.selected = first ? first.id : null;
  renderAll();
}

boot();
try { sessionStorage.removeItem("hw.reloaded"); } catch { /* ignore */ }
