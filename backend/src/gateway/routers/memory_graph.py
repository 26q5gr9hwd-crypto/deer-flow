"""Memory Graph API router for the Memory Graph visualization.

Fetches memories from Hindsight API (port 8888), classifies them into
5 clusters (identity, daniel, world, playbook, archive), computes
cross-cluster association edges, and returns structured JSON for the
React Flow canvas.
"""

import logging
from datetime import datetime, timezone
from typing import Any

import httpx
from fastapi import APIRouter
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/memory", tags=["memory"])

HINDSIGHT_BASE = "http://127.0.0.1:8888/v1/default"
BANK_ID = "vesper"

CLUSTER_KEYS = ["identity", "daniel", "world", "playbook", "archive"]

CLUSTER_META: dict[str, dict[str, str]] = {
    "identity": {"label": "Identity", "icon": "\U0001f9ec"},
    "daniel":   {"label": "Daniel",   "icon": "\U0001f464"},
    "world":    {"label": "World",    "icon": "\U0001f30d"},
    "playbook": {"label": "Playbook", "icon": "\U0001f4d6"},
    "archive":  {"label": "Archive",  "icon": "\U0001f5c4\ufe0f"},
}


# ── Pydantic models ──────────────────────────────────────────────

class MemoryEntry(BaseModel):
    id: str
    title: str
    snippet: str
    cluster: str
    freshness: str
    confidence: float | None = None
    importance: str = "normal"
    created_at: str | None = None


class ClusterInfo(BaseModel):
    key: str
    label: str
    icon: str
    count: int
    health: str = "green"


class EdgeEntry(BaseModel):
    id: str
    source: str
    target: str
    edge_type: str  # association | temporal | contradiction


class GraphInsight(BaseModel):
    type: str
    message: str


class MemoryGraphResponse(BaseModel):
    clusters: list[ClusterInfo]
    memories: list[MemoryEntry]
    edges: list[EdgeEntry]
    insights: list[GraphInsight] = Field(default_factory=list)
    total_memories: int = 0
    fetched_at: str = ""


# ── Classification helpers ────────────────────────────────────────

def _classify_cluster(mem: dict[str, Any]) -> str:
    """Map a Hindsight memory to one of the 5 UI clusters."""
    fact_type = mem.get("fact_type", "")
    text = (mem.get("text") or "").lower()
    entities = (mem.get("entities") or "").lower()

    # Very old memories → archive
    date_str = mem.get("date")
    if date_str:
        try:
            from dateutil.parser import parse as _dp
            age = (datetime.now(timezone.utc) - _dp(date_str)).days
            if age > 30:
                return "archive"
        except Exception:
            pass

    # Identity – about the assistant / VESPER itself
    if any(kw in entities for kw in ("assistant", "vesper")):
        if fact_type == "experience":
            return "identity"

    # Daniel – about the user
    if "user" in entities or "daniel" in text:
        return "daniel"

    # Playbook – consolidated observations (patterns, procedures)
    if fact_type == "observation":
        return "playbook"

    # World – factual / technical knowledge
    if fact_type == "world":
        return "world"

    # Remaining experiences → identity
    if fact_type == "experience":
        return "identity"

    return "world"


def _freshness(date_str: str | None) -> str:
    if not date_str:
        return "recent"
    try:
        from dateutil.parser import parse as _dp
        hours = (datetime.now(timezone.utc) - _dp(date_str)).total_seconds() / 3600
        if hours < 6:
            return "fresh"
        if hours < 72:
            return "recent"
        if hours < 336:
            return "aging"
        if hours < 2160:
            return "stale"
        return "old"
    except Exception:
        return "recent"


def _importance(mem: dict[str, Any]) -> str:
    proof = mem.get("proof_count") or 1
    if proof >= 4:
        return "critical"
    if proof >= 2:
        return "normal"
    return "fleeting"


def _truncate(text: str, limit: int = 60) -> str:
    if len(text) <= limit:
        return text
    return text[: limit - 1] + "\u2026"


def _snippet(mem: dict[str, Any]) -> str:
    parts: list[str] = []
    date_str = mem.get("date")
    if date_str:
        try:
            from dateutil.parser import parse as _dp
            hours = (datetime.now(timezone.utc) - _dp(date_str)).total_seconds() / 3600
            if hours < 1:
                parts.append("just now")
            elif hours < 24:
                parts.append(f"{int(hours)}h ago")
            elif hours < 168:
                parts.append(f"{int(hours / 24)}d ago")
            else:
                parts.append(f"{int(hours / 168)}w ago")
        except Exception:
            pass
    ft = mem.get("fact_type", "")
    if ft:
        parts.append(ft)
    return " \u00b7 ".join(parts) if parts else ""


# ── Route ─────────────────────────────────────────────────────────

@router.get(
    "/graph",
    response_model=MemoryGraphResponse,
    summary="Get Memory Graph",
    description="Structured memory graph data from Hindsight for the Memory Graph canvas.",
)
async def get_memory_graph() -> MemoryGraphResponse:
    now = datetime.now(timezone.utc).isoformat()

    async with httpx.AsyncClient(timeout=30.0) as client:
        # ── 1. Fetch memories ──
        try:
            r = await client.get(
                f"{HINDSIGHT_BASE}/banks/{BANK_ID}/memories/list",
                params={"limit": 200},
            )
            r.raise_for_status()
            raw_mems: list[dict[str, Any]] = r.json().get("items", [])
        except Exception as exc:
            logger.error("Hindsight memories fetch failed: %s", exc)
            raw_mems = []

        # ── 2. Fetch graph edges ──
        try:
            r = await client.get(f"{HINDSIGHT_BASE}/banks/{BANK_ID}/graph")
            r.raise_for_status()
            raw_edges: list[dict[str, Any]] = r.json().get("edges", [])
        except Exception as exc:
            logger.error("Hindsight graph fetch failed: %s", exc)
            raw_edges = []

    # Empty guard
    if not raw_mems:
        return MemoryGraphResponse(
            clusters=[], memories=[], edges=[], insights=[],
            total_memories=0, fetched_at=now,
        )

    # ── 3. Classify into clusters ──
    memories: list[MemoryEntry] = []
    mem_ids: set[str] = set()
    cluster_counts: dict[str, int] = {k: 0 for k in CLUSTER_KEYS}

    for m in raw_mems:
        mid = m.get("id", "")
        if not mid:
            continue
        mem_ids.add(mid)
        cluster = _classify_cluster(m)
        cluster_counts[cluster] += 1

        raw_text = m.get("text") or ""
        title = _truncate(raw_text.split("|")[0].strip() if "|" in raw_text else raw_text, 60)

        memories.append(MemoryEntry(
            id=mid,
            title=title,
            snippet=_snippet(m),
            cluster=cluster,
            freshness=_freshness(m.get("date")),
            confidence=min(1.0, (m.get("proof_count") or 1) / 5.0),
            importance=_importance(m),
            created_at=m.get("date"),
        ))

    # ── 4. Build cluster info ──
    clusters: list[ClusterInfo] = []
    for ck in CLUSTER_KEYS:
        meta = CLUSTER_META[ck]
        cnt = cluster_counts.get(ck, 0)
        fresh_cnt = sum(
            1 for me in memories
            if me.cluster == ck and me.freshness in ("fresh", "recent")
        )
        health = "green" if fresh_cnt > 0 else ("yellow" if cnt > 0 else "gray")
        clusters.append(ClusterInfo(
            key=ck, label=meta["label"], icon=meta["icon"],
            count=cnt, health=health,
        ))

    # ── 5. Process edges – cross-cluster associations, top 3 per node ──
    edges: list[EdgeEntry] = []
    edge_per_node: dict[str, int] = {}
    mem_cluster_map = {me.id: me.cluster for me in memories}

    for raw_e in raw_edges:
        ed = raw_e.get("data", {})
        src, tgt, eid = ed.get("source", ""), ed.get("target", ""), ed.get("id", "")
        if src not in mem_ids or tgt not in mem_ids:
            continue

        if "semantic" in eid or "caused_by" in eid:
            etype = "association"
        elif "temporal" in eid:
            etype = "temporal"
        else:
            etype = "association"

        # For associations keep only cross-cluster
        if etype == "association":
            if mem_cluster_map.get(src) == mem_cluster_map.get(tgt):
                continue

        sc = edge_per_node.get(src, 0)
        tc = edge_per_node.get(tgt, 0)
        if sc >= 3 and tc >= 3:
            continue
        edge_per_node[src] = sc + 1
        edge_per_node[tgt] = tc + 1

        edges.append(EdgeEntry(
            id=f"e-{src[:8]}-{tgt[:8]}-{etype}",
            source=src, target=tgt, edge_type=etype,
        ))

    # ── 6. Insights ──
    insights: list[GraphInsight] = []
    total = len(memories)
    fresh_total = sum(1 for me in memories if me.freshness == "fresh")
    if fresh_total:
        insights.append(GraphInsight(type="activity", message=f"{fresh_total} memories updated recently"))
    stale_total = sum(1 for me in memories if me.freshness in ("stale", "old"))
    if stale_total > total * 0.3:
        insights.append(GraphInsight(type="staleness", message=f"{stale_total} memories may need review"))

    return MemoryGraphResponse(
        clusters=clusters,
        memories=memories,
        edges=edges,
        insights=insights,
        total_memories=total,
        fetched_at=now,
    )
