"""The round loop. Job-agnostic: everything job-specific goes through the Job interface.

    python -m engine.loop --rounds 5 --bots 4
"""
from __future__ import annotations

import argparse
import asyncio
import json
import subprocess
import time
import uuid
from statistics import mean

from engine import bots as B
from engine import config, store
from engine.config import DATA, ROOT, ROSTER
from engine.jobs import get_job
from engine.jobs.base import gap as gap_of
from engine.model import call_model, extract_code, extract_json, extract_note
from engine.runner import run_batch, summarize
from engine.runner.core import check_strategy

FALLBACK_CHANGE = "Make one small improvement of your choice that is not yet in the playbook; say what in the NOTE."


async def aw(fn, *a, **k):
    return await asyncio.to_thread(fn, *a, **k)


def git_commit_of(path: str) -> str | None:
    try:
        out = subprocess.check_output(["git", "log", "-1", "--format=%H", "--", path], cwd=ROOT, text=True).strip()
        return out or None
    except Exception:  # noqa: BLE001
        return None


def rank_key(s: dict):
    return (s["practice_gap"], s.get("practice_spread") or 0.0)


class RunLoop:
    def __init__(self, job_name: str = "jobshop", n_bots: int = config.N_BOTS, rounds: int = 5,
                 runner: str | None = None, time_limit: float | None = None, repeats: int | None = None,
                 tag: str | None = None, customer_id: str | None = None,
                 budget_s: float | None = None):
        self.job_name = job_name
        self.customer_id = customer_id  # billed customer; None for admin/internal runs
        self.budget_s = budget_s        # optional wall-clock budget: no new round starts after it
        self.job = get_job(job_name)
        self.n_bots = n_bots
        self.rounds = rounds
        self.runner = runner
        self.time_limit = time_limit or config.TIME_LIMIT_S
        self.repeats = repeats or config.REPEATS
        self.tag = tag
        self.run_id = f"run-{uuid.uuid4().hex[:8]}"
        self.sets = self.job.sets()
        self.showcase_id = self.sets["practice"][0]
        self.strategies: dict[str, dict] = {}   # id -> doc (without practice_runs)
        self.bots: list[dict] = []              # active bots: {name, angle, hired_round}
        self.roster_i = 0
        self.playbook: list[str] = []
        self.best_id: str | None = None
        self.hire_angle = ""
        self.last_msg_ts = None
        self.tests_run = 0
        self.showcase = None
        self.showcase_events = None   # same instance with a downtime window and a late job
        self.round_n = 0
        self.resume_evt = asyncio.Event()
        self.resume_evt.set()
        self.stop_requested = False

    # ---------- helpers ----------

    def log(self, msg: str):
        print(f"[{self.run_id} r{self.round_n}] {msg}", flush=True)

    def emit(self, type_, bot=None, **data):
        return aw(store.emit, type_, bot, data, self.run_id)

    def leaderboard(self, k=5) -> list[dict]:
        ok = [s for s in self.strategies.values() if s["status"] == "ok"]
        return sorted(ok, key=rank_key)[:k]

    def _lb_row(self, s):
        return {"id": s["_id"], "bot": s["bot"], "note": s.get("note"), "practice_gap": s["practice_gap"],
                "delta": s.get("delta"), "round": s["round"]}

    def next_name(self) -> str:
        base = ROSTER[self.roster_i % len(ROSTER)]
        lap = self.roster_i // len(ROSTER)
        self.roster_i += 1
        return base if lap == 0 else f"{base}{lap + 1}"

    async def hire(self, angle: str = ""):
        name = self.next_name()
        bot = {"name": name, "angle": angle, "hired_round": self.round_n}
        self.bots.append(bot)
        await aw(store.db().bots.insert_one, {"_id": f"{self.run_id}:{name}", "run_id": self.run_id, "name": name,
                                              "status": "active", "hired_round": self.round_n,
                                              "fired_round": None, "angle": angle})
        await self.emit("hired", name, angle=angle, round=self.round_n)
        return bot

    async def fire(self, name: str, reason: str):
        self.bots = [b for b in self.bots if b["name"] != name]
        await aw(store.db().bots.update_one, {"_id": f"{self.run_id}:{name}"},
                 {"$set": {"status": "fired", "fired_round": self.round_n}})
        await self.emit("fired", name, reason=reason, round=self.round_n)

    async def score_practice(self, codes: dict[str, str]) -> dict[str, dict]:
        res = await aw(run_batch, self.job_name, codes, self.sets["practice"], self.time_limit, self.repeats, self.runner)
        self.tests_run += len(codes) * len(self.sets["practice"]) * self.repeats
        return res

    async def score_check(self, code: str) -> float | None:
        res = await aw(run_batch, self.job_name, {"x": code}, self.sets["check"], self.time_limit, self.repeats, self.runner)
        self.tests_run += len(self.sets["check"]) * self.repeats
        s = summarize(self.job, res["x"])
        return s["gap"]

    async def make_showcase(self, code: str, events: bool = False):
        inst = self.job.load(self.showcase_id)
        fallback = self.showcase
        if events:
            if not hasattr(self.job, "surprise"):
                return None
            inst, fallback = self.job.surprise(inst), self.showcase_events
        iid = inst["id"]  # through run_batch, so RUNNER=lambda keeps strategy code off this machine
        res = await aw(run_batch, self.job_name, {"s": code}, [iid], self.time_limit, 1, self.runner,
                       instances={iid: inst}, keep_output=True)
        run = res["s"][iid]["runs"][0]
        if "error" in run or "output" not in run:
            self.log(f"showcase failed: {run.get('error', 'no output returned')}")
            return fallback
        try:
            return self.job.showcase(inst, run["output"])
        except ValueError as exc:
            self.log(f"showcase invalid: {exc}")
            return fallback

    async def make_showcases(self, code: str):
        self.showcase, self.showcase_events = await asyncio.gather(
            self.make_showcase(code), self.make_showcase(code, events=True))

    def solver_line(self) -> dict:
        """CP-SAT with the same per-instance time as a bot, on practice and check. Cached on disk."""
        path = DATA / f"solver_line_{self.job_name}_{self.time_limit:g}s.json"
        if path.exists():
            return json.loads(path.read_text())
        try:
            from engine.scripts.solver_ref import solve_cpsat
        except Exception:  # noqa: BLE001
            return {}
        out = {"secs": self.time_limit, "workers": 8}
        for set_name in ("practice", "check"):
            gaps = []
            for iid in self.sets[set_name]:
                try:
                    ms, _, _ = solve_cpsat(self.job.load(iid), self.time_limit, workers=8)
                except RuntimeError:  # no solution inside the time budget: no line rather than a wrong one
                    self.log(f"solver line: CP-SAT found nothing on {iid} in {self.time_limit}s")
                    return {}
                gaps.append(gap_of(ms, self.job.reference(iid)))
            out[set_name] = round(mean(gaps), 3)
        path.write_text(json.dumps(out, indent=2))
        return out

    # ---------- lifecycle ----------

    async def run(self):
        store.current_run_id = self.run_id
        await aw(store.ensure_indexes)
        await aw(store.db().runs.insert_one, {
            "_id": self.run_id, "job": self.job_name, "n_bots": self.n_bots, "rounds_planned": self.rounds,
            "started_at": store.now(), "status": "running", "tag": self.tag, "customer_id": self.customer_id,
            "splits_commit": git_commit_of("data/splits.json"),
            "time_limit": self.time_limit, "repeats": self.repeats, "runner": self.runner or config.RUNNER,
        })
        self.log(f"started: {self.n_bots} bots, {self.rounds} rounds, runner={self.runner or config.RUNNER}")
        try:
            await self.round_zero()
            t_start = time.monotonic()
            for n in range(1, self.rounds + 1):
                await self.resume_evt.wait()
                if self.stop_requested:
                    break
                if self.budget_s and time.monotonic() - t_start >= self.budget_s:
                    self.log(f"time budget of {self.budget_s:.0f}s used, stopping before round {n}")
                    break
                self.round_n = n
                await self.round(n)
            status = "stopped" if self.stop_requested else "finished"
        except asyncio.CancelledError:
            status = "stopped"
            raise
        except Exception as exc:
            status = "failed"
            self.log(f"FAILED: {type(exc).__name__}: {exc}")
            await self.emit("round_finished", n=self.round_n, error=f"{type(exc).__name__}: {exc}")
            raise
        finally:
            await aw(store.db().runs.update_one, {"_id": self.run_id},
                     {"$set": {"status": status, "finished_at": store.now(), "best_strategy_id": self.best_id}})
            self.log(f"{status}. best: {self.best_id} gap {self.strategies[self.best_id]['practice_gap'] if self.best_id else None}")

    async def round_zero(self):
        """Baselines only, no model calls."""
        started = store.now()
        self.round_n = 0
        await self.emit("round_started", n=0)
        bases = self.job.baselines()
        res = await self.score_practice(bases)
        docs = []
        for name, code in bases.items():
            s = summarize(self.job, res[name])
            sid = f"{self.run_id}-r0-{name}"
            doc = {"_id": sid, "run_id": self.run_id, "round": 0, "bot": f"baseline:{name}", "parent_id": None,
                   "code": code, "note": f"baseline: {name}", "change": None,
                   "status": "ok" if s["ok"] else "rejected", "practice_gap": s["gap"],
                   "practice_spread": s["spread"], "per_instance": s["per_instance"], "delta": None,
                   "check_gap": await self.score_check(code), "error": "; ".join(s["errors"]) or None}
            docs.append(doc)
            self.strategies[sid] = doc
            await self.emit("scored", f"baseline:{name}", strategy_id=sid, practice_gap=doc["practice_gap"],
                            check_gap=doc["check_gap"])
        for d, (name, _) in zip(docs, bases.items()):
            d["practice_runs"] = res[name]
        baselines = {d["note"].split(": ", 1)[1]: {"practice": d["practice_gap"], "check": d["check_gap"]} for d in docs}
        solver = await aw(self.solver_line)
        fcfs_show, fcfs_events = (None, None)
        if "fcfs" in bases:
            fcfs_show, fcfs_events = await asyncio.gather(self.make_showcase(bases["fcfs"]),
                                                          self.make_showcase(bases["fcfs"], events=True))
        await aw(store.db().runs.update_one, {"_id": self.run_id}, {"$set": {
            "baselines": baselines, "solver": solver,
            "showcase_fcfs": fcfs_show and fcfs_show["makespan"],
            "showcase_events_fcfs": fcfs_events and fcfs_events["makespan"],
            # full plans so the board can switch the calendar to first come, first served
            "showcase_fcfs_plan": fcfs_show, "showcase_events_fcfs_plan": fcfs_events}})

        best = self.leaderboard(1)[0]
        self.best_id = best["_id"]
        await self.make_showcases(best["code"])
        await aw(store.db().strategies.insert_many, docs)
        await self.write_round(0, best, best["check_gap"], started, [])
        for _ in range(self.n_bots):
            await self.hire()
        self.log(f"round 0: baselines {baselines}, solver {solver}")

    async def round(self, n: int):
        started = store.now()
        await self.emit("round_started", n=n)

        # 1. chief of staff assigns changes
        human = await aw(lambda: list(store.db().messages.find(
            {"run_id": self.run_id, **({"ts": {"$gt": self.last_msg_ts}} if self.last_msg_ts else {}),
             "name": {"$ne": "Chief of staff"}}).sort("ts", 1)))
        if human:
            self.last_msg_ts = human[-1]["ts"]
        assignments = await self.chief(n, human)

        # 2-3. workers propose in parallel, broken proposals rejected (one retry)
        proposals = await asyncio.gather(*(self.propose(n, a) for a in assignments))

        # 4. score survivors on practice
        live = [p for p in proposals if p["status"] == "ok"]
        if live:
            res = await self.score_practice({p["_id"]: p["code"] for p in live})
            for p in live:
                s = summarize(self.job, res[p["_id"]])
                p["practice_runs"] = res[p["_id"]]
                if s["ok"]:
                    parent = self.strategies[p["parent_id"]]
                    p.update(practice_gap=s["gap"], practice_spread=s["spread"], per_instance=s["per_instance"],
                             delta=round(s["gap"] - parent["practice_gap"], 3))
                    await self.emit("scored", p["bot"], strategy_id=p["_id"], practice_gap=s["gap"],
                                    delta=p["delta"], spread=s["spread"])
                else:
                    p.update(status="rejected", error="practice: " + "; ".join(s["errors"]))
                    await self.emit("rejected", p["bot"], strategy_id=p["_id"], error=p["error"], final=True)
        for p in proposals:
            self.strategies[p["_id"]] = {k: v for k, v in p.items() if k != "practice_runs"}

        # 5-6. round best on check (stored, never shown to bots or used for ranking); rank
        scored = sorted((p for p in proposals if p["status"] == "ok"), key=rank_key)
        round_best = scored[0] if scored else None
        check_gap = None
        if round_best:
            check_gap = await self.score_check(round_best["code"])
            round_best["check_gap"] = check_gap
            self.strategies[round_best["_id"]]["check_gap"] = check_gap
        prev_best = self.best_id
        self.best_id = self.leaderboard(1)[0]["_id"]

        # 7. fire last-ranked bot unless it holds the best-ever strategy, hire next with the chief's angle
        best_bot = self.strategies[self.best_id]["bot"]
        ranked = [p["bot"] for p in scored] + [p["bot"] for p in proposals if p["status"] != "ok"]
        victim = next((b for b in reversed(ranked) if b != best_bot), None)
        if victim and len(ranked) > 1 and n < self.rounds:   # nobody is fired or hired after the last round
            await self.fire(victim, "ranked last this round")
            await self.hire(self.hire_angle)

        # 8. scribe updates the playbook
        await self.scribe(n, proposals)

        # 9. showcase of the best-ever strategy (redrawn when it improves)
        if self.best_id != prev_best:
            await self.make_showcases(self.strategies[self.best_id]["code"])

        # 10. write strategies + round doc
        await aw(store.db().strategies.insert_many, proposals)
        await self.write_round(n, round_best, check_gap, started, scored)
        best = self.strategies[self.best_id]
        self.log(f"round {n}: round best {round_best['practice_gap'] if round_best else None} "
                 f"check {check_gap} | best-ever {best['practice_gap']} ({best['bot']}) | "
                 f"{len(scored)}/{len(proposals)} scored")

    async def write_round(self, n, round_best, check_gap, started, scored):
        best = self.strategies[self.best_id]
        doc = {
            "_id": f"{self.run_id}-r{n}", "run_id": self.run_id, "n": n,
            "best_strategy_id": round_best["_id"] if round_best else None,
            "best_practice_gap": round_best["practice_gap"] if round_best else None,
            "check_gap": check_gap,
            "best_ever_id": best["_id"], "best_ever_practice_gap": best["practice_gap"],
            "best_ever_check_gap": best.get("check_gap"),
            "leaderboard": [self._lb_row(s) for s in self.leaderboard()],
            "showcase": self.showcase, "showcase_events": self.showcase_events, "playbook": self.playbook, "tests_run": self.tests_run,
            "bots": [b["name"] for b in self.bots],
            "started_at": started, "finished_at": store.now(),
        }
        await aw(store.db().rounds.insert_one, doc)
        await self.emit("round_finished", n=n, best_practice_gap=doc["best_practice_gap"], check_gap=check_gap,
                        best_ever_practice_gap=doc["best_ever_practice_gap"], tests_run=self.tests_run,
                        scored=len(scored))

    # ---------- roles ----------

    async def chief(self, n: int, human: list[dict]) -> list[dict]:
        top = self.leaderboard(5)
        top3 = {s["_id"] for s in top[:3]}
        reply = {}
        try:
            text = await call_model(
                B.chief_messages(self.job.brief(), [self._lb_row(s) | {"id": s["_id"]} for s in top], self.playbook,
                                 self.bots, [{"name": m["name"], "text": m["text"], "bot": m.get("bot")} for m in human], n),
                role="chief", max_tokens=8000, temperature=0.7)
            reply = extract_json(text)
        except Exception as exc:  # noqa: BLE001
            self.log(f"chief failed, using fallback: {exc}")
        by_bot = {a.get("bot"): a for a in reply.get("assignments", []) if isinstance(a, dict)}
        out, top_ids = [], [s["_id"] for s in top[:3]]
        for i, b in enumerate(self.bots):
            a = by_bot.get(b["name"], {})
            parent = a.get("parent") if a.get("parent") in top3 else top_ids[i % len(top_ids)]
            change = (a.get("change") or "").strip() or (
                f"Follow your angle: {b['angle']}" if b.get("angle") else FALLBACK_CHANGE)
            msg = self.steering_message(human, b["name"], a.get("from_human"))
            out.append({"bot": b["name"], "parent": parent, "change": change[:500], "human_message": msg})
            await self.emit("assignment", b["name"], parent=parent, change=change[:500], human_message=msg)
        self.hire_angle = (reply.get("hire_angle") or "").strip()[:300]
        r = (reply.get("reply_to_humans") or "").strip()
        if r:
            msg = {"run_id": self.run_id, "ts": store.now(), "name": "Chief of staff", "text": r[:500], "bot": None}
            await aw(store.db().messages.insert_one, msg)
            await self.emit("human_message", None, name="Chief of staff", text=r[:500])
        return out

    @staticmethod
    def steering_message(human: list[dict], bot: str, from_human) -> dict | None:
        """The human message an assignment carries out: the one the chief named, else one aimed at this bot."""
        named = str(from_human or "").strip().lower()
        hit = next((m for m in reversed(human) if named and m["name"].strip().lower() == named), None)
        hit = hit or next((m for m in reversed(human) if m.get("bot") == bot), None)
        return hit and {"name": hit["name"], "text": hit["text"][:500]}

    async def propose(self, n: int, a: dict) -> dict:
        bot, parent = a["bot"], self.strategies[a["parent"]]
        sid = f"{self.run_id}-r{n}-{bot}"
        doc = {"_id": sid, "run_id": self.run_id, "round": n, "bot": bot, "parent_id": parent["_id"],
               "change": a["change"], "code": None, "note": "", "status": "rejected", "practice_gap": None,
               "practice_spread": None, "per_instance": None, "delta": None, "check_gap": None, "error": None,
               "human_message": a.get("human_message")}
        error, code = None, None
        for attempt in range(2):
            try:
                text = await call_model(B.worker_messages(bot, self.job.brief(), parent["code"], a["change"],
                                                          self.playbook, error, code),
                                        role="worker", max_tokens=32000)
            except Exception as exc:  # noqa: BLE001
                error = f"model call failed: {type(exc).__name__}: {exc}"
                doc["error"] = error
                await self.emit("rejected", bot, strategy_id=sid, error=error[:300], final=attempt == 1)
                continue
            new = extract_code(text)
            doc["note"] = extract_note(text)
            if new is None:
                error = "no ```python fenced block in the reply"
            else:
                code = new
                error = check_strategy(code, self.job.entrypoint)
                if not error:
                    await self.emit("proposal", bot, strategy_id=sid, note=doc["note"], attempt=attempt)
                    q = await aw(run_batch, self.job_name, {"q": code}, self.sets["quick"], self.time_limit, 1, self.runner)
                    self.tests_run += len(self.sets["quick"])
                    s = summarize(self.job, q["q"])
                    error = None if s["ok"] else "failed the quick check: " + "; ".join(s["errors"])
            doc["code"] = code
            if not error:
                doc.update(status="ok", error=None)
                return doc
            doc["error"] = error
            await self.emit("rejected", bot, strategy_id=sid, error=error[:300], final=attempt == 1)
        return doc

    async def scribe(self, n: int, proposals: list[dict]):
        results = [{"bot": p["bot"], "note": p.get("note") or p.get("change"), "practice_gap": p.get("practice_gap"),
                    "delta": p.get("delta"), "error": p.get("error")} for p in proposals]
        try:
            text = await call_model(B.scribe_messages(self.playbook, results), role="scribe",
                                    max_tokens=6000, temperature=0.3)
            lines = B.parse_playbook(text)
            if lines:
                self.playbook = lines
        except Exception as exc:  # noqa: BLE001
            self.log(f"scribe failed, keeping playbook: {exc}")
        await aw(store.db().lessons.insert_one, {"run_id": self.run_id, "round": n, "lines": self.playbook})
        await self.emit("lesson", None, lines=self.playbook, round=n)


async def main_async(args):
    loop = RunLoop(args.job, args.bots, args.rounds, runner=args.runner, tag=args.tag)
    t0 = time.time()
    await loop.run()
    print(f"done in {time.time() - t0:.0f}s, run id {loop.run_id}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--job", default="jobshop")
    ap.add_argument("--bots", type=int, default=config.N_BOTS)
    ap.add_argument("--rounds", type=int, default=5)
    ap.add_argument("--runner", default=None)
    ap.add_argument("--tag", default=None)
    asyncio.run(main_async(ap.parse_args()))


if __name__ == "__main__":
    main()
