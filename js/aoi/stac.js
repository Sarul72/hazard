/* Reading satellite archives straight from the browser: Microsoft Planetary Computer, free and without an account.
 * STAC search finds the scenes. The Planetary Computer's data API then cuts each scene to the chosen box on its own
 * servers and sends only that part, already on the grid of the result, as a small 8-bit PNG (or, for elevation, as
 * 32-bit numbers). Reading the whole 32-bit radar files from the browser took minutes on a slow line; this takes seconds. */

const API = "https://planetarycomputer.microsoft.com/api";
const BLOCK = 1024; // pixels per side of one request

async function json(url, init) {
  const r = await fetch(url, init);
  if (!r.ok) throw new Error(`${r.status} ${url.split("?")[0]}`);
  return r.json();
}

/** Every item of a collection over a box {s, n, w, e} in a period of ISO days (both ends counted). */
export async function search(collection, box, from, to, limit = 200) {
  const body = { collections: [collection], bbox: [box.w, box.s, box.e, box.n], limit: 100 };
  if (from) body.datetime = `${from}T00:00:00Z/${to}T23:59:59Z`;
  const out = [];
  let url = `${API}/stac/v1/search`, init = { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
  while (url && out.length < limit) {
    const page = await json(url, init);
    out.push(...page.features);
    const next = page.links?.find((l) => l.rel === "next");
    if (!next) break;
    url = next.href;
    init = next.method === "POST" ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(next.body) } : undefined;
  }
  return out;
}

/** MODIS sinusoidal tiles {h, v} touching a box. The catalogue's footprints of some tiles are wrong (h26v04, which
 * covers eastern Dornod, is not found by a box search), so MODIS files are looked up by tile number instead. */
export function modisTiles(box) {
  const R = 6371007.181, T = 1111950.5197665, X0 = 20015109.354, Y0 = 10007554.677, rad = Math.PI / 180, out = new Map();
  for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) {
    const lat = box.s + (box.n - box.s) * i / 4, lon = box.w + (box.e - box.w) * j / 4;
    const h = Math.floor((R * lon * rad * Math.cos(lat * rad) + X0) / T), v = Math.floor((Y0 - R * lat * rad) / T);
    out.set(`${h}/${v}`, { h, v });
  }
  return [...out.values()];
}

/** MODIS items of a collection over a box in a period, found by tile number. */
export async function searchModis(collection, box, from, to) {
  const out = [];
  for (const { h, v } of modisTiles(box)) {
    const body = { collections: [collection], datetime: `${from}T00:00:00Z/${to}T23:59:59Z`, limit: 100,
      query: { "modis:horizontal-tile": { eq: h }, "modis:vertical-tile": { eq: v } } };
    const page = await json(`${API}/stac/v1/search`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    out.push(...page.features);
  }
  return out;
}

/** Group items whose times lie within an hour: the frames of one satellite pass. */
export function passes(items) {
  const sorted = [...items].sort((a, b) => Date.parse(a.properties.datetime) - Date.parse(b.properties.datetime));
  const out = [];
  for (const it of sorted) {
    const t = Date.parse(it.properties.datetime), last = out[out.length - 1];
    if (last && t - last.t0 <= 3600000) last.items.push(it); else out.push({ t0: t, items: [it] });
  }
  return out;
}

const blocks = (g) => {
  const out = [];
  for (let r = 0; r < g.h; r += BLOCK) for (let c = 0; c < g.w; c += BLOCK) out.push({ r, c, h: Math.min(BLOCK, g.h - r), w: Math.min(BLOCK, g.w - c) });
  return out;
};
const blockUrl = (g, b, item, query, format) => {
  const w = g.west + b.c * g.dx, e = w + b.w * g.dx, n = g.north - b.r * g.dy, s = n - b.h * g.dy;
  const q = new URLSearchParams({ collection: item.collection, item: item.id, ...query });
  return `${API}/data/v1/item/bbox/${w},${s},${e},${n}/${b.w}x${b.h}.${format}?${q}`;
};

async function pngValues(url, w, h) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} data API`);
  const bmp = await createImageBitmap(await r.blob(), { colorSpaceConversion: "none", premultiplyAlpha: "none" });
  const cv = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(w, h) : Object.assign(document.createElement("canvas"), { width: w, height: h });
  const ctx = cv.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0);
  return ctx.getImageData(0, 0, w, h).data;
}

/** One band of `item` on grid `g` as numbers: `query` names the asset or an expression and the `rescale` that maps it
 * to 0-255; `decode` turns the byte back into the value. Pixels without data stay NaN; with `into` they fill its gaps. */
export async function bandOnGrid(g, item, query, decode, into = null) {
  const out = into ?? new Float32Array(g.w * g.h).fill(NaN);
  await Promise.all(blocks(g).map(async (b) => {
    const px = await pngValues(blockUrl(g, b, item, query, "png"), b.w, b.h);
    for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
      const i = (y * b.w + x) * 4, o = (b.r + y) * g.w + b.c + x;
      if (px[i + 3] === 0 || !Number.isNaN(out[o])) continue;
      out[o] = decode(px[i]);
    }
  }));
  return out;
}

/** 32-bit values (NumPy file: band then mask) for data that 8 bits cannot hold, such as elevation. */
export async function floatOnGrid(g, item, query, into = null) {
  const out = into ?? new Float32Array(g.w * g.h).fill(NaN);
  await Promise.all(blocks(g).map(async (b) => {
    const r = await fetch(blockUrl(g, b, item, query, "npy"));
    if (!r.ok) throw new Error(`${r.status} data API`);
    const { data, shape } = parseNpy(await r.arrayBuffer());
    const n = b.w * b.h, bands = shape.length === 3 ? shape[0] : 1;
    for (let k = 0; k < n; k++) {
      const o = (b.r + Math.floor(k / b.w)) * g.w + b.c + (k % b.w);
      const ok = bands < 2 || data[n * (bands - 1) + k] > 0;
      if (ok && Number.isNaN(out[o])) out[o] = data[k];
    }
  }));
  return out;
}

/** A NumPy .npy file (version 1 or 2) of little-endian float32, uint8 or int16 values. */
export function parseNpy(buf) {
  const u8 = new Uint8Array(buf);
  if (u8[0] !== 0x93 || String.fromCharCode(...u8.slice(1, 6)) !== "NUMPY") throw new Error("not a .npy file");
  const v = u8[6], hl = v === 1 ? u8[8] | (u8[9] << 8) : new DataView(buf).getUint32(8, true), start = v === 1 ? 10 : 12;
  const header = new TextDecoder().decode(u8.slice(start, start + hl));
  const descr = /'descr':\s*'([^']+)'/.exec(header)[1], shape = /'shape':\s*\(([^)]*)\)/.exec(header)[1].split(",").map((s) => s.trim()).filter(Boolean).map(Number);
  const off = start + hl, T = { "<f4": Float32Array, "|u1": Uint8Array, "<i2": Int16Array, "<u2": Uint16Array, "<f8": Float64Array }[descr];
  if (!T) throw new Error("npy type " + descr);
  return { data: new T(buf.slice(off)), shape };
}

/** A colour picture of `item` on grid `g` (the data API's own rendering of an RGB asset, such as Sentinel-2 "visual"),
 * as RGBA bytes. Only pixels still transparent in `into` are filled, so several scenes can be laid one after another. */
export async function rgbOnGrid(g, item, query, into = null) {
  const out = into ?? new Uint8ClampedArray(g.w * g.h * 4);
  await Promise.all(blocks(g).map(async (b) => {
    const px = await pngValues(blockUrl(g, b, item, query, "png"), b.w, b.h);
    for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
      const i = (y * b.w + x) * 4, o = ((b.r + y) * g.w + b.c + x) * 4;
      if (px[i + 3] === 0 || out[o + 3] !== 0 || (px[i] === 0 && px[i + 1] === 0 && px[i + 2] === 0)) continue;
      out[o] = px[i]; out[o + 1] = px[i + 1]; out[o + 2] = px[i + 2]; out[o + 3] = 255;
    }
  }));
  return out;
}
