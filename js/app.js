/* Mongolia hazard watch: the map screen. No framework, no build step.
 * Risk zones come from data/gee (written by the Earth Engine pipeline). When a date or the whole dataset is missing,
 * the screen says so and shows no colour: this page never fills a gap with a made-up value. */
import { CLASSES, DUST_APP_URL, FIRE_APP_URL, FLOOD_APP_URL, GIBS, MONGOLIA_BBOX, classesFor } from "./config.js";
import { SOURCES } from "./sources.js";
import { T } from "./i18n.js";
import { U } from "./ui_text.js";
import { firstDate, makeLayer, newestImageDate, utcDate, versionAt } from "./gibs.js";
import { initTools } from "./tools.js";
import { decode, loadCube, loadDaily, loadManifest } from "./dataset.js";
import { campsInside, loadCamps } from "./camps.js";
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
import { initFloodBox } from "./aoi/floodbox.js";
import { initDustBox } from "./aoi/dustbox.js";
import { initFireBox } from "./aoi/firebox.js";

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
  borders: { country: true, aimag: false, soum: false, water: false }, borderLayers: {}, borderData: {},
  dateFolded: store.get("hw.datefold") === "1",
};

const t = (k) => U[state.lang][k] ?? U.mn[k] ?? k;
const layerName = (k) => (T[state.lang] && T[state.lang][k]) ?? T.mn[k] ?? k;
const classesNow = () => classesFor(state.hazard);
const classOf = (v) => classesNow().find((c) => v < c.max) ?? null;
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
  $("t-borders").textContent = t("borders");
  $("back").innerHTML = ICON.back;
  $("back").append(t("back"));
  $("side-close").innerHTML = ICON.fold;
  $("side-close").title = t("side_close");
  $("side-close").setAttribute("aria-label", t("side_close"));
  $("busy-text").textContent = t("busy");
  $("t-sat").textContent = t("satellites");
  $("t-sat-base").textContent = t("base");
  $("t-sat-overlay").textContent = t("overlays");
  $("t-mine").textContent = t("mine");
  $("t-footer").textContent = t("footer");
  $("t-flood-app").textContent = t("flood_app"); // flood is computed on this page (js/aoi), not in a GEE window
  state.floodBox?.render();
  $("t-fire-app").textContent = t("fire_app"); // burned area is computed on this page (js/aoi), the GEE App stays linked
  state.fireBox?.render();
  $("t-dust-app").textContent = t("dust_app"); // dust is checked on this page (js/aoi), the GEE App stays linked
  state.dustBox?.render();
  renderSources();
  $("soum-q").placeholder = t("soum_search");
  $("hint").textContent = t("hint");
  if (state.manifest?.synthetic) { $("test-flag").hidden = false; $("test-flag").textContent = t("synthetic"); }
}

/** The hazards run across the top of the screen. The last three are not computed yet: they say so and do nothing else. */
function renderMenus() {
  const mark = (h) => { const s = el("span", { class: "ico", "aria-hidden": "true" }); s.innerHTML = HAZARD_ICON[h]; return s; };
  $("hazards").replaceChildren(
    ...HAZARDS.map((h) => el("div", { class: "hz" + (state.hazard === h ? " on" : "") },
      el("button", { class: "pick", type: "button", "aria-pressed": String(state.hazard === h), onclick: () => setHazard(h) }, mark(h), el("span", { text: t(h) })),
      el("button", { class: "info", type: "button", title: `${t(h)}: ${t("method_of")}`, "aria-label": `${t(h)}: ${t("method_of")}`, text: "i", onclick: () => showMethods(h) }))),
    el("span", { class: "hz-sep", "aria-hidden": "true" }),
    ...SOON.map((h) => el("div", { class: "hz soon" },
      el("button", { class: "pick", type: "button", title: t("soon"), onclick: () => showSoon(h) }, mark(h), el("span", { text: t("hz_" + h) })))));
  $("modes").replaceChildren(...["zones", "soums"].map((m) => el("div", { class: "item" + (state.mode === m ? " on" : "") },
    el("button", { class: "pick", type: "button", "aria-pressed": String(state.mode === m), text: t("mode_" + m), onclick: () => setMode(m) }))));
}

function renderLegend() {
  $("legend").replaceChildren(...classesNow().map((c) => el("span", { style: `background:${c.color};color:${c.ink}`, text: classLabel(c.key) })));
}

/* ---------------------------------------------------------------- borders */
/* All borders are red, as the user asked, and keep the order of topographic map symbols: the higher the level, the heavier the
 * line. The national border is a solid line, the aimag border a thinner solid line, the soum border the thinnest and dashed, so
 * the two lower levels stay apart where they meet. A pale edge keeps the two upper levels readable on the red of the fire map. */
const BORDERS = {
  water: { file: "data/water.geojson", weight: 0.5, opacity: 0.9, color: "#9ad4ff", fill: "#2f8fe0", fillOpacity: 0.8 },
  soum: { file: "data/soum_lines.geojson", weight: 1, opacity: 0.95, color: "#ff2b2b", dash: [6, 3] },
  aimag: { file: "data/aimag_lines.geojson", weight: 1.35, opacity: 1, color: "#ff1f1f", edge: 2.6, edgeColor: "rgba(255,255,255,.35)" },
  country: { file: "data/mongolia.geojson", weight: 1.8, opacity: 1, color: "#ff1f1f", edge: 3.4, edgeColor: "rgba(255,255,255,.5)" },
};

async function applyBorders() {
  for (const [key, def] of Object.entries(BORDERS)) {
    if (!state.borders[key]) { state.borderLayers[key]?.remove(); continue; }
    if (!state.borderLayers[key]) {
      state.borderData[key] ??= await fetch(def.file).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      if (!state.borderData[key]) continue;
      const line = (style) => window.L.geoJSON(state.borderData[key], { pane: "borderPane", interactive: false, style: { fill: false, lineCap: "butt", lineJoin: "round", ...style } });
      state.borderLayers[key] ??= !def.fill
        ? window.L.layerGroup([def.edge && line({ color: def.edgeColor ?? "#10151a", weight: def.edge, opacity: def.edgeColor ? 1 : 0.55 }), line({ color: def.color ?? "#fff", weight: def.weight, opacity: def.opacity, dashArray: def.dash?.join(" ") })].filter(Boolean))
        : window.L.geoJSON(state.borderData[key], { pane: "borderPane", interactive: false, style: { color: def.color, weight: def.weight, opacity: def.opacity, fill: true, fillColor: def.fill, fillOpacity: def.fillOpacity } });
    }
    if (state.borders[key]) state.borderLayers[key].addTo(state.map);
  }
}

function renderBorders() {
  $("borders").replaceChildren(...["country", "aimag", "soum"].map((k) => el("label", { class: "check" },
    el("input", { type: "checkbox", checked: state.borders[k], onchange: (e) => { state.borders[k] = e.target.checked; applyBorders(); } }), el("span", { text: t("b_" + k) }))));
}

/** What the image needs to draw the same lines as the screen, thinnest first. */
const activeBorders = () => Object.entries(BORDERS).filter(([k]) => state.borders[k] && state.borderData[k]).map(([k, d]) => ({ data: state.borderData[k], weight: d.weight, opacity: d.opacity, color: d.color, fill: d.fill, dash: d.dash, edge: d.edge, edgeColor: d.edgeColor }));

/* ---------------------------------------------------------- computing screen */
let working = 0;
/** The screen softens with a small note while something takes time. Short tasks end before it shows. */
function busy(on) {
  working = Math.max(0, working + (on ? 1 : -1));
  $("busy").classList.toggle("on", working > 0);
}
const whileBusy = async (job) => { busy(true); try { return await job(); } finally { busy(false); } };

/* --------------------------------------------------------------- day picker */
function renderDateFold() {
  const folded = state.dateFolded, label = t(folded ? "date_open" : "date_close"), b = $("date-fold");
  $("bottom").classList.toggle("folded", folded);
  b.setAttribute("aria-expanded", String(!folded));
  b.setAttribute("aria-label", label);
  b.title = label;
  b.firstElementChild.textContent = folded ? state.date : "";
}

const ICON = {
  draw: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4.5" y="6.5" width="15" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="3 2.4"/></svg>',
  move: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  download: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 19.5h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  home: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="2" fill="currentColor"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  menu: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  settings: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h9M17 7h3M4 17h3M11 17h9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="15" cy="7" r="2.2" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="9" cy="17" r="2.2" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5m0 0 6-6m-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  fold: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

const outline = (paths) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
const HAZARD_ICON = {
  all: outline('<circle cx="12" cy="9" r="5"/><circle cx="8.6" cy="15" r="5"/><circle cx="15.4" cy="15" r="5"/>'),
  flood: outline('<path d="M12 3.2s6.4 6.6 6.4 11.2a6.4 6.4 0 0 1-12.8 0C5.6 9.8 12 3.2 12 3.2z"/><path d="M8.9 15a3.2 3.2 0 0 0 2.7 2.9"/>'),
  fire: outline('<path d="M12.4 2.8c.5 3.4 5.4 6 5.4 11.4a5.8 5.8 0 0 1-11.6 0c0-2.3 1-3.9 2.3-5.1.1 1.6.8 2.7 1.9 3 .1-3.5.5-6.5 2-9.3z"/><path d="M12 20c-1.6 0-2.8-1.2-2.8-2.8 0-1.5 1.5-2.4 2.5-3.9.9 1.5 3.1 2.4 3.1 3.9 0 1.6-1.2 2.8-2.8 2.8z"/>'),
  dust: outline('<path d="M12.3 12.2c-.9-.9.5-2.1 1.8-1.4 1.8 1 1.4 3.6-.5 4.2-2.7.9-5-1.7-4.2-4.3 1-3.1 5-4 7.6-2.2 3.3 2.3 3 7.4-.3 9.5-3.9 2.4-9.3.7-11-3.4"/><path d="M3.2 8.6c.8-1.7 2-3 3.6-3.9"/>'),
  crop: outline('<path d="M12 21V8"/><path d="M12 8c0-2.4 1.4-4 3-4.6 0 2.4-1.4 4-3 4.6zM12 8c0-2.4-1.4-4-3-4.6 0 2.4 1.4 4 3 4.6z"/><path d="M12 13c0-2.2 1.4-3.6 3-4.2 0 2.2-1.4 3.6-3 4.2zM12 13c0-2.2-1.4-3.6-3-4.2 0 2.2 1.4 3.6 3 4.2z"/><path d="M12 18c0-2.2 1.4-3.6 3-4.2 0 2.2-1.4 3.6-3 4.2zM12 18c0-2.2-1.4-3.6-3-4.2 0 2.2 1.4 3.6 3 4.2z"/>'),
  // a cow's head from the front: horns, ears, face, muzzle with nostrils
  pasture: outline('<path d="M8.6 7.6C7 7.2 6.2 5.8 6.4 4.2M15.4 7.6c1.6-.4 2.4-1.8 2.2-3.4"/><path d="M8.3 9.6 4.4 9c.4 1.7 1.9 2.7 3.9 2.6M15.7 9.6l3.9-.6c-.4 1.7-1.9 2.7-3.9 2.6"/><path d="M9.6 7.2h4.8c1.1 0 1.9.9 1.8 2l-.5 5.6H8.3l-.5-5.6c-.1-1.1.7-2 1.8-2z"/><rect x="7.1" y="14.8" width="9.8" height="5.2" rx="2.6"/><circle cx="10.4" cy="11.4" r=".35" fill="currentColor"/><circle cx="13.6" cy="11.4" r=".35" fill="currentColor"/><circle cx="10.2" cy="17.4" r=".55"/><circle cx="13.8" cy="17.4" r=".55"/>'),
  dzud: outline('<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9"/><path d="M9.6 4.6 12 6.4l2.4-1.8M9.6 19.4 12 17.6l2.4 1.8M3.9 10.2l2.8.9-.6 2.9M20.1 10.2l-2.8.9.6 2.9"/>'),
};
const SOON = ["crop", "pasture", "dzud"];

/** "Coming soon": the screen softens as while computing, with the name and two words, and clears by itself. */
let soonTimer = 0;
function showSoon(h) {
  $("soon-title").textContent = t("hz_" + h);
  $("soon-text").textContent = t("soon");
  $("soon").classList.add("on");
  clearTimeout(soonTimer);
  soonTimer = setTimeout(hideSoon, 2600);
}
function hideSoon() { clearTimeout(soonTimer); $("soon").classList.remove("on"); }

/** The left panel holds the settings of the computation of the chosen hazard: it shows only once a hazard is chosen, folds
 * away whole and comes back from the settings button on the right or by picking the hazard again. */
function setSide(open) {
  state.sideOpen = open;
  store.set("hw.side", open ? "1" : "0");
  showSide();
  renderRail();
}
function showSide() {
  const shown = state.sideOpen && Boolean(state.hazard);
  $("side").classList.toggle("collapsed", !shown);
  document.body.classList.toggle("side-collapsed", !shown);
}

/** The menu of the button at the top right (borders, satellite image, sources) opens on the right, beside the button. */
function setMenu(open) {
  state.menuOpen = open;
  $("menu").hidden = !open;
  if (open) $("dl-menu").hidden = true;
  renderRail();
}

function renderRail() {
  const button = (html, label, on, extra = "") => {
    const b = el("button", { class: "rbtn " + extra, type: "button", title: label, "aria-label": label, onclick: on });
    b.innerHTML = html;
    return b;
  };
  const draw = state.rect.mode === "draw", results = Boolean(state.hazard);
  $("back").hidden = !results;
  $("rail").replaceChildren(...[
    button(ICON.menu, t(state.menuOpen ? "menu_close" : "rail_menu"), () => setMenu(!state.menuOpen), state.menuOpen ? "on" : ""),
    results && !state.sideOpen && button(ICON.settings, t("rail_settings"), () => setSide(true)),
    results && button(draw ? ICON.draw : ICON.move, t(draw ? "rail_draw" : "rail_move"), () => { state.rect.toggle(); renderRail(); }, draw ? "on" : ""),
    results && button("i", t("rail_method"), () => showMethods(state.hazard)),
    button(ICON.download, t("rail_download"), () => { if (state.menuOpen) setMenu(false); state.downloads.toggle(); }),
    button(ICON.home, t("rail_home"), fitMongolia),
    button(t("lang"), t("lang"), () => { state.lang = state.lang === "mn" ? "en" : "mn"; store.set("hw.lang", state.lang); renderAllText(); }),
  ].filter(Boolean));
}

/** The screen follows the choice: nothing but the image until a hazard is chosen. */
function renderScreen() {
  const results = Boolean(state.hazard);
  document.body.classList.toggle("bare", !results);
  state.rect.setActive(results);
  const dust = state.hazard === "dust"; // the mine tool belongs to dust
  $("mine-box").hidden = !dust;
  if (!dust) $("mine-box").open = false;
  const flood = state.hazard === "flood"; // the detailed flood app belongs to flood
  $("flood-box").hidden = !flood;
  if (!flood) $("flood-box").open = false;
  state.floodBox?.show(flood);
  const fire = state.hazard === "fire"; // and the burned area app to wildfire
  $("fire-box").hidden = !fire;
  if (!fire) $("fire-box").open = false;
  state.fireBox?.show(fire);
  $("dust-box").hidden = !dust; // the dust check sits beside the mine tool
  if (!dust) $("dust-box").open = false;
  state.dustBox?.show(dust);
  showSide();
  applyBorders();
  renderBorders();
  $("t-hazards").textContent = t(results ? "hazards" : "pick_hazard");
  renderMenus();
  renderLegend();
  renderRail();
}

/* -------------------------------------------------- sources */
/* The detailed checks of flood, fire and dust run on this page (js/aoi); each links its Google Earth Engine App, which
 * no longer opens in a window here. */

function renderSources() {
  $("t-sources").textContent = t("sources");
  $("sources").replaceChildren(...SOURCES.map((s) => el("li", {}, el("a", { href: s.url, target: "_blank", rel: "noopener", text: s[state.lang] ?? s.text ?? s.mn }))));
}

function renderAllText() {
  renderStatic(); renderMenus(); renderLegend(); renderRail(); renderSat(); renderSoumList(); renderBorders(); renderDateFold();
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
    state.risk.setFrame(state.mode === "zones" ? frameNow() : null, uFrameNow(), classesNow().map((c) => c.color));
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
  state.dustBox?.refresh(); // its day is the day picker's
  syncSat();
  renderDateFold();
  state.downloads?.refresh();
  if (!state.manifest || !state.hazard) return;
  const my = ++state.dayToken;
  let day = null;
  state.loadError = null;
  try { day = await whileBusy(() => loadDaily(state.manifest, d)); }
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
  state.risk ??= createRiskLayer(state.map, m.grid, state.outline);
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
  // a picked hazard opens the left menu on its detailed check, the settings of the computation
  if (h) {
    setSide(true);
    if ($(`${h}-box`)) { $(`${h}-box`).open = true; $("side").scrollTop = 0; }
  }
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
  if (on) await whileBusy(soumsReady);
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
  setAoi(state.sel.box);
  state.soumLayer.pick(f.id);
  if (fly) state.map.fitBounds(state.soumLayer.bounds(f), { maxZoom: 9, paddingBottomRight: [420, 100] });
  renderSoumList();
  loadSelection();
}

/* ------------------------------------------------------------- selection */
async function loadSelection() {
  const my = ++state.selToken, s = state.sel, m = state.manifest;
  s.long = null; s.months = null; s.high = null; s.longError = false;
  renderSelection();
  if (!m || !s.cells.length) return;
  try {
    const name = state.hazard;
    const [mc, hc] = await whileBusy(() => Promise.all([loadCube(m, "monthly_" + name), loadCube(m, "highdays_" + name)]));
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
  state.panel.render({
    kind: s.kind, label: s.label, hazard: state.hazard, hazardLabel: t(state.hazard), date: state.date,
    day, dayMissing: !fr, long: s.long, months: s.months, longError: s.longError || !m, verification: m?.verification?.[state.hazard],
  });
  state.downloads?.refresh();
}

/** The area of the detailed checks: the last box drawn or soum picked. */
function setAoi(box) { state.aoi = box; state.floodBox?.refresh(); state.fireBox?.refresh(); state.dustBox?.refresh(); }

function onBox(box) {
  state.soumLayer?.pick(null);
  setAoi(box);
  if (!state.manifest) return;
  state.sel = { kind: t("box_label"), label: `${box.s.toFixed(2)}–${box.n.toFixed(2)}°N · ${box.w.toFixed(2)}–${box.e.toFixed(2)}°E`, cells: boxCells(state.manifest.grid, box), box };
  loadSelection();
}

function closeSelection() {
  state.sel = null;
  state.selToken++;
  state.rect.clear();
  setAoi(null);
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
  setSide(true);
  $("mine-box").open = true;
  return state.tools.plumeAt({
    lat, lon, date: state.date, radius: [50, 100, 200].find((r) => r >= halfKm) ?? 200, material: "quartz",
    fit: { paddingTopLeft: [window.innerWidth > 1000 ? 360 : 10, 70], paddingBottomRight: [window.innerWidth > 720 ? 420 : 10, 110] },
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
  state.map.fitBounds([[s, w], [n, e]], { paddingTopLeft: [wide ? 270 : 10, 70], paddingBottomRight: [wide ? 70 : 10, 110] });
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
  state.map.createPane("borderPane").style.zIndex = 420;
  state.map.getPane("borderPane").style.pointerEvents = "none";
  let hintDone = false;
  state.map.on("mousedown zoomstart", () => { if (!hintDone && state.hazard) { hintDone = true; $("hint").classList.add("gone"); } });
}

async function loadOutline() {
  try {
    const res = await fetch("data/mongolia.geojson");
    if (!res.ok) return null;
    const gj = await res.json();
    state.borderData.country = gj;
    return gj;
  } catch { return null; }
}

function wire() {
  $("soum-q").addEventListener("input", (e) => { state.soumQuery = e.target.value; renderSoumList(); });
  $("back").addEventListener("click", () => setHazard(null));
  $("date-fold").addEventListener("click", () => { state.dateFolded = !state.dateFolded; store.set("hw.datefold", state.dateFolded ? "1" : "0"); renderDateFold(); });
  $("mine-box").addEventListener("toggle", (e) => state.tools?.setView(e.target.open ? "mine" : "aimag"));
  $("side-close").addEventListener("click", () => setSide(false));
  $("soon").addEventListener("click", hideSoon);
  window.addEventListener("keydown", (e) => { if (e.key === "Escape") hideSoon(); });
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
  // the menu opens on wide screens unless the user folded it away last time; on narrow screens it waits for the button
  state.sideOpen = window.innerWidth > 1000 && store.get("hw.side") !== "0";
  state.menuOpen = false;
  showSide();
  renderStatic();
  initMap();
  state.rect = initRectDraw(state.map, { onDone: onBox, isBlocked: () => $("dlg").open });
  const resultReady = () => state.downloads?.refresh();
  state.floodBox = initFloodBox({ box: $("flood-app"), map: state.map, t, getBox: () => state.aoi ?? null, geeUrl: FLOOD_APP_URL, onResult: resultReady });
  state.floodBox.render();
  state.fireBox = initFireBox({ box: $("fire-app"), map: state.map, t, getBox: () => state.aoi ?? null, geeUrl: FIRE_APP_URL, onResult: resultReady });
  state.fireBox.render();
  state.dustBox = initDustBox({ box: $("dust-app"), map: state.map, t, getBox: () => state.aoi ?? null, getDay: () => state.date, geeUrl: DUST_APP_URL, onResult: resultReady,
    setDay: async (d) => { state.dateBar.setValue(d); await setDate(state.dateBar.value); } });
  state.dustBox.render();
  state.panel = createStatsPanel($("stats"), { t, classes: classesNow, classLabel, onClose: closeSelection, onMethods: showMethods, onCsv: () => state.downloads.seriesCsv(), onPlume: showPlume });
  state.tools = initTools({ map: state.map, getLang: () => state.lang, requestSat, containers: { poly: el("div"), mine: $("view-mine") }, onMethods: showMethods, busy,
    onWater: (on) => { if (state.borders.water !== on) { state.borders.water = on; applyBorders(); renderBorders(); } },
    campsFor: async (box) => { const a = await loadCamps(); return a ? campsInside(a, box) : null; } });
  state.dateBar = initDateBar($("datebar"), { onChange: setDate, text: t, monthName: (m) => t("months")[m - 1] });
  state.downloads = initDownloads({ box: $("dl-menu"), state, t, frameNow, uFrameNow, classOf, classLabel, classes: classesNow, soumsReady, borders: activeBorders, busy,
    detailLayer: () => ({ flood: state.floodBox, fire: state.fireBox, dust: state.dustBox })[state.hazard]?.layer() ?? null });
  renderSat();
  renderScreen();
  renderDateFold();
  wire();
  state.ready = loadBasics();
  state.dateBar.setRange(FIRST_IMAGERY, utcDate(0));
  const newest = await newestImageDate(GIBS.layers.find((l) => l.key === "truecolor_terra"));
  if (!state.hazard) { state.dateBar.setValue(newest); await setDate(state.dateBar.value); }
  await state.ready;
}

boot();
try { sessionStorage.removeItem("hw.reloaded"); } catch { /* ignore */ }
