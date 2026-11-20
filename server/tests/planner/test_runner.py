import json

import pytest

from .common import tol
from sonnenteiler.runner import Runner
from sonnenteiler.schema import Problem

NUM = (int, float)
OPT = (int, float, type(None))
BAL = {k: NUM for k in ("energy_wh", "energy_pct", "dli", "dli_pct", "stress_h", "elec_eur")}
DAY_BAL = {**BAL, "light_met": NUM}
REF = {k: NUM for k in ("elec_eur", "energy_wh", "dli", "stress_h")}
EVAL_STRAT = {k: NUM for k in ("elec_eur", "energy_wh", "dli_pct", "light_met", "days_met", "stress_h")}
PLAN_COLS = ("t", "offset", "pan", "tilt", "p_mw", "ppfd", "dni", "dhi", "temp", "price", "elec_eur", "stress", "why")
PLAN = {
    "version": int, "made_at": int, "block": {"from": int, "to": int}, "step_min": int,
    "hold_min": int, "points": ("columns", PLAN_COLS), "outlook": ("columns", PLAN_COLS),
    "expect": {"block": {"energy_wh": NUM, "dli": NUM, "elec_eur": NUM},
               "day_end": {"dli": ("triple",), "energy_wh": ("triple",), "elec_eur": ("triple",), "stress_h": NUM}},
    "light_price": NUM, "cost": {"elec_eur": NUM, "energy_share": NUM, "dli": NUM},
    "reachable": bool, "first_guess": bool,
}
VALUE = {"energy_wh": NUM, "dli": NUM, "elec_eur": NUM, "value_eur": NUM}
STATE = {
    "now": int, "speed": NUM, "paused": bool, "mode": str,
    "site": {"name": str, "lat": NUM, "lon": NUM, "heading": NUM, "utc_offset_h": NUM},
    "scene": {"gcr": NUM, "panel_w_mm": NUM, "panel_h_mm": NUM, "panel_eff": NUM, "pan_limits": list,
              "tilt_limits": list, "park": list, "wm2_per_mw": NUM, "offsets": list},
    "block_h": int, "step_min": int, "hold_min": int,
    "day": {"date": str, "index": int, "set": str, "sunrise": int, "sunset": int, "start": int, "end": int,
            "touched": bool},
    "sun": {"az": NUM, "el": NUM, "az_rel": NUM, "up": bool},
    "pose": {"pan": NUM, "tilt": NUM, "offset": NUM, "incidence": OPT, "why": str},
    "meas": {"p_mw": NUM, "power_wm2": NUM, "ppfd": NUM, "open_ppfd": NUM, "panel_lux": NUM, "plant_lux": NUM,
             "dni": NUM, "dhi": NUM, "temp": OPT, "leaf_temp": OPT, "price": NUM, "stress": bool, "shade": NUM},
    "recipe": dict,
    "account": {"dli": NUM, "dli_target": NUM, "dli_share": NUM, "dli_end": ("triple",), "reachable": bool,
                "energy_wh": NUM, "stress_h": NUM, "elec_eur": NUM, "end": {"elec_eur": ("triple",)}},
    "plan": PLAN,
    "path_today": ("columns", ("t", "offset", "pan", "tilt", "p_mw", "ppfd", "dni", "dhi", "temp", "price", "stress",
                               "why")),
    "sunpath": ("columns", ("t", "az", "el", "az_rel")),
    "day_prices": ("columns", ("t", "price")),
    "forecast": ("columns", ("t", "dni_lo", "dni_mid", "dni_hi", "dhi_lo", "dhi_mid", "dhi_hi", "temp"), "made_at"),
    "service": ("columns", ("t", "dni", "dhi", "temp")),
    "replay": ("optional", {
        "block": {"from": int, "to": int}, "driven": VALUE, "expected": VALUE, "best": VALUE,
        "gain_share": NUM, "light_price": NUM, "forecast_err": {"dni": OPT, "dhi": OPT},
        "best_path": ("columns", ("t", "offset"))}),
    "balance": {"sonnenteiler": BAL, "tracking": BAL, "plant_cost_eur": NUM},
    "days": list,
    "model": {"data": {"days": int, "train_days": int, "test_days": int, "from": str, "to": str, "step_min": int,
                       "generator": str, "has_forecast": bool, "has_prices": bool, "has_reference": bool},
              "scene_check": ("optional", {"rows": int, "max_err_p_mw": NUM, "max_err_ppfd": NUM}),
              "nowcast": {"used": str, "mae_dni": dict, "mae_dhi": dict, "mae_temp": dict, "by_lead": dict}},
    "eval": ("optional", {"days": int, "light_quantile": NUM, "rows": list}),
    "chatbot": {"on": bool, "ok": (bool, type(None)), "model": (str, type(None)),
                "last": ("optional", {"t": int, "plant": str, "via": str})},
    "log": list,
}
DAY = {"date": str, "set": str, "touched": bool, "recipe": str, "sonnenteiler": DAY_BAL, "tracking": DAY_BAL,
       "blind": DAY_BAL, "best": DAY_BAL, "plant_cost_eur": NUM, "price_gain_eur": NUM,
       "reference": ("optional", {"tracking": REF, "oracle": REF})}
EVAL_ROW = {"recipe": str, **{s: EVAL_STRAT for s in ("tracking", "blind", "raw", "plan", "best")},
            "plant_cost_eur": NUM, "price_gain_eur": NUM, "captured": OPT}


def check(value, spec, path="state"):
    if isinstance(spec, dict):
        assert isinstance(value, dict), path
        assert set(value) == set(spec), (path, sorted(set(value) ^ set(spec)))
        for k, s in spec.items():
            check(value[k], s, f"{path}.{k}")
    elif isinstance(spec, tuple) and spec and spec[0] == "columns":
        assert isinstance(value, dict), path
        extra = set(spec[2:])
        assert set(value) == set(spec[1]) | extra, (path, sorted(set(value) ^ (set(spec[1]) | extra)))
        lengths = {len(value[k]) for k in spec[1]}
        assert len(lengths) == 1, (path, lengths)
    elif isinstance(spec, tuple) and spec and spec[0] == "triple":
        assert isinstance(value, list) and len(value) == 3, path
        assert all(isinstance(v, NUM) for v in value), path
    elif isinstance(spec, tuple) and spec and spec[0] == "optional":
        if value is not None:
            check(value, spec[1], path)
    else:
        types = spec if isinstance(spec, tuple) else (spec,)
        assert isinstance(value, types) and not (bool not in types and isinstance(value, bool)), \
            (path, type(value), value)


@pytest.fixture()
def runner(ctx):
    return Runner(ctx, start="2025-06-03", evaluation={"days": 1, "light_quantile": 0.35, "rows": []},
                  scene_check={"rows": 1, "max_err_p_mw": 0.0, "max_err_ppfd": 0.0})


def test_state_at_night_by_day_and_after_a_day(runner):
    st = runner.state()
    check(st, STATE)
    assert st["sun"]["up"] is False and st["pose"]["why"] == "night" and st["forecast"]["t"] == []
    assert st["replay"] is None and st["days"] == []
    json.dumps(st, allow_nan=False)
    runner.tick(4.0)
    st = runner.state()
    assert st["sun"]["up"] is True or st["now"] >= st["day"]["sunrise"] - 1800
    while runner.state()["sun"]["el"] < 30:
        runner.tick(5.0)
    st = runner.state()
    check(st, STATE)
    assert st["sun"]["up"] and st["forecast"]["t"] and st["replay"] is not None
    assert st["day"]["start"] <= st["plan"]["block"]["from"] <= st["now"] < st["plan"]["block"]["to"]
    assert len(st["path_today"]["t"]) == runner.run.k
    for d in st["days"]:
        check(d, DAY)
    runner.run_days(1)
    st = runner.state()
    check(st, STATE)
    assert len(st["days"]) == 1
    check(st["days"][0], DAY)
    json.dumps(st, allow_nan=False)


def test_one_day_and_the_shadow_tracking_equals_days_csv(ctx):
    for r in ctx.ds.recipes:
        rec = ctx.intake(r, None)[0]
        runner = Runner(ctx, recipe=rec, start="2025-06-03")
        runner.run_days(1)
        day = runner.days[-1]
        assert day["date"] == "2025-06-03" and not day["touched"]
        ref = ctx.ds.reference("2025-06-03", r["name"])
        for k in ("energy_wh", "energy_pct", "dli", "dli_pct", "stress_h", "elec_eur"):
            assert abs(day["tracking"][k] - ref["tracking"][k]) <= tol(ref["tracking"][k]), (r["name"], k)
        assert day["reference"]["oracle"]["elec_eur"] == pytest.approx(ref["oracle"]["elec_eur"], rel=1e-3)
        # blind is the oracle row of days.csv on an untouched day of a dataset recipe
        assert day["blind"]["elec_eur"] == pytest.approx(ref["oracle"]["elec_eur"], rel=1e-3)
        # best is our solver with the true weather: it never earns less than blind (here within the rounding
        # of days.csv) and meets the duty
        assert day["best"]["elec_eur"] >= day["blind"]["elec_eur"] - tol(day["blind"]["elec_eur"])
        assert day["best"]["light_met"] == 1.0
        assert day["plant_cost_eur"] == pytest.approx(day["tracking"]["elec_eur"] - day["sonnenteiler"]["elec_eur"],
                                                      rel=1e-3, abs=1e-7)
        assert day["price_gain_eur"] == pytest.approx(day["sonnenteiler"]["elec_eur"] - day["blind"]["elec_eur"],
                                                      rel=1e-3, abs=1e-7)
        assert day["sonnenteiler"]["light_met"] > 0.8


def test_recipe_change_replans(runner):
    runner.tick(20.0)
    v = runner.plan["version"]
    got = runner.set_recipe({"plant": "Kartoffel", "light_target": 28, "objective": "target"})
    assert got["ok"] and got["recipe"]["crop"] == "Potato" and got["report"]["ignored"] == ["objective"]
    assert runner.plan["version"] == v + 1 and got["plan"]["version"] == v + 1
    assert runner.plan["made_at"] == int(runner.now)
    assert any("Rezept geändert" in x["text"] for x in runner.log)
    assert runner.state()["recipe"]["dli_target"] == 28.0


def test_whatif_changes_nothing(runner):
    runner.tick(30.0)
    before = json.dumps(runner.state(), sort_keys=True)
    got = runner.whatif({"crop": "Tomato", "dli_target": 35})
    assert set(got) == {"ok", "recipe", "report", "expect", "cost", "light_price", "reachable", "first_guess"}
    assert json.dumps(runner.state(), sort_keys=True) == before


def test_cloud_marks_the_day_touched(runner):
    runner.tick(30.0)
    k = runner.run.k
    dni_before = runner.run.dni[k + 2]
    got = runner.cloud({"minutes": 60, "factor": 0.1})
    assert got["ok"] and runner.state()["day"]["touched"] is True
    assert runner.run.dni[k + 2] == pytest.approx(dni_before * 0.1)
    runner.run_days(1)
    day = runner.days[-1]
    assert day["touched"] is True and day["reference"] is None
    # in a touched day blind comes from our solver in the weather as it happened
    assert day["best"]["elec_eur"] >= day["blind"]["elec_eur"] - 1e-9
    assert any("Wolke" in x["text"] for x in runner.log)


def test_reset_clears_the_cloud(runner):
    runner.tick(30.0)
    runner.cloud({"minutes": 60})
    runner.reset_day()
    st = runner.state()
    assert st["day"]["touched"] is False and st["now"] == st["day"]["start"]


def test_day_jump(runner):
    got = runner.jump({"date": "2025-06-02"})
    st = runner.state()
    assert got["ok"] and st["day"]["date"] == "2025-06-02" and st["day"]["set"] == "train"
    assert st["day"]["index"] == 1 and st["now"] == st["day"]["start"]
    with pytest.raises(Problem):
        runner.jump({"date": "2024-01-01"})
    # after the jumped day the simulation goes on with the next test day
    runner.run_days(1)
    assert runner.state()["day"]["date"] == "2025-06-03"


def test_speed_pause_and_skip_night(runner):
    runner.set_speed({"speed": 720})
    t0 = runner.now
    runner.tick(1.0)
    # the night is skipped to half an hour before sunrise
    assert runner.now >= runner.run.day.sunrise - 1800 - 1
    t1 = runner.now
    runner.tick(1.0)
    assert runner.now == pytest.approx(t1 + 720, abs=1)
    runner.set_speed({"paused": True})
    runner.tick(5.0)
    assert runner.now == pytest.approx(t1 + 720, abs=1) and runner.now > t0
    with pytest.raises(Problem):
        runner.set_speed({})


def test_ticking_through_the_evening_starts_the_next_day(runner):
    # the fixture has one test day, after it the simulation starts that day again
    runner.set_speed({"speed": 20000})
    for _ in range(40):
        runner.tick(1.0)
        if runner.days:
            break
    assert len(runner.days) == 1 and runner.state()["day"]["date"] == "2025-06-03"
    assert runner.now < runner.run.day.sunset


def test_days_list(runner):
    days = runner.day_list()
    assert [d["date"] for d in days] == ["2025-06-01", "2025-06-02", "2025-06-03"]
    assert set(days[0]) == {"date", "set", "index", "dni_mean", "temp_max", "price_min", "price_max", "neg_price_h",
                            "tracking_eur", "blind_eur"}
    assert days[0]["neg_price_h"] > 0 and days[2]["set"] == "test"
    assert days[0]["tracking_eur"] == pytest.approx(ctx_ref(runner, "2025-06-01", "tracking"), rel=1e-6)
    assert days[0]["blind_eur"] == pytest.approx(ctx_ref(runner, "2025-06-01", "oracle"), rel=1e-6)
    runner.set_recipe({"crop": "Tomato", "dli_target": 12})
    assert runner.day_list()[0]["blind_eur"] is None


def ctx_ref(runner, date, strat):
    return runner.ds.reference(date, runner.recipe["name"])[strat]["elec_eur"]


def test_eval_rows_have_the_contract_shape(ctx):
    from sonnenteiler.evaluate import evaluate
    ev = evaluate(ctx, log=None)
    runner = Runner(ctx, start="2025-06-03", evaluation=ev)
    st = runner.state()
    check(st["eval"], {"days": int, "light_quantile": NUM, "rows": list})
    assert len(st["eval"]["rows"]) == len(ctx.ds.recipes)
    for row in st["eval"]["rows"]:
        check(row, EVAL_ROW)
        assert row["best"]["elec_eur"] >= row["blind"]["elec_eur"] - 1e-9
