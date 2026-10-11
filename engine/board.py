"""Board v3 reads for the Results screen, plus a one-time backfill of FCFS calendars on older runs.

Results only read what the scripts already wrote (data/*.json and the main run in Mongo); nothing is
recomputed here. "Schedule your team" lives in api.py (POST /api/schedule, GET /api/team-schedule).
"""
from __future__ import annotations

import json
from statistics import mean

from engine import config, store
from engine.config import DATA
from engine.jobs import get_job

FINAL_LABELS = {
    "heldout": ("held_out", "Held-out benchmarks", "{n} instances, vs best known"),
    "fresh": ("fresh", "Fresh instances", "{n}, generated before round 1, vs 60 s CP-SAT"),
    "events": ("events", "Surprise events", "{n}, a person out + a rush project, vs 60 s CP-SAT"),
}
BASELINE_NAMES = {"fcfs": "First come, first served", "simple_rule": "Best simple rule"}


def _read(name: str):
    p = DATA / name
    try:
        return json.loads(p.read_text()) if p.exists() else None
    except json.JSONDecodeError:
        return None


def _who(bot: str | None) -> str:
    if not bot:
        return ""
    return BASELINE_NAMES.get(bot[9:], bot[9:]) if bot.startswith("baseline:") else bot


def _shorter(rows: dict) -> float | None:
    """Mean per-instance cut in finish time vs the best simple rule, from the recorded runs (as in the README)."""
    runs = rows["_runs"]

    def ms(name):
        return {i: mean(r["score"] for r in v["runs"] if "score" in r) for i, v in runs.get(name, {}).items()
                if any("score" in r for r in v["runs"])}
    base, team = ms("simple_rule"), ms("final")
    per = [100 * (base[i] - team[i]) / base[i] for i in team if base.get(i)]
    return round(mean(per), 1) if per else None


def _final_rows(lock: dict) -> list[dict]:
    out = []
    for key, (set_id, label, detail) in FINAL_LABELS.items():
        rows = (lock.get("table") or {}).get(key)
        if not rows or "final" not in rows:
            continue
        team = rows["final"].get("gap")
        base = (rows.get("simple_rule") or {}).get("gap")
        fcfs = (rows.get("fcfs") or {}).get("gap")
        if team is None or base is None:
            continue
        n = len(rows["final"].get("per_instance") or {})
        out.append({
            "set": set_id, "label": label, "detail": detail.format(n=n),
            "baseline_gap": base, "team_gap": team,
            "shorter_pct": _shorter(rows) if "_runs" in rows else round(100 * (base - team) / (100 + base), 1),
            "gap_closed_pct": round(100 * (base - team) / base) if base else None,
            "gap_closed_vs_fcfs_pct": round(100 * (fcfs - team) / fcfs) if fcfs else None,
        })
    return out


def _main_run(lock: dict | None) -> dict | None:
    d = store.db()
    if lock and lock.get("strategy_id"):
        s = d.strategies.find_one({"_id": lock["strategy_id"]}, {"run_id": 1})
        if s:
            return d.runs.find_one({"_id": s["run_id"]})
    return d.runs.find_one({"tag": None, "status": {"$in": ["finished", "stopped"]}}, sort=[("started_at", -1)])


def _rounds(run: dict) -> tuple[list[dict], dict]:
    d = store.db()
    rid = run["_id"]
    rounds = list(d.rounds.find({"run_id": rid}, {"n": 1, "best_ever_id": 1, "best_ever_practice_gap": 1,
                                                  "best_ever_check_gap": 1}).sort("n", 1))
    strats = {s["_id"]: s for s in d.strategies.find({"run_id": rid}, {"bot": 1, "change": 1, "note": 1, "round": 1,
                                                                        "status": 1, "human_message": 1})}
    out, prev = [], None
    for r in rounds:
        s = strats.get(r.get("best_ever_id")) or {}
        if r["n"] == 0:
            set_by = f"Baseline ({_who(s.get('bot')).lower() or 'best simple rule'})"
        elif r.get("best_ever_id") != prev:
            set_by = f"{_who(s.get('bot'))}: {s.get('change') or s.get('note') or ''}".strip(": ")
        else:
            set_by = "No further gain"
        hm = s.get("human_message") if r.get("best_ever_id") != prev else None
        out.append({"n": r["n"], "practice": r.get("best_ever_practice_gap"), "check": r.get("best_ever_check_gap"),
                    "set_by": set_by, "human_message": hm})
        prev = r.get("best_ever_id")
    proposals = [s for s in strats.values() if s.get("round", 0) >= 1]
    usage = store.usage_totals(rid)
    end = run.get("finished_at") or store.now()
    meta = {
        "id": rid, "n_bots": run.get("n_bots"), "rounds": max((r["n"] for r in rounds), default=0),
        "calls": usage["calls"], "tokens": usage["tokens_in"] + usage["tokens_out"],
        "minutes": round((end - run["started_at"]).total_seconds() / 60, 1) if run.get("started_at") else None,
        "proposals_ok": sum(1 for s in proposals if s.get("status") == "ok"), "proposals_total": len(proposals),
    }
    return out, meta


def _team_size(rows: list[dict] | None) -> list[dict]:
    out = []
    for n in sorted({r["bots"] for r in rows or []}):
        rs = [r for r in rows if r["bots"] == n and r.get("practice") is not None]
        if not rs:
            continue
        ps = [r["practice"] for r in rs]
        cs = [r["check"] for r in rs if r.get("check") is not None]
        out.append({"bots": n, "practice_mean": round(mean(ps), 2), "lo": round(min(ps), 2), "hi": round(max(ps), 2),
                    "check_mean": round(mean(cs), 2) if cs else None, "runs": len(rs)})
    return out


def _head_to_head(rows: list[dict] | None) -> list[dict]:
    """data/head_to_head.json holds a per-minute curve per team size; the board wants a few marks."""
    out = []
    for r in rows or []:
        c = r.get("curve") or {}
        by = c.get("by_minute") or {}
        end = str(r.get("minutes", 15))
        at = lambda m, k="practice": (by.get(str(m)) or {}).get(k)  # noqa: E731
        usage = store.usage_totals(c["run_id"]) if c.get("run_id") else {"tokens_in": 0, "tokens_out": 0}
        out.append({"bots": r["bots"], "run_id": c.get("run_id"), "rounds": c.get("rounds_in_budget"),
                    "at5": at(5), "at10": at(10), "at15": at(end), "check15": at(end, "check"),
                    "tokens": usage["tokens_in"] + usage["tokens_out"]})
    return out


def results() -> dict:
    lock = _read("final_eval.json")
    run = _main_run(lock)
    rounds, meta = _rounds(run) if run else ([], None)
    return {
        "final": _final_rows(lock) if lock else [],
        "final_eval_ts": lock and lock.get("ran_at"), "splits_commit": lock and lock.get("splits_commit"),
        "strategy_id": lock and lock.get("strategy_id"), "time_limit": (lock or {}).get("time_limit", config.TIME_LIMIT_S),
        "repeats": (lock or {}).get("repeats", config.REPEATS),
        "main_run": meta, "rounds": rounds,
        "head_to_head": _head_to_head(_read("head_to_head.json")),
        "team_size": _team_size(_read("compare_bots.json")),
        "approaches": _read("approaches.json") or [],   # written by hand after the run; optional
    }


_NO_BACKFILL: set[str] = set()


def backfill_fcfs_plans(run: dict) -> dict:
    """Runs from before board v3 stored only the FCFS makespan. FCFS is deterministic, so rebuild its
    calendars once (practice[0], with and without surprises) and keep them on the run doc."""
    if run["_id"] in _NO_BACKFILL:
        return run
    job = get_job(run.get("job", "jobshop"))
    try:
        inst = job.load(job.sets()["practice"][0])
    except (FileNotFoundError, KeyError):   # instance files not on this machine: keep the board without the toggle
        _NO_BACKFILL.add(run["_id"])
        return run

    def fcfs(i):
        seq = [j for k in range(max(len(x) for x in i["jobs"])) for j in range(len(i["jobs"])) if k < len(i["jobs"][j])]
        return job.showcase(i, seq)

    plans = {"showcase_fcfs_plan": fcfs(inst)}
    if hasattr(job, "surprise"):
        plans["showcase_events_fcfs_plan"] = fcfs(job.surprise(inst))
    store.db().runs.update_one({"_id": run["_id"]}, {"$set": plans})
    return {**run, **plans}
