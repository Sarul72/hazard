"""Canadian Fire Weather Index System on whole grids (Van Wagner 1987; Van Wagner and Pickett 1985).

Same equations as js/fwi.js, vectorised with numpy. tests/test_fwi_np.py holds both to the cffdrs reference values.

Inputs are arrays of one day's noon values:
    T  air temperature, deg C        RH relative humidity, %
    W  10 m wind speed, km/h         r0 24-hour precipitation ending at noon, mm
"""
import numpy as np

DMC_DAYLENGTH = np.array([6.5, 7.5, 9.0, 12.8, 13.9, 13.9, 12.4, 10.9, 9.2, 8.0, 7.0, 6.0])
DC_DAYLENGTH = np.array([-1.6, -1.6, -1.6, 0.9, 3.8, 5.8, 6.4, 5.0, 2.4, 0.4, -1.6, -1.6])
FFMC0, DMC0, DC0 = 85.0, 6.0, 15.0


def ffmc(T, RH, W, r0, F0):
    RH = np.minimum(RH, 100.0)
    mo = 147.2 * (101.0 - F0) / (59.5 + F0)
    wet = r0 > 0.5
    rf = np.where(wet, r0 - 0.5, 1.0)
    mr = mo + 42.5 * rf * np.exp(-100.0 / (251.0 - mo)) * (1.0 - np.exp(-6.93 / rf))
    mr = np.where(mo > 150.0, mr + 0.0015 * (mo - 150.0) ** 2 * np.sqrt(rf), mr)
    mo = np.where(wet, np.minimum(mr, 250.0), mo)

    Ed = 0.942 * RH ** 0.679 + 11.0 * np.exp((RH - 100.0) / 10.0) + 0.18 * (21.1 - T) * (1.0 - np.exp(-0.115 * RH))
    Ew = 0.618 * RH ** 0.753 + 10.0 * np.exp((RH - 100.0) / 10.0) + 0.18 * (21.1 - T) * (1.0 - np.exp(-0.115 * RH))
    ko = 0.424 * (1.0 - (RH / 100.0) ** 1.7) + 0.0694 * np.sqrt(W) * (1.0 - (RH / 100.0) ** 8)
    kd = ko * 0.581 * np.exp(0.0365 * T)
    kl = 0.424 * (1.0 - ((100.0 - RH) / 100.0) ** 1.7) + 0.0694 * np.sqrt(W) * (1.0 - ((100.0 - RH) / 100.0) ** 8)
    kw = kl * 0.581 * np.exp(0.0365 * T)
    m = np.where(mo > Ed, Ed + (mo - Ed) * 10.0 ** (-kd), np.where(mo < Ew, Ew - (Ew - mo) * 10.0 ** (-kw), mo))
    return np.minimum(59.5 * (250.0 - m) / (147.2 + m), 101.0)


def dmc(T, RH, r0, P0, month):
    T = np.maximum(T, -1.1)
    rk = 1.894 * (T + 1.1) * (100.0 - np.minimum(RH, 100.0)) * DMC_DAYLENGTH[month - 1] * 0.0001
    wet = r0 > 1.5
    re = np.where(wet, 0.92 * r0 - 1.27, 1.0)
    Mo = 20.0 + np.exp(5.6348 - P0 / 43.43)
    Ps = np.maximum(P0, 1e-9)
    b = np.where(P0 <= 33.0, 100.0 / (0.5 + 0.3 * P0), np.where(P0 <= 65.0, 14.0 - 1.3 * np.log(Ps), 6.2 * np.log(Ps) - 17.2))
    Mr = Mo + 1000.0 * re / (48.77 + b * re)
    pr = np.maximum(244.72 - 43.43 * np.log(np.maximum(Mr - 20.0, 1e-9)), 0.0)
    return np.maximum(np.where(wet, pr, P0) + rk, 0.0)


def dc(T, r0, D0, month):
    T = np.maximum(T, -2.8)
    pe = np.maximum(0.36 * (T + 2.8) + DC_DAYLENGTH[month - 1], 0.0)
    wet = r0 > 2.8
    rd = np.where(wet, 0.83 * r0 - 1.27, 1.0)
    Qr = 800.0 * np.exp(-D0 / 400.0) + 3.937 * rd
    dr = np.maximum(400.0 * np.log(800.0 / Qr), 0.0)
    return np.where(wet, dr, D0) + 0.5 * pe


def isi(W, F):
    m = 147.2 * (101.0 - F) / (59.5 + F)
    fF = 91.9 * np.exp(-0.1386 * m) * (1.0 + m ** 5.31 / 4.93e7)
    return 0.208 * np.exp(0.05039 * W) * fF


def bui(P, D):
    denom = np.maximum(P + 0.4 * D, 1e-9)
    low = 0.8 * P * D / denom
    high = P - (1.0 - 0.8 * D / denom) * (0.92 + (0.0114 * P) ** 1.7)
    return np.where((P == 0.0) & (D == 0.0), 0.0, np.maximum(np.where(P <= 0.4 * D, low, high), 0.0))


def fwi(I, U):
    fD = np.where(U <= 80.0, 0.626 * np.maximum(U, 0.0) ** 0.809 + 2.0, 1000.0 / (25.0 + 108.64 * np.exp(-0.023 * U)))
    B = 0.1 * I * fD
    Bs = np.maximum(B, 1.0 + 1e-12)
    return np.where(B > 1.0, np.exp(2.72 * (0.434 * np.log(Bs)) ** 0.647), B)


def step(state, T, RH, W, r0, month):
    """One day. `state` is (ffmc, dmc, dc). Returns the new state and the FWI of the day."""
    F = ffmc(T, RH, W, r0, state[0])
    P = dmc(T, RH, r0, state[1], month)
    D = dc(T, r0, state[2], month)
    return (F, P, D), fwi(isi(W, F), bui(P, D))


def start(shape):
    return np.full(shape, FFMC0), np.full(shape, DMC0), np.full(shape, DC0)


# EFFIS class limits, as in js/config.js: FWI 0, 5.2, 11.2, 21.3, 38, 50 -> score 0, 20, 40, 60, 80, 100.
FWI_BREAKS = np.array([0.0, 5.2, 11.2, 21.3, 38.0, 50.0])
FWI_SCORES = np.array([0.0, 20.0, 40.0, 60.0, 80.0, 100.0])


def effis_score(v):
    return np.interp(v, FWI_BREAKS, FWI_SCORES)
