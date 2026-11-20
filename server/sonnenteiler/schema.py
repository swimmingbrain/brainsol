from __future__ import annotations

import copy
import json
import math

import numpy as np

DEFAULT_CONFIG = {
    # dataset folder and work folder, both can also come from the command line
    "data": None,
    "work": None,
    # other column names in the dataset, canonical name to the name in the file
    "columns": {},
    "site_name": None,
    "block_h": 3,
    # one action per hold block, null takes plan_min of the dataset
    "hold_min": None,
    # null takes the first recipe of the dataset
    "recipe": None,
    "planner": {
        # the sky quantile for the light duty on a forecast, careful so the duty is met as often as it can
        "light_quantile": 0.35,
    },
    "elec_price_default_eur_mwh": 80.0,
    "nowcast": {
        "hidden": [32, 32],
        "steps": 3000,
        "batch": 512,
        "lr": 0.003,
        "issues_per_day": 24,
        "targets_per_issue": 48,
        "seed": 1,
    },
    "sim": {"days": "test", "start": None, "speed": 360, "skip_night": True, "tick_hz": 10},
    "cloud": {"minutes": 90, "factor": 0.15, "dhi_factor": 0.7},
    "server": {"host": "0.0.0.0", "port": 8000},
}


class Problem(ValueError):
    # a german sentence for the user, http 400 or a short error on the command line
    pass


def _merge(base: dict, over: dict) -> dict:
    out = copy.deepcopy(base)
    for k, v in over.items():
        if isinstance(v, dict) and isinstance(out.get(k), dict) and k not in ("columns", "recipe"):
            out[k] = _merge(out[k], v)
        else:
            out[k] = copy.deepcopy(v)
    return out


def number(v, name: str, lo: float | None = None, hi: float | None = None) -> float:
    if isinstance(v, str):
        try:
            v = float(v.strip().replace(",", "."))
        except ValueError:
            raise Problem(f"{name} muss eine Zahl sein") from None
    if isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v):
        raise Problem(f"{name} muss eine Zahl sein")
    if lo is not None and v < lo:
        raise Problem(f"{name} muss mindestens {lo:g} sein")
    if hi is not None and v > hi:
        raise Problem(f"{name} darf höchstens {hi:g} sein")
    return float(v)


def config(over: dict | None = None) -> dict:
    # defaults with the given settings on top, checked
    if over is not None and not isinstance(over, dict):
        raise Problem("die Einstellungen müssen ein JSON Objekt sein")
    cfg = _merge(DEFAULT_CONFIG, over or {})
    bh = number(cfg["block_h"], "block_h", 1, 24)
    if 24 % bh:
        raise Problem("block_h muss 24 teilen")
    cfg["block_h"] = int(bh)
    if cfg["hold_min"] is not None:
        cfg["hold_min"] = int(number(cfg["hold_min"], "hold_min", 1, 24 * 60))
    if not isinstance(cfg["columns"], dict):
        raise Problem("columns muss ein Objekt sein")
    if cfg["sim"]["days"] not in ("test", "all"):
        raise Problem("sim.days muss test oder all sein")
    number(cfg["sim"]["speed"], "sim.speed", 0.1, 1e6)
    number(cfg["cloud"]["factor"], "cloud.factor", 0, 1)
    number(cfg["planner"]["light_quantile"], "planner.light_quantile", 0.1, 0.9)
    number(cfg["elec_price_default_eur_mwh"], "elec_price_default_eur_mwh")
    return cfg


def load_config(path: str | None) -> dict:
    if not path:
        return config()
    with open(path, encoding="utf-8-sig") as f:
        try:
            return config(json.load(f))
        except json.JSONDecodeError as e:
            raise Problem(f"die Einstellungen in {path} sind kein gültiges JSON: {e}") from None


def clean(o):
    # plain python for json, nan and inf become null
    if isinstance(o, dict):
        return {str(k): clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [clean(v) for v in o]
    if isinstance(o, np.ndarray):
        return [clean(v) for v in o.tolist()]
    if isinstance(o, (bool, np.bool_)):
        return bool(o)
    if isinstance(o, (int, np.integer)):
        return int(o)
    if isinstance(o, (float, np.floating)):
        f = float(o)
        return f if math.isfinite(f) else None
    return o


def dumps(o, indent=None) -> str:
    sep = (",", ":") if indent is None else (",", ": ")
    return json.dumps(clean(o), ensure_ascii=False, allow_nan=False, separators=sep, indent=indent)


def rnd(v, digits: int):
    # rounded float or null
    if v is None:
        return None
    f = float(v)
    return round(f, digits) if math.isfinite(f) else None


def sig(v, n: int = 4):
    # n significant digits, for small money values
    if v is None:
        return None
    f = float(v)
    if not math.isfinite(f):
        return None
    return float(f"{f:.{n}g}")


def col(a, digits: int) -> list:
    # a numpy column as a rounded list, nan becomes null
    a = np.asarray(a, dtype=float)
    r = np.round(a, digits)
    ok = np.isfinite(r)
    if ok.all():
        return r.tolist()
    return [x if f else None for x, f in zip(r.tolist(), ok.tolist())]


def sig_col(a, n: int = 4) -> list:
    return [sig(x, n) for x in np.asarray(a, dtype=float).tolist()]


def de(v: float, digits: int = 1) -> str:
    # german number with a decimal comma, the sign as a word so log lines stay free of hyphens
    s = f"{abs(v):.{digits}f}".replace(".", ",")
    return "minus " + s if round(v, digits) < 0 else s


def hhmm(t: float, off_s: float) -> str:
    m = int(((t + off_s) % 86400.0) // 60)
    return f"{m // 60:02d}:{m % 60:02d}"
