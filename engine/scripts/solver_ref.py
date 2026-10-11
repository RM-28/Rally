"""CP-SAT reference for generated instances (fresh, events). Writes data/reference.json incrementally.

    python -m engine.scripts.solver_ref [--secs 60] [--ids fresh01,event01] [--workers 8]

Also importable: solve_cpsat(instance, secs) -> (makespan, sequence) is used for the
"solver" line in quick experiments.
"""
import argparse
import json
import time

from engine.jobs.jobshop import instances
from engine.jobs.jobshop.decoder import makespan, normalize_downtime


def solve_cpsat(inst: dict, secs: float, workers: int = 8):
    from ortools.sat.python import cp_model
    jobs, n_m = inst["jobs"], inst["n_machines"]
    release = inst.get("release") or [0] * len(jobs)
    downtime = normalize_downtime(inst.get("downtime")) or {}
    horizon = sum(d for j in jobs for _, d in j) + max(release) + sum(b for ws in downtime.values() for _, b in ws)

    m = cp_model.CpModel()
    starts, ends, per_machine = {}, {}, [[] for _ in range(n_m)]
    for j, job in enumerate(jobs):
        for k, (mc, d) in enumerate(job):
            s = m.NewIntVar(0, horizon, f"s{j}_{k}")
            e = m.NewIntVar(0, horizon, f"e{j}_{k}")
            per_machine[mc].append(m.NewIntervalVar(s, d, e, f"i{j}_{k}"))
            starts[j, k], ends[j, k] = s, e
            if k == 0:
                m.Add(s >= release[j])
            else:
                m.Add(s >= ends[j, k - 1])
    for mc, ws in downtime.items():
        for a, b in ws:
            per_machine[mc].append(m.NewIntervalVar(a, b - a, b, f"down{mc}_{a}"))
    for ivs in per_machine:
        m.AddNoOverlap(ivs)
    mk = m.NewIntVar(0, horizon, "makespan")
    m.AddMaxEquality(mk, [ends[j, len(job) - 1] for j, job in enumerate(jobs)])
    m.Minimize(mk)

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = secs
    solver.parameters.num_workers = workers
    status = solver.Solve(m)
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        raise RuntimeError("CP-SAT found no solution")
    # turn the solution into a sequence our decoder accepts: order operations by start time
    ops = sorted(((solver.Value(starts[j, k]), j, k) for j, job in enumerate(jobs) for k in range(len(job))))
    seq = [j for _, j, _ in ops]
    return makespan(jobs, n_m, seq, inst.get("release"), inst.get("downtime")), seq, solver.StatusName(status)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--secs", type=float, default=60)
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--ids", default="")
    args = ap.parse_args()
    s = instances.splits()
    ids = args.ids.split(",") if args.ids else s["fresh"] + s["events"]
    refs = json.loads(instances.REFERENCE.read_text()) if instances.REFERENCE.exists() else {}
    for iid in ids:
        t0 = time.time()
        ms, _, status = solve_cpsat(instances.load(iid), args.secs, args.workers)
        refs[iid] = {"score": ms, "status": status, "secs": args.secs, "solver": "cp-sat"}
        instances.REFERENCE.write_text(json.dumps(refs, indent=2))
        print(f"{iid}: {ms} ({status}, {time.time() - t0:.0f}s)", flush=True)


if __name__ == "__main__":
    main()
