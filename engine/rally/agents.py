"""Agents at work: a request in a room becomes a job, one model call, and whatever the agent posts back.

What an agent can produce (the model answers with one JSON object):
  reply     the message it posts to the room
  bullets   findings or a list
  doc       a written deliverable, stored as a Rally doc and shown as a file card
  event     a meeting or time block on the Rally calendar
  tasks     cards for the Rally board
  memory    a lasting preference to remember (shown as a memory row, undoable)
  handoff   pass part of the work to another agent, who then runs its own job

Events and tasks go through Rally's policy: done right away, sent to Approvals, or refused,
depending on the agent's autonomy, its permissions and the workspace safety switches.
Rally has no outside integrations: no email, phone or third-party apps.
"""
from __future__ import annotations

import asyncio
import datetime as dt
import random
import re

from engine import model
from engine.rally import ops
from engine.rally import seed as S
from engine.rally.db import db, iso, new_id, utcnow

AUTONOMY = {
    "ask": ("Ask first", "Proposes each action and waits for a person to approve it."),
    "limits": ("Act within limits", "Works on its own inside the permissions you set. Asks for anything outside them."),
    "act": ("Act & report", "Does the work, then posts what it did. Best for internal, reversible tasks."),
}
MAX_HANDOFF_DEPTH = 2
MAX_MENTIONS = 3
JOBS_PER_HOUR = 20
_MENTION = re.compile(r"@(\w+)")
_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


async def aw(fn, *a, **k):
    return await asyncio.to_thread(fn, *a, **k)


def local_now(tz: dt.tzinfo | None = None) -> dt.datetime:
    return dt.datetime.now(tz or ops.tz_for(S.DEFAULT_USER))


def mentioned(text: str, agents: list[dict]) -> list[dict]:
    by_name = {a["name"].lower(): a for a in agents}
    found: list[dict] = []
    for name in _MENTION.findall(text):
        a = by_name.get(name.lower())
        if a and a not in found:
            found.append(a)
    return found[:MAX_MENTIONS]


def title_from(text: str) -> str:
    t = _MENTION.sub("", text)
    t = re.sub(r"^[\s,.:;-]+", "", t).strip()
    t = re.sub(r"\s+", " ", t)
    if not t:
        return "New task"
    t = t[0].upper() + t[1:]
    return t if len(t) <= 52 else t[:50].rstrip() + "…"


# ---------- prompt ----------

_SCHEMA = """{
  "reply": "what you post to the room, 1-3 sentences",
  "task_title": "a 2-6 word name for this piece of work",
  "bullets": ["optional list of findings, each under 20 words"],
  "doc": {"title": "...", "body": "full text, paragraphs separated by blank lines"},
  "event": {"title": "...", "start": "YYYY-MM-DDTHH:MM in the requester's local time", "minutes": 30,
            "attendees": ["ids of people or agents in the workspace"], "guests": ["emails of people outside the workspace"],
            "notes": "agenda or purpose", "why": "one sentence on why this time"},
  "tasks": [{"title": "...", "owner": "id of a person or agent", "due": "e.g. Fri"}],
  "memory": "a lasting preference or fact someone stated, if any",
  "handoff": {"to": "agent id", "text": "what you are handing over", "ask": "what they should do"}
}"""


def _line(m: dict, names: dict[str, str], tz: dt.tzinfo) -> str:
    who = lambda i: names.get(i, i)  # noqa: E731
    k = m.get("kind")
    if k == "handoff":
        return f"({who(m['from'])} handed {m['text']} to {who(m['to'])})"
    if k == "memory":
        return f"({who(m['agentId'])} remembered: {m['text']})"
    s = f"{who(m['author'])}: {m['text']}"
    for b in m.get("bullets") or []:
        s += f"\n  - {b}"
    if m.get("file"):
        s += f"\n  [doc: {m['file']['name']}]"
    return s


def _calendar_lines(tz: dt.tzinfo) -> str:
    now = local_now(tz)
    start = dt.datetime(now.year, now.month, now.day, tzinfo=tz)
    events = ops.calendar(iso(start), iso(start + dt.timedelta(days=8)))
    if not events:
        return "- (nothing booked)"
    return "\n".join(f"- {ops.when_text(e['start'], e['end'], tz)}: {e['title']}" + (" (tentative)" if e["status"] == "tentative" else "")
                     for e in events)


def build_prompt(agent: dict, room: dict, history: list[dict], request: str, ctx: dict, tz: dt.tzinfo) -> list[dict]:
    names = {p["id"]: p["name"] for p in ctx["people"]} | {a["id"]: a["name"] for a in ctx["agents"]}
    aut_label, aut_desc = AUTONOMY.get(agent["autonomy"], AUTONOMY["ask"])
    perms = ", ".join(f"{ops.PERM_LABEL[k]}: {v}" for k, v in ctx["perms"].items() if k in ops.PERM_LABEL)
    people = "\n".join(f"- {p['name']} (id {p['id']}, {p['role']})" for p in ctx["people"])
    others = "\n".join(f"- {a['name']} (id {a['id']}, {a['role']}): {a['does']}" for a in ctx["agents"] if a["id"] != agent["id"])
    memory = "\n".join(f"- {m}" for m in agent.get("memory", [])) or "- (nothing yet)"
    now = local_now(tz)
    stamp = f"{now.strftime('%A, %B')} {now.day} {now.year}, {now.strftime('%I:%M %p').lstrip('0')}"
    system = f"""You are {agent['name']}, an AI agent in {ctx['workspace']}, a shared workspace in an app called Rally where people and AI agents work together in rooms.

Your role: {agent['role']}. {agent['does']}

What Rally lets you do: post in rooms, write docs, add events to the Rally calendar, and add tasks to the Rally board.
Rally has no email, phone, web browsing or outside apps. If a request needs one of those, say so plainly and offer what you can do instead.
Never invent facts, numbers or sources. If you are answering from general knowledge, say so.

What you remember:
{memory}

Autonomy: {aut_label}. {aut_desc}
Permissions: {perms}

People:
{people}

Other agents:
{others}

The calendar for the next 8 days:
{_calendar_lines(tz)}

You are in #{room['name']} ({room['topic']}). It is {stamp} for the person asking.

Voice: clear, warm, plain language. No exclamation marks, no emoji, no markdown headings.

Answer with ONE JSON object and nothing else, in this shape (omit keys you don't need):
{_SCHEMA}

Rules:
- "reply" is required. Speak to the room in first person.
- Use "bullets" for findings or lists (at most 6).
- Use "doc" when the request is for something written: a summary, brief, plan, announcement or draft. Put the whole text in "body" and mention it in "reply".
- Use "event" to book a meeting or time block. Pick a time that is free on the calendar above unless the person named a time. Default to 30 minutes.
- Use "tasks" to put work on the board (at most 6).
- Don't say an event or task is done or booked for sure: Rally may need a person's approval first, and it will tell them.
- Use "memory" only when someone states a lasting preference or rule.
- Use "handoff" when part of the work is clearly another agent's job. Use their id."""
    transcript = "\n".join(_line(m, names, tz) for m in history) or "(the room is empty)"
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": f"Recent messages in #{room['name']}:\n{transcript}\n\n---\n{request}"},
    ]


def parse_reply(raw: str, tz: dt.tzinfo, known_ids: set[str]) -> dict:
    text = model.strip_thinking(raw).strip()
    try:
        j = model.extract_json(text)
    except Exception:  # noqa: BLE001 - the model ignored the format; post its words as-is
        return {"reply": text[:1500] or "Done."}
    if not isinstance(j, dict):
        return {"reply": text[:1500] or "Done."}
    s = lambda v, n: v.strip()[:n] if isinstance(v, str) and v.strip() else None  # noqa: E731
    r: dict = {"reply": s(j.get("reply"), 1500) or "Done.", "task_title": s(j.get("task_title"), 60)}
    if isinstance(j.get("bullets"), list):
        r["bullets"] = [b.strip()[:240] for b in j["bullets"] if isinstance(b, str) and b.strip()][:8] or None
    doc = j.get("doc")
    if isinstance(doc, dict) and s(doc.get("body"), 20000):
        r["doc"] = {"title": s(doc.get("title"), 80) or "Draft", "body": s(doc.get("body"), 20000)}
    ev = j.get("event")
    if isinstance(ev, dict) and s(ev.get("title"), 100) and s(ev.get("start"), 40):
        try:
            start = dt.datetime.fromisoformat(ev["start"].strip().replace("Z", "+00:00"))
            if start.tzinfo is None:
                start = start.replace(tzinfo=tz)
            minutes = int(ev.get("minutes") or 30)
            minutes = max(5, min(minutes, 8 * 60))
            r["event"] = {
                "title": s(ev["title"], 100), "start": iso(start), "end": iso(start + dt.timedelta(minutes=minutes)),
                "attendees": [a for a in ev.get("attendees") or [] if isinstance(a, str) and a in known_ids][:10],
                "guests": [g.strip().lower() for g in ev.get("guests") or [] if isinstance(g, str) and _EMAIL.match(g.strip())][:10],
                "notes": s(ev.get("notes"), 1000) or "", "why": s(ev.get("why"), 400) or "",
            }
        except (TypeError, ValueError):
            pass
    if isinstance(j.get("tasks"), list):
        tasks = [{"title": s(t.get("title"), 120), "owner": t.get("owner") if t.get("owner") in known_ids else None, "due": s(t.get("due"), 20)}
                 for t in j["tasks"] if isinstance(t, dict) and s(t.get("title"), 120)][:6]
        r["tasks"] = tasks or None
    r["memory"] = s(j.get("memory"), 240)
    h = j.get("handoff")
    if isinstance(h, dict) and s(h.get("to"), 40) and s(h.get("ask"), 1000):
        r["handoff"] = {"to": h["to"].strip().lower(), "text": s(h.get("text"), 120) or "the work so far", "ask": s(h["ask"], 1000)}
    return r


# ---------- policy ----------

def _always(agent_id: str, kind: str) -> bool:
    return any(r["agentId"] == agent_id and r["kind"] == kind for r in ops.always_rules())


def decide_event(agent: dict, room: dict, ev: dict, requester: str) -> tuple[str, str, dict | None, dict | None]:
    """Returns (outcome, note, approval, event). outcome: 'booked' | 'approval' | 'blocked'."""
    perms = ops.permissions(agent["id"])
    safety = ops.safety()
    name = agent["name"]
    tz = ops.tz_for(requester)
    if perms["sched"] == "off":
        return "blocked", "I couldn’t add it, though: “Add calendar events” is off for me in Settings.", None, None
    if ev["guests"] and perms["external"] == "off":
        return "blocked", "I couldn’t book it, though: “Invite people outside the workspace” is off for me in Settings.", None, None

    rule_kind = "event_external" if ev["guests"] else "event"
    rule = None
    if not _always(agent["id"], rule_kind):
        if ev["guests"] and safety["externalNeedsApproval"]:
            rule = "Anything involving people outside the workspace needs approval."
        elif ev["guests"] and perms["external"] == "ask":
            rule = f"“{ops.PERM_LABEL['external']}” is set to Ask first for {name}."
        elif agent["autonomy"] == "ask":
            rule = f"{name} is set to Ask first."
        elif perms["sched"] == "ask":
            rule = f"“{ops.PERM_LABEL['sched']}” is set to Ask first for {name}."
    if not rule and safety["quietHours"] and ops.in_quiet_hours(ev["start"], ev["end"], tz):
        rule = "Quiet hours: events before 8 AM or after 7 PM need approval."

    clashes = ops.overlapping(ev["start"], ev["end"])
    clash_note = f" It overlaps “{clashes[0]['title']}”." if clashes else ""
    attendees = list(dict.fromkeys([requester, agent["id"], *ev["attendees"]]))
    event = ops.add_event({"title": ev["title"], "start": ev["start"], "end": ev["end"], "roomId": room["id"], "attendees": attendees,
                           "guests": ev["guests"], "notes": ev["notes"], "createdBy": agent["id"], "status": "tentative" if rule else "confirmed"})
    if not rule:
        return "booked", clash_note.strip() and f"Heads up:{clash_note}", None, event

    rows = [{"k": "When", "v": ops.when_text(ev["start"], ev["end"], tz)}]
    if ev["guests"]:
        rows.append({"k": "Guests", "v": ", ".join(ev["guests"])})
    rows.append({"k": "Room", "v": f"#{room['name']}"})
    ap = ops.create_approval({
        "kind": "event", "ruleKind": rule_kind, "agentId": agent["id"], "roomId": room["id"], "title": f"Book “{ev['title']}”",
        "risk": "External" if ev["guests"] else "Calendar", "rule": rule, "why": (ev["why"] + clash_note).strip(), "rows": rows,
        "body": ev["notes"] or None, "payload": {"eventId": event["id"]},
        "alwaysAllowLabel": f"Always let {name} invite outside guests" if ev["guests"] else f"Always let {name} add calendar events",
    })
    event = ops.update_event(event["id"], {"approvalId": ap["id"]})
    return "approval", "", ap, event


def decide_tasks(agent: dict, room: dict, tasks: list[dict]) -> tuple[str, str, dict | None]:
    perms = ops.permissions(agent["id"])
    name = agent["name"]
    if perms["tasks"] == "off":
        return "blocked", "I couldn’t add them to the board: “Create board tasks” is off for me in Settings.", None
    rule = None
    if not _always(agent["id"], "tasks"):
        if agent["autonomy"] == "ask":
            rule = f"{name} is set to Ask first."
        elif perms["tasks"] == "ask":
            rule = f"“{ops.PERM_LABEL['tasks']}” is set to Ask first for {name}."
    n = len(tasks)
    if not rule:
        ops.create_tasks(tasks, room["id"], agent["id"])
        return "added", f"Added {n} task{'s' if n != 1 else ''} to the board.", None
    ap = ops.create_approval({
        "kind": "tasks", "agentId": agent["id"], "roomId": room["id"], "title": f"Add {n} task{'s' if n != 1 else ''} to the board",
        "risk": "Board", "rule": rule, "why": "These came out of the request in the room.",
        "rows": [{"k": "Task", "v": t["title"]} for t in tasks], "payload": {"tasks": tasks},
        "alwaysAllowLabel": f"Always let {name} create board tasks",
    })
    return "approval", "", ap


# ---------- jobs ----------

def _context(agent_id: str) -> dict:
    return {"people": ops.people(), "agents": ops.agents(), "perms": ops.permissions(agent_id), "workspace": ops.workspace()["name"]}


async def _tick(job: dict) -> None:
    """Visible progress while the model works. The engine has no token-level progress to report."""
    steps = ["Thinking it through", "Working on it", "Drafting", "Checking the details"]
    while True:
        await asyncio.sleep(1.6)
        job["pct"] = min(88, job["pct"] + random.uniform(2, 6))
        job["step"] = steps[min(len(steps) - 1, int(job["pct"] // 25))]
        ops.upsert_job(dict(job), persist=False)


async def run_job(agent_id: str, room_id: str, request: str, *, requester: str = S.DEFAULT_USER, title: str | None = None,
                  depth: int = 0, routine_id: str | None = None) -> None:
    agent = await aw(ops.agent, agent_id)
    room = await aw(ops.room, room_id)
    if not agent or not room:
        return
    name = agent["name"]
    tz = await aw(ops.tz_for, requester)
    title = title or title_from(request)
    job = {
        "id": new_id("job-"), "agentId": agent_id, "roomId": room_id, "title": title, "pct": 5, "step": "Reading the room",
        "startedAt": iso(), "typing": f"{name} is reading the request…",
        "steps": [{"t": "Read the request", "state": "active"}, {"t": "Work on it", "state": "todo"}, {"t": f"Post to #{room['name']}", "state": "todo"}],
    }
    task = {"id": new_id("t"), "title": title, "owner": agent_id, "roomId": room_id, "due": "Today", "column": "in_progress", "jobId": job["id"], "createdAt": iso()}
    await aw(ops.upsert_job, dict(job))
    await aw(ops.upsert_task, task)
    await aw(ops.refresh_agent, agent_id)
    ops.typing(room_id, job["typing"])

    history = await aw(ops.messages, room_id, 30)
    ctx = await aw(_context, agent_id)
    prompt = await aw(build_prompt, agent, room, history, request, ctx, tz)

    job.update(pct=12, step="Thinking it through", typing=f"{name} is working on it…",
               steps=[{"t": "Read the request", "state": "done"}, {"t": "Work on it", "state": "active"}, job["steps"][2]])
    ops.upsert_job(dict(job), persist=False)
    ops.typing(room_id, job["typing"])
    ticker = asyncio.create_task(_tick(job))
    try:
        raw = await model.call_model(prompt, role="rally_agent", max_tokens=4000, temperature=0.6)
        known = {p["id"] for p in ctx["people"]} | {a["id"] for a in ctx["agents"]}
        result, error = parse_reply(raw, tz, known), None
    except Exception as exc:  # noqa: BLE001 - surface any model failure in the room
        result, error = None, exc
        print(f"[rally] {name} failed: {type(exc).__name__}: {exc}")
    finally:
        ticker.cancel()

    if error or result is None:
        reason = "the model rejected the API key" if "401" in str(error) or "Authentication" in type(error).__name__ else f"the model call failed ({type(error).__name__})"
        await aw(ops.add_message, {"kind": "msg", "roomId": room_id, "author": agent_id, "text": f"I couldn’t finish “{title}”: {reason}. Try again in a minute."})
        job.update(pct=100, step="Failed", typing=None, finishedAt=iso())
        await aw(ops.upsert_job, dict(job))
        await aw(ops.upsert_task, {**task, "column": "queued", "flag": "Failed"})
        await aw(ops.refresh_agent, agent_id, "Last task failed")
        ops.typing(room_id, "")
        if routine_id:
            await aw(_routine_set, routine_id, "Failed", True)
        return

    job.update(pct=94, step=f"Posting to #{room['name']}")
    ops.upsert_job(dict(job), persist=False)
    title = result.get("task_title") or title
    result_tag = "Auto" if agent["autonomy"] == "act" else "Within limits"

    msg: dict = {"kind": "msg", "roomId": room_id, "author": agent_id, "text": result["reply"], "task": {"title": title, "done": True}}
    notes: list[str] = []
    activity: list[tuple] = []
    if result.get("bullets"):
        msg["bullets"] = result["bullets"]
    if result.get("doc"):
        d = result["doc"]
        doc_id = await aw(ops.add_doc, d["title"], d["body"], agent_id, room_id)
        msg["file"] = {"name": d["title"], "meta": f"Doc · {len(d['body'].split())} words", "icon": "article", "url": doc_id}
        activity.append((f"Created doc “{d['title']}”", result_tag, None))
    approval = None
    if result.get("event"):
        outcome, note, ap, event = await aw(decide_event, agent, room, result["event"], requester)
        if event:
            msg["eventId"] = event["id"]
        if ap:
            approval = ap
            activity.append((f"Asked to book “{result['event']['title']}”", None, ap["id"]))
        elif outcome == "booked":
            activity.append((f"Added “{result['event']['title']}” to the calendar", result_tag, None))
        if note:
            notes.append(note)
    if result.get("tasks"):
        outcome, note, ap = await aw(decide_tasks, agent, room, result["tasks"])
        if ap and not approval:
            approval = ap
        if ap:
            activity.append((f"Asked to add {len(result['tasks'])} tasks to the board", None, ap["id"]))
        elif outcome == "added":
            activity.append((f"Added {len(result['tasks'])} tasks to the board", result_tag, None))
        if note:
            notes.append(note)
    if approval:
        msg["approvalId"] = approval["id"]
    if notes:
        msg["text"] = " ".join([msg["text"], *notes])
    await aw(ops.add_message, msg)

    if result.get("memory"):
        await aw(ops.add_message, {"kind": "memory", "roomId": room_id, "agentId": agent_id, "text": result["memory"], "undone": False})
        await aw(ops.remember, agent_id, result["memory"])
        activity.append((f"Remembered: {result['memory']}", result_tag, None))
    if not activity:
        activity.append((f"Worked on “{title}”", result_tag, None))
    for action, tag, ap_id in activity:
        await aw(ops.add_activity, agent_id, action, room_id, tag, ap_id)

    job.update(title=title, pct=100, step="Waiting for approval" if approval else "Done", typing=None, finishedAt=iso(),
               steps=[{"t": "Read the request", "state": "done"}, {"t": "Work on it", "state": "done"}, {"t": f"Post to #{room['name']}", "state": "done"}])
    await aw(ops.upsert_job, dict(job))
    await aw(ops.upsert_task, {**task, "title": title, "column": "review" if approval else "done", **({"approvalId": approval["id"]} if approval else {})})
    await aw(ops.push_recent, agent_id, title)
    await aw(ops.refresh_agent, agent_id, f"Finished {title}")
    ops.typing(room_id, "")
    if routine_id:
        await aw(_routine_set, routine_id, "Waiting" if approval else "Done", True)

    h = result.get("handoff")
    if h and depth < MAX_HANDOFF_DEPTH:
        others = await aw(ops.agents)
        target = next((a for a in others if h["to"] in (a["id"], a["name"].lower())), None)
        if target and target["id"] != agent_id and not target.get("paused"):
            await aw(ops.add_message, {"kind": "handoff", "roomId": room_id, "from": agent_id, "to": target["id"], "text": h["text"]})
            asyncio.create_task(run_job(target["id"], room_id, f"{name} handed you {h['text']}. {h['ask']}", requester=requester,
                                        title=title_from(h["ask"]), depth=depth + 1))


def _routine_set(routine_id: str, status: str, stamp: bool) -> None:
    db().rally_routines.update_one({"_id": routine_id}, {"$set": {"lastRun": status, **({"lastRunAt": iso()} if stamp else {})}})
    r = db().rally_routines.find_one({"_id": routine_id})
    if r:
        ops.BUS.publish("routine", {**r, "id": r.pop("_id")})


def _over_limit(agent_id: str) -> bool:
    if not ops.safety()["jobLimit"]:
        return False
    since = iso(utcnow() - dt.timedelta(hours=1))
    return db().rally_jobs.count_documents({"agentId": agent_id, "startedAt": {"$gt": since}}) >= JOBS_PER_HOUR


async def handle_message(msg: dict, author: str) -> None:
    """A person posted in a room: start a job for each agent they mentioned."""
    agents = await aw(ops.agents)
    who = await aw(ops.display_name, author)
    for a in mentioned(msg["text"], agents):
        if a.get("paused"):
            text = "I’m paused right now. Resume me on my profile and mention me again."
        elif await aw(_over_limit, a["id"]):
            text = f"I’ve hit the limit of {JOBS_PER_HOUR} tasks an hour. Try again later, or turn the limit off in Settings."
        else:
            asyncio.create_task(run_job(a["id"], msg["roomId"], f"{who} asked you: {msg['text']}", requester=author, title=title_from(msg["text"])))
            continue
        await aw(ops.add_message, {"kind": "msg", "roomId": msg["roomId"], "author": a["id"], "text": text})


async def run_routine(routine: dict) -> None:
    await aw(_routine_set, routine["id"], "Running…", False)
    await run_job(routine["agentId"], routine["roomId"],
                  f"Scheduled routine “{routine['name']}”: {routine['description']}. Do it now and post the result to the room.",
                  title=routine["name"], routine_id=routine["id"])


# ---------- catch up ----------

async def catchup(room_id: str, user: str) -> dict:
    room = await aw(ops.room, room_id)
    msgs = await aw(ops.messages, room_id, 60)
    if not room or not msgs:
        return {"meta": "No messages yet", "points": ["Nothing has happened in this room yet."]}
    tz = await aw(ops.tz_for, user)
    since = iso(utcnow() - dt.timedelta(hours=24))
    recent = [m for m in msgs if m.get("ts", "") > since]
    meta = f"{len(recent)} message{'s' if len(recent) != 1 else ''} since yesterday" if len(recent) >= 3 else f"Last {min(len(msgs), 15)} messages"
    recent = recent if len(recent) >= 3 else msgs[-15:]
    ctx = await aw(lambda: {"people": ops.people(), "agents": ops.agents()})
    names = {p["id"]: p["name"] for p in ctx["people"]} | {a["id"]: a["name"] for a in ctx["agents"]}
    transcript = "\n".join(_line(m, names, tz) for m in recent)
    raw = await model.call_model([
        {"role": "system", "content": "You catch a teammate up on a chat room. Summarize what happened in 2 to 4 short, plain sentences: "
                                      "decisions, finished work, and anything still open. Name who did what. No exclamation marks. "
                                      'Answer with JSON only: {"points": ["...", "..."]}'},
        {"role": "user", "content": f"#{room['name']} ({room['topic']}):\n{transcript}"},
    ], role="rally_catchup", max_tokens=1500, temperature=0.3)
    try:
        points = [p.strip() for p in model.extract_json(raw).get("points", []) if isinstance(p, str) and p.strip()][:5]
    except Exception:  # noqa: BLE001
        points = [line.strip("-• ").strip() for line in model.strip_thinking(raw).splitlines() if line.strip()][:4]
    result = {"meta": meta, "points": points or ["Nothing worth flagging."]}
    pending = await aw(lambda: db().rally_approvals.find_one({"roomId": room_id, "status": "pending"}, sort=[("createdAt", -1)]))
    if pending:
        result.update(approvalId=pending["_id"], ask=f"Review “{pending['title']}”")
    return result
