from __future__ import annotations

import numpy as np

D2R = np.pi / 180.0
R2D = 180.0 / np.pi
LUX_PER_WM2 = 110.0
PPFD_PER_WM2 = 2.02
LEAF_WARMING = 0.003


def direction(az, el):
    # device frame x right, y front, z up, degrees
    az = np.asarray(az, dtype=float) * D2R
    el = np.asarray(el, dtype=float) * D2R
    return np.stack([np.sin(az) * np.cos(el), np.cos(az) * np.cos(el), np.sin(el)], axis=-1)


def normal(pan, tilt):
    # tilt 90 is flat
    return direction(pan, tilt)


class Geo:
    # pose and cosine of incidence of every action at every step
    def __init__(self, pan, tilt, c, sin_el, up):
        self.pan = pan
        self.tilt = tilt
        self.c = c
        self.sin_el = sin_el
        self.up = up


class Scene:
    def __init__(self, scene: dict, offsets, wm2_per_mw: float):
        self.gcr = float(scene["gcr"])
        self.panel_w_mm = float(scene["panel_w_mm"])
        self.panel_h_mm = float(scene["panel_h_mm"])
        self.panel_eff = float(scene["panel_eff"])
        self.pan_limits = [float(v) for v in scene["pan_limits"]]
        self.tilt_limits = [float(v) for v in scene["tilt_limits"]]
        self.park = [float(v) for v in scene["park"]]
        self.offsets = np.asarray(offsets, dtype=float)
        self.wm2_per_mw = float(wm2_per_mw)
        # panel mW per W/m² on the panel plane
        self.mw_per_wm2 = self.panel_w_mm * self.panel_h_mm / 1e6 * self.panel_eff * 1000.0

    def aim(self, rel, el, offsets=None):
        # the pose that turns offset degrees away from the sun, over the top, inside the limits
        off = self.offsets if offsets is None else np.asarray(offsets, dtype=float)
        rel = np.asarray(rel, dtype=float)[..., None]
        el = np.asarray(el, dtype=float)[..., None]
        s = direction(rel, el + off)
        z = np.clip(s[..., 2], -1.0, 1.0)
        e2 = np.arcsin(z) * R2D
        flat = (s[..., 0] == 0) & (s[..., 1] == 0)
        az = np.where(flat, 0.0, np.arctan2(s[..., 0], s[..., 1]) * R2D)
        az = (az + 180.0) % 360.0 - 180.0
        az = np.where(az == -180.0, 180.0, az)
        front = np.abs(az) <= 90.0
        pan = np.where(front, az, np.where(az > 0, az - 180.0, az + 180.0))
        tilt = np.where(front, e2, 180.0 - e2)
        pan = np.clip(pan, *self.pan_limits)
        tilt = np.clip(tilt, *self.tilt_limits)
        night = el[..., 0] <= 0.0
        pan = np.where(night[..., None], self.park[0], pan)
        tilt = np.where(night[..., None], self.park[1], tilt)
        return pan, tilt

    def geometry(self, rel, el) -> Geo:
        rel = np.asarray(rel, dtype=float)
        el = np.asarray(el, dtype=float)
        pan, tilt = self.aim(rel, el)
        up = el > 0.0
        c = np.sum(normal(pan, tilt) * direction(rel, el)[..., None, :], axis=-1)
        c = np.where(up[..., None], c, 0.0)
        return Geo(pan, tilt, c, np.sin(el * D2R), up)

    def outcome(self, geo: Geo, dni, dhi, c=None, sin_el=None):
        # power in mW and ppfd at the crop in µmol/m²/s, for every action or for given cosines
        c = geo.c if c is None else c
        sin_el = geo.sin_el if sin_el is None else sin_el
        dni = np.asarray(dni, dtype=float)
        dhi = np.asarray(dhi, dtype=float)
        if c.ndim > dni.ndim:
            dni, dhi, sin_el = dni[..., None], dhi[..., None], np.asarray(sin_el)[..., None]
        power = (dni * np.maximum(0.0, c) + dhi) * self.mw_per_wm2
        ppfd = (dni * np.maximum(0.0, sin_el - self.gcr * np.abs(c)) + dhi * (1.0 - self.gcr)) * PPFD_PER_WM2
        return power, ppfd

    def open_ppfd(self, sin_el, dni, dhi):
        return (np.asarray(dni) * np.maximum(0.0, sin_el) + np.asarray(dhi)) * PPFD_PER_WM2

    def shade(self, sin_el, c):
        # share of the direct light the array takes from the crop
        sin_el = np.asarray(sin_el, dtype=float)
        with np.errstate(divide="ignore", invalid="ignore"):
            s = np.minimum(1.0, self.gcr * np.abs(c) / sin_el)
        return np.where(sin_el > 0, s, 0.0)

    def panel_lux(self, power):
        return np.asarray(power) / self.mw_per_wm2 * LUX_PER_WM2

    def plant_lux(self, ppfd):
        return np.asarray(ppfd) / PPFD_PER_WM2 * LUX_PER_WM2


def stressed(max_ppfd: float, tmax_c: float, temp, ppfd):
    # light above max_ppfd, or a leaf warmer than tmax_c, the leaf as air plus 3 °C per 1000 µmol/m²/s
    ppfd = np.asarray(ppfd, dtype=float)
    temp = np.asarray(temp, dtype=float)
    if ppfd.ndim > temp.ndim:
        temp = temp[..., None]
    with np.errstate(invalid="ignore"):
        hot = np.isfinite(temp) & (temp + LEAF_WARMING * ppfd > tmax_c)
    return (ppfd > max_ppfd) | hot


def incidence_deg(c):
    return float(np.degrees(np.arccos(np.clip(c, -1.0, 1.0))))
