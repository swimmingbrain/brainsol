from __future__ import annotations

import numpy as np

DAY = 86400.0
D2R = np.pi / 180.0
R2D = 180.0 / np.pi


def position(t, lat: float, lon: float):
    # noaa solar position from unix seconds, compass azimuth and apparent elevation in degrees
    t = np.asarray(t, dtype=float)
    jc = (t / DAY + 2440587.5 - 2451545.0) / 36525.0
    l0 = (280.46646 + jc * (36000.76983 + jc * 0.0003032)) % 360.0
    m = 357.52911 + jc * (35999.05029 - 0.0001537 * jc)
    e = 0.016708634 - jc * (0.000042037 + 0.0000001267 * jc)
    mr = m * D2R
    c = (
        np.sin(mr) * (1.914602 - jc * (0.004817 + 0.000014 * jc))
        + np.sin(2.0 * mr) * (0.019993 - 0.000101 * jc)
        + np.sin(3.0 * mr) * 0.000289
    )
    omega = (125.04 - 1934.136 * jc) * D2R
    app_long = (l0 + c - 0.00569 - 0.00478 * np.sin(omega)) * D2R
    obliq0 = 23.0 + (26.0 + (21.448 - jc * (46.815 + jc * (0.00059 - jc * 0.001813))) / 60.0) / 60.0
    obliq = (obliq0 + 0.00256 * np.cos(omega)) * D2R
    decl = np.arcsin(np.sin(obliq) * np.sin(app_long))
    y = np.tan(obliq / 2.0) ** 2
    l0r = l0 * D2R
    eqt = 4.0 * R2D * (
        y * np.sin(2.0 * l0r)
        - 2.0 * e * np.sin(mr)
        + 4.0 * e * y * np.sin(mr) * np.cos(2.0 * l0r)
        - 0.5 * y * y * np.sin(4.0 * l0r)
        - 1.25 * e * e * np.sin(2.0 * mr)
    )
    tst = ((t % DAY) / 60.0 + eqt + 4.0 * lon) % 1440.0
    ha = (tst / 4.0 - 180.0) * D2R
    la = lat * D2R
    cosz = np.sin(la) * np.sin(decl) + np.cos(la) * np.cos(decl) * np.cos(ha)
    el = 90.0 - np.arccos(np.clip(cosz, -1.0, 1.0)) * R2D
    az = (np.arctan2(np.sin(ha), np.cos(ha) * np.sin(la) - np.tan(decl) * np.cos(la)) * R2D + 180.0) % 360.0
    return az, el + refraction(el)


def refraction(el):
    # noaa approximation of the atmospheric refraction in degrees
    el = np.asarray(el, dtype=float)
    te = np.tan(np.clip(np.where(np.abs(el) < 0.01, 0.01, el), -89.0, 89.0) * D2R)
    high = 58.1 / te - 0.07 / te ** 3 + 0.000086 / te ** 5
    low = 1735.0 + el * (-518.2 + el * (103.4 + el * (-12.79 + el * 0.711)))
    below = -20.772 / te
    r = np.where(el > 85.0, 0.0, np.where(el > 5.0, high, np.where(el > -0.575, low, below)))
    return r / 3600.0
