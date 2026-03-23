"""VESPER Context Assembly Pipeline.

Assembles structured context for each message:
SOUL.md + datetime + Postgres projects/tasks + events + Hindsight memories (post-STAB runtime).
Target: ~800-1,700 tokens total (down from ~6,500+).
"""

import json
import logging
import os
from datetime import datetime, timezone
from typing import Any

import psycopg2

logger = logging.getLogger(__name__)


def _get_pg_connection():
    """Get Postgres connection to vesper database."""
    return psycopg2.connect(
        dbname="vesper",
        user="n8n",
        password="EHYUBBanhcbedheu391318hcehu",
        host="localhost",
        port=5432,
    )


def _preview_text(text: str, limit: int = 240) -> str:
    compact = " ".join((text or "").split())
    if len(compact) <= limit:
        return compact
    return compact[:limit] + "…"


def _make_section(section_key: str, source: str, content: str, **extra: Any) -> dict[str, Any]:
    return {
        "section_key": section_key,
        "source": source,
        "char_count": len(content),
        "approx_tokens": len(content) // 4,
        "included": bool(content.strip()),
        "preview": _preview_text(content),
        "content": content,
        **extra,
    }


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
        return f"[DATETIME] {now.strftime('%Y-%m-%d %H:%M UTC')} (first interaction)"
    except Exception as e:
        logger.warning(f"Failed to build datetime section: {e}")
        return f"[DATETIME] {now.strftime('%Y-%m-%d %H:%M UTC')}"


def _build_projects_section(conn) -> str | None:
    """Build active projects + tasks section from Postgres. ~100-200 tokens."""
    try:
        cur = conn.cursor()
        cur.execute(
            """
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
        """
        )
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
        cur.execute(
            """
            SELECT source, content, created_at
            FROM events
            WHERE created_at > (NOW() - INTERVAL '24 hours')
            ORDER BY created_at DESC
            LIMIT 5;
        """
        )
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
        cur.execute(
            """
            INSERT INTO memory_metadata (key, value, updated_at)
            VALUES ('last_interaction_timestamp', %s, NOW())
            ON CONFLICT (key) DO UPDATE SET value = %s, updated_at = NOW();
        """,
            (now.isoformat(), now.isoformat()),
        )
        conn.commit()
    except Exception as e:
        logger.warning(f"Failed to update last interaction: {e}")


def _build_memories_section_data(message: str, user_id: str = "daniel", skills_loaded: bool = False) -> dict[str, Any] | None:
    """Build relevant memories section using Hindsight recall retrieval."""
    try:
        from vesper_hindsight import search_memories_payload_sync

        num_results = 5 if skills_loaded else 10
        payload = search_memories_payload_sync(message, num_results=num_results)
        content = (payload.get("content") or "").strip()
        if not content:
            return None
        return {
            "content": content,
            "query": payload.get("query", message),
            "limit": payload.get("limit", num_results),
            "result_count": payload.get("result_count", 0),
            "trace_available": payload.get("trace_available", False),
            "trace_preview": payload.get("trace_preview"),
        }
    except Exception as e:
        logger.warning(f"Failed to build memories section: {e}")
        return None


def assemble_context_details(message: str, user_id: str = "daniel", skills_loaded: bool = False) -> dict[str, Any]:
    """Assemble structured context details and the compiled context string."""
    sections: list[dict[str, Any]] = []

    soul = _load_soul()
    sections.append(_make_section("identity", "backend/vesper_soul.md", soul))

    conn = None
    try:
        conn = _get_pg_connection()

        dt = _build_datetime_section(conn)
        sections.append(_make_section("datetime", "backend/vesper_context.py::_build_datetime_section", dt))

        proj = _build_projects_section(conn)
        if proj:
            sections.append(_make_section("state", "Postgres: projects + tasks", proj))

        events = _build_events_section(conn)
        if events:
            sections.append(_make_section("events", "Postgres: events", events))

        _update_last_interaction(conn)
    except Exception as e:
        logger.error(f"Postgres connection failed: {e}")
        fallback_dt = f"[DATETIME] {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}"
        sections.append(_make_section("datetime", "backend/vesper_context.py::fallback", fallback_dt))
    finally:
        if conn:
            try:
                conn.close()
            except Exception:
                pass

    mems = _build_memories_section_data(message, user_id, skills_loaded=skills_loaded)
    if mems:
        sections.append(
            _make_section(
                "memory",
                "backend/vesper_hindsight.py",
                mems["content"],
                recall_query=mems["query"],
                recall_limit=mems["limit"],
                recall_result_count=mems["result_count"],
                trace_available=mems["trace_available"],
                trace_preview=mems.get("trace_preview"),
            )
        )

    included_sections = [section for section in sections if section.get("included")]
    compiled_context = "\n\n".join(section["content"] for section in included_sections)
    total_tokens = sum(section["approx_tokens"] for section in included_sections)

    details = {
        "full_compiled_context": compiled_context,
        "section_order": [section["section_key"] for section in included_sections],
        "sections": included_sections,
        "approx_total_tokens": total_tokens,
        "approx_total_chars": len(compiled_context),
        "skills_loaded": skills_loaded,
        "source_of_truth": [
            "backend/vesper_context.py",
            "backend/vesper_hindsight.py",
            "backend/vesper_soul.md",
            "backend/.deer-flow/agents/vesper/config.yaml",
            "config.yaml",
        ],
    }
    logger.info(
        "VESPER context assembled: ~%d tokens (%d chars), skills_loaded=%s",
        total_tokens,
        len(compiled_context),
        skills_loaded,
    )
    return details


def assemble_context(message: str, user_id: str = "daniel", skills_loaded: bool = False) -> str:
    """Assemble VESPER context block."""
    return assemble_context_details(message, user_id=user_id, skills_loaded=skills_loaded)["full_compiled_context"]
