/* Reads the grids that the Earth Engine pipeline writes to data/gee. No value is ever invented here:
 * a missing file or cell stays missing.
 *
 * manifest.json             grid, date range, band order, sources, verification, uncertainty
 * daily/YYYY-MM.bin.gz      uint8 [day][band][ny][nx], one file per month, bands in manifest.daily_bands
 * monthly_<hazard>.bin.gz   uint8 [month][ny][nx], mean score, from manifest.first_month
 * highdays_<hazard>.bin.gz  uint8 [year][ny][nx], days with score >= 60, from manifest.first_year
 *
 * Scores are stored as value / 0.4 so 0..100 fits in 0..250. 255 means no data.
 * The input uncertainty of a cell comes from manifest.uncertainty[hazard].u_input, a table over the score. */

const BASE = "data/gee/";
export const NODATA = 255;
export const SCALE = 0.4;
export const decode = (v) => (v === NODATA ? null : v * SCALE);
export const decodeCount = (v) => (v === NODATA ? null : v);

export async function bytes(url) {
  const res = await fetch(url);
  if (!res.ok) { const e = new Error(`${url}: HTTP ${res.status}`); e.status = res.status; throw e; }
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf[0] !== 0x1f || buf[1] !== 0x8b) return buf; // already decoded by the server
  const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function loadManifest() {
  const res = await fetch(BASE + "manifest.json", { cache: "no-cache" });
  if (!res.ok) return null;
  const m = await res.json();
  const g = m.grid;
  if (!g || !(g.nx > 0) || !(g.ny > 0) || !Array.isArray(m.daily_bands)) throw new Error("manifest.json is not valid");
  return m;
}

const months = new Map();

/** One month of days, fetched once: stepping through the days of a month then costs nothing. */
function loadMonth(ym) {
  if (!months.has(ym)) {
    months.set(ym, bytes(`${BASE}daily/${ym}.bin.gz`).catch((e) => { months.delete(ym); if (e.status === 404) return null; throw e; }));
    if (months.size > 6) months.delete(months.keys().next().value);
  }
  return months.get(ym);
}

/** Stored score -> stored standard uncertainty, from the table of the manifest (linear between its points). */
function uncertaintyTable(table) {
  const lut = new Uint8Array(256).fill(NODATA);
  if (!table?.length) return lut;
  const step = 100 / (table.length - 1);
  for (let s = 0; s <= 250; s++) {
    const x = s * SCALE / step, i = Math.min(Math.floor(x), table.length - 2), t = x - i;
    lut[s] = Math.round((table[i] * (1 - t) + table[i + 1] * t) / SCALE);
  }
  return lut;
}

const luts = new Map();
const lutOf = (m, h) => {
  if (!luts.has(h)) luts.set(h, uncertaintyTable(m.uncertainty?.[h]?.u_input));
  return luts.get(h);
};

/** All bands of one day, or null when that day was not computed. */
export async function loadDaily(m, date) {
  const pack = await loadMonth(date.slice(0, 7));
  if (!pack) return null;
  const n = m.grid.nx * m.grid.ny, nb = m.daily_bands.length, start = (Number(date.slice(8)) - 1) * n * nb;
  if (start + n * nb > pack.length) return null;
  const out = {};
  let any = false;
  m.daily_bands.forEach((b, i) => {
    out[b] = pack.subarray(start + i * n, start + (i + 1) * n);
    any ||= out[b].some((v) => v !== NODATA);
    const lut = lutOf(m, b);
    out["u_" + b] = out[b].map((v) => lut[v]);
  });
  if (!any) return null;
  return composite(out, n, m.daily_bands);
}

/** Combined view: the highest hazard in each cell, with the uncertainty of that hazard. */
function composite(d, n, bands) {
  const v = new Uint8Array(n).fill(NODATA), u = new Uint8Array(n).fill(NODATA);
  for (let i = 0; i < n; i++) {
    for (const h of bands) {
      const s = d[h][i];
      if (s !== NODATA && (v[i] === NODATA || s > v[i])) { v[i] = s; u[i] = d["u_" + h][i]; }
    }
  }
  d.all = v;
  d.u_all = u;
  return d;
}

const cubes = new Map();

/** Long-term stack, fetched once when an area is first selected. */
export function loadCube(m, name) {
  if (!cubes.has(name)) {
    cubes.set(name, bytes(`${BASE}${name}.bin.gz`).then((data) => {
      const n = m.grid.nx * m.grid.ny;
      if (data.length % n) throw new Error(`${name}: size is not a whole number of frames`);
      return { data, n, frames: data.length / n, frame: (f) => data.subarray(f * n, (f + 1) * n) };
    }).catch((e) => { cubes.delete(name); throw e; }));
  }
  return cubes.get(name);
}
