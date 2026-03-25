"use client";

import React, { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";
import { CLUSTER_HUES } from "../types";
import type { MemoryNodeData, FreshnessLevel } from "../types";

const FRESHNESS_CFG: Record<FreshnessLevel, { color: string; pulse: boolean; opacity: number }> = {
  fresh:  { color: "#22c55e", pulse: true,  opacity: 1 },
  recent: { color: "#22c55e", pulse: false, opacity: 1 },
  aging:  { color: "#eab308", pulse: false, opacity: 0.9 },
  stale:  { color: "#6b7280", pulse: false, opacity: 0.8 },
  old:    { color: "",        pulse: false, opacity: 0.7 },
};

function MemoryNodeInner({ data, selected }: NodeProps) {
  const d = data as unknown as MemoryNodeData;
  const hue = CLUSTER_HUES[d.cluster] || "#64748b";
  const fr = FRESHNESS_CFG[d.freshness];
  const bw = d.importance === "critical" ? 2 : 1;

  const outerStyle = { width: 180, height: 56, opacity: fr.opacity };
  const cardStyle = {
    background: "rgba(24,24,27,0.85)",
    borderWidth: bw,
    borderStyle: "solid" as const,
    borderColor: selected ? hue : hue + "80",
    borderLeftWidth: 3,
    borderLeftColor: hue,
    boxShadow: selected
      ? "0 0 0 1px " + hue + ", 0 0 16px " + hue + "40"
      : "0 1px 3px rgba(0,0,0,0.3)",
  };
  const dotStyle = { backgroundColor: fr.color };
  const confW = d.confidence != null ? d.confidence * 100 : 0;
  const confStyle = {
    width: confW + "%",
    background: confW < 33 ? "#ef4444" : confW < 66 ? "#eab308" : "#22c55e",
  };

  return (
    <div style={outerStyle} className="relative cursor-pointer">
      <div className="absolute inset-0 rounded-lg overflow-hidden transition-shadow duration-200" style={cardStyle}>
        <div className="flex h-full items-center px-3">
          <div className="flex-1 min-w-0 pr-2">
            <div className="truncate text-[13px] font-medium leading-tight text-white/90">
              {d.title}
            </div>
            <div className="truncate text-[11px] leading-tight text-white/40 mt-0.5">
              {d.snippet}
            </div>
          </div>
          {fr.color && (
            <div
              className={"h-2 w-2 rounded-full flex-shrink-0" + (fr.pulse ? " animate-pulse" : "")}
              style={dotStyle}
            />
          )}
        </div>
        {d.confidence != null && (
          <div className="absolute bottom-0 left-0 h-[2px]" style={confStyle} />
        )}
      </div>
      <Handle type="target" position={Position.Left} className="!opacity-0 !w-1 !h-1" />
      <Handle type="source" position={Position.Right} className="!opacity-0 !w-1 !h-1" />
    </div>
  );
}

export const MemoryNode = memo(MemoryNodeInner);
