"use client";

import { ArrowLeft, ChevronRight, Sparkles, X } from "lucide-react";
import React from "react";

import type { MemoryClusterEntry, MemoryEntry, RegionInfo, TopicEntry } from "@/core/memory-graph";

import { CLUSTER_HUES, CLUSTER_META } from "./types";

export interface InspectorProps {
  region: RegionInfo | null;
  regionTopics: TopicEntry[];
  topic: TopicEntry | null;
  topicClusters: MemoryClusterEntry[];
  cluster: MemoryClusterEntry | null;
  clusterMemories: MemoryEntry[];
  memory: MemoryEntry | null;
  relatedMemories: MemoryEntry[];
  onClose: () => void;
  onBack: () => void;
  onOpenTopic: (topicId: string) => void;
  onOpenCluster: (clusterId: string) => void;
  onOpenMemory: (memoryId: string) => void;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="mg-inspector-section-title">{children}</div>;
}

export function Inspector({
  region,
  regionTopics,
  topic,
  topicClusters,
  cluster,
  clusterMemories,
  memory,
  relatedMemories,
  onClose,
  onBack,
  onOpenTopic,
  onOpenCluster,
  onOpenMemory,
}: InspectorProps) {
  if (!region && !topic && !cluster && !memory) {
    return null;
  }

  const lane = (memory?.cluster ?? cluster?.cluster ?? topic?.cluster ?? region?.key) ?? "identity";
  const hue = CLUSTER_HUES[lane];
  const meta = CLUSTER_META[lane];
  const title = memory?.title ?? cluster?.title ?? topic?.title ?? region?.label ?? "Memory graph";
  const subtitle = memory
    ? `${meta.label} memory detail`
    : cluster
      ? `${meta.label} cluster focus`
      : topic
        ? `${meta.label} topic focus`
        : `${meta.label} region focus`;

  return (
    <aside className="mg-inspector-panel">
      <div className="mg-inspector-header" style={{ borderColor: `${hue}33` }}>
        <div className="mg-inspector-heading">
          {(memory || cluster || topic) ? (
            <button className="mg-inspector-back" onClick={onBack} aria-label="Go back">
              <ArrowLeft className="h-4 w-4" />
            </button>
          ) : null}
          <div>
            <div className="mg-inspector-kicker">{subtitle}</div>
            <div className="mg-inspector-title-row">
              <span className="mg-inspector-emoji">{meta.icon}</span>
              <h2 className="mg-inspector-title">{title}</h2>
            </div>
          </div>
        </div>
        <button className="mg-inspector-close" onClick={onClose} aria-label="Close inspector">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mg-inspector-body mg-scrollbar">
        {memory ? (
          <>
            <div className="mg-inspector-copy">
              <p>{memory.snippet}</p>
              <p className="mg-inspector-muted">Readable detail stays inspector-first while raw memory presence remains off-canvas until cluster focus.</p>
            </div>
            <div className="mg-inspector-grid">
              <div className="mg-inspector-stat-card"><span>Topic</span><strong>{memory.topic_title}</strong></div>
              <div className="mg-inspector-stat-card"><span>Freshness</span><strong className="capitalize">{memory.freshness}</strong></div>
              <div className="mg-inspector-stat-card"><span>Importance</span><strong className="capitalize">{memory.importance}</strong></div>
              <div className="mg-inspector-stat-card"><span>Confidence</span><strong>{memory.confidence == null ? "Unknown" : `${Math.round(memory.confidence * 100)}%`}</strong></div>
            </div>
            {relatedMemories.length > 0 ? (
              <div>
                <SectionTitle>Sibling particles in this cluster</SectionTitle>
                <div className="mg-inspector-list">
                  {relatedMemories.slice(0, 8).map((item) => (
                    <button key={item.id} className="mg-inspector-list-item" onClick={() => onOpenMemory(item.id)}>
                      <div>
                        <div className="mg-inspector-list-title">{item.title}</div>
                        <div className="mg-inspector-list-subtitle">{item.snippet}</div>
                      </div>
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        ) : cluster ? (
          <>
            <div className="mg-inspector-copy">
              <p>{cluster.summary}</p>
              <p className="mg-inspector-muted">{cluster.freshness_text} · {cluster.attention_label}</p>
            </div>
            <div className="mg-inspector-grid">
              <div className="mg-inspector-stat-card"><span>Kind</span><strong className="capitalize">{cluster.kind}</strong></div>
              <div className="mg-inspector-stat-card"><span>Particles</span><strong>{cluster.memory_ids.length}</strong></div>
            </div>
            <div>
              <SectionTitle>Deep-focus particles</SectionTitle>
              <div className="mg-inspector-list">
                {clusterMemories.map((item) => (
                  <button key={item.id} className="mg-inspector-list-item" onClick={() => onOpenMemory(item.id)}>
                    <div>
                      <div className="mg-inspector-list-title">{item.title}</div>
                      <div className="mg-inspector-list-subtitle">{item.snippet}</div>
                    </div>
                    <ChevronRight className="h-4 w-4" />
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : topic ? (
          <>
            <div className="mg-inspector-copy">
              <p>{topic.summary}</p>
              <p className="mg-inspector-muted">{topic.freshness_text} · {topic.attention_label}</p>
            </div>
            <div className="mg-inspector-grid">
              <div className="mg-inspector-stat-card"><span>Clusters</span><strong>{topicClusters.length}</strong></div>
              <div className="mg-inspector-stat-card"><span>Visible memories</span><strong>{topic.memory_ids.length}</strong></div>
            </div>
            <div>
              <SectionTitle>Semantic clusters</SectionTitle>
              <div className="mg-inspector-list">
                {topicClusters.map((item) => (
                  <button key={item.id} className="mg-inspector-list-item" onClick={() => onOpenCluster(item.id)}>
                    <div>
                      <div className="mg-inspector-list-title">{item.title}</div>
                      <div className="mg-inspector-list-subtitle">{item.kind} · {item.summary}</div>
                    </div>
                    <ChevronRight className="h-4 w-4" />
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : region ? (
          <>
            <div className="mg-inspector-copy">
              <p>{region.freshness_text}</p>
              <p className="mg-inspector-muted">Stable geography stays fixed while topics and clusters reveal progressively deeper structure.</p>
            </div>
            <div className="mg-inspector-grid">
              <div className="mg-inspector-stat-card"><span>Memories</span><strong>{region.count}</strong></div>
              <div className="mg-inspector-stat-card"><span>Themes</span><strong>{region.topic_count}</strong></div>
              <div className="mg-inspector-stat-card"><span>Health</span><strong>{region.health}</strong></div>
              <div className="mg-inspector-stat-card"><span>Attention</span><strong>{region.attention_label}</strong></div>
            </div>
            <div>
              <SectionTitle>Topic constellations</SectionTitle>
              <div className="mg-inspector-list">
                {regionTopics.map((item) => (
                  <button key={item.id} className="mg-inspector-list-item" onClick={() => onOpenTopic(item.id)}>
                    <div>
                      <div className="mg-inspector-list-title">{item.title}</div>
                      <div className="mg-inspector-list-subtitle">{item.summary}</div>
                    </div>
                    <ChevronRight className="h-4 w-4" />
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : null}
      </div>

      <div className="mg-inspector-footer">
        <span className="mg-inspector-footer-badge"><Sparkles className="h-3.5 w-3.5" />Inspector-first detail</span>
        <span className="mg-inspector-footer-badge">Shape language active</span>
      </div>
    </aside>
  );
}
