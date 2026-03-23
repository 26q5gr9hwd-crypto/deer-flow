import asyncio
import httpx
import threading
from typing import Any

HINDSIGHT_BASE = "http://localhost:8888/v1/default"
VESPER_BANK = "vesper"


def _client():
    return httpx.AsyncClient(timeout=30.0)


async def _init_bank():
    payload = {
        "name": "VESPER",
        "background": "I am VESPER, an autonomous AI agent. I assist Daniel with development, planning, and research. I delegate to specialized subagents via DeerFlow and accumulate knowledge over time.",
        "disposition": {"skepticism": 3, "literalism": 4, "empathy": 2, "bias_strength": 0.2},
    }
    async with _client() as client:
        r = await client.put(HINDSIGHT_BASE + "/banks/" + VESPER_BANK, json=payload)
        r.raise_for_status()
        return r.json()


async def retain(content: str, event_date=None, metadata=None) -> dict:
    item = {"content": content}
    if event_date:
        item["timestamp"] = event_date
    if metadata:
        item["metadata"] = metadata
    payload = {"items": [item]}
    async with _client() as client:
        r = await client.post(HINDSIGHT_BASE + "/banks/" + VESPER_BANK + "/memories", json=payload)
        r.raise_for_status()
        return r.json()


def _normalize_results(response: Any) -> list[dict[str, Any]]:
    if isinstance(response, dict):
        results = response.get("results", [])
    else:
        results = response
    return results if isinstance(results, list) else []


def _format_results(results: list[dict[str, Any]]) -> str:
    if not results:
        return ""
    sep = chr(10) + "---" + chr(10)
    parts = []
    for item in results:
        if isinstance(item, dict):
            parts.append(item.get("content") or item.get("text") or str(item))
        else:
            parts.append(str(item))
    return sep.join(parts)


async def recall(query: str, limit: int = 10) -> dict[str, Any]:
    payload = {"query": query, "limit": limit}
    async with _client() as client:
        r = await client.post(HINDSIGHT_BASE + "/banks/" + VESPER_BANK + "/memories/recall", json=payload)
        r.raise_for_status()
        response = r.json()

    results = _normalize_results(response)
    trace = response.get("trace") if isinstance(response, dict) else None
    trace_preview = None
    if trace is not None:
        trace_preview = str(trace)
        if len(trace_preview) > 500:
            trace_preview = trace_preview[:500] + "…"

    return {
        "query": query,
        "limit": limit,
        "result_count": len(results),
        "results": results,
        "content": _format_results(results),
        "trace_available": trace is not None,
        "trace_preview": trace_preview,
        "raw_response": response if isinstance(response, dict) else None,
    }


async def search(query: str, limit: int = 10) -> str:
    payload = await recall(query, limit=limit)
    return payload["content"]


async def search_memories(query: str, num_results: int = 10) -> str:
    return await search(query, limit=num_results)


def _run_async_from_sync(async_fn, *args, **kwargs):
    """Run an async function from sync code, even if a loop is already running."""
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(async_fn(*args, **kwargs))

    result = {}
    error = {}

    def runner():
        try:
            result["value"] = asyncio.run(async_fn(*args, **kwargs))
        except Exception as exc:
            error["error"] = exc

    thread = threading.Thread(target=runner, daemon=True, name="vesper-hindsight-sync")
    thread.start()
    thread.join()

    if "error" in error:
        raise error["error"]
    return result.get("value")


def search_memories_sync(query: str, num_results: int = 10) -> str:
    """Sync bridge for live context assembly inside running event loops."""
    return _run_async_from_sync(search_memories, query, num_results=num_results)


def search_memories_payload_sync(query: str, num_results: int = 10) -> dict[str, Any]:
    """Sync bridge that preserves structured recall metadata for introspection."""
    return _run_async_from_sync(recall, query, limit=num_results)


async def reflect(query: str) -> str:
    async with _client() as client:
        r = await client.post(HINDSIGHT_BASE + "/banks/" + VESPER_BANK + "/reflect", json={"query": query})
        r.raise_for_status()
        result = r.json()
    return result.get("answer") or result.get("reflection") or result.get("content") or str(result)


async def init():
    bank = await _init_bank()
    print("VESPER bank ready: " + str(bank.get("bank_id") or bank.get("id") or "vesper"))
    return bank


if __name__ == "__main__":
    asyncio.run(init())
