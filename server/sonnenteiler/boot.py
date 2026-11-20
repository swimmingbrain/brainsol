from __future__ import annotations

import hashlib
import json
import os
import sys
import tempfile
import threading
import time

from . import dataset, evaluate, nowcast, schema
from .context import Context
from .link import Link
from .runner import Runner


def err(text: str) -> None:
    print(text, file=sys.stderr, flush=True)


def folders(cfg: dict, data: str | None, work: str | None) -> tuple[str, str]:
    folder = dataset.find_folder(data, cfg)
    work = work or cfg.get("work") or os.environ.get("SONNENTEILER_WORK") or \
        os.path.join(tempfile.gettempdir(), "sonnenteiler")
    os.makedirs(work, exist_ok=True)
    return folder, work


def paths(work: str, ds, cfg: dict) -> dict:
    key = nowcast.model_key(ds.key, cfg)
    # the evaluation also changes with the settings of the planner
    plan = {k: cfg[k] for k in ("planner", "hold_min", "block_h", "elec_price_default_eur_mwh")}
    ekey = hashlib.sha1(json.dumps({"model": key, "plan": plan, "v": evaluate.VERSION}, sort_keys=True).encode()).hexdigest()[:16]
    return {"key": key, "eval_key": ekey, "nowcast": os.path.join(work, f"nowcast-{key}.npz"),
            "eval": os.path.join(work, f"eval-{ekey}.json"), "scene": os.path.join(work, f"scene-{ds.key}.json")}


def scene_check(ds, ctx, path: str, log=err) -> dict | None:
    if os.path.isfile(path):
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    t0 = time.time()
    got = dataset.scene_check(ds, ctx.scene)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(got, f)
    if got:
        log(f"Formelprüfung mit {got['rows']} Zeilen von alternatives.csv in {time.time() - t0:.1f} s")
    return got


class Prepared:
    def __init__(self, **kw):
        self.__dict__.update(kw)


def prepare(cfg: dict, folder: str, work: str, train: str = "missing", log=err, study: bool = False) -> Prepared:
    # dataset, nowcast, evaluation and formula check, trained when the work folder has nothing for this data
    t0 = time.time()
    ds = dataset.load(folder, work, cfg["columns"], log)
    p = paths(work, ds, cfg)
    cast = None if train == "always" else nowcast.Nowcast.load(p["nowcast"], p["key"])
    trained = False
    if cast is None:
        cast = nowcast.train(ds, cfg, p["key"], log)
        cast.save(p["nowcast"])
        trained = True
    ctx = Context(ds, cast, cfg)
    quantiles = evaluate.quantile_study(ctx, log=log) if study else None
    ev = None if trained else evaluate.load(p["eval"], p["eval_key"])
    if ev is None:
        ev = evaluate.evaluate(ctx, log)
        evaluate.save(p["eval"], ev, p["eval_key"])
    sc = scene_check(ds, ctx, p["scene"], log)
    return Prepared(cfg=cfg, ctx=ctx, ev=ev, sc=sc, took=time.time() - t0, trained=trained, quantiles=quantiles)


class Host:
    """the planner next to the chatbot in one process. it starts in its own thread, parses the data, trains
    when the work folder has nothing for it, evaluates, then runs the clock of the simulation. until then
    every caller gets a sentence instead of the runner"""

    def __init__(self, data: str | None, work: str | None = None, cfg: dict | None = None, speed: float | None = None,
                 log=err, link: Link | None = None, wait_for: threading.Event | None = None,
                 config_path: str | None = None):
        self.data = data
        self.work = work
        self.cfg = cfg
        self.config_path = config_path
        self.speed = speed
        self.log = log
        self.link = link or Link(on=True)
        self.runner: Runner | None = None
        self.status = "starting"
        self.error = None
        self.started = None
        self.took = None
        self.stop_event = threading.Event()
        # a test can hold the start back to see the planner while it starts
        self.wait_for = wait_for
        self.thread = None

    @classmethod
    def from_env(cls, log=err) -> Host | None:
        # SONNENTEILER_DATA turns the planner on, SONNENTEILER_WORK and SONNENTEILER_CONFIG are optional
        data = os.environ.get("SONNENTEILER_DATA")
        if not data:
            return None
        return cls(data, os.environ.get("SONNENTEILER_WORK") or None, log=log,
                   config_path=os.environ.get("SONNENTEILER_CONFIG") or None)

    @property
    def ready(self) -> bool:
        return self.status == "ready" and self.runner is not None

    def start(self) -> None:
        if self.thread is not None:
            return
        self.started = time.time()
        self.thread = threading.Thread(target=self._run, name="planner", daemon=True)
        self.thread.start()

    def _run(self) -> None:
        try:
            if self.wait_for is not None:
                self.wait_for.wait()
            if self.stop_event.is_set():
                return
            if self.cfg is None:
                self.cfg = schema.load_config(self.config_path)
            folder, work = folders(self.cfg, self.data, self.work)
            got = prepare(self.cfg, folder, work, log=self.log)
            runner = Runner(got.ctx, speed=self.speed, evaluation=got.ev, scene_check=got.sc, echo=self.log,
                            link=self.link)
            self.runner = runner
            self.took = time.time() - self.started
            self.status = "ready"
            self.log(f"Planer bereit nach {self.took:.1f} s{' mit Training' if got.trained else ''}")
        except Exception as e:  # the chatbot keeps running, the planner says what went wrong
            self.status = "failed"
            self.error = str(e)
            self.log(f"Planer nicht gestartet: {e}")
            return
        runner.run_forever(self.stop_event)

    def stop(self) -> None:
        self.stop_event.set()
        if self.wait_for is not None:
            self.wait_for.set()
        if self.thread is not None:
            self.thread.join(timeout=5.0)

    def unavailable(self) -> str:
        # one german sentence while there is no runner
        if self.status == "failed":
            return f"Der Planer konnte nicht starten: {self.error}"
        return "Der Planer startet noch, er liest die Daten und trainiert beim ersten Start die Vorhersage"
