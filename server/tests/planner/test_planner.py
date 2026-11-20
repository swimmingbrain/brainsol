import numpy as np
import pytest

from sonnenteiler import solver
from sonnenteiler.nowcast import QS
from sonnenteiler.planner import PLAN_COLS, at_quantile, drive_day, power_hours

PLAN_KEYS = {"version", "made_at", "block", "step_min", "hold_min", "points", "outlook", "expect", "light_price",
             "cost", "reachable", "first_guess"}


def plan_at(ctx, date, hour, recipe=None, method=None, light_q=None):
    d = ctx.ds.day_index(date)
    run = ctx.run(d)
    r = recipe or ctx.default_recipe()
    terms = ctx.terms(run.day, r)
    k0 = int(np.searchsorted(run.day.hour, hour))
    drive_day(ctx.planner, run, r, terms, until=k0)
    core = ctx.planner.solve(run, k0, r, terms, method=method, light_q=light_q)
    return run, core, ctx.planner.to_json(run, core, 7, run.day.t_of(k0)), terms


def test_plan_shape(ctx):
    run, core, js, _ = plan_at(ctx, "2025-06-03", 10.0)
    assert set(js) == PLAN_KEYS
    for part in ("points", "outlook"):
        assert set(js[part]) == set(PLAN_COLS)
        assert len({len(v) for v in js[part].values()}) == 1
    assert len(js["points"]["t"]) + len(js["outlook"]["t"]) == run.day.n - run.day.block_of(core.k0)[0]
    e = js["expect"]
    assert set(e) == {"block", "day_end"} and set(e["block"]) == {"energy_wh", "dli", "elec_eur"}
    assert set(e["day_end"]) == {"dli", "energy_wh", "elec_eur", "stress_h"}
    for k in ("dli", "energy_wh", "elec_eur"):
        assert len(e["day_end"][k]) == 3
    assert e["day_end"]["dli"][0] <= e["day_end"]["dli"][1] <= e["day_end"]["dli"][2]
    assert set(js["cost"]) == {"elec_eur", "energy_share", "dli"}
    assert isinstance(js["reachable"], bool) and js["first_guess"] is False
    assert js["hold_min"] == 60 and js["step_min"] == 5
    assert set(js["points"]["why"]) <= {"sun", "light", "price", "stress", "shade", "power_hour", "night"}


def test_binding_block_is_the_three_hours_around_made_at(ctx):
    run, core, js, _ = plan_at(ctx, "2025-06-03", 10.5)
    day = run.day
    # made at 10:30, the block runs from 09:00 to 12:00 and starts with the driven steps
    assert js["block"]["from"] == int(day.t[int(np.searchsorted(day.hour, 9.0))])
    assert js["block"]["to"] == int(day.t[int(np.searchsorted(day.hour, 12.0))])
    assert js["block"]["from"] <= js["made_at"] < js["block"]["to"]
    pts = js["points"]
    assert len(pts["t"]) == 36 and pts["t"][0] == js["block"]["from"]
    assert pts["t"][-1] + 300 == js["block"]["to"]
    assert js["outlook"]["t"][0] == js["block"]["to"]
    assert pts["t"] == sorted(pts["t"])


def test_power_hours_give_the_most_power(ctx):
    r = ctx.intake({"crop": "Tomato", "power_hours": [[10, 14]], "dli_target": 40}, 2)[0]
    run, core, js, _ = plan_at(ctx, "2025-06-03", 9.0, recipe=r)
    k0 = core.k0
    ph = power_hours(r, run.day.hour[k0:]) & (run.day.el[k0:] > 0)
    p_mid = core.outs[2][0]
    rows = np.flatnonzero(ph)
    assert len(rows)
    assert np.all(core.pick[rows] == p_mid[rows].argmax(axis=1))
    assert all(core.why[i] == "power_hour" for i in rows)


def test_shade_hours_give_the_least_crop_light_and_power_hours_win(ctx):
    r = ctx.intake({"crop": "Tomato", "shade_hours": [[11, 15]], "power_hours": [[13, 14]], "dli_target": 40}, 2)[0]
    run, core, js, _ = plan_at(ctx, "2025-06-03", 9.0, recipe=r)
    k0 = core.k0
    hour, up = run.day.hour[k0:], run.day.el[k0:] > 0
    q_mid, p_mid = core.outs[2][1], core.outs[2][0]
    shade = (hour >= 11) & (hour < 15) & ~((hour >= 13) & (hour < 14)) & up
    power = (hour >= 13) & (hour < 14) & up
    rows = np.flatnonzero(shade)
    assert len(rows) == 36
    assert np.all(core.pick[rows] == q_mid[rows].argmin(axis=1))
    assert all(core.why[i] == "shade" for i in rows)
    rows = np.flatnonzero(power)
    assert np.all(core.pick[rows] == p_mid[rows].argmax(axis=1))
    assert all(core.why[i] == "power_hour" for i in rows)
    assert "shade" in js["points"]["why"] + js["outlook"]["why"]


def test_shade_hours_hold_in_hindsight(ctx):
    r = ctx.intake({"crop": "Tomato", "shade_hours": [[10, 12]]}, 2)[0]
    run = ctx.run(2)
    terms = ctx.terms(run.day, r)
    shade = (run.day.hour >= 10) & (run.day.hour < 12) & (run.day.el > 0)
    for kind in ("best", "blind"):
        picks = ctx.planner.hindsight(run, r, terms, kind)
        assert np.all(picks[shade] == run.Q[shade].argmin(axis=1))
    k = np.flatnonzero(shade)
    picks = ctx.planner.best_block(run, int(k[0]), int(k[-1]) + 1, r, terms, 0.01)
    assert np.all(picks == run.Q[k].argmin(axis=1))


def test_negative_price_turns_the_panel_away(ctx):
    run, core, js, terms = plan_at(ctx, "2025-06-01", 6.0)
    k0 = core.k0
    neg = (terms.price[k0:] < 0) & (run.day.el[k0:] > 0)
    assert neg.sum() > 20
    away = core.pick[neg] != ctx.zero
    assert away.mean() > 0.5
    p_mid = core.outs[2][0]
    rows = np.flatnonzero(neg)
    assert np.all(p_mid[rows, core.pick[rows]] <= p_mid[rows, ctx.zero] + 1e-9)
    assert "price" in [core.why[i] for i in rows]
    # where it still faces the sun the allowed rule kept it there, turning away would stress the crop
    for i in rows[core.pick[rows] == ctx.zero]:
        assert core.why[i] == "stress"


def test_allowed_rule_holds(ctx):
    for date in ("2025-06-01", "2025-06-02", "2025-06-03"):
        for r in ctx.ds.recipes:
            rec = ctx.intake(r, None)[0]
            for target in (None, 40):
                if target:
                    rec = {**rec, "dli_target": target}
                run, core, js, _ = plan_at(ctx, date, 8.0, recipe=rec)
                ok = solver.allowed(core.outs[2][0], core.outs[2][1], core.st, core.ph, core.sh)
                assert ok[np.arange(len(core.pick)), core.pick].all(), (date, r["name"], target)


def test_hold_blocks_keep_one_action(ctx):
    r = ctx.intake({"crop": "Tomato", "dli_target": 40}, 2)[0]
    run, core, js, _ = plan_at(ctx, "2025-06-03", 9.0, recipe=r)
    assert (core.pick != core.res.first).any()
    hold = ctx.planner.hold
    starts = solver.hold_starts(run.day.n, core.k0, hold)
    ends = np.append(starts[1:], len(core.pick))
    for a, b in zip(starts, ends):
        moved = core.pick[a:b] != core.res.first[a:b]
        if moved.any():
            assert len(set(core.pick[a:b].tolist())) == 1


def test_never_uses_the_weather_after_t0(ctx):
    d = ctx.ds.day_index("2025-06-03")
    r = ctx.default_recipe()
    plans = []
    for change in (False, True):
        run = ctx.run(d)
        terms = ctx.terms(run.day, r)
        k0 = int(np.searchsorted(run.day.hour, 11.0))
        if change:
            run.dni[k0:] *= 0.2
            run.dhi[k0:] += 80.0
            run.temp[k0:] += 10.0
            run.cloud[k0:] = 100.0
            run.P[k0:], run.Q[k0:] = ctx.scene.outcome(run.day.geo, run.dni, run.dhi)[0][k0:], \
                ctx.scene.outcome(run.day.geo, run.dni, run.dhi)[1][k0:]
        drive_day(ctx.planner, run, r, terms, until=k0)
        core = ctx.planner.solve(run, k0, r, terms)
        plans.append(ctx.planner.to_json(run, core, 1, run.day.t_of(k0)))
    assert plans[0] == plans[1]


def test_first_guess_before_sunrise(ctx):
    run, core, js, _ = plan_at(ctx, "2025-06-03", 0.0)
    assert js["first_guess"] is True
    assert set(js["points"]["why"]) == {"night"}
    assert all(o == 0 for o in js["points"]["offset"])
    assert all(p == ctx.scene.park[1] for p in js["points"]["tilt"])


@pytest.mark.parametrize("target", [15, 30])
def test_light_price_and_cost(ctx, target):
    r = ctx.intake({"crop": "Tomato", "dli_target": target}, 2)[0]
    run, core, js, _ = plan_at(ctx, "2025-06-03", 6.0, recipe=r)
    assert js["light_price"] >= 0
    assert js["cost"]["dli"] >= -1e-9 and js["cost"]["elec_eur"] >= -1e-12
    if js["cost"]["dli"] > 0:
        assert js["light_price"] > 0 and "light" in js["points"]["why"] + js["outlook"]["why"]
    # the light duty is planned with a careful sky, so the middle sky reaches the target when it can be reached
    if js["reachable"]:
        assert js["expect"]["day_end"]["dli"][1] >= target - 0.01


def test_light_quantile_between_those_of_the_nowcast():
    a = np.tile(np.array([[10.0, 20.0, 40.0, 60.0, 80.0]]), (3, 1))
    assert QS == (0.1, 0.25, 0.5, 0.75, 0.9)
    assert np.allclose(at_quantile(a, 0.25), 20.0) and np.allclose(at_quantile(a, 0.5), 40.0)
    assert np.allclose(at_quantile(a, 0.35), 20.0 + 0.4 * 20.0)


def test_a_careful_light_quantile_gives_at_least_as_much_planned_light(ctx):
    r = ctx.intake({"crop": "Tomato", "dli_target": 30}, 2)[0]
    got = {}
    for q in (0.5, 0.25):
        run, core, js, _ = plan_at(ctx, "2025-06-03", 6.0, recipe=r, light_q=q)
        got[q] = js["expect"]["day_end"]["dli"][1]
    assert got[0.25] >= got[0.5] - 1e-6
