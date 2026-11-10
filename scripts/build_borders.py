"""Border lines for the page: the national border and every stretch of aimag and soum border once.

The national border is the outer edge of the aimags (data/aimags.geojson, merged from the geoBoundaries soums), written to
data/mongolia.geojson. Until 2026-11-10 it came from Natural Earth 1:50m, a different source that lay up to several km
from the aimag edges, so stretches of aimag border ran beside the national border as a second red line.

A dashed line needs the cutting below. Neighbouring polygons each hold the shared border, and two dashed copies out of step
look like a solid, uneven line. Here each ring is cut where a higher level or an earlier neighbour already runs, so nothing
is drawn twice. Needs GDAL (the Python of ArcGIS Pro has it). Run by hand, after build_aimags.py.

    python build_borders.py
"""
import json
import os

from osgeo import ogr

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "data")
NEAR_COUNTRY = 0.006  # degrees: the outline is the aimags' own edge; this only covers the closing of hairline gaps
GROW = 0.01           # degrees: grow and shrink back when merging the aimags, as build_aimags.py, to close hairline gaps
SIMPLIFY = 0.002      # degrees: points closer than this to the line between their neighbours are dropped from the outline
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


def country(aimags):
    """The outer edge of all aimags as one polygon, without holes, written to data/mongolia.geojson."""
    union = None
    for f in aimags:
        g = ogr.CreateGeometryFromJson(json.dumps(f["geometry"])).Buffer(GROW)
        union = g if union is None else union.Union(g)
    # growing rounds every corner into many points; 0.002 degrees (about 200 m) keeps the edge well inside NEAR_COUNTRY
    union = union.Buffer(-GROW).SimplifyPreserveTopology(SIMPLIFY)
    polys = [union] if union.GetGeometryType() == ogr.wkbPolygon else [union.GetGeometryRef(i) for i in range(union.GetGeometryCount())]
    polys = sorted(polys, key=lambda p: -p.GetArea())
    keep = [p for p in polys if p.GetArea() >= 0.01 * polys[0].GetArea()]
    coords = []
    for p in keep:
        r = p.GetGeometryRef(0)  # outer ring only: Mongolia has no enclaves
        coords.append([[[round(r.GetX(i), 3), round(r.GetY(i), 3)] for i in range(r.GetPointCount())]])
    geom = dict(type="Polygon", coordinates=coords[0]) if len(coords) == 1 else dict(type="MultiPolygon", coordinates=coords)
    gj = dict(type="FeatureCollection", features=[dict(type="Feature", properties=dict(
        name="Mongolia", source="Outer edge of the aimags merged from geoBoundaries ADM2 soums (Runfola et al. 2020, CC BY 3.0 IGO); scripts/build_borders.py"), geometry=geom)])
    path = os.path.join(DATA, "mongolia.geojson")
    json.dump(gj, open(path, "w", encoding="utf-8"), separators=(",", ":"))
    print("mongolia.geojson", len(keep), "part(s)", sum(len(c[0]) for c in coords), "points", os.path.getsize(path) // 1024, "KB", flush=True)
    return gj


def main():
    load = lambda n: json.load(open(os.path.join(DATA, n), encoding="utf-8"))
    aimag_features = load("aimags.geojson")["features"]
    outline = ogr.Geometry(ogr.wkbMultiLineString)
    for f in country(aimag_features)["features"]:
        for line in rings(f["geometry"]):
            outline.AddGeometry(line)
    block = outline.Buffer(NEAR_COUNTRY)
    aimags, taken = thin(aimag_features, block, NEAR_LINE)
    write("aimag_lines.geojson", aimags)
    soums, _ = thin(load("soums.geojson")["features"], taken, NEAR_LINE)
    write("soum_lines.geojson", soums)


if __name__ == "__main__":
    main()
