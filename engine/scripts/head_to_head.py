"""Equal wall-clock head-to-head: does a bigger team find better schedules faster?

Runs each team size one after another (never concurrently, so they don't share CPU) with the
same time budget and no steering, then reports the team-best practice gap at each minute.

    python -m engine.scripts.head_to_head --counts 2,8 --minutes 15
    python -m engine.scripts.head_to_head --summarize
"""
import argparse
import asyncio
import json

from engine import store
from engine.config import DATA
from engine.loop import RunLoop

OUT = DATA / "head_to_head.json"


def curve(run_id: str, minutes: int) -> dict:
    """Team-best practice gap at each whole minute, counting only rounds finished by then."""
    rounds = list(store.db().rounds.find({"run_id": run_id}).sort("n", 1))
    r0, rest = rounds[0], rounds[1:]
    t0 = rest[0]["started_at"] if rest else r0["finished_at"]
    pts, best = {}, r0["best_ever_practice_gap"]
    finished = [((r["finished_at"] - t0).total_seconds() / 60, r["best_ever_practice_gap"],
                 r.get("best_ever_check_gap")) for r in rest]
    check = r0.get("best_ever_check_gap")
    for m in range(0, minutes + 1):
        for t, g, c in finished:
            if t <= m:
                best, check = g, c
        pts[m] = {"practice": best, "check": check}
    proposals = store.db().strategies.count_documents({"run_id": run_id, "round": {"$gte": 1}})
    done = [x for x in finished if x[0] <= minutes]
    return {"run_id": run_id, "rounds_in_budget": len(done), "proposals": proposals, "by_minute": pts}


def report(results: list[dict], minutes: int):
    marks = [m for m in (5, 10, minutes) if m <= minutes]
    print(f"\n{'bots':>5s} {'rounds':>7s} " + "".join(f"{'@' + str(m) + 'min':>10s}" for m in marks)
          + f"{'check @' + str(minutes):>12s}")
    for r in results:
        c = r["curve"]["by_minute"]
        print(f"{r['bots']:5d} {r['curve']['rounds_in_budget']:7d} "
              + "".join(f"{c[m]['practice']:10.2f}" for m in marks)
              + f"{c[minutes]['check'] if c[minutes]['check'] is not None else float('nan'):12.2f}")


async def main_async(args):
    results = []
    for n in map(int, args.counts.split(",")):
        loop = RunLoop(args.job, n, rounds=50, tag=f"h2h-{n}", budget_s=args.minutes * 60)
        await loop.run()
        results.append({"bots": n, "minutes": args.minutes, "curve": curve(loop.run_id, args.minutes)})
        OUT.write_text(json.dumps(results, indent=2, default=str))
        print({"bots": n, "run_id": loop.run_id, "final": results[-1]["curve"]["by_minute"][args.minutes]},
              flush=True)
    report(results, args.minutes)


def summarize(minutes: int):
    results = []
    for run in store.db().runs.find({"tag": {"$regex": "^h2h-"}, "status": {"$in": ["finished", "stopped"]}}).sort(
            "started_at", 1):
        results.append({"bots": run["n_bots"], "minutes": minutes, "curve": curve(run["_id"], minutes)})
    OUT.write_text(json.dumps(results, indent=2, default=str))
    report(results, minutes)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--job", default="jobshop")
    ap.add_argument("--counts", default="2,8")
    ap.add_argument("--minutes", type=int, default=15)
    ap.add_argument("--summarize", action="store_true")
    args = ap.parse_args()
    if args.summarize:
        summarize(args.minutes)
    else:
        asyncio.run(main_async(args))


if __name__ == "__main__":
    main()
