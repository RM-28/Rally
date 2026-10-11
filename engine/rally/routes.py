"""Rally HTTP API, mounted under /api/rally.

There is no sign-in yet: the caller names themselves with the X-Rally-User header (default "maya").
"""
from __future__ import annotations

import asyncio
import re
from typing import Literal

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse

from engine.rally import agents, ops
from engine.rally import seed as S
from engine.rally.db import BUS, db, iso, new_id, out

router = APIRouter(prefix="/api/rally")
Perm = Literal["allow", "ask", "off"]
PERM_KEYS = S.PERM_KEYS


def user_of(x_rally_user: str | None) -> str:
    uid = (x_rally_user or S.DEFAULT_USER).strip().lower()
    if not db().rally_people.find_one({"_id": uid}):
        raise HTTPException(403, f"unknown user {uid!r}")
    return uid


def need(doc, what: str):
    if not doc:
        raise HTTPException(404, f"{what} not found")
    return doc


# ---------- reads ----------

@router.get("/bootstrap")
def bootstrap(x_rally_user: str | None = Header(default=None), x_rally_tz: str | None = Header(default=None)):
    S.seed(tz=x_rally_tz)  # first visit seeds the test workspace in this browser's time zone
    user = user_of(x_rally_user)
    ops.set_tz(user, x_rally_tz)  # agents schedule in the person's own time zone
    return ops.bootstrap(user)


@router.get("/rooms/{room_id}/messages")
def room_messages(room_id: str, before: str | None = None, limit: int = 60):
    need(ops.room(room_id), "room")
    return ops.messages(room_id, min(limit, 200), before)


@router.get("/docs/{doc_id}")
def get_doc(doc_id: str):
    return need(ops.get_doc(doc_id), "doc")


@router.get("/activity")
def activity(limit: int = 300, before: str | None = None):
    q = {"ts": {"$lt": before}} if before else {}
    return [out(a) for a in db().rally_activity.find(q).sort("ts", -1).limit(min(limit, 1000))]


@router.get("/stream")
async def stream():
    BUS.bind(asyncio.get_running_loop())
    q = BUS.subscribe()

    async def gen():
        try:
            while True:
                try:
                    data = await asyncio.wait_for(q.get(), timeout=15)
                    yield {"event": "message", "data": data}
                except asyncio.TimeoutError:
                    yield {"event": "ping", "data": "{}"}
        finally:
            BUS.subs.discard(q)

    return EventSourceResponse(gen())


# ---------- rooms ----------

class MessageIn(BaseModel):
    text: str = Field(min_length=1, max_length=4000)


@router.post("/rooms/{room_id}/messages")
def post_message(room_id: str, body: MessageIn, x_rally_user: str | None = Header(default=None)):
    user = user_of(x_rally_user)
    need(ops.room(room_id), "room")
    m = ops.add_message({"kind": "msg", "roomId": room_id, "author": user, "text": body.text.strip()})
    ops.mark_read(user, room_id)
    BUS.spawn(agents.handle_message(m, user))
    return m


@router.post("/rooms/{room_id}/read")
def read_room(room_id: str, x_rally_user: str | None = Header(default=None)):
    ops.mark_read(user_of(x_rally_user), room_id)
    return {"ok": True}


@router.post("/rooms/{room_id}/catchup")
async def catchup(room_id: str, x_rally_user: str | None = Header(default=None)):
    user = await asyncio.to_thread(user_of, x_rally_user)
    try:
        return await agents.catchup(room_id, user)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(502, f"catch up failed: {type(exc).__name__}") from exc


class MemoryIn(BaseModel):
    undone: bool


@router.patch("/messages/{msg_id}")
def patch_memory(msg_id: str, body: MemoryIn):
    m = need(db().rally_messages.find_one({"_id": msg_id, "kind": "memory"}), "memory")
    if body.undone:
        # memory rows read "Wants decks as PDF." while the agent's list may hold it without the period
        ops.forget(m["agentId"], m["text"])
        ops.forget(m["agentId"], m["text"].rstrip("."))
    else:
        ops.remember(m["agentId"], m["text"])
    return ops.update_message(msg_id, {"undone": body.undone})


# ---------- approvals ----------

class ResolveIn(BaseModel):
    status: Literal["approved", "declined", "pending"]
    alwaysAllow: bool = False


@router.post("/approvals/{ap_id}")
def resolve(ap_id: str, body: ResolveIn, x_rally_user: str | None = Header(default=None)):
    return need(ops.resolve_approval(ap_id, body.status, user_of(x_rally_user), body.alwaysAllow), "approval")


# ---------- agents ----------

class AgentPatch(BaseModel):
    autonomy: Literal["ask", "limits", "act"] | None = None
    paused: bool | None = None


@router.patch("/agents/{agent_id}")
def patch_agent(agent_id: str, body: AgentPatch, x_rally_user: str | None = Header(default=None)):
    user = user_of(x_rally_user)
    a = need(ops.agent(agent_id), "agent")
    patch = body.model_dump(exclude_none=True)
    updated = ops.set_agent(agent_id, patch)
    if "autonomy" in patch and patch["autonomy"] != a["autonomy"]:
        ops.add_activity(user, f"Set {a['name']}’s autonomy to {agents.AUTONOMY[patch['autonomy']][0]}", result="Setting")
    if "paused" in patch and patch["paused"] != a.get("paused"):
        ops.add_activity(user, f"{'Paused' if patch['paused'] else 'Resumed'} {a['name']}", result="Setting")
    return updated


class AgentIn(BaseModel):
    name: str = Field(min_length=1, max_length=30)
    role: str = Field(min_length=1, max_length=40)
    autonomy: Literal["ask", "limits", "act"]


@router.post("/agents")
def create_agent(body: AgentIn, x_rally_user: str | None = Header(default=None)):
    user = user_of(x_rally_user)
    name = body.name.strip()
    # agents are called with @Name, so a name is one word and unique
    if not re.fullmatch(r"[A-Za-z][A-Za-z0-9_]{0,29}", name):
        raise HTTPException(422, "Use one word for the name (letters and numbers), so people can @mention it")
    if db().rally_agents.find_one({"name": {"$regex": f"^{re.escape(name)}$", "$options": "i"}}):
        raise HTTPException(409, f"There’s already an agent called {name}")
    n = db().rally_agents.count_documents({})
    doc = {"_id": new_id("ag"), "name": name, "role": body.role.strip(), "color": n % 8 + 1, "autonomy": body.autonomy,
           "status": "idle", "now": "Ready for a first task", "paused": False, "does": f"A {body.role.strip().lower()} agent. Give it a task in any room.",
           "tools": ["Rally rooms", "Rally Docs"], "memory": [], "recent": []}
    db().rally_agents.insert_one(doc)
    db().rally_permissions.insert_one({"_id": doc["_id"], "perms": dict(S.DEFAULT_PERMS)})
    a = out(doc)
    BUS.publish("agent", a)
    BUS.publish("permissions", {"agentId": a["id"], "perms": dict(S.DEFAULT_PERMS)})
    ops.add_activity(user, f"Created agent {a['name']} ({a['role']})", result="Setting")
    return a


# ---------- settings ----------

class FoldersIn(BaseModel):
    folders: list[dict]
    starred: list[str]


@router.put("/folders")
def put_folders(body: FoldersIn, x_rally_user: str | None = Header(default=None)):
    user = user_of(x_rally_user)
    db().rally_folders.replace_one({"_id": user}, {"_id": user, "folders": body.folders, "starred": body.starred, "updatedAt": iso()}, upsert=True)
    return {"ok": True}


@router.put("/permissions/{agent_id}")
def put_permissions(agent_id: str, body: dict[str, Perm], x_rally_user: str | None = Header(default=None)):
    user = user_of(x_rally_user)
    a = need(ops.agent(agent_id), "agent")
    before = ops.permissions(agent_id)
    perms = {k: body.get(k, before.get(k, "off")) for k in PERM_KEYS}
    db().rally_permissions.replace_one({"_id": agent_id}, {"_id": agent_id, "perms": perms}, upsert=True)
    BUS.publish("permissions", {"agentId": agent_id, "perms": perms})
    label = {"allow": "Allowed", "ask": "Ask first", "off": "Off"}
    for k in PERM_KEYS:
        if perms[k] != before.get(k):
            ops.add_activity(user, f"Set {a['name']}’s “{ops.PERM_LABEL[k]}” to {label[perms[k]]}", result="Setting")
    return perms


class SafetyIn(BaseModel):
    externalNeedsApproval: bool | None = None
    quietHours: bool | None = None
    jobLimit: bool | None = None


@router.patch("/safety")
def patch_safety(body: SafetyIn):
    db().rally_settings.update_one({"_id": "safety"}, {"$set": body.model_dump(exclude_none=True)}, upsert=True)
    s = ops.safety()
    BUS.publish("safety", s)
    return s


# ---------- calendar ----------

@router.get("/calendar")
def get_calendar(start: str, end: str):
    return ops.calendar(start, end)


class EventIn(BaseModel):
    title: str = Field(min_length=1, max_length=100)
    start: str
    end: str
    roomId: str | None = None
    guests: list[str] = []
    notes: str = Field(default="", max_length=1000)


def _check_times(start: str, end: str) -> tuple[str, str]:
    import datetime as dt
    try:
        s, e = dt.datetime.fromisoformat(start.replace("Z", "+00:00")), dt.datetime.fromisoformat(end.replace("Z", "+00:00"))
    except ValueError as exc:
        raise HTTPException(422, "start and end must be ISO date-times") from exc
    if s.tzinfo is None or e.tzinfo is None:
        raise HTTPException(422, "start and end need a time zone offset")
    if e <= s:
        raise HTTPException(422, "The event has to end after it starts")
    return iso(s), iso(e)


@router.post("/calendar")
def create_event(body: EventIn, x_rally_user: str | None = Header(default=None)):
    user = user_of(x_rally_user)
    start, end = _check_times(body.start, body.end)
    ev = ops.add_event({"title": body.title.strip(), "start": start, "end": end, "roomId": body.roomId, "attendees": [user],
                        "guests": [g.strip().lower() for g in body.guests if g.strip()], "notes": body.notes, "createdBy": user})
    ops.add_activity(user, f"Added “{ev['title']}” to the calendar", body.roomId)
    return ev


class EventPatch(BaseModel):
    title: str | None = None
    start: str | None = None
    end: str | None = None
    notes: str | None = None


@router.patch("/calendar/{ev_id}")
def patch_event(ev_id: str, body: EventPatch):
    ev = need(ops.get_event(ev_id), "event")
    patch = body.model_dump(exclude_none=True)
    if "start" in patch or "end" in patch:
        patch["start"], patch["end"] = _check_times(patch.get("start", ev["start"]), patch.get("end", ev["end"]))
    return ops.update_event(ev_id, patch)


@router.delete("/calendar/{ev_id}")
def delete_event(ev_id: str, x_rally_user: str | None = Header(default=None)):
    user = user_of(x_rally_user)
    ev = need(ops.get_event(ev_id), "event")
    if ev.get("approvalId") and ev["status"] == "tentative":
        ops.resolve_approval(ev["approvalId"], "declined", user)
    ops.delete_event(ev_id)
    ops.add_activity(user, f"Removed “{ev['title']}” from the calendar", ev.get("roomId"))
    return {"ok": True}


# ---------- routines ----------

def _routine_out(rid: str) -> dict:
    r = out(need(db().rally_routines.find_one({"_id": rid}), "routine"))
    BUS.publish("routine", r)
    return r


@router.get("/routines")
def list_routines():
    return [out(r) for r in db().rally_routines.find().sort("_id", 1)]


class RoutineIn(BaseModel):
    name: str = "New routine"
    description: str = "Describe the work in plain words"
    agentId: str = "scout"
    schedule: str = "Weekdays · 9:00 AM"
    cron: str = "0 9 * * 1-5"
    roomId: str = "general"
    enabled: bool = False


@router.post("/routines")
def create_routine(body: RoutineIn):
    rid = new_id("r")
    db().rally_routines.insert_one({"_id": rid, **body.model_dump(), "lastRun": "Never run"})
    return _routine_out(rid)


class RoutinePatch(BaseModel):
    name: str | None = None
    description: str | None = None
    agentId: str | None = None
    schedule: str | None = None
    cron: str | None = None
    roomId: str | None = None
    enabled: bool | None = None


@router.patch("/routines/{rid}")
def patch_routine(rid: str, body: RoutinePatch):
    db().rally_routines.update_one({"_id": rid}, {"$set": body.model_dump(exclude_none=True)})
    return _routine_out(rid)


@router.post("/routines/{rid}/run")
def run_routine(rid: str):
    r = out(need(db().rally_routines.find_one({"_id": rid}), "routine"))
    if r.get("lastRun") == "Running…":
        raise HTTPException(409, "already running")
    BUS.spawn(agents.run_routine(r))
    return {"ok": True}
