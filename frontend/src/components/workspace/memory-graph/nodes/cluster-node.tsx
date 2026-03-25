"use client";

import type { NodeProps } from "@xyflow/react";
import React, { memo } from "react";

import { CLUSTER_HUES, hexToRgba } from "../types";
import type { ClusterNodeData } from "../types";

function ClusterNodeInner({ data, selected }: NodeProps) {
  const d = data as unknown as ClusterNodeData;
  const hue = CLUSTER_HUES[d.cluster] || "#64748b";
  const border = selected || d.selected ? hexToRgba(hue, 0.8) : hexToRgba(hue, 0.3);
  const background = `linear-gradient(180deg, ${hexToRgba(hue, d.kind === "cluster" ? 0.14 : 0.2)} 0%, rgba(10, 10, 15, 0.97) 62%)`;
  const clipPath = d.kind === "action"
    ? "polygon(18% 0%, 100% 0%, 100% 82%, 82% 100%, 0% 100%, 0% 18%)"
    : d.kind === "tension"
      ? "polygon(10% 0%, 100% 0%, 100% 64%, 90% 100%, 0% 100%, 0% 36%)"
      : undefined;
  const kindLabel = d.kind === "action" ? "◆ Action" : d.kind === "tension" ? "⟂ Tension" : "◎ Cluster";

  return (
    <div
      className="mg-cluster-node"
      style={{
        borderColor: border,
        background,
        clipPath,
        opacity: d.dimmed ? 0.4 : 1,
        boxShadow: selected || d.selected ? `0 18px 44px ${hexToRgba(hue, 0.22)}` : `0 14px 32px ${hexToRgba(hue, 0.12)}`,
      }}
      role="button"
      tabIndex={0}
      aria-label={`${d.title} ${d.kind}`}
    >
      <div className="mg-cluster-kind" style={{ color: border }}>{kindLabel}</div>
      <div className="mg-cluster-title-row">
        <div className="mg-cluster-title">{d.title}</div>
        <div className="mg-cluster-count">{d.memoryCount}</div>
      </div>
      <p className="mg-cluster-summary">{d.summary}</p>
      <div className="mg-cluster-meta">
        <span>{d.freshnessText}</span>
        <span>{d.attentionLabel}</span>
      </div>
      {d.previewTitles.length > 0 ? (
        <div className="mg-cluster-preview">
          {d.previewTitles.slice(0, 3).map((title) => (
            <span key={title} className="mg-cluster-chip">{title}</span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export const ClusterNode = memo(ClusterNodeInner);
