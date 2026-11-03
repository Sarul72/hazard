# Roadmap: from weather-driven indices to satellite-derived hazard maps

Order is by value for effort.

1. **Check the first live run** (see README, "Verify first") and fix any GIBS layer ids.
2. **Fire detections.** Add a free NASA FIRMS `MAP_KEY` as the repository secret `FIRMS_MAP_KEY`. The build then writes `data/fires.json` and the map shows VIIRS/MODIS detections of the last 3 days with the count within 50 km of each aimag centre.
3. **Validation table.** Each day, store the predicted fire score and the number of FIRMS detections within 50 km. After one fire season, compare (for example a rank correlation) to see whether the score separates fire days from quiet days, then recalibrate the FWI limits for Mongolia.
4. **Flood extent from Sentinel-1** after DeVries et al. (2020): temporal z-scores of Sentinel-1 VV/VH backscatter against a flood-free baseline, with a Landsat-derived surface-water probability to remove permanent and seasonal water. Needs Google Earth Engine (a registered project and a service account stored as a repository secret) and a scheduled job that exports flood polygons or tiles to the site. Compare to the LANCE MODIS flood layer already in the map.
5. **Fuel state from Landsat/Sentinel-2.** NDVI/NBR anomalies and land cover as an additional fire-susceptibility term, in the spirit of the machine-learning susceptibility work of Duan et al. (2026) and the fuel inputs of McNorton et al. (2024). Their study areas (Pakistani mountain forest; global) differ from Mongolian steppe, so train and validate on Mongolian fire records before use.
6. **Dust from satellite.** MODIS Deep Blue/MAIAC AOD and Sentinel-5P UV aerosol index as an observed dust term; compare with CAMS. The reference project (Buyja047/earth_trending) already documents a MODIS dust decision-tree method.
7. **Finer spatial coverage.** A 1°–1.5° grid over Mongolia instead of 22 centres (needs a prebuilt data job, not browser calls).
8. **External cross-checks.** ECMWF Probability-of-Fire and GloFAS/EFFIS products where openly available.
