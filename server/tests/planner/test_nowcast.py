import os

import numpy as np

from .common import copy_fixture, rewrite_csv
from sonnenteiler import dataset, nowcast
from sonnenteiler.nowcast import QS, DayInput


def test_shapes_order_and_no_negative_values(ds, cast):
    w = DayInput.from_dataset(ds, 2)
    for k in (0, 100, 150, 287):
        for m in ("raw", "shift", "model"):
            f = cast.predict(w, k, m)
            n = 288 - k
            assert f.dni_q.shape == (n, len(QS)) and f.dhi_q.shape == (n, len(QS)) and f.temp.shape == (n,)
            assert np.all(np.diff(f.dni_q, axis=1) >= 0) and np.all(np.diff(f.dhi_q, axis=1) >= 0)
            assert np.all(f.dni_q >= 0) and np.all(f.dhi_q >= 0)
            night = ~w.up[k:]
            assert np.all(f.dni_q[night] == 0)


def test_before_sunrise_there_is_nothing_measured(ds, cast):
    w = DayInput.from_dataset(ds, 2)
    f = cast.predict(w, 0)
    assert not f.has
    assert f.dni_q[:, 2].max() > 0
    f = cast.predict(w, 150)
    assert f.has


def test_only_the_past_is_read(ds, cast):
    w = DayInput.from_dataset(ds, 2)
    a = cast.predict(w, 140)
    w2 = DayInput.from_dataset(ds, 2, dni=np.r_[w.dni[:140], w.dni[140:] * 0.1],
                               dhi=np.r_[w.dhi[:140], w.dhi[140:] + 50], temp=np.r_[w.temp[:140], w.temp[140:] + 9])
    b = cast.predict(w2, 140)
    assert np.array_equal(a.dni_q, b.dni_q) and np.array_equal(a.temp, b.temp)


def test_metrics_and_choice(cast):
    m = cast.metrics
    for meth in ("raw", "shift", "model"):
        assert m["total"][meth]["dni"] >= 0
        assert len(m["by_lead"][meth]) == 4
    tot = m["total"]
    assert cast.used == min(("raw", "shift", "model"), key=lambda x: tot[x]["dni"] + tot[x]["dhi"])
    s = nowcast.summary(cast)
    assert set(s) == {"used", "mae_dni", "mae_dhi", "mae_temp", "by_lead"}
    assert s["by_lead"]["lead_min"] == [30, 60, 120, 180]


def test_save_and_load(tmp_path, ds, cast):
    path = str(tmp_path / "n.npz")
    cast.save(path)
    back = nowcast.Nowcast.load(path, "test")
    assert nowcast.Nowcast.load(path, "other key") is None
    w = DayInput.from_dataset(ds, 2)
    assert np.allclose(back.predict(w, 120).dni_q, cast.predict(w, 120).dni_q)
    assert back.used == cast.used


def test_works_without_service_forecast(tmp_path, cfg):
    folder = copy_fixture(str(tmp_path / "data"))
    rewrite_csv(os.path.join(folder, "steps.csv"), drop=("fc_temp_c", "fc_cloud_pct", "fc_dni_wm2", "fc_dhi_wm2"))
    got = dataset.load(folder, str(tmp_path / "work"))
    assert not got.has["forecast"]
    cast = nowcast.train(got, cfg, "x", log=None)
    f = cast.predict(DayInput.from_dataset(got, 2), 120)
    assert np.isfinite(f.dni_q).all() and np.isfinite(f.temp).all()
