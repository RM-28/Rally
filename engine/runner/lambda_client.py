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


def _failed(req: dict, error: str) -> dict:
    return {"instance_id": req["instance_id"], "runs": [{"error": error}] * req["repeats"]}


def _invoke(req: dict) -> tuple[dict, bool]:
    """Returns (response, transport_failed). Retries once on a transport error only: a timed-out
    invocation or a function/strategy error would just fail (or time out) again."""
    from botocore.exceptions import ConnectionError as BotoConnectionError, HTTPClientError, ReadTimeoutError
    last = None
    for _ in range(2):
        try:
            resp = _client().invoke(FunctionName=config.LAMBDA_FUNCTION_NAME, Payload=json.dumps(req).encode())
            body = json.loads(resp["Payload"].read())
        except ReadTimeoutError as exc:  # the call went out and the function ran too long
            return _failed(req, f"timeout: {exc}"), False
        except (BotoConnectionError, HTTPClientError) as exc:
            last = f"{type(exc).__name__}: {exc}"
            continue
        except Exception as exc:  # noqa: BLE001
            return _failed(req, f"lambda: {type(exc).__name__}: {exc}"), False
        if resp.get("FunctionError"):  # includes Lambda's own "Task timed out"
            return _failed(req, f"lambda: {body.get('errorMessage', 'function error')}"), False
        return body, False
    return _failed(req, f"transport: {last}"), True


def run_batch(job_name: str, strategies: dict[str, str], instance_ids: list[str],
              time_limit: float, repeats: int) -> dict[str, dict[str, dict]]:
    reqs = [(k, {"job": job_name, "strategy_code": code, "instance_id": iid,
                 "time_limit": time_limit, "repeats": repeats})
            for k, code in strategies.items() for iid in instance_ids]
    out: dict[str, dict[str, dict]] = {k: {} for k in strategies}
    with ThreadPoolExecutor(max_workers=64) as pool:
        for (k, req), (res, _) in zip(reqs, pool.map(lambda kr: _invoke(kr[1]), reqs)):
            out[k][req["instance_id"]] = res
    return out
