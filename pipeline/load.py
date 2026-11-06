"""Reads the local cache written by the fetch_* scripts."""
import calendar
import datetime as dt
import os
import warnings

import numpy as np

import common as C
import fwi_np as F
from fetch_era5 import BANDS, CACHE


def _tags(y):
    for m in range(1, 13):
        yield f"{y}{m:02d}a", dt.date(y, m, 1)
        yield f"{y}{m:02d}b", dt.date(y, m, 17)


def era5_year(y):
    """{band: float32 [days, NY, NX]} and the list of dates. The update job holds only the latest chunks, so leading gaps
    are skipped; a gap after the data has begun ends it, so days stay contiguous."""
    parts, dates = [], []
    for tag, first in _tags(y):
        p = os.path.join(CACHE, "era5", tag + ".npy")
        if not os.path.exists(p):
            if parts:
                break
            continue
        a = np.load(p)
        parts.append(a)
        dates += [first + dt.timedelta(days=k) for k in range(a.shape[1])]
    if not parts:
        return None, []
    arr = np.concatenate(parts, axis=1)
    return {b: arr[i].astype(np.float32) for i, b in enumerate(BANDS)}, dates


def obs_year(kind, y, dates):
    """Observation stack aligned with `dates`; days not fetched stay NaN."""
    out = np.full((len(dates), C.NY, C.NX), np.nan, np.float32)
    index = {d: i for i, d in enumerate(dates)}
    for tag, first in _tags(y):
        p = os.path.join(CACHE, kind, tag + ".npy")
        if not os.path.exists(p):
            continue
        a = np.load(p)
        for k in range(a.shape[0]):
            i = index.get(first + dt.timedelta(days=k))
            if i is not None:
                out[i] = a[k]
    return out


def aai_anomaly(y, dates, half=15):
    """TROPOMI aerosol index minus its local median of the surrounding month.
    The raw index cannot be compared across years: its clean-air level over Mongolia moved from -1.0 to 0.0 during 2021
    and rose again from late 2025 as the processing changed. A dust event lasts days, so it barely moves a 31-day median,
    while instrument offsets and the surface signal both cancel."""
    first, last = dates[0] - dt.timedelta(days=half), dates[-1] + dt.timedelta(days=half)
    span = [first + dt.timedelta(days=k) for k in range((last - first).days + 1)]
    inside = [d for d in span if d.year == y]
    a = obs_year("aai", y, inside)
    out = np.full((len(dates), C.NY, C.NX), np.nan, np.float32)
    index = {d: i for i, d in enumerate(inside)}
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)  # days and cells with no retrieval at all
        for k, d in enumerate(dates):
            i = index[d]
            win = a[max(0, i - half):i + half + 1]
            if np.isfinite(a[i]).any() and np.isfinite(win).any(axis=0).any():
                out[k] = a[i] - np.nanmedian(win, axis=0)
    return out


def veg(y, m):
    """(ndvi, sti) of a month, or NaN grids when that month is not available."""
    p = os.path.join(CACHE, "veg", f"{y}{m:02d}.npy")
    if os.path.exists(p):
        a = np.load(p).astype(np.float32)
        a[~np.isfinite(a)] = np.nan  # zero reflectance over snow divides to infinity
        return np.clip(a[0], -1.0, 1.0), np.clip(a[1], 0.0, 5.0)
    n = np.full((C.NY, C.NX), np.nan, np.float32)
    return n, n


def rel_humidity(t, td):
    """Magnus form, deg C in, percent out."""
    return np.clip(100.0 * np.exp(17.625 * td / (243.04 + td) - 17.625 * t / (243.04 + t)), 0.0, 100.0)


def noon_rain(e):
    """24-hour precipitation ending at 05 UTC, in mm.
    tp0[D] holds the total of day D-1 and tp5[D] the part of day D up to 05 UTC, so:
    rain from 05 UTC of D-1 to 05 UTC of D = tp0[D] - tp5[D-1] + tp5[D]."""
    r = e["tp0"].copy()
    r[1:] = e["tp0"][1:] - e["tp5"][:-1] + e["tp5"][1:]
    return np.maximum(r, 0.0)


def fwi_year(e, dates, want_state=False, state0=None, from_date=None, snapshots=None):
    """Daily FWI for one year. The moisture codes start again from the standard values wherever snow lies on the
    ground (depth >= 1 cm), which is the usual spring start-up for a snow-covered winter.
    With `state0` the run continues from those codes at `from_date`; earlier days give NaN.
    `snapshots`, a dict, collects the codes at the start of each month."""
    T, RH = e["t"], rel_humidity(e["t"], e["td"])
    W = np.hypot(e["u"], e["v"]) * 3.6
    r0 = noon_rain(e)
    out = np.full(T.shape, np.nan, np.float32)
    s = state0 if state0 is not None else F.start(T.shape[1:])
    for i, d in enumerate(dates):
        if from_date and d < from_date:
            continue
        if snapshots is not None and d.day == 1:
            snapshots[d] = s
        s, f = F.step(s, np.nan_to_num(T[i]), np.nan_to_num(RH[i], nan=50.0), np.nan_to_num(W[i]), np.nan_to_num(r0[i]), d.month)
        snow = e["sd"][i] >= 1.0
        s = tuple(np.where(snow, v0, v) for v, v0 in zip(s, (F.FFMC0, F.DMC0, F.DC0)))
        out[i] = np.where(np.isnan(T[i]), np.nan, f)
    return (out, s) if want_state else out


def fwi_state(e, dates):
    """Moisture codes at the end of the given days, for continuing on another input."""
    return fwi_year(e, dates, want_state=True)[1]


def static():
    z = np.load(os.path.join(CACHE, "static.npz"))
    return {k: z[k] for k in z.files}


def days_in(y, m):
    return calendar.monthrange(y, m)[1]
