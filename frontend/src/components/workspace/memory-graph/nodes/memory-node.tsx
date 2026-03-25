"use client";

import React, { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";
import { CLUSTER_HUES } from "../types";
import type { MemoryNodeData, FreshnessLevel } from "../types";

const FRESHNESS_CFG: Record<FreshnessLevel, { color: string; pulse: boolean; opacity: number; tooltip: string }> = {
  fresh:  { color: "#22c55e", pulse: true,  opacity: 1,   tooltip: "Learned moments ago" },
  recent: { color: "#22c55e", pulse: false, opacity: 1,   tooltip: "Learned days ago" },
  aging:  { color: "#eab308", pulse: false, opacity: 0.9, tooltip: "Learned weeks ago" },
  stale:  { color: "#6b7280", pulse: false, opacity: 0.8, tooltip: "Learned months ago" },
  old:    { color: "",        pulse: false, opacity: 0.7, tooltip: "Learned long ago" },
};

const IMPORTANCE_LABEL: Record<string, string> = {
  critical: "Critical memory",
  normal: "Memory",
  fleeting: "Fleeting memory",
};

function MemoryNodeInner({ data, selected, id }: NodeProps) {
  const d = data as unknown as MemoryNodeData;
  const hue = CLUSTER_HUES[d.cluster] || "#64748b";
  const fr = FRESHNESS_CFG[d.freshness];
  const bw = d.importance === "critical" ? 2 : d.importance === "fleeting" ? 1 : 1;
  const borderAlpha = d.importance === "critical" ? "80" : d.importance === "fleeting" ? "33" : "80";

  const outerStyle = { width: 180, height: 56, opacity: fr.opacity };
  const cardStyle = {
    background: "rgba(24,24,27,0.85)",
    borderWidth: bw,
    borderStyle: "solid" as const,
    borderColor: selected ? hue : hue + borderAlpha,
    borderLeftWidth: 3,
    borderLeftColor: hue,
    boxShadow: selected
      ? "0 0 0 1px " + hue + ", 0 0 16px " + hue + "40"
      : "0 1px 3px rgba(0,0,0,0.3)",
  };
  const dotStyle = { backgroundColor: fr.color };
  const confW = d.confidence != null ? d.confidence * 100 : 0;
  const confLabel = d.confidence == null ? null : d.confidence < 0.33 ? "Low" : d.confidence < 0.66 ? "Medium" : "High";
  const confStyle = {
    width: confW + "%",
    background: confW < 33 ? "#ef4444" : confW < 66 ? "#eab308" : "#22c55e",
  };

  return (
    <div
      style={outerStyle}
      className="relative cursor-pointer mg-node-enter"
      role="button"
      tabIndex={0}
      aria-label={IMPORTANCE_LABEL[d.importance] || "Memory" + ": " + d.title}
      aria-selected={selected}
    >
      <div className="mg-memory-card absolute inset-0 rounded-lg overflow-hidden" style={cardStyle}>
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
              className={"mg-freshness-dot h-2 w-2 rounded-full flex-shrink-0" + (fr.pulse ? " animate-pulse" : "")}
              style={dotStyle}
              data-tooltip={fr.tooltip}
              aria-label={fr.tooltip}
            />
          )}
        </div>
        {d.confidence != null && (
          <div
            className="absolute bottom-0 left-0 h-[2px] transition-all duration-300"
            style={confStyle}
            role="meter"
            aria-label={"Confidence: " + confLabel}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(confW)}
          />
        )}
      </div>
      <Handle type="target" position={Position.Left} className="!opacity-0 !w-1 !h-1" />
      <Handle type="source" position={Position.Right} className="!opacity-0 !w-1 !h-1" />
    </div>
  );
}

export const MemoryNode = memo(MemoryNodeInner);
