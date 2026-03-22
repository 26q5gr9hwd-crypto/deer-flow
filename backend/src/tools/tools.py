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
    expand_context_tool,
    search_message_history_tool,
]

SUBAGENT_TOOLS = [
    task_tool,
    # task_status_tool is no longer exposed to LLM (backend handles polling internally)
]


def get_available_tools(
    groups: list[str] | None = None,
    include_mcp: bool = True,
    model_name: str | None = None,
    subagent_enabled: bool = False,
) -> list[BaseTool]:
    """Get all available tools from config.

    When groups is explicitly set, the agent opted into explicit tool control.
    Only config tools in the listed groups are loaded, and default builtin
    tools (ask_clarification, present_file) are skipped to save tokens.
    load_skill, expand_context, and search_message_history are always included regardless of groups.
    """
    logger.info("VESPER-DEBUG: get_available_tools called with groups=%s, subagent_enabled=%s", groups, subagent_enabled)
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
                    logger.info(f"Using {len(mcp_tools)} cached MCP tool(s)")
        except ImportError:
            logger.warning("MCP module not available. Install 'langchain-mcp-adapters' package to enable MCP tools.")
        except Exception as e:
            logger.error(f"Failed to get cached MCP tools: {e}")

    # When groups is explicitly set, skip default builtins to save tokens.
    # Agents without tool_groups get all builtins as before.
    builtin_tools = []
    if groups is None:
        builtin_tools = BUILTIN_TOOLS.copy()

    # Add subagent tools only if enabled via runtime parameter
    if subagent_enabled:
        builtin_tools.extend(SUBAGENT_TOOLS)
        logger.info("Including subagent tools (task)")

    # If no model_name specified, use the first model (default)
    if model_name is None and config.models:
        model_name = config.models[0].name

    # Add view_image_tool only if the model supports vision
    model_config = config.get_model_config(model_name) if model_name else None
    if model_config is not None and model_config.supports_vision:
        builtin_tools.append(view_image_tool)
        logger.info(f"Including view_image_tool for model '{model_name}' (supports_vision=True)")

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
