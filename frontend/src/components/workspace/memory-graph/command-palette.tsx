"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Search, Compass, AlertTriangle, HelpCircle, RefreshCw, Download, Zap,
} from "lucide-react";
import { CLUSTER_HUES, CLUSTER_META } from "./types";
import type { MemoryNodeData, ClusterKey } from "./types";

/* ── Types ─────────────────────────────────────── */

interface MemResult { id: string; data: MemoryNodeData; score: number; }

interface CmdAction {
  id: string; label: string;
  Icon: React.ComponentType<{ className?: string }>;
  keywords: string[]; handler: () => void;
}

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  nodes: Array<{ id: string; data: MemoryNodeData }>;
  onSelectNode: (id: string) => void;
  onNavigateCluster: (cluster: ClusterKey) => void;
}

/* ── Consts ─────────────────────────────────────── */
const OV_INIT = { opacity: 0 };
const OV_VIS = { opacity: 1 };
const P_INIT = { opacity: 0, scale: 0.96, y: -8 };
const P_VIS = { opacity: 1, scale: 1, y: 0 };
const P_TR = { duration: 0.15 };

/* ── Fuzzy ──────────────────────────────────────── */
function fuzzy(q: string, text: string): number {
  const ql = q.toLowerCase();
  const tl = text.toLowerCase();
  if (tl.includes(ql)) return 1;
  let qi = 0;
  let sc = 0;
  for (let ti = 0; ti < tl.length && qi < ql.length; ti++) {
    if (tl[ti] === ql[qi]) { sc++; qi++; }
  }
  return qi === ql.length ? sc / ql.length * 0.5 : 0;
}

/* ── Component ──────────────────────────────────── */
export function CommandPalette(props: CommandPaletteProps) {
  const { open, onClose, nodes, onSelectNode, onNavigateCluster } = props;
  const [query, setQuery] = useState("");
  const [selIdx, setSelIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(function resetOnOpen() {
    if (open) { setQuery(""); setSelIdx(0); setTimeout(function f() { inputRef.current?.focus(); }, 50); }
  }, [open]);

  const actions: CmdAction[] = useMemo(function buildActions() {
    const ca = Object.entries(CLUSTER_META).map(function mc(entry) {
      const k = entry[0] as ClusterKey;
      const m = entry[1];
      return { id: "go-" + k, label: "Go to " + m.label, Icon: Compass, keywords: ["go", k, m.label.toLowerCase()], handler: function h() { onNavigateCluster(k); onClose(); } };
    });
    return [
      ...ca,
      { id: "find-related", label: "Find related", Icon: Search, keywords: ["find", "related"], handler: onClose },
      { id: "find-contradictions", label: "Find contradictions", Icon: AlertTriangle, keywords: ["find", "contradictions"], handler: onClose },
      { id: "find-gaps", label: "Find gaps", Icon: HelpCircle, keywords: ["find", "gaps"], handler: onClose },
      { id: "refresh", label: "Refresh", Icon: RefreshCw, keywords: ["refresh", "reload"], handler: onClose },
      { id: "export", label: "Export", Icon: Download, keywords: ["export", "json"], handler: onClose },
    ];
  }, [onClose, onNavigateCluster]);

  const results = useMemo(function compute() {
    if (!query.trim()) return { memories: [] as MemResult[], actions: actions.slice(0, 6), showAsk: false };
    const q = query.trim();
    const mems = nodes
      .map(function s(n) { return { id: n.id, data: n.data, score: fuzzy(q, n.data.title) }; })
      .filter(function f(r) { return r.score > 0; })
      .sort(function c(a, b) { return b.score - a.score; })
      .slice(0, 8);
    const ma = actions.filter(function f(a) { return a.keywords.some(function k(kw) { return kw.includes(q.toLowerCase()); }); });
    const isQ = q.endsWith("?") || /^(what|how|why|who|when)/i.test(q);
    return { memories: mems, actions: ma, showAsk: isQ || q.length > 15 };
  }, [query, nodes, actions]);

  const allItems = useMemo(function flat() {
    const it: Array<{ type: string; id: string; handler: () => void }> = [];
    for (const m of results.memories) it.push({ type: "m", id: m.id, handler: function h() { onSelectNode(m.id); onClose(); } });
    for (const a of results.actions) it.push({ type: "a", id: a.id, handler: a.handler });
    if (results.showAsk) it.push({ type: "q", id: "ask", handler: onClose });
    return it;
  }, [results, onSelectNode, onClose]);

  const memStart = 0;
  const actStart = results.memories.length;
  const askStart = results.memories.length + results.actions.length;

  const onKeyDown = useCallback(function kd(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setSelIdx(function n(i) { return Math.min(i + 1, allItems.length - 1); }); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSelIdx(function n(i) { return Math.max(i - 1, 0); }); }
    else if (e.key === "Enter" && allItems[selIdx]) { e.preventDefault(); allItems[selIdx].handler(); }
    else if (e.key === "Escape") { e.preventDefault(); onClose(); }
  }, [allItems, selIdx, onClose]);

  if (!open) return null;

  return (
    <AnimatePresence>
      <div className="absolute inset-0 z-[80] flex items-start justify-center pt-[15vh]">
        <motion.div initial={OV_INIT} animate={OV_VIS} exit={OV_INIT} className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
        <motion.div initial={P_INIT} animate={P_VIS} exit={P_INIT} transition={P_TR} className="relative z-10 w-[520px] max-w-[90vw] overflow-hidden rounded-2xl border border-white/[0.08] bg-zinc-900/95 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-3">
            <Search className="h-4 w-4 flex-shrink-0 text-white/30" />
            <input
              ref={inputRef}
              value={query}
              onChange={function oc(e) { setQuery(e.target.value); setSelIdx(0); }}
              onKeyDown={onKeyDown}
              placeholder="Search memories, ask a question, or take action\u2026"
              className="flex-1 bg-transparent text-[14px] text-white/80 outline-none placeholder:text-white/25"
            />
          </div>
          <div className="max-h-[400px] overflow-y-auto p-2">
            {results.memories.length > 0 && (
              <div className="mb-2">
                <div className="px-3 py-1 text-[10px] font-medium uppercase tracking-[0.2em] text-white/25">Memories</div>
                {results.memories.map(function rm(m, i) {
                  const active = memStart + i === selIdx;
                  const dot = { background: CLUSTER_HUES[m.data.cluster] };
                  return (
                    <button key={m.id} onClick={function c() { onSelectNode(m.id); onClose(); }} className={"flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[13px] transition-colors " + (active ? "bg-white/[0.06] text-white/80" : "text-white/55 hover:bg-white/[0.04]")}>
                      <span className="h-2 w-2 flex-shrink-0 rounded-full" style={dot} />
                      <span className="truncate">{m.data.title}</span>
                    </button>
                  );
                })}
              </div>
            )}
            {results.actions.length > 0 && (
              <div className="mb-2">
                <div className="px-3 py-1 text-[10px] font-medium uppercase tracking-[0.2em] text-white/25">Actions</div>
                {results.actions.map(function ra(a, i) {
                  const active = actStart + i === selIdx;
                  return (
                    <button key={a.id} onClick={a.handler} className={"flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[13px] transition-colors " + (active ? "bg-white/[0.06] text-white/80" : "text-white/55 hover:bg-white/[0.04]")}>
                      <a.Icon className="h-3.5 w-3.5 flex-shrink-0 text-white/30" />
                      <span>{a.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
            {results.showAsk && (
              <div>
                <div className="px-3 py-1 text-[10px] font-medium uppercase tracking-[0.2em] text-white/25">Ask</div>
                <button onClick={onClose} className={"flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[13px] transition-colors " + (askStart === selIdx ? "bg-white/[0.06] text-white/80" : "text-white/55 hover:bg-white/[0.04]")}>
                  <Zap className="h-3.5 w-3.5 flex-shrink-0 text-amber-400/60" />
                  <span>Ask VESPER about this</span>
                </button>
              </div>
            )}
            {allItems.length === 0 && query.trim() && (
              <div className="px-3 py-6 text-center text-[13px] text-white/25">No results</div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
