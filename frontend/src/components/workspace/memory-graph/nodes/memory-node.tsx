"use client";

import { Handle, Position } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";
import React, { memo } from "react";

import { CLUSTER_HUES, hexToRgba } from "../types";
import type { MemoryParticleNodeData } from "../types";

function MemoryNodeInner({ data, selected }: NodeProps) {
  const d = data as unknown as MemoryParticleNodeData;
  const hue = CLUSTER_HUES[d.cluster] || "#64748b";
  const baseSize = d.importance === "critical" ? 22 : d.importance === "normal" ? 16 : 12;
  const size = (selected || d.selected) ? baseSize + 6 : baseSize;
  const opacity = d.freshness === "old" ? 0.42 : d.freshness === "stale" ? 0.58 : d.freshness === "aging" ? 0.76 : 0.94;

  return (
    <div
      className="mg-memory-particle"
      title={d.title}
      aria-label={d.title}
      role="button"
      tabIndex={0}
      style={{
        width: size,
        height: size,
        borderRadius: "999px",
        background: `radial-gradient(circle at 30% 30%, rgba(255,255,255,0.92) 0%, ${hexToRgba(hue, 0.95)} 42%, ${hexToRgba(hue, 0.42)} 100%)`,
        opacity,
        boxShadow: selected || d.selected
          ? `0 0 0 2px ${hexToRgba(hue, 0.42)}, 0 0 26px ${hexToRgba(hue, 0.32)}`
          : `0 0 18px ${hexToRgba(hue, 0.18)}`,
      }}
    >
      <Handle type="target" position={Position.Left} className="!opacity-0 !w-1 !h-1" />
      <Handle type="source" position={Position.Right} className="!opacity-0 !w-1 !h-1" />
    </div>
  );
}

export const MemoryNode = memo(MemoryNodeInner);
