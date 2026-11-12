/* A small window that shows the result of a detailed check at its own pixels. The map stops at zoom 12 (25-40 m a screen
 * pixel), finer than nothing of the satellite image but coarser than the 10-60 m of the checks, so the result is looked at
 * here: the window can be dragged by its title and resized at its corner, the picture zooms with the wheel or the buttons
 * down to single pixels and pans by dragging, and the four corners say the latitude and longitude of what is in view.
 * Behind the result lies the clearest Sentinel-2 colour image of the check's period (js/aoi/backdrop.js), fetched when
 * the window opens; it can be switched off, and the result made more or less transparent over it. When none of the
 * shown classes occurs in the area, the window says which one to switch on instead of staying empty. A result may
 * also bring pairs of pictures to compare (spec.compare): the window then shows one on the left of a line and the
 * other on the right, and the line is dragged across the picture to swipe between them. */
import { el } from "../dom.js";

const MAX_K = 40; // screen pixels per result pixel at the closest zoom

const deg = (v, pos, neg) => `${Math.abs(v).toFixed(4)}°${v >= 0 ? pos : neg}`;
const where = (lat, lon) => `${deg(lat, "N", "S")} ${deg(lon, "E", "W")}`;
const km = (m) => (m >= 1000 ? `${(m / 1000).toFixed(m >= 10000 ? 0 : 1)} км` : `${Math.round(m)} м`);

export function createViewer({ t }) {
  const canvas = el("canvas", { class: "av-canvas" });
  const corner = Object.fromEntries(["nw", "ne", "sw", "se"].map((k) => [k, el("span", { class: "av-c " + k })]));
  const title = el("b", { class: "av-title" });
  const empty = el("p", { class: "av-empty", hidden: true });
  let showSat = true, bg = { key: null, img: null, state: "none" }, satButton = null;
  // the swipe comparison: on or off, which pair, where the line is (0..1 of the width), the loaded pictures per pair
  const cmp = { on: false, key: null, split: 0.5, imgs: new Map(), drag: false, showRes: true };
  const cmpSelect = el("select", { class: "av-cmp-sel", title: t("av_cmp_pair"), "aria-label": t("av_cmp_pair"), hidden: true, onchange: (e) => { cmp.key = e.target.value; loadCompare(); draw(); } });
  const cmpBtn = el("button", { type: "button", class: "av-btn av-cmp", text: "⇔", title: t("av_cmp"), "aria-label": t("av_cmp"), "aria-pressed": "false", hidden: true,
    onclick: () => setCompare(!cmp.on) });
  const resBtn = el("button", { type: "button", class: "av-btn av-res on", text: "▦", title: t("av_cmp_res"), "aria-label": t("av_cmp_res"), "aria-pressed": "true", hidden: true,
    onclick: () => { cmp.showRes = !cmp.showRes; resBtn.classList.toggle("on", cmp.showRes); resBtn.setAttribute("aria-pressed", String(cmp.showRes)); draw(); } });
  const alpha = el("input", { type: "range", class: "av-alpha", min: "0.2", max: "1", step: "0.05", value: "0.8", title: t("av_alpha"), "aria-label": t("av_alpha"), oninput: () => draw() });
  const foot = el("div", { class: "av-foot" });
  const btn = (text, tip, on) => el("button", { type: "button", class: "av-btn", text, title: tip, "aria-label": tip, onclick: on });
  const head = el("div", { class: "av-head" }, title,
    btn("+", t("av_in"), () => zoomAt(1.6)), btn("−", t("av_out"), () => zoomAt(1 / 1.6)), btn("⤢", t("av_fit"), () => { fit(); draw(); }), cmpBtn, cmpSelect, resBtn, alpha, satBtn(), btn("×", t("av_close"), () => close()));
  const body = el("div", { class: "av-body" }, canvas, ...Object.values(corner), empty);
  const box = el("section", { class: "aoi-view glass", hidden: true, role: "dialog", "aria-label": t("av_open") }, head, body, foot);
  document.body.append(box);

  // the shown result: its picture, grid, the name of what a pixel holds, and which check it belongs to
  let cur = null, k = 1, ox = 0, oy = 0, hover = null;
  // the satellite picture behind it: per result, fetched once; null while loading, false when none was found
  function satBtn() {
    satButton = el("button", { type: "button", class: "av-btn av-sat on", text: "🛰", title: t("av_sat"), "aria-label": t("av_sat"), "aria-pressed": "true",
      onclick: () => { showSat = !showSat; satButton.classList.toggle("on", showSat); satButton.setAttribute("aria-pressed", String(showSat)); draw(); } });
    return satButton;
  }
  async function loadBackdrop(spec) {
    if (!spec.backdrop || bg.key === spec.grid) return;
    bg = { key: spec.grid, img: null, state: "loading" };
    footer();
    try {
      const b = await spec.backdrop();
      if (bg.key !== spec.grid) return;
      bg = { key: spec.grid, img: b, state: b ? "ready" : "none" };
    } catch (e) {
      console.error(e);
      if (bg.key === spec.grid) bg = { key: spec.grid, img: null, state: "error" };
    }
    if (cur?.grid === spec.grid && !box.hidden) draw();
  }

  /** Turn the swipe comparison on or off; the first pair is the default. */
  function setCompare(on) {
    cmp.on = Boolean(on && cur?.compare?.pairs?.length);
    cmpBtn.classList.toggle("on", cmp.on);
    cmpBtn.setAttribute("aria-pressed", String(cmp.on));
    cmpSelect.hidden = !cmp.on;
    resBtn.hidden = !cmp.on;
    if (cmp.on) {
      if (!cur.compare.pairs.some((p) => p.key === cmp.key)) cmp.key = cur.compare.pairs[0].key;
      cmpSelect.value = cmp.key;
      loadCompare();
    }
    draw();
  }
  /** The two pictures of the chosen pair, fetched once per result. */
  async function loadCompare() {
    const spec = cur, pair = spec?.compare?.pairs.find((p) => p.key === cmp.key);
    if (!pair) return;
    const id = spec.grid, slot = cmp.imgs.get(pair.key);
    if (slot && slot.grid === id) return;
    const entry = { grid: id, left: null, right: null, state: "loading" };
    cmp.imgs.set(pair.key, entry);
    footer();
    try {
      const [l, r] = await Promise.all([pair.left.load(), pair.right.load()]);
      entry.left = l; entry.right = r; entry.state = l && r ? "ready" : "none";
    } catch (e) {
      console.error(e);
      entry.state = "error";
    }
    if (cur === spec && !box.hidden) draw();
  }

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
    const pair = cmp.on ? cur.compare?.pairs.find((p) => p.key === cmp.key) : null, imgs = pair ? cmp.imgs.get(pair.key) : null;
    if (pair) {
      // left picture up to the line, right picture beyond it; the result over both when switched on
      const sx = ox + (cmp.split * w) / k;
      if (imgs?.state === "ready") {
        ctx.imageSmoothingEnabled = k < 1;
        ctx.save(); ctx.beginPath(); ctx.rect(ox, oy, sx - ox, h / k); ctx.clip(); ctx.drawImage(imgs.left, 0, 0); ctx.restore();
        ctx.save(); ctx.beginPath(); ctx.rect(sx, oy, w / k, h / k); ctx.clip(); ctx.drawImage(imgs.right, 0, 0); ctx.restore();
        ctx.imageSmoothingEnabled = false;
      }
      if (cmp.showRes) { ctx.globalAlpha = Number(alpha.value); ctx.drawImage(cur.picture(), 0, 0); ctx.globalAlpha = 1; }
    } else {
      const sat = showSat && bg.key === cur.grid && bg.img;
      if (sat) { ctx.imageSmoothingEnabled = k < 1; ctx.drawImage(bg.img.canvas, 0, 0); ctx.imageSmoothingEnabled = false; }
      ctx.globalAlpha = sat ? Number(alpha.value) : 1;
      ctx.drawImage(cur.picture(), 0, 0);
      ctx.globalAlpha = 1;
    }
    if (pair) {
      // the line, its handle and the names of the two sides, in screen pixels
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const x = cmp.split * w;
      ctx.fillStyle = "#fff"; ctx.fillRect(x - 1, 0, 2, h);
      ctx.beginPath(); ctx.arc(x, h / 2, 13, 0, 2 * Math.PI); ctx.fillStyle = "rgba(15,18,22,.85)"; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = "#fff"; ctx.stroke();
      ctx.fillStyle = "#fff"; ctx.font = "13px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("⇔", x, h / 2 + 1);
      ctx.font = "11px system-ui, sans-serif"; ctx.textBaseline = "top";
      const tag = (text, tx, align) => { ctx.textAlign = align; const m = ctx.measureText(text).width, bx = align === "right" ? tx - m - 6 : tx; ctx.fillStyle = "rgba(0,0,0,.7)"; ctx.fillRect(bx, 24, m + 6, 17); ctx.fillStyle = "#fff"; ctx.fillText(text, align === "right" ? tx - 3 : tx + 3, 27); };
      tag(pair.left.label, x - 6, "right");
      tag(pair.right.label, x + 6, "left");
      if (imgs?.state !== "ready") { ctx.textAlign = "center"; ctx.fillStyle = "rgba(0,0,0,.7)"; ctx.fillRect(w / 2 - 110, h - 52, 220, 20); ctx.fillStyle = "#fff"; ctx.fillText(t(imgs?.state === "loading" || !imgs ? "av_image_loading" : "av_image_none"), w / 2, h - 49); }
    }
    const why = cur.empty?.() ?? null;
    empty.hidden = !why;
    empty.textContent = why ?? "";
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
    if (cmp.on) parts.push(t("av_cmp_hint"));
    else if (cur.backdrop && bg.key === cur.grid) parts.push(bg.state === "ready" ? `${t("av_image")}: Sentinel-2 ${bg.img.date}` : bg.state === "loading" ? t("av_image_loading") : t("av_image_none"));
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
  const nearLine = (e) => { if (!cmp.on) return false; const r = body.getBoundingClientRect(); return Math.abs(e.clientX - r.left - cmp.split * r.width) <= 14; };
  body.addEventListener("pointerdown", (e) => {
    body.setPointerCapture(e.pointerId);
    if (nearLine(e)) { cmp.drag = true; body.classList.add("swipe"); return; }
    pan = { x: e.clientX, y: e.clientY, ox, oy }; body.classList.add("grab");
  });
  body.addEventListener("pointerup", () => { pan = null; cmp.drag = false; body.classList.remove("grab", "swipe"); });
  body.addEventListener("pointermove", (e) => {
    if (!cur) return;
    if (cmp.drag) { const r = body.getBoundingClientRect(); cmp.split = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)); draw(); return; }
    body.classList.toggle("swipe-near", nearLine(e));
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
    if (!same) { fit(); cmp.imgs.clear(); }
    const pairs = spec.compare?.pairs ?? [];
    cmpBtn.hidden = !pairs.length;
    cmpSelect.replaceChildren(...pairs.map((p) => el("option", { value: p.key, text: p.label })));
    setCompare(pairs.length > 0 && (same ? cmp.on : Boolean(spec.compare?.start)));
    draw();
    loadBackdrop(spec);
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
