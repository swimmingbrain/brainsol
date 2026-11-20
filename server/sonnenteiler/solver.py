from __future__ import annotations

import heapq
import math

import numpy as np

from .money import to_dli, to_eur

# the rules and the best plan, from the teammate's plan.py (allowed, _buy_light, oracle), on numpy
# arrays of shape (steps, actions)


def allowed(power, ppfd, stress, power_hour, shade_hour=None):
    # in power hours only the most power, else in shade hours only the least light on the crop,
    # else none that stress the crop, or the least light when all do
    ok = ~np.asarray(stress, dtype=bool)
    n = ok.shape[0]
    rows = np.arange(n)
    least = np.argmin(ppfd, axis=1) if n else np.zeros(0, int)
    none = ~ok.any(axis=1)
    if shade_hour is not None:
        none |= np.asarray(shade_hour, dtype=bool)
    if none.any():
        ok[none] = False
        ok[rows[none], least[none]] = True
    ph = np.asarray(power_hour, dtype=bool)
    if ph.any():
        most = np.argmax(power, axis=1)
        ok[ph] = False
        ok[rows[ph], most[ph]] = True
    return ok


def hold_starts(n: int, k0: int, hold: int) -> np.ndarray:
    # hold blocks counted from the first step of the local day, the first one may be cut at k0
    later = np.arange((k0 // hold + 1) * hold, n, hold)
    return np.concatenate([[k0], later]).astype(int) - k0


class Result:
    def __init__(self, picks, first, moves, starts):
        self.picks = picks
        # the allowed action worth most at every step, before any light is bought
        self.first = first
        # (block, action, value lost, light gained, revenue lost) for every purchase
        self.moves = moves
        self.starts = starts


def buy_light(value, light, ok, starts, target_left: float, max_cost: float, dt_h: float, revenue=None,
              tie: str = "revenue") -> Result:
    """start from the allowed action worth most at every step, then keep buying crop light in the hold
    block where it costs the least value per light, while it costs less than max_cost and the crop is
    below its target. the last block turns only as far as the target needs"""
    value = np.asarray(value, dtype=float)
    light = np.asarray(light, dtype=float)
    n = value.shape[0]
    if n == 0:
        return Result(np.zeros(0, int), np.zeros(0, int), [], starts)
    revenue = value if revenue is None else np.asarray(revenue, dtype=float)
    td = to_dli(dt_h)
    rows = np.arange(n)
    picks = np.where(ok, value, -np.inf).argmax(axis=1)
    first = picks.copy()
    need = target_left - float(light[rows, picks].sum()) * td
    starts = np.asarray(starts, dtype=int)
    big_v = np.add.reduceat(value, starts, axis=0)
    big_q = np.add.reduceat(light, starts, axis=0)
    big_r = np.add.reduceat(revenue, starts, axis=0)
    every = np.logical_and.reduceat(ok, starts, axis=0)
    v0 = np.add.reduceat(value[rows, picks], starts)
    q0 = np.add.reduceat(light[rows, picks], starts)
    r0 = np.add.reduceat(revenue[rows, picks], starts)
    ends = np.append(starts[1:], n)
    choices = [np.flatnonzero(every[b]).tolist() for b in range(len(starts))]
    moves = []
    heap: list = []

    def gains(b: int):
        # (value lost, light gained, action) for every move to more light in block b
        return [(v0[b] - big_v[b, k], big_q[b, k] - q0[b], k) for k in choices[b] if big_q[b, k] > q0[b] + 1e-9]

    def rank(b: int, m) -> tuple:
        # with value = power every move costs the same energy per light while nothing clips, so the order
        # would hang on float noise. equal costs go: revenue to the move that loses the least revenue,
        # late to the latest block (a forecast knows more by then), early to the first block, price free
        lost, gained, k = m
        second = {"late": -b, "early": b}.get(tie)
        if second is None:
            second = _q((r0[b] - big_r[b, k]) / gained)
        return _q(lost / gained), second, -gained

    def offer(b: int) -> None:
        mv = gains(b)
        if mv:
            m = min(mv, key=lambda m: rank(b, m))
            heapq.heappush(heap, (*rank(b, m)[:2], b, m[2], m[0] / m[1]))

    for b in range(len(starts)):
        offer(b)
    while need > 0 and heap:
        _, _, b, k, cost = heapq.heappop(heap)
        if cost >= max_cost:
            break
        mv = gains(b)
        lost, gained = next((lo, ga) for lo, ga, kk in mv if kk == k)
        if gained * td > need:
            lost, gained, k = min((m for m in mv if m[1] * td >= need), key=lambda m: m[0])
            # the cheapest single move of any block that still covers the need, never worse than the
            # popped block alone and it keeps the result away from the tie order
            for bb in range(len(starts)):
                for m in gains(bb):
                    if m[1] * td >= need and m[0] < lost and m[0] / m[1] < max_cost:
                        lost, gained, k = m
                        b = bb
            if lost / gained >= max_cost:
                break
        picks[starts[b]:ends[b]] = k
        moves.append((b, k, float(lost), float(gained), float(r0[b] - big_r[b, k])))
        v0[b], q0[b], r0[b] = big_v[b, k], big_q[b, k], big_r[b, k]
        need -= gained * td
        offer(b)
    return Result(picks, first, moves, starts)


def _q(x: float) -> float:
    # nine significant digits, below that the costs of two moves count as equal
    return float(f"{x:.9g}")


def solve(kind: str, power, ppfd, light, stress, power_hour, price, starts, target_left: float,
          dt_h: float, wm2_per_mw: float, late: bool = False, shade_hour=None) -> Result:
    """the light target is a duty, bought at any cost. duty: value = electricity revenue, so the light
    goes where it costs the least revenue per mol and below a price of zero first. blind: value = power,
    the teammate's oracle, the plant first without looking at the price"""
    price = np.asarray(price, dtype=float)
    revenue = power * price[:, None] * to_eur(dt_h, wm2_per_mw)
    ok = allowed(power, ppfd, stress, power_hour, shade_hour)
    if kind == "duty":
        return buy_light(revenue, light, ok, starts, target_left, math.inf, dt_h, revenue=revenue,
                         tie="late" if late else "revenue")
    return buy_light(power, light, ok, starts, target_left, math.inf, dt_h, revenue=revenue, tie="early")


def max_light(light, ok, starts) -> float:
    # the most light the hold blocks can bring under the rules, one action per block where one fits all
    light = np.asarray(light, dtype=float)
    if light.shape[0] == 0:
        return 0.0
    starts = np.asarray(starts, dtype=int)
    per_step = np.add.reduceat(np.where(ok, light, -np.inf).max(axis=1), starts)
    every = np.logical_and.reduceat(ok, starts, axis=0)
    hold = np.where(every, np.add.reduceat(light, starts, axis=0), -np.inf).max(axis=1)
    return float(np.where(np.isfinite(hold), hold, per_step).sum())


def light_price(res: Result, dt_h: float) -> float:
    # the highest revenue in € per mol the plan gives up for crop light
    td = to_dli(dt_h)
    prices = [r_lost / (gained * td) for _, _, _, gained, r_lost in res.moves if gained > 0]
    return max(0.0, max(prices)) if prices else 0.0
