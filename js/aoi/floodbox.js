/* The detailed flood check in the side menu: dates, threshold, the run, the numbers and the layer on the map.
 * The area is the box the user drew (or the soum picked); the method is in js/aoi/flood.js. */
import { el } from "../dom.js";
import { CODE, FLOOD, computeFlood, scaleFor } from "./flood.js";
import { boxAreaKm2 } from "./raster.js";
import { geoTiff } from "../formats.js";
import { save } from "../export.js";
import { U } from "../ui_text.js";

const COLORS = { confirmed: [0, 166, 81], rural: [0, 229, 255], city: [255, 153, 0], permanent: [31, 59, 138], s2: [255, 235, 59] };
const LAYERS = ["confirmed", "rural", "city", "permanent", "s2"];

const iso = (d) => d.toISOString().slice(0, 10);
const ago = (n) => iso(new Date(Date.now() - n * 86400000));
const fill = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? "");
const km = (x) => (x === null || x === undefined ? "—" : x.toFixed(2));
const pct = (a, b) => (b > 0 ? Math.round(100 * a / b) + "%" : "—");
const utc = (ms) => new Date(ms).toISOString().slice(0, 16).replace("T", " ");

export function initFloodBox({ box, map, t, getBox, geeUrl, onResult = () => {} }) {
  const pane = map.createPane("aoiPane");
  pane.style.zIndex = 415;
  pane.style.pointerEvents = "none";
  const st = {
    before: [ago(40), ago(16)], after: [ago(15), ago(1)], threshold: FLOOD.threshold,
    running: false, status: "", error: false, result: null, overlay: null, show: { confirmed: true, rural: true, city: true, permanent: true, s2: false },
  };

  const dateRow = (label, pair) => el("div", { class: "aoi-dates" }, el("span", { text: label }),
    ...[0, 1].map((k) => el("input", { class: "field", type: "date", value: pair[k], min: "2014-10-01", max: iso(new Date()), onchange: (e) => { pair[k] = e.target.value; } })));

  function areaLine() {
    const b = getBox();
    if (!b) return t("fa_area_none");
    const a = boxAreaKm2(b);
    if (a > FLOOD.hardKm2) return fill(t("fa_area_big"), { a: Math.round(a) });
    return fill(t("fa_area"), { a: a < 10 ? a.toFixed(1) : Math.round(a), s: scaleFor(a) });
  }

  function lines(r) {
    const out = [
      fill(t("fa_r_radar"), { o: r.radar.orbit, p: t(r.radar.pass === "ascending" ? "fa_asc" : "fa_desc"), b: utc(r.radar.before), a: utc(r.radar.after) }),
      fill(t("fa_r_rural"), { v: km(r.sums.rural) }),
      fill(t("fa_r_city"), { v: km(r.sums.city) }),
    ];
    if (r.optical) {
      out.push(fill(t("fa_r_s2"), { d: r.optical.date, p: Math.round(100 * r.optical.share), v: km(r.sums.optical) }));
      out.push(fill(t("fa_r_conf"), { v: pct(r.sums.both, r.sums.seen) }));
      out.push(fill(t("fa_r_det"), { v: pct(r.sums.both, r.sums.optical) }));
      if (r.optical.share < 0.5) out.push(t("fa_r_cloudy"));
    } else out.push(t("fa_r_nos2"));
    out.push(fill(t("fa_r_grid"), { a: Math.round(r.km2), s: r.scale, th: r.threshold.toFixed(2) }));
    return out;
  }

  function paint() {
    st.overlay?.remove();
    st.overlay = null;
    const r = st.result;
    if (!r) return;
    const { w, h } = r.grid, cv = document.createElement("canvas");
    cv.width = w; cv.height = h;
    const ctx = cv.getContext("2d"), img = ctx.createImageData(w, h), px = img.data;
    const put = (i, c) => { px[i * 4] = c[0]; px[i * 4 + 1] = c[1]; px[i * 4 + 2] = c[2]; px[i * 4 + 3] = 235; };
    for (let i = 0; i < w * h; i++) {
      const c = r.code[i];
      if (c === CODE.confirmed && st.show.confirmed) put(i, COLORS.confirmed);
      else if ((c === CODE.rural || c === CODE.confirmed) && st.show.rural) put(i, COLORS.rural);
      else if (c === CODE.city && st.show.city) put(i, COLORS.city);
      else if (r.s2water?.[i] && st.show.s2) put(i, COLORS.s2);
      else if (r.permanent[i] && st.show.permanent) put(i, COLORS.permanent);
    }
    ctx.putImageData(img, 0, 0);
    const g = r.grid, bounds = [[g.north - g.h * g.dy, g.west], [g.north, g.west + g.w * g.dx]];
    st.overlay = window.L.imageOverlay(cv.toDataURL(), bounds, { pane: "aoiPane", className: "aoi-img", interactive: false }).addTo(map);
  }

  function download() {
    const r = st.result, g = r.grid;
    const bytes = geoTiff({ w: g.w, h: g.h, bands: [Float32Array.from(r.code)], west: g.west, north: g.north, dx: g.dx, dy: g.dy, names: ["flood"],
      description: t("fa_download"), meta: { radar_before: utc(r.radar.before), radar_after: utc(r.radar.after), threshold: r.threshold, scale_m: r.scale, source: "Microsoft Planetary Computer: Sentinel-1 RTC, Sentinel-2 L2A, JRC GSW 1.3, ESA WorldCover 2021, Copernicus DEM GLO-30" } });
    save(new Blob([bytes], { type: "image/tiff" }), `mongolia_flood_${iso(new Date(r.radar.after))}.tif`);
  }

  async function run() {
    const b = getBox();
    if (!b) { st.error = true; st.status = t("fa_err_box"); render(); return; }
    if (!(st.before[0] <= st.before[1] && st.before[1] < st.after[0] && st.after[0] <= st.after[1])) { st.error = true; st.status = t("fa_err_dates"); render(); return; }
    if (boxAreaKm2(b) > FLOOD.hardKm2) { st.error = true; st.status = areaLine(); render(); return; }
    st.running = true; st.error = false; st.result = null; paint();
    const t0 = performance.now();
    try {
      const r = await computeFlood({ box: b, before: st.before, after: st.after, threshold: st.threshold, step: (k) => { st.status = t("fa_step_" + k); render(); } });
      st.result = { ...r, threshold: st.threshold };
      st.status = fill(t("fa_done"), { s: Math.round((performance.now() - t0) / 1000) });
      paint();
    } catch (e) {
      console.error(e);
      st.error = true;
      st.status = e.message === "no_radar" ? t("fa_err_radar") : t("fa_err_net") + e.message;
    }
    st.running = false;
    render();
    onResult();
  }

  /** The result for the GIS downloads (js/aoi/files.js): classes, values and what is known of the error. */
  function layer() {
    const r = st.result;
    if (!r) return null;
    const g = r.grid, n = g.w * g.h, codes = new Uint8Array(n), en = (k) => U.en[k] ?? k;
    for (let i = 0; i < n; i++) codes[i] = r.code[i] || (r.permanent[i] ? 4 : 0);
    const b = utc(r.radar.before), a = utc(r.radar.after), flood = r.sums.rural + r.sums.city;
    const conf = r.optical && r.sums.seen > 0 ? Math.round(100 * r.sums.both / r.sums.seen) : null;
    const cls = (code, key, label, color, vector = true) => ({ code, key, mn: t(label), en: en(label), color, vector, paint: vector });
    const lineList = lines(r);
    return {
      hazard: "flood", stamp: b.slice(0, 10).replaceAll("-", "") + "_" + a.slice(0, 10).replaceAll("-", ""),
      title: t("dd_t_flood"), titleEn: en("dd_t_flood"),
      period: fill(t("dd_p_flood"), { b, a }), periodShort: `${b.slice(0, 10)}_${a.slice(0, 10)}`,
      grid: g, scale: r.scale, km2: r.km2, box: { s: g.north - g.h * g.dy, n: g.north, w: g.west, e: g.west + g.w * g.dx },
      codes, noData: 0, missing: [], noDataNote: t("dd_nd_flood"),
      classes: [cls(0, "none", "dd_c_none", [0, 0, 0], false), cls(1, "radar", "fa_l_rural", COLORS.rural), cls(2, "town", "fa_l_city", COLORS.city), cls(3, "confirmed", "fa_l_confirmed", COLORS.confirmed), cls(4, "permanent", "fa_l_permanent", COLORS.permanent)],
      bands: [
        { name: "permanent_water", about: t("dd_b_perm"), data: Float32Array.from(r.permanent) },
        ...(r.s2water ? [{ name: "s2_new_water", about: t("dd_b_s2"), data: Float32Array.from(r.s2water, (v, i) => (r.s2clear[i] ? v : -9999)) }] : []),
      ],
      meta: { radar_before_utc: b, radar_after_utc: a, orbit: r.radar.orbit, pass: r.radar.pass, threshold: r.threshold, optical_date: r.optical?.date ?? null,
        flood_km2: +flood.toFixed(4), flood_town_km2: +r.sums.city.toFixed(4), confirmed_pct: conf, source: "Microsoft Planetary Computer: Sentinel-1 RTC, Sentinel-2 L2A, JRC GSW 1.3, ESA WorldCover 2021, Copernicus DEM GLO-30" },
      summaryEn: `Mongolia Hazard Watch: flood detailed check, radar ${b} to ${a} UTC. Radar flood ${flood.toFixed(2)} km2 (${r.sums.city.toFixed(2)} km2 in towns)${conf === null ? ", no clear Sentinel-2 image to confirm it" : `, ${conf}% of it confirmed by Sentinel-2 where clear`}. Pixel ${r.scale} m, threshold ${r.threshold.toFixed(2)}. Not an official warning.`,
      summaryHere: lineList.join(" "), lines: lineList, verdict: null,
      error: [t("dd_e_flood_app"), t("dd_e_flood_s2"), conf === null ? t("dd_e_flood_nos2") : fill(t("dd_e_flood_now"), { c: conf }), fill(t("dd_e_px"), { s: r.scale })],
      warn: t("fa_warn"), method: fill(t("dd_m_flood"), { th: r.threshold.toFixed(2) }), src: t("fa_src"),
      creditsEn: "Microsoft Planetary Computer; Copernicus Sentinel-1 and Sentinel-2 (ESA); JRC Global Surface Water; ESA WorldCover; Copernicus DEM. Copyright holders of the source data keep their rights.",
    };
  }

  function render() {
    const r = st.result;
    box.replaceChildren(...[
      el("p", { class: "note", text: t("flood_app_note") }),
      el("p", { class: "aoi-area", text: areaLine() }),
      dateRow(t("fa_before"), st.before),
      dateRow(t("fa_after"), st.after),
      el("label", { class: "aoi-th" }, el("span", { text: `${t("fa_threshold")}: ${st.threshold.toFixed(2)}` }),
        el("input", { type: "range", min: "1.10", max: "1.40", step: "0.05", value: String(st.threshold), oninput: (e) => { st.threshold = Number(e.target.value); e.target.previousSibling.textContent = `${t("fa_threshold")}: ${st.threshold.toFixed(2)}`; } })),
      el("p", { class: "note", text: t("fa_threshold_note") }),
      el("button", { class: "btn aoi-run", type: "button", text: t("fa_run"), disabled: st.running, onclick: run }),
      st.status && el("p", { class: "aoi-status" + (st.error ? " err" : ""), role: "status", text: st.status }),
      r && el("ul", { class: "aoi-lines" }, ...lines(r).map((l) => el("li", { text: l }))),
      r && el("div", { class: "aoi-legend" }, ...LAYERS.filter((k) => k !== "s2" || r.s2water).map((k) => el("label", { class: "check" },
        el("input", { type: "checkbox", checked: st.show[k], onchange: (e) => { st.show[k] = e.target.checked; paint(); } }),
        el("i", { style: `background:rgb(${COLORS[k].join(",")})` }), el("span", { text: t("fa_l_" + k) })))),
      r && el("div", { class: "btnrow" }, el("button", { class: "btn", type: "button", text: t("fa_download_btn"), onclick: download })),
      el("p", { class: "note", text: t("fa_warn") }),
      el("p", { class: "note" }, el("a", { href: geeUrl, target: "_blank", rel: "noopener", text: t("fa_gee") })),
      el("p", { class: "note small", text: t("fa_src") }),
    ].filter(Boolean));
  }

  return {
    render,
    layer,
    /** The box changed: the area line follows; an old result stays until a new run. */
    refresh() { if (!st.running) render(); },
    /** Leaving the flood view hides the layer; coming back shows it again. */
    show(on) { if (on) { if (!st.overlay && st.result) paint(); } else { st.overlay?.remove(); st.overlay = null; } },
  };
}
