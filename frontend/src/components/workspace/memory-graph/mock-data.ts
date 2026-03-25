import type { Node, Edge } from "@xyflow/react";
import { CLUSTER_HUES, CLUSTER_META, hexToRgba } from "./types";
import type { ClusterKey, MemoryNodeData, ClusterNodeData } from "./types";

interface MockMemory {
  id: string;
  title: string;
  snippet: string;
  cluster: ClusterKey;
  freshness: MemoryNodeData["freshness"];
  confidence: number | null;
  importance: MemoryNodeData["importance"];
}

const MEMORIES: MockMemory[] = [
  { id: "m-i1", title: "I am VESPER", snippet: "2h ago · persona", cluster: "identity", freshness: "fresh", confidence: 0.95, importance: "critical" },
  { id: "m-i2", title: "Calm, precise operator tone", snippet: "1d ago · persona", cluster: "identity", freshness: "recent", confidence: 0.88, importance: "critical" },
  { id: "m-i3", title: "Never expose implementation names", snippet: "3d ago · persona", cluster: "identity", freshness: "recent", confidence: 0.75, importance: "normal" },
  { id: "m-i4", title: "Prefer spatial over textual UI", snippet: "5d ago · persona", cluster: "identity", freshness: "recent", confidence: null, importance: "normal" },
  { id: "m-d1", title: "Prefers concise signals", snippet: "6h ago · human", cluster: "daniel", freshness: "fresh", confidence: 0.9, importance: "critical" },
  { id: "m-d2", title: "Moscow timezone (UTC+3)", snippet: "2d ago · human", cluster: "daniel", freshness: "recent", confidence: 0.99, importance: "normal" },
  { id: "m-d3", title: "Dislikes verbose explanations", snippet: "8d ago · human", cluster: "daniel", freshness: "aging", confidence: 0.7, importance: "normal" },
  { id: "m-w1", title: "VPS at 217.26.30.197 (Beget)", snippet: "1d ago · world", cluster: "world", freshness: "recent", confidence: 0.95, importance: "critical" },
  { id: "m-w2", title: "Notion Business plan active", snippet: "5d ago · world", cluster: "world", freshness: "recent", confidence: 0.85, importance: "normal" },
  { id: "m-w3", title: "Frontend at /opt/deer-flow/", snippet: "12h ago · world", cluster: "world", freshness: "fresh", confidence: 0.92, importance: "normal" },
  { id: "m-w4", title: "Port 8283 = Letta ACE", snippet: "15d ago · world", cluster: "world", freshness: "aging", confidence: 0.8, importance: "fleeting" },
  { id: "m-p1", title: "Deploy via Code Snippets pipeline", snippet: "3h ago · playbook", cluster: "playbook", freshness: "fresh", confidence: 0.88, importance: "critical" },
  { id: "m-p2", title: "Max 2 blind retries on failure", snippet: "4d ago · playbook", cluster: "playbook", freshness: "recent", confidence: 0.95, importance: "normal" },
  { id: "m-p3", title: "Always commit + push after edits", snippet: "2d ago · playbook", cluster: "playbook", freshness: "recent", confidence: 0.9, importance: "normal" },
  { id: "m-a1", title: "ACE migration to Letta completed", snippet: "32d ago · archive", cluster: "archive", freshness: "stale", confidence: 0.6, importance: "normal" },
  { id: "m-a2", title: "DanGPT Vercel deploy pattern", snippet: "45d ago · archive", cluster: "archive", freshness: "stale", confidence: 0.5, importance: "fleeting" },
  { id: "m-a3", title: "Original n8n webhook setup", snippet: "91d ago · archive", cluster: "archive", freshness: "old", confidence: 0.3, importance: "fleeting" },
];

const CLUSTER_POS: Record<ClusterKey, { x: number; y: number }> = {
  identity: { x: 60, y: 80 },
  daniel:   { x: 700, y: 80 },
  world:    { x: 60, y: 380 },
  playbook: { x: 700, y: 380 },
  archive:  { x: 380, y: 640 },
};

const NW = 180, NH = 56, GX = 16, GY = 14, PAD = 20, HDR = 16, COLS = 3;

function clusterSize(n: number) {
  const cols = Math.min(n, COLS);
  const rows = Math.ceil(n / COLS);
  return { width: cols * (NW + GX) - GX + PAD * 2, height: HDR + rows * (NH + GY) - GY + PAD * 2 };
}

function nodePos(i: number) {
  return { x: PAD + (i % COLS) * (NW + GX), y: HDR + PAD + Math.floor(i / COLS) * (NH + GY) };
}

export function generateMockGraphData(): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  const grouped = new Map<ClusterKey, MockMemory[]>();
  for (const m of MEMORIES) {
    if (!grouped.has(m.cluster)) grouped.set(m.cluster, []);
    grouped.get(m.cluster)!.push(m);
  }

  for (const [ck, mems] of grouped) {
    const pos = CLUSTER_POS[ck];
    const size = clusterSize(mems.length);
    const meta = CLUSTER_META[ck];
    const cdata: ClusterNodeData = {
      cluster: ck, label: meta.label, icon: meta.icon,
      count: mems.length, expanded: true,
      health: ck === "archive" ? "yellow" : "green",
    };
    nodes.push({
      id: "cluster-" + ck, type: "cluster", position: pos,
      data: cdata as any, style: { width: size.width, height: size.height },
      draggable: true, selectable: false,
    });
    mems.forEach((m, i) => {
      const mdata: MemoryNodeData = {
        title: m.title, snippet: m.snippet, cluster: m.cluster,
        freshness: m.freshness, confidence: m.confidence, importance: m.importance,
      };
      nodes.push({
        id: m.id, type: "memory", position: nodePos(i),
        parentId: "cluster-" + ck, extent: "parent" as const,
        draggable: false, data: mdata as any,
      });
    });
  }

  const assocPairs: [string, string][] = [
    ["m-i1", "m-d1"], ["m-w1", "m-p1"], ["m-i3", "m-p2"],
    ["m-w3", "m-a1"], ["m-d2", "m-w1"],
  ];
  for (const [src, tgt] of assocPairs) {
    const srcMem = MEMORIES.find((m) => m.id === src);
    const color = srcMem ? hexToRgba(CLUSTER_HUES[srcMem.cluster], 0.15) : "rgba(148,163,184,0.15)";
    edges.push({ id: "e-" + src + "-" + tgt, source: src, target: tgt, type: "association", data: { color } });
  }
  edges.push({ id: "e-t-a1-a2", source: "m-a1", target: "m-a2", type: "temporal" });
  edges.push({ id: "e-t-a2-a3", source: "m-a2", target: "m-a3", type: "temporal" });

  return { nodes, edges };
}
