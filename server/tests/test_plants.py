import json

import pytest

from brain.plants import TABLE, Plant, Table, load, normal, table
from brain.recipe import LIGHT_MAX, LIGHT_MIN

# the column headers of prices.csv in https://www.kaggle.com/datasets/ksamiksha19/vegetable-prices
# (version 3, 2024-01-11), copied exactly. the planner prices a recipe by these names
DATASET_COLUMNS = {
    "Bhindi (Ladies finger)",
    "Tomato",
    "Onion",
    "Potato",
    "Brinjal",
    "Garlic",
    "Peas",
    "Methi",
    "Green Chilli",
    "Elephant Yam (Suran)",
}


def test_the_table_has_exactly_the_plants_of_the_price_dataset():
    assert {p.name for p in load().plants} == DATASET_COLUMNS


def test_the_numbers_are_in_range():
    for p in load().plants:
        assert LIGHT_MIN <= p.light_target <= LIGHT_MAX
        assert p.source


def test_every_row_says_where_its_numbers_come_from():
    # the values are not checked against a source yet, the table must not pretend otherwise
    rows = json.loads(TABLE.read_text("utf-8"))["plants"]
    assert all("unchecked" in row["source"] for row in rows)


@pytest.mark.parametrize(
    "said,name",
    [
        ("Tomaten", "Tomato"),
        ("Paradeiser", "Tomato"),
        ("Okra", "Bhindi (Ladies finger)"),
        ("ladies finger", "Bhindi (Ladies finger)"),
        ("Bhindi (Ladies finger)", "Bhindi (Ladies finger)"),
        ("Auberginen", "Brinjal"),
        ("Melanzani", "Brinjal"),
        ("Erdäpfel", "Potato"),
        (" KARTOFFELN ", "Potato"),
        ("Bockshornklee", "Methi"),
        ("Chili.", "Green Chilli"),
        ("Pfefferoni", "Green Chilli"),
        ("Suran", "Elephant Yam (Suran)"),
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
