"""Phase 0 check: one Luminal call and one MongoDB write."""
import asyncio

from engine import config, store
from engine.model import call_model


async def main():
    print(f"{config.APP_NAME}: pinging {config.LUMINAL_MODEL} at {config.LUMINAL_BASE_URL}")
    reply = await call_model([{"role": "user", "content": "Reply with the single word: pong"}],
                             role="ping", max_tokens=2000, temperature=0)
    print("model reply:", reply.strip()[:200])
    doc_id = store.db().events.insert_one({"type": "ping", "ts": store.now(), "reply": reply[:200]}).inserted_id
    print("mongodb document id:", doc_id)


if __name__ == "__main__":
    asyncio.run(main())
