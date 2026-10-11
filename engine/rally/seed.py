"""Test workspace: one test person, four agents, and sample data that shows each feature.

Written to Mongo the first time Rally boots.

    python -m engine.rally.seed --reset     # wipe the rally_* collections; the next page load seeds again
"""
from __future__ import annotations

import argparse
import datetime as dt
from zoneinfo import ZoneInfo

from engine import config
from engine.rally import db

DEFAULT_USER = "test"
WORKSPACE = {"name": "Test Workspace"}

PERM_KEYS = ("read", "draft", "tasks", "sched", "external")
DEFAULT_PERMS = {"read": "allow", "draft": "allow", "tasks": "ask", "sched": "off", "external": "off"}
SAFETY = {"externalNeedsApproval": True, "quietHours": True, "jobLimit": True}


def _ago(minutes: float) -> str:
    return db.iso(db.utcnow() - dt.timedelta(minutes=minutes))


_SEED_TZ: str | None = None  # the first visitor's browser time zone, so sample events land at sensible local times


def _tz() -> dt.tzinfo:
    for name in (_SEED_TZ, config.RALLY_TZ):
        try:
            if name:
                return ZoneInfo(name)
        except Exception:  # noqa: BLE001 - unknown zone name
            continue
    return dt.timezone.utc


def _at(days: int, hour: int, minute: int = 0) -> dt.datetime:
    """A local time `days` from today, in studio time."""
    d = dt.datetime.now(_tz()).date() + dt.timedelta(days=days)
    return dt.datetime(d.year, d.month, d.day, hour, minute, tzinfo=_tz())


def _monday(weeks: int = 0) -> int:
    """Days from today to Monday of this week (+ weeks)."""
    return -dt.datetime.now(_tz()).weekday() + 7 * weeks


PEOPLE = [
    {"_id": "test", "name": "Test User", "initials": "TU", "role": "Workspace owner", "email": "test@example.com", "access": "Admin", "lastActive": "Now"},
]

RALLY_TOOLS = ["Rally rooms", "Rally Docs", "Rally Board", "Rally Calendar"]


def _agent(id_, name, role, color, autonomy, now, does, tools, memory, recent):
    return {"_id": id_, "name": name, "role": role, "color": color, "autonomy": autonomy, "status": "idle", "now": now,
            "paused": False, "does": does, "tools": tools, "memory": memory, "recent": [{"t": t, "ts": _ago(m)} for t, m in recent]}


AGENTS = [
    _agent("scout", "Scout", "Research", 1, "act", "Finished tool comparison",
           "Researches questions and summarizes what it finds as short, clear bullets.", ["Rally rooms", "Rally Docs"],
           ["Keep summaries to 5 bullets or fewer"], [("Tool comparison for small teams", 59), ("Three landing page examples", 3 * 1440)]),
    _agent("quill", "Quill", "Writing", 2, "act", "Wrote the tool summary",
           "Turns notes into clear writing: summaries, briefs, plans and announcements.", ["Rally rooms", "Rally Docs"],
           ["Test User prefers plain language"], [("One-page tool summary", 48), ("Project Alpha brief", 2 * 1440)]),
    _agent("relay", "Relay", "Scheduling", 4, "ask", "Waiting on your approval",
           "Finds free time and books meetings and focus blocks on the Rally calendar.", ["Rally rooms", "Rally Calendar"],
           ["Keep mornings before 10 AM free when possible"], [("Focus block for Test User", 9), ("Weekly review series", 6 * 1440)]),
    _agent("tally", "Tally", "Reporting", 6, "limits", "Sent the weekly report",
           "Reads what happened across rooms and the board, then reports progress and next steps.", ["Rally rooms", "Rally Board", "Rally Calendar"],
           ["Report in numbers first, then one line of context"], [("Weekly report", 2 * 1440)]),
]

ROOMS = [
    {"_id": "welcome", "name": "welcome", "topic": "Start here: a short tour of how Rally works", "people": ["test"], "agents": ["scout", "quill", "relay", "tally"]},
    {"_id": "alpha", "name": "project-alpha", "topic": "Sample project: launch a simple landing page in two weeks", "people": ["test"], "agents": ["quill", "scout", "tally", "relay"]},
    {"_id": "report", "name": "weekly-report", "topic": "Tally posts a progress report every Monday", "people": ["test"], "agents": ["tally"]},
    {"_id": "sandbox", "name": "sandbox", "topic": "Try anything here. Type @ and an agent’s name to hand over a task", "people": ["test"], "agents": ["scout", "quill", "relay", "tally"]},
]
for _i, _r in enumerate(ROOMS):
    _r["order"] = _i
    _r["files"] = []

FOLDERS = [
    {"id": "start", "name": "Getting started", "kind": "room", "items": ["welcome", "sandbox"], "open": True, "order": 0},
    {"id": "projects", "name": "Projects", "kind": "room", "items": ["alpha", "report"], "open": True, "order": 1},
    {"id": "thinking", "name": "Research & writing", "kind": "agent", "items": ["scout", "quill"], "open": True, "order": 0},
    {"id": "ops", "name": "Operations", "kind": "agent", "items": ["relay", "tally"], "open": True, "order": 1},
]
STARRED = ["welcome", "relay"]

PERMISSIONS = {
    "scout": {"read": "allow", "draft": "allow", "tasks": "ask", "sched": "off", "external": "off"},
    "quill": {"read": "allow", "draft": "allow", "tasks": "allow", "sched": "ask", "external": "off"},
    "relay": {"read": "allow", "draft": "allow", "tasks": "allow", "sched": "allow", "external": "ask"},
    "tally": {"read": "allow", "draft": "allow", "tasks": "ask", "sched": "off", "external": "off"},
}

SUMMARY_DOC = """Small teams usually need three things from a tracking tool: one shared list of work, a clear owner for each item, and a weekly look at what moved.

Simple boards (a few columns, drag cards across) are the easiest to start with. They work well up to about 30 open items.

List-based tools are better when work has lots of small steps. They take a little longer to set up.

Heavier project tools add timelines and reports. Most teams under ten people don’t use those features.

Recommendation: start with a simple board, review it every Monday, and only move to something heavier if the board gets crowded."""

BRIEF_DOC = """Goal: launch a one-page landing page for Project Alpha within two weeks.

Audience: small teams who want a simpler way to work with AI agents.

The page needs: a headline, three short benefit points, one screenshot, and a sign-up form.

Out of scope: pricing, a blog, and a full help center.

Done means: the page is live, the form works, and the team has reviewed the copy."""


def _events():
    kickoff_start = _at(2, 15)
    return [
        {"_id": "ev-review", "title": "Weekly review", "start": db.iso(_at(_monday(), 10)), "end": db.iso(_at(_monday(), 10, 30)),
         "roomId": "report", "attendees": ["test", "tally"], "guests": [], "notes": "Go through Tally’s report and the board.", "createdBy": "relay", "status": "confirmed"},
        {"_id": "ev-review-next", "title": "Weekly review", "start": db.iso(_at(_monday(1), 10)), "end": db.iso(_at(_monday(1), 10, 30)),
         "roomId": "report", "attendees": ["test", "tally"], "guests": [], "notes": "Go through Tally’s report and the board.", "createdBy": "relay", "status": "confirmed"},
        {"_id": "ev-focus", "title": "Focus time", "start": db.iso(_at(0, 14)), "end": db.iso(_at(0, 15, 30)),
         "roomId": "welcome", "attendees": ["test"], "guests": [], "notes": "No meetings. Booked by Relay.", "createdBy": "relay", "status": "confirmed"},
        {"_id": "ev-lunch", "title": "Lunch", "start": db.iso(_at(0, 12)), "end": db.iso(_at(0, 13)),
         "attendees": ["test"], "guests": [], "notes": "", "createdBy": "test", "status": "confirmed"},
        {"_id": "ev-demo", "title": "Demo prep with Quill", "start": db.iso(_at(1, 11)), "end": db.iso(_at(1, 11, 30)),
         "roomId": "alpha", "attendees": ["test", "quill"], "guests": [], "notes": "Walk through the landing page copy.", "createdBy": "quill", "status": "confirmed"},
        {"_id": "ev-kickoff", "title": "Project Alpha kickoff", "start": db.iso(kickoff_start), "end": db.iso(kickoff_start + dt.timedelta(minutes=45)),
         "roomId": "welcome", "attendees": ["test", "relay"], "guests": ["guest@example.com"], "notes": "Agenda: goals, timeline, who does what.",
         "createdBy": "relay", "status": "tentative", "approvalId": "ap1"},
    ]


def _when(start: dt.datetime, minutes: int) -> str:
    end = start + dt.timedelta(minutes=minutes)
    fmt = lambda t: t.strftime("%I:%M").lstrip("0")  # noqa: E731
    return f"{start.strftime('%a, %b')} {start.day} · {fmt(start)}–{fmt(end)} {end.strftime('%p')}"


def _approvals():
    kickoff = _at(2, 15)
    return [
        {"_id": "ap1", "kind": "event", "agentId": "relay", "roomId": "welcome", "title": "Book “Project Alpha kickoff”", "createdAt": _ago(19), "risk": "External",
         "rule": "Anything involving people outside the workspace needs approval.",
         "why": f"{kickoff.strftime('%A')} at 3:00 PM is free for you, and the guest is outside the workspace.",
         "rows": [{"k": "When", "v": _when(kickoff, 45)}, {"k": "Guests", "v": "guest@example.com"}, {"k": "Room", "v": "#welcome"}],
         "body": "Agenda: goals, timeline, who does what.", "alwaysAllowLabel": "Always let Relay invite outside guests",
         "payload": {"eventId": "ev-kickoff"}, "status": "pending"},
        {"_id": "ap2", "kind": "tasks", "agentId": "tally", "roomId": "alpha", "title": "Add 3 tasks to the board", "createdAt": _ago(170), "risk": "Board",
         "rule": "“Create board tasks” is set to Ask first for Tally.",
         "why": "These are the main steps in the Project Alpha brief that aren’t on the board yet.",
         "rows": [{"k": "Task", "v": "Write the headline and benefits"}, {"k": "Task", "v": "Take the product screenshot"}, {"k": "Task", "v": "Set up the sign-up form"}],
         "alwaysAllowLabel": "Always let Tally create board tasks",
         "payload": {"tasks": [{"title": "Write the headline and benefits", "owner": "quill", "due": "Thu"},
                               {"title": "Take the product screenshot", "owner": "test", "due": "Fri"},
                               {"title": "Set up the sign-up form", "owner": "test", "due": "Mon"}]}, "status": "pending"},
        {"_id": "ap3", "kind": "event", "agentId": "quill", "roomId": "alpha", "title": "Book “Demo prep with Quill”", "createdAt": _ago(26 * 60), "risk": "Calendar",
         "rule": "“Add calendar events” is set to Ask first for Quill.", "why": "You asked for time to review the landing page copy together.",
         "rows": [{"k": "When", "v": _when(_at(1, 11), 30)}, {"k": "Room", "v": "#project-alpha"}],
         "payload": {"eventId": "ev-demo"}, "status": "approved", "resolvedBy": "test", "resolvedAt": _ago(25 * 60)},
    ]


def _messages():
    def msg(id_, room, author, mins, text, **extra):
        return {"_id": id_, "kind": "msg", "roomId": room, "author": author, "ts": _ago(mins), "text": text, **extra}

    weekday = _at(2, 15).strftime("%A")
    return [
        # #welcome: a short tour, top to bottom
        msg("w0", "welcome", "test", 62, "Hi team. I’m trying Rally out, so I’ll ask each of you for something small."),
        msg("w1", "welcome", "test", 61, "@Scout what’s a good way for a small team to keep track of work?"),
        msg("w2", "welcome", "scout", 59, "Here’s what I’d look at. This is from general knowledge, not a web search:",
            task={"title": "Tool comparison for small teams", "done": True},
            bullets=["Start with one shared list or board, not several", "Give every item one clear owner",
                     "Review what moved once a week", "Simple boards work well up to about 30 open items",
                     "Only add timelines and reports when you actually need them"]),
        msg("w3", "welcome", "test", 51, "@Quill turn Scout’s notes into a one-page summary. Keep it short, I prefer plain language."),
        {"_id": "w4", "kind": "handoff", "roomId": "welcome", "from": "scout", "to": "quill", "text": "Scout’s notes", "ts": _ago(50)},
        msg("w5", "welcome", "quill", 48, "Here’s a one-page summary. Open it to read the whole thing.",
            task={"title": "One-page tool summary", "done": True},
            file={"name": "Tracking tools: a one-page summary", "meta": "Doc · 120 words", "icon": "article", "url": "doc-summary"}),
        {"_id": "w6", "kind": "memory", "roomId": "welcome", "agentId": "quill", "text": "Test User prefers plain language.", "undone": False, "ts": _ago(48)},
        msg("w7", "welcome", "test", 20, f"@Relay set up a 45-minute kickoff for Project Alpha on {weekday} afternoon and invite guest@example.com."),
        msg("w8", "welcome", "relay", 19, f"{weekday} at 3:00 PM is free. A guest from outside the workspace is invited, so I need your OK first. "
                                          "It’s on the calendar as tentative until then.",
            task={"title": "Project Alpha kickoff", "done": True}, approvalId="ap1", eventId="ev-kickoff"),
        msg("w9", "welcome", "test", 10, "@Relay also block 90 minutes of focus time for me today at 2."),
        msg("w10", "welcome", "relay", 9, "Done. It’s on your calendar.", task={"title": "Focus block for Test User", "done": True}, eventId="ev-focus"),
        msg("w11", "welcome", "tally", 8, "That’s the tour: Scout researched, Quill wrote a doc and remembered your preference, Relay booked time "
                                          "and asked before inviting a guest. Approvals are in the inbox on the left. Try your own requests in #sandbox."),
        # #project-alpha
        msg("p1", "alpha", "test", 3 * 60, "Kicking off Project Alpha here. Goal: a simple landing page, live in two weeks."),
        msg("p2", "alpha", "test", 3 * 60 - 2, "@Quill write a short brief we can all work from."),
        msg("p3", "alpha", "quill", 3 * 60 - 4, "Here’s the brief. It covers the goal, audience, what the page needs and what’s out of scope.",
            task={"title": "Project Alpha brief", "done": True},
            file={"name": "Project Alpha brief", "meta": "Doc · 70 words", "icon": "article", "url": "doc-brief"}),
        msg("p4", "alpha", "test", 3 * 60 - 8, "@Tally put the main steps on the board."),
        msg("p5", "alpha", "tally", 3 * 60 - 10, "I’d add 3 tasks. Creating board tasks is set to Ask first for me, so they’re waiting for your OK.",
            task={"title": "Plan the Alpha tasks", "done": True}, approvalId="ap2"),
        msg("p6", "alpha", "quill", 26 * 60, "I’d like 30 minutes tomorrow to walk you through the copy.", approvalId="ap3", eventId="ev-demo"),
        # #weekly-report
        msg("r1", "report", "tally", 2 * 1440, "Weekly report:",
            task={"title": "Weekly report", "done": True},
            bullets=["5 tasks done, 3 in progress, 2 waiting for review", "2 meetings booked, 1 waiting for approval",
                     "Project Alpha is on track for its two-week goal", "Next: approve the Alpha tasks so work can start"]),
    ]


def _tasks():
    rows = [
        ("t1", "Pick a color palette", "test", "alpha", "Wed", "queued", {}),
        ("t2", "Collect three landing page examples", "scout", "alpha", "Mon", "done", {}),
        ("t3", "Project Alpha brief", "quill", "alpha", "Today", "review", {"flag": "Review: Test User"}),
        ("t4", "Add the Alpha tasks to the board", "tally", "alpha", "Today", "review", {"approvalId": "ap2"}),
        ("t5", "Book the kickoff", "relay", "welcome", "Today", "review", {"approvalId": "ap1"}),
        ("t6", "Tool comparison for small teams", "scout", "welcome", "Today", "done", {}),
        ("t7", "One-page tool summary", "quill", "welcome", "Today", "done", {}),
        ("t8", "Try a request in #sandbox", "test", "sandbox", "Today", "queued", {}),
        ("t9", "Weekly report", "tally", "report", "Mon", "done", {}),
    ]
    return [{"_id": i, "title": t, "owner": o, "roomId": r, "due": d, "column": c, "createdAt": _ago(300 - n), **x} for n, (i, t, o, r, d, c, x) in enumerate(rows)]


def _routines():
    rows = [
        ("r1", "Weekly report", "Summarize what moved on the board and calendar this week", "tally", "Mondays · 9:00 AM", "0 9 * * 1", "report", 2 * 1440, "Done", True),
        ("r2", "Morning agenda", "Post today’s calendar for Test User with any gaps for focus time", "relay", "Weekdays · 8:30 AM", "30 8 * * 1-5", "welcome", 1440, "Done", True),
        ("r3", "Research digest", "Three short ideas that could help Project Alpha", "scout", "Fridays · 4:00 PM", "0 16 * * 5", "alpha", 6 * 1440, "Done", False),
    ]
    return [{"_id": i, "name": n, "description": d, "agentId": a, "schedule": s, "cron": c, "roomId": r, "lastRunAt": _ago(ago), "lastRun": last, "enabled": on}
            for i, n, d, a, s, c, r, ago, last, on in rows]


def _activity():
    rows = [
        ("a1", 8, "tally", "Posted the tour summary", "welcome", {"result": "Auto"}),
        ("a2", 9, "relay", "Added “Focus time” to the calendar", "welcome", {"result": "Auto"}),
        ("a3", 19, "relay", "Asked to book “Project Alpha kickoff” with a guest", "welcome", {"approvalId": "ap1"}),
        ("a4", 48, "quill", "Created doc “Tracking tools: a one-page summary”", "welcome", {"result": "Auto"}),
        ("a5", 48, "quill", "Remembered: Test User prefers plain language", "welcome", {"result": "Auto"}),
        ("a6", 59, "scout", "Compared tracking tools for small teams", "welcome", {"result": "Auto"}),
        ("a7", 170, "tally", "Asked to add 3 tasks to the board", "alpha", {"approvalId": "ap2"}),
        ("a8", 176, "quill", "Created doc “Project Alpha brief”", "alpha", {"result": "Auto"}),
        ("a9", 25 * 60, "test", "Approved: Book “Demo prep with Quill”", "alpha", {}),
        ("a10", 2 * 1440, "tally", "Ran routine “Weekly report”", "report", {"result": "Within limits"}),
        ("a11", 3 * 1440, "test", "Set Relay’s “Invite people outside the workspace” to Ask first", None, {"result": "Setting"}),
    ]
    return [{"_id": i, "ts": _ago(m), "actor": who, "action": a, **({"roomId": r} if r else {}), **x} for i, m, who, a, r, x in rows]


def seed(reset: bool = False, tz: str | None = None) -> bool:
    """Seeds the test workspace if it is empty. Returns True if it wrote anything."""
    global _SEED_TZ
    _SEED_TZ = tz
    d = db.db()
    if reset:
        for name in db.COLLECTIONS:
            d[name].drop()
    if d.rally_agents.count_documents({}) > 0:
        return False
    d.rally_people.insert_many([{**p, **({"tz": tz} if tz else {})} for p in PEOPLE])
    d.rally_agents.insert_many([dict(a) for a in AGENTS])
    d.rally_rooms.insert_many([dict(r) for r in ROOMS])
    d.rally_messages.insert_many(_messages())
    d.rally_docs.insert_many([
        {"_id": "doc-summary", "title": "Tracking tools: a one-page summary", "body": SUMMARY_DOC, "agentId": "quill", "roomId": "welcome", "ts": _ago(48)},
        {"_id": "doc-brief", "title": "Project Alpha brief", "body": BRIEF_DOC, "agentId": "quill", "roomId": "alpha", "ts": _ago(176)},
    ])
    d.rally_calendar.insert_many(_events())
    d.rally_approvals.insert_many(_approvals())
    d.rally_tasks.insert_many(_tasks())
    d.rally_routines.insert_many(_routines())
    d.rally_activity.insert_many(_activity())
    d.rally_permissions.insert_many([{"_id": k, "perms": v} for k, v in PERMISSIONS.items()])
    d.rally_settings.insert_one({"_id": "safety", **SAFETY})
    d.rally_settings.insert_one({"_id": "always", "rules": []})
    d.rally_settings.insert_one({"_id": "workspace", **WORKSPACE})
    # everything is read except #project-alpha, so it shows an unread count
    d.rally_reads.insert_many([{"_id": f"{DEFAULT_USER}:{r['_id']}", "ts": db.iso()} for r in ROOMS if r["_id"] != "alpha"])
    for ap in d.rally_approvals.find({"status": "pending"}):
        d.rally_agents.update_one({"_id": ap["agentId"]}, {"$set": {"status": "waiting", "now": "Waiting on your approval"}})
    db.ensure_indexes()
    return True


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--reset", action="store_true", help="drop the rally_* collections; the next page load seeds again in that browser's time zone")
    args = p.parse_args()
    if args.reset:
        for name in db.COLLECTIONS:
            db.db()[name].drop()
        print("wiped. Open Rally to seed the test workspace again.")
    else:
        print("seeded" if seed() else "already seeded (use --reset to start over)")
