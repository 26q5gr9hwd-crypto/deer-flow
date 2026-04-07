from typing import Annotated, Any, NotRequired, TypedDict

from langchain.agents import AgentState


class SandboxState(TypedDict):
    sandbox_id: NotRequired[str | None]


class ThreadDataState(TypedDict):
    workspace_path: NotRequired[str | None]
    uploads_path: NotRequired[str | None]
    outputs_path: NotRequired[str | None]


class ViewedImageData(TypedDict):
    base64: str
    mime_type: str


class DelegationClaimState(TypedDict, total=False):
    status: str
    owner_type: str
    owner_id: str
    claimed_at: str
    released_at: str | None


class DelegationRunState(TypedDict, total=False):
    task_id: str
    description: str
    prompt_preview: str
    subagent_type: str
    trace_id: str | None
    thread_id: str | None
    status: str
    terminal_state: str | None
    claim: DelegationClaimState
    ai_message_count: int
    latest_message_preview: str | None
    result_preview: str | None
    result_chars: int | None
    error: str | None
    started_at: str
    updated_at: str
    completed_at: str | None
    lineage: dict[str, Any]


def merge_artifacts(existing: list[str] | None, new: list[str] | None) -> list[str]:
    """Reducer for artifacts list - merges and deduplicates artifacts."""
    if existing is None:
        return new or []
    if new is None:
        return existing
    return list(dict.fromkeys(existing + new))


def merge_viewed_images(existing: dict[str, ViewedImageData] | None, new: dict[str, ViewedImageData] | None) -> dict[str, ViewedImageData]:
    """Reducer for viewed_images dict - merges image dictionaries.

    Special case: If new is an empty dict {}, it clears the existing images.
    This allows middlewares to clear the viewed_images state after processing.
    """
    if existing is None:
        return new or {}
    if new is None:
        return existing
    if len(new) == 0:
        return {}
    return {**existing, **new}


def merge_delegation_runs(
    existing: dict[str, DelegationRunState] | None,
    new: dict[str, DelegationRunState] | None,
) -> dict[str, DelegationRunState]:
    """Reducer for delegation run state - merges per-task records by task_id."""
    if existing is None:
        return new or {}
    if new is None:
        return existing
    merged = dict(existing)
    for task_id, payload in new.items():
        prior = merged.get(task_id, {})
        merged[task_id] = {**prior, **payload}
    return merged


class ThreadState(AgentState):
    sandbox: NotRequired[SandboxState | None]
    thread_data: NotRequired[ThreadDataState | None]
    title: NotRequired[str | None]
    artifacts: Annotated[list[str], merge_artifacts]
    todos: NotRequired[list | None]
    uploaded_files: NotRequired[list[dict] | None]
    viewed_images: Annotated[dict[str, ViewedImageData], merge_viewed_images]
    context_window_size: NotRequired[int | None]
    vesper_context_signature: NotRequired[str | None]
    vesper_compiled_context: NotRequired[str | None]
    vesper_context_snapshot: NotRequired[dict[str, Any] | None]
    vesper_run_snapshot: NotRequired[dict[str, Any] | None]
    vesper_delegation_runs: Annotated[dict[str, DelegationRunState], merge_delegation_runs]
