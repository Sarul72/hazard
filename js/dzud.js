/* The dzud tab: ZudRisk's soum risk for the winter of the chosen day, drawn over the image, with the soum's chance of
 * heavy losses in its popup. The data stays on ZudRisk's site (js/dzud_data.js), so its monthly outlook update reaches
 * this page without a copy. When ZudRisk has no file for the winter, the screen says so and shows no colour. */
import { el } from "./dom.js";
import { eicWms } from "./eic_layers.js";
import { DZUD_URL, EIC_SNOW_WMS, borrowedDensity, chanceOf, classCounts, coldSoFar, snowLayer, topSoums, winterFile, winterLabel, winterOf } from "./dzud_data.js";

const IND = ["cold", "snow", "summer", "pressure"];
const EIC_URL = "https://eic.mn/dzud/";

/** box: the side panel's container; classes(): the dzud colours; busy(job): the computing screen while a file loads. */
export function createDzud({ map, box, t, getLang, classes, classLabel, busy, onChange }) {
  const st = { on: false, date: null, index: null, winter: null, geo: null, layer: null, token: 0, error: null, loading: false };
  // EIC's snow-cover image under the soums: its list of real layers is read once, the image itself straight from eic.mn
  // failed: the layer eic.mn sent nothing for, so another dekad (another date) is still tried
  const snow = { on: false, list: null, pick: null, layer: null, failed: null };
  const get = (p) => fetch(DZUD_URL + p).then((r) => { if (!r.ok) throw new Error(`${r.status} ${p}`); return r.json(); });
  const pct = (q) => `${Math.round(100 * q)}%`;
  const num = (v, d = 2) => (v === null || v === undefined ? "–" : Number(v).toFixed(d));
  const name = (p) => (getLang() === "mn" ? `${p.name_mn} (${p.aimag_mn})` : `${p.name_en} (${p.aimag_en})`);
  const fill = (p) => (p.risk_class === null || p.risk_class === undefined ? "#555555" : classes()[p.risk_class].color);

  function index() {
    st.index ??= Promise.all([
      get("data/winters.json"), get("data/outlook.json").catch(() => null),
      get("data/calibration.json").catch(() => null), get("data/pooled.json").catch(() => null),
    ]).then(([winters, outlook, calibration, pooled]) => ({ winters, outlook, calibration, pooled }));
    st.index.catch(() => { st.index = null; }); // a failed start is tried again on the next day picked
    return st.index;
  }

  function tip(p) {
    if (p.risk_class === null || p.risk_class === undefined) return `${name(p)}: ${t("no_data")}`;
    return `${name(p)}: ${classLabel(p.risk_class)}`;
  }

  function popup(p) {
    const ix = st.ready;
    const head = el("b", { text: name(p) });
    if (p.risk_class === null || p.risk_class === undefined) return el("div", { class: "dz-pop" }, head, el("p", { text: p.no_herd ? t("dz_no_herd") : t("no_data") }));
    const q = chanceOf(ix?.calibration, p.stage, p.risk);
    const early = (k) => p.stage === "oct" && (k === "cold" || k === "snow"); // the October outlook has no winter month yet
    return el("div", { class: "dz-pop" }, head,
      el("p", {}, `${t("dz_risk")}: `, el("b", { text: classLabel(p.risk_class) }), ` (${num(p.risk)})`),
      q === null ? null : el("p", {}, `${t("dz_chance")}: `, el("b", { text: pct(q) })),
      el("table", {}, el("tbody", {}, IND.map((k) => el("tr", {}, el("td", { text: t("dz_ind_" + k) }),
        el("td", { text: early(k) ? t("dz_not_yet") : `z ${num(p["z_" + k])}` }))))),
      el("p", { class: "small", text: [
        p.cold_c === null || p.cold_c === undefined ? null : `${t(coldSoFar(p.stage) ? "dz_cold_c_sofar" : "dz_cold_c")}: ${num(p.cold_c, 1)} °C`,
        p.snow_m === null || p.snow_m === undefined ? null : `${t("dz_snow_cm")}: ${num(p.snow_m * 100, 0)} cm`,
        p.su_per_km2 === null || p.su_per_km2 === undefined ? null : `${t("dz_su")}: ${num(p.su_per_km2, 0)}`,
      ].filter(Boolean).join(" · ") }),
      borrowedDensity(p) ? el("p", { class: "small", text: t("dz_density_" + borrowedDensity(p)) }) : null,
      el("p", { class: "small" }, el("a", { href: DZUD_URL, target: "_blank", rel: "noopener", text: t("dz_more") })));
  }

  function draw() {
    st.layer?.remove();
    st.layer = null;
    if (!st.on || !st.geo) return;
    st.layer = window.L.geoJSON(st.geo, {
      // with the snow image on, the soums are outlines only, so the image shows through and the popups still open
      style: (f) => (snow.on ? { color: "#1b1208", weight: 0.8, opacity: 0.8, fill: true, fillOpacity: 0 }
        : { color: "#1b1208", weight: 0.5, opacity: 0.6, fillColor: fill(f.properties), fillOpacity: 0.74 }),
      onEachFeature: (f, l) => l.bindTooltip(() => tip(f.properties), { sticky: true, direction: "top" })
        .bindPopup(() => popup(f.properties), { maxWidth: 300 }),
    }).addTo(map);
  }

  function snowList() {
    snow.list ??= fetch("data/eic_snow.json").then((r) => (r.ok ? r.json() : { layers: [] })).then((j) => j.layers ?? [])
      .catch(() => []);
    return snow.list;
  }

  /** The snow image for the chosen day, or none: off, summer, no image yet that season, or eic.mn not answering. */
  async function drawSnow() {
    const want = st.on && snow.on && st.date ? snowLayer(st.date, await snowList()) : null;
    if (want?.layer === snow.pick?.layer && (snow.layer || !want)) { render(); return; }
    snow.layer?.remove();
    snow.layer = null;
    snow.pick = want;
    if (want && want.layer !== snow.failed) {
      if (!map.getPane("dzudSnow")) map.createPane("dzudSnow").style.zIndex = 250; // over the satellite image, under the soums
      const name = want.layer;
      snow.layer = eicWms(window.L, EIC_SNOW_WMS, { layers: name, opacity: 0.85, pane: "dzudSnow" }, () => {
        snow.failed = name;
        if (snow.pick?.layer !== name) return; // a later date has its own layer
        snow.layer?.remove();
        snow.layer = null;
        render();
      }).addTo(map);
    }
    render();
  }

  function setSnow(on) {
    snow.on = on;
    if (on) snow.failed = null; // switching it on again tries eic.mn again
    draw();
    drawSnow();
  }

  function focus(pcode) {
    st.layer?.eachLayer((l) => {
      if (l.feature.properties.pcode !== pcode) return;
      map.fitBounds(l.getBounds(), { maxZoom: 8, paddingTopLeft: [window.innerWidth > 1000 ? 360 : 10, 70] });
      l.openPopup();
    });
  }

  /** The side panel: which winter and stage, soums per class, the highest risks, and how well ZudRisk has done. */
  function render() {
    if (!box) return;
    const ix = st.ready, w = st.winter, kids = [];
    kids.push(el("p", { class: "note", text: t("dz_lead") }));
    kids.push(el("label", { class: "check" }, el("input", { type: "checkbox", checked: snow.on, onchange: (e) => setSnow(e.target.checked) }),
      el("span", { text: t("dz_snow") })));
    if (snow.on) {
      const s = snow.pick;
      const failed = s && s.layer === snow.failed;
      kids.push(el("p", { class: "note small" + (failed ? " warn" : "") }, failed ? t("dz_snow_error")
        : s ? t("dz_snow_at").replace("{y}", s.year).replace("{m}", t("months")[s.month - 1]).replace("{d}", s.dekad) : t("dz_snow_none"),
        " ", el("a", { href: EIC_URL, target: "_blank", rel: "noopener", text: t("dz_snow_src") })));
    }
    if (st.error) kids.push(el("p", { class: "note warn", text: `${t("load_error")}${st.error}` }));
    else if (!w) kids.push(el("p", { class: "note", text: t("busy") }));
    else if (!st.geo && !st.loading) {
      const have = ix ? `${winterLabel(ix.winters[0])}–${winterLabel(ix.winters[ix.winters.length - 1])}${ix.outlook ? `, ${winterLabel(ix.outlook.winter)}` : ""}` : "";
      kids.push(el("h3", { text: `${winterLabel(w)} ${t("dz_winter")}` }), el("p", { class: "note", text: t("dz_none").replace("{w}", winterLabel(w)).replace("{have}", have) }));
    } else if (st.geo) {
      const outlook = ix?.outlook?.winter === w;
      kids.push(el("h3", { text: `${winterLabel(w)} ${t("dz_winter")} · ${t(outlook ? "dz_outlook" : "dz_hindcast")}` }));
      if (outlook) kids.push(el("p", { class: "note", text: t("dz_stage").replace("{m}", t("months")[Number(ix.outlook.data_through.slice(5, 7)) - 1]).replace("{d}", ix.outlook.made) }));
      const { counts, none } = classCounts(st.geo.features);
      kids.push(el("ul", { class: "dz-counts" }, ...counts.map((n, i) => ({ n, i })).reverse().map(({ n, i }) =>
        el("li", {}, el("i", { style: `background:${classes()[i].color}` }), el("span", { text: classLabel(i) }), el("b", { text: String(n) }))),
        none ? el("li", {}, el("i", { style: "background:#555555" }), el("span", { text: t("no_data") }), el("b", { text: String(none) })) : null));
      const top = topSoums(st.geo.features);
      kids.push(el("h3", { text: t("dz_top") }), el("ol", { class: "soum-list" }, top.map((f) => {
        const p = f.properties, q = chanceOf(ix?.calibration, p.stage, p.risk);
        return el("li", {}, el("button", { type: "button", onclick: () => focus(p.pcode) },
          el("i", { style: `background:${fill(p)}` }), el("span", { text: name(p) + (borrowedDensity(p) ? " *" : "") }), el("b", { text: q === null ? num(p.risk) : pct(q) })));
      })));
      // a town's herd density is its aimag's or the city's, so its place in this list rests on a borrowed figure
      if (top.some((f) => borrowedDensity(f.properties))) kids.push(el("p", { class: "note small", text: t("dz_density_star") }));
    }
    const pool = ix?.pooled;
    if (pool) {
      kids.push(el("h3", { text: t("dz_skill") }), el("p", { class: "note small", text: [
        t("dz_rho_pre").replace("{r}", num(pool.spearman)).replace("{n}", pool.n),
        pool.every_winter ? t("dz_rho_all").replace("{r}", num(pool.every_winter.spearman)).replace("{n}", pool.every_winter.n) : null,
        pool.every_winter_aimag ? t("dz_rho_aimag").replace("{r}", num(pool.every_winter_aimag.spearman)).replace("{n}", pool.every_winter_aimag.n) : null,
      ].filter(Boolean).join(" ") }));
    }
    kids.push(el("p", { class: "note small" }, t("dz_source"), " ", el("a", { href: DZUD_URL, target: "_blank", rel: "noopener", text: "ZudRisk" })));
    box.replaceChildren(...kids);
  }

  async function load() {
    if (!st.on || !st.date) return;
    const w = winterOf(st.date);
    if (w === st.winter && (st.geo || st.loading)) return; // same winter: nothing to read, and a read under way goes on
    const my = ++st.token;
    st.winter = w; st.geo = null; st.error = null; st.loading = true;
    draw(); render(); onChange?.();
    try {
      await busy(async () => {
        const ix = await index();
        if (my !== st.token) return;
        st.ready = ix;
        const file = winterFile(w, ix);
        const geo = file ? await get(file) : null;
        if (my !== st.token) return;
        st.geo = geo;
      });
    } catch (e) {
      console.error(e);
      if (my !== st.token) return;
      st.error = e.message;
      st.winter = null; // the next day picked tries again
    }
    if (my !== st.token) return;
    st.loading = false;
    draw(); render(); onChange?.();
  }

  return {
    show(on) { st.on = on; if (on) load(); else { st.token++; st.loading = false; st.layer?.remove(); st.layer = null; } if (on) draw(); drawSnow(); },
    setDate(d) { st.date = d; if (st.on) { load(); drawSnow(); } },
    relabel() { render(); if (st.on) draw(); },
    /** What the notice under the map says, or null. */
    note() {
      if (!st.on) return null;
      if (st.error) return t("load_error") + st.error;
      if (st.winter && !st.loading && !st.geo) return t("dz_none_short").replace("{w}", winterLabel(st.winter));
      return null;
    },
  };
}
