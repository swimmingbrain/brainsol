import csv
import os

import numpy as np

from .common import FIX
from sonnenteiler import dataset
from sonnenteiler.scene import Scene, stressed


def table_rows():
    with open(os.path.join(FIX, "alternatives.csv"), newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def test_scene_reproduces_alternatives(ds):
    scene = Scene(ds.scene, ds.offsets, ds.wm2_per_mw)
    a = ds.a
    geo = scene.geometry(a["rel"], a["el"])
    power, ppfd = scene.outcome(geo, a["dni"], a["dhi"])
    index = {int(round(t)): k for k, t in enumerate(a["t"].tolist())}
    col = {float(o): j for j, o in enumerate(ds.offsets.tolist())}
    rows = table_rows()
    assert len(rows) == ds.n * len(ds.offsets)
    worst = {"pan": 0.0, "tilt": 0.0, "power": 0.0, "ppfd": 0.0}
    for r in rows:
        k = index[int(round(dataset._iso(r["time_utc"]).timestamp()))]
        j = col[float(r["offset_deg"])]
        worst["pan"] = max(worst["pan"], abs(geo.pan[k, j] - float(r["pan"])))
        worst["tilt"] = max(worst["tilt"], abs(geo.tilt[k, j] - float(r["tilt"])))
        worst["power"] = max(worst["power"], abs(power[k, j] - float(r["power_mw"])))
        worst["ppfd"] = max(worst["ppfd"], abs(ppfd[k, j] - float(r["ppfd"])))
    # the table rounds to 2 decimals or 4 significant digits, the inputs of steps.csv as well
    assert worst["pan"] < 0.011 and worst["tilt"] < 0.011
    assert worst["power"] < 0.05
    assert worst["ppfd"] < 0.2


def test_night_is_the_park_pose(ds):
    scene = Scene(ds.scene, ds.offsets, ds.wm2_per_mw)
    geo = scene.geometry(np.array([30.0, -120.0]), np.array([-5.0, -40.0]))
    assert np.all(geo.pan == scene.park[0]) and np.all(geo.tilt == scene.park[1])
    assert np.all(geo.c == 0.0)


def test_offset_zero_faces_the_sun_and_ninety_is_edge_on(ds):
    scene = Scene(ds.scene, ds.offsets, ds.wm2_per_mw)
    geo = scene.geometry(np.array([-20.0]), np.array([40.0]))
    assert abs(geo.c[0, 0] - 1.0) < 1e-9
    assert abs(geo.c[0, -1]) < 1e-9
    power, ppfd = scene.outcome(geo, np.array([800.0]), np.array([100.0]))
    assert np.all(np.diff(power[0]) <= 1e-9) and np.all(np.diff(ppfd[0]) >= -1e-9)


def test_stress_from_light_or_a_hot_leaf():
    st = stressed(1500, 30, np.array([20.0, 29.0, np.nan]), np.array([1600.0, 500.0, 2000.0]))
    assert st.tolist() == [True, True, True]
    st = stressed(1500, 30, np.array([20.0, np.nan]), np.array([1000.0, 1000.0]))
    assert st.tolist() == [False, False]
