from __future__ import annotations

import argparse
import json
import os
import sys
import time

from . import __version__, dataset, evaluate, nowcast, schema
from .boot import Host, Prepared, err, folders
from .boot import prepare as boot_prepare
from .context import Context
from .planner import drive_day
from .runner import Runner
from .schema import Problem


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="sonnenteiler",
                                description="plans a small solar tracker over a crop bed: the crop's light is a duty, "
                                            "the rest is electricity")
    p.add_argument("--version", action="version", version=f"sonnenteiler {__version__}")
    sub = p.add_subparsers(dest="command", metavar="command")

    def common(sp):
        sp.add_argument("--config", help="settings json")
        sp.add_argument("--data", help="dataset folder of the generator")
        sp.add_argument("--work", help="folder for the cache, the model and the evaluation")
        return sp

    common(sub.add_parser("check", help="read the dataset and print what is there"))
    common(sub.add_parser("train", help="parse the data, train the nowcast, run the evaluation"))
    common(sub.add_parser("evaluate", help="print the evaluation tables"))
    pl = common(sub.add_parser("plan", help="print the plan json for one moment"))
    pl.add_argument("--date", required=True, help="local day, 2025-06-04")
    pl.add_argument("--time", default="09:00", help="local time, 09:00")
    pl.add_argument("--recipe", help="recipe json file")
    si = common(sub.add_parser("sim", help="run days without a server as fast as possible"))
    si.add_argument("--date", help="first day, default the first test day in june")
    si.add_argument("--days", type=int, default=3, help="number of days, default 3")
    si.add_argument("--recipe", help="recipe json file")
    si.add_argument("-v", "--verbose", action="store_true", help="print every log line")
    se = common(sub.add_parser("serve", help="the brain server: the chatbot and the planner in one process"))
    se.add_argument("--host", help="address to listen on, default 0.0.0.0")
    se.add_argument("--port", type=int, help="http port, default 8000")
    se.add_argument("--speed", type=float, help="simulated seconds per real second, default 360")
    se.add_argument("--live", action="store_true", help="real clock, rows come in through the api")
    return p


def setup(args):
    cfg = schema.load_config(args.config)
    folder, work = folders(cfg, args.data, args.work)
    return cfg, folder, work


def prepare(args, train: str = "missing", log=err, study: bool = False) -> Prepared:
    cfg, folder, work = setup(args)
    return boot_prepare(cfg, folder, work, train=train, log=log, study=study)


def read_json(path: str | None):
    if not path:
        return None
    with open(path, encoding="utf-8-sig") as f:
        return json.load(f)


def money_ha(v) -> str:
    return f"{v * 1e4:8.1f}" if v is not None else f"{'':>8}"


# commands


def cmd_check(args) -> int:
    cfg, folder, work = setup(args)
    ds = dataset.load(folder, work, cfg["columns"], err)
    ctx = Context(ds, None, cfg)
    sc = ds.scene
    print(f"dataset {os.path.abspath(folder)}, {ds.generator}")
    print(f"days {ds.n_days} from {ds.dates[0]} to {ds.dates[-1]}, {len(ds.train_days())} training and "
          f"{len(ds.test_days())} test days, step {ds.step_min} min, plan {ds.plan_min} min, {ds.n} rows")
    print(f"site {ctx.site_name()}, lat {sc['lat']}, lon {sc['lon']}, heading {sc['heading']}, gcr {sc['gcr']}, "
          f"panel {sc['panel_w_mm']} x {sc['panel_h_mm']} mm at {sc['panel_eff']}, wm2_per_mw {ds.wm2_per_mw:.5f}")
    print(f"offsets {', '.join(f'{o:g}' for o in ds.offsets)}")
    print(f"files: {', '.join(f'{k} ' + ('yes' if v else 'no') for k, v in ds.files.items())}")
    print(f"steps.csv columns found: {', '.join(ds.found)}")
    print(f"steps.csv columns missing: {', '.join(ds.missing) or 'none'}")
    for n in ds.notes:
        print(f"note: {n}")
    print(f"features: {', '.join(f'{k} ' + ('yes' if v else 'no') for k, v in ds.has.items())}")
    t0 = time.time()
    got = dataset.scene_check(ds, ctx.scene)
    if got:
        print(f"formula check against alternatives.csv: {got['rows']} rows, largest difference power "
              f"{got['max_err_p_mw']} mW, ppfd {got['max_err_ppfd']} µmol/m²/s, pan {got['max_err_pan']}°, "
              f"tilt {got['max_err_tilt']}° ({time.time() - t0:.1f} s)")
    else:
        print("formula check: alternatives.csv missing or without the needed columns")
    print("recipes:")
    for r0 in ds.recipes:
        r, _ = ctx.intake(r0, None)
        hours = f", power hours {r['power_hours']}" if r["power_hours"] else ""
        print(f"  {r['name']:<10} {r['crop']:<14} light target {r['dli_target']:g} mol, max ppfd {r['max_ppfd']:g}, "
              f"leaf up to {r['tmax_c']:g} °C{hours}")
    return 0


def cmd_train(args) -> int:
    got = prepare(args, train="always", study=True)
    print(nowcast.table(got.ctx.cast.metrics, got.ctx.cast.used))
    print()
    print(evaluate.quantile_table(got.quantiles))
    print()
    print(evaluate.table(got.ev))
    print(f"\ntraining, evaluation and checks took {got.took:.1f} s")
    return 0


def cmd_evaluate(args) -> int:
    got = prepare(args)
    print(nowcast.table(got.ctx.cast.metrics, got.ctx.cast.used))
    print()
    print(evaluate.table(got.ev))
    return 0


def cmd_plan(args) -> int:
    ctx = prepare(args).ctx
    ds = ctx.ds
    d = ds.day_index(args.date)
    if d is None:
        raise Problem(f"den Tag {args.date} gibt es im Datensatz nicht")
    body = read_json(args.recipe)
    r, report = ctx.intake(body if body is not None else ctx.default_recipe(), d)
    run = ctx.run(d)
    day = run.day
    try:
        hh, mm = (int(x) for x in args.time.split(":"))
    except ValueError:
        raise Problem("die Zeit muss wie 09:00 aussehen") from None
    want = hh + mm / 60.0
    k0 = int(next((k for k in range(day.n) if day.hour[k] >= want - 1e-9), day.n - 1))
    terms = ctx.terms(day, r)
    drive_day(ctx.planner, run, r, terms, until=k0)
    core = ctx.planner.solve(run, k0, r, terms)
    plan = ctx.planner.to_json(run, core, 1, day.t_of(k0))
    print(schema.dumps(plan, indent=1))
    for w in report["warnings"]:
        err(f"recipe: {w}")
    return 0


def cmd_sim(args) -> int:
    ctx = prepare(args).ctx
    body = read_json(args.recipe)
    recipe = None
    if body is not None:
        recipe, report = ctx.intake(body, None)
        for w in report["warnings"]:
            err(f"recipe: {w}")
    runner = Runner(ctx, recipe=recipe, start=args.date, echo=print if args.verbose else None)
    t0 = time.time()
    runner.run_days(args.days)
    took = time.time() - t0
    days = list(runner.days)[-args.days:]
    head = (f"{'date':<11}{'set':<6}{'recipe':<8}| {'sonnent.':>8} {'tracking':>8} {'blind':>8} {'best':>8} | "
            f"{'ref track':>9} {'ref blind':>9} | {'plant cost':>10} {'price gain':>10} | {'dli':>5} {'met':>5}")
    print(head)
    print("-" * len(head))
    for x in days:
        ref = x["reference"]
        rt = ref["tracking"]["elec_eur"] if ref and ref.get("tracking") else None
        rb = ref["oracle"]["elec_eur"] if ref and ref.get("oracle") else None
        s = x["sonnenteiler"]
        print(f"{x['date']:<11}{x['set']:<6}{x['recipe']:<8}| {money_ha(s['elec_eur'])} "
              f"{money_ha(x['tracking']['elec_eur'])} {money_ha(x['blind']['elec_eur'])} {money_ha(x['best']['elec_eur'])} | "
              f"{money_ha(rt):>9} {money_ha(rb):>9} | {money_ha(x['plant_cost_eur']):>10} "
              f"{money_ha(x['price_gain_eur']):>10} | {s['dli']:5.1f} {s['light_met']:5.2f}")
    print("electricity revenue in €/ha for the day, blind = plant first without looking at the price, best = the rules "
          "with the true weather, ref = days.csv (tracking and oracle), met = share of the light duty")
    print(f"{len(days)} days simulated in {took:.1f} s")
    return 0


def cmd_serve(args) -> int:
    # the app of the chatbot with this planner in it, the planner starts in the background
    if args.live:
        raise Problem("der Live Betrieb ist in dieser Version noch nicht gebaut, bitte ohne --live starten")
    import uvicorn

    from brain.app import create_app

    cfg, folder, work = setup(args)
    host = Host(folder, work, cfg, speed=args.speed, log=lambda s: print(s, flush=True))
    app = create_app(planner=host)
    uvicorn.run(app, host=args.host or cfg["server"]["host"], port=args.port or int(cfg["server"]["port"]))
    return 0


def main(argv=None) -> int:
    try:
        sys.stdout.reconfigure(errors="replace")
        sys.stderr.reconfigure(errors="replace")
    except (AttributeError, ValueError):
        pass
    p = build_parser()
    args = p.parse_args(argv)
    cmds = {"check": cmd_check, "train": cmd_train, "evaluate": cmd_evaluate, "plan": cmd_plan, "sim": cmd_sim,
            "serve": cmd_serve}
    if args.command not in cmds:
        p.print_help()
        return 2
    try:
        return cmds[args.command](args)
    except (Problem, OSError, json.JSONDecodeError) as e:
        err(f"Fehler: {e}")
        return 1
