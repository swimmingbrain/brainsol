"""the recipe and what the language model extracts for it.

the model only extracts the plant's name and the hours (Extraction), the plant's
numbers come from the plant table (plants.py), together they make the Recipe.
this is the single source of truth for both shapes. the page mirrors the recipe
in src/lib/farm/recipe.ts. times are local wall clock "HH:MM" because that is
how the farmer speaks, the planner converts them later.
"""

from __future__ import annotations

import re
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator, model_validator

RECIPE_VERSION = 3

# daily light integral in mol/m²/day. 40 is about full summer sun in the open
LIGHT_MIN = 1.0
LIGHT_MAX = 40.0
TEMP_MIN = 0.0
TEMP_MAX = 50.0

_CLOCK = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$|^24:00$")


def minutes(clock: str) -> int:
    hours, mins = clock.split(":")
    return int(hours) * 60 + int(mins)


def clock(total: int) -> str:
    return f"{total // 60:02d}:{total % 60:02d}"


class Window(BaseModel):
    """a span of one day in local wall clock, from inclusive, to exclusive"""

    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    start: str = Field(alias="from", description='local time "HH:MM"')
    end: str = Field(alias="to", description='local time "HH:MM", later than from, "24:00" for midnight')

    @field_validator("start", "end", mode="before")
    @classmethod
    def _clock(cls, value: object) -> str:
        if not isinstance(value, str):
            raise ValueError("time must be a string like 17:00")
        text = value.strip()
        # models like to write 9:00, the page and the planner want 09:00
        if re.fullmatch(r"\d:[0-5]\d", text):
            text = "0" + text
        if not _CLOCK.match(text):
            raise ValueError(f"{value!r} is not a time like 17:00")
        return text

    @model_validator(mode="after")
    def _order(self) -> "Window":
        if minutes(self.start) >= minutes(self.end):
            raise ValueError(f"window {self.start} to {self.end} must end after it starts")
        return self


def merge(windows: list[Window]) -> list[Window]:
    """sorted, with overlapping or touching windows joined into one"""
    spans = sorted((minutes(w.start), minutes(w.end)) for w in windows)
    out: list[list[int]] = []
    for start, end in spans:
        if out and start <= out[-1][1]:
            out[-1][1] = max(out[-1][1], end)
        else:
            out.append([start, end])
    return [Window(**{"from": clock(a), "to": clock(b)}) for a, b in out]


Windows = Annotated[list[Window], Field(max_length=8)]


# named parts of the day, as the farmer says them. the model names the part and
# these fix the hours, so the convention lives in code like the plant numbers.
# a small model mixes the hours up when it has to work them out itself
PERIODS: dict[str, tuple[str, str]] = {
    "morning": ("06:00", "10:00"),
    "midday": ("11:00", "15:00"),
    "afternoon": ("12:00", "18:00"),
    "evening": ("17:00", "21:00"),
}
# where an open window like "from 5 pm on" ends: the sun is gone
DAY_END = "21:00"


class Said(BaseModel):
    """a window the way the model writes it: a named part of the day, or clock times"""

    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    period: Literal["morning", "midday", "afternoon", "evening"] | None = Field(
        default=None, description="a part of the day the farmer names, instead of clock times"
    )
    start: str | None = Field(default=None, alias="from", description='"HH:MM" when the farmer names a time')
    end: str | None = Field(
        default=None, alias="to", description='"HH:MM", null for an open end like "from 5 pm on"'
    )

    def window(self) -> Window:
        # a named part wins: the model is good at naming it and bad at its hours
        if self.period:
            start, end = PERIODS[self.period]
        elif self.start:
            start, end = self.start, self.end or DAY_END
        else:
            raise ValueError("a window needs a period or a from time")
        return Window.model_validate({"from": start, "to": end})


class Spoken(BaseModel):
    """the json the model writes. resolve() turns it into the Extraction"""

    model_config = ConfigDict(extra="ignore")

    plant: str | None = Field(
        default=None, max_length=60, description="the plant exactly as the farmer named it, null if none is named"
    )
    avoid_sun: Annotated[list[Said], Field(max_length=8)] = Field(
        default_factory=list, description="when the plant should not get full sun"
    )
    power_first: Annotated[list[Said], Field(max_length=8)] = Field(
        default_factory=list, description="when the farmer needs electricity"
    )

    def resolve(self) -> "Extraction":
        """the windows with their hours. a window that does not work names its list, so
        the model can be told exactly what to fix"""
        lists: dict[str, list[Window]] = {}
        for name in ("avoid_sun", "power_first"):
            lists[name] = []
            for i, said in enumerate(getattr(self, name)):
                try:
                    lists[name].append(said.window())
                except ValidationError as e:
                    raise ValueError(f"{name}.{i}: {e.errors()[0]['msg']}") from e
                except ValueError as e:
                    raise ValueError(f"{name}.{i}: {e}") from e
        return Extraction(plant=self.plant, **lists)


class Extraction(BaseModel):
    """what the language model reads out of the farmer's words, and nothing more.
    no numbers about the plant: those come from the plant table"""

    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    plant: str | None = Field(
        default=None, max_length=60, description="the plant exactly as the farmer named it, null if none is named"
    )
    avoid_sun: Windows = Field(default_factory=list, description="hours the plant should not get full sun")
    power_first: Windows = Field(default_factory=list, description="hours where electricity wins over the plant")

    @field_validator("plant", mode="before")
    @classmethod
    def _plant(cls, value: object) -> object:
        if isinstance(value, str):
            value = value.strip()
            return value or None
        return value

    @field_validator("avoid_sun", "power_first", mode="after")
    @classmethod
    def _merge(cls, value: list[Window]) -> list[Window]:
        return merge(value)


class Names(BaseModel):
    en: str = Field(min_length=1)
    de: str = Field(min_length=1)


class Recipe(BaseModel):
    """the plant's facts from the table plus the hours from the farmer's words"""

    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    v: int = RECIPE_VERSION
    plant: str = Field(min_length=1, description="the plant's name in the plant table")
    names: Names
    light_target: float = Field(ge=LIGHT_MIN, le=LIGHT_MAX, description="daily light integral, mol/m²/day")
    max_temp: float | None = Field(default=None, ge=TEMP_MIN, le=TEMP_MAX, description="°C")
    avoid_sun: Windows = Field(default_factory=list)
    power_first: Windows = Field(default_factory=list)
    # where light_target and max_temp come from
    source: str = ""

    @field_validator("v", mode="before")
    @classmethod
    def _version(cls, value: object) -> int:
        return RECIPE_VERSION

    @field_validator("avoid_sun", "power_first", mode="after")
    @classmethod
    def _merge(cls, value: list[Window]) -> list[Window]:
        return merge(value)

    def wire(self) -> dict:
        """the json the page gets, with the wire names from/to"""
        return self.model_dump(by_alias=True, mode="json")


def llm_schema() -> dict:
    """the json schema handed to the model for guided decoding: what it may write"""
    return Spoken.model_json_schema(by_alias=True)
