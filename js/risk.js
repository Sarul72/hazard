/* Hazard scores 0..100 for one monitoring point from model and forecast inputs.
 * These are RELATIVE INDICES, not probabilities. Each component is reported so a reader can see why
 * a score is high, and a missing input gives null, never 0. See docs/METHODS.md. */
import { CLASSES, THRESHOLDS } from "./config.js";
import { run, FWI_START } from "./fwi.js";

const fin = (v) => typeof v === "number" && Number.isFinite(v);
const sum = (a) => a.reduce((s, v) => s + v, 0);
const median = (a) => { const s = [...a].sort((x, y) => x - y); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };

/** Piecewise-linear interpolation, clamped at both ends. xs must be ascending. */
export function interp(x, xs, ys) {
  if (!fin(x)) return null;
  if (x <= xs[0]) return ys[0];
  const n = xs.length - 1;
  if (x >= xs[n]) return ys[n];
  for (let i = 0; i < n; i++) {
    if (x < xs[i + 1]) return ys[i] + (ys[i + 1] - ys[i]) * (x - xs[i]) / (xs[i + 1] - xs[i]);
  }
  return ys[n];
}

export function classOf(score) {
  if (!fin(score)) return null;
  return CLASSES.find((c) => score >= c.min && score < c.max) || CLASSES[CLASSES.length - 1];
}

const dateOf = (t) => t.slice(0, 10);
const hourOf = (t) => Number(t.slice(11, 13));
const addDays = (d, n) => new Date(Date.parse(d + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);

/** Index of the first hourly timestamp at or after `nowLocal` hour. */
function nowIndex(time, nowLocal) {
  const key = nowLocal.slice(0, 13);
  let i = time.findIndex((t) => t.slice(0, 13) >= key);
  return i < 0 ? time.length : i;
}

/* ---------- fire ---------- */
export function fireRisk(fc, nowLocal, cfg = THRESHOLDS.fire) {
  if (!fc || !fc.time) return null;
  const { time } = fc;
  const idx12 = new Map();
  time.forEach((t, i) => { if (hourOf(t) === 12) idx12.set(dateOf(t), i); });
  const days = [];
  for (const [date, i] of [...idx12.entries()].sort()) {
    const T = fc.temperature_2m[i], RH = fc.relative_humidity_2m[i], Wms = fc.wind_speed_10m[i];
    let r0 = NaN;
    if (i >= 23) {
      const w = fc.precipitation.slice(i - 23, i + 1);
      if (w.length === 24 && w.every(fin)) r0 = sum(w);
    }
    days.push({ date, T, RH, W: fin(Wms) ? Wms * 3.6 : NaN, r0, month: Number(date.slice(5, 7)), snow: fc.snow_depth ? fc.snow_depth[i] : null });
  }
  const valid = days.filter((d) => [d.T, d.RH, d.W, d.r0].every(fin)).length;
  if (valid < 14) return { score: null, flags: ["too_little_data"] };
  const out = run(days);
  const today = nowLocal.slice(0, 10);
  const series = days.map((d, k) => {
    const snowCovered = fin(d.snow) && d.snow >= cfg.snowDepthM;
    const f = out[k].fwi;
    return { date: d.date, fwi: f, snowCovered, score: f === null ? null : snowCovered ? 0 : interp(f, cfg.fwiBreaks, cfg.fwiScores), ffmc: out[k].ffmc, dmc: out[k].dmc, dc: out[k].dc, isi: out[k].isi, bui: out[k].bui };
  });
  const horizon = series.filter((s) => s.date >= today && s.date <= addDays(today, cfg.outlookDays));
  const scores = horizon.map((s) => s.score).filter(fin);
  const flags = [];
  if (valid < 60) flags.push("short_spinup");
  if (!scores.length) return { score: null, series: series.slice(-14), flags: [...flags, "no_outlook_days"] };
  const todayRow = series.find((s) => s.date === today) || horizon[0];
  if (horizon.every((s) => s.snowCovered)) flags.push("snow_covered");
  return {
    score: Math.max(...scores),
    fwiToday: todayRow ? todayRow.fwi : null,
    fwiMax: Math.max(...horizon.map((s) => s.fwi).filter(fin)),
    today: todayRow,
    series: series.slice(-14),
    flags,
  };
}

/* ---------- dust ---------- */
export function dustRisk(fc, air, nowLocal, cfg = THRESHOLDS.dust) {
  const flags = [];
  let E = null, windMax = null, windMaxTime = null, gated = { snow: 0, wet: 0, hours: 0 };
  if (fc && fc.time) {
    const i0 = nowIndex(fc.time, nowLocal), i1 = Math.min(fc.time.length, i0 + cfg.outlookHours);
    const dayPrecip = new Map(), dayCount = new Map();
    fc.time.forEach((t, i) => {
      if (fin(fc.precipitation[i])) { const d = dateOf(t); dayPrecip.set(d, (dayPrecip.get(d) || 0) + fc.precipitation[i]); dayCount.set(d, (dayCount.get(d) || 0) + 1); }
    });
    for (let i = i0; i < i1; i++) {
      const u = fc.wind_speed_10m[i];
      if (!fin(u)) continue;
      const d = dateOf(fc.time[i]);
      const snow = fc.snow_depth ? fc.snow_depth[i] : null;
      const snowCovered = fin(snow) && snow >= cfg.snowDepthM;
      const wet = (dayCount.get(d) || 0) >= 20 && dayPrecip.get(d) >= cfg.wetDayMm;
      gated.hours++;
      if (snowCovered) gated.snow++;
      if (wet) gated.wet++;
      if (!windMax || u > windMax) { windMax = u; windMaxTime = fc.time[i]; }
      const f = snowCovered || wet ? 0 : interp(u, [cfg.windOnset, cfg.windStrong], [0, 1]);
      if (E === null || f > E) E = f;
    }
  }
  let C = null, dustMax = null, dustNow = null, pm10Max = null, aodMax = null;
  if (air && air.time && air.dust) {
    const i0 = nowIndex(air.time, nowLocal), i1 = Math.min(air.time.length, i0 + cfg.outlookHours);
    const dv = air.dust.slice(i0, i1).filter(fin);
    if (dv.length) { dustMax = Math.max(...dv); dustNow = fin(air.dust[i0]) ? air.dust[i0] : null; C = interp(dustMax, cfg.camsBreaks, cfg.camsScores); }
    const pm = (air.pm10 || []).slice(i0, i1).filter(fin); if (pm.length) pm10Max = Math.max(...pm);
    const ao = (air.aerosol_optical_depth || []).slice(i0, i1).filter(fin); if (ao.length) aodMax = Math.max(...ao);
  }
  if (E === null && C === null) return { score: null, flags: ["no_data"] };
  if (C === null) flags.push("no_cams");
  if (E === null) flags.push("no_wind");
  const potential = E === null ? null : Math.min(cfg.potentialCap, 100 * E);
  const score = Math.max(C ?? 0, potential ?? 0);
  if (gated.hours && gated.snow === gated.hours) flags.push("snow_covered");
  return { score, emission: E, potential, camsScore: C, windMax, windMaxTime, dustMax, dustNow, pm10Max, aodMax, gated, flags };
}

/* ---------- flood ---------- */
export function floodRisk(fc, flood, thresholds, nowLocal, cfg = THRESHOLDS.flood) {
  const flags = [];
  let sRain = null, R1 = null, R24 = null, rainOnSnow = false;
  if (fc && fc.time && fc.rain) {
    const i0 = nowIndex(fc.time, nowLocal), i1 = Math.min(fc.time.length, i0 + cfg.outlookHours);
    for (let i = i0; i < i1; i++) {
      const r = fc.rain[i];
      if (!fin(r)) continue;
      if (R1 === null || r > R1) R1 = r;
      const w = fc.rain.slice(Math.max(0, i - 23), i + 1);
      if (w.length === 24 ? w.every(fin) : false) { const s = sum(w); if (R24 === null || s > R24) R24 = s; }
      const snow = fc.snow_depth ? fc.snow_depth[i] : null;
      if (fin(snow) && snow >= cfg.rainOnSnowDepthM && r >= 0.5 && fin(fc.temperature_2m[i]) && fc.temperature_2m[i] > 0) rainOnSnow = true;
    }
    if (R1 !== null) {
      const a = interp(R24 ?? 0, cfg.rain24Breaks, cfg.rain24Scores);
      const b = interp(R1, cfg.rain1Breaks, cfg.rain1Scores);
      sRain = Math.max(a, b);
    }
  }
  let sQ = null, Qnow = null, Qmax = null, Qmed = null, rise = null, method = null;
  if (flood && flood.time && flood.river_discharge) {
    const today = nowLocal.slice(0, 10);
    const iT = flood.time.indexOf(today);
    const q = flood.river_discharge;
    if (iT >= 0) {
      const fut = q.slice(iT, iT + cfg.dischargeOutlookDays + 1).filter(fin);
      const past = q.slice(0, iT).filter(fin);
      if (fut.length) {
        Qmax = Math.max(...fut); Qnow = fin(q[iT]) ? q[iT] : null; Qmed = median(past);
        if (thresholds && fin(thresholds.q2) && fin(thresholds.q5) && fin(thresholds.q20) && thresholds.q2 > 0 && thresholds.q5 > thresholds.q2 && thresholds.q20 > thresholds.q5) {
          method = "return_levels";
          sQ = interp(Qmax, [0.25 * thresholds.q2, thresholds.q2, thresholds.q5, thresholds.q20, 1.5 * thresholds.q20], cfg.returnScores);
        } else if (fin(Qmed) && Qmed > 0 && Qmax >= 0.5) {
          method = "rise_factor";
          rise = Qmax / Qmed;
          sQ = interp(rise, cfg.riseBreaks, cfg.riseScores);
          flags.push("no_return_levels");
        } else { flags.push("no_discharge_signal"); }
      }
    }
  }
  if (sRain === null && sQ === null) return { score: null, flags: [...flags, "no_data"] };
  let score = Math.max(sRain ?? 0, sQ ?? 0);
  if (rainOnSnow) { score = Math.min(100, score + cfg.rainOnSnowBonus); flags.push("rain_on_snow"); }
  if (sRain === null) flags.push("no_rain");
  if (sQ === null) flags.push("no_discharge");
  return { score, rainScore: sRain, dischargeScore: sQ, R1, R24, Qnow, Qmax, Qmedian: Qmed, rise, method, rainOnSnow, flags };
}

/** All three hazards for one point. */
export function computePoint(raw, nowLocal) {
  const fire = fireRisk(raw.forecast, nowLocal);
  const dust = dustRisk(raw.forecast, raw.air, nowLocal);
  const flood = floodRisk(raw.forecast, raw.flood, raw.thresholds, nowLocal);
  const scores = { fire: fire?.score ?? null, dust: dust?.score ?? null, flood: flood?.score ?? null };
  const known = Object.entries(scores).filter(([, v]) => fin(v));
  const top = known.length ? known.reduce((a, b) => (b[1] > a[1] ? b : a)) : null;
  return { id: raw.id, fire, dust, flood, overall: top ? { hazard: top[0], score: top[1] } : null };
}
