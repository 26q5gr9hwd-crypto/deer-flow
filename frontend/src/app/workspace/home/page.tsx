import {
  Activity,
  ArrowUpRight,
  BrainCircuit,
  Radar,
  Sparkles,
  Waypoints,
} from "lucide-react";
import Link from "next/link";

import { VesperPanel, VesperShell } from "@/components/workspace/vesper-shell";

const attention = [
  "Shell v1 is now the default landing surface instead of new chat.",
  "Control Room, Home, Memory, Skills, and Settings now have dedicated routes.",
  "Legacy runtime pieces stay reachable through adapters while deeper surfaces are rebuilt.",
];

const evolution = [
  {
    title: "Control Room port",
    detail: "Move runtime truth into the new shell without inheriting the old chat-first frame.",
  },
  {
    title: "Home surface",
    detail: "Turn this orientation page into the daily steering surface with real system state.",
  },
  {
    title: "Memory and Settings",
    detail: "Replace placeholders with real evidence, policy controls, and self-knowledge structure.",
  },
];

export default function HomePage() {
  return (
    <VesperShell
      eyebrow="Home"
      title="VESPER"
      description="A calm command surface for steering the system. Chat remains available, but it no longer defines the product shell or the first decision a user sees."
      actions={[
        { href: "/workspace/control-room", label: "Open Control Room", emphasis: true },
        { href: "/workspace/workflows", label: "Inspect workflow adapters" },
      ]}
      meta={[
        { label: "State", value: "Shell v1" },
        { label: "Landing", value: "Home" },
      ]}
      inspectorTitle="Right-side inspector"
      inspector={
        <div className="space-y-5 text-sm text-muted-foreground">
          <div>
            <div className="text-[11px] uppercase tracking-[0.26em]">Current posture</div>
            <p className="mt-2 leading-6">
              The shell is intentionally ahead of the deeper product surfaces. It establishes navigation, hierarchy, and VESPER-native language without breaking existing runtime routes.
            </p>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-[0.26em]">Inspector role</div>
            <p className="mt-2 leading-6">
              Use this rail for evidence, detail, and drill-down once Home and Control Room start reading from live system data.
            </p>
          </div>
        </div>
      }
    >
      <section className="relative overflow-hidden rounded-[2rem] border border-border/60 bg-[linear-gradient(135deg,rgba(31,30,28,0.95),rgba(72,66,54,0.88)_52%,rgba(109,100,81,0.84))] px-6 py-8 text-stone-100 shadow-[0_32px_80px_rgba(44,37,27,0.28)]">
        <div className="absolute inset-y-0 right-0 hidden w-1/2 bg-[radial-gradient(circle_at_center,rgba(255,245,218,0.18),transparent_58%)] lg:block" />
        <div className="relative max-w-3xl">
          <div className="text-[11px] uppercase tracking-[0.34em] text-stone-300/80">
            Daily orientation
          </div>
          <h2 className="mt-4 font-serif text-4xl tracking-[0.02em] sm:text-5xl">
            One surface to see what matters, where the system is drifting, and what to steer next.
          </h2>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-stone-200/78 sm:text-base">
            The first viewport reads as a single composition instead of a dashboard mosaic. Attention, active focus, and system evolution each get a clear place, while deeper runtime tools stay available one click away.
          </p>
          <div className="mt-6 flex flex-wrap gap-3 text-sm">
            <Link
              href="/workspace/chats"
              className="inline-flex items-center gap-2 rounded-full border border-stone-200/20 bg-stone-100/10 px-4 py-2 text-stone-100 transition hover:bg-stone-100/16"
            >
              <span>Open threads adapter</span>
              <ArrowUpRight className="size-4" />
            </Link>
            <Link
              href="/workspace/agents"
              className="inline-flex items-center gap-2 rounded-full border border-stone-200/16 px-4 py-2 text-stone-100/88 transition hover:bg-stone-100/10"
            >
              <span>Open agents adapter</span>
              <ArrowUpRight className="size-4" />
            </Link>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.35fr_0.95fr]">
        <VesperPanel
          kicker="Attention"
          title="What needs attention now"
          description="Utility copy first. These are shell-level orientation signals, not fake metrics."
        >
          <div className="space-y-3">
            {attention.map((item, index) => (
              <div
                key={item}
                className="flex items-start gap-3 border-b border-border/50 pb-3 last:border-b-0 last:pb-0"
              >
                <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border border-border/70 bg-background/85 text-xs text-muted-foreground">
                  {index + 1}
                </div>
                <p className="text-sm leading-6 text-foreground/88">{item}</p>
              </div>
            ))}
          </div>
        </VesperPanel>

        <VesperPanel
          kicker="Active focus"
          title="Immediate steering surfaces"
          description="The shell makes the next moves obvious without forcing a jump into new chat."
        >
          <div className="space-y-3 text-sm">
            <Link href="/workspace/control-room" className="flex items-start justify-between gap-4 border-b border-border/50 pb-3 transition hover:text-foreground last:border-b-0 last:pb-0">
              <div>
                <div className="font-medium">Control Room</div>
                <div className="mt-1 leading-6 text-muted-foreground">
                  Mission console for runtime status, attention, activity, and inspection.
                </div>
              </div>
              <Radar className="mt-1 size-4 shrink-0 text-muted-foreground" />
            </Link>
            <Link href="/workspace/memory" className="flex items-start justify-between gap-4 border-b border-border/50 pb-3 transition hover:text-foreground last:border-b-0 last:pb-0">
              <div>
                <div className="font-medium">Memory</div>
                <div className="mt-1 leading-6 text-muted-foreground">
                  Foundation route for ingestion, retrieval, compression, confidence, and drift.
                </div>
              </div>
              <BrainCircuit className="mt-1 size-4 shrink-0 text-muted-foreground" />
            </Link>
            <Link href="/workspace/settings" className="flex items-start justify-between gap-4 transition hover:text-foreground">
              <div>
                <div className="font-medium">Settings</div>
                <div className="mt-1 leading-6 text-muted-foreground">
                  Durable VESPER-native categories for behavior, approvals, memory policy, and tools.
                </div>
              </div>
              <Sparkles className="mt-1 size-4 shrink-0 text-muted-foreground" />
            </Link>
          </div>
        </VesperPanel>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.15fr_1fr]">
        <VesperPanel
          kicker="Evolution"
          title="What the shell unlocks next"
          description="The shell is a foundation layer. It lowers the cost of building each deeper surface in parallel."
        >
          <div className="space-y-4">
            {evolution.map((item) => (
              <div key={item.title} className="border-l border-border/80 pl-4">
                <div className="text-sm font-medium text-foreground">{item.title}</div>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.detail}</p>
              </div>
            ))}
          </div>
        </VesperPanel>

        <VesperPanel
          kicker="Preview"
          title="Compact system preview"
          description="A placeholder preview of the memory and workflow blocks that Home will eventually summarize from live state."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-[1.4rem] border border-border/60 bg-background/72 p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Waypoints className="size-4 text-muted-foreground" />
                Workflow layer
              </div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Existing threads, runs, and agents stay usable while product surfaces move to VESPER-native routes.
              </p>
            </div>
            <div className="rounded-[1.4rem] border border-border/60 bg-background/72 p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Activity className="size-4 text-muted-foreground" />
                Memory layer
              </div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Evidence, freshness, and confidence cues land here once the Memory Explorer foundation is wired.
              </p>
            </div>
          </div>
        </VesperPanel>
      </div>
    </VesperShell>
  );
}
