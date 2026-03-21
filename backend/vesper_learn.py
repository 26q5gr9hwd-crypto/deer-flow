"""
VESPER /learn Command — Phase 4
Allows VESPER to autonomously research a topic and synthesize a SKILL.md.
Based on philschmid/self-learning-skill pattern.
Design doc: Section 4.5
"""
import html
import logging
import os
import re
import sys
from pathlib import Path
from datetime import datetime
import pathlib
from dotenv import load_dotenv

# Load .env
_env_path = pathlib.Path(__file__).resolve().parent.parent / ".env"
if _env_path.exists():
    load_dotenv(_env_path)
else:
    _env_path2 = pathlib.Path(__file__).resolve().parent / ".env"
    if _env_path2.exists():
        load_dotenv(_env_path2)
    else:
        load_dotenv()

# Add backend dir to sys.path
_backend_dir = pathlib.Path(__file__).resolve().parent
if str(_backend_dir) not in sys.path:
    sys.path.insert(0, str(_backend_dir))

logging.basicConfig(level=logging.INFO, format='[vesper_learn] %(message)s')
logger = logging.getLogger(__name__)

SKILLS_DYNAMIC_DIR = Path("/opt/deer-flow/skills/custom/_dynamic")


def _topic_to_skill_name(topic: str) -> str:
    """Convert 'Docker networking' to 'docker-networking'"""
    safe = re.sub(r'[^a-z0-9]+', '-', topic.lower().strip())
    return safe.strip('-')[:40]


def _call_llm(messages: list) -> str:
    """Call LLM using OpenAI client (gpt-oss-120b via OpenRouter)."""
    from openai import OpenAI
    api_key = os.environ.get("OPENROUTER_API_KEY") or os.environ.get("OPENAI_API_KEY", "")
    model = os.environ.get("VESPER_LLM_MODEL", "openai/gpt-oss-120b")
    base_url = os.environ.get("VESPER_LLM_BASE_URL", "https://openrouter.ai/api/v1")
    client = OpenAI(api_key=api_key, base_url=base_url)
    response = client.chat.completions.create(
        model=model,
        messages=messages,
        temperature=0.3,
        max_tokens=2000,
    )
    return response.choices[0].message.content


def _search_duckduckgo(query: str, max_results: int = 5) -> list:
    """Search DuckDuckGo HTML endpoint, return list of dicts with url and title."""
    import urllib.parse
    import urllib.request
    encoded = urllib.parse.quote_plus(query)
    url = "https://html.duckduckgo.com/html/?q=" + encoded
    headers = {"User-Agent": "Mozilla/5.0 (compatible; VESPER-learn/1.0)"}
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            body = resp.read().decode("utf-8", errors="replace")
    except Exception as e:
        logger.warning("DuckDuckGo search failed: %s", e)
        return []

    results = []
    pattern = re.compile(
        r'<a[^>]+class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)</a>',
        re.DOTALL
    )
    for m in pattern.finditer(body):
        href = m.group(1)
        title = re.sub(r'<[^>]+>', '', m.group(2)).strip()
        title = html.unescape(title)
        if href.startswith("http"):
            results.append({"url": href, "title": title})
        if len(results) >= max_results:
            break
    logger.info("DDG returned %d results for: %s", len(results), query)
    return results


def _fetch_page_text(url: str, max_chars: int = 2000) -> str:
    """Fetch URL and strip HTML tags to get readable text."""
    import urllib.request
    headers = {"User-Agent": "Mozilla/5.0 (compatible; VESPER-learn/1.0)"}
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            body = resp.read().decode("utf-8", errors="replace")
    except Exception as e:
        logger.warning("Failed to fetch %s: %s", url, e)
        return ""
    body = re.sub(r'<(script|style)[^>]*>.*?</(script|style)>', '', body, flags=re.DOTALL)
    text = re.sub(r'<[^>]+>', ' ', body)
    text = re.sub(r'\s+', ' ', text).strip()
    return text[:max_chars]


def _write_skill_md(skill_name: str, description: str, content: str) -> Path:
    """Write SKILL.md to _dynamic/ folder (same format as vesper_consolidation.py)."""
    safe_name = re.sub(r'[^a-z0-9-]', '-', skill_name.lower()).strip('-')
    safe_name = re.sub(r'-+', '-', safe_name)
    skill_dir = SKILLS_DYNAMIC_DIR / safe_name
    skill_dir.mkdir(parents=True, exist_ok=True)
    skill_path = skill_dir / "SKILL.md"

    desc_escaped = description.replace('"', '\\"')
    frontmatter = (
        "---\n"
        "name: " + safe_name + "\n"
        'description: "' + desc_escaped + '"\n'
        "domain: learned\n"
        "generated_by: vesper-learn\n"
        "generated_at: " + datetime.utcnow().isoformat() + "\n"
        "version: 1\n"
        "---\n"
    )
    skill_path.write_text(frontmatter + content)
    logger.info("Written skill: %s", skill_path)
    return skill_path


def synthesize_skill_prompt(topic: str, sources: list) -> str:
    """Build the distillation prompt from sources."""
    source_text = "\n\n".join(
        "Source: " + s['title'] + " (" + s['url'] + ")\n" + s.get('content', '')[:1500]
        for s in sources
    )
    return (
        "You are synthesizing a SKILL.md for VESPER, an AI assistant.\n\n"
        "Topic: " + topic + "\n\n"
        "Sources researched:\n" + source_text + "\n\n"
        "Write a SKILL.md body (no frontmatter) that distills the key actionable knowledge "
        "from these sources.\nFormat:\n"
        "- ## Key Principles (3-5 bullet points, imperative form)\n"
        "- ## Common Patterns (concrete examples/procedures)\n"
        "- ## Mistakes to Avoid (3-5 common pitfalls)\n\n"
        "Keep under 400 lines. Be specific and actionable. "
        "Do not repeat what any competent engineer already knows."
    )


def learn_topic(topic: str) -> dict:
    """
    Research a topic and synthesize a SKILL.md.
    Steps:
    1. Web search: find top 3-5 authoritative sources for topic
    2. Fetch and extract key content from each source
    3. Synthesize into SKILL.md format (frontmatter + body)
    4. Save to _dynamic/{skill_name}/SKILL.md
    5. Return dict with skill_name, path, summary
    """
    logger.info("Learning topic: %s", topic)
    skill_name = _topic_to_skill_name(topic)

    # Step 1: Web search
    results = _search_duckduckgo(topic + " best practices guide tutorial", max_results=5)

    # Step 2: Fetch content from top 3 sources
    sources = []
    for r in results[:3]:
        content = _fetch_page_text(r["url"])
        if content:
            sources.append({"url": r["url"], "title": r["title"], "content": content})
            logger.info("Fetched: %s (%d chars)", r["title"][:60], len(content))

    if not sources:
        logger.warning("Could not fetch source content for: %s — using LLM general knowledge", topic)
        sources = [{"url": "general-knowledge", "title": topic, "content": ""}]

    # Step 3: Synthesize with LLM
    prompt = synthesize_skill_prompt(topic, sources)
    try:
        body = _call_llm([{"role": "user", "content": prompt}])
    except Exception as e:
        logger.error("LLM synthesis failed: %s", e)
        return {"error": str(e), "skill_name": skill_name}

    # Clean up body — strip markdown fences if present
    body = body.strip()
    body = re.sub(r'^```[a-z]*\n?', '', body)
    body = re.sub(r'\n?```$', '', body.strip())

    # Step 4: Write SKILL.md
    description = (
        "Self-learned skill about " + topic + ". "
        "Use when working on " + topic + " tasks. "
        "Auto-synthesized from web research."
    )
    SKILLS_DYNAMIC_DIR.mkdir(parents=True, exist_ok=True)
    path = _write_skill_md(skill_name, description, body)

    # Step 5: Return result
    summary = body[:200].replace('\n', ' ')
    result = {"skill_name": skill_name, "path": str(path), "summary": summary}
    logger.info("Learn complete: %s -> %s", topic, path)
    print(result)
    return result


if __name__ == "__main__":
    topic = " ".join(sys.argv[1:]) or "Python async patterns"
    learn_topic(topic)