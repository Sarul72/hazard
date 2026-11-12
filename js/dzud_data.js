/* The dzud tab reads ZudRisk (https://github.com/Sarul72/ZudRisk): its soum risk per winter, 2000/01 on, and the
 * outlook of the coming winter, published on GitHub Pages and refreshed there each month of the winter. Nothing here is
 * computed on this page except the chance, which uses ZudRisk's own published calibration.
 * Plain functions only, so the tests run them without a browser. */

export const DZUD_URL = "https://sarul72.github.io/ZudRisk/";

/** The winter a day belongs to, as ZudRisk names it ("2015-16"). October to March is that winter; April to September
 * still shows the winter that has just ended, whose losses are being counted. */
export function winterOf(date) {
  const y = Number(date.slice(0, 4)), m = Number(date.slice(5, 7));
  const a = m >= 10 ? y : y - 1;
  return `${a}-${String((a + 1) % 100).padStart(2, "0")}`;
}

/** "2015-16" -> "2015/16". */
export const winterLabel = (w) => w.replace("-", "/");

/** The ZudRisk file for a winter: the outlook while it runs, a hindcast after; null where ZudRisk has neither. */
export function winterFile(winter, { winters = [], outlook = null } = {}) {
  if (outlook && outlook.winter === winter) return `data/outlook_${winter}.geojson`;
  if (winters.includes(winter)) return `data/risk_${winter}.geojson`;
  return null;
}

/** The chance of adult losses of 5 % or more, from ZudRisk's calibration of the stage (a hindcast is the whole winter,
 * "mar"). None where the stage's held-out Brier skill is 0 or below, or where the soum has no risk. */
export function chanceOf(calibration, stage, risk) {
  const c = calibration?.stages?.[stage || "mar"];
  if (!c || !(c.bss > 0) || risk === null || risk === undefined) return null;
  return 1 / (1 + Math.exp(-(c.a * risk + c.b)));
}

/** Soums per class (0 very low .. 4 very high) and the soums with no score. */
export function classCounts(features) {
  const counts = [0, 0, 0, 0, 0];
  let none = 0;
  for (const f of features) {
    const k = f.properties.risk_class;
    if (k === null || k === undefined) none++;
    else counts[k]++;
  }
  return { counts, none };
}

/** The soums of highest risk first, at most n. */
export function topSoums(features, n = 10) {
  return features.filter((f) => f.properties.risk !== null && f.properties.risk !== undefined)
    .sort((a, b) => b.properties.risk - a.properties.risk).slice(0, n);
}
