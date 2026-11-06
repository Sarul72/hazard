# Limitations

This is a monitoring and education aid. **It is not an official warning system.** Follow NAMEM and the National Emergency Management Agency for decisions.

1. **Indices, not probabilities.** Scores rank conditions; they are not calibrated against observed floods, fires or dust events in Mongolia.
2. **Heuristic thresholds.** Wind, rain, CAMS and flood breakpoints are documented but uncalibrated. A ±20 % change moves up to 45 % of synthetic cases to another class (`METHODS.md`).
3. **Coarse points.** 22 aimag centres, model cells of 5–45 km. Local cloudbursts, valley floods and point dust events are missed; the south of a large aimag can differ from its centre.
4. **Forecast, not observation.** Scores come from model forecasts. Satellite layers are observations with a delay of about one day (VIIRS/MODIS true colour) and are not used inside the score.
5. **No Sentinel/Landsat analytics yet.** HLS tiles show Sentinel-2/Landsat imagery; flood extent from Sentinel-1 SAR, burn-scar mapping and NDVI fuel state are not computed.
6. **Fire index limits.** FWI ignores fuel and ignition; a 92-day spin-up may under-estimate drought codes.
7. **Dust limits.** No soil or vegetation data; CAMS dust is a model.
8. **Flood limits.** GloFAS snaps to the largest river within about 5 km and may not match the local river; ice-jam and snowmelt-driven floods are only partly captured through GloFAS discharge.
9. **Time zone.** All days use Ulaanbaatar time (UTC+8). Western aimags that legally use UTC+7 differ by one hour at the noon observation, which has a negligible effect on FWI.
10. **Untested against live services.** See `DATA_SOURCES.md`.

## Added with the polygon and mine tools
* Update 2026-11: risk zones now come from Earth Engine, computed on a schedule into files (see `GEE_DATA_FORMAT.md`). Points 1–5 above described the earlier version with 22 aimag centres; current limits are in the methods window of each hazard on the page. The mine plume wind still comes from Open-Meteo.
* Households come from OpenStreetMap only. They are a lower bound in the remote Gobi. Detecting gers and seasonal camps from Sentinel-2 or high-resolution imagery would need Earth Engine or a machine-learning building dataset and is not done.
* The plume model is a screening tool: no terrain, no stability changes during the day, no dust emission model for the real pits and roads, no validation against measured PM10. Do not use it for legal or health decisions.
