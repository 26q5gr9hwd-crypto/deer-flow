"use client";

import { Handle, Position } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";
import React, { memo } from "react";

import { CLUSTER_HUES, hexToRgba } from "../types";
import type { TopicNodeData } from "../types";

function TopicNodeInner({ data, selected }: NodeProps) {
  const d = data as unknown as TopicNodeData;
  const hue = CLUSTER_HUES[d.cluster] || "#64748b";

  return (
    <div
      className="mg-topic-node"
      style={{
        borderColor: selected || d.selected ? hexToRgba(hue, 0.7) : hexToRgba(hue, 0.18),
        background: `linear-gradient(180deg, ${hexToRgba(hue, 0.12)} 0%, rgba(10, 10, 15, 0.96) 55%, rgba(10, 10, 15, 0.98) 100%)`,
        boxShadow: selected || d.selected ? `0 18px 54px ${hexToRgba(hue, 0.16)}` : `0 14px 40px ${hexToRgba(hue, 0.09)}`,
        opacity: d.dimmed ? 0.38 : 1,
      }}
      role="button"
      tabIndex={0}
      aria-label={`${d.title} topic`}
    >
      <div className="mg-topic-header">
        <div className="mg-topic-title">{d.title}</div>
        <div className="mg-topic-count">{d.memoryCount}</div>
      </div>
      <p className="mg-topic-summary">{d.summary}</p>
      <div className="mg-topic-meta">
        <span>{d.freshnessText}</span>
        <span>{d.attentionLabel}</span>
      </div>
      {d.previewTitles.length > 0 ? (
        <div className="mg-topic-preview">
          {d.previewTitles.slice(0, 3).map((title) => (
            <span key={title} className="mg-topic-chip">{title}</span>
          ))}
        </div>
      ) : null}
      <Handle type="target" position={Position.Left} className="mg-node-handle" />
    </div>
  );
}

export const TopicNode = memo(TopicNodeInner);
