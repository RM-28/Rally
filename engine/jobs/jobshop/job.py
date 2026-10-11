from __future__ import annotations

from pathlib import Path

from engine.jobs.jobshop import instances
from engine.jobs.jobshop.decoder import decode, normalize_downtime

HERE = Path(__file__).resolve().parent


class JobShop:
    name = "jobshop"
    entrypoint = "solve"

    def brief(self) -> str:
        return (HERE / "brief.md").read_text()

    def sets(self) -> dict[str, list[str]]:
        s = instances.splits()
        return {k: v for k, v in s.items() if isinstance(v, list)}

    def load(self, instance_id: str) -> dict:
        return instances.load(instance_id)

    def baselines(self) -> dict[str, str]:
        return {p.stem: p.read_text() for p in sorted((HERE / "baselines").glob("*.py"))}

    def call_args(self, instance: dict, time_limit: float) -> dict:
        dt = normalize_downtime(instance.get("downtime"))
        n_m = instance["n_machines"]
        return {
            "jobs": instance["jobs"],
            "n_machines": n_m,
            "time_limit": time_limit,
            "release": instance.get("release"),
            "downtime": [dt.get(m, []) for m in range(n_m)] if dt else None,
        }

    def score(self, instance: dict, output) -> float:
        ms, _ = decode(instance["jobs"], instance["n_machines"], output,
                       instance.get("release"), instance.get("downtime"))
        return float(ms)

    def reference(self, instance_id: str) -> float:
        return instances.reference(instance_id)

    def showcase(self, instance: dict, output) -> dict:
        ms, ops = decode(instance["jobs"], instance["n_machines"], output,
                         instance.get("release"), instance.get("downtime"))
        rows = [[] for _ in range(instance["n_machines"])]
        for j, k, m, s, e in ops:
            rows[m].append([j, k, s, e])
        dt = normalize_downtime(instance.get("downtime")) or {}
        return {
            "instance_id": instance["id"], "makespan": ms,
            "n_jobs": len(instance["jobs"]), "n_machines": instance["n_machines"],
            "rows": rows,  # rows[machine] = [[job, step, start, end], ...]
            "downtime": {str(m): ws for m, ws in dt.items()},
        }
