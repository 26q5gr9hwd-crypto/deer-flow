"use client";

import React, { memo } from "react";
import { BaseEdge, getBezierPath } from "@xyflow/react";
import type { EdgeProps } from "@xyflow/react";

function AssociationEdgeInner(props: EdgeProps) {
  const bp = {
    sourceX: props.sourceX, sourceY: props.sourceY,
    targetX: props.targetX, targetY: props.targetY,
    sourcePosition: props.sourcePosition, targetPosition: props.targetPosition,
  };
  const [path] = getBezierPath(bp);
  const color = (props.data as any)?.color || "rgba(148,163,184,0.15)";
  const s = { stroke: color, strokeWidth: 1 };
  return <BaseEdge path={path} style={s} />;
}

function TemporalEdgeInner(props: EdgeProps) {
  const bp = {
    sourceX: props.sourceX, sourceY: props.sourceY,
    targetX: props.targetX, targetY: props.targetY,
    sourcePosition: props.sourcePosition, targetPosition: props.targetPosition,
  };
  const [path] = getBezierPath(bp);
  const s = { stroke: "rgba(100,116,139,0.10)", strokeWidth: 1, strokeDasharray: "4 4" };
  return <BaseEdge path={path} style={s} />;
}

function ContradictionEdgeInner(props: EdgeProps) {
  const bp = {
    sourceX: props.sourceX, sourceY: props.sourceY,
    targetX: props.targetX, targetY: props.targetY,
    sourcePosition: props.sourcePosition, targetPosition: props.targetPosition,
  };
  const [path, labelX, labelY] = getBezierPath(bp);
  const s = { stroke: "rgba(239,68,68,0.30)", strokeWidth: 1, strokeDasharray: "6 3" };
  return (
    <>
      <BaseEdge path={path} style={s} />
      <foreignObject x={labelX - 8} y={labelY - 8} width={16} height={16} className="pointer-events-none">
        <div className="flex h-full w-full items-center justify-center text-[10px]">⚡</div>
      </foreignObject>
    </>
  );
}

export const AssociationEdge = memo(AssociationEdgeInner);
export const TemporalEdge = memo(TemporalEdgeInner);
export const ContradictionEdge = memo(ContradictionEdgeInner);
