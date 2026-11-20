from __future__ import annotations

import threading
import time
from collections import deque

import numpy as np

from . import money, nowcast
from .evaluate import blind_of
from .link import Link
from .planner import SKIES
from .scene import LEAF_WARMING, incidence_deg, stressed
from .schema import Problem, clean, col, de, hhmm, number, rnd, sig

# the simulation wakes up this long before sunrise and sleeps this long after sunset
WAKE_S = 30 * 60.0
MAX_STEPS_PER_TICK = 2000


class Runner:
    # the service core: clock, days, plans, look back, the state of the page

    def __init__(self, ctx, recipe: dict | None = None, speed: float | None = None,
                 start: str | None = None, evaluation: dict | None = None, scene_check: dict | None = None,
                 echo=None, link: Link | None = None):
        self.ctx = ctx
        self.ds = ctx.ds
        self.cfg = ctx.cfg
        self.planner = ctx.planner
        self.lock = threading.RLock()
        self.mode = "sim"
        sim = self.cfg["sim"]
        self.speed = float(speed if speed is not None else sim["speed"])
        self.paused = False
        self.skip_night = bool(sim["skip_night"])
        self.order = self.ds.test_days() if sim["days"] == "test" else list(range(self.ds.n_days))
        if not self.order:
            self.order = list(range(self.ds.n_days))
        self.log: deque = deque(maxlen=30)
        self.days: deque = deque(maxlen=14)
        self.echo = echo
        self.link = link or Link()
        # the state carries the keys of the contract only
        self.eval = {k: evaluation[k] for k in ("days", "light_quantile", "rows")} if evaluation else None
        self.scene_check = {k: scene_check[k] for k in ("rows", "max_err_p_mw", "max_err_ppfd")} \
            if scene_check else None
        self.version = 0
        self.days_closed = 0
        self.replay = None
        self.recipe = recipe if recipe is not None else ctx.default_recipe()
        self.plan = None
        self.core = None
        self._fc_cache = None
        self._day_cache = {}
        d0 = self._start_day(start or sim.get("start"))
        self._open_day(d0)
        self._say(f"Start der Simulation am {self.run.day.date}, Rezept {self.recipe['name']}, "
                  f"Lichtziel {de(self.recipe['dli_target'], 1)} mol")
        self._boundary()

    # log

    def _say(self, text: str, t: float | None = None) -> None:
        t = self.now if t is None else t
        self.log.append({"t": int(t), "text": text})
        if self.echo is not None:
            day = self.run.day
            self.echo(f"{day.date} {hhmm(t, day.off[0])}  {text}")

    def _hm(self, t: float) -> str:
        day = self.run.day
        return hhmm(t, day.off[day.step_at(t)])

    # days

    def _start_day(self, start: str | None) -> int:
        if start:
            d = self.ds.day_index(start)
            if d is None:
                raise Problem(f"den Tag {start} gibt es im Datensatz nicht")
            return d
        june = [d for d in self.order if self.ds.dates[d][5:7] == "06"]
        return june[0] if june else self.order[0]

    def _open_day(self, d: int) -> None:
        self.run = self.ctx.run(d)
        self.terms = self.ctx.terms(self.run.day, self.recipe)
        self.now = self.run.day.start
        self.plan = None
        self.core = None
        self.block = None
        self.replay = None
        self._fc_cache = None
        self._day_cache = {}

    def _next_day(self, d: int) -> int:
        later = [x for x in self.order if x > d]
        return later[0] if later else self.order[0]

    def _close_day(self) -> None:
        run, day = self.run, self.run.day
        self._finish_block()
        r, terms, pl = self.recipe, self.terms, self.planner
        dm = pl.dli_max(run, r, terms)
        ours = pl.figures(run, r, terms, dli_max=dm)
        track = pl.figures(run, r, terms, tracking=True, dli_max=dm)
        blind = blind_of(self.ctx, run, r, terms, dm, untouched=not run.touched)
        best = pl.figures(run, r, terms, pl.hindsight(run, r, terms), dli_max=dm)
        ref = None
        if not run.touched and self.ctx.dataset_recipe(r) is not None:
            got = self.ds.reference(day.date, r["name"])
            if got:
                keep = ("elec_eur", "energy_wh", "dli", "stress_h")
                ref = {s: ({k: rnd(got[s][k], 6) for k in keep} if got.get(s) else None) for s in ("tracking", "oracle")}
        cost, gain = track["elec_eur"] - ours["elec_eur"], ours["elec_eur"] - blind["elec_eur"]
        self.days.append({"date": day.date, "set": day.set, "touched": bool(run.touched), "recipe": r["name"],
                          "sonnenteiler": money.rounded(ours), "tracking": money.rounded(track),
                          "blind": money.rounded(blind), "best": money.rounded(best),
                          "plant_cost_eur": sig(cost), "price_gain_eur": sig(gain), "reference": ref})
        self.days_closed += 1
        duty = ("Pflicht erfüllt" if ours["light_met"] >= money.MET
                else f"Pflicht zu {de(100 * ours['light_met'], 0)} % erfüllt")
        text = (f"Tag {day.date} abgeschlossen: Erlös {de(ours['elec_eur'] * 1e4, 0)} €/ha, Nachführen "
                f"{de(track['elec_eur'] * 1e4, 0)} €/ha, das Licht der Pflanze kostete {de(cost * 1e4, 0)} €/ha, "
                f"der Blick auf den Preis brachte {de(gain * 1e4, 0)} €/ha gegenüber Pflanze zuerst ohne Preisblick, "
                f"bestmöglich {de(best['elec_eur'] * 1e4, 0)} €/ha, Licht {de(ours['dli'], 1)} mol von "
                f"{de(r['dli_target'], 0)} mol, {duty}")
        if run.touched:
            text += ", der Tag hatte Wolken von Hand"
        self._say(text, day.end)
        self._open_day(self._next_day(day.d))
        self._boundary()

    # the step boundary

    def _next_t(self) -> float:
        run = self.run
        return float(run.day.t[run.k]) if run.k < run.day.n else run.day.end

    def _boundary(self) -> None:
        # at the start of step k: maybe close the day, maybe replan, then drive step k
        run = self.run
        k = run.k
        if k >= run.day.n:
            self._close_day()
            return
        if k in run.day.marks or self.plan is None:
            if k in run.day.marks and k > 0:
                self._finish_block()
            self._replan("Neuer Tag" if k == 0 else None)
        run.drive()
        self._fc_cache = None

    def _wake(self) -> tuple[float, float]:
        day = self.run.day
        if day.first_up < 0:
            return day.start, day.end
        return max(day.start, day.sunrise - WAKE_S), min(day.end, day.sunset + WAKE_S)

    def _skip(self) -> bool:
        # the night passes without real time, the steps are still driven and counted
        moved = False
        for _ in range(4):
            ws, we = self._wake()
            if self.now >= we:
                closed = self.days_closed
                while self.days_closed == closed:
                    self.now = self._next_t()
                    self._boundary()
                moved = True
                continue
            if self.now < ws:
                while self._next_t() <= ws:
                    self.now = self._next_t()
                    self._boundary()
                self.now = ws
                moved = True
            break
        return moved

    def _advance(self, budget: float, limit: int = MAX_STEPS_PER_TICK) -> None:
        n = 0
        while n < limit:
            if self.skip_night and self._skip():
                pass
            nb = self._next_t()
            if nb - self.now > budget:
                self.now += budget
                return
            budget -= max(0.0, nb - self.now)
            self.now = nb
            self._boundary()
            n += 1

    def tick(self, real_dt: float) -> None:
        with self.lock:
            if self.paused:
                return
            self._advance(max(0.0, real_dt) * self.speed)

    def run_days(self, n: int) -> None:
        # as fast as possible, for the command line and the tests
        with self.lock:
            goal = self.days_closed + n
            while self.days_closed < goal:
                self.now = self._next_t()
                self._boundary()

    def run_forever(self, stop: threading.Event) -> None:
        hz = float(self.cfg["sim"]["tick_hz"])
        last = time.monotonic()
        while not stop.wait(1.0 / hz):
            now = time.monotonic()
            dt, last = now - last, now
            try:
                self.tick(dt)
            except Exception as e:  # keep the clock alive, say what went wrong
                self._say(f"Fehler im Takt: {e}")
                time.sleep(1.0)

    # plans

    def _replan(self, why: str | None = None) -> None:
        run = self.run
        k0 = run.k
        core = self.planner.solve(run, k0, self.recipe, self.terms)
        self.planner.commit(run, core)
        self.version += 1
        self.core = core
        self.plan = self.planner.to_json(run, core, self.version, self.now)
        b = self.plan["block"]
        self.block = (run.day.block_of(k0), self.plan["expect"]["block"], self.plan["light_price"], core)
        day = run.day
        b0, b1 = day.block_of(k0)
        if not (day.el[b0:b1] > 0).any() and why is None:
            return
        e = self.plan["expect"]
        end = e["day_end"]
        text = (f"Neuer Plan für {self._hm(b['from'])} bis {self._hm(b['to'])}: "
                f"im Block {de(e['block']['energy_wh'], 1)} Wh und {de(e['block']['dli'], 1)} mol, "
                f"zum Tagesende {de(end['dli'][1], 1)} mol von {de(self.recipe['dli_target'], 0)} mol "
                f"und {de(end['elec_eur'][1] * 1e4, 0)} €/ha Erlös")
        lp = self.plan["light_price"] or 0.0
        if lp > 0:
            text += f", für das Licht bis {de(lp * 1e4, 2)} €/ha je mol Erlös hergegeben"
        neg = int(np.sum((self.terms.price[k0:] < 0) & (day.el[k0:] > 0)))
        if neg:
            text += f", {de(neg * self.ds.dt_h, 1)} h mit negativem Strompreis"
        if self.plan["first_guess"]:
            text += ", erste Schätzung, der Himmel ist heute noch nicht gemessen"
        if not self.plan["reachable"]:
            text += ", das Lichtziel ist heute nicht mehr erreichbar, die Pflanze geht den ganzen Tag vor"
        if why:
            text = f"{why}. {text}"
        self._say(text)

    def _finish_block(self) -> None:
        # look back at the block that just ended: driven, expected, best with the true weather
        if self.block is None:
            return
        (b0, b1), expected, lp, core = self.block
        self.block = None
        run, day = self.run, self.run.day
        b1 = min(b1, run.k)
        # a block with less than half an hour of sun says nothing
        if b1 <= b0 or (day.el[b0:b1] > 0).sum() * self.ds.dt_h < 0.5:
            return
        lp = lp or 0.0
        r, terms = self.recipe, self.terms
        dt, wm2 = self.ds.dt_h, self.ds.wm2_per_mw
        driven = run.totals(r, terms.price, dt, wm2, upto=b1, lo=b0)
        picks = self.planner.best_block(run, b0, b1, r, terms, lp)
        rows = np.arange(b0, b1)
        p, q = run.P[rows, picks], run.Q[rows, picks]
        st = stressed(r["max_ppfd"], r["tmax_c"], run.temp[b0:b1], q)
        best = money.totals(p, q, st, terms.price[b0:b1], dt, wm2)

        def part(t: dict) -> dict:
            return {"energy_wh": rnd(t["energy_wh"], 3), "dli": rnd(t["dli"], 3), "elec_eur": sig(t["elec_eur"]),
                    "value_eur": sig(t["elec_eur"] + lp * t["dli"])}

        dv = driven["elec_eur"] + lp * driven["dli"]
        bv = best["elec_eur"] + lp * best["dli"]
        # best value over driven value minus 1, measured against the size of the driven value
        gain = max(0.0, (bv - dv) / abs(dv)) if abs(dv) > 1e-12 else 0.0
        lo = max(b0, core.k0)
        up = day.el[lo:b1] > 0
        err = {"dni": None, "dhi": None}
        if up.any():
            i = np.arange(lo - core.k0, b1 - core.k0)[up]
            err = {"dni": rnd(np.mean(np.abs(core.f.dni_q[i, 2] - run.dni[lo:b1][up])), 1),
                   "dhi": rnd(np.mean(np.abs(core.f.dhi_q[i, 2] - run.dhi[lo:b1][up])), 1)}
        exp = dict(expected)
        exp["value_eur"] = sig((expected["elec_eur"] or 0.0) + lp * (expected["dli"] or 0.0))
        self.replay = {
            "block": {"from": int(day.t_of(b0)), "to": int(day.t_of(b1))},
            "driven": part(driven),
            "expected": exp,
            "best": part(best),
            "gain_share": round(gain, 4),
            "light_price": sig(lp),
            "forecast_err": err,
            "best_path": {"t": [int(x) for x in day.t[b0:b1]],
                          "offset": col(np.where(day.el[b0:b1] > 0, self.ds.offsets[picks], 0.0), 1)},
        }
        text = (f"Rückblick {self._hm(day.t_of(b0))} bis {self._hm(day.t_of(b1))}: gefahren {de(driven['energy_wh'], 1)} Wh "
                f"und {de(driven['dli'], 1)} mol, erwartet {de(expected['energy_wh'] or 0.0, 1)} Wh und "
                f"{de(expected['dli'] or 0.0, 1)} mol, ")
        text += ("im Nachhinein war kaum mehr möglich" if gain < 0.005
                 else f"im Nachhinein wären {de(100 * gain, 1)} % mehr Wert möglich gewesen")
        if err["dni"] is not None:
            text += f", Vorhersagefehler Direktlicht {de(err['dni'], 0)} W/m²"
        self._say(text, day.t_of(b1))

    # balances

    def _balance(self, tracking: bool, upto: int | None = None) -> dict:
        run = self.run
        k = run.k if upto is None else upto
        t = run.totals(self.recipe, self.terms.price, self.ds.dt_h, self.ds.wm2_per_mw, upto=k, tracking=tracking)
        return money.balance(self.recipe, t, run.energy_max(self.ds.dt_h, k))

    # actions from the api

    def set_recipe(self, body, chatbot: str | None = None) -> dict:
        with self.lock:
            r, report = self.ctx.intake(body, self.run.day.d)
            self.recipe = r
            self.terms = self.ctx.terms(self.run.day, r)
            if chatbot is None:
                text = f"Neues Rezept {r['name']}: {r['crop']}, Lichtziel {de(r['dli_target'], 1)} mol"
                if r["shade_hours"]:
                    text += f", Schatten {spans_de(r['shade_hours'])}"
                if r["power_hours"]:
                    text += f", Strom zuerst {spans_de(r['power_hours'])}"
                self._say(text)
            else:
                names = body.get("names") if isinstance(body, dict) else None
                plant = names.get("de") if isinstance(names, dict) and names.get("de") else r["crop"]
                text = f"Rezept vom Chatbot übernommen: {plant}, Lichtziel {de(r['dli_target'], 1)} mol"
                if r["shade_hours"]:
                    text += f", Schatten {spans_de(r['shade_hours'])}"
                if r["power_hours"]:
                    text += f", Strom zuerst {spans_de(r['power_hours'])}"
                where = "über das Feld auf dieser Seite" if chatbot == "ask" else "über den Pflanzen Tab des Nachführers"
                self._say(f"{text}, {where}")
            self._replan_now("Rezept vom Chatbot" if chatbot else "Rezept geändert")
            return {"ok": True, "recipe": r, "report": report, "plan": self.plan}

    def take_recipe(self, recipe: dict, via: str) -> dict:
        # a recipe of the chatbot, through the same intake as POST /api/recipe
        with self.lock:
            got = self.set_recipe(recipe, chatbot=via)
            self.link.taken(recipe, via)
            got["chatbot"] = recipe
            return got

    def _replan_now(self, why: str) -> None:
        if self.run.k < self.run.day.n:
            self._replan(why)
        self._fc_cache = None

    def whatif(self, body) -> dict:
        with self.lock:
            run = self.run
            r, report = self.ctx.intake(body, run.day.d)
            terms = self.ctx.terms(run.day, r)
            core = self.planner.solve(run, run.k, r, terms)
            js = self.planner.to_json(run, core, self.version, self.now)
            return {"ok": True, "recipe": r, "report": report, "expect": js["expect"], "cost": js["cost"],
                    "light_price": js["light_price"], "reachable": js["reachable"], "first_guess": js["first_guess"]}

    def cloud(self, body) -> dict:
        with self.lock:
            c = self.cfg["cloud"]
            body = body if isinstance(body, dict) else {}
            minutes = number(body.get("minutes", c["minutes"]), "minutes", 1, 24 * 60)
            factor = number(body.get("factor", c["factor"]), "factor", 0, 1)
            run, day = self.run, self.run.day
            t1 = self.now + minutes * 60.0
            i0 = run.k
            i1 = int(np.searchsorted(day.t, t1, side="left"))
            run.cloud_over(i0, i1, factor, float(c["dhi_factor"]))
            run.touched = True
            self._fc_cache = None
            self._say(f"Wolke für {minutes:.0f} min bis {self._hm(min(t1, day.end - 1))}: Direktlicht mal "
                      f"{de(factor, 2)}, diffuses Licht mal {de(float(c['dhi_factor']), 2)}, "
                      f"der Tag zählt nicht mehr zum Vergleich mit days.csv")
            return {"ok": True, "from": int(self.now), "to": int(min(t1, day.end)), "factor": factor}

    def set_speed(self, body) -> dict:
        with self.lock:
            body = body if isinstance(body, dict) else {}
            speed, paused = body.get("speed"), body.get("paused")
            if speed is None and paused is None:
                raise Problem("speed oder paused fehlt")
            if speed is not None:
                self.speed = number(speed, "speed", 0.1, 100000)
            if paused is not None:
                if not isinstance(paused, bool):
                    raise Problem("paused muss true oder false sein")
                self.paused = paused
            return {"ok": True, "speed": self.speed, "paused": self.paused}

    def reset_day(self) -> dict:
        with self.lock:
            self._open_day(self.run.day.d)
            self._say(f"Tag {self.run.day.date} beginnt von vorne")
            self._boundary()
            return {"ok": True, "now": int(self.now)}

    def jump(self, body) -> dict:
        with self.lock:
            date_s = body.get("date") if isinstance(body, dict) else None
            if not isinstance(date_s, str):
                raise Problem("date fehlt, zum Beispiel {\"date\": \"2025-06-01\"}")
            d = self.ds.day_index(date_s.strip())
            if d is None:
                raise Problem(f"den Tag {date_s} gibt es im Datensatz nicht, er reicht von "
                              f"{self.ds.dates[0]} bis {self.ds.dates[-1]}")
            self._open_day(d)
            self._say(f"Sprung zum Tag {self.run.day.date}")
            self._boundary()
            return {"ok": True, "date": self.run.day.date, "now": int(self.now)}

    def summary(self) -> dict:
        # the plan in short for the answers of POST /recipe and GET /recipe of the chatbot
        with self.lock:
            day, plan = self.run.day, self.plan
            i = day.step_at(self.now)
            off = float(day.off[i])
            ours, track = self._balance(False), self._balance(True)
            end = plan["expect"]["day_end"]
            rest = plan["cost"]["elec_eur"] or 0.0
            cost = track["elec_eur"] - ours["elec_eur"] + rest
            base = (end["elec_eur"][1] or 0.0) + cost
            cols = {k: plan["points"][k] + plan["outlook"][k] for k in ("t", "offset", "why", "price")}
            hour0 = (int(self.now + off) // 3600) * 3600
            hours = {}
            for t, o, w, p in zip(cols["t"], cols["offset"], cols["why"], cols["price"]):
                h = (int(t + off) // 3600) * 3600
                if w == "night" or h < hour0:
                    continue
                hours.setdefault(h, []).append((o, w, p))
            out = []
            for h in sorted(hours):
                steps = hours[h]
                offsets = [o for o, _, _ in steps if o is not None]
                whys = [w for _, w, _ in steps]
                prices = [p for _, _, p in steps if p is not None]
                out.append({"from": _clock(h), "to": _clock(h + 3600, end=True),
                            "offset": int(round(max(set(offsets), key=offsets.count))) if offsets else 0,
                            "why": max(set(whys), key=whys.count),
                            "price": round(sum(prices) / len(prices), 2) if prices else None})
            b = plan["block"]
            return {
                "date": day.date,
                "now": hhmm(self.now, off),
                "reachable": bool(plan["reachable"]),
                "light": {"dli": rnd(ours["dli"], 2), "dli_target": rnd(self.recipe["dli_target"], 2),
                          "dli_end": end["dli"]},
                "revenue": {"elec_end_eur_ha": [rnd((v or 0.0) * 1e4, 1) for v in end["elec_eur"]],
                            "plant_cost_eur_ha": rnd(cost * 1e4, 1),
                            "plant_cost_share": rnd(cost / base, 4) if base > 1e-12 else None},
                "hours": out,
                "block": {"from": _clock(int(b["from"] + off)), "to": _clock(int(b["to"] + off), end=True)},
            }

    def measure(self, body) -> dict:
        raise Problem("Messwerte nimmt nur der Live Betrieb an, der Dienst läuft als Simulation")

    def feed(self, body) -> dict:
        raise Problem("Vorhersage und Preise nimmt nur der Live Betrieb an, der Dienst läuft als Simulation")

    def day_list(self) -> list:
        ds, sm = self.ds, self.ds.summary
        ref_ok = self.ctx.dataset_recipe(self.recipe) is not None
        out = []
        for d, date_s in enumerate(ds.dates):
            ref = ds.reference(date_s, self.recipe["name"]) if ref_ok else None
            out.append({
                "date": date_s, "set": ds.set_of(d), "index": d,
                "dni_mean": rnd(sm["dni_mean"][d], 1), "temp_max": rnd(sm["temp_max"][d], 1),
                "price_min": rnd(sm["price_min"][d], 2), "price_max": rnd(sm["price_max"][d], 2),
                "neg_price_h": rnd(sm["neg_price_h"][d], 2),
                "tracking_eur": sig(ref["tracking"]["elec_eur"]) if ref and "tracking" in ref else None,
                "blind_eur": sig(ref["oracle"]["elec_eur"]) if ref and "oracle" in ref else None,
            })
        return out

    # state

    def state(self) -> dict:
        with self.lock:
            return self._state()

    def _state(self) -> dict:
        ds, run, day = self.ds, self.run, self.run.day
        now = self.now
        i = max(0, min(run.k - 1, day.n - 1))
        sun = self._sun(now)
        up = bool(sun["up"])
        pick = int(run.pick[i])
        g = day.geo
        c = float(g.c[i, pick])
        p, q = float(run.P[i, pick]), float(run.Q[i, pick])
        temp = float(run.temp[i])
        price = float(self.terms.price[i])
        r = self.recipe
        hot = bool(stressed(r["max_ppfd"], r["tmax_c"], temp, q))
        if up:
            pose = {"pan": rnd(g.pan[i, pick], 2), "tilt": rnd(g.tilt[i, pick], 2),
                    "offset": rnd(ds.offsets[pick], 1), "incidence": rnd(incidence_deg(c), 2), "why": run.why[i]}
        else:
            pose = {"pan": rnd(self.ctx.scene.park[0], 2), "tilt": rnd(self.ctx.scene.park[1], 2), "offset": 0.0,
                    "incidence": None, "why": "night"}
        scene = self.ctx.scene
        meas = {
            "p_mw": rnd(p, 1), "power_wm2": rnd(p * ds.wm2_per_mw, 2), "ppfd": rnd(q, 1),
            "open_ppfd": rnd(scene.open_ppfd(g.sin_el[i], run.dni[i], run.dhi[i]), 1),
            "panel_lux": rnd(scene.panel_lux(p), 0), "plant_lux": rnd(scene.plant_lux(q), 0),
            "dni": rnd(run.dni[i], 1), "dhi": rnd(run.dhi[i], 1), "temp": rnd(temp, 1),
            "leaf_temp": rnd(temp + LEAF_WARMING * q, 1), "price": rnd(price, 2), "stress": hot,
            "shade": rnd(scene.shade(g.sin_el[i], c), 3) if up else 0.0,
        }
        ours = self._balance(False)
        track = self._balance(True)
        plan = self.plan
        end = plan["expect"]["day_end"] if plan else None
        account = {
            "dli": rnd(ours["dli"], 3), "dli_target": rnd(r["dli_target"], 2),
            "dli_share": rnd(ours["dli"] / r["dli_target"], 4),
            "dli_end": end["dli"] if end else [rnd(ours["dli"], 2)] * 3,
            "reachable": bool(plan["reachable"]) if plan else True,
            "energy_wh": rnd(ours["energy_wh"], 3), "stress_h": rnd(ours["stress_h"], 3),
            "elec_eur": sig(ours["elec_eur"]),
            "end": {"elec_eur": end["elec_eur"] if end else [sig(ours["elec_eur"])] * 3},
        }
        st = {
            "now": int(now), "speed": self.speed, "paused": self.paused, "mode": self.mode,
            "site": {"name": self.ctx.site_name(), "lat": ds.scene["lat"], "lon": ds.scene["lon"],
                     "heading": ds.scene["heading"], "utc_offset_h": rnd(day.off[i] / 3600.0, 2)},
            "scene": {"gcr": scene.gcr, "panel_w_mm": scene.panel_w_mm, "panel_h_mm": scene.panel_h_mm,
                      "panel_eff": scene.panel_eff, "pan_limits": scene.pan_limits, "tilt_limits": scene.tilt_limits,
                      "park": scene.park, "wm2_per_mw": round(ds.wm2_per_mw, 6), "offsets": col(ds.offsets, 2)},
            "block_h": int(self.cfg["block_h"]), "step_min": int(ds.step_min), "hold_min": int(self.planner.hold_min),
            "day": {"date": day.date, "index": int(day.d), "set": day.set, "sunrise": int(day.sunrise),
                    "sunset": int(day.sunset), "start": int(day.start), "end": int(day.end),
                    "touched": bool(run.touched)},
            "sun": sun,
            "pose": pose,
            "meas": meas,
            "recipe": r,
            "account": account,
            "plan": plan,
            "path_today": self._path_today(),
            "sunpath": self._cached("sunpath", self._sunpath),
            "day_prices": self._cached("day_prices", self._day_prices),
            "forecast": self._forecast(up),
            "service": self._cached("service", self._service),
            "replay": self.replay,
            "balance": {"sonnenteiler": money.rounded(ours), "tracking": money.rounded(track),
                        "plant_cost_eur": sig(track["elec_eur"] - ours["elec_eur"])},
            "days": list(self.days),
            "model": self._model(),
            "eval": self.eval,
            "chatbot": self.link.status(),
            "log": list(self.log),
        }
        return clean(st)

    def _cached(self, name: str, fn):
        key = (name, self.terms.elec_source)
        if key not in self._day_cache:
            self._day_cache[key] = fn()
        return self._day_cache[key]

    def _sun(self, now: float) -> dict:
        day = self.run.day
        i = day.step_at(now)
        j = min(i + 1, day.n - 1)
        span = float(day.t[j] - day.t[i]) or 1.0
        w = float(np.clip((now - day.t[i]) / span, 0.0, 1.0))
        el = float(day.el[i] + (day.el[j] - day.el[i]) * w)
        d_az = (float(day.az[j] - day.az[i]) + 180.0) % 360.0 - 180.0
        d_rel = (float(day.rel[j] - day.rel[i]) + 180.0) % 360.0 - 180.0
        az = (float(day.az[i]) + d_az * w) % 360.0
        rel = (float(day.rel[i]) + d_rel * w + 180.0) % 360.0 - 180.0
        return {"az": round(az, 2), "el": round(el, 2), "az_rel": round(rel, 2), "up": el > 0}

    def _path_today(self) -> dict:
        run, day = self.run, self.run.day
        k = run.k
        rows = np.arange(k)
        pick = run.pick[:k]
        p, q = run.P[rows, pick], run.Q[rows, pick]
        r = self.recipe
        night = day.el[:k] <= 0
        return {
            "t": [int(x) for x in day.t[:k]],
            "offset": col(np.where(night, 0.0, self.ds.offsets[pick]), 1),
            "pan": col(day.geo.pan[rows, pick], 2), "tilt": col(day.geo.tilt[rows, pick], 2),
            "p_mw": col(p, 1), "ppfd": col(q, 1), "dni": col(run.dni[:k], 1), "dhi": col(run.dhi[:k], 1),
            "temp": col(run.temp[:k], 1), "price": col(self.terms.price[:k], 2),
            "stress": [int(x) for x in stressed(r["max_ppfd"], r["tmax_c"], run.temp[:k], q)],
            "why": list(run.why[:k]),
        }

    def _sunpath(self) -> dict:
        day = self.run.day
        up = day.el > 0
        return {"t": [int(x) for x in day.t[up]], "az": col(day.az[up], 2), "el": col(day.el[up], 2),
                "az_rel": col(day.rel[up], 2)}

    def _day_prices(self) -> dict:
        day = self.run.day
        return {"t": [int(x) for x in day.t], "price": col(self.terms.price, 2)}

    def _service(self) -> dict:
        day = self.run.day
        up = day.el > 0
        return {"t": [int(x) for x in day.t[up]], "dni": col(day.fc["fc_dni"][up], 1),
                "dhi": col(day.fc["fc_dhi"][up], 1), "temp": col(day.fc["fc_temp"][up], 1)}

    def _forecast(self, up: bool) -> dict:
        keys = ("t", "dni_lo", "dni_mid", "dni_hi", "dhi_lo", "dhi_mid", "dhi_hi", "temp")
        run, day = self.run, self.run.day
        k = run.k
        if not up or k >= day.n:
            return {**{x: [] for x in keys}, "made_at": int(self.now)}
        if self._fc_cache is None or self._fc_cache[0] != k:
            f = self.planner.forecast(run, k)
            m = day.el[k:] > 0
            lo, mid, hi = SKIES
            self._fc_cache = (k, {
                "t": [int(x) for x in day.t[k:][m]],
                "dni_lo": col(f.dni_q[m, lo], 1), "dni_mid": col(f.dni_q[m, mid], 1), "dni_hi": col(f.dni_q[m, hi], 1),
                "dhi_lo": col(f.dhi_q[m, lo], 1), "dhi_mid": col(f.dhi_q[m, mid], 1), "dhi_hi": col(f.dhi_q[m, hi], 1),
                "temp": col(f.temp[m], 1), "made_at": int(day.t_of(k)),
            })
        return self._fc_cache[1]

    def _model(self) -> dict:
        ds = self.ds
        return {
            "data": {"days": ds.n_days, "train_days": len(ds.train_days()), "test_days": len(ds.test_days()),
                     "from": ds.dates[0], "to": ds.dates[-1], "step_min": int(ds.step_min),
                     "generator": ds.generator, "has_forecast": ds.has["forecast"], "has_prices": ds.has["prices"],
                     "has_reference": ds.has["reference"]},
            "scene_check": self.scene_check,
            "nowcast": nowcast.summary(self.ctx.cast),
        }


def spans_de(spans) -> str:
    # [[11.5, 15.0]] as "11:30 bis 15:00"
    def clock(h: float) -> str:
        m = int(round(h * 60))
        return f"{m // 60:02d}:{m % 60:02d}"
    return " und ".join(f"{clock(a)} bis {clock(b)}" for a, b in spans)


def _clock(local_s: int, end: bool = False) -> str:
    # seconds of local time as HH:MM, the midnight that ends a day as 24:00
    m = (local_s % 86400) // 60
    return "24:00" if end and m == 0 else f"{m // 60:02d}:{m % 60:02d}"
