"""Fan-out to Lambda: one invocation per (strategy, instance)."""
from __future__ import annotations

import json
from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache

from engine import config


@lru_cache(maxsize=1)
def _client():
    import boto3
    from botocore.config import Config
    return boto3.client("lambda", region_name=config.AWS_REGION,
                        config=Config(read_timeout=90, max_pool_connections=64, retries={"max_attempts": 0}))


def _invoke(req: dict) -> dict:
    last = None
    for _ in range(2):  # retry once on a transport error, never on a strategy error
        try:
            resp = _client().invoke(FunctionName=config.LAMBDA_FUNCTION_NAME, Payload=json.dumps(req).encode())
            body = json.loads(resp["Payload"].read())
            if resp.get("FunctionError"):
                last = body.get("errorMessage", "lambda function error")
                continue
            return body
        except Exception as exc:  # noqa: BLE001
            last = f"{type(exc).__name__}: {exc}"
    return {"instance_id": req["instance_id"], "runs": [{"error": f"transport: {last}"}] * req["repeats"]}


def run_batch(job_name: str, strategies: dict[str, str], instance_ids: list[str],
              time_limit: float, repeats: int) -> dict[str, dict[str, dict]]:
    reqs = [(k, {"job": job_name, "strategy_code": code, "instance_id": iid,
                 "time_limit": time_limit, "repeats": repeats})
            for k, code in strategies.items() for iid in instance_ids]
    out: dict[str, dict[str, dict]] = {k: {} for k in strategies}
    with ThreadPoolExecutor(max_workers=64) as pool:
        for (k, req), res in zip(reqs, pool.map(lambda kr: _invoke(kr[1]), reqs)):
            out[k][req["instance_id"]] = res
    return out
