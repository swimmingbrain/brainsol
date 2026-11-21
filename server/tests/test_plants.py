import json
import re

import pytest

from brain.plants import TABLE, Plant, Table, load, normal, table
from brain.recipe import LIGHT_MAX, LIGHT_MIN

# the ten plants by their plain english names, and the names four of them had before
NAMES = {"Okra", "Tomato", "Onion", "Potato", "Aubergine", "Garlic", "Peas", "Fenugreek", "Green chilli",
         "Elephant foot yam"}
FORMER = {"Bhindi (Ladies finger)": "Okra", "Brinjal": "Aubergine", "Methi": "Fenugreek",
          "Green Chilli": "Green chilli", "Elephant Yam (Suran)": "Elephant foot yam"}


def test_the_table_has_the_ten_plants():
    assert {p.name for p in load().plants} == NAMES


def test_former_names_are_still_found_and_still_a_pick():
    for old, new in FORMER.items():
        assert table().find(old).name == new
        assert table().pick(old).name == new
    assert table().pick("Okra").name == "Okra"
    # a pick is an exact name, not a display name or alias
    assert table().pick("tomato") is None and table().pick("Tomate") is None


def test_the_numbers_are_in_range():
    for p in load().plants:
        assert LIGHT_MIN <= p.light_target <= LIGHT_MAX
        assert p.source


def test_every_row_says_where_its_numbers_come_from():
    # the temperature is read from the fao ecocrop sheet of the plant, the light is not checked yet
    # and the table must not pretend otherwise
    rows = json.loads(TABLE.read_text("utf-8"))["plants"]
    for row in rows:
        assert "light_target: unchecked" in row["source"]
        assert "FAO ECOCROP, https://ecocrop.apps.fao.org/ecocrop/srv/en/dataSheet?id=" in row["source"]
    # one sheet per plant, two plants never share a sheet
    sheets = [re.search(r"dataSheet\?id=(\d+)", row["source"]).group(1) for row in rows]
    assert len(set(sheets)) == len(rows)


@pytest.mark.parametrize(
    "said,name",
    [
        ("Tomaten", "Tomato"),
        ("Paradeiser", "Tomato"),
        ("Okra", "Okra"),
        ("ladies finger", "Okra"),
        ("Bhindi (Ladies finger)", "Okra"),
        ("Auberginen", "Aubergine"),
        ("Melanzani", "Aubergine"),
        ("Eggplant", "Aubergine"),
        ("Erdäpfel", "Potato"),
        (" KARTOFFELN ", "Potato"),
        ("Bockshornklee", "Fenugreek"),
        ("Chili.", "Green chilli"),
        ("Pfefferoni", "Green chilli"),
        ("Suran", "Elephant foot yam"),
        ("Zwiebeln", "Onion"),
        ("Erbsen", "Peas"),
        ("garlic", "Garlic"),
    ],
)
def test_names_in_both_languages_and_plurals_are_found(said, name):
    assert table().find(said).name == name


@pytest.mark.parametrize("said", ["Basilikum", "Paprika", "Kirschtomaten", "Tomat", "Süßkartoffel", "", None])
def test_anything_else_is_not_guessed(said):
    assert table().find(said) is None


def test_a_word_for_two_plants_is_refused():
    rows = json.loads(TABLE.read_text("utf-8"))["plants"]
    plants = [Plant.model_validate(r) for r in rows[:2]]
    plants[1].aliases.append(plants[0].names.de)
    with pytest.raises(ValueError):
        Table(plants)


def test_normal_folds_case_space_and_punctuation():
    assert normal('  "Bhindi   (Ladies finger)"! ') == "bhindi ladies finger"
