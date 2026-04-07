"""Task tool for delegating work to subagents."""

import logging
import time
import uuid
from dataclasses import replace
from datetime import datetime, timezone
from typing import Annotated, Any

from langchain.tools import InjectedToolCallId, ToolRuntime, tool
from langgraph.config import get_stream_writer
from langgraph.typing import ContextT

from src.agents.lead_agent.prompt import get_skills_prompt_section
from src.agents.thread_state import ThreadState
from src.subagents import SubagentExecutor, get_subagent_config
from src.subagents.executor import SubagentStatus, cleanup_background_task, get_background_task_result
from src.subagents.registry import get_subagent_names

logger = logging.getLogger(__name__)


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _preview_text(value: Any, limit: int = 500) -> str | None:
    if value is None:
        return None
    compact = " ".join(str(value).split())
    if not compact:
        return None
    return compact if len(compact) <= limit else compact[:limit] + "…"


def _ensure_delegation_runs(runtime: ToolRuntime[ContextT, ThreadState] | None) -> dict[str, dict[str, Any]]:
    if runtime is None or runtime.state is None:
        return {}
    runs = runtime.state.get("vesper_delegation_runs")
    if not isinstance(runs, dict):
        runs = {}
        runtime.state["vesper_delegation_runs"] = runs
    return runs


def _get_existing_active_claim(runtime: ToolRuntime[ContextT, ThreadState] | None, task_id: str) -> dict[str, Any] | None:
    runs = _ensure_delegation_runs(runtime)
    existing = runs.get(task_id)
    if not isinstance(existing, dict):
        return None
    claim = existing.get("claim")
    if isinstance(claim, dict) and claim.get("status") == "claimed":
        return existing
    return None


def _upsert_delegation_run(runtime: ToolRuntime[ContextT, ThreadState] | None, task_id: str, payload: dict[str, Any]) -> None:
    runs = _ensure_delegation_runs(runtime)
    if not runs and (runtime is None or runtime.state is None):
        return
    prior = runs.get(task_id, {}) if isinstance(runs.get(task_id), dict) else {}
    runs[task_id] = {**prior, **payload}


def _record_started(
    runtime: ToolRuntime[ContextT, ThreadState] | None,
    *,
    task_id: str,
    description: str,
    prompt: str,
    subagent_type: str,
    trace_id: str | None,
    thread_id: str | None,
) -> None:
    now = _now_iso()
    _upsert_delegation_run(
        runtime,
        task_id,
        {
            "task_id": task_id,
            "description": description,
            "prompt_preview": _preview_text(prompt),
            "subagent_type": subagent_type,
            "trace_id": trace_id,
            "thread_id": thread_id,
            "status": "running",
            "terminal_state": None,
            "claim": {
                "status": "claimed",
                "owner_type": subagent_type,
                "owner_id": task_id,
                "claimed_at": now,
                "released_at": None,
            },
            "ai_message_count": 0,
            "latest_message_preview": None,
            "result_preview": None,
            "result_chars": None,
            "error": None,
            "started_at": now,
            "updated_at": now,
            "completed_at": None,
            "lineage": {
                "thread_id": thread_id,
                "parent_tool_call_id": task_id,
                "trace_id": trace_id,
            },
        },
    )


def _record_progress(runtime: ToolRuntime[ContextT, ThreadState] | None, *, task_id: str, message: dict[str, Any], total_messages: int) -> None:
    _upsert_delegation_run(
        runtime,
        task_id,
        {
            "status": "running",
            "ai_message_count": total_messages,
            "latest_message_preview": _preview_text(message.get("content") or message),
            "updated_at": _now_iso(),
        },
    )


def _record_terminal(
    runtime: ToolRuntime[ContextT, ThreadState] | None,
    *,
    task_id: str,
    status: str,
    result_text: str | None = None,
    error_text: str | None = None,
    ai_message_count: int | None = None,
    release_claim: bool = True,
) -> None:
    now = _now_iso()
    update: dict[str, Any] = {
        "status": status,
        "terminal_state": status,
        "updated_at": now,
        "completed_at": now,
        "result_preview": _preview_text(result_text),
        "result_chars": len(result_text) if isinstance(result_text, str) else None,
        "error": error_text,
    }
    if ai_message_count is not None:
        update["ai_message_count"] = ai_message_count
    if release_claim:
        prior = _ensure_delegation_runs(runtime).get(task_id, {})
        prior_claim = prior.get("claim") if isinstance(prior, dict) else None
        owner_type = prior_claim.get("owner_type") if isinstance(prior_claim, dict) else None
        owner_id = prior_claim.get("owner_id") if isinstance(prior_claim, dict) else task_id
        claimed_at = prior_claim.get("claimed_at") if isinstance(prior_claim, dict) else None
        update["claim"] = {
            "status": "released",
            "owner_type": owner_type,
            "owner_id": owner_id,
            "claimed_at": claimed_at,
            "released_at": now,
        }
    _upsert_delegation_run(runtime, task_id, update)


@tool("task", parse_docstring=True)
def task_tool(
    runtime: ToolRuntime[ContextT, ThreadState],
    description: str,
    prompt: str,
    subagent_type: str,
    tool_call_id: Annotated[str, InjectedToolCallId],
    max_turns: int | None = None,
) -> str:
    """Delegate a task to a specialized subagent that runs in its own context.

    Subagents help you:
    - Preserve context by keeping exploration and implementation separate
    - Handle complex multi-step tasks autonomously
    - Execute commands or operations in isolated contexts

    Available subagent types are registered dynamically. Common types:
    - **web-researcher**: Deep web research across multiple sources
    - **bash**: Command execution (git, build, deploy)
    - **vesper-code-reader**: Read-only code exploration and explanation
    - **vesper-code-writer**: Code change generation (output only, no disk writes)

    When to use this tool:
    - Complex tasks requiring multiple steps or tools
    - Tasks that produce verbose output
    - When you want to isolate context from the main conversation
    - Parallel research or exploration tasks

    When NOT to use this tool:
    - Simple, single-step operations (use tools directly)
    - Tasks requiring user interaction or clarification

    Args:
        description: A short (3-5 word) description of the task for logging/display. ALWAYS PROVIDE THIS PARAMETER FIRST.
        prompt: The task description for the subagent. Be specific and clear about what needs to be done. ALWAYS PROVIDE THIS PARAMETER SECOND.
        subagent_type: The type of subagent to use. ALWAYS PROVIDE THIS PARAMETER THIRD.
        max_turns: Optional maximum number of agent turns. Defaults to subagent's configured max.
    """
    # Get subagent configuration
    config = get_subagent_config(subagent_type)
    if config is None:
        available = get_subagent_names()
        return f"Error: Unknown subagent type '{subagent_type}'. Available: {', '.join(available)}"

    # Build config overrides
    overrides: dict = {}

    skills_section = get_skills_prompt_section()
    if skills_section:
        overrides["system_prompt"] = config.system_prompt + "\n\n" + skills_section

    if max_turns is not None:
        overrides["max_turns"] = max_turns

    if overrides:
        config = replace(config, **overrides)

    # Extract parent context from runtime
    sandbox_state = None
    thread_data = None
    thread_id = None
    parent_model = None
    trace_id = None

    if runtime is not None:
        sandbox_state = runtime.state.get("sandbox")
        thread_data = runtime.state.get("thread_data")
        thread_id = runtime.context.get("thread_id")

        # Try to get parent model from configurable
        metadata = runtime.config.get("metadata", {})
        parent_model = metadata.get("model_name")

        # Get or generate trace_id for distributed tracing
        trace_id = metadata.get("trace_id") or str(uuid.uuid4())[:8]

    existing_claim = _get_existing_active_claim(runtime, tool_call_id)
    if existing_claim is not None:
        claim = existing_claim.get("claim", {}) if isinstance(existing_claim, dict) else {}
        owner_type = claim.get("owner_type") or subagent_type
        return f"Task already claimed by active owner '{owner_type}' for task_id={tool_call_id}. Wait for terminal result before retrying."

    # Get available tools (excluding task tool to prevent nesting)
    # Lazy import to avoid circular dependency
    from src.tools import get_available_tools

    # Subagents should not have subagent tools enabled (prevent recursive nesting)
    tools = get_available_tools(model_name=parent_model, agent_role="subagent")

    # Create executor
    executor = SubagentExecutor(
        config=config,
        tools=tools,
        parent_model=parent_model,
        sandbox_state=sandbox_state,
        thread_data=thread_data,
        thread_id=thread_id,
        trace_id=trace_id,
    )

    # Start background execution (always async to prevent blocking)
    # Use tool_call_id as task_id for better traceability
    task_id = executor.execute_async(prompt, task_id=tool_call_id)
    _record_started(
        runtime,
        task_id=task_id,
        description=description,
        prompt=prompt,
        subagent_type=subagent_type,
        trace_id=trace_id,
        thread_id=thread_id,
    )

    # Poll for task completion in backend (removes need for LLM to poll)
    poll_count = 0
    last_status = None
    last_message_count = 0  # Track how many AI messages we've already sent
    # Polling timeout: execution timeout + 60s buffer, checked every 5s
    max_poll_count = (config.timeout_seconds + 60) // 5

    logger.info(f"[trace={trace_id}] Started background task {task_id} (subagent={subagent_type}, timeout={config.timeout_seconds}s, polling_limit={max_poll_count} polls)")

    writer = get_stream_writer()
    # Send Task Started message
    writer({"type": "task_started", "task_id": task_id, "description": description})

    while True:
        result = get_background_task_result(task_id)

        if result is None:
            logger.error(f"[trace={trace_id}] Task {task_id} not found in background tasks")
            writer({"type": "task_failed", "task_id": task_id, "error": "Task disappeared from background tasks"})
            _record_terminal(runtime, task_id=task_id, status="failed", error_text="Task disappeared from background tasks")
            cleanup_background_task(task_id)
            return f"Error: Task {task_id} disappeared from background tasks"

        # Log status changes for debugging
        if result.status != last_status:
            logger.info(f"[trace={trace_id}] Task {task_id} status: {result.status.value}")
            last_status = result.status

        # Check for new AI messages and send task_running events
        current_message_count = len(result.ai_messages)
        if current_message_count > last_message_count:
            # Send task_running event for each new message
            for i in range(last_message_count, current_message_count):
                message = result.ai_messages[i]
                writer(
                    {
                        "type": "task_running",
                        "task_id": task_id,
                        "message": message,
                        "message_index": i + 1,  # 1-based index for display
                        "total_messages": current_message_count,
                    }
                )
                _record_progress(runtime, task_id=task_id, message=message, total_messages=current_message_count)
                logger.info(f"[trace={trace_id}] Task {task_id} sent message #{i + 1}/{current_message_count}")
            last_message_count = current_message_count

        # Check if task completed, failed, or timed out
        if result.status == SubagentStatus.COMPLETED:
            writer({"type": "task_completed", "task_id": task_id, "result": result.result})
            logger.info(f"[trace={trace_id}] Task {task_id} completed after {poll_count} polls")
            _record_terminal(
                runtime,
                task_id=task_id,
                status="completed",
                result_text=result.result,
                ai_message_count=current_message_count,
            )
            cleanup_background_task(task_id)
            return f"Task Succeeded. Result: {result.result}"
        elif result.status == SubagentStatus.FAILED:
            writer({"type": "task_failed", "task_id": task_id, "error": result.error})
            logger.error(f"[trace={trace_id}] Task {task_id} failed: {result.error}")
            _record_terminal(
                runtime,
                task_id=task_id,
                status="failed",
                error_text=result.error,
                ai_message_count=current_message_count,
            )
            cleanup_background_task(task_id)
            return f"Task failed. Error: {result.error}"
        elif result.status == SubagentStatus.TIMED_OUT:
            writer({"type": "task_timed_out", "task_id": task_id, "error": result.error})
            logger.warning(f"[trace={trace_id}] Task {task_id} timed out: {result.error}")
            _record_terminal(
                runtime,
                task_id=task_id,
                status="timed_out",
                error_text=result.error,
                ai_message_count=current_message_count,
            )
            cleanup_background_task(task_id)
            return f"Task timed out. Error: {result.error}"

        # Still running, wait before next poll
        time.sleep(5)  # Poll every 5 seconds
        poll_count += 1

        # Polling timeout as a safety net (in case thread pool timeout doesn't work)
        # Set to execution timeout + 60s buffer, in 5s poll intervals
        # This catches edge cases where the background task gets stuck
        # Note: We don't call cleanup_background_task here because the task may
        # still be running in the background. The cleanup will happen when the
        # executor completes and sets a terminal status.
        if poll_count > max_poll_count:
            timeout_minutes = config.timeout_seconds // 60
            logger.error(f"[trace={trace_id}] Task {task_id} polling timed out after {poll_count} polls (should have been caught by thread pool timeout)")
            writer({"type": "task_timed_out", "task_id": task_id})
            _upsert_delegation_run(
                runtime,
                task_id,
                {
                    "status": "polling_timeout",
                    "updated_at": _now_iso(),
                    "error": "Polling timed out before a terminal subagent result was observed",
                },
            )
            return f"Task polling timed out after {timeout_minutes} minutes. This may indicate the background task is stuck. Status: {result.status.value}"
