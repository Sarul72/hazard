/* The burned area check in the side menu: dates, the spring option, the run, the numbers, the severity map with the
 * MODIS burned edge and active fires, and the download. The method is in js/aoi/fire.js. */
import { el } from "../dom.js";
import { CLASSES, FIRE, computeFire, scaleFor } from "./fire.js";
import { boxAreaKm2 } from "./raster.js";
import { backdrop } from "./backdrop.js";
import { geoTiff } from "../formats.js";
import { save } from "../export.js";
import { U } from "../ui_text.js";

const MODIS = [0, 80, 255], FIRE_PX = [255, 0, 0];

const fill = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? "");
const km = (x) => (x === null || x === undefined ? "—" : x.toFixed(2));
const pct = (a, b) => (b > 0 ? Math.round(100 * a / b) + "%" : "—");
const iso = (d) => d.toISOString().slice(0, 10);
const ago = (n) => iso(new Date(Date.now() - n * 86400000));

export function initFireBox({ box, map, t, getBox, geeUrl, viewer = null, onResult = () => {} }) {
  const pane = map.getPane("aoiPane") ?? map.createPane("aoiPane");
  pane.style.zIndex = 415;
  pane.style.pointerEvents = "none";
  const st = {
    before: [ago(45), ago(20)], after: [ago(18), ago(1)], autumn: true, running: false, status: "", error: false, result: null, overlay: null,
    show: { burned: true, other: false, modis: true, fire: true },
  };

  const dateRow = (label, pair) => el("div", { class: "aoi-dates" }, el("span", { text: label }),
    ...[0, 1].map((k) => el("input", { class: "field", type: "date", value: pair[k], min: "2017-03-28", max: iso(new Date()), onchange: (e) => { pair[k] = e.target.value; } })));

  function areaLine() {
    const b = getBox();
    if (!b) return t("fa_area_none");
    const a = boxAreaKm2(b);
    if (a > FIRE.hardKm2) return fill(t("fa_area_big"), { a: Math.round(a) });
    return fill(t("fa_area"), { a: a < 10 ? a.toFixed(1) : Math.round(a), s: scaleFor(a) });
  }

  function lines(r) {
    const s = r.sums, p = r.periods, out = [
      fill(t("fi_r_images"), { a: r.images.pre, au: r.images.preUsed, b0: p.before[0], b1: p.before[1], p: r.images.post, pu: r.images.postUsed, a0: p.after[0], a1: p.after[1] }),
      fill(t("fi_r_burned"), { v: km(s.burned), th: FIRE.burned, seen: Math.round(s.seen), all: Math.round(r.km2) }),
      fill(t("fi_r_modis"), { v: km(s.modis), c: pct(s.both, s.burned), d: pct(s.both, s.modis) }),
      fill(t("fi_r_fire"), { v: km(s.fire) }),
    ];
    for (let k = 3; k < CLASSES.length; k++) out.push(`  ${t("fi_c_" + CLASSES[k].key)}: ${km(s.classes[k])} км²`);
    if (s.seen < 0.5 * r.km2) out.push(t("fi_r_cloudy"));
    if (p.spring) out.push(fill(t("fi_r_spring"), { a: p.before[0], b: p.before[1] }));
    out.push(fill(t("da_r_grid"), { d: `${p.after[0]} – ${p.after[1]}`, a: Math.round(r.km2), s: r.scale }));
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
    let drawn = 0;
    const put = (i, c, a = 230) => { px[i * 4] = c[0]; px[i * 4 + 1] = c[1]; px[i * 4 + 2] = c[2]; px[i * 4 + 3] = a; drawn++; };
    for (let i = 0; i < w * h; i++) {
      const k = r.severity[i];
      if (k === 255) continue;
      if (k >= 3 ? st.show.burned : st.show.other) put(i, CLASSES[k].color, k >= 3 ? 230 : 150);
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (st.show.fire && r.fire[i]) put(i, FIRE_PX, 255);
      // MODIS burned area as an edge: on where a neighbour is off
      if (st.show.modis && r.modis[i] && ((x > 0 && !r.modis[i - 1]) || (x < w - 1 && !r.modis[i + 1]) || (y > 0 && !r.modis[i - w]) || (y < h - 1 && !r.modis[i + w]))) put(i, MODIS, 255);
    }
    ctx.putImageData(img, 0, 0);
    st.canvas = cv;
    st.drawn = drawn;
    viewer?.refresh("fire");
    const g = r.grid;
    st.overlay = window.L.imageOverlay(cv.toDataURL(), [[g.north - g.h * g.dy, g.west], [g.north, g.west + g.w * g.dx]], { pane: "aoiPane", className: "aoi-img", interactive: false }).addTo(map);
  }

  function download() {
    const r = st.result, g = r.grid;
    const bytes = geoTiff({ w: g.w, h: g.h, bands: [Float32Array.from(r.severity, (v) => (v === 255 ? -9999 : v)), Float32Array.from(r.dnbr, (v) => (Number.isNaN(v) ? -9999 : v))], west: g.west, north: g.north, dx: g.dx, dy: g.dy,
      names: ["severity", "dnbr"], description: t("fi_download"), meta: { pre: r.periods.before.join("/"), post: r.periods.after.join("/"), burned_from: FIRE.burned, scale_m: r.scale, source: "Copernicus Sentinel-2 L2A, MODIS MCD64A1 and MOD14A1/MYD14A1 via Microsoft Planetary Computer" } });
    save(new Blob([bytes], { type: "image/tiff" }), `mongolia_fire_${r.periods.after[0]}.tif`);
  }

  async function run() {
    const b = getBox();
    if (!b) { st.error = true; st.status = t("fa_err_box"); render(); return; }
    if (!(st.before[0] <= st.before[1] && st.before[1] < st.after[0] && st.after[0] <= st.after[1])) { st.error = true; st.status = t("fi_err_dates"); render(); return; }
    if (boxAreaKm2(b) > FIRE.hardKm2) { st.error = true; st.status = areaLine(); render(); return; }
    st.running = true; st.error = false; st.result = null; paint();
    const t0 = performance.now();
    try {
      st.result = await computeFire({ box: b, before: st.before, after: st.after, autumn: st.autumn, step: (k) => { st.status = t("fi_step_" + k); render(); } });
      st.status = fill(t("fa_done"), { s: Math.round((performance.now() - t0) / 1000) });
      paint();
      openView();
    } catch (e) {
      console.error(e);
      st.error = true;
      st.status = e.message === "no_images" ? fill(t("fi_err_images"), { a: e.pre, b: e.post }) : e.message === "no_clear" ? t("fi_err_clear") : t("fa_err_net") + e.message;
    }
    st.running = false;
    render();
    onResult();
  }

  /** The result in its own window, zoomable to single pixels, with what each pixel holds. */
  function openView() {
    const r = st.result;
    if (!r || !viewer) return;
    viewer.open({
      owner: "fire", title: `${t("dd_t_fire")} · ${r.periods.after[0]} – ${r.periods.after[1]}`, grid: r.grid, picture: () => st.canvas,
      label: (i) => {
        const k = r.severity[i], parts = [k === 255 ? t("av_cloud") : `${t("fi_c_" + CLASSES[k].key)} (dNBR ${r.dnbr[i].toFixed(2)})`];
        if (r.modis[i]) parts.push(t("av_modis"));
        if (r.fire[i]) parts.push(t("fi_l_fire"));
        return parts.join(" · ");
      },
      empty: () => {
        if (st.drawn) return null;
        let burned = 0, other = 0;
        for (const k of r.severity) { if (k === 255) continue; if (k >= 3) burned++; else other++; }
        if (!burned && !other) return t("av_none_fire");
        const top = [["burned", burned], ["other", other]].filter(([key, v]) => v && !st.show[key]).sort((a, b) => b[1] - a[1])[0];
        return top ? t("av_empty").replace("{c}", t("fi_l_" + top[0])) : null;
      },
      backdrop: () => backdrop(r.grid, r.periods.after[0], r.periods.after[1]),
    });
  }

  /** The result for the GIS downloads (js/aoi/files.js): severity classes, dNBR and MODIS, and what is known of the error. */
  function layer() {
    const r = st.result;
    if (!r) return null;
    const g = r.grid, p = r.periods, s = r.sums, en = (k) => U.en[k] ?? k, lineList = lines(r);
    const inMod = s.burned > 0 ? Math.round(100 * s.both / s.burned) : null, cloud = Math.max(0, r.km2 - s.seen);
    return {
      hazard: "fire", stamp: p.after[0].replaceAll("-", "") + "_" + p.after[1].replaceAll("-", ""),
      title: t("dd_t_fire"), titleEn: en("dd_t_fire"),
      period: fill(t("dd_p_fire"), { b0: p.before[0], b1: p.before[1], a0: p.after[0], a1: p.after[1] }), periodShort: `${p.after[0]}_${p.after[1]}`,
      grid: g, scale: r.scale, km2: r.km2, box: { s: g.north - g.h * g.dy, n: g.north, w: g.west, e: g.west + g.w * g.dx },
      codes: r.severity, noData: 255, missing: [255], noDataNote: t("dd_nd_fire"),
      classes: CLASSES.map((c, k) => ({ code: k, key: c.key, mn: t("fi_c_" + c.key), en: en("fi_c_" + c.key), color: c.color, vector: k >= 3, paint: k !== 2 })),
      bands: [
        { name: "dNBR", about: t("dd_b_dnbr"), data: Float32Array.from(r.dnbr, (v) => (Number.isNaN(v) ? -9999 : v)) },
        { name: "modis_burned", about: t("dd_b_modis"), data: Float32Array.from(r.modis) },
        { name: "modis_active_fire", about: t("dd_b_fire"), data: Float32Array.from(r.fire) },
      ],
      meta: { pre_fire: p.before.join("/"), post_fire: p.after.join("/"), spring_autumn_baseline: p.spring ? "yes" : "no", compare_from: p.compareFrom, burned_from_dNBR: FIRE.burned,
        burned_km2: +s.burned.toFixed(4), modis_burned_km2: +s.modis.toFixed(4), burned_inside_modis_pct: inMod, cloud_km2: +cloud.toFixed(4),
        source: "Microsoft Planetary Computer: Sentinel-2 L2A, MODIS MCD64A1 and MOD14A1/MYD14A1 (collection 6.1)" },
      summaryEn: `Mongolia Hazard Watch: burned area check, pre-fire ${p.before.join(" to ")}, post-fire ${p.after.join(" to ")}. Burned ${s.burned.toFixed(2)} km2 (dNBR >= ${FIRE.burned}); MODIS burned area ${s.modis.toFixed(2)} km2${inMod === null ? "" : `, ${inMod}% of the Sentinel-2 burn inside it`}. Pixel ${r.scale} m. Not an official warning.`,
      summaryHere: lineList.join(" "), lines: lineList, verdict: null,
      error: [t("dd_e_fire_app"), inMod === null ? t("dd_e_fire_none") : fill(t("dd_e_fire_now"), { c: inMod }), ...(cloud > 0.005 * r.km2 ? [fill(t("dd_e_cloud"), { a: cloud.toFixed(2), p: Math.round(100 * cloud / r.km2) })] : []), fill(t("dd_e_px"), { s: r.scale })],
      warn: t("fire_app_warn"), method: t("dd_m_fire"), src: t("fi_src"),
      creditsEn: "Microsoft Planetary Computer; Copernicus Sentinel-2 (ESA); NASA MODIS MCD64A1, MOD14A1, MYD14A1. Copyright holders of the source data keep their rights.",
    };
  }

  function render() {
    const r = st.result;
    box.replaceChildren(...[
      el("p", { class: "note", text: t("fire_app_note") }),
      el("p", { class: "aoi-area", text: areaLine() }),
      dateRow(t("fi_before"), st.before),
      dateRow(t("fi_after"), st.after),
      el("label", { class: "check" }, el("input", { type: "checkbox", checked: st.autumn, onchange: (e) => { st.autumn = e.target.checked; } }), el("span", { text: t("fi_autumn") })),
      el("button", { class: "btn aoi-run", type: "button", text: t("fa_run"), disabled: st.running, onclick: run }),
      st.status && el("p", { class: "aoi-status" + (st.error ? " err" : ""), role: "status", text: st.status }),
      r && el("ul", { class: "aoi-lines" }, ...lines(r).map((l) => el("li", { text: l }))),
      r && el("div", { class: "aoi-legend" },
        ...[...CLASSES].reverse().filter((c) => c.from >= 0.10).map((c) => el("label", { class: "check" }, el("i", { style: `background:rgb(${c.color.join(",")})` }), el("span", { text: `${t("fi_c_" + c.key)} (${c.from} – ${c.to > 2 ? "" : c.to})` }))),
        ...[["burned", null], ["other", CLASSES[2].color], ["modis", MODIS], ["fire", FIRE_PX]].map(([k, c]) => el("label", { class: "check" },
          el("input", { type: "checkbox", checked: st.show[k], onchange: (e) => { st.show[k] = e.target.checked; paint(); } }),
          c && el("i", { style: `background:rgb(${c.join(",")})` }), el("span", { text: t("fi_l_" + k) })))),
      r && el("div", { class: "btnrow" }, el("button", { class: "btn", type: "button", text: t("fa_download_btn"), onclick: download }), el("button", { class: "btn", type: "button", text: t("av_open"), onclick: openView })),
      el("p", { class: "note", text: t("fire_app_warn") }),
      el("p", { class: "note" }, el("a", { href: geeUrl, target: "_blank", rel: "noopener", text: t("fi_gee") })),
      el("p", { class: "note small", text: t("fi_src") }),
    ].filter(Boolean));
  }

  return {
    render,
    layer,
    hasResult: () => Boolean(st.result),
    openView,
    refresh() { if (!st.running) render(); },
    show(on) { if (on) { if (!st.overlay && st.result) paint(); } else { st.overlay?.remove(); st.overlay = null; viewer?.closeIf("fire"); } },
  };
}
