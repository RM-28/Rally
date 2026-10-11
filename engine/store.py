"""MongoDB access. Synchronous pymongo; async callers wrap in asyncio.to_thread."""
from __future__ import annotations

import datetime as dt
from functools import lru_cache

from pymongo import ASCENDING, MongoClient

from engine import config

COLLECTIONS = [
    "runs", "bots", "strategies", "rounds", "lessons",
    "events", "messages", "usage", "presence",
]

# run id that model usage and events are attributed to; set by the loop
current_run_id: str | None = None


def now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


@lru_cache(maxsize=1)
def db():
    if not config.MONGODB_URI:
        raise RuntimeError("MONGODB_URI is not set")
    if config.MONGODB_URI == "mock":  # offline wiring tests only (pip install mongomock)
        import mongomock
        return mongomock.MongoClient(tz_aware=True)[config.MONGODB_DB]
    client = MongoClient(config.MONGODB_URI, serverSelectionTimeoutMS=10_000, tz_aware=True)
    return client[config.MONGODB_DB]


def ensure_indexes() -> None:
    d = db()
    d.strategies.create_index([("run_id", ASCENDING), ("round", ASCENDING)])
    d.strategies.create_index([("parent_id", ASCENDING)])
    d.events.create_index([("run_id", ASCENDING), ("_id", ASCENDING)])
    d.rounds.create_index([("run_id", ASCENDING), ("n", ASCENDING)])
    d.messages.create_index([("run_id", ASCENDING), ("ts", ASCENDING)])
    d.usage.create_index([("run_id", ASCENDING)])


def emit(type_: str, bot: str | None = None, data: dict | None = None, run_id: str | None = None):
    doc = {"run_id": run_id or current_run_id, "ts": now(), "type": type_, "bot": bot, "data": data or {}}
    return db().events.insert_one(doc).inserted_id


def record_usage(role: str, tokens_in: int, tokens_out: int, secs: float) -> None:
    db().usage.insert_one({
        "run_id": current_run_id, "ts": now(), "role": role,
        "tokens_in": tokens_in, "tokens_out": tokens_out, "secs": round(secs, 2),
    })


def usage_totals(run_id: str | None) -> dict:
    match = {"run_id": run_id} if run_id else {}
    rows = list(db().usage.aggregate([
        {"$match": match},
        {"$group": {"_id": None, "calls": {"$sum": 1},
                    "tokens_in": {"$sum": "$tokens_in"}, "tokens_out": {"$sum": "$tokens_out"}}},
    ]))
    if not rows:
        return {"calls": 0, "tokens_in": 0, "tokens_out": 0}
    rows[0].pop("_id")
    return rows[0]


def lineage(strategy_id: str) -> list[dict]:
    """Ancestors of a strategy, nearest first, via $graphLookup on parent_id."""
    rows = list(db().strategies.aggregate([
        {"$match": {"_id": strategy_id}},
        {"$graphLookup": {"from": "strategies", "startWith": "$parent_id", "connectFromField": "parent_id",
                          "connectToField": "_id", "as": "ancestors", "depthField": "depth"}},
        {"$project": {"ancestors.code": 0, "ancestors.practice_runs": 0}},
    ]))
    if not rows:
        return []
    return sorted(rows[0]["ancestors"], key=lambda a: a["depth"])


LINEAGE_FIELDS = {"_id": 1, "round": 1, "bot": 1, "change": 1, "note": 1, "practice_gap": 1, "delta": 1,
                  "status": 1, "parent_id": 1, "human_message": 1, "run_id": 1, "check_gap": 1}


def _verdict(s: dict, best_of_round: set[str]) -> str:
    if s.get("status") != "ok" or s.get("practice_gap") is None:
        return "Sat out"
    if s["_id"] in best_of_round:
        return "Round best"
    d = s.get("delta")
    if d is None or d < 0:
        return "Kept"
    return "AVOID" if d > 5 else "No gain"


def lineage_tree(strategy_id: str, max_branches: int = 4) -> list[dict]:
    """The strategy and its ancestors, root first. Each node carries the other children of that node
    (ideas built on it that did not become the next step), so the board can draw side branches."""
    d = db()
    leaf = d.strategies.find_one({"_id": strategy_id}, LINEAGE_FIELDS)
    if not leaf:
        return []
    chain = [leaf, *lineage(strategy_id)][::-1]
    ids = [c["_id"] for c in chain]
    kids = list(d.strategies.find({"parent_id": {"$in": ids}}, LINEAGE_FIELDS))
    rounds = {r["n"]: r.get("best_strategy_id") for r in d.rounds.find({"run_id": leaf["run_id"]}, {"n": 1, "best_strategy_id": 1})}
    best_of_round = {v for v in rounds.values() if v}
    on_chain = set(ids)
    out = []
    for c in chain:
        branches = sorted((k for k in kids if k["parent_id"] == c["_id"] and k["_id"] not in on_chain),
                          key=lambda k: (k.get("practice_gap") is None, k.get("practice_gap") or 0))
        out.append({
            "id": c["_id"], "round": c["round"], "bot": c["bot"], "change": c.get("change") or c.get("note") or "",
            "note": c.get("note") or "", "practice_gap": c.get("practice_gap"), "check_gap": c.get("check_gap"),
            "delta": c.get("delta"), "human_message": c.get("human_message"),
            "siblings": [{"id": k["_id"], "round": k["round"], "bot": k["bot"], "change": k.get("change") or "",
                          "practice_gap": k.get("practice_gap"), "verdict": _verdict(k, best_of_round)}
                         for k in branches[:max_branches]],
            "more": max(0, len(branches) - max_branches),
        })
    return out
