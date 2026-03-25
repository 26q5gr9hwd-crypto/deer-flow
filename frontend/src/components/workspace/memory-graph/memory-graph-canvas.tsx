"use client";

import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from "react";
import {
  ReactFlow, ReactFlowProvider, useReactFlow, useNodesState, useEdgesState,
  MiniMap, Background, BackgroundVariant,
} from "@xyflow/react";
import type { Node, Edge } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Minus, Plus, Maximize2, Search as SearchIcon, X, Loader2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { MemoryNode } from "./nodes/memory-node";
import { ClusterNode } from "./nodes/cluster-node";
import { AssociationEdge, TemporalEdge, ContradictionEdge } from "./edges/custom-edges";
import { Inspector } from "./inspector";
import type { ConnectionInfo } from "./inspector";
import { CommandPalette } from "./command-palette";
import { CLUSTER_HUES, CLUSTER_META, hexToRgba } from "./types";
import type { MemoryNodeData, ClusterNodeData, ClusterKey } from "./types";
import { useMemoryGraphData, useRefreshMemoryGraph } from "@/core/memory-graph";
import type { MemoryGraphData } from "@/core/memory-graph";

/* ── Stable refs outside component ────────── */
const nodeTypes = { memory: MemoryNode, cluster: ClusterNode };
const edgeTypes = { association: AssociationEdge, temporal: TemporalEdge, contradiction: ContradictionEdge };
const CLUSTER_ORDER: ClusterKey[] = ["identity", "daniel", "world", "playbook", "archive"];

/* ── Context ──────────────────────────────── */
type CtxValue = {
  selectedNodeId: string | null;
  setSelectedNodeId: (id: string | null) => void;
  hoveredNodeId: string | null;
  setHoveredNodeId: (id: string | null) => void;
  cmdPaletteOpen: boolean;
  setCmdPaletteOpen: (o: boolean) => void;
  quickSearchOpen: boolean;
  setQuickSearchOpen: (o: boolean) => void;
  quickSearchQuery: string;
  setQuickSearchQuery: (q: string) => void;
  refreshGraph: () => void;
};

const CTX_DEF: CtxValue = {
  selectedNodeId: null, setSelectedNodeId: function noop() {},
  hoveredNodeId: null, setHoveredNodeId: function noop() {},
  cmdPaletteOpen: false, setCmdPaletteOpen: function noop() {},
  quickSearchOpen: false, setQuickSearchOpen: function noop() {},
  quickSearchQuery: "", setQuickSearchQuery: function noop() {},
  refreshGraph: function noop() {},
};

const Ctx = createContext<CtxValue>(CTX_DEF);
export const useMemoryGraph = function useMemoryGraph() { return useContext(Ctx); };

function MemoryGraphProvider(p: { children: React.ReactNode }) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [cmdPaletteOpen, setCmdPaletteOpen] = useState(false);
  const [quickSearchOpen, setQuickSearchOpen] = useState(false);
  const [quickSearchQuery, setQuickSearchQuery] = useState("");
  const refreshGraph = useRefreshMemoryGraph();

  const value = useMemo(function memo() {
    return {
      selectedNodeId, setSelectedNodeId,
      hoveredNodeId, setHoveredNodeId,
      cmdPaletteOpen, setCmdPaletteOpen,
      quickSearchOpen, setQuickSearchOpen,
      quickSearchQuery, setQuickSearchQuery,
      refreshGraph,
    };
  }, [selectedNodeId, hoveredNodeId, cmdPaletteOpen, quickSearchOpen, quickSearchQuery, refreshGraph]);

  return (
    <Ctx.Provider value={value}>
      <ReactFlowProvider>{p.children}</ReactFlowProvider>
    </Ctx.Provider>
  );
}

/* ── Transform API data to React Flow nodes/edges ── */
const CLUSTER_POS: Record<ClusterKey, { x: number; y: number }> = {
  identity: { x: 60, y: 80 },
  daniel:   { x: 700, y: 80 },
  world:    { x: 60, y: 380 },
  playbook: { x: 700, y: 380 },
  archive:  { x: 380, y: 640 },
};

const NW = 180, NH = 56, GX = 16, GY = 14, PAD = 20, HDR = 16, COLS = 3;

function clusterSize(n: number) {
  const cols = Math.min(n, COLS);
  const rows = Math.ceil(n / COLS);
  return { width: cols * (NW + GX) - GX + PAD * 2, height: HDR + rows * (NH + GY) - GY + PAD * 2 };
}

function nodePos(i: number) {
  return { x: PAD + (i % COLS) * (NW + GX), y: HDR + PAD + Math.floor(i / COLS) * (NH + GY) };
}

function transformApiData(data: MemoryGraphData): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // Group memories by cluster
  const grouped = new Map<ClusterKey, MemoryGraphData["memories"]>();
  for (const m of data.memories) {
    const ck = m.cluster as ClusterKey;
    if (!grouped.has(ck)) grouped.set(ck, []);
    grouped.get(ck)!.push(m);
  }

  // Build cluster + memory nodes
  for (const [ck, mems] of grouped) {
    const pos = CLUSTER_POS[ck] || { x: 380, y: 380 };
    const size = clusterSize(mems.length);
    const meta = CLUSTER_META[ck];
    const clusterInfo = data.clusters.find(function f(c) { return c.key === ck; });

    const cdata: ClusterNodeData = {
      cluster: ck, label: meta?.label || ck, icon: meta?.icon || "📦",
      count: mems.length, expanded: true,
      health: (clusterInfo?.health as "green" | "yellow" | "red" | "gray") || "green",
    };
    nodes.push({
      id: "cluster-" + ck, type: "cluster", position: pos,
      data: cdata as any, style: { width: size.width, height: size.height },
      draggable: true, selectable: false,
    });

    mems.forEach(function iter(m, i) {
      const mdata: MemoryNodeData = {
        title: m.title,
        snippet: m.snippet,
        cluster: ck,
        freshness: m.freshness as MemoryNodeData["freshness"],
        confidence: m.confidence,
        importance: m.importance as MemoryNodeData["importance"],
      };
      nodes.push({
        id: m.id, type: "memory", position: nodePos(i),
        parentId: "cluster-" + ck, extent: "parent" as const,
        draggable: false, data: mdata as any,
      });
    });
  }

  // Build edges
  for (const e of data.edges) {
    const etype = e.edge_type === "temporal" ? "temporal"
      : e.edge_type === "contradiction" ? "contradiction"
      : "association";

    let color = "rgba(148,163,184,0.15)";
    if (etype === "association") {
      const srcMem = data.memories.find(function f(m) { return m.id === e.source; });
      if (srcMem) {
        const hue = CLUSTER_HUES[srcMem.cluster as ClusterKey];
        if (hue) color = hexToRgba(hue, 0.15);
      }
    }

    edges.push({
      id: e.id,
      source: e.source,
      target: e.target,
      type: etype,
      data: { color },
    });
  }

  return { nodes, edges };
}

/* ── Helpers ───────────────────────────────── */
function connectedIds(edges: Edge[], nodeId: string): Set<string> {
  const s = new Set<string>();
  for (const e of edges) {
    if (e.source === nodeId) s.add(e.target);
    if (e.target === nodeId) s.add(e.source);
  }
  return s;
}

function limitEdges(edges: Edge[], max: number): Edge[] {
  const cnt = new Map<string, number>();
  return edges.filter(function f(e) {
    const sc = cnt.get(e.source) || 0;
    const tc = cnt.get(e.target) || 0;
    if (sc >= max || tc >= max) return false;
    cnt.set(e.source, sc + 1);
    cnt.set(e.target, tc + 1);
    return true;
  });
}

/* ── ZoomControls ─────────────────────────── */
function ZoomControls() {
  const rf = useReactFlow();
  const [visible, setVisible] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetTimer = useCallback(function rt() {
    setVisible(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(function hide() { setVisible(false); }, 3000);
  }, []);

  useEffect(function eff() {
    resetTimer();
    const a = function act() { resetTimer(); };
    window.addEventListener("mousemove", a);
    window.addEventListener("wheel", a);
    window.addEventListener("touchstart", a);
    return function cl() {
      window.removeEventListener("mousemove", a);
      window.removeEventListener("wheel", a);
      window.removeEventListener("touchstart", a);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [resetTimer]);

  const btn = "flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.08] bg-black/40 text-white/60 backdrop-blur-xl transition-all duration-200 hover:bg-black/60 hover:text-white active:scale-95";
  const ziO = { duration: 200 };
  const zoO = { duration: 200 };
  const fvO = { padding: 0.15, duration: 300 };

  return (
    <div
      className={cn(
        "absolute bottom-6 right-6 z-50 flex flex-col gap-1 transition-opacity duration-500",
        visible ? "opacity-100" : "opacity-0 hover:opacity-100",
      )}
      onMouseEnter={function me() { setVisible(true); }}
    >
      <button onClick={function zi() { rf.zoomIn(ziO); }} className={btn} aria-label="Zoom in" title="Zoom in">
        <Plus className="h-4 w-4" />
      </button>
      <button onClick={function zo() { rf.zoomOut(zoO); }} className={btn} aria-label="Zoom out" title="Zoom out">
        <Minus className="h-4 w-4" />
      </button>
      <div className="my-0.5 h-px w-full bg-white/[0.06]" />
      <button onClick={function fv() { rf.fitView(fvO); }} className={btn} aria-label="Fit to view" title="Fit to view (F)">
        <Maximize2 className="h-4 w-4" />
      </button>
    </div>
  );
}

/* ── GraphMinimap ─────────────────────────── */
const mmStyle = { width: 160, height: 100, backgroundColor: "rgba(0,0,0,0.35)", borderRadius: 12 };
function ncFn(n: Node) { return n.type === "cluster" ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.2)"; }

function GraphMinimap() {
  return (
    <MiniMap
      className="!absolute !bottom-6 !left-6 !hidden !rounded-xl !border !border-white/[0.06] !shadow-2xl md:!block"
      style={mmStyle}
      maskColor="rgba(255,255,255,0.06)"
      nodeColor={ncFn}
      pannable
      zoomable
    />
  );
}

/* ── ShortcutOverlay ──────────────────────── */
const SHORTCUTS = [
  { key: "\u2318K", action: "Command palette" },
  { key: "1 \u2013 5", action: "Jump to cluster" },
  { key: "F", action: "Fit all to view" },
  { key: "Esc", action: "Close / deselect" },
  { key: "/", action: "Quick search" },
  { key: "Space", action: "Toggle inspector" },
  { key: "Tab", action: "Cycle clusters" },
  { key: "?", action: "Show shortcuts" },
];

function ShortcutOverlay(p: { open: boolean; onClose: () => void }) {
  if (!p.open) return null;
  return (
    <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={p.onClose} role="dialog" aria-label="Keyboard shortcuts">
      <div className="w-[360px] rounded-2xl border border-white/[0.08] bg-zinc-900/90 p-6 shadow-2xl backdrop-blur-xl" onClick={function stop(e) { e.stopPropagation(); }}>
        <h3 className="mb-5 text-[11px] font-medium uppercase tracking-[0.3em] text-white/40">Keyboard shortcuts</h3>
        <div className="flex flex-col gap-1">
          {SHORTCUTS.map(function rs(s) {
            return (
              <div key={s.key} className="flex items-center justify-between rounded-lg px-3 py-2 text-sm">
                <span className="text-white/60">{s.action}</span>
                <kbd className="rounded-md border border-white/[0.1] bg-white/[0.04] px-2.5 py-1 font-mono text-xs text-white/40">{s.key}</kbd>
              </div>
            );
          })}
        </div>
        <div className="mt-5 text-center text-[11px] text-white/25">Press ? or Esc to close</div>
      </div>
    </div>
  );
}

/* ── LoadingState ─────────────────────────── */
function LoadingState() {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        {/* Skeleton cluster placeholders */}
        <div className="flex gap-8">
          {[0, 1, 2].map(function sk(i) {
            return (
              <div key={i} className="h-32 w-48 animate-pulse rounded-2xl border border-white/[0.04] bg-white/[0.02]">
                <div className="flex flex-col gap-2 p-4">
                  <div className="h-3 w-20 animate-pulse rounded bg-white/[0.06]" />
                  <div className="h-10 w-full animate-pulse rounded-lg bg-white/[0.03]" />
                  <div className="h-10 w-full animate-pulse rounded-lg bg-white/[0.03]" />
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-2 text-[13px] text-white/30">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Loading memory graph{"\u2026"}</span>
        </div>
      </div>
    </div>
  );
}

/* ── ErrorToast ───────────────────────────── */
function ErrorToast(p: { message: string }) {
  return (
    <div className="absolute bottom-6 left-1/2 z-[90] -translate-x-1/2">
      <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-950/80 px-4 py-2.5 text-[13px] text-red-300 shadow-2xl backdrop-blur-xl">
        <AlertTriangle className="h-4 w-4 flex-shrink-0" />
        <span>{p.message}</span>
      </div>
    </div>
  );
}

/* ── EmptyState ───────────────────────────── */
function EmptyState() {
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
      <div className="relative flex flex-col items-center">
        <div className="absolute -top-24 h-48 w-48 rounded-full bg-indigo-500/[0.05] blur-[80px]" />
        <div className="absolute -top-16 h-32 w-32 rounded-full bg-violet-500/[0.04] blur-[60px]" />
        <div className="relative mb-8 flex h-24 w-24 items-center justify-center rounded-full border border-white/[0.05] bg-white/[0.02]">
          <span className="text-5xl opacity-80">{"\uD83E\uDDE0"}</span>
        </div>
        <p className="text-center text-[15px] leading-relaxed tracking-wide text-white/30">
          No memories yet.<br /><span className="text-white/20">VESPER learns as you work together.</span>
        </p>
      </div>
    </div>
  );
}

/* ── QuickSearchBar ───────────────────────── */
function QuickSearchBar() {
  const ctx = useContext(Ctx);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(function focus() { inputRef.current?.focus(); }, []);

  return (
    <div className="absolute left-1/2 top-4 z-[70] -translate-x-1/2">
      <div className="flex w-[400px] max-w-[90vw] items-center gap-2 rounded-xl border border-white/[0.1] bg-zinc-900/95 px-4 py-2.5 shadow-2xl backdrop-blur-xl">
        <SearchIcon className="h-4 w-4 flex-shrink-0 text-white/30" />
        <input
          ref={inputRef}
          value={ctx.quickSearchQuery}
          onChange={function oc(e) { ctx.setQuickSearchQuery(e.target.value); }}
          onKeyDown={function kd(e) {
            if (e.key === "Escape") { e.preventDefault(); ctx.setQuickSearchQuery(""); ctx.setQuickSearchOpen(false); }
          }}
          placeholder={"Search memories\u2026"}
          className="flex-1 bg-transparent text-[14px] text-white/80 outline-none placeholder:text-white/25"
        />
        {ctx.quickSearchQuery && (
          <button onClick={function cl() { ctx.setQuickSearchQuery(""); ctx.setQuickSearchOpen(false); }} className="text-white/30 hover:text-white/60">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

/* ── InnerCanvas ──────────────────────────── */
const defaultViewport = { x: 0, y: 0, zoom: 0.85 };
const proOpts = { hideAttribution: true };
const fitViewOpts = { padding: 0.12 };

function InnerCanvas() {
  const rf = useReactFlow();
  const ctx = useContext(Ctx);
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;

  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(0.85);
  const cycleRef = useRef(0);

  /* ── Live data from API ── */
  const { data: graphData, isLoading, error, isFetching } = useMemoryGraphData();

  const transformed = useMemo(function xf() {
    if (!graphData || graphData.memories.length === 0) return { nodes: [] as Node[], edges: [] as Edge[] };
    return transformApiData(graphData);
  }, [graphData]);

  const [nodes, , onNodesChange] = useNodesState(transformed.nodes);
  const [edges, , onEdgesChange] = useEdgesState(transformed.edges);

  /* Sync nodes/edges when API data changes */
  useEffect(function syncNodes() {
    if (transformed.nodes.length > 0) {
      onNodesChange(transformed.nodes.map(function m(n) { return { type: "reset" as const, item: n }; }));
    }
  }, [transformed.nodes]);

  useEffect(function syncEdges() {
    if (transformed.edges.length > 0) {
      onEdgesChange(transformed.edges.map(function m(e) { return { type: "reset" as const, item: e }; }));
    }
  }, [transformed.edges]);

  /* ── Animated centering on selection ── */
  useEffect(function centerOnSelect() {
    if (!ctx.selectedNodeId) return;
    const node = nodes.find(function f(n) { return n.id === ctx.selectedNodeId; });
    if (!node) return;
    var ax = node.position.x + 90;
    var ay = node.position.y + 28;
    if (node.parentId) {
      const par = nodes.find(function f(n) { return n.id === node.parentId; });
      if (par) { ax += par.position.x; ay += par.position.y; }
    }
    rf.setCenter(ax, ay, { duration: 200 });
  }, [ctx.selectedNodeId]);

  /* ── Displayed nodes (hover highlight + search filter) ── */
  const displayedNodes = useMemo(function dn() {
    if (ctx.quickSearchOpen && ctx.quickSearchQuery.trim()) {
      const q = ctx.quickSearchQuery.trim().toLowerCase();
      return nodes.map(function m(n) {
        if (n.type !== "memory") return n;
        const d = n.data as unknown as MemoryNodeData;
        if (d.title.toLowerCase().includes(q)) return n;
        const s = Object.assign({}, n.style, { opacity: 0.15, transition: "opacity 200ms ease" });
        return Object.assign({}, n, { style: s });
      });
    }
    if (ctx.hoveredNodeId) {
      const conn = connectedIds(edges, ctx.hoveredNodeId);
      return nodes.map(function m(n) {
        if (n.type !== "memory") return n;
        if (n.id === ctx.hoveredNodeId || conn.has(n.id)) return n;
        var s = Object.assign({}, n.style, { opacity: 0.3, transition: "opacity 200ms ease" });
        return Object.assign({}, n, { style: s });
      });
    }
    return nodes;
  }, [nodes, edges, ctx.hoveredNodeId, ctx.quickSearchOpen, ctx.quickSearchQuery]);

  /* ── Displayed edges ── */
  const displayedEdges = useMemo(function de() {
    if (zoomLevel < 0.4) return [];
    var result = limitEdges(edges, 8);
    if (ctx.hoveredNodeId) {
      result = result.map(function m(e) {
        if (e.source === ctx.hoveredNodeId || e.target === ctx.hoveredNodeId) {
          var s = Object.assign({}, e.style, { opacity: 0.6 });
          return Object.assign({}, e, { style: s });
        }
        return e;
      });
    }
    return result;
  }, [edges, zoomLevel, ctx.hoveredNodeId]);

  /* ── Inspector data ── */
  const inspectorData = useMemo(function id() {
    if (!ctx.selectedNodeId) return { nd: null as MemoryNodeData | null, conns: [] as ConnectionInfo[], navIds: [] as string[] };
    const node = nodes.find(function f(n) { return n.id === ctx.selectedNodeId; });
    if (!node || node.type !== "memory") return { nd: null as MemoryNodeData | null, conns: [] as ConnectionInfo[], navIds: [] as string[] };
    const nd = node.data as unknown as MemoryNodeData;
    const conns = edges
      .filter(function f(e) { return e.source === ctx.selectedNodeId || e.target === ctx.selectedNodeId; })
      .map(function m(e) {
        const oid = e.source === ctx.selectedNodeId ? e.target : e.source;
        const on = nodes.find(function f(n) { return n.id === oid; });
        if (!on || on.type !== "memory") return null;
        const od = on.data as unknown as MemoryNodeData;
        return { nodeId: oid, title: od.title, cluster: od.cluster, edgeType: e.type || "association" } as ConnectionInfo;
      })
      .filter(Boolean) as ConnectionInfo[];
    const navIds = nodes.filter(function f(n) { return n.type === "memory"; }).map(function m(n) { return n.id; });
    return { nd, conns, navIds };
  }, [ctx.selectedNodeId, nodes, edges]);

  /* ── Command palette data ── */
  const memNodes = useMemo(function mn() {
    return nodes.filter(function f(n) { return n.type === "memory"; }).map(function m(n) {
      return { id: n.id, data: n.data as unknown as MemoryNodeData };
    });
  }, [nodes]);

  const goCluster = useCallback(function gc(cluster: ClusterKey) {
    rf.fitView({ nodes: [{ id: "cluster-" + cluster }], duration: 300, padding: 0.3 });
  }, [rf]);

  /* ── Handlers ── */
  const onNodeClick = useCallback(function nc(_: React.MouseEvent, node: Node) {
    if (node.type === "memory") ctxRef.current.setSelectedNodeId(node.id);
  }, []);

  const onPaneClick = useCallback(function pc() {
    ctxRef.current.setSelectedNodeId(null);
  }, []);

  const onNodeMouseEnter = useCallback(function nme(_: React.MouseEvent, node: Node) {
    if (node.type === "memory") ctxRef.current.setHoveredNodeId(node.id);
  }, []);

  const onNodeMouseLeave = useCallback(function nml() {
    ctxRef.current.setHoveredNodeId(null);
  }, []);

  const onMoveEnd = useCallback(function me(_: unknown, vp: { zoom: number }) {
    setZoomLevel(vp.zoom);
  }, []);

  /* ── Keyboard shortcuts ── */
  useEffect(function keys() {
    function handler(e: KeyboardEvent) {
      var tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if ((e.target as HTMLElement).isContentEditable) return;
      var c = ctxRef.current;
      switch (e.key) {
        case "k":
          if (e.metaKey || e.ctrlKey) { e.preventDefault(); c.setCmdPaletteOpen(true); }
          break;
        case "/":
          e.preventDefault();
          c.setQuickSearchOpen(function t(p) { return !p; });
          if (c.quickSearchOpen) c.setQuickSearchQuery("");
          break;
        case "f": case "F":
          if (!e.metaKey && !e.ctrlKey) { e.preventDefault(); rf.fitView(fitViewOpts); }
          break;
        case "Escape":
          e.preventDefault();
          if (c.cmdPaletteOpen) c.setCmdPaletteOpen(false);
          else if (c.quickSearchOpen) { c.setQuickSearchOpen(false); c.setQuickSearchQuery(""); }
          else if (shortcutsOpen) setShortcutsOpen(false);
          else c.setSelectedNodeId(null);
          break;
        case " ":
          e.preventDefault();
          if (c.selectedNodeId) c.setSelectedNodeId(null);
          break;
        case "Tab":
          e.preventDefault();
          cycleRef.current = (cycleRef.current + 1) % CLUSTER_ORDER.length;
          var ck = CLUSTER_ORDER[cycleRef.current]; if (ck) goCluster(ck);
          break;
        case "?":
          e.preventDefault();
          setShortcutsOpen(function t(p) { return !p; });
          break;
        case "1": case "2": case "3": case "4": case "5":
          var ck2 = CLUSTER_ORDER[parseInt(e.key) - 1]; if (ck2) goCluster(ck2);
          break;
        default: break;
      }
    }
    window.addEventListener("keydown", handler);
    return function cl() { window.removeEventListener("keydown", handler); };
  }, [rf, goCluster, shortcutsOpen]);

  var isEmpty = !isLoading && !error && nodes.length === 0;

  return (
    <div className="flex h-full w-full">
      <div className="relative min-w-0 flex-1 overflow-hidden bg-zinc-950">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(99,102,241,0.04),transparent_60%)]" />
        <ReactFlow
          nodes={displayedNodes}
          edges={displayedEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          onNodeMouseEnter={onNodeMouseEnter}
          onNodeMouseLeave={onNodeMouseLeave}
          onMoveEnd={onMoveEnd}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          minZoom={0.15}
          maxZoom={3.0}
          defaultViewport={defaultViewport}
          proOptions={proOpts}
          fitView
          fitViewOptions={fitViewOpts}
          panOnDrag
          zoomOnScroll
          zoomOnPinch
          panOnScroll={false}
          selectionOnDrag={false}
          className="!bg-transparent"
        >
          <Background variant={BackgroundVariant.Dots} gap={28} size={0.8} color="rgba(255,255,255,0.025)" />
          <GraphMinimap />
        </ReactFlow>
        {isLoading && <LoadingState />}
        {error && <ErrorToast message={error instanceof Error ? error.message : "Failed to load memory graph"} />}
        {isEmpty && <EmptyState />}
        {isFetching && !isLoading && (
          <div className="absolute top-4 right-4 z-50">
            <Loader2 className="h-4 w-4 animate-spin text-white/30" />
          </div>
        )}
        <ZoomControls />
        <ShortcutOverlay open={shortcutsOpen} onClose={function cl() { setShortcutsOpen(false); }} />
        {ctx.quickSearchOpen && <QuickSearchBar />}
        {ctx.cmdPaletteOpen && (
          <CommandPalette
            open={ctx.cmdPaletteOpen}
            onClose={function cl() { ctx.setCmdPaletteOpen(false); }}
            nodes={memNodes}
            onSelectNode={ctx.setSelectedNodeId}
            onNavigateCluster={goCluster}
            onRefresh={ctx.refreshGraph}
          />
        )}
      </div>
      <Inspector
        nodeId={ctx.selectedNodeId}
        nodeData={inspectorData.nd}
        connections={inspectorData.conns}
        onClose={function cl() { ctx.setSelectedNodeId(null); }}
        onSelectNode={ctx.setSelectedNodeId}
        navigableNodeIds={inspectorData.navIds}
      />
    </div>
  );
}

/* ── Exported Component ───────────────────── */
export function MemoryGraphCanvas() {
  return (
    <MemoryGraphProvider>
      <div className="relative h-full w-full">
        <InnerCanvas />
      </div>
    </MemoryGraphProvider>
  );
}
