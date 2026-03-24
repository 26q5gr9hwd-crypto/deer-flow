"""VESPER Context Middleware - thin single-pass context injection.

For the VESPER agent, DeerFlow's system_prompt is intentionally empty and this
middleware injects one stable SystemMessage. The compiled context is built once
per user turn and cached in thread state. Subsequent tool-loop re-entry reuses
that exact compiled context instead of rebuilding memories / skills / prompt
sections again.

Design rules for STAB-2:
- Stable system prompt per user turn
- No full skill-body auto-injection
- No always-visible capabilities directory in the default prompt
- Conversation window trimming may still change between loop turns
- Skills remain available on demand through tools, not prompt furniture
"""

import hashlib
import logging
from typing import Any, override

from langchain.agents import AgentState
from langchain.agents.middleware import AgentMiddleware
from langchain_core.messages import SystemMessage

from src.runtime_snapshot import build_runtime_snapshot
from vesper_context import assemble_context_details

logger = logging.getLogger(__name__)

_SYSTEM_MSG_ID = "vesper-system-prompt"
DEFAULT_CONTEXT_WINDOW = 10


class VesperContextMiddlewareState(AgentState):
    """Compatible with the ThreadState schema."""

    pass


class VesperContextMiddleware(AgentMiddleware[VesperContextMiddlewareState]):
    """Inject a stable VESPER context block before each model call."""

    MAX_MESSAGE_WINDOW = DEFAULT_CONTEXT_WINDOW
    state_schema = VesperContextMiddlewareState

    def _resolve_window_size(self, state) -> int:
        raw_window = state.get("context_window_size", None)
        if isinstance(raw_window, int) and raw_window > 0:
            return raw_window
        return DEFAULT_CONTEXT_WINDOW

    def _latest_human_signature(self, messages) -> tuple[str, str]:
        latest_human = None
        human_count = 0
        for msg in messages:
            if getattr(msg, "type", None) == "human":
                human_count += 1
                latest_human = msg

        if latest_human is None:
            return "no-human", ""

        content = getattr(latest_human, "content", "")
        if isinstance(content, str):
            user_message = content
        elif isinstance(content, list):
            user_message = " ".join(part.get("text", "") for part in content if isinstance(part, dict))
        else:
            user_message = str(content)

        msg_id = getattr(latest_human, "id", None) or ""
        digest = hashlib.sha1(user_message.encode("utf-8")).hexdigest()[:12]
        signature = f"human:{human_count}:{msg_id}:{digest}"
        return signature, user_message

    def _decorate_snapshot(self, snapshot: dict[str, Any], *, signature: str, reused: bool, window_size: int, visible_message_count: int) -> dict[str, Any]:
        enriched = dict(snapshot)
        enriched["compiled_context_signature"] = signature
        enriched["compiled_context_reused"] = reused
        enriched["context_event"] = "reused" if reused else "built"
        enriched["context_window_size"] = window_size
        enriched["visible_message_count"] = visible_message_count
        return enriched

    @override
    def before_model(self, state, runtime):
        messages = state.get("messages", [])
        window_size = self._resolve_window_size(state)
        signature, user_message = self._latest_human_signature(messages)

        cached_signature = state.get("vesper_context_signature")
        cached_context = state.get("vesper_compiled_context")
        cached_snapshot = state.get("vesper_context_snapshot")

        rebuilt = not (
            isinstance(cached_context, str)
            and cached_context.strip()
            and isinstance(cached_snapshot, dict)
            and cached_signature == signature
        )

        if rebuilt:
            snapshot = assemble_context_details(user_message)
            context = snapshot["full_compiled_context"]
        else:
            snapshot = dict(cached_snapshot)
            context = cached_context

        non_system = [msg for msg in messages if getattr(msg, "type", None) != "system"]
        if len(non_system) > window_size:
            non_system = non_system[-window_size:]

        snapshot = self._decorate_snapshot(
            snapshot,
            signature=signature,
            reused=not rebuilt,
            window_size=window_size,
            visible_message_count=len(non_system),
        )

        config = getattr(runtime, "config", {}) or {}
        configurable = config.get("configurable", {}) if isinstance(config, dict) else {}
        metadata = config.get("metadata", {}) if isinstance(config, dict) else {}
        agent_name = configurable.get("agent_name") or metadata.get("agent_name") or "vesper"
        model_name = configurable.get("model_name") or metadata.get("model_name")
        thread_id = runtime.context.get("thread_id") if getattr(runtime, "context", None) else None

        run_snapshot = build_runtime_snapshot(
            agent_name=agent_name,
            model_name=model_name,
            context_snapshot=snapshot,
            context_signature=signature,
            context_reused=not rebuilt,
            thread_id=thread_id,
            visible_message_count=len(non_system),
            context_window_size=window_size,
            snapshot_source="before_model",
        )

        sys_msg = SystemMessage(content=context, id=_SYSTEM_MSG_ID)

        ctx_tokens = len(context) // 4
        conv_tokens = sum(len(str(getattr(msg, "content", ""))) // 4 for msg in non_system)
        logger.info(
            "VESPER-STAB-2 context_%s sig=%s system=%d conv=%d msgs=%d/%d",
            "built" if rebuilt else "reused",
            signature,
            ctx_tokens,
            conv_tokens,
            len(non_system),
            window_size,
        )

        update = {
            "messages": [sys_msg] + non_system,
            "vesper_context_signature": signature,
            "vesper_compiled_context": context,
            "vesper_context_snapshot": snapshot,
            "vesper_run_snapshot": run_snapshot,
        }
        return update
