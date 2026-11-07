"""Lakes and rivers of Mongolia for the page, from the JRC Global Surface Water map (Pekel et al. 2016, Landsat 1984-2021).

Water here means a 30 m pixel seen as water in at least half of its clear observations, so one flooded season or a shadow does
not count. The share of such pixels is read in cells of 0.0025 degree (about 250 m) and traced to polygons. Run by hand, in two steps:

    python build_water.py fetch      needs earthengine-api, writes ../gee_cache/water.npz (run from the pipeline login)
    python build_water.py polygons   needs GDAL (the Python of ArcGIS Pro has it), writes data/water.geojson
"""
import concurrent.futures as cf
import json
import os
import sys
import time

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.environ.get("HAZARD_CACHE", os.path.join(HERE, "..", "..", "gee_cache"))
RAW = os.path.join(CACHE, "water.npz")
OUT = os.path.join(HERE, "..", "data", "water.geojson")
OUTLINE = os.path.join(HERE, "..", "data", "mongolia.geojson")

WEST, NORTH, STEP, NX, NY = 87.45, 52.35, 0.0025, 13040, 4360
OCCURRENCE = 50      # percent of clear observations
MIN_SHARE = 0.3      # a cell counts as water from this share of water pixels
MIN_KM2 = 0.3        # smaller shapes are left out
SIMPLIFY = 0.0012    # degrees, about 100 m
STRIPS = 40


def strip(ee, image, c0, width):
    req = dict(expression=image, fileFormat="NUMPY_NDARRAY",
               grid=dict(dimensions=dict(width=width, height=NY), crsCode="EPSG:4326",
                         affineTransform=dict(scaleX=STEP, shearX=0, translateX=WEST + c0 * STEP, shearY=0, scaleY=-STEP, translateY=NORTH)))
    wait = 5
    for attempt in range(6):
        try:
            a = ee.data.computePixels(req)
            return np.asarray(a["w"] if a.dtype.names else a, np.float32)
        except ee.EEException as e:
            if attempt == 5:
                raise
            print("retry", c0, str(e)[:90], flush=True)
            time.sleep(wait)
            wait *= 2


def fetch():
    import ee
    ee.Initialize(project=os.environ.get("EE_PROJECT", "sigma-513109"))
    occ = ee.Image("JRC/GSW1_4/GlobalSurfaceWater").select("occurrence")
    image = occ.gte(OCCURRENCE).unmask(0).toFloat().reduceResolution(ee.Reducer.mean(), False, 256).rename("w")
    edges = np.linspace(0, NX, STRIPS + 1).astype(int)
    parts = {}
    t = time.time()
    with cf.ThreadPoolExecutor(6) as pool:
        jobs = {pool.submit(strip, ee, image, int(a), int(b - a)): int(a) for a, b in zip(edges[:-1], edges[1:])}
        for j in cf.as_completed(jobs):
            parts[jobs[j]] = j.result()
            print(len(parts), "of", STRIPS, f"{time.time() - t:.0f}s", flush=True)
    share = np.concatenate([parts[k] for k in sorted(parts)], axis=1)
    np.savez_compressed(RAW, share=np.rint(np.nan_to_num(share) * 100).astype(np.uint8))
    print("saved", share.shape, "water cells", int((share >= MIN_SHARE).sum()), flush=True)


def polygons():
    from osgeo import gdal, ogr
    gdal.UseExceptions()
    share = np.load(RAW)["share"]
    mask = (share >= MIN_SHARE * 100).astype(np.uint8)
    drv = gdal.GetDriverByName("MEM")
    ras = drv.Create("", NX, NY, 1, gdal.GDT_Byte)
    ras.SetGeoTransform((WEST, STEP, 0, NORTH, 0, -STEP))
    ras.GetRasterBand(1).WriteArray(mask)
    vec = ogr.GetDriverByName("Memory").CreateDataSource("v")
    lyr = vec.CreateLayer("w", geom_type=ogr.wkbPolygon)
    lyr.CreateField(ogr.FieldDefn("v", ogr.OFTInteger))
    gdal.Polygonize(ras.GetRasterBand(1), ras.GetRasterBand(1), lyr, 0, [], callback=None)
    gj = json.load(open(OUTLINE, encoding="utf-8"))
    land = ogr.CreateGeometryFromJson(json.dumps(gj["features"][0]["geometry"] if "features" in gj else gj)).Buffer(0)

    def km2(g):
        c = g.Centroid()
        return g.GetArea() * 111.32 * 110.57 * np.cos(np.radians(c.GetY()))

    features = []
    for f in lyr:
        g = f.GetGeometryRef()
        if km2(g) < MIN_KM2 or not g.Intersects(land):
            continue
        area = km2(g)
        s = g.SimplifyPreserveTopology(SIMPLIFY)
        rings = json.loads(s.ExportToJson())["coordinates"]
        keep = [rings[0]] + [r for r in rings[1:] if len(r) > 6]
        rnd = [[[round(x, 3), round(y, 3)] for x, y, *_ in r] for r in keep]
        c = g.Centroid()
        features.append(dict(type="Feature", properties=dict(km2=round(float(area), 1)), geometry=dict(type="Polygon", coordinates=rnd)))
    features.sort(key=lambda f: -f["properties"]["km2"])
    out = dict(type="FeatureCollection", source="JRC Global Surface Water v1.4 (EC JRC/Google), Landsat 1984-2021, occurrence >= 50%", features=features)
    json.dump(out, open(OUT, "w", encoding="utf-8"), separators=(",", ":"))
    print(len(features), "water bodies,", os.path.getsize(OUT) // 1024, "KB, largest", [f["properties"]["km2"] for f in features[:6]])


if __name__ == "__main__":
    {"fetch": fetch, "polygons": polygons}[sys.argv[1]]()
