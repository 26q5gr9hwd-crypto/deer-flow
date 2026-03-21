"""Built-in subagent configurations."""

from .bash_agent import BASH_AGENT_CONFIG
from .web_researcher import WEB_RESEARCHER_CONFIG
from .vesper_code_reader import VESPER_CODE_READER_CONFIG
from .vesper_code_writer import VESPER_CODE_WRITER_CONFIG

__all__ = [
    "WEB_RESEARCHER_CONFIG",
    "BASH_AGENT_CONFIG",
    "VESPER_CODE_READER_CONFIG",
    "VESPER_CODE_WRITER_CONFIG",
]

# Registry of built-in subagents
BUILTIN_SUBAGENTS = {
    "web-researcher": WEB_RESEARCHER_CONFIG,
    "bash": BASH_AGENT_CONFIG,
    "vesper-code-reader": VESPER_CODE_READER_CONFIG,
    "vesper-code-writer": VESPER_CODE_WRITER_CONFIG,
}