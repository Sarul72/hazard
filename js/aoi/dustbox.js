/* The dust check in the side menu: day, the run, the plain conclusion, the numbers and the ground map.
 * The area is the box the user drew (or the soum picked); the method is in js/aoi/dust.js. */
import { el } from "../dom.js";
import { DUST, LAND, computeDust, scaleFor } from "./dust.js";
import { boxAreaKm2 } from "./raster.js";

const EXAMPLE = { box: { s: 43.0, n: 44.0, w: 104.0, e: 105.0 }, day: "2023-04-10" };
const COLORS = { bare: [214, 140, 52], sparse: [236, 214, 140], veg: [70, 150, 80], snow: [232, 244, 255], water: [40, 110, 210], cloud: [120, 120, 120] };
const LAYERS = ["bare", "sparse", "veg", "snow", "water", "cloud"];

const fill = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? "");
const pct = (x) => (x === null || x === undefined ? "—" : `${Math.round(100 * x)}%`);
const f1 = (x) => (x === null || x === undefined ? "—" : x.toFixed(1));
const hm = (s) => (s ? s.replace("T", " ") : "—");

/** The day is the site's one day (the day picker): changing it here moves the whole screen, so the area window and this
 * check never speak of different days. */
export function initDustBox({ box, map, t, getBox, getDay, setDay, selectBox, geeUrl }) {
  const pane = map.getPane("aoiPane") ?? map.createPane("aoiPane");
  pane.style.zIndex = 415;
  pane.style.pointerEvents = "none";
  const st = { running: false, status: "", error: false, result: null, overlay: null, show: { bare: true, sparse: true, veg: false, snow: true, water: true, cloud: false } };

  function areaLine() {
    const b = getBox();
    if (!b) return t("fa_area_none");
    const a = boxAreaKm2(b);
    if (a > DUST.hardKm2) return fill(t("da_area_big"), { a: Math.round(a) });
    return fill(t("fa_area"), { a: a < 10 ? a.toFixed(1) : Math.round(a), s: scaleFor(a) });
  }

  function lines(r) {
    const out = [], w = r.wind, sh = r.shares;
    if (sh) out.push(fill(t("da_r_ground"), { d: r.dates.join(", "), seen: pct(sh.seenShare), bare: pct(sh.share[LAND.bare]), sparse: pct(sh.share[LAND.sparse]), veg: pct(sh.share[LAND.veg]), snow: pct(sh.share[LAND.snow]) }));
    else out.push(t("da_r_noground"));
    if (w) {
      out.push(fill(t("da_r_wind"), { a: hm(w.from), b: hm(w.to), n: w.onset, s: w.strong, x: w.severe, m: f1(w.maxWind), at: hm(w.maxWindTime), g: f1(w.maxGust) }));
      out.push(fill(t("da_r_wet"), { mm: f1(w.rainMm), days: w.wetDays.length ? w.wetDays.join(", ") : t("da_none"), snow: Math.round((w.snowM ?? 0) * 100), soil: w.soil === null ? "—" : w.soil.toFixed(2) }));
      out.push(w.cams ? fill(t("da_r_cams"), { v: Math.round(w.cams.max), at: hm(w.cams.time), who: DUST.who }) : t("da_r_nocams"));
      out.push(fill(t("da_r_src"), { s: t(r.weatherSource === "era5" ? "da_src_era5" : "da_src_fc") }));
    } else out.push(t("da_r_noweather") + (r.weatherError ? ` (${r.weatherError})` : ""));
    out.push(fill(t("da_r_grid"), { d: r.day, a: Math.round(r.km2), s: r.scale }));
    return out;
  }

  function conclusion(r) {
    const v = r.verdict, w = r.wind, bare = pct(r.shares?.share?.[LAND.bare]);
    const why = v.why.map((k) => t("da_why_" + k)).join(" ");
    const head = fill(t("da_v_" + v.key), { n: w?.onset ?? 0, m: f1(w?.maxWind), bare });
    return [el("p", { class: "aoi-verdict v-" + v.key, text: head }), why && el("p", { class: "note", text: why }), v.camsHigh && el("p", { class: "note", text: fill(t("da_cams_high"), { v: Math.round(w.cams.max), who: DUST.who }) })].filter(Boolean);
  }

  function paint() {
    st.overlay?.remove();
    st.overlay = null;
    const r = st.result;
    if (!r?.land) return;
    const { w, h } = r.grid, cv = document.createElement("canvas");
    cv.width = w; cv.height = h;
    const ctx = cv.getContext("2d"), img = ctx.createImageData(w, h), px = img.data;
    const keys = [null, "bare", "sparse", "veg", "snow", "water", "cloud"];
    for (let i = 0; i < w * h; i++) {
      const k = keys[r.land[i]];
      if (!k || !st.show[k]) continue;
      const c = COLORS[k];
      px[i * 4] = c[0]; px[i * 4 + 1] = c[1]; px[i * 4 + 2] = c[2]; px[i * 4 + 3] = k === "cloud" ? 140 : 215;
    }
    ctx.putImageData(img, 0, 0);
    const g = r.grid;
    st.overlay = window.L.imageOverlay(cv.toDataURL(), [[g.north - g.h * g.dy, g.west], [g.north, g.west + g.w * g.dx]], { pane: "aoiPane", className: "aoi-img", interactive: false }).addTo(map);
  }

  async function run() {
    const b = getBox(), day = getDay();
    if (!b) { st.error = true; st.status = t("fa_err_box"); render(); return; }
    if (boxAreaKm2(b) > DUST.hardKm2) { st.error = true; st.status = areaLine(); render(); return; }
    st.running = true; st.error = false; st.result = null; paint();
    const t0 = performance.now();
    try {
      st.result = await computeDust({ box: b, day, step: (k) => { st.status = t("da_step_" + k); render(); } });
      st.status = fill(t("fa_done"), { s: Math.round((performance.now() - t0) / 1000) });
      paint();
    } catch (e) {
      console.error(e);
      st.error = true;
      st.status = t("fa_err_net") + e.message;
    }
    st.running = false;
    render();
  }

  function render() {
    const r = st.result, day = getDay();
    box.replaceChildren(...[
      el("p", { class: "note", text: t("da_note") }),
      el("p", { class: "aoi-area", text: areaLine() }),
      el("div", { class: "btnrow" }, el("button", { class: "btn", type: "button", text: t("da_example"), onclick: async () => { await setDay(EXAMPLE.day); selectBox(EXAMPLE.box); render(); } })),
      el("div", { class: "aoi-dates one" }, el("span", { text: t("da_day") }),
        el("input", { class: "field", type: "date", value: day, min: "2016-01-01", max: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10), onchange: (e) => { if (e.target.value) setDay(e.target.value); } })),
      el("button", { class: "btn aoi-run", type: "button", text: t("fa_run"), disabled: st.running, onclick: run }),
      st.status && el("p", { class: "aoi-status" + (st.error ? " err" : ""), role: "status", text: st.status }),
      ...(r ? conclusion(r) : []),
      r && el("ul", { class: "aoi-lines" }, ...lines(r).map((l) => el("li", { text: l }))),
      r?.land && el("div", { class: "aoi-legend" }, ...LAYERS.map((k) => el("label", { class: "check" },
        el("input", { type: "checkbox", checked: st.show[k], onchange: (e) => { st.show[k] = e.target.checked; paint(); } }),
        el("i", { style: `background:rgb(${COLORS[k].join(",")})` }), el("span", { text: t("da_l_" + k) })))),
      el("p", { class: "note", text: t("da_warn") }),
      el("p", { class: "note" }, el("a", { href: geeUrl, target: "_blank", rel: "noopener", text: t("da_gee") })),
      el("p", { class: "note small", text: t("da_src") }),
    ].filter(Boolean));
  }

  return {
    render,
    refresh() { if (!st.running) render(); },
    show(on) { if (on) { if (!st.overlay && st.result) paint(); } else { st.overlay?.remove(); st.overlay = null; } },
  };
}
