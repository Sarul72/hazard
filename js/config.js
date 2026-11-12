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

/** The Earth Engine App that maps a flood inside a drawn area at 10-30 m (gee_app/flood_aoi.js, published from the Code Editor). */
export const FLOOD_APP_URL = "https://temp-support-478105.projects.earthengine.app/view/flood-aoi";

/** The Earth Engine App that maps burned area and burn severity inside a drawn area (gee_app/fire_aoi.js). */
export const FIRE_APP_URL = "https://temp-support-478105.projects.earthengine.app/view/fire-aoi";

/** The Earth Engine App that checks dust over a drawn area with TROPOMI, CAMS and MODIS (gee_app/dust_aoi.js). */
export const DUST_APP_URL = "https://temp-support-478105.projects.earthengine.app/view/dust-aoi";

/** Local clock used for all daily aggregation (Ulaanbaatar, UTC+8). */
export const TZ = "Asia/Ulaanbaatar";
export const TZ_OFFSET_HOURS = 8;

/** Five-class scale shared by all hazards. Score is 0..100. The colours here serve the older tools; the map and the area window
 * use PALETTES below, one family per hazard. */
export const CLASSES = [
  { key: "very_low",  min: 0,  max: 20,  color: "#ffe9a8", alpha: 0.22, ink: "#111" },
  { key: "low",       min: 20, max: 40,  color: "#fdc04f", alpha: 0.55, ink: "#111" },
  { key: "moderate",  min: 40, max: 60,  color: "#f6802b", alpha: 0.64, ink: "#111" },
  { key: "high",      min: 60, max: 80,  color: "#d4231f", alpha: 0.72, ink: "#fff" },
  { key: "very_high", min: 80, max: 100.0001, color: "#6d0a2c", alpha: 0.82, ink: "#fff" },
];

/** One colour family per hazard, each step lighter to darker in the order of CLASSES, so that maps of different hazards cannot be
 * mistaken for each other and each still reads in grey. Only the colour changes: the classes and their limits stay the same. */
export const PALETTES = {
  all: ["#eee4f7", "#cfb0e6", "#a873cf", "#7436a8", "#431270"],
  fire: ["#fde3d6", "#f9b295", "#ef6f4f", "#c9211e", "#7c0a12"],
  flood: ["#deeefa", "#a6d0ef", "#5aa3dd", "#1c6cb5", "#0b3a78"],
  dust: ["#e4f3dd", "#a6d89a", "#63b562", "#25854a", "#0b572c"],
  dzud: ["#f2e8d8", "#dcc29a", "#bf935b", "#8c5e2d", "#4f3112"], // browns: pasture and herds, apart from the four above
};

const channel = (hex, i) => { const v = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
/** Relative luminance, as WCAG defines it. */
export const luminance = (hex) => 0.2126 * channel(hex, 0) + 0.7152 * channel(hex, 1) + 0.0722 * channel(hex, 2);
const inkOn = (hex) => { const l = luminance(hex); return (l + 0.05) / 0.0565 >= 1.05 / (l + 0.05) ? "#111111" : "#ffffff"; };

/** The classes in the colours of a hazard. */
export const classesFor = (hazard) => { const p = PALETTES[hazard] ?? PALETTES.all; return CLASSES.map((c, i) => ({ ...c, color: p[i], ink: inkOn(p[i]) })); };

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
  archive: "https://archive-api.open-meteo.com/v1/archive",
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
 * `versions` (newest first) is for a sensor flown on several satellites: each serves the days from its `from` on, because
 * one satellite's record can stop while the sensor carries on. Suomi NPP stops at 2026-11-02 in GIBS, read on 2026-11-07.
 * `from` is the first day of the record; days before it have nothing to show.
 */
export const GIBS = {
  base: "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best",
  wms: "https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi",
  layers: [
    { key: "truecolor_terra", kind: "base", id: "MODIS_Terra_CorrectedReflectance_TrueColor", ext: "jpg", tms: "GoogleMapsCompatible_Level9", sensor: "MODIS Terra", res: "250 m" },
    { key: "truecolor_aqua", kind: "base", id: "MODIS_Aqua_CorrectedReflectance_TrueColor", ext: "jpg", tms: "GoogleMapsCompatible_Level9", sensor: "MODIS Aqua", res: "250 m", from: "2002-07-03" },
    { key: "truecolor_viirs", kind: "base", ext: "jpg", tms: "GoogleMapsCompatible_Level9", res: "250 m", versions: [
      { from: "2024-02-29", id: "VIIRS_NOAA21_CorrectedReflectance_TrueColor", sensor: "VIIRS NOAA-21" },
      { from: "2022-01-14", id: "VIIRS_NOAA20_CorrectedReflectance_TrueColor", sensor: "VIIRS NOAA-20" },
      { from: "2015-11-24", id: "VIIRS_SNPP_CorrectedReflectance_TrueColor", sensor: "VIIRS Suomi NPP" },
    ] },
    // Atmospherically corrected, Terra and Aqua gridded together: no swath seams, so days compare like for like.
    // Clouds and heavy aerosol are masked (black). Published about two days after the overpass.
    { key: "maiac_brf", kind: "base", id: "MODIS_Combined_MAIAC_L2G_BidirectionalReflectance_Bands143", ext: "jpg", tms: "GoogleMapsCompatible_Level7", sensor: "MODIS MAIAC Terra+Aqua", res: "1 km", steady: true },
    // MOD09A1: best observation of each 500 m cell over 8 days (periods restart on 1 January).
    { key: "sr_8day", kind: "base", id: "MODIS_Terra_L3_SurfaceReflectance_Bands143_8Day", ext: "jpg", tms: "GoogleMapsCompatible_Level8", sensor: "MODIS Terra MOD09A1", res: "500 m", period: 8, steady: true },
    { key: "fire_viirs", kind: "overlay", type: "wms", res: "375 m", versions: [
      { from: "2024-01-17", id: "VIIRS_NOAA21_Thermal_Anomalies_375m_All", sensor: "VIIRS NOAA-21" },
      { from: "2020-01-01", id: "VIIRS_NOAA20_Thermal_Anomalies_375m_All", sensor: "VIIRS NOAA-20" },
      { from: "2012-01-20", id: "VIIRS_SNPP_Thermal_Anomalies_375m_All", sensor: "VIIRS Suomi NPP" },
    ] },
    { key: "fire_modis", kind: "overlay", type: "wms", id: "MODIS_Combined_Thermal_Anomalies_All", sensor: "MODIS Terra+Aqua", res: "1 km" },
    { key: "aod_deepblue", kind: "overlay", id: "MODIS_Terra_AOD_Deep_Blue_Combined", ext: "png", tms: "GoogleMapsCompatible_Level6", sensor: "MODIS Terra Deep Blue AOD", res: "10 km" },
    // MAIAC AOD itself (MCD19A2), Terra and Aqua together: published about two days after the overpass.
    { key: "aod_maiac", kind: "overlay", id: "MODIS_Combined_MAIAC_L2G_AerosolOpticalDepth", ext: "png", tms: "GoogleMapsCompatible_Level7", sensor: "MODIS MAIAC Terra+Aqua AOD", res: "1 km" },
    // Dark Target and Deep Blue merged (MCDAODHD), 10 km at the sensor; GIBS draws it on a 2 km grid. Not MAIAC.
    { key: "aod_modis", kind: "overlay", id: "MODIS_Combined_Value_Added_AOD", ext: "png", tms: "GoogleMapsCompatible_Level6", sensor: "MODIS Terra+Aqua DT/DB AOD (MCDAODHD)", res: "10 km" },
    { key: "dust_airs", kind: "overlay", id: "AIRS_L2_Dust_Score_Day", ext: "png", tms: "GoogleMapsCompatible_Level6", sensor: "AIRS dust score (day)", res: "45 km" },
    { key: "precip_imerg", kind: "overlay", id: "IMERG_Precipitation_Rate", ext: "png", tms: "GoogleMapsCompatible_Level6", sensor: "GPM IMERG", res: "10 km" },
    { key: "flood_modis", kind: "overlay", id: "MODIS_Combined_Flood_2-Day", ext: "png", tms: "GoogleMapsCompatible_Level9", sensor: "MODIS Aqua+Terra LANCE flood, 2-day", res: "250 m", opacity: 0.55 },
    { key: "flood_viirs", kind: "overlay", id: "VIIRS_Combined_Flood_2-Day", ext: "png", tms: "GoogleMapsCompatible_Level9", sensor: "VIIRS LANCE flood, 2-day", res: "375 m", opacity: 0.55 },
    { key: "hls_s30", kind: "overlay", sparse: true, id: "HLS_S30_Nadir_BRDF_Adjusted_Reflectance", ext: "png", tms: "GoogleMapsCompatible_Level12", sensor: "HLS Sentinel-2", res: "30 m", opacity: 1 },
    { key: "hls_l30", kind: "overlay", sparse: true, id: "HLS_L30_Nadir_BRDF_Adjusted_Reflectance", ext: "png", tms: "GoogleMapsCompatible_Level12", sensor: "HLS Landsat 8/9", res: "30 m", opacity: 1 },
  ],
};

/** Mines offered in the dust-plume tool. Coordinates come from Global Energy Monitor / Wikipedia and are good to
 * about 1 km; the first one is the point in the user's own Earth Engine script. "Any point" is set by a map click. */
export const MINES = [
  { id: "uhg", material: "coal", mn: "Ухаа Худаг (Цогтцэций сум, Өмнөговь)", en: "Ukhaa Khudag (Tsogttsetsii, Ömnögovi)", lat: 43.6678, lon: 105.5181, src: "user script; Wikipedia 43.6754 N 105.5211 E" },
  { id: "tt_small", material: "coal", mn: "Жижиг Таван толгой (Цогтцэций, Өмнөговь)", en: "Small Tavan Tolgoi (Tsogttsetsii, Ömnögovi)", lat: 43.6517, lon: 105.4417, src: "Global Energy Monitor (approximate)" },
  { id: "bayanshand", material: "coal", mn: "Баяншанд / Довцог Худаг (Мандах сум, Дорноговь)", en: "Bayanshand / Dovtsog Khudag (Mandakh, Dornogovi)", lat: 44.1797, lon: 108.3206, src: "Global Energy Monitor (exact)" },
  { id: "oyu", material: "chalcopyrite", mn: "Оюу Толгой (Ханбогд сум, Өмнөговь)", en: "Oyu Tolgoi (Khanbogd, Ömnögovi)", lat: 43.0083, lon: 106.8431, src: "Wikipedia, List of mines in Mongolia" },
  { id: "erdenet", material: "chalcopyrite", mn: "Эрдэнэт (Баян-Өндөр сум, Орхон)", en: "Erdenet (Bayan-Öndör, Orkhon)", lat: 49.0278, lon: 104.0444, src: "Wikipedia, List of mines in Mongolia" },
  { id: "baganuur", material: "coal", mn: "Багануур (Улаанбаатар)", en: "Baganuur (Ulaanbaatar)", lat: 47.7506, lon: 108.3249, src: "Global Energy Monitor wiki, exact" },
  { id: "eldev", material: "coal", mn: "Элдэв (Далан-Жаргалан сум, Дорноговь)", en: "Eldev (Dalanjargalan, Dornogovi)", lat: 46.1203, lon: 108.9915, src: "Global Energy Monitor (exact)" },
];

/** Coal mines in seasonal grass cover, for the "mine dust and vegetation" box. Positions from the Global Energy Monitor
 * coal mine tracker (exact) unless noted. The list is separate from MINES so the plume tool keeps its own choices. */
export const VEG_MINES = [
  { id: "baganuur", mn: "Багануур (Улаанбаатар)", en: "Baganuur (Ulaanbaatar)", lat: 47.7506, lon: 108.3249, src: "Global Energy Monitor (exact)" },
  { id: "sharyngol", mn: "Шарын гол (Дархан-Уул)", en: "Sharyn Gol (Darkhan-Uul)", lat: 49.2279, lon: 106.4224, src: "Global Energy Monitor (exact)" },
  { id: "nalaikh", mn: "Налайх (Улаанбаатар)", en: "Nalaikh (Ulaanbaatar)", lat: 47.7553, lon: 107.2934, src: "Wikipedia" },
  { id: "shivee", mn: "Шивээ-Овоо (Говьсүмбэр)", en: "Shivee-Ovoo (Govisümber)", lat: 46.2240, lon: 108.5307, src: "Global Energy Monitor (exact)" },
  { id: "khushuut", mn: "Хөшөөт (Дарви сум, Ховд)", en: "Khushuut (Darvi, Khovd)", lat: 46.8072, lon: 93.3096, src: "Global Energy Monitor (exact)" },
  { id: "mogoingol", mn: "Могойн гол (Цэцэрлэг сум, Хөвсгөл)", en: "Mogoin Gol (Tsetserleg, Khövsgöl)", lat: 49.3584, lon: 97.8296, src: "Global Energy Monitor (exact)" },
  { id: "aduunchuluun", mn: "Адуунчулуун (Чойбалсан, Дорнод)", en: "Aduunchuluun (Choibalsan, Dornod)", lat: 48.1272, lon: 114.5378, src: "Global Energy Monitor (exact)" },
];
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

/** The Earth Engine App that maps a flood inside a drawn area at 10-30 m (gee_app/flood_aoi.js, published from the Code Editor). */
export const FLOOD_APP_URL = "https://temp-support-478105.projects.earthengine.app/view/flood-aoi";

/** The Earth Engine App that maps burned area and burn severity inside a drawn area (gee_app/fire_aoi.js). */
export const FIRE_APP_URL = "https://temp-support-478105.projects.earthengine.app/view/fire-aoi";

/** The Earth Engine App that checks dust over a drawn area with TROPOMI, CAMS and MODIS (gee_app/dust_aoi.js). */
export const DUST_APP_URL = "https://temp-support-478105.projects.earthengine.app/view/dust-aoi";

/** Local clock used for all daily aggregation (Ulaanbaatar, UTC+8). */
export const TZ = "Asia/Ulaanbaatar";
export const TZ_OFFSET_HOURS = 8;

/** Five-class scale shared by all hazards. Score is 0..100. The colours here serve the older tools; the map and the area window
 * use PALETTES below, one family per hazard. */
export const CLASSES = [
  { key: "very_low",  min: 0,  max: 20,  color: "#ffe9a8", alpha: 0.22, ink: "#111" },
  { key: "low",       min: 20, max: 40,  color: "#fdc04f", alpha: 0.55, ink: "#111" },
  { key: "moderate",  min: 40, max: 60,  color: "#f6802b", alpha: 0.64, ink: "#111" },
  { key: "high",      min: 60, max: 80,  color: "#d4231f", alpha: 0.72, ink: "#fff" },
  { key: "very_high", min: 80, max: 100.0001, color: "#6d0a2c", alpha: 0.82, ink: "#fff" },
];

/** One colour family per hazard, each step lighter to darker in the order of CLASSES, so that maps of different hazards cannot be
 * mistaken for each other and each still reads in grey. Only the colour changes: the classes and their limits stay the same. */
export const PALETTES = {
  all: ["#eee4f7", "#cfb0e6", "#a873cf", "#7436a8", "#431270"],
  fire: ["#fde3d6", "#f9b295", "#ef6f4f", "#c9211e", "#7c0a12"],
  flood: ["#deeefa", "#a6d0ef", "#5aa3dd", "#1c6cb5", "#0b3a78"],
  dust: ["#e4f3dd", "#a6d89a", "#63b562", "#25854a", "#0b572c"],
  dzud: ["#f2e8d8", "#dcc29a", "#bf935b", "#8c5e2d", "#4f3112"], // browns: pasture and herds, apart from the four above
};

const channel = (hex, i) => { const v = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
/** Relative luminance, as WCAG defines it. */
export const luminance = (hex) => 0.2126 * channel(hex, 0) + 0.7152 * channel(hex, 1) + 0.0722 * channel(hex, 2);
const inkOn = (hex) => { const l = luminance(hex); return (l + 0.05) / 0.0565 >= 1.05 / (l + 0.05) ? "#111111" : "#ffffff"; };

/** The classes in the colours of a hazard. */
export const classesFor = (hazard) => { const p = PALETTES[hazard] ?? PALETTES.all; return CLASSES.map((c, i) => ({ ...c, color: p[i], ink: inkOn(p[i]) })); };

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
  archive: "https://archive-api.open-meteo.com/v1/archive",
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
 * `versions` (newest first) is for a sensor flown on several satellites: each serves the days from its `from` on, because
 * one satellite's record can stop while the sensor carries on. Suomi NPP stops at 2026-11-02 in GIBS, read on 2026-11-07.
 * `from` is the first day of the record; days before it have nothing to show.
 */
export const GIBS = {
  base: "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best",
  wms: "https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi",
  layers: [
    { key: "truecolor_terra", kind: "base", id: "MODIS_Terra_CorrectedReflectance_TrueColor", ext: "jpg", tms: "GoogleMapsCompatible_Level9", sensor: "MODIS Terra", res: "250 m" },
    { key: "truecolor_aqua", kind: "base", id: "MODIS_Aqua_CorrectedReflectance_TrueColor", ext: "jpg", tms: "GoogleMapsCompatible_Level9", sensor: "MODIS Aqua", res: "250 m", from: "2002-07-03" },
    { key: "truecolor_viirs", kind: "base", ext: "jpg", tms: "GoogleMapsCompatible_Level9", res: "250 m", versions: [
      { from: "2024-02-29", id: "VIIRS_NOAA21_CorrectedReflectance_TrueColor", sensor: "VIIRS NOAA-21" },
      { from: "2022-01-14", id: "VIIRS_NOAA20_CorrectedReflectance_TrueColor", sensor: "VIIRS NOAA-20" },
      { from: "2015-11-24", id: "VIIRS_SNPP_CorrectedReflectance_TrueColor", sensor: "VIIRS Suomi NPP" },
    ] },
    // Atmospherically corrected, Terra and Aqua gridded together: no swath seams, so days compare like for like.
    // Clouds and heavy aerosol are masked (black). Published about two days after the overpass.
    { key: "maiac_brf", kind: "base", id: "MODIS_Combined_MAIAC_L2G_BidirectionalReflectance_Bands143", ext: "jpg", tms: "GoogleMapsCompatible_Level7", sensor: "MODIS MAIAC Terra+Aqua", res: "1 km", steady: true },
    // MOD09A1: best observation of each 500 m cell over 8 days (periods restart on 1 January).
    { key: "sr_8day", kind: "base", id: "MODIS_Terra_L3_SurfaceReflectance_Bands143_8Day", ext: "jpg", tms: "GoogleMapsCompatible_Level8", sensor: "MODIS Terra MOD09A1", res: "500 m", period: 8, steady: true },
    { key: "fire_viirs", kind: "overlay", type: "wms", res: "375 m", versions: [
      { from: "2024-01-17", id: "VIIRS_NOAA21_Thermal_Anomalies_375m_All", sensor: "VIIRS NOAA-21" },
      { from: "2020-01-01", id: "VIIRS_NOAA20_Thermal_Anomalies_375m_All", sensor: "VIIRS NOAA-20" },
      { from: "2012-01-20", id: "VIIRS_SNPP_Thermal_Anomalies_375m_All", sensor: "VIIRS Suomi NPP" },
    ] },
    { key: "fire_modis", kind: "overlay", type: "wms", id: "MODIS_Combined_Thermal_Anomalies_All", sensor: "MODIS Terra+Aqua", res: "1 km" },
    { key: "aod_deepblue", kind: "overlay", id: "MODIS_Terra_AOD_Deep_Blue_Combined", ext: "png", tms: "GoogleMapsCompatible_Level6", sensor: "MODIS Terra Deep Blue AOD", res: "10 km" },
    // MAIAC AOD itself (MCD19A2), Terra and Aqua together: published about two days after the overpass.
    { key: "aod_maiac", kind: "overlay", id: "MODIS_Combined_MAIAC_L2G_AerosolOpticalDepth", ext: "png", tms: "GoogleMapsCompatible_Level7", sensor: "MODIS MAIAC Terra+Aqua AOD", res: "1 km" },
    // Dark Target and Deep Blue merged (MCDAODHD), 10 km at the sensor; GIBS draws it on a 2 km grid. Not MAIAC.
    { key: "aod_modis", kind: "overlay", id: "MODIS_Combined_Value_Added_AOD", ext: "png", tms: "GoogleMapsCompatible_Level6", sensor: "MODIS Terra+Aqua DT/DB AOD (MCDAODHD)", res: "10 km" },
    { key: "dust_airs", kind: "overlay", id: "AIRS_L2_Dust_Score_Day", ext: "png", tms: "GoogleMapsCompatible_Level6", sensor: "AIRS dust score (day)", res: "45 km" },
    { key: "precip_imerg", kind: "overlay", id: "IMERG_Precipitation_Rate", ext: "png", tms: "GoogleMapsCompatible_Level6", sensor: "GPM IMERG", res: "10 km" },
    { key: "flood_modis", kind: "overlay", id: "MODIS_Combined_Flood_2-Day", ext: "png", tms: "GoogleMapsCompatible_Level9", sensor: "MODIS Aqua+Terra LANCE flood, 2-day", res: "250 m", opacity: 0.55 },
    { key: "flood_viirs", kind: "overlay", id: "VIIRS_Combined_Flood_2-Day", ext: "png", tms: "GoogleMapsCompatible_Level9", sensor: "VIIRS LANCE flood, 2-day", res: "375 m", opacity: 0.55 },
    { key: "hls_s30", kind: "overlay", sparse: true, id: "HLS_S30_Nadir_BRDF_Adjusted_Reflectance", ext: "png", tms: "GoogleMapsCompatible_Level12", sensor: "HLS Sentinel-2", res: "30 m", opacity: 1 },
    { key: "hls_l30", kind: "overlay", sparse: true, id: "HLS_L30_Nadir_BRDF_Adjusted_Reflectance", ext: "png", tms: "GoogleMapsCompatible_Level12", sensor: "HLS Landsat 8/9", res: "30 m", opacity: 1 },
  ],
};

/** Mines offered in the dust-plume tool. Coordinates come from Global Energy Monitor / Wikipedia and are good to
 * about 1 km; the first one is the point in the user's own Earth Engine script. "Any point" is set by a map click. */
export const MINES = [
  { id: "uhg", material: "coal", mn: "Ухаа Худаг (Цогтцэций сум, Өмнөговь)", en: "Ukhaa Khudag (Tsogttsetsii, Ömnögovi)", lat: 43.6678, lon: 105.5181, src: "user script; Wikipedia 43.6754 N 105.5211 E" },
  { id: "tt_small", material: "coal", mn: "Жижиг Таван толгой (Цогтцэций, Өмнөговь)", en: "Small Tavan Tolgoi (Tsogttsetsii, Ömnögovi)", lat: 43.6517, lon: 105.4417, src: "Global Energy Monitor (approximate)" },
  { id: "bayanshand", material: "coal", mn: "Баяншанд / Довцог Худаг (Мандах сум, Дорноговь)", en: "Bayanshand / Dovtsog Khudag (Mandakh, Dornogovi)", lat: 44.1797, lon: 108.3206, src: "Global Energy Monitor (exact)" },
  { id: "oyu", material: "chalcopyrite", mn: "Оюу Толгой (Ханбогд сум, Өмнөговь)", en: "Oyu Tolgoi (Khanbogd, Ömnögovi)", lat: 43.0083, lon: 106.8431, src: "Wikipedia, List of mines in Mongolia" },
  { id: "erdenet", material: "chalcopyrite", mn: "Эрдэнэт (Баян-Өндөр сум, Орхон)", en: "Erdenet (Bayan-Öndör, Orkhon)", lat: 49.0278, lon: 104.0444, src: "Wikipedia, List of mines in Mongolia" },
  { id: "baganuur", material: "coal", mn: "Багануур (Улаанбаатар)", en: "Baganuur (Ulaanbaatar)", lat: 47.7506, lon: 108.3249, src: "Global Energy Monitor wiki, exact" },
  { id: "eldev", material: "coal", mn: "Элдэв (Далан-Жаргалан сум, Дорноговь)", en: "Eldev (Dalanjargalan, Dornogovi)", lat: 46.1203, lon: 108.9915, src: "Global Energy Monitor (exact)" },
];
