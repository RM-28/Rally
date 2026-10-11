"""Bot-count comparison: 1, 2, 4, 8 bots, same number of rounds, 2 seeds each.

    python -m engine.scripts.compare_bots --rounds 3 [--counts 1,2,4,8] [--seeds 2]
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
    print(f"\n{'bots':>5s} {'practice':>10s} {'check':>10s}")
    for n in sorted({r["bots"] for r in results}):
        rs = [r for r in results if r["bots"] == n]
        p = sum(r["practice"] for r in rs) / len(rs)
        cs = [r["check"] for r in rs if r["check"] is not None]
        print(f"{n:5d} {p:10.2f} {sum(cs) / len(cs) if cs else float('nan'):10.2f}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--job", default="jobshop")
    ap.add_argument("--rounds", type=int, default=3)
    ap.add_argument("--counts", default="1,2,4,8")
    ap.add_argument("--seeds", type=int, default=2)
    asyncio.run(main_async(ap.parse_args()))


if __name__ == "__main__":
    main()
