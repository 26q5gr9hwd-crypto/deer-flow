"""Memory module for DeerFlow — VESPER v2.

This module provides memory extraction and storage:
- Extracts facts, entities, and relations from conversations via LLM
- Stores facts in FalkorDB via Graphiti (VESPER-14)
- Stores entities and relations in FalkorDB
- Handles corrections (supersede old memories)
- Two-layer extraction: immediate (corrections, preferences) + debounced
"""

from src.agents.memory.prompt import (
    COMBINED_EXTRACTION_PROMPT,
    FACT_EXTRACTION_PROMPT,
    MEMORY_UPDATE_PROMPT,
    format_conversation_for_update,
    format_memory_for_injection,
)
from src.agents.memory.queue import (
    ConversationContext,
    MemoryUpdateQueue,
    get_memory_queue,
    reset_memory_queue,
)
from src.agents.memory.updater import (
    MemoryUpdater,
    classify_extraction,
    get_graph,
    get_graphiti_client,
    get_memory_data,
    reload_memory_data,
    run_extraction,
    update_memory_from_conversation,
)

__all__ = [
    # Prompt utilities
    "COMBINED_EXTRACTION_PROMPT",
    "MEMORY_UPDATE_PROMPT",
    "FACT_EXTRACTION_PROMPT",
    "format_memory_for_injection",
    "format_conversation_for_update",
    # Queue
    "ConversationContext",
    "MemoryUpdateQueue",
    "get_memory_queue",
    "reset_memory_queue",
    # Updater
    "MemoryUpdater",
    "classify_extraction",
    "run_extraction",
    "get_graphiti_client",
    "get_graph",
    "get_memory_data",
    "reload_memory_data",
    "update_memory_from_conversation",
]