"""VESPER Context Middleware - assembles rich context for every VESPER model call.

Replaces DeerFlow stock apply_prompt_template() for the VESPER agent.
On each model call:
  1. Extracts latest user message from state.
  2. VESPER-41: Calls retrieve_relevant_skills() to find matching SKILL.md files.
  3. Calls assemble_context() -> SOUL.md + datetime + projects + events + memories.
     When skills are loaded, memory budget shrinks (~300 tokens) to leave room.
  4. VESPER-45: Injects always-visible capabilities directory (subagents + all skills).
     Placed AFTER identity/soul but BEFORE memories (## Relevant Knowledge).
  5. Appends matched skill content to the context string.
  6. VESPER-FIX-9: Trims conversation history to last DEFAULT_CONTEXT_WINDOW (10) messages
     by default. Reads state['context_window_size'] to allow expansion via expand_context tool.
  7. Returns [SystemMessage(context)] + trimmed_non_system.

This keeps the model call small (~800-1,700 tokens context + trimmed history)
while ensuring every response has fresh, relevant context.

VESPER-7: Removed subagent section injection (~1,734 tokens of bloat).
VESPER-7: Fixed SystemMessage ID to prevent state accumulation via add_messages.
VESPER-7: Added per-component token logging.
VESPER-40: Actually removed _VESPER_SUBAGENT_SECTION constant + injection
           (was still present in code despite VESPER-7 comment).
VESPER-41: Wired vesper_skill_retrieval into before_model(). Skills matched by
           cosine similarity are read and injected after assemble_context() output.
           skills_loaded=True passed to assemble_context() to shrink memory budget.
VESPER-45: Added always-visible capabilities directory injected before memories.
           Subagents list is hardcoded; skills list built dynamically at runtime
           from SKILL.md frontmatter. Also adds load_skill tool for on-demand
           full skill content retrieval (registered in tools.py BUILTIN_TOOLS).
VESPER-FIX-9: Changed MAX_MESSAGE_WINDOW from 15 to DEFAULT_CONTEXT_WINDOW=10.
              Reads state['context_window_size'] to allow dynamic expansion via
              the expand_context tool. Full history remains in Postgres checkpointer.
"""

import logging
from pathlib import Path
from typing import override

import yaml
from langchain.agents import AgentState
from langchain.agents.middleware import AgentMiddleware
from langchain_core.messages import SystemMessage

from vesper_context import assemble_context

logger = logging.getLogger(__name__)

# VESPER-7: Fixed ID prevents SystemMessage accumulation in state.
# Without this, each before_model creates a SystemMessage with a new UUID,
# and the add_messages reducer appends (not replaces) messages with new IDs,
# causing system prompt tokens to grow linearly with every model call.
_SYSTEM_MSG_ID = "vesper-system-prompt"

# VESPER-45: Skills root path (same as vesper_skill_retrieval.py)
_SKILLS_ROOT = Path("/opt/deer-flow/skills/custom")

# VESPER-FIX-9: Default number of non-system messages to inject per turn.
# Full history is always preserved in the Postgres checkpointer.
# Use expand_context tool to temporarily raise this for a single turn.
DEFAULT_CONTEXT_WINDOW = 10

# VESPER-45: Hardcoded subagents directory (subagents don't change at runtime)
_SUBAGENTS_DIRECTORY = """### Subagents (call via task_tool)
- bash: Shell commands, file writes, git ops, scripts on VPS
- web-researcher: Deep web research, returns structured brief
- vesper-code-reader: Read-only VESPER/DeerFlow codebase exploration
- vesper-code-writer: Draft code changes for review (no disk writes)"""


def _build_capabilities_section() -> str:
    """Build always-visible capabilities directory for injection into every system prompt.

    VESPER-45: Scans SKILL.md frontmatter at runtime to build the skills list.
    Subagents are hardcoded (they don't change at runtime).
    Target: ~150-200 tokens total.

    Returns:
        Formatted capabilities section string, or empty string on failure.
    """
    try:
        skills = []
        if _SKILLS_ROOT.exists():
            for skill_md in sorted(_SKILLS_ROOT.rglob("SKILL.md")):
                try:
                    content = skill_md.read_text()
                    if not content.startswith("---"):
                        continue
                    _, frontmatter, _ = content.split("---", 2)
                    meta = yaml.safe_load(frontmatter)
                    name = meta.get("name", "")
                    description = meta.get("description", "")
                    if name and description:
                        # Truncate to first sentence, max 80 chars
                        short_desc = description.split(".")[0].strip()[:80]
                        skills.append(f"- {name}: {short_desc}")
                except Exception:
                    continue

        skills_lines = "\n".join(skills) if skills else "- (no skills found)"
        return (
            "## Available Capabilities\n\n"
            + _SUBAGENTS_DIRECTORY
            + "\n\n"
            + "### Skills (auto-loaded when relevant, or use load_skill tool for full content)\n"
            + skills_lines
        )
    except Exception as e:
        logger.warning("VESPER-45 failed to build capabilities section: %s", e)
        return ""


class VesperContextMiddlewareState(AgentState):
    """Compatible with the ThreadState schema."""

    pass


class VesperContextMiddleware(AgentMiddleware[VesperContextMiddlewareState]):
    """Middleware that injects VESPER-specific context before each model call."""

    # VESPER-FIX-9: Kept for backward compatibility; actual default is DEFAULT_CONTEXT_WINDOW
    MAX_MESSAGE_WINDOW = DEFAULT_CONTEXT_WINDOW
    state_schema = VesperContextMiddlewareState

    @override
    def before_model(self, state, runtime):
        messages = state.get("messages", [])

        # VESPER-FIX-9: Read dynamic context window size from state (set by expand_context tool).
        # Falls back to DEFAULT_CONTEXT_WINDOW if not set or set to a non-positive value.
        raw_window = state.get("context_window_size", None)
        if isinstance(raw_window, int) and raw_window > 0:
            window_size = raw_window
            if window_size != DEFAULT_CONTEXT_WINDOW:
                logger.info(
                    "VESPER-FIX-9: Using expanded context window: %d (default=%d)",
                    window_size, DEFAULT_CONTEXT_WINDOW,
                )
        else:
            window_size = DEFAULT_CONTEXT_WINDOW

        # Find latest user message for context assembly and skill retrieval
        user_message = ""
        for msg in reversed(messages):
            if getattr(msg, "type", None) == "human":
                content = getattr(msg, "content", "")
                if isinstance(content, str):
                    user_message = content
                elif isinstance(content, list):
                    user_message = " ".join(
                        p.get("text", "") for p in content if isinstance(p, dict)
                    )
                break

        # --- VESPER-41: Skill retrieval ---
        # Attempt to load relevant skills via embedding similarity.
        # On failure, log warning and continue without skills (graceful degradation).
        skills_loaded = False
        skill_content = ""
        try:
            from vesper_skill_retrieval import retrieve_relevant_skills
            matched_skills = retrieve_relevant_skills(user_message)
            if matched_skills:
                skill_sections = []
                loaded_names = []
                for skill in matched_skills:
                    skill_path = skill["path"]
                    try:
                        full_content = skill_path.read_text()
                        skill_sections.append(
                            f"### {skill['name']} (similarity: {skill['similarity']:.3f})\n{full_content}"
                        )
                        loaded_names.append(f"{skill['name']}={skill['similarity']:.3f}")
                    except Exception as read_err:
                        logger.warning(
                            "VESPER-41 could not read skill file %s: %s",
                            skill_path, read_err
                        )
                if skill_sections:
                    skills_loaded = True
                    skill_content = "## Active Skills\n\n" + "\n\n".join(skill_sections)
                    logger.info(
                        "VESPER-41 skills loaded: %s",
                        ", ".join(loaded_names)
                    )
            else:
                logger.info("VESPER-41 no skills matched (below threshold or empty skills dir)")
        except Exception as e:
            logger.warning(
                "VESPER-41 skill retrieval failed, continuing without skills: %s", e
            )
            skills_loaded = False
            skill_content = ""

        # Assemble context (SOUL.md + datetime + projects + events + Graphiti memories).
        # skills_loaded=True shrinks the memory budget from ~600 to ~300 tokens
        # to leave room for the injected skill content.
        context = assemble_context(user_message, skills_loaded=skills_loaded)

        # VESPER-45: Inject always-visible capabilities directory.
        # Placed AFTER identity/soul but BEFORE memories (## Relevant Knowledge).
        capabilities = _build_capabilities_section()
        if capabilities:
            if "## Relevant Knowledge" in context:
                context = context.replace(
                    "## Relevant Knowledge",
                    capabilities + "\n\n## Relevant Knowledge",
                    1
                )
            else:
                # No memories this turn — append after main context
                context = context + "\n\n" + capabilities
            logger.info(
                "VESPER-45: Injected capabilities section (~%d tokens)",
                len(capabilities) // 4
            )

        # Append matched skill content after the main context block
        if skill_content:
            context = context + "\n\n" + skill_content

        # Separate system and non-system messages
        non_system = []
        for msg in messages:
            if getattr(msg, "type", None) != "system":
                non_system.append(msg)

        # VESPER-FIX-9: Trim conversation history to the dynamic window size.
        # Full history is preserved in the Postgres checkpointer — only the
        # model's view is trimmed. Use expand_context tool to temporarily expand.
        if len(non_system) > window_size:
            non_system = non_system[-window_size:]

        # VESPER-7: Use fixed ID to prevent SystemMessage accumulation in state.
        # Without a fixed ID, each before_model call creates a new SystemMessage
        # with a random UUID. The add_messages reducer appends (not replaces)
        # messages with new IDs, causing system messages to pile up in state.
        sys_msg = SystemMessage(content=context, id=_SYSTEM_MSG_ID)

        # VESPER-7: Per-component token logging
        ctx_tokens = len(context) // 4
        conv_tokens = sum(
            len(str(getattr(m, "content", ""))) // 4 for m in non_system
        )
        logger.info(
            "VESPER-FIX-9 tokens: system=%d, conv=%d (msgs=%d/%d window), total_est=%d",
            ctx_tokens, conv_tokens, len(non_system), window_size,
            ctx_tokens + conv_tokens,
        )

        return {"messages": [sys_msg] + non_system}
