from __future__ import annotations

from typing import Any

from src.config.agents_config import load_agent_config
from src.skills import load_skills
from src.subagents.executor import _filter_tools
from src.subagents.registry import list_subagents
from src.tools.tools import get_available_tools

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


def preview_text(text: str, limit: int = 240) -> str:
    compact = " ".join((text or "").split())
    return compact if len(compact) <= limit else compact[:limit] + "…"


def _unique_strings(values: list[str | None]) -> list[str]:
    items: list[str] = []
    seen: set[str] = set()
    for value in values:
        if not value or value in seen:
            continue
        seen.add(value)
        items.append(value)
    return items


def build_lead_snapshot(agent_name: str, model_name: str | None) -> dict[str, Any]:
    agent_cfg = load_agent_config(agent_name)
    if agent_cfg is None:
        return {"tool_groups": [], "effective_tools": [], "subagent_enabled": False, "config_path": None}

    resolved_model_name = model_name or agent_cfg.model
    tools = get_available_tools(
        groups=agent_cfg.tool_groups,
        model_name=resolved_model_name,
        agent_role="lead",
        enable_task_tool=bool(agent_cfg.subagent_enabled),
    )
    return {
        "tool_groups": agent_cfg.tool_groups or [],
        "effective_tools": [tool.name for tool in tools],
        "subagent_enabled": bool(agent_cfg.subagent_enabled),
        "config_path": "backend/.deer-flow/agents/vesper/config.yaml",
    }


def build_subagent_snapshot(model_name: str | None) -> list[dict[str, Any]]:
    base_tools = get_available_tools(model_name=model_name, agent_role="subagent")
    items: list[dict[str, Any]] = []
    for cfg in list_subagents():
        if cfg is None:
            continue
        effective = _filter_tools(base_tools, cfg.tools, cfg.disallowed_tools)
        items.append(
            {
                "name": cfg.name,
                "description": cfg.description,
                "effective_tools": [tool.name for tool in effective],
                "allowlist": cfg.tools,
                "denylist": cfg.disallowed_tools,
                "source_of_truth": _SUBAGENT_SOURCE_MAP.get(cfg.name, "backend/src/subagents/builtins/__init__.py"),
            }
        )
    return items


def build_skills_snapshot() -> dict[str, Any]:
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
        "load_events": [],
    }


def build_memory_snapshot(context_snapshot: dict[str, Any]) -> dict[str, Any]:
    recall_event = None
    for section in context_snapshot.get("sections", []) or []:
        if section.get("section_key") != "memory":
            continue
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
        "recall_event": recall_event,
        "retain_events": [],
    }


def build_runtime_snapshot(
    *,
    agent_name: str,
    model_name: str | None,
    context_snapshot: dict[str, Any],
    context_signature: str | None = None,
    context_reused: bool | None = None,
    thread_id: str | None = None,
    visible_message_count: int | None = None,
    context_window_size: int | None = None,
    snapshot_source: str = "before_model",
) -> dict[str, Any]:
    lead = build_lead_snapshot(agent_name, model_name)
    subagents = build_subagent_snapshot(model_name)
    skills = build_skills_snapshot()
    memory = build_memory_snapshot(context_snapshot)
    source_paths = _unique_strings(
        [
            *SOURCE_OF_TRUTH,
            *(context_snapshot.get("source_of_truth", []) or []),
            lead.get("config_path"),
            *[subagent.get("source_of_truth") for subagent in subagents],
        ]
    )

    return {
        "snapshot_schema_version": 2,
        "agent_name": agent_name,
        "model_name": model_name,
        "thread_id": thread_id,
        "context_snapshot": context_snapshot,
        "lead": lead,
        "subagents": subagents,
        "skills": skills,
        "memory": memory,
        "source_of_truth": source_paths,
        "provenance": {
            "snapshot_source": snapshot_source,
            "context_signature": context_signature,
            "context_reused": context_reused,
            "visible_message_count": visible_message_count,
            "context_window_size": context_window_size,
        },
        "warnings": [],
    }
