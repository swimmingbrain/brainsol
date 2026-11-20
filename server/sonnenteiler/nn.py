from __future__ import annotations

import math

import numpy as np

# a small multilayer perceptron in plain numpy: tanh hidden layers, a linear output, adam


class MLP:
    def __init__(self, n_in: int, hidden, n_out: int, seed: int = 0):
        rng = np.random.default_rng(seed)
        sizes = [int(n_in), *[int(h) for h in hidden], int(n_out)]
        self.W = [rng.normal(0.0, 1.0 / math.sqrt(a), (a, b)) for a, b in zip(sizes[:-1], sizes[1:])]
        self.b = [np.zeros(b) for b in sizes[1:]]
        self.x_mu = np.zeros(n_in)
        self.x_sd = np.ones(n_in)
        self.y_mu = np.zeros(n_out)
        self.y_sd = np.ones(n_out)

    def _forward(self, z: np.ndarray) -> list[np.ndarray]:
        acts = [z]
        h = z
        last = len(self.W) - 1
        for i, (w, b) in enumerate(zip(self.W, self.b)):
            h = h @ w + b
            if i < last:
                h = np.tanh(h)
            acts.append(h)
        return acts

    def predict(self, x: np.ndarray) -> np.ndarray:
        z = (np.asarray(x, dtype=float) - self.x_mu) / self.x_sd
        return self._forward(z)[-1] * self.y_sd + self.y_mu

    def scale_to(self, x: np.ndarray, y: np.ndarray, shared_y: bool = False) -> None:
        # standardised inputs and outputs, a pinball net shares one output scale
        self.x_mu = x.mean(axis=0)
        self.x_sd = np.maximum(x.std(axis=0), 1e-6)
        if shared_y:
            self.y_mu = np.full(self.y_mu.shape, float(y.mean()))
            self.y_sd = np.full(self.y_sd.shape, max(float(y.std()), 1e-6))
        else:
            self.y_mu = y.mean(axis=0)
            self.y_sd = np.maximum(y.std(axis=0), 1e-6)

    def _grads(self, z, y, loss: str, q):
        acts = self._forward(z)
        out = acts[-1]
        n = out.shape[0] * out.shape[1]
        if loss == "pinball":
            e = y - out
            d = np.where(e > 0.0, -q, 1.0 - q) / n
            value = float(np.sum(np.maximum(q * e, (q - 1.0) * e)) / n)
        else:
            e = out - y
            d = 2.0 * e / n
            value = float(np.sum(e * e) / n)
        gw = [None] * len(self.W)
        gb = [None] * len(self.W)
        for i in range(len(self.W) - 1, -1, -1):
            gw[i] = acts[i].T @ d
            gb[i] = d.sum(axis=0)
            if i > 0:
                d = (d @ self.W[i].T) * (1.0 - acts[i] ** 2)
        return value, gw, gb

    def fit(self, x, y, loss: str = "mse", quantiles=None, steps: int = 2000, batch: int = 256,
            lr: float = 3e-3, decay: float = 1e-4, seed: int = 0) -> float:
        # minibatch adam, the weight decay is decoupled and leaves the biases alone
        x = np.asarray(x, dtype=float)
        y = np.asarray(y, dtype=float)
        if y.ndim == 1:
            y = y[:, None]
        self.scale_to(x, y, shared_y=(loss == "pinball"))
        z = (x - self.x_mu) / self.x_sd
        if loss == "pinball":
            zy = (y - self.y_mu[0]) / self.y_sd[0]
            q = np.asarray(quantiles, dtype=float)[None, :]
        else:
            zy = (y - self.y_mu) / self.y_sd
            q = None
        rng = np.random.default_rng(seed)
        params = self.W + self.b
        m = [np.zeros_like(p) for p in params]
        v = [np.zeros_like(p) for p in params]
        b1, b2, eps = 0.9, 0.999, 1e-8
        nw = len(self.W)
        n = z.shape[0]
        batch = min(batch, n)
        order = rng.permutation(n)
        pos = 0
        value = 0.0
        for step in range(1, steps + 1):
            if pos + batch > n:
                order = rng.permutation(n)
                pos = 0
            idx = order[pos:pos + batch]
            pos += batch
            value, gw, gb = self._grads(z[idx], zy[idx], loss, q)
            grads = gw + gb
            # cosine fall of the step size down to a tenth
            rate = lr * (0.1 + 0.9 * 0.5 * (1.0 + math.cos(math.pi * step / steps)))
            c1 = 1.0 - b1 ** step
            c2 = 1.0 - b2 ** step
            for k, (p, g) in enumerate(zip(params, grads)):
                m[k] = b1 * m[k] + (1.0 - b1) * g
                v[k] = b2 * v[k] + (1.0 - b2) * g * g
                p -= rate * (m[k] / c1) / (np.sqrt(v[k] / c2) + eps)
                if k < nw and decay:
                    p -= rate * decay * p
        return value

    def to_arrays(self, prefix: str) -> dict:
        out = {f"{prefix}x_mu": self.x_mu, f"{prefix}x_sd": self.x_sd,
               f"{prefix}y_mu": self.y_mu, f"{prefix}y_sd": self.y_sd}
        for i, (w, b) in enumerate(zip(self.W, self.b)):
            out[f"{prefix}W{i}"] = w
            out[f"{prefix}b{i}"] = b
        return out

    @classmethod
    def from_arrays(cls, arrays, prefix: str) -> MLP:
        layers = 0
        while f"{prefix}W{layers}" in arrays:
            layers += 1
        ws = [np.array(arrays[f"{prefix}W{i}"], dtype=float) for i in range(layers)]
        net = cls(ws[0].shape[0], [w.shape[1] for w in ws[:-1]], ws[-1].shape[1])
        net.W = ws
        net.b = [np.array(arrays[f"{prefix}b{i}"], dtype=float) for i in range(layers)]
        for k in ("x_mu", "x_sd", "y_mu", "y_sd"):
            setattr(net, k, np.array(arrays[f"{prefix}{k}"], dtype=float))
        return net

