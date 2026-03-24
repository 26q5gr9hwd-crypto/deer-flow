"use client";

import {
  AlertTriangle,
  ArrowUpRight,
  BrainCircuit,
  Eye,
  Loader2,
  Radar,
  RefreshCw,
  Sparkles,
  Waves,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { VesperPanel, VesperShell } from "@/components/workspace/vesper-shell";
import type { AgentThread } from "@/core/threads";
import { useThreads } from "@/core/threads/hooks";
import { titleOfThread } from "@/core/threads/utils";

type TimelineEvent = {
  index?: number;
  sequence?: number;
  type: string;
  preview?: string;
  tool_name?: string;
  tool_call_id?: string;
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  approx_tokens?: number;
  tool_call_count?: number;
  response_kind?: string;
  cost?: number;
  evidence?: string;
  approximate?: boolean;
  args?: Record<string, unknown>;
};

type RunHistoryItem = {
  run_id: string;
  thread_id: string;
  started_at?: string;
  finished_at?: string;
  latest_checkpoint_id?: string;
  checkpoint_count?: number;
  latest_step?: number;
  snapshot_fidelity?: string;
};

type TokenGroup = {
  approx_tokens?: number;
  section_count?: number;
  message_count?: number;
  event_count?: number;
  tool_count?: number;
  llm_call_count?: number;
  schema_chars?: number;
  derived_from?: string;
  latest?: number | null;
  max?: number | null;
  sum?: number | null;
};

type TokenAccounting = {
  compiled_context?: TokenGroup;
  provider_total_tokens?: TokenGroup;
  visible_estimate_total?: number;
  latest_provider_gap?: number | null;
  warnings?: string[];
};

type RuntimeIntrospection = {
  thread_id: string;
  run_id?: string;
  agent_name?: string;
  model_name?: string;
  snapshot_mode?: string;
  snapshot_fidelity?: string;
  warnings?: string[];
  compiled_context_reused?: boolean | null;
  selected_run?: RunHistoryItem;
  run_history?: RunHistoryItem[];
  lead?: {
    tool_groups?: string[];
    effective_tools?: string[];
    subagent_enabled?: boolean;
  };
  skills?: {
    available_skills?: Array<{
      name: string;
      description?: string;
      category?: string;
      enabled?: boolean;
    }>;
    load_events?: TimelineEvent[];
  };
  memory?: {
    recall_event?: {
      query?: string;
      limit?: number;
      result_count?: number;
      approx_tokens_injected?: number;
      trace_available?: boolean | null;
    };
  };
  timeline?: TimelineEvent[];
  selected_run_message_count?: number;
  token_accounting?: TokenAccounting;
};

type InspectorItem = {
  id: string;
  kind: "summary" | "attention" | "event" | "evolution";
  label: string;
  title: string;
  description: string;
  evidence?: string;
  meta?: Array<{ label: string; value: string }>;
};

type FetchState = {
  status: "idle" | "loading" | "ready" | "error";
  data?: RuntimeIntrospection;
  error?: string;
};

function formatCount(value?: number | null) {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat().format(value);
}

function formatTimestamp(value?: string) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatTokenCount(value?: number | null, approximate = false) {
  if (value === null || value === undefined) return "—";
  return `${approximate ? "~" : ""}${formatCount(value)} tokens`;
}

function formatBoolean(value?: boolean | null) {
  if (value === null || value === undefined) return "Unknown";
  return value ? "Yes" : "No";
}

function titleForEvent(event: TimelineEvent) {
  if (event.tool_name) return event.tool_name;
  return event.type.replace(/_/g, " ");
}

function summaryForEvent(event: TimelineEvent) {
  return (
    event.preview ||
    event.evidence ||
    (event.response_kind ? `Response kind: ${event.response_kind}` : undefined) ||
    "Runtime event captured without additional preview text."
  );
}

export function ControlRoomShellSurface() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedThreadId = searchParams.get("thread");
  const [refreshSeed, setRefreshSeed] = useState(0);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(requestedThreadId);
  const [selectedInspectorId, setSelectedInspectorId] = useState<string | null>(null);
  const [fetchState, setFetchState] = useState<FetchState>({ status: "idle" });

  const { data: threads = [], isLoading: threadsLoading } = useThreads({
    limit: 10,
    sortBy: "updated_at",
    sortOrder: "desc",
    select: ["thread_id", "updated_at", "values"],
  });

  useEffect(() => {
    if (threads.length === 0) {
      setSelectedThreadId(null);
      return;
    }

    const preferred =
      (requestedThreadId && threads.find((thread) => thread.thread_id === requestedThreadId)?.thread_id) ||
      null;
    const current =
      (selectedThreadId && threads.find((thread) => thread.thread_id === selectedThreadId)?.thread_id) ||
      null;
    const nextThreadId = preferred || current || threads[0]?.thread_id || null;

    if (nextThreadId && nextThreadId !== selectedThreadId) {
      setSelectedThreadId(nextThreadId);
    }
  }, [requestedThreadId, selectedThreadId, threads]);

  useEffect(() => {
    if (!selectedThreadId) {
      setFetchState({ status: "idle" });
      return;
    }

    const controller = new AbortController();
    setFetchState((current) => ({
      status: "loading",
      data: current.data?.thread_id === selectedThreadId ? current.data : undefined,
    }));

    void fetch(`/api/runtime/threads/${selectedThreadId}/introspection`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || `Runtime introspection returned ${response.status}`);
        }
        return response.json() as Promise<RuntimeIntrospection>;
      })
      .then((data) => {
        setFetchState({ status: "ready", data });
      })
      .catch((error: unknown) => {
        if ((error as { name?: string })?.name === "AbortError") return;
        setFetchState({
          status: "error",
          error: error instanceof Error ? error.message : "Unknown introspection error",
        });
      });

    return () => controller.abort();
  }, [refreshSeed, selectedThreadId]);

  const selectedThread = useMemo(
    () => threads.find((thread) => thread.thread_id === selectedThreadId) || null,
    [selectedThreadId, threads],
  );

  const introspection = fetchState.data;
  const timeline = introspection?.timeline ?? [];
  const activeRun = introspection?.selected_run ?? introspection?.run_history?.[0] ?? null;
  const warnings = introspection?.warnings ?? [];
  const tokenAccounting = introspection?.token_accounting;
  const recallEvent = introspection?.memory?.recall_event;

  const attentionItems = useMemo<InspectorItem[]>(() => {
    const items: InspectorItem[] = [];

    warnings.forEach((warning, index) => {
      items.push({
        id: `warning-${index}`,
        kind: "attention",
        label: "Attention",
        title: `Runtime warning ${index + 1}`,
        description: warning,
        meta: [
          { label: "Thread", value: selectedThread ? titleOfThread(selectedThread) : "Unknown" },
          { label: "Source", value: "Runtime introspection" },
        ],
      });
    });

    if (introspection?.snapshot_fidelity && introspection.snapshot_fidelity !== "exact") {
      items.push({
        id: "snapshot-fidelity",
        kind: "attention",
        label: "Attention",
        title: "Snapshot fidelity is not exact",
        description:
          "The current runtime trace is available, but the selected run is not exposing a fully exact snapshot. Treat counts and context reconstruction as operational guidance rather than final truth.",
        meta: [
          { label: "Fidelity", value: introspection.snapshot_fidelity },
          { label: "Run", value: activeRun?.run_id ?? "Unknown" },
        ],
      });
    }

    if (typeof tokenAccounting?.latest_provider_gap === "number" && Math.abs(tokenAccounting.latest_provider_gap) >= 250) {
      items.push({
        id: "provider-gap",
        kind: "attention",
        label: "Attention",
        title: "Visible context and provider totals are drifting apart",
        description:
          "The runtime is exposing a meaningful gap between visible token estimates and provider totals. This is useful for investigation, but it means prompt accounting should be treated as approximate rather than exact.",
        meta: [
          { label: "Gap", value: formatTokenCount(tokenAccounting.latest_provider_gap, true) },
          {
            label: "Visible estimate",
            value: formatTokenCount(tokenAccounting.visible_estimate_total, true),
          },
        ],
      });
    }

    if (fetchState.status === "error") {
      items.push({
        id: "fetch-error",
        kind: "attention",
        label: "Attention",
        title: "Runtime introspection did not load",
        description:
          fetchState.error || "The shell could not retrieve a usable introspection payload for the selected thread.",
        meta: [{ label: "Thread", value: selectedThread ? titleOfThread(selectedThread) : "Unknown" }],
      });
    }

    return items;
  }, [activeRun?.run_id, fetchState.error, fetchState.status, introspection?.snapshot_fidelity, selectedThread, tokenAccounting?.latest_provider_gap, tokenAccounting?.visible_estimate_total, warnings]);

  const evolutionItems = useMemo<InspectorItem[]>(() => {
    const items: InspectorItem[] = [];

    if (tokenAccounting?.compiled_context?.approx_tokens || tokenAccounting?.visible_estimate_total) {
      items.push({
        id: "context-density",
        kind: "evolution",
        label: "Evolution",
        title: "Context density is now legible from the shell",
        description:
          "The shell can already surface compiled context weight and visible prompt estimates. This is the right foundation for a calmer operational surface than the old diagnostics-heavy route.",
        meta: [
          {
            label: "Compiled context",
            value: formatTokenCount(tokenAccounting.compiled_context?.approx_tokens, true),
          },
          {
            label: "Visible estimate",
            value: formatTokenCount(tokenAccounting.visible_estimate_total, true),
          },
        ],
      });
    }

    if (recallEvent) {
      items.push({
        id: "memory-evidence",
        kind: "evolution",
        label: "Evolution",
        title: "Memory recall can be inspected as runtime evidence",
        description:
          "Memory is no longer a hidden subsystem. The runtime is exposing recall query shape, result counts, and injected token weight so Memory can become a first-class operational surface.",
        meta: [
          { label: "Results", value: formatCount(recallEvent.result_count) },
          {
            label: "Injected",
            value: formatTokenCount(recallEvent.approx_tokens_injected, true),
          },
          { label: "Trace available", value: formatBoolean(recallEvent.trace_available) },
        ],
      });
    }

    if (introspection?.lead?.effective_tools?.length || introspection?.skills?.available_skills?.length) {
      items.push({
        id: "capability-surface",
        kind: "evolution",
        label: "Evolution",
        title: "Runtime capability layers are ready for calmer product language",
        description:
          "Tool groups, effective tools, and skill availability are already visible. The next step is to translate that runtime truth into a VESPER-native operator language instead of exposing raw implementation furniture.",
        meta: [
          { label: "Tools", value: formatCount(introspection?.lead?.effective_tools?.length) },
          { label: "Skills", value: formatCount(introspection?.skills?.available_skills?.length) },
          { label: "Subagents", value: formatBoolean(introspection?.lead?.subagent_enabled) },
        ],
      });
    }

    return items;
  }, [introspection?.lead?.effective_tools?.length, introspection?.lead?.subagent_enabled, introspection?.skills?.available_skills?.length, recallEvent, tokenAccounting?.compiled_context?.approx_tokens, tokenAccounting?.visible_estimate_total]);

  const activityItems = useMemo<InspectorItem[]>(() => {
    return timeline.slice(0, 8).map((event, index) => ({
      id: `event-${event.sequence ?? event.index ?? index}`,
      kind: "event",
      label: "Activity",
      title: titleForEvent(event),
      description: summaryForEvent(event),
      evidence:
        typeof event.args === "object" && event.args
          ? JSON.stringify(event.args, null, 2)
          : event.evidence,
      meta: [
        { label: "Sequence", value: formatCount(event.sequence ?? event.index ?? index + 1) },
        { label: "Tokens", value: formatTokenCount(event.total_tokens ?? event.approx_tokens, !!event.approximate) },
        { label: "Tool calls", value: formatCount(event.tool_call_count) },
      ],
    }));
  }, [timeline]);

  const summaryItem = useMemo<InspectorItem>(() => {
    const threadName = selectedThread ? titleOfThread(selectedThread) : "No thread selected";
    const tone =
      attentionItems.length > 0
        ? `${attentionItems.length} attention signal${attentionItems.length === 1 ? "" : "s"} require review.`
        : fetchState.status === "loading"
          ? "The shell is reading live runtime truth now."
          : fetchState.status === "error"
            ? "Runtime truth is temporarily unavailable from the selected thread."
            : activeRun
              ? "The latest runtime trace is readable and calm enough to operate from this shell."
              : "Select a recent thread to begin reading runtime truth.";

    return {
      id: "summary",
      kind: "summary",
      label: "Status plane",
      title: threadName,
      description: tone,
      meta: [
        { label: "Run", value: activeRun?.run_id ?? "Unavailable" },
        { label: "Started", value: formatTimestamp(activeRun?.started_at) },
        { label: "Timeline", value: formatCount(timeline.length) },
      ],
    };
  }, [activeRun, attentionItems.length, fetchState.status, selectedThread, timeline.length]);

  const inspectorItems = useMemo(
    () => [summaryItem, ...attentionItems, ...activityItems, ...evolutionItems],
    [activityItems, attentionItems, evolutionItems, summaryItem],
  );

  useEffect(() => {
    if (!inspectorItems.some((item) => item.id === selectedInspectorId)) {
      setSelectedInspectorId(inspectorItems[0]?.id ?? null);
    }
  }, [inspectorItems, selectedInspectorId]);

  const inspectorItem =
    inspectorItems.find((item) => item.id === selectedInspectorId) || inspectorItems[0] || null;

  const heroTitle = useMemo(() => {
    if (!selectedThread) return "No live runtime lens selected yet.";
    if (fetchState.status === "loading") return "Reading runtime truth from the current operational thread.";
    if (attentionItems.length > 0) return "The system is live, but it is asking for a closer look.";
    if (activeRun) return "The runtime feels calm, with a readable trace and live evidence behind it.";
    return "The shell is ready, but this thread has not surfaced a usable operational trace yet.";
  }, [activeRun, attentionItems.length, fetchState.status, selectedThread]);

  const heroDescription = useMemo(() => {
    if (!selectedThread) {
      return "Choose one of the recent runtime threads to populate the status plane, activity timeline, and detail inspector with live evidence.";
    }

    return "Control Room now lives in the VESPER shell. It keeps the old thread-bound introspection route available for deep trace work, but the default composition is now a calm operational surface with readable hierarchy instead of a diagnostics stack.";
  }, [selectedThread]);

  const threadPicker = (
    <div className="space-y-4 text-sm text-muted-foreground">
      <div>
        <div className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">Recent runtime lenses</div>
        <p className="mt-2 leading-6">
          Pick a recent thread to retarget the hero status plane and inspector without dropping back into the old workspace frame.
        </p>
      </div>
      <div className="space-y-2">
        {threadsLoading ? (
          <div className="flex items-center gap-2 text-foreground/72">
            <Loader2 className="size-4 animate-spin" />
            Loading threads
          </div>
        ) : threads.length === 0 ? (
          <div className="rounded-2xl border border-border/60 bg-background/70 px-4 py-3 text-foreground/72">
            No runtime threads were returned by the adapter.
          </div>
        ) : (
          threads.map((thread) => {
            const active = thread.thread_id === selectedThreadId;
            return (
              <button
                key={thread.thread_id}
                type="button"
                onClick={() => {
                  const params = new URLSearchParams(searchParams.toString());
                  params.set("thread", thread.thread_id);
                  router.replace(`/workspace/control-room?${params.toString()}`, { scroll: false });
                  setSelectedThreadId(thread.thread_id);
                }}
                className={[
                  "w-full rounded-2xl border px-4 py-3 text-left transition",
                  active
                    ? "border-foreground/25 bg-foreground text-background"
                    : "border-border/60 bg-background/78 text-foreground hover:border-foreground/25",
                ].join(" ")}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium">{titleOfThread(thread)}</div>
                    <div className={active ? "mt-1 text-background/72" : "mt-1 text-muted-foreground"}>
                      Updated {formatTimestamp(thread.updated_at)}
                    </div>
                  </div>
                  <ArrowUpRight className="mt-1 size-4 shrink-0" />
                </div>
              </button>
            );
          })
        )}
      </div>
      {selectedThreadId ? (
        <Link
          href={`/workspace/chats/${selectedThreadId}/control-room`}
          className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background px-4 py-2 text-foreground transition hover:border-foreground/35"
        >
          <span>Open full thread trace</span>
          <ArrowUpRight className="size-4" />
        </Link>
      ) : null}
    </div>
  );

  return (
    <VesperShell
      eyebrow="Control Room"
      title="Operational posture"
      description="Runtime truth, activity, and evolution now sit inside the VESPER shell instead of the old chat-first workspace frame."
      actions={[
        { href: "/workspace/home", label: "Return Home" },
        ...(selectedThreadId
          ? [{ href: `/workspace/chats/${selectedThreadId}/control-room`, label: "Open full trace", emphasis: true as const }]
          : []),
      ]}
      meta={[
        { label: "Thread", value: selectedThread ? titleOfThread(selectedThread) : "Unselected" },
        { label: "Runs", value: formatCount(introspection?.run_history?.length) },
        { label: "Events", value: formatCount(timeline.length) },
      ]}
      inspectorTitle="Detail inspector"
      inspector={
        inspectorItem ? (
          <div className="space-y-5 text-sm text-muted-foreground">
            <div>
              <div className="text-[11px] uppercase tracking-[0.26em]">{inspectorItem.label}</div>
              <h3 className="mt-3 font-serif text-2xl tracking-[0.02em] text-foreground">
                {inspectorItem.title}
              </h3>
              <p className="mt-3 leading-6">{inspectorItem.description}</p>
            </div>
            {inspectorItem.meta?.length ? (
              <div className="space-y-2 rounded-[1.5rem] border border-border/60 bg-background/82 p-4">
                {inspectorItem.meta.map((item) => (
                  <div key={`${inspectorItem.id}-${item.label}`} className="flex items-center justify-between gap-4 text-xs uppercase tracking-[0.22em]">
                    <span>{item.label}</span>
                    <span className="text-right text-foreground">{item.value}</span>
                  </div>
                ))}
              </div>
            ) : null}
            {inspectorItem.evidence ? (
              <div className="rounded-[1.5rem] border border-border/60 bg-background/82 p-4">
                <div className="text-[11px] uppercase tracking-[0.26em]">Evidence</div>
                <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs leading-6 text-foreground/84">
                  {inspectorItem.evidence}
                </pre>
              </div>
            ) : null}
            {selectedThreadId ? (
              <Link
                href={`/workspace/chats/${selectedThreadId}/control-room`}
                className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background px-4 py-2 text-foreground transition hover:border-foreground/35"
              >
                <span>Inspect original trace</span>
                <ArrowUpRight className="size-4" />
              </Link>
            ) : null}
          </div>
        ) : threadPicker
      }
    >
      <section className="relative overflow-hidden rounded-[2rem] border border-border/60 bg-[linear-gradient(135deg,rgba(28,31,35,0.97),rgba(48,56,64,0.92)_52%,rgba(77,90,102,0.84))] px-6 py-8 text-slate-100 shadow-[0_32px_90px_rgba(29,35,40,0.28)]">
        <div className="absolute inset-y-0 right-0 hidden w-1/2 bg-[radial-gradient(circle_at_center,rgba(191,231,255,0.16),transparent_58%)] lg:block" />
        <div className="relative grid gap-6 xl:grid-cols-[1.25fr_0.8fr]">
          <div className="max-w-3xl">
            <div className="text-[11px] uppercase tracking-[0.34em] text-slate-300/80">Hero status plane</div>
            <h2 className="mt-4 font-serif text-4xl tracking-[0.02em] sm:text-5xl">{heroTitle}</h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-200/78 sm:text-base">{heroDescription}</p>
            <div className="mt-6 flex flex-wrap gap-2 text-xs uppercase tracking-[0.2em] text-slate-200/80">
              <Badge variant="secondary" className="border-0 bg-white/14 text-slate-100">
                {fetchState.status === "loading" ? "Refreshing" : fetchState.status === "error" ? "Degraded" : "Live"}
              </Badge>
              {introspection?.snapshot_fidelity ? (
                <Badge variant="secondary" className="border-0 bg-white/10 text-slate-100">
                  Fidelity {introspection.snapshot_fidelity}
                </Badge>
              ) : null}
              {tokenAccounting?.compiled_context?.approx_tokens ? (
                <Badge variant="secondary" className="border-0 bg-white/10 text-slate-100">
                  Context {formatTokenCount(tokenAccounting.compiled_context.approx_tokens, true)}
                </Badge>
              ) : null}
              {recallEvent?.result_count ? (
                <Badge variant="secondary" className="border-0 bg-white/10 text-slate-100">
                  Memory {formatCount(recallEvent.result_count)} hits
                </Badge>
              ) : null}
            </div>
          </div>
          <div className="flex flex-col gap-3 rounded-[1.6rem] border border-white/14 bg-white/7 p-4 backdrop-blur">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.3em] text-slate-300/80">Immediate action</div>
                <div className="mt-1 text-sm text-slate-100/80">Refresh the shell or drop into the original trace.</div>
              </div>
              <button
                type="button"
                onClick={() => setRefreshSeed((value) => value + 1)}
                className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-2 text-xs uppercase tracking-[0.2em] text-slate-100 transition hover:bg-white/16"
              >
                <RefreshCw className={`size-4 ${fetchState.status === "loading" ? "animate-spin" : ""}`} />
                Refresh
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
              <div className="rounded-[1.35rem] border border-white/10 bg-black/12 px-4 py-3">
                <div className="text-[11px] uppercase tracking-[0.24em] text-slate-300/80">Attention</div>
                <div className="mt-2 text-2xl font-semibold">{formatCount(attentionItems.length)}</div>
                <div className="mt-1 text-xs text-slate-200/72">Signals asking for inspection</div>
              </div>
              <div className="rounded-[1.35rem] border border-white/10 bg-black/12 px-4 py-3">
                <div className="text-[11px] uppercase tracking-[0.24em] text-slate-300/80">Timeline</div>
                <div className="mt-2 text-2xl font-semibold">{formatCount(timeline.length)}</div>
                <div className="mt-1 text-xs text-slate-200/72">Recent runtime events captured</div>
              </div>
              <div className="rounded-[1.35rem] border border-white/10 bg-black/12 px-4 py-3">
                <div className="text-[11px] uppercase tracking-[0.24em] text-slate-300/80">Runs</div>
                <div className="mt-2 text-2xl font-semibold">{formatCount(introspection?.run_history?.length)}</div>
                <div className="mt-1 text-xs text-slate-200/72">Run history visible from this lens</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.95fr]">
        <VesperPanel
          kicker="Attention queue"
          title="What needs attention now"
          description="Signals are derived from the active runtime trace. When the queue is empty, Control Room says so plainly instead of inventing noise."
        >
          <div className="space-y-3">
            {attentionItems.length === 0 ? (
              <div className="rounded-[1.5rem] border border-border/60 bg-background/80 px-4 py-4 text-sm leading-6 text-muted-foreground">
                No explicit runtime warnings are active from the selected thread. The surface is calm, and the remaining work is about improving depth rather than reacting to failure.
              </div>
            ) : (
              attentionItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedInspectorId(item.id)}
                  className={[
                    "w-full rounded-[1.5rem] border px-4 py-4 text-left transition",
                    selectedInspectorId === item.id
                      ? "border-foreground/20 bg-foreground text-background"
                      : "border-border/60 bg-background/76 text-foreground hover:border-foreground/25",
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.24em] opacity-72">{item.label}</div>
                      <div className="mt-2 text-base font-medium">{item.title}</div>
                      <p className={selectedInspectorId === item.id ? "mt-2 text-sm leading-6 text-background/78" : "mt-2 text-sm leading-6 text-muted-foreground"}>
                        {item.description}
                      </p>
                    </div>
                    <AlertTriangle className="mt-1 size-4 shrink-0" />
                  </div>
                </button>
              ))
            )}
          </div>
        </VesperPanel>

        <VesperPanel
          kicker="Thread lens"
          title="Choose a live runtime source"
          description="Control Room can reuse the existing introspection plumbing while presenting it inside the new shell."
        >
          {threadPicker}
        </VesperPanel>
      </div>

      <VesperPanel
        kicker="Activity timeline"
        title="Recent runtime movement"
        description="This is a readable operational narrative rather than a raw log. Select any item to open the detail inspector."
      >
        {fetchState.status === "loading" && !introspection ? (
          <div className="flex items-center gap-3 rounded-[1.5rem] border border-border/60 bg-background/80 px-4 py-4 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading runtime timeline
          </div>
        ) : activityItems.length === 0 ? (
          <div className="rounded-[1.5rem] border border-border/60 bg-background/80 px-4 py-4 text-sm leading-6 text-muted-foreground">
            The selected thread did not expose timeline events yet. Use the original thread trace if deeper diagnostics are required.
          </div>
        ) : (
          <div className="space-y-3">
            {activityItems.map((item, index) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedInspectorId(item.id)}
                className={[
                  "w-full rounded-[1.5rem] border px-4 py-4 text-left transition",
                  selectedInspectorId === item.id
                    ? "border-foreground/20 bg-foreground text-background"
                    : "border-border/60 bg-background/76 text-foreground hover:border-foreground/25",
                ].join(" ")}
              >
                <div className="grid gap-3 md:grid-cols-[70px_1fr_auto] md:items-start">
                  <div className={selectedInspectorId === item.id ? "text-xs uppercase tracking-[0.24em] text-background/72" : "text-xs uppercase tracking-[0.24em] text-muted-foreground"}>
                    Step {index + 1}
                  </div>
                  <div>
                    <div className="text-base font-medium">{item.title}</div>
                    <p className={selectedInspectorId === item.id ? "mt-2 text-sm leading-6 text-background/78" : "mt-2 text-sm leading-6 text-muted-foreground"}>
                      {item.description}
                    </p>
                  </div>
                  <div className={selectedInspectorId === item.id ? "justify-self-start text-xs uppercase tracking-[0.22em] text-background/72 md:justify-self-end" : "justify-self-start text-xs uppercase tracking-[0.22em] text-muted-foreground md:justify-self-end"}>
                    {item.meta?.find((entry) => entry.label === "Tokens")?.value ?? "—"}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </VesperPanel>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <VesperPanel
          kicker="Evolution pane"
          title="Where the system can improve next"
          description="Control Room is not just about active incidents. It should also make future product surfaces obvious by surfacing live evidence from the runtime."
        >
          <div className="space-y-3">
            {evolutionItems.length === 0 ? (
              <div className="rounded-[1.5rem] border border-border/60 bg-background/80 px-4 py-4 text-sm leading-6 text-muted-foreground">
                The selected thread does not yet expose enough evidence to describe longer-horizon improvement pressure. That usually means the deeper trace exists, but the shell still needs more operational adapters.
              </div>
            ) : (
              evolutionItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedInspectorId(item.id)}
                  className={[
                    "w-full rounded-[1.5rem] border px-4 py-4 text-left transition",
                    selectedInspectorId === item.id
                      ? "border-foreground/20 bg-foreground text-background"
                      : "border-border/60 bg-background/76 text-foreground hover:border-foreground/25",
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.24em] opacity-72">{item.label}</div>
                      <div className="mt-2 text-base font-medium">{item.title}</div>
                      <p className={selectedInspectorId === item.id ? "mt-2 text-sm leading-6 text-background/78" : "mt-2 text-sm leading-6 text-muted-foreground"}>
                        {item.description}
                      </p>
                    </div>
                    <Sparkles className="mt-1 size-4 shrink-0" />
                  </div>
                </button>
              ))
            )}
          </div>
        </VesperPanel>

        <VesperPanel
          kicker="On-demand detail"
          title="Inspector behavior inside the shell"
          description="The permanent right-side inspector is the default deep detail layer on large screens. This inline section mirrors the current selection so the surface still works on smaller viewports."
        >
          {inspectorItem ? (
            <div className="space-y-4 rounded-[1.6rem] border border-border/60 bg-background/80 p-5 xl:hidden">
              <div className="text-[11px] uppercase tracking-[0.26em] text-muted-foreground">{inspectorItem.label}</div>
              <div className="font-serif text-2xl tracking-[0.02em] text-foreground">{inspectorItem.title}</div>
              <p className="text-sm leading-6 text-muted-foreground">{inspectorItem.description}</p>
            </div>
          ) : (
            <div className="rounded-[1.5rem] border border-border/60 bg-background/80 px-4 py-4 text-sm leading-6 text-muted-foreground">
              Select an attention item or timeline event to open the detail layer.
            </div>
          )}
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-[1.5rem] border border-border/60 bg-background/78 px-4 py-4">
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                <Radar className="size-4" />
                Status
              </div>
              <p className="mt-3 text-sm leading-6 text-foreground/84">
                Hero status is now derived from the selected runtime thread rather than hard-coded placeholder copy.
              </p>
            </div>
            <div className="rounded-[1.5rem] border border-border/60 bg-background/78 px-4 py-4">
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                <Waves className="size-4" />
                Activity
              </div>
              <p className="mt-3 text-sm leading-6 text-foreground/84">
                Timeline events are promoted into a readable narrative instead of staying buried inside the original diagnostics view.
              </p>
            </div>
            <div className="rounded-[1.5rem] border border-border/60 bg-background/78 px-4 py-4">
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                <BrainCircuit className="size-4" />
                Evolution
              </div>
              <p className="mt-3 text-sm leading-6 text-foreground/84">
                Memory recall, capability exposure, and token visibility can now shape future surfaces without inventing new backends first.
              </p>
            </div>
          </div>
          {selectedThreadId ? (
            <Link
              href={`/workspace/chats/${selectedThreadId}/control-room`}
              className="mt-5 inline-flex items-center gap-2 rounded-full border border-border/70 bg-background px-4 py-2 text-sm text-foreground transition hover:border-foreground/35"
            >
              <Eye className="size-4" />
              <span>Open original deep trace</span>
            </Link>
          ) : null}
        </VesperPanel>
      </div>
    </VesperShell>
  );
}
