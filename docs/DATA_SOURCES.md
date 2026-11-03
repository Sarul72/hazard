# Data sources, credit and verification status

"Checked" means read in the issuer's or a documentation page during development. **Nothing here was tested against the live services**: the build environment could not reach them. See "Verify first".

| Source | Used for | Terms / credit | Status |
|---|---|---|---|
| Open-Meteo forecast API (`api.open-meteo.com/v1/forecast`) | hourly temperature, humidity, wind, precipitation, rain, snow depth; up to 92 past days | Open-Meteo.com, CC BY 4.0; free for non-commercial use with request limits (check open-meteo.com/en/pricing, not reachable here) | Endpoint and `past_days` limit from documentation snippets; response shape from knowledge, tested against mocks only |
| Open-Meteo air quality API | `dust`, `pm10`, `aerosol_optical_depth` | Must credit CAMS and Open-Meteo. Global domain: CAMS global composition forecast, 0.4° (~45 km), 5-day forecast | Variables confirmed in documentation; mock-tested |
| Open-Meteo flood API | `river_discharge`, GloFAS v4, 0.05°, "largest river in a 5 km area", `past_days` 0–92, `forecast_days` up to 210 | GloFAS / Copernicus Emergency Management Service; credit Open-Meteo | Confirmed in documentation; mock-tested |
| NASA GIBS WMTS (EPSG:3857, "best") | satellite imagery and overlays | NASA ESDIS asks for acknowledgement: "We acknowledge the use of imagery provided by services from NASA's Global Imagery Browse Services (GIBS), part of NASA's Earth Science Data and Information System (ESDIS)." | See layer table |
| NASA FIRMS area API | fire detections (optional, needs free MAP_KEY) | NASA open data; cite NASA FIRMS | URL pattern from documentation knowledge; parser unit-tested on sample CSV |
| Natural Earth 1:50m via world-atlas 2.0.2 | Mongolia outline (`data/mongolia.geojson`) | Public domain data, ISC package licence | Copied from a verified file |
| Leaflet 1.9.4 | map | BSD-2 (`vendor/leaflet/LICENSE`) | Bundled |

## GIBS layers

| Key | Layer id | Status |
|---|---|---|
| truecolor_terra / aqua / viirs | `MODIS_Terra_CorrectedReflectance_TrueColor`, `MODIS_Aqua_…`, `VIIRS_SNPP_…` | Terra id confirmed in GIBS documentation; the other two follow the naming rule |
| fire_viirs | `VIIRS_SNPP_Thermal_Anomalies_375m_All` | Confirmed in GIBS documentation |
| fire_modis | `MODIS_Terra_Thermal_Anomalies_All` | Naming rule; **unconfirmed** |
| aod_modis, aod_terra | `MODIS_Combined_Value_Added_AOD`, `MODIS_Terra_Aerosol` | **Unconfirmed**; GIBS documentation shows an aerosol optical depth layer family |
| precip_imerg | `IMERG_Precipitation_Rate` | **Unconfirmed** |
| flood_modis | `MODIS_Combined_Flood_2-Day_Composite` | The LANCE MODIS flood product (MCDWD) is in GIBS per NASA Earthdata; the exact layer id is **unconfirmed** |
| snow_modis | `MODIS_Terra_NDSI_Snow_Cover` | Used by the reference Trend Detective project; exact id **unconfirmed** here |
| hls_s30 / hls_l30 | `HLS_S30_Nadir_BAR_Daily`, `HLS_L30_Nadir_BAR_Daily` | HLS is in GIBS (used by the reference project); ids **unconfirmed** |

Because of the unconfirmed ids, the app **probes** each layer when it is switched on (`js/gibs.js`): it requests one tile for the selected date and the two days before, trying each candidate tile matrix set. A layer that never answers is shown as "unavailable" instead of drawing a blank map. To fix an id, open https://worldview.earthdata.nasa.gov, find the layer, and copy its identifier into `js/config.js`.

## Conflicts between sources

- **GIBS default date.** One GIBS documentation page says a request without a time returns the layer's `<Default>` date; another says it returns the current UTC date, with many empty tiles. **Governs: neither.** The app always sends an explicit date.
- **Open-Meteo air quality resolution.** Documentation lists an 11 km European model and a 45 km global model, not coupled. Mongolia is outside the European domain, so the 0.4° global model applies.
- **EFFIS class limits.** Documented identically by EFFIS, Copernicus and ECMWF pages; a regional study found them poorly discriminating in Greece. Used as-is, flagged for calibration.

## Not used

- Mongolian national standard for PM10 and national hazard thresholds: not checked, so WHO 2021 and US EPA references are used.
- NAMEM station data: no open licence found by the reference project.
