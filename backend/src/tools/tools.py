import logging

from langchain.tools import BaseTool

from src.config import get_app_config
from src.reflection import resolve_variable
from src.tools.builtins import ask_clarification_tool, load_skill_tool, present_file_tool, task_tool, view_image_tool
from src.tools.builtins import expand_context_tool, search_message_history_tool

logger = logging.getLogger(__name__)

BUILTIN_TOOLS = [
    present_file_tool,
    ask_clarification_tool,
]

# Always-available tools: included regardless of tool groups
ALWAYS_TOOLS = [
    load_skill_tool,
]

# Context inspection tools are useful for subagents that need to inspect or
# expand the parent conversation, but they should not be exposed to the lead
# orchestrator by default.
CONTEXT_TOOLS = [
    expand_context_tool,
    search_message_history_tool,
]

SUBAGENT_TOOLS = [
    task_tool,
    # task_status_tool is no longer exposed to the LLM (backend handles polling internally)
]


def get_available_tools(
    groups: list[str] | None = None,
    include_mcp: bool = True,
    model_name: str | None = None,
    *,
    agent_role: str = "lead",
    enable_task_tool: bool = False,
) -> list[BaseTool]:
    """Get all available tools from config.

    Args:
        groups: Optional tool-group allowlist from config.
        include_mcp: Whether to include cached MCP tools.
        model_name: Active model name, used for vision-tool gating.
        agent_role: Either ``"lead"`` or ``"subagent"``.
        enable_task_tool: When ``True`` for the lead agent, include the ``task``
            delegation tool. This should be driven by agent configuration, not by
            name-based VESPER-only runtime hacks.

    Behavior:
        - Group-scoped agents skip default builtins like ``ask_clarification`` and
          ``present_files`` to keep tool schemas lean.
        - ``load_skill`` is always available.
        - Subagents get context-inspection tools.
        - Lead agents only get ``task`` when explicitly enabled.
    """
    if agent_role not in {"lead", "subagent"}:
        raise ValueError(f"Invalid agent_role '{agent_role}'. Expected 'lead' or 'subagent'.")

    logger.info(
        "Tool routing: groups=%s, agent_role=%s, enable_task_tool=%s",
        groups,
        agent_role,
        enable_task_tool,
    )

    config = get_app_config()
    loaded_tools = [resolve_variable(tool.use, BaseTool) for tool in config.tools if groups is None or tool.group in groups]

    # Get cached MCP tools if enabled
    mcp_tools = []
    if include_mcp:
        try:
            from src.config.extensions_config import ExtensionsConfig
            from src.mcp.cache import get_cached_mcp_tools

            extensions_config = ExtensionsConfig.from_file()
            if extensions_config.get_enabled_mcp_servers():
                mcp_tools = get_cached_mcp_tools()
                if mcp_tools:
                    logger.info("Using %s cached MCP tool(s)", len(mcp_tools))
        except ImportError:
            logger.warning("MCP module not available. Install 'langchain-mcp-adapters' package to enable MCP tools.")
        except Exception as e:
            logger.error("Failed to get cached MCP tools: %s", e)

    builtin_tools: list[BaseTool] = []
    if groups is None:
        builtin_tools.extend(BUILTIN_TOOLS)

    if agent_role == "lead" and enable_task_tool:
        builtin_tools.extend(SUBAGENT_TOOLS)
        logger.info("Including task delegation tool for lead agent")

    if agent_role == "subagent":
        builtin_tools.extend(CONTEXT_TOOLS)
        logger.info("Including context tools for subagent")

    # If no model_name specified, use the first model (default)
    if model_name is None and config.models:
        model_name = config.models[0].name

    # Add view_image_tool only if the model supports vision
    model_config = config.get_model_config(model_name) if model_name else None
    if model_config is not None and model_config.supports_vision:
        builtin_tools.append(view_image_tool)
        logger.info("Including view_image_tool for model '%s' (supports_vision=True)", model_name)

    all_tools = loaded_tools + builtin_tools + ALWAYS_TOOLS + mcp_tools

    # Deduplicate by tool name (ALWAYS_TOOLS take precedence, last-wins dedup)
    seen_names: set[str] = set()
    deduped: list[BaseTool] = []
    for t in reversed(all_tools):
        name = getattr(t, "name", None)
        if name and name not in seen_names:
            seen_names.add(name)
            deduped.append(t)
    return list(reversed(deduped))
