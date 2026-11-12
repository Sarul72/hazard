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

/** True while the outlook's winter is under way (November to January stages): its cold is the mean of the months so
 * far, not yet November to February. October has no winter month, February and later and a hindcast have all four. */
export const coldSoFar = (stage) => stage === "nov" || stage === "dec" || stage === "jan";

/** ZudRisk gives an aimag centre its aimag's herd density and an Ulaanbaatar district the city's, since a town's own
 * census over its small area would mislead: "centre", "ub" or null. */
export function borrowedDensity(p) {
  if (p.is_centre) return "centre";
  if (p.is_ub) return "ub";
  return null;
}

export const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october",
  "november", "december"];
export const DEKADS = ["first", "second", "third"];
/** EIC's map server for its dzud database: MODIS snow cover by dekad, as WMS images (no CORS, so images only). */
export const EIC_SNOW_WMS = "https://eic.mn/cgi-bin/mapserver?map=/var/www/html/disaster/dzudinfo/maps/dzud.map";
export const SNOW_NAME = /^snowimage([a-z]+?)(first|second|third)(\d{4})$/;

/** The snow season a day falls in, October to April, named by the year it starts; null from May to September. */
const snowSeason = (y, m) => (m >= 10 ? y : m <= 4 ? y - 1 : null);

/** EIC's MODIS snow-cover image for a day: the WMS layer of its dekad (1-10, 11-20, 21-end), or the last earlier
 * dekad of the same snow season that has an image; null when the season has none yet or it is summer.
 * available: the layer names that hold an image (data/eic_snow.json), since many named layers come back blank. */
export function snowLayer(date, available) {
  const y = Number(date.slice(0, 4)), m = Number(date.slice(5, 7)), d = Number(date.slice(8, 10));
  const season = snowSeason(y, m);
  if (season === null) return null;
  const key = (yy, mm, dk) => (yy * 12 + mm) * 3 + dk; // dekads counted in time order
  const want = key(y, m, d <= 10 ? 1 : d <= 20 ? 2 : 3);
  let best = null;
  for (const name of available) {
    const p = SNOW_NAME.exec(name);
    if (!p) continue;
    const mm = MONTHS.indexOf(p[1]) + 1, dk = DEKADS.indexOf(p[2]) + 1, yy = Number(p[3]);
    if (mm < 1 || snowSeason(yy, mm) !== season) continue;
    const k = key(yy, mm, dk);
    if (k <= want && (!best || k > best.k)) best = { k, layer: name, year: yy, month: mm, dekad: dk };
  }
  return best && { layer: best.layer, year: best.year, month: best.month, dekad: best.dekad };
}
