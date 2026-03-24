import { CheckCircle2, ShieldCheck, SlidersHorizontal, Sparkles, Waypoints } from "lucide-react";

import { VesperPanel, VesperShell } from "@/components/workspace/vesper-shell";

const groups = [
  {
    title: "Identity and tone",
    detail: "How VESPER presents itself, how it speaks, and what it should optimize for by default.",
  },
  {
    title: "Behavior and approvals",
    detail: "What requires confirmation, what can run autonomously, and how escalation should feel.",
  },
  {
    title: "Memory policy",
    detail: "Retention, confidence, compression, and what should be treated as working memory versus durable knowledge.",
  },
  {
    title: "Workflow defaults",
    detail: "Reasonable routing and execution defaults without burying users in raw backend settings.",
  },
  {
    title: "Skills and tools access",
    detail: "Capability exposure, access boundaries, and what is enabled for different operating modes.",
  },
  {
    title: "Channels and integrations",
    detail: "Where VESPER can observe, respond, and act across the system.",
  },
  {
    title: "Advanced",
    detail: "Implementation-facing settings that should remain clearly separated from the default product experience.",
  },
] as const;

export default function SettingsPage() {
  return (
    <VesperShell
      eyebrow="Settings"
      title="Behavior and policy"
      description="The route now exists inside the shell, even before the deep settings rebuild lands. Categories are VESPER-native instead of inherited from DeerFlow leftovers."
      actions={[
        { href: "/workspace/home", label: "Return Home" },
        { href: "/workspace/workflows", label: "Open workflows", emphasis: true },
      ]}
      meta={[
        { label: "Language", value: "VESPER-native" },
        { label: "State", value: "Structured placeholder" },
      ]}
      inspectorTitle="Design rule"
      inspector={
        <p className="text-sm leading-6 text-muted-foreground">
          Unsupported or future controls should be clearly framed as upcoming. This route exists to avoid turning Settings into a wall of inherited toggles.
        </p>
      }
    >
      <VesperPanel
        kicker="Information architecture"
        title="Durable settings categories"
        description="UI-5 defines the structure now so UI-8 can fill it with real controls instead of starting from a blank slate."
      >
        <div className="grid gap-4 md:grid-cols-2">
          {groups.map((group) => (
            <div key={group.title} className="rounded-[1.4rem] border border-border/60 bg-background/72 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <SlidersHorizontal className="size-4 text-muted-foreground" />
                {group.title}
              </div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{group.detail}</p>
            </div>
          ))}
        </div>
      </VesperPanel>

      <div className="grid gap-6 md:grid-cols-3">
        <VesperPanel kicker="Plain language" title="Explain effects">
          <div className="flex gap-3 text-sm leading-6 text-muted-foreground">
            <Sparkles className="mt-1 size-4 shrink-0" />
            Settings should describe what changes behavior, not simply mirror config file keys.
          </div>
        </VesperPanel>
        <VesperPanel kicker="Approvals" title="Risk posture">
          <div className="flex gap-3 text-sm leading-6 text-muted-foreground">
            <ShieldCheck className="mt-1 size-4 shrink-0" />
            Approval gates and destructive-action boundaries need to be obvious and durable.
          </div>
        </VesperPanel>
        <VesperPanel kicker="Workflow defaults" title="Action routing">
          <div className="flex gap-3 text-sm leading-6 text-muted-foreground">
            <Waypoints className="mt-1 size-4 shrink-0" />
            Workflow and tooling defaults belong beside policies, not hidden in implementation-only views.
          </div>
        </VesperPanel>
      </div>

      <VesperPanel
        kicker="Status"
        title="What UI-5 completes"
        description="This initiative does not finish Settings. It gives the product shell a stable route, naming system, and structure."
      >
        <div className="flex gap-3 text-sm leading-6 text-muted-foreground">
          <CheckCircle2 className="mt-1 size-4 shrink-0" />
          The shell now reserves space for a durable settings experience without pretending the final controls already exist.
        </div>
      </VesperPanel>
    </VesperShell>
  );
}
