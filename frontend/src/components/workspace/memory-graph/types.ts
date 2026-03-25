export type ClusterKey = "identity" | "daniel" | "world" | "playbook" | "archive";
export type HealthLevel = "green" | "yellow" | "red" | "gray";
export type FreshnessLevel = "fresh" | "recent" | "aging" | "stale" | "old";
export type AttentionLevel = "calm" | "watch" | "active";
export type SemanticEdgeType = "structural" | "resonance" | "tension";
export type MemoryClusterKind = "cluster" | "action" | "tension";

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

export interface RegionNodeData {
  cluster: ClusterKey;
  label: string;
  icon: string;
  count: number;
  health: HealthLevel;
  freshnessRatio: number;
  freshnessText: string;
  attentionLabel: string;
  attentionLevel: AttentionLevel;
  topicCount: number;
  strongestLinks: string[];
  focused?: boolean;
  dimmed?: boolean;
}

export interface TopicNodeData {
  id: string;
  cluster: ClusterKey;
  title: string;
  summary: string;
  memoryCount: number;
  freshnessText: string;
  attentionLabel: string;
  previewTitles: string[];
  selected?: boolean;
  dimmed?: boolean;
}

export interface ClusterNodeData {
  id: string;
  cluster: ClusterKey;
  kind: MemoryClusterKind;
  title: string;
  summary: string;
  memoryCount: number;
  freshnessText: string;
  attentionLabel: string;
  previewTitles: string[];
  selected?: boolean;
  dimmed?: boolean;
}

export interface MemoryParticleNodeData {
  id: string;
  title: string;
  cluster: ClusterKey;
  freshness: FreshnessLevel;
  importance: "critical" | "normal" | "fleeting";
  confidence: number | null;
  selected?: boolean;
}

export interface SemanticEdgeData {
  semanticType: SemanticEdgeType;
  label?: string;
  strength?: number;
  muted?: boolean;
  showLabel?: boolean;
}

export function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}
