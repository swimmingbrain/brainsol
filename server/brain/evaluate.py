"""compares language models on the extraction with the test sentences in eval/cases.json.

runs the same extract and plant table lookup as POST /recipe, against whatever
LLM_BASE_URL and LLM_MODEL point to, and scores the plant and both window lists
per case. a report lands in eval/results/ so models can be compared later:

    LLM_BASE_URL=http://localhost:11434/v1 LLM_MODEL=gemma3:4b uv run python -m brain.evaluate
"""

from __future__ import annotations

import argparse
import asyncio
import json
import re
import time
from datetime import datetime
from pathlib import Path

from .llm import Llm, LlmError, Settings
from .plants import table
from .recipe import Window, minutes

ROOT = Path(__file__).resolve().parent.parent / "eval"


def windows_match(got: list[Window], want: list[list[str]], tol: int) -> bool:
    if len(got) != len(want):
        return False
    for g, (start, end) in zip(got, sorted(want, key=lambda w: minutes(w[0]))):
        if abs(minutes(g.start) - minutes(start)) > tol or abs(minutes(g.end) - minutes(end)) > tol:
            return False
    return True


def show(windows: list[Window]) -> str:
    return ", ".join(f"{w.start}-{w.end}" for w in windows) or "none"


async def run_case(llm: Llm, case: dict) -> dict:
    tol = case.get("tol", 60)
    started = time.perf_counter()
    try:
        said = await llm.extract(case["prompt"], case.get("lang", "de"))
    except LlmError as e:
        return {"id": case["id"], "ok": False, "error": f"{e.code}: {e.msg}", "seconds": time.perf_counter() - started}
    seconds = time.perf_counter() - started
    found = table().find(said.plant)
    got_plant = found.name if found else ("ask" if said.plant else None)
    want_plant = case["plant"]
    # an unknown plant and no plant both end in a question back, the farmer sees the same chips
    plant_ok = got_plant == want_plant or (want_plant in ("ask", None) and got_plant in ("ask", None))
    avoid_ok = windows_match(said.avoid_sun, case["avoid_sun"], tol)
    power_ok = windows_match(said.power_first, case["power_first"], tol)
    return {
        "id": case["id"],
        "ok": plant_ok and avoid_ok and power_ok,
        "plant": {"ok": plant_ok, "said": said.plant, "got": got_plant, "want": want_plant},
        "avoid_sun": {"ok": avoid_ok, "got": show(said.avoid_sun)},
        "power_first": {"ok": power_ok, "got": show(said.power_first)},
        "seconds": round(seconds, 2),
    }


async def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--repeat", type=int, default=1, help="runs per case, to see how stable a model is")
    parser.add_argument("--only", help="run only cases whose id contains this text")
    args = parser.parse_args()

    settings = Settings.from_env()
    llm = Llm(settings)
    if not llm.ready:
        print("set LLM_BASE_URL and LLM_MODEL first")
        return 2
    cases = json.loads((ROOT / "cases.json").read_text("utf-8"))["cases"]
    if args.only:
        cases = [c for c in cases if args.only in c["id"]]

    print(f"model {settings.model} at {settings.base_url}, json schema {'on' if settings.json_schema else 'off'}\n")
    results = []
    for case in cases:
        for _ in range(args.repeat):
            r = await run_case(llm, case)
            results.append(r)
            mark = "ok  " if r["ok"] else "FAIL"
            if "error" in r:
                print(f"{mark} {r['id']:<24} {r['error']}")
                continue
            parts = []
            for field in ("plant", "avoid_sun", "power_first"):
                if not r[field]["ok"]:
                    got = r[field]["got"]
                    want = case[field] if field == "plant" else show([Window(**{"from": a, "to": b}) for a, b in case[field]])
                    parts.append(f"{field}: got {got!r}, want {want!r}")
            print(f"{mark} {r['id']:<24} {r['seconds']:>5.1f}s  {'; '.join(parts)}")

    passed = sum(r["ok"] for r in results)
    times = [r["seconds"] for r in results if "error" not in r]
    field_score = {
        f: sum(1 for r in results if "error" not in r and r[f]["ok"]) for f in ("plant", "avoid_sun", "power_first")
    }
    print(f"\n{passed}/{len(results)} cases right", end="")
    if times:
        print(f", {sum(times) / len(times):.1f}s per request on average", end="")
    print("\n" + ", ".join(f"{f} {n}/{len(results)}" for f, n in field_score.items()))

    out = ROOT / "results"
    out.mkdir(exist_ok=True)
    name = re.sub(r"[^a-zA-Z0-9._-]+", "_", settings.model)
    path = out / f"{datetime.now():%Y%m%d-%H%M%S}-{name}.json"
    path.write_text(
        json.dumps(
            {
                "model": settings.model,
                "base_url": settings.base_url,
                "json_schema": settings.json_schema,
                "passed": passed,
                "total": len(results),
                "fields": field_score,
                "results": results,
            },
            ensure_ascii=False,
            indent=2,
        ),
        "utf-8",
    )
    print(f"report: {path.relative_to(ROOT.parent)}")
    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
