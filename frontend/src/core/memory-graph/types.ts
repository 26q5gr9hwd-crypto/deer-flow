export interface MemoryEntry {
  id: string;
  title: string;
  snippet: string;
  cluster: string;
  freshness: string;
  confidence: number | null;
  importance: string;
  created_at: string | null;
}

export interface ClusterInfo {
  key: string;
  label: string;
  icon: string;
  count: number;
  health: string;
}

export interface EdgeEntry {
  id: string;
  source: string;
  target: string;
  edge_type: string;
}

export interface GraphInsight {
  type: string;
  message: string;
}

export interface MemoryGraphData {
  clusters: ClusterInfo[];
  memories: MemoryEntry[];
  edges: EdgeEntry[];
  insights: GraphInsight[];
  total_memories: number;
  fetched_at: string;
}
