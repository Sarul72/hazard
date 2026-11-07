# Data sources, credit and verification status

"Checked" means read in the issuer's or a documentation page during development. The Open-Meteo data build was run against the live service by the GitHub Actions workflow (22 of 22 points scored); the page and GIBS layers were checked in a real browser.

| Source | Used for | Terms / credit | Status |
|---|---|---|---|
| Open-Meteo forecast API (`api.open-meteo.com/v1/forecast`) | hourly temperature, humidity, wind, precipitation, rain, snow depth; up to 92 past days | Open-Meteo.com, CC BY 4.0; free for non-commercial use with request limits (check open-meteo.com/en/pricing, not reachable here) | Live run succeeded (22/22 points) |
| Open-Meteo air quality API | `dust`, `pm10`, `aerosol_optical_depth` | Must credit CAMS and Open-Meteo. Global domain: CAMS global composition forecast, 0.4° (~45 km), 5-day forecast | Live run succeeded |
| Open-Meteo flood API | `river_discharge`, GloFAS v4, 0.05°, "largest river in a 5 km area", `past_days` 0–92, `forecast_days` up to 210 | GloFAS / Copernicus Emergency Management Service; credit Open-Meteo | Live run succeeded (some points may lack a river, see flags) |
| NASA GIBS WMTS (EPSG:3857, "best") | satellite imagery and overlays | NASA ESDIS asks for acknowledgement: "We acknowledge the use of imagery provided by services from NASA's Global Imagery Browse Services (GIBS), part of NASA's Earth Science Data and Information System (ESDIS)." | See layer table |
| NASA FIRMS area API | fire detections (optional, needs free MAP_KEY) | NASA open data; cite NASA FIRMS | URL pattern from documentation knowledge; parser unit-tested on sample CSV |
| Natural Earth 1:50m via world-atlas 2.0.2 | Mongolia outline (`data/mongolia.geojson`) | Public domain data, ISC package licence | Copied from a verified file |
| Leaflet 1.9.4 | map | BSD-2 (`vendor/leaflet/LICENSE`) | Bundled |

## GIBS layers

Layer ids, tile matrix sets and formats below were **read from GIBS's own WMTS GetCapabilities** (EPSG:3857, "best") on 2026-11-03 and the live site was checked in a browser. An earlier version of this project used guessed ids; several were wrong (for example `MODIS_Terra_Thermal_Anomalies_All` is not a PNG layer, `HLS_*_Nadir_BAR_Daily` and `MODIS_Combined_Flood_2-Day_Composite` do not exist).

| Key | Layer id | Matrix set | Notes |
|---|---|---|---|
| truecolor_terra / aqua / viirs | `MODIS_Terra_…`, `MODIS_Aqua_…`, `VIIRS_NOAA21_…` from 2024-02-29, `VIIRS_NOAA20_…` from 2022-01-14, `VIIRS_SNPP_CorrectedReflectance_TrueColor` from 2015-11-24 (Suomi NPP stops at 2026-11-02 in GIBS) | Level9, JPEG | base images |
| fire_viirs | `VIIRS_NOAA21_…` from 2024-01-17, `VIIRS_NOAA20_…` from 2020-01-01, `VIIRS_SNPP_Thermal_Anomalies_375m_All` from 2012-01-20 | **vector tiles** | drawn through GIBS WMS (`wms.cgi`), which renders vector layers as images |
| fire_modis | `MODIS_Combined_Thermal_Anomalies_All` | vector tiles | same, via WMS |
| aod_deepblue | `MODIS_Terra_AOD_Deep_Blue_Combined` | Level6 | Deep Blue AOD works over bright arid land such as the Gobi |
| aod_modis | `MODIS_Combined_Value_Added_AOD` | Level6 | MAIAC AOD |
| dust_airs | `AIRS_L2_Dust_Score_Day` | Level6 | AIRS dust score |
| precip_imerg | `IMERG_Precipitation_Rate` | Level6 | |
| flood_modis / flood_viirs | `MODIS_Combined_Flood_2-Day`, `VIIRS_Combined_Flood_2-Day` | Level9 | NASA LANCE NRT flood products; layer is mostly opaque, shown at 55 % |
| water_dswx | `OPERA_L3_Dynamic_Surface_Water_Extent-HLS` | Level12 | surface water from Harmonized Landsat Sentinel-2 |
| snow_modis | `MODIS_Terra_NDSI_Snow_Cover` | Level8 | |
| hls_s30 / hls_l30 | `HLS_S30_…`, `HLS_L30_Nadir_BRDF_Adjusted_Reflectance` | Level12 | 30 m Sentinel-2 / Landsat |

Layers publish with different delays; the page uses the selected UTC date (default: yesterday). Sparse layers answer 404 for tiles without data, which shows as empty tiles, not an error.

## Conflicts between sources

- **GIBS default date.** One GIBS documentation page says a request without a time returns the layer's `<Default>` date; another says it returns the current UTC date, with many empty tiles. **Governs: neither.** The app always sends an explicit date.
- **Open-Meteo air quality resolution.** Documentation lists an 11 km European model and a 45 km global model, not coupled. Mongolia is outside the European domain, so the 0.4° global model applies.
- **EFFIS class limits.** Documented identically by EFFIS, Copernicus and ECMWF pages; a regional study found them poorly discriminating in Greece. Used as-is, flagged for calibration.

## Not used

- Mongolian national standard for PM10 and national hazard thresholds: not checked, so WHO 2021 and US EPA references are used.
- NAMEM station data: no open licence found by the reference project.
