/* Redraws what is on screen as an image with legend, scale and the possible error in a corner, and reads the numbers behind it.
 * All of it is built in the browser from the files the page already reads. The file formats are in formats.js. */
import { maxNativeZoom, tileTemplate } from "./gibs.js";
import { arrowLength, drawArrow } from "./mapmarks.js";

const loadImage = (url) => new Promise((ok) => {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => ok(img);
  img.onerror = () => ok(null); // a tile with no data is normal: the page behind stays dark there
  img.src = url;
});

function panel(ctx, x, y, w, h, S) {
  ctx.fillStyle = "rgba(12,14,16,.84)";
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 8 * S);
  ctx.fill();
}

function niceLength(metres) {
  const mag = 10 ** Math.floor(Math.log10(metres));
  return [1, 2, 5, 10].map((m) => m * mag).filter((v) => v <= metres).pop();
}

/** The current map view as a canvas, drawn again from its parts at twice the screen resolution. */
export async function drawMap(o) {
  const { map, S = 2 } = o, size = map.getSize(), W = size.x * S, H = size.y * S;
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d");
  ctx.fillStyle = "#0b0f13";
  ctx.fillRect(0, 0, W, H);

  const z = Math.max(0, Math.min(Math.round(map.getZoom()), maxNativeZoom(o.base.tms)));
  const b = map.getBounds(), nw = map.project(b.getNorthWest(), z), se = map.project(b.getSouthEast(), z);
  const k = W / (se.x - nw.x);
  const P = (lat, lon) => { const p = map.project([lat, lon], z); return [(p.x - nw.x) * k, (p.y - nw.y) * k]; };

  const n = 2 ** z, jobs = [], template = tileTemplate(o.base, o.date);
  for (let x = Math.floor(nw.x / 256); x <= Math.floor(se.x / 256); x++) {
    for (let y = Math.max(0, Math.floor(nw.y / 256)); y <= Math.min(n - 1, Math.floor(se.y / 256)); y++) {
      const url = template.replace("{z}", z).replace("{y}", y).replace("{x}", ((x % n) + n) % n);
      jobs.push(loadImage(url).then((img) => { if (img) ctx.drawImage(img, (x * 256 - nw.x) * k, (y * 256 - nw.y) * k, 256 * k + 1, 256 * k + 1); return !!img; }));
    }
  }
  const tiles = await Promise.all(jobs);

  const image = (src, box) => {
    const [x0, y0] = P(box.n, box.w), [x1, y1] = P(box.s, box.e);
    ctx.drawImage(src, x0, y0, x1 - x0, y1 - y0);
  };
  const trace = (geom) => {
    const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
    ctx.beginPath();
    for (const p of polys) for (const ring of p) {
      ring.forEach(([lon, lat], i) => { const [x, y] = P(lat, lon); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
      ctx.closePath();
    }
  };

  if (o.risk) image(o.risk.canvas, o.risk.box);
  if (o.soums) {
    for (const f of o.soums) {
      trace(f.geometry);
      ctx.globalAlpha = 0.72;
      ctx.fillStyle = f.color;
      ctx.fill("evenodd");
      ctx.globalAlpha = 1;
      ctx.strokeStyle = "rgba(255,255,255,.45)";
      ctx.lineWidth = 0.7 * S;
      ctx.stroke();
    }
  }
  for (const line of o.borders ?? []) {
    ctx.strokeStyle = line.color ?? `rgba(255,255,255,${line.opacity})`;
    ctx.fillStyle = line.fill ?? "transparent";
    ctx.lineWidth = line.weight * S;
    for (const f of line.data.features ?? [line.data]) { trace(f.geometry ?? f); if (line.fill) ctx.fill("evenodd"); ctx.stroke(); }
  }
  if (o.plume?.image) image(o.plume.image, o.plume.box);
  if (o.plume?.homes) image(o.plume.homes.canvas, o.plume.homes.box);
  for (const a of o.plume?.arrows ?? []) {
    const [x, y] = P(a.lat, a.lon);
    drawArrow(ctx, x, y, a.angle, arrowLength(a.speed) * S, S);
  }
  if (o.camps) image(o.camps.canvas, o.camps.box);
  if (o.selection) {
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2 * S;
    if (o.selection.geom) { trace(o.selection.geom); ctx.stroke(); } else {
      const [x0, y0] = P(o.selection.box.n, o.selection.box.w), [x1, y1] = P(o.selection.box.s, o.selection.box.e);
      ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
    }
  }

  const result = { canvas: cv, tilesLoaded: tiles.filter(Boolean).length, tilesAsked: tiles.length, bounds: { n: b.getNorth(), s: b.getSouth(), e: b.getEast(), w: b.getWest() } };
  if (o.clean) return result;

  /* map furniture */
  const m = 10 * S, sans = (px, w = 400) => `${w} ${px * S}px system-ui, "Segoe UI", sans-serif`;
  ctx.textBaseline = "top";

  ctx.font = sans(15, 650);
  const titleW = Math.max(ctx.measureText(o.title).width, ...o.subtitle.map((s) => { ctx.font = sans(11.5); return ctx.measureText(s).width; })) + 20 * S;
  panel(ctx, m, m, titleW, (30 + o.subtitle.length * 15) * S, S);
  ctx.fillStyle = "#fff"; ctx.font = sans(15, 650);
  ctx.fillText(o.title, m + 10 * S, m + 8 * S);
  ctx.font = sans(11.5); ctx.fillStyle = "#d6d4cb";
  o.subtitle.forEach((s, i) => ctx.fillText(s, m + 10 * S, m + (28 + i * 15) * S));

  // north arrow
  const ax = W - m - 16 * S, ay = m + 8 * S;
  panel(ctx, ax - 14 * S, ay - 8 * S, 28 * S, 40 * S, S);
  ctx.fillStyle = "#fff";
  ctx.beginPath(); ctx.moveTo(ax, ay + 12 * S); ctx.lineTo(ax + 6 * S, ay + 28 * S); ctx.lineTo(ax, ay + 24 * S); ctx.lineTo(ax - 6 * S, ay + 28 * S); ctx.closePath(); ctx.fill();
  ctx.font = sans(10, 650); ctx.textAlign = "center"; ctx.fillText("N", ax, ay - 2 * S); ctx.textAlign = "left";

  // legend
  const lw = o.legend.length * 66 * S;
  if (lw) panel(ctx, m, H - m - 42 * S, lw + 16 * S, 42 * S, S);
  ctx.font = sans(10.5, 600);
  if (lw) {
    const ramp = ctx.createLinearGradient(m + 8 * S, 0, m + 8 * S + lw, 0);
    o.legend.forEach((c, i) => ramp.addColorStop((i + 0.5) / o.legend.length, c.color));
    ctx.fillStyle = ramp;
    ctx.fillRect(m + 8 * S, H - m - 35 * S, lw, 11 * S);
  }
  o.legend.forEach((c, i) => {
    ctx.fillStyle = "#e8e6df";
    ctx.fillText(c.label, m + 8 * S + i * 66 * S, H - m - 21 * S);
  });

  // scale bar, true at the centre of the view
  const lat = map.getCenter().lat, perPx = (40075016.7 * Math.cos(lat * Math.PI / 180)) / (256 * n) / k;
  const len = niceLength(perPx * W * 0.22), barW = len / perPx, sx = m, sy = H - m - (lw ? 70 : 24) * S;
  panel(ctx, sx, sy - 5 * S, barW + 20 * S, 22 * S, S);
  ctx.fillStyle = "#fff"; ctx.fillRect(sx + 10 * S, sy + 10 * S, barW, 3 * S);
  ctx.font = sans(10); ctx.fillText(`${len >= 1000 ? len / 1000 : len} ${len >= 1000 ? "km" : "m"}`, sx + 10 * S, sy - 2 * S);

  // the possible error, always on the page
  ctx.font = sans(11);
  const boxW = Math.max(...o.error.map((l) => { ctx.font = sans(l.strong ? 12.5 : 11, l.strong ? 650 : 400); return ctx.measureText(l.text).width; })) + 20 * S;
  const boxH = (12 + o.error.length * 16) * S, ex = W - m - boxW, ey = H - m - boxH;
  panel(ctx, ex, ey, boxW, boxH, S);
  o.error.forEach((l, i) => {
    ctx.font = sans(l.strong ? 12.5 : 11, l.strong ? 650 : 400);
    ctx.fillStyle = l.warn ? "#f5c04a" : l.strong ? "#fff" : "#d6d4cb";
    ctx.fillText(l.text, ex + 10 * S, ey + (6 + i * 16) * S);
  });

  return result;
}

export const toJpeg = (cv) => new Promise((ok) => cv.toBlob(ok, "image/jpeg", 0.92));
export const toPng = (cv) => new Promise((ok) => cv.toBlob(ok, "image/png"));

/** One record per grid cell with data. U95 holds input and model error; without a model error it is a lower bound. */
export function cellRows({ grid, cells, frame, uframe, uModel, decode, classOf, label }) {
  const rows = [];
  for (const { r, c, i } of cells) {
    const v = decode(frame[i]);
    if (v === null) continue;
    const u = uframe ? decode(uframe[i]) : null;
    const parts = [u, uModel].filter((x) => x !== null && x !== undefined);
    rows.push({ r, c, lat: +(grid.north - (r + 0.5) * grid.dy).toFixed(2), lon: +(grid.west + (c + 0.5) * grid.dx).toFixed(2), score: +v.toFixed(1), label: label(classOf(v).key),
      u_input: u === null ? null : +u.toFixed(1), u_model: uModel ?? null, U95: parts.length ? +(2 * Math.hypot(...parts)).toFixed(1) : null, U95_min: parts.length < 2 });
  }
  return rows;
}

export function save(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
