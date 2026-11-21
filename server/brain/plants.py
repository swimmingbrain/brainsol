"""the plant table: the facts behind a recipe.

the language model only reads the farmer's words, it never says how much light
a plant wants. that comes from brain/plants.json, looked up by name without any
fuzzy matching, because a near match is a guess too. a plant that is not in the
table is asked back, not guessed. former names of a plant are still found and
still accepted as a pick, so nothing that kept an old name breaks.
"""

from __future__ import annotations

import json
import re
from functools import cache
from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field

from .recipe import LIGHT_MAX, LIGHT_MIN, TEMP_MAX, TEMP_MIN, Names

TABLE = Path(__file__).with_name("plants.json")


class Plant(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # the plant's name in the table, for example "Green chilli", what a pick sends back
    name: str = Field(min_length=1)
    names: Names
    aliases: list[str] = Field(default_factory=list)
    # names the plant had before, for example "Green Chilli", still found and still a pick
    former: list[str] = Field(default_factory=list)
    # daily light integral, mol/m²/day
    light_target: float = Field(ge=LIGHT_MIN, le=LIGHT_MAX)
    # °C, null when the plant has no upper limit worth planning for
    max_temp: float | None = Field(default=None, ge=TEMP_MIN, le=TEMP_MAX)
    # where the numbers come from, so they can be checked
    source: str = Field(min_length=1)

    def words(self) -> set[str]:
        return {normal(w) for w in (self.name, self.names.en, self.names.de, *self.aliases, *self.former)}

    def brief(self) -> dict:
        return {"name": self.name, "names": self.names.model_dump()}


def normal(name: str) -> str:
    """lower case, single spaces, without the punctuation people type around a name"""
    text = name.casefold().strip()
    text = re.sub(r"[\"'.,;:!?()\[\]]", " ", text)
    return " ".join(text.split())


class Table:
    def __init__(self, plants: list[Plant]):
        self.plants = plants
        self.by_name = {p.name: p for p in plants}
        self.by_former = {f: p for p in plants for f in p.former}
        self.by_word: dict[str, Plant] = {}
        for p in plants:
            for w in p.words():
                other = self.by_word.get(w)
                if other and other.name != p.name:
                    raise ValueError(f"{w!r} names both {other.name} and {p.name}")
                self.by_word[w] = p
        if len(self.by_name) != len(plants):
            raise ValueError("a name is used twice in the plant table")

    def pick(self, name: str) -> Plant | None:
        # a plant the farmer picked: its exact name or a former one, never a display name or alias
        return self.by_name.get(name) or self.by_former.get(name)

    def find(self, name: str | None) -> Plant | None:
        if not name:
            return None
        return self.by_word.get(normal(name))

    def known(self) -> list[dict]:
        return [p.brief() for p in self.plants]


def load(path: Path = TABLE) -> Table:
    data = json.loads(path.read_text("utf-8"))
    return Table([Plant.model_validate(row) for row in data["plants"]])


@cache
def table() -> Table:
    return load()
