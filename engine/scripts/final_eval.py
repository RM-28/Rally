"""Final score on held-out + fresh + events. The ONLY code that touches those sets. Runs once.

    python -m engine.scripts.final_eval                 # best-ever strategy of the latest main run
    python -m engine.scripts.final_eval --strategy <id>
    python -m engine.scripts.final_eval --dry-run       # 2 events instances, nothing recorded
    python -m engine.scripts.final_eval --force         # only if you really must rerun

Nothing is tuned after this runs.
"""
import argparse
import json
import subprocess
import time

from engine import config, store
from engine.config import DATA, ROOT
from engine.jobs import get_job
from engine.runner import run_batch, summarize

LOCK = DATA / "final_eval.json"
FINAL_SETS = ["heldout", "fresh", "events"]


def splits_commit():
    try:
        dirty = subprocess.check_output(["git", "status", "--porcelain", "--", "data/splits.json", "data/generated"],
                                        cwd=ROOT, text=True).strip()
        commit = subprocess.check_output(["git", "log", "-1", "--format=%H", "--", "data/splits.json"],
                                         cwd=ROOT, text=True).strip()
        return commit or None, bool(dirty)
    except Exception:  # noqa: BLE001
        return None, True


def pick_strategy(sid):
    d = store.db()
    if sid:
        doc = d.strategies.find_one({"_id": sid})
    else:
        run = d.runs.find_one({"tag": None, "status": {"$in": ["finished", "stopped"]}}, sort=[("started_at", -1)])
        if not run:
            raise SystemExit("no finished run found; pass --strategy")
        doc = d.strategies.find_one({"_id": run["best_strategy_id"]})
    if not doc:
        raise SystemExit("strategy not found")
    return doc


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--job", default="jobshop")
    ap.add_argument("--strategy", default=None)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--runner", default=None)
    args = ap.parse_args()

    job = get_job(args.job)
    sets = job.sets()
    strat = pick_strategy(args.strategy)
    contenders = {**job.baselines(), "final": strat["code"]}

    if args.dry_run:
        ids = sets["events"][:2]
        print(f"DRY RUN on {ids} (not recorded). Do not tune anything based on these numbers.")
        res = run_batch(args.job, contenders, ids, config.TIME_LIMIT_S, 1, runner=args.runner)
        for name in contenders:
            for iid, r in res[name].items():
                print(f"  {name:12s} {iid}: {r['runs']}")
        return

    if LOCK.exists() and not args.force:
        raise SystemExit(f"final_eval already ran ({json.loads(LOCK.read_text())['ran_at']}). Use --force to rerun.")
    commit, dirty = splits_commit()
    if not commit or dirty:
        raise SystemExit("data/splits.json and data/generated must be committed and clean before the final eval")

    t0 = time.time()
    table = {}
    for set_name in FINAL_SETS:
        res = run_batch(args.job, contenders, sets[set_name], config.TIME_LIMIT_S, config.REPEATS, runner=args.runner)
        table[set_name] = {name: summarize(job, res[name]) for name in contenders}
        table[set_name]["_runs"] = res

    out = {
        "ran_at": store.now().isoformat(), "splits_commit": commit, "strategy_id": strat["_id"],
        "strategy_bot": strat["bot"], "time_limit": config.TIME_LIMIT_S, "repeats": config.REPEATS,
        "forced": args.force, "secs": round(time.time() - t0, 1),
        "table": {s: {n: {k: v for k, v in r.items() if k != "_runs"} if n != "_runs" else r
                      for n, r in rows.items()} for s, rows in table.items()},
    }
    LOCK.write_text(json.dumps(out, indent=2, default=str))
    summary = {s: {n: table[s][n]["gap"] for n in contenders} for s in FINAL_SETS}
    store.db().events.insert_one({"run_id": strat["run_id"], "ts": store.now(), "type": "final_result",
                                  "bot": strat["bot"], "data": {"summary": summary, "strategy_id": strat["_id"]}})

    print(f"\nFinal eval of {strat['_id']} ({strat['bot']}), mean gap % vs reference, {config.REPEATS} runs each")
    print(f"{'set':10s}" + "".join(f"{n:>14s}" for n in contenders) + f"{'reference':>12s}")
    for s in FINAL_SETS:
        print(f"{s:10s}" + "".join(f"{str(summary[s][n]):>14s}" for n in contenders) + f"{'0.0':>12s}")
    print("\nRelative improvement of final vs each baseline (share of the gap removed):")
    for s in FINAL_SETS:
        fin = summary[s]["final"]
        parts = [f"vs {n}: {100 * (summary[s][n] - fin) / summary[s][n]:.0f}%"
                 for n in contenders if n != "final" and fin is not None and summary[s][n]]
        print(f"  {s:10s} " + "  ".join(parts))
    print(f"\nwritten to {LOCK}")


if __name__ == "__main__":
    main()
