"""Subprocess runner: thread pool of subprocesses, pool size = CPU count. One process per repeat."""
from __future__ import annotations

import os
from concurrent.futures import ThreadPoolExecutor

from engine import config
from engine.jobs import get_job
from engine.runner.core import run_child, score_child_result


def run_batch(job_name: str, strategies: dict[str, str], instance_ids: list[str],
              time_limit: float, repeats: int, instances: dict[str, dict] | None = None,
              keep_output: bool = False) -> dict[str, dict[str, dict]]:
    if not config.ALLOW_LOCAL_RUNNER:
        raise RuntimeError("local strategy runs are disabled (ALLOW_LOCAL_RUNNER=0); use RUNNER=lambda")
    job = get_job(job_name)
    insts = {iid: (instances or {}).get(iid) or job.load(iid) for iid in instance_ids}
    args = {iid: job.call_args(insts[iid], time_limit) for iid in instance_ids}

    def unit(key, iid):
        res = run_child(strategies[key], job.entrypoint, args[iid], time_limit)
        return key, iid, score_child_result(job, insts[iid], res, time_limit, keep_output)

    out = {k: {iid: {"instance_id": iid, "runs": []} for iid in instance_ids} for k in strategies}
    with ThreadPoolExecutor(max_workers=os.cpu_count() or 4) as pool:
        futs = [pool.submit(unit, k, iid) for k in strategies for iid in instance_ids for _ in range(repeats)]
        for f in futs:
            k, iid, run = f.result()
            out[k][iid]["runs"].append(run)
    return out
