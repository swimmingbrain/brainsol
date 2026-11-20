from __future__ import annotations

import json
import os
import time

import numpy as np

from . import money
from .planner import drive_day

VERSION = 3
FIELDS = ("elec_eur", "energy_wh", "dli_pct", "light_met", "stress_h")
STRATS = ("tracking", "blind", "raw", "plan", "best")
QUANTILES = (0.5, 0.35, 0.25)


def blind_of(ctx, run, recipe, terms, dli_max: float, untouched: bool = True) -> dict:
    # the oracle row of days.csv for a dataset recipe, else our solver with value = power
    ref = ctx.ds.reference(run.day.date, recipe["name"]) if untouched and ctx.dataset_recipe(recipe) else None
    row = (ref or {}).get("oracle")
    if row and all(np.isfinite(row[k]) for k in ("elec_eur", "energy_wh", "dli", "stress_h")):
        b = {k: row[k] for k in money.KEYS}
        if not np.isfinite(b["dli_pct"]):
            b["dli_pct"] = 100.0 * b["dli"] / recipe["dli_target"]
        b["light_met"] = money.light_met(b["dli"], recipe["dli_target"], dli_max)
        return b
    picks = ctx.planner.hindsight(run, recipe, terms, "blind")
    return ctx.planner.figures(run, recipe, terms, picks, dli_max=dli_max)


def _forecasts(ctx, d, methods) -> dict:
    # the nowcast at every block mark, the same for every recipe
    day, base = ctx.day(d), ctx.run(d)
    return {m: {k: ctx.planner.forecast(base, k, m) for k in day.marks} for m in methods}


def evaluate(ctx, log=print) -> dict:
    # every recipe of the dataset on all test days: tracking, blind, the planner with the raw service
    # forecast, the planner with the nowcast, and the best plan with the weather known in advance
    ds, planner = ctx.ds, ctx.planner
    t0 = time.time()
    used = ctx.cast.used
    days = ds.test_days()
    recipes = [ctx.intake(r, None)[0] for r in ds.recipes] or [ctx.default_recipe()]
    acc = {(r["name"], s): [] for r in recipes for s in STRATS}
    for d in days:
        casts = _forecasts(ctx, d, {"raw", used})
        for r in recipes:
            run0 = ctx.run(d)
            terms = ctx.terms(run0.day, r)
            dm = planner.dli_max(run0, r, terms)
            acc[(r["name"], "tracking")].append(planner.figures(run0, r, terms, tracking=True, dli_max=dm))
            acc[(r["name"], "blind")].append(blind_of(ctx, run0, r, terms, dm))
            acc[(r["name"], "best")].append(planner.figures(run0, r, terms, planner.hindsight(run0, r, terms), dli_max=dm))
            for name, method in (("raw", "raw"), ("plan", used)):
                run = ctx.run(d)
                drive_day(planner, run, r, terms, method, forecasts=casts[method])
                acc[(r["name"], name)].append(planner.figures(run, r, terms, dli_max=dm))
    rows = [summary_row(r["name"], {s: acc[(r["name"], s)] for s in STRATS}) for r in recipes]
    took = time.time() - t0
    if log:
        log(f"Auswertung auf {len(days)} Testtagen in {took:.1f} s")
    return {"days": len(days), "light_quantile": planner.light_q, "used": used, "took_s": round(took, 1),
            "rows": rows}


def mean_of(vals: list) -> dict:
    out = {f: round(float(np.mean([v[f] for v in vals])), 6) if vals else None for f in FIELDS}
    out["days_met"] = int(sum(v["light_met"] >= money.MET for v in vals))
    return out


def summary_row(name: str, by: dict) -> dict:
    row = {"recipe": name}
    for s in STRATS:
        row[s] = mean_of(by[s])
    tr, bl, pl, be = (row[s]["elec_eur"] or 0.0 for s in ("tracking", "blind", "plan", "best"))
    row["plant_cost_eur"] = round(tr - pl, 6)
    row["price_gain_eur"] = round(pl - bl, 6)
    row["captured"] = round((pl - bl) / (be - bl), 4) if abs(be - bl) > 1e-12 else None
    return row


def quantile_study(ctx, values=QUANTILES, log=print) -> dict:
    # the planner with each light quantile on all test days and recipes, against the best plan
    ds, planner = ctx.ds, ctx.planner
    t0 = time.time()
    used = ctx.cast.used
    recipes = [ctx.intake(r, None)[0] for r in ds.recipes] or [ctx.default_recipe()]
    got = {q: [] for q in values}
    best = []
    for d in ds.test_days():
        casts = _forecasts(ctx, d, {used})[used]
        for r in recipes:
            run0 = ctx.run(d)
            terms = ctx.terms(run0.day, r)
            dm = planner.dli_max(run0, r, terms)
            best.append(planner.figures(run0, r, terms, planner.hindsight(run0, r, terms), dli_max=dm))
            for q in values:
                run = ctx.run(d)
                drive_day(planner, run, r, terms, used, forecasts=casts, light_q=q)
                got[q].append(planner.figures(run, r, terms, dli_max=dm))
    b = mean_of(best)
    rows = []
    for q in values:
        m = mean_of(got[q])
        rows.append({"light_quantile": q, "elec_eur": m["elec_eur"], "light_met": m["light_met"],
                     "days_met": m["days_met"], "pairs": len(got[q])})
    ok = [x for x in rows if x["light_met"] >= 0.98 * b["light_met"]]
    choice = max(ok, key=lambda x: x["elec_eur"])["light_quantile"] if ok else min(values)
    if log:
        log(f"Lichtquantile auf {len(ds.test_days())} Testtagen in {time.time() - t0:.1f} s")
    return {"rows": rows, "best": {"elec_eur": b["elec_eur"], "light_met": b["light_met"], "days_met": b["days_met"]},
            "choice": choice}


def save(path: str, ev: dict, key: str) -> None:
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump({"key": key, "eval": ev}, f)
    os.replace(tmp, path)


def load(path: str, key: str) -> dict | None:
    if not os.path.isfile(path):
        return None
    try:
        with open(path, encoding="utf-8") as f:
            got = json.load(f)
    except (OSError, ValueError):
        return None
    return got["eval"] if got.get("key") == key else None


def table(ev: dict) -> str:
    # the evaluation as text, money in € per hectare and day
    head = (f"{'recipe':<8}| {'tracking':>8} {'blind':>8} {'raw':>8} {'plan':>8} {'best':>8} | {'met t/b/p/B':>13} | "
            f"{'plant cost':>10} {'price gain':>10} {'captured':>8}")
    lines = [f"evaluation on {ev['days']} test days, nowcast {ev['used']}, light quantile {ev['light_quantile']:g}, "
             f"mean per day", head, "-" * len(head)]
    for r in ev["rows"]:
        vals = " ".join(f"{r[s]['elec_eur'] * 1e4:8.1f}" for s in STRATS)
        met = "/".join(str(r[s]["days_met"]) for s in ("tracking", "blind", "plan", "best"))
        cap = f"{100 * r['captured']:7.1f}%" if r["captured"] is not None else f"{'':>8}"
        lines.append(f"{r['recipe']:<8}| {vals} | {met:>13} | {r['plant_cost_eur'] * 1e4:10.1f} "
                     f"{r['price_gain_eur'] * 1e4:10.1f} {cap}")
    lines.append("electricity revenue in €/ha per day, met = days with the light duty met (tracking, blind, plan, "
                 "best), plant cost = tracking - plan, price gain = plan - blind, captured = (plan - blind) / "
                 "(best - blind)")
    return "\n".join(lines)


def quantile_table(study: dict) -> str:
    lines = ["light quantile on the test days, all recipes", f"{'quantile':>8} {'revenue':>9} {'light met':>9} "
             f"{'days met':>8}"]
    for x in study["rows"]:
        lines.append(f"{x['light_quantile']:8.2f} {x['elec_eur'] * 1e4:9.1f} {x['light_met']:9.4f} "
                     f"{x['days_met']:>4}/{x['pairs']}")
    b = study["best"]
    lines.append(f"{'best':>8} {b['elec_eur'] * 1e4:9.1f} {b['light_met']:9.4f} {b['days_met']:>4}")
    lines.append(f"revenue in €/ha per day, chosen by the rule (most revenue with light met at least 98 % of best): "
                 f"{study['choice']:g}")
    return "\n".join(lines)
