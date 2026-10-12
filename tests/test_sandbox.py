"""The strategy sandbox: the static check in core.py and the child process it runs code in."""
import sys

import pytest

from engine.runner.core import check_strategy, run_child

FT06_JOBS = [[[2, 1], [0, 3], [1, 6], [3, 7], [5, 3], [4, 6]],
             [[1, 8], [2, 5], [4, 10], [5, 10], [0, 10], [3, 4]],
             [[2, 5], [3, 4], [5, 8], [0, 9], [1, 1], [4, 7]],
             [[1, 5], [0, 5], [2, 5], [3, 3], [4, 8], [5, 9]],
             [[2, 9], [1, 3], [4, 5], [5, 4], [0, 3], [3, 1]],
             [[1, 3], [3, 3], [5, 9], [0, 10], [4, 4], [2, 1]]]
ARGS = {"jobs": FT06_JOBS, "n_machines": 6, "time_limit": 1.0, "release": None, "downtime": None}

NORMAL = """
import random
import heapq
from collections import defaultdict

def solve(jobs, n_machines, time_limit, release=None, downtime=None):
    rng = random.Random(0)
    order = [j for j in range(len(jobs)) for _ in jobs[j]]
    rng.shuffle(order)
    counts = defaultdict(int)
    heap = []
    for j in order:
        counts[j] += 1
        heapq.heappush(heap, (counts[j], j))
    return [j for _, j in sorted(heap)]
"""

ESCAPES = {
    "private module attribute": "import random\ndef solve(**kw):\n    return random._os.getcwd()\n",
    "getattr with a built string": "import random\ndef solve(**kw):\n    return getattr(random, '_' + 'os').getcwd()\n",
    "getattr via a variable": "import random\nname = ''.join(['_', 'o', 's'])\nf = getattr\ndef solve(**kw):\n    return f(random, name)\n",
    "attrgetter": "import operator, random\ndef solve(**kw):\n    return operator.attrgetter('_' + 'os')(random).getcwd()\n",
    "from-imported attrgetter": "from operator import attrgetter\nimport random\ndef solve(**kw):\n    return attrgetter('_os')(random)\n",
    "setattr": "import random\ndef solve(**kw):\n    setattr(random, 'x', 1)\n",
    "delattr": "import random\ndef solve(**kw):\n    delattr(random, 'seed')\n",
    "type()": "def solve(**kw):\n    return type(0).mro()\n",
    "object": "def solve(**kw):\n    return object.mro()\n",
    "dunder attribute": "def solve(**kw):\n    return ().__class__.__bases__[0].__subclasses__()\n",
    "__builtins__": "def solve(**kw):\n    return __builtins__['ev' + 'al']('1')\n",
    "import os": "import os\ndef solve(**kw):\n    return dict(os.environ)\n",
    "from os import environ": "from os import environ\ndef solve(**kw):\n    return dict(environ)\n",
    "import sys": "import sys\ndef solve(**kw):\n    return sys.modules['os'].environ\n",
    "relative import": "from . import x\ndef solve(**kw):\n    return 1\n",
    "eval": "def solve(**kw):\n    return eval('1')\n",
    "open": "def solve(**kw):\n    return open('.env').read()\n",
}

# PATH is all the parent passes; on Linux, Python sets LC_CTYPE itself when started with no locale (PEP 538)
CHILD_ENV = {"PATH", "LC_CTYPE"}


@pytest.mark.parametrize("name", sorted(ESCAPES))
def test_escape_attempts_are_rejected(name):
    assert check_strategy(ESCAPES[name], "solve") is not None


def test_normal_strategy_passes_check_and_runs():
    assert check_strategy(NORMAL, "solve") is None
    res = run_child(NORMAL, "solve", ARGS, 1.0)
    assert "error" not in res, res
    assert sorted(res["output"]) == sorted(j for j in range(6) for _ in range(6))


def test_shipped_baselines_still_pass_the_check():
    from engine.jobs import get_job
    for name, code in get_job("jobshop").baselines().items():
        assert check_strategy(code, "solve") is None, name


def test_child_environment_has_no_secrets(monkeypatch):
    # bypasses the static check on purpose: even code that reaches os.environ sees only PATH
    monkeypatch.setenv("SANDBOX_TEST_SECRET", "hunter2")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "not-for-strategies")
    code = "import os\ndef solve(**kw):\n    return sorted(os.environ)\n"
    res = run_child(code, "solve", {}, 1.0)
    assert set(res["output"]) <= CHILD_ENV, res


def test_private_module_escape_fails_at_runtime_too():
    # the static check is the main barrier; this shows the child itself has no secrets to find
    code = "import random\ndef solve(**kw):\n    return sorted(random._os.environ)\n"
    res = run_child(code, "solve", {}, 1.0)
    assert set(res["output"]) <= CHILD_ENV, res


def test_missing_entrypoint_is_rejected():
    assert check_strategy("def other(**kw):\n    return []\n", "solve") is not None


@pytest.mark.skipif(not sys.platform.startswith("linux"), reason="rlimits are applied on Linux only")
def test_memory_limit_is_enforced(monkeypatch):
    import engine.runner.core as core
    monkeypatch.setattr(core, "CHILD_MEMORY_MB", 256)
    code = "def solve(**kw):\n    x = bytearray(1024 * 1024 * 1024)\n    return [len(x)]\n"
    res = run_child(code, "solve", {}, 1.0)
    assert "MemoryError" in res.get("error", ""), res


@pytest.mark.skipif(not sys.platform.startswith("linux"), reason="rlimits are applied on Linux only")
def test_cpu_limit_is_enforced():
    # drive child.py directly with a 1s CPU cap, well inside a 20s wall-clock timeout
    import json
    import signal
    import subprocess
    from engine.runner.core import CHILD
    payload = json.dumps({"code": "def solve(**kw):\n    while True:\n        pass\n", "entrypoint": "solve",
                          "args": {}, "limits": {"cpu_s": 1}})
    proc = subprocess.run([sys.executable, "-I", CHILD], input=payload, capture_output=True, text=True,
                          timeout=20, env={"PATH": ""})
    assert proc.returncode in (-signal.SIGXCPU, -signal.SIGKILL), proc
