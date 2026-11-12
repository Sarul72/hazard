/* The dust check of a chosen area (js/aoi/dust.js): ground classes, weather counts and the plain conclusion, each on
 * a case worked out by hand. check() is plain JavaScript so it also runs in a browser where Node is not installed. */
import { DUST, LAND, landClass, landShares, officialWind, points, scaleFor, verdict, windStats } from "../js/aoi/dust.js";
import { makeGrid } from "../js/aoi/raster.js";

/** Hourly data for `n` hours at every point: functions of the hour index. */
function wx({ n = 72, wind = () => 3, gust = () => 5, rain = () => 0, snow = () => 0, soil = () => 0.1, dust = null, points: k = 9 }) {
  const time = Array.from({ length: n }, (_, h) => `2023-04-${String(10 + Math.floor(h / 24)).padStart(2, "0")}T${String(h % 24).padStart(2, "0")}:00`);
  const one = () => ({ time, wind_speed_10m: time.map((_, h) => wind(h)), wind_gusts_10m: time.map((_, h) => gust(h)), precipitation: time.map((_, h) => rain(h)), snow_depth: time.map((_, h) => snow(h)), soil_moisture_0_to_7cm: time.map((_, h) => soil(h)) });
  return { hours: Array.from({ length: k }, one), dust: dust ? [{ time, dust: time.map((_, h) => dust(h)) }] : [] };
}

export function check() {
  const out = [];
  const yes = (name, cond) => out.push({ name, got: cond, want: true, ok: cond === true });
  const near = (name, got, want, tol) => out.push({ name, got, want, ok: Math.abs(got - want) <= tol });

  // ground classes from the scene class and NDVI
  yes("bare below NDVI 0.15", landClass(5, 0.10) === LAND.bare && landClass(4, 0.149) === LAND.bare);
  yes("sparse from 0.15 to 0.30", landClass(4, 0.15) === LAND.sparse && landClass(4, 0.29) === LAND.sparse);
  yes("vegetation from 0.30", landClass(4, 0.30) === LAND.veg);
  yes("snow, water and cloud come from the scene class", landClass(11, 0.05) === LAND.snow && landClass(6, -0.2) === LAND.water && landClass(9, 0.05) === LAND.cloud && landClass(3, 0.05) === LAND.cloud);
  yes("no data stays no data", landClass(NaN, 0.1) === LAND.none && landClass(4, NaN) === LAND.none);

  // shares of the part seen without cloud
  const g = makeGrid({ s: 43, n: 43.01, w: 104, e: 104.01 }, 60), land = new Uint8Array(g.w * g.h);
  land.fill(LAND.bare);
  for (let i = 0; i < land.length / 4; i++) land[i] = LAND.cloud;
  const sh = landShares(g, land);
  near("cloud is left out of the shares", sh.share[LAND.bare], 1, 1e-9);
  near("seen share (areas, so rows of different latitude weigh a little differently)", sh.seenShare, 0.75, 0.01);
  yes("20 m up to 2,000 km2, then 60 m", scaleFor(1999) === 20 && scaleFor(2001) === 60);
  const p = points({ s: 43, n: 44, w: 104, e: 105 });
  yes("nine points inside the box", p.length === 9 && p.every((q) => q.lat > 43 && q.lat < 44 && q.lon > 104 && q.lon < 105));

  // weather counts: 10 hours of 8 m/s, 3 of them at 12 m/s, a gust of 25 m/s, no rain
  const w1 = windStats(wx({ wind: (h) => (h >= 10 && h < 20 ? (h < 13 ? 12 : 8) : 3), gust: (h) => (h === 11 ? 25 : 6) }));
  yes("hours above 6, 10 and 14 m/s", w1.onset === 10 && w1.strong === 3 && w1.severe === 0);
  near("highest wind", w1.maxWind, 12, 1e-9);
  near("strongest gust", w1.maxGust, 25, 1e-9);
  yes("windy and bare means dust conditions", verdict({ share: [0, 0.9, 0.05, 0.05, 0, 0, 0] }, w1).key === "strong");

  // a rainy day stops emission on that whole day (AP-42 wet-day rule)
  const w2 = windStats(wx({ wind: (h) => (h < 24 ? 9 : 3), rain: (h) => (h === 5 ? 0.3 : 0) }));
  yes("wind on a wet day does not count", w2.onset === 0 && w2.wetDays.length === 1);
  yes("calm and wet means no dust conditions", verdict({ share: [0, 0.9, 0, 0, 0, 0, 0] }, w2).key === "no");

  // snow on the ground or little bare ground
  const w3 = windStats(wx({ wind: () => 9, snow: () => 0.05 }));
  yes("snow stops dust", w3.onset === 0 && verdict({ share: [0, 0.9, 0, 0, 0, 0, 0] }, w3).why.includes("snow_now"));
  const w4 = windStats(wx({ wind: () => 9 }));
  yes("little bare ground stops dust", verdict({ share: [0, 0.02, 0.1, 0.88, 0, 0, 0] }, w4).key === "no");

  // CAMS dust above the WHO guideline while nothing rises here
  const w5 = windStats(wx({ dust: (h) => (h === 30 ? 300 : 20) }));
  yes("CAMS peak is found", w5.cams.max === 300 && w5.cams.time.endsWith("06:00"));
  const v5 = verdict({ share: [0, 0.9, 0, 0, 0, 0, 0] }, w5);
  yes("dust in the model but calm here is said apart", v5.key === "not_local" && v5.camsHigh === true && 300 >= DUST.who);
  yes("no weather means no conclusion", verdict(null, null).key === "unknown");

  // Resolution 286 (2015), annex 2: strong wind is hazardous from a 18 m/s mean or a 24 m/s gust; a disaster from
  // 24 m/s in forest steppe and mountains, 28 m/s in steppe and gobi, or a 34 m/s gust
  yes("a 25 m/s gust is hazardous wind (annex 2)", officialWind(w1) === "hazard");
  yes("12 m/s with 20 m/s gusts is not", officialWind(windStats(wx({ wind: () => 12, gust: () => 20 }))) === "none");
  const one = wx({ wind: () => 10, gust: () => 15 });
  one.hours[4].wind_speed_10m[7] = 19;
  const w6 = windStats(one);
  yes("the strongest point counts, not the mean of nine", w6.pointWind === 19 && w6.maxWind < 18 && officialWind(w6) === "hazard");
  yes("26 m/s is a disaster in forest steppe and mountains only", officialWind(windStats(wx({ wind: () => 26, gust: () => 30 }))) === "disaster_forest");
  yes("28 m/s or a 34 m/s gust is a disaster everywhere",
    officialWind(windStats(wx({ wind: () => 28 }))) === "disaster" && officialWind(windStats(wx({ wind: () => 5, gust: () => 34 }))) === "disaster");
  yes("no weather, no official wind", officialWind(null) === null);
  return out;
}

if (typeof process !== "undefined" && process.versions?.node) {
  const { default: test } = await import("node:test");
  const { default: assert } = await import("node:assert/strict");
  test("dust check of a chosen area", () => assert.deepEqual(check().filter((r) => !r.ok), []));
}
