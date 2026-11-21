"""the chatbot and the planner in one process: the seams between them"""
import threading
import time

import pytest
from fastapi.testclient import TestClient

from brain.app import create_app
from brain.llm import LlmError, Settings
from brain.recipe import Extraction
from planner.common import FIX, SMALL
from planner.test_runner import STATE, check
from sonnenteiler import schema
from sonnenteiler.boot import Host

PLAN = {"date", "now", "reachable", "light", "revenue", "hours", "block"}


def said(plant):
    return Extraction.model_validate({"plant": plant, "avoid_sun": [{"from": "11:00", "to": "15:00"}],
                                      "power_first": [{"from": "17:00", "to": "21:00"}]})


class StubLlm:
    def __init__(self, result=None, ready=True):
        self.settings = Settings(base_url="http://x", model="stub" if ready else "")
        self.result = said("Tomaten") if result is None else result
        self._ready = ready
        self.asked = []

    @property
    def ready(self):
        return self._ready

    async def extract(self, prompt, lang, now=None):
        self.asked.append((prompt, lang))
        if isinstance(self.result, Exception):
            raise self.result
        return self.result


def host(work, wait_for=None):
    return Host(FIX, str(work), schema.config(SMALL), log=lambda s: None, wait_for=wait_for)


def wait_ready(h, limit=60.0):
    t0 = time.time()
    while not h.ready:
        assert h.status != "failed", h.error
        assert time.time() - t0 < limit, "the planner did not start"
        time.sleep(0.05)


@pytest.fixture(scope="module")
def work(tmp_path_factory):
    return tmp_path_factory.mktemp("planner")


@pytest.fixture()
def app_with(tmp_path, work):
    # the app with a running planner, the model of the work folder is trained once for the module
    def make(llm=None):
        h = host(work)
        stub = llm or StubLlm()
        app = create_app(stub, tmp_path / "recipes", ["http://localhost:5173"], planner=h)
        return app, h, stub
    return make


def test_without_a_planner_the_chatbot_is_as_before(tmp_path, monkeypatch):
    monkeypatch.delenv("SONNENTEILER_DATA", raising=False)
    with TestClient(create_app(StubLlm(), tmp_path, ["http://localhost:5173"])) as c:
        r = c.post("/recipe", json={"prompt": "Tomaten", "lang": "de"})
        assert r.status_code == 200 and set(r.json()) == {"recipe"}
        assert set(c.get("/recipe").json()) == {"recipe"}
        for path in ("/plan/api/state", "/plan/", "/plan/api/ask"):
            r = c.get(path) if path != "/plan/api/ask" else c.post(path, json={"prompt": "x"})
            assert r.status_code == 503 and "SONNENTEILER_DATA" in r.json()["error"], path


def test_the_start_does_not_wait_for_the_planner(tmp_path):
    # an empty work folder: the planner has to train first
    h = host(tmp_path / "fresh")
    app = create_app(StubLlm(), tmp_path / "recipes", [], planner=h)
    t0 = time.time()
    with TestClient(app) as c:
        entered = time.time() - t0
        assert c.get("/health").json()["ok"] is True
        wait_ready(h)
        assert entered < h.took
        assert c.get("/plan/api/state").status_code == 200


def test_while_the_planner_starts_it_says_so_and_plan_is_null(tmp_path, work):
    gate = threading.Event()
    h = host(work, wait_for=gate)
    with TestClient(create_app(StubLlm(), tmp_path / "recipes", [], planner=h)) as c:
        r = c.get("/plan/api/state")
        assert r.status_code == 503 and r.json()["ok"] is False and "startet" in r.json()["error"]
        assert c.post("/plan/api/recipe", json={"crop": "Tomato"}).status_code == 503
        r = c.post("/recipe", json={"prompt": "Tomaten", "lang": "de"})
        assert r.status_code == 200 and r.json()["plan"] is None and r.json()["recipe"]["plant"] == "Tomato"
        gate.set()
        wait_ready(h)
        assert c.get("/plan/api/state").status_code == 200


def test_state_and_page_under_plan(app_with):
    app, h, _ = app_with()
    with TestClient(app) as c:
        wait_ready(h)
        st = c.get("/plan/api/state")
        assert st.status_code == 200
        check(st.json(), STATE)
        assert st.json()["chatbot"] == {"on": True, "ok": True, "model": "stub", "last": None}
        page = c.get("/plan/")
        assert page.status_code == 200 and "text/html" in page.headers["content-type"]
        assert 'src="app.js"' in page.text
        assert c.get("/plan/app.js").status_code == 200 and c.get("/plan/style.css").status_code == 200
        # without the slash it goes to the page, relative so a prefix of a proxy stays
        r = c.get("/plan", follow_redirects=False)
        assert r.status_code == 307 and r.headers["location"] == "plan/"
        for route in ("plan", "recipe", "recipe/schema", "days", "health"):
            assert c.get(f"/plan/api/{route}").status_code == 200, route


def check_plan(plan):
    assert set(plan) == PLAN
    assert len(plan["light"]["dli_end"]) == 3 and len(plan["revenue"]["elec_end_eur_ha"]) == 3
    assert set(plan["light"]) == {"dli", "dli_target", "dli_end"}
    assert set(plan["revenue"]) == {"elec_end_eur_ha", "plant_cost_eur_ha", "plant_cost_share"}
    assert set(plan["block"]) == {"from", "to"} and isinstance(plan["reachable"], bool)
    for hour in plan["hours"]:
        assert set(hour) == {"from", "to", "offset", "why", "price"}
        assert hour["why"] in ("sun", "light", "price", "stress", "shade", "power_hour")
        assert isinstance(hour["offset"], int) and 0 <= hour["offset"] <= 90
    assert len(plan["date"]) == 10 and len(plan["now"]) == 5


def test_a_recipe_from_the_tab_goes_to_the_planner(app_with):
    app, h, stub = app_with()
    with TestClient(app) as c:
        wait_ready(h)
        v = c.get("/plan/api/plan").json()["version"]
        r = c.post("/recipe", json={"prompt": "Tomaten, keine Mittagssonne, ab 17 Uhr Strom", "lang": "de"})
        assert r.status_code == 200
        body = r.json()
        assert set(body) == {"recipe", "plan"} and body["recipe"]["plant"] == "Tomato"
        check_plan(body["plan"])
        st = c.get("/plan/api/state").json()
        assert st["recipe"]["crop"] == "Tomato" and st["recipe"]["shade_hours"] == [[11.0, 15.0]]
        assert st["plan"]["version"] == v + 1 and st["chatbot"]["last"]["via"] == "tab"
        assert any("Pflanzen Tab" in x["text"] for x in st["log"])
        again = c.get("/recipe").json()
        assert set(again) == {"recipe", "plan"}
        check_plan(again["plan"])


def test_the_field_on_the_plan_page_takes_the_same_way(app_with):
    app, h, stub = app_with()
    with TestClient(app) as c:
        wait_ready(h)
        r = c.post("/plan/api/ask", json={"prompt": "Tomaten, keine Mittagssonne"})
        assert r.status_code == 200
        body = r.json()
        assert set(body) == {"ok", "recipe", "report", "plan", "chatbot"} and body["ok"]
        assert body["recipe"]["crop"] == "Tomato" and body["chatbot"]["plant"] == "Tomato"
        assert stub.asked[-1] == ("Tomaten, keine Mittagssonne", "de")
        assert c.get("/plan/api/state").json()["chatbot"]["last"]["via"] == "ask"
        # the recipe is kept like one from the tab
        assert c.get("/recipe").json()["recipe"]["plant"] == "Tomato"
        assert c.post("/plan/api/ask", content=b"Tomaten bitte").status_code == 200


def test_an_ask_back_changes_nothing(app_with):
    app, h, stub = app_with(StubLlm(said("Safran")))
    with TestClient(app) as c:
        wait_ready(h)
        before = c.get("/plan/api/plan").json()["version"]
        r = c.post("/plan/api/ask", json={"prompt": "Safran"})
        assert r.status_code == 200 and set(r.json()) == {"ok", "ask"} and r.json()["ask"]["plant"] == "Safran"
        r = c.post("/recipe", json={"prompt": "Safran"})
        assert set(r.json()) == {"ask"}
        st = c.get("/plan/api/state").json()
        assert st["plan"]["version"] == before and st["chatbot"]["last"] is None


def test_errors_of_the_language_model_on_the_plan_page(app_with):
    for result, status, code in ((LlmError("llm", "broken"), 502, "llm"), (LlmError("timeout", "slow"), 504, "timeout")):
        app, h, _ = app_with(StubLlm(result))
        with TestClient(app) as c:
            wait_ready(h)
            r = c.post("/plan/api/ask", json={"prompt": "Tomaten"})
            assert r.status_code == status and r.json()["ok"] is False and r.json()["code"] == code
            assert r.json()["error"][:1].isupper()
    app, h, _ = app_with(StubLlm(ready=False))
    with TestClient(app) as c:
        wait_ready(h)
        r = c.post("/plan/api/ask", json={"prompt": "Tomaten"})
        assert r.status_code == 400 and r.json()["code"] == "off"
        assert c.get("/plan/api/state").json()["chatbot"]["ok"] is False
        r = c.post("/plan/api/ask", json={"lang": "de"})
        assert r.status_code == 400 and r.json()["code"] == "bad"


def test_the_routes_of_the_planner(app_with):
    app, h, _ = app_with()
    with TestClient(app) as c:
        wait_ready(h)
        r = c.post("/plan/api/recipe", json={"recipe": {"plant": "Zwiebel", "light_target": "24"}})
        assert r.status_code == 200 and set(r.json()) == {"ok", "recipe", "report", "plan"}
        assert c.post("/plan/api/recipe", content=b"Tomate").json()["recipe"]["crop"] == "Tomato"
        r = c.post("/plan/api/whatif", json=[{"crop": "Tomato", "dli_target": 30}])
        assert set(r.json()) == {"ok", "recipe", "report", "expect", "cost", "light_price", "reachable", "first_guess"}
        assert c.post("/plan/api/speed", json={"speed": 720}).json()["speed"] == 720
        assert c.post("/plan/api/cloud", json={"minutes": 30, "factor": 0.2}).json()["ok"]
        assert c.get("/plan/api/state").json()["day"]["touched"] is True
        assert c.post("/plan/api/reset", json={}).json()["ok"]
        assert c.post("/plan/api/day", json={"date": "2025-06-01"}).json()["date"] == "2025-06-01"
        for path, body in (("day", {"date": "1999-01-01"}), ("speed", {}), ("cloud", {"minutes": -5}),
                           ("recipe", 42), ("measure", [{"t": 1}])):
            r = c.post(f"/plan/api/{path}", json=body)
            assert r.status_code == 400 and r.json()["ok"] is False and r.json()["error"][:1].isalpha(), path
        r = c.post("/plan/api/day", content=b"{nope")
        assert r.status_code == 400 and "JSON" in r.json()["error"]
        assert c.get("/plan/api/nothing").status_code == 404
        assert c.post("/plan/api/objective", json={"objective": "target"}).status_code == 404
