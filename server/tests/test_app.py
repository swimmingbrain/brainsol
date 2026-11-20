import json

from fastapi.testclient import TestClient

from brain.app import create_app
from brain.llm import LlmError, Settings
from brain.recipe import Extraction


def said(plant):
    return Extraction.model_validate(
        {
            "plant": plant,
            "avoid_sun": [{"from": "11:00", "to": "15:00"}],
            "power_first": [{"from": "17:00", "to": "21:00"}],
        }
    )


class StubLlm:
    def __init__(self, result):
        self.settings = Settings(base_url="http://x", model="stub")
        self.result = result
        self.asked = []

    @property
    def ready(self):
        return True

    async def extract(self, prompt, lang, now=None):
        self.asked.append((prompt, lang))
        if isinstance(self.result, Exception):
            raise self.result
        return self.result


def client(tmp_path, result=None):
    stub = StubLlm(said("Tomaten") if result is None else result)
    return TestClient(create_app(stub, tmp_path, ["http://localhost:5173"])), stub


def test_a_known_plant_gets_its_numbers_from_the_table_and_is_kept(tmp_path):
    c, stub = client(tmp_path)
    assert c.get("/recipe").status_code == 404
    r = c.post("/recipe", json={"prompt": "  Tomaten, ab 17 Uhr Strom ", "lang": "de"})
    assert r.status_code == 200
    recipe = r.json()["recipe"]
    assert recipe["plant"] == "Tomato"
    assert recipe["names"]["de"] == "Tomate"
    assert (recipe["light_target"], recipe["max_temp"]) == (25, 32)
    assert recipe["power_first"] == [{"from": "17:00", "to": "21:00"}]
    assert "unchecked" in recipe["source"]
    assert stub.asked == [("Tomaten, ab 17 Uhr Strom", "de")]
    again = c.get("/recipe")
    assert again.status_code == 200 and again.json()["recipe"]["plant"] == "Tomato"
    saved = json.loads((tmp_path / "recipe.json").read_text("utf-8"))
    assert saved["prompt"] == "Tomaten, ab 17 Uhr Strom"


def test_an_unknown_plant_is_asked_back_and_nothing_is_kept(tmp_path):
    c, _ = client(tmp_path, said("Safran"))
    r = c.post("/recipe", json={"prompt": "Safran, ab 17 Uhr Strom"})
    assert r.status_code == 200
    ask = r.json()["ask"]
    assert ask["plant"] == "Safran"
    assert {"name": "Brinjal", "names": {"en": "Eggplant", "de": "Aubergine"}} in ask["known"]
    assert not (tmp_path / "recipe.json").exists()


def test_words_without_a_plant_are_asked_back(tmp_path):
    c, _ = client(tmp_path, said(None))
    r = c.post("/recipe", json={"prompt": "ab 17 Uhr brauche ich Strom"})
    assert r.json()["ask"]["plant"] is None


def test_a_picked_plant_wins_over_the_words(tmp_path):
    c, _ = client(tmp_path, said("Safran"))
    r = c.post("/recipe", json={"prompt": "Safran, ab 17 Uhr Strom", "plant": "Bhindi (Ladies finger)"})
    recipe = r.json()["recipe"]
    assert recipe["plant"] == "Bhindi (Ladies finger)"
    assert recipe["power_first"] == [{"from": "17:00", "to": "21:00"}]


def test_a_picked_plant_must_be_in_the_table(tmp_path):
    c, stub = client(tmp_path)
    # the exact dataset name only, a display name or alias is not a pick
    r = c.post("/recipe", json={"prompt": "x", "plant": "tomato"})
    assert r.status_code == 400 and r.json()["err"] == "bad"
    assert stub.asked == []


def test_bad_requests_say_bad(tmp_path):
    c, _ = client(tmp_path)
    for body in ({}, {"prompt": ""}, {"prompt": "x" * 1001}, {"prompt": "x", "lang": "fr"}, {"prompt": "   "}):
        r = c.post("/recipe", json=body)
        assert r.status_code == 400, body
        assert r.json()["err"] == "bad"


def test_model_failures_are_passed_on_with_their_code(tmp_path):
    c, _ = client(tmp_path, LlmError("timeout", "too slow"))
    r = c.post("/recipe", json={"prompt": "basil"})
    assert r.status_code == 504 and r.json()["err"] == "timeout"
    c, _ = client(tmp_path, LlmError("llm", "broken", ["plant: too long"]))
    r = c.post("/recipe", json={"prompt": "basil"})
    assert r.status_code == 502 and r.json() == {"err": "llm", "msg": "broken", "detail": ["plant: too long"]}


def test_the_table_is_public(tmp_path):
    c, _ = client(tmp_path)
    plants = c.get("/plants").json()["plants"]
    assert any(p["name"] == "Tomato" and p["light_target"] == 25 for p in plants)


def test_the_page_origin_may_ask(tmp_path):
    c, _ = client(tmp_path)
    r = c.options(
        "/recipe",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    assert r.headers["access-control-allow-origin"] == "http://localhost:5173"


def test_health_names_the_model(tmp_path):
    c, _ = client(tmp_path)
    assert c.get("/health").json() == {"ok": True, "model": "stub"}
