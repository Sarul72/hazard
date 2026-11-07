"""Aimag boundaries for the page, made by merging the soums of data/soums.geojson, so that both layers fit each other exactly.

The soums were simplified one by one, so neighbours leave hairline gaps. Growing every soum a little before the merge and
shrinking the result again closes them. Needs GDAL (the Python of ArcGIS Pro has it). Run by hand, not by the daily job.

    python build_aimags.py
"""
import collections
import json
import os

from osgeo import ogr

HERE = os.path.dirname(os.path.abspath(__file__))
SOUMS = os.path.join(HERE, "..", "data", "soums.geojson")
OUT = os.path.join(HERE, "..", "data", "aimags.geojson")
GROW = 0.01  # degrees, about 1 km: wider than any gap between simplified soums


def main():
    gj = json.load(open(SOUMS, encoding="utf-8"))
    groups = collections.defaultdict(list)
    for f in gj["features"]:
        p = f["properties"]
        groups[(p["aimag"], p["aimag_mn"])].append(ogr.CreateGeometryFromJson(json.dumps(f["geometry"])).Buffer(GROW))
    features = []
    for (name, name_mn), parts in sorted(groups.items()):
        multi = ogr.Geometry(ogr.wkbMultiPolygon)
        for g in parts:
            for k in range(g.GetGeometryCount()) if g.GetGeometryType() == ogr.wkbMultiPolygon else [None]:
                multi.AddGeometry(g if k is None else g.GetGeometryRef(k))
        merged = multi.UnionCascaded().Buffer(-GROW).SimplifyPreserveTopology(0.004)
        geom = json.loads(merged.ExportToJson())
        polys = [geom["coordinates"]] if geom["type"] == "Polygon" else geom["coordinates"]
        polys = [[[[round(x, 3), round(y, 3)] for x, y, *_ in ring] for ring in p[:1]] for p in polys]  # outer rings: no holes inside an aimag
        polys = [p for p in polys if len(p[0]) > 3]
        features.append({"type": "Feature", "properties": {"aimag": name, "aimag_mn": name_mn}, "geometry": {"type": "MultiPolygon", "coordinates": polys}})
    json.dump({"type": "FeatureCollection", "features": features}, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(len(features), "aimags,", os.path.getsize(OUT) // 1024, "KB")


if __name__ == "__main__":
    main()
