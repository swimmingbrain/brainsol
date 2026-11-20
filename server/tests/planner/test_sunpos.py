import calendar

import numpy as np

from sonnenteiler.sunpos import position

VIENNA = (48.21, 16.37)


def utc(y, mo, d, h, mi=0):
    return calendar.timegm((y, mo, d, h, mi, 0))


def test_vienna_summer_noon():
    az, el = position(utc(2026, 6, 21, 10, 56), *VIENNA)
    assert abs(float(el) - 65.2) <= 0.3
    assert abs(float(az) - 180.0) <= 3.0


def test_morning_east_evening_west():
    az_m, el_m = position(utc(2026, 6, 21, 5), *VIENNA)
    az_e, el_e = position(utc(2026, 6, 21, 17), *VIENNA)
    assert 50 < float(az_m) < 110 and float(el_m) > 0
    assert 250 < float(az_e) < 310 and float(el_e) > 0


def test_close_to_the_sun_columns_of_the_dataset(ds):
    # the stand in when a dataset lacks sun_az or sun_el
    a = ds.a
    up = a["el"] > 5
    az, el = position(a["t"][up], ds.scene["lat"], ds.scene["lon"])
    assert np.max(np.abs(el - a["el"][up])) < 0.2
    assert np.max(np.abs((az - a["az"][up] + 180) % 360 - 180)) < 0.5
