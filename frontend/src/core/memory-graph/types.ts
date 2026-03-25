export type ClusterKey = "identity" | "daniel" | "world" | "playbook" | "archive";
export type HealthLevel = "green" | "yellow" | "red" | "gray";
export type FreshnessLevel = "fresh" | "recent" | "aging" | "stale" | "old";
export type AttentionLevel = "calm" | "watch" | "active";
export type SemanticEdgeType = "structural" | "resonance" | "tension";
export type MemoryClusterKind = "cluster" | "action" | "tension";

export interface MemoryEntry {
  id: string;
  title: string;
  snippet: string;
  cluster: ClusterKey;
  freshness: FreshnessLevel;
  confidence: number | null;
  importance: "critical" | "normal" | "fleeting";
  created_at: string | null;
  topic_id: string;
  topic_title: string;
  topic_summary: string;
}

export interface RegionInfo {
  key: ClusterKey;
  label: string;
  icon: string;
  count: number;
  health: HealthLevel;
  freshness_ratio: number;
  freshness_text: string;
  attention_level: AttentionLevel;
  attention_label: string;
  topic_count: number;
  strongest_links: string[];
}

export interface TopicEntry {
  id: string;
  cluster: ClusterKey;
  title: string;
  summary: string;
  memory_ids: string[];
  freshness_text: string;
  attention_label: string;
  preview_titles: string[];
}

export interface MemoryClusterEntry {
  id: string;
  cluster: ClusterKey;
  topic_id: string;
  title: string;
  summary: string;
  kind: MemoryClusterKind;
  memory_ids: string[];
  freshness_text: string;
  attention_label: string;
  preview_titles: string[];
}

export interface EdgeEntry {
  id: string;
  source: string;
  target: string;
  edge_type: SemanticEdgeType;
  label: string;
  strength: number;
}

export interface GraphInsight {
  type: string;
  message: string;
}

export interface MemoryGraphData {
  regions: RegionInfo[];
  topics: TopicEntry[];
  clusters: MemoryClusterEntry[];
  memories: MemoryEntry[];
  edges: EdgeEntry[];
  insights: GraphInsight[];
  total_memories: number;
  fetched_at: string;
}
