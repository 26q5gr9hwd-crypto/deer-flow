"use client";

import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BrainCircuit,
  Orbit,
  Radar,
  Sparkles,
  Waypoints,
} from "lucide-react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { VesperShell } from "@/components/workspace/vesper-shell";
import { listAgents } from "@/core/agents/api";
import type { Agent } from "@/core/agents/types";
import { getBackendBaseURL } from "@/core/config";
import { loadMemory } from "@/core/memory/api";
import type { UserMemory } from "@/core/memory/types";
import { loadModels } from "@/core/models/api";
import type { Model } from "@/core/models/types";
import { loadSkills } from "@/core/skills/api";
import type { Skill } from "@/core/skills/type";

type OngoingThread = {
  channel_name?: string;
  chat_id?: string;
  source?: string;
  thread_id?: string;
};

type RuntimeIntrospection = {
  agent_name?: string;
  model_name?: string;
  run_id?: string;
  snapshot_fidelity?: string;
  thread_id?: string;
  warnings?: string[];
  metadata?: {
    mode?: string;
    source?: string;
    step?: number;
  };
};

type AttentionSignal = {
  detail: string;
  title: string;
  tone: "alert" | "watch" | "calm";
};

async function loadOngoingThread(): Promise<OngoingThread | null> {
  const baseUrl = getBackendBaseURL();
  const response = await fetch(`${baseUrl}/api/channels/telegram/ongoing-thread`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Ongoing thread request failed with ${response.status}`);
  }

  return (await response.json()) as OngoingThread;
}

async function loadRuntimeIntrospection(
  threadId: string,
): Promise<RuntimeIntrospection> {
  const response = await fetch(`/api/runtime/threads/${threadId}/introspection`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Runtime introspection request failed with ${response.status}`);
  }

  return (await response.json()) as RuntimeIntrospection;
}

function shortId(value?: string | null) {
  if (!value) {
    return "Not available";
  }

  if (value.length <= 12) {
    return value;
  }

  return `${value.slice(0, 8)}…${value.slice(-4)}`;
}

function formatTimestamp(value?: string | null) {
  if (!value) {
    return "No recent update";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "No recent update";
  }

  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
  }).format(date);
}

function excerpt(value: string | undefined, fallback: string) {
  const text = value?.trim();

  if (!text) {
    return fallback;
  }

  if (text.length <= 160) {
    return text;
  }

  return `${text.slice(0, 157)}...`;
}

function buildAttentionSignals(args: {
  customSkillCount: number;
  memory: UserMemory | undefined;
  ongoingThread: OngoingThread | null | undefined;
  runtime: RuntimeIntrospection | undefined;
}): AttentionSignal[] {
  const signals: AttentionSignal[] = [];
  const warnings = args.runtime?.warnings ?? [];

  warnings.slice(0, 2).forEach((warning) => {
    signals.push({
      title: "Runtime warning",
      detail: warning,
      tone: "alert",
    });
  });

  if (!args.ongoingThread?.thread_id) {
    signals.push({
      title: "Primary channel is quiet",
      detail:
        "Telegram is not currently mapped to an active thread, so the live workflow preview cannot anchor itself to a running conversation.",
      tone: "watch",
    });
  }

  if ((args.memory?.facts.length ?? 0) === 0) {
    signals.push({
      title: "Memory evidence is still thin",
      detail:
        "The memory endpoint is reachable, but there are no durable fact rows yet. Home should surface this as an operational truth rather than hiding it.",
      tone: "watch",
    });
  }

  if (args.customSkillCount < 3) {
    signals.push({
      title: "Custom capability layer is still narrow",
      detail:
        "Enabled public skills are available, but the custom VESPER skill layer is still relatively small for a system intended to steer itself.",
      tone: "calm",
    });
  }

  if (signals.length === 0) {
    signals.push({
      title: "No acute blocker is surfacing",
      detail:
        "Runtime introspection is calm enough that Home can stay focused on steering, not firefighting.",
      tone: "calm",
    });
  }

  return signals.slice(0, 3);
}

function AttentionItem({ signal }: { signal: AttentionSignal }) {
  const toneClass =
    signal.tone === "alert"
      ? "border-amber-300/35 bg-amber-200/10 text-amber-50"
      : signal.tone === "watch"
        ? "border-stone-300/18 bg-white/8 text-stone-50"
        : "border-emerald-300/20 bg-emerald-200/10 text-stone-50";

  return (
    <div className={`rounded-[1.35rem] border px-4 py-4 ${toneClass}`}>
      <div className="text-[11px] uppercase tracking-[0.28em] text-stone-300/72">
        {signal.title}
      </div>
      <p className="mt-2 text-sm leading-6 text-stone-100/88">{signal.detail}</p>
    </div>
  );
}

function FocusMetric({
  icon: Icon,
  label,
  value,
  detail,
}: {
  detail: string;
  icon: typeof Orbit;
  label: string;
  value: string;
}) {
  return (
    <div className="border-b border-border/40 pb-4 last:border-b-0 last:pb-0">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full border border-border/60 bg-background/80 text-muted-foreground">
          <Icon className="size-4" />
        </div>
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            {label}
          </div>
          <div className="mt-1 text-base font-medium text-foreground">{value}</div>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{detail}</p>
        </div>
      </div>
    </div>
  );
}

function EvolutionItem({
  label,
  value,
  detail,
}: {
  detail: string;
  label: string;
  value: string;
}) {
  return (
    <div className="border-l border-border/70 pl-4">
      <div className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 text-2xl font-serif tracking-[0.02em] text-foreground">
        {value}
      </div>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{detail}</p>
    </div>
  );
}

export default function HomePage() {
  const ongoingThreadQuery = useQuery({
    queryKey: ["vesper-home", "ongoing-thread"],
    queryFn: loadOngoingThread,
    refetchInterval: 30_000,
    staleTime: 10_000,
  });

  const runtimeQuery = useQuery({
    queryKey: ["vesper-home", "runtime", ongoingThreadQuery.data?.thread_id],
    queryFn: () => loadRuntimeIntrospection(ongoingThreadQuery.data!.thread_id!),
    enabled: Boolean(ongoingThreadQuery.data?.thread_id),
    refetchInterval: 30_000,
    staleTime: 10_000,
  });

  const memoryQuery = useQuery({
    queryKey: ["vesper-home", "memory"],
    queryFn: loadMemory,
    refetchInterval: 60_000,
    staleTime: 20_000,
  });

  const skillsQuery = useQuery({
    queryKey: ["vesper-home", "skills"],
    queryFn: loadSkills,
    refetchInterval: 60_000,
    staleTime: 20_000,
  });

  const agentsQuery = useQuery({
    queryKey: ["vesper-home", "agents"],
    queryFn: listAgents,
    refetchInterval: 60_000,
    staleTime: 20_000,
  });

  const modelsQuery = useQuery({
    queryKey: ["vesper-home", "models"],
    queryFn: loadModels,
    refetchInterval: 60_000,
    staleTime: 20_000,
  });

  const ongoingThread = ongoingThreadQuery.data;
  const runtime = runtimeQuery.data;
  const memory = memoryQuery.data;
  const skills = skillsQuery.data ?? [];
  const agents = agentsQuery.data ?? [];
  const models = modelsQuery.data ?? [];

  const enabledSkills = skills.filter((skill) => skill.enabled);
  const customSkills = enabledSkills.filter((skill) => skill.category === "custom");
  const publicSkills = enabledSkills.filter((skill) => skill.category === "public");
  const attentionSignals = buildAttentionSignals({
    customSkillCount: customSkills.length,
    memory,
    ongoingThread,
    runtime,
  });

  const heroState = runtime?.warnings?.length
    ? `${runtime.warnings.length} active signal${runtime.warnings.length === 1 ? "" : "s"}`
    : ongoingThread?.thread_id
      ? "Operational"
      : "Quiet";

  const heroSummary = runtime?.warnings?.length
    ? "Runtime introspection is surfacing live warnings, so Home should keep attention visible before anything deeper."
    : ongoingThread?.thread_id
      ? "The shell is anchored to a live Telegram thread and a runnable introspection path."
      : "The shell is calm, but there is no active Telegram thread mapped right now.";

  const memoryPreview = excerpt(
    memory?.user.topOfMind.summary ||
      memory?.user.workContext.summary ||
      memory?.history.recentMonths.summary,
    "Memory summaries will appear here once VESPER starts carrying more durable context forward.",
  );

  const workflowPreview = runtime?.warnings?.length
    ? runtime.warnings[0]!
    : ongoingThread?.thread_id
      ? `Thread ${shortId(ongoingThread.thread_id)} is available as the current runtime anchor.`
      : "No active workflow anchor is available yet from the Telegram bridge.";

  const liveThreadHref = ongoingThread?.thread_id
    ? `/workspace/chats/${ongoingThread.thread_id}`
    : "/workspace/chats";

  const activeAgent: Agent | undefined = agents[0];
  const currentModel = runtime?.model_name ?? activeAgent?.model ?? "Unknown";
  const modelRegistry = models as Model[];
  const skillRegistry = skills as Skill[];

  return (
    <VesperShell
      eyebrow="Home"
      title="VESPER"
      description="Daily orientation and steering. State, attention, agency, and depth are visible here before chat or thread history takes over."
      actions={[
        {
          href: "/workspace/control-room",
          label: "Open Control Room",
          emphasis: true,
        },
        {
          href: liveThreadHref,
          label: ongoingThread?.thread_id ? "Open live thread" : "Open threads",
        },
      ]}
      meta={[
        { label: "State", value: heroState },
        {
          label: "Channel",
          value: ongoingThread?.channel_name
            ? ongoingThread.channel_name.charAt(0).toUpperCase() + ongoingThread.channel_name.slice(1)
            : "Standby",
        },
      ]}
      inspectorTitle="Live evidence"
      inspector={
        <div className="space-y-5 text-sm leading-6 text-muted-foreground">
          <div>
            <div className="text-[11px] uppercase tracking-[0.26em]">Runtime anchor</div>
            <p className="mt-2">
              {ongoingThread?.thread_id
                ? `Telegram is currently mapped to thread ${shortId(ongoingThread.thread_id)}.`
                : "Telegram is not currently mapped to a live thread."}
            </p>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-[0.26em]">Memory freshness</div>
            <p className="mt-2">Last memory update: {formatTimestamp(memory?.lastUpdated)}</p>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-[0.26em]">Capability layer</div>
            <p className="mt-2">
              {enabledSkills.length} enabled skills across {skillRegistry.length} visible entries.
            </p>
          </div>
        </div>
      }
    >
      <section className="relative overflow-hidden rounded-[2.35rem] border border-border/60 bg-[linear-gradient(135deg,rgba(24,23,21,0.97),rgba(53,50,45,0.92)_48%,rgba(92,84,67,0.88))] px-6 py-6 text-stone-100 shadow-[0_34px_90px_rgba(34,28,20,0.26)] md:px-8 md:py-8">
        <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[42%] bg-[radial-gradient(circle_at_center,rgba(255,238,195,0.18),transparent_58%)] xl:block" />
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.88fr)]">
          <div className="relative max-w-3xl">
            <div className="text-[11px] uppercase tracking-[0.34em] text-stone-300/76">
              Daily orientation
            </div>
            <h2 className="mt-4 max-w-3xl font-serif text-4xl tracking-[0.02em] text-stone-50 sm:text-5xl">
              A calm surface for what matters now, what needs steering, and where the system is changing.
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-stone-200/78 sm:text-base">
              {heroSummary}
            </p>
            <div className="mt-6 flex flex-wrap gap-3 text-sm">
              <Link
                href="/workspace/control-room"
                className="inline-flex items-center gap-2 rounded-full border border-stone-200/18 bg-stone-100/12 px-4 py-2 text-stone-100 transition hover:bg-stone-100/18"
              >
                <span>Open Control Room</span>
                <ArrowUpRight className="size-4" />
              </Link>
              <Link
                href={liveThreadHref}
                className="inline-flex items-center gap-2 rounded-full border border-stone-200/16 px-4 py-2 text-stone-100/84 transition hover:bg-stone-100/10"
              >
                <span>{ongoingThread?.thread_id ? "Open live thread" : "Open threads"}</span>
                <ArrowUpRight className="size-4" />
              </Link>
            </div>
          </div>

          <div className="relative flex flex-col gap-3 rounded-[1.9rem] border border-white/10 bg-black/12 p-4 backdrop-blur-sm">
            <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.28em] text-stone-300/70">
                  Attention strip
                </div>
                <div className="mt-1 text-sm text-stone-100/86">
                  Real runtime and memory cues, not decorative KPIs.
                </div>
              </div>
              <AlertTriangle className="size-4 text-stone-200/72" />
            </div>
            <div className="space-y-3">
              {attentionSignals.map((signal) => (
                <AttentionItem key={`${signal.title}-${signal.detail}`} signal={signal} />
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.14fr)_minmax(320px,0.92fr)]">
          <div className="rounded-[1.9rem] border border-white/10 bg-white/8 p-5 backdrop-blur-sm">
            <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
              <div>
                <div className="text-[11px] uppercase tracking-[0.28em] text-stone-300/70">
                  Active focus
                </div>
                <div className="mt-1 text-sm text-stone-100/84">
                  The live operating thread, model posture, and run depth all stay visible here.
                </div>
              </div>
              <Activity className="size-4 text-stone-200/72" />
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <FocusMetric
                icon={Orbit}
                label="Current agent"
                value={runtime?.agent_name ?? activeAgent?.name ?? "Unavailable"}
                detail={
                  activeAgent?.description ??
                  "No agent description is currently available from the agents endpoint."
                }
              />
              <FocusMetric
                icon={Radar}
                label="Run depth"
                value={
                  typeof runtime?.metadata?.step === "number"
                    ? `Step ${runtime.metadata.step.toLocaleString()}`
                    : "Awaiting run data"
                }
                detail={
                  runtime?.snapshot_fidelity
                    ? `Snapshot fidelity is ${runtime.snapshot_fidelity}.`
                    : "The introspection route has not returned snapshot fidelity yet."
                }
              />
              <FocusMetric
                icon={Sparkles}
                label="Thinking model"
                value={currentModel}
                detail={
                  runtime?.metadata?.mode
                    ? `Runtime mode is ${runtime.metadata.mode}.`
                    : "The model is visible, but the runtime mode is not currently attached."
                }
              />
              <FocusMetric
                icon={Waypoints}
                label="Workflow anchor"
                value={shortId(ongoingThread?.thread_id)}
                detail={
                  ongoingThread?.source
                    ? `Thread mapping source: ${ongoingThread.source}.`
                    : "No workflow anchor is being surfaced from Telegram right now."
                }
              />
            </div>
          </div>

          <div className="rounded-[1.9rem] border border-white/10 bg-black/12 p-5 backdrop-blur-sm">
            <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
              <div>
                <div className="text-[11px] uppercase tracking-[0.28em] text-stone-300/70">
                  Compact memory and workflow preview
                </div>
                <div className="mt-1 text-sm text-stone-100/84">
                  A quick look at what VESPER knows and what the current workflow anchor is doing.
                </div>
              </div>
              <BrainCircuit className="size-4 text-stone-200/72" />
            </div>
            <div className="mt-4 space-y-4">
              <div className="rounded-[1.4rem] border border-white/10 bg-white/7 p-4">
                <div className="text-[11px] uppercase tracking-[0.22em] text-stone-300/70">
                  Memory preview
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-stone-100/84">
                  <span>{memory?.facts.length ?? 0} fact rows</span>
                  <span>Updated {formatTimestamp(memory?.lastUpdated)}</span>
                </div>
                <p className="mt-3 text-sm leading-6 text-stone-200/80">{memoryPreview}</p>
              </div>
              <div className="rounded-[1.4rem] border border-white/10 bg-white/7 p-4">
                <div className="text-[11px] uppercase tracking-[0.22em] text-stone-300/70">
                  Workflow preview
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-stone-100/84">
                  <span>Run {shortId(runtime?.run_id)}</span>
                  <span>Source {runtime?.metadata?.source ?? ongoingThread?.source ?? "Unknown"}</span>
                </div>
                <p className="mt-3 text-sm leading-6 text-stone-200/80">{workflowPreview}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[2rem] border border-border/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.78),rgba(247,243,236,0.88))] p-6 shadow-[0_18px_44px_rgba(46,38,28,0.08)] dark:bg-[linear-gradient(180deg,rgba(28,32,36,0.9),rgba(20,24,28,0.96))] dark:shadow-[0_24px_60px_rgba(8,12,16,0.32)] md:p-7">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.12fr)_minmax(300px,0.88fr)]">
          <div>
            <div className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
              System evolution
            </div>
            <h3 className="mt-3 max-w-2xl font-serif text-3xl tracking-[0.02em] text-foreground">
              Capability growth should stay legible, grounded, and close to the live system.
            </h3>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">
              Home should not guess at improvement. It should point to real surfaces that are maturing: the skill layer,
              the model registry, the memory stack, and the operational shell itself.
            </p>
            <div className="mt-6 grid gap-5 md:grid-cols-3">
              <EvolutionItem
                label="Enabled skills"
                value={enabledSkills.length.toString()}
                detail={`${customSkills.length} custom and ${publicSkills.length} public skills are currently enabled.`}
              />
              <EvolutionItem
                label="Model registry"
                value={modelRegistry.length.toString()}
                detail="Available model options are visible from the runtime API, which keeps the shell tied to real capacity."
              />
              <EvolutionItem
                label="Agents configured"
                value={agents.length.toString()}
                detail="The shell can surface how many durable operators actually exist instead of implying a larger system than is there."
              />
            </div>
          </div>

          <div className="rounded-[1.7rem] border border-border/70 bg-background/80 p-5">
            <div className="text-[11px] uppercase tracking-[0.26em] text-muted-foreground">
              Agency paths
            </div>
            <div className="mt-4 space-y-4 text-sm">
              <Link
                href="/workspace/control-room"
                className="flex items-start justify-between gap-4 border-b border-border/60 pb-4 transition hover:text-foreground last:border-b-0 last:pb-0"
              >
                <div>
                  <div className="font-medium text-foreground">Control Room</div>
                  <div className="mt-1 leading-6 text-muted-foreground">
                    Move from orientation into runtime truth, inspection, and intervention.
                  </div>
                </div>
                <ArrowUpRight className="mt-1 size-4 shrink-0 text-muted-foreground" />
              </Link>
              <Link
                href="/workspace/memory"
                className="flex items-start justify-between gap-4 border-b border-border/60 pb-4 transition hover:text-foreground last:border-b-0 last:pb-0"
              >
                <div>
                  <div className="font-medium text-foreground">Memory</div>
                  <div className="mt-1 leading-6 text-muted-foreground">
                    Inspect ingestion, retrieval, compression, confidence, and drift as a first-class system surface.
                  </div>
                </div>
                <ArrowUpRight className="mt-1 size-4 shrink-0 text-muted-foreground" />
              </Link>
              <Link
                href="/workspace/settings"
                className="flex items-start justify-between gap-4 transition hover:text-foreground"
              >
                <div>
                  <div className="font-medium text-foreground">Settings</div>
                  <div className="mt-1 leading-6 text-muted-foreground">
                    Tune durable behavior, approvals, memory policy, and capability access without dropping into config files.
                  </div>
                </div>
                <ArrowUpRight className="mt-1 size-4 shrink-0 text-muted-foreground" />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </VesperShell>
  );
}
