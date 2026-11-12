/* The satellite picture behind a detailed result in its window: the clearest Sentinel-2 true-colour pass (10 m) of a
 * period, cut to the result's own grid by the Planetary Computer's data API, free and without a key. It is fetched
 * only when the window asks for it, so the check itself is not slowed down. */
import { search, passes, rgbOnGrid } from "./stac.js";

const cloud = (it) => it.properties["eo:cloud_cover"] ?? 100;
const day = (ms) => new Date(ms).toISOString().slice(0, 10);

/** {canvas, date, cloud} of the clearest pass between `from` and `to` (ISO days), or null when there is none.
 * Gaps at scene edges are filled from the next clearest passes, at most three in all. */
export async function backdrop(grid, from, to) {
  const box = { s: grid.north - grid.h * grid.dy, n: grid.north, w: grid.west, e: grid.west + grid.w * grid.dx };
  const items = await search("sentinel-2-l2a", box, from, to);
  if (!items.length) return null;
  const ranked = passes(items).map((p) => ({ ...p, cloud: p.items.reduce((s, it) => s + cloud(it), 0) / p.items.length })).sort((a, b) => a.cloud - b.cloud);
  const rgba = new Uint8ClampedArray(grid.w * grid.h * 4), used = [];
  for (const p of ranked.slice(0, 3)) {
    for (const it of p.items) await rgbOnGrid(grid, it, { assets: "visual" }, rgba);
    used.push(p);
    let empty = 0;
    for (let i = 3; i < rgba.length; i += 4) if (!rgba[i]) empty++;
    if (empty < 0.01 * grid.w * grid.h) break;
  }
  const canvas = document.createElement("canvas");
  canvas.width = grid.w; canvas.height = grid.h;
  canvas.getContext("2d").putImageData(new ImageData(rgba, grid.w, grid.h), 0, 0);
  return { canvas, date: used.map((p) => day(p.t0)).join(", "), cloud: Math.round(used[0].cloud) };
}
