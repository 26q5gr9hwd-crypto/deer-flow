"""Context management tools for VESPER — VESPER-FIX-9 (patched VESPER-INCIDENT-2).

Provides two tools:
  - expand_context(n): expands the conversation history window for the current turn
  - search_message_history(query): keyword search over full stored history

These tools let VESPER work efficiently with a small default context window (10 msgs)
while still being able to access older history when needed.

VESPER-INCIDENT-2 fix: Replaced InjectedToolCallId (not available in langgraph 1.0.x)
with ToolRuntime, which provides tool_call_id in langgraph 1.0.10.
"""

from __future__ import annotations

import json
import logging
from typing import Annotated

from langchain.tools import tool
from langchain_core.messages import ToolMessage
from langchain_core.runnables import RunnableConfig
from langgraph.prebuilt import ToolRuntime
from langgraph.types import Command

logger = logging.getLogger(__name__)

# VESPER-FIX-9: Max window the expand tool is allowed to request
_MAX_EXPAND_WINDOW = 50

# Postgres DSN for direct history search (matches vesper agent config.yaml)
_POSTGRES_DSN = "postgresql://n8n:EHYUBBanhcbedheu391318hcehu@localhost:5432/vesper"


@tool("expand_context")
def expand_context_tool(
    n: int = 20,
    runtime: ToolRuntime = None,
) -> Command:
    """Expand the conversation history window for this turn when you need broader context.

    Call this when the user references something from earlier in the conversation
    that isn't in your current context window (last 10 messages).

    After calling this tool, the next model invocation will receive the last N messages
    instead of the default 10.

    Args:
        n: Number of recent messages to load (default 20, max 50)
    """
    clamped = max(10, min(n, _MAX_EXPAND_WINDOW))
    tool_call_id = (runtime.tool_call_id if runtime is not None else None) or ""
    logger.info("VESPER-FIX-9: expand_context called with n=%d (clamped=%d)", n, clamped)
    return Command(
        update={
            "context_window_size": clamped,
            "messages": [
                ToolMessage(
                    content=f"Context window expanded to {clamped} messages.",
                    tool_call_id=tool_call_id,
                )
            ],
        }
    )


@tool("search_message_history")
def search_message_history_tool(query: str, config: RunnableConfig, limit: int = 5) -> str:
    """Search older conversation history by keyword when you need context outside your current window.

    Use this when the user refers to something specific from earlier in the conversation
    (e.g. "remember when we discussed X?" or "what was that command from before?")
    and it's not in your current context window.

    Returns matching messages with 1-message context around each match.

    Args:
        query: Keyword or phrase to search for (case-insensitive)
        limit: Max number of matching messages to return (default 5, max 20)
    """
    limit = max(1, min(limit, 20))
    thread_id = (config.get("configurable") or {}).get("thread_id")
    if not thread_id:
        return "Cannot search history: no thread_id in config."

    try:
        from src.agents.checkpointer.async_provider import _async_checkpointer  # noqa
        from src.config.app_config import get_app_config

        app_config = get_app_config()
        if app_config.checkpointer is None or app_config.checkpointer.type != "postgres":
            return "History search is only available with the Postgres checkpointer."

        conn_str = app_config.checkpointer.connection_string
        if not conn_str:
            return "Cannot search history: no Postgres connection string configured."

        import psycopg

        with psycopg.connect(conn_str) as conn:
            with conn.cursor() as cur:
                # Get the latest checkpoint id for this thread
                cur.execute(
                    """
                    SELECT checkpoint_id FROM checkpoints
                    WHERE thread_id = %s AND checkpoint_ns = ''
                    ORDER BY checkpoint_id DESC LIMIT 1
                    """,
                    (thread_id,),
                )
                row = cur.fetchone()
                if not row:
                    return "No conversation history found for this thread."

                checkpoint_id = row[0]

                # Get the messages blob for this checkpoint
                cur.execute(
                    """
                    SELECT type, blob FROM checkpoint_blobs
                    WHERE thread_id = %s AND checkpoint_ns = '' AND channel = 'messages'
                    ORDER BY version DESC LIMIT 1
                    """,
                    (thread_id,),
                )
                blob_row = cur.fetchone()
                if not blob_row:
                    return "No message history blobs found for this thread."

                blob_type, blob_data = blob_row

                # Deserialize messages using msgpack (LangGraph's default serializer)
                messages = _deserialize_messages_blob(blob_type, blob_data)
                if messages is None:
                    return "Could not deserialize message history. Try expand_context instead."

                # Filter messages by query (case-insensitive substring)
                query_lower = query.lower()
                matches = []
                for i, msg in enumerate(messages):
                    content = _get_message_content(msg)
                    if query_lower in content.lower():
                        # Include 1 message of context before and after
                        context_start = max(0, i - 1)
                        context_end = min(len(messages), i + 2)
                        matches.append((i, context_start, context_end))

                if not matches:
                    return f"No messages found matching '{query}' in conversation history ({len(messages)} messages searched)."

                # Deduplicate overlapping context ranges and build result
                result_parts = [
                    f"Found {len(matches)} message(s) matching '{query}' "
                    f"(searched {len(messages)} total messages):\n"
                ]
                seen_indices: set[int] = set()
                shown = 0
                for match_idx, ctx_start, ctx_end in matches[:limit]:
                    if shown >= limit:
                        break
                    for j in range(ctx_start, ctx_end):
                        if j not in seen_indices:
                            seen_indices.add(j)
                            msg = messages[j]
                            role = _get_message_role(msg)
                            content = _get_message_content(msg)
                            marker = " <<<" if j == match_idx else ""
                            # Truncate long messages for readability
                            if len(content) > 300:
                                content = content[:300] + "...[truncated]"
                            result_parts.append(f"[msg {j}] {role}: {content}{marker}")
                    result_parts.append("---")
                    shown += 1

                return "\n".join(result_parts)

    except Exception as e:
        logger.warning("VESPER-FIX-9 search_message_history failed: %s", e, exc_info=True)
        return f"History search failed: {e}. Try using expand_context instead."


def _deserialize_messages_blob(blob_type: str, blob_data: bytes) -> list | None:
    """Attempt to deserialize a LangGraph checkpoint blob containing messages."""
    try:
        # LangGraph uses msgpack by default
        import msgpack  # type: ignore

        raw = msgpack.unpackb(blob_data, raw=False)
        if isinstance(raw, list):
            return raw
        if isinstance(raw, dict) and "messages" in raw:
            return raw["messages"]
        return None
    except Exception:
        pass

    try:
        # Fallback: try JSON
        raw = json.loads(blob_data.decode("utf-8", errors="replace"))
        if isinstance(raw, list):
            return raw
        if isinstance(raw, dict) and "messages" in raw:
            return raw["messages"]
        return None
    except Exception:
        return None


def _get_message_content(msg) -> str:
    """Extract text content from a message object or dict."""
    if isinstance(msg, dict):
        content = msg.get("content", "")
    else:
        content = getattr(msg, "content", "")
    if isinstance(content, list):
        return " ".join(
            p.get("text", "") if isinstance(p, dict) else str(p) for p in content
        )
    return str(content) if content else ""


def _get_message_role(msg) -> str:
    """Extract the role/type label from a message object or dict."""
    if isinstance(msg, dict):
        return msg.get("type", msg.get("role", "unknown"))
    return getattr(msg, "type", getattr(msg, "role", "unknown"))