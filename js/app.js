/* Mongolia hazard watch: the map screen. No framework, no build step.
 * Risk zones come from data/gee (written by the Earth Engine pipeline). When a date or the whole dataset is missing,
 * the screen says so and shows no colour: this page never fills a gap with a made-up value. */
import { CLASSES, GIBS, MONGOLIA_BBOX } from "./config.js";
import { T } from "./i18n.js";
import { U } from "./ui_text.js";
import { firstDate, makeLayer, newestImageDate, utcDate, versionAt } from "./gibs.js";
import { initTools } from "./tools.js";
import { decode, loadCube, loadDaily, loadManifest } from "./dataset.js";
import { campsCanvas, campsInside, campsReport, loadCamps } from "./camps.js";
import { initDownloads } from "./downloads.js";
import { createRiskLayer } from "./riskmap.js";
import { initRectDraw } from "./rectdraw.js";
import { initDateBar } from "./datebar.js";
import { boxCells, cellsMean } from "./stats.js";
import { dayReport, highDaySeries, longReport, monthSeries } from "./area.js";
import { createStatsPanel } from "./statspanel.js";
import { openMethods } from "./methods.js";
import { createSoumLayer, loadSoums } from "./soums.js";
import { el } from "./dom.js";

const $ = (id) => document.getElementById(id);
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode: ignore */ } },
};

const HAZARDS = ["all", "flood", "fire", "dust"];
const FIRST_IMAGERY = "2000-02-24"; // first MODIS Terra day

// hazard null is the opening screen: the satellite image alone, with nothing computed or loaded until a hazard is chosen.
const state = {
  lang: store.get("hw.lang") || "mn", hazard: null, mode: "zones",
  manifest: null, date: utcDate(-1), day: null, dayMissing: false,
  sel: null, selToken: 0, dayToken: 0, soums: null, soumQuery: "", sat: {},
};

const t = (k) => U[state.lang][k] ?? U.mn[k] ?? k;
const layerName = (k) => (T[state.lang] && T[state.lang][k]) ?? T.mn[k] ?? k;
const classOf = (v) => CLASSES.find((c) => v < c.max) ?? null;
const classLabel = (key) => t("class_" + key);
const dms = (v, pos, neg) => { const a = Math.abs(v), d = Math.floor(a), m = Math.floor((a - d) * 60); return `${d}° ${String(m).padStart(2, "0")}′ ${v >= 0 ? pos : neg}`; };

function notice(text) { const n = $("notice"); n.hidden = !text; n.textContent = text ?? ""; }

/* ---------------------------------------------------------------- menus */
function renderStatic() {
  document.documentElement.lang = state.lang;
  $("t-title").textContent = t("title");
  $("t-subtitle").textContent = t("subtitle");
  $("t-hazards").textContent = t(state.hazard ? "hazards" : "pick_hazard");
  $("t-view").textContent = t("view");
  $("t-sat").textContent = t("satellites");
  $("t-sat-base").textContent = t("base");
  $("t-sat-overlay").textContent = t("overlays");
  $("t-mine").textContent = t("mine");
  $("t-footer").textContent = t("footer");
  $("soum-q").placeholder = t("soum_search");
  $("hint").textContent = t("hint");
  if (state.manifest?.synthetic) { $("test-flag").hidden = false; $("test-flag").textContent = t("synthetic"); }
}

function renderMenus() {
  const image = el("div", { class: "item" + (state.hazard ? "" : " on") },
    el("button", { class: "pick", type: "button", "aria-pressed": String(!state.hazard), text: t("imagery_only"), onclick: () => setHazard(null) }));
  $("hazards").replaceChildren(image, ...HAZARDS.map((h) => el("div", { class: "item" + (state.hazard === h ? " on" : "") },
    el("button", { class: "pick", type: "button", "aria-pressed": String(state.hazard === h), text: t(h), onclick: () => setHazard(h) }),
    el("button", { class: "info", type: "button", title: `${t(h)}: ${t("method_of")}`, "aria-label": `${t(h)}: ${t("method_of")}`, text: "i", onclick: () => showMethods(h) }))));
  $("modes").replaceChildren(...["zones", "soums"].map((m) => el("div", { class: "item" + (state.mode === m ? " on" : "") },
    el("button", { class: "pick", type: "button", "aria-pressed": String(state.mode === m), text: t("mode_" + m), onclick: () => setMode(m) }))));
}

function renderLegend() {
  $("legend").replaceChildren(...CLASSES.map((c) => el("span", { style: `background:${c.color};color:${c.ink}`, text: classLabel(c.key) })));
}

const ICON = {
  draw: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4.5" y="6.5" width="15" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="3 2.4"/></svg>',
  move: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  download: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 19.5h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  home: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="2" fill="currentColor"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  menu: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
};

function renderRail() {
  const button = (html, label, on, extra = "") => {
    const b = el("button", { class: "rbtn " + extra, type: "button", title: label, "aria-label": label, onclick: on });
    b.innerHTML = html;
    return b;
  };
  const draw = state.rect.mode === "draw", results = Boolean(state.hazard);
  $("rail").replaceChildren(...[
    button(ICON.menu, t("rail_menu"), () => $("side").classList.toggle("open"), "side-toggle"),
    results && button(draw ? ICON.draw : ICON.move, t(draw ? "rail_draw" : "rail_move"), () => { state.rect.toggle(); renderRail(); }, draw ? "on" : ""),
    results && button("i", t("rail_method"), () => showMethods(state.hazard)),
    button(ICON.download, t("rail_download"), () => state.downloads.toggle()),
    button(ICON.home, t("rail_home"), fitMongolia),
    button(t("lang"), t("lang"), () => { state.lang = state.lang === "mn" ? "en" : "mn"; store.set("hw.lang", state.lang); renderAllText(); }),
  ].filter(Boolean));
}

/** The screen follows the choice: nothing but the image until a hazard is chosen. */
function renderScreen() {
  const results = Boolean(state.hazard);
  document.body.classList.toggle("bare", !results);
  state.rect.setActive(results);
  if (state.outlineLayer) { if (results) state.outlineLayer.addTo(state.map); else state.outlineLayer.remove(); }
  $("t-hazards").textContent = t(results ? "hazards" : "pick_hazard");
  renderMenus();
  renderRail();
}

function renderAllText() {
  renderStatic(); renderMenus(); renderLegend(); renderRail(); renderSat(); renderSoumList();
  state.dateBar?.relabel();
  state.tools?.relabel();
  renderSelection();
  updateNotice();
}

const showMethods = (h) => openMethods($("dlg"), h, { lang: state.lang, t, manifest: state.manifest });

/* ------------------------------------------------------------ satellite */
function initSatState() {
  for (const l of GIBS.layers) state.sat[l.key] = { on: l.key === "truecolor_terra", layer: null, date: null };
}

function applySat(key) {
  const def = versionAt(GIBS.layers.find((l) => l.key === key), state.date), st = state.sat[key];
  if (!st.on || !def) { st.layer?.remove(); return; }
  if (!st.layer || st.date !== state.date) {
    st.layer?.remove();
    st.layer = makeLayer(window.L, def, state.date);
    st.date = state.date;
  }
  if (!state.map.hasLayer(st.layer)) st.layer.addTo(state.map);
}

function setBase(key) {
  for (const l of GIBS.layers.filter((x) => x.kind === "base")) {
    const st = state.sat[l.key], want = l.key === key;
    if (want !== st.on) { st.on = want; if (!want) st.layer?.remove(); }
  }
  applySat(key);
}

/** A satellite that has not passed yet today answers with black, so the choice opens on its newest full day. */
async function pickBase(key) {
  setBase(key);
  state.downloads?.refresh();
  if (state.hazard || state.date !== utcDate(0)) return;
  const d = await newestImageDate(GIBS.layers.find((l) => l.key === key));
  if (d !== state.date && state.sat[key].on) { state.dateBar.setValue(d); await setDate(d); }
}

function renderSat() {
  const mk = (l) => {
    const st = state.sat[l.key], base = l.kind === "base", now = versionAt(l, state.date);
    const input = el("input", { type: base ? "radio" : "checkbox", name: base ? "base" : null, checked: st.on, disabled: !now, onchange: (e) => { if (base) pickBase(l.key); else { st.on = e.target.checked; applySat(l.key); } } });
    return el("label", { class: "check" + (now ? "" : " off") }, input, el("span", {}, layerName("layer_" + l.key), el("small", { text: now ? `${now.sensor} · ${now.res}` : t("sat_from").replace("{d}", firstDate(l)) })));
  };
  $("sat-base").replaceChildren(...GIBS.layers.filter((l) => l.kind === "base").map(mk));
  $("sat-overlay").replaceChildren(...GIBS.layers.filter((l) => l.kind === "overlay").map(mk));
}

/** Used by the mine tool: set the imagery date and/or switch one overlay. */
function requestSat({ key, on, date }) {
  // One date for the whole screen: the picker, the zones and the imagery must never show different days.
  if (date && date !== state.date) { state.dateBar.setValue(date); setDate(state.dateBar.value); }
  if (key && state.sat[key] && typeof on === "boolean" && state.sat[key].on !== on) { state.sat[key].on = on; applySat(key); renderSat(); }
}
function syncSat() {
  const base = GIBS.layers.find((l) => l.kind === "base" && state.sat[l.key].on);
  if (!versionAt(base, state.date)) setBase("truecolor_terra"); // that satellite was not flying yet on this day
  for (const l of GIBS.layers) if (state.sat[l.key].on) applySat(l.key);
  renderSat();
}

/* ------------------------------------------------------------ risk layer */
const frameNow = () => state.day?.[state.hazard] ?? null;
const uFrameNow = () => state.day?.["u_" + state.hazard] ?? null;

function paint() {
  if (state.risk) {
    state.risk.setFrame(state.mode === "zones" ? frameNow() : null, uFrameNow());
  }
  paintSoums();
}

function updateNotice() {
  if (!state.hazard) return notice(null);
  if (!state.manifest) return notice(t("no_manifest"));
  if (state.dayMissing) return notice(t("no_day").replace("{d}", state.date));
  if (state.loadError) return notice(t("load_error") + state.loadError);
  notice(state.movedDay ? t("moved_day").replace("{d}", state.date) : null);
}

async function setDate(d) {
  state.date = d;
  state.movedDay = false;
  syncSat();
  state.downloads?.refresh();
  if (!state.manifest || !state.hazard) return;
  const my = ++state.dayToken;
  let day = null;
  state.loadError = null;
  try { day = await loadDaily(state.manifest, d); }
  catch (e) { console.error(e); state.loadError = e.message; }
  if (my !== state.dayToken) return;
  state.day = day;
  state.dayMissing = !day && !state.loadError;
  updateNotice();
  paint();
  renderSelection();
  state.downloads?.refresh();
}

/** Results run only as far as the computed data, the image up to today, so the picker follows what is on screen. */
async function enterResults() {
  const m = state.manifest;
  if (!m) return;
  state.risk ??= createRiskLayer(state.map, m.grid, CLASSES, state.outline);
  state.dateBar.setRange(m.first_date, m.last_date);
  const moved = state.dateBar.value !== state.date;
  await setDate(state.dateBar.value);
  state.movedDay = moved;
  updateNotice();
  showSoums();
}

function leaveResults() {
  closeSelection();
  $("mine-box").open = false; // the plume leaves with the rest: this view promises the image alone
  state.dayToken++; // a day still loading must not paint over the plain image
  state.day = null;
  state.dayMissing = false;
  state.movedDay = false;
  paint();
  state.soumLayer?.show(false);
  $("soum-box").hidden = true;
  state.dateBar.setRange(FIRST_IMAGERY, utcDate(0));
  updateNotice();
}

async function setHazard(h) {
  const entering = !state.hazard && h;
  state.hazard = h;
  renderScreen();
  state.downloads.refresh();
  if (!h) { leaveResults(); return; }
  await state.ready;
  if (state.hazard !== h) return;
  if (entering) await enterResults();
  else { paint(); if (state.sel) loadSelection(); }
  state.tools?.setHazard(h);
  state.downloads.refresh();
}

/** Soum boundaries load once, when they are first needed. */
function soumsReady() {
  const m = state.manifest;
  if (!m) return Promise.resolve(null);
  state.soumsLoad ??= loadSoums(m.grid).then((gj) => {
    state.soums = gj;
    if (gj) state.soumLayer = createSoumLayer(state.map, gj, {
      color: (s) => (s === null || s === undefined ? "#555" : classOf(s).color),
      tip: (f, s) => `${soumLabel(f)}: ${s === null || s === undefined ? t("no_data") : `${Math.round(s)} · ${classLabel(classOf(s).key)}`}`,
      onPick: (f) => pickSoum(f, false),
    });
    return gj;
  }).catch((e) => { console.error(e); return null; });
  return state.soumsLoad;
}

async function showSoums() {
  const on = state.mode === "soums" && Boolean(state.hazard);
  $("soum-box").hidden = !on;
  if (on) await soumsReady();
  state.soumLayer?.show(state.mode === "soums" && Boolean(state.hazard));
  paintSoums();
}

function setMode(m) {
  state.mode = m;
  renderMenus();
  paint();
  showSoums();
}

/* ----------------------------------------------------------------- soums */
/** Soum with its aimag: 44 soum names occur in more than one aimag. */
function soumLabel(f) {
  const n = f.names[state.lang], a = f.aimags[state.lang];
  return a ? `${n} (${a})` : n;
}

function soumScore(f) {
  const fr = frameNow();
  return fr ? cellsMean(fr, f.cells, decode)?.mean ?? null : null;
}

function paintSoums() {
  if (state.mode === "soums") state.soumLayer?.setScores(soumScore);
  renderSoumList();
}

function renderSoumList() {
  const box = $("soum-list");
  if (state.mode !== "soums") return;
  if (!state.soums) { box.replaceChildren(el("li", { class: "empty", text: t("soum_none") })); return; }
  const q = state.soumQuery.trim().toLowerCase();
  const rows = state.soums.features.filter((f) => !q || `${f.names.mn} ${f.aimags.mn} ${f.names.en} ${f.aimags.en}`.toLowerCase().includes(q))
    .map((f) => ({ f, s: state.soumLayer.score(f) ?? null })).sort((a, b) => (b.s ?? -1) - (a.s ?? -1)).slice(0, 120);
  if (!rows.length) { box.replaceChildren(el("li", { class: "empty", text: t("no_match") })); return; }
  box.replaceChildren(...rows.map(({ f, s }) => el("li", {},
    el("button", { type: "button", class: state.sel?.soum === f.id ? "on" : "", onclick: () => pickSoum(f, true) },
      el("i", { style: `background:${s === null ? "#555" : classOf(s).color}` }), el("span", { text: soumLabel(f) }), el("b", { text: s === null ? "—" : String(Math.round(s)) })))));
}

function pickSoum(f, fly) {
  state.rect.clear();
  const b = state.soumLayer.bounds(f);
  state.sel = { kind: t("mode_soums"), label: soumLabel(f), cells: f.cells, soum: f.id, geom: f.geometry, box: { s: b.getSouth(), n: b.getNorth(), w: b.getWest(), e: b.getEast() } };
  state.soumLayer.pick(f.id);
  if (fly) state.map.fitBounds(state.soumLayer.bounds(f), { maxZoom: 9, paddingBottomRight: [420, 100] });
  renderSoumList();
  loadSelection();
}

/* ------------------------------------------------------------- selection */
async function loadSelection() {
  const my = ++state.selToken, s = state.sel, m = state.manifest;
  s.long = null; s.months = null; s.high = null; s.longError = false;
  s.campsOn ??= true;
  renderSelection();
  if (!m || !s.cells.length) return;
  loadCamps().then((a) => {
    if (!a || state.sel !== s) return;
    s.campPoints = campsInside(a, s.box, s.geom);
    renderSelection();
  });
  try {
    const name = state.hazard;
    const [mc, hc] = await Promise.all([loadCube(m, "monthly_" + name), loadCube(m, "highdays_" + name)]);
    if (my !== state.selToken) return;
    s.months = monthSeries(mc, m.first_month, s.cells);
    s.high = highDaySeries(hc, m.first_month, s.cells);
    s.long = longReport({ months: s.months, high: s.high });
  } catch (e) {
    console.error(e);
    if (my !== state.selToken) return;
    s.longError = true;
  }
  renderSelection();
}

function renderSelection() {
  const s = state.sel;
  if (!s) return;
  const m = state.manifest, fr = frameNow();
  const day = fr ? dayReport({ frame: fr, uframe: uFrameNow(), cells: s.cells, grid: m.grid, classes: CLASSES, uModel: m.uncertainty?.[state.hazard]?.u_model }) : null;
  s.campReport = s.campPoints ? campsReport(s.campPoints, fr, m.grid, CLASSES, day?.budget?.U ?? 0) : null;
  drawCamps(s);
  state.panel.render({
    kind: s.kind, label: s.label, hazard: state.hazard, hazardLabel: t(state.hazard), date: state.date, camps: s.campReport, campsOn: s.campsOn,
    day, dayMissing: !fr, long: s.long, months: s.months, longError: s.longError || !m, verification: m?.verification?.[state.hazard],
  });
  state.downloads?.refresh();
}

/** Camps appear only inside the selected area, as one image, and leave with the selection. */
function drawCamps(s) {
  state.campsLayer?.remove();
  state.campsLayer = null;
  state.campsImage = null;
  if (!s?.campPoints?.length || !s.campsOn) return;
  const cv = campsCanvas(s.campPoints, s.box, CLASSES);
  state.campsImage = { canvas: cv, box: s.box };
  state.campsLayer = window.L.imageOverlay(cv.toDataURL(), [[s.box.s, s.box.w], [s.box.n, s.box.e]], { interactive: false }).addTo(state.map);
}

function onBox(box) {
  state.soumLayer?.pick(null);
  if (!state.manifest) return;
  state.sel = { kind: t("box_label"), label: `${box.s.toFixed(2)}–${box.n.toFixed(2)}°N · ${box.w.toFixed(2)}–${box.e.toFixed(2)}°E`, cells: boxCells(state.manifest.grid, box), box };
  loadSelection();
}

function closeSelection() {
  state.sel = null;
  state.selToken++;
  drawCamps(null);
  state.rect.clear();
  state.soumLayer?.pick(null);
  state.panel.close();
  renderSoumList();
  state.downloads?.refresh();
}

/** Wind arrows and the dust plume for the selected area, released from its centre on the selected day. */
function showPlume() {
  const s = state.sel, g = state.manifest?.grid;
  if (!s?.cells.length) return;
  const rows = s.cells.map((c) => c.r), cols = s.cells.map((c) => c.c);
  const r0 = Math.min(...rows), r1 = Math.max(...rows), c0 = Math.min(...cols), c1 = Math.max(...cols);
  const lat = g.north - ((r0 + r1 + 1) / 2) * g.dy, lon = g.west + ((c0 + c1 + 1) / 2) * g.dx;
  const halfKm = Math.max((r1 - r0 + 1) * g.dy * 111.32, (c1 - c0 + 1) * g.dx * 111.32 * Math.cos(lat * Math.PI / 180)) / 2;
  $("side").classList.add("open");
  $("mine-box").open = true;
  return state.tools.plumeAt({
    lat, lon, date: state.date, radius: [50, 100, 200].find((r) => r >= halfKm) ?? 200, material: "quartz",
    fit: { paddingTopLeft: [window.innerWidth > 1000 ? 360 : 10, 10], paddingBottomRight: [window.innerWidth > 720 ? 420 : 10, 110] },
  }).then(() => state.downloads.refresh());
}

/* ------------------------------------------------------------------ boot */
function fitMongolia() {
  const [s, w, n, e] = MONGOLIA_BBOX;
  // A page loading in a hidden tab has a map of size zero, where fitBounds fails and would stop the whole start-up.
  const size = state.map.getSize();
  if (size.x < 160 || size.y < 200) { state.map.setView([(s + n) / 2, (w + e) / 2], 5); return; }
  // Keep the country clear of the menu on the left and the day picker below.
  const wide = window.innerWidth > 1000;
  state.map.fitBounds([[s, w], [n, e]], { paddingTopLeft: [wide ? 270 : 10, 20], paddingBottomRight: [wide ? 70 : 10, 110] });
}

function initMap() {
  state.map = window.L.map("map", { minZoom: 4, maxBounds: [[30, 65], [62, 145]], zoomSnap: 0.25, zoomControl: false });
  fitMongolia();
  state.map.attributionControl.setPrefix(false);
  state.map.on("mousemove", (e) => {
    const p = state.risk?.sample(e.latlng.lat, e.latlng.lng);
    const pos = `${dms(e.latlng.lat, "N", "S")}  ${dms(e.latlng.lng, "E", "W")}`;
    $("coords").textContent = p ? `${pos} · ${t("score_at")} ${Math.round(p.score)}${p.u === null ? "" : ` ±${Math.round(2 * p.u)}`}` : pos;
  });
  let hintDone = false;
  state.map.on("mousedown zoomstart", () => { if (!hintDone && state.hazard) { hintDone = true; $("hint").classList.add("gone"); } });
}

async function loadOutline() {
  try {
    const res = await fetch("data/mongolia.geojson");
    if (!res.ok) return null;
    const gj = await res.json();
    state.outlineLayer = window.L.geoJSON(gj, { style: { color: "#ffffff", weight: 1.4, opacity: 0.8, fill: false }, interactive: false });
    return gj;
  } catch { return null; }
}

function wire() {
  $("soum-q").addEventListener("input", (e) => { state.soumQuery = e.target.value; renderSoumList(); });
  $("mine-box").addEventListener("toggle", (e) => state.tools?.setView(e.target.open ? "mine" : "aimag"));
}

/** What the results need. The opening image does not wait for any of it. */
async function loadBasics() {
  state.outline = await loadOutline();
  try { state.manifest = await loadManifest(); }
  catch (e) { console.error(e); state.loadError = e.message; }
  renderStatic();
  if (state.hazard) renderScreen();
}

async function boot() {
  initSatState();
  renderStatic();
  initMap();
  state.rect = initRectDraw(state.map, { onDone: onBox, isBlocked: () => $("dlg").open });
  state.panel = createStatsPanel($("stats"), { t, classes: CLASSES, classLabel, onClose: closeSelection, onMethods: showMethods, onCsv: () => state.downloads.seriesCsv(), onPlume: showPlume, onCamps: (on) => { if (state.sel) { state.sel.campsOn = on; renderSelection(); } } });
  state.tools = initTools({ map: state.map, getLang: () => state.lang, requestSat, containers: { poly: el("div"), mine: $("view-mine") }, onMethods: showMethods,
    campsFor: async (box) => { const a = await loadCamps(); return a ? campsInside(a, box) : null; } });
  state.dateBar = initDateBar($("datebar"), { onChange: setDate, text: t, monthName: (m) => t("months")[m - 1] });
  state.downloads = initDownloads({ box: $("dl-menu"), state, t, frameNow, uFrameNow, classOf, classLabel, soumsReady });
  renderLegend(); renderSat();
  renderScreen();
  wire();
  state.ready = loadBasics();
  state.dateBar.setRange(FIRST_IMAGERY, utcDate(0));
  const newest = await newestImageDate(GIBS.layers.find((l) => l.key === "truecolor_terra"));
  if (!state.hazard) { state.dateBar.setValue(newest); await setDate(state.dateBar.value); }
  await state.ready;
}

boot();
try { sessionStorage.removeItem("hw.reloaded"); } catch { /* ignore */ }
