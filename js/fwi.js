/* Canadian Forest Fire Weather (FWI) System, Van Wagner (1987), Van Wagner and Pickett (1985).
 * Pure functions, no DOM, no network. Inputs are noon local values:
 *   T   air temperature, deg C
 *   RH  relative humidity, %
 *   W   10 m wind speed, km/h
 *   r0  24-h precipitation ending at noon, mm
 * Month is 1..12 (northern hemisphere day-length adjustment tables).
 * The same system is the basis of EFFIS, GWIS and the ECMWF GEFF fire danger forecast. */

const DMC_DAYLENGTH = [6.5, 7.5, 9.0, 12.8, 13.9, 13.9, 12.4, 10.9, 9.2, 8.0, 7.0, 6.0];
const DC_DAYLENGTH = [-1.6, -1.6, -1.6, 0.9, 3.8, 5.8, 6.4, 5.0, 2.4, 0.4, -1.6, -1.6];

export const FWI_START = { ffmc: 85, dmc: 6, dc: 15 };

export function ffmc(T, RH, W, r0, F0) {
  RH = Math.min(RH, 100);
  let mo = 147.2 * (101 - F0) / (59.5 + F0);
  if (r0 > 0.5) {
    const rf = r0 - 0.5;
    let mr = mo + 42.5 * rf * Math.exp(-100 / (251 - mo)) * (1 - Math.exp(-6.93 / rf));
    if (mo > 150) mr += 0.0015 * (mo - 150) ** 2 * Math.sqrt(rf);
    mo = Math.min(mr, 250);
  }
  const Ed = 0.942 * RH ** 0.679 + 11 * Math.exp((RH - 100) / 10) + 0.18 * (21.1 - T) * (1 - Math.exp(-0.115 * RH));
  let m;
  if (mo > Ed) {
    const ko = 0.424 * (1 - (RH / 100) ** 1.7) + 0.0694 * Math.sqrt(W) * (1 - (RH / 100) ** 8);
    const kd = ko * 0.581 * Math.exp(0.0365 * T);
    m = Ed + (mo - Ed) * 10 ** (-kd);
  } else {
    const Ew = 0.618 * RH ** 0.753 + 10 * Math.exp((RH - 100) / 10) + 0.18 * (21.1 - T) * (1 - Math.exp(-0.115 * RH));
    if (mo < Ew) {
      const kl = 0.424 * (1 - ((100 - RH) / 100) ** 1.7) + 0.0694 * Math.sqrt(W) * (1 - ((100 - RH) / 100) ** 8);
      const kw = kl * 0.581 * Math.exp(0.0365 * T);
      m = Ew - (Ew - mo) * 10 ** (-kw);
    } else m = mo;
  }
  return Math.min(59.5 * (250 - m) / (147.2 + m), 101);
}

export function dmc(T, RH, r0, P0, month) {
  if (T < -1.1) T = -1.1;
  const rk = 1.894 * (T + 1.1) * (100 - Math.min(RH, 100)) * DMC_DAYLENGTH[month - 1] * 0.0001;
  let pr = P0;
  if (r0 > 1.5) {
    const re = 0.92 * r0 - 1.27;
    const Mo = 20 + Math.exp(5.6348 - P0 / 43.43);
    const b = P0 <= 33 ? 100 / (0.5 + 0.3 * P0) : P0 <= 65 ? 14 - 1.3 * Math.log(P0) : 6.2 * Math.log(P0) - 17.2;
    const Mr = Mo + 1000 * re / (48.77 + b * re);
    pr = 244.72 - 43.43 * Math.log(Mr - 20);
    if (pr < 0) pr = 0;
  }
  return Math.max(pr + rk, 0);
}

export function dc(T, r0, D0, month) {
  if (T < -2.8) T = -2.8;
  // potential evapotranspiration V = 0.36 (T + 2.8) + Lf, floored at 0 (Van Wagner 1987, eq. 22-23)
  let pe = 0.36 * (T + 2.8) + DC_DAYLENGTH[month - 1];
  if (pe < 0) pe = 0;
  let dr = D0;
  if (r0 > 2.8) {
    const rd = 0.83 * r0 - 1.27;
    const Qo = 800 * Math.exp(-D0 / 400);
    const Qr = Qo + 3.937 * rd;
    dr = 400 * Math.log(800 / Qr);
    if (dr < 0) dr = 0;
  }
  return dr + 0.5 * pe;
}

export function isi(W, F) {
  const m = 147.2 * (101 - F) / (59.5 + F);
  const fF = 91.9 * Math.exp(-0.1386 * m) * (1 + m ** 5.31 / 4.93e7);
  return 0.208 * Math.exp(0.05039 * W) * fF;
}

export function bui(P, D) {
  if (P === 0 && D === 0) return 0;
  let U;
  if (P <= 0.4 * D) U = 0.8 * P * D / (P + 0.4 * D);
  else U = P - (1 - 0.8 * D / (P + 0.4 * D)) * (0.92 + (0.0114 * P) ** 1.7);
  return Math.max(U, 0);
}

export function fwi(ISI, BUI) {
  const fD = BUI <= 80 ? 0.626 * BUI ** 0.809 + 2 : 1000 / (25 + 108.64 * Math.exp(-0.023 * BUI));
  const B = 0.1 * ISI * fD;
  return B > 1 ? Math.exp(2.72 * (0.434 * Math.log(B)) ** 0.647) : B;
}

/** One day step. Returns the new state with all six components. */
export function step(state, obs, month) {
  const F = ffmc(obs.T, obs.RH, obs.W, obs.r0, state.ffmc);
  const P = dmc(obs.T, obs.RH, obs.r0, state.dmc, month);
  const D = dc(obs.T, obs.r0, state.dc, month);
  const I = isi(obs.W, F);
  const U = bui(P, D);
  return { ffmc: F, dmc: P, dc: D, isi: I, bui: U, fwi: fwi(I, U) };
}

/** Run a list of daily observations [{T,RH,W,r0,month}] from the start state. A day with a missing
 * input (null/NaN) keeps the previous codes and is reported with fwi = null. */
export function run(days, start = FWI_START) {
  let s = { ...start, isi: null, bui: null, fwi: null };
  const out = [];
  for (const d of days) {
    const ok = [d.T, d.RH, d.W, d.r0].every((v) => Number.isFinite(v));
    if (!ok) { out.push({ ...s, fwi: null, missing: true }); continue; }
    s = step(s, d, d.month);
    out.push({ ...s, missing: false });
  }
  return out;
}
