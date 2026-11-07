/* Winter and spring camps inside the selected area. data/camps.bin.gz holds positions rounded to about 1 km and counts only:
 * no person, parcel or phone. Without the file the area window simply has no camp block. */
import { bytes, decode } from "./dataset.js";
import { inFeature } from "./soums.js";

const STEP = 0.01, LON0 = 87, LAT0 = 41;
let camps = null;

export function loadCamps() {
  camps ??= bytes("data/camps.bin.gz").then((b) => new Uint16Array(b.buffer, b.byteOffset, b.byteLength / 2)).catch(() => null);
  return camps;
}

/** Camp locations inside a box {s, n, w, e}, and inside `geom` when it is given. */
export function campsInside(a, box, geom) {
  const out = [];
  for (let i = 0; i < a.length; i += 4) {
    const lon = LON0 + a[i] * STEP, lat = LAT0 + a[i + 1] * STEP;
    if (lat < box.s || lat > box.n || lon < box.w || lon > box.e) continue;
    if (geom && !inFeature(lon, lat, geom)) continue;
    out.push({ lon, lat, herders: a[i + 2], parcels: a[i + 3] });
  }
  return out;
}

const cellOf = (p, grid) => {
  const r = Math.floor((grid.north - p.lat) / grid.dy), c = Math.floor((p.lon - grid.west) / grid.dx);
  return r >= 0 && r < grid.ny && c >= 0 && c < grid.nx ? r * grid.nx + c : -1;
};

/** Exposure: how many camps lie in each risk class on the day. `U` moves every score up and down by the possible error,
 * which turns the error of the map into a range for the number of exposed camps. */
export function campsReport(points, frame, grid, classes, U) {
  const blank = () => ({ total: 0, byClass: classes.map(() => 0), high: 0, highLow: 0, highHigh: 0, noData: 0 });
  const rep = { herders: blank(), parcels: blank(), locations: points.length };
  for (const p of points) {
    const i = cellOf(p, grid), v = i < 0 || !frame ? null : decode(frame[i]);
    p.score = v;
    for (const [key, n] of [["herders", p.herders], ["parcels", p.parcels]]) {
      const b = rep[key];
      b.total += n;
      if (v === null) { b.noData += n; continue; }
      b.byClass[classes.findIndex((c) => v < c.max)] += n;
      if (v >= 60) b.high += n;
      if (v - U >= 60) b.highLow += n;
      if (v + U >= 60) b.highHigh += n;
    }
  }
  return rep;
}

const merc = (lat) => Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360));

/** A ger seen from the side: round walls under a low dome, with a door. `s` is half its width. */
function drawGer(ctx, x, y, s, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(x - s, y + 0.72 * s);
  ctx.lineTo(x - s, y + 0.08 * s);
  ctx.quadraticCurveTo(x - 0.42 * s, y - 0.62 * s, x, y - 0.92 * s);
  ctx.quadraticCurveTo(x + 0.42 * s, y - 0.62 * s, x + s, y + 0.08 * s);
  ctx.lineTo(x + s, y + 0.72 * s);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "rgba(24, 26, 28, .78)";
  ctx.fillRect(x - 0.22 * s, y + 0.06 * s, 0.44 * s, 0.66 * s);
}

/** Camps on a transparent canvas covering `box`, in Web Mercator rows: tiny white gers with a hairline edge, which stay visible on
 * every colour and on snow. `scale` is canvas pixels per screen pixel. Where there are too many to tell apart they become
 * fine dots, so that a large area stays a light speckle and never turns into a patch. `tint` can colour a camp. */
export function campsCanvas(points, box, width = 1600, scale = 1, tint = () => "rgba(255, 255, 255, .94)") {
  const y0 = merc(box.n), y1 = merc(box.s), span = (box.e - box.w) * Math.PI / 180;
  const W = width, H = Math.max(2, Math.round(W * (y0 - y1) / span));
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d"), n = Math.max(points.length, 1), s = 2.9 * scale, gers = n * (2.4 * s) ** 2 <= 0.3 * W * H;
  const r = Math.min(0.8 * scale, Math.sqrt(0.18 * W * H / (n * Math.PI)));
  ctx.lineWidth = 0.3 * scale;
  ctx.strokeStyle = "rgba(0, 0, 0, .6)";
  for (const p of points) {
    const x = (p.lon - box.w) / (box.e - box.w) * W, y = (y0 - merc(p.lat)) / (y0 - y1) * H;
    if (gers) { drawGer(ctx, x, y, s, tint(p)); continue; }
    ctx.fillStyle = tint(p);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 7);
    ctx.fill();
    if (r > 0.5 * scale) ctx.stroke();
  }
  return cv;
}
