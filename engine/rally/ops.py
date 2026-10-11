"""Synchronous Rally operations: read/write Mongo, then publish the matching RallyEvent.

Route handlers call these directly (FastAPI runs sync handlers in a thread pool);
agent coroutines call them through asyncio.to_thread.
"""
from __future__ import annotations

import datetime as dt
from zoneinfo import ZoneInfo

from pymongo import DESCENDING

from engine import config
from engine.rally import seed as S
from engine.rally.db import BUS, db, iso, new_id, out, utcnow

PERM_LABEL = {
    "read": "Read room history", "draft": "Write docs", "tasks": "Create board tasks",
    "sched": "Add calendar events", "external": "Invite people outside the workspace",
}
QUIET_START, QUIET_END = 19, 8  # quiet hours: 7 PM to 8 AM


# ---------- reads ----------

def agents() -> list[dict]:
    return [out(a) for a in db().rally_agents.find().sort("_id", 1)]


def agent(agent_id: str) -> dict | None:
    return out(db().rally_agents.find_one({"_id": agent_id}))


def people() -> list[dict]:
    return [out(p) for p in db().rally_people.find()]


def room(room_id: str) -> dict | None:
    return out(db().rally_rooms.find_one({"_id": room_id}))


def workspace() -> dict:
    doc = db().rally_settings.find_one({"_id": "workspace"}) or {}
    return {"name": doc.get("name", S.WORKSPACE["name"])}


def display_name(who: str) -> str:
    p = db().rally_people.find_one({"_id": who}) or db().rally_agents.find_one({"_id": who})
    return p["name"] if p else who


def tz_for(user: str | None = None) -> dt.tzinfo:
    """The person's own time zone (sent by their browser), else studio time."""
    name = None
    if user:
        p = db().rally_people.find_one({"_id": user}, {"tz": 1})
        name = p and p.get("tz")
    for candidate in (name, config.RALLY_TZ):
        if candidate:
            try:
                return ZoneInfo(candidate)
            except Exception:  # noqa: BLE001 - unknown zone name
                continue
    return dt.timezone.utc


def set_tz(user: str, tz: str | None) -> None:
    if not tz:
        return
    try:
        ZoneInfo(tz)
    except Exception:  # noqa: BLE001
        return
    db().rally_people.update_one({"_id": user}, {"$set": {"tz": tz}})


def messages(room_id: str, limit: int = 60, before: str | None = None) -> list[dict]:
    q: dict = {"roomId": room_id}
    if before:
        q["ts"] = {"$lt": before}
    rows = list(db().rally_messages.find(q).sort("ts", DESCENDING).limit(limit))
    return [out(m) for m in reversed(rows)]


def permissions(agent_id: str) -> dict:
    doc = db().rally_permissions.find_one({"_id": agent_id})
    perms = dict(S.DEFAULT_PERMS)
    if doc:
        perms.update({k: v for k, v in doc["perms"].items() if k in S.PERM_KEYS})
    return perms


def safety() -> dict:
    doc = db().rally_settings.find_one({"_id": "safety"}) or {}
    return {k: bool(doc.get(k, v)) for k, v in S.SAFETY.items()}


def always_rules() -> list[dict]:
    doc = db().rally_settings.find_one({"_id": "always"})
    return list(doc.get("rules", [])) if doc else []


def files_for(room_id: str, room_doc: dict | None = None) -> list[dict]:
    r = room_doc or room(room_id) or {}
    made = [dict(m["file"], meta=f"{display_name(m['author'])} · {m['file']['meta']}")
            for m in db().rally_messages.find({"roomId": room_id, "file": {"$exists": True}}).sort("ts", DESCENDING).limit(30)]
    return made + list(r.get("files", []))


def unread_counts(user: str) -> dict[str, int]:
    reads = {d["_id"].split(":", 1)[1]: d["ts"] for d in db().rally_reads.find({"_id": {"$regex": f"^{user}:"}})}
    counts = {}
    for r in db().rally_rooms.find({}, {"_id": 1}):
        q = {"roomId": r["_id"], "kind": "msg", "author": {"$ne": user}}
        if r["_id"] in reads:
            q["ts"] = {"$gt": reads[r["_id"]]}
        counts[r["_id"]] = db().rally_messages.count_documents(q)
    return counts


def bootstrap(user: str) -> dict:
    d = db()
    unread = unread_counts(user)
    rooms, msgs, files = [], {}, {}
    for r in d.rally_rooms.find().sort("order", 1):
        rid = r["_id"]
        rooms.append({**out(r), "unread": unread.get(rid, 0)})
        msgs[rid] = messages(rid)
        files[rid] = files_for(rid, r)
    prefs = d.rally_folders.find_one({"_id": user})
    since = iso(utcnow() - dt.timedelta(hours=12))
    jobs = [out(j) for j in d.rally_jobs.find({"$or": [{"pct": {"$lt": 100}}, {"finishedAt": {"$gt": since}}]}).sort("startedAt", 1)]
    return {
        "me": user,
        "workspace": workspace(),
        "people": people(),
        "agents": agents(),
        "rooms": rooms,
        "folders": prefs["folders"] if prefs else S.FOLDERS,
        "starred": prefs["starred"] if prefs else S.STARRED,
        "messages": msgs,
        "files": files,
        "approvals": [out(a) for a in d.rally_approvals.find().sort("createdAt", DESCENDING)],
        "jobs": jobs,
        "tasks": [out(t) for t in d.rally_tasks.find().sort("createdAt", 1)],
        "routines": [out(r) for r in d.rally_routines.find().sort("_id", 1)],
        "activity": [out(a) for a in d.rally_activity.find().sort("ts", DESCENDING).limit(300)],
        "calendar": calendar(iso(utcnow() - dt.timedelta(days=30)), iso(utcnow() + dt.timedelta(days=90))),
        "permissions": {a["_id"]: permissions(a["_id"]) for a in d.rally_agents.find({}, {"_id": 1})},
        "safety": safety(),
        "alwaysRules": always_rules(),
    }


# ---------- writes (each publishes its event) ----------

def add_message(doc: dict) -> dict:
    doc = {"_id": doc.pop("id", None) or new_id("m"), "ts": iso(), **doc}
    db().rally_messages.insert_one(doc)
    m = out(doc)
    BUS.publish("message", m)
    if m.get("file"):
        BUS.publish("files", {"roomId": m["roomId"], "files": files_for(m["roomId"])})
    return m


def update_message(msg_id: str, patch: dict) -> dict | None:
    db().rally_messages.update_one({"_id": msg_id}, {"$set": patch})
    m = out(db().rally_messages.find_one({"_id": msg_id}))
    if m:
        BUS.publish("message", m)
    return m


def add_activity(actor: str, action: str, room_id: str | None = None, result: str | None = None,
                 approval_id: str | None = None, undo_key: str | None = None) -> dict:
    doc = {"_id": new_id("a"), "ts": iso(), "actor": actor, "action": action}
    for k, v in (("roomId", room_id), ("result", result), ("approvalId", approval_id), ("undoKey", undo_key)):
        if v:
            doc[k] = v
    db().rally_activity.insert_one(doc)
    row = out(doc)
    row.pop("undoKey", None)
    BUS.publish("activity", row)
    return row


def set_agent(agent_id: str, patch: dict) -> dict | None:
    db().rally_agents.update_one({"_id": agent_id}, {"$set": patch})
    a = agent(agent_id)
    if a:
        BUS.publish("agent", a)
    return a


def refresh_agent(agent_id: str, idle_text: str | None = None) -> dict | None:
    """Status follows the work: working while a job runs, waiting while approvals are pending, else idle."""
    d = db()
    a = d.rally_agents.find_one({"_id": agent_id})
    if not a:
        return None
    job = d.rally_jobs.find_one({"agentId": agent_id, "pct": {"$lt": 100}}, sort=[("startedAt", DESCENDING)])
    pending = d.rally_approvals.count_documents({"agentId": agent_id, "status": "pending"})
    if job:
        patch = {"status": "working", "now": job["title"]}
    elif pending:
        patch = {"status": "waiting", "now": "Waiting on your approval"}
    else:
        patch = {"status": "idle", "now": idle_text or (a["now"] if a["status"] == "idle" else "Nothing queued")}
    d.rally_agents.update_one({"_id": agent_id}, {"$set": patch})
    BUS.publish("agent_status", {"id": agent_id, "paused": a.get("paused", False), **patch})
    return {**out(a), **patch}


def upsert_job(job: dict, persist: bool = True) -> None:
    if persist:
        db().rally_jobs.replace_one({"_id": job["id"]}, {"_id": job["id"], **{k: v for k, v in job.items() if k != "id"}}, upsert=True)
    BUS.publish("job_progress", job)


def upsert_task(task: dict) -> None:
    db().rally_tasks.replace_one({"_id": task["id"]}, {"_id": task["id"], **{k: v for k, v in task.items() if k != "id"}}, upsert=True)
    BUS.publish("task", task)


def delete_task(task_id: str) -> None:
    db().rally_tasks.delete_one({"_id": task_id})
    BUS.publish("task_removed", {"id": task_id})


def create_tasks(items: list[dict], room_id: str, default_owner: str) -> list[str]:
    ids = []
    for t in items:
        task = {"id": new_id("t"), "title": t["title"], "owner": t.get("owner") or default_owner, "roomId": room_id,
                "due": t.get("due") or "This week", "column": "queued", "createdAt": iso()}
        upsert_task(task)
        ids.append(task["id"])
    return ids


def typing(room_id: str, text: str) -> None:
    BUS.publish("typing", {"roomId": room_id, "text": text})


def mark_read(user: str, room_id: str) -> None:
    db().rally_reads.replace_one({"_id": f"{user}:{room_id}"}, {"_id": f"{user}:{room_id}", "ts": iso()}, upsert=True)


def add_doc(title: str, body: str, agent_id: str, room_id: str) -> str:
    doc_id = new_id("d")
    db().rally_docs.insert_one({"_id": doc_id, "title": title, "body": body, "agentId": agent_id, "roomId": room_id, "ts": iso()})
    return doc_id


def get_doc(doc_id: str) -> dict | None:
    return out(db().rally_docs.find_one({"_id": doc_id}))


def push_recent(agent_id: str, title: str) -> None:
    a = db().rally_agents.find_one({"_id": agent_id})
    if a:
        set_agent(agent_id, {"recent": [{"t": title, "ts": iso()}] + list(a.get("recent", []))[:9]})


def remember(agent_id: str, text: str) -> None:
    a = db().rally_agents.find_one({"_id": agent_id})
    if a and text not in a.get("memory", []):
        set_agent(agent_id, {"memory": [*a.get("memory", []), text]})


def forget(agent_id: str, text: str) -> None:
    a = db().rally_agents.find_one({"_id": agent_id})
    if a:
        set_agent(agent_id, {"memory": [m for m in a.get("memory", []) if m != text]})


# ---------- calendar ----------

def calendar(frm: str, to: str) -> list[dict]:
    q = {"start": {"$lt": to}, "end": {"$gt": frm}, "status": {"$ne": "cancelled"}}
    return [out(e) for e in db().rally_calendar.find(q).sort("start", 1)]


def get_event(ev_id: str) -> dict | None:
    return out(db().rally_calendar.find_one({"_id": ev_id}))


def add_event(doc: dict) -> dict:
    doc = {"_id": new_id("ev"), "guests": [], "attendees": [], "notes": "", "status": "confirmed", **doc}
    db().rally_calendar.insert_one(doc)
    ev = out(doc)
    BUS.publish("calendar_event", ev)
    return ev


def update_event(ev_id: str, patch: dict) -> dict | None:
    db().rally_calendar.update_one({"_id": ev_id}, {"$set": patch})
    ev = get_event(ev_id)
    if ev:
        BUS.publish("calendar_event", ev)
    return ev


def delete_event(ev_id: str) -> None:
    db().rally_calendar.delete_one({"_id": ev_id})
    BUS.publish("calendar_removed", {"id": ev_id})


def overlapping(start: str, end: str, exclude: str | None = None) -> list[dict]:
    q = {"start": {"$lt": end}, "end": {"$gt": start}, "status": {"$ne": "cancelled"}}
    return [out(e) for e in db().rally_calendar.find(q) if e["_id"] != exclude]


def when_text(start_iso: str, end_iso: str, tz: dt.tzinfo) -> str:
    s = dt.datetime.fromisoformat(start_iso).astimezone(tz)
    e = dt.datetime.fromisoformat(end_iso).astimezone(tz)
    clock = lambda t: t.strftime("%I:%M").lstrip("0")  # noqa: E731
    return f"{s.strftime('%a, %b')} {s.day} · {clock(s)}–{clock(e)} {e.strftime('%p')}"


def in_quiet_hours(start_iso: str, end_iso: str, tz: dt.tzinfo) -> bool:
    s = dt.datetime.fromisoformat(start_iso).astimezone(tz)
    e = dt.datetime.fromisoformat(end_iso).astimezone(tz)
    return s.hour < QUIET_END or s.hour >= QUIET_START or (e.hour, e.minute) > (QUIET_START, 0) or e.date() != s.date()


# ---------- approvals ----------

def create_approval(doc: dict) -> dict:
    doc = {"_id": new_id("ap"), "createdAt": iso(), "status": "pending", **doc}
    db().rally_approvals.insert_one(doc)
    ap = out(doc)
    BUS.publish("approval_requested", ap)
    return ap


def resolve_approval(ap_id: str, status: str, user: str, always: bool = False) -> dict | None:
    """Approving does the thing: confirms the calendar event or creates the board tasks. Undo reverses it."""
    d = db()
    ap = d.rally_approvals.find_one({"_id": ap_id})
    if not ap:
        return None
    prev = ap["status"]
    patch = {"status": status, "resolvedBy": user if status != "pending" else None, "resolvedAt": iso() if status != "pending" else None}
    if prev == status:
        return out(ap)
    payload = dict(ap.get("payload") or {})
    kind = ap.get("kind")
    ev = get_event(payload["eventId"]) if kind == "event" and payload.get("eventId") else None

    if status == "pending":  # undo
        for row in d.rally_activity.find({"undoKey": ap_id}):
            d.rally_activity.delete_one({"_id": row["_id"]})
            BUS.publish("activity_removed", {"id": row["_id"]})
        if ev:
            update_event(ev["id"], {"status": "tentative"})
        for tid in payload.pop("created", []):
            delete_task(tid)
        d.rally_approvals.update_one({"_id": ap_id}, {"$set": {**patch, "payload": payload}})
        BUS.publish("approval_resolved", {"id": ap_id, **patch})
        refresh_agent(ap["agentId"])
        _sync_task(ap_id, "review")
        return out({**ap, **patch, "payload": payload})

    if always and kind:
        rules = [r for r in always_rules() if not (r["agentId"] == ap["agentId"] and r["kind"] == ap.get("ruleKind", kind))]
        d.rally_settings.update_one({"_id": "always"}, {"$set": {"rules": [*rules, {"agentId": ap["agentId"], "kind": ap.get("ruleKind", kind)}]}}, upsert=True)
        BUS.publish("always_rules", always_rules())

    if status == "approved":
        if ev:
            update_event(ev["id"], {"status": "confirmed"})
            text = f"Done. “{ev['title']}” is confirmed for {when_text(ev['start'], ev['end'], tz_for(user))}."
            if ev.get("guests"):
                text += f" Rally doesn’t send email, so share the time with {', '.join(ev['guests'])} yourself."
        elif kind == "tasks":
            payload["created"] = create_tasks(payload.get("tasks", []), ap["roomId"], ap["agentId"])
            n = len(payload["created"])
            text = f"Done. Added {n} task{'s' if n != 1 else ''} to the board."
        else:
            text = "Thanks. Going ahead."
    else:
        if ev:
            update_event(ev["id"], {"status": "cancelled"})
        text = "Understood. I won’t go ahead with this."

    d.rally_approvals.update_one({"_id": ap_id}, {"$set": {**patch, "payload": payload}})
    BUS.publish("approval_resolved", {"id": ap_id, **patch})
    verb = "Approved" if status == "approved" else "Declined"
    add_activity(user, f"{verb}: {ap['title']}", ap["roomId"], undo_key=ap_id)
    add_message({"kind": "msg", "roomId": ap["roomId"], "author": ap["agentId"], "text": text, **({"eventId": ev["id"]} if ev else {})})
    refresh_agent(ap["agentId"], idle_text=f"{verb}: {ap['title']}" if status == "approved" else "Nothing queued")
    _sync_task(ap_id, "done")
    return out({**ap, **patch, "payload": payload})


def _sync_task(ap_id: str, column: str) -> None:
    t = db().rally_tasks.find_one({"approvalId": ap_id})
    if t and t["column"] != column:
        upsert_task({**out(t), "column": column})
