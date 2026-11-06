"""NOAA GFS analysis fields, two jobs:
  1. the bridge: ERA5-Land runs about six days behind, GFS only hours, so GFS carries the weather up to today;
  2. the second opinion: GFS is produced independently of ERA5-Land, so running the same model on it measures how much
     the score depends on the input data. That difference is the input uncertainty shown on the page.

Per day: T, RH, wind at 06 UTC (nearest analysis to 05 UTC) and the highest wind speed of the four analyses.

    python fetch_gfs.py 2025-03-01 2025-10-31
"""
import concurrent.futures as cf
import datetime as dt
import os
import sys
import time

import ee
import numpy as np

import common as C
from fetch_era5 import CACHE, chunks

BANDS = ["t", "rh", "u", "v", "wmax"]
OUT = os.path.join(CACHE, "gfs")
G = "NOAA/GFS0P25/"


def day_image(d):
    s = d.strftime("%Y%m%d")
    an = lambda h: ee.Image(f"{G}{s}{h:02d}F000").resample("bilinear")
    wind = lambda i: i.select("u_component_of_wind_10m_above_ground").hypot(i.select("v_component_of_wind_10m_above_ground"))
    noon = an(6)
    wmax = ee.ImageCollection([wind(an(h)).rename("w") for h in (0, 6, 12, 18)]).max()
    img = ee.Image.cat(noon.select(["temperature_2m_above_ground", "relative_humidity_2m_above_ground",
                                    "u_component_of_wind_10m_above_ground", "v_component_of_wind_10m_above_ground"]), wmax)
    return img.rename([f"d{s}_{b}" for b in BANDS]).toFloat()


def fetch(job):
    tag, lo, hi = job
    path = os.path.join(OUT, tag + ".npy")
    days = [lo + dt.timedelta(days=k) for k in range((hi - lo).days + 1)]
    if os.path.exists(path) and np.load(path, mmap_mode="r").shape[1] == len(days):
        return tag, 0.0
    t = time.time()
    while True:
        try:
            a = C.pixels(ee.Image.cat([day_image(d) for d in days]))
            break
        except ee.EEException as e:
            # The newest analyses arrive a few hours late: keep the days that exist instead of losing the whole chunk.
            if "not found" not in str(e) or len(days) == 1:
                raise
            days = days[:-1]
    arr = np.stack([np.stack([a[f"d{d:%Y%m%d}_{b}"] for b in BANDS]) for d in days], axis=1).astype(np.float16)
    np.save(path + ".tmp.npy", arr)
    os.replace(path + ".tmp.npy", path)
    return tag, time.time() - t


if __name__ == "__main__":
    C.init()
    os.makedirs(OUT, exist_ok=True)
    start, end = dt.date.fromisoformat(sys.argv[1]), dt.date.fromisoformat(sys.argv[2])
    with cf.ThreadPoolExecutor(2) as ex:
        for f in cf.as_completed([ex.submit(fetch, j) for j in chunks(start, end)]):
            try:
                tag, sec = f.result()
                print(tag, f"{sec:.0f}s", flush=True)
            except Exception as e:
                print("FAILED", str(e)[:200], flush=True)
