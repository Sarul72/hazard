# Methods

Every score is a **relative index from 0 to 100, not a probability**. Classes: 0–20 very low, 20–40 low, 40–60 moderate, 60–80 high, 80–100 very high. A missing input gives **no data (null), never 0**. All formulas live in `js/risk.js`, `js/fwi.js`, `js/flood_stats.js`; all thresholds in `js/config.js`.

## What is observed and what is modelled

| Layer | Nature | Source |
|---|---|---|
| Risk scores (all three hazards) | **Model forecast**, next 72 h (fire: today + 2 days) | Open-Meteo forecast, CAMS, GloFAS |
| Satellite imagery and overlays | **Observation**, previous day or earlier | NASA GIBS (MODIS, VIIRS, GPM IMERG, HLS) |
| Fire detections (optional) | **Observation**, last 3 days | NASA FIRMS (VIIRS, MODIS) |

The index is not computed *from* the satellite layers; they are shown beside it so a reader can compare. Computing risk directly from Sentinel/Landsat rasters needs Google Earth Engine or a server, see `ROADMAP.md`.

## Wildfire

Canadian Fire Weather Index System (Van Wagner 1987; Van Wagner and Pickett 1985): FFMC, DMC, DC, ISI, BUI, FWI. It is the basis of EFFIS, GWIS and the ECMWF GEFF forecast.

- Daily inputs at **12:00 local**: temperature, relative humidity, 10 m wind (km/h), precipitation over the 24 h ending at noon.
- Run from the first day of a **92-day history** (Open-Meteo `past_days` maximum) with start values FFMC 85, DMC 6, DC 15.
- Score: FWI mapped piecewise-linearly through the **EFFIS class limits** 0, 5.2, 11.2, 21.3, 38, 50 to scores 0, 20, 40, 60, 80, 100 (EFFIS: very low < 5.2, low 5.2–11.2, moderate 11.2–21.3, high 21.3–38, very high 38–50, extreme ≥ 50; our top class merges very high and extreme).
- Snow depth ≥ 1 cm at noon sets the day's score to 0; the FWI is still shown.
- The point score is the maximum over today and the next 2 days.

**Verification.** `tests/fwi.test.mjs` reproduces the first-day reference values of the cffdrs R package test data (FFMC 87.692, DMC 8.545, DC 19.013, ISI 10.853, FWI 10.096). The same test found and fixed an error in our DC formula during development.

**Limits.** FWI measures weather-driven dryness only. It ignores fuel load, vegetation type, curing, terrain and human ignition. The 92-day spin-up from default start values can under-estimate DC and BUI late in a dry season. EFFIS classes were derived for Europe; Greek work (Tethys 2018) found them poorly discriminating there, so Mongolian use needs local calibration against burned-area or active-fire records.

## Dust storm

Score = max( CAMS term, emission-potential term ).

1. **CAMS term.** Modelled surface dust concentration (µg/m³, `dust` from the Open-Meteo air quality API, CAMS global, 0.4°), maximum over 72 h, mapped through breakpoints 0, 10, 45, 100, 250, 500 → 0, 20, 40, 60, 80, 100. 45 µg/m³ is the WHO 2021 24-h PM10 guideline, 100 the second interim target. Hourly dust is compared with a 24-h guideline only as a reference level.
2. **Emission potential.** For each hour in the next 72 h: wind factor = clamp((u₁₀ − 6)/(14 − 6), 0, 1), forced to 0 if snow depth ≥ 1 cm or the calendar day's precipitation ≥ 0.254 mm (US EPA AP-42 13.2.2 wet-day rule). Maximum over hours × 100, **capped at 79** so that potential alone cannot reach "very high": nothing says dust is actually in the air. The 6 m/s onset follows the lowest of the 6, 8 and 10 m/s dust-prone-day thresholds used by the reference project Buyja047/earth_trending (which cites US EPA AP-42 and Kurosaki and Mikami 2004, 2005, not re-checked here); 14 m/s as the "strong" end is a heuristic.

**Limits.** No soil texture, vegetation or surface-roughness data; Gobi dust sources and the Altai foothills differ. CAMS cells are ~45 km. A point score for an aimag centre may miss dust in the south of the aimag.

## Flood

Score = max( rain term, discharge term ), + 15 if rain falls on snow (snow depth ≥ 5 cm, rain ≥ 0.5 mm/h, T > 0 °C).

1. **Rain term.** Forecast liquid rain over the next 72 h. Maximum rolling 24-h total mapped through 0, 10, 25, 50, 80 mm → 0, 25, 50, 75, 100; maximum hourly rate mapped through 0, 5, 10, 20, 40 mm/h → same scores; the larger of the two.
2. **Discharge term.** GloFAS v4 river discharge (via Open-Meteo, 0.05°, "largest river in a 5 km area"): maximum over today + 10 days.
   - With **return levels** (`data/flood_thresholds.json`: Gumbel fit by L-moments to annual maxima of a 1990–2024 reanalysis, `scripts/build-flood-thresholds.mjs`): 0.25·Q2, Q2, Q5, Q20, 1.5·Q20 → 0, 40, 60, 80, 100.
   - Without them: rise factor = forecast max ÷ median of the previous 30 days, mapped 1.5, 2.5, 4, 8 → 0, 40, 70, 100, ignored if the forecast maximum is below 0.5 m³/s; flagged `no_return_levels` and shown as such.

**Limits.** Convective cloudbursts of 10–40 mm in 30 minutes, which cause Ulaanbaatar flash floods, are smoothed out by model grids. GloFAS snapping may pick a different river than the one near the aimag centre. Ice-jam floods are not modelled.

## Worst-case checks

1. **Missing data.** Unit tests with nulls scattered through every input array, and with entire APIs missing, give `null` or a flagged partial score, never a fabricated 0 (`tests/risk.test.mjs`, `tests/pipeline.test.mjs`).
2. **Extreme inputs.** 60 seeded random extreme weather states (−45 to +48 °C, 0–100 % RH, wind to 45 m/s, rain to 90 mm, discharge to 3000 m³/s): all scores finite and in 0–100.
3. **Monotonicity.** Dust score does not decrease with wind; FWI does not decrease with ISI or BUI; rain lowers all moisture codes.
4. **Threshold sensitivity** (`node scripts/sensitivity.mjs`, 150 seeded synthetic scenarios; only the *sensitivity* is meaningful, the class counts depend on the generator). Share of scenarios that change class when a threshold set is scaled:

| Hazard | Change | Scenarios changing class |
|---|---|---|
| fire | all FWI class limits ×0.8 / ×1.2 | 23 % / 21 % |
| dust | wind onset and strong ×0.8 / ×1.2 | 3 % / 4 % |
| dust | CAMS breakpoints ×0.8 / ×1.2 | 29 % / 45 % |
| flood | 24-h rain breakpoints ×0.8 / ×1.2 | 0 % / 1 % |
| flood | hourly rain breakpoints ×0.8 / ×1.2 | 0 % / 0 % |

Reading: class boundaries are fragile for fire and especially for the CAMS dust term. Read the **number**, not only the colour, and do not treat a one-class difference between two aimags as meaningful.

## International methods used or reviewed

| Work | What it is | Use here |
|---|---|---|
| Van Wagner (1987); EFFIS / ECMWF GEFF | Canadian FWI and its operational classes | **Used** (fire) |
| McNorton et al. (2024), *Geophys. Res. Lett.* 51, e2023GL107929 | ECMWF global Probability-of-Fire: data-driven model on satellite fuel and MODIS active-fire data, forecasts up to 10 days | Reviewed. Not reproduced: needs ECMWF model fields. Future: use as external check, `ROADMAP.md` |
| DeVries et al. (2020), *Remote Sens. Environ.* 240 | Flood extent from Sentinel-1 SAR time-series z-scores plus Landsat water probability, on Google Earth Engine; 89.8 % area-normalised accuracy in the Houston test | Reviewed. Not in this version (needs Earth Engine). Future, `ROADMAP.md` |
| Duan et al. (2026), *Land Use Policy* 170, 108171 | ML forest-fire susceptibility mapping in Hazara Division, Khyber Pakhtunkhwa, Pakistan from remote-sensing predictors | Reviewed from the abstract only. Study area is mountain forest; transfer to Mongolian steppe is unproven |
| Hosking (1990); GloFAS | L-moments; return-level alert thresholds | **Used** (flood return levels) |
| WHO (2021) air quality guidelines; US EPA AP-42 13.2.2 | PM10 reference levels; dust wet-day rule | **Used** (dust) |
