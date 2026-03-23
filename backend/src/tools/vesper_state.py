"""VESPER State Tools — Postgres-backed project/task/event management.

These tools let VESPER manage structured state via Postgres.
Registered under the 'vesper' tool group in config.yaml.

VESPER-24: Added search_memory_tool for Tier 2 on-demand memory retrieval.
"""

import logging

import psycopg2
from langchain.tools import tool

logger = logging.getLogger(__name__)

# DB connection params — same credentials as vesper_context.py
DB_CONFIG = {
    "dbname": "vesper",
    "user": "n8n",
    "password": "EHYUBBanhcbedheu391318hcehu",
    "host": "localhost",
    "port": 5432,
}


def _get_conn():
    """Get a fresh Postgres connection."""
    return psycopg2.connect(**DB_CONFIG)


@tool("update_project", parse_docstring=True)
def update_project_tool(
    name: str,
    status: str | None = None,
    priority: int | None = None,
    context: str | None = None,
) -> str:
    """Create or update a project. Use when Daniel mentions a new project, changes project status, or reprioritizes.

    Args:
        name: Project name (used as unique key)
        status: Project status — one of: active, paused, completed, blocked
        priority: Priority 0-10 (higher = more important)
        context: Brief project description or notes
    """
    try:
        conn = _get_conn()
        cur = conn.cursor()
        cur.execute("SELECT id FROM projects WHERE name = %s;", (name,))
        existing = cur.fetchone()

        if existing:
            updates = []
            params = []
            if status is not None:
                updates.append("status = %s")
                params.append(status)
            if priority is not None:
                updates.append("priority = %s")
                params.append(priority)
            if context is not None:
                updates.append("context = %s")
                params.append(context)
            updates.append("updated_at = NOW()")
            params.append(existing[0])
            cur.execute(
                f"UPDATE projects SET {', '.join(updates)} WHERE id = %s;",
                params,
            )
            action = "Updated"
        else:
            cur.execute(
                "INSERT INTO projects (name, status, priority, context) VALUES (%s, %s, %s, %s);",
                (name, status or "active", priority or 0, context),
            )
            action = "Created"

        cur.execute(
            "INSERT INTO events (source, content) VALUES ('vesper', %s);",
            (f"{action} project: {name}",),
        )
        conn.commit()
        conn.close()
        return f"{action} project '{name}'"
    except Exception as e:
        logger.error(f"update_project failed: {e}")
        return f"Error updating project: {e}"


@tool("update_task", parse_docstring=True)
def update_task_tool(
    description: str,
    project_name: str,
    status: str = "todo",
) -> str:
    """Create or update a task under a project. Use when Daniel mentions a specific thing to do.

    Args:
        description: What needs to be done
        project_name: Which project this task belongs to
        status: Task status — one of: todo, in_progress, done, blocked
    """
    try:
        conn = _get_conn()
        cur = conn.cursor()
        cur.execute("SELECT id FROM projects WHERE name = %s;", (project_name,))
        project = cur.fetchone()
        if not project:
            conn.close()
            return f"Error: project '{project_name}' not found. Create it first with update_project."

        project_id = project[0]
        cur.execute(
            "SELECT id FROM tasks WHERE project_id = %s AND description = %s;",
            (project_id, description),
        )
        existing = cur.fetchone()

        if existing:
            cur.execute(
                "UPDATE tasks SET status = %s, updated_at = NOW() WHERE id = %s;",
                (status, existing[0]),
            )
            action = "Updated"
        else:
            cur.execute(
                "INSERT INTO tasks (project_id, description, status) VALUES (%s, %s, %s);",
                (project_id, description, status),
            )
            action = "Created"

        cur.execute(
            "INSERT INTO events (source, content) VALUES ('vesper', %s);",
            (f"{action} task: {description} [{status}] in {project_name}",),
        )
        conn.commit()
        conn.close()
        return f"{action} task '{description}' [{status}] in project '{project_name}'"
    except Exception as e:
        logger.error(f"update_task failed: {e}")
        return f"Error updating task: {e}"


@tool("get_projects", parse_docstring=True)
def get_projects_tool(
    status_filter: str | None = None,
    include_tasks: bool = True,
) -> str:
    """List projects and their tasks. Use when Daniel asks what's being worked on, project status, or task lists.

    Args:
        status_filter: Optional filter — one of: active, paused, completed, blocked
        include_tasks: Whether to include tasks under each project (default: true)
    """
    try:
        conn = _get_conn()
        cur = conn.cursor()
        if status_filter:
            cur.execute(
                "SELECT id, name, status, priority, context FROM projects WHERE status = %s ORDER BY priority DESC;",
                (status_filter,),
            )
        else:
            cur.execute(
                "SELECT id, name, status, priority, context FROM projects ORDER BY priority DESC;"
            )

        projects = cur.fetchall()
        if not projects:
            conn.close()
            return "No projects found."

        lines = []
        for pid, pname, pstatus, ppriority, pctx in projects:
            line = f"** {pname} ** [{pstatus}] P{ppriority}"
            if pctx:
                line += f" — {pctx}"
            lines.append(line)
            if include_tasks:
                cur.execute(
                    "SELECT description, status FROM tasks WHERE project_id = %s ORDER BY status, updated_at DESC;",
                    (pid,),
                )
                tasks = cur.fetchall()
                for desc, tstatus in tasks:
                    lines.append(f"  - [{tstatus}] {desc}")

        conn.close()
        return "\n".join(lines)
    except Exception as e:
        logger.error(f"get_projects failed: {e}")
        return f"Error listing projects: {e}"


@tool("append_event", parse_docstring=True)
def append_event_tool(
    content: str,
    source: str = "vesper",
) -> str:
    """Log a notable event. Events appear in VESPER's context as 'what changed'. Use for deployments, decisions, external changes.

    Args:
        content: What happened (brief description)
        source: Event source — one of: vesper, notion, telegram, webhook, system
    """
    try:
        conn = _get_conn()
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO events (source, content) VALUES (%s, %s);",
            (source, content),
        )
        conn.commit()
        conn.close()
        return f"Logged event: {content}"
    except Exception as e:
        logger.error(f"append_event failed: {e}")
        return f"Error logging event: {e}"


@tool("search_memory", parse_docstring=True)
def search_memory_tool(
    query: str,
    entity_name: str | None = None,
    time_range: str | None = None,
    search_type: str = "hybrid",
) -> str:
    """Search long-term memory (Hindsight memory service) for relevant facts and context. Tier 2 on-demand retrieval.

    Use when: checking history of a specific entity, temporal queries (what did Daniel say about X last week?),
    searching a different angle than what auto-context provided, verifying something before acting.
    Do NOT use for general conversation or when auto-context already answers the question.
    Do NOT call this on every turn — only when Tier 1 auto-context is insufficient (~10-20% of turns).

    Args:
        query: What you are looking for in long-term memory (natural language)
        entity_name: Optional entity to focus search on (e.g. 'VESPER', 'DeerFlow', 'Daniel')
        time_range: Optional time hint appended to query (e.g. 'last week', 'yesterday', 'last month')
        search_type: Search type — use 'hybrid' (default, reserved for future extension)
    """
    try:
        import sys
        _backend = "/opt/deer-flow/backend"
        if _backend not in sys.path:
            sys.path.insert(0, _backend)

        import vesper_hindsight

        # Build enriched query from optional parameters
        search_query = query
        if entity_name:
            search_query = f"{entity_name}: {query}"
        if time_range:
            search_query = f"{search_query} (time: {time_range})"

        results = vesper_hindsight.search_memories(search_query, num_results=15)

        if not results:
            return f"No memories found for query: '{query}'"

        # Format as readable string (~200-400 tokens)
        lines = [f"### Memory Search Results: {query}"]
        if entity_name:
            lines.append(f"Entity filter: {entity_name}")
        if time_range:
            lines.append(f"Time range: {time_range}")
        lines.append(f"Found {len(results)} result(s):\n")
        for i, fact in enumerate(results, 1):
            lines.append(f"{i}. {fact}")

        return "\n".join(lines)

    except Exception as e:
        logger.error(f"search_memory failed: {e}")
        return f"Memory search error: {e}"