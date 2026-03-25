export type ClusterKey = "identity" | "daniel" | "world" | "playbook" | "archive";

export const CLUSTER_HUES: Record<ClusterKey, string> = {
  identity: "#6366f1",
  daniel: "#f59e0b",
  world: "#14b8a6",
  playbook: "#8b5cf6",
  archive: "#64748b",
};

export const CLUSTER_META: Record<ClusterKey, { label: string; icon: string; index: number }> = {
  identity: { label: "Identity", icon: "🧬", index: 1 },
  daniel: { label: "Daniel", icon: "👤", index: 2 },
  world: { label: "World", icon: "🌍", index: 3 },
  playbook: { label: "Playbook", icon: "📖", index: 4 },
  archive: { label: "Archive", icon: "🗄️", index: 5 },
};

export type FreshnessLevel = "fresh" | "recent" | "aging" | "stale" | "old";

export interface MemoryNodeData {
  title: string;
  snippet: string;
  cluster: ClusterKey;
  freshness: FreshnessLevel;
  confidence: number | null;
  importance: "critical" | "normal" | "fleeting";
}

export interface ClusterNodeData {
  cluster: ClusterKey;
  label: string;
  icon: string;
  count: number;
  expanded: boolean;
  health: "green" | "yellow" | "red" | "gray";
}

export function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return "rgba(" + r + "," + g + "," + b + "," + alpha + ")";
}
