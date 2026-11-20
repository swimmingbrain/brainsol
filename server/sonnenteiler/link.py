from __future__ import annotations

import threading
import time


class Link:
    # what the planner knows of the chatbot it shares the process with: whether there is one, whether its
    # language model is set up, and the last recipe that came from it
    def __init__(self, on: bool = False, ok: bool | None = None, model: str | None = None):
        self.on = on
        self.ok = ok
        self.model = model
        self.last = None
        self.lock = threading.Lock()

    def status(self) -> dict:
        with self.lock:
            if not self.on:
                return {"on": False, "ok": None, "model": None, "last": None}
            return {"on": True, "ok": self.ok, "model": self.model, "last": dict(self.last) if self.last else None}

    def taken(self, recipe: dict, via: str) -> None:
        # via: ask for the field on the planner's page, tab for the plant tab of the tracker's page
        with self.lock:
            self.last = {"t": int(time.time()), "plant": recipe.get("plant"), "via": via}
