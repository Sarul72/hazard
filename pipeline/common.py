"""Shared grid and Earth Engine access.

The grid edges coincide with the ERA5-Land pixel edges (x.x5 degrees), so its cells are read exactly as stored,
with no resampling. 0.1 degree is the native resolution of ERA5-Land and of GPM IMERG.
"""
import os
import time

import ee
import numpy as np

PROJECT = os.environ.get("EE_PROJECT", "sigma-513109")
WEST, NORTH, DX, DY, NX, NY = 87.45, 52.35, 0.1, 0.1, 326, 109
GRID = dict(west=WEST, north=NORTH, dx=DX, dy=DY, nx=NX, ny=NY)
LAT = NORTH - (np.arange(NY) + 0.5) * DY
LON = WEST + (np.arange(NX) + 0.5) * DX

NODATA = 255
SCALE = 0.4


def init():
    """Service account on GitHub Actions (EE_SERVICE_ACCOUNT_JSON), the local login otherwise."""
    key = os.environ.get("EE_SERVICE_ACCOUNT_JSON")
    if key:
        import json
        info = json.loads(key)
        ee.Initialize(ee.ServiceAccountCredentials(info["client_email"], key_data=key), project=PROJECT)
    else:
        ee.Initialize(project=PROJECT)


def pixels_strips(image, strips=8):
    """Same as pixels(), asked for in north-south strips: for fine inputs that exceed Earth Engine's memory at once."""
    edges = np.linspace(0, NX, strips + 1).astype(int)
    parts = [pixels(image, c0=int(a), width=int(b - a)) for a, b in zip(edges[:-1], edges[1:])]
    return {k: np.concatenate([p[k] for p in parts], axis=1) for k in parts[0]}


def pixels(image, retries=5, c0=0, width=NX):
    """Read an image on the national grid as {band: float32 [NY, NX]} with NaN for masked pixels."""
    req = dict(
        expression=image, fileFormat="NUMPY_NDARRAY",
        grid=dict(dimensions=dict(width=width, height=NY), crsCode="EPSG:4326",
                  affineTransform=dict(scaleX=DX, shearX=0, translateX=WEST + c0 * DX, shearY=0, scaleY=-DY, translateY=NORTH)),
    )
    wait = 4
    for attempt in range(retries):
        try:
            a = ee.data.computePixels(req)
            break
        except ee.EEException as e:
            msg = str(e)
            if attempt == retries - 1 or not any(k in msg for k in ("Too Many", "429", "503", "500", "deadline", "Deadline", "timed out", "Internal")):
                raise
            time.sleep(wait)
            wait *= 2
    if isinstance(a, np.ma.MaskedArray):
        return {n: np.asarray(a[n].filled(np.nan), np.float32) for n in a.dtype.names}
    return {n: np.asarray(a[n], np.float32) for n in a.dtype.names}


def encode(score):
    """Score or uncertainty 0..100 to the stored uint8, NaN to no data."""
    out = np.full(score.shape, NODATA, np.uint8)
    ok = np.isfinite(score)
    out[ok] = np.clip(np.rint(score[ok] / SCALE), 0, 250).astype(np.uint8)
    return out
