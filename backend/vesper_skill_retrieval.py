"""
VESPER Skill Retrieval — Phase 4
Embedding-based skill matching to replace/augment keyword heuristics.
Implements SkillRL dual-mode pattern: fast keyword fallback + semantic embedding retrieval.
Design doc: Section 10.4
"""
import hashlib
import pickle
import yaml
from pathlib import Path
from fastembed import TextEmbedding
import numpy as np

SKILLS_ROOT = Path("/opt/deer-flow/skills/custom")
EMBEDDINGS_CACHE = Path("/tmp/vesper_skill_embeddings.pkl")
MODEL_NAME = "BAAI/bge-small-en-v1.5"  # Same model fastembed uses by default
TOP_K = 3  # Max skills to load per turn
SIMILARITY_THRESHOLD = 0.55  # Min cosine similarity to trigger a skill (VESPER-49: raised from 0.45 to match dynamic threshold)
DYNAMIC_THRESHOLD = 0.55  # Dynamic skills only load if clearly relevant (BGE-small baseline ~0.45-0.51 for unrelated text)

_model = None


def _get_model() -> TextEmbedding:
    """Lazy init — load embedding model on first call."""
    global _model
    if _model is None:
        _model = TextEmbedding(model_name=MODEL_NAME)
    return _model


def _load_skill_descriptions() -> list[dict]:
    """
    Walk skills root, read YAML frontmatter from each SKILL.md.
    Returns list of {path, name, description} dicts.
    """
    skills = []
    for skill_md in SKILLS_ROOT.rglob("SKILL.md"):
        content = skill_md.read_text()
        if not content.startswith("---"):
            continue
        try:
            _, frontmatter, body = content.split("---", 2)
            meta = yaml.safe_load(frontmatter)
            if meta.get("name") and meta.get("description"):
                skills.append({
                    "path": skill_md,
                    "name": meta["name"],
                    "description": meta["description"],
                    "body": body
                })
        except Exception:
            continue
    return skills


def _compute_skills_hash(skills: list[dict]) -> str:
    """
    Compute a content hash over all skill descriptions and bodies.
    Sorted by name for determinism. Any change to any skill description
    or body will produce a different hash, invalidating the cache.
    VESPER-61: replaces the old skill-count-based invalidation signal.
    """
    content = ''.join(
        s.get('description', '') + s.get('body', '')
        for s in sorted(skills, key=lambda x: x['name'])
    )
    return hashlib.md5(content.encode()).hexdigest()


def _get_embeddings(skills: list[dict]) -> np.ndarray:
    """Load from cache or recompute. Cache invalidated if skill content hash changes.
    VESPER-61: switched from count-based to content-hash-based invalidation.
    Previously: cached.get('count') == len(skills) — only detected added/removed skills.
    Now: cached.get('hash') == _compute_skills_hash(skills) — detects any description change.
    """
    if EMBEDDINGS_CACHE.exists():
        cached = pickle.loads(EMBEDDINGS_CACHE.read_bytes())
        skills_hash = _compute_skills_hash(skills)
        if cached.get("hash") == skills_hash and cached.get("model") == MODEL_NAME:
            return cached["embeddings"]
    model = _get_model()
    descriptions = [s["description"] for s in skills]
    embeddings = np.array(list(model.embed(descriptions)))
    skills_hash = _compute_skills_hash(skills)
    EMBEDDINGS_CACHE.write_bytes(pickle.dumps({
        "hash": skills_hash,
        "model": MODEL_NAME,
        "embeddings": embeddings
    }))
    return embeddings


def retrieve_relevant_skills(query: str, top_k: int = TOP_K) -> list[dict]:
    """
    Given a user message, return the top-k most relevant skills by cosine similarity.

    VESPER-48 fix: Dynamic skills now use DYNAMIC_THRESHOLD (0.55) instead of always
    being force-included. This prevents irrelevant auto-learned skills (e.g. falkordb,
    graphql, asyncio) from bloating the system prompt for unrelated messages.
    Dynamic skills still get lower-threshold preference over static skills.

    VESPER-49 fix: SIMILARITY_THRESHOLD raised from 0.45 to 0.55 for static skills,
    matching DYNAMIC_THRESHOLD. Prevents marginal skills (e.g. 'learn' at 0.51 for 'hi')
    from loading and wasting ~360+ tokens per message.

    Old behavior: static skills loaded at >= 0.45 (too low, greetings triggered 'learn').
    New behavior: static skills only load if similarity >= 0.55 (clearly relevant to query).
    """
    skills = _load_skill_descriptions()
    if not skills:
        return []
    embeddings = _get_embeddings(skills)
    model = _get_model()
    query_emb = np.array(list(model.embed([query]))[0])
    # Cosine similarity
    norms = np.linalg.norm(embeddings, axis=1) * np.linalg.norm(query_emb)
    similarities = (embeddings @ query_emb) / np.maximum(norms, 1e-8)

    # Dynamic skills: include only if similarity >= DYNAMIC_THRESHOLD
    # Still preferred over static (lower bar), but not blindly always-on
    dynamic_indices = [i for i, s in enumerate(skills) if "_dynamic" in str(s["path"])]
    dynamic_selected = [i for i in dynamic_indices if similarities[i] >= DYNAMIC_THRESHOLD]

    # Top-k static by similarity
    static_indices = [i for i in range(len(skills)) if i not in dynamic_indices]
    top_static = sorted(static_indices, key=lambda i: similarities[i], reverse=True)
    top_static = [i for i in top_static if similarities[i] >= SIMILARITY_THRESHOLD][:top_k]

    selected = dynamic_selected + top_static
    return [{
        **skills[i],
        "similarity": float(similarities[i])
    } for i in selected]


if __name__ == "__main__":
    import sys
    query = " ".join(sys.argv[1:]) or "how does VESPER's memory work"
    results = retrieve_relevant_skills(query)
    print(f"Query: {query}")
    for r in results:
        print(f"  [{r['similarity']:.3f}] {r['name']}: {r['description'][:60]}...")