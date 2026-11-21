import json
import os

import pytest

from .common import FIX, SMALL
import sonnenteiler
from sonnenteiler import cli, schema

EXAMPLE = os.path.join(os.path.dirname(os.path.abspath(sonnenteiler.__file__)), "config.example.json")


def test_config_example_is_the_default():
    with open(EXAMPLE, encoding="utf-8") as f:
        assert json.load(f) == schema.DEFAULT_CONFIG
    assert schema.config(schema.DEFAULT_CONFIG)["block_h"] == 3
    with pytest.raises(schema.Problem):
        schema.config({"planner": {"light_quantile": 2}})


@pytest.fixture(scope="module")
def args(tmp_path_factory):
    tmp = tmp_path_factory.mktemp("cli")
    conf = os.path.join(str(tmp), "config.json")
    with open(conf, "w", encoding="utf-8") as f:
        json.dump(SMALL, f)
    return ["--config", conf, "--data", FIX, "--work", str(tmp / "work")]


def test_check(args, capsys):
    assert cli.main(["check", *args]) == 0
    out = capsys.readouterr().out
    assert "days 3" in out and "formula check" in out and "Tomato" in out


def test_train_sim_plan_evaluate(args, capsys):
    assert cli.main(["train", *args]) == 0
    out = capsys.readouterr().out
    assert "nowcast on 1 test days" in out and "captured" in out and "light quantile on the test days" in out
    assert cli.main(["sim", "--date", "2025-06-01", "--days", "2", *args]) == 0
    out = capsys.readouterr().out
    assert "2025-06-01" in out and "2025-06-03" in out
    assert cli.main(["plan", "--date", "2025-06-03", "--time", "10:30", *args]) == 0
    plan = json.loads(capsys.readouterr().out)
    assert len(plan["points"]["t"]) == 36 and "objective" not in plan
    assert cli.main(["evaluate", *args]) == 0
    assert "evaluation on 1 test days" in capsys.readouterr().out


def test_missing_data_is_a_german_error(tmp_path, capsys):
    assert cli.main(["check", "--data", str(tmp_path / "nix"), "--work", str(tmp_path)]) == 1
    assert "brainsolsynth" in capsys.readouterr().err
