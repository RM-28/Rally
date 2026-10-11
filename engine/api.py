"""FastAPI app: state, live event stream, messages, presence, run control.

    uvicorn engine.api:app --port 8000
"""
from __future__ import annotations

import asyncio
import datetime as dt
import json

from bson import ObjectId
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse

from engine import config, store
from engine.loop import RunLoop

app = FastAPI(title=config.APP_NAME)
app.add_middleware(CORSMiddleware, allow_origins=[o.strip() for o in config.WEB_ORIGIN.split(",")],
                   allow_methods=["GET", "POST"], allow_headers=["*"])

ACTIVE: dict = {"loop": None, "task": None}
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
                                "delta": last.get("delta"), "error": last.get("error")},
        })
    msgs = list(d.messages.find({"run_id": rid}).sort("ts", -1).limit(50))[::-1]
    loop = ACTIVE["loop"]
    return clean({
        "app_name": config.APP_NAME,
        "run": {**run, "paused": bool(loop and loop.run_id == rid and not loop.resume_evt.is_set())},
        "round": latest and {k: latest.get(k) for k in ("n", "best_practice_gap", "check_gap", "best_ever_id",
                                                         "best_ever_practice_gap", "best_ever_check_gap",
                                                         "leaderboard", "tests_run", "finished_at")},
        "curve": [{"n": r["n"], "practice": r.get("best_practice_gap"), "check": r.get("check_gap"),
                   "best_ever": r.get("best_ever_practice_gap"), "best_ever_check": r.get("best_ever_check_gap")}
                  for r in rounds],
        "baselines": run.get("baselines", {}), "solver": run.get("solver", {}),
        "showcase": latest and latest.get("showcase"),
        "playbook": (latest or {}).get("playbook", []),
        "bots": bots,
        "usage": store.usage_totals(rid),
        "tests_run": (latest or {}).get("tests_run", 0),
        "messages": msgs,
        "people": people,
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
    return clean(await aw(store.lineage, sid))


# ---------- live stream: one poller fans out to every client ----------

class Hub:
    def __init__(self):
        self.subs: set[asyncio.Queue] = set()
        self.task: asyncio.Task | None = None
        self.last_id: ObjectId | None = None

    async def run(self):
        last = await aw(lambda: store.db().events.find_one(sort=[("_id", -1)]))
        self.last_id = last["_id"] if last else ObjectId.from_datetime(store.now())
        while True:
            try:
                new = await aw(lambda: list(store.db().events.find({"_id": {"$gt": self.last_id}}).sort("_id", 1).limit(500)))
            except Exception as exc:  # noqa: BLE001
                print(f"[hub] poll failed: {exc}")
                await asyncio.sleep(3)
                continue
            for e in new:
                self.last_id = e["_id"]
                payload = json.dumps(clean(e))
                for q in list(self.subs):
                    if q.qsize() < 1000:
                        q.put_nowait(payload)
            await asyncio.sleep(1.0)

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
    return {
        "people": people, "projects": projects,
        "fcfs": out["fcfs"], "bot": out["bot"],
        "hours_saved": f - b, "pct_shorter": round(100 * (f - b) / f, 1) if f else 0.0,
        "kept_simple": kept_simple,
        "strategy": {"id": best["id"], "bot": best["bot"]},
    }


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
