"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  MiniMap,
  Background,
  BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Minus, Plus, Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils";

/* Context */

type MemoryGraphContextValue = {
  selectedNodeId: string | null;
  setSelectedNodeId: (id: string | null) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
};

const MemoryGraphContext = createContext<MemoryGraphContextValue>({
  selectedNodeId: null,
  setSelectedNodeId: () => {},
  searchQuery: "",
  setSearchQuery: () => {},
});

export const useMemoryGraph = () => useContext(MemoryGraphContext);

function MemoryGraphProvider({ children }: { children: React.ReactNode }) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const value = { selectedNodeId, setSelectedNodeId, searchQuery, setSearchQuery };

  return (
    <MemoryGraphContext.Provider value={value}>
      <ReactFlowProvider>{children}</ReactFlowProvider>
    </MemoryGraphContext.Provider>
  );
}

/* ZoomControls */

function ZoomControls() {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const [visible, setVisible] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetTimer = useCallback(() => {
    setVisible(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setVisible(false), 3000);
  }, []);

  useEffect(() => {
    resetTimer();
    const onActivity = () => resetTimer();
    window.addEventListener("mousemove", onActivity);
    window.addEventListener("wheel", onActivity);
    window.addEventListener("touchstart", onActivity);
    return () => {
      window.removeEventListener("mousemove", onActivity);
      window.removeEventListener("wheel", onActivity);
      window.removeEventListener("touchstart", onActivity);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [resetTimer]);

  const btnClass =
    "flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.08] bg-black/40 text-white/60 backdrop-blur-xl transition-all duration-200 hover:bg-black/60 hover:text-white active:scale-95";

  return (
    <div
      className={cn(
        "absolute bottom-6 right-6 z-50 flex flex-col gap-1 transition-opacity duration-500",
        visible ? "opacity-100" : "opacity-0 hover:opacity-100",
      )}
      onMouseEnter={() => setVisible(true)}
    >
      <button
        onClick={() => zoomIn({ duration: 200 })}
        className={btnClass}
        aria-label="Zoom in"
        title="Zoom in"
      >
        <Plus className="h-4 w-4" />
      </button>
      <button
        onClick={() => zoomOut({ duration: 200 })}
        className={btnClass}
        aria-label="Zoom out"
        title="Zoom out"
      >
        <Minus className="h-4 w-4" />
      </button>
      <div className="my-0.5 h-px w-full bg-white/[0.06]" />
      <button
        onClick={() => fitView({ padding: 0.2, duration: 300 })}
        className={btnClass}
        aria-label="Fit to view"
        title="Fit to view (F)"
      >
        <Maximize2 className="h-4 w-4" />
      </button>
    </div>
  );
}

/* GraphMinimap */

const minimapStyle = {
  width: 160,
  height: 100,
  backgroundColor: "rgba(0, 0, 0, 0.35)",
  borderRadius: 12,
};

function GraphMinimap() {
  return (
    <MiniMap
      className="!absolute !bottom-6 !left-6 !hidden !rounded-xl !border !border-white/[0.06] !shadow-2xl md:!block"
      style={minimapStyle}
      maskColor="rgba(255, 255, 255, 0.06)"
      nodeColor="rgba(255, 255, 255, 0.2)"
      pannable
      zoomable
    />
  );
}

/* Shortcut Overlay */

const SHORTCUTS = [
  { key: "⌘K", action: "Command palette" },
  { key: "1 – 5", action: "Jump to cluster" },
  { key: "F", action: "Fit all to view" },
  { key: "Esc", action: "Close / deselect" },
  { key: "/", action: "Quick search" },
  { key: "Space", action: "Toggle inspector" },
  { key: "Tab", action: "Cycle clusters" },
  { key: "?", action: "Show shortcuts" },
];

function ShortcutOverlay({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div
      className="absolute inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-label="Keyboard shortcuts"
    >
      <div
        className="w-[360px] rounded-2xl border border-white/[0.08] bg-zinc-900/90 p-6 shadow-2xl backdrop-blur-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-5 text-[11px] font-medium uppercase tracking-[0.3em] text-white/40">
          Keyboard shortcuts
        </h3>
        <div className="flex flex-col gap-1">
          {SHORTCUTS.map((s) => (
            <div
              key={s.key}
              className="flex items-center justify-between rounded-lg px-3 py-2 text-sm"
            >
              <span className="text-white/60">{s.action}</span>
              <kbd className="rounded-md border border-white/[0.1] bg-white/[0.04] px-2.5 py-1 font-mono text-xs text-white/40">
                {s.key}
              </kbd>
            </div>
          ))}
        </div>
        <div className="mt-5 text-center text-[11px] text-white/25">
          Press ? or Esc to close
        </div>
      </div>
    </div>
  );
}

/* Empty State */

function EmptyState() {
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
      <div className="relative flex flex-col items-center">
        <div className="absolute -top-24 h-48 w-48 rounded-full bg-indigo-500/[0.05] blur-[80px]" />
        <div className="absolute -top-16 h-32 w-32 rounded-full bg-violet-500/[0.04] blur-[60px]" />
        <div className="relative mb-8 flex h-24 w-24 items-center justify-center rounded-full border border-white/[0.05] bg-white/[0.02]">
          <span className="text-5xl opacity-80">🧠</span>
        </div>
        <p className="text-center text-[15px] leading-relaxed tracking-wide text-white/30">
          No memories yet.
          <br />
          <span className="text-white/20">
            VESPER learns as you work together.
          </span>
        </p>
      </div>
    </div>
  );
}

/* InnerCanvas */

const defaultViewport = { x: 0, y: 0, zoom: 1 };
const proOpts = { hideAttribution: true };
const fitViewOpts = { padding: 0.2 };

function InnerCanvas() {
  const { fitView } = useReactFlow();
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  const nodes: never[] = [];
  const edges: never[] = [];

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if ((e.target as HTMLElement).isContentEditable) return;

      switch (e.key) {
        case "f":
        case "F":
          if (!e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            fitView({ padding: 0.2, duration: 300 });
          }
          break;
        case "Escape":
          e.preventDefault();
          setShortcutsOpen(false);
          break;
        case "?":
          e.preventDefault();
          setShortcutsOpen((prev) => !prev);
          break;
        case "k":
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault();
          }
          break;
        case "/":
          e.preventDefault();
          break;
        case " ":
          e.preventDefault();
          break;
        case "Tab":
          e.preventDefault();
          break;
        case "1":
        case "2":
        case "3":
        case "4":
        case "5":
          break;
        default:
          break;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [fitView]);

  const isEmpty = nodes.length === 0;

  return (
    <div className="relative h-full w-full overflow-hidden bg-zinc-950">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(99,102,241,0.04),transparent_60%)]" />

      <ReactFlow
        nodes={nodes}
        edges={edges}
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
        <Background
          variant={BackgroundVariant.Dots}
          gap={28}
          size={0.8}
          color="rgba(255, 255, 255, 0.025)"
        />
        <GraphMinimap />
      </ReactFlow>

      {isEmpty && <EmptyState />}
      <ZoomControls />
      <ShortcutOverlay
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
      />
    </div>
  );
}

/* Exported Component */

export function MemoryGraphCanvas() {
  return (
    <MemoryGraphProvider>
      <div className="relative h-full w-full">
        <InnerCanvas />
      </div>
    </MemoryGraphProvider>
  );
}
