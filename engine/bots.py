"""Prompts for chief of staff, worker, scribe. Job-agnostic: the job only supplies its brief."""
from __future__ import annotations

import json


def _playbook(lines: list[str]) -> str:
    return "\n".join(lines) if lines else "(empty: nothing learned yet)"


# ---------- chief of staff ----------

CHIEF_SYSTEM = """You are the chief of staff of a team of AI engineers improving a program by small, measured steps.
Each round you give every bot ONE small, specific change to try on a parent strategy. Lower gap is better.

Rules:
- One small, specific change per bot (a single idea that can be coded in one edit). Be concrete: name the technique and where it goes.
- No two bots get the same change.
- Parents must come from the top 3 strategies on the leaderboard (use their exact ids).
- At least one bot tries something NOT yet in the playbook.
- A new hire with an angle should get a change that follows its angle.
- Human messages take priority: if a human asks for something, make at least one assignment do it. A message aimed at a specific bot goes to that bot.

Reply with JSON only, no prose:
{"assignments": [{"bot": "<name>", "parent": "<strategy_id>", "change": "<one small, specific change>"}],
 "hire_angle": "<one sentence: what the next new hire should explore>",
 "reply_to_humans": "<one sentence answering the humans, or empty>"}"""


def chief_messages(brief: str, leaderboard: list[dict], playbook: list[str], bots: list[dict],
                   human: list[dict], round_n: int) -> list[dict]:
    def delta(s):
        return "n/a" if s.get("delta") is None else f"{s['delta']:+.2f}"

    lb = "\n".join(
        f"- id={s['id']} bot={s['bot']} gap={s['practice_gap']:.2f}% change_vs_parent={delta(s)}"
        f" note={s.get('note') or ''}"
        for s in leaderboard
    )
    roster = "\n".join(f"- {b['name']}" + (f" (new hire, angle: {b['angle']})" if b.get("angle") else "") for b in bots)
    msgs = "\n".join(f"- {m['name']}" + (f" (to {m['bot']})" if m.get("bot") else "") + f": {m['text']}"
                     for m in human) or "(none)"
    user = f"""Round {round_n}.

THE JOB (summary given to the bots):
{brief[:2500]}

LEADERBOARD (top strategies so far, lower gap is better):
{lb}

PLAYBOOK (lessons so far):
{_playbook(playbook)}

BOTS TO ASSIGN (every one needs exactly one assignment):
{roster}

HUMAN MESSAGES SINCE LAST ROUND:
{msgs}

Return the JSON now."""
    return [{"role": "system", "content": CHIEF_SYSTEM}, {"role": "user", "content": user}]


# ---------- worker ----------

WORKER_SYSTEM = """You are {name}, an engineer on a team improving a program step by step. You are given the job brief,
a parent strategy (a complete Python file) and ONE assigned change. Write the improved file.

Rules:
- Make only the assigned change. Keep everything else working.
- Keep the file self-contained: standard library only, allowed imports only.
- Check time.time() in every loop and stop at 80% of time_limit.
- Never catch an exception and silently return the starting schedule.
- Plan briefly, then write the code. Do not draft the whole file in your reasoning; your token budget is limited
  and a reply without the code block counts as a failure.

Output format: the complete new strategy file in ONE ```python block, then one line starting `NOTE:` saying what
changed in under 20 words. Nothing else."""


def worker_messages(name: str, brief: str, parent_code: str, change: str, playbook: list[str],
                    error: str | None = None, previous: str | None = None) -> list[dict]:
    user = f"""THE JOB:
{brief}

PLAYBOOK (team lessons):
{_playbook(playbook)}

PARENT STRATEGY:
```python
{parent_code}
```

YOUR ASSIGNED CHANGE:
{change}
"""
    if error:
        user += f"""
YOUR PREVIOUS ATTEMPT FAILED with this error:
{error}

Previous attempt:
```python
{(previous or '')[:20000]}
```
Fix it. Return the complete corrected file and the NOTE line.
"""
    return [{"role": "system", "content": WORKER_SYSTEM.format(name=name)}, {"role": "user", "content": user}]


# ---------- scribe ----------

SCRIBE_SYSTEM = """You are the team scribe. You keep the playbook: at most 12 lines, each starting `DO:` or `AVOID:`,
most useful first. Base lessons on measured results only (negative change = better). Merge duplicates, drop stale
lines, keep each line short and specific. Output only the playbook lines."""


def scribe_messages(playbook: list[str], results: list[dict]) -> list[dict]:
    rows = "\n".join(
        f"- {r['bot']}: {r.get('note') or '(no note)'} -> "
        + ("rejected: " + (r.get('error') or '')[:150] if r.get("practice_gap") is None
           else f"gap {r['practice_gap']:.2f}%, change vs parent {r['delta']:+.2f}")
        for r in results
    )
    user = f"""CURRENT PLAYBOOK:
{_playbook(playbook)}

THIS ROUND'S RESULTS:
{rows}

Write the updated playbook now."""
    return [{"role": "system", "content": SCRIBE_SYSTEM}, {"role": "user", "content": user}]


def parse_playbook(text: str) -> list[str]:
    lines = [ln.strip().lstrip("-*0123456789. ").strip() for ln in (text or "").splitlines()]
    return [ln for ln in lines if ln.upper().startswith(("DO:", "AVOID:"))][:12]


def dumps(x) -> str:
    return json.dumps(x, default=str)
