import json

import pytest

from sonnenteiler import recipe as rc


@pytest.fixture()
def book(ds):
    return rc.Book(ds.recipes, clear_dli=60.0)


def test_teammate_format(book):
    body = {"name": "chilli", "crop": "Green Chilli", "dli_target": 25, "max_ppfd": 1500, "tmax_c": 32,
            "power_hours": [[17, 21]], "yield_g_mol": 0.4}
    r, rep = rc.intake(body, book)
    # the dataset spells it "Green Chilli", the plant table of the chatbot "Green chilli"
    assert r["name"] == "chilli" and r["crop"] == "Green chilli"
    assert r["power_hours"] == [[17.0, 21.0]] and r["max_ppfd"] == 1500.0
    assert set(r) == {*rc.KEYS, "extra"}
    assert sorted(rep["understood"]) == sorted(k for k in body if k != "yield_g_mol")
    assert set(rep["defaulted"]) == {"shade_hours", "elec_price_eur_mwh", "note"}
    # the harvest per mol has no meaning any more, it is taken without complaint
    assert rep["ignored"] == ["yield_g_mol"] and rep["warnings"] == []
    assert set(rep) == {"understood", "defaulted", "ignored", "warnings"}


def test_first_version_format(book):
    body = {"plant": "Tomate", "light_target": 0.5, "light_unit": "share", "lux_max": 99000, "temp_max": 30,
            "power_windows": [{"from": "17:00", "to": "20:30", "weight": 2.0}], "note": "vom Bauern"}
    r, rep = rc.intake(body, book)
    assert r["crop"] == "Tomato" and r["name"] == "tomato"
    assert r["dli_target"] == pytest.approx(30.0)
    assert r["max_ppfd"] == pytest.approx(99000 / 110 * 2.02)
    assert r["tmax_c"] == 30.0
    assert r["power_hours"] == [[17.0, 20.5]]
    assert set(rep["understood"]) == set(body)
    assert any("weight" in w for w in rep["warnings"])
    assert any("60 mol" in w for w in rep["warnings"])


def test_klxh_and_mol_units(book):
    r, _ = rc.intake({"plant": "Kartoffel", "light_target": 300, "light_unit": "klxh"}, book)
    assert r["crop"] == "Potato" and r["dli_target"] == pytest.approx(300 * 0.0661)
    # the potato recipe of the dataset gives the rest
    assert r["power_hours"] == [[18.0, 22.0]] and r["max_ppfd"] == 2000.0
    r, _ = rc.intake({"plant": "Kartoffel", "light_target": 20, "light_unit": "mol"}, book)
    assert r["dli_target"] == 20.0


def test_wrapper_list_and_json_string(book):
    inner = {"crop": "Tomato", "dli_target": 22}
    for body in ({"recipe": inner}, [inner, {"crop": "Onion"}], json.dumps(inner), json.dumps({"recipe": inner})):
        r, rep = rc.intake(body, book)
        assert r["crop"] == "Tomato" and r["dli_target"] == 22.0, body
    _, rep = rc.intake([inner, {"crop": "Onion"}], book)
    assert any("erste" in w for w in rep["warnings"])


def test_plain_text_is_a_crop_name(book):
    r, rep = rc.intake("Knoblauch", book)
    assert r["crop"] == "Garlic" and r["name"] == "garlic"
    assert rep["warnings"]


@pytest.mark.parametrize("german, crop", [("Tomate", "Tomato"), ("kartoffel", "Potato"), ("ZWIEBEL", "Onion"),
                                          ("Chili", "Green chilli"), ("Knoblauch", "Garlic"), ("Erbsen", "Peas"),
                                          ("Aubergine", "Aubergine"), ("Okra", "Okra"),
                                          ("Bockshornklee", "Fenugreek"), ("tomato", "Tomato"),
                                          ("green chilli", "Green chilli"), ("Green Chilli", "Green chilli"),
                                          ("Brinjal", "Aubergine"), ("Bhindi (Ladies finger)", "Okra"),
                                          ("Methi", "Fenugreek"), ("Elephant Yam (Suran)", "Elephant foot yam")])
def test_german_and_case_free_names(book, german, crop):
    r, _ = rc.intake({"crop": german}, book)
    assert r["crop"] == crop


def test_unknown_keys_go_to_extra(book):
    r, rep = rc.intake({"crop": "Tomato", "farmer": "Huber", "soil": {"ph": 6.5}}, book)
    assert r["extra"] == {"farmer": "Huber", "soil": {"ph": 6.5}}
    assert sorted(rep["ignored"]) == ["farmer", "soil"]
    assert rep["understood"] == ["crop"]


def test_missing_keys_come_from_the_crop_then_tomato(book):
    r, rep = rc.intake({"crop": "Green chilli"}, book)
    assert r["name"] == "chilli" and r["max_ppfd"] == 1500.0 and r["power_hours"] == [[17.0, 21.0]]
    assert "dli_target" in rep["defaulted"] and "crop" not in rep["defaulted"]
    r, rep = rc.intake({}, book)
    assert r["crop"] == "Tomato" and r["dli_target"] == 25.0 and r["max_ppfd"] == 1800.0
    r, rep = rc.intake({"crop": "Garlic"}, book)
    assert r["crop"] == "Garlic" and r["dli_target"] == 25.0 and r["max_ppfd"] == 1800.0


def test_numbers_as_strings_and_hours_in_many_forms(book):
    r, rep = rc.intake({"crop": "Tomato", "dli_target": "22,5", "max_ppfd": "1600 µmol", "tmax_c": " 31 ",
                        "power_hours": ["17-21"], "elec_price_eur_mwh": "80,5"}, book)
    assert r["dli_target"] == 22.5 and r["max_ppfd"] == 1600.0 and r["tmax_c"] == 31.0
    assert r["power_hours"] == [[17.0, 21.0]] and r["elec_price_eur_mwh"] == 80.5
    for hours in ([{"from": 17, "to": 21}], [[17, 21]], [17, 21], "17-21", ["17:00-21:00"], [{"from": "17:00", "to": "21:00"}]):
        r, _ = rc.intake({"crop": "Tomato", "power_hours": hours}, book)
        assert r["power_hours"] == [[17.0, 21.0]], hours


def test_out_of_range_values_are_clamped_and_reported(book):
    r, rep = rc.intake({"crop": "Tomato", "dli_target": 500, "max_ppfd": -3, "tmax_c": 99,
                        "power_hours": [[22, 2]], "elec_price_eur_mwh": 99999}, book)
    assert r["dli_target"] == 80.0 and r["max_ppfd"] == 50.0 and r["tmax_c"] == 60.0
    assert r["power_hours"] == [[22.0, 24.0], [0.0, 2.0]] and r["elec_price_eur_mwh"] == 5000.0
    text = " ".join(rep["warnings"])
    for k in ("dli_target", "max_ppfd", "tmax_c", "Mitternacht", "elec_price_eur_mwh"):
        assert k in text


def test_old_keys_are_ignored_without_error(book):
    old = {"crop": "Peas", "objective": "target", "yield_g_mol": 2, "crop_price_eur_kg": 3.5}
    r, rep = rc.intake(old, book)
    assert r["crop"] == "Peas" and set(r) == {*rc.KEYS, "extra"}
    assert sorted(rep["ignored"]) == ["crop_price_eur_kg", "objective", "yield_g_mol"]
    assert rep["warnings"] == [] and rep["understood"] == ["crop"]
    assert r["extra"] == {"objective": "target", "yield_g_mol": 2, "crop_price_eur_kg": 3.5}


def test_only_a_body_that_is_no_object_list_or_string_fails(book):
    for bad in (42, 3.5, True, None):
        with pytest.raises(rc.NotARecipe):
            rc.intake(bad, book)


def test_same_as_a_dataset_recipe(ds, book):
    r, _ = rc.intake(ds.recipes[0], book)
    assert rc.same_as(r, ds.recipes[0])
    r2, _ = rc.intake({**ds.recipes[0], "dli_target": 20}, book)
    assert not rc.same_as(r2, ds.recipes[0])
    r3, _ = rc.intake({**ds.recipes[0], "elec_price_eur_mwh": 80}, book)
    assert not rc.same_as(r3, ds.recipes[0])
    # a dataset recipe without a crop still counts by its name
    r4, _ = rc.intake({k: v for k, v in ds.recipes[0].items() if k not in ("crop", "yield_g_mol")}, book)
    assert rc.same_as(r4, {k: v for k, v in ds.recipes[0].items() if k != "crop"})


CHATBOT = {"v": 3, "plant": "Tomato", "names": {"en": "Tomato", "de": "Tomate"}, "light_target": 25, "max_temp": 32,
           "avoid_sun": [{"from": "11:00", "to": "15:00"}], "power_first": [{"from": "17:00", "to": "21:00"}],
           "source": "unchecked, from memory: ..."}


def test_chatbot_recipe_with_windows(book):
    r, rep = rc.intake(CHATBOT, book)
    assert r["crop"] == "Tomato" and r["name"] == "tomato" and r["dli_target"] == 25.0 and r["tmax_c"] == 32.0
    assert r["shade_hours"] == [[11.0, 15.0]] and r["power_hours"] == [[17.0, 21.0]]
    # the dataset recipe of the crop gives what the chatbot does not send
    assert r["max_ppfd"] == 1800.0 and "max_ppfd" in rep["defaulted"]
    assert r["extra"] == {"v": 3, "names": CHATBOT["names"], "source": CHATBOT["source"]}
    assert rep["warnings"] == [] and rep["ignored"] == []
    assert set(rep["understood"]) == set(CHATBOT)
    # the wrapper the chatbot answers with is read as well
    assert rc.intake({"recipe": CHATBOT}, book)[0] == r


def test_chatbot_recipe_without_windows_and_without_max_temp(book):
    r, rep = rc.intake({**CHATBOT, "plant": "Green chilli", "max_temp": None, "avoid_sun": [], "power_first": [],
                        "light_target": 20}, book)
    assert r["crop"] == "Green chilli" and r["name"] == "chilli" and r["dli_target"] == 20.0
    # null keeps the value of the crop, the chilli recipe of the dataset says 32
    assert r["tmax_c"] == 32.0 and "tmax_c" in rep["defaulted"]
    assert r["shade_hours"] == [] and r["power_hours"] == []


def test_chatbot_crop_without_a_dataset_recipe(book):
    r, rep = rc.intake({**CHATBOT, "plant": "Garlic", "names": {"en": "Garlic", "de": "Knoblauch"},
                        "light_target": 15, "max_temp": 28}, book)
    assert r["crop"] == "Garlic" and r["name"] == "garlic"
    assert r["dli_target"] == 15.0 and r["tmax_c"] == 28.0
    # the general default for what the chatbot does not send
    assert r["max_ppfd"] == 1800.0 and "max_ppfd" in rep["defaulted"]


def test_chatbot_midnight_and_half_hours(book):
    r, _ = rc.intake({**CHATBOT, "avoid_sun": [{"from": "11:30", "to": "14:45"}],
                      "power_first": [{"from": "20:30", "to": "24:00"}]}, book)
    assert r["shade_hours"] == [[11.5, 14.75]] and r["power_hours"] == [[20.5, 24.0]]


def test_light_target_without_unit(book):
    assert rc.intake({"crop": "Tomato", "light_target": 12}, book)[0]["dli_target"] == 12.0
    r, rep = rc.intake({"crop": "Tomato", "light_target": 0.5}, book)
    assert r["dli_target"] == pytest.approx(30.0) and any("Anteil" in w for w in rep["warnings"])


def test_shade_hours_are_no_dataset_recipe(ds, book):
    r, _ = rc.intake({**ds.recipes[0], "shade_hours": [[11, 15]]}, book)
    assert r["shade_hours"] == [[11.0, 15.0]] and not rc.same_as(r, ds.recipes[0])


def test_schema_lists_keys_crops_and_german_names(ctx):
    s = rc.schema(ctx.book(0))
    assert set(rc.KEYS) == set(s["keys"])
    assert s["keys"]["dli_target"]["unit"] == "mol/m²/Tag"
    assert any(c["crop"] == "Tomato" and c["german"] == "Tomate" and c["recipe"] == "tomato" for c in s["crops"])
    assert len(s["crops"]) == 10 and s["ignored_keys"] == ["yield_g_mol", "crop_price_eur_kg", "objective"]
    assert s["german_names"]["Tomate"] == "Tomato"
    assert "shade_hours" in s["keys"] and any("avoid_sun" in a for a in s["keys"]["shade_hours"]["aliases"])
    assert any("power_first" in a for a in s["keys"]["power_hours"]["aliases"])
    assert s["chatbot_keys"]["max_temp"] == "tmax_c"


def test_max_ppfd_from_the_dataset_recipe_of_the_crop_by_name(book):
    # tomato, potato, onion and chilli have a dataset recipe, the others take the general default
    for plant, ppfd, name in (("Tomato", 1800.0, "tomato"), ("Potato", 2000.0, "potato"), ("Onion", 2000.0, "onion"),
                              ("Green chilli", 1500.0, "chilli"), ("Aubergine", 1800.0, "aubergine"),
                              ("Okra", 1800.0, "okra")):
        r, rep = rc.intake({**CHATBOT, "plant": plant}, book)
        assert (r["max_ppfd"], r["name"]) == (ppfd, name), plant
        assert "max_ppfd" in rep["defaulted"]
