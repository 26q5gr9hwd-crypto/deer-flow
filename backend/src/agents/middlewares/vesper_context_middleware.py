"""VESPER Context Middleware - thin single-pass context injection.

For the VESPER agent, DeerFlow's system_prompt is intentionally empty and this
middleware injects one stable SystemMessage. The compiled context is built once
per user turn and cached in thread state. Subsequent tool-loop re-entry reuses
that exact compiled context instead of rebuilding memories / skills / prompt
sections again.

Design rules for STAB-2 / STAB-10 / STAB-24:
- Stable system prompt per user turn
- No default capability-directory prompt furniture
- No full skill-body auto-injection
- Conversation window trimming may still change between loop turns
- Skills remain available on demand through load_skill
- Provider-facing requests must be trimmed explicitly at model-call time
"""

import hashlib
import logging
from collections.abc import Awaitable, Callable
from typing import Any, override

from langchain.agents import AgentState
from langchain.agents.middleware import AgentMiddleware
from langchain.agents.middleware.types import ModelCallResult, ModelRequest, ModelResponse
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

    def _decorate_snapshot(
        self,
        snapshot: dict[str, Any],
        *,
        signature: str,
        reused: bool,
        window_size: int,
        visible_message_count: int,
    ) -> dict[str, Any]:
        enriched = dict(snapshot)
        enriched["compiled_context_signature"] = signature
        enriched["compiled_context_reused"] = reused
        enriched["context_event"] = "reused" if reused else "built"
        enriched["context_window_size"] = window_size
        enriched["visible_message_count"] = visible_message_count
        return enriched

    def _prepare_context_payload(self, state, runtime, messages) -> dict[str, Any]:
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
        visible_messages = non_system[-window_size:] if len(non_system) > window_size else list(non_system)

        snapshot = self._decorate_snapshot(
            snapshot,
            signature=signature,
            reused=not rebuilt,
            window_size=window_size,
            visible_message_count=len(visible_messages),
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
            visible_message_count=len(visible_messages),
            context_window_size=window_size,
            snapshot_source="before_model",
        )

        return {
            "signature": signature,
            "context": context,
            "snapshot": snapshot,
            "run_snapshot": run_snapshot,
            "visible_messages": visible_messages,
            "window_size": window_size,
            "rebuilt": rebuilt,
        }

    def _build_request_override(self, request: ModelRequest) -> tuple[ModelRequest, int, int]:
        state = request.state or {}
        context = state.get("vesper_compiled_context")
        if not isinstance(context, str) or not context.strip():
            payload = self._prepare_context_payload(state, request.runtime, request.messages)
            context = payload["context"]

        non_system = [msg for msg in request.messages if getattr(msg, "type", None) != "system"]
        full_count = len(non_system)
        window_size = self._resolve_window_size(state)
        visible_messages = non_system[-window_size:] if len(non_system) > window_size else list(non_system)
        overridden = request.override(
            system_message=SystemMessage(content=context, id=_SYSTEM_MSG_ID),
            messages=visible_messages,
        )
        return overridden, full_count, len(visible_messages)

    @override
    def before_model(self, state, runtime):
        messages = state.get("messages", [])
        payload = self._prepare_context_payload(state, runtime, messages)

        ctx_tokens = len(payload["context"]) // 4
        conv_tokens = sum(len(str(getattr(msg, "content", ""))) // 4 for msg in payload["visible_messages"])
        logger.info(
            "VESPER-STAB-2 context_%s sig=%s system=%d conv=%d msgs=%d/%d",
            "built" if payload["rebuilt"] else "reused",
            payload["signature"],
            ctx_tokens,
            conv_tokens,
            len(payload["visible_messages"]),
            payload["window_size"],
        )

        return {
            "vesper_context_signature": payload["signature"],
            "vesper_compiled_context": payload["context"],
            "vesper_context_snapshot": payload["snapshot"],
            "vesper_run_snapshot": payload["run_snapshot"],
        }

    @override
    def wrap_model_call(
        self,
        request: ModelRequest,
        handler: Callable[[ModelRequest], ModelResponse],
    ) -> ModelCallResult:
        overridden, full_count, visible_count = self._build_request_override(request)
        logger.info(
            "VESPER-STAB-24 request_trimmed full_non_system=%d visible_non_system=%d",
            full_count,
            visible_count,
        )
        return handler(overridden)

    @override
    async def awrap_model_call(
        self,
        request: ModelRequest,
        handler: Callable[[ModelRequest], Awaitable[ModelResponse]],
    ) -> ModelCallResult:
        overridden, full_count, visible_count = self._build_request_override(request)
        logger.info(
            "VESPER-STAB-24 request_trimmed full_non_system=%d visible_non_system=%d",
            full_count,
            visible_count,
        )
        return await handler(overridden)
