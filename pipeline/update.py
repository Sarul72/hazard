"""Daily job: refresh the last two months with whatever Earth Engine has newly published.

Two months are recomputed, not one day, because ERA5-Land replaces the GFS bridge about six days later and the last
days must then be redone. It costs a couple of minutes of Earth Engine time a day.

Needs in the repository: pipeline/model.json, model_fire.npz, model_flood.npz, static_small.npz and pipeline/state.
On GitHub Actions the login comes from the secret EE_SERVICE_ACCOUNT_JSON.

    python update.py
"""
import datetime as dt
import os
import subprocess
import sys

import ee
import numpy as np

import common as C
from fetch_era5 import CACHE, H

PY = sys.executable
HERE = os.path.dirname(os.path.abspath(__file__))


def last_era5(today):
    """Latest day whose 05 UTC image and next-day 00 UTC image both exist."""
    for k in range(3, 25):
        d = today - dt.timedelta(days=k)
        try:
            ee.data.getAsset(f"{H}{d:%Y%m%d}T21")
            return d
        except ee.EEException:
            continue
    raise SystemExit("no recent ERA5-Land day found")


def run(*args):
    print("+", *args, flush=True)
    subprocess.run([PY, "-u", *args], check=True, cwd=HERE)


def main():
    C.init()
    today = dt.datetime.now(dt.timezone.utc).date()
    first = (today.replace(day=1) - dt.timedelta(days=1)).replace(day=1)   # first day of the previous month
    # Start on a chunk boundary a little earlier, for the 3-day flood sum at the start of the first month.
    fetch_from = (first - dt.timedelta(days=1)).replace(day=17)
    era_end = last_era5(today)
    end = today - dt.timedelta(days=1)
    print("recompute from", first, "| ERA5-Land to", era_end, "| to", end, flush=True)
    run("fetch_era5.py", str(fetch_from), str(era_end))
    for kind in ("fire", "aai", "rain"):
        run("fetch_obs.py", kind, str(fetch_from), str(end))
    run("fetch_obs.py", "veg", str(fetch_from.replace(day=1)), str(end))
    run("fetch_gfs.py", str(era_end.replace(day=1 if era_end.day < 17 else 17)), str(end))
    run("build.py", f"{first:%Y-%m}")


if __name__ == "__main__":
    main()
