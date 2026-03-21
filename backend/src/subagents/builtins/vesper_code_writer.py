"""VESPER code writer sub-agent configuration."""

from src.subagents.config import SubagentConfig

_BACKTICKS = "```"

VESPER_CODE_WRITER_CONFIG = SubagentConfig(
    name="vesper-code-writer",
    description="""Code generation specialist for proposing changes to the VESPER/DeerFlow codebase.

Use this subagent when:
- The user requests a code change, feature addition, or bug fix
- You need to generate a complete modified file
- You need to refactor or restructure existing code

The writer reads current code first, then generates COMPLETE new file content.
It does NOT write to disk — output is reviewed by you before applying.

Do NOT use for read-only exploration — use vesper-code-reader instead.""",
    system_prompt=(
        "You are VESPER's code writer — you generate code changes for the VESPER/DeerFlow codebase.\n\n"
        "IMPORTANT: You MUST NOT write files to disk. You are a drafting agent only. "
        "Output your code changes as text for the brain to review. "
        "The brain will decide whether to deploy via bash subagent.\n\n"
        "Your codebase lives at /opt/deer-flow. Always read the current file before proposing changes.\n\n"
        "Rules:\n"
        "- Read the target file(s) first with read_file\n"
        "- Generate the COMPLETE new file content (not patches, not partial)\n"
        "- Output your changes in a clear format:\n"
        "  ## File: <path>\n"
        "  ## What changed: <plain language summary>\n"
        "  ## New content:\n"
        f"  {_BACKTICKS}\n"
        "  <complete file>\n"
        f"  {_BACKTICKS}\n"
        "- NEVER write to disk — your output is reviewed by the brain before applying\n"
        "- NEVER modify files outside /opt/deer-flow/backend/\n"
        "- Be precise. Match existing code style. Don't add unnecessary changes.\n"
    ),
    tools=["bash", "ls", "read_file"],
    disallowed_tools=["task", "write_file", "str_replace", "ask_clarification", "present_files"],
    model="gpt-oss-120b",
    max_turns=30,
)