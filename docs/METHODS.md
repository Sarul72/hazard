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

## Polygon risk tool (added 2026-11)

* The user draws a polygon. A regular lat/lon grid of at most 7 x 7 nodes covers its bounding box (spacing at least 0.1 degree, because the weather and CAMS models behind the scores are 0.1-0.4 degree).
* Every node gets the same three scores as a province point (Fire Weather Index, dust, flood) from Open-Meteo. The flood score at a node uses rainfall plus the river-discharge rise factor; the fitted return levels exist only for the 22 province points.
* Scores are interpolated bilinearly onto a pixel raster (up to 180 px on the long side) and coloured with the five hazard classes. **The pixel size is a display size, not a measurement size**: inside one model cell the colour changes only because of interpolation. For fine detail use the 30 m satellite layers.
* Worst case checked: a polygon smaller than one model cell gets almost one colour (correct, not a bug); a polygon covering all of Mongolia is capped at 49 nodes, so pixels are about 150 km apart in the node sense.

## Mine dust plume tool (added 2026-11)

* Wind: Open-Meteo hourly 10 m wind on a 7 x 7 grid (0.6 degree north-south, 0.8 degree east-west) around the source. Dates older than 85 days use the ERA5 archive, newer dates the forecast API (which holds the last 92 days and 16 days ahead).
* Transport: Lagrangian Gaussian puffs released every 3 minutes, moved by the interpolated wind.
* Spread: Briggs (1973) open-country neutral-air curve, sigma_y = 0.11 x / sqrt(1 + 0.0001 x), plus a 150 m source size. **Source conflict:** one retrieved copy of the table lists class D open-country as 0.08 x and the more common listing (Briggs 1973 as reproduced in textbooks) gives 0.11 x for D and 0.16 x for C; the urban D value of 0.16 agrees in both. This tool uses 0.11. The choice changes plume width by up to about 30 % (0.08 to 0.16 spans a factor 2 in the extremes) but not the direction or timing. The check that settles it is the primary source: Briggs, G.A. (1973), ATDL Contribution File No. 79.
* Settling: puff mass decays with a 6 h time constant (assumption for coarse dust; no measurement).
* Emission: relative, 0.2 + (u/6)^3 capped at 20 times (assumption: dust lift rises steeply with wind). Snow cover and rain are not modelled at the mine.
* Output scale: the index is a percentage of the strongest pixel more than 3 km from the source in the run. It is not a concentration. CAMS dust and PM10 at the source are shown beside it for context; CAMS is 0.4 degree, so it cannot resolve the mine.
* Households: OpenStreetMap (ger, houses, huts, farmyards, places, and names containing "өвөлжө" or "хаваржаа"), extracted by GitHub Actions into data/settlements.json. Exposed = peak plume index of at least 2 in the run.
* Water: NASA OPERA DSWx surface-water layer (Landsat + Sentinel-2) and OpenStreetMap water polygons.

### Dust types (added 2026-11)
An element does not move dust by itself. The tool follows AERMOD deposition Method 1 and HYSPLIT, which define a particle by diameter and density. Five size bins from the US EPA AP-42 13.2.4 multipliers; Stokes settling with the Cunningham correction; loss from the air at v_g sqrt(2/pi) / sigma_z (Chamberlain source depletion), with Briggs open-country class D sigma_z capped by a 1000 m mixed layer. The index scale is what the air would hold if nothing settled, so a heavy mineral really shows a smaller plume. All types share one size distribution, read as physical sizes: no measured distribution of Mongolian mine dust was found, so real differences may not match. `tests/dust.test.mjs` holds the settling to a separate scipy calculation. The full list of limits is in the methods window of the tool.

Air stability, rain and the mixed layer enter by the hour since 2026-11: the class comes from wind and solar radiation (US EPA-454/R-99-005 Table 6-7), and the spread follows the Briggs open-country curve of that class. The earlier code used the 0.11 coefficient of class C while calling it class D; this is corrected. The ground-level index now falls with the vertical spread, and `tests/physics.test.mjs` holds a steady plume to the analytic Gaussian plume equation. Emission is the AP-42 13.2.4 wind term and stops in rain; precipitation washes dust out with the CALPUFF coefficients. Each run is repeated with the wind turned by 20 degrees and scaled by 20 percent, to show how much the result leans on the wind.

### Surface water (replaced 2026-11)
The OPERA DSWx tiles were removed. They show one day of Landsat and Sentinel-2 and paint "not water" white and cloud grey, so they read as false water. `data/water.geojson` comes from JRC Global Surface Water (`scripts/build_water.py`): a 30 m pixel seen as water in at least half of its clear observations, 1984 to 2021, traced at about 250 m and kept from 0.3 km2 up, 924 bodies. Against published areas: Khövsgöl 2782 km2 (2760), Buir 610 (615), Ögii 25.5 (25), Achit 294 (290), Telmen 208 (194), Uvs 3588 (3350), Khyargas 1527 (1407). Khar-Us gives 970 (1578), because the published figure includes reed beds. It is a long-term map, not the water of the chosen day, and thin rivers are broken or missing.

### Borders (added 2026-11)
No Mongolian standard for boundary line symbols could be found (MNS 6925-5:2021 covers land cover data, not map symbols). The lines keep the order of the USGS Topographic Map Symbols, the higher level heavier, but all three are red at the user's request: the national border solid at 1.8 px with a pale edge, the aimag border solid at 1.35 px with a fainter edge, and the soum border dashed at 1 px, so that aimag and soum lines stay apart where they meet. `scripts/build_borders.py` keeps each stretch of border once, because two dashed copies out of step would look solid. Aimag lines come from merged soums and are a simplified drawing, not an official boundary.

### Winter and spring camps (added 2026-11)
`pipeline/build_camps.py` reads only position and layer from the user's two shapefiles, drops 498 cancelled parcels, rounds to 0.01 degree and merges into counts (`data/camps.bin.gz`). The sources hold phone numbers, clan names, contract numbers and person ids and must never enter this repository. Camps appear only in the mine dust tool, for the dust that reached them, with a range from changing the wind. The two registers may overlap and are not added. The meaning of `pasture_ty` in `points` is not known; all points are treated alike.

### Opening screen and downloads (added 2026-11)
The page opens on the newest true-colour image and nothing else: no risk data is read until a hazard is chosen. `newestImageDate` in `js/gibs.js` takes today if the image already covers Mongolia, otherwise yesterday, because the tile service answers with black until the satellite has passed. Results end on the last computed day, so choosing a hazard moves the picker to that day and says so.

Each hazard has its own colour family (`PALETTES` in `js/config.js`): fire red, flood blue, dust green, combined violet. Every family runs light to dark, checked by `tests/palette.test.mjs`. Each class keeps one solid colour, with a short soft step of 2.5 points at each limit, so that classes stay clearly apart. The classes and their limits are unchanged.

`js/downloads.js` offers each kind of data in the formats that suit it, and lists only what exists at that moment. Without a selection there is the map image and one ZIP for the area on screen; a selection adds its data one by one, and the soum files then hold only the soums touched by the selection. Every download is one ZIP that also holds `<name>_README.txt`: the result, the possible error in points and as a percentage, the long-term trend of a selection, the model check, how to read the fields, and how to open each file in ArcGIS Pro, ENVI, QGIS, Excel or Google Earth. One ZIP is used because a browser may stop a second automatic download, and the text must not get lost. If the browser holds the download back, the menu shows a link to the same file for ten minutes.

The result also travels inside the file, wherever the format has a place for it. A GeoTIFF holds it in the image description and GDAL metadata, with band names and statistics, and has a `.tif.aux.xml` and an ArcGIS `.tif.xml` beside it; a Shapefile has a `.shp.xml`; an image has a `.jpg.aux.xml` or `.png.aux.xml`; GeoJSON has a top-level `metadata` member; KML has a document description; a PDF has title and subject; tables have columns `err_pct`, `area_mean` and `area_U95`; the series has the trend and its limits. The text inside a TIFF is English ASCII, because the format allows no other. A shapefile has no empty number and GIS reads a blank as 0, so missing values there are -9999.

File and field names are plain letters, digits and underscores, with the date as 20261106, because ArcGIS rewrites a hyphen in a name and shapefile fields end at ten characters. A JPG or PNG always comes with its world file, `.prj` and `.aux.xml`: without them ArcGIS puts the picture at 0, 0 with an unknown reference.

| Data | Formats | For |
|---|---|---|
| Map or satellite image | JPG, PNG, PDF (A4), a clean JPG layer with no labels, RGB GeoTIFF | reports, print, GIS placement in Web Mercator (EPSG:3857) |
| Risk raster | GeoTIFF (score, U95, EPSG:4326), KMZ | ArcGIS, QGIS, Google Earth |
| Cell data | CSV, GeoJSON points | Excel, GIS |
| Soum risk | Shapefile, GeoJSON, KML, CSV | vector GIS, Google Earth, Excel |
| Long-term series of a selection | CSV, JSON | statistics |
| Dust plume | GeoTIFF of the index, CSV of the wind | GIS, tables |
| Report | JSON | method, error, sources |

`js/formats.js` writes these by hand, as the site has no libraries. `tests/formats.test.mjs` checks them, and the real downloads were read with GDAL/OGR, pyshp and pypdf and opened in ArcGIS 3.4: 448 sampled raster cells equal the CSV, and all 339 soums agree between Shapefile and GeoJSON. Every button of the menu was also run through the everyday steps of ArcGIS Pro 3.4 (Add to a geodatabase, XY Table To Point, JSON To Features, KML To Layer, band names, statistics, metadata), with no failure, and GeoTIFF and Shapefile were read by the IDL 8.5 readers that ENVI 5.3 is built on. ENVI itself has not been opened with these files yet. ArcGIS reads the projection of the image from its `.jpg.aux.xml`, other programs from the `.prj`. U95 in cell and soum files is a lower bound where a part of the error is not estimated, and the files say so.

### Detailed flood mapping in a drawn area (added 2026-11)
The national grid stays at 0.1°. Mapping at 10–30 m runs only for an area the user draws, in a Google Earth Engine App (`gee_app/flood_aoi.js`, published from the Code Editor as `flood-aoi` under project temp-support-478105, because sigma-513109 was not offered in the publishing dialog), which the flood menu opens in a window. The site holds no Earth Engine login; the App draws on that project's noncommercial quota (Community tier, 150 EECU-hours a month since 2026-04-27), apart from the daily update, which uses sigma-513109.

* **Extent**, after the UN-SPIDER Recommended Practice: Sentinel-1 GRD, IW, VH. The last pass before and the first pass after the flood come from one relative orbit, with every frame of each pass. Both are smoothed by a 50 m focal mean, and the after/before ratio of the dB values above 1.25 marks new water. JRC Global Surface Water 1.4 seasonality ≥ 10 months, slopes above 5° on Copernicus DEM GLO-30 (2024_1), and groups of fewer than 8 pixels are removed.
* **Limits of size**: up to 500 km² at 10 m, up to 2,000 km² at 20 m, up to 5,000 km² at 30 m; larger areas are refused. Water depth only up to 500 km².
* **City**: flood pixels on ESA WorldCover v200 built-up land are kept apart and called probabilistic.
* **Optical check**: the clearest Sentinel-2 L2A day within ±3 days of the radar image gives new open water (MNDWI > 0, SCL cloud, shadow and snow removed, permanent water removed). The App shows the share of radar flood it confirms and the share of optical water the radar found.
* **Depth**: FwDET-GEE v2.1 (Peter et al. 2020; Cohen et al. 2022), ported from `FwDET2p1_GEE.txt` with its settings (boundary slope filter 0.5°, 10 smoothing passes, 5-cell kernel), Copernicus DEM in place of NED. FwDET is GPL-2.0, so the folder `gee_app/` is GPL-2.0 and the rest of the site is not.

**Tests (2026-11-08).** Sentinel-1 has no scenes over Ulaanbaatar in 2022 and 2023, so the July 2023 Selbe flood cannot be mapped by radar; Sentinel-2 after it was cloudy (07-01 and 07-03 about 100 %, 07-08 45 %). Floods reported in the news with radar on both sides were used instead, each against the clearest Sentinel-2 day:

| Flood (report) | Radar pair | Sentinel-2 | Radar flood | New water on Sentinel-2 | Radar confirmed | Optical found |
|---|---|---|---|---|---|---|
| Selenge and Orkhon at Sükhbaatar, above the danger level on 2021-09-06 (ubn.mn) | 2021-08-20 → 09-13, orbit 135 | 2021-09-17 | 24.1 km² | 16.9 km² | 33 % | 47 % |
| Kherlen at Chinggis city, 1,971 homes flooded, July 2020 (FloodList) | 2020-06-23 → 07-05, orbit 91 | 2020-07-05, same day | 1.4 km² | 3.5 km² | 63 % | 25 % |
| Orkhon at Kharkhorin, 5–10 cm above the flood level on 2025-07-14 (Montsame) | 2025-07-07 → 07-19, orbit 55 | 2025-07-23 | 2.6 km² | 1.4 km² | 22 % | 42 % |

Over thresholds from 1.10 to 1.50 the agreement (F1) peaked at 1.25–1.30 for the Selenge (0.39) and at 1.20 for the Kherlen (0.41, 0.36 at 1.25), so the UN-SPIDER default was kept and the App lets the user change it. FwDET depths on the Selenge flood: median 0.12 m, 90th percentile 0.40 m, 99th 0.79 m, plausible for water 5–65 cm above the danger level but not checked against any measurement.

A negative test matters as much: after rain on 2018-09-01 near Ulaanbaatar the radar marked 132 km² as new water, of which 94 % was grassland, while a cloud-free Sentinel-2 image two days later showed 2.3 km² of new water and almost no overlap. Haymaking and drying grass lower the radar return the way water does. A darkness rule did not help (those areas were darker than open water). This is why radar flood is shown as confirmed only where Sentinel-2 sees water.

### Burned area and burn severity in a drawn area (added 2026-11)
A second Earth Engine App (`gee_app/fire_aoi.js`, published as `fire-aoi` under temp-support-478105) maps a fire inside an area the user draws, opened from the wildfire menu.

* **Severity**: Sentinel-2 L2A NBR = (B8 − B12)/(B8 + B12), median of cloud-free pixels (SCL cloud, shadow, snow removed; scenes over 70 % cloud left out) before and after the fire. dNBR = NBR before − NBR after, classed by Key and Benson (2006): regrowth below −0.10, unburned −0.10 to 0.10, low 0.10–0.27, moderate-low 0.27–0.44, moderate-high 0.44–0.66, high above 0.66. Burned means dNBR ≥ 0.10. 20 m up to 500 km², 40 m up to 2,000 km², 60 m up to 5,000 km².
* **Comparison**: MODIS MCD64A1 burned area (500 m, monthly) is drawn as an outline and FIRMS active fire as red cells; the App gives the share of Sentinel-2 burned land inside MODIS burned area and the share of MODIS burned area that Sentinel-2 found.
* **Spring fires**: for a fire in March to May the pre-fire image comes from the previous autumn (15 September to 31 October).

**Tests (2026-11-08)**, on the largest MODIS burned patches in Mongolia since 2019, all in Dornod, with areas of about 360–380 km², and on two areas without fire:

| Area | Sentinel-2 burned, pre-fire in March–April | MODIS | F1 | Sentinel-2 burned, pre-fire in previous autumn | F1 |
|---|---|---|---|---|---|
| Fire, April 2023 (117.5–117.8 E) | 277 km² | 356 km² | 0.86 | 244 km² | 0.80 |
| Fire, May 2023 (115.9–116.2 E) | 162 km² | 249–265 km² | 0.59 | 160 km² | 0.64 |
| Fire, April 2019 (115.6–115.9 E) | 345 km² | 227 km² | 0.79 | 359 km² | 0.77 |
| No fire, April 2023 (113.5–113.8 E) | **140 km²** | 0 | — | 3 km² | — |
| No fire, April 2019 (112.0–112.3 E) | 0 km² | 0 | — | 8 km² | — |

March pre-fire images still held snow and melt water, which made 140 km² of unburned steppe look burned; masking snow by NDSI and subtracting the dNBR of an unburned ring did not cure it, and higher thresholds lost the fires (F1 0.15–0.54 at 0.15–0.20). The autumn baseline cut the false burn to 1–2 % of the area while keeping the agreement with MODIS. MODIS is not ground truth: at 500 m it misses small fires and smooths edges, so the F1 measures agreement, not accuracy. Steppe fires came out almost entirely as low severity (dNBR medians 0.13–0.18).

### Satellite check of dust over a drawn area (added 2026-11)
A third Earth Engine App (`gee_app/dust_aoi.js`, published as `dust-aoi` under temp-support-478105) sits beside the mine tool in the dust menu. All three sources are coarse, so it works on areas up to 300,000 km² and does not map at 10–30 m.

* **TROPOMI**: Sentinel-5P absorbing aerosol index of the day (OFFL, NRTI while OFFL is not out); above 1 marks absorbing aerosol, dust or smoke.
* **CAMS**: global near-real-time dust aerosol optical depth at 550 nm, mean of 03–10 UTC from the 00 UTC run. The dust band exists only from 2021-06-24; earlier days show the total aerosol optical depth and do not count as a dust vote.
* **MODIS**: Aqua MYD09CMG brightness temperature difference BT31 − BT32 (0.05°), pixels colder than 250 K left out as cloud tops; below −0.5 K marks possible dust (Ackerman 1997).
* A source counts as seeing dust when at least 30 % of the area passes its level (CAMS: maximum ≥ 0.1). The App reports how many agree, never lets the BTD decide alone, and shows FIRMS fires because the aerosol index cannot tell smoke from dust. It also draws a time series of up to 60 days of area means of the AAI and CAMS AOD.

**Tests (2026-11-08)** over the southern Gobi (103.5–105.5 E, 42.8–44.2 N) and central Mongolia (105–107.5 E, 46.5–48.2 N):

| Day | Area | AAI > 1 | BTD < −0.5 K | CAMS AOD |
|---|---|---|---|---|
| 2023-03-21, dust storm | Gobi | 100 % (mean 3.3) | 100 % | 0.07 (dust) |
| 2023-04-10, dust storm | Gobi | 100 % (mean 3.1) | 97 % | 0.18 (dust) |
| 2023-04-11 | Gobi | 32 % | 100 % | 0.02 (dust) |
| 2021-03-14 and 15, dust storm | Gobi | 0 % | 0 % (14th: 1 % of the area clear of cold cloud) and 24 % | 0.29 and 0.09 (total AOD) |
| 2021-03-10, calm | Gobi | 0 % | **96 %** | 0.18 (total AOD) |
| 2021-07-20, calm | Gobi | 0 % | 0 % | 0.09 (dust) |

On the two 2023 storms the aerosol index and the BTD agreed fully. The great storm of 14–15 March 2021 was not seen at the early-afternoon overpass: on the 14th the whole area was under cold cloud tops, and the aerosol index stayed negative. On a calm, clear spring day the BTD was below −0.5 K over 96 % of the Gobi, because bare desert emits less in band 31 than in band 32; this is why it never decides alone. CAMS dust AOD stayed below 0.2 on storm days, far under what such storms usually reach, so its values are kept as a model hint.

### Mine location conflict
The coordinates in the user's own Earth Engine script (43.6668 N, 105.5181 E) are the **Ukhaa Khudag** mine in Tsogttsetsii soum, **Ömnögovi** province (Wikipedia gives 43.6754 N, 105.5211 E, about 0.9 km away). They are not in Dornogovi. Mines that are in Dornogovi (Bayanshand/Dovtsog Khudag, Mandakh; Eldev, Dalanjargalan) are also offered. Which Dornogovi mine is the largest was not established from the sources found; the Mineral Resources and Petroleum Authority of Mongolia is the body that holds production figures.
* Wind-direction uncertainty: hourly model winds are often 10 to 30 degrees off the true local direction, and a single steady direction gives a plume far narrower than reality. The tool therefore adds an angular spread (default 10 degrees, selectable 0/10/20) to the Briggs width in quadrature, x tan(angle). This is a worst-case style envelope, not a fitted value; 0 degrees reproduces the pure Briggs plume.
