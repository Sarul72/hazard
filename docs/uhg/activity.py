"""Ukhaa Khudag, all Junes 2001-2025: does the published wind-sector AOD contrast follow mine activity?

Inputs (from june_gee.py, stored on branch research/uhg-dust under research/uhg/out):
  june_<year>.csv         per-day table, same fields as daily.csv
  june_field_<year>.json  per-pixel daily MAIAC AOD inside 9.5 km on the native grid (-9 = no retrieval)
  quarries.geojson        OSM polygons of the UHG pit and the coal quarry 4-8 km SW of the point
usage: python activity.py <data_dir> [out_dir]   ->  activity.json, june_years.csv, june_days.csv
"""
import csv
import itertools
import json
import math
import os
import random
import sys

import numpy as np

LON, LAT = 105.5181, 43.6678
KX, KY = 111.32 * math.cos(LAT * math.pi / 180), 111.13
LIM = math.cos(math.pi / 4)
YEARS = list(range(2001, 2026))
OPER = list(range(2009, 2026))
# ROM coal mined in the quarter ending 30 June, kt, Group total (UHG + BN), MMC operational updates (HKEX: 975).
Q2 = {2016: 484.0, 2017: 2557.6, 2018: 2454.5, 2019: 2570.6, 2020: 614.4, 2021: 1050.5,
      2022: 601.6, 2023: 4128.4, 2024: 4791.9, 2025: 3428.4}
PRE = [2003, 2004, 2005, 2006, 2007, 2008]            # mining at UHG began in April 2009; Terra + Aqua
PRE_ALL = [2001, 2002] + PRE                          # 2001-2002: Terra only
LOW = sorted(y for y in Q2 if Q2[y] < 1100)           # 2016, 2020, 2021, 2022
HIGH = sorted(y for y in Q2 if Q2[y] >= 2400)         # 2017-2019, 2023-2025
SITE = [(105.542033, 43.655389), (105.447569, 43.655394), (105.447569, 43.690394), (105.542036, 43.690389)]
REPS = 10000


def xy(lon, lat):
    return (np.asarray(lon) - LON) * KX, (np.asarray(lat) - LAT) * KY


def inside(px, py, poly):
    res = np.zeros(px.shape, bool)
    for (x1, y1), (x2, y2) in zip(poly, poly[1:] + poly[:1]):
        res ^= ((y1 > py) != (y2 > py)) & (px < (x2 - x1) * (py - y1) / ((y2 - y1) + 1e-15) + x1)
    return res


def load(data, here):
    gj = json.load(open(os.path.join(here, 'quarries.geojson')))
    polys = {f['properties']['osm_way']: [tuple(map(float, xy(*p))) for p in f['geometry']['coordinates'][0][:-1]]
             for f in gj['features']}
    other, pit = polys[171851386], polys[206581317]
    site = [tuple(map(float, xy(*p))) for p in SITE]
    days = []
    for y in YEARS:
        rows = list(csv.DictReader(open(os.path.join(data, f'june_{y}.csv'))))
        f = json.load(open(os.path.join(data, f'june_field_{y}.json')))
        e, n = xy(f['lon'], f['lat'])
        r = np.hypot(e, n)
        ring = (r >= 3) & (r <= 8)
        q_other, in_site = inside(e, n, other), inside(e, n, site)
        background = ring & ~in_site & ~q_other & ~inside(e, n, pit)
        aod = np.array(f['aod'], float)
        aod[aod < -8] = np.nan
        clim = np.nanmean(aod, axis=0)
        for k, row in enumerate(rows):
            a = aod[k]
            u, v = float(row['u_ms']), float(row['v_ms'])
            s = math.hypot(u, v)
            ok = row['paired'] in ('1', 'True', 'true')
            raw, anom = [], []
            for j in range(16):  # sectors turned clockwise by 22.5 j degrees; j = 0 is the published geometry
                t = math.radians(22.5 * j)
                ur, vr = u * math.cos(t) + v * math.sin(t), -u * math.sin(t) + v * math.cos(t)
                c = (e * ur + n * vr) / np.maximum(r * s, 1e-6)
                dn, up = ring & (c >= LIM), ring & (c <= -LIM)
                vd, vu = dn & ~np.isnan(a), up & ~np.isnan(a)
                good = ok and vd.sum() >= 8 and vu.sum() >= 8
                raw.append(a[vd].mean() - a[vu].mean() if good else np.nan)
                anom.append((a[vd] - clim[vd]).mean() - (a[vu] - clim[vu]).mean() if good else np.nan)
                if j == 0:
                    qd, qu = q_other[dn].mean(), q_other[up].mean()
            sv, bv = a[in_site & ~np.isnan(a)], a[background & ~np.isnan(a)]
            num = lambda key: float(row[key]) if row[key] not in ('', 'None') else np.nan
            days.append(dict(
                date=row['date'], year=y, paired=ok, diff=num('difference') if ok else np.nan, anom=anom[0],
                down=num('down_mean'), up=num('up_mean'), down_n=int(float(row['down_count'] or 0)),
                up_n=int(float(row['up_count'] or 0)), wind=s, bearing=float(row['bearing_to']),
                steady=num('steadiness'), soil=num('soil_m3m3'), dust=num('dust_aot'), uvai=num('uvai'),
                passes=int(row['passes']), q_down=float(qd), q_up=float(qu),
                site_bg=sv.mean() - bv.mean() if sv.size >= 8 and bv.size >= 20 else np.nan,
                rot_raw=raw, rot_anom=anom))
    return days


def series(days, key, keep=None):
    out = {}
    for y in YEARS:
        vals = [(key(d) if callable(key) else d[key]) for d in days if d['year'] == y]
        if keep is not None:
            vals = [v if keep(d) else np.nan for v, d in zip(vals, [d for d in days if d['year'] == y])]
        out[y] = np.array(vals, float)
    return out


def pooled(arr, years):
    v = np.concatenate([arr[y] for y in years])
    v = v[~np.isnan(v)]
    return (float(v.mean()) if v.size else float('nan')), int(v.size)


def block_index(rng, reps):
    """Per year: 10 circular blocks of 3 consecutive days out of 30 (the published bootstrap)."""
    starts = rng.integers(0, 30, size=(reps, 10))
    return ((starts[:, :, None] + np.arange(3)) % 30).reshape(reps, 30)


def boot(arrs, years, stat, reps=REPS, seed=7):
    rng = np.random.default_rng(seed)
    idx = {y: block_index(rng, reps) for y in years}
    vals = [stat({y: arrs[y][idx[y][b]] for y in years}) for b in range(reps)]
    return [float(x) for x in np.nanpercentile(vals, [2.5, 97.5])]


def mean_ci(arr, ys):
    m, n = pooled(arr, ys)
    return dict(mean=m, n=n, ci=boot(arr, ys, lambda s: pooled(s, ys)[0]))


def contrast(arr, a, b, reps=REPS):
    stat = lambda s: pooled(s, a)[0] - pooled(s, b)[0]
    return dict(value=stat(arr), ci=boot(arr, sorted(set(a + b)), stat, reps))


def label_permutation(arr, a, b):
    """Exact permutation of year labels between groups a and b (two-sided)."""
    pool = a + b
    obs = pooled(arr, a)[0] - pooled(arr, b)[0]
    st = [pooled(arr, list(h))[0] - pooled(arr, [y for y in pool if y not in h])[0]
          for h in itertools.combinations(pool, len(a))]
    return float(np.mean(np.abs(st) >= abs(obs) - 1e-12)), len(st)


def dose(arr, seed=3):
    ys = sorted(Q2)
    x = np.array([Q2[y] / 1000 for y in ys])
    yv = np.array([pooled(arr, [y])[0] for y in ys])
    sl = np.polyfit(x, yv, 1)[0]
    rng = np.random.default_rng(seed)
    p = np.mean([abs(np.polyfit(rng.permutation(x), yv, 1)[0]) >= abs(sl) for _ in range(20000)])
    return dict(slope_per_Mt=float(sl), r=float(np.corrcoef(x, yv)[0, 1]), perm_p=float(p), years=len(ys))


def regression(days, reps=2000, seed=11):
    """Day level: diff ~ high-output year + wind speed + soil moisture + MERRA-2 dust (covariates z-scored)."""
    years = LOW + HIGH
    usable = lambda r: r['paired'] and not np.isnan([r['diff'], r['wind'], r['soil'], r['dust']]).any()
    def fit(rs):
        X = np.array([[r['wind'], r['soil'], r['dust']] for r in rs])
        X = (X - X.mean(0)) / X.std(0)
        h = np.array([float(r['year'] in HIGH) for r in rs])
        if h.min() == h.max():
            return None
        X = np.column_stack([np.ones(len(rs)), h, X])
        return np.linalg.lstsq(X, np.array([r['diff'] for r in rs]), rcond=None)[0]
    rows = [r for r in days if r['year'] in years and usable(r)]
    b = fit(rows)
    rng = np.random.default_rng(seed)
    per = {y: [d for d in days if d['year'] == y] for y in years}
    coefs = []
    for _ in range(reps):
        sample = [per[y][i] for y in years for i in block_index(rng, 1)[0]]
        c = fit([r for r in sample if usable(r)])
        if c is not None:
            coefs.append(c[1])
    return dict(n=len(rows), high=float(b[1]), ci=[float(x) for x in np.percentile(coefs, [2.5, 97.5])],
                wind=float(b[2]), soil=float(b[3]), dust=float(b[4]))


def analyse(days):
    res = dict(q2_rom_kt=Q2, groups=dict(pre=PRE, pre_with_terra_only=PRE_ALL, low=LOW, high=HIGH, operating=OPER))
    D = series(days, 'diff')
    res['published_check'] = dict(mean_ci(D, [2023, 2024, 2025]),
                                  positive=int(sum(np.nansum(D[y] > 0) for y in (2023, 2024, 2025))))
    for label, key in (('wind_sector', 'diff'), ('wind_sector_anomaly', 'anom'), ('license_minus_background', 'site_bg')):
        arr = series(days, key)
        block = {g: mean_ci(arr, ys) for g, ys in (('pre', PRE), ('pre_with_terra_only', PRE_ALL), ('low', LOW),
                                                    ('high', HIGH), ('operating', OPER), ('early_2009_2010', [2009, 2010]))}
        for name, a, b in (('high_minus_low', HIGH, LOW), ('high_minus_pre', HIGH, PRE), ('low_minus_pre', LOW, PRE),
                           ('operating_minus_pre', OPER, PRE), ('from_2011_minus_pre', list(range(2011, 2026)), PRE)):
            block[name] = contrast(arr, a, b)
        block['high_minus_low']['year_permutation_p'], block['high_minus_low']['permutations'] = label_permutation(arr, HIGH, LOW)
        ys = list(range(2003, 2026))
        stat = lambda pre: pooled(arr, [y for y in ys if y not in pre])[0] - pooled(arr, pre)[0]
        random.seed(2)
        perm = np.array([stat(random.sample(ys, 6)) for _ in range(20000)])
        block['operating_minus_pre']['year_permutation_p_one_sided'] = float(np.mean(perm >= stat(PRE)))
        block['dose_response'] = dose(arr)
        block['years'] = {y: dict(zip(('mean', 'n'), pooled(arr, [y]))) for y in YEARS}
        res[label] = block
    res['regression_wind_sector'] = regression(days)
    paired = [d for d in days if d['paired']]
    strata = {}
    dmed = float(np.nanmedian([d['dust'] for d in paired]))
    smed = float(np.nanmedian([d['soil'] for d in paired]))
    for name, keep in (('low_regional_dust', lambda d: d['dust'] <= dmed), ('high_regional_dust', lambda d: d['dust'] > dmed),
                       ('dry_soil', lambda d: d['soil'] <= smed), ('moist_soil', lambda d: d['soil'] > smed),
                       ('strict_wind3_px12', lambda d: d['wind'] >= 3 and d['down_n'] >= 12 and d['up_n'] >= 12),
                       ('other_quarry_outside_sectors', lambda d: d['q_down'] <= 0.05 and d['q_up'] <= 0.05)):
        arr = series(days, 'diff', keep)
        strata[name] = dict(pre=pooled(arr, PRE), low=pooled(arr, LOW), high=pooled(arr, HIGH),
                            high_minus_low=contrast(arr, HIGH, LOW, reps=4000))
    strata['thresholds'] = dict(merra2_dust_aot_median=dmed, soil_m3m3_median=smed)
    for name, keep in (('other_quarry_downwind', lambda d: d['q_down'] > 0.05), ('other_quarry_upwind', lambda d: d['q_up'] > 0.05)):
        arr = series(days, 'diff', keep)
        strata[name] = dict(all_years=pooled(arr, YEARS), pre=pooled(arr, PRE), operating=pooled(arr, OPER))
    S = series(days, 'site_bg')
    W = series(days, 'wind')
    wmed = float(np.median(np.concatenate(list(W.values()))))
    for name, cond in (('license_calm', lambda w: w < wmed), ('license_windy', lambda w: w >= wmed)):
        arr = {y: np.where(cond(W[y]), S[y], np.nan) for y in YEARS}
        strata[name] = dict(threshold_ms=wmed, pre=pooled(arr, PRE), operating=pooled(arr, OPER),
                            operating_minus_pre=contrast(arr, OPER, PRE, reps=4000))
    res['strata'] = strata
    rot = {}
    for label, key in (('wind_sector', 'rot_raw'), ('wind_sector_anomaly', 'rot_anom')):
        h, hl = [], []
        for j in range(16):
            arr = series(days, lambda d, j=j, key=key: d[key][j])
            h.append(pooled(arr, HIGH)[0])
            hl.append(pooled(arr, HIGH)[0] - pooled(arr, LOW)[0])
        rot[label] = dict(turn_degrees=[22.5 * j for j in range(16)], high=h, high_minus_low=hl,
                          rank_high=1 + sum(x > h[0] for x in h[1:]), rank_high_minus_low=1 + sum(x > hl[0] for x in hl[1:]))
    res['rotation'] = rot
    regime = {}
    for name, ys in (('pre', PRE), ('low', LOW), ('high', HIGH)):
        ds = [d for d in paired if d['year'] in ys]
        b = np.radians([d['bearing'] for d in ds])
        regime[name] = dict(n=len(ds), mean_bearing_to=float(np.degrees(np.arctan2(np.sin(b).mean(), np.cos(b).mean())) % 360),
                            resultant=float(np.hypot(np.sin(b).mean(), np.cos(b).mean())),
                            wind=float(np.mean([d['wind'] for d in ds])), dust=float(np.nanmean([d['dust'] for d in ds])),
                            soil=float(np.nanmean([d['soil'] for d in ds])))
    res['wind_regime'] = regime
    return res


def tidy(o):
    if isinstance(o, dict):
        return {str(k): tidy(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [tidy(v) for v in o]
    if isinstance(o, (float, np.floating)):
        return None if math.isnan(o) else round(float(o), 6)
    if isinstance(o, np.integer):
        return int(o)
    return o


def cell(v, nd=5):
    if isinstance(v, bool):
        return int(v)
    if isinstance(v, float):
        return '' if math.isnan(v) else round(v, nd)
    return v


def main():
    data = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else '.'
    here = os.path.dirname(os.path.abspath(__file__))
    days = load(data, here)
    res = tidy(analyse(days))
    json.dump(res, open(os.path.join(out, 'activity.json'), 'w'), ensure_ascii=False, indent=1)
    keys = ['date', 'year', 'paired', 'diff', 'anom', 'down', 'up', 'down_n', 'up_n', 'wind', 'bearing', 'steady',
            'soil', 'dust', 'uvai', 'passes', 'q_down', 'q_up', 'site_bg']
    names = ['date', 'year', 'paired', 'difference', 'difference_anomaly', 'down_mean', 'up_mean', 'down_count',
             'up_count', 'wind_ms', 'bearing_to', 'steadiness', 'soil_m3m3', 'dust_aot', 'uvai', 'passes',
             'sw_quarry_share_down', 'sw_quarry_share_up', 'license_minus_background']
    with open(os.path.join(out, 'june_days.csv'), 'w', newline='') as f:
        w = csv.writer(f)
        w.writerow(names)
        for d in days:
            w.writerow([cell(d[k]) for k in keys])
    with open(os.path.join(out, 'june_years.csv'), 'w', newline='') as f:
        w = csv.writer(f)
        w.writerow(['year', 'group', 'q2_rom_kt', 'paired_days', 'difference', 'difference_anomaly',
                    'license_days', 'license_minus_background'])
        for y in YEARS:
            g = 'pre' if y in PRE_ALL else 'high' if y in HIGH else 'low' if y in LOW else 'operating'
            ws, wa, lb = (res[k]['years'][str(y)] for k in ('wind_sector', 'wind_sector_anomaly', 'license_minus_background'))
            w.writerow([y, g, Q2.get(y, ''), ws['n'], cell(ws['mean']), cell(wa['mean']), lb['n'], cell(lb['mean'])])
    return res


if __name__ == '__main__':
    r = main()
    for k in ('published_check', 'regression_wind_sector', 'rotation'):
        print(k, json.dumps(r[k])[:600])
    for k in ('wind_sector', 'wind_sector_anomaly', 'license_minus_background'):
        print(k, json.dumps({g: v for g, v in r[k].items() if g != 'years'}))
    print(json.dumps(r['strata']))
