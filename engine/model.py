"""call_model(): the only path to any model."""
from __future__ import annotations

import asyncio
import re
import time
from collections import deque

from engine import config

MAX_RPM = 50
MAX_IN_FLIGHT = 8
MAX_RETRIES = 3
STALL_TIMEOUT_S = 60     # no chunk for this long: abort and retry
TOTAL_TIMEOUT_S = 360    # whole streamed reply (32k tokens at ~200 tok/s fits)

_client = None
_sem: asyncio.Semaphore | None = None
_stamps: deque[float] = deque()
_rate_lock: asyncio.Lock | None = None


def _get_client():
    global _client
    if _client is None:
        from openai import AsyncOpenAI
        if not config.LUMINAL_BASE_URL or not config.LUMINAL_API_KEY:
            raise RuntimeError("LUMINAL_BASE_URL and LUMINAL_API_KEY must be set")
        _client = AsyncOpenAI(base_url=config.LUMINAL_BASE_URL, api_key=config.LUMINAL_API_KEY,
                              timeout=300, max_retries=0)
    return _client


async def _wait_for_slot() -> None:
    """Sliding-window limiter: at most MAX_RPM request starts in any 60 s."""
    global _rate_lock
    if _rate_lock is None:
        _rate_lock = asyncio.Lock()
    async with _rate_lock:
        while True:
            t = time.monotonic()
            while _stamps and t - _stamps[0] > 60:
                _stamps.popleft()
            if len(_stamps) < MAX_RPM:
                _stamps.append(t)
                return
            await asyncio.sleep(60 - (t - _stamps[0]) + 0.05)


def _retryable(exc: Exception) -> bool:
    status = getattr(exc, "status_code", None)
    if status is not None:
        return status == 429 or status >= 500
    # connection errors and timeouts carry no status
    return type(exc).__name__ in {"APIConnectionError", "APITimeoutError"}


def _mock_reply(messages, role) -> str:
    """MODEL_MOCK=1: offline stand-in for wiring tests. Workers echo the parent with a random-restart tweak."""
    user = messages[-1]["content"]
    if role == "chief":
        return '{"assignments": [], "hire_angle": "try something new", "reply_to_humans": ""}'
    if role == "scribe":
        return "DO: keep changes small\nAVOID: untested ideas"
    if role == "worker":
        blocks = _FENCE.findall(user.split("PARENT STRATEGY:", 1)[-1])
        parent = blocks[0] if blocks else ""
        return f"```python\n{parent}\n```\nNOTE: mock copy of parent"
    return "pong"


async def call_model(messages, *, role, max_tokens=8000, temperature=0.8) -> str:
    global _sem
    if config.MODEL_MOCK:
        await asyncio.sleep(0.2)
        return _mock_reply(messages, role)
    if _sem is None:
        _sem = asyncio.Semaphore(MAX_IN_FLIGHT)
    client = _get_client()
    last_exc: Exception | None = None
    for attempt in range(MAX_RETRIES + 1):
        await _wait_for_slot()
        async with _sem:
            t0 = time.monotonic()
            try:
                # Streaming: Luminal returned 503 after ~2 min on long non-streamed generations,
                # while the same request streamed finishes in ~20 s.
                text, usage = await asyncio.wait_for(
                    _stream(client, messages, max_tokens, temperature), timeout=TOTAL_TIMEOUT_S)
            except Exception as exc:  # noqa: BLE001
                last_exc = exc
                if attempt < MAX_RETRIES and (_retryable(exc) or isinstance(exc, asyncio.TimeoutError)):
                    print(f"[model] {role} attempt {attempt + 1} failed ({type(exc).__name__}), retrying")
                    await asyncio.sleep(2 ** attempt * 2)
                    continue
                raise
            secs = time.monotonic() - t0
        try:
            from engine import store
            await asyncio.to_thread(store.record_usage, role,
                                    getattr(usage, "prompt_tokens", 0) or 0,
                                    getattr(usage, "completion_tokens", 0) or 0, secs)
        except Exception as exc:  # noqa: BLE001 - usage logging must never kill a call
            print(f"[model] usage not recorded: {exc}")
        return text
    raise last_exc  # pragma: no cover


async def _stream(client, messages, max_tokens, temperature):
    """Collects the answer (not the reasoning) from a streamed completion. Aborts if the stream stalls."""
    stream = await client.chat.completions.create(
        model=config.LUMINAL_MODEL, messages=messages, max_tokens=max_tokens,
        temperature=temperature, stream=True, stream_options={"include_usage": True},
    )
    parts, usage = [], None
    it = stream.__aiter__()
    while True:
        try:
            chunk = await asyncio.wait_for(it.__anext__(), timeout=STALL_TIMEOUT_S)
        except StopAsyncIteration:
            break
        if chunk.usage:
            usage = chunk.usage
        if chunk.choices and chunk.choices[0].delta.content:
            parts.append(chunk.choices[0].delta.content)
    return "".join(parts), usage


_FENCE = re.compile(r"```(?:python|py)?[ \t]*\n(.*?)```", re.DOTALL)


_THINK = re.compile(r"<think>.*?</think>", re.DOTALL)


def strip_thinking(text: str) -> str:
    return _THINK.sub("", text or "")


def extract_code(text: str) -> str | None:
    """Last ```python fenced block, or None."""
    blocks = _FENCE.findall(strip_thinking(text))
    return blocks[-1].strip() + "\n" if blocks else None


def extract_note(text: str) -> str:
    for line in reversed(strip_thinking(text).splitlines()):
        if line.strip().upper().startswith("NOTE:"):
            return line.strip()[5:].strip()[:200]
    return ""


def extract_json(text: str):
    """First {...} object in the text (models sometimes wrap JSON in prose or fences)."""
    import json
    text = strip_thinking(text)
    fenced = re.search(r"```(?:json)?\s*\n(.*?)```", text, re.DOTALL)
    if fenced:
        text = fenced.group(1)
    start = text.find("{")
    end = text.rfind("}")
    if start < 0 or end <= start:
        raise ValueError("no JSON object in reply")
    return json.loads(text[start:end + 1])
