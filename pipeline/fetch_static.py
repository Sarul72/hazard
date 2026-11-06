"""Static layers on the national grid, plus soum boundaries for the page.

    mask      share of each cell inside Mongolia
    burn      burnt share of each cell for each year (MODIS MCD64A1, 500 m), 2001 onwards
    lc_*      land cover shares from MODIS MCD12Q1 (IGBP classes)
    prone     share of the cell within 5 m of the nearest drainage (MERIT Hydro height above nearest drainage)
"""
import json
import os
import sys
import time

import ee
import numpy as np

import common as C
import soum_names
from fetch_era5 import CACHE

ROOT = os.path.join(os.path.dirname(__file__), "..")
OUT = os.path.join(CACHE, "static.npz")


def share(mask, maxpix=2000):
    return mask.unmask(0).reduceResolution(ee.Reducer.mean(), False, maxpix).toFloat()


def stage(name, make):
    """Each stage is kept once done, so a stopped run loses only the stage it was in."""
    p = os.path.join(CACHE, f"static_{name}.npz")
    if not os.path.exists(p):
        t = time.time()
        np.savez_compressed(p, **make())
        print("stage", name, f"{time.time() - t:.0f}s", flush=True)
    return dict(np.load(p))


def fetch_grids():
    def mask():
        adm0 = ee.FeatureCollection("WM/geoLab/geoBoundaries/600/ADM0").filter(ee.Filter.eq("shapeGroup", "MNG"))
        inside = ee.Image(0).paint(adm0, 1).reproject("EPSG:4326", None, 1000)
        return dict(mask=C.pixels(share(inside.rename("m")))["m"])

    def land():
        lc = ee.ImageCollection("MODIS/061/MCD12Q1").sort("system:time_start", False).first().select("LC_Type1")
        groups = dict(forest=[1, 2, 3, 4, 5], shrub=[6, 7], savanna=[8, 9], grass=[10], crop=[12, 14], urban=[13], barren=[16], water=[17], wet=[11], snow=[15])
        return C.pixels(ee.Image.cat([share(lc.remap(v, [1] * len(v), 0).rename("lc_" + k)) for k, v in groups.items()]))

    def terrain():
        # 90 m input: about 120 x 85 pixels per cell, so the limit is raised and the request goes out in strips.
        h = ee.Image("MERIT/Hydro/v1_0_1")
        return C.pixels_strips(ee.Image.cat(share(h.select("hnd").lte(5).rename("prone"), 16000)), 16)

    def burnt():
        col = ee.ImageCollection("MODIS/061/MCD64A1").select("BurnDate")
        proj = col.first().projection()  # a composite forgets its projection, and reduceResolution needs it
        years, frames = list(range(2001, 2026)), []
        for y in years:
            t = time.time()
            img = share(col.filterDate(f"{y}-01-01", f"{y + 1}-01-01").max().gt(0).setDefaultProjection(proj).rename("b"))
            frames.append(C.pixels(img)["b"])
            print("burn", y, f"{time.time() - t:.0f}s", float(np.nanmean(frames[-1])), flush=True)
        return dict(burn=np.stack(frames), burn_years=np.array(years))

    out = {}
    for name, make in (("mask", mask), ("land", land), ("burnt", burnt), ("terrain", terrain)):
        out.update(stage(name, make))
    np.savez_compressed(OUT, **out)
    keep = ["mask", "prone", "lc_barren"] + [k for k in out if k.startswith("lc_")]
    np.savez_compressed(os.path.join(os.path.dirname(os.path.abspath(__file__)), "static_small.npz"), **{k: out[k].astype(np.float32) for k in set(keep)})
    print({k: (v.shape, round(float(np.nanmean(v)), 4)) for k, v in out.items() if k != "burn_years"}, flush=True)


def fetch_gfd():
    """Recorded floods of the Global Flood Database that touch Mongolia: dates, cause, flooded share of each cell."""
    col = ee.ImageCollection("GLOBAL_FLOOD_DB/MODIS_EVENTS/V1").filter(ee.Filter.stringContains("cc", "MNG"))
    ids = col.aggregate_array("system:index").getInfo()
    start, end, cause, share = [], [], [], []
    for i in ids:
        img = ee.Image(col.filter(ee.Filter.eq("system:index", i)).first())
        p = img.toDictionary(["dfo_main_cause", "dfo_began", "dfo_ended", "began", "ended", "system:time_start", "system:time_end"]).getInfo()
        a = ee.Date(img.get("system:time_start")).format("YYYY-MM-dd").getInfo()
        b = ee.Date(img.get("system:time_end")).format("YYYY-MM-dd").getInfo()
        g = C.pixels_strips(img.select("flooded").unmask(0).toFloat().reduceResolution(ee.Reducer.mean(), False, 2000).rename("f"), 4)["f"]
        start.append(a); end.append(b); cause.append(p.get("dfo_main_cause", "")); share.append(g)
        print(a, b, p.get("dfo_main_cause"), "cells flooded", int((g > 0).sum()), flush=True)
    np.savez_compressed(os.path.join(CACHE, "gfd.npz"), start=np.array(start), end=np.array(end), cause=np.array(cause), share=np.stack(share))


def fetch_soums():
    """339 soums. Simplified to about 500 m, which is far below the 0.1 degree grid they are read on."""
    adm2 = ee.FeatureCollection("WM/geoLab/geoBoundaries/600/ADM2").filter(ee.Filter.eq("shapeGroup", "MNG"))
    adm1 = ee.FeatureCollection("WM/geoLab/geoBoundaries/600/ADM1").filter(ee.Filter.eq("shapeGroup", "MNG"))

    def tag(f):
        g = f.geometry().simplify(500)
        parent = adm1.filterBounds(f.geometry().centroid(100)).first()
        return ee.Feature(g, dict(name=f.get("shapeName"), aimag=ee.Algorithms.If(parent, ee.Feature(parent).get("shapeName"), "")))

    fc = adm2.map(tag).getInfo()
    gj = dict(type="FeatureCollection", features=[], source="geoBoundaries gbOpen MNG ADM2 (NSO Mongolia, OCHA ROAP), CC BY 3.0 IGO, simplified")
    for f in fc["features"]:
        rnd = lambda c: [round(c[0], 3), round(c[1], 3)] if isinstance(c[0], (int, float)) else [rnd(x) for x in c]
        g = f["geometry"]
        if g["type"] == "GeometryCollection":
            polys = [p for p in g["geometries"] if p["type"] in ("Polygon", "MultiPolygon")]
            g = polys[0] if len(polys) == 1 else dict(type="MultiPolygon", coordinates=[c for p in polys for c in (p["coordinates"] if p["type"] == "MultiPolygon" else [p["coordinates"]])])
        gj["features"].append(dict(type="Feature", properties=f["properties"], geometry=dict(type=g["type"], coordinates=rnd(g["coordinates"]))))
    path = os.path.join(ROOT, "data", "soums.geojson")
    json.dump(gj, open(path, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    soum_names.main()
    print("soums", len(gj["features"]), os.path.getsize(path) // 1024, "KB", gj["features"][0]["properties"])


if __name__ == "__main__":
    C.init()
    os.makedirs(CACHE, exist_ok=True)
    if "soums" in sys.argv:
        fetch_soums()
    if "grids" in sys.argv:
        fetch_grids()
    if "gfd" in sys.argv:
        fetch_gfd()
