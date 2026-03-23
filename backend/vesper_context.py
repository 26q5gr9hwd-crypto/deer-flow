"""VESPER Context Assembly Pipeline.

Assembles structured context for each message:
SOUL.md + datetime + Postgres projects/tasks + events + Hindsight memories (post-STAB runtime).
Target: ~800-1,700 tokens total (down from ~6,500+).
"""

import asyncio
import json
import logging
import os
from datetime import datetime, timezone

import psycopg2

logger = logging.getLogger(__name__)

# --- Hindsight memory backend ---
# Mem0 removed. Using vesper_hindsight module for search_memories_structured().


def _get_pg_connection():
    """Get Postgres connection to vesper database."""
    return psycopg2.connect(
        dbname="vesper",
        user="n8n",
        password="EHYUBBanhcbedheu391318hcehu",
        host="localhost",
        port=5432,
    )


def _load_soul() -> str:
    """Load SOUL.md content."""
    soul_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "vesper_soul.md")
    try:
        with open(soul_path) as f:
            return f.read().strip()
    except FileNotFoundError:
        logger.warning(f"SOUL.md not found at {soul_path}, using fallback")
        return "You are VESPER, Daniel's AI assistant. Be direct and helpful."


def _build_datetime_section(conn) -> str:
    """Build datetime + last interaction delta section. ~20 tokens."""
    now = datetime.now(timezone.utc)
    try:
        cur = conn.cursor()
        cur.execute("SELECT value FROM memory_metadata WHERE key = 'last_interaction_timestamp';")
        row = cur.fetchone()
        if row:
            from dateutil.parser import parse
            last = parse(row[0])
            delta = now - last
            secs = delta.total_seconds()
            if secs < 60:
                delta_str = "just now"
            elif secs < 3600:
                delta_str = f"{int(secs / 60)} minutes ago"
            elif secs < 86400:
                delta_str = f"{int(secs / 3600)} hours ago"
            else:
                delta_str = f"{int(delta.days)} days ago"
            return f"[DATETIME] {now.strftime('%Y-%m-%d %H:%M UTC')} (last message: {delta_str})"
        else:
            return f"[DATETIME] {now.strftime('%Y-%m-%d %H:%M UTC')} (first interaction)"
    except Exception as e:
        logger.warning(f"Failed to build datetime section: {e}")
        return f"[DATETIME] {now.strftime('%Y-%m-%d %H:%M UTC')}"


def _build_projects_section(conn) -> str | None:
    """Build active projects + tasks section from Postgres. ~100-200 tokens."""
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT p.name, p.status, p.priority,
                   COALESCE(json_agg(json_build_object(
                       'desc', t.description, 'status', t.status
                   )) FILTER (WHERE t.id IS NOT NULL), '[]')
            FROM projects p
            LEFT JOIN tasks t ON t.project_id = p.id AND t.status != 'done'
            WHERE p.status IN ('active', 'blocked')
            GROUP BY p.id, p.name, p.status, p.priority
            ORDER BY p.priority DESC
            LIMIT 5;
        """)
        projects = cur.fetchall()
        if not projects:
            return None
        lines = ["[ACTIVE PROJECTS]"]
        for name, status, priority, tasks_json in projects:
            tasks = json.loads(tasks_json) if isinstance(tasks_json, str) else tasks_json
            task_strs = [f"  - [{t['status']}] {t['desc']}" for t in tasks if t.get('desc')]
            lines.append(f"  {name} ({status}, P{priority})")
            lines.extend(task_strs[:5])
        return "\n".join(lines)
    except Exception as e:
        logger.warning(f"Failed to build projects section: {e}")
        return None


def _build_events_section(conn) -> str | None:
    """Build recent events section from Postgres. ~0-100 tokens."""
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT source, content, created_at
            FROM events
            WHERE created_at > (NOW() - INTERVAL '24 hours')
            ORDER BY created_at DESC
            LIMIT 5;
        """)
        events = cur.fetchall()
        if not events:
            return None
        lines = ["[WHAT'S CHANGED]"]
        for source, content, ts in events:
            lines.append(f"  [{source}] {content}")
        return "\n".join(lines)
    except Exception as e:
        logger.warning(f"Failed to build events section: {e}")
        return None


def _update_last_interaction(conn):
    """Update last interaction timestamp in Postgres."""
    try:
        now = datetime.now(timezone.utc)
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO memory_metadata (key, value, updated_at)
            VALUES ('last_interaction_timestamp', %s, NOW())
            ON CONFLICT (key) DO UPDATE SET value = %s, updated_at = NOW();
        """, (now.isoformat(), now.isoformat()))
        conn.commit()
    except Exception as e:
        logger.warning(f"Failed to update last interaction: {e}")


def _build_memories_section(message: str, user_id: str = "daniel",
                             skills_loaded: bool = False) -> str | None:
    """Build relevant memories section using Hindsight recall retrieval.

    VESPER-22: Upgraded to COMBINED_HYBRID_SEARCH_RRF (4-channel hybrid:
    semantic + BM25 + graph traversal + community) with structured sectioned output.

    VESPER-FIX-1: Fixed two bugs:
    - Bug 1: search_memories is async; a direct asyncio.run() bridge fails inside
      the live LangGraph event loop. Fix: use a sync wrapper that runs recall in a
      dedicated thread when a loop is already active.
    - Bug 2: search_memories returns a str, not a (facts, episodes) tuple.
      Fix: capture result as memories_text string directly.

    Dynamic token budget:
    - skills_loaded=True:  ~300 tokens (num_results=5)
    - skills_loaded=False: ~600 tokens (num_results=10)
    """
    try:
        from vesper_hindsight import search_memories_sync
        num_results = 5 if skills_loaded else 10

        memories_text = search_memories_sync(message, num_results=num_results)

        if not memories_text or not memories_text.strip():
            return None

        return memories_text
    except Exception as e:
        logger.warning(f"Failed to build memories section: {e}")
        return None


def assemble_context(message: str, user_id: str = "daniel",
                     skills_loaded: bool = False) -> str:
    """Assemble VESPER context block. Target ~800-1,700 tokens total.

    Sections:
    1. SOUL.md (~150-200 tokens) -- always
    2. Datetime + delta (~20 tokens) -- always
    3. Active projects + tasks (~100-200 tokens) -- from Postgres
    4. What's changed (~0-100 tokens) -- from Postgres events
    5. Relevant memories (~300-600 tokens) -- from Hindsight recall

    Args:
        message: The user's current message (used for memory retrieval query)
        user_id: User identifier for Hindsight recall context
        skills_loaded: Whether skills were loaded this turn. When True, memory
                       budget shrinks to ~300 tokens to leave room for skill content.
    """
    sections = []

    # 1. SOUL.md -- always injected
    sections.append(_load_soul())

    # 2-4. Postgres sections
    conn = None
    try:
        conn = _get_pg_connection()
        sections.append(_build_datetime_section(conn))

        proj = _build_projects_section(conn)
        if proj:
            sections.append(proj)

        events = _build_events_section(conn)
        if events:
            sections.append(events)

        _update_last_interaction(conn)
    except Exception as e:
        logger.error(f"Postgres connection failed: {e}")
        sections.append(f"[DATETIME] {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}")
    finally:
        if conn:
            try:
                conn.close()
            except Exception:
                pass

    # 5. Relevant memories from Hindsight (structured recall injection)
    mems = _build_memories_section(message, user_id, skills_loaded=skills_loaded)
    if mems:
        sections.append(mems)

    context = "\n\n".join(sections)
    token_estimate = len(context) // 4
    logger.info(
        f"VESPER context assembled: ~{token_estimate} tokens ({len(context)} chars), "
        f"skills_loaded={skills_loaded}"
    )

    return context