"use client";

import React, { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import { CLUSTER_HUES } from "../types";
import type { ClusterNodeData } from "../types";

const HEALTH_COLORS: Record<string, string> = {
  green: "#22c55e",
  yellow: "#eab308",
  red: "#ef4444",
  gray: "#6b7280",
};

const HEALTH_TOOLTIP: Record<string, string> = {
  green: "Healthy \u2014 memories are current",
  yellow: "Needs attention \u2014 some memories are outdated",
  red: "Review needed \u2014 many stale or conflicting memories",
  gray: "Insufficient data",
};

function ClusterNodeInner({ data }: NodeProps) {
  const d = data as unknown as ClusterNodeData;
  const hue = CLUSTER_HUES[d.cluster] || "#64748b";

  const boundaryStyle = { background: hue + "0F", border: "1px solid " + hue + "33" };
  const labelStyle = { color: hue };
  const badgeStyle = { background: hue + "26", color: hue };
  const healthStyle = { backgroundColor: HEALTH_COLORS[d.health] };

  return (
    <div className="relative w-full h-full mg-cluster-enter" role="group" aria-label={d.label + " cluster, " + d.count + " memories"}>
      <div className="absolute inset-0 rounded-2xl transition-all duration-300" style={boundaryStyle} />
      <div className="absolute -top-8 left-3 flex items-center gap-2">
        <span className="text-lg" aria-hidden="true">{d.icon}</span>
        <span className="text-[13px] font-semibold uppercase tracking-[0.2em]" style={labelStyle}>
          {d.label}
        </span>
        <span
          className="flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-medium"
          style={badgeStyle}
          aria-label={d.count + " memories"}
        >
          {d.count}
        </span>
        <div
          className="mg-health-dot h-1.5 w-1.5 rounded-full"
          style={healthStyle}
          data-tooltip={HEALTH_TOOLTIP[d.health] || ""}
          aria-label={HEALTH_TOOLTIP[d.health] || "Health unknown"}
          role="status"
        />
      </div>
    </div>
  );
}

export const ClusterNode = memo(ClusterNodeInner);
