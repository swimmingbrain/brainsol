import csv
import json
import os
import time

import numpy as np
import pytest

from .common import FIX, copy_fixture, rewrite_csv
from sonnenteiler import dataset, schema
from sonnenteiler.context import Context
from sonnenteiler.planner import drive_day


def test_loads_the_fixture(ds):
    assert ds.dates == ["2025-06-01", "2025-06-02", "2025-06-03"]
    assert ds.n == 3 * 288 and ds.step_min == 5 and ds.plan_min == 60
    assert [r["name"] for r in ds.recipes] == ["tomato", "potato", "onion", "chilli"]
    assert all(ds.has.values())
    # local time from the offset in time_local, summer time in vienna
    assert set(np.unique(ds.a["off"]).tolist()) == {7200.0}
    assert ds.a["hour"][0] == 0.0


def test_split_by_index(ds):
    assert ds.test.tolist() == [False, False, True]
    assert ds.test_days() == [2] and ds.train_days() == [0, 1]


def test_cp1252_meta(tmp_path):
    folder = copy_fixture(str(tmp_path / "data"))
    text = open(os.path.join(FIX, "meta.json"), encoding="utf-8").read()
    assert "µ" in text
    with open(os.path.join(folder, "meta.json"), "w", encoding="cp1252") as f:
        f.write(text)
    with pytest.raises(UnicodeDecodeError):
        open(os.path.join(folder, "meta.json"), encoding="utf-8").read()
    got = dataset.load(folder, str(tmp_path / "work"))
    assert got.scene["lat"] == 48.21 and len(got.recipes) == 4


def test_cache_is_used_and_keyed_by_the_data(tmp_path):
    folder = copy_fixture(str(tmp_path / "data"))
    work = str(tmp_path / "work")
    a = dataset.load(folder, work)
    files = [f for f in os.listdir(work) if f.startswith("dataset-")]
    assert len(files) == 1
    t0 = time.perf_counter()
    b = dataset.load(folder, work)
    assert time.perf_counter() - t0 < 1.0
    assert b.key == a.key and np.array_equal(a.a["dni"], b.a["dni"])
    with open(os.path.join(folder, "steps.csv"), "a", encoding="utf-8") as f:
        f.write("")
    os.utime(os.path.join(folder, "steps.csv"), (time.time() + 5, time.time() + 5))
    c = dataset.load(folder, work)
    assert c.key != a.key


def test_missing_optional_columns_and_files(tmp_path, cfg):
    folder = copy_fixture(str(tmp_path / "data"), skip=("days.csv", "alternatives.csv"))
    rewrite_csv(os.path.join(folder, "steps.csv"),
                drop=("fc_temp_c", "fc_cloud_pct", "fc_dni_wm2", "fc_dhi_wm2", "price_eur_mwh", "cloud_pct",
                      "sun_az", "date_local", "time_utc"))
    got = dataset.load(folder, str(tmp_path / "work"))
    assert not got.has["forecast"] and not got.has["prices"] and not got.has["reference"]
    assert not got.has["alternatives"]
    assert got.dates == ["2025-06-01", "2025-06-02", "2025-06-03"]
    assert len(got.notes) == 3
    # the stand in forecast is the mean of the training days per time of day
    assert np.isfinite(got.a["fc_dni"]).all() and got.a["fc_dni"].max() > 100
    assert np.isfinite(got.a["az"]).all()
    assert got.reference("2025-06-01", "tomato") is None
    assert dataset.scene_check(got, None) is None
    # everything still plans, with the fixed electricity price
    from sonnenteiler import nowcast
    cast = nowcast.train(got, cfg, "x", log=None)
    ctx = Context(got, cast, cfg)
    r = ctx.default_recipe()
    run = ctx.run(2)
    terms = ctx.terms(run.day, r)
    assert terms.elec_source == "default"
    drive_day(ctx.planner, run, r, terms)
    assert run.k == run.day.n


def test_renamed_columns_through_the_config(tmp_path, ds):
    folder = copy_fixture(str(tmp_path / "data"))
    rewrite_csv(os.path.join(folder, "steps.csv"), rename={"dni_wm2": "direct", "price_eur_mwh": "preis"})
    with pytest.raises(schema.Problem):
        dataset.load(folder, str(tmp_path / "w1"))
    got = dataset.load(folder, str(tmp_path / "w2"), {"dni_wm2": "direct", "price_eur_mwh": "preis"})
    assert np.array_equal(got.a["dni"], ds.a["dni"]) and np.array_equal(got.a["price"], ds.a["price"])


def test_days_csv_and_meta_without_crop_columns(tmp_path, ds):
    # the data teammate drops the crop columns, the profit strategy and the crop keys of the recipes
    folder = copy_fixture(str(tmp_path / "data"))
    path = os.path.join(folder, "days.csv")
    with open(path, newline="", encoding="utf-8") as f:
        rows = list(csv.reader(f))
    drop = {"crop_kg", "crop_price_eur_kg", "crop_eur", "profit_eur", "score"}
    keep = [i for i, h in enumerate(rows[0]) if h not in drop]
    si = rows[0].index("strategy")
    rows = [rows[0]] + [r for r in rows[1:] if r[si] != "profit"]
    with open(path, "w", newline="", encoding="utf-8") as f:
        csv.writer(f).writerows([[r[i] for i in keep] for r in rows])
    meta = json.load(open(os.path.join(folder, "meta.json"), encoding="utf-8"))
    for r in meta["recipes"]:
        r.pop("crop")
        r.pop("yield_g_mol")
    meta.pop("scoring")
    json.dump(meta, open(os.path.join(folder, "meta.json"), "w", encoding="utf-8"))
    got = dataset.load(folder, str(tmp_path / "work"))
    ref = got.reference("2025-06-02", "potato")
    assert set(ref) == {"tracking", "oracle"}
    assert ref["oracle"]["elec_eur"] == ds.reference("2025-06-02", "potato")["oracle"]["elec_eur"]
    ctx = Context(got, None, schema.config())
    r, rep_ = ctx.intake({"plant": "potato"}, None)
    assert r["crop"] == "Potato" and r["power_hours"] == [[18.0, 22.0]]
    assert ctx.dataset_recipe(ctx.intake(got.recipes[1], None)[0]) is not None
    # the fixture itself still carries the crop columns and loads as well
    assert "oracle" in ds.reference("2025-06-02", "potato")


def test_missing_data_folder_gives_a_german_hint(tmp_path):
    with pytest.raises(schema.Problem) as e:
        dataset.find_folder(str(tmp_path / "nothing"), schema.config())
    assert "brainsolsynth" in str(e.value)
    with pytest.raises(schema.Problem):
        dataset.load(str(tmp_path), str(tmp_path / "w"))


def test_meta_is_json(ds):
    assert json.loads(json.dumps(ds.meta))["step_min"] == 5
