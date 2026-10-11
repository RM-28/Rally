"""Runs enabled routines when their cron expression matches, in studio time (RALLY_TZ)."""
from __future__ import annotations

import asyncio
import datetime as dt

from engine.rally import agents
from engine.rally.db import db, out


def _field(expr: str, value: int, lo: int, hi: int) -> bool:
    for part in expr.split(","):
        step = 1
        if "/" in part:
            part, s = part.split("/", 1)
            step = int(s)
        if part in ("*", ""):
            a, b = lo, hi
        elif "-" in part:
            a, b = (int(x) for x in part.split("-", 1))
        else:
            a = b = int(part)
        if a <= value <= b and (value - a) % step == 0:
            return True
    return False


def matches(cron: str, t: dt.datetime) -> bool:
    """Standard 5-field cron: minute hour day-of-month month day-of-week (0 or 7 = Sunday)."""
    try:
        minute, hour, dom, month, dow = cron.split()
        cron_dow = (t.weekday() + 1) % 7
        dow_ok = _field(dow, cron_dow, 0, 7) or (cron_dow == 0 and _field(dow, 7, 0, 7))
        dom_ok = _field(dom, t.day, 1, 31)
        # cron rule: when both day fields are restricted, either one may match
        day_ok = (dom_ok or dow_ok) if (dom != "*" and dow != "*") else (dom_ok and dow_ok)
        return _field(minute, t.minute, 0, 59) and _field(hour, t.hour, 0, 23) and _field(month, t.month, 1, 12) and day_ok
    except ValueError:
        return False


async def scheduler() -> None:
    fired: set[tuple[str, str]] = set()
    while True:
        try:
            now = agents.local_now()
            key = now.strftime("%Y-%m-%d %H:%M")
            routines = await asyncio.to_thread(lambda: [out(r) for r in db().rally_routines.find({"enabled": True})])
            for r in routines:
                if (r["id"], key) not in fired and matches(r.get("cron", ""), now):
                    fired.add((r["id"], key))
                    asyncio.create_task(agents.run_routine(r))
            fired = {f for f in fired if f[1] == key}
        except Exception as exc:  # noqa: BLE001 - the scheduler must keep going
            print(f"[rally] scheduler: {type(exc).__name__}: {exc}")
        await asyncio.sleep(20)
