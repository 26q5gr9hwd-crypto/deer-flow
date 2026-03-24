import { AlertTriangle, ArrowUpRight, Eye, Radar, Waves } from "lucide-react";
import Link from "next/link";

import { VesperPanel, VesperShell } from "@/components/workspace/vesper-shell";

const queues = [
  "Port the runtime truth surface into this route without keeping the old chat-first frame.",
  "Keep a hero status plane, activity, and evolution layers readable before adding dense telemetry.",
  "Use the thread-specific control room as the adapter path until the VESPER-native surface is complete.",
];

export default function ControlRoomPage() {
  return (
    <VesperShell
      eyebrow="Control Room"
      title="Operational posture"
      description="This route establishes the Control Room as a first-class surface in the shell. The live runtime inspector still exists behind a thread adapter until the deeper port lands."
      actions={[
        { href: "/workspace/chats", label: "Choose a live thread", emphasis: true },
        { href: "/workspace/home", label: "Return Home" },
      ]}
      meta={[
        { label: "Mode", value: "Placeholder" },
        { label: "Adapter", value: "Thread control room" },
      ]}
      inspectorTitle="Inspection path"
      inspector={
        <div className="space-y-5 text-sm text-muted-foreground">
          <div>
            <div className="text-[11px] uppercase tracking-[0.26em]">Live runtime truth</div>
            <p className="mt-2 leading-6">
              Open a thread from the runtime adapter, then enter its existing control room route for the current introspection view.
            </p>
          </div>
          <Link
            href="/workspace/chats"
            className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background px-4 py-2 text-foreground transition hover:border-foreground/35"
          >
            <span>Open threads</span>
            <ArrowUpRight className="size-4" />
          </Link>
        </div>
      }
    >
      <section className="rounded-[2rem] border border-border/60 bg-[linear-gradient(135deg,rgba(30,33,36,0.96),rgba(58,65,72,0.9)_55%,rgba(86,94,103,0.86))] px-6 py-7 text-slate-100 shadow-[0_30px_90px_rgba(34,38,42,0.26)]">
        <div className="max-w-3xl">
          <div className="text-[11px] uppercase tracking-[0.34em] text-slate-300/80">
            Mission console
          </div>
          <h2 className="mt-4 font-serif text-4xl tracking-[0.02em] sm:text-5xl">
            Calm hierarchy first. Investigation depth second.
          </h2>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-200/78 sm:text-base">
            UI-5 does not try to finish the operational surface. It creates the route, language, and composition so UI-6 can port live status, attention, activity, and evolution into a shell that already feels like VESPER.
          </p>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.9fr]">
        <VesperPanel
          kicker="Attention queue"
          title="What this route must grow into"
          description="The future Control Room should answer whether the system is okay, what needs attention, and where improvement pressure is building."
        >
          <div className="space-y-3">
            {queues.map((item, index) => (
              <div key={item} className="flex gap-3 border-b border-border/50 pb-3 last:border-b-0 last:pb-0">
                <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border border-border/70 bg-background text-xs text-muted-foreground">
                  {index + 1}
                </div>
                <p className="text-sm leading-6 text-foreground/88">{item}</p>
              </div>
            ))}
          </div>
        </VesperPanel>

        <VesperPanel
          kicker="Adapter path"
          title="Existing runtime remains usable"
          description="The current DeerFlow runtime is not discarded. It is demoted behind a clearer product shell."
        >
          <div className="space-y-3 text-sm">
            <Link href="/workspace/chats" className="flex items-start justify-between gap-4 border-b border-border/50 pb-3 transition hover:text-foreground last:border-b-0 last:pb-0">
              <div>
                <div className="font-medium">Threads adapter</div>
                <div className="mt-1 leading-6 text-muted-foreground">
                  Open any runtime thread and continue working without losing the existing chat plumbing.
                </div>
              </div>
              <Waves className="mt-1 size-4 shrink-0 text-muted-foreground" />
            </Link>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="font-medium">Thread control room</div>
                <div className="mt-1 leading-6 text-muted-foreground">
                  The live introspection page continues to exist inside thread routes until the full Control Room port lands.
                </div>
              </div>
              <Eye className="mt-1 size-4 shrink-0 text-muted-foreground" />
            </div>
          </div>
        </VesperPanel>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <VesperPanel kicker="Hero status" title="Status plane">
          <div className="flex items-center gap-3 text-sm leading-6 text-muted-foreground">
            <Radar className="size-4 shrink-0" />
            A single sentence summary belongs here once live data is wired.
          </div>
        </VesperPanel>
        <VesperPanel kicker="Activity" title="Timeline">
          <div className="flex items-center gap-3 text-sm leading-6 text-muted-foreground">
            <Waves className="size-4 shrink-0" />
            Recent work, runs, and drift signals should read as a calm operational narrative.
          </div>
        </VesperPanel>
        <VesperPanel kicker="Evolution" title="Improvement pressure">
          <div className="flex items-center gap-3 text-sm leading-6 text-muted-foreground">
            <AlertTriangle className="size-4 shrink-0" />
            Weak spots, recurring failures, and upgrade opportunities will surface here next.
          </div>
        </VesperPanel>
      </div>
    </VesperShell>
  );
}
