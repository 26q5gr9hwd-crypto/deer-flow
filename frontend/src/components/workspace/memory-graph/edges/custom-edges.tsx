"use client";

import { BaseEdge, EdgeLabelRenderer, getBezierPath } from "@xyflow/react";
import type { EdgeProps } from "@xyflow/react";
import React, { memo } from "react";

import { hexToRgba } from "../types";
import type { SemanticEdgeData } from "../types";

const EDGE_STYLE = {
  structural: { stroke: "#94a3b8", labelBg: hexToRgba("#94a3b8", 0.16), labelColor: "#e2e8f0" },
  resonance: { stroke: "#22c55e", labelBg: hexToRgba("#22c55e", 0.16), labelColor: "#dcfce7" },
  tension: { stroke: "#fb7185", labelBg: hexToRgba("#fb7185", 0.18), labelColor: "#ffe4e6" },
} as const;

function SemanticEdgeInner({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  data,
}: EdgeProps) {
  const edgeData = (data ?? {}) as unknown as SemanticEdgeData;
  const semantic = edgeData.semanticType ?? "structural";
  const palette = EDGE_STYLE[semantic];
  const strength = edgeData.strength ?? 0.5;
  const muted = edgeData.muted ?? false;
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={{
          stroke: palette.stroke,
          strokeWidth: 1.2 + strength * 2,
          opacity: muted ? 0.18 : 0.74,
        }}
      />
      {edgeData.label && (edgeData.showLabel ?? true) ? (
        <EdgeLabelRenderer>
          <div
            className="mg-edge-label"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              background: palette.labelBg,
              color: palette.labelColor,
              opacity: muted ? 0.48 : 1,
            }}
          >
            {edgeData.label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

export const SemanticEdge = memo(SemanticEdgeInner);
