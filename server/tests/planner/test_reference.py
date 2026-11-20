import numpy as np

from .common import DATES, tol
from sonnenteiler import solver
from sonnenteiler.planner import power_hours

KEYS = ("energy_wh", "energy_pct", "dli", "dli_pct", "stress_h", "elec_eur")


def setup(ctx, date, recipe, target=None):
    run = ctx.run(ctx.ds.day_index(date))
    r = ctx.intake(recipe if target is None else {**recipe, "dli_target": target}, None)[0]
    return run, r, ctx.terms(run.day, r)


def off(ours, ref, keys=KEYS):
    return [k for k in keys if abs(ours[k] - ref[k]) > tol(ref[k])]


def test_tracking_reproduces_days_csv(ctx):
    for date in DATES:
        for r0 in ctx.ds.recipes:
            run, r, terms = setup(ctx, date, r0)
            ours = ctx.planner.figures(run, r, terms, tracking=True)
            ref = ctx.ds.reference(date, r0["name"])["tracking"]
            assert off(ours, ref) == [], (date, r0["name"], ours, ref)


def test_blind_reproduces_the_oracle_rows(ctx):
    # with value = power every purchase of light costs the same energy per mol while nothing clips, the
    # teammate's order of purchases then follows float noise. where the numbers differ for that reason our
    # plan must meet the target as well, with at least the energy less 0.5 %
    exact = 0
    for date in DATES:
        for r0 in ctx.ds.recipes:
            run, r, terms = setup(ctx, date, r0)
            ours = ctx.planner.figures(run, r, terms, ctx.planner.hindsight(run, r, terms, "blind"))
            ref = ctx.ds.reference(date, r0["name"])["oracle"]
            if not off(ours, ref):
                exact += 1
                continue
            assert ours["dli"] >= min(ref["dli"], r["dli_target"]) - 0.01, (date, r0["name"])
            assert ours["energy_wh"] >= ref["energy_wh"] * 0.995, (date, r0["name"], ours, ref)
            assert abs(ours["stress_h"] - ref["stress_h"]) <= tol(ref["stress_h"])
    assert exact >= 10


def cases(ctx):
    for date in DATES:
        for r0 in ctx.ds.recipes:
            for target in (None, 12, 30, 45, 70):
                yield (date, r0, *setup(ctx, date, r0, target))


def test_best_reaches_the_target_whenever_any_plan_can(ctx):
    seen = {"reachable": 0, "not": 0}
    for date, r0, run, r, terms in cases(ctx):
        dm = ctx.planner.dli_max(run, r, terms)
        best = ctx.planner.figures(run, r, terms, ctx.planner.hindsight(run, r, terms), dli_max=dm)
        if dm >= r["dli_target"]:
            seen["reachable"] += 1
            assert best["dli"] >= r["dli_target"] - 1e-6, (date, r["name"], r["dli_target"])
        else:
            seen["not"] += 1
            # the day cannot reach it: every allowed hour takes the most light
            assert abs(best["dli"] - dm) < 1e-6, (date, r["name"], r["dli_target"], best["dli"], dm)
        assert best["light_met"] >= 1 - 1e-9
    assert seen["reachable"] and seen["not"]


def test_best_never_earns_less_than_blind(ctx):
    for date, r0, run, r, terms in cases(ctx):
        best = ctx.planner.figures(run, r, terms, ctx.planner.hindsight(run, r, terms))
        blind = ctx.planner.figures(run, r, terms, ctx.planner.hindsight(run, r, terms, "blind"))
        assert best["elec_eur"] >= blind["elec_eur"] - 1e-12, (date, r["name"], r["dli_target"])
        assert best["dli"] >= min(blind["dli"], r["dli_target"]) - 1e-6
        if r["dli_target"] == r0["dli_target"]:
            ref = ctx.ds.reference(date, r0["name"])["oracle"]
            assert best["elec_eur"] >= ref["elec_eur"] - tol(ref["elec_eur"])


def test_a_day_that_cannot_reach_the_target_takes_the_most_light_every_hour(ctx):
    run, r, terms = setup(ctx, "2025-06-03", ctx.ds.recipes[0], 80)
    picks = ctx.planner.hindsight(run, r, terms)
    _, _, _, ok = ctx.planner.rules(r, run.day.hour, run.P, run.Q, run.temp)
    starts = solver.hold_starts(run.day.n, 0, ctx.planner.hold)
    ends = np.append(starts[1:], run.day.n)
    rows = np.arange(run.day.n)
    for a, b in zip(starts, ends):
        every = ok[a:b].all(axis=0)
        got = run.Q[rows[a:b], picks[a:b]].sum()
        most = run.Q[a:b][:, every].sum(axis=0).max() if every.any() else np.where(ok[a:b], run.Q[a:b], -np.inf).max(axis=1).sum()
        assert got >= most - 1e-6, (a, got, most)


def test_allowed_rule():
    power = np.array([[10.0, 8.0, 5.0], [10.0, 8.0, 5.0], [10.0, 8.0, 5.0], [10.0, 8.0, 5.0]])
    ppfd = np.array([[100.0, 200.0, 300.0]] * 4)
    stress = np.array([[False, False, True], [True, True, True], [False, True, True], [False, False, False]])
    ok = solver.allowed(power, ppfd, stress, np.array([False, False, True, False]),
                        np.array([False, False, True, True]))
    assert ok[0].tolist() == [True, True, False]
    # every action stresses: only the least light
    assert ok[1].tolist() == [True, False, False]
    # power hour wins over the shade hour: only the most power
    assert ok[2].tolist() == [True, False, False]
    # shade hour: only the least light on the crop
    assert ok[3].tolist() == [True, False, False]


def test_power_hours_mask():
    r = {"power_hours": [[17.0, 21.0]]}
    assert power_hours(r, [16.9, 17.0, 20.99, 21.0]).tolist() == [False, True, True, False]
