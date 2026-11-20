from __future__ import annotations

import hashlib
import json
import os
import time

import numpy as np

from .nn import MLP

QS = (0.1, 0.25, 0.5, 0.75, 0.9)
LEADS = (30, 60, 120, 180)
# lead buckets in minutes for the error spread of the two baselines
BUCKETS = np.array([45.0, 90.0, 150.0, 240.0])
TAUS = (10.0, 20.0, 30.0, 45.0, 60.0, 90.0, 120.0, 180.0, 240.0, 360.0, 600.0)
METHODS = ("raw", "shift", "model")
VERSION = 2


class DayInput:
    # what the nowcast sees of one local day: the service forecast for every step and the measured
    # weather, of which only the steps before the issue step are read
    def __init__(self, t, el, hour, fc_dni, fc_dhi, fc_temp, fc_cloud, dni, dhi, temp, cloud, step_min: int):
        self.t, self.el, self.hour = t, el, hour
        self.fc_dni, self.fc_dhi, self.fc_temp, self.fc_cloud = fc_dni, fc_dhi, fc_temp, fc_cloud
        self.dni, self.dhi, self.temp, self.cloud = dni, dhi, temp, cloud
        self.step_min = step_min
        self.hs = max(1, int(round(60 / step_min)))
        self.sin_el = np.maximum(np.sin(np.radians(el)), 0.0)
        self.up = el > 0.0

    @classmethod
    def from_dataset(cls, ds, d: int, dni=None, dhi=None, temp=None, cloud=None) -> DayInput:
        a, s = ds.a, ds.day(d)
        return cls(a["t"][s], a["el"][s], a["hour"][s], a["fc_dni"][s], a["fc_dhi"][s], a["fc_temp"][s],
                   a["fc_cloud"][s], a["dni"][s] if dni is None else dni, a["dhi"][s] if dhi is None else dhi,
                   a["temp"][s] if temp is None else temp, a["cloud"][s] if cloud is None else cloud, ds.step_min)


def _mean(v):
    v = v[np.isfinite(v)]
    return float(v.mean()) if len(v) else 0.0


def issue(w: DayInput, k: int) -> dict:
    # what is known at step k: everything measured before it
    known = np.flatnonzero(w.up[:k])
    s = {"has": 0.0, "e_dni": 0.0, "e_dni_h": 0.0, "e_dni_d": 0.0, "e_dhi": 0.0, "e_dhi_h": 0.0,
         "e_dhi_d": 0.0, "std_h": 0.0, "dni": 0.0, "dhi": 0.0, "sin_el": 0.0, "age_h": 0.0,
         "cloud_h": 0.5, "cloud_e": 0.0, "e_temp": 0.0}
    step_s = w.step_min * 60.0
    t_ref = float(w.t[k - 1]) if k > 0 else float(w.t[0]) - step_s
    if len(known):
        last = int(known[-1])
        hour = known[-w.hs:]
        ed = w.dni[known] - w.fc_dni[known]
        eh = w.dhi[known] - w.fc_dhi[known]
        s.update(has=1.0, e_dni=float(ed[-1]), e_dni_h=_mean(ed[-w.hs:]), e_dni_d=_mean(ed),
                 e_dhi=float(eh[-1]), e_dhi_h=_mean(eh[-w.hs:]), e_dhi_d=_mean(eh),
                 std_h=float(np.std(w.dni[hour])), dni=float(w.dni[last]), dhi=float(w.dhi[last]),
                 sin_el=float(w.sin_el[last]), age_h=(t_ref - float(w.t[last])) / 3600.0)
        cm = w.cloud[hour]
        if np.isfinite(cm).any():
            s["cloud_h"] = _mean(cm) / 100.0
            s["cloud_e"] = _mean(cm - w.fc_cloud[hour]) / 100.0
    if k > 0:
        lo = max(0, k - w.hs)
        et = w.temp[lo:k] - w.fc_temp[lo:k]
        if np.isfinite(et).any():
            s["e_temp"] = float(et[np.isfinite(et)][-1])
    s["t_ref"] = t_ref
    return s


def base_features(w: DayInput, s: dict, j: np.ndarray) -> tuple[np.ndarray, dict]:
    # features of the pairs (issue, target j) that do not depend on the fitted fade
    lead_h = (w.t[j] - s["t_ref"]) / 3600.0
    m = len(j)
    one = np.ones(m)
    fc_temp = np.where(np.isfinite(w.fc_temp[j]), w.fc_temp[j], 15.0)
    fc_cloud = np.where(np.isfinite(w.fc_cloud[j]), w.fc_cloud[j], 50.0)
    cols = [
        lead_h, w.sin_el[j], w.hour[j] / 24.0, w.fc_dni[j] / 1000.0, w.fc_dhi[j] / 1000.0, fc_cloud / 100.0,
        fc_temp / 40.0, s["has"] * one, s["e_dni"] / 1000.0 * one, s["e_dni_h"] / 1000.0 * one,
        s["e_dni_d"] / 1000.0 * one, s["e_dhi"] / 1000.0 * one, s["e_dhi_h"] / 1000.0 * one,
        s["e_dhi_d"] / 1000.0 * one, s["std_h"] / 1000.0 * one, s["cloud_h"] * one, s["cloud_e"] * one,
        s["e_temp"] / 10.0 * one, s["age_h"] * one, s["dni"] / 1000.0 * one, s["dhi"] / 1000.0 * one,
        s["sin_el"] * one,
    ]
    aux = {"lead_min": lead_h * 60.0, "e_dni": s["e_dni"] * one, "e_dhi": s["e_dhi"] * one,
           "e_temp": s["e_temp"] * one, "fc_dni": w.fc_dni[j], "fc_dhi": w.fc_dhi[j], "fc_temp": w.fc_temp[j]}
    return np.column_stack(cols), aux


def shifted(aux: dict, tau: dict) -> dict:
    # the service forecast plus the latest error, fading with the lead time
    out = {}
    for v in ("dni", "dhi", "temp"):
        fade = np.exp(-aux["lead_min"] / tau[v])
        x = aux[f"fc_{v}"] + aux[f"e_{v}"] * fade
        out[v] = np.maximum(x, 0.0) if v != "temp" else x
        out[f"fade_{v}"] = fade
    return out


def full_features(x0: np.ndarray, sh: dict) -> np.ndarray:
    return np.column_stack([x0, sh["dni"] / 1000.0, sh["dhi"] / 1000.0, sh["fade_dni"], sh["fade_dhi"]])


def _bucket(lead_min: np.ndarray) -> np.ndarray:
    return np.searchsorted(BUCKETS, lead_min, side="right")


class Forecast:
    # per step from the issue step to the end of the day: quantiles of dni and dhi, the temperature
    def __init__(self, k: int, dni_q: np.ndarray, dhi_q: np.ndarray, temp: np.ndarray, method: str, has: bool):
        self.k = k
        self.dni_q = dni_q
        self.dhi_q = dhi_q
        self.temp = temp
        self.method = method
        # false while nothing of the day's sky is measured yet
        self.has = has


class Nowcast:
    def __init__(self, nets: dict | None, tau: dict, qtab: dict, metrics: dict, used: str, key: str = ""):
        self.nets = nets
        self.tau = tau
        self.qtab = qtab
        self.metrics = metrics
        self.used = used
        self.key = key

    # inference

    def predict(self, w: DayInput, k: int, method: str | None = None) -> Forecast:
        method = method or self.used
        if method == "model" and not self.nets:
            method = "shift"
        n = len(w.t)
        m = n - k
        dni_q = np.zeros((m, len(QS)))
        dhi_q = np.zeros((m, len(QS)))
        s = issue(w, k)
        j_all = np.arange(k, n)
        temp = np.array(w.fc_temp[k:], dtype=float)
        j = j_all[w.up[k:]]
        if len(j):
            x0, aux = base_features(w, s, j)
            sh = shifted(aux, self.tau)
            sel = j - k
            if method == "raw":
                b = _bucket(aux["lead_min"])
                dq = aux["fc_dni"][:, None] + self.qtab["raw_dni"][b]
                hq = aux["fc_dhi"][:, None] + self.qtab["raw_dhi"][b]
            elif method == "shift":
                b = _bucket(aux["lead_min"])
                dq = sh["dni"][:, None] + self.qtab["shift_dni"][b]
                hq = sh["dhi"][:, None] + self.qtab["shift_dhi"][b]
                temp[sel] = sh["temp"]
            else:
                x = full_features(x0, sh)
                dq = sh["dni"][:, None] + self.nets["dni"].predict(x)
                hq = sh["dhi"][:, None] + self.nets["dhi"].predict(x)
                temp[sel] = aux["fc_temp"] + self.nets["temp"].predict(x)[:, 0]
            dni_q[sel] = np.sort(np.maximum(dq, 0.0), axis=1)
            dhi_q[sel] = np.sort(np.maximum(hq, 0.0), axis=1)
        if method != "raw" and m > 0:
            # the temperature error of now fades over the night steps too
            night = ~w.up[k:]
            if night.any():
                lead = (w.t[k:][night] - s["t_ref"]) / 60.0
                temp[night] = w.fc_temp[k:][night] + s["e_temp"] * np.exp(-lead / self.tau["temp"])
        return Forecast(k, dni_q, dhi_q, temp, method, bool(s["has"]))

    # saving

    def save(self, path: str) -> None:
        arrays = {"tau": np.array([self.tau["dni"], self.tau["dhi"], self.tau["temp"]])}
        for k, v in self.qtab.items():
            arrays[f"q_{k}"] = v
        if self.nets:
            for name, net in self.nets.items():
                arrays.update(net.to_arrays(f"{name}_"))
        info = {"metrics": self.metrics, "used": self.used, "key": self.key, "version": VERSION,
                "nets": sorted(self.nets) if self.nets else []}
        arrays["info"] = np.array(json.dumps(info))
        tmp = path + ".tmp.npz"
        np.savez(tmp, **arrays)
        os.replace(tmp, path)

    @classmethod
    def load(cls, path: str, key: str | None = None) -> Nowcast | None:
        if not os.path.isfile(path):
            return None
        try:
            with np.load(path, allow_pickle=False) as z:
                info = json.loads(str(z["info"]))
                if info.get("version") != VERSION or (key is not None and info.get("key") != key):
                    return None
                tau = dict(zip(("dni", "dhi", "temp"), z["tau"].tolist()))
                qtab = {k[2:]: z[k] for k in z.files if k.startswith("q_")}
                nets = {name: MLP.from_arrays(z, f"{name}_") for name in info["nets"]} or None
        except (OSError, ValueError, KeyError):
            return None
        return cls(nets, tau, qtab, info["metrics"], info["used"], info["key"])


# training


def _issues(w: DayInput, rng, n_issues: int, block_steps: list[int]) -> list[int]:
    extra = max(0, n_issues - len(block_steps))
    up = np.flatnonzero(w.up)
    if not len(up):
        return []
    lo, hi = max(1, int(up[0]) - 6), int(up[-1])
    rand = rng.integers(lo, hi + 1, extra).tolist() if hi >= lo else []
    return sorted(set(k for k in block_steps + rand if 0 <= k <= hi))


def _pairs_of_day(w: DayInput, ks: list[int], rng, per_issue: int | None):
    xs, auxs, ys = [], [], []
    n = len(w.t)
    for k in ks:
        j = np.arange(k, n)[w.up[k:]]
        if not len(j):
            continue
        if per_issue is not None and len(j) > per_issue:
            # half from the next 3 hours, half from the rest of the day
            near = j[: 36]
            far = j[36:]
            half = per_issue // 2
            pick = [rng.choice(near, min(half, len(near)), replace=False)]
            if len(far):
                pick.append(rng.choice(far, min(per_issue - half, len(far)), replace=False))
            j = np.sort(np.concatenate(pick))
        s = issue(w, k)
        x0, aux = base_features(w, s, j)
        aux["k"] = np.full(len(j), k)
        aux["j"] = j
        xs.append(x0)
        auxs.append(aux)
        ys.append(np.column_stack([w.dni[j], w.dhi[j], w.temp[j]]))
    return xs, auxs, ys


def _stack(xs, auxs, ys):
    x0 = np.concatenate(xs)
    aux = {k: np.concatenate([a[k] for a in auxs]) for k in auxs[0]}
    y = np.concatenate(ys)
    return x0, aux, y


def block_marks(ds, d: int, block_h: int) -> list[int]:
    # steps of the local day at a clock hour that is a multiple of block_h
    s = ds.day(d)
    hour = ds.a["hour"][s]
    minute = np.round((hour % 1.0) * 60.0)
    marks = np.flatnonzero((minute == 0) & (np.round(hour - hour % 1.0) % block_h == 0))
    out = sorted(set([0] + marks.tolist()))
    return out


def train(ds, cfg: dict, key: str = "", log=print) -> Nowcast:
    nc = cfg["nowcast"]
    rng = np.random.default_rng(int(nc["seed"]))
    t0 = time.time()
    xs, auxs, ys = [], [], []
    for d in ds.train_days():
        w = DayInput.from_dataset(ds, d)
        ks = _issues(w, rng, int(nc["issues_per_day"]), block_marks(ds, d, int(cfg["block_h"])))
        a, b, c = _pairs_of_day(w, ks, rng, int(nc["targets_per_issue"]))
        xs += a
        auxs += b
        ys += c
    if not xs:
        raise ValueError("zu wenige Trainingstage mit Sonne für die Vorhersage")
    x0, aux, y = _stack(xs, auxs, ys)
    ok_t = np.isfinite(y[:, 2]) & np.isfinite(aux["fc_temp"])
    # the fade of the shift baseline, fitted on the training pairs
    tau = {}
    for i, v in enumerate(("dni", "dhi", "temp")):
        best = None
        for t in TAUS:
            pred = aux[f"fc_{v}"] + aux[f"e_{v}"] * np.exp(-aux["lead_min"] / t)
            if v != "temp":
                pred = np.maximum(pred, 0.0)
            ok = ok_t if v == "temp" else np.ones(len(pred), bool)
            e = float(np.mean(np.abs(pred[ok] - y[ok, i]))) if ok.any() else 0.0
            if best is None or e < best[0]:
                best = (e, t)
        tau[v] = best[1]
    sh = shifted(aux, tau)
    b = _bucket(aux["lead_min"])
    qtab = {}
    for v, i in (("dni", 0), ("dhi", 1)):
        for base, pred in (("raw", aux[f"fc_{v}"]), ("shift", sh[v])):
            res = y[:, i] - pred
            tab = np.zeros((len(BUCKETS) + 1, len(QS)))
            for bb in range(len(BUCKETS) + 1):
                m = b == bb
                tab[bb] = np.quantile(res[m], QS) if m.sum() >= 20 else np.quantile(res, QS)
            qtab[f"{base}_{v}"] = tab
    x = full_features(x0, sh)
    nets = {}
    hidden = [int(h) for h in nc["hidden"]]
    fit = {"steps": int(nc["steps"]), "batch": int(nc["batch"]), "lr": float(nc["lr"])}
    seed = int(nc["seed"])
    for v, i in (("dni", 0), ("dhi", 1)):
        net = MLP(x.shape[1], hidden, len(QS), seed=seed + i)
        net.fit(x, y[:, i] - sh[v], loss="pinball", quantiles=QS, seed=seed + i, **fit)
        nets[v] = net
    net = MLP(x.shape[1], hidden, 1, seed=seed + 7)
    if ok_t.sum() > 100:
        net.fit(x[ok_t], (y[ok_t, 2] - aux["fc_temp"][ok_t])[:, None], loss="mse", seed=seed + 7, **fit)
    nets["temp"] = net
    took = time.time() - t0
    cast = Nowcast(nets, tau, qtab, {}, "model", key)
    cast.metrics = measure(ds, cast, cfg)
    cast.metrics["train_pairs"] = int(len(y))
    cast.metrics["train_s"] = round(took, 1)
    cast.metrics["tau_min"] = tau
    tot = cast.metrics["total"]
    cast.used = min(METHODS, key=lambda m: tot[m]["dni"] + tot[m]["dhi"])
    if log:
        log(f"Vorhersage trainiert: {len(y)} Paare in {took:.1f} s, genutzt wird {cast.used}")
    return cast


def measure(ds, cast: Nowcast, cfg: dict) -> dict:
    # mean absolute error on the test days over daylight targets, issues every 30 minutes in daylight
    every = max(1, int(round(30 / ds.step_min)))
    err = {m: {"dni": [], "dhi": [], "temp": []} for m in METHODS}
    lead_err = {m: {L: [] for L in LEADS} for m in METHODS}
    lead_err_h = {m: {L: [] for L in LEADS} for m in METHODS}
    lead_steps = {L: int(round(L / ds.step_min)) for L in LEADS}
    for d in ds.test_days():
        w = DayInput.from_dataset(ds, d)
        up = np.flatnonzero(w.up)
        if len(up) < 2:
            continue
        for k in range(int(up[0]) + 1, int(up[-1]) + 1, every):
            if not w.up[k - 1]:
                continue
            j = np.arange(k, len(w.t))
            mask = w.up[k:]
            truth_d, truth_h, truth_t = w.dni[k:], w.dhi[k:], w.temp[k:]
            for m in METHODS:
                f = cast.predict(w, k, m)
                ed = np.abs(f.dni_q[:, 2] - truth_d)[mask]
                eh = np.abs(f.dhi_q[:, 2] - truth_h)[mask]
                et = np.abs(f.temp - truth_t)[mask]
                err[m]["dni"].append(ed)
                err[m]["dhi"].append(eh)
                err[m]["temp"].append(et[np.isfinite(et)])
                for L, ls in lead_steps.items():
                    i = ls - 1
                    if i < len(j) and mask[i]:
                        lead_err[m][L].append(abs(f.dni_q[i, 2] - truth_d[i]))
                        lead_err_h[m][L].append(abs(f.dhi_q[i, 2] - truth_h[i]))
    def mean(parts):
        v = np.concatenate(parts) if parts and isinstance(parts[0], np.ndarray) else np.array(parts, dtype=float)
        return round(float(v.mean()), 2) if len(v) else None
    total = {m: {v: mean(err[m][v]) for v in ("dni", "dhi", "temp")} for m in METHODS}
    by_lead = {m: [mean(lead_err[m][L]) for L in LEADS] for m in METHODS}
    by_lead_h = {m: [mean(lead_err_h[m][L]) for L in LEADS] for m in METHODS}
    return {"total": total, "by_lead": by_lead, "by_lead_dhi": by_lead_h, "test_days": len(ds.test_days())}


def summary(cast: Nowcast | None) -> dict:
    # the nowcast part of state.model
    if cast is None or not cast.metrics:
        return {"used": cast.used if cast else "raw", "mae_dni": None, "mae_dhi": None, "mae_temp": None,
                "by_lead": None}
    tot = cast.metrics["total"]
    return {
        "used": cast.used,
        "mae_dni": {m: tot[m]["dni"] for m in METHODS},
        "mae_dhi": {m: tot[m]["dhi"] for m in METHODS},
        "mae_temp": {"raw": tot["raw"]["temp"], "model": tot["model"]["temp"]},
        "by_lead": {"lead_min": list(LEADS), **{m: cast.metrics["by_lead"][m] for m in METHODS}},
    }


def table(metrics: dict, used: str) -> str:
    # the nowcast errors as text, mean absolute error on the test days, daylight steps
    tot, lead, lead_h = metrics["total"], metrics["by_lead"], metrics["by_lead_dhi"]
    heads = "".join(f"{f'{L} min':>9}" for L in LEADS)
    lines = [f"nowcast on {metrics['test_days']} test days, mean absolute error, used: {used}",
             f"{'':<7}{'dni total':>10}{heads} | {'dhi total':>10}{heads} | {'temp':>6}"]
    for m in METHODS:
        d = "".join(f"{v:>9.1f}" if v is not None else f"{'':>9}" for v in lead[m])
        h = "".join(f"{v:>9.1f}" if v is not None else f"{'':>9}" for v in lead_h[m])
        t = tot[m]["temp"]
        lines.append(f"{m:<7}{tot[m]['dni']:>10.1f}{d} | {tot[m]['dhi']:>10.1f}{h} | {t:>6.2f}")
    lines.append("dni and dhi in W/m², temp in °C, the lead counts from the last measured step")
    return "\n".join(lines)


def model_key(ds_key: str, cfg: dict) -> str:
    raw = json.dumps({"ds": ds_key, "nowcast": cfg["nowcast"], "block_h": cfg["block_h"], "v": VERSION}, sort_keys=True)
    return hashlib.sha1(raw.encode()).hexdigest()[:16]
