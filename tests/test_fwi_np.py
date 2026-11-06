"""pipeline/fwi_np.py against the cffdrs reference day and against random multi-day runs.
Run: python tests/test_fwi_np.py [path to write a JSON case file for the js/fwi.js comparison]"""
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "pipeline"))
import fwi_np as F  # noqa: E402


def near(name, got, want, tol):
    assert abs(float(got) - want) <= tol, f"{name}: got {got}, want {want}"


# First day of the cffdrs test data: April, T 17, RH 42, W 25, rain 0, start 85/6/15.
one = np.array([1.0])
s = F.start(one.shape)
ff = F.ffmc(17 * one, 42 * one, 25 * one, 0 * one, s[0])
dm = F.dmc(17 * one, 42 * one, 0 * one, s[1], 4)
dc = F.dc(17 * one, 0 * one, s[2], 4)
ii = F.isi(25 * one, ff)
bu = F.bui(dm, dc)
for name, got, want in [("FFMC", ff, 87.692), ("DMC", dm, 8.545), ("DC", dc, 19.013), ("ISI", ii, 10.853), ("BUI", bu, 8.490), ("FWI", F.fwi(ii, bu), 10.096)]:
    near(name, got[0], want, 0.01)

# Extremes stay finite and non-negative.
rng = np.random.default_rng(7)
n = 4000
state = (rng.uniform(0, 101, n), rng.uniform(0, 500, n), rng.uniform(0, 1000, n))
T, RH, W, r = rng.uniform(-45, 48, n), rng.uniform(0, 100, n), rng.uniform(0, 160, n), rng.exponential(8, n) * (rng.random(n) < .4)
(a, b, c), f = F.step(state, T, RH, W, r, 6)
assert all(np.isfinite(v).all() and (v >= 0).all() for v in (a, b, c, f)) and (a <= 101).all()

# Score mapping keeps the EFFIS class limits.
assert list(F.effis_score(np.array([0, 5.2, 21.3, 50, 90]))) == [0, 20, 60, 100, 100]

if len(sys.argv) > 1:
    days = []
    st = F.start((6,))
    rng = np.random.default_rng(11)
    for d in range(120):
        T, RH, W = rng.uniform(-20, 38, 6), rng.uniform(8, 100, 6), rng.uniform(0, 70, 6)
        r = rng.exponential(6, 6) * (rng.random(6) < .35)
        m = 3 + d // 30
        st, f = F.step(st, T, RH, W, r, m)
        days.append(dict(m=m, T=T.tolist(), RH=RH.tolist(), W=W.tolist(), r=r.tolist(), ffmc=st[0].tolist(), dmc=st[1].tolist(), dc=st[2].tolist(), fwi=f.tolist()))
    json.dump(days, open(sys.argv[1], "w"))
print("fwi_np: all checks passed")
