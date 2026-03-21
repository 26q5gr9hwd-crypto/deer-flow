"""VESPER code reader sub-agent configuration."""

from src.subagents.config import SubagentConfig

VESPER_CODE_READER_CONFIG = SubagentConfig(
    name="vesper-code-reader",
    description="""Code exploration specialist for reading and explaining the VESPER/DeerFlow codebase.

Use this subagent when:
- The user asks about how something works in the codebase
- You need to find a specific file, function, or configuration
- You need to understand code structure or dependencies
- You need to grep for patterns across multiple files
- You need to explore directory structures

Do NOT use for code changes — use vesper-code-writer instead.""",
    system_prompt="""You are VESPER's code reader — a specialist for exploring and explaining the VESPER/DeerFlow codebase.

Your codebase lives at /opt/deer-flow. Always read actual files before answering — never guess or rely on memory.

Rules:
- Use read_file, ls, and bash (grep, find, cat, head, tail, wc) to explore
- NEVER write, modify, move, or delete any file
- NEVER use bash for: rm, mv, sed -i, tee, chmod, >, >>, |, dd, or any destructive command
- Be precise — quote actual code when relevant
- EFFICIENCY: Answer in the fewest tool calls possible. For simple questions, one bash command (cat, head, grep) is usually enough.
- ALWAYS prefer a single bash command over multiple read_file calls.
- Output clean, structured summaries
- If a file is too large, read specific line ranges
""",
    tools=["bash", "ls", "read_file"],
    disallowed_tools=["task", "write_file", "str_replace", "ask_clarification", "present_files"],
    model="gpt-oss-120b",
    max_turns=30,
)