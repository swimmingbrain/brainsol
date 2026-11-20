from __future__ import annotations

from collections import OrderedDict

import numpy as np

from . import recipe as rc
from .planner import Day, Planner, Run, Terms
from .scene import Scene

# known sites for a readable name, the dataset only has coordinates
SITES = (("Dornbirn", 47.41, 9.74), ("Wien", 48.21, 16.37))


class Context:
    # what every part of the service shares: dataset, scene model, nowcast, planner
    def __init__(self, ds, cast, cfg: dict):
        self.ds = ds
        self.cast = cast
        self.cfg = cfg
        self.scene = Scene(ds.scene, ds.offsets, ds.wm2_per_mw)
        self.planner = Planner(ds, self.scene, cast, cfg)
        self.zero = int(np.argmin(np.abs(ds.offsets)))
        self._days: OrderedDict = OrderedDict()

    def day(self, d: int) -> Day:
        if d not in self._days:
            self._days[d] = Day(self.ds, self.scene, d, int(self.cfg["block_h"]))
            while len(self._days) > 4:
                self._days.popitem(last=False)
        self._days.move_to_end(d)
        return self._days[d]

    def run(self, d: int) -> Run:
        return Run(self.day(d), self.scene, self.zero)

    def site_name(self) -> str:
        if self.cfg.get("site_name"):
            return str(self.cfg["site_name"])
        lat, lon = float(self.ds.scene["lat"]), float(self.ds.scene["lon"])
        for name, a, b in SITES:
            if abs(lat - a) < 0.1 and abs(lon - b) < 0.1:
                return name
        return f"Standort {lat:.2f}, {lon:.2f}"

    # recipes

    def book(self, d: int | None) -> rc.Book:
        return rc.Book(self.ds.recipes, self.ds.clear_dli(d) if d is not None else None)

    def intake(self, body, d: int | None) -> tuple[dict, dict]:
        return rc.intake(body, self.book(d))

    def terms(self, day: Day, recipe: dict) -> Terms:
        return Terms(day, recipe, float(self.cfg["elec_price_default_eur_mwh"]))

    def dataset_recipe(self, recipe: dict) -> dict | None:
        # the dataset recipe this one equals, so days.csv can be its reference
        r = next((x for x in self.ds.recipes if x["name"] == recipe["name"]), None)
        return r if r is not None and rc.same_as(recipe, r) else None

    def default_recipe(self) -> dict:
        start = self.cfg.get("recipe")
        if start is None:
            start = dict(self.ds.recipes[0]) if self.ds.recipes else {}
        r, _ = self.intake(start, None)
        return r
