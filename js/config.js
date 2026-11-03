/* Static configuration: monitoring points, thresholds, class scale, satellite layers.
 * Every threshold has a source or is marked "heuristic" in docs/METHODS.md. */

/** 21 aimags + Ulaanbaatar, sampled at the aimag centre (approximate coordinates). */
export const POINTS = [
  { id: "UB",  mn: "Улаанбаатар",  en: "Ulaanbaatar",   centre_mn: "Улаанбаатар", lat: 47.9186, lon: 106.9177 },
  { id: "ARH", mn: "Архангай",     en: "Arkhangai",     centre_mn: "Цэцэрлэг",    lat: 47.4750, lon: 101.4547 },
  { id: "BOL", mn: "Баян-Өлгий",   en: "Bayan-Ölgii",   centre_mn: "Өлгий",       lat: 48.9683, lon: 89.9625 },
  { id: "BKH", mn: "Баянхонгор",   en: "Bayankhongor",  centre_mn: "Баянхонгор",  lat: 46.1944, lon: 100.7181 },
  { id: "BUL", mn: "Булган",       en: "Bulgan",        centre_mn: "Булган",      lat: 48.8125, lon: 103.5347 },
  { id: "DAR", mn: "Дархан-Уул",   en: "Darkhan-Uul",   centre_mn: "Дархан",      lat: 49.4867, lon: 105.9228 },
  { id: "DOR", mn: "Дорнод",       en: "Dornod",        centre_mn: "Чойбалсан",   lat: 48.0728, lon: 114.5350 },
  { id: "DOG", mn: "Дорноговь",    en: "Dornogovi",     centre_mn: "Сайншанд",    lat: 44.8914, lon: 110.1192 },
  { id: "DUG", mn: "Дундговь",     en: "Dundgovi",      centre_mn: "Мандалговь",  lat: 45.7625, lon: 106.2708 },
  { id: "GOA", mn: "Говь-Алтай",   en: "Govi-Altai",    centre_mn: "Алтай",       lat: 46.3722, lon:  96.2583 },
  { id: "GOS", mn: "Говьсүмбэр",   en: "Govisümber",    centre_mn: "Чойр",        lat: 46.3667, lon: 108.3667 },
  { id: "KHE", mn: "Хэнтий",       en: "Khentii",       centre_mn: "Өндөрхаан",   lat: 47.3194, lon: 110.6556 },
  { id: "KHO", mn: "Ховд",         en: "Khovd",         centre_mn: "Ховд",        lat: 48.0056, lon:  91.6419 },
  { id: "KHU", mn: "Хөвсгөл",      en: "Khövsgöl",      centre_mn: "Мөрөн",       lat: 49.6342, lon: 100.1625 },
  { id: "OMN", mn: "Өмнөговь",     en: "Ömnögovi",      centre_mn: "Даланзадгад", lat: 43.5708, lon: 104.4250 },
  { id: "ORH", mn: "Орхон",        en: "Orkhon",        centre_mn: "Эрдэнэт",     lat: 49.0275, lon: 104.0447 },
  { id: "OVO", mn: "Өвөрхангай",   en: "Övörkhangai",   centre_mn: "Арвайхээр",   lat: 46.2639, lon: 102.7750 },
  { id: "SEL", mn: "Сэлэнгэ",      en: "Selenge",       centre_mn: "Сүхбаатар",   lat: 50.2336, lon: 106.2072 },
  { id: "SUK", mn: "Сүхбаатар",    en: "Sükhbaatar",    centre_mn: "Баруун-Урт",  lat: 46.6806, lon: 113.2792 },
  { id: "TOV", mn: "Төв",          en: "Töv",           centre_mn: "Зуунмод",     lat: 47.7086, lon: 106.9467 },
  { id: "UVS", mn: "Увс",          en: "Uvs",           centre_mn: "Улаангом",    lat: 49.9811, lon:  92.0667 },
  { id: "ZAV", mn: "Завхан",       en: "Zavkhan",       centre_mn: "Улиастай",    lat: 47.7417, lon:  96.8444 },
];

/** Mongolia bounding box [south, west, north, east] used for the map and FIRMS queries. */
export const MONGOLIA_BBOX = [41.5, 87.5, 52.3, 120.0];

/** Local clock used for all daily aggregation (Ulaanbaatar, UTC+8). */
export const TZ = "Asia/Ulaanbaatar";
export const TZ_OFFSET_HOURS = 8;

/** Five-class scale shared by all hazards. Score is 0..100. */
export const CLASSES = [
  { key: "very_low",  min: 0,  max: 20,  color: "#2e8b57" },
  { key: "low",       min: 20, max: 40,  color: "#a5c93a" },
  { key: "moderate",  min: 40, max: 60,  color: "#f2c230" },
  { key: "high",      min: 60, max: 80,  color: "#ef7d22" },
  { key: "very_high", min: 80, max: 100.0001, color: "#c62828" },
];

export const THRESHOLDS = {
  fire: {
    /** EFFIS fire danger classes (upper bound excluded): 5.2, 11.2, 21.3, 38, 50. Mapped to scores 0,20,40,60,80,100. */
    fwiBreaks: [0, 5.2, 11.2, 21.3, 38.0, 50.0],
    fwiScores: [0, 20, 40, 60, 80, 100],
    /** Snow depth (m) at or above which the surface is treated as snow covered: no fire danger score. */
    snowDepthM: 0.01,
    /** Number of days from now (noon values) that count towards the outlook. */
    outlookDays: 2,
  },
  dust: {
    /** 10 m wind (m/s): emission onset and "strong" level. Mongolian dust-prone day thresholds 6, 8, 10 m/s. */
    windOnset: 6,
    windStrong: 14,
    /** AP-42 13.2.2: a day with at least this precipitation (mm) counts as dust free. */
    wetDayMm: 0.254,
    snowDepthM: 0.01,
    /** Emission potential alone (no modelled or observed dust) cannot reach the "very high" class (score 80). */
    potentialCap: 79,
    /** CAMS surface dust (ug/m3) -> score. 45 = WHO 2021 24-h PM10 guideline. */
    camsBreaks: [0, 10, 45, 100, 250, 500],
    camsScores: [0, 20, 40, 60, 80, 100],
    outlookHours: 72,
  },
  flood: {
    /** Rolling 24-h rain (mm) -> score. */
    rain24Breaks: [0, 10, 25, 50, 80],
    rain24Scores: [0, 25, 50, 75, 100],
    /** Hourly rain (mm/h) -> score. Model grid cells smooth convective peaks, see docs/LIMITATIONS.md. */
    rain1Breaks: [0, 5, 10, 20, 40],
    rain1Scores: [0, 25, 50, 75, 100],
    rainOnSnowBonus: 15,
    rainOnSnowDepthM: 0.05,
    /** Discharge relative to return levels: [0.25*Q2, Q2, Q5, Q20, 1.5*Q20] -> scores. */
    returnScores: [0, 40, 60, 80, 100],
    /** Fallback when no return levels exist: rise factor (forecast max / 30-day median) -> score. */
    riseBreaks: [1.5, 2.5, 4, 8],
    riseScores: [0, 40, 70, 100],
    outlookHours: 72,
    dischargeOutlookDays: 10,
  },
};

/** Open-Meteo request settings. */
export const API = {
  forecast: "https://api.open-meteo.com/v1/forecast",
  flood: "https://flood-api.open-meteo.com/v1/flood",
  air: "https://air-quality-api.open-meteo.com/v1/air-quality",
  /** 92 is the maximum past_days; the Fire Weather Index needs a long spin-up. */
  pastDays: 92,
  forecastDays: 4,
  floodPastDays: 30,
  floodForecastDays: 10,
  hourlyVars: [
    "temperature_2m", "relative_humidity_2m", "wind_speed_10m", "precipitation", "rain", "snow_depth",
  ],
  airVars: ["dust", "pm10", "aerosol_optical_depth"],
  maxAgeMinutes: 90,
};

/**
 * NASA GIBS imagery, EPSG:3857 "best". Layer ids, tile matrix sets and formats were read from GIBS's own
 * WMTS GetCapabilities on 2026-11-03. `type: "wms"` is used for the thermal-anomaly (fire) layers, which GIBS
 * serves as vector tiles; its WMS endpoint renders them as images.
 * `kind`: "base" (one at a time) or "overlay".
 */
export const GIBS = {
  base: "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best",
  wms: "https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi",
  layers: [
    { key: "truecolor_terra", kind: "base", id: "MODIS_Terra_CorrectedReflectance_TrueColor", ext: "jpg", tms: "GoogleMapsCompatible_Level9", sensor: "MODIS Terra", res: "250 m" },
    { key: "truecolor_aqua", kind: "base", id: "MODIS_Aqua_CorrectedReflectance_TrueColor", ext: "jpg", tms: "GoogleMapsCompatible_Level9", sensor: "MODIS Aqua", res: "250 m" },
    { key: "truecolor_viirs", kind: "base", id: "VIIRS_SNPP_CorrectedReflectance_TrueColor", ext: "jpg", tms: "GoogleMapsCompatible_Level9", sensor: "VIIRS Suomi NPP", res: "250 m" },
    { key: "fire_viirs", kind: "overlay", type: "wms", id: "VIIRS_SNPP_Thermal_Anomalies_375m_All", sensor: "VIIRS 375 m", res: "375 m" },
    { key: "fire_modis", kind: "overlay", type: "wms", id: "MODIS_Combined_Thermal_Anomalies_All", sensor: "MODIS Terra+Aqua", res: "1 km" },
    { key: "aod_deepblue", kind: "overlay", id: "MODIS_Terra_AOD_Deep_Blue_Combined", ext: "png", tms: "GoogleMapsCompatible_Level6", sensor: "MODIS Terra Deep Blue AOD", res: "10 km" },
    { key: "aod_modis", kind: "overlay", id: "MODIS_Combined_Value_Added_AOD", ext: "png", tms: "GoogleMapsCompatible_Level6", sensor: "MODIS Terra+Aqua MAIAC AOD", res: "1 km" },
    { key: "dust_airs", kind: "overlay", id: "AIRS_L2_Dust_Score_Day", ext: "png", tms: "GoogleMapsCompatible_Level6", sensor: "AIRS dust score (day)", res: "45 km" },
    { key: "precip_imerg", kind: "overlay", id: "IMERG_Precipitation_Rate", ext: "png", tms: "GoogleMapsCompatible_Level6", sensor: "GPM IMERG", res: "10 km" },
    { key: "flood_modis", kind: "overlay", id: "MODIS_Combined_Flood_2-Day", ext: "png", tms: "GoogleMapsCompatible_Level9", sensor: "MODIS Aqua+Terra LANCE flood, 2-day", res: "250 m", opacity: 0.55 },
    { key: "flood_viirs", kind: "overlay", id: "VIIRS_Combined_Flood_2-Day", ext: "png", tms: "GoogleMapsCompatible_Level9", sensor: "VIIRS LANCE flood, 2-day", res: "375 m", opacity: 0.55 },
    { key: "water_dswx", kind: "overlay", id: "OPERA_L3_Dynamic_Surface_Water_Extent-HLS", ext: "png", tms: "GoogleMapsCompatible_Level12", sensor: "OPERA DSWx from HLS (Landsat + Sentinel-2)", res: "30 m" },
    { key: "snow_modis", kind: "overlay", id: "MODIS_Terra_NDSI_Snow_Cover", ext: "png", tms: "GoogleMapsCompatible_Level8", sensor: "MODIS Terra NDSI snow cover", res: "500 m", opacity: 0.7 },
    { key: "hls_s30", kind: "overlay", id: "HLS_S30_Nadir_BRDF_Adjusted_Reflectance", ext: "png", tms: "GoogleMapsCompatible_Level12", sensor: "HLS Sentinel-2", res: "30 m", opacity: 1 },
    { key: "hls_l30", kind: "overlay", id: "HLS_L30_Nadir_BRDF_Adjusted_Reflectance", ext: "png", tms: "GoogleMapsCompatible_Level12", sensor: "HLS Landsat 8/9", res: "30 m", opacity: 1 },
  ],
};
