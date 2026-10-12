"""ALLOW_LOCAL_RUNNER=0 keeps strategy code off the machine: no local runs, no local fallback, showcase via run_batch."""
import asyncio

import pytest

from engine import config
from engine.runner import run_batch


@pytest.fixture
def local_disabled(monkeypatch):
    monkeypatch.setattr(config, "ALLOW_LOCAL_RUNNER", False)


def test_local_runner_refuses_when_disabled(local_disabled):
    with pytest.raises(RuntimeError, match="ALLOW_LOCAL_RUNNER=0"):
        run_batch("jobshop", {"a": "def solve(**kw):\n    return []\n"}, ["ft06"], 1.0, 1, runner="local")


def test_lambda_does_not_fall_back_to_local_when_disabled(local_disabled, monkeypatch, capsys):
    from botocore.exceptions import EndpointConnectionError
    from engine.runner import lambda_client

    def boom(*a, **k):
        raise EndpointConnectionError(endpoint_url="x")
    monkeypatch.setattr(lambda_client, "_client", lambda: type("C", (), {"invoke": staticmethod(boom)})())
    out = lambda_client.run_batch("jobshop", {"a": "x"}, ["i1", "i2"], 1.0, 1)
    assert all(r["runs"][0]["error"].startswith("transport") for r in out["a"].values())
    assert "not falling back" in capsys.readouterr().out


def test_showcase_goes_through_run_batch_on_the_configured_runner(monkeypatch):
    import engine.loop as loop_mod
    calls = []

    def fake_run_batch(job_name, strategies, ids, time_limit, repeats, runner, instances=None, keep_output=False):
        calls.append({"runner": runner, "ids": ids, "instances": instances, "keep_output": keep_output})
        return {k: {ids[0]: {"runs": [{"score": 3.0, "secs": 0.0, "output": [0, 0]}]}} for k in strategies}
    monkeypatch.setattr(loop_mod, "run_batch", fake_run_batch)

    class Job:
        def load(self, iid):
            return {"id": iid, "jobs": [[[0, 1], [0, 2]]], "n_machines": 1}

        def showcase(self, inst, output):
            return {"instance_id": inst["id"], "output": output}

    rl = loop_mod.RunLoop.__new__(loop_mod.RunLoop)
    rl.job, rl.job_name, rl.runner, rl.time_limit = Job(), "jobshop", "lambda", 1.0
    rl.showcase_id, rl.showcase, rl.showcase_events = "p1", None, None
    rl.log = lambda msg: None
    out = asyncio.run(rl.make_showcase("def solve(**kw):\n    return [0, 0]\n"))
    assert out == {"instance_id": "p1", "output": [0, 0]}
    assert calls == [{"runner": "lambda", "ids": ["p1"], "keep_output": True,
                      "instances": {"p1": {"id": "p1", "jobs": [[[0, 1], [0, 2]]], "n_machines": 1}}}]
