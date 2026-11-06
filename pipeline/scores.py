"""Daily scores for each hazard on the national grid, using the fitted model.

Two scores are kept apart on purpose:
    model   the same inputs for all 26 years. Long-term statistics use only this one, otherwise the start of a new
            satellite (TROPOMI in 2018) would show up as a jump that looks like a trend.
    today   the model plus what a satellite actually saw that day. The daily map uses this one.
"""
import json
import os

import numpy as np

import calibrate as K
import common as C
import fwi_np as F
import load as L
from fetch_era5 import CACHE

HERE = os.path.dirname(__file__)
OBSERVED_FIRE_SCORE = 90.0   # an active fire seen that day: the hazard is happening, whatever the model says
OBSERVED_DUST_SCORE = 80.0
OBSERVED_DUST_AAI = 1.5      # with wind >= 6 m/s, so that smoke drifting in calm air does not count as local dust
EULER = 0.5772156649015329


def model():
    return json.load(open(K.MODEL, encoding="utf-8"))


def output_cells(s):
    """Every cell touching Mongolia, so the map reaches the border."""
    return s["mask"] > 0.02


# -------------------------------------------------------------------- fire
def fire_model_score(f, sd, ndvi, S, beta, base):
    """f: FWI; sd: snow depth cm; ndvi and S: same shape or broadcastable. Returns score 0..100."""
    fs = F.effis_score(f) / 100.0
    G = np.nan_to_num(np.broadcast_to(ndvi, fs.shape), nan=0.1)
    Sb = np.broadcast_to(S, fs.shape)
    X = K.fire_design(fs.ravel(), Sb.ravel(), G.ravel())
    sc = K.lift_score(K.predict(X, np.array(beta)), base).reshape(fs.shape)
    return np.where(sd >= K.SNOW_CM, 0.0, sc)


def month_rain(y, m):
    """Rain total of a whole month, or None while the month is not complete."""
    p = os.path.join(CACHE, "monthly_rain.npy")
    if os.path.exists(p):
        r = np.load(p, mmap_mode="r")  # 440 MB: read only the month needed
        v = r[y - 2001, m - 1] if y - 2001 < r.shape[0] else None
        return None if v is None or not np.isfinite(v).any() else np.array(v)
    e, dates = L.era5_year(y)  # the update job has no 26-year file, only the latest chunks
    i = [k for k, d in enumerate(dates) if d.month == m]
    return L.noon_rain(e)[i].sum(0) if len(i) == L.days_in(y, m) else None


def fire_S_month(y, m, fm):
    """Multi-criteria susceptibility of a month on the whole grid, scaled 0..1. While a month is under way its SPI is
    not known yet and counts as normal."""
    r = month_rain(y, m)
    z = (r - fm["spi_mu"][m - 1]) / fm["spi_sd"][m - 1] if r is not None else np.zeros((C.NY, C.NX))
    z = np.where(np.isfinite(z), z, 0.0)
    return (fm["S"] + K.W_SPI * K.spi_class(z)) / (float(fm["w"]) + K.W_SPI) / 5.0


def fire_year(y, dates, e_sd, f, M, fm):
    out = np.empty(f.shape, np.float32)
    months = np.array([d.month for d in dates])
    for m in sorted(set(months)):
        i = months == m
        out[i] = fire_model_score(f[i], e_sd[i], K.ndvi_prev(y, int(m)), fire_S_month(y, int(m), fm), M["fire"]["beta"], M["fire"]["base"])
    return out


# -------------------------------------------------------------------- dust
def dust_model_score(w, sm, sd, ndvi, sti, bare, beta, base):
    b = lambda a, fill: np.nan_to_num(np.broadcast_to(a, w.shape), nan=fill)
    X = K.dust_design(w.ravel(), sm.ravel(), b(ndvi, 0.1).ravel(), b(sti, 1.2).ravel(), b(bare, 0.0).ravel())
    sc = K.lift_score(K.predict(X, np.array(beta)), base).reshape(w.shape)
    return np.where(sd >= K.SNOW_CM, 0.0, sc)


def dust_year(y, dates, e, s, M):
    out = np.empty(e["wmax"].shape, np.float32)
    months = np.array([d.month for d in dates])
    for m in sorted(set(months)):
        i = months == m
        n, t = L.veg(y - (m == 1), 12 if m == 1 else int(m) - 1)
        out[i] = dust_model_score(e["wmax"][i], e["sm"][i], e["sd"][i], n, t, s["lc_barren"], M["dust"]["beta"], M["dust"]["base"])
    return out


# ------------------------------------------------------------------- flood
def gumbel_cells(annual_max):
    """Per-cell Gumbel fit by L-moments (Hosking 1990), as js/flood_stats.js. annual_max: [years, NY, NX]."""
    x = np.sort(annual_max, axis=0)
    n = x.shape[0]
    b0 = x.mean(0)
    b1 = (np.arange(n)[:, None, None] / (n - 1) * x).mean(0)
    beta = np.maximum((2 * b1 - b0) / np.log(2.0), 1e-3)
    return b0 - EULER * beta, beta


def return_period(w, mu, beta):
    p = np.exp(-np.exp(-np.clip((w - mu) / beta, -20, 40)))
    return 1.0 / np.maximum(1.0 - p, 1e-6)


FLOOD_T = np.log10([1.01, 2.0, 5.0, 20.0, 100.0])   # as GloFAS: alert levels from return periods
FLOOD_S = np.array([0.0, 40.0, 60.0, 80.0, 100.0])


def flood_water(rain, melt0):
    """Three-day sum of rain and snowmelt. melt0[D] holds the melt of day D-1, so it moves back one day."""
    melt = np.zeros_like(rain)
    melt[:-1] = np.nan_to_num(melt0[1:len(rain)])
    melt[-1] = melt[-2] if len(melt) > 1 else 0.0
    day = np.nan_to_num(rain) + melt
    w = day.copy()
    w[1:] += day[:-1]
    w[2:] += day[:-2]
    return w


def flood_score(w, mu, beta, prone):
    """Return period of the water input, gated by an absolute amount (a 3 mm "record" in the Gobi is no flood) and
    weighted by how much of the cell lies close to a drainage line."""
    t = np.log10(return_period(w, mu, beta))
    sc = np.interp(t, FLOOD_T, FLOOD_S)
    gate = np.clip((w - 5.0) / 15.0, 0.0, 1.0)
    return sc * gate * (0.5 + 0.5 * prone)


def prone_rank(s, ok):
    """Share of the cell near drainage as a 0..1 rank among Mongolian cells."""
    v = s["prone"][ok]
    r = np.zeros(s["prone"].shape, np.float32)
    r[ok] = np.argsort(np.argsort(v)) / max(v.size - 1, 1)
    return r
