"""Bot-count comparison: 1, 2, 4, 8 bots, same number of rounds, 2 seeds each.

    python -m engine.scripts.compare_bots --rounds 3 [--counts 1,2,4,8] [--seeds 2]
    python -m engine.scripts.compare_bots --summarize   # table from finished runs in MongoDB
"""
import argparse
import asyncio
import json

from engine import store
from engine.config import DATA
from engine.loop import RunLoop


async def main_async(args):
    results = []
    for n in map(int, args.counts.split(",")):
        for seed in range(args.seeds):
            loop = RunLoop(args.job, n, args.rounds, tag=f"compare-{n}-{seed}")
            await loop.run()
            best = loop.strategies[loop.best_id]
            results.append({"bots": n, "seed": seed, "run_id": loop.run_id,
                            "practice": best["practice_gap"], "check": best.get("check_gap")})
            print(results[-1], flush=True)
    (DATA / "compare_bots.json").write_text(json.dumps(results, indent=2))
    store.db().events.insert_one({"run_id": None, "ts": store.now(), "type": "compare_bots", "bot": None,
                                  "data": {"results": results}})
    print_table(results)


def print_table(results):
    print(f"\n{'bots':>5s} {'runs':>5s} {'practice mean':>14s} {'range':>16s} {'check mean':>11s}")
    for n in sorted({r["bots"] for r in results}):
        rs = [r for r in results if r["bots"] == n]
        ps = [r["practice"] for r in rs]
        cs = [r["check"] for r in rs if r["check"] is not None]
        rng = f"{min(ps):.2f}-{max(ps):.2f}"
        print(f"{n:5d} {len(rs):5d} {sum(ps) / len(ps):14.2f} {rng:>16s} "
              f"{sum(cs) / len(cs) if cs else float('nan'):11.2f}")


def summarize():
    """Rebuild the table from finished compare-* runs, so stopping the comparison early loses nothing."""
    d = store.db()
    results = []
    for run in d.runs.find({"tag": {"$regex": "^compare-"}, "status": "finished"}).sort("started_at", 1):
        best = d.strategies.find_one({"_id": run["best_strategy_id"]}, {"practice_gap": 1, "check_gap": 1})
        _, n, seed = run["tag"].split("-")
        results.append({"bots": int(n), "seed": int(seed), "run_id": run["_id"],
                        "practice": best["practice_gap"], "check": best.get("check_gap")})
    (DATA / "compare_bots.json").write_text(json.dumps(results, indent=2))
    for r in results:
        print(r)
    print_table(results)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--job", default="jobshop")
    ap.add_argument("--rounds", type=int, default=3)
    ap.add_argument("--counts", default="1,2,4,8")
    ap.add_argument("--seeds", type=int, default=2)
    ap.add_argument("--summarize", action="store_true")
    args = ap.parse_args()
    if args.summarize:
        summarize()
    else:
        asyncio.run(main_async(args))


if __name__ == "__main__":
    main()
