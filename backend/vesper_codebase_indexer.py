"""
VESPER Codebase Indexer — Phase 3
Detects git changes and updates codebase-awareness/SKILL.md.
Design doc: Section 5.3E
"""
import subprocess
import os
from pathlib import Path
from datetime import datetime

# Load env vars from the deer-flow .env file (needed for standalone cron execution)
from dotenv import load_dotenv
load_dotenv("/opt/deer-flow/.env")

SKILL_PATH = Path("/opt/deer-flow/skills/custom/codebase-awareness/SKILL.md")
REPO_PATH = Path("/opt/deer-flow")
STATE_FILE = Path("/tmp/vesper_codebase_last_commit")


def get_last_indexed_commit() -> str:
    if STATE_FILE.exists():
        return STATE_FILE.read_text().strip()
    return ""


def get_current_commit() -> str:
    result = subprocess.run(
        ["git", "-C", str(REPO_PATH), "rev-parse", "HEAD"],
        capture_output=True, text=True
    )
    return result.stdout.strip()


def get_changed_files(since_commit: str) -> list[str]:
    if not since_commit:
        # First run — get all tracked Python files in backend/
        result = subprocess.run(
            ["git", "-C", str(REPO_PATH), "ls-files", "--", "backend/*.py", "backend/**/*.py"],
            capture_output=True, text=True
        )
    else:
        result = subprocess.run(
            ["git", "-C", str(REPO_PATH), "diff", "--name-only", since_commit, "HEAD", "--", "*.py"],
            capture_output=True, text=True
        )
    return [f for f in result.stdout.strip().split("\n") if f]


def summarize_changed_modules(changed_files: list[str]) -> str:
    """Read changed files and produce a brief summary of what changed.
    Uses gpt-oss-120b via OpenAI-compatible API (same as other VESPER modules)."""
    import openai

    api_key = os.environ.get("OPENROUTER_API_KEY", "")
    if not api_key:
        return "(summarization skipped: OPENROUTER_API_KEY not set)"

    client = openai.OpenAI(
        api_key=api_key,
        base_url="https://openrouter.ai/api/v1",
    )

    # Read up to 100 lines from each changed file (cap at 10 files to avoid huge prompts)
    file_contents = []
    for rel_path in changed_files[:10]:
        abs_path = REPO_PATH / rel_path
        try:
            lines = abs_path.read_text(errors="replace").splitlines()[:100]
            content = "\n".join(lines)
            file_contents.append(f"--- {rel_path} ---\n{content}")
        except Exception as e:
            file_contents.append(f"--- {rel_path} --- (could not read: {e})")

    file_list = ", ".join(changed_files[:10])
    if len(changed_files) > 10:
        file_list += f" ... and {len(changed_files) - 10} more"
    contents = "\n\n".join(file_contents)

    prompt = (
        f"These Python files changed in VESPER's codebase: {file_list}. "
        f"Here are their contents (truncated):\n\n{contents}\n\n"
        "Write a brief 2-3 sentence summary of what changed and why it matters "
        "for VESPER's architecture. Keep the summary under 150 words total."
    )

    response = client.chat.completions.create(
        model="openai/gpt-oss-120b",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=200,
        temperature=0.3,
    )
    return response.choices[0].message.content.strip()


def update_skill_md(change_summary: str, changed_files: list[str]):
    """Update the 'Recent Changes' section of codebase-awareness/SKILL.md.
    Preserves the existing frontmatter and core content — only updates the
    auto-generated section at the bottom."""
    existing = SKILL_PATH.read_text()
    now_str = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")
    files_str = ", ".join(changed_files)
    if len(files_str) > 500:
        files_str = ", ".join(changed_files[:20]) + f" ... and {len(changed_files) - 20} more"

    new_section = (
        f"## Recent Changes (Auto-Updated)\n"
        f"_Last indexed: {now_str}_\n\n"
        f"{change_summary}\n\n"
        f"Changed files: {files_str}\n"
    )

    marker = "## Recent Changes (Auto-Updated)"
    if marker in existing:
        # Replace the existing auto-updated section
        idx = existing.index(marker)
        updated = existing[:idx] + new_section
    else:
        # Append at the end
        updated = existing.rstrip("\n") + "\n\n" + new_section

    SKILL_PATH.write_text(updated)
    print(f"[codebase-indexer] Wrote updated SKILL.md ({len(updated)} chars)")


def run_indexer():
    last = get_last_indexed_commit()
    current = get_current_commit()
    if not current:
        print("[codebase-indexer] ERROR: could not get current commit")
        return
    if last == current:
        print("[codebase-indexer] No new commits, skipping")
        return
    changed = get_changed_files(last)
    if not changed:
        print("[codebase-indexer] No Python files changed, skipping")
        STATE_FILE.write_text(current)
        return
    print(f"[codebase-indexer] {len(changed)} file(s) changed since {last[:7] if last else 'start'}")
    summary = summarize_changed_modules(changed)
    update_skill_md(summary, changed)
    STATE_FILE.write_text(current)
    print(f"[codebase-indexer] codebase-awareness/SKILL.md updated")


if __name__ == "__main__":
    run_indexer()