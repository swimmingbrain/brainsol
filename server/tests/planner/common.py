import csv
import math
import os
import shutil

FIX = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures", "sample")
# three days of the teammate's sample: 2025-06-01 with negative prices, 06-02 clear, 06-03 cloudy and the test day
DATES = ("2025-06-01", "2025-06-02", "2025-06-03")
# a small and quick nowcast, the tests check behaviour and shapes, not skill
SMALL = {"nowcast": {"hidden": [8], "steps": 300, "batch": 256, "issues_per_day": 12, "targets_per_issue": 24}}


def copy_fixture(dst: str, skip=()) -> str:
    os.makedirs(dst, exist_ok=True)
    for name in os.listdir(FIX):
        if name not in skip:
            shutil.copy(os.path.join(FIX, name), os.path.join(dst, name))
    return dst


def rewrite_csv(path: str, drop=(), rename=None) -> None:
    rename = rename or {}
    with open(path, newline="", encoding="utf-8") as f:
        rows = list(csv.reader(f))
    keep = [i for i, h in enumerate(rows[0]) if h not in drop]
    rows = [[r[i] for i in keep] for r in rows]
    rows[0] = [rename.get(h, h) for h in rows[0]]
    with open(path, "w", newline="", encoding="utf-8") as f:
        csv.writer(f).writerows(rows)


def tol(y: float) -> float:
    # 0.5 % plus the rounding of days.csv: 2 decimals from 1 up, 4 significant digits below
    ay = abs(y)
    if ay >= 1:
        return 0.005 * ay + 0.005
    if ay == 0:
        return 1e-6
    return 0.005 * ay + 0.5 * 10 ** (math.floor(math.log10(ay)) - 3)
