/* Turns a set of grid cells and the stored grids into the numbers of the area window.
 * Used for a drawn box and for a soum alike, so both are computed the same way. */
import { cellsMean, combineUncertainty, fin, samplingUncertainty, spatialLag1, trendReport } from "./stats.js";
import { gumbelFit, returnLevel } from "./flood_stats.js";
import { decode, decodeCount } from "./dataset.js";

export const HIGH_SCORE = 60;
const KM2_PER_DEG2 = 111.32 * 111.32;

/** Area in km2 of the cells that hold data in `frame`. */
export function validAreaKm2(cells, frame, grid) {
  let a = 0;
  for (const { i, w } of cells) if (decode(frame[i]) !== null) a += w;
  return a * grid.dx * grid.dy * KM2_PER_DEG2;
}

/** Mean score of each month. A month with no data stays null. */
export function monthSeries(cube, firstMonth, cells) {
  const [y0, m0] = firstMonth.split("-").map(Number), out = [];
  for (let f = 0; f < cube.frames; f++) {
    const k = m0 - 1 + f, y = y0 + Math.floor(k / 12), m = (k % 12) + 1, r = cellsMean(cube.frame(f), cells, decode);
    out.push({ y, m, t: y + (m - 0.5) / 12, v: r ? r.mean : null });
  }
  return out;
}

/** Yearly means. Only years with all 12 months count: a partial year would bias the trend towards its season. */
export function yearSeries(months) {
  const by = new Map();
  for (const r of months) {
    if (!by.has(r.y)) by.set(r.y, []);
    if (fin(r.v)) by.get(r.y).push(r.v);
  }
  return [...by].map(([y, v]) => ({ y, v: v.length === 12 ? v.reduce((a, b) => a + b, 0) / 12 : null, peak: v.length === 12 ? Math.max(...v) : null, months: v.length }));
}

/** High-risk days per year, summed from the monthly counts. A year missing a month has no total: it would read too low. */
export function highDaySeries(cube, firstMonth, cells) {
  const [y0, m0] = firstMonth.split("-").map(Number), by = new Map();
  for (let f = 0; f < cube.frames; f++) {
    const y = y0 + Math.floor((m0 - 1 + f) / 12), r = cellsMean(cube.frame(f), cells, decodeCount);
    const rec = by.get(y) ?? { sum: 0, n: 0 };
    if (r) { rec.sum += r.mean; rec.n += 1; }
    by.set(y, rec);
  }
  return [...by].map(([y, r]) => ({ y, v: r.n === 12 ? r.sum : null }));
}

/** Combined uncertainty of the area mean on one day (JCGM 100). */
export function dayReport({ frame, uframe, cells, grid, classes, uModel }) {
  const m = cellsMean(frame, cells, decode);
  if (!m) return null;
  const rho = spatialLag1(frame, cells, decode, grid.nx);
  const uSampling = samplingUncertainty(m.sd, m.neff, rho);
  const uInput = uframe ? cellsMean(uframe, cells, decode)?.mean ?? null : null;
  const budget = combineUncertainty({ input: uInput, model: uModel ?? null, sampling: uSampling });
  let max = -Infinity, total = 0;
  const share = classes.map(() => 0);
  for (const { i, w } of cells) {
    const v = decode(frame[i]);
    if (v === null) continue;
    if (v > max) max = v;
    total += w;
    share[classes.findIndex((c) => v < c.max)] += w;
  }
  return { mean: m.mean, sd: m.sd, max, coverage: m.coverage, budget, share: share.map((s) => s / total), area: validAreaKm2(cells, frame, grid) };
}

/** Long-term block: trend, high-risk days and return levels of the highest monthly mean of each year. */
export function longReport({ months, high }) {
  const years = yearSeries(months), whole = years.filter((r) => fin(r.v));
  const trend = trendReport(years.map((r) => r.y), years.map((r) => r.v));
  const days = high.filter((r) => fin(r.v)).map((r) => r.v);
  const peaks = whole.map((r) => r.peak);
  const fit = gumbelFit(peaks);
  const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
  const worst = high.reduce((b, r) => (fin(r.v) && (!b || r.v > b.v) ? r : b), null);
  return {
    years, trend, high,
    highMean: mean(days), highWorst: worst,
    rl: fit ? { t5: returnLevel(fit, 5), t20: returnLevel(fit, 20), n: fit.n } : null,
  };
}

export function toCsv({ label, hazard, months, years, high }) {
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const lines = ["area,hazard,period,kind,mean_score,high_risk_days"];
  const num = (v, d) => (fin(v) ? v.toFixed(d) : "");
  const byYear = new Map(high.map((r) => [r.y, r.v]));
  for (const r of months) lines.push([q(label), hazard, `${r.y}-${String(r.m).padStart(2, "0")}`, "month", num(r.v, 2), ""].join(","));
  for (const r of years) lines.push([q(label), hazard, r.y, "year", num(r.v, 2), num(byYear.get(r.y), 1)].join(","));
  return lines.join("\r\n");
}
