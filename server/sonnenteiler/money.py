from __future__ import annotations

import numpy as np

# the keys of a day balance, money is only the electricity sold
KEYS = ("energy_wh", "energy_pct", "dli", "dli_pct", "stress_h", "elec_eur")
# a finished day also says how far the light duty was met
DAY_KEYS = (*KEYS, "light_met")
# a day counts as met from this share of its light duty on
MET = 0.98


def to_eur(dt_h: float, wm2_per_mw: float) -> float:
    # mW at a price in €/MWh over one step, in € per m² of ground
    return wm2_per_mw * dt_h / 1e6


def to_dli(dt_h: float) -> float:
    # µmol/m²/s over one step, in mol/m²
    return dt_h * 3600.0 / 1e6


def totals(power, ppfd, stress, price, dt_h: float, wm2_per_mw: float) -> dict:
    power = np.asarray(power, dtype=float)
    return {
        "energy_wh": float(power.sum() * dt_h / 1000.0),
        "dli": float(np.asarray(ppfd, dtype=float).sum() * to_dli(dt_h)),
        "stress_h": float(np.asarray(stress, dtype=float).sum() * dt_h),
        "elec_eur": float((power * np.asarray(price, dtype=float)).sum() * to_eur(dt_h, wm2_per_mw)),
    }


def balance(recipe: dict, t: dict, energy_max_wh: float) -> dict:
    # the figures of a day, as far as the day has come
    return {
        "energy_wh": t["energy_wh"],
        "energy_pct": 100.0 * t["energy_wh"] / energy_max_wh if energy_max_wh > 0 else 0.0,
        "dli": t["dli"],
        "dli_pct": 100.0 * t["dli"] / recipe["dli_target"],
        "stress_h": t["stress_h"],
        "elec_eur": t["elec_eur"],
    }


def light_met(dli: float, target: float, dli_max: float) -> float:
    # 1 when the crop got its target, or all the light the rules allowed that day
    need = min(target, dli_max)
    return 1.0 if need <= 1e-9 else min(1.0, dli / need)


def rounded(b: dict | None) -> dict | None:
    if b is None:
        return None
    digits = {"energy_wh": 3, "energy_pct": 2, "dli": 3, "dli_pct": 2, "stress_h": 3, "light_met": 4}
    out = {}
    for k in DAY_KEYS:
        if k not in b:
            continue
        v = b[k]
        if v is None or not np.isfinite(v):
            out[k] = None
        elif k in digits:
            out[k] = round(float(v), digits[k])
        else:
            out[k] = float(f"{float(v):.5g}")
    return out
