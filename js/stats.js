/* Statistics for the area window. Pure functions: no DOM, no network.
 *
 * Trend:       ordinary least squares; lag-1 adjusted effective sample size (Santer et al. 2000);
 *              Cochrane-Orcutt AR(1) regression; Mann-Kendall test and Theil-Sen slope.
 * Detection:   Weatherhead et al. (1998, 2000), n* = [ (2+z_b)/|w0| * sN * sqrt((1+phi)/(1-phi)) ]^(2/3).
 *              Equation (2) of Weatherhead et al. (2000); 2+z_b = 3.3 gives 90 % detection probability.
 * Uncertainty: JCGM 100 (GUM) combination in quadrature with expanded uncertainty U = k * u_c, k = 2.
 *
 * Missing values are kept as null/NaN and skipped. Nothing here invents a value: too little data gives null. */

export const fin = (v) => typeof v === "number" && Number.isFinite(v);

/* ------------------------------------------------------- special functions */
function lnGamma(x) {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x, tmp = x + 5.5, ser = 1.000000000190015;
  tmp -= (x + 0.5) * Math.log(tmp);
  for (const v of c) ser += v / ++y;
  return -tmp + Math.log(2.5066282746310005 * ser / x);
}

function betacf(a, b, x) {
  const TINY = 1e-300, qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1, d = 1 - qab * x / qap;
  if (Math.abs(d) < TINY) d = TINY;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 500; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c; if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d; h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c; if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-14) break;
  }
  return h;
}

/** Regularised incomplete beta function I_x(a, b). */
export function betainc(a, b, x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a : 1 - bt * betacf(b, a, 1 - x) / b;
}

/** Two-sided p value of Student's t. */
export function tPValue(t, df) {
  if (!fin(t) || !(df > 0)) return null;
  return betainc(df / 2, 0.5, df / (df + t * t));
}

/** Upper critical value: P(|T| > q) = alpha. Solved by bisection because df may be non-integer. */
export function tCrit(alpha, df) {
  if (!(df > 0)) return null;
  let lo = 0, hi = 1;
  while (tPValue(hi, df) > alpha && hi < 1e7) hi *= 2;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (tPValue(mid, df) > alpha) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Two-sided normal p value through the regularised incomplete gamma P(1/2, z^2/2). */
export function normPValue(z) {
  if (!fin(z)) return null;
  const x = z * z / 2, a = 0.5;
  if (x === 0) return 1;
  let p;
  if (x < a + 1) {
    let sum = 1 / a, term = sum, n = a;
    for (let i = 0; i < 1000; i++) { n += 1; term *= x / n; sum += term; if (Math.abs(term) < Math.abs(sum) * 1e-15) break; }
    p = 1 - sum * Math.exp(-x + a * Math.log(x) - lnGamma(a));
  } else {
    let b = x + 1 - a, c = 1e300, d = 1 / b, h = d;
    for (let i = 1; i < 1000; i++) {
      const an = -i * (i - a); b += 2;
      d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300;
      c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300;
      d = 1 / d;
      const del = d * c; h *= del;
      if (Math.abs(del - 1) < 1e-15) break;
    }
    p = Math.exp(-x + a * Math.log(x) - lnGamma(a)) * h;
  }
  return p;
}

/* ----------------------------------------------------------------- trends */
function pairs(x, y) {
  const X = [], Y = [];
  for (let i = 0; i < x.length; i++) if (fin(x[i]) && fin(y[i])) { X.push(x[i]); Y.push(y[i]); }
  return [X, Y];
}

/** Ordinary least squares y = a + b x. */
export function ols(x, y) {
  const [X, Y] = pairs(x, y), n = X.length;
  if (n < 3) return null;
  const xm = X.reduce((s, v) => s + v, 0) / n, ym = Y.reduce((s, v) => s + v, 0) / n;
  let sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) { sxx += (X[i] - xm) ** 2; sxy += (X[i] - xm) * (Y[i] - ym); }
  if (sxx === 0) return null;
  const slope = sxy / sxx, intercept = ym - slope * xm;
  const resid = Y.map((v, i) => v - intercept - slope * X[i]);
  const sse = resid.reduce((s, v) => s + v * v, 0);
  const se = Math.sqrt(sse / (n - 2) / sxx);
  const t = se > 0 ? slope / se : null;
  return { n, slope, intercept, se, sxx, sse, resid, t, p: t === null ? null : tPValue(t, n - 2), xm, ym };
}

/** Lag-1 autocorrelation of a zero-mean series. */
export function lag1(r) {
  let num = 0, den = 0;
  for (let i = 0; i < r.length; i++) { den += r[i] * r[i]; if (i > 0) num += r[i] * r[i - 1]; }
  return den > 0 ? num / den : 0;
}

/** Santer et al. (2000): n_e = n (1 - r1) / (1 + r1); the variance uses n_e - 2. A negative r1 is not rewarded. */
export function adjustedTrend(fit) {
  if (!fit) return null;
  const r1 = lag1(fit.resid), rr = Math.max(r1, 0);
  const ne = fit.n * (1 - rr) / (1 + rr);
  if (ne <= 2) return { r1, ne, se: null, p: null, ci: null };
  const df = ne - 2, se = Math.sqrt(fit.sse / df / fit.sxx), t = fit.slope / se, q = tCrit(0.05, df);
  return { r1, ne, df, se, t, p: tPValue(t, df), ci: [fit.slope - q * se, fit.slope + q * se] };
}

/** Cochrane-Orcutt regression with AR(1) errors. */
export function olsAr1(x, y, maxIter = 50) {
  const [X, Y] = pairs(x, y);
  const first = ols(X, Y);
  if (!first || first.n < 5) return null;
  let phi = lag1(first.resid), fit = null, a = first.intercept, b = first.slope;
  for (let it = 0; it < maxIter; it++) {
    if (Math.abs(phi) >= 0.999) return null;
    const xs = [], ys = [];
    for (let i = 1; i < X.length; i++) { xs.push(X[i] - phi * X[i - 1]); ys.push(Y[i] - phi * Y[i - 1]); }
    fit = ols(xs, ys);
    if (!fit) return null;
    b = fit.slope; a = fit.intercept / (1 - phi);
    const next = lag1(Y.map((v, i) => v - a - b * X[i]));
    const done = Math.abs(next - phi) < 1e-8;
    phi = next;
    if (done) break;
  }
  return { slope: b, intercept: a, se: fit.se, p: fit.p, phi };
}

/** Mann-Kendall test with the tie correction of the variance. */
export function mannKendall(y) {
  const v = y.filter(fin), n = v.length;
  if (n < 4) return null;
  let S = 0;
  for (let i = 0; i < n - 1; i++) for (let j = i + 1; j < n; j++) S += Math.sign(v[j] - v[i]);
  const ties = new Map();
  for (const a of v) ties.set(a, (ties.get(a) || 0) + 1);
  let tie = 0;
  for (const c of ties.values()) tie += c * (c - 1) * (2 * c + 5);
  const varS = (n * (n - 1) * (2 * n + 5) - tie) / 18;
  const Z = S > 0 ? (S - 1) / Math.sqrt(varS) : S < 0 ? (S + 1) / Math.sqrt(varS) : 0;
  return { S, varS, Z, p: normPValue(Z) };
}

/** Theil-Sen slope: median of all pairwise slopes. */
export function senSlope(x, y) {
  const [X, Y] = pairs(x, y), s = [];
  for (let i = 0; i < X.length - 1; i++) for (let j = i + 1; j < X.length; j++) if (X[j] !== X[i]) s.push((Y[j] - Y[i]) / (X[j] - X[i]));
  if (!s.length) return null;
  s.sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/* -------------------------------------------------------------- detection */
const memory = (phi) => Math.sqrt((1 + phi) / (1 - phi));

/** Years needed to detect trend `omega` (per year). `power` = 2 + z_b; 3.3 = 90 % detection probability. */
export function yearsToDetect(omega, sigmaN, phi, power = 3.3) {
  if (!fin(omega) || omega === 0 || !fin(sigmaN) || !fin(phi) || Math.abs(phi) >= 1) return null;
  return (power / Math.abs(omega) * sigmaN * memory(Math.max(phi, 0))) ** (2 / 3);
}

/** Smallest trend (per year) a record of n years can detect: sigma_w = sN / n^(3/2) * memory. */
export function minDetectable(n, sigmaN, phi, power = 3.3) {
  if (!(n > 0) || !fin(sigmaN) || !fin(phi) || Math.abs(phi) >= 1) return null;
  return power * sigmaN * memory(Math.max(phi, 0)) / n ** 1.5;
}

/**
 * Everything the trend block of the window shows, from yearly values.
 * The interval of the detection year comes from putting the two ends of the 95 % trend interval into n*.
 * When that interval contains zero the late end is null: the trend may never be detectable.
 */
export function trendReport(years, values) {
  const fit = ols(years, values);
  if (!fit || fit.n < 5) return null;
  const adj = adjustedTrend(fit), ar = olsAr1(years, values);
  const phi = Math.max(adj.r1, 0);
  const sigmaN = Math.sqrt(fit.sse / (fit.n - 2));
  const first = Math.min(...years.filter((y, i) => fin(values[i])));
  const nStar = yearsToDetect(fit.slope, sigmaN, phi);
  const toYear = (n) => (n === null ? null : first + Math.ceil(n) - 1);
  let early = null, late = null;
  if (adj.ci) {
    const [lo, hi] = adj.ci, crosses = lo <= 0 && hi >= 0;
    early = toYear(yearsToDetect(Math.max(Math.abs(lo), Math.abs(hi)), sigmaN, phi));
    late = crosses ? null : toYear(yearsToDetect(Math.min(Math.abs(lo), Math.abs(hi)), sigmaN, phi));
  }
  const min = minDetectable(fit.n, sigmaN, phi);
  return {
    n: fit.n, first, mean: fit.ym, slope: fit.slope, intercept: fit.intercept, slopeDecade: fit.slope * 10,
    ciDecade: adj.ci ? [adj.ci[0] * 10, adj.ci[1] * 10] : null,
    pPlain: fit.p, pAdjusted: adj.p, pAr1: ar ? ar.p : null, r1: adj.r1, phi, ne: adj.ne, sigmaN,
    detectableDecade: min === null ? null : min * 10, nStar, detectYear: toYear(nStar), detectEarly: early, detectLate: late,
    mk: mannKendall(values), senDecade: (() => { const s = senSlope(years, values); return s === null ? null : s * 10; })(),
  };
}

/* ------------------------------------------------------------ uncertainty */
/** GUM: uncorrelated components added in quadrature; missing components are reported, not assumed zero. */
export function combineUncertainty(parts, k = 2) {
  const used = Object.entries(parts).filter(([, v]) => fin(v));
  const missing = Object.entries(parts).filter(([, v]) => !fin(v)).map(([n]) => n);
  if (!used.length) return null;
  const uc = Math.sqrt(used.reduce((s, [, v]) => s + v * v, 0));
  return { uc, U: k * uc, k, parts: Object.fromEntries(used), missing };
}

/* -------------------------------------------------------------- area means */
/**
 * Cells of a regular lat/lon grid inside a box, each with weight cos(lat) x covered fraction of the cell.
 * Grid: { west, north, dx, dy, nx, ny }; cell (r, c) has its centre at (north-(r+.5)dy, west+(c+.5)dx).
 */
export function boxCells(grid, box) {
  const { west, north, dx, dy, nx, ny } = grid, out = [];
  const c0 = Math.max(0, Math.floor((box.w - west) / dx)), c1 = Math.min(nx - 1, Math.floor((box.e - west) / dx));
  const r0 = Math.max(0, Math.floor((north - box.n) / dy)), r1 = Math.min(ny - 1, Math.floor((north - box.s) / dy));
  for (let r = r0; r <= r1; r++) {
    const top = north - r * dy, bot = top - dy;
    const fy = Math.max(0, Math.min(top, box.n) - Math.max(bot, box.s)) / dy;
    if (fy <= 0) continue;
    const cos = Math.cos((top - dy / 2) * Math.PI / 180);
    for (let c = c0; c <= c1; c++) {
      const left = west + c * dx, right = left + dx;
      const fx = Math.max(0, Math.min(right, box.e) - Math.max(left, box.w)) / dx;
      if (fx > 0) out.push({ i: r * nx + c, r, c, w: cos * fx * fy });
    }
  }
  return out;
}

/** Weighted mean of one frame over cells. `decode` maps a stored value to a number or null. */
export function cellsMean(frame, cells, decode) {
  let sw = 0, sv = 0, sw2 = 0, total = 0;
  for (const { i, w } of cells) {
    total += w;
    const v = decode(frame[i]);
    if (v === null) continue;
    sw += w; sv += w * v; sw2 += w * w;
  }
  if (sw === 0) return null;
  const mean = sv / sw;
  let ss = 0;
  for (const { i, w } of cells) { const v = decode(frame[i]); if (v !== null) ss += w * (v - mean) ** 2; }
  return { mean, sd: Math.sqrt(ss / sw), neff: sw * sw / sw2, coverage: total > 0 ? sw / total : 0 };
}

/** Lag-1 spatial autocorrelation between east-west neighbours among the given cells. */
export function spatialLag1(frame, cells, decode, nx) {
  const vals = new Map();
  for (const { i } of cells) { const v = decode(frame[i]); if (v !== null) vals.set(i, v); }
  if (vals.size < 4) return null;
  let m = 0;
  for (const v of vals.values()) m += v;
  m /= vals.size;
  let num = 0, den = 0, cnt = 0;
  for (const [i, v] of vals) {
    den += (v - m) ** 2;
    if ((i + 1) % nx !== 0 && vals.has(i + 1)) { num += (v - m) * (vals.get(i + 1) - m); cnt++; }
  }
  if (!cnt || den === 0) return null;
  return (num / cnt) / (den / vals.size);
}

/** Standard uncertainty of an area mean from spatial variation, with the sample size reduced for neighbour correlation. */
export function samplingUncertainty(sd, neff, rho) {
  if (!fin(sd) || !(neff > 0)) return null;
  const r = fin(rho) ? Math.min(Math.max(rho, 0), 0.99) : 0;
  return sd / Math.sqrt(Math.max(neff * (1 - r) / (1 + r), 1));
}
