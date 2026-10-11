"""Small team vs big team on the same wall-clock budget, no human steering, one after the other.

    python -m engine.scripts.head_to_head --minutes 15 [--counts 2,8]

Writes data/head_to_head.json for the board's Results screen: best practice gap at 5, 10 and 15 minutes,
check gap at the end, rounds finished and tokens used.
"""
import argparse
import asyncio
import json

from engine import store
from engine.config import DATA
from engine.loop import RunLoop


def best_at(rounds: list[dict], t0, minutes: float, key: str):
    done = [r for r in rounds if (r["finished_at"] - t0).total_seconds() <= minutes * 60]
    return done[-1].get(key) if done else None


async def one(job: str, n: int, minutes: float) -> dict:
    loop = RunLoop(job, n, rounds=50, tag=f"h2h-{n}")
    try:
        await asyncio.wait_for(loop.run(), timeout=minutes * 60 + 5)
    except asyncio.TimeoutError:
        pass
    d = store.db()
    run = d.runs.find_one({"_id": loop.run_id})
    rounds = list(d.rounds.find({"run_id": loop.run_id}, {"n": 1, "finished_at": 1, "best_ever_practice_gap": 1,
                                                         "best_ever_check_gap": 1}).sort("n", 1))
    t0 = run["started_at"]
    usage = store.usage_totals(loop.run_id)
    marks = [m for m in (5, 10, 15) if m <= minutes]
    out = {"bots": n, "run_id": loop.run_id, "minutes": minutes,
           "rounds": sum(1 for r in rounds if r["n"] >= 1 and (r["finished_at"] - t0).total_seconds() <= minutes * 60),
           "tokens": usage["tokens_in"] + usage["tokens_out"]}
    for m in marks:
        out[f"at{m}"] = best_at(rounds, t0, m, "best_ever_practice_gap")
    out[f"check{marks[-1] if marks else int(minutes)}"] = best_at(rounds, t0, minutes, "best_ever_check_gap")
    return out


async def main_async(args):
    rows = []
    for n in map(int, args.counts.split(",")):
        rows.append(await one(args.job, n, args.minutes))
        print(rows[-1], flush=True)
    (DATA / "head_to_head.json").write_text(json.dumps(rows, indent=2))
    print(f"written to {DATA / 'head_to_head.json'}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--job", default="jobshop")
    ap.add_argument("--minutes", type=float, default=15)
    ap.add_argument("--counts", default="2,8")
    asyncio.run(main_async(ap.parse_args()))


if __name__ == "__main__":
    main()
