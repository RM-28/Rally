"""Prints practice and check gaps for every baseline (no model calls). Also the Round 0 numbers.

    python -m engine.scripts.baseline [--sets practice,check] [--runner local]
"""
import argparse
import time

from engine import config
from engine.jobs import get_job
from engine.runner import run_batch, summarize


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--job", default="jobshop")
    ap.add_argument("--sets", default="quick,practice,check")
    ap.add_argument("--runner", default=None)
    args = ap.parse_args()

    job = get_job(args.job)
    sets = job.sets()
    bases = job.baselines()
    for set_name in args.sets.split(","):
        if set_name in ("heldout", "fresh", "events"):
            raise SystemExit(f"'{set_name}' is final-only; use scripts/final_eval.py")
        t0 = time.time()
        # baselines are deterministic, one repeat is enough
        res = run_batch(args.job, bases, sets[set_name], config.TIME_LIMIT_S, 1, runner=args.runner)
        print(f"\n== {set_name} ({len(sets[set_name])} instances, {time.time() - t0:.1f}s)")
        for name in bases:
            s = summarize(job, res[name])
            print(f"  {name:12s} mean gap {s['gap']}%" if s["ok"] else f"  {name:12s} FAILED {s['errors']}")
            print("     " + "  ".join(f"{k}:{v}" for k, v in s["per_instance"].items()))


if __name__ == "__main__":
    main()
