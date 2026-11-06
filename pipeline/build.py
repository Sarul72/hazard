"""Write what the page reads to data/gee, from the local cache and the fitted model.

    python build.py            everything from 2001
    python build.py 2026-10    only from that month on; the rest of data/gee is kept (used by update.py)

ERA5-Land ends about six days ago. After that the weather comes from NOAA GFS and the rain from GPM IMERG, and the
moisture codes carry on from the last ERA5-Land day. manifest.bridge_from says where that starts.

The long-term cubes hold the model score only, the daily files the model plus what satellites saw that day. See scores.py.
"""
import calendar
import datetime as dt
import gzip
import json
import os
import shutil
import sys
import warnings

import numpy as np

import calibrate as K
import common as C
import fwi_np as F
import load as L
import scores as S
from fetch_era5 import CACHE

HERE = os.path.dirname(__file__)
ROOT = os.path.join(HERE, "..")
OUT = os.path.join(ROOT, "data", "gee")
STATE = os.path.join(HERE, "state")
HAZ = ["fire", "dust", "flood"]
CUBES = HAZ + ["all"]
FIRST_MONTH = (2001, 1)


def month_index(y, m):
    return (y - FIRST_MONTH[0]) * 12 + m - FIRST_MONTH[1]


def bridge(last):
    """GFS days after `last`, the final ERA5-Land day, as a sorted list of (date, [band, NY, NX])."""
    out = []
    p = os.path.join(CACHE, "gfs")
    if not os.path.isdir(p):
        return out
    for name in sorted(os.listdir(p)):
        if name.endswith(".tmp.npy"):
            continue
        first = dt.date(int(name[:4]), int(name[4:6]), 1 if name[6] == "a" else 17)
        a = np.load(os.path.join(p, name)).astype(np.float32)
        out += [(first + dt.timedelta(days=k), a[:, k]) for k in range(a.shape[1]) if first + dt.timedelta(days=k) > last]
    return sorted(out, key=lambda x: x[0])


def write_month(y, m, frames):
    """frames: {day: uint8 [3, NY, NX]}. Days without data stay 255, so the offset of a day in the file never changes."""
    arr = np.full((calendar.monthrange(y, m)[1], len(HAZ), C.NY, C.NX), C.NODATA, np.uint8)
    for d, f in frames.items():
        arr[d - 1] = f
    with gzip.GzipFile(os.path.join(OUT, "daily", f"{y}-{m:02d}.bin.gz"), "wb", compresslevel=9, mtime=0) as g:
        g.write(arr.tobytes())


def read_cube(name):
    p = os.path.join(OUT, name + ".bin.gz")
    if not os.path.exists(p):
        return []
    a = np.frombuffer(gzip.open(p).read(), np.uint8).reshape(-1, C.NY, C.NX)
    return list(a)


def write_cube(name, frames):
    with gzip.GzipFile(os.path.join(OUT, name + ".bin.gz"), "wb", compresslevel=9, mtime=0) as g:
        g.write(np.stack(frames).tobytes())


def process_year(y, e, dates, f, state, ctx, from_month):
    """Scores of one calendar year (or the part in the cache), written out. `state` is the moisture code state after the
    last ERA5-Land day; the GFS bridge starts from it when it reaches this year."""
    s, M, fm, z, cells, prone = ctx["s"], ctx["M"], ctx["fm"], ctx["z"], ctx["cells"], ctx["prone"]
    fire_m = S.fire_year(y, dates, e["sd"], f, M, fm)
    dust_m = S.dust_year(y, dates, e, s, M)
    wmax, melt = e["wmax"], e["melt0"]

    extra = [x for x in bridge(dates[-1]) if x[0].year == y]
    if extra:
        ctx["bridge_from"] = extra[0][0]
        all_dates = dates + [d for d, _ in extra]
        rain_all = L.obs_year("rain", y, all_dates)
        sd, sm = e["sd"][-1], e["sm"][-1]  # snow and soil water stay as on the last ERA5-Land day
        fx, dx = [], []
        for n, (d, a) in enumerate(extra):
            T, RH, U, V, WM = a
            k = len(dates) + n
            r0 = 0.79 * np.nan_to_num(rain_all[k - 1]) + 0.21 * np.nan_to_num(rain_all[k])  # 19 h of the day before, 5 h of this one
            state, fv = F.step(state, np.nan_to_num(T), np.nan_to_num(RH, nan=50.0), np.nan_to_num(np.hypot(U, V) * 3.6), r0, d.month)
            state = tuple(np.where(sd >= K.SNOW_CM, v0, v) for v, v0 in zip(state, (F.FFMC0, F.DMC0, F.DC0)))
            fx.append(S.fire_model_score(fv, sd, K.ndvi_prev(y, d.month), S.fire_S_month(y, d.month, fm), M["fire"]["beta"], M["fire"]["base"]))
            nd, st = L.veg(y - (d.month == 1), 12 if d.month == 1 else d.month - 1)
            dx.append(S.dust_model_score(np.nan_to_num(WM), sm, sd, nd, st, s["lc_barren"], M["dust"]["beta"], M["dust"]["base"]))
        fire_m = np.concatenate([fire_m, np.array(fx, np.float32)])
        dust_m = np.concatenate([dust_m, np.array(dx, np.float32)])
        wmax = np.concatenate([wmax, np.array([a[4] for _, a in extra], np.float32)])
        melt = np.concatenate([melt, np.zeros((len(extra), C.NY, C.NX), np.float32)])
        dates = all_dates

    rain = L.obs_year("rain", y, dates)
    flood_m = S.flood_score(S.flood_water(rain, melt), z["mu"], z["beta"], prone)
    flood_m[~np.isfinite(rain).any(axis=(1, 2))] = np.nan  # no IMERG yet: no flood score, not a zero

    fire_obs, dust_obs = L.obs_year("fire", y, dates), (L.aai_anomaly(y, dates) if y >= 2018 else np.full(rain.shape, np.nan, np.float32))
    fire_t = np.where(fire_obs > 0, np.maximum(fire_m, S.OBSERVED_FIRE_SCORE), fire_m)
    dust_t = np.where((dust_obs >= S.OBSERVED_DUST_AAI) & (wmax >= 6.0), np.maximum(dust_m, S.OBSERVED_DUST_SCORE), dust_m)

    model = {h: np.where(cells, v, np.nan) for h, v in dict(fire=fire_m, dust=dust_m, flood=flood_m).items()}
    today = {h: np.where(cells, v, np.nan) for h, v in dict(fire=fire_t, dust=dust_t, flood=flood_m).items()}
    model["all"] = np.fmax(np.fmax(model["fire"], model["dust"]), model["flood"])

    months = np.array([d.month for d in dates])
    for m in sorted(set(months.tolist())):
        if (y, m) < from_month:
            continue
        i = np.flatnonzero(months == m)
        write_month(y, m, {dates[k].day: np.stack([C.encode(today[h][k]) for h in HAZ]) for k in i})
        k = month_index(y, m)
        for h in CUBES:
            with warnings.catch_warnings():
                warnings.simplefilter("ignore", RuntimeWarning)  # cells outside Mongolia are all NaN
                ctx["monthly"][h][k] = C.encode(np.nanmean(model[h][i], axis=0))
            n = (model[h][i] >= 60).sum(0)
            v = np.minimum(n, 254).astype(np.uint8)
            v[~cells] = C.NODATA
            ctx["high"][h][k] = v
    ctx["last_day"] = dates[-1]
    ctx["first_day"] = ctx.get("first_day") or dates[0]


def manifest(ctx):
    M = ctx["M"]
    ver = {h: M[h]["verification"] for h in ("fire", "dust") if "verification" in M.get(h, {})}
    fl = M.get("flood", {}).get("verification")
    if fl:
        ver["flood"] = {k: fl[k] for k in ("reference", "period", "n", "auc", "events_hit") if k in fl}
    unc = {h: dict(u_input=M["u_input"][h]) for h in HAZ if h in M.get("u_input", {})}
    for h in ("fire", "dust"):
        if M.get(h, {}).get("u_model") is not None:
            unc[h]["u_model"] = round(M[h]["u_model"], 2)
    src = lambda n, r, role: dict(name=n, resolution=r, role=role)
    return dict(
        version=2, generated_at=dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        grid=C.GRID, daily_bands=HAZ, first_date="2001-01-01", last_date=str(ctx["last_day"]),
        bridge_from=str(ctx["bridge_from"]) if ctx.get("bridge_from") else None, first_month="2001-01", uncertainty=unc, verification=ver,
        sources=dict(
            fire=[src("ERA5-Land (ECMWF)", "0.1°", "FWI weather, snow"), src("MODIS FIRMS (Terra, Aqua)", "1 km", "Active fire"), src("MODIS MCD64A1", "500 m", "Burnt-area frequency"),
                  src("MODIS MCD12Q1", "500 m", "Land cover"), src("MODIS MCD43A4", "500 m", "NDVI"), src("NOAA GFS", "0.25°", "Weather of the last days")],
            dust=[src("ERA5-Land (ECMWF)", "0.1°", "Wind every 3 hours, soil water, snow"), src("Sentinel-5P TROPOMI", "≈5 km", "Absorbing aerosol index"), src("MODIS MCD43A4", "500 m", "Dry vegetation (STI), NDVI"),
                  src("MODIS MCD12Q1", "500 m", "Bare ground"), src("NOAA GFS", "0.25°", "Wind of the last days")],
            flood=[src("GPM IMERG V07", "0.1°", "Rain"), src("ERA5-Land (ECMWF)", "0.1°", "Snowmelt"), src("MERIT Hydro", "90 m", "Share of the cell near drainage"), src("Global Flood Database", "250 m", "Verification")],
        ))


def save_states(snaps):
    """Moisture codes at the start of the latest months: the daily update starts from these."""
    os.makedirs(STATE, exist_ok=True)
    for f in os.listdir(STATE):
        os.remove(os.path.join(STATE, f))
    for d in sorted(snaps)[-3:]:
        a = snaps[d]
        np.savez_compressed(os.path.join(STATE, f"fwi_{d:%Y-%m}.npz"), ffmc=a[0].astype(np.float32), dmc=a[1].astype(np.float32), dc=a[2].astype(np.float32))


def load_state(ym):
    z = np.load(os.path.join(STATE, f"fwi_{ym}.npz"))
    return z["ffmc"].astype(np.float64), z["dmc"].astype(np.float64), z["dc"].astype(np.float64)


def main(start=None):
    s = L.static() if os.path.exists(os.path.join(CACHE, "static.npz")) else dict(np.load(os.path.join(HERE, "static_small.npz")))
    cells = S.output_cells(s)
    ctx = dict(s=s, M=S.model(), fm=dict(np.load(os.path.join(HERE, "model_fire.npz"))), z=np.load(os.path.join(HERE, "model_flood.npz")), cells=cells, prone=S.prone_rank(s, cells))
    from_month = tuple(int(v) for v in start.split("-")) if start else FIRST_MONTH
    if start is None:
        shutil.rmtree(OUT, ignore_errors=True)
    os.makedirs(os.path.join(OUT, "daily"), exist_ok=True)
    ctx["monthly"] = {h: dict(enumerate(read_cube(f"monthly_{h}"))) for h in CUBES}
    ctx["high"] = {h: dict(enumerate(read_cube(f"highdays_{h}"))) for h in CUBES}
    snaps = {}
    this_year = dt.date.today().year
    for y in range(from_month[0], this_year + 1):
        e, dates = L.era5_year(y)
        if not dates:
            continue
        state0 = None
        if start and y == from_month[0] and from_month[1] > 1:
            state0 = load_state(start)
        f, state = L.fwi_year(e, dates, want_state=True, state0=state0, from_date=dt.date(from_month[0], from_month[1], 1) if state0 else None, snapshots=snaps)
        process_year(y, e, dates, f, state, ctx, from_month)
        print(y, "to", ctx["last_day"], flush=True)

    for h in CUBES:
        for name, table in ((f"monthly_{h}", ctx["monthly"][h]), (f"highdays_{h}", ctx["high"][h])):
            write_cube(name, [table[k] for k in sorted(table)])
    json.dump(manifest(ctx), open(os.path.join(OUT, "manifest.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    save_states(snaps)
    total = sum(os.path.getsize(os.path.join(r, n)) for r, _, fs in os.walk(OUT) for n in fs)
    print("written", round(total / 1e6, 1), "MB to", ctx["last_day"], "bridge from", ctx.get("bridge_from"), flush=True)


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else None)
