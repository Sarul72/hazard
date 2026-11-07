"""Border lines for the page: every stretch of aimag and soum border once.

A dashed line needs this. Neighbouring polygons each hold the shared border, and two dashed copies out of step look like a solid,
uneven line. Here each ring is cut where a higher level or an earlier neighbour already runs, so nothing is drawn twice.
Needs GDAL (the Python of ArcGIS Pro has it). Run by hand, after build_aimags.py.

    python build_borders.py
"""
import json
import os

from osgeo import ogr

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "data")
NEAR_COUNTRY = 0.03  # degrees: the outline and the soums come from different sources and differ by this much
NEAR_LINE = 0.012    # degrees: neighbours were simplified one by one and differ by this much
MIN_LENGTH = 0.02    # degrees: shorter scraps left by the cutting are dropped


def rings(geometry):
    g = ogr.CreateGeometryFromJson(json.dumps(geometry))
    polys = [g] if g.GetGeometryType() == ogr.wkbPolygon else [g.GetGeometryRef(i) for i in range(g.GetGeometryCount())]
    for p in polys:
        for k in range(p.GetGeometryCount()):
            r = p.GetGeometryRef(k)
            line = ogr.Geometry(ogr.wkbLineString)
            for i in range(r.GetPointCount()):
                line.AddPoint_2D(r.GetX(i), r.GetY(i))
            yield line


def pieces(g):
    if g is None or g.IsEmpty():
        return
    if g.GetGeometryType() == ogr.wkbLineString:
        yield g
    else:
        for i in range(g.GetGeometryCount()):
            yield from pieces(g.GetGeometryRef(i))


def thin(features, block, near):
    """Lines of `features`, without what lies along `block` or along a ring already taken."""
    kept = []
    taken = block
    for f in features:
        for line in rings(f["geometry"]):
            for part in pieces(line.Difference(taken)):
                if part.Length() >= MIN_LENGTH:
                    kept.append(part.Clone())
                    taken = taken.Union(part.Buffer(near))
    return kept, taken


def write(name, lines):
    coords = [[[round(x, 3), round(y, 3)] for x, y, *_ in json.loads(l.ExportToJson())["coordinates"]] for l in lines]
    gj = dict(type="Feature", properties={}, geometry=dict(type="MultiLineString", coordinates=coords))
    path = os.path.join(DATA, name)
    json.dump(gj, open(path, "w", encoding="utf-8"), separators=(",", ":"))
    print(name, len(lines), "lines", os.path.getsize(path) // 1024, "KB", "length", round(sum(l.Length() for l in lines), 1), "degrees", flush=True)


def main():
    load = lambda n: json.load(open(os.path.join(DATA, n), encoding="utf-8"))
    country = load("mongolia.geojson")
    outline = ogr.Geometry(ogr.wkbMultiLineString)
    for f in country.get("features", [country]):
        for line in rings(f.get("geometry", f)):
            outline.AddGeometry(line)
    block = outline.Buffer(NEAR_COUNTRY)
    aimags, taken = thin(load("aimags.geojson")["features"], block, NEAR_LINE)
    write("aimag_lines.geojson", aimags)
    soums, _ = thin(load("soums.geojson")["features"], taken, NEAR_LINE)
    write("soum_lines.geojson", soums)


if __name__ == "__main__":
    main()
