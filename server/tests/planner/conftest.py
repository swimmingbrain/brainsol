import sys

sys.dont_write_bytecode = True

import pytest  # noqa: E402

from sonnenteiler import dataset, nowcast, schema  # noqa: E402
from sonnenteiler.context import Context  # noqa: E402

from .common import FIX, SMALL  # noqa: E402


@pytest.fixture(scope="session")
def work(tmp_path_factory):
    return str(tmp_path_factory.mktemp("work"))


@pytest.fixture(scope="session")
def cfg():
    return schema.config(SMALL)


@pytest.fixture(scope="session")
def ds(work, cfg):
    return dataset.load(FIX, work, cfg["columns"])


@pytest.fixture(scope="session")
def cast(ds, cfg):
    return nowcast.train(ds, cfg, "test", log=None)


@pytest.fixture(scope="session")
def ctx(ds, cast, cfg):
    return Context(ds, cast, cfg)
