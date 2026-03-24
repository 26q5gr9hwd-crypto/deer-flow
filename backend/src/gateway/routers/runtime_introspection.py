"""Runtime introspection endpoints for VESPER Control Room."""

from __future__ import annotations

import json
from typing import Any

import psycopg
from fastapi import APIRouter, HTTPException, Query
from langgraph.checkpoint.serde.jsonplus import JsonPlusSerializer

from src.config.app_config import get_app_config
from src.runtime_snapshot import (
    SOURCE_OF_TRUTH,
    build_memory_snapshot,
    build_runtime_snapshot,
    preview_text,
)
from vesper_context import assemble_context_details

router = APIRouter(prefix="/api/runtime", tags=["runtime"])
_serde = JsonPlusSerializer()


def _conn_str() -> str:
    config = get_app_config()
    if not config.checkpointer or not config.checkpointer.connection_string:
        raise HTTPException(status_code=500, detail="Postgres checkpointer is not configured")
    return config.checkpointer.connection_string


def _checkpoint_channel_values(checkpoint: dict[str, Any] | None) -> dict[str, Any]:
    if not isinstance(checkpoint, dict):
        return {}
    values = checkpoint.get("channel_values", {})
    return values if isinstance(values, dict) else {}


def _checkpoint_channel_versions(checkpoint: dict[str, Any] | None) -> dict[str, str]:
    if not isinstance(checkpoint, dict):
        return {}
    versions = checkpoint.get("channel_versions", {})
    return versions if isinstance(versions, dict) else {}


def _fetch_checkpoint_rows(thread_id: str) -> list[dict[str, Any]]:
    with psycopg.connect(_conn_str()) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT checkpoint_id, parent_checkpoint_id, checkpoint, metadata
                FROM checkpoints
                WHERE thread_id = %s AND checkpoint_ns = ''
                ORDER BY checkpoint_id DESC
                """,
                (thread_id,),
            )
            rows = cur.fetchall()
    return [
        {
            "checkpoint_id": checkpoint_id,
            "parent_checkpoint_id": parent_checkpoint_id,
            "checkpoint": checkpoint or {},
            "metadata": metadata or {},
        }
        for checkpoint_id, parent_checkpoint_id, checkpoint, metadata in rows
    ]


def _fetch_selected_checkpoint_row(thread_id: str, run_id: str | None) -> dict[str, Any]:
    rows = _fetch_checkpoint_rows(thread_id)
    if not rows:
        raise HTTPException(status_code=404, detail=f"No checkpoint found for thread {thread_id}")
    if not run_id:
        return rows[0]
    for row in rows:
        metadata = row.get("metadata", {})
        if metadata.get("run_id") == run_id:
            return row
    raise HTTPException(status_code=404, detail=f"Run {run_id} not found for thread {thread_id}")


def _load_blob_value(thread_id: str, channel: str, version: str) -> Any:
    with psycopg.connect(_conn_str()) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT type, blob
                FROM checkpoint_blobs
                WHERE thread_id = %s AND checkpoint_ns = '' AND channel = %s AND version = %s
                LIMIT 1
                """,
                (thread_id, channel, version),
            )
            row = cur.fetchone()
    if not row:
        return None
    blob_type, blob = row
    return _serde.loads_typed((blob_type, bytes(blob)))


def _load_channel_value(thread_id: str, checkpoint: dict[str, Any], channel: str) -> Any:
    channel_values = _checkpoint_channel_values(checkpoint)
    if channel in channel_values:
        return channel_values[channel]
    version = _checkpoint_channel_versions(checkpoint).get(channel)
    if not version:
        return None
    return _load_blob_value(thread_id, channel, version)


def _fetch_messages_for_checkpoint(thread_id: str, checkpoint: dict[str, Any]) -> list[Any]:
    version = _checkpoint_channel_versions(checkpoint).get("messages")
    if not version:
        return []
    messages = _load_blob_value(thread_id, "messages", version)
    return messages if isinstance(messages, list) else []


def _message_role(msg: Any) -> str:
    return getattr(msg, "type", getattr(msg, "role", "unknown"))


def _message_content(msg: Any) -> str:
    content = getattr(msg, "content", "")
    if isinstance(content, list):
        return " ".join(part.get("text", "") for part in content if isinstance(part, dict))
    return str(content or "")


def _latest_human_message(messages: list[Any]) -> str:
    for msg in reversed(messages):
        if _message_role(msg) == "human":
            return _message_content(msg)
    return ""


def _slice_latest_run_messages(messages: list[Any]) -> list[Any]:
    for index in range(len(messages) - 1, -1, -1):
        if _message_role(messages[index]) == "human":
            return messages[index:]
    return messages


def _tool_call_events(index: int, msg: Any) -> list[dict[str, Any]]:
    events = []
    for call in getattr(msg, "tool_calls", None) or []:
        if not isinstance(call, dict):
            continue
        name = call.get("name") or "unknown"
        event_type = "delegation_started" if name == "task" else "skill_body_requested" if name == "load_skill" else "tool_called"
        events.append(
            {
                "index": index,
                "type": event_type,
                "tool_name": name,
                "tool_call_id": call.get("id"),
                "args": call.get("args"),
                "preview": preview_text(json.dumps(call.get("args", {}), ensure_ascii=False)),
            }
        )
    return events


def _llm_event(index: int, msg: Any) -> dict[str, Any]:
    token_usage = (getattr(msg, "response_metadata", None) or {}).get("token_usage", {})
    tool_calls = getattr(msg, "tool_calls", None) or []
    content = _message_content(msg)
    return {
        "index": index,
        "type": "llm_call_completed",
        "prompt_tokens": token_usage.get("prompt_tokens"),
        "completion_tokens": token_usage.get("completion_tokens"),
        "total_tokens": token_usage.get("total_tokens"),
        "cost": token_usage.get("cost"),
        "tool_call_count": len(tool_calls),
        "response_kind": "tool_request" if tool_calls else "final_response",
        "preview": preview_text(content) if content.strip() else "",
    }


def _tool_result_event(index: int, msg: Any) -> dict[str, Any]:
    name = getattr(msg, "name", None) or getattr(msg, "tool_name", None)
    event_type = "delegation_completed" if name == "task" else "skill_body_loaded" if name == "load_skill" else "tool_returned"
    return {
        "index": index,
        "type": event_type,
        "tool_name": name,
        "preview": preview_text(_message_content(msg), 500),
    }


def _build_timeline(messages: list[Any]) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    for index, msg in enumerate(messages):
        role = _message_role(msg)
        if role == "system":
            continue
        if role == "human":
            events.append({"index": index, "type": "user_message", "preview": preview_text(_message_content(msg))})
        elif role == "ai":
            events.append(_llm_event(index, msg))
            events.extend(_tool_call_events(index, msg))
        elif role == "tool":
            events.append(_tool_result_event(index, msg))
        else:
            events.append({"index": index, "type": role or "unknown", "preview": preview_text(_message_content(msg))})
    return events


def _build_retain_events(thread_id: str, run_id: str | None, limit: int = 10) -> list[dict[str, Any]]:
    matches: list[dict[str, Any]] = []
    try:
        with open("/tmp/vesper_updater.log", "r", errors="replace") as handle:
            for line in handle:
                if (thread_id and thread_id in line) or (run_id and run_id in line):
                    matches.append(
                        {
                            "type": "memory_retain_proof",
                            "preview": preview_text(line, 500),
                            "source": "/tmp/vesper_updater.log",
                        }
                    )
    except FileNotFoundError:
        return []
    return matches[-limit:]


def _snapshot_fidelity(checkpoint: dict[str, Any]) -> str:
    versions = _checkpoint_channel_versions(checkpoint)
    values = _checkpoint_channel_values(checkpoint)
    if "vesper_run_snapshot" in values or versions.get("vesper_run_snapshot"):
        return "exact"
    if "vesper_context_snapshot" in values or versions.get("vesper_context_snapshot"):
        return "partial"
    return "legacy"


def _build_run_history(thread_id: str, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[str, dict[str, Any]] = {}
    for row in reversed(rows):
        metadata = row.get("metadata", {}) if isinstance(row.get("metadata"), dict) else {}
        checkpoint = row.get("checkpoint", {}) if isinstance(row.get("checkpoint"), dict) else {}
        run_id = metadata.get("run_id")
        if not run_id:
            continue
        item = grouped.setdefault(
            run_id,
            {
                "run_id": run_id,
                "thread_id": thread_id,
                "started_at": checkpoint.get("ts"),
                "finished_at": checkpoint.get("ts"),
                "latest_checkpoint_id": row["checkpoint_id"],
                "checkpoint_count": 0,
                "latest_step": metadata.get("step"),
                "snapshot_fidelity": "legacy",
            },
        )
        item["checkpoint_count"] += 1
        if checkpoint.get("ts"):
            item["finished_at"] = checkpoint.get("ts")
        item["latest_checkpoint_id"] = row["checkpoint_id"]
        item["latest_step"] = metadata.get("step")
        fidelity = _snapshot_fidelity(checkpoint)
        if fidelity == "exact":
            item["snapshot_fidelity"] = "exact"
        elif fidelity == "partial" and item["snapshot_fidelity"] != "exact":
            item["snapshot_fidelity"] = "partial"

    order = {"exact": 2, "partial": 1, "legacy": 0}
    return sorted(
        grouped.values(),
        key=lambda item: (item.get("finished_at") or "", order.get(item.get("snapshot_fidelity", "legacy"), 0)),
        reverse=True,
    )


def _build_selected_payload(thread_id: str, row: dict[str, Any], run_history: list[dict[str, Any]]) -> dict[str, Any]:
    checkpoint = row.get("checkpoint", {}) if isinstance(row.get("checkpoint"), dict) else {}
    metadata = row.get("metadata", {}) if isinstance(row.get("metadata"), dict) else {}
    run_id = metadata.get("run_id")
    model_name = metadata.get("model_name")
    agent_name = metadata.get("agent_name") or "vesper"
    snapshot_mode = "checkpoint_run_snapshot"
    snapshot_fidelity = _snapshot_fidelity(checkpoint)

    run_messages = _slice_latest_run_messages(_fetch_messages_for_checkpoint(thread_id, checkpoint))

    run_snapshot = _load_channel_value(thread_id, checkpoint, "vesper_run_snapshot")
    context_snapshot = None
    if isinstance(run_snapshot, dict):
        context_snapshot = run_snapshot.get("context_snapshot", {})
    if not isinstance(run_snapshot, dict):
        context_snapshot = _load_channel_value(thread_id, checkpoint, "vesper_context_snapshot")
        if isinstance(context_snapshot, dict):
            run_snapshot = build_runtime_snapshot(
                agent_name=agent_name,
                model_name=model_name,
                context_snapshot=context_snapshot,
                context_signature=context_snapshot.get("compiled_context_signature") or _load_channel_value(thread_id, checkpoint, "vesper_context_signature"),
                context_reused=context_snapshot.get("compiled_context_reused"),
                thread_id=thread_id,
                visible_message_count=context_snapshot.get("visible_message_count"),
                context_window_size=context_snapshot.get("context_window_size"),
                snapshot_source="checkpoint_context_snapshot",
            )
            snapshot_mode = "checkpoint_context_snapshot"
        else:
            latest_human = _latest_human_message(run_messages)
            if latest_human:
                context_snapshot = assemble_context_details(latest_human)
                run_snapshot = build_runtime_snapshot(
                    agent_name=agent_name,
                    model_name=model_name,
                    context_snapshot=context_snapshot,
                    context_signature=_load_channel_value(thread_id, checkpoint, "vesper_context_signature"),
                    context_reused=None,
                    thread_id=thread_id,
                    visible_message_count=len(run_messages),
                    snapshot_source="derived_current_runtime",
                )
                snapshot_mode = "derived_current_runtime"
            else:
                compiled_context = _load_channel_value(thread_id, checkpoint, "vesper_compiled_context") or ""
                context_snapshot = {
                    "full_compiled_context": compiled_context,
                    "section_order": [],
                    "sections": [],
                    "approx_total_tokens": len(compiled_context) // 4,
                    "approx_total_chars": len(compiled_context),
                    "source_of_truth": SOURCE_OF_TRUTH,
                }
                run_snapshot = build_runtime_snapshot(
                    agent_name=agent_name,
                    model_name=model_name,
                    context_snapshot=context_snapshot,
                    context_signature=_load_channel_value(thread_id, checkpoint, "vesper_context_signature"),
                    context_reused=None,
                    thread_id=thread_id,
                    visible_message_count=len(run_messages),
                    snapshot_source="checkpoint_without_snapshot",
                )
                snapshot_mode = "checkpoint_without_snapshot"

    compiled_context = (
        context_snapshot.get("full_compiled_context") if isinstance(context_snapshot, dict) else None
    ) or _load_channel_value(thread_id, checkpoint, "vesper_compiled_context") or ""
    run_snapshot.setdefault("context_snapshot", context_snapshot or {})
    run_snapshot.setdefault("memory", build_memory_snapshot(context_snapshot or {}))
    run_snapshot["memory"]["retain_events"] = _build_retain_events(thread_id, run_id)

    warnings: list[str] = []
    if snapshot_fidelity == "partial":
        warnings.append("This run has an exact frozen context snapshot, but tool, subagent, and provenance views are still reconstructed from current runtime state.")
    elif snapshot_fidelity == "legacy":
        warnings.append("This run predates frozen snapshot persistence. Control Room is deriving what it can from the current runtime and the checkpoint message history.")
    if not run_snapshot["memory"].get("retain_events"):
        warnings.append("No retain-event proof is bound to this selected run yet. The UI is showing this as an explicit evidence gap.")

    selected_summary = next((item for item in run_history if item.get("run_id") == run_id), None)
    if not selected_summary:
        selected_summary = {
            "run_id": run_id,
            "thread_id": thread_id,
            "started_at": checkpoint.get("ts"),
            "finished_at": checkpoint.get("ts"),
            "latest_checkpoint_id": row["checkpoint_id"],
            "checkpoint_count": 1,
            "latest_step": metadata.get("step"),
            "snapshot_fidelity": snapshot_fidelity,
        }

    timeline = _build_timeline(run_messages)
    run_snapshot.setdefault("skills", {}).setdefault(
        "load_events",
        [event for event in timeline if event["type"] in {"skill_body_requested", "skill_body_loaded"}],
    )

    return {
        "thread_id": thread_id,
        "run_id": run_id,
        "agent_name": agent_name,
        "model_name": model_name,
        "metadata": metadata,
        "snapshot_mode": snapshot_mode,
        "snapshot_fidelity": snapshot_fidelity,
        "warnings": warnings,
        "compiled_context_signature": (context_snapshot or {}).get("compiled_context_signature") or _load_channel_value(thread_id, checkpoint, "vesper_context_signature"),
        "compiled_context_reused": (context_snapshot or {}).get("compiled_context_reused"),
        "compiled_context": compiled_context,
        "context_snapshot": run_snapshot.get("context_snapshot", {}),
        "lead": run_snapshot.get("lead", {}),
        "subagents": run_snapshot.get("subagents", []),
        "skills": run_snapshot.get("skills", {}),
        "memory": run_snapshot.get("memory", {}),
        "timeline": timeline,
        "timeline_scope": "selected_run",
        "selected_run_message_count": len(run_messages),
        "source_of_truth": run_snapshot.get("source_of_truth", SOURCE_OF_TRUTH),
        "provenance": run_snapshot.get("provenance", {}),
        "selected_run": selected_summary,
        "run_history": run_history,
    }


@router.get("/threads/{thread_id}/introspection")
async def get_thread_introspection(thread_id: str, run_id: str | None = Query(default=None)) -> dict[str, Any]:
    rows = _fetch_checkpoint_rows(thread_id)
    if not rows:
        raise HTTPException(status_code=404, detail=f"No checkpoint found for thread {thread_id}")
    run_history = _build_run_history(thread_id, rows)
    selected_row = _fetch_selected_checkpoint_row(thread_id, run_id)
    return _build_selected_payload(thread_id, selected_row, run_history)
