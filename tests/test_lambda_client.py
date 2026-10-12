"""Lambda fan-out with a mocked boto3 client: no network, no AWS."""
import io
import json
import random
import threading
import time

import boto3
import pytest
from botocore.exceptions import EndpointConnectionError, ReadTimeoutError

from engine.runner import lambda_client


class FakeLambda:
    """Stands in for boto3.client("lambda"). `script(req, attempt)` returns a response dict or raises."""

    def __init__(self, script):
        self.script = script
        self.calls = []
        self.lock = threading.Lock()

    def invoke(self, FunctionName, Payload):
        req = json.loads(Payload)
        with self.lock:
            self.calls.append(req)
            attempt = sum(1 for c in self.calls if c == req)
        out = self.script(req, attempt)
        if isinstance(out, Exception):
            raise out
        return out


def ok(req, **extra):
    body = {"instance_id": req["instance_id"],
            "runs": [{"score": float(len(req["strategy_code"]) * 100 + int(req["instance_id"][1:])), "secs": 0.1}]}
    return {"StatusCode": 200, "Payload": io.BytesIO(json.dumps(body).encode()), **extra}


@pytest.fixture
def fake(monkeypatch):
    holder = {}

    def install(script):
        holder["client"] = FakeLambda(script)
        return holder["client"]

    monkeypatch.setattr(boto3, "client", lambda *a, **k: holder["client"])
    lambda_client._client.cache_clear()
    yield install
    lambda_client._client.cache_clear()


@pytest.fixture
def no_local_fallback(monkeypatch):
    import engine.runner.local as local
    monkeypatch.setattr(local, "run_batch", lambda *a, **k: pytest.fail("fell back to the local runner"))


def run(strategies, instance_ids):
    return lambda_client.run_batch("jobshop", strategies, instance_ids, 1.0, 1)


def test_retries_once_on_transport_error(fake, no_local_fallback):
    client = fake(lambda req, attempt: EndpointConnectionError(endpoint_url="x") if attempt == 1 else ok(req))
    out = run({"a": "x"}, ["i1"])
    assert len(client.calls) == 2
    assert "score" in out["a"]["i1"]["runs"][0]


def test_gives_up_after_one_retry(fake, monkeypatch):
    import engine.runner.local as local
    monkeypatch.setattr(local, "run_batch", lambda *a, **k: {"fell": "back"})
    client = fake(lambda req, attempt: EndpointConnectionError(endpoint_url="x"))
    assert run({"a": "x"}, ["i1"]) == {"fell": "back"}  # 1 of 1 failed in transport
    assert len(client.calls) == 2


def test_never_retries_a_strategy_error(fake, no_local_fallback):
    def script(req, attempt):
        body = {"instance_id": req["instance_id"], "runs": [{"error": "ValueError: wrong length"}]}
        return {"StatusCode": 200, "Payload": io.BytesIO(json.dumps(body).encode())}
    client = fake(script)
    out = run({"a": "x"}, ["i1"])
    assert len(client.calls) == 1
    assert out["a"]["i1"]["runs"] == [{"error": "ValueError: wrong length"}]


def test_never_retries_a_function_error_or_lambda_timeout(fake, no_local_fallback):
    client = fake(lambda req, attempt: {
        "StatusCode": 200, "FunctionError": "Unhandled",
        "Payload": io.BytesIO(b'{"errorMessage": "Task timed out after 60.00 seconds"}')})
    out = run({"a": "x"}, ["i1"])
    assert len(client.calls) == 1
    assert "timed out" in out["a"]["i1"]["runs"][0]["error"]


def test_never_retries_a_read_timeout(fake, no_local_fallback):
    client = fake(lambda req, attempt: ReadTimeoutError(endpoint_url="x"))
    out = run({"a": "x"}, ["i1"])
    assert len(client.calls) == 1
    assert out["a"]["i1"]["runs"][0]["error"].startswith("timeout")


def test_results_land_under_the_right_strategy_and_instance(fake, no_local_fallback):
    def script(req, attempt):
        time.sleep(random.random() / 50)  # finish out of order
        return ok(req)
    fake(script)
    strategies = {"s1": "x", "s2": "xx", "s3": "xxx"}
    ids = [f"i{n}" for n in range(1, 9)]
    out = run(strategies, ids)
    assert list(out) == list(strategies)
    for k, code in strategies.items():
        assert list(out[k]) == ids
        for iid in ids:
            assert out[k][iid]["instance_id"] == iid
            assert out[k][iid]["runs"][0]["score"] == len(code) * 100 + int(iid[1:])


def test_falls_back_to_local_when_most_fail_in_transport(fake, monkeypatch, capsys):
    import engine.runner.local as local
    seen = {}

    def local_batch(*args):
        seen["args"] = args
        return {"from": "local"}
    monkeypatch.setattr(local, "run_batch", local_batch)
    fake(lambda req, attempt: ok(req) if req["instance_id"] == "i1" else EndpointConnectionError(endpoint_url="x"))
    out = run({"a": "x"}, ["i1", "i2", "i3"])  # 2 of 3 fail in transport
    assert out == {"from": "local"}
    assert seen["args"][:5] == ("jobshop", {"a": "x"}, ["i1", "i2", "i3"], 1.0, 1)
    assert "running the batch locally" in capsys.readouterr().out


def test_no_fallback_when_only_a_minority_fail(fake, no_local_fallback):
    fake(lambda req, attempt: ok(req) if req["instance_id"] != "i3" else EndpointConnectionError(endpoint_url="x"))
    out = run({"a": "x"}, ["i1", "i2", "i3"])
    assert out["a"]["i3"]["runs"][0]["error"].startswith("transport")
    assert "score" in out["a"]["i1"]["runs"][0]


def test_inline_instance_and_keep_output_are_sent(fake, no_local_fallback):
    client = fake(lambda req, attempt: ok(req))
    inst = {"id": "team", "jobs": [[[0, 1]]], "n_machines": 1}
    lambda_client.run_batch("jobshop", {"a": "x"}, ["team"], 1.0, 1, instances={"team": inst}, keep_output=True)
    assert client.calls[0]["instance"] == inst
    assert client.calls[0]["keep_output"] is True
