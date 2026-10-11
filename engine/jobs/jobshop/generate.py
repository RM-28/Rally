"""Fresh instances (Taillard recipe) + surprise-event variants, and data/splits.json.

Run once, then commit data/splits.json and data/generated/ BEFORE round 1:
    python -m engine.jobs.jobshop.generate
"""
from __future__ import annotations

import json
import random
import subprocess

from engine.jobs.jobshop.instances import GENERATED, JSPLIB_SPLITS, SPLITS

FRESH_SPECS = [(30, 20)] * 5 + [(50, 15)] * 5
FRESH_SEEDS = [20261011 + i for i in range(10)]
EVENT_SEEDS = [91011 + i for i in range(10)]


def taillard(n_jobs: int, n_machines: int, seed: int, instance_id: str) -> dict:
    rng = random.Random(seed)
    jobs = []
    for _ in range(n_jobs):
        order = list(range(n_machines))
        rng.shuffle(order)
        jobs.append([[m, rng.randint(1, 99)] for m in order])
    return {"id": instance_id, "jobs": jobs, "n_machines": n_machines, "release": None, "downtime": None}


def lower_bound(inst: dict) -> int:
    loads = [0] * inst["n_machines"]
    for job in inst["jobs"]:
        for m, d in job:
            loads[m] += d
    return max(max(loads), max(sum(d for _, d in j) for j in inst["jobs"]))


def with_events(base: dict, seed: int, instance_id: str) -> dict:
    """One downtime window on the busiest machine and one late-released job."""
    rng = random.Random(seed)
    loads = [0] * base["n_machines"]
    for job in base["jobs"]:
        for m, d in job:
            loads[m] += d
    busiest = max(range(len(loads)), key=loads.__getitem__)
    lb = lower_bound(base)
    start = int(lb * rng.uniform(0.2, 0.5))
    length = int(lb * rng.uniform(0.05, 0.10))
    late_job = rng.randrange(len(base["jobs"]))
    release = [0] * len(base["jobs"])
    release[late_job] = int(lb * rng.uniform(0.2, 0.4))
    return {
        "id": instance_id, "jobs": base["jobs"], "n_machines": base["n_machines"],
        "release": release, "downtime": {str(busiest): [[start, start + length]]},
        "event": {"from": base["id"], "busiest_machine": busiest, "window": [start, start + length],
                  "late_job": late_job, "release": release[late_job]},
    }


def main():
    GENERATED.mkdir(parents=True, exist_ok=True)
    fresh_ids, event_ids, seeds = [], [], {}
    for i, ((nj, nm), seed) in enumerate(zip(FRESH_SPECS, FRESH_SEEDS), 1):
        fid = f"fresh{i:02d}"
        inst = taillard(nj, nm, seed, fid)
        (GENERATED / f"{fid}.json").write_text(json.dumps(inst))
        fresh_ids.append(fid)
        seeds[fid] = {"seed": seed, "jobs": nj, "machines": nm}

        eid = f"event{i:02d}"
        ev = with_events(inst, EVENT_SEEDS[i - 1], eid)
        (GENERATED / f"{eid}.json").write_text(json.dumps(ev))
        event_ids.append(eid)
        seeds[eid] = {"seed": EVENT_SEEDS[i - 1], "from": fid}

    out = dict(JSPLIB_SPLITS)
    out["fresh"] = fresh_ids
    out["events"] = event_ids
    out["seeds"] = seeds
    try:
        out["generated_at_commit"] = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
    except Exception:  # noqa: BLE001 - no commits yet
        out["generated_at_commit"] = None
    SPLITS.write_text(json.dumps(out, indent=2))
    print(f"wrote {SPLITS} and {len(fresh_ids) + len(event_ids)} instances to {GENERATED}")


if __name__ == "__main__":
    main()
