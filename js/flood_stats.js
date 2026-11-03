/* Return levels of river discharge from a daily reanalysis series.
 * Annual maxima + Gumbel (EV1) fitted by L-moments (Hosking 1990). GloFAS alert levels use the same idea:
 * 2-, 5- and 20-year return levels from a long reanalysis. Pure functions. */

const EULER = 0.5772156649015329;

/** Annual maxima for calendar years with at least `minCoverage` of their days present. */
export function annualMaxima(times, values, minCoverage = 0.9) {
  const byYear = new Map();
  for (let i = 0; i < times.length; i++) {
    const y = times[i].slice(0, 4);
    const rec = byYear.get(y) || { n: 0, max: -Infinity };
    const v = values[i];
    if (typeof v === "number" && Number.isFinite(v)) { rec.n++; if (v > rec.max) rec.max = v; }
    byYear.set(y, rec);
  }
  const out = [];
  for (const [y, r] of [...byYear.entries()].sort()) {
    const days = (Number(y) % 4 === 0 && (Number(y) % 100 !== 0 || Number(y) % 400 === 0)) ? 366 : 365;
    if (r.n >= minCoverage * days && Number.isFinite(r.max)) out.push({ year: Number(y), max: r.max });
  }
  return out;
}

/** Gumbel parameters (location mu, scale beta) from L-moments. Needs n >= 10 and positive spread. */
export function gumbelFit(maxima) {
  const x = [...maxima].sort((a, b) => a - b);
  const n = x.length;
  if (n < 10) return null;
  const b0 = x.reduce((s, v) => s + v, 0) / n;
  const b1 = x.reduce((s, v, i) => s + (i / (n - 1)) * v, 0) / n;
  const l1 = b0, l2 = 2 * b1 - b0;
  if (!(l2 > 0)) return null;
  const beta = l2 / Math.LN2;
  return { mu: l1 - EULER * beta, beta, n };
}

export function returnLevel(fit, T) {
  return fit.mu - fit.beta * Math.log(-Math.log(1 - 1 / T));
}

/** 2-, 5- and 20-year return levels, or null when the record is too short or the river too small. */
export function thresholdsFromSeries(times, values, { minYears = 25, minMeanAnnualMax = 0.5 } = {}) {
  const am = annualMaxima(times, values);
  if (am.length < minYears) return null;
  const mean = am.reduce((s, a) => s + a.max, 0) / am.length;
  if (mean < minMeanAnnualMax) return null;
  const fit = gumbelFit(am.map((a) => a.max));
  if (!fit) return null;
  const q2 = returnLevel(fit, 2), q5 = returnLevel(fit, 5), q20 = returnLevel(fit, 20);
  if (!(q2 > 0 && q5 > q2 && q20 > q5)) return null;
  return { q2, q5, q20, years: am.length, method: "gumbel_lmoments_annual_maxima" };
}
