"""recipe intake, the one place that reads what the chatbot sends

the chatbot (recipe server, version 3 of its recipe) may still change its output, so this module is
tolerant on purpose: it never rejects a recipe because it looks different, it fills what is missing,
clamps what is out of range and says in a report how it read the input. to accept a new format, add
its keys to ALIASES or a reader to _aliases below"""
from __future__ import annotations

import json
import math
import re

# canonical keys inside the service: what the crop needs, the hours of the farmer, a fixed tariff
KEYS = ("name", "crop", "dli_target", "max_ppfd", "tmax_c", "power_hours", "shade_hours", "elec_price_eur_mwh",
        "note")
GENERAL = {"name": "tomato", "crop": "Tomato", "dli_target": 25.0, "max_ppfd": 1800.0, "tmax_c": 33.0,
           "power_hours": [], "shade_hours": [], "elec_price_eur_mwh": None, "note": ""}
# unit, range and meaning of every key, also served as /api/recipe/schema
SPEC = {
    "name": {"unit": "", "desc": "Name des Rezepts, klein geschrieben"},
    "crop": {"unit": "", "desc": "Name der Kultur, auch deutsch"},
    "dli_target": {"unit": "mol/m²/Tag", "range": [1.0, 80.0], "desc": "Tageslichtziel der Pflanze, eine Pflicht"},
    "max_ppfd": {"unit": "µmol/m²/s", "range": [50.0, 3000.0], "desc": "mehr Licht stresst die Pflanze"},
    "tmax_c": {"unit": "°C", "range": [-20.0, 60.0], "desc": "ein wärmeres Blatt stresst die Pflanze"},
    "power_hours": {"unit": "h", "desc": "Ortszeit [Beginn, Ende), in diesen Stunden zählt nur Strom"},
    "shade_hours": {"unit": "h", "desc": "Ortszeit [Beginn, Ende), in diesen Stunden bekommt die Pflanze so wenig Licht wie möglich"},
    "elec_price_eur_mwh": {"unit": "€/MWh", "range": [-1000.0, 5000.0], "desc": "fester Einspeisetarif statt Marktpreis, null nimmt die Daten"},
    "note": {"unit": "", "desc": "freier Text"},
}
# other names for canonical keys, after lower case and _ for spaces
ALIASES = {
    "dli": "dli_target", "target_dli": "dli_target", "lichtziel": "dli_target",
    "ppfd_max": "max_ppfd", "max_light": "max_ppfd",
    "temp_max": "tmax_c", "tmax": "tmax_c", "temp_max_c": "tmax_c", "leaf_temp_max": "tmax_c", "max_temp": "tmax_c",
    "kultur": "crop", "vegetable": "crop", "gemuese": "crop", "gemüse": "crop",
    "elec_price": "elec_price_eur_mwh", "feed_in_eur_mwh": "elec_price_eur_mwh", "tariff_eur_mwh": "elec_price_eur_mwh",
    "notiz": "note", "comment": "note",
}
# keys of the first version, read by _aliases
FIRST_VERSION = ("plant", "light_target", "light_unit", "lux_max", "power_windows")
# keys of the chatbot's recipe (version 3) and where they go, read by _aliases
CHATBOT = {"plant": "crop", "light_target": "dli_target", "max_temp": "tmax_c", "power_first": "power_hours",
           "avoid_sun": "shade_hours", "names": "extra", "source": "extra", "v": "extra"}
# keys of earlier versions with no meaning any more, taken without complaint and listed as ignored
DROPPED = ("yield_g_mol", "crop_price_eur_kg", "objective")
# a light_target without light_unit above this is mol, at or below it a share of the clear day
SHARE_MAX = 1.5
# the crops the chatbot knows, the names of its plant table
CROPS = ("Okra", "Tomato", "Onion", "Potato", "Aubergine", "Garlic", "Peas", "Fenugreek", "Green chilli",
         "Elephant foot yam")
GERMAN = {"tomate": "Tomato", "tomaten": "Tomato", "kartoffel": "Potato", "kartoffeln": "Potato",
          "zwiebel": "Onion", "zwiebeln": "Onion", "chili": "Green chilli", "chilli": "Green chilli",
          "knoblauch": "Garlic", "erbsen": "Peas", "erbse": "Peas", "auberginen": "Aubergine",
          "bockshornklee": "Fenugreek", "grüne chili": "Green chilli", "grüne chilis": "Green chilli",
          "pfefferoni": "Green chilli", "peperoni": "Green chilli", "paradeiser": "Tomato", "erdäpfel": "Potato",
          "erdapfel": "Potato", "melanzani": "Aubergine", "elefantenfuß yams": "Elephant foot yam",
          "yams": "Elephant foot yam"}
# german name per crop for the schema, as the plant table of the chatbot has it
GERMAN_OF = {"Tomato": "Tomate", "Potato": "Kartoffel", "Onion": "Zwiebel", "Green chilli": "Grüne Chili",
             "Garlic": "Knoblauch", "Peas": "Erbsen", "Aubergine": "Aubergine", "Okra": "Okra",
             "Fenugreek": "Bockshornklee", "Elephant foot yam": "Elefantenfuß Yams"}
# english names, and the names the plants had before in the plant table
ENGLISH = {"green chili": "Green chilli", "chillies": "Green chilli", "ladies finger": "Okra", "bhindi": "Okra",
           "bhindi (ladies finger)": "Okra", "eggplant": "Aubergine", "brinjal": "Aubergine", "methi": "Fenugreek",
           "yam": "Elephant foot yam", "suran": "Elephant foot yam", "elephant yam": "Elephant foot yam",
           "elephant yam (suran)": "Elephant foot yam", "tomatoes": "Tomato", "potatoes": "Potato",
           "onions": "Onion", "pea": "Peas"}
KLXH_TO_MOL = 0.0661
CLEAR_DLI = 60.0


class Book:
    # what the intake knows about the dataset: its recipes, and the clear day light around the day
    def __init__(self, recipes: list[dict], clear_dli: float | None = None):
        self.recipes = recipes
        self.clear_dli = clear_dli


class NotARecipe(ValueError):
    pass


def parse_number(v):
    # 25, "25", "25,5", "25 mol" all give a float, anything else gives None
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return float(v) if math.isfinite(v) else None
    if isinstance(v, str):
        m = re.search(r"[-+]?\d+(?:[.,]\d+)?", v)
        if m:
            return float(m.group(0).replace(",", "."))
    return None


def _hour(v):
    # 17, "17", "17:30", "17.5" in hours
    if isinstance(v, str) and ":" in v:
        m = re.match(r"^\s*(\d{1,2}):(\d{2})", v)
        if m:
            return int(m.group(1)) + int(m.group(2)) / 60.0
    return parse_number(v)


def _span(v):
    # one window as [from, to] in hours or None
    if isinstance(v, dict):
        a = v.get("from", v.get("start", v.get("von")))
        b = v.get("to", v.get("end", v.get("bis")))
        return (_hour(a), _hour(b)) if a is not None and b is not None else None
    if isinstance(v, (list, tuple)) and len(v) == 2:
        return _hour(v[0]), _hour(v[1])
    if isinstance(v, str):
        parts = re.split(SPAN_SPLIT, v.strip())
        if len(parts) == 2:
            return _hour(parts[0]), _hour(parts[1])
    return None


SPAN_SPLIT = "\\s*(?:-|\u2013|bis|to)\\s*"


def _single_hour(x) -> bool:
    if isinstance(x, (list, tuple, dict)):
        return False
    if isinstance(x, str) and len(re.split(SPAN_SPLIT, x.strip())) > 1:
        return False
    return _hour(x) is not None


def parse_hours(v, warnings: list) -> list:
    if v is None or v == "" or v == []:
        return []
    items = v
    if isinstance(v, (str, dict)):
        items = [v]
    elif isinstance(v, (list, tuple)) and len(v) == 2 and all(_single_hour(x) for x in v):
        # a flat pair like [17, 21]
        items = [v]
    out = []
    for it in items:
        sp = _span(it)
        if sp is None or sp[0] is None or sp[1] is None:
            warnings.append(f"die Stromstunden {it!r} sind nicht lesbar und bleiben weg")
            continue
        a, b = sp
        if not (0 <= a <= 24 and 0 <= b <= 24):
            a, b = min(max(a, 0.0), 24.0), min(max(b, 0.0), 24.0)
            warnings.append(f"die Stromstunden {it!r} liegen außerhalb von 0 bis 24 Uhr und wurden begrenzt")
        if a < b:
            out.append([a, b])
        elif a > b:
            # over midnight
            out.extend([[a, 24.0], [0.0, b]])
            warnings.append(f"die Stromstunden {it!r} gehen über Mitternacht und wurden geteilt")
    return out


def _norm_key(k) -> str:
    return re.sub(r"[\s\-]+", "_", str(k).strip().lower())


def unwrap(body, depth: int = 0):
    # a json string, a list (the first entry) or a wrapper {"recipe": {...}} become one object
    warnings = []
    if depth > 4:
        raise NotARecipe("das Rezept ist zu tief verschachtelt")
    if isinstance(body, (bytes, bytearray)):
        body = body.decode("utf-8", "replace")
    if isinstance(body, str):
        s = body.strip()
        try:
            inner = json.loads(s) if s else {}
        except json.JSONDecodeError:
            # plain words, taken as the name of the crop
            return {"crop": s}, ["das Rezept ist kein JSON, der Text gilt als Name der Kultur"]
        if isinstance(inner, str):
            return {"crop": inner}, ["das Rezept ist nur ein Text, er gilt als Name der Kultur"]
        got, w = unwrap(inner, depth + 1)
        return got, warnings + w
    if isinstance(body, list):
        if not body:
            return {}, ["die Liste ist leer, es gelten die Standardwerte"]
        if len(body) > 1:
            warnings.append(f"die Liste hat {len(body)} Rezepte, genommen wird das erste")
        got, w = unwrap(body[0], depth + 1)
        return got, warnings + w
    if isinstance(body, dict):
        for k in ("recipe", "rezept", "data"):
            if k in body and isinstance(body[k], (dict, list, str)) and len(body) <= 3:
                got, w = unwrap(body[k], depth + 1)
                return got, warnings + w
        return body, warnings
    raise NotARecipe("das Rezept muss ein JSON Objekt, eine Liste oder ein Text sein")


def _known(low: str, book: Book) -> str | None:
    # a crop name of the plant table or of a dataset recipe, without case, also german
    crops = {c.lower(): c for c in CROPS}
    for r in book.recipes:
        if r.get("crop"):
            crops.setdefault(r["crop"].lower(), r["crop"])
    hit = crops.get(low) or GERMAN.get(low) or ENGLISH.get(low)
    if hit is None:
        # a part of a name, like "Bhindi" or "Yam"
        hit = next((c for lc, c in crops.items() if low in lc or lc.split(" (")[0] == low), None)
    return hit


def canon(text) -> str:
    # one spelling per crop, so "Green Chilli" of the dataset and "Green chilli" of the chatbot are the same
    low = str(text or "").strip().lower()
    known = {c.lower(): c for c in CROPS}
    return (known.get(low) or GERMAN.get(low) or ENGLISH.get(low) or low).lower()


def find_crop(text, book: Book) -> tuple[str | None, dict | None]:
    # the crop name and the dataset recipe for it, matched by name
    if not isinstance(text, str) or not text.strip():
        return None, None
    low = text.strip().lower()
    by_name = {r["name"].lower(): r for r in book.recipes if r.get("name")}
    if low in by_name:
        r = by_name[low]
        return _known(canon(r.get("crop") or r["name"]), book) or r.get("crop") or r["name"], r
    hit = _known(low, book)
    if hit is None:
        return None, None
    rec = next((r for r in book.recipes if canon(r.get("crop") or r.get("name")) == canon(hit)
                or canon(r.get("name")) == canon(hit)), None)
    return hit, rec


def _aliases(src: dict, keys_seen: dict, warnings: list, book: Book) -> dict:
    # the first version's keys and the plain aliases, into canonical keys
    out = {}
    for raw_k, v in src.items():
        k = _norm_key(raw_k)
        if k in KEYS:
            out[k] = v
            keys_seen[raw_k] = k
        elif k in ALIASES and ALIASES[k] not in out:
            out[ALIASES[k]] = v
            keys_seen[raw_k] = ALIASES[k]
    norm = {_norm_key(k): (k, v) for k, v in src.items()}
    if "plant" in norm:
        raw_k, v = norm["plant"]
        out.setdefault("crop", v)
        if isinstance(v, str) and "name" not in out:
            out["_plant_name"] = v
        keys_seen[raw_k] = "crop"
    if "light_target" in norm:
        raw_k, v = norm["light_target"]
        unit_raw = norm.get("light_unit", (None, None))
        x = parse_number(v)
        if unit_raw[0] is None:
            # the chatbot sends mol without a unit, the first version sent a share up to 1
            unit = "mol" if x is not None and x > SHARE_MAX else "share"
        else:
            unit = str(unit_raw[1] or "mol").strip().lower()
        keys_seen[raw_k] = "dli_target"
        if unit_raw[0] is not None:
            keys_seen[unit_raw[0]] = "dli_target"
        if x is None:
            warnings.append(f"light_target {v!r} ist keine Zahl")
        elif unit in ("mol", "mol/m2", "mol/m²", "dli"):
            out["dli_target"] = x
        elif unit == "klxh":
            out["dli_target"] = x * KLXH_TO_MOL
            warnings.append(f"Lichtziel {x:g} klxh als {x * KLXH_TO_MOL:.1f} mol gelesen (1 klxh = 0,0661 mol/m²)")
        elif unit == "share":
            ref = book.clear_dli or CLEAR_DLI
            out["dli_target"] = x * ref
            warnings.append(f"Lichtziel als Anteil {x:g} von {ref:.0f} mol Freilandlicht an einem wolkenlosen Tag, "
                            f"also {x * ref:.1f} mol")
        else:
            out["dli_target"] = x
            warnings.append(f"light_unit {unit!r} ist unbekannt, das Lichtziel gilt als mol")
    if "lux_max" in norm:
        raw_k, v = norm["lux_max"]
        x = parse_number(v)
        keys_seen[raw_k] = "max_ppfd"
        if v is None:
            pass
        elif x is None:
            warnings.append(f"lux_max {v!r} ist keine Zahl")
        else:
            out.setdefault("max_ppfd", x / 110.0 * 2.02)
    if "power_windows" in norm:
        raw_k, v = norm["power_windows"]
        keys_seen[raw_k] = "power_hours"
        if isinstance(v, list) and any(isinstance(w, dict) and "weight" in w for w in v):
            warnings.append("weight in power_windows wird nicht verwendet, in Stromstunden zählt nur Strom")
        out.setdefault("power_hours", v)
    for key, canon in (("power_first", "power_hours"), ("avoid_sun", "shade_hours")):
        if key in norm:
            raw_k, v = norm[key]
            keys_seen[raw_k] = canon
            out.setdefault(canon, v)
    for key in ("names", "source", "v"):
        # what the chatbot adds for people, kept under extra without a warning
        if key in norm:
            keys_seen[norm[key][0]] = "extra"
    return out


def _clamp(key: str, x: float, warnings: list) -> float:
    lo, hi = SPEC[key]["range"]
    if x < lo or x > hi:
        y = min(max(x, lo), hi)
        warnings.append(f"{key} {x:g} liegt außerhalb von {lo:g} bis {hi:g} {SPEC[key]['unit']} und wurde auf {y:g} gesetzt".replace("  ", " "))
        return y
    return x


def intake(body, book: Book) -> tuple[dict, dict]:
    """any accepted recipe form to the canonical recipe and a report of how it was read"""
    src, warnings = unwrap(body)
    seen: dict = {}
    got = _aliases(src, seen, warnings, book)
    understood = [k for k in src if k in seen]
    ignored = [k for k in src if k not in seen]
    extra = {k: src[k] for k in src if k not in seen or seen[k] == "extra"}

    crop_in = got.get("crop")
    crop, base = find_crop(crop_in, book) if crop_in is not None else (None, None)
    if crop_in is not None and crop is None:
        # an unknown crop keeps its name and the general defaults
        crop = str(crop_in).strip() or None
    if base is None and isinstance(got.get("name"), str):
        _, base = find_crop(got["name"], book)
        if base is not None and crop is not None and base.get("crop") != crop:
            base = None
    general = next((r for r in book.recipes if r.get("name") == "tomato"), None) or GENERAL
    defaults = dict(GENERAL)
    defaults.update(general)
    if base is not None:
        defaults.update(base)

    out = {}
    defaulted = []
    for k in KEYS:
        if k in got and got[k] is not None and not (k in ("crop", "name") and not str(got[k]).strip()):
            out[k] = got[k]
        elif k == "elec_price_eur_mwh" and k in got:
            out[k] = None
        else:
            out[k] = defaults.get(k, GENERAL[k])
            defaulted.append(k)
    if crop is not None:
        out["crop"] = crop
    for k in ("dli_target", "max_ppfd", "tmax_c"):
        x = parse_number(out[k])
        if x is None:
            warnings.append(f"{k} {out[k]!r} ist keine Zahl, es gilt der Standardwert")
            x = float(defaults.get(k, GENERAL[k]))
            if k not in defaulted:
                defaulted.append(k)
        out[k] = _clamp(k, x, warnings)
    k = "elec_price_eur_mwh"
    if out[k] is not None:
        x = parse_number(out[k])
        if x is None:
            warnings.append(f"{k} {out[k]!r} ist keine Zahl und bleibt leer")
        out[k] = None if x is None else _clamp(k, x, warnings)
    out["power_hours"] = parse_hours(out["power_hours"], warnings)
    out["shade_hours"] = parse_hours(out["shade_hours"], warnings)
    name = out["name"]
    if "name" in defaulted:
        plant = got.get("_plant_name")
        if base is not None:
            name = base["name"]
        elif crop or plant:
            name = crop or plant
    name = re.sub(r"[^a-z0-9_]+", "_", str(name).strip().lower()).strip("_")[:40] or "rezept"
    out["name"] = name
    out["note"] = "" if out["note"] is None else str(out["note"])
    out["crop"] = str(out["crop"])
    out["extra"] = extra

    report = {"understood": understood, "defaulted": defaulted, "ignored": ignored, "warnings": warnings}
    return out, report


def same_as(recipe: dict, dataset_recipe: dict) -> bool:
    # the recipe is one of the dataset, so days.csv can be the reference
    if recipe.get("elec_price_eur_mwh") is not None or recipe.get("shade_hours"):
        return False
    if dataset_recipe.get("crop") and canon(recipe.get("crop")) != canon(dataset_recipe.get("crop")):
        return False
    for k in ("dli_target", "max_ppfd", "tmax_c"):
        a, b = parse_number(recipe.get(k)), parse_number(dataset_recipe.get(k))
        if a is None or b is None or abs(a - b) > 1e-9:
            return False
    ha = [[float(x), float(y)] for x, y in recipe.get("power_hours") or []]
    hb = [[float(x), float(y)] for x, y in dataset_recipe.get("power_hours") or []]
    return ha == hb


def schema(book: Book) -> dict:
    keys = {}
    for k in KEYS:
        d = dict(SPEC[k])
        d["default"] = GENERAL[k]
        d["aliases"] = sorted([a for a, c in ALIASES.items() if c == k])
        keys[k] = d
    keys["crop"]["aliases"] += ["plant"]
    keys["dli_target"]["aliases"] += ["light_target mit light_unit mol, klxh (1 klxh = 0,0661 mol) oder share "
                                      "(Anteil am Freilandlicht eines wolkenlosen Tages)"]
    keys["max_ppfd"]["aliases"] += ["lux_max (lx / 110 * 2,02)"]
    keys["power_hours"]["aliases"] += ["power_windows [{\"from\": \"17:00\", \"to\": \"20:00\"}]",
                                       "power_first [{\"from\": \"17:00\", \"to\": \"21:00\"}]",
                                       "\"17-21\"", "{\"from\": 17, \"to\": 21}"]
    keys["shade_hours"]["aliases"] += ["avoid_sun [{\"from\": \"11:00\", \"to\": \"15:00\"}]"]
    keys["dli_target"]["aliases"] += [f"light_target ohne light_unit: mol über {SHARE_MAX:g}, sonst Anteil".replace(".", ",")]
    keys["tmax_c"]["aliases"] = [a if a != "max_temp" else "max_temp (null nimmt den Wert der Kultur)"
                                 for a in keys["tmax_c"]["aliases"]]
    known = {canon(c) for c in CROPS}
    names = list(CROPS) + sorted({r["crop"] for r in book.recipes if r.get("crop") and canon(r["crop"]) not in known})
    crops = [{"crop": c, "german": GERMAN_OF.get(c),
              "recipe": next((r["name"] for r in book.recipes if canon(r.get("crop") or r.get("name")) == canon(c)),
                             None)} for c in names]
    return {
        "open": True,
        "note": "Die Annahme ist nachsichtig. Unbekannte Schlüssel kommen unter extra zurück, "
                "Werte außerhalb der Grenzen werden begrenzt und gemeldet.",
        "accepts": ["Objekt", "{\"recipe\": {...}}", "Liste (das erste Rezept)", "JSON als Text", "Name der Kultur als Text"],
        "keys": keys,
        "first_version_keys": list(FIRST_VERSION),
        "chatbot_keys": dict(CHATBOT),
        "ignored_keys": list(DROPPED),
        "german_names": {k.capitalize(): v for k, v in GERMAN.items()},
        "crops": crops,
        "recipes": book.recipes,
    }
