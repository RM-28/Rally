"""Runs ONE strategy on ONE instance in a clean process.

Invoked as `python -I child.py`. Reads {"code", "entrypoint", "args"} as JSON on stdin and
writes {"output", "secs"} or {"error"} as JSON on stdout. Standard library only: under -I
this process cannot import the engine, and the engine never imports strategy code.
"""
import json
import sys
import time
import types


def main():
    perf = time.perf_counter  # held locally so a strategy patching time cannot fake its own clock
    real_stdout = sys.stdout
    req = json.loads(sys.stdin.read())
    sys.stdout = sys.stderr  # strategy prints must not corrupt the result line
    try:
        mod = types.ModuleType("strategy")
        exec(compile(req["code"], "strategy.py", "exec"), mod.__dict__)
        fn = getattr(mod, req["entrypoint"], None)
        if not callable(fn):
            raise ValueError(f"strategy does not define {req['entrypoint']}()")
        t0 = perf()
        out = fn(**req["args"])
        secs = perf() - t0
        if isinstance(out, tuple):
            out = list(out)
        if isinstance(out, list):
            out = [int(x) if isinstance(x, int) and not isinstance(x, bool) else x for x in out]
        result = {"output": out, "secs": round(secs, 4)}
    except BaseException as exc:  # noqa: BLE001
        result = {"error": f"{type(exc).__name__}: {str(exc)[:500]}"}
    try:
        line = json.dumps(result)
    except (TypeError, ValueError) as exc:
        line = json.dumps({"error": f"output not JSON-serialisable: {exc}"})
    real_stdout.write(line + "\n")
    real_stdout.flush()


if __name__ == "__main__":
    main()
