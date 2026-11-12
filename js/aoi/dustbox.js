/* The dust check in the side menu: day, the run, the plain conclusion, the numbers and the ground map.
 * The area is the box the user drew (or the soum picked); the method is in js/aoi/dust.js. */
import { el } from "../dom.js";
import { DUST, LAND, computeDust, scaleFor } from "./dust.js";
import { boxAreaKm2 } from "./raster.js";
import { backdrop } from "./backdrop.js";
import { U } from "../ui_text.js";

const COLORS = { bare: [214, 140, 52], sparse: [236, 214, 140], veg: [70, 150, 80], snow: [232, 244, 255], water: [40, 110, 210], cloud: [120, 120, 120] };
const LAYERS = ["bare", "sparse", "veg", "snow", "water", "cloud"];

const fill = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? "");
const pct = (x) => (x === null || x === undefined ? "—" : `${Math.round(100 * x)}%`);
const f1 = (x) => (x === null || x === undefined ? "—" : x.toFixed(1));
const hm = (s) => (s ? s.replace("T", " ") : "—");

/** The day is the site's one day (the day picker): changing it here moves the whole screen, so the area window and this
 * check never speak of different days. */
export function initDustBox({ box, map, t, getBox, getDay, setDay, geeUrl, viewer = null, onResult = () => {} }) {
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
    let drawn = 0;
    for (let i = 0; i < w * h; i++) {
      const k = keys[r.land[i]];
      if (!k || !st.show[k]) continue;
      const c = COLORS[k];
      px[i * 4] = c[0]; px[i * 4 + 1] = c[1]; px[i * 4 + 2] = c[2]; px[i * 4 + 3] = k === "cloud" ? 140 : 215;
      drawn++;
    }
    ctx.putImageData(img, 0, 0);
    st.canvas = cv;
    st.drawn = drawn;
    viewer?.refresh("dust");
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
      openView();
    } catch (e) {
      console.error(e);
      st.error = true;
      st.status = t("fa_err_net") + e.message;
    }
    st.running = false;
    render();
    onResult();
  }

  /** The ground map in its own window, zoomable to single pixels, with the class of each pixel. */
  function openView() {
    const r = st.result;
    if (!r?.land || !viewer) return;
    const keys = [null, "bare", "sparse", "veg", "snow", "water", "cloud"];
    viewer.open({
      owner: "dust", title: `${t("dd_t_dust")} · ${r.day}`, grid: r.grid, picture: () => st.canvas,
      label: (i) => (keys[r.land[i]] ? t("da_l_" + keys[r.land[i]]) : t("dd_c_nodata")),
      empty: () => {
        if (st.drawn) return null;
        const n = new Array(keys.length).fill(0);
        for (const v of r.land) n[v]++;
        const top = keys.map((k, v) => [k, n[v]]).filter(([k, c]) => k && c && !st.show[k]).sort((a, b) => b[1] - a[1])[0];
        return top ? t("av_empty").replace("{c}", t("da_l_" + top[0])) : t("dd_c_nodata");
      },
      backdrop: () => { const d = [...r.dates].sort(); return backdrop(r.grid, d[0], d[d.length - 1]); },
    });
  }

  /** The result for the GIS downloads (js/aoi/files.js): ground classes, the conclusion and what is known of the error.
   * Without a clear Sentinel-2 image there is no ground map, so there is nothing to download. */
  function layer() {
    const r = st.result;
    if (!r?.land) return null;
    const g = r.grid, w = r.wind, sh = r.shares, en = (k) => U.en[k] ?? k, lineList = lines(r);
    const head = fill(t("da_v_" + r.verdict.key), { n: w?.onset ?? 0, m: f1(w?.maxWind), bare: pct(sh?.share?.[LAND.bare]) });
    const why = r.verdict.why.map((k) => t("da_why_" + k)).join(" ");
    const cloud = sh ? Math.max(0, 1 - sh.seenShare) : null;
    return {
      hazard: "dust", stamp: r.day.replaceAll("-", ""), title: t("dd_t_dust"), titleEn: en("dd_t_dust"),
      period: fill(t("dd_p_dust"), { d: r.day, i: r.dates.join(", ") }), periodShort: r.day,
      grid: g, scale: r.scale, km2: r.km2, box: { s: g.north - g.h * g.dy, n: g.north, w: g.west, e: g.west + g.w * g.dx },
      codes: r.land, noData: LAND.none, missing: [LAND.none, LAND.cloud], noDataNote: t("dd_nd_dust"),
      classes: [[LAND.none, "none", "dd_c_nodata", [0, 0, 0], false], ...LAYERS.map((k) => [LAND[k], k, "da_l_" + k, COLORS[k], true])]
        .map(([code, key, label, color, on]) => ({ code, key, mn: t(label), en: en(label), color, vector: on, paint: on })),
      bands: [],
      meta: { day: r.day, image_dates: r.dates.join(" "), verdict: r.verdict.key, bare_pct: sh ? Math.round(100 * sh.share[LAND.bare]) : null, seen_pct: sh ? Math.round(100 * sh.seenShare) : null,
        wind_hours_over_6: w?.onset ?? null, max_wind_m_s: w?.maxWind ?? null, max_gust_m_s: w?.maxGust ?? null, rain_mm: w?.rainMm ?? null, cams_dust_max_ug_m3: w?.cams ? Math.round(w.cams.max) : null,
        weather: r.weatherSource === "era5" ? "ERA5 (ECMWF) via Open-Meteo" : "Open-Meteo forecast", source: "Microsoft Planetary Computer: Sentinel-2 L2A; Open-Meteo" },
      summaryEn: `Mongolia Hazard Watch: dust check of ${r.day}. Conclusion: ${r.verdict.key}. Bare ground ${sh ? Math.round(100 * sh.share[LAND.bare]) : "?"}% of the part seen, wind above 6 m/s for ${w?.onset ?? "?"} hours, up to ${w?.maxWind?.toFixed(1) ?? "?"} m/s. Conditions for dust, not observed dust. Pixel ${r.scale} m. Not an official warning.`,
      summaryHere: head, lines: lineList, verdict: [head, why].filter(Boolean).join(" "),
      error: [t("dd_e_dust_test"), t("dd_e_dust_pts"), ...(cloud !== null && cloud > 0.005 ? [fill(t("dd_e_cloud"), { a: (cloud * r.km2).toFixed(2), p: Math.round(100 * cloud) })] : []), fill(t("dd_e_px"), { s: r.scale })],
      warn: t("da_warn"), method: t("dd_m_dust"), src: t("da_src"),
      creditsEn: "Microsoft Planetary Computer; Copernicus Sentinel-2 (ESA); Open-Meteo (ECMWF IFS, ERA5, CAMS). Copyright holders of the source data keep their rights.",
    };
  }

  function render() {
    const r = st.result, day = getDay();
    box.replaceChildren(...[
      el("p", { class: "note", text: t("da_note") }),
      el("p", { class: "aoi-area", text: areaLine() }),
      el("div", { class: "aoi-dates one" }, el("span", { text: t("da_day") }),
        el("input", { class: "field", type: "date", value: day, min: "2016-01-01", max: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10), onchange: (e) => { if (e.target.value) setDay(e.target.value); } })),
      el("button", { class: "btn aoi-run", type: "button", text: t("fa_run"), disabled: st.running, onclick: run }),
      st.status && el("p", { class: "aoi-status" + (st.error ? " err" : ""), role: "status", text: st.status }),
      ...(r ? conclusion(r) : []),
      r && el("ul", { class: "aoi-lines" }, ...lines(r).map((l) => el("li", { text: l }))),
      r?.land && el("div", { class: "aoi-legend" }, ...LAYERS.map((k) => el("label", { class: "check" },
        el("input", { type: "checkbox", checked: st.show[k], onchange: (e) => { st.show[k] = e.target.checked; paint(); } }),
        el("i", { style: `background:rgb(${COLORS[k].join(",")})` }), el("span", { text: t("da_l_" + k) })))),
      r?.land && el("div", { class: "btnrow" }, el("button", { class: "btn", type: "button", text: t("av_open"), onclick: openView })),
      el("p", { class: "note", text: t("da_warn") }),
      el("p", { class: "note" }, el("a", { href: geeUrl, target: "_blank", rel: "noopener", text: t("da_gee") })),
      el("p", { class: "note small", text: t("da_src") }),
    ].filter(Boolean));
  }

  return {
    render,
    layer,
    hasResult: () => Boolean(st.result?.land),
    openView,
    refresh() { if (!st.running) render(); },
    show(on) { if (on) { if (!st.overlay && st.result) paint(); } else { st.overlay?.remove(); st.overlay = null; viewer?.closeIf("dust"); } },
  };
}
