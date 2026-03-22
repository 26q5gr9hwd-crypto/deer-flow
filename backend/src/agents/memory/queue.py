"""Memory update queue with debounce mechanism and two-layer extraction policy.

VESPER-27: Wired vesper_hindsight.retain() into both extraction paths
(_run_immediate_extraction and _process_queue). Previously update_memory()
extracted facts but never wrote episodes to Hindsight.

VESPER-FIX-11: Structured extraction (facts/entities/relations/corrections)
is now also wired to Hindsight via _write_structured_to_hindsight() in
updater.py. The stale comment about "wired in a future pass" has been removed.
"""

import asyncio
import logging
import re
import threading
import time
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from src.config.memory_config import get_memory_config

logger = logging.getLogger(__name__)


@dataclass
class ConversationContext:
    """Context for a conversation to be processed for memory update."""

    thread_id: str
    messages: list[Any]
    timestamp: datetime = field(default_factory=datetime.utcnow)
    agent_name: str | None = None


def _get_last_user_message(messages: list[Any]) -> str | None:
    """Extract the last user message text from a message list."""
    for msg in reversed(messages):
        role = getattr(msg, 'type', 'unknown')
        if role == 'human':
            content = getattr(msg, 'content', '')
            if isinstance(content, list):
                text_parts = [
                    p.get('text', '') for p in content
                    if isinstance(p, dict) and 'text' in p
                ]
                content = ' '.join(text_parts)
            content = str(content).strip()
            content = re.sub(
                r'<uploaded_files>[\s\S]*?</uploaded_files>\n*',
                '', content,
            ).strip()
            if content:
                return content
    return None


def _build_conversation_text(messages: list[Any]) -> str:
    """Build a plain-text conversation string for Hindsight retain().

    VESPER-27: Formats the last user+assistant turn (or last few turns)
    into a single text blob suitable for Hindsight episodic storage.
    Skips tool-call messages. Falls back to last user message only.
    """
    pairs = []
    current_user = None
    for msg in messages:
        role = getattr(msg, 'type', 'unknown')
        content = getattr(msg, 'content', '')
        if isinstance(content, list):
            text_parts = [
                p.get('text', '') for p in content
                if isinstance(p, dict) and 'text' in p
            ]
            content = ' '.join(text_parts) if text_parts else str(content)
        content = str(content).strip()
        if role == 'human' and content:
            content = re.sub(
                r'<uploaded_files>[\s\S]*?</uploaded_files>\n*',
                '', content,
            ).strip()
            if content:
                current_user = content
        elif role == 'ai' and current_user and content:
            tool_calls = getattr(msg, 'tool_calls', None)
            if not tool_calls:
                pairs.append((current_user, content))
                current_user = None

    if not pairs and current_user:
        return f"User: {current_user}"

    # Use the last up to 3 turns
    recent = pairs[-3:] if len(pairs) > 3 else pairs
    lines = []
    for user_msg, asst_msg in recent:
        lines.append(f"User: {user_msg}")
        lines.append(f"Assistant: {asst_msg[:1000]}")
    return '\n'.join(lines)


class MemoryUpdateQueue:
    """Queue for memory updates with two-layer extraction policy.

    - Immediate: corrections, preferences, decisions -> extract now in bg thread
    - Debounced: general conversation -> buffer and extract after debounce period
    - Skip: trivial messages -> no extraction
    """

    def __init__(self):
        """Initialize the memory update queue."""
        self._queue: list[ConversationContext] = []
        self._lock = threading.Lock()
        self._timer: threading.Timer | None = None
        self._processing = False

    def add(self, thread_id: str, messages: list[Any], agent_name: str | None = None) -> None:
        """Add a conversation to the update queue.

        Classifies the last user message and either:
        - Runs extraction immediately in a background thread
        - Queues for debounced extraction
        - Skips entirely for trivial messages

        Args:
            thread_id: The thread ID.
            messages: The conversation messages.
            agent_name: If provided, memory is stored per-agent.
        """
        config = get_memory_config()
        if not config.enabled:
            return

        from src.agents.memory.updater import classify_extraction

        last_user_msg = _get_last_user_message(messages)
        if not last_user_msg:
            return

        classification = classify_extraction(last_user_msg)

        if classification == 'skip':
            logger.debug(f"Queue: skipping trivial message in thread {thread_id}")
            return

        if classification == 'immediate':
            logger.info(f"Queue: immediate extraction for thread {thread_id}")
            t = threading.Thread(
                target=self._run_immediate_extraction,
                args=(messages, thread_id, agent_name),
                daemon=True,
            )
            t.start()
            return

        # classification == 'debounced'
        context = ConversationContext(
            thread_id=thread_id,
            messages=messages,
            agent_name=agent_name,
        )

        with self._lock:
            self._queue = [c for c in self._queue if c.thread_id != thread_id]
            self._queue.append(context)
            self._reset_timer()

        logger.info(
            f"Queue: debounced extraction queued for thread {thread_id}, "
            f"queue size: {len(self._queue)}"
        )

    def _run_immediate_extraction(
        self, messages: list[Any], thread_id: str, agent_name: str | None
    ) -> None:
        """Run extraction immediately for high-priority messages."""
        try:
            from src.agents.memory.updater import MemoryUpdater
            import vesper_hindsight

            updater = MemoryUpdater()
            success = updater.update_memory(
                messages=messages,
                thread_id=thread_id,
                agent_name=agent_name,
            )
            status = "succeeded" if success else "skipped/failed"
            logger.info(f"Immediate extraction {status} for thread {thread_id}")

            # Two writes to Hindsight are intentional:
            # 1. update_memory() above runs structured LLM extraction (facts/entities/
            #    relations/corrections) — VESPER-FIX-11: now wired to Hindsight via
            #    _write_structured_to_hindsight() in updater.py.
            # 2. retain() below writes raw conversation text for episodic recall.
            # These are complementary, not duplicates.
            conv_text = _build_conversation_text(messages)
            if conv_text:
                ep_ok = asyncio.run(vesper_hindsight.retain(
                    conv_text,
                    metadata={"source_description": f"thread:{thread_id}", "group_id": "vesper"},
                ))
                if ep_ok:
                    logger.info(f"[VESPER-27] retain OK (immediate) for thread {thread_id}")
                    print(f"[VESPER-27] retain OK (immediate) thread={thread_id}", flush=True)
                else:
                    logger.warning(f"[VESPER-27] retain failed (immediate) for thread {thread_id}")
            else:
                logger.debug(f"[VESPER-27] No conversation text for retain, thread {thread_id}")

        except Exception as e:
            logger.error(f"Immediate extraction error for thread {thread_id}: {e}")

    def _reset_timer(self) -> None:
        """Reset the debounce timer."""
        config = get_memory_config()

        if self._timer is not None:
            self._timer.cancel()

        self._timer = threading.Timer(
            config.debounce_seconds,
            self._process_queue,
        )
        self._timer.daemon = True
        self._timer.start()

    def _process_queue(self) -> None:
        """Process all queued (debounced) conversation contexts."""
        from src.agents.memory.updater import MemoryUpdater
        import vesper_hindsight

        with self._lock:
            if self._processing:
                self._reset_timer()
                return

            if not self._queue:
                return

            contexts_to_process = list(self._queue)
            self._queue.clear()
            self._processing = True

        try:
            updater = MemoryUpdater()

            for context in contexts_to_process:
                try:
                    success = updater.update_memory(
                        messages=context.messages,
                        thread_id=context.thread_id,
                        agent_name=context.agent_name,
                    )
                    status = "succeeded" if success else "skipped/failed"
                    logger.info(
                        f"Debounced extraction {status} for thread {context.thread_id}"
                    )

                    # Two writes to Hindsight are intentional:
                    # 1. update_memory() above runs structured LLM extraction (facts/entities/
                    #    relations/corrections) — VESPER-FIX-11: now wired to Hindsight via
                    #    _write_structured_to_hindsight() in updater.py.
                    # 2. retain() below writes raw conversation text for episodic recall.
                    # These are complementary, not duplicates.
                    conv_text = _build_conversation_text(context.messages)
                    if conv_text:
                        ep_ok = asyncio.run(vesper_hindsight.retain(
                            conv_text,
                            metadata={"source_description": f"thread:{context.thread_id}", "group_id": "vesper"},
                        ))
                        if ep_ok:
                            logger.info(
                                f"[VESPER-27] retain OK (debounced) for thread {context.thread_id}"
                            )
                            print(
                                f"[VESPER-27] retain OK (debounced) thread={context.thread_id}",
                                flush=True,
                            )
                        else:
                            logger.warning(
                                f"[VESPER-27] retain failed (debounced) for thread {context.thread_id}"
                            )
                    else:
                        logger.debug(
                            f"[VESPER-27] No conversation text for retain, "
                            f"thread {context.thread_id}"
                        )

                except Exception as e:
                    logger.error(
                        f"Error in debounced extraction for thread {context.thread_id}: {e}"
                    )

                if len(contexts_to_process) > 1:
                    time.sleep(0.5)

        finally:
            with self._lock:
                self._processing = False

    def flush(self) -> None:
        """Force immediate processing of the queue."""
        with self._lock:
            if self._timer is not None:
                self._timer.cancel()
                self._timer = None
        self._process_queue()

    def clear(self) -> None:
        """Clear the queue without processing."""
        with self._lock:
            if self._timer is not None:
                self._timer.cancel()
                self._timer = None
            self._queue.clear()
            self._processing = False

    @property
    def pending_count(self) -> int:
        """Get the number of pending updates."""
        with self._lock:
            return len(self._queue)

    @property
    def is_processing(self) -> bool:
        """Check if the queue is currently being processed."""
        with self._lock:
            return self._processing


# Global singleton instance
_memory_queue: MemoryUpdateQueue | None = None
_queue_lock = threading.Lock()


def get_memory_queue() -> MemoryUpdateQueue:
    """Get the global memory update queue singleton."""
    global _memory_queue
    with _queue_lock:
        if _memory_queue is None:
            _memory_queue = MemoryUpdateQueue()
        return _memory_queue


def reset_memory_queue() -> None:
    """Reset the global memory queue."""
    global _memory_queue
    with _queue_lock:
        if _memory_queue is not None:
            _memory_queue.clear()
        _memory_queue = None