"""Thin runtime introspection endpoints for VESPER Control Room v1."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import psycopg
from fastapi import APIRouter, HTTPException
from langgraph.checkpoint.serde.jsonplus import JsonPlusSerializer

from src.config.agents_config import load_agent_config
from src.config.app_config import get_app_config
from src.skills import load_skills
from src.subagents.executor import _filter_tools
from src.subagents.registry import list_subagents
from src.tools.tools import get_available_tools
from vesper_context import assemble_context_details

router = APIRouter(prefix="/api/runtime", tags=["runtime"])
_serde = JsonPlusSerializer()

SOURCE_OF_TRUTH = [
    "backend/vesper_context.py",
    "backend/vesper_hindsight.py",
    "backend/vesper_soul.md",
    "backend/src/agents/middlewares/vesper_context_middleware.py",
    "backend/src/agents/thread_state.py",
    "backend/src/tools/tools.py",
    "backend/src/tools/builtins/load_skill_tool.py",
    "backend/src/tools/builtins/task_tool.py",
    "backend/src/subagents/registry.py",
    "backend/src/subagents/builtins/__init__.py",
    "backend/.deer-flow/agents/vesper/config.yaml",
    "config.yaml",
    "/tmp/vesper_updater.log",
]

_SUBAGENT_SOURCE_MAP = {
    "web-researcher": "backend/src/subagents/builtins/web_researcher.py",
    "bash": "backend/src/subagents/builtins/bash_agent.py",
    "vesper-code-reader": "backend/src/subagents/builtins/vesper_code_reader.py",
    "vesper-code-writer": "backend/src/subagents/builtins/vesper_code_writer.py",
}


def _preview_text(text: str, limit: int = 240) -> str:
    compact = " ".join((text or "").split())
    return compact if len(compact) <= limit else compact[:limit] + "…"


def _conn_str() -> str:
    config = get_app_config()
    if not config.checkpointer or not config.checkpointer.connection_string:
        raise HTTPException(status_code=500, detail="Postgres checkpointer is not configured")
    return config.checkpointer.connection_string


def _fetch_latest_checkpoint(thread_id: str) -> tuple[dict[str, Any], dict[str, Any]]:
    with psycopg.connect(_conn_str()) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT checkpoint, metadata FROM checkpoints WHERE thread_id = %s AND checkpoint_ns = '' ORDER BY checkpoint_id DESC LIMIT 1",
                (thread_id,),
            )
            row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail=f"No checkpoint found for thread {thread_id}")
    checkpoint, metadata = row
    return checkpoint or {}, metadata or {}


def _fetch_latest_messages(thread_id: str) -> list[Any]:
    with psycopg.connect(_conn_str()) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT type, blob FROM checkpoint_blobs WHERE thread_id = %s AND checkpoint_ns = '' AND channel = 'messages' ORDER BY version DESC LIMIT 1",
                (thread_id,),
            )
            row = cur.fetchone()
    if not row:
        return []
    blob_type, blob = row
    return _serde.loads_typed((blob_type, bytes(blob)))


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


def _tool_call_events(index: int, msg: Any) -> list[dict[str, Any]]:
    events = []
    for call in getattr(msg, "tool_calls", None) or []:
        if not isinstance(call, dict):
            continue
        name = call.get("name") or "unknown"
        event_type = "delegation_started" if name == "task" else "skill_body_requested" if name == "load_skill" else "tool_called"
        events.append({
            "index": index,
            "type": event_type,
            "tool_name": name,
            "tool_call_id": call.get("id"),
            "args": call.get("args"),
            "preview": _preview_text(json.dumps(call.get("args", {}), ensure_ascii=False)),
        })
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
        "preview": _preview_text(content) if content.strip() else "",
    }


def _tool_result_event(index: int, msg: Any) -> dict[str, Any]:
    name = getattr(msg, "name", None) or getattr(msg, "tool_name", None)
    event_type = "delegation_completed" if name == "task" else "skill_body_loaded" if name == "load_skill" else "tool_returned"
    return {
        "index": index,
        "type": event_type,
        "tool_name": name,
        "preview": _preview_text(_message_content(msg), 500),
    }


def _build_timeline(messages: list[Any]) -> list[dict[str, Any]]:
    events = []
    for index, msg in enumerate(messages):
        role = _message_role(msg)
        if role == "system":
            continue
        if role == "human":
            events.append({"index": index, "type": "user_message", "preview": _preview_text(_message_content(msg))})
        elif role == "ai":
            events.append(_llm_event(index, msg))
            events.extend(_tool_call_events(index, msg))
        elif role == "tool":
            events.append(_tool_result_event(index, msg))
        else:
            events.append({"index": index, "type": role or "unknown", "preview": _preview_text(_message_content(msg))})
    return events


def _build_lead_snapshot(agent_name: str, model_name: str | None) -> dict[str, Any]:
    agent_cfg = load_agent_config(agent_name)
    if agent_cfg is None:
        return {"tool_groups": [], "effective_tools": []}
    tools = get_available_tools(
        groups=agent_cfg.tool_groups,
        model_name=model_name or agent_cfg.model,
        agent_role="lead",
        enable_task_tool=bool(agent_cfg.subagent_enabled),
    )
    return {
        "tool_groups": agent_cfg.tool_groups or [],
        "effective_tools": [tool.name for tool in tools],
        "subagent_enabled": bool(agent_cfg.subagent_enabled),
        "config_path": "backend/.deer-flow/agents/vesper/config.yaml",
    }


def _build_subagent_snapshot(model_name: str | None) -> list[dict[str, Any]]:
    base_tools = get_available_tools(model_name=model_name, agent_role="subagent")
    items = []
    for cfg in list_subagents():
        if cfg is None:
            continue
        effective = _filter_tools(base_tools, cfg.tools, cfg.disallowed_tools)
        items.append({
            "name": cfg.name,
            "description": cfg.description,
            "effective_tools": [tool.name for tool in effective],
            "allowlist": cfg.tools,
            "denylist": cfg.disallowed_tools,
            "source_of_truth": _SUBAGENT_SOURCE_MAP.get(cfg.name, "backend/src/subagents/builtins/__init__.py"),
        })
    return items


def _build_skills_snapshot(timeline: list[dict[str, Any]]) -> dict[str, Any]:
    skills = load_skills(enabled_only=False)
    return {
        "available_skills": [
            {
                "name": skill.name,
                "description": skill.description,
                "category": skill.category,
                "enabled": skill.enabled,
            }
            for skill in skills
        ],
        "load_events": [event for event in timeline if event["type"] in {"skill_body_requested", "skill_body_loaded"}],
    }


def _build_retain_events(thread_id: str, limit: int = 10) -> list[dict[str, Any]]:
    log_path = Path("/tmp/vesper_updater.log")
    if not log_path.exists():
        return []
    matches = []
    for line in log_path.read_text(errors="replace").splitlines():
        if thread_id in line:
            matches.append({"type": "memory_retain_proof", "preview": _preview_text(line, 500), "source": str(log_path)})
    return matches[-limit:]


@router.get("/threads/{thread_id}/introspection")
async def get_thread_introspection(thread_id: str) -> dict[str, Any]:
    checkpoint, metadata = _fetch_latest_checkpoint(thread_id)
    messages = _fetch_latest_messages(thread_id)
    channel_values = checkpoint.get("channel_values", {}) if isinstance(checkpoint, dict) else {}

    snapshot = channel_values.get("vesper_context_snapshot")
    snapshot_mode = "checkpoint"
    if not isinstance(snapshot, dict):
        latest_human = _latest_human_message(messages)
        if latest_human:
            snapshot = assemble_context_details(latest_human)
            snapshot_mode = "derived_current_runtime"
        else:
            compiled = channel_values.get("vesper_compiled_context", "")
            snapshot = {
                "full_compiled_context": compiled,
                "section_order": [],
                "sections": [],
                "approx_total_tokens": len(compiled) // 4,
            }
            snapshot_mode = "checkpoint_without_snapshot"

    compiled_context = channel_values.get("vesper_compiled_context") or snapshot.get("full_compiled_context", "")
    timeline = _build_timeline(messages)
    model_name = metadata.get("model_name") if isinstance(metadata, dict) else None
    agent_name = metadata.get("agent_name") if isinstance(metadata, dict) else "vesper"

    recall_event = None
    for section in snapshot.get("sections", []):
        if section.get("section_key") == "memory":
            recall_event = {
                "query": section.get("recall_query"),
                "limit": section.get("recall_limit"),
                "result_count": section.get("recall_result_count"),
                "approx_tokens_injected": section.get("approx_tokens"),
                "preview": section.get("preview"),
                "trace_available": section.get("trace_available"),
                "trace_preview": section.get("trace_preview"),
            }
            break

    return {
        "thread_id": thread_id,
        "run_id": metadata.get("run_id") if isinstance(metadata, dict) else None,
        "agent_name": agent_name,
        "model_name": model_name,
        "metadata": metadata,
        "snapshot_mode": snapshot_mode,
        "compiled_context_signature": snapshot.get("compiled_context_signature") or channel_values.get("vesper_context_signature"),
        "compiled_context_reused": snapshot.get("compiled_context_reused"),
        "compiled_context": compiled_context,
        "context_snapshot": snapshot,
        "lead": _build_lead_snapshot(agent_name, model_name),
        "subagents": _build_subagent_snapshot(model_name),
        "skills": _build_skills_snapshot(timeline),
        "memory": {
            "recall_event": recall_event,
            "retain_events": _build_retain_events(thread_id),
        },
        "timeline": timeline,
        "source_of_truth": SOURCE_OF_TRUTH,
    }
