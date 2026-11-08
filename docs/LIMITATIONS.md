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
* Households in the soum and plume tools come from OpenStreetMap only. They are a lower bound in the remote Gobi. Detecting gers and seasonal camps from Sentinel-2 or high-resolution imagery would need Earth Engine or a machine-learning building dataset and is not done.
* The plume model is a screening tool: no terrain, no stability changes during the day, no dust emission model for the real pits and roads, no validation against measured PM10. Do not use it for legal or health decisions.

## Added with camps, dust types and downloads (2026-11)
* **Mine dust.** Only the wind-driven handling term of the emission is modelled; roads, blasting and pile erosion are not. Stability and rain are taken at the source for the whole area, and terrain is ignored. The range shown changes the wind by 20 degrees and 20 percent; it is a sensitivity check, not a statistical interval.
* **Lakes and rivers.** The layer is the long-term water of 1984 to 2021, not the chosen day. Rivers narrower than about 100 m are broken or missing, and reed beds are not water.
* **Dust types.** Chemistry acts only through particle density. All types share one size distribution because no measured distribution of Mongolian mine dust was found. AP-42 sizes are aerodynamic and are read here as physical sizes, which is an assumption. Toxicity is not modelled. The index is relative, not a concentration, and MNS 4585:2016 and lead limits are not checked against it.
* **Camps on the map.** Camps appear only in the mine dust tool. From far away only part of the dots is drawn, so that they do not merge. All counts use every camp.
* **Camps are not hidden.** A static site serves its files to anyone, so `data/camps.bin.gz` can be downloaded whole. Showing camps only inside a selection is a display rule, not protection. Names, phones, contract and person numbers are removed and positions are rounded to about 1 km, but most rounded locations still hold one household (48,783 of 63,494 herder point locations; 88,587 of 100,568 parcel locations).
* **Camp registers.** The herder points (mostly 2022) and the land cadastre may describe the same camps and are never added together. 36,752 parcels have the status "Төсөл" and are counted as camps. The meaning of `pasture_ty` is not known. The licence of the source data has not been confirmed.
* **Downloads.** Map images draw the base imagery, risk colours, soums, plume and camps. Other satellite overlays are not drawn. JPG, PNG and the map GeoTIFF are placed in Web Mercator and keep their labels, so that the error stays on them. The JPG+JGW layer has no labels, for laying over other data; its error is in the README and the `.aux.xml`. A map from this site is not an official document.
* **Files inside a ZIP.** ArcGIS Pro and ENVI do not open files from inside a ZIP, and a `.shp` needs its `.shx`, `.dbf` and `.prj` next to it. Unzip first; the README in every download says so.
* **ENVI.** GeoTIFF and Shapefile are the formats for ENVI. GeoJSON and images with world files are not offered for it. Only the IDL readers were tested, not ENVI itself.
* **Detailed flood mapping.** Radar change marks land that turns dark, not only water: in Mongolian grassland, haymaking and drying in late summer produced false floods over 100 km² in a test, and cities give scattered false points. Only radar flood confirmed by Sentinel-2 within ±3 days is shown as confirmed, and clouds often prevent the check. Water under grass or trees is missed by Sentinel-2 and partly by radar. Sentinel-1 left most of Mongolia without scenes in 2022–2024. The depth uses a surface model with trees and buildings, so it can be too shallow there, and it has not been compared with any measurement.
* **Error as a percentage.** The score is an index, so the percentage is of the 100-point scale, and also of the mean score where that mean is not close to zero. Neither is a probability.
* **The opening image is daily, not live.** It is the newest MODIS Terra true-colour day, from one pass in the morning, not the sky at this moment.
