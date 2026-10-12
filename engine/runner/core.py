"""Shared by local.py and handler.py: static check, run one (strategy, instance), score in the parent."""
from __future__ import annotations

import ast
import json
import os
import subprocess
import sys
from pathlib import Path

from engine.config import ALLOWED_IMPORTS, CHILD_MEMORY_MB, MAX_STRATEGY_BYTES
from engine.jobs import get_job

CHILD = str(Path(__file__).resolve().parent / "child.py")
BANNED_CALLS = {"__import__", "eval", "exec", "compile", "open", "input", "breakpoint", "globals", "vars",
                "getattr", "setattr", "delattr", "type", "object", "__builtins__",
                "attrgetter", "methodcaller"}  # operator.attrgetter("_x") is getattr with a built string
# frames, generators, coroutines, tracebacks and code objects: (x for x in []).gi_frame.f_builtins is __import__
BANNED_ATTRS = {
    "gi_frame", "gi_code", "gi_yieldfrom", "cr_frame", "cr_code", "cr_await", "cr_origin",
    "ag_frame", "ag_code", "ag_await",
    "f_back", "f_builtins", "f_globals", "f_locals", "f_code", "f_trace", "f_generator",
    "tb_frame", "tb_next", "co_code", "co_consts", "co_names",
}


def _attr_error(attr: str) -> str | None:
    if attr.startswith("_"):
        return f"private attribute '{attr}' is not allowed"
    if attr in BANNED_CALLS or attr in BANNED_ATTRS:
        return f"use of '{attr}' is not allowed"
    return None


def check_strategy(code: str, entrypoint: str) -> str | None:
    """Returns an error message, or None if the strategy passes the static check.
    A denylist, so a best effort: the child process is the boundary that has to hold (see run_child)."""
    if len(code.encode()) > MAX_STRATEGY_BYTES:
        return f"file is {len(code.encode())} bytes, limit is {MAX_STRATEGY_BYTES}"
    try:
        tree = ast.parse(code)
    except SyntaxError as exc:
        return f"SyntaxError: {exc}"
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for a in node.names:
                if a.name.split(".")[0] not in ALLOWED_IMPORTS:
                    return f"import of '{a.name}' is not allowed"
        elif isinstance(node, ast.ImportFrom):
            if node.level or (node.module or "").split(".")[0] not in ALLOWED_IMPORTS:
                return f"import from '{node.module}' is not allowed"
            for a in node.names:  # `from operator import attrgetter as g` hides the name behind an alias
                if err := _attr_error(a.name):
                    return err
        elif isinstance(node, ast.Name) and node.id in BANNED_CALLS:
            return f"use of '{node.id}' is not allowed"
        elif isinstance(node, ast.Attribute) and (err := _attr_error(node.attr)):
            return err
        elif isinstance(node, ast.MatchClass):  # `case Hashable(f_builtins=b)` reads an attribute too
            for attr in node.kwd_attrs:
                if err := _attr_error(attr):
                    return err
        elif (isinstance(node, ast.Constant) and isinstance(node.value, str)
              and node.value.startswith("__") and node.value != "__main__"):
            return f"string '{node.value[:30]}' is not allowed"
    if not any(isinstance(n, ast.FunctionDef) and n.name == entrypoint for n in tree.body):
        return f"does not define {entrypoint}() at top level"
    return None


def run_child(code: str, entrypoint: str, args: dict, time_limit: float) -> dict:
    limits = {"mem_mb": CHILD_MEMORY_MB, "cpu_s": int(3 * time_limit) + 5}  # applied by the child on Linux
    payload = json.dumps({"code": code, "entrypoint": entrypoint, "args": args, "limits": limits})
    try:
        # only PATH: the child must not see API keys, AWS credentials or anything else in our env
        proc = subprocess.run([sys.executable, "-I", CHILD], input=payload, capture_output=True,
                              text=True, timeout=3 * time_limit + 5, env={"PATH": os.environ.get("PATH", "")})
    except subprocess.TimeoutExpired:
        return {"error": "timeout"}
    lines = [ln for ln in proc.stdout.splitlines() if ln.strip()]
    if not lines:
        err = proc.stderr.strip().splitlines()[-1:] or [f"exit code {proc.returncode}"]
        return {"error": f"crashed: {err[0][:300]}"}
    try:
        return json.loads(lines[-1])
    except json.JSONDecodeError:
        return {"error": "child wrote invalid JSON"}


def run_one(job_name: str, code: str, instance_id: str, time_limit: float, repeats: int,
            instance: dict | None = None, keep_output: bool = False) -> dict:
    """The runner contract: one strategy on one instance, `repeats` times, each in its own process."""
    job = get_job(job_name)
    instance = instance or job.load(instance_id)
    args = job.call_args(instance, time_limit)
    runs = []
    for _ in range(repeats):
        res = run_child(code, job.entrypoint, args, time_limit)
        runs.append(score_child_result(job, instance, res, time_limit, keep_output))
    return {"instance_id": instance_id, "runs": runs}


def score_child_result(job, instance: dict, res: dict, time_limit: float, keep_output: bool = False) -> dict:
    if "error" in res:
        return {"error": res["error"]}
    if res["secs"] > 2.5 * time_limit:
        return {"error": f"too slow: {res['secs']:.2f}s", "secs": res["secs"]}
    try:
        run = {"score": job.score(instance, res["output"]), "secs": res["secs"]}
    except ValueError as exc:
        return {"error": f"ValueError: {exc}", "secs": res["secs"]}
    if keep_output:  # callers that render the result (e.g. /api/schedule) need the raw output too
        run["output"] = res["output"]
    return run
