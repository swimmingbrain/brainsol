from __future__ import annotations

import csv
import hashlib
import json
import math
import os
from datetime import datetime

import numpy as np

from .schema import Problem
from .sunpos import position

LOADER_VERSION = 4
FILES = ("meta.json", "steps.csv", "alternatives.csv", "days.csv", "plans.csv")
# canonical step columns and the array they become
STEP_COLS = {
    "sun_az": "az", "sun_el": "el", "sun_rel_az": "rel", "temp_c": "temp", "cloud_pct": "cloud",
    "dni_wm2": "dni", "dhi_wm2": "dhi", "fc_temp_c": "fc_temp", "fc_cloud_pct": "fc_cloud",
    "fc_dni_wm2": "fc_dni", "fc_dhi_wm2": "fc_dhi", "price_eur_mwh": "price",
}
TIME_COLS = ("time_utc", "time_local", "date_local")
REQUIRED = ("dni_wm2", "dhi_wm2")
# what days.csv gives for a comparison, other columns are not read and may be missing
METRICS = ("energy_wh", "energy_pct", "dli", "dli_pct", "stress_h", "elec_eur")
STRATEGIES = ("tracking", "oracle")
# the teammate's defaults, used when meta.json lacks a value
SCENE = {"lat": 48.21, "lon": 16.37, "heading": 180.0, "tz": "", "gcr": 0.35, "panel_w_mm": 125.0,
         "panel_h_mm": 85.0, "panel_eff": 0.15, "pan_limits": [-88.0, 88.0], "tilt_limits": [4.0, 176.0],
         "park": [0.0, 90.0]}
HOW_TO_GET = ("Den Datensatz mit generate.py aus https://github.com/NeYoNmoos/brainsolsynth erzeugen "
              "und den Ordner mit --data, der Einstellung data oder der Umgebungsvariable SONNENTEILER_DATA angeben")


def find_folder(arg: str | None, cfg: dict) -> str:
    for cand in (arg, cfg.get("data"), os.environ.get("SONNENTEILER_DATA")):
        if cand:
            if not os.path.isdir(cand):
                raise Problem(f"der Datenordner {cand} existiert nicht. {HOW_TO_GET}")
            return cand
    if os.path.isfile(os.path.join("data", "steps.csv")):
        return "data"
    raise Problem(f"kein Datensatz gefunden. {HOW_TO_GET}")


def read_json_any(path: str):
    # meta.json may be utf 8 or cp1252, the big data folder was written on windows
    raw = open(path, "rb").read()
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = raw.decode("cp1252")
    return json.loads(text)


def _f(s: str) -> float:
    if not s:
        return math.nan
    try:
        return float(s)
    except ValueError:
        return math.nan


def _iso(s: str) -> datetime:
    s = s.strip()
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    return datetime.fromisoformat(s)


def dataset_key(folder: str, columns: dict) -> str:
    parts = [str(LOADER_VERSION), os.path.abspath(folder), json.dumps(columns, sort_keys=True)]
    for name in FILES:
        p = os.path.join(folder, name)
        if os.path.isfile(p):
            st = os.stat(p)
            parts.append(f"{name}:{st.st_size}:{st.st_mtime_ns}")
    return hashlib.sha1("|".join(parts).encode("utf-8")).hexdigest()[:16]


class Dataset:
    def __init__(self, folder: str, key: str, arrays: dict, info: dict):
        self.folder = folder
        self.key = key
        self.a = arrays
        self.info = info
        meta = info["meta"]
        self.meta = meta
        sc = dict(SCENE)
        sc.update(meta.get("scene") or {})
        self.scene = sc
        self.step_min = int(meta.get("step_min") or info["step_min"])
        self.plan_min = int(meta.get("plan_min") or 60)
        self.dt_h = self.step_min / 60.0
        self.offsets = np.array(meta.get("offsets_deg") or [0, 10, 20, 30, 40, 50, 60, 70, 80, 90], dtype=float)
        area = sc["panel_w_mm"] * sc["panel_h_mm"] / 1e6
        self.wm2_per_mw = float(meta.get("wm2_per_mw") or sc["gcr"] / area / 1000.0)
        self.recipes = list(meta.get("recipes") or [])
        self.generator = f"brainsolsynth {meta['version']}" if meta.get("version") else str(meta.get("generator", ""))
        self.dates: list[str] = info["dates"]
        self.n = len(arrays["t"])
        day = arrays["day"]
        self.lo = np.searchsorted(day, np.arange(len(self.dates)), side="left")
        self.hi = np.searchsorted(day, np.arange(len(self.dates)), side="right")
        self.test = np.arange(len(self.dates)) % 5 == 2
        self.found = info["found"]
        self.missing = info["missing"]
        self.notes = list(info["notes"])
        self.files = info["files"]
        self.ref: dict = {}
        for (dt, rec, strat), vals in zip(info["ref_keys"], arrays["ref_vals"].tolist()):
            self.ref.setdefault((dt, rec), {})[strat] = dict(zip(METRICS, vals))
        self.has = {
            "forecast": bool(np.isfinite(arrays["fc_dni"]).any()),
            "prices": bool(np.isfinite(arrays["price"]).any()),
            "reference": bool(self.ref),
            "temp": bool(np.isfinite(arrays["temp"]).any()),
            "cloud": bool(np.isfinite(arrays["cloud"]).any()),
            "alternatives": bool(self.files.get("alternatives.csv")),
        }
        self._fill_forecast()
        self._day_summary()

    # days

    @property
    def n_days(self) -> int:
        return len(self.dates)

    def day(self, d: int) -> slice:
        return slice(int(self.lo[d]), int(self.hi[d]))

    def day_index(self, date_s: str) -> int | None:
        try:
            return self.dates.index(date_s)
        except ValueError:
            return None

    def set_of(self, d: int) -> str:
        return "test" if self.test[d] else "train"

    def train_days(self) -> list[int]:
        return [d for d in range(self.n_days) if not self.test[d]]

    def test_days(self) -> list[int]:
        return [d for d in range(self.n_days) if self.test[d]]

    def reference(self, date_s: str, name: str) -> dict | None:
        return self.ref.get((date_s, name))

    # forecast stand in and day summary

    def _fill_forecast(self) -> None:
        # without a service forecast the mean of the training days per time of day stands in
        a = self.a
        slot = np.round(a["hour"] * 60.0 / self.step_min).astype(int)
        n_slot = int(round(24 * 60 / self.step_min)) + 1
        slot = np.clip(slot, 0, n_slot - 1)
        train = ~self.test[a["day"]]
        filled = []
        for fc, src in (("fc_dni", "dni"), ("fc_dhi", "dhi"), ("fc_temp", "temp"), ("fc_cloud", "cloud")):
            v = a[fc]
            bad = ~np.isfinite(v)
            if not bad.any():
                continue
            s = a[src]
            ok = train & np.isfinite(s)
            sums = np.bincount(slot[ok], weights=s[ok], minlength=n_slot)
            cnt = np.bincount(slot[ok], minlength=n_slot)
            mean = np.where(cnt > 0, sums / np.maximum(cnt, 1), np.nan)
            a[fc] = np.where(bad, mean[slot], v)
            filled.append(fc)
        self.fc_filled = filled

    def _day_summary(self) -> None:
        a = self.a
        out = {k: [] for k in ("dni_mean", "temp_max", "price_min", "price_max", "neg_price_h", "sunrise",
                               "sunset", "open_dli", "first_up", "last_up")}
        for d in range(self.n_days):
            s = self.day(d)
            el, t = a["el"][s], a["t"][s]
            up = el > 0
            dni, temp, price = a["dni"][s], a["temp"][s], a["price"][s]
            out["dni_mean"].append(float(dni[up].mean()) if up.any() else 0.0)
            out["temp_max"].append(float(np.nanmax(temp)) if np.isfinite(temp).any() else None)
            fin = np.isfinite(price)
            out["price_min"].append(float(price[fin].min()) if fin.any() else None)
            out["price_max"].append(float(price[fin].max()) if fin.any() else None)
            out["neg_price_h"].append(float((price[fin] < 0).sum() * self.dt_h) if fin.any() else None)
            sin_el = np.maximum(np.sin(np.radians(el)), 0.0)
            open_ppfd = (a["dni"][s] * sin_el + a["dhi"][s]) * 2.02
            out["open_dli"].append(float(open_ppfd.sum() * self.dt_h * 3600 / 1e6))
            idx = np.flatnonzero(up)
            if len(idx):
                i0, i1 = int(idx[0]), int(idx[-1])
                out["first_up"].append(i0)
                out["last_up"].append(i1)
                out["sunrise"].append(_cross(t, el, i0 - 1, i0) if i0 > 0 else float(t[0]))
                out["sunset"].append(_cross(t, el, i1, i1 + 1) if i1 + 1 < len(t) else float(t[-1]))
            else:
                noon = float(t[len(t) // 2])
                out["first_up"].append(-1)
                out["last_up"].append(-1)
                out["sunrise"].append(noon)
                out["sunset"].append(noon)
        self.summary = out

    def clear_dli(self, d: int, span: int = 10) -> float:
        # open ground light of a cloudless day near d, the best day around it
        lo, hi = max(0, d - span), min(self.n_days, d + span + 1)
        return float(max(self.summary["open_dli"][lo:hi]))


def scene_check(ds: Dataset, scene, every: int = 37) -> dict | None:
    # our scene model against alternatives.csv, every n-th row with the sun up
    path = os.path.join(ds.folder, "alternatives.csv")
    if not os.path.isfile(path):
        return None
    need = ("time_utc", "offset_deg", "pan", "tilt", "power_mw", "ppfd")
    rows = []
    with open(path, newline="", encoding="utf-8-sig") as f:
        reader = csv.reader(f)
        header = [h.strip() for h in next(reader, [])]
        if not all(c in header for c in need):
            return None
        pos = [header.index(c) for c in need]
        for i, row in enumerate(reader):
            if i % every == 0 and row:
                rows.append([row[j] for j in pos])
    a = ds.a
    index = {int(round(t)): k for k, t in enumerate(a["t"].tolist())}
    col_of = {float(o): j for j, o in enumerate(ds.offsets.tolist())}
    got = []
    for stamp, off, pan, tilt, p, q in rows:
        try:
            k = index.get(int(round(_iso(stamp).timestamp())))
        except ValueError:
            continue
        j = col_of.get(_f(off))
        if k is None or j is None or a["el"][k] <= 0:
            continue
        got.append((k, j, _f(pan), _f(tilt), _f(p), _f(q)))
    if not got:
        return None
    g = np.array(got)
    k, j = g[:, 0].astype(int), g[:, 1].astype(int)
    geo = scene.geometry(a["rel"][k], a["el"][k])
    power, ppfd = scene.outcome(geo, a["dni"][k], a["dhi"][k])
    m = np.arange(len(k))
    return {"rows": int(len(k)),
            "max_err_p_mw": round(float(np.max(np.abs(power[m, j] - g[:, 4]))), 3),
            "max_err_ppfd": round(float(np.max(np.abs(ppfd[m, j] - g[:, 5]))), 3),
            "max_err_pan": round(float(np.max(np.abs(geo.pan[m, j] - g[:, 2]))), 3),
            "max_err_tilt": round(float(np.max(np.abs(geo.tilt[m, j] - g[:, 3]))), 3)}


def _cross(t, el, i, j) -> float:
    a, b = float(el[i]), float(el[j])
    if b == a:
        return float(t[j])
    return float(t[i] + (t[j] - t[i]) * (0.0 - a) / (b - a))


def load(folder: str, work: str | None, columns: dict | None = None, log=None) -> Dataset:
    # parse once, keep a compact cache in the work folder keyed by the dataset
    columns = dict(columns or {})
    if not os.path.isfile(os.path.join(folder, "steps.csv")):
        raise Problem(f"im Ordner {folder} fehlt steps.csv. {HOW_TO_GET}")
    key = dataset_key(folder, columns)
    cache = os.path.join(work, f"dataset-{key}.npz") if work else None
    if cache and os.path.isfile(cache):
        try:
            with np.load(cache, allow_pickle=False) as z:
                arrays = {k: z[k] for k in z.files if k != "info"}
                info = json.loads(str(z["info"]))
            return Dataset(folder, key, arrays, info)
        except (OSError, ValueError, KeyError):
            pass
    arrays, info = parse(folder, columns)
    if cache:
        os.makedirs(work, exist_ok=True)
        tmp = cache + ".tmp.npz"
        np.savez(tmp, info=np.array(json.dumps(info, ensure_ascii=False)), **arrays)
        os.replace(tmp, cache)
    if log:
        log(f"Datensatz gelesen und im Arbeitsordner abgelegt: {len(info['dates'])} Tage")
    return Dataset(folder, key, arrays, info)


def _header(reader, columns: dict) -> tuple[list[str], dict]:
    header = [h.strip() for h in next(reader, [])]
    pos = {}
    for i, h in enumerate(header):
        pos.setdefault(h, i)
    # config columns map a canonical name to the name in the file
    out = {}
    for canon in list(pos):
        out[canon] = pos[canon]
    for canon, name in columns.items():
        if name in pos:
            out[canon] = pos[name]
    return header, out


def parse(folder: str, columns: dict) -> tuple[dict, dict]:
    notes = []
    files = {name: os.path.isfile(os.path.join(folder, name)) for name in FILES}
    meta = {}
    if files["meta.json"]:
        meta = read_json_any(os.path.join(folder, "meta.json"))
    else:
        notes.append("meta.json fehlt, es gelten die Standardwerte des Generators")
    sc = dict(SCENE)
    sc.update(meta.get("scene") or {})

    with open(os.path.join(folder, "steps.csv"), newline="", encoding="utf-8-sig") as f:
        reader = csv.reader(f)
        _, pos = _header(reader, columns)
        found = [c for c in (*TIME_COLS, *STEP_COLS) if c in pos]
        missing = [c for c in (*TIME_COLS, *STEP_COLS) if c not in pos]
        for c in REQUIRED:
            if c not in pos:
                raise Problem(f"in steps.csv fehlt die Spalte {c}")
        if "time_local" not in pos and "time_utc" not in pos:
            raise Problem("in steps.csv fehlt die Spalte time_local")
        num = {arr: pos[c] for c, arr in STEP_COLS.items() if c in pos}
        lists = {arr: [] for arr in num}
        t_l, off_l, hour_l, date_l = [], [], [], []
        i_tl = pos.get("time_local")
        i_tu = pos.get("time_utc")
        i_dl = pos.get("date_local")
        for n_row, row in enumerate(reader, start=2):
            if not row:
                continue
            try:
                stamp = _iso(row[i_tl] if i_tl is not None else row[i_tu])
            except (ValueError, IndexError):
                raise Problem(f"steps.csv Zeile {n_row}: die Zeit ist nicht lesbar") from None
            if stamp.tzinfo is None:
                raise Problem(f"steps.csv Zeile {n_row}: der Zeit fehlt der Versatz zu UTC")
            t_l.append(stamp.timestamp())
            off_l.append(stamp.utcoffset().total_seconds())
            hour_l.append(stamp.hour + stamp.minute / 60.0)
            dl = row[i_dl].strip() if i_dl is not None and i_dl < len(row) else ""
            date_l.append(dl or stamp.date().isoformat())
            for arr, i in num.items():
                lists[arr].append(_f(row[i]) if i < len(row) else math.nan)
    if not t_l:
        raise Problem("steps.csv enthält keine Zeilen")
    if i_tl is None:
        notes.append("time_local fehlt, die Zeit in time_utc gilt als Ortszeit")
    t = np.array(t_l)
    order = np.argsort(t, kind="stable")
    arrays = {"t": t[order], "off": np.array(off_l)[order], "hour": np.array(hour_l)[order]}
    n = len(t)
    for arr in STEP_COLS.values():
        arrays[arr] = np.array(lists[arr], dtype=float)[order] if arr in lists else np.full(n, math.nan)
    dates_row = [date_l[i] for i in order]
    dates = sorted(set(dates_row))
    di = {d: i for i, d in enumerate(dates)}
    arrays["day"] = np.array([di[d] for d in dates_row], dtype=np.int32)
    if np.any(np.diff(arrays["day"]) < 0):
        raise Problem("steps.csv: die Tage in date_local passen nicht zur Zeit")
    for k in ("dni", "dhi"):
        arrays[k] = np.where(np.isfinite(arrays[k]), np.maximum(arrays[k], 0.0), 0.0)

    # sun columns, computed when missing
    if not (np.isfinite(arrays["el"]).all() and np.isfinite(arrays["rel"]).all()):
        az, el = position(arrays["t"], float(sc["lat"]), float(sc["lon"]))
        bad_el = ~np.isfinite(arrays["el"])
        arrays["el"] = np.where(bad_el, el, arrays["el"])
        bad_az = ~np.isfinite(arrays["az"])
        arrays["az"] = np.where(bad_az, az, arrays["az"])
        rel = (arrays["az"] - float(sc["heading"]) + 180.0) % 360.0 - 180.0
        arrays["rel"] = np.where(np.isfinite(arrays["rel"]), arrays["rel"], rel)
        notes.append("der Sonnenstand fehlt zum Teil und wurde berechnet")
    elif not np.isfinite(arrays["az"]).all():
        az = (arrays["rel"] + float(sc["heading"])) % 360.0
        arrays["az"] = np.where(np.isfinite(arrays["az"]), arrays["az"], az)

    if not np.isfinite(arrays["fc_dni"]).any():
        notes.append("die Vorhersage des Wetterdienstes (fc_*) fehlt, das Mittel der Trainingstage je Tageszeit steht dafür")
    if not np.isfinite(arrays["price"]).any():
        notes.append("price_eur_mwh fehlt, es gilt der feste Strompreis aus den Einstellungen")
    if not np.isfinite(arrays["temp"]).any():
        notes.append("temp_c fehlt, Stress kommt dann nur vom Licht")

    # days.csv, only the strategies we compare with
    ref_keys, ref_vals = [], []
    if files["days.csv"]:
        with open(os.path.join(folder, "days.csv"), newline="", encoding="utf-8-sig") as f:
            reader = csv.reader(f)
            _, pos = _header(reader, columns)
            need = ("date_local", "recipe", "strategy")
            if all(c in pos for c in need):
                idx = [pos.get(m) for m in METRICS]
                for row in reader:
                    if not row or row[pos["strategy"]] not in STRATEGIES:
                        continue
                    ref_keys.append([row[pos["date_local"]], row[pos["recipe"]], row[pos["strategy"]]])
                    ref_vals.append([_f(row[i]) if i is not None and i < len(row) else math.nan for i in idx])
            else:
                notes.append("days.csv hat nicht die Spalten date_local, recipe und strategy und bleibt ungenutzt")
    else:
        notes.append("days.csv fehlt, es gibt keinen Vergleich mit den Tageswerten des Datensatzes")
    arrays["ref_vals"] = np.array(ref_vals, dtype=float).reshape(-1, len(METRICS))

    diffs = np.diff(arrays["t"])
    step_min = int(round(float(np.median(diffs)) / 60.0)) if len(diffs) else 5
    info = {"meta": meta, "dates": dates, "found": found, "missing": missing, "notes": notes, "files": files,
            "ref_keys": ref_keys, "step_min": step_min}
    return arrays, info
