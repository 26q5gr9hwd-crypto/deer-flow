"use client";

import { Handle, Position } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";
import React, { memo } from "react";

import { CLUSTER_HUES, hexToRgba } from "../types";
import type { RegionNodeData } from "../types";

const HEALTH_COPY: Record<RegionNodeData["health"], string> = {
  green: "Healthy",
  yellow: "Needs attention",
  red: "Review needed",
  gray: "Sparse",
};

function RegionNodeInner({ data, selected }: NodeProps) {
  const d = data as unknown as RegionNodeData;
  const hue = CLUSTER_HUES[d.cluster] || "#64748b";
  const shellStyle = {
    borderColor: selected || d.focused ? hexToRgba(hue, 0.82) : hexToRgba(hue, 0.28),
    background: `linear-gradient(180deg, ${hexToRgba(hue, 0.16)} 0%, rgba(10, 10, 15, 0.96) 42%, rgba(10, 10, 15, 0.98) 100%)`,
    boxShadow: selected || d.focused
      ? `0 0 0 1px ${hexToRgba(hue, 0.4)}, 0 30px 90px ${hexToRgba(hue, 0.18)}`
      : `0 18px 58px ${hexToRgba(hue, 0.12)}`,
    opacity: d.dimmed ? 0.42 : 1,
  };

  return (
    <div className="mg-region-node" style={shellStyle} role="button" tabIndex={0} aria-label={`${d.label} region`}>
      <div
        className="mg-region-glow"
        style={{background: `radial-gradient(circle at 50% 0%, ${hexToRgba(hue, 0.2)} 0%, transparent 62%)`}}
      />
      <div className="mg-region-header">
        <div>
          <div className="mg-region-kicker">Stable region</div>
          <div className="mg-region-title-row">
            <span className="mg-region-icon" aria-hidden="true">{d.icon}</span>
            <h3 className="mg-region-title">{d.label}</h3>
          </div>
        </div>
        <div className="mg-region-count">{d.count}</div>
      </div>

      <div className="mg-region-grid">
        <div className="mg-region-stat">
          <span>Health</span>
          <strong>{HEALTH_COPY[d.health]}</strong>
        </div>
        <div className="mg-region-stat">
          <span>Attention</span>
          <strong>{d.attentionLabel}</strong>
        </div>
      </div>

      <div className="mg-region-meter-wrap">
        <div className="mg-region-meter-labels">
          <span>Freshness</span>
          <span>{d.freshnessText}</span>
        </div>
        <div className="mg-region-meter">
          <div
            className="mg-region-meter-fill"
            style={{width: `${Math.round(d.freshnessRatio * 100)}%`, background: hue}}
          />
        </div>
      </div>

      <div className="mg-region-footer">
        <div>
          <div className="mg-region-footer-label">Themes</div>
          <div className="mg-region-footer-value">{d.topicCount} clear lanes</div>
        </div>
        <div>
          <div className="mg-region-footer-label">Cross-links</div>
          <div className="mg-region-footer-value">{d.strongestLinks.length > 0 ? d.strongestLinks.join(" · ") : "Quiet"}</div>
        </div>
      </div>

      <Handle type="target" position={Position.Top} className="mg-node-handle" />
      <Handle type="source" position={Position.Right} className="mg-node-handle" />
      <Handle type="source" position={Position.Left} className="mg-node-handle" />
      <Handle type="source" position={Position.Bottom} className="mg-node-handle" />
    </div>
  );
}

export const RegionNode = memo(RegionNodeInner);
