import pytest
from pydantic import ValidationError

from brain.recipe import PERIODS, Extraction, Recipe, Said, Spoken, Window, llm_schema, merge


def tomato(**over):
    base = {
        "plant": "Tomato",
        "names": {"en": "Tomato", "de": "Tomate"},
        "light_target": 25,
        "max_temp": 32,
        "avoid_sun": [{"from": "11:00", "to": "15:00"}],
        "power_first": [{"from": "17:00", "to": "21:00"}],
        "source": "unchecked",
    }
    return {**base, **over}


def test_a_good_recipe_keeps_its_wire_names():
    wire = Recipe.model_validate(tomato()).wire()
    assert wire["v"] == 3
    assert wire["plant"] == "Tomato"
    assert wire["names"] == {"en": "Tomato", "de": "Tomate"}
    assert wire["avoid_sun"] == [{"from": "11:00", "to": "15:00"}]
    assert wire["power_first"] == [{"from": "17:00", "to": "21:00"}]


def test_the_version_is_always_ours():
    assert Recipe.model_validate(tomato(v=7)).v == 3


@pytest.mark.parametrize("light", [0, 0.5, 41, 100])
def test_light_out_of_range_is_refused(light):
    with pytest.raises(ValidationError):
        Recipe.model_validate(tomato(light_target=light))


def test_temperature_may_be_unknown_but_not_absurd():
    assert Recipe.model_validate(tomato(max_temp=None)).max_temp is None
    with pytest.raises(ValidationError):
        Recipe.model_validate(tomato(max_temp=80))


def test_an_extraction_carries_no_numbers_and_an_empty_plant_is_none():
    e = Extraction.model_validate({"plant": "  ", "light_target": 99, "power_first": [{"from": "17:00", "to": "21:00"}]})
    assert e.plant is None
    assert not hasattr(e, "light_target")
    assert e.power_first[0].start == "17:00"


@pytest.mark.parametrize("start,end", [("15:00", "11:00"), ("12:00", "12:00"), ("25:00", "26:00"), ("noon", "13:00")])
def test_bad_windows_are_refused(start, end):
    with pytest.raises(ValidationError):
        Window.model_validate({"from": start, "to": end})


def test_single_digit_hours_and_midnight_are_read():
    w = Window.model_validate({"from": "9:30", "to": "24:00"})
    assert (w.start, w.end) == ("09:30", "24:00")


def test_overlapping_and_touching_windows_are_joined_and_sorted():
    out = merge(
        [
            Window.model_validate({"from": "17:00", "to": "19:00"}),
            Window.model_validate({"from": "11:00", "to": "13:00"}),
            Window.model_validate({"from": "12:30", "to": "15:00"}),
            Window.model_validate({"from": "19:00", "to": "21:00"}),
        ]
    )
    assert [(w.start, w.end) for w in out] == [("11:00", "15:00"), ("17:00", "21:00")]


def test_the_model_is_only_asked_for_name_and_hours():
    schema = llm_schema()
    assert set(schema["properties"]) == {"plant", "avoid_sun", "power_first"}
    assert set(schema["$defs"]["Said"]["properties"]) == {"period", "from", "to"}


@pytest.mark.parametrize("period,hours", list(PERIODS.items()))
def test_a_named_part_of_the_day_gets_fixed_hours_even_if_the_model_adds_some(period, hours):
    w = Said.model_validate({"period": period, "from": "11:00", "to": "18:00"}).window()
    assert (w.start, w.end) == hours


def test_an_open_end_lasts_until_the_sun_is_gone():
    w = Said.model_validate({"from": "17:30"}).window()
    assert (w.start, w.end) == ("17:30", "21:00")


def test_a_window_needs_a_period_or_a_start():
    with pytest.raises(ValueError):
        Said.model_validate({"to": "15:00"}).window()
    with pytest.raises(ValueError):
        Said.model_validate({"period": "night"})


def test_spoken_windows_resolve_and_merge():
    e = Spoken.model_validate(
        {"plant": "x", "avoid_sun": [{"period": "midday"}, {"from": "14:00", "to": "16:00"}], "power_first": []}
    ).resolve()
    assert [(w.start, w.end) for w in e.avoid_sun] == [("11:00", "16:00")]
