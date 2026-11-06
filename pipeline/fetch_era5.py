"""Download the daily ERA5-Land fields used by all three hazards to a local cache, on the national 0.1 degree grid.

Per day, at 05 UTC (13:00 Ulaanbaatar, about solar noon at 105 E):
    t, td   2 m temperature and dew point, deg C         u, v   10 m wind, m/s
    sd      snow depth, cm                               sm     top soil water, m3/m3
    tp5     precipitation since 00 UTC of the same day, mm
At 00 UTC, when ERA5-Land holds the total of the previous day:
    tp0, melt0   previous day's precipitation and snowmelt, mm
Over the day, every 3 hours like SYNOP observations:
    wmax    highest 10 m wind speed, m/s

Images are addressed by id rather than filtered from the collection, which keeps requests cheap.
Finished chunks are kept, so an interrupted run continues where it stopped.

    python fetch_era5.py 2001-01-01 2026-10-30
"""
import calendar
import concurrent.futures as cf
import datetime as dt
import os
import sys
import time

import ee
import numpy as np

import common as C

H = "ECMWF/ERA5_LAND/HOURLY/"
BANDS = ["t", "td", "u", "v", "sd", "sm", "tp5", "tp0", "melt0", "wmax"]
CACHE = os.environ.get("HAZARD_CACHE", os.path.join(os.path.dirname(__file__), "..", "..", "gee_cache"))
OUT = os.path.join(CACHE, "era5")


def day_image(d):
    s = d.strftime("%Y%m%d")
    noon, midnight = ee.Image(f"{H}{s}T05"), ee.Image(f"{H}{s}T00")
    speed = ee.ImageCollection([ee.Image(f"{H}{s}T{h:02d}") for h in range(0, 24, 3)]).map(
        lambda i: i.select("u_component_of_wind_10m").hypot(i.select("v_component_of_wind_10m")).rename("w")).max()
    img = ee.Image.cat(
        noon.select(["temperature_2m", "dewpoint_temperature_2m", "u_component_of_wind_10m", "v_component_of_wind_10m",
                     "snow_depth", "volumetric_soil_water_layer_1", "total_precipitation"]),
        midnight.select(["total_precipitation", "snowmelt"]), speed)
    return img.rename([f"d{s}_{b}" for b in BANDS]).toFloat()


def chunks(start, end):
    y, m = start.year, start.month
    while (y, m) <= (end.year, end.month):
        last = calendar.monthrange(y, m)[1]
        for a, b, tag in ((1, 16, "a"), (17, last, "b")):
            lo, hi = max(dt.date(y, m, a), start), min(dt.date(y, m, b), end)
            if lo <= hi:
                yield f"{y}{m:02d}{tag}", lo, hi
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)


def units(a, s):
    g = lambda b: a[f"d{s}_{b}"]
    return np.stack([g("t") - 273.15, g("td") - 273.15, g("u"), g("v"), g("sd") * 100.0, g("sm"), g("tp5") * 1000.0, g("tp0") * 1000.0, g("melt0") * 1000.0, g("wmax")])


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
            # The newest days are published hour by hour: keep the days that are complete, not nothing.
            if "not found" not in str(e):
                raise
            days = days[:-1]
            if not days:
                return tag, 0.0
    arr = np.stack([units(a, d.strftime("%Y%m%d")) for d in days], axis=1).astype(np.float16)
    np.save(path + ".tmp.npy", arr)
    os.replace(path + ".tmp.npy", path)
    return tag, time.time() - t


if __name__ == "__main__":
    C.init()
    os.makedirs(OUT, exist_ok=True)
    start, end = dt.date.fromisoformat(sys.argv[1]), dt.date.fromisoformat(sys.argv[2])
    jobs = sorted(chunks(start, end), key=lambda j: j[0], reverse=True)  # newest first: the site can start from them
    t0, done, failed = time.time(), 0, 0
    with cf.ThreadPoolExecutor(int(os.environ.get("THREADS", 6))) as ex:
        for f in cf.as_completed([ex.submit(fetch, j) for j in jobs]):
            try:
                tag, sec = f.result()
                done += 1
                if done % 10 == 0 or done == len(jobs):
                    print(f"{done}/{len(jobs)} chunks, last {tag} {sec:.0f}s, {(time.time() - t0) / 60:.1f} min", flush=True)
            except Exception as e:
                failed += 1
                print("FAILED", str(e)[:200], flush=True)
    print("done, failed", failed, flush=True)
    sys.exit(1 if failed else 0)
