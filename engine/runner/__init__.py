from engine import config


def run_batch(job_name, strategies, instance_ids, time_limit=None, repeats=None, runner=None):
    """strategies: {key: code} -> {key: {instance_id: {"instance_id", "runs": [...]}}}"""
    time_limit = config.TIME_LIMIT_S if time_limit is None else time_limit
    repeats = config.REPEATS if repeats is None else repeats
    if (runner or config.RUNNER) == "lambda":
        from engine.runner.lambda_client import run_batch as rb
    else:
        from engine.runner.local import run_batch as rb
    return rb(job_name, strategies, instance_ids, time_limit, repeats)


def summarize(job, results: dict[str, dict]) -> dict:
    """{instance_id: response} -> mean gap over all runs, spread, per-instance means. Any failed run fails the set."""
    from statistics import mean, pstdev
    from engine.jobs.base import gap
    per, all_gaps, errors = {}, [], []
    for iid, resp in results.items():
        ref = job.reference(iid)
        gaps = []
        for r in resp["runs"]:
            if "score" in r:
                gaps.append(gap(r["score"], ref))
            else:
                errors.append(f"{iid}: {r['error']}")
        per[iid] = round(mean(gaps), 3) if gaps else None
        all_gaps += gaps
    ok = not errors and bool(all_gaps)
    inst_means = [v for v in per.values() if v is not None]
    return {
        "ok": ok,
        "gap": round(mean(inst_means), 3) if ok else None,
        "spread": round(pstdev(all_gaps), 3) if ok and len(all_gaps) > 1 else 0.0,
        "per_instance": per,
        "errors": errors[:5],
    }
