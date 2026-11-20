import os

import numpy as np

from sonnenteiler.nn import MLP


def toy(n, seed=0):
    rng = np.random.default_rng(seed)
    x = rng.uniform(-2, 2, (n, 2))
    y = np.sin(1.5 * x[:, 0]) + 0.5 * x[:, 1] ** 2
    return x, y


def test_mlp_learns_a_toy_function():
    x, y = toy(2000)
    net = MLP(2, [32, 32], 1, seed=1)
    net.fit(x, y, steps=3000, batch=128, lr=5e-3)
    xt, yt = toy(500, seed=9)
    mse = float(np.mean((net.predict(xt)[:, 0] - yt) ** 2))
    # the variance of the target is about 0.6
    assert mse < 0.02


def test_pinball_quantiles_are_calibrated():
    rng = np.random.default_rng(2)
    x = rng.uniform(-1, 1, (4000, 1))
    y = x[:, 0] + rng.normal(0, 0.3, 4000)
    qs = (0.1, 0.5, 0.9)
    net = MLP(1, [16], 3, seed=2)
    net.fit(x, y, loss="pinball", quantiles=qs, steps=2500, batch=256, lr=5e-3)
    xt = rng.uniform(-1, 1, (3000, 1))
    yt = xt[:, 0] + rng.normal(0, 0.3, 3000)
    q = np.sort(net.predict(xt), axis=1)
    below = [(yt < q[:, i]).mean() for i in range(3)]
    for want, got in zip(qs, below):
        assert abs(got - want) < 0.05


def test_save_and_load_give_the_same_net(tmp_path):
    x, y = toy(300)
    net = MLP(2, [8], 2, seed=4)
    net.fit(x, np.column_stack([y, -y]), steps=200, batch=64)
    path = os.path.join(str(tmp_path), "n.npz")
    np.savez(path, **net.to_arrays("n_"))
    with np.load(path, allow_pickle=False) as a:
        back = MLP.from_arrays(a, "n_")
    assert np.allclose(back.predict(x), net.predict(x))
