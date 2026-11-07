/* Download what is on screen: a JPEG with legend, scale and the possible error in a corner, and, if wanted, the numbers behind
 * it as CSV, GeoTIFF and a report. All of it is built in the browser from the files the page already reads. */
import { maxNativeZoom, tileTemplate } from "./gibs.js";

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
  if (o.outline) {
    ctx.strokeStyle = "rgba(255,255,255,.85)";
    ctx.lineWidth = 1.4 * S;
    for (const f of o.outline.features ?? [o.outline]) { trace(f.geometry ?? f); ctx.stroke(); }
  }
  if (o.plume?.image) image(o.plume.image, o.plume.box);
  for (const a of o.plume?.arrows ?? []) {
    const [x, y] = P(a.lat, a.lon), len = (8 + Math.min(a.speed, 20)) * S;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a.angle * Math.PI / 180);
    ctx.fillStyle = a.color;
    ctx.beginPath();
    ctx.moveTo(0, -len / 2); ctx.lineTo(len / 3, len / 2); ctx.lineTo(0, len / 4); ctx.lineTo(-len / 3, len / 2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
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
  panel(ctx, m, H - m - 42 * S, lw + 16 * S, 42 * S, S);
  ctx.font = sans(10.5, 600);
  o.legend.forEach((c, i) => {
    const x = m + 8 * S + i * 66 * S;
    ctx.fillStyle = c.color; ctx.fillRect(x, H - m - 35 * S, 64 * S, 11 * S);
    ctx.fillStyle = "#e8e6df"; ctx.fillText(c.label, x, H - m - 21 * S);
  });

  // scale bar, true at the centre of the view
  const lat = map.getCenter().lat, perPx = (40075016.7 * Math.cos(lat * Math.PI / 180)) / (256 * n) / k;
  const len = niceLength(perPx * W * 0.22), barW = len / perPx, sx = m, sy = H - m - 70 * S;
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

  return { canvas: cv, tilesLoaded: tiles.filter(Boolean).length, tilesAsked: tiles.length };
}

export const toJpeg = (cv) => new Promise((ok) => cv.toBlob(ok, "image/jpeg", 0.92));

/** One row per grid cell with data. */
export function cellsCsv({ grid, cells, frame, uframe, uModel, decode, classOf, label }) {
  const rows = ["lat,lon,score,class,u_input,u_model,U95"];
  for (const { r, c, i } of cells) {
    const v = decode(frame[i]);
    if (v === null) continue;
    const u = uframe ? decode(uframe[i]) : null;
    const parts = [u, uModel].filter((x) => x !== null && x !== undefined);
    const U = parts.length ? 2 * Math.hypot(...parts) : null;
    rows.push([(grid.north - (r + 0.5) * grid.dy).toFixed(2), (grid.west + (c + 0.5) * grid.dx).toFixed(2), v.toFixed(1), label(classOf(v).key), u === null ? "" : u.toFixed(1), uModel ?? "", U === null ? "" : U.toFixed(1)].join(","));
  }
  return "﻿" + rows.join("\r\n");
}

/** Two-band float GeoTIFF (score, expanded uncertainty) of the rows and columns the cells cover, EPSG:4326, -9999 = no data. */
export function geoTiff({ grid, cells, frame, uframe, uModel, decode }) {
  const r0 = Math.min(...cells.map((c) => c.r)), r1 = Math.max(...cells.map((c) => c.r));
  const c0 = Math.min(...cells.map((c) => c.c)), c1 = Math.max(...cells.map((c) => c.c));
  const w = c1 - c0 + 1, h = r1 - r0 + 1, NO = -9999;
  const px = new Float32Array(w * h * 2).fill(NO);
  for (const { r, c, i } of cells) {
    const v = decode(frame[i]);
    if (v === null) continue;
    const o = ((r - r0) * w + (c - c0)) * 2, u = uframe ? decode(uframe[i]) : null;
    const parts = [u, uModel].filter((x) => x !== null && x !== undefined);
    px[o] = v;
    if (parts.length) px[o + 1] = 2 * Math.hypot(...parts);
  }
  const noData = new TextEncoder().encode("-9999\0");
  const geoKeys = [1, 1, 0, 3, 1024, 0, 1, 2, 1025, 0, 1, 1, 2048, 0, 1, 4326];
  const SHORT = 3, LONG = 4, ASCII = 2, DOUBLE = 12;
  const tags = [
    [256, LONG, [w]], [257, LONG, [h]], [258, SHORT, [32, 32]], [259, SHORT, [1]], [262, SHORT, [1]], [273, LONG, ["data"]],
    [277, SHORT, [2]], [278, LONG, [h]], [279, LONG, [px.byteLength]], [284, SHORT, [1]], [338, SHORT, [0]], [339, SHORT, [3, 3]],
    [33550, DOUBLE, [grid.dx, grid.dy, 0]], [33922, DOUBLE, [0, 0, 0, grid.west + c0 * grid.dx, grid.north - r0 * grid.dy, 0]],
    [34735, SHORT, geoKeys], [42113, ASCII, noData],
  ];
  const size = { [SHORT]: 2, [LONG]: 4, [DOUBLE]: 8, [ASCII]: 1 };
  const ifdEnd = 8 + 2 + tags.length * 12 + 4;
  let extra = ifdEnd;
  const place = tags.map(([, type, v]) => { const n = v.length * size[type]; if (n <= 4) return null; const at = extra; extra += n + (n % 2); return at; });
  const dataAt = extra, out = new ArrayBuffer(dataAt + px.byteLength), d = new DataView(out);
  d.setUint16(0, 0x4949, true); d.setUint16(2, 42, true); d.setUint32(4, 8, true); d.setUint16(8, tags.length, true);
  const put = (at, type, v) => v.forEach((x, i) => {
    const o = at + i * size[type], value = x === "data" ? dataAt : x;
    if (type === SHORT) d.setUint16(o, value, true); else if (type === LONG) d.setUint32(o, value, true);
    else if (type === DOUBLE) d.setFloat64(o, value, true); else d.setUint8(o, value);
  });
  tags.forEach(([tag, type, v], i) => {
    const at = 10 + i * 12;
    d.setUint16(at, tag, true); d.setUint16(at + 2, type, true); d.setUint32(at + 4, v.length, true);
    if (place[i] === null) put(at + 8, type, [...v]); else { d.setUint32(at + 8, place[i], true); put(place[i], type, [...v]); }
  });
  new Float32Array(out, dataAt).set(px);
  return new Uint8Array(out);
}

const crcTable = Uint32Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
function crc32(b) { let c = -1; for (let i = 0; i < b.length; i++) c = crcTable[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; }

/** A plain ZIP with stored (uncompressed) files: [{ name, data: Uint8Array }]. */
export function zip(files) {
  const enc = new TextEncoder(), parts = [], central = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name), crc = crc32(f.data), head = new DataView(new ArrayBuffer(30));
    [[0, 0x04034b50, 4], [4, 20, 2], [6, 0x0800, 2], [8, 0, 2], [10, 0, 2], [12, 0x21, 2], [14, crc, 4], [18, f.data.length, 4], [22, f.data.length, 4], [26, name.length, 2], [28, 0, 2]]
      .forEach(([o, v, n]) => (n === 4 ? head.setUint32(o, v, true) : head.setUint16(o, v, true)));
    parts.push(new Uint8Array(head.buffer), name, f.data);
    const c = new DataView(new ArrayBuffer(46));
    [[0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [8, 0x0800, 2], [10, 0, 2], [12, 0, 2], [14, 0x21, 2], [16, crc, 4], [20, f.data.length, 4], [24, f.data.length, 4], [28, name.length, 2], [42, offset, 4]]
      .forEach(([o, v, n]) => (n === 4 ? c.setUint32(o, v, true) : c.setUint16(o, v, true)));
    central.push(new Uint8Array(c.buffer), name);
    offset += 30 + name.length + f.data.length;
  }
  const size = central.reduce((s, p) => s + p.length, 0), end = new DataView(new ArrayBuffer(22));
  [[0, 0x06054b50, 4], [8, files.length, 2], [10, files.length, 2], [12, size, 4], [16, offset, 4]].forEach(([o, v, n]) => (n === 4 ? end.setUint32(o, v, true) : end.setUint16(o, v, true)));
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: "application/zip" });
}

export function save(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
