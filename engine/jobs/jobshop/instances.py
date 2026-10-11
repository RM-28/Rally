"""JSPLIB loader and instance-set splits."""
from __future__ import annotations

import json
from functools import lru_cache

from engine.config import DATA

JSPLIB = DATA / "JSPLIB"
GENERATED = DATA / "generated"
SPLITS = DATA / "splits.json"
REFERENCE = DATA / "reference.json"


def _r(prefix, a, b):
    return [f"{prefix}{i:02d}" for i in range(a, b + 1)]


# fixed by the build plan; fresh/events ids are added by generate.py
JSPLIB_SPLITS = {
    "quick": ["ft06", "la01"],
    "practice": _r("ta", 41, 45) + _r("ta", 51, 55) + _r("swv", 11, 15),
    "check": ["ta31", "ta32", "ta33", "swv06", "swv07", "swv08"],
    "heldout": _r("ta", 46, 50) + _r("ta", 56, 65) + _r("swv", 16, 20),
}


def parse_jsplib(text: str, instance_id: str) -> dict:
    rows = [ln.split() for ln in text.splitlines() if ln.strip() and not ln.lstrip().startswith("#")]
    n_jobs, n_machines = int(rows[0][0]), int(rows[0][1])
    jobs = []
    for r in rows[1:1 + n_jobs]:
        nums = list(map(int, r))
        jobs.append([[nums[i], nums[i + 1]] for i in range(0, len(nums), 2)])
    return {"id": instance_id, "jobs": jobs, "n_machines": n_machines, "release": None, "downtime": None}


@lru_cache(maxsize=None)
def jsplib_meta() -> dict:
    return {x["name"]: x for x in json.loads((JSPLIB / "instances.json").read_text())}


@lru_cache(maxsize=None)
def load(instance_id: str) -> dict:
    gen = GENERATED / f"{instance_id}.json"
    if gen.exists():
        return json.loads(gen.read_text())
    path = JSPLIB / "instances" / instance_id
    if not path.exists():
        raise FileNotFoundError(f"instance {instance_id} not found (clone JSPLIB into data/JSPLIB?)")
    return parse_jsplib(path.read_text(), instance_id)


@lru_cache(maxsize=1)
def splits() -> dict:
    if not SPLITS.exists():
        raise FileNotFoundError("data/splits.json missing: run python -m engine.jobs.jobshop.generate")
    return json.loads(SPLITS.read_text())


@lru_cache(maxsize=1)
def _solver_refs() -> dict:
    return json.loads(REFERENCE.read_text()) if REFERENCE.exists() else {}


def reference(instance_id: str) -> float:
    meta = jsplib_meta().get(instance_id) if (JSPLIB / "instances.json").exists() else None
    if meta:
        if meta.get("optimum") is not None:
            return float(meta["optimum"])
        return float(meta["bounds"]["upper"])
    refs = _solver_refs()
    if instance_id in refs:
        return float(refs[instance_id]["score"])
    raise KeyError(f"no reference for {instance_id}: run python -m engine.scripts.solver_ref")
