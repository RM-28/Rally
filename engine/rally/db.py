"""Rally's Mongo collections (all prefixed rally_ so they never collide with the board's) and the live event bus."""
from __future__ import annotations

import asyncio
import datetime as dt
import json
import uuid

from pymongo import ASCENDING, DESCENDING

from engine import store

COLLECTIONS = [
    "rally_people", "rally_agents", "rally_rooms", "rally_folders", "rally_messages", "rally_docs", "rally_approvals",
    "rally_jobs", "rally_tasks", "rally_routines", "rally_activity", "rally_permissions", "rally_settings", "rally_reads", "rally_calendar",
]


def db():
    return store.db()


def utcnow() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def iso(t: dt.datetime | None = None) -> str:
    """UTC ISO string with millisecond precision. One fixed format, so string order is time order."""
    return (t or utcnow()).astimezone(dt.timezone.utc).isoformat(timespec="milliseconds")


def new_id(prefix: str) -> str:
    return f"{prefix}{uuid.uuid4().hex[:10]}"


def out(doc: dict | None) -> dict | None:
    """Mongo doc -> API shape: _id becomes id."""
    if doc is None:
        return None
    d = dict(doc)
    d["id"] = d.pop("_id")
    return d


def ensure_indexes() -> None:
    d = db()
    d.rally_messages.create_index([("roomId", ASCENDING), ("ts", ASCENDING)])
    d.rally_activity.create_index([("ts", DESCENDING)])
    d.rally_jobs.create_index([("startedAt", DESCENDING)])
    d.rally_calendar.create_index([("start", ASCENDING)])


def _default(o):
    if isinstance(o, dt.datetime):
        return iso(o)
    return str(o)


class Bus:
    """In-process fan-out of RallyEvents to every open /api/rally/stream.

    publish() is safe from the event loop and from worker threads (sync route handlers).
    """

    def __init__(self):
        self.subs: set[asyncio.Queue] = set()
        self.loop: asyncio.AbstractEventLoop | None = None

    def bind(self, loop: asyncio.AbstractEventLoop) -> None:
        self.loop = loop

    def subscribe(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue()
        self.subs.add(q)
        return q

    def _put(self, payload: str) -> None:
        for q in list(self.subs):
            if q.qsize() < 1000:
                q.put_nowait(payload)

    def publish(self, type_: str, data) -> None:
        payload = json.dumps({"type": type_, "data": data}, default=_default)
        try:
            running = asyncio.get_running_loop()
        except RuntimeError:
            running = None
        if running is not None and running is self.loop:
            self._put(payload)
        elif self.loop is not None:
            self.loop.call_soon_threadsafe(self._put, payload)

    def spawn(self, coro) -> None:
        """Start a coroutine on the server loop (from a sync route handler)."""
        if self.loop is None:
            raise RuntimeError("rally bus is not bound to the server loop")
        asyncio.run_coroutine_threadsafe(coro, self.loop)


BUS = Bus()
