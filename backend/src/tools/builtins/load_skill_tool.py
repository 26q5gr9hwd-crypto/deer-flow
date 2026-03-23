"""Load Skill tool — returns full SKILL.md content for any named skill on demand.

VESPER-45: Enables the brain to request detailed skill instructions when a skill is visible
in the capabilities directory but was not auto-loaded by retrieval.
"""

import logging
from pathlib import Path

import yaml
from langchain.tools import tool

logger = logging.getLogger(__name__)

SKILLS_ROOT = Path("/opt/deer-flow/skills/custom")


@tool("load_skill")
def load_skill_tool(skill_name: str) -> str:
    """Load the full content of a named skill file on demand.

    Use this when you need the full instructions for a named skill that is not
    already present in the current turn context.

    Args:
        skill_name: The skill name exactly as shown in the capabilities directory
                    (e.g. 'subagent-delegation', 'memory-management', 'learn')

    Returns:
        Full SKILL.md content if found, or a list of available skill names if not found.
    """
    if not SKILLS_ROOT.exists():
        return f"Skills directory not found at {SKILLS_ROOT}"

    # Try direct directory name match first (fastest)
    direct = SKILLS_ROOT / skill_name / "SKILL.md"
    if direct.exists():
        try:
            return direct.read_text()
        except Exception as e:
            return f"Error reading skill '{skill_name}': {e}"

    # Try _dynamic subdirectory
    dynamic = SKILLS_ROOT / "_dynamic" / skill_name / "SKILL.md"
    if dynamic.exists():
        try:
            return dynamic.read_text()
        except Exception as e:
            return f"Error reading skill '{skill_name}': {e}"

    # Walk all SKILL.md files, match by YAML frontmatter name
    for skill_md in SKILLS_ROOT.rglob("SKILL.md"):
        try:
            content = skill_md.read_text()
            if not content.startswith("---"):
                continue
            _, frontmatter, _ = content.split("---", 2)
            meta = yaml.safe_load(frontmatter)
            if meta.get("name") == skill_name:
                return content
        except Exception:
            continue

    # Not found — return available skills list
    available = []
    for skill_md in SKILLS_ROOT.rglob("SKILL.md"):
        try:
            content = skill_md.read_text()
            if content.startswith("---"):
                _, frontmatter, _ = content.split("---", 2)
                meta = yaml.safe_load(frontmatter)
                if meta.get("name"):
                    available.append(meta["name"])
        except Exception:
            continue

    names = ", ".join(sorted(available)) if available else "(none found)"
    return f"Skill '{skill_name}' not found. Available skills: {names}"