/* What a score means in words. Fire and dust scores are powers of 4 of the lift of a fitted probability over its
 * national average (pipeline/calibrate.py: score = 20 * (log4(p / base) + 2)), so a score can be read back as "how
 * many times the usual chance". The flood score maps the return period of three days of rain and snowmelt
 * (1, 2, 5, 20, 100 years to 0, 40, 60, 80, 100; pipeline/scores.py), lowered away from drainage lines. */

/** Average daily chance of the event per 0.1° cell in the data the model was fitted to (pipeline/model.json "base"). */
export const SCORE_MODEL = {
  fire: { base: 0.0001784, event: "fire" },          // MODIS active fire in the cell that day, all months
  dust: { base: 0.02235, event: "dust", months: [3, 4, 5] }, // TROPOMI aerosol index anomaly >= 1, fitted on March-May
};

const clamp = (s) => Math.min(100, Math.max(0, s));
/** How many times the usual chance a score stands for. */
export const lift = (score) => 4 ** (clamp(score) / 20 - 2);

const FLOOD_T = [1.01, 2, 5, 20, 100], FLOOD_S = [0, 40, 60, 80, 100];
/** Return period in years that a flood score stands for near a drainage line (log-linear between the steps). */
export function floodYears(score) {
  const s = clamp(score);
  for (let i = 1; i < FLOOD_S.length; i++) if (s <= FLOOD_S[i]) {
    const f = (s - FLOOD_S[i - 1]) / (FLOOD_S[i] - FLOOD_S[i - 1]);
    return 10 ** (Math.log10(FLOOD_T[i - 1]) + f * (Math.log10(FLOOD_T[i]) - Math.log10(FLOOD_T[i - 1])));
  }
  return 100;
}

/** Everything the summary needs: { kind, ratio, p, pLo, pHi, years, yearsLo, yearsHi, offSeason }. U is the 95 % error. */
export function meaning(hazard, score, U, month) {
  const lo = clamp(score - (U ?? 0)), hi = clamp(score + (U ?? 0));
  const m = SCORE_MODEL[hazard];
  if (m) {
    return { kind: "lift", ratio: lift(score), ratioLo: lift(lo), ratioHi: lift(hi), p: m.base * lift(score), pLo: m.base * lift(lo), pHi: Math.min(1, m.base * lift(hi)),
      offSeason: Boolean(m.months && month && !m.months.includes(month)) };
  }
  if (hazard === "flood") return { kind: "flood", years: floodYears(score), yearsLo: floodYears(lo), yearsHi: floodYears(hi), offSeason: false };
  return { kind: "all", offSeason: false };
}

/** A share as people say it: 5 %, 0.7 %, 0.02 %. */
export function percent(p) {
  const v = p * 100;
  if (v >= 10) return `${Math.round(v)}%`;
  if (v >= 1) return `${v.toFixed(1).replace(/\.0$/, "")}%`;
  return `${Number(v.toPrecision(1))}%`;
}

/** A ratio as people say it: 2.1, 0.3, 15. */
export const times = (r) => (r >= 10 ? String(Math.round(r)) : r >= 1 ? r.toFixed(1).replace(/\.0$/, "") : r.toFixed(2).replace(/0$/, ""));
