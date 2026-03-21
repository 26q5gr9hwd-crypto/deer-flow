"""VESPER Memory Extraction Pipeline — updater.py v3.0

Extraction pipeline that produces structured memory data for Graphiti add_episode().

Architecture:
- Two-layer extraction policy: immediate write + debounced write
- Single LLM call -> typed JSON output (facts + entities + relations + corrections + feedback)
- Graphiti handles entity extraction, dedup, and storage via add_episode()
- Extraction is async/background — never blocks user response
- Single unified extraction from both user messages and assistant responses

v3.0 changes (VESPER-17B):
- Removed legacy FalkorDB Cypher write code (Graphiti handles storage)
- Removed dead Mem0 code paths (get_mem0_client, _write_fact_to_mem0, _fact_already_stored)
- Removed dead dedup code (_compute_fact_hash, psycopg2, _written_hashes)
- Removed FalkorDB helpers (_escape_cypher, _cypher_props, write_entity/relation/correction_to_graph)
- Removed unused imports (hashlib, threading, unicodedata)
- Removed dead constants (NODE_TYPES, EDGE_TYPES, NAMESPACES, SOURCE_TYPES, _LB, _RB)
- Added feedback detection as extraction side output
- Cleaned up run_extraction() — returns extraction + feedback metadata

v2.4 changes (VESPER-13):
- Unified extraction: single LLM call extracts from both user and assistant
- Source tagging handled by unified prompt: observed (user) vs inferred (assistant)

VESPER-40:
- Added FileHandler -> /tmp/vesper_updater.log for extraction debugging
"""

import json
import logging
import os
import re
import sys
from datetime import datetime
from typing import Any

# v2.3: Ensure backend root is on sys.path for vesper_memory_config import
_BACKEND_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(
    os.path.dirname(os.path.abspath(__file__)))))
if _BACKEND_ROOT not in sys.path:
    sys.path.insert(0, _BACKEND_ROOT)

from src.agents.memory.prompt import COMBINED_EXTRACTION_PROMPT
from src.config.memory_config import get_memory_config

logger = logging.getLogger(__name__)

# v2.3: Ensure this logger actually outputs (default Python logging has no handlers)
if not logger.handlers:
    _handler = logging.StreamHandler(sys.stderr)
    _handler.setFormatter(logging.Formatter(
        '%(asctime)s [%(name)s] %(levelname)s: %(message)s'))
    logger.addHandler(_handler)
    logger.setLevel(logging.INFO)

# VESPER-40: File logger for extraction pipeline debugging
_updater_log = logging.getLogger('vesper.updater')
if not _updater_log.handlers:
    _fh = logging.FileHandler('/tmp/vesper_updater.log')
    _fh.setFormatter(logging.Formatter('%(asctime)s %(levelname)s %(message)s'))
    _updater_log.addHandler(_fh)
    _updater_log.setLevel(logging.INFO)


# --- Trivial Message & Immediate Trigger Detection ---

TRIVIAL_PATTERNS = [
    re.compile(
        r'^(hey|hi|hello|yo|sup|thanks|thx|thank you|ok|okay|k|lol|haha|heh|'
        r'hmm|mhm|yep|yup|nope|nah|cool|nice|great|awesome|sure|yeah|yes|no|'
        r'bye|cya|gn|gm|ty|np|gg|brb|afk|wb)[\s!?.]*$',
        re.IGNORECASE,
    ),
    re.compile(r'^\s*[\U0001F600-\U0001F64F\U0001F300-\U0001F5FF\U0001F680-\U0001F6FF'
               r'\U0001F1E0-\U0001F1FF\U00002702-\U000027B0\U0000FE00-\U0000FE0F'
               r'\U0001F900-\U0001F9FF\U0001FA00-\U0001FA6F\U0001FA70-\U0001FAFF]+\s*$'),
]

IMMEDIATE_TRIGGERS = [
    re.compile(r"(?i)(no,?\s+(i|it|that|we|actually)|not\s+\w+,?\s+(it\'?s|its|i)"
               r"|actually,?\s+(i|it|that|we)|i\s+meant|i\s+was\s+wrong)"),
    re.compile(r"(?i)(i\s+prefer|i\s+like|i\s+want|i\s+don\'?t\s+(like|want)"
               r"|i\s+hate|i\s+love|my\s+favorite|i\s+always\s+use)"),
    re.compile(r"(?i)(remember\s+(this|that)|note\s+(this|that)|don\'?t\s+forget"
               r"|keep\s+in\s+mind|fyi|for\s+your\s+info)"),
    re.compile(r"(?i)(i\s+(ate|eaten|had\s+\w+\s+for|took|feeling|feel\s+\w+"
               r"|slept|exercised|worked\s+out|ran|walked|weight|sick|tired))"),
    re.compile(r"(?i)(let\'?s\s+(go|do|use|pick|stick)|we\'?ll\s+(use|go|do)"
               r"|decided\s+to|going\s+with|i\'?ll\s+go\s+with|switching\s+to)"),
]

COMMAND_PATTERNS = [
    re.compile(r'^/(new|status|memory|help|models|fast|projects|tasks)'),
]


def classify_extraction(message: str) -> str:
    """Classify a user message for extraction policy.

    Returns:
        'immediate' - extract now (corrections, preferences, health, decisions)
        'debounced' - extract later (general conversation)
        'skip' - no extraction (trivial messages, commands)
    """
    text = message.strip()
    if not text or len(text) < 2:
        return 'skip'

    for pattern in COMMAND_PATTERNS:
        if pattern.match(text):
            return 'skip'

    for pattern in TRIVIAL_PATTERNS:
        if pattern.match(text):
            return 'skip'

    for pattern in IMMEDIATE_TRIGGERS:
        if pattern.search(text):
            return 'immediate'

    return 'debounced'


# --- Extraction LLM ---

def _call_extraction_llm(user_message: str, assistant_response: str = '') -> dict:
    """Call extraction LLM with the combined extraction prompt.

    v3.0: Now also extracts feedback detection fields.

    Returns parsed JSON dict with keys: facts, entities, relations, corrections,
    plus feedback fields: feedback_detected, feedback_score, feedback_text,
    contains_followup_question.
    Returns empty structure on failure.
    """
    empty = dict(
        facts=[], entities=[], relations=[], corrections=[],
        feedback_detected=False, feedback_score=0.0,
        feedback_text='', contains_followup_question=False,
    )

    try:
        from src.models import create_chat_model

        asst = assistant_response[:2000] if assistant_response else '(none)'
        prompt = (COMBINED_EXTRACTION_PROMPT
                  .replace('__USER_MESSAGE__', user_message)
                  .replace('__ASSISTANT_RESPONSE__', asst))

        model = create_chat_model(name='gpt-oss-120b', thinking_enabled=False)
        response = model.invoke(prompt)
        response_text = str(response.content).strip()

        # Strip markdown code blocks if present
        if response_text.startswith('```'):
            lines = response_text.split('\n')
            end_idx = -1 if lines[-1].strip().startswith('```') else len(lines)
            response_text = '\n'.join(lines[1:end_idx])

        result = json.loads(response_text)

        for key in ('facts', 'entities', 'relations', 'corrections'):
            if key not in result or not isinstance(result[key], list):
                result[key] = []

        # VESPER-17B: Parse feedback fields with graceful fallback
        result['feedback_detected'] = bool(result.get('feedback_detected', False))
        try:
            score = float(result.get('feedback_score', 0.0))
            result['feedback_score'] = max(0.0, min(5.0, score))
        except (TypeError, ValueError):
            result['feedback_score'] = 0.0
        result['feedback_text'] = str(result.get('feedback_text', '') or '')
        result['contains_followup_question'] = bool(
            result.get('contains_followup_question', False))

        return result

    except json.JSONDecodeError as e:
        logger.error(f"Extraction LLM returned invalid JSON: {e}")
        return empty
    except Exception as e:
        logger.error(f"Extraction LLM call failed: {e}")
        return empty


# --- Main Extraction Pipeline ---

_COUNT_KEYS = ('facts', 'entities', 'relations', 'corrections')


def run_extraction(
    user_message: str,
    assistant_response: str = '',
    classification: str = 'debounced',
) -> dict:
    """Run the combined extraction pipeline.

    v3.0: Extraction only. Graphiti handles storage via add_episode().
    Returns extraction results including feedback metadata for Graphiti
    episode tagging.

    Args:
        user_message: The user's message text
        assistant_response: The assistant's response (for context and extraction)
        classification: 'immediate' or 'debounced'

    Returns:
        Dict with counts (facts, entities, relations, corrections) plus
        feedback fields and raw _extraction data for Graphiti episode tagging.
    """
    result = dict(
        facts=0, entities=0, relations=0, corrections=0,
        feedback_detected=False, feedback_score=0.0,
        feedback_text='', contains_followup_question=False,
        _extraction=None,
    )

    # VESPER-40: Log extraction start to file
    _updater_log.info(
        "Extraction starting (%s): msg=%r",
        classification, user_message[:80]
    )

    try:
        extraction = _call_extraction_llm(user_message, assistant_response)

        # Count extracted items
        result['facts'] = len(extraction.get('facts', []))
        result['entities'] = len(extraction.get('entities', []))
        result['relations'] = len(extraction.get('relations', []))
        result['corrections'] = len(extraction.get('corrections', []))

        # VESPER-17B: Capture feedback metadata for Graphiti episode tagging
        result['feedback_detected'] = extraction.get('feedback_detected', False)
        result['feedback_score'] = extraction.get('feedback_score', 0.0)
        result['feedback_text'] = extraction.get('feedback_text', '')
        result['contains_followup_question'] = extraction.get(
            'contains_followup_question', False)

        # Store raw extraction for callers (e.g. Graphiti episode content)
        result['_extraction'] = extraction

        fb_tag = ''
        if result['feedback_detected']:
            fb_tag = f" [feedback: score={result['feedback_score']}]"

        log_msg = (
            f"Extraction complete ({classification}): "
            f"{result['facts']}F {result['entities']}E "
            f"{result['relations']}R {result['corrections']}C{fb_tag}"
        )
        logger.info(log_msg)
        # VESPER-40: Also write to file
        _updater_log.info(log_msg)

    except Exception as e:
        err_msg = f"Extraction pipeline failed: {type(e).__name__}: {e}"
        logger.error(err_msg)
        _updater_log.error(err_msg)

    return result


# --- Backward-Compatible Interface ---

class MemoryUpdater:
    """Updated MemoryUpdater using the VESPER extraction pipeline.

    v3.0: Extraction + feedback detection. Graphiti handles storage.
    Backward-compatible with the old MemoryUpdater interface used by queue.py.
    """

    def __init__(self, model_name: str | None = None):
        self._model_name = model_name

    def update_memory(
        self,
        messages: list[Any],
        thread_id: str | None = None,
        agent_name: str | None = None,
    ) -> bool:
        """Update memory based on conversation messages.

        v3.0: Extraction + feedback. Storage handled by Graphiti.
        """
        config = get_memory_config()
        if not config.enabled:
            _updater_log.info("Memory extraction disabled (config.enabled=False), skipping")
            return False

        if not messages:
            return False

        try:
            pairs = []
            current_user_msg = None

            for msg in messages:
                role = getattr(msg, 'type', 'unknown')
                content = getattr(msg, 'content', str(msg))

                if isinstance(content, list):
                    text_parts = [
                        p.get('text', '') for p in content
                        if isinstance(p, dict) and 'text' in p
                    ]
                    content = (
                        ' '.join(text_parts) if text_parts
                        else str(content))

                content = str(content).strip()

                if role == 'human' and content:
                    content = re.sub(
                        r'<uploaded_files>[\s\S]*?</uploaded_files>\n*',
                        '', content,
                    ).strip()
                    if content:
                        current_user_msg = content
                elif role == 'ai' and current_user_msg and content:
                    tool_calls = getattr(msg, 'tool_calls', None)
                    if not tool_calls:
                        pairs.append((current_user_msg, content))
                        current_user_msg = None

            if not pairs:
                _updater_log.info("No valid user/assistant pairs found, skipping extraction")
                return False

            _updater_log.info("update_memory: processing %d pair(s)", len(pairs))
            any_success = False

            for user_msg, assistant_resp in pairs:
                classification = classify_extraction(user_msg)

                if classification == 'skip':
                    logger.debug(f"Skipping trivial: {user_msg[:40]}")
                    _updater_log.info("Skipping trivial message: %r", user_msg[:40])
                    continue

                counts = run_extraction(
                    user_msg, assistant_resp, classification)
                if any(counts.get(k, 0) > 0 for k in _COUNT_KEYS):
                    any_success = True

            return any_success

        except Exception as e:
            logger.error(f"Memory update failed: {e}")
            _updater_log.error("Memory update failed: %s", e)
            return False


def update_memory_from_conversation(
    messages: list[Any],
    thread_id: str | None = None,
    agent_name: str | None = None,
) -> bool:
    """Convenience function to update memory from a conversation."""
    updater = MemoryUpdater()
    return updater.update_memory(messages, thread_id, agent_name)


# --- Legacy Compatibility Shims ---

def get_graphiti_client():
    """Stub for Graphiti client — returns None (used by memory/__init__.py)."""
    return None


def get_graph():
    """Stub for FalkorDB graph client — returns None (removed in v3.0, kept for backward compat)."""
    return None


def get_memory_data(agent_name: str | None = None) -> dict[str, Any]:
    """Get memory data. Returns empty structure for v2+ compatibility.

    NOTE: In VESPER v2+, memory injection is handled by
    vesper_context_middleware.py which queries Graphiti directly.
    """
    return dict(
        version='3.0',
        lastUpdated=datetime.utcnow().isoformat() + 'Z',
        user=dict(
            workContext=dict(summary='', updatedAt=''),
            personalContext=dict(summary='', updatedAt=''),
            topOfMind=dict(summary='', updatedAt=''),
        ),
        history=dict(
            recentMonths=dict(summary='', updatedAt=''),
            earlierContext=dict(summary='', updatedAt=''),
            longTermBackground=dict(summary='', updatedAt=''),
        ),
        facts=[],
    )


def reload_memory_data(agent_name: str | None = None) -> dict[str, Any]:
    """Reload memory data. Compatibility shim for v2+."""
    return get_memory_data(agent_name)