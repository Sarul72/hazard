#!/usr/bin/env node
/* Build data/eic_snow.json: which of EIC's snow-cover WMS layers hold an image. EIC names a layer for every dekad of
 * every winter in advance, and most of the older ones come back blank, so the dzud tab needs this list to pick a real
 * one (js/dzud_data.js snowLayer). A browser cannot check it itself: eic.mn sends no CORS headers.
 * Run by .github/workflows/eic-snow.yml each day, or by hand: `node scripts/build-eic-snow.mjs`.
 * A failed request leaves the old file as it is. */
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { EIC_SNOW_WMS, SNOW_NAME } from "../js/dzud_data.js";

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "eic_snow.json");
const MIN_BYTES = 1000; // a blank 200x90 PNG is 150 bytes; a real image is over 20 kB
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const DEKADS = ["first", "second", "third"];

async function get(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r;
}

/** The first day of a layer's dekad, so layers not begun yet are not asked for. */
function start(name) {
  const [, m, d, y] = SNOW_NAME.exec(name);
  return new Date(Date.UTC(Number(y), MONTHS.indexOf(m), [1, 11, 21][DEKADS.indexOf(d)]));
}

const caps = await (await get(`${EIC_SNOW_WMS}&SERVICE=WMS&REQUEST=GetCapabilities&VERSION=1.3.0`)).text();
const names = [...caps.matchAll(/<Name>(snowimage[a-z]+\d{4})<\/Name>/g)].map((m) => m[1])
  .filter((n) => SNOW_NAME.test(n) && start(n) <= new Date());
const layers = [];
for (const n of names) {
  const png = await (await get(`${EIC_SNOW_WMS}&SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&STYLES=&CRS=EPSG:4326` +
    `&BBOX=41,87,52,120&WIDTH=200&HEIGHT=90&FORMAT=image/png&TRANSPARENT=true&LAYERS=${n}`)).arrayBuffer();
  if (png.byteLength > MIN_BYTES) layers.push(n);
  await new Promise((r) => setTimeout(r, 200)); // one small request at a time: it is a single CGI server
}
if (!layers.length) throw new Error(`none of ${names.length} snow layers holds an image: not overwriting ${out}`);
layers.sort((a, b) => start(a) - start(b));
const old = existsSync(out) ? JSON.parse(await readFile(out, "utf8")) : null;
if (old && JSON.stringify(old.layers) === JSON.stringify(layers)) {
  console.log(`eic_snow: unchanged, ${layers.length} of ${names.length} layers with an image`);
} else {
  await writeFile(out, JSON.stringify({ source: "Байгаль орчны мэдээллийн сан (eic.mn), MODIS snow cover",
    checked: new Date().toISOString().slice(0, 10), layers }, null, 1) + "\n");
  console.log(`eic_snow: ${layers.length} of ${names.length} layers with an image, last ${layers.at(-1)}`);
}
