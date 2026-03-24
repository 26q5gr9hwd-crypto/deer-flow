import { ArrowUpRight, BotIcon, Sparkles, WandSparkles } from "lucide-react";
import Link from "next/link";

import { VesperPanel, VesperShell } from "@/components/workspace/vesper-shell";

export default function SkillsPage() {
  return (
    <VesperShell
      eyebrow="Skills"
      title="Capability surfaces"
      description="Skills now have a dedicated top-level route in the shell. The deeper implementation can arrive later without forcing the product to orbit the old agent views."
      actions={[
        { href: "/workspace/agents", label: "Open agents adapter", emphasis: true },
        { href: "/workspace/workflows", label: "Open workflows" },
      ]}
      meta={[
        { label: "Role", value: "Placeholder" },
        { label: "Path", value: "Adapter-backed" },
      ]}
      inspectorTitle="Why this route matters"
      inspector={
        <p className="text-sm leading-6 text-muted-foreground">
          VESPER needs a skills surface in product language so the system feels configurable and comprehensible without exposing raw implementation by default.
        </p>
      }
    >
      <VesperPanel
        kicker="Purpose"
        title="Separate capability from raw agent plumbing"
        description="The shell claims a product-level skills route now. Existing agent pages stay available while this surface grows into a clearer capability map."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-[1.5rem] border border-border/60 bg-background/72 p-5">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Sparkles className="size-4 text-muted-foreground" />
              Plain-language capabilities
            </div>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Skills should explain what VESPER can do, where confidence is high, and which capabilities still require supervision.
            </p>
          </div>
          <div className="rounded-[1.5rem] border border-border/60 bg-background/72 p-5">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <WandSparkles className="size-4 text-muted-foreground" />
              Future controls
            </div>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Enable, tune, compare, and audit capabilities without dumping users directly into implementation leftovers.
            </p>
          </div>
        </div>
      </VesperPanel>

      <VesperPanel
        kicker="Adapter"
        title="Current capability entry point"
        description="The existing agent gallery remains accessible until the dedicated Skills surface is built out."
      >
        <Link href="/workspace/agents" className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background px-4 py-2 text-sm text-foreground transition hover:border-foreground/35">
          <BotIcon className="size-4" />
          <span>Open agents adapter</span>
          <ArrowUpRight className="size-4" />
        </Link>
      </VesperPanel>
    </VesperShell>
  );
}
