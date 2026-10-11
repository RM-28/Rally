"""FastAPI app: state, live event stream, messages, presence, run control.

    uvicorn engine.api:app --port 8000
"""
from __future__ import annotations

import asyncio
import datetime as dt
import json
import time

from bson import ObjectId
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse

from engine import board, config, store
from engine.loop import RunLoop
from engine.rally import cron as rally_cron
from engine.rally import db as rally_db
from engine.rally import routes as rally_routes

app = FastAPI(title=config.APP_NAME)
app.add_middleware(CORSMiddleware, allow_origins=[o.strip() for o in config.WEB_ORIGIN.split(",")],
                   allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"], allow_headers=["*"])

ACTIVE: dict = {"loop": None, "task": None}


@app.on_event("startup")
async def _startup():
    try:
        await asyncio.to_thread(store.ensure_indexes)
    except Exception as exc:  # noqa: BLE001 - the board should still come up
        print(f"[api] could not ensure indexes: {exc}")
PRESENT_SECS = 30


def _json(o):
    if isinstance(o, ObjectId):
        return str(o)
    if isinstance(o, dt.datetime):
        return o.isoformat()
    raise TypeError(type(o).__name__)


def clean(doc):
    return json.loads(json.dumps(doc, default=_json))


async def aw(fn, *a, **k):
    return await asyncio.to_thread(fn, *a, **k)


def current_run(run_id: str | None = None) -> dict | None:
    if run_id:
        return store.db().runs.find_one({"_id": run_id})
    if ACTIVE["loop"]:
        return store.db().runs.find_one({"_id": ACTIVE["loop"].run_id})
    return store.db().runs.find_one({"tag": None}, sort=[("started_at", -1)])


# ---------- reads ----------

def build_state(run_id: str | None) -> dict:
    d = store.db()
    run = current_run(run_id)
    since = store.now() - dt.timedelta(seconds=PRESENT_SECS)
    people = [p["_id"] for p in d.presence.find({"last_seen": {"$gte": since}})]
    if not run:
        return {"app_name": config.APP_NAME, "run": None, "people": people}
    rid = run["_id"]
    if run.get("showcase_fcfs") is not None and "showcase_fcfs_plan" not in run:
        run = board.backfill_fcfs_plans(run)
    rounds = list(d.rounds.find({"run_id": rid}, {"leaderboard": 0, "showcase": 0}).sort("n", 1))
    latest = d.rounds.find_one({"run_id": rid}, sort=[("n", -1)])
    strategies = list(d.strategies.find({"run_id": rid}, {"code": 0, "practice_runs": 0}).sort("round", 1))
    bots = []
    for b in d.bots.find({"run_id": rid}).sort("hired_round", 1):
        mine = [s for s in strategies if s["bot"] == b["name"]]
        last = mine[-1] if mine else None
        bots.append({
            "name": b["name"], "status": b["status"], "angle": b.get("angle"),
            "hired_round": b["hired_round"], "fired_round": b.get("fired_round"),
            "history": [{"round": s["round"], "gap": s.get("practice_gap")} for s in mine],
            "latest": last and {"id": last["_id"], "round": last["round"], "gap": last.get("practice_gap"),
                                "change": last.get("change"), "note": last.get("note"), "status": last["status"],
                                "delta": last.get("delta"), "error": last.get("error"),
                                "per_instance": last.get("per_instance"), "spread": last.get("practice_spread"),
                                "check_gap": last.get("check_gap"), "parent_id": last.get("parent_id")},
        })
    # this round's proposals, every bot (the leaderboard card), and how the record moved (chart annotation)
    last_n = latest["n"] if latest else 0
    round_results = [{"id": s["_id"], "bot": s["bot"], "change": s.get("change"), "practice_gap": s.get("practice_gap"),
                      "delta": s.get("delta"), "status": s["status"], "error": s.get("error")}
                     for s in strategies if s["round"] == last_n and last_n > 0]
    by_id = {s["_id"]: s for s in strategies}
    steered, prev = {}, None
    for r in rounds:
        if r.get("best_ever_id") != prev and (hm := (by_id.get(r.get("best_ever_id")) or {}).get("human_message")):
            steered[r["n"]] = hm
        prev = r.get("best_ever_id")
    proposals = [s for s in strategies if s["round"] >= 1]
    msgs = list(d.messages.find({"run_id": rid}).sort("ts", -1).limit(50))[::-1]
    loop = ACTIVE["loop"]
    return clean({
        "app_name": config.APP_NAME,
        "run": {**run, "paused": bool(loop and loop.run_id == rid and not loop.resume_evt.is_set())},
        "round": latest and {k: latest.get(k) for k in ("n", "best_practice_gap", "check_gap", "best_ever_id",
                                                         "best_ever_practice_gap", "best_ever_check_gap",
                                                         "leaderboard", "tests_run", "finished_at")},
        "curve": [{"n": r["n"], "practice": r.get("best_practice_gap"), "check": r.get("check_gap"),
                   "best_ever": r.get("best_ever_practice_gap"), "best_ever_check": r.get("best_ever_check_gap"),
                   "steered_by": steered.get(r["n"])}
                  for r in rounds],
        "round_results": round_results,
        "proposals": {"ok": sum(1 for s in proposals if s["status"] == "ok"), "total": len(proposals)},
        "baselines": run.get("baselines", {}), "solver": run.get("solver", {}),
        "showcase": latest and latest.get("showcase"),
        "showcase_events": latest and latest.get("showcase_events"),
        "playbook": (latest or {}).get("playbook", []),
        "bots": bots,
        "usage": store.usage_totals(rid),
        "tests_run": (latest or {}).get("tests_run", 0),
        "messages": msgs,
        "people": people,
        "live_mode": HUB.mode,
        "last_event_id": str(e["_id"]) if (e := d.events.find_one({"run_id": rid}, sort=[("_id", -1)])) else None,
    })


@app.get("/api/state")
async def state(run_id: str | None = None):
    return await aw(build_state, run_id)


@app.get("/api/runs")
async def runs():
    return clean(await aw(lambda: list(store.db().runs.find().sort("started_at", -1).limit(30))))


@app.get("/api/strategies/{sid}")
async def strategy(sid: str):
    doc = await aw(store.db().strategies.find_one, {"_id": sid}, {"practice_runs": 0})
    if not doc:
        raise HTTPException(404)
    parent = None
    if doc.get("parent_id"):
        parent = await aw(store.db().strategies.find_one, {"_id": doc["parent_id"]}, {"code": 1, "bot": 1})
    return clean({**doc, "parent_code": parent and parent.get("code")})


@app.get("/api/lineage/{sid}")
async def lineage(sid: str):
    """Root first: the strategy, every ancestor, and the side branches built on each one."""
    nodes = await aw(store.lineage_tree, sid)
    if not nodes:
        raise HTTPException(404)
    return clean(nodes)


@app.get("/api/results")
async def results():
    return clean(await aw(board.results))


# ---------- live stream: one MongoDB change stream fans out to every client ----------

class Hub:
    """Watches the `events` collection with a MongoDB change stream (inserts only) and pushes each new
    event to every connected browser. If change streams are unavailable it falls back to polling by _id,
    so the board keeps working either way. One watcher serves all viewers."""

    def __init__(self):
        self.subs: set[asyncio.Queue] = set()
        self.task: asyncio.Task | None = None
        self.last_id: ObjectId | None = None
        self.mode = "starting"   # "change_stream" | "polling"; shown in /api/state

    def publish(self, e: dict):
        if self.last_id and e["_id"] <= self.last_id:
            return  # already sent (resume overlap)
        self.last_id = e["_id"]
        payload = json.dumps(clean(e))
        for q in list(self.subs):
            if q.qsize() < 1000:
                q.put_nowait(payload)

    def _watch(self, loop: asyncio.AbstractEventLoop):
        """Blocking change-stream loop, run in a worker thread. Resumes after transient errors."""
        resume = None
        failures = 0
        while failures < 3:
            try:
                pipeline = [{"$match": {"operationType": "insert"}}]
                with store.db().events.watch(pipeline, resume_after=resume) as cs:
                    self.mode = "change_stream"
                    failures = 0
                    for change in cs:
                        resume = cs.resume_token
                        loop.call_soon_threadsafe(self.publish, change["fullDocument"])
            except Exception as exc:  # noqa: BLE001
                failures += 1
                print(f"[hub] change stream error ({failures}/3): {exc}")
                time.sleep(2)
        raise RuntimeError("change streams unavailable")

    async def _poll(self):
        while True:
            try:
                new = await aw(lambda: list(store.db().events.find({"_id": {"$gt": self.last_id}}).sort("_id", 1).limit(500)))
            except Exception as exc:  # noqa: BLE001
                print(f"[hub] poll failed: {exc}")
                await asyncio.sleep(3)
                continue
            for e in new:
                self.publish(e)
            await asyncio.sleep(1.0)

    async def run(self):
        last = await aw(lambda: store.db().events.find_one(sort=[("_id", -1)]))
        self.last_id = last["_id"] if last else ObjectId.from_datetime(store.now())
        if config.MONGODB_URI != "mock":
            try:
                await asyncio.to_thread(self._watch, asyncio.get_running_loop())
            except Exception as exc:  # noqa: BLE001
                print(f"[hub] falling back to polling: {exc}")
        self.mode = "polling"
        await self._poll()

    def subscribe(self) -> asyncio.Queue:
        if self.task is None or self.task.done():
            self.task = asyncio.create_task(self.run())
        q: asyncio.Queue = asyncio.Queue()
        self.subs.add(q)
        return q


HUB = Hub()


@app.get("/api/stream")
async def stream():
    q = HUB.subscribe()

    async def gen():
        try:
            while True:
                try:
                    data = await asyncio.wait_for(q.get(), timeout=15)
                    yield {"event": "message", "data": data}
                except asyncio.TimeoutError:
                    yield {"event": "ping", "data": "{}"}
        finally:
            HUB.subs.discard(q)

    return EventSourceResponse(gen())


# ---------- people ----------

class MessageIn(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    text: str = Field(min_length=1, max_length=500)
    bot: str | None = None


@app.post("/api/messages")
async def post_message(m: MessageIn):
    if ACTIVE["loop"]:
        rid = ACTIVE["loop"].run_id  # the run doc may not be written yet
    else:
        run = await aw(current_run)
        rid = run["_id"] if run else None
    doc = {"run_id": rid, "ts": store.now(), "name": m.name.strip(), "text": m.text.strip(), "bot": m.bot or None}
    await aw(store.db().messages.insert_one, doc)
    await aw(store.emit, "human_message", m.bot, {"name": doc["name"], "text": doc["text"]}, rid)
    return {"ok": True}


class PresenceIn(BaseModel):
    name: str = Field(min_length=1, max_length=40)


@app.post("/api/presence")
async def presence(p: PresenceIn):
    run = await aw(current_run)
    await aw(store.db().presence.update_one, {"_id": p.name.strip()},
             {"$set": {"run_id": run and run["_id"], "last_seen": store.now()}}, upsert=True)
    return {"ok": True}


# ---------- run control (admin only) ----------

def require_admin(token: str | None):
    if not config.ADMIN_TOKEN or token != config.ADMIN_TOKEN:
        raise HTTPException(403, "admin token required")


class StartIn(BaseModel):
    job: str = "jobshop"
    n_bots: int = Field(default=config.N_BOTS, ge=1, le=16)
    rounds: int = Field(default=5, ge=1, le=50)


@app.post("/api/run/start")
async def run_start(body: StartIn, x_admin_token: str | None = Header(default=None)):
    require_admin(x_admin_token)
    if ACTIVE["task"] and not ACTIVE["task"].done():
        raise HTTPException(409, f"run {ACTIVE['loop'].run_id} is still going")
    loop = RunLoop(body.job, body.n_bots, body.rounds)
    ACTIVE["loop"] = loop
    ACTIVE["task"] = asyncio.create_task(loop.run())
    return {"run_id": loop.run_id}


@app.post("/api/run/pause")
async def run_pause(x_admin_token: str | None = Header(default=None)):
    require_admin(x_admin_token)
    loop = ACTIVE["loop"]
    if not loop:
        raise HTTPException(404, "no active run")
    loop.resume_evt.clear()  # takes effect at the next round boundary
    await aw(store.db().runs.update_one, {"_id": loop.run_id}, {"$set": {"status": "paused"}})
    await aw(store.emit, "paused", None, {}, loop.run_id)
    return {"ok": True}


@app.post("/api/run/resume")
async def run_resume(x_admin_token: str | None = Header(default=None)):
    require_admin(x_admin_token)
    loop = ACTIVE["loop"]
    if not loop:
        raise HTTPException(404, "no active run")
    loop.resume_evt.set()
    await aw(store.db().runs.update_one, {"_id": loop.run_id}, {"$set": {"status": "running"}})
    await aw(store.emit, "resumed", None, {}, loop.run_id)
    return {"ok": True}


@app.post("/api/run/stop")
async def run_stop(x_admin_token: str | None = Header(default=None)):
    require_admin(x_admin_token)
    loop = ACTIVE["loop"]
    if loop:
        loop.stop_requested = True
        loop.resume_evt.set()
    return {"ok": True}


# ---------- schedule your team (uses the frozen best strategy; never tunes anything) ----------

SCHEDULE_LOCK = asyncio.Semaphore(1)  # one at a time: keep CPU free for live runs
_best_code: dict = {}


def best_strategy() -> dict:
    """The strategy scored by final_eval (frozen), else the latest finished run's best."""
    if not _best_code:
        sid = None
        lock = config.DATA / "final_eval.json"
        if lock.exists():
            sid = json.loads(lock.read_text())["strategy_id"]
        else:
            run = store.db().runs.find_one({"tag": None, "status": "finished"}, sort=[("started_at", -1)])
            sid = run and run.get("best_strategy_id")
        doc = sid and store.db().strategies.find_one({"_id": sid}, {"code": 1, "bot": 1, "practice_gap": 1})
        if not doc:
            raise HTTPException(503, "no trained strategy available yet")
        _best_code.update(id=doc["_id"], code=doc["code"], bot=doc["bot"], gap=doc.get("practice_gap"))
    return _best_code


class TaskIn(BaseModel):
    project: str = Field(min_length=1, max_length=60)
    person: str = Field(min_length=1, max_length=60)
    hours: int


class DowntimeIn(BaseModel):
    person: str
    start: int
    end: int


class ReleaseIn(BaseModel):
    project: str
    at: int


class ScheduleIn(BaseModel):
    tasks: list[TaskIn]
    downtime: list[DowntimeIn] = []
    release: list[ReleaseIn] = []


@app.post("/api/schedule")
async def schedule_team(body: ScheduleIn):
    from engine.jobs import get_job
    from engine.jobs.jobshop.custom import build_instance
    from engine.runner.core import run_child

    job = get_job("jobshop")
    try:
        inst, people, projects = build_instance([t.model_dump() for t in body.tasks],
                                                [d.model_dump() for d in body.downtime],
                                                [r.model_dump() for r in body.release])
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from None
    best = await aw(best_strategy)
    tl = config.TIME_LIMIT_S
    args = job.call_args(inst, tl)
    async with SCHEDULE_LOCK:
        fcfs_res, bot_res = await asyncio.gather(
            aw(run_child, job.baselines()["fcfs"], job.entrypoint, args, tl),
            aw(run_child, best["code"], job.entrypoint, args, tl))
    out = {}
    for name, res in (("fcfs", fcfs_res), ("bot", bot_res)):
        if "error" in res or res.get("secs", 0) > 2.5 * tl:
            raise HTTPException(500, f"{name} failed: {res.get('error', 'too slow')}")
        try:
            out[name] = job.showcase(inst, res["output"])
        except ValueError as exc:
            raise HTTPException(500, f"{name} produced an invalid schedule: {exc}") from None
    f, b = out["fcfs"]["makespan"], out["bot"]["makespan"]
    kept_simple = b > f  # the strategy is a heuristic; never hand the user a worse plan than the simple one
    if kept_simple:
        out["bot"], b = out["fcfs"], f
    doc = {
        "ts": store.now(), "start": next_workday_start(), "hours_per_day": HOURS_PER_DAY,
        "input": body.model_dump(),
        "people": people, "projects": projects,
        "fcfs": out["fcfs"], "bot": out["bot"],
        "hours_saved": f - b, "pct_shorter": round(100 * (f - b) / f, 1) if f else 0.0,
        "kept_simple": kept_simple,
        "strategy": {"id": best["id"], "bot": best["bot"]},
    }
    # shared: every board shows the latest team calendar (pushed to them by the change stream)
    await aw(store.db().team_schedules.insert_one, doc)
    await aw(store.emit, "team_scheduled", None, {"hours_saved": f - b, "people": len(people),
                                                   "projects": len(projects)}, None)
    return clean(doc)


@app.get("/api/team-schedule")
async def latest_team_schedule():
    doc = await aw(lambda: store.db().team_schedules.find_one(sort=[("ts", -1)]))
    return clean(doc) if doc else None


HOURS_PER_DAY = 8  # working hours per day; the calendar runs 9:00-17:00 on weekdays


def next_workday_start() -> str:
    """The next weekday morning at 9:00 (local time of the server), as ISO; the plan's hour 0."""
    now = dt.datetime.now().astimezone()
    d = now + dt.timedelta(days=1)
    while d.weekday() >= 5:
        d += dt.timedelta(days=1)
    return d.replace(hour=9, minute=0, second=0, microsecond=0).isoformat()


# ---------- Rally (must be mounted before the catch-all below) ----------

app.include_router(rally_routes.router)


@app.on_event("startup")
async def rally_startup():
    # the test workspace is seeded on the first /api/rally/bootstrap, in that browser's time zone
    rally_db.BUS.bind(asyncio.get_running_loop())
    asyncio.create_task(rally_cron.scheduler())


# ---------- fallback: serve the static board export from the same origin ----------

WEB_OUT = config.ROOT / "web" / "out"


@app.get("/{path:path}", include_in_schema=False)
async def static_board(path: str):
    if not WEB_OUT.exists():
        raise HTTPException(404)
    f = (WEB_OUT / path).resolve()
    if path and f.is_file() and WEB_OUT.resolve() in f.parents:
        return FileResponse(f)
    if (WEB_OUT / f"{path}.html").is_file():
        return FileResponse(WEB_OUT / f"{path}.html")
    return FileResponse(WEB_OUT / "index.html")
