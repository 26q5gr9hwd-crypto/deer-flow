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
    build_lead_snapshot,
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


def _approx_tokens(text: str) -> int:
    return len(text) // 4 if text else 0


def _safe_json(value: Any) -> str:
    try:
        return json.dumps(value, ensure_ascii=False, sort_keys=True, default=str)
    except TypeError:
        return str(value)


def _tool_call_events(index: int, msg: Any) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    for call in getattr(msg, "tool_calls", None) or []:
        if not isinstance(call, dict):
            continue
        name = call.get("name") or "unknown"
        args = call.get("args")
        payload_text = _safe_json(args or {})
        event_type = (
            "delegation_started"
            if name == "task"
            else "skill_body_requested"
            if name == "load_skill"
            else "tool_called"
        )
        events.append(
            {
                "index": index,
                "type": event_type,
                "tool_name": name,
                "tool_call_id": call.get("id"),
                "args": args,
                "preview": preview_text(payload_text),
                "approx_tokens": _approx_tokens(payload_text),
                "evidence": "tool_call_args",
                "approximate": True,
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
        "evidence": "provider_usage" if token_usage else "checkpoint_message",
    }


def _tool_result_event(index: int, msg: Any) -> dict[str, Any]:
    name = getattr(msg, "name", None) or getattr(msg, "tool_name", None)
    content = _message_content(msg)
    event_type = (
        "delegation_completed"
        if name == "task"
        else "skill_body_loaded"
        if name == "load_skill"
        else "tool_returned"
    )
    return {
        "index": index,
        "type": event_type,
        "tool_name": name,
        "tool_call_id": getattr(msg, "tool_call_id", None),
        "preview": preview_text(content, 500),
        "approx_tokens": _approx_tokens(content),
        "evidence": "tool_result_message",
        "approximate": True,
    }


def _build_timeline(messages: list[Any]) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    for index, msg in enumerate(messages):
        role = _message_role(msg)
        if role == "system":
            continue
        if role == "human":
            text = _message_content(msg)
            events.append(
                {
                    "index": index,
                    "type": "user_message",
                    "preview": preview_text(text),
                    "approx_tokens": _approx_tokens(text),
                    "evidence": "checkpoint_message",
                    "approximate": True,
                }
            )
        elif role == "ai":
            events.append(_llm_event(index, msg))
            events.extend(_tool_call_events(index, msg))
        elif role == "tool":
            events.append(_tool_result_event(index, msg))
        else:
            text = _message_content(msg)
            events.append(
                {
                    "index": index,
                    "type": role or "unknown",
                    "preview": preview_text(text),
                    "approx_tokens": _approx_tokens(text),
                    "evidence": "checkpoint_message",
                    "approximate": True,
                }
            )
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


def _build_context_event(context_snapshot: dict[str, Any], snapshot_mode: str) -> dict[str, Any] | None:
    if not isinstance(context_snapshot, dict):
        return None
    context_event = context_snapshot.get("context_event") or "built"
    approx_total_tokens = context_snapshot.get("approx_total_tokens")
    section_count = len(context_snapshot.get("sections", []) or [])
    return {
        "type": f"context_{context_event}",
        "preview": f"{section_count} compiled context sections surfaced for this run.",
        "approx_tokens": approx_total_tokens,
        "evidence": snapshot_mode,
        "approximate": True,
    }


def _build_recall_timeline_event(memory_snapshot: dict[str, Any]) -> dict[str, Any] | None:
    recall_event = (memory_snapshot or {}).get("recall_event")
    if not isinstance(recall_event, dict):
        return None
    query = recall_event.get("query") or "No recall query surfaced"
    result_count = recall_event.get("result_count")
    approx_tokens = recall_event.get("approx_tokens_injected")
    preview = f"Recall query: {query}"
    if result_count is not None:
        preview += f" · {result_count} results"
    return {
        "type": "memory_recall_loaded",
        "preview": preview,
        "approx_tokens": approx_tokens,
        "evidence": "context_snapshot_memory_section",
        "approximate": True,
        "args": recall_event,
    }


def _build_retain_timeline_events(retain_events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    for retain_event in retain_events:
        if not isinstance(retain_event, dict):
            continue
        preview = retain_event.get("preview") or "Retain proof surfaced"
        events.append(
            {
                "type": retain_event.get("type") or "memory_retain_proof",
                "preview": preview,
                "approx_tokens": _approx_tokens(preview),
                "evidence": retain_event.get("source") or "retain_log",
                "approximate": True,
                "args": retain_event,
            }
        )
    return events


def _insert_after_first_user(timeline: list[dict[str, Any]], injected_events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not injected_events:
        return timeline
    insert_at = 0
    for idx, event in enumerate(timeline):
        if event.get("type") == "user_message":
            insert_at = idx + 1
            break
    return timeline[:insert_at] + injected_events + timeline[insert_at:]


def _build_token_accounting(context_snapshot: dict[str, Any], run_messages: list[Any], lead_snapshot: dict[str, Any]) -> dict[str, Any]:
    sections = context_snapshot.get("sections", []) if isinstance(context_snapshot, dict) else []
    compiled_total = context_snapshot.get("approx_total_tokens") if isinstance(context_snapshot, dict) else None

    conversation_tokens = 0
    conversation_messages = 0
    tool_call_tokens = 0
    tool_call_count = 0
    tool_result_tokens = 0
    tool_result_count = 0
    provider_prompt_values: list[int] = []
    provider_completion_values: list[int] = []
    provider_total_values: list[int] = []

    for msg in run_messages:
        role = _message_role(msg)
        content = _message_content(msg)
        if role == "human":
            conversation_tokens += _approx_tokens(content)
            conversation_messages += 1
        elif role == "ai":
            if content.strip():
                conversation_tokens += _approx_tokens(content)
                conversation_messages += 1
            token_usage = (getattr(msg, "response_metadata", None) or {}).get("token_usage", {})
            prompt_tokens = token_usage.get("prompt_tokens")
            completion_tokens = token_usage.get("completion_tokens")
            total_tokens = token_usage.get("total_tokens")
            if isinstance(prompt_tokens, int):
                provider_prompt_values.append(prompt_tokens)
            if isinstance(completion_tokens, int):
                provider_completion_values.append(completion_tokens)
            if isinstance(total_tokens, int):
                provider_total_values.append(total_tokens)
            for call in getattr(msg, "tool_calls", None) or []:
                if not isinstance(call, dict):
                    continue
                tool_call_count += 1
                tool_call_tokens += _approx_tokens((call.get("name") or "") + _safe_json(call.get("args") or {}))
        elif role == "tool":
            tool_result_count += 1
            tool_result_tokens += _approx_tokens(content)

    tool_schema_snapshot = lead_snapshot.get("tool_schema_snapshot", {}) if isinstance(lead_snapshot, dict) else {}
    tool_schema_tokens = tool_schema_snapshot.get("approx_tokens")
    visible_estimate_total = sum(
        value
        for value in [
            compiled_total if isinstance(compiled_total, int) else 0,
            conversation_tokens,
            tool_schema_tokens if isinstance(tool_schema_tokens, int) else 0,
            tool_call_tokens,
            tool_result_tokens,
        ]
        if isinstance(value, int)
    )

    latest_provider_prompt = provider_prompt_values[-1] if provider_prompt_values else None
    latest_provider_gap = latest_provider_prompt - visible_estimate_total if isinstance(latest_provider_prompt, int) else None

    if isinstance(latest_provider_prompt, int):
        if isinstance(latest_provider_gap, int) and latest_provider_gap > 0:
            explanation = (
                f"Latest provider-reported prompt input was {latest_provider_prompt} tokens, while the visible Control Room estimate is about {visible_estimate_total}. "
                "The difference is expected when provider tokenizers, request wrappers, or other hidden formatting add tokens beyond the visible compiled context."
            )
        elif isinstance(latest_provider_gap, int):
            explanation = (
                f"Latest provider-reported prompt input was {latest_provider_prompt} tokens versus a visible estimate of about {visible_estimate_total}. "
                "A negative or small gap usually means the char-based estimates are slightly overcounting or the provider tokenizer is more efficient than the approximation."
            )
        else:
            explanation = "Provider-reported prompt totals are available for at least one LLM call in this run."
    else:
        explanation = (
            "Provider-reported prompt totals were not surfaced for this selected run. Compiled context, conversation history, tool schemas, and tool/result history are still shown as separate approximations."
        )

    warnings = [
        "Compiled context, conversation history, tool schemas, and tool/result history use a rough character-based estimate, not the provider tokenizer.",
        "Tool schema size is derived from the current live tool definitions unless it was already frozen into the selected run snapshot.",
    ]
    if not provider_prompt_values:
        warnings.append("Provider-reported prompt totals are missing for this run, so the full prompt total can only be inferred approximately.")
    else:
        warnings.append("Provider totals come from response metadata when the model/provider surfaces them, which is the strongest source available in this run trace.")

    return {
        "compiled_context": {
            "approx_tokens": compiled_total,
            "section_count": len(sections),
            "sections": [
                {
                    "section_key": section.get("section_key"),
                    "approx_tokens": section.get("approx_tokens"),
                    "source": section.get("source"),
                }
                for section in sections
                if isinstance(section, dict)
            ],
        },
        "conversation_history": {
            "approx_tokens": conversation_tokens,
            "message_count": conversation_messages,
        },
        "tool_schemas": tool_schema_snapshot,
        "tool_call_history": {
            "approx_tokens": tool_call_tokens,
            "event_count": tool_call_count,
        },
        "tool_result_history": {
            "approx_tokens": tool_result_tokens,
            "event_count": tool_result_count,
        },
        "provider_prompt_tokens": {
            "latest": latest_provider_prompt,
            "max": max(provider_prompt_values) if provider_prompt_values else None,
            "sum": sum(provider_prompt_values) if provider_prompt_values else None,
            "llm_call_count": len(provider_prompt_values),
        },
        "provider_completion_tokens": {
            "latest": provider_completion_values[-1] if provider_completion_values else None,
            "max": max(provider_completion_values) if provider_completion_values else None,
            "sum": sum(provider_completion_values) if provider_completion_values else None,
            "llm_call_count": len(provider_completion_values),
        },
        "provider_total_tokens": {
            "latest": provider_total_values[-1] if provider_total_values else None,
            "max": max(provider_total_values) if provider_total_values else None,
            "sum": sum(provider_total_values) if provider_total_values else None,
            "llm_call_count": len(provider_total_values),
        },
        "visible_estimate_total": visible_estimate_total,
        "latest_provider_gap": latest_provider_gap,
        "explanation": explanation,
        "warnings": warnings,
    }


def _ensure_lead_snapshot_fields(run_snapshot: dict[str, Any], agent_name: str, model_name: str | None) -> dict[str, Any]:
    lead_snapshot = run_snapshot.get("lead") if isinstance(run_snapshot.get("lead"), dict) else {}
    live_lead = build_lead_snapshot(agent_name, model_name)
    for key, value in live_lead.items():
        if key not in lead_snapshot or lead_snapshot.get(key) in (None, [], {}, ""):
            lead_snapshot[key] = value
    run_snapshot["lead"] = lead_snapshot
    return lead_snapshot


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
    lead_snapshot = _ensure_lead_snapshot_fields(run_snapshot, agent_name, model_name)

    warnings: list[str] = []
    if snapshot_fidelity == "partial":
        warnings.append("This run has an exact frozen context snapshot, but tool, subagent, and provenance views are still reconstructed from current runtime state.")
    elif snapshot_fidelity == "legacy":
        warnings.append("This run predates frozen snapshot persistence. Control Room is deriving what it can from the current runtime and the checkpoint message history.")
    if not run_snapshot["memory"].get("retain_events"):
        warnings.append("No retain-event proof is bound to this selected run yet. The UI is showing this as an explicit evidence gap.")
    if not lead_snapshot.get("tool_schema_snapshot"):
        warnings.append("Tool schema accounting could not be frozen from this run and is being derived from the live tool definitions instead.")

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
    injected_events: list[dict[str, Any]] = []
    context_event = _build_context_event(context_snapshot or {}, snapshot_mode)
    if context_event:
        injected_events.append(context_event)
    recall_event = _build_recall_timeline_event(run_snapshot.get("memory", {}))
    if recall_event:
        injected_events.append(recall_event)
    timeline = _insert_after_first_user(timeline, injected_events)
    timeline.extend(_build_retain_timeline_events(run_snapshot["memory"].get("retain_events", [])))
    for sequence, event in enumerate(timeline, start=1):
        event.setdefault("sequence", sequence)

    run_snapshot.setdefault("skills", {}).setdefault(
        "load_events",
        [event for event in timeline if event["type"] in {"skill_body_requested", "skill_body_loaded"}],
    )

    token_accounting = _build_token_accounting(context_snapshot or {}, run_messages, lead_snapshot)

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
        "lead": lead_snapshot,
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
        "token_accounting": token_accounting,
    }


@router.get("/threads/{thread_id}/introspection")
async def get_thread_introspection(thread_id: str, run_id: str | None = Query(default=None)) -> dict[str, Any]:
    rows = _fetch_checkpoint_rows(thread_id)
    if not rows:
        raise HTTPException(status_code=404, detail=f"No checkpoint found for thread {thread_id}")

    run_history = _build_run_history(thread_id, rows)

    selected_row: dict[str, Any] | None = None
    if run_id:
        for row in rows:
            metadata = row.get("metadata", {}) if isinstance(row.get("metadata"), dict) else {}
            if metadata.get("run_id") == run_id:
                selected_row = row
                break
        if selected_row is None:
            raise HTTPException(status_code=404, detail=f"Run {run_id} not found for thread {thread_id}")
    else:
        selected_row = rows[0]

    return _build_selected_payload(thread_id, selected_row, run_history)
