"""Winter and spring camps for the page, with everything personal removed.

The two source shapefiles are not public data: SeasonCamps is a land cadastre with phone numbers, clan names and contract
numbers, and points carries a person id. Only position and layer are read here, positions are rounded to 0.01 degree
(about 1 km) and points in the same place are merged into counts. The output cannot be traced back to a parcel or a person
id, though in empty country a rounded position can still point to one household. The source files never go into the repository.

    python build_camps.py <folder with points.shp and SeasonCamps.shp>

data/camps.bin.gz: uint16 records [x, y, herder_points, cadastre_camps], x = (lon - 87) * 100, y = (lat - 41) * 100.
"""
import collections
import gzip
import json
import os
import sys

import numpy as np
import shapefile

STEP = 0.01
LON0, LAT0 = 87.0, 41.0
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data")


def key(x, y):
    return int(round((x - LON0) / STEP)), int(round((y - LAT0) / STEP))


def main(folder):
    cells = collections.defaultdict(lambda: [0, 0])
    r = shapefile.Reader(os.path.join(folder, "points"), encoding="utf-8", encodingErrors="replace")
    n_points = 0
    for s in r.iterShapes():
        if s.points:
            cells[key(*s.points[0])][0] += 1
            n_points += 1

    r = shapefile.Reader(os.path.join(folder, "SeasonCamps"), encoding="utf-8", encodingErrors="replace")
    status = [f[0] for f in r.fields[1:]].index("descriptio")
    n_camps = cancelled = 0
    for s in r.iterShapeRecords():
        if s.record[status] == "Цуцалсан":  # a cancelled right is no longer a camp
            cancelled += 1
            continue
        if s.shape.points:
            cells[key(*s.shape.points[0])][1] += 1
            n_camps += 1

    rows = np.array([[x, y, a, b] for (x, y), (a, b) in sorted(cells.items())], dtype="<u2")
    with gzip.GzipFile(os.path.join(OUT, "camps.bin.gz"), "wb", compresslevel=9, mtime=0) as g:
        g.write(rows.tobytes())
    meta = dict(step_deg=STEP, lon0=LON0, lat0=LAT0, locations=len(rows), herder_points=n_points, cadastre_camps=n_camps, cancelled_left_out=cancelled)
    json.dump(meta, open(os.path.join(OUT, "camps_meta.json"), "w", encoding="utf-8"), indent=1)
    print(meta, os.path.getsize(os.path.join(OUT, "camps.bin.gz")) // 1024, "KB")


if __name__ == "__main__":
    main(sys.argv[1])
