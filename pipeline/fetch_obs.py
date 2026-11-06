"""Download satellite observations to the local cache, on the national 0.1 degree grid.

    fire   MODIS active fire (NASA FIRMS, Terra + Aqua, 1 km): share of the cell with a detection, confidence >= 30
    aai    Sentinel-5P TROPOMI UV absorbing aerosol index (offline, then near real time after it ends)
    rain   GPM IMERG V07 daily precipitation, mm (UTC day)
    veg    MODIS MCD43A4 monthly NDVI (median) and Soil Tillage Index b6/b7 (maximum composite, as Wu et al. 2023)

    python fetch_obs.py fire 2001-01-01 2026-11-04
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


def one_day(col, d, make):
    """A day's image, or an empty one when the day has no data: a gap must stay a gap."""
    c = col.filterDate(d.isoformat(), (d + dt.timedelta(days=1)).isoformat())
    return ee.Image(ee.Algorithms.If(c.size().gt(0), make(c), ee.Image.constant(0).toFloat().updateMask(0))).rename(f"d{d:%Y%m%d}")


def fire(d):
    # first(), not mosaic(): FIRMS has one image a day, and a mosaic would lose the projection reduceResolution needs.
    f = lambda c: ee.Image(c.first()).select("confidence").gte(30).unmask(0).reduceResolution(ee.Reducer.mean(), False, 300).toFloat()
    return one_day(ee.ImageCollection("FIRMS"), d, f)


def aai(d):
    src = "COPERNICUS/S5P/OFFL/L3_AER_AI" if d <= dt.date(2026, 11, 1) else "COPERNICUS/S5P/NRTI/L3_AER_AI"
    return one_day(ee.ImageCollection(src).select("absorbing_aerosol_index"), d, lambda c: c.mean().toFloat())


def rain(d):
    return one_day(ee.ImageCollection("NASA/GPM_L3/IMERG_V07").select("precipitation"), d, lambda c: c.sum().multiply(0.5).toFloat())


DAILY = dict(fire=fire, aai=aai, rain=rain)


def fetch(kind, job):
    tag, lo, hi = job
    path = os.path.join(CACHE, kind, tag + ".npy")
    days = [lo + dt.timedelta(days=k) for k in range((hi - lo).days + 1)]
    if os.path.exists(path) and np.load(path, mmap_mode="r").shape[0] == len(days):
        return tag, 0.0
    t = time.time()
    a = C.pixels(ee.Image.cat([DAILY[kind](d) for d in days]))
    arr = np.stack([a[f"d{d:%Y%m%d}"] for d in days]).astype(np.float16)
    np.save(path + ".tmp.npy", arr)
    os.replace(path + ".tmp.npy", path)
    return tag, time.time() - t


def veg_month(y, m):
    path = os.path.join(CACHE, "veg", f"{y}{m:02d}.npy")
    if os.path.exists(path):
        return f"{y}{m:02d}", 0.0
    t = time.time()
    lo = dt.date(y, m, 1)
    hi = dt.date(y + (m == 12), m % 12 + 1, 1)
    c = ee.ImageCollection("MODIS/061/MCD43A4").filterDate(lo.isoformat(), hi.isoformat())
    b = lambda i, n: i.select(f"Nadir_Reflectance_Band{n}").toFloat()
    ndvi = c.map(lambda i: b(i, 2).subtract(b(i, 1)).divide(b(i, 2).add(b(i, 1))).rename("ndvi")).median()
    sti = c.map(lambda i: b(i, 6).divide(b(i, 7)).rename("sti")).max()
    try:
        a = C.pixels(ee.Image.cat(ndvi, sti).toFloat())
    except ee.EEException as e:
        if "no bands" in str(e):  # a month with no MCD43A4 yet is expected, not an error
            return f"{y}{m:02d}", 0.0
        raise
    arr = np.stack([a["ndvi"], a["sti"]]).astype(np.float16)
    np.save(path + ".tmp.npy", arr)
    os.replace(path + ".tmp.npy", path)
    return f"{y}{m:02d}", time.time() - t


if __name__ == "__main__":
    C.init()
    kind = sys.argv[1]
    start, end = dt.date.fromisoformat(sys.argv[2]), dt.date.fromisoformat(sys.argv[3])
    os.makedirs(os.path.join(CACHE, kind), exist_ok=True)
    threads = int(os.environ.get("THREADS", 3))
    t0, done, failed = time.time(), 0, 0
    with cf.ThreadPoolExecutor(threads) as ex:
        if kind == "veg":
            months = [(y, m) for y in range(start.year, end.year + 1) for m in range(1, 13) if start <= dt.date(y, m, 28) and dt.date(y, m, 1) <= end]
            futures = [ex.submit(veg_month, y, m) for y, m in reversed(months)]
        else:
            futures = [ex.submit(fetch, kind, j) for j in sorted(chunks(start, end), key=lambda j: j[0], reverse=True)]
        for f in cf.as_completed(futures):
            try:
                tag, sec = f.result()
                done += 1
                if done % 20 == 0 or done == len(futures):
                    print(f"{kind} {done}/{len(futures)}, last {tag} {sec:.0f}s, {(time.time() - t0) / 60:.1f} min", flush=True)
            except Exception as e:
                failed += 1
                print("FAILED", str(e)[:200], flush=True)
    print(kind, "done, failed", failed, flush=True)
    sys.exit(1 if failed else 0)
