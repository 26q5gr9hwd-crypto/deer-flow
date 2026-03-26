"use client";

import {
  Background,
  BackgroundVariant,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react";
import type { Edge, Node, NodeMouseHandler } from "@xyflow/react";
import { AlertTriangle, Loader2, Maximize2, Minus, Plus, RefreshCw } from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import "@xyflow/react/dist/style.css";

import { useMemoryGraphData, useRefreshMemoryGraph } from "@/core/memory-graph";
import type { ClusterKey, MemoryEntry, MemoryGraphData } from "@/core/memory-graph";

import "./memory-graph.css";
import { SemanticEdge } from "./edges/custom-edges";
import { Inspector } from "./inspector";
import { ClusterNode } from "./nodes/cluster-node";
import { MemoryNode } from "./nodes/memory-node";
import { RegionNode } from "./nodes/region-node";
import { TopicNode } from "./nodes/topic-node";
import { CLUSTER_HUES, clamp, hexToRgba } from "./types";
import type { ClusterNodeData, MemoryParticleNodeData, RegionNodeData, SemanticEdgeData, TopicNodeData } from "./types";

const nodeTypes = { region: RegionNode, topic: TopicNode, cluster: ClusterNode, memory: MemoryNode };
const edgeTypes = { semantic: SemanticEdge };
const DEFAULT_POS = { x: 400, y: 360 };

const REGION_POSITIONS: Record<ClusterKey, { x: number; y: number }> = {
  identity: { x: 70, y: 90 },
  daniel: { x: 760, y: 90 },
  world: { x: 70, y: 430 },
  playbook: { x: 760, y: 430 },
  archive: { x: 415, y: 745 },
};

const TOPIC_OFFSETS = [
  { x: 480, y: -140 },
  { x: 530, y: 120 },
  { x: 420, y: 340 },
  { x: 120, y: 380 },
  { x: -100, y: 180 },
];

const CLUSTER_OFFSETS = [
  { x: 40, y: -240 },
  { x: 280, y: -50 },
  { x: 200, y: 210 },
  { x: -80, y: 160 },
];

function polarOffsets(count: number, radius: number) {
  return Array.from({ length: count }, (_, index) => {
    const angle = (-Math.PI / 2) + (index / Math.max(count, 1)) * Math.PI * 2;
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
  });
}

function regionNodeId(cluster: ClusterKey): string { return `region-${cluster}`; }
function topicNodeId(topicId: string): string { return `topic-${topicId}`; }
function semanticClusterNodeId(clusterId: string): string { return `semantic-cluster-${clusterId}`; }
function memoryParticleNodeId(memoryId: string): string { return `memory-particle-${memoryId}`; }

function buildGraph(
  data: MemoryGraphData,
  focusedRegion: ClusterKey | null,
  selectedTopicId: string | null,
  selectedClusterId: string | null,
  selectedMemoryId: string | null,
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const topicPositions = new Map<string, { x: number; y: number }>();
  const clusterPositions = new Map<string, { x: number; y: number }>();

  data.regions.forEach((region) => {
    const nodeId = regionNodeId(region.key);
    nodes.push({
      id: nodeId,
      type: "region",
      position: REGION_POSITIONS[region.key] ?? DEFAULT_POS,
      draggable: false,
      selectable: false,
      data: {
        cluster: region.key,
        label: region.label,
        icon: region.icon,
        count: region.count,
        health: region.health,
        freshnessRatio: clamp(region.freshness_ratio),
        freshnessText: region.freshness_text,
        attentionLabel: region.attention_label,
        attentionLevel: region.attention_level,
        topicCount: region.topic_count,
        strongestLinks: region.strongest_links,
        focused: region.key === focusedRegion,
        dimmed: Boolean(focusedRegion && region.key !== focusedRegion),
      } satisfies RegionNodeData,
    });
  });

  data.edges.forEach((edge) => {
    const sourceId = regionNodeId(edge.source as ClusterKey);
    const targetId = regionNodeId(edge.target as ClusterKey);
    edges.push({
      id: edge.id,
      source: sourceId,
      target: targetId,
      type: "semantic",
      data: {
        semanticType: edge.edge_type,
        label: edge.label,
        strength: edge.strength,
        muted: Boolean(focusedRegion && edge.source !== focusedRegion && edge.target !== focusedRegion),
        showLabel: !focusedRegion || edge.source === focusedRegion || edge.target === focusedRegion,
      } satisfies SemanticEdgeData,
    });
  });

  if (!focusedRegion) {
    return { nodes, edges };
  }

  const regionTopics = data.topics.filter((topic) => topic.cluster === focusedRegion).slice(0, 5);
  const base = REGION_POSITIONS[focusedRegion] ?? DEFAULT_POS;
  regionTopics.forEach((topic, index) => {
    const offset = TOPIC_OFFSETS[index] ?? TOPIC_OFFSETS[TOPIC_OFFSETS.length - 1]!;
    const id = topicNodeId(topic.id);
    const position = { x: base.x + offset.x, y: base.y + offset.y };
    topicPositions.set(topic.id, position);
    nodes.push({
      id,
      type: "topic",
      position,
      draggable: false,
      selectable: false,
      data: {
        id: topic.id,
        cluster: topic.cluster,
        title: topic.title,
        summary: topic.summary,
        memoryCount: topic.memory_ids.length,
        freshnessText: topic.freshness_text,
        attentionLabel: topic.attention_label,
        previewTitles: topic.preview_titles,
        selected: selectedTopicId === topic.id,
        dimmed: Boolean(selectedTopicId && selectedTopicId !== topic.id),
      } satisfies TopicNodeData,
    });
    edges.push({
      id: `topic-link-${topic.id}`,
      source: regionNodeId(focusedRegion),
      target: id,
      type: "semantic",
      data: { semanticType: "structural", label: "Theme", strength: 0.5, muted: false, showLabel: false } satisfies SemanticEdgeData,
    });
  });

  if (!selectedTopicId) {
    return { nodes, edges };
  }

  const topicClusters = data.clusters.filter((cluster) => cluster.topic_id === selectedTopicId).slice(0, 4);
  const topicPosition = topicPositions.get(selectedTopicId) ?? { x: base.x + 280, y: base.y + 120 };
  topicClusters.forEach((cluster, index) => {
    const offset = CLUSTER_OFFSETS[index] ?? CLUSTER_OFFSETS[CLUSTER_OFFSETS.length - 1]!;
    const id = semanticClusterNodeId(cluster.id);
    const position = { x: topicPosition.x + offset.x, y: topicPosition.y + offset.y };
    clusterPositions.set(cluster.id, position);
    nodes.push({
      id,
      type: "cluster",
      position,
      draggable: false,
      selectable: false,
      data: {
        id: cluster.id,
        cluster: cluster.cluster,
        kind: cluster.kind,
        title: cluster.title,
        summary: cluster.summary,
        memoryCount: cluster.memory_ids.length,
        freshnessText: cluster.freshness_text,
        attentionLabel: cluster.attention_label,
        previewTitles: cluster.preview_titles,
        selected: selectedClusterId === cluster.id,
        dimmed: Boolean(selectedClusterId && selectedClusterId !== cluster.id),
      } satisfies ClusterNodeData,
    });
    edges.push({
      id: `cluster-link-${cluster.id}`,
      source: topicNodeId(selectedTopicId),
      target: id,
      type: "semantic",
      data: {
        semanticType: cluster.kind === "tension" ? "tension" : cluster.kind === "action" ? "resonance" : "structural",
        label: cluster.kind === "cluster" ? "Cluster" : cluster.kind === "action" ? "Action" : "Tension",
        strength: 0.46,
        muted: false,
        showLabel: false,
      } satisfies SemanticEdgeData,
    });
  });

  if (!selectedClusterId) {
    return { nodes, edges };
  }

  const activeCluster = data.clusters.find((cluster) => cluster.id === selectedClusterId);
  if (!activeCluster) {
    return { nodes, edges };
  }
  const swarmPosition = clusterPositions.get(selectedClusterId) ?? topicPosition;
  const memoryEntries = activeCluster.memory_ids
    .map((id) => data.memories.find((memory) => memory.id === id))
    .filter((item): item is MemoryEntry => Boolean(item))
    .slice(0, 12);

  polarOffsets(memoryEntries.length, 190).forEach((offset, index) => {
    const memory = memoryEntries[index]!;
    const id = memoryParticleNodeId(memory.id);
    nodes.push({
      id,
      type: "memory",
      position: { x: swarmPosition.x + offset.x, y: swarmPosition.y + offset.y },
      draggable: false,
      selectable: false,
      data: {
        id: memory.id,
        title: memory.title,
        cluster: memory.cluster,
        freshness: memory.freshness,
        importance: memory.importance,
        confidence: memory.confidence,
        selected: selectedMemoryId === memory.id,
      } satisfies MemoryParticleNodeData,
    });
    edges.push({
      id: `memory-link-${memory.id}`,
      source: semanticClusterNodeId(selectedClusterId),
      target: id,
      type: "semantic",
      data: { semanticType: "structural", label: "Particle", strength: 0.26, muted: false, showLabel: false } satisfies SemanticEdgeData,
    });
  });

  return { nodes, edges };
}

function MemoryGraphInner() {
  const reactFlow = useReactFlow();
  const refreshGraph = useRefreshMemoryGraph();
  const { data, isLoading, error, isFetching } = useMemoryGraphData();

  const [focusedRegion, setFocusedRegion] = useState<ClusterKey | null>(null);
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null);
  const [selectedMemoryId, setSelectedMemoryId] = useState<string | null>(null);

  const regions = useMemo(() => data?.regions ?? [], [data]);
  const topics = useMemo(() => data?.topics ?? [], [data]);
  const clusters = useMemo(() => data?.clusters ?? [], [data]);
  const memories = useMemo(() => data?.memories ?? [], [data]);
  const insights = useMemo(() => data?.insights ?? [], [data]);

  const regionMap = useMemo(() => new Map(regions.map((region) => [region.key, region])), [regions]);
  const topicMap = useMemo(() => new Map(topics.map((topic) => [topic.id, topic])), [topics]);
  const clusterMap = useMemo(() => new Map(clusters.map((cluster) => [cluster.id, cluster])), [clusters]);
  const memoryMap = useMemo(() => new Map(memories.map((memory) => [memory.id, memory])), [memories]);
  const memoryToSemanticCluster = useMemo(() => {
    const pairs: Array<[string, string]> = [];
    clusters.forEach((cluster) => cluster.memory_ids.forEach((memoryId) => pairs.push([memoryId, cluster.id])));
    return new Map(pairs);
  }, [clusters]);

  const selectedMemory = selectedMemoryId ? (memoryMap.get(selectedMemoryId) ?? null) : null;
  const selectedCluster = selectedMemory
    ? (clusterMap.get(memoryToSemanticCluster.get(selectedMemory.id) ?? "") ?? null)
    : (selectedClusterId ? (clusterMap.get(selectedClusterId) ?? null) : null);
  const selectedTopic = selectedCluster
    ? (topicMap.get(selectedCluster.topic_id) ?? null)
    : selectedMemory
      ? (topicMap.get(selectedMemory.topic_id) ?? null)
      : (selectedTopicId ? (topicMap.get(selectedTopicId) ?? null) : null);
  const selectedRegionKey = (selectedMemory?.cluster ?? selectedCluster?.cluster ?? selectedTopic?.cluster ?? focusedRegion) ?? null;
  const selectedRegion = selectedRegionKey ? (regionMap.get(selectedRegionKey) ?? null) : null;
  const regionTopics = selectedRegionKey ? topics.filter((topic) => topic.cluster === selectedRegionKey).slice(0, 5) : [];
  const topicClusters = selectedTopic ? clusters.filter((cluster) => cluster.topic_id === selectedTopic.id) : [];
  const clusterMemories = selectedCluster
    ? selectedCluster.memory_ids.map((id) => memoryMap.get(id)).filter((item): item is MemoryEntry => Boolean(item))
    : [];
  const relatedMemories = selectedMemory ? clusterMemories.filter((item) => item.id !== selectedMemory.id) : [];

  const graph = useMemo(() => {
    if (!data) {
      return { nodes: [], edges: [] };
    }
    return buildGraph(data, focusedRegion, selectedTopic?.id ?? null, selectedCluster?.id ?? null, selectedMemory?.id ?? null);
  }, [data, focusedRegion, selectedCluster, selectedMemory, selectedTopic]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!data) {
        return;
      }
      if (selectedCluster) {
        const topicPos = REGION_POSITIONS[selectedCluster.cluster] ?? DEFAULT_POS;
        void reactFlow.setCenter(topicPos.x + 360, topicPos.y + 180, { duration: 320, zoom: 1.06 });
        return;
      }
      if (selectedTopic) {
        const topicPos = REGION_POSITIONS[selectedTopic.cluster] ?? DEFAULT_POS;
        void reactFlow.setCenter(topicPos.x + 320, topicPos.y + 160, { duration: 320, zoom: 0.96 });
        return;
      }
      if (focusedRegion) {
        const pos = REGION_POSITIONS[focusedRegion] ?? DEFAULT_POS;
        void reactFlow.setCenter(pos.x + 180, pos.y + 120, { duration: 320, zoom: 0.86 });
        return;
      }
      void reactFlow.fitView({ duration: 320, padding: 0.18 });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [data, focusedRegion, reactFlow, selectedCluster, selectedTopic]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (selectedMemoryId) {
          setSelectedMemoryId(null);
        } else if (selectedClusterId) {
          setSelectedClusterId(null);
        } else if (selectedTopicId) {
          setSelectedTopicId(null);
        } else if (focusedRegion) {
          setFocusedRegion(null);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [focusedRegion, selectedClusterId, selectedMemoryId, selectedTopicId]);

  const openRegion = (cluster: ClusterKey) => {
    setFocusedRegion(cluster);
    setSelectedTopicId(null);
    setSelectedClusterId(null);
    setSelectedMemoryId(null);
  };

  const openTopic = (topicId: string) => {
    const topic = topicMap.get(topicId);
    if (!topic) {
      return;
    }
    setFocusedRegion(topic.cluster);
    setSelectedTopicId(topicId);
    setSelectedClusterId(null);
    setSelectedMemoryId(null);
  };

  const openSemanticCluster = (clusterId: string) => {
    const cluster = clusterMap.get(clusterId);
    if (!cluster) {
      return;
    }
    setFocusedRegion(cluster.cluster);
    setSelectedTopicId(cluster.topic_id);
    setSelectedClusterId(clusterId);
    setSelectedMemoryId(null);
  };

  const openMemory = (memoryId: string) => {
    const memory = memoryMap.get(memoryId);
    const semanticClusterId = memoryToSemanticCluster.get(memoryId);
    if (!memory || !semanticClusterId) {
      return;
    }
    setFocusedRegion(memory.cluster);
    setSelectedTopicId(memory.topic_id);
    setSelectedClusterId(semanticClusterId);
    setSelectedMemoryId(memoryId);
  };

  const onBack = () => {
    if (selectedMemoryId) {
      setSelectedMemoryId(null);
      return;
    }
    if (selectedClusterId) {
      setSelectedClusterId(null);
      return;
    }
    if (selectedTopicId) {
      setSelectedTopicId(null);
      return;
    }
    setFocusedRegion(null);
  };

  const onNodeClick: NodeMouseHandler = (_, node) => {
    if (node.id.startsWith("region-")) {
      openRegion(node.id.replace("region-", "") as ClusterKey);
      return;
    }
    if (node.id.startsWith("topic-")) {
      openTopic(node.id.replace("topic-", ""));
      return;
    }
    if (node.id.startsWith("semantic-cluster-")) {
      openSemanticCluster(node.id.replace("semantic-cluster-", ""));
      return;
    }
    if (node.id.startsWith("memory-particle-")) {
      openMemory(node.id.replace("memory-particle-", ""));
    }
  };

  const stateLabel = selectedMemory
    ? "Cluster focus → memory detail"
    : selectedCluster
      ? "Cluster focus"
      : selectedTopic
        ? "Topic focus"
        : focusedRegion
          ? "Region focus"
          : "Stable overview";

  if (isLoading && !data) {
    return (
      <div className="memory-graph-shell">
        <div className="mg-empty-state">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading Memory Graph v3…</span>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="memory-graph-shell">
        <div className="mg-empty-state mg-empty-error">
          <AlertTriangle className="h-5 w-5" />
          <div className="font-medium text-white">Memory Graph failed to load.</div>
          <button className="mg-toolbar-button" onClick={() => refreshGraph()}>
            <RefreshCw className="h-4 w-4" /> Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="memory-graph-shell">
      <div className="mg-overlay-top">
        <div className="mg-status-pill">
          <span>Memory Graph v3</span>
          <strong>{stateLabel}</strong>
        </div>
        <div className="mg-toolbar">
          <button className="mg-toolbar-button" onClick={() => setFocusedRegion(null)} aria-label="Overview"><Maximize2 className="h-4 w-4" /></button>
          <button className="mg-toolbar-button" onClick={() => reactFlow.zoomOut({ duration: 180 })} aria-label="Zoom out"><Minus className="h-4 w-4" /></button>
          <button className="mg-toolbar-button" onClick={() => reactFlow.zoomIn({ duration: 180 })} aria-label="Zoom in"><Plus className="h-4 w-4" /></button>
          <button className="mg-toolbar-button" onClick={() => reactFlow.fitView({ duration: 220, padding: 0.18 })} aria-label="Fit view"><Maximize2 className="h-4 w-4" /></button>
          <button className="mg-toolbar-button" onClick={() => refreshGraph()} aria-label="Refresh"><RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} /></button>
        </div>
      </div>

      <div className="mg-insights-panel">
        {insights.slice(0, 4).map((insight) => (
          <div key={`${insight.type}-${insight.message}`} className="mg-insight-card">
            <div className="mg-insight-type">{insight.type}</div>
            <p>{insight.message}</p>
          </div>
        ))}
      </div>

      <ReactFlow
        nodes={graph.nodes}
        edges={graph.edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        minZoom={0.5}
        maxZoom={1.5}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag
        panOnScroll
        onNodeClick={onNodeClick}
        onPaneClick={() => {
          /* no-op for now */
        }}
        className="mg-reactflow"
      >
        <MiniMap
          pannable
          zoomable
          nodeColor={(node) => {
            const cluster = (node.data as { cluster?: ClusterKey } | undefined)?.cluster;
            return cluster ? hexToRgba(CLUSTER_HUES[cluster], node.type === "region" ? 0.9 : 0.45) : "#64748b";
          }}
          maskColor="rgba(7, 10, 16, 0.72)"
          style={{ width: 168, height: 112, borderRadius: 16, background: "rgba(8, 11, 18, 0.86)", border: "1px solid rgba(255,255,255,0.06)" }}
        />
        <Background color="rgba(255,255,255,0.06)" variant={BackgroundVariant.Dots} gap={28} size={1.3} />
      </ReactFlow>

      <Inspector
        region={selectedRegion}
        regionTopics={regionTopics}
        topic={selectedTopic}
        topicClusters={topicClusters}
        cluster={selectedCluster}
        clusterMemories={clusterMemories}
        memory={selectedMemory}
        relatedMemories={relatedMemories}
        onClose={() => {
          setSelectedMemoryId(null);
          setSelectedClusterId(null);
          setSelectedTopicId(null);
          setFocusedRegion(null);
        }}
        onBack={onBack}
        onOpenTopic={openTopic}
        onOpenCluster={openSemanticCluster}
        onOpenMemory={openMemory}
      />
    </div>
  );
}

export function MemoryGraphCanvas() {
  return (
    <ReactFlowProvider>
      <MemoryGraphInner />
    </ReactFlowProvider>
  );
}
