/* A small window that shows the result of a detailed check at its own pixels. The map stops at zoom 12 (25-40 m a screen
 * pixel), finer than nothing of the satellite image but coarser than the 10-60 m of the checks, so the result is looked at
 * here: the window can be dragged by its title and resized at its corner, the picture zooms with the wheel or the buttons
 * down to single pixels and pans by dragging, and the four corners say the latitude and longitude of what is in view. */
import { el } from "../dom.js";

const MAX_K = 40; // screen pixels per result pixel at the closest zoom

const deg = (v, pos, neg) => `${Math.abs(v).toFixed(4)}°${v >= 0 ? pos : neg}`;
const where = (lat, lon) => `${deg(lat, "N", "S")} ${deg(lon, "E", "W")}`;
const km = (m) => (m >= 1000 ? `${(m / 1000).toFixed(m >= 10000 ? 0 : 1)} км` : `${Math.round(m)} м`);

export function createViewer({ t }) {
  const canvas = el("canvas", { class: "av-canvas" });
  const corner = Object.fromEntries(["nw", "ne", "sw", "se"].map((k) => [k, el("span", { class: "av-c " + k })]));
  const title = el("b", { class: "av-title" });
  const foot = el("div", { class: "av-foot" });
  const btn = (text, tip, on) => el("button", { type: "button", class: "av-btn", text, title: tip, "aria-label": tip, onclick: on });
  const head = el("div", { class: "av-head" }, title,
    btn("+", t("av_in"), () => zoomAt(1.6)), btn("−", t("av_out"), () => zoomAt(1 / 1.6)), btn("⤢", t("av_fit"), () => { fit(); draw(); }), btn("×", t("av_close"), () => close()));
  const body = el("div", { class: "av-body" }, canvas, ...Object.values(corner));
  const box = el("section", { class: "aoi-view glass", hidden: true, role: "dialog", "aria-label": t("av_open") }, head, body, foot);
  document.body.append(box);

  // the shown result: its picture, grid, the name of what a pixel holds, and which check it belongs to
  let cur = null, k = 1, ox = 0, oy = 0, hover = null;

  function size() {
    const r = body.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
    return { w: r.width, h: r.height, dpr };
  }

  function fit() {
    if (!cur) return;
    const { w, h } = size(), g = cur.grid;
    k = Math.min(w / g.w, h / g.h) * 0.96;
    ox = (g.w - w / k) / 2;
    oy = (g.h - h / k) / 2;
  }

  function draw() {
    if (!cur) return;
    const { w, h, dpr } = size(), g = cur.grid, ctx = canvas.getContext("2d");
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#0d1116";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(k * dpr, 0, 0, k * dpr, -ox * k * dpr, -oy * k * dpr);
    ctx.strokeStyle = "rgba(255,255,255,.35)";
    ctx.lineWidth = 1 / (k * dpr);
    ctx.strokeRect(0, 0, g.w, g.h);
    ctx.drawImage(cur.picture(), 0, 0);
    // the corners of what is in view
    const lon = (x) => g.west + x * g.dx, lat = (y) => g.north - y * g.dy;
    const x0 = ox, y0 = oy, x1 = ox + w / k, y1 = oy + h / k;
    corner.nw.textContent = where(lat(y0), lon(x0));
    corner.ne.textContent = where(lat(y0), lon(x1));
    corner.sw.textContent = where(lat(y1), lon(x0));
    corner.se.textContent = where(lat(y1), lon(x1));
    footer();
  }

  function footer() {
    const g = cur.grid, widthM = (cur.grid.scale ?? 0) * Math.min(g.w, body.getBoundingClientRect().width / k);
    const parts = [`1 ${t("av_px")} = ${g.scale} м`, `${t("av_width")} ${km(widthM)}`];
    if (hover) parts.unshift(`${where(hover.lat, hover.lon)} · ${hover.what}`);
    else parts.push(t("av_hint"));
    foot.textContent = parts.join("  ·  ");
  }

  /** Zoom by `f` about a point of the window (its centre by default). */
  function zoomAt(f, px, py) {
    if (!cur) return;
    const r = body.getBoundingClientRect(), cx = px ?? r.width / 2, cy = py ?? r.height / 2;
    const fitK = Math.min(r.width / cur.grid.w, r.height / cur.grid.h) * 0.5;
    const nk = Math.min(MAX_K, Math.max(fitK, k * f));
    ox += cx / k - cx / nk;
    oy += cy / k - cy / nk;
    k = nk;
    draw();
  }

  body.addEventListener("wheel", (e) => {
    e.preventDefault();
    const r = body.getBoundingClientRect();
    zoomAt(e.deltaY < 0 ? 1.25 : 0.8, e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });
  body.addEventListener("dblclick", (e) => { const r = body.getBoundingClientRect(); zoomAt(2, e.clientX - r.left, e.clientY - r.top); });

  // drag the picture; tell what is under the pointer
  let pan = null;
  body.addEventListener("pointerdown", (e) => { pan = { x: e.clientX, y: e.clientY, ox, oy }; body.setPointerCapture(e.pointerId); body.classList.add("grab"); });
  body.addEventListener("pointerup", () => { pan = null; body.classList.remove("grab"); });
  body.addEventListener("pointermove", (e) => {
    if (!cur) return;
    if (pan) { ox = pan.ox - (e.clientX - pan.x) / k; oy = pan.oy - (e.clientY - pan.y) / k; draw(); return; }
    const r = body.getBoundingClientRect(), g = cur.grid;
    const x = ox + (e.clientX - r.left) / k, y = oy + (e.clientY - r.top) / k, c = Math.floor(x), row = Math.floor(y);
    hover = c >= 0 && row >= 0 && c < g.w && row < g.h ? { lon: g.west + x * g.dx, lat: g.north - y * g.dy, what: cur.label(row * g.w + c) } : null;
    footer();
  });
  body.addEventListener("pointerleave", () => { hover = null; if (cur) footer(); });

  // move the window by its title; keep it on screen
  let move = null;
  head.addEventListener("pointerdown", (e) => {
    if (e.target.closest("button")) return;
    const r = box.getBoundingClientRect();
    move = { x: e.clientX - r.left, y: e.clientY - r.top };
    head.setPointerCapture(e.pointerId);
  });
  head.addEventListener("pointermove", (e) => {
    if (!move) return;
    const w = box.offsetWidth, h = box.offsetHeight;
    box.style.left = `${Math.min(window.innerWidth - 60, Math.max(-w + 60, e.clientX - move.x))}px`;
    box.style.top = `${Math.min(window.innerHeight - 40, Math.max(0, e.clientY - move.y))}px`;
    box.style.right = "auto";
    box.style.bottom = "auto";
  });
  head.addEventListener("pointerup", () => { move = null; });

  // resizing at the corner redraws at the new size, keeping the centre
  new ResizeObserver(() => { if (cur && !box.hidden) draw(); }).observe(body);

  function open(spec) {
    const same = cur?.owner === spec.owner && cur?.grid === spec.grid;
    cur = spec;
    title.textContent = spec.title;
    box.hidden = false;
    if (!same) fit();
    draw();
  }
  function close() { box.hidden = true; cur?.onClose?.(); }

  return {
    open,
    close,
    /** Redraw when the check changed what its picture shows (the layer check boxes). */
    refresh(owner) { if (cur?.owner === owner && !box.hidden) draw(); },
    /** Leaving a hazard closes its window. */
    closeIf(owner) { if (cur?.owner === owner && !box.hidden) close(); },
    isOpen(owner) { return cur?.owner === owner && !box.hidden; },
    setTitle(text) { if (cur) { title.textContent = text; } },
  };
}
