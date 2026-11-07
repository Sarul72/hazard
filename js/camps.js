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

/** Dots on a transparent canvas covering `box`, in Web Mercator rows, coloured by the risk class of the day. */
export function campsCanvas(points, box, classes, width = 1600) {
  const y0 = merc(box.n), y1 = merc(box.s), span = (box.e - box.w) * Math.PI / 180;
  const W = width, H = Math.max(2, Math.round(W * (y0 - y1) / span));
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d"), r = points.length > 4000 ? 2 : 3.5;
  ctx.lineWidth = 1;
  ctx.strokeStyle = "#101214";
  for (const p of points) {
    const k = p.score === null || p.score === undefined ? null : classes.find((c) => p.score < c.max);
    ctx.fillStyle = k ? k.color : "#c3c2b7";
    ctx.beginPath();
    ctx.arc((p.lon - box.w) / (box.e - box.w) * W, (y0 - merc(p.lat)) / (y0 - y1) * H, r, 0, 7);
    ctx.fill();
    ctx.stroke();
  }
  return cv;
}
