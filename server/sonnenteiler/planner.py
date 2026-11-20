from __future__ import annotations

import math

import numpy as np

from . import money, solver
from .nowcast import QS, DayInput, Forecast, block_marks
from .scene import Geo, Scene, stressed
from .schema import col, rnd, sig, sig_col

PLAN_COLS = ("t", "offset", "pan", "tilt", "p_mw", "ppfd", "dni", "dhi", "temp", "price", "elec_eur", "stress", "why")
# quantile index of the poor, middle and good sky
SKIES = (0, 2, 4)


def _hours(spans, hour) -> np.ndarray:
    # local hours [start, end) as a mask over the steps
    hour = np.asarray(hour, dtype=float)
    out = np.zeros(hour.shape, dtype=bool)
    for a, b in spans or []:
        out |= (hour >= a) & (hour < b)
    return out


def power_hours(recipe: dict, hour) -> np.ndarray:
    return _hours(recipe.get("power_hours"), hour)


def shade_hours(recipe: dict, hour) -> np.ndarray:
    # the farmer wants the crop out of the full sun, power hours win over it
    return _hours(recipe.get("shade_hours"), hour) & ~power_hours(recipe, hour)


class Day:
    # one local day of the dataset, what never changes while it is driven
    def __init__(self, ds, scene: Scene, d: int, block_h: int):
        a, s = ds.a, ds.day(d)
        self.d = d
        self.date = ds.dates[d]
        self.set = ds.set_of(d)
        self.t = a["t"][s]
        self.n = len(self.t)
        self.step_s = ds.step_min * 60.0
        self.start = float(self.t[0])
        self.end = float(self.t[-1]) + self.step_s
        self.off = a["off"][s]
        self.hour = a["hour"][s]
        self.az, self.el, self.rel = a["az"][s], a["el"][s], a["rel"][s]
        self.market = a["price"][s]
        self.fc = {k: a[k][s] for k in ("fc_dni", "fc_dhi", "fc_temp", "fc_cloud")}
        self.truth = {k: a[k][s] for k in ("dni", "dhi", "temp", "cloud")}
        self.geo: Geo = scene.geometry(self.rel, self.el)
        self.marks = block_marks(ds, d, block_h)
        sm = ds.summary
        self.sunrise, self.sunset = sm["sunrise"][d], sm["sunset"][d]
        self.first_up, self.last_up = sm["first_up"][d], sm["last_up"][d]

    def step_at(self, t: float) -> int:
        # index of the step that holds time t, clipped to the day
        return int(np.clip(np.searchsorted(self.t, t, side="right") - 1, 0, self.n - 1))

    def block_of(self, k: int) -> tuple[int, int]:
        b0 = max(m for m in self.marks if m <= k)
        later = [m for m in self.marks if m > k]
        return b0, (later[0] if later else self.n)

    def t_of(self, k: int) -> float:
        return float(self.t[k]) if k < self.n else self.end


class Terms:
    # the money side of a day for a recipe: the electricity price per step
    def __init__(self, day: Day, recipe: dict, default_elec: float):
        if recipe.get("elec_price_eur_mwh") is not None:
            self.price = np.full(day.n, float(recipe["elec_price_eur_mwh"]))
            self.elec_source = "recipe"
        elif np.isfinite(day.market).all():
            self.price = np.asarray(day.market, dtype=float)
            self.elec_source = "market"
        else:
            self.price = np.where(np.isfinite(day.market), day.market, default_elec)
            self.elec_source = "default" if not np.isfinite(day.market).any() else "market"


class Run:
    # a day being driven: the weather as it happens (clouds change it), the steps driven so far
    def __init__(self, day: Day, scene: Scene, zero: int):
        self.day = day
        self.scene = scene
        self.zero = zero
        n = day.n
        self.dni = np.array(day.truth["dni"], dtype=float)
        self.dhi = np.array(day.truth["dhi"], dtype=float)
        self.temp = np.array(day.truth["temp"], dtype=float)
        self.cloud = np.array(day.truth["cloud"], dtype=float)
        self.P, self.Q = scene.outcome(day.geo, self.dni, self.dhi)
        self.k = 0
        self.pick = np.full(n, zero, dtype=int)
        self.why = ["night"] * n
        self.plan_pick = None
        self.plan_why = None
        self.touched = False

    def cloud_over(self, i0: int, i1: int, f_dni: float, f_dhi: float) -> None:
        # only steps not yet driven change
        i0 = max(i0, self.k)
        if i1 <= i0:
            return
        self.dni[i0:i1] *= f_dni
        self.dhi[i0:i1] *= f_dhi
        sl = slice(i0, i1)
        g = self.day.geo
        p, q = self.scene.outcome(g, self.dni[sl], self.dhi[sl], c=g.c[sl], sin_el=g.sin_el[sl])
        self.P[sl], self.Q[sl] = p, q

    def drive(self) -> int:
        # one step with the planned action, the truth decides what it brings
        k = self.k
        if self.plan_pick is not None and self.plan_pick[k] >= 0:
            self.pick[k] = self.plan_pick[k]
            self.why[k] = self.plan_why[k]
        else:
            self.pick[k] = self.zero
            self.why[k] = "sun" if self.day.el[k] > 0 else "night"
        self.k += 1
        return k

    def day_input(self, step_min: int) -> DayInput:
        d = self.day
        return DayInput(d.t, d.el, d.hour, d.fc["fc_dni"], d.fc["fc_dhi"], d.fc["fc_temp"], d.fc["fc_cloud"],
                        self.dni, self.dhi, self.temp, self.cloud, step_min)

    def totals(self, recipe: dict, price, dt_h: float, wm2: float, upto: int | None = None,
               tracking: bool = False, lo: int = 0) -> dict:
        k = self.k if upto is None else upto
        rows = np.arange(lo, k)
        pick = np.full(len(rows), self.zero) if tracking else self.pick[lo:k]
        p, q = self.P[rows, pick], self.Q[rows, pick]
        st = stressed(recipe["max_ppfd"], recipe["tmax_c"], self.temp[lo:k], q)
        return money.totals(p, q, st, price[lo:k], dt_h, wm2)

    def energy_max(self, dt_h: float, upto: int | None = None) -> float:
        k = self.k if upto is None else upto
        return float(self.P[:k].max(axis=1).sum() * dt_h / 1000.0) if k else 0.0


class Core:
    # a plan before it becomes json
    pass


def drive_day(planner, run: Run, recipe: dict, terms: Terms, method: str | None = None, until: int | None = None,
              forecasts: dict | None = None, light_q: float | None = None) -> Core | None:
    # replan at every block mark and drive up to the next one, as the simulation does on an untouched day
    marks = run.day.marks
    n = run.day.n if until is None else min(until, run.day.n)
    core = None
    for i, m in enumerate(marks):
        if m >= n or m < run.k:
            continue
        f = forecasts.get(m) if forecasts else None
        core = planner.solve(run, m, recipe, terms, f=f, method=method, light_q=light_q)
        planner.commit(run, core)
        nxt = marks[i + 1] if i + 1 < len(marks) else run.day.n
        while run.k < min(nxt, n):
            run.drive()
    return core


def at_quantile(a: np.ndarray, q: float) -> np.ndarray:
    # a quantile between the ones of the nowcast, read linearly
    qs = np.asarray(QS)
    q = float(np.clip(q, qs[0], qs[-1]))
    j = int(np.searchsorted(qs, q))
    if qs[min(j, len(qs) - 1)] == q:
        return a[:, min(j, len(qs) - 1)]
    w = (q - qs[j - 1]) / (qs[j] - qs[j - 1])
    return a[:, j - 1] + w * (a[:, j] - a[:, j - 1])


class Planner:
    def __init__(self, ds, scene: Scene, cast, cfg: dict):
        self.ds = ds
        self.scene = scene
        self.cast = cast
        self.cfg = cfg
        self.dt_h = ds.dt_h
        self.wm2 = ds.wm2_per_mw
        self.hold_min = int(cfg["hold_min"] or ds.plan_min)
        self.hold = max(1, int(round(self.hold_min / ds.step_min)))
        self.offsets = ds.offsets
        self.light_q = float(cfg["planner"]["light_quantile"])

    def forecast(self, run: Run, k0: int, method: str | None = None) -> Forecast:
        return self.cast.predict(run.day_input(self.ds.step_min), k0, method)

    def rules(self, recipe: dict, hour, power, ppfd, temp):
        # stress, power hours, shade hours and the actions the rules allow
        st = stressed(recipe["max_ppfd"], recipe["tmax_c"], temp, ppfd)
        ph = power_hours(recipe, hour)
        sh = shade_hours(recipe, hour)
        return st, ph, sh, solver.allowed(power, ppfd, st, ph, sh)

    def solve(self, run: Run, k0: int, recipe: dict, terms: Terms, f: Forecast | None = None,
              method: str | None = None, light_q: float | None = None) -> Core:
        # the duty on a forecast: value = middle forecast of the revenue, light at the light quantile
        day = run.day
        n = day.n
        f = f if f is not None else self.forecast(run, k0, method)
        sl = slice(k0, n)
        g = day.geo
        c, sin_el = g.c[sl], g.sin_el[sl]
        outs = {qi: self.scene.outcome(g, f.dni_q[:, qi], f.dhi_q[:, qi], c=c, sin_el=sin_el) for qi in SKIES}
        p_mid, q_mid = outs[2]
        lq = self.light_q if light_q is None else float(light_q)
        q_light = self.scene.outcome(g, at_quantile(f.dni_q, lq), at_quantile(f.dhi_q, lq), c=c, sin_el=sin_el)[1]
        st, ph, sh, _ = self.rules(recipe, day.hour[sl], p_mid, q_mid, f.temp)
        price = terms.price[sl]
        so_far = run.totals(recipe, terms.price, self.dt_h, self.wm2, upto=k0)
        starts = solver.hold_starts(n, k0, self.hold)
        # on a forecast, equal costs wait for a later block, it knows more by then
        res = solver.solve("duty", p_mid, q_mid, q_light, st, ph, price, starts, recipe["dli_target"] - so_far["dli"],
                           self.dt_h, self.wm2, late=True, shade_hour=sh)
        core = Core()
        core.k0, core.f, core.res, core.outs, core.st, core.ph, core.sh = k0, f, res, outs, st, ph, sh
        core.so_far, core.terms, core.recipe = so_far, terms, recipe
        core.pick = res.picks
        core.why = self._why(run, core, price)
        return core

    def _why(self, run: Run, core: Core, price) -> list:
        day = run.day
        up = day.el[core.k0:] > 0
        pref = (core.outs[2][0] * price[:, None]).argmax(axis=1)
        pick, first = core.pick, core.res.first
        why = np.full(len(pick), "sun", dtype=object)
        why[(price < 0) & (pick == pref) & (pick != run.zero)] = "price"
        why[(first != pref) & (pick == first)] = "stress"
        why[pick != first] = "light"
        why[core.sh] = "shade"
        why[core.ph] = "power_hour"
        why[~up] = "night"
        return why.tolist()

    def commit(self, run: Run, core: Core) -> None:
        # the plan becomes what the run drives from k0 on
        pp = np.full(run.day.n, -1, dtype=int)
        pp[core.k0:] = core.pick
        run.plan_pick = pp
        why = ["night"] * run.day.n
        why[core.k0:] = core.why
        run.plan_why = why

    # numbers of a plan

    def expect(self, run: Run, core: Core) -> dict:
        day, k0, td = run.day, core.k0, money.to_dli(self.dt_h)
        rows = np.arange(day.n - k0)
        price = core.terms.price[k0:]
        eur = money.to_eur(self.dt_h, self.wm2)
        b0, b1 = day.block_of(k0)
        past = run.totals(core.recipe, core.terms.price, self.dt_h, self.wm2, upto=k0, lo=b0)
        p_mid, q_mid = core.outs[2]
        fb = slice(0, max(0, b1 - k0))
        pm, qm = p_mid[rows, core.pick], q_mid[rows, core.pick]
        block = {"energy_wh": past["energy_wh"] + float(pm[fb].sum()) * self.dt_h / 1000.0,
                 "dli": past["dli"] + float(qm[fb].sum()) * td,
                 "elec_eur": past["elec_eur"] + float((pm[fb] * price[fb]).sum()) * eur}
        stress_end = core.so_far["stress_h"] + float(core.st[rows, core.pick].sum()) * self.dt_h
        end = {k: [] for k in ("dli", "energy_wh", "elec_eur")}
        for qi in SKIES:
            p, q = core.outs[qi]
            ps, qs = p[rows, core.pick], q[rows, core.pick]
            end["dli"].append(core.so_far["dli"] + float(qs.sum()) * td)
            end["energy_wh"].append(core.so_far["energy_wh"] + float(ps.sum()) * self.dt_h / 1000.0)
            end["elec_eur"].append(core.so_far["elec_eur"] + float((ps * price).sum()) * eur)
        return {"block": block, "day_end": end, "stress_h": stress_end, "b0": b0, "b1": b1}

    def numbers(self, run: Run, core: Core) -> dict:
        day, k0, td = run.day, core.k0, money.to_dli(self.dt_h)
        rows = np.arange(day.n - k0)
        price = core.terms.price[k0:]
        p_mid, q_mid = core.outs[2]
        first, pick = core.res.first, core.pick
        e_first = float(p_mid[rows, first].sum())
        e_pick = float(p_mid[rows, pick].sum())
        eur = money.to_eur(self.dt_h, self.wm2)
        cost = {
            "elec_eur": float((p_mid[rows, first] * price).sum() - (p_mid[rows, pick] * price).sum()) * eur,
            "energy_share": (e_first - e_pick) / e_first if e_first > 0 else 0.0,
            "dli": float(q_mid[rows, pick].sum() - q_mid[rows, first].sum()) * td,
        }
        ok = solver.allowed(p_mid, q_mid, core.st, core.ph, core.sh)
        most = solver.max_light(q_mid, ok, core.res.starts) * td
        reachable = core.so_far["dli"] + most >= core.recipe["dli_target"] - 1e-9
        has_sun = bool((day.el[k0:] > 0).any())
        return {
            "cost": cost,
            "light_price": solver.light_price(core.res, self.dt_h),
            "reachable": bool(reachable),
            "first_guess": bool(has_sun and not core.f.has),
        }

    # json of interface 3

    def to_json(self, run: Run, core: Core, version: int, made_at: float) -> dict:
        day = run.day
        ex = self.expect(run, core)
        nb = self.numbers(run, core)
        b0, b1 = ex["b0"], ex["b1"]
        cols = self._columns(run, core)
        cut = b1 - b0
        points = {k: cols[k][:cut] for k in PLAN_COLS}
        outlook = {k: cols[k][cut:] for k in PLAN_COLS}
        end = ex["day_end"]
        return {
            "version": int(version),
            "made_at": int(made_at),
            "block": {"from": int(day.t_of(b0)), "to": int(day.t_of(b1))},
            "step_min": int(self.ds.step_min),
            "hold_min": int(self.hold_min),
            "points": points,
            "outlook": outlook,
            "expect": {
                "block": {"energy_wh": rnd(ex["block"]["energy_wh"], 3), "dli": rnd(ex["block"]["dli"], 3),
                          "elec_eur": sig(ex["block"]["elec_eur"])},
                "day_end": {"dli": [rnd(v, 2) for v in end["dli"]],
                            "energy_wh": [rnd(v, 2) for v in end["energy_wh"]],
                            "elec_eur": [sig(v) for v in end["elec_eur"]],
                            "stress_h": rnd(ex["stress_h"], 3)},
            },
            "light_price": sig(nb["light_price"]),
            "cost": {"elec_eur": sig(nb["cost"]["elec_eur"]), "energy_share": rnd(nb["cost"]["energy_share"], 4),
                     "dli": rnd(nb["cost"]["dli"], 3)},
            "reachable": nb["reachable"],
            "first_guess": nb["first_guess"],
        }

    def _columns(self, run: Run, core: Core) -> dict:
        # from the block start: the driven steps before k0, the plan from k0 on
        day, k0 = run.day, core.k0
        b0, _ = day.block_of(k0)
        g = day.geo
        rec = core.recipe
        eur = money.to_eur(self.dt_h, self.wm2)
        price = core.terms.price
        past = np.arange(b0, k0)
        fut = np.arange(k0, day.n)
        rows_f = np.arange(len(fut))
        pk_p = run.pick[b0:k0]
        pk_f = core.pick
        p_mid, q_mid = core.outs[2]
        pick = np.concatenate([pk_p, pk_f])
        idx = np.concatenate([past, fut])
        p = np.concatenate([run.P[past, pk_p], p_mid[rows_f, pk_f]])
        q = np.concatenate([run.Q[past, pk_p], q_mid[rows_f, pk_f]])
        dni = np.concatenate([run.dni[past], core.f.dni_q[:, 2]])
        dhi = np.concatenate([run.dhi[past], core.f.dhi_q[:, 2]])
        temp = np.concatenate([run.temp[past], core.f.temp])
        st = np.concatenate([stressed(rec["max_ppfd"], rec["tmax_c"], run.temp[past], run.Q[past, pk_p]),
                             core.st[rows_f, pk_f]])
        night = day.el[idx] <= 0
        offset = np.where(night, 0.0, self.offsets[pick])
        return {
            "t": [int(x) for x in day.t[idx]],
            "offset": col(offset, 1),
            "pan": col(g.pan[idx, pick], 2),
            "tilt": col(g.tilt[idx, pick], 2),
            "p_mw": col(p, 1),
            "ppfd": col(q, 1),
            "dni": col(dni, 1),
            "dhi": col(dhi, 1),
            "temp": col(temp, 1),
            "price": col(price[idx], 2),
            "elec_eur": sig_col(p * price[idx] * eur, 4),
            "stress": [int(x) for x in st],
            "why": list(run.why[b0:k0]) + list(core.why),
        }

    # the day with the weather as it happened

    def hindsight(self, run: Run, recipe: dict, terms: Terms, kind: str = "best", target: float | None = None):
        # best: the rules with everything known in advance. blind: the light target with the most energy
        day = run.day
        st, ph, sh, _ = self.rules(recipe, day.hour, run.P, run.Q, run.temp)
        starts = solver.hold_starts(day.n, 0, self.hold)
        need = recipe["dli_target"] if target is None else target

        def plan(how: str):
            return solver.solve(how, run.P, run.Q, run.Q, st, ph, terms.price, starts, need, self.dt_h, self.wm2,
                                shade_hour=sh).picks

        if kind != "best":
            return plan("blind")
        duty = plan("duty")
        if math.isinf(need):
            return duty
        # the last purchase may overshoot the target by a whole hold block, the plan with the most energy can
        # end closer to it. of the two the one with more revenue is taken when it gives the light as well
        rows = np.arange(day.n)
        other = plan("blind")
        light = [float(run.Q[rows, p].sum()) for p in (duty, other)]
        rev = [float((run.P[rows, p] * terms.price).sum()) for p in (duty, other)]
        if light[1] >= min(need / money.to_dli(self.dt_h), light[0]) - 1e-9 and rev[1] > rev[0]:
            return other
        return duty

    def dli_max(self, run: Run, recipe: dict, terms: Terms) -> float:
        # the most light the rules allow on the day with the true weather, mol/m²: the duty plan that buys
        # all the light there is
        day = run.day
        picks = self.hindsight(run, recipe, terms, target=math.inf)
        return float(run.Q[np.arange(day.n), picks].sum()) * money.to_dli(self.dt_h)

    def figures(self, run: Run, recipe: dict, terms: Terms, picks=None, tracking: bool = False,
                dli_max: float | None = None) -> dict:
        # the whole day for given actions, the keys of a day balance plus light_met
        day = run.day
        rows = np.arange(day.n)
        pk = np.full(day.n, run.zero) if tracking else (run.pick if picks is None else picks)
        p, q = run.P[rows, pk], run.Q[rows, pk]
        st = stressed(recipe["max_ppfd"], recipe["tmax_c"], run.temp, q)
        b = money.balance(recipe, money.totals(p, q, st, terms.price, self.dt_h, self.wm2),
                          run.energy_max(self.dt_h, day.n))
        dm = self.dli_max(run, recipe, terms) if dli_max is None else dli_max
        b["light_met"] = money.light_met(b["dli"], recipe["dli_target"], dm)
        return b

    def best_block(self, run: Run, b0: int, b1: int, recipe: dict, terms: Terms, lp: float) -> np.ndarray:
        # per hold block the allowed action with the most revenue + light_price * light, true weather
        sl = slice(b0, b1)
        _, _, _, ok = self.rules(recipe, run.day.hour[sl], run.P[sl], run.Q[sl], run.temp[sl])
        val = run.P[sl] * terms.price[sl, None] * money.to_eur(self.dt_h, self.wm2) + lp * run.Q[sl] * money.to_dli(self.dt_h)
        starts = solver.hold_starts(run.day.n, b0, self.hold)
        starts = starts[starts < b1 - b0]
        picks = np.where(ok, val, -np.inf).argmax(axis=1)
        ends = np.append(starts[1:], b1 - b0)
        for a, b in zip(starts, ends):
            every = ok[a:b].all(axis=0)
            if every.any():
                tot = np.where(every, val[a:b].sum(axis=0), -np.inf)
                picks[a:b] = int(np.argmax(tot))
        return picks
