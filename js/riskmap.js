/* Colours one national grid into risk zones and puts it on the map.
 *
 * The data grid is regular in latitude and longitude, the map is Web Mercator, and Leaflet stretches an image
 * linearly. Each output row is therefore resampled at its true Mercator latitude; without this a zone in central
 * Mongolia would sit tens of kilometres from where it belongs. Bilinear sampling only smooths the drawing between
 * cell centres. It adds no information: the real resolution is manifest.grid. */
import { NODATA, SCALE } from "./dataset.js";

const merc = (lat) => Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360));
const unmerc = (m) => (2 * Math.atan(Math.exp(m)) - Math.PI / 2) * 180 / Math.PI;

const CENTRES = [10, 30, 50, 70, 90]; // where each class colour sits on the 0-100 score
const FADE = [[0, 0.1], [20, 0.3], [40, 0.55], [60, 0.72], [80, 0.82], [100, 0.88]]; // score, opacity

function between(points, x) {
  if (x <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    if (x <= points[i][0]) { const [a, va] = points[i - 1], [b, vb] = points[i]; return va + (vb - va) * (x - a) / (b - a); }
  }
  return points[points.length - 1][1];
}

/** RGBA of every stored value. The colours flow into each other, and low scores melt into the image below,
 * which draws the same numbers as before without hard edges at the class limits. */
export function rampLut(colors) {
  const rgb = colors.map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)));
  const lut = new Uint8ClampedArray(251 * 4);
  for (let v = 0; v <= 250; v++) {
    const s = v * SCALE;
    for (let c = 0; c < 3; c++) lut[v * 4 + c] = between(CENTRES.map((x, i) => [x, rgb[i][c]]), s);
    lut[v * 4 + 3] = between(FADE, s) * 255;
  }
  return lut;
}

export function createRiskLayer(map, grid, outline) {
  const L = window.L;
  const { west, north, dx, dy, nx, ny } = grid;
  const south = north - ny * dy, east = west + nx * dx;
  const W = Math.min(nx * 4, 1600), y0 = merc(north), y1 = merc(south);
  const H = Math.round(W * (y0 - y1) / ((east - west) * Math.PI / 180));
  const rows = new Float32Array(H);
  for (let j = 0; j < H; j++) rows[j] = (north - unmerc(y0 + (j + 0.5) / H * (y1 - y0))) / dy - 0.5;

  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d");
  let lut = null;

  map.createPane("riskPane").style.zIndex = 350;
  const overlay = L.imageOverlay("data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==", [[south, west], [north, east]], { pane: "riskPane", interactive: false, opacity: 1 });
  overlay.addTo(map);
  let url = null, frame = null, uframe = null;

  function maskToOutline() {
    if (!outline) return;
    ctx.globalCompositeOperation = "destination-in";
    ctx.beginPath();
    const ring = (r) => r.forEach(([lon, lat], i) => {
      const x = (lon - west) / (east - west) * W, y = (merc(lat) - y0) / (y1 - y0) * H;
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    });
    for (const f of outline.features ?? [outline]) {
      const g = f.geometry ?? f;
      const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
      for (const p of polys) for (const r of p) { ring(r); ctx.closePath(); }
    }
    ctx.fillStyle = "#000";
    ctx.fill("evenodd");
    ctx.globalCompositeOperation = "source-over";
  }

  function draw() {
    const img = ctx.createImageData(W, H), px = img.data;
    if (frame) {
      for (let j = 0; j < H; j++) {
        const fr = rows[j], r0 = Math.floor(fr), ty = fr - r0;
        for (let i = 0; i < W; i++) {
          const fc = (i + 0.5) / W * nx - 0.5, c0 = Math.floor(fc), tx = fc - c0;
          let sum = 0, wsum = 0;
          for (let a = 0; a < 2; a++) {
            const r = r0 + a;
            if (r < 0 || r >= ny) continue;
            const wy = a ? ty : 1 - ty;
            for (let b = 0; b < 2; b++) {
              const c = c0 + b;
              if (c < 0 || c >= nx) continue;
              const v = frame[r * nx + c];
              if (v === NODATA) continue;
              const w = wy * (b ? tx : 1 - tx);
              sum += w * v; wsum += w;
            }
          }
          if (wsum < 0.5) continue;
          const k = Math.round(sum / wsum) * 4, o = (j * W + i) * 4;
          px[o] = lut[k]; px[o + 1] = lut[k + 1]; px[o + 2] = lut[k + 2]; px[o + 3] = lut[k + 3];
        }
      }
    }
    ctx.putImageData(img, 0, 0);
    if (frame) maskToOutline();
    cv.toBlob((blob) => {
      if (!blob) return;
      const next = URL.createObjectURL(blob);
      overlay.setUrl(next);
      if (url) URL.revokeObjectURL(url);
      url = next;
    });
  }

  return {
    canvas: cv,
    box: { n: north, s: south, w: west, e: east },
    /** A null frame clears the map: a day with no data must not keep showing another day's zones. */
    setFrame(values, uncertainty, colors) { frame = values; uframe = uncertainty ?? null; if (colors) lut = rampLut(colors); draw(); },
    setOpacity(o) { overlay.setOpacity(o); },
    /** Score and standard uncertainty of the cell under a point, or null. */
    sample(lat, lon) {
      if (!frame) return null;
      const r = Math.floor((north - lat) / dy), c = Math.floor((lon - west) / dx);
      if (r < 0 || r >= ny || c < 0 || c >= nx) return null;
      const v = frame[r * nx + c];
      if (v === NODATA) return null;
      const u = uframe ? uframe[r * nx + c] : NODATA;
      return { score: v * SCALE, u: u === NODATA ? null : u * SCALE };
    },
  };
}
