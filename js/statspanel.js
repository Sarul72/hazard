/* The area window: selected day with its possible error, long-term trend, long-term risk, verification.
 * Anything not computed is written as such, never left to look like a real number. */
import { el, svg } from "./dom.js";
import { fin } from "./stats.js";

const f = (v, d = 1) => (fin(v) ? v.toFixed(d) : "—");
const signed = (v, d = 2) => (fin(v) ? (v >= 0 ? "+" : "") + v.toFixed(d) : "—");
const pv = (p) => (!fin(p) ? "—" : p < 0.001 ? "<0.001" : p.toFixed(p < 0.1 ? 3 : 2));

const niceTicks = (lo, hi, n = 4) => {
  const raw = (hi - lo) / n, mag = 10 ** Math.floor(Math.log10(raw || 1)), step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Number(v.toFixed(6)));
  return out;
};

function chart({ months, years, trend, date, t }) {
  const W = 600, H = 200, L = 34, R = 10, T = 10, B = 22;
  const valid = months.filter((m) => fin(m.v));
  if (valid.length < 2) return null;
  const t0 = Math.min(...valid.map((m) => m.t)), t1 = Math.max(...valid.map((m) => m.t));
  let lo = Math.min(...valid.map((m) => m.v)), hi = Math.max(...valid.map((m) => m.v));
  const pad = (hi - lo || 1) * 0.08; lo = Math.max(0, lo - pad); hi = Math.min(100, hi + pad);
  const X = (v) => L + (v - t0) / (t1 - t0 || 1) * (W - L - R), Y = (v) => T + (hi - v) / (hi - lo || 1) * (H - T - B);
  const path = (pts) => pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join("");
  const line = (rows, tv, yv) => {
    const segs = []; let cur = [];
    for (const r of rows) { if (fin(yv(r))) cur.push([X(tv(r)), Y(yv(r))]); else { if (cur.length) segs.push(cur); cur = []; } }
    if (cur.length) segs.push(cur);
    return segs.map(path).join("");
  };

  const s = svg("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": t("k_trend") });
  for (const v of niceTicks(lo, hi)) {
    s.append(svg("line", { x1: L, x2: W - R, y1: Y(v), y2: Y(v), class: "c-grid" }), svg("text", { x: L - 6, y: Y(v) + 3.5, "text-anchor": "end", class: "c-axis" }, String(v)));
  }
  const span = t1 - t0, stepY = span > 16 ? 5 : span > 8 ? 2 : 1;
  for (let y = Math.ceil(t0 / stepY) * stepY; y <= t1; y += stepY) s.append(svg("text", { x: X(y), y: H - 6, "text-anchor": "middle", class: "c-axis" }, String(y)));
  s.append(svg("path", { d: line(months, (m) => m.t, (m) => m.v), class: "c-month" }));
  const whole = years.filter((r) => fin(r.v));
  if (trend) {
    const a = whole[0].y, b = whole[whole.length - 1].y, xm = whole.reduce((q, r) => q + r.y, 0) / whole.length;
    const at = (y, slope) => trend.mean + slope * (y - xm);
    if (trend.ciDecade) for (const c of trend.ciDecade) s.append(svg("path", { d: path([[X(a + 0.5), Y(at(a, c / 10))], [X(b + 0.5), Y(at(b, c / 10))]]), class: "c-ci" }));
    s.append(svg("path", { d: path([[X(a + 0.5), Y(at(a, trend.slope))], [X(b + 0.5), Y(at(b, trend.slope))]]), class: "c-trend" }));
  }
  s.append(svg("path", { d: line(years, (r) => r.y + 0.5, (r) => r.v), class: "c-year" }));
  const dt = Number(date.slice(0, 4)) + (Number(date.slice(5, 7)) - 0.5) / 12;
  if (dt >= t0 && dt <= t1) s.append(svg("line", { x1: X(dt), x2: X(dt), y1: T, y2: H - B, class: "c-mark" }), svg("text", { x: Math.min(X(dt) + 4, W - 54), y: T + 9, class: "c-axis" }, date.slice(0, 7)));

  const cross = svg("line", { y1: T, y2: H - B, class: "c-cross", visibility: "hidden" });
  const dot = svg("circle", { r: 4, class: "c-dot", visibility: "hidden" });
  s.append(cross, dot);
  const tip = el("div", { class: "c-tip", hidden: true });
  const wrap = el("div", { class: "chart", tabindex: "0", "aria-label": t("k_trend") }, s, tip);

  let idx = -1;
  const show = (i) => {
    idx = Math.max(0, Math.min(whole.length - 1, i));
    const r = whole[idx], x = X(r.y + 0.5), y = Y(r.v);
    cross.setAttribute("x1", x); cross.setAttribute("x2", x); cross.setAttribute("visibility", "visible");
    dot.setAttribute("cx", x); dot.setAttribute("cy", y); dot.setAttribute("visibility", "visible");
    tip.hidden = false;
    tip.replaceChildren(el("b", { text: `${r.y}: ${f(r.v)}` }), el("span", { text: ` ${t("points")}` }));
    tip.style.left = `${Math.min(x / W * 100, 72)}%`;
  };
  const hide = () => { cross.setAttribute("visibility", "hidden"); dot.setAttribute("visibility", "hidden"); tip.hidden = true; };
  if (whole.length) {
    wrap.addEventListener("pointermove", (e) => {
      const b = s.getBoundingClientRect(), tv = t0 + ((e.clientX - b.left) / b.width * W - L) / (W - L - R) * (t1 - t0);
      let best = 0, d = Infinity;
      whole.forEach((r, i) => { const q = Math.abs(r.y + 0.5 - tv); if (q < d) { d = q; best = i; } });
      show(best);
    });
    wrap.addEventListener("pointerleave", hide);
    wrap.addEventListener("focus", () => show(whole.length - 1));
    wrap.addEventListener("blur", hide);
    wrap.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft") { show(idx - 1); e.preventDefault(); }
      if (e.key === "ArrowRight") { show(idx + 1); e.preventDefault(); }
    });
  }
  return wrap;
}

const key = (cls, label) => el("span", { class: "key" }, el("i", { class: cls }), label);

/** A budget with a part not estimated is a lower bound on the error, and has to read as one. */
const atLeast = (b) => (b.missing.length ? "≥" : "");

export function createStatsPanel(root, { t, classes, classLabel, onClose, onMethods, onCsv, onPlume, onCamps }) {
  const row = (label, value, cls) => el("div", { class: "st-row" + (cls ? " " + cls : "") }, el("dt", { text: label }), el("dd", { text: value }));

  function dayBlock(s) {
    const d = s.day, kids = [el("div", { class: "st-kicker", text: `${t("k_day")} · ${s.date}` })];
    if (!d) { kids.push(el("p", { class: "st-note", text: s.dayMissing ? t("no_day").replace("{d}", s.date) : t("no_cells") })); return kids; }
    const cls = classes.find((c) => d.mean < c.max);
    // If the error bar crosses a class limit the class itself is uncertain, so both ends are named.
    const at = (v) => classes.find((c) => Math.min(Math.max(v, 0), 100) < c.max);
    const lo = d.budget ? at(d.mean - d.budget.U) : cls, hi = d.budget ? at(d.mean + d.budget.U) : cls;
    const label = lo === hi ? classLabel(cls.key) : `${classLabel(lo.key)} – ${classLabel(hi.key)}`;
    kids.push(el("div", { class: "st-hero" }, el("b", { text: f(d.mean, 0) }), d.budget ? el("b", { class: "pm", text: `± ${atLeast(d.budget)}${f(d.budget.U, 0)}` }) : null, el("span", { text: `${t("points")} · ${label}` })));
    const segs = classes.map((c, i) => ({ c, s: d.share[i] })).filter((x) => x.s > 0);
    kids.push(el("div", { class: "seg", role: "img", "aria-label": segs.map((x) => `${classLabel(x.c.key)} ${Math.round(x.s * 100)}%`).join(", ") },
      segs.map((x) => el("i", { style: `flex:${x.s};background:${x.c.color}`, title: `${classLabel(x.c.key)} ${Math.round(x.s * 100)}%` }))));
    kids.push(el("div", { class: "seg-key" }, segs.map((x) => el("span", {}, el("i", { style: `background:${x.c.color}` }), `${classLabel(x.c.key)} ${Math.round(x.s * 100)}%`))));
    kids.push(el("dl", { class: "st-rows" }, row(t("area"), `${Math.round(d.area).toLocaleString("en-US")} км²`), row(t("day_max"), f(d.max, 0)), row(t("coverage"), `${Math.round(d.coverage * 100)}%`)));
    return kids;
  }

  function errorBlock(d) {
    const kids = [el("div", { class: "st-kicker", text: t("k_error") })];
    const b = d?.budget;
    if (!b) { kids.push(el("p", { class: "st-note", text: t("u_none") })); return kids; }
    const p = (k) => (fin(b.parts[k]) ? `±${f(b.parts[k])}` : t("u_none"));
    kids.push(el("dl", { class: "st-rows" },
      row(t("u_expanded"), `±${atLeast(b)}${f(b.U)}`, "strong"), row(t("u_combined"), `±${atLeast(b)}${f(b.uc)}`),
      row(t("u_input"), p("input")), row(t("u_model"), p("model")), row(t("u_sampling"), p("sampling"))));
    if (b.missing.length) kids.push(el("p", { class: "st-note warn", text: t("u_note") }));
    return kids;
  }

  function campsBlock(s) {
    const c = s.camps;
    if (!c) return [];
    const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : "—"), n = (v) => v.toLocaleString("en-US");
    const p = c.parcels, h = c.herders;
    const segs = classes.map((k, i) => ({ k, v: p.byClass[i] })).filter((x) => x.v > 0);
    return [el("div", { class: "st-kicker", text: t("k_camps") }),
      p.total ? el("div", { class: "seg" }, segs.map((x) => el("i", { style: `flex:${x.v};background:${x.k.color}`, title: `${classLabel(x.k.key)} ${x.v}` }))) : null,
      el("dl", { class: "st-rows" },
        row(t("camps_parcels"), n(p.total)), row(t("camps_herders"), n(h.total)),
        row(t("camps_high_p"), `${n(p.high)} (${pct(p.high, p.total)})`), row(t("camps_range"), `${n(p.highLow)}–${n(p.highHigh)}`),
        row(t("camps_high_h"), `${n(h.high)} (${pct(h.high, h.total)})`)),
      el("label", { class: "st-check" }, el("input", { type: "checkbox", checked: s.campsOn, onchange: (e) => onCamps(e.target.checked) }), t("camps_show")),
      el("p", { class: "st-note", text: t("camps_note") })].filter(Boolean);
  }

  function trendBlock(s) {
    const kids = [el("div", { class: "st-kicker", text: t("k_trend") })];
    if (s.longError) { kids.push(el("p", { class: "st-note", text: t("no_long") })); return kids; }
    if (!s.long) { kids.push(el("p", { class: "st-note", text: t("busy") })); return kids; }
    const r = s.long.trend;
    if (r) kids.push(el("div", { class: "st-sub" }, el("b", { text: signed(r.slopeDecade) }), el("span", { text: `${t("per_decade")} · ${t("mean")} ${f(r.mean)}` })));
    const c = chart({ months: s.months, years: s.long.years, trend: r, date: s.date, t });
    if (c) kids.push(c, el("div", { class: "keys" }, key("k-month", t("legend_month")), key("k-year", t("legend_year")), key("k-trend", t("legend_trend")), key("k-ci", t("legend_ci"))));
    if (!r) { kids.push(el("p", { class: "st-note", text: t("too_short") })); return kids; }
    const det = r.detectYear === null ? "—" : `${r.detectYear} (${r.detectEarly ?? "—"}–${r.detectLate ?? t("may_never")})`;
    kids.push(el("dl", { class: "st-rows" },
      row(t("ci95"), r.ciDecade ? `[${f(r.ciDecade[0], 2)}, ${f(r.ciDecade[1], 2)}]` : "—"),
      row(t("p_chain"), `${pv(r.pPlain)} → ${pv(r.pAdjusted)} → ${pv(r.pAr1)}`),
      row(t("phi_row"), `${f(r.phi, 2)} · ±${f(r.detectableDecade, 2)} · ${r.nStar === null ? "—" : Math.ceil(r.nStar)}`),
      row(t("detect_year"), det),
      row(t("mk_row"), `${pv(r.mk?.p)} · ${signed(r.senDecade)}`)));
    if (s.long.years.some((y) => !fin(y.v))) kids.push(el("p", { class: "st-note", text: t("partial") }));
    return kids;
  }

  function yearsBlock(s) {
    if (!s.long) return [];
    const L = s.long;
    return [el("div", { class: "st-kicker", text: t("k_years") }), el("dl", { class: "st-rows" },
      row(t("high_days"), f(L.highMean)),
      row(t("high_worst"), L.highWorst && L.highWorst.v > 0 ? `${L.highWorst.y} · ${f(L.highWorst.v)}` : "—"),
      row(t("rl_row"), L.rl ? `${f(L.rl.t5)} / ${f(L.rl.t20)}` : t("too_short")))];
  }

  function verifyBlock(s) {
    const kids = [el("div", { class: "st-kicker", text: t("k_verify") })], v = s.verification;
    if (s.hazard === "all") { kids.push(el("p", { class: "st-note", text: t("v_all") })); return kids; }
    if (!v) { kids.push(el("p", { class: "st-note warn", text: t("v_none") })); return kids; }
    kids.push(el("dl", { class: "st-rows" },
      row(t("v_reference"), v.reference ?? "—"), row(t("v_period"), `${v.period ?? "—"} · n=${v.n ?? "—"}`),
      row(t("v_auc"), v.auc_ci ? `${f(v.auc, 2)} [${f(v.auc_ci[0], 2)}, ${f(v.auc_ci[1], 2)}]` : f(v.auc, 2)),
      fin(v.pod) ? row(t("v_pod_far"), `${f(v.pod, 2)} · ${f(v.far, 3)}`) : null,
      fin(v.share_flagged) ? row(t("v_flagged"), `${f(v.share_flagged * 100, 1)}%`) : null,
      fin(v.events_hit) ? row(t("v_events"), `${v.events_hit} / ${v.n}`) : null,
      fin(v.csi) ? row(t("v_csi_brier"), `${f(v.csi, 3)} · ${f(v.brier, 4)}`) : null));
    return kids;
  }

  function tableView(s) {
    if (!s.long) return null;
    const days = new Map(s.long.high.map((r) => [r.y, r.v]));
    return el("details", { class: "st-table" }, el("summary", { text: t("table_view") }),
      el("table", {}, el("thead", {}, el("tr", {}, ["t_year", "t_mean", "t_days"].map((k) => el("th", { text: t(k) })))),
        el("tbody", {}, s.long.years.map((r) => el("tr", {}, el("td", { text: String(r.y) }), el("td", { text: f(r.v) }), el("td", { text: f(days.get(r.y)) }))))));
  }

  return {
    render(s) {
      root.hidden = false;
      document.body.classList.add("stats-open");
      root.replaceChildren(
        el("div", { class: "st-top" },
          el("div", {}, el("div", { class: "st-kicker", text: `${s.hazardLabel} · ${s.kind}` }), el("div", { class: "st-title", text: s.label })),
          el("div", { class: "st-actions" },
            s.long ? el("button", { class: "st-btn", type: "button", text: `⤓ ${t("csv")}`, onclick: onCsv }) : null,
            el("button", { class: "st-btn", type: "button", "aria-label": t("close"), title: t("close"), text: "✕", onclick: onClose }))),
        el("button", { class: "st-btn wide top", type: "button", text: t("plume_here"), onclick: onPlume }),
        ...[...dayBlock(s), ...errorBlock(s.day), ...campsBlock(s), ...trendBlock(s), ...yearsBlock(s), ...verifyBlock(s), tableView(s)].filter(Boolean),
        el("button", { class: "st-btn wide", type: "button", text: t("method_of"), onclick: () => onMethods(s.hazard) }));
    },
    close() { root.hidden = true; root.replaceChildren(); document.body.classList.remove("stats-open"); },
  };
}
