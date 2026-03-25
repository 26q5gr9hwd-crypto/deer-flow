"use client";

import React, { useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  X, MessageCircle, Search, Pencil, Archive, ChevronLeft, ChevronRight,
} from "lucide-react";
import { CLUSTER_HUES, CLUSTER_META } from "./types";
import type { MemoryNodeData, ClusterKey, FreshnessLevel } from "./types";

export interface ConnectionInfo {
  nodeId: string;
  title: string;
  cluster: ClusterKey;
  edgeType: string;
}

export interface InspectorProps {
  nodeId: string | null;
  nodeData: MemoryNodeData | null;
  connections: ConnectionInfo[];
  onClose: () => void;
  onSelectNode: (id: string) => void;
  navigableNodeIds: string[];
}

const FRESHNESS_COPY: Record<FreshnessLevel, string> = {
  fresh: "Learned moments ago",
  recent: "Learned days ago",
  aging: "Learned weeks ago",
  stale: "Learned months ago",
  old: "Learned long ago",
};

const EDGE_LABEL: Record<string, string> = {
  association: "Related",
  temporal: "Timeline",
  contradiction: "Conflicts with",
};

const ACTIONS = [
  { label: "Ask about this", Icon: MessageCircle, action: "ask" },
  { label: "Find related", Icon: Search, action: "related" },
  { label: "Edit", Icon: Pencil, action: "edit" },
  { label: "Archive", Icon: Archive, action: "archive" },
];

/* animation consts — extracted to avoid double-brace corruption */
const SLIDE_INIT = { x: 380, opacity: 0 };
const SLIDE_IN = { x: 0, opacity: 1 };
const SLIDE_TR = { duration: 0.2, ease: "easeOut" as const };
const FADE_IN = { opacity: 0 };
const FADE_VIS = { opacity: 1 };
const SHEET_FROM = { y: "100%" };
const SHEET_TO = { y: "0%" };
const SHEET_TR = { type: "spring" as const, stiffness: 300, damping: 30 };
const DRAG_TOP = { top: 0 };
const SHEET_H = { height: "40vh", maxHeight: "85vh" };

function InnerContent(p: {
  nodeData: MemoryNodeData;
  connections: ConnectionInfo[];
  onClose: () => void;
  onSelectNode: (id: string) => void;
  navigableNodeIds: string[];
  nodeId: string;
}) {
  const d = p.nodeData;
  const hue = CLUSTER_HUES[d.cluster];
  const meta = CLUSTER_META[d.cluster];
  const badgeStyle = { background: hue + "20", color: hue };

  const grouped = useMemo(() => {
    const m = new Map<string, ConnectionInfo[]>();
    for (const c of p.connections) {
      const arr = m.get(c.edgeType) || [];
      arr.push(c);
      m.set(c.edgeType, arr);
    }
    return m;
  }, [p.connections]);

  const idx = p.navigableNodeIds.indexOf(p.nodeId);
  const prevId = idx > 0 ? p.navigableNodeIds[idx - 1] : null;
  const nextId = idx < p.navigableNodeIds.length - 1 ? p.navigableNodeIds[idx + 1] : null;

  const confText =
    d.confidence == null ? null
    : d.confidence < 0.33 ? "Low"
    : d.confidence < 0.66 ? "Medium" : "High";

  const stub = (action: string) => () => {
    console.log("[Inspector]", action, p.nodeId);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between border-b border-white/[0.06] px-5 py-4">
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex items-center gap-2">
            <span
              className="flex h-5 items-center gap-1 rounded-full px-2 text-[10px] font-semibold tracking-wide"
              style={badgeStyle}
            >
              {meta.icon} {meta.label}
            </span>
            <span className="text-[10px] text-white/25">
              {FRESHNESS_COPY[d.freshness]}
            </span>
          </div>
          <h3 className="text-[15px] font-semibold leading-snug text-white/90">
            {d.title}
          </h3>
        </div>
        <button
          onClick={p.onClose}
          className="ml-3 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-white/30 transition-colors hover:bg-white/[0.06] hover:text-white/60"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
        <div>
          <p className="text-[13px] leading-relaxed text-white/70">{d.title}</p>
          <p className="mt-1 text-[12px] text-white/40">{d.snippet}</p>
        </div>

        <div className="space-y-2">
          <h4 className="text-[11px] font-medium uppercase tracking-[0.2em] text-white/25">Details</h4>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12px]">
            <div className="flex justify-between">
              <span className="text-white/30">Source</span>
              <span className="text-white/55">{meta.label}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/30">Importance</span>
              <span className="capitalize text-white/55">{d.importance}</span>
            </div>
            {confText && (
              <div className="flex justify-between">
                <span className="text-white/30">Confidence</span>
                <span className="text-white/55">{confText}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-white/30">Freshness</span>
              <span className="capitalize text-white/55">{d.freshness}</span>
            </div>
          </div>
        </div>

        {grouped.size > 0 ? (
          <div className="space-y-3">
            <h4 className="text-[11px] font-medium uppercase tracking-[0.2em] text-white/25">Connections</h4>
            {Array.from(grouped).map(function renderGroup(entry) {
              const et = entry[0];
              const conns = entry[1];
              return (
                <div key={et} className="space-y-0.5">
                  <div className="text-[11px] text-white/35">{EDGE_LABEL[et] || et}</div>
                  {conns.map(function renderConn(c) {
                    const dotBg = { background: CLUSTER_HUES[c.cluster] };
                    return (
                      <button
                        key={c.nodeId}
                        onClick={function goNode() { p.onSelectNode(c.nodeId); }}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[12px] text-white/55 transition-colors hover:bg-white/[0.04]"
                      >
                        <span className="h-2 w-2 flex-shrink-0 rounded-full" style={dotBg} />
                        <span className="truncate">{c.title}</span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-[12px] text-white/20">No connections found.</p>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-white/[0.06] px-5 py-2 lg:hidden">
        <button
          disabled={!prevId}
          onClick={function goPrev() { prevId && p.onSelectNode(prevId); }}
          className="flex items-center gap-1 text-[12px] text-white/40 disabled:opacity-20"
        >
          <ChevronLeft className="h-3 w-3" /> Prev
        </button>
        <button
          disabled={!nextId}
          onClick={function goNext() { nextId && p.onSelectNode(nextId); }}
          className="flex items-center gap-1 text-[12px] text-white/40 disabled:opacity-20"
        >
          Next <ChevronRight className="h-3 w-3" />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 border-t border-white/[0.06] px-4 py-3">
        {ACTIONS.map(function renderAction(btn) {
          return (
            <button
              key={btn.action}
              onClick={stub(btn.action)}
              className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.02] px-2.5 py-1.5 text-[11px] text-white/45 transition-colors hover:bg-white/[0.06] hover:text-white/70"
            >
              <btn.Icon className="h-3 w-3" />
              {btn.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DesktopPanel(props: InspectorProps & { nodeData: MemoryNodeData }) {
  return (
    <motion.div
      initial={SLIDE_INIT}
      animate={SLIDE_IN}
      exit={SLIDE_INIT}
      transition={SLIDE_TR}
      className="h-full w-[380px] flex-shrink-0 border-l border-white/[0.06] bg-zinc-950/95 backdrop-blur-xl"
    >
      <InnerContent
        nodeData={props.nodeData}
        connections={props.connections}
        onClose={props.onClose}
        onSelectNode={props.onSelectNode}
        navigableNodeIds={props.navigableNodeIds}
        nodeId={props.nodeId!}
      />
    </motion.div>
  );
}

function MobileSheet(props: InspectorProps & { nodeData: MemoryNodeData }) {
  return (
    <>
      <motion.div
        initial={FADE_IN}
        animate={FADE_VIS}
        exit={FADE_IN}
        className="absolute inset-0 z-40 bg-black/30"
        onClick={props.onClose}
      />
      <motion.div
        initial={SHEET_FROM}
        animate={SHEET_TO}
        exit={SHEET_FROM}
        transition={SHEET_TR}
        drag="y"
        dragConstraints={DRAG_TOP}
        dragElastic={0.2}
        onDragEnd={function onDragEnd(_: unknown, info: { offset: { y: number } }) {
          if (info.offset.y > 100) props.onClose();
        }}
        className="absolute bottom-0 left-0 right-0 z-50 overflow-hidden rounded-t-2xl border-t border-white/[0.08] bg-zinc-950/[0.98] backdrop-blur-xl"
        style={SHEET_H}
      >
        <div className="flex justify-center pb-1 pt-2">
          <div className="h-1 w-10 rounded-full bg-white/20" />
        </div>
        <InnerContent
          nodeData={props.nodeData}
          connections={props.connections}
          onClose={props.onClose}
          onSelectNode={props.onSelectNode}
          navigableNodeIds={props.navigableNodeIds}
          nodeId={props.nodeId!}
        />
      </motion.div>
    </>
  );
}

export function Inspector(props: InspectorProps) {
  const [isDesktop, setIsDesktop] = React.useState(true);
  useEffect(function watchMQ() {
    const mq = window.matchMedia("(min-width: 1024px)");
    setIsDesktop(mq.matches);
    const h = function onMQ(e: MediaQueryListEvent) { setIsDesktop(e.matches); };
    mq.addEventListener("change", h);
    return function cleanup() { mq.removeEventListener("change", h); };
  }, []);

  const show = props.nodeId != null && props.nodeData != null;
  return (
    <AnimatePresence mode="wait">
      {show && (isDesktop
        ? <DesktopPanel key="desktop-insp" {...props} nodeData={props.nodeData!} />
        : <MobileSheet key="mobile-insp" {...props} nodeData={props.nodeData!} />
      )}
    </AnimatePresence>
  );
}
