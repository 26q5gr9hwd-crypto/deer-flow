"""Memory Graph API router for the Memory Graph v3 experience.

This endpoint turns Hindsight memories into a stable, region-first model with
progressive disclosure:
- 5 deterministic top-level regions
- limited topic lanes per region
- semantic memory clusters between topic and detail
- raw memories exposed only as deep-focus particles / inspector detail
"""

from __future__ import annotations

import logging
import re
from collections import Counter, defaultdict
from datetime import datetime, timezone
from typing import Any

import httpx
from dateutil.parser import parse as parse_date
from fastapi import APIRouter
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/memory", tags=["memory"])

HINDSIGHT_BASE = "http://127.0.0.1:8888/v1/default"
BANK_ID = "vesper"

CLUSTER_KEYS = ["identity", "daniel", "world", "playbook", "archive"]
CLUSTER_META: dict[str, dict[str, str]] = {
    "identity": {"label": "Identity", "icon": "🧬"},
    "daniel": {"label": "Daniel", "icon": "👤"},
    "world": {"label": "World", "icon": "🌍"},
    "playbook": {"label": "Playbook", "icon": "📖"},
    "archive": {"label": "Archive", "icon": "🗄️"},
}

TOPIC_RULES: dict[str, list[dict[str, Any]]] = {
    "identity": [
        {"id": "identity-self-model", "title": "Self model", "summary": "How VESPER describes role, identity, and continuity.", "keywords": ["vesper", "assistant", "identity", "self", "role", "mission", "voice", "memory"]},
        {"id": "identity-behavior", "title": "Behavior shaping", "summary": "How the system adapts behavior, response style, and operating stance.", "keywords": ["behavior", "preference", "adapt", "style", "instruction", "guideline", "respond"]},
        {"id": "identity-capability", "title": "Capability shifts", "summary": "Recent changes in tools, capability, or working mode.", "keywords": ["tool", "capability", "workflow", "trigger", "automation", "integration", "deployment"]},
    ],
    "daniel": [
        {"id": "daniel-priorities", "title": "Priorities", "summary": "What Daniel currently cares about, pursues, or is trying to finish.", "keywords": ["priority", "goal", "project", "ship", "deadline", "focus", "initiative"]},
        {"id": "daniel-preferences", "title": "Preferences", "summary": "Preferred working style, taste, and communication defaults.", "keywords": ["prefer", "likes", "dislikes", "taste", "style", "wants", "avoids"]},
        {"id": "daniel-context", "title": "Personal context", "summary": "Biographical context, relationships, and personal facts about Daniel.", "keywords": ["daniel", "user", "family", "home", "life", "health", "routine"]},
    ],
    "world": [
        {"id": "world-technical", "title": "Technical landscape", "summary": "Tools, APIs, code facts, and system-level world knowledge.", "keywords": ["api", "router", "frontend", "backend", "react", "python", "database", "service"]},
        {"id": "world-product", "title": "Product context", "summary": "Product rules, design direction, and external constraints.", "keywords": ["product", "ui", "ux", "spec", "design", "customer", "acceptance"]},
        {"id": "world-external", "title": "External facts", "summary": "Facts and references about the outside world or surrounding systems.", "keywords": ["world", "research", "reference", "external", "market", "competitor", "fact"]},
    ],
    "playbook": [
        {"id": "playbook-operations", "title": "Operational patterns", "summary": "Recurring procedures, debugging loops, and ops habits.", "keywords": ["run", "deploy", "debug", "health", "restart", "ops", "check", "verify"]},
        {"id": "playbook-collaboration", "title": "Collaboration patterns", "summary": "How work gets coordinated, handed off, and summarized.", "keywords": ["handoff", "signal", "summary", "follow-up", "comment", "todo", "workflow"]},
        {"id": "playbook-quality", "title": "Quality guardrails", "summary": "Rules that preserve legibility, correctness, and product feel.", "keywords": ["guardrail", "constraint", "quality", "legible", "stable", "hierarchy", "criteria"]},
    ],
    "archive": [
        {"id": "archive-long-tail", "title": "Long-tail recall", "summary": "Older context that may still matter but should stay in reserve.", "keywords": ["old", "previous", "history", "archive", "past", "earlier", "legacy"]},
        {"id": "archive-superseded", "title": "Superseded context", "summary": "Ideas or facts that may now be replaced or dormant.", "keywords": ["deprecated", "replaced", "obsolete", "previous", "superseded", "legacy"]},
        {"id": "archive-completed", "title": "Completed threads", "summary": "Finished or settled threads that still provide reference value.", "keywords": ["complete", "completed", "done", "resolved", "finished", "closed"]},
    ],
}

FALLBACK_TOPICS: dict[str, dict[str, str]] = {
    "identity": {"id": "identity-overview", "title": "Core identity", "summary": "The stable self-model and operating posture of the system."},
    "daniel": {"id": "daniel-overview", "title": "Current user context", "summary": "What matters most for Daniel right now."},
    "world": {"id": "world-overview", "title": "Relevant world knowledge", "summary": "Reference facts and technical context around current work."},
    "playbook": {"id": "playbook-overview", "title": "Operational playbook", "summary": "Patterns worth repeating when work resumes."},
    "archive": {"id": "archive-overview", "title": "Archive reserve", "summary": "Context kept accessible without cluttering the live overview."},
}

ACTION_KEYWORDS = {"implement", "ship", "build", "deploy", "fix", "write", "update", "create", "restart", "verify", "check", "run", "trigger", "plan", "todo", "task", "queue"}
TENSION_KEYWORDS = {"error", "failed", "failure", "blocked", "blocker", "issue", "bug", "conflict", "contradiction", "tension", "risk", "warning", "needs review", "problem", "broken"}


class MemoryEntry(BaseModel):
    id: str
    title: str
    snippet: str
    cluster: str
    freshness: str
    confidence: float | None = None
    importance: str = "normal"
    created_at: str | None = None
    topic_id: str
    topic_title: str
    topic_summary: str


class RegionInfo(BaseModel):
    key: str
    label: str
    icon: str
    count: int
    health: str
    freshness_ratio: float
    freshness_text: str
    attention_level: str
    attention_label: str
    topic_count: int
    strongest_links: list[str] = Field(default_factory=list)


class TopicEntry(BaseModel):
    id: str
    cluster: str
    title: str
    summary: str
    memory_ids: list[str] = Field(default_factory=list)
    freshness_text: str
    attention_label: str
    preview_titles: list[str] = Field(default_factory=list)


class MemoryClusterEntry(BaseModel):
    id: str
    cluster: str
    topic_id: str
    title: str
    summary: str
    kind: str
    memory_ids: list[str] = Field(default_factory=list)
    freshness_text: str
    attention_label: str
    preview_titles: list[str] = Field(default_factory=list)


class EdgeEntry(BaseModel):
    id: str
    source: str
    target: str
    edge_type: str
    label: str
    strength: float


class GraphInsight(BaseModel):
    type: str
    message: str


class MemoryGraphResponse(BaseModel):
    regions: list[RegionInfo]
    topics: list[TopicEntry]
    clusters: list[MemoryClusterEntry]
    memories: list[MemoryEntry]
    edges: list[EdgeEntry]
    insights: list[GraphInsight] = Field(default_factory=list)
    total_memories: int = 0
    fetched_at: str = ""


def _parse_date(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = parse_date(value)
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    except Exception:
        return None


def _hours_old(date_str: str | None) -> float | None:
    parsed = _parse_date(date_str)
    if not parsed:
        return None
    return (datetime.now(timezone.utc) - parsed.astimezone(timezone.utc)).total_seconds() / 3600


def _freshness(date_str: str | None) -> str:
    hours = _hours_old(date_str)
    if hours is None:
        return "recent"
    if hours < 6:
        return "fresh"
    if hours < 72:
        return "recent"
    if hours < 336:
        return "aging"
    if hours < 2160:
        return "stale"
    return "old"


def _importance(mem: dict[str, Any]) -> str:
    proof = mem.get("proof_count") or 1
    if proof >= 4:
        return "critical"
    if proof >= 2:
        return "normal"
    return "fleeting"


def _truncate(text: str, limit: int = 90) -> str:
    cleaned = re.sub(r"\s+", " ", text or "").strip()
    if len(cleaned) <= limit:
        return cleaned
    return cleaned[: limit - 1] + "…"


def _snippet(mem: dict[str, Any]) -> str:
    text = _truncate(mem.get("text") or "", 120)
    if text:
        return text
    entities = mem.get("entities") or ""
    return _truncate(str(entities), 120)


def _memory_title(mem: dict[str, Any]) -> str:
    raw = str(mem.get("title") or mem.get("text") or mem.get("entities") or "Untitled memory")
    return _truncate(raw, 86)


def _confidence(mem: dict[str, Any]) -> float | None:
    raw = mem.get("confidence")
    if raw is None:
        raw = mem.get("score")
    try:
        if raw is None:
            return None
        return max(0.0, min(1.0, float(raw)))
    except Exception:
        return None


def _classify_cluster(mem: dict[str, Any]) -> str:
    fact_type = str(mem.get("fact_type") or "").lower()
    text = str(mem.get("text") or "").lower()
    entities = str(mem.get("entities") or "").lower()
    hours = _hours_old(mem.get("date") or mem.get("created_at"))

    if hours is not None and hours > 24 * 45:
        return "archive"
    if any(keyword in entities for keyword in ("assistant", "vesper")) and fact_type == "experience":
        return "identity"
    if "user" in entities or "daniel" in text:
        return "daniel"
    if fact_type == "observation":
        return "playbook"
    if fact_type == "experience":
        return "identity"
    if fact_type in {"world", "knowledge", "fact"}:
        return "world"
    if any(keyword in text for keyword in ("deprecated", "archive", "legacy", "replaced")):
        return "archive"
    return "world"


def _topic_for_memory(mem: dict[str, Any], cluster: str) -> dict[str, str]:
    text = " ".join([
        str(mem.get("text") or ""),
        str(mem.get("entities") or ""),
        str(mem.get("fact_type") or ""),
        str(mem.get("title") or ""),
    ]).lower()

    best_rule: dict[str, Any] | None = None
    best_score = 0
    for rule in TOPIC_RULES.get(cluster, []):
        score = sum(1 for keyword in rule["keywords"] if keyword in text)
        if score > best_score:
            best_rule = rule
            best_score = score

    if best_rule and best_score > 0:
        return {"id": str(best_rule["id"]), "title": str(best_rule["title"]), "summary": str(best_rule["summary"])}

    fallback = FALLBACK_TOPICS[cluster]
    return {"id": fallback["id"], "title": fallback["title"], "summary": fallback["summary"]}


def _health_for_region(fresh_recent: int, total: int) -> str:
    if total == 0:
        return "gray"
    ratio = fresh_recent / total
    if ratio >= 0.58:
        return "green"
    if ratio >= 0.33:
        return "yellow"
    return "red"


def _attention(cluster_stats: dict[str, int]) -> tuple[str, str]:
    stale = cluster_stats.get("stale", 0) + cluster_stats.get("old", 0)
    critical = cluster_stats.get("critical", 0)
    if critical >= 3 or stale >= 6:
        return ("active", f"{critical + stale} items need review")
    if critical >= 1 or stale >= 3:
        return ("watch", f"{critical + stale} items worth checking")
    return ("calm", "Low attention load")


def _cluster_kind(memory: MemoryEntry) -> str:
    haystack = f"{memory.title} {memory.snippet} {memory.topic_title} {memory.topic_summary}".lower()
    tension_score = sum(1 for keyword in TENSION_KEYWORDS if keyword in haystack)
    action_score = sum(1 for keyword in ACTION_KEYWORDS if keyword in haystack)
    if tension_score and tension_score >= action_score:
        return "tension"
    if action_score:
        return "action"
    return "cluster"


def _freshness_text_for_memories(memories: list[MemoryEntry]) -> str:
    if not memories:
        return "No visible memory particles"
    fresh_recent = sum(1 for memory in memories if memory.freshness in {"fresh", "recent"})
    return f"{fresh_recent}/{len(memories)} fresh or recent"


def _attention_text_for_cluster(kind: str, memories: list[MemoryEntry]) -> str:
    stale = sum(1 for memory in memories if memory.freshness in {"stale", "old"})
    critical = sum(1 for memory in memories if memory.importance == "critical")
    if kind == "tension":
        return "Pressure lane" if stale or critical else "Light contradiction"
    if kind == "action":
        return "Action-heavy lane" if len(memories) >= 3 else "Small action lane"
    if critical >= 2:
        return "High-value cluster"
    if stale >= 2:
        return "Older reserve"
    return "Calm lattice"


def _build_cluster_entry(topic: TopicEntry, cluster: str, kind: str, title: str, summary: str, memories: list[MemoryEntry]) -> MemoryClusterEntry:
    return MemoryClusterEntry(
        id=f"{topic.id}::{kind}::{re.sub(r'[^a-z0-9]+', '-', title.lower()).strip('-')}",
        cluster=cluster,
        topic_id=topic.id,
        title=title,
        summary=summary,
        kind=kind,
        memory_ids=[memory.id for memory in memories],
        freshness_text=_freshness_text_for_memories(memories),
        attention_label=_attention_text_for_cluster(kind, memories),
        preview_titles=[memory.title for memory in memories[:3]],
    )


def _derive_semantic_clusters(topic: TopicEntry, memories: list[MemoryEntry]) -> list[MemoryClusterEntry]:
    if not memories:
        return []

    sorted_memories = sorted(memories, key=lambda memory: _parse_date(memory.created_at) or datetime.min.replace(tzinfo=timezone.utc), reverse=True)
    buckets: dict[str, list[MemoryEntry]] = {"tension": [], "action": [], "cluster": []}
    for memory in sorted_memories:
        buckets[_cluster_kind(memory)].append(memory)

    results: list[MemoryClusterEntry] = []
    if buckets["tension"]:
        results.append(_build_cluster_entry(topic, topic.cluster, "tension", "Tension bundle", "Contradictions, blockers, and unstable pressure around this topic.", buckets["tension"][:8]))
    if buckets["action"]:
        results.append(_build_cluster_entry(topic, topic.cluster, "action", "Action bundle", "Executable work, next moves, and in-flight activity for this topic.", buckets["action"][:8]))

    general = buckets["cluster"]
    if general:
        split_index = len(general) // 2 if len(general) > 8 else len(general)
        primary = general[:split_index]
        reserve = general[split_index:] if len(general) > 8 else []
        if primary:
            results.append(_build_cluster_entry(topic, topic.cluster, "cluster", "Memory lattice", "The main semantic memory cluster for this topic, kept off-canvas until deep focus.", primary[:10]))
        if reserve:
            results.append(_build_cluster_entry(topic, topic.cluster, "cluster", "Context reserve", "Supporting recall kept in reserve so the canvas stays calm and legible.", reserve[:10]))

    if not results:
        results.append(_build_cluster_entry(topic, topic.cluster, "cluster", "Memory lattice", "Fallback semantic cluster for this topic.", sorted_memories[:10]))

    return results[:4]


EDGE_LABELS = {
    "structural": "Structural relationship",
    "resonance": "Active resonance",
    "tension": "Contradiction / tension",
}


def _edge_type(raw_type: str) -> str:
    value = raw_type.lower().strip()
    if value in {"contradiction", "conflict", "tension"}:
        return "tension"
    if value in {"temporal", "sequence", "hierarchy", "structural"}:
        return "structural"
    return "resonance"


def _edge_source(edge: dict[str, Any], side: str) -> str | None:
    raw = edge.get(side)
    if isinstance(raw, dict):
        return raw.get("id") or raw.get("memory_id")
    if raw:
        return str(raw)
    return edge.get(f"{side}_id") or edge.get(f"{side}_memory_id")


@router.get(
    "/graph",
    response_model=MemoryGraphResponse,
    summary="Get Memory Graph v3",
    description="Stable region-first memory graph with topics, semantic clusters, and deep-focus memory particles.",
)
async def get_memory_graph() -> MemoryGraphResponse:
    fetched_at = datetime.now(timezone.utc).isoformat()

    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            memories_resp = await client.get(f"{HINDSIGHT_BASE}/banks/{BANK_ID}/memories/list", params={"limit": 200})
            memories_resp.raise_for_status()
            raw_memories: list[dict[str, Any]] = memories_resp.json().get("items", [])
        except Exception as exc:
            logger.error("Hindsight memories fetch failed: %s", exc)
            raw_memories = []

        try:
            edges_resp = await client.get(f"{HINDSIGHT_BASE}/banks/{BANK_ID}/graph")
            edges_resp.raise_for_status()
            raw_edges: list[dict[str, Any]] = edges_resp.json().get("edges", [])
        except Exception as exc:
            logger.error("Hindsight graph fetch failed: %s", exc)
            raw_edges = []

    if not raw_memories:
        return MemoryGraphResponse(regions=[], topics=[], clusters=[], memories=[], edges=[], insights=[GraphInsight(type="empty", message="No memories available yet.")], total_memories=0, fetched_at=fetched_at)

    cluster_freshness: dict[str, Counter[str]] = {key: Counter() for key in CLUSTER_KEYS}
    cluster_importance: dict[str, Counter[str]] = {key: Counter() for key in CLUSTER_KEYS}
    cluster_topic_counts: dict[str, Counter[str]] = {key: Counter() for key in CLUSTER_KEYS}
    topic_buckets: dict[str, list[MemoryEntry]] = defaultdict(list)
    cluster_counts: Counter[str] = Counter()
    memory_cluster_lookup: dict[str, str] = {}
    memories: list[MemoryEntry] = []

    for raw in raw_memories:
        memory_id = str(raw.get("id") or raw.get("memory_id") or raw.get("uuid") or raw.get("pk") or raw.get("created_at") or len(memories))
        cluster = _classify_cluster(raw)
        topic = _topic_for_memory(raw, cluster)
        freshness = _freshness(raw.get("date") or raw.get("created_at"))
        importance = _importance(raw)
        memory = MemoryEntry(
            id=memory_id,
            title=_memory_title(raw),
            snippet=_snippet(raw),
            cluster=cluster,
            freshness=freshness,
            confidence=_confidence(raw),
            importance=importance,
            created_at=raw.get("created_at") or raw.get("date"),
            topic_id=topic["id"],
            topic_title=topic["title"],
            topic_summary=topic["summary"],
        )
        memories.append(memory)
        memory_cluster_lookup[memory.id] = cluster
        topic_buckets[topic["id"]].append(memory)
        cluster_counts[cluster] += 1
        cluster_freshness[cluster][freshness] += 1
        cluster_importance[cluster][importance] += 1
        cluster_topic_counts[cluster][topic["id"]] += 1

    topics: list[TopicEntry] = []
    topic_lookup: dict[str, TopicEntry] = {}
    for cluster in CLUSTER_KEYS:
        cluster_topics = [topic_id for topic_id, _ in cluster_topic_counts[cluster].most_common(5)]
        for topic_id in cluster_topics:
            bucket = sorted(topic_buckets.get(topic_id, []), key=lambda memory: _parse_date(memory.created_at) or datetime.min.replace(tzinfo=timezone.utc), reverse=True)
            if not bucket:
                continue
            topic_entry = TopicEntry(
                id=topic_id,
                cluster=cluster,
                title=bucket[0].topic_title,
                summary=bucket[0].topic_summary,
                memory_ids=[memory.id for memory in bucket[:12]],
                freshness_text=_freshness_text_for_memories(bucket),
                attention_label=_attention_text_for_cluster("cluster", bucket),
                preview_titles=[memory.title for memory in bucket[:3]],
            )
            topics.append(topic_entry)
            topic_lookup[topic_id] = topic_entry

    clusters: list[MemoryClusterEntry] = []
    for topic in topics:
        topic_memories = [memory for memory in topic_buckets.get(topic.id, []) if memory.id in set(topic.memory_ids)]
        clusters.extend(_derive_semantic_clusters(topic, topic_memories))

    edge_counts: dict[tuple[str, str], Counter[str]] = defaultdict(Counter)
    total_pair_strength: Counter[tuple[str, str]] = Counter()
    for edge in raw_edges:
        source = _edge_source(edge, "source")
        target = _edge_source(edge, "target")
        if not source or not target:
            continue
        source_cluster = memory_cluster_lookup.get(source)
        target_cluster = memory_cluster_lookup.get(target)
        if not source_cluster or not target_cluster or source_cluster == target_cluster:
            continue
        pair = tuple(sorted((source_cluster, target_cluster)))
        semantic_type = _edge_type(str(edge.get("edge_type") or edge.get("type") or "resonance"))
        edge_counts[pair][semantic_type] += 1
        total_pair_strength[pair] += 1

    max_pair_count = max(total_pair_strength.values(), default=1)
    region_edges: list[EdgeEntry] = []
    region_links: dict[str, list[tuple[str, int]]] = defaultdict(list)
    for pair, pair_total in total_pair_strength.most_common(10):
        source, target = pair
        dominant_type, dominant_count = edge_counts[pair].most_common(1)[0]
        strength = round(min(1.0, dominant_count / max_pair_count), 2)
        region_edges.append(EdgeEntry(id=f"edge-{source}-{target}", source=source, target=target, edge_type=dominant_type, label=EDGE_LABELS[dominant_type], strength=max(0.24, strength)))
        region_links[source].append((target, pair_total))
        region_links[target].append((source, pair_total))

    regions: list[RegionInfo] = []
    for cluster in CLUSTER_KEYS:
        total = cluster_counts[cluster]
        fresh_recent = cluster_freshness[cluster]["fresh"] + cluster_freshness[cluster]["recent"]
        health = _health_for_region(fresh_recent, total)
        attention_level, attention_label = _attention({**cluster_freshness[cluster], **cluster_importance[cluster]})
        strongest_links = [CLUSTER_META[target]["label"] for target, _ in sorted(region_links.get(cluster, []), key=lambda item: item[1], reverse=True)[:2]]
        regions.append(RegionInfo(key=cluster, label=CLUSTER_META[cluster]["label"], icon=CLUSTER_META[cluster]["icon"], count=total, health=health, freshness_ratio=round((fresh_recent / total), 2) if total else 0.0, freshness_text=(f"{fresh_recent}/{total} fresh or recent" if total else "No active memories"), attention_level=attention_level, attention_label=attention_label, topic_count=sum(1 for topic in topics if topic.cluster == cluster), strongest_links=strongest_links))

    hottest_region = max(regions, key=lambda item: item.count if item.count else 0)
    most_crosslinked = max(regions, key=lambda item: len(item.strongest_links) if item.strongest_links else 0)
    insights = [
        GraphInsight(type="overview", message="Overview stays region-first while topic focus now blooms into semantic clusters instead of raw memory walls."),
        GraphInsight(type="focus", message=f"{hottest_region.label} currently holds the heaviest active memory load."),
        GraphInsight(type="clusters", message="Cluster generation is heuristic for now: action, tension, and memory lattices are inferred from live memory text."),
        GraphInsight(type="edges", message=f"{most_crosslinked.label} has the strongest visible cross-region ties right now."),
    ]

    return MemoryGraphResponse(regions=regions, topics=topics, clusters=clusters, memories=memories, edges=region_edges, insights=insights, total_memories=len(memories), fetched_at=fetched_at)
