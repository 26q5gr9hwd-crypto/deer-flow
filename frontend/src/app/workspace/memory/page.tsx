import { BrainCircuit, Database, Eye, Layers3, Search, ShieldCheck } from "lucide-react";

import { VesperPanel, VesperShell } from "@/components/workspace/vesper-shell";

const nodes = [
  ["Ingestion", "How signals and context first enter the memory stack."],
  ["Extraction", "What gets structured or promoted from raw runtime events."],
  ["Storage", "Where persistent memory and evidence actually live."],
  ["Retrieval", "How relevant memory returns to the system at the moment of use."],
  ["Confidence", "Freshness, trust, and certainty cues for what VESPER thinks it knows."],
  ["Compression", "Summaries and pruning layers that keep the system lightweight without going blind."],
  ["Skill formation", "What turns repeated patterns into durable capabilities."],
  ["Drift", "Where memory becomes stale, contradictory, or misleading."],
] as const;

export default function MemoryPage() {
  return (
    <VesperShell
      eyebrow="Memory"
      title="Memory explorer foundation"
      description="UI-5 establishes Memory as a first-class route and makes room for the node-and-inspector pattern. The deep evidence model arrives in the dedicated Memory initiative."
      actions={[
        { href: "/workspace/home", label: "Return Home" },
        { href: "/workspace/control-room", label: "Open Control Room", emphasis: true },
      ]}
      meta={[
        { label: "Depth", value: "Foundation" },
        { label: "Model", value: "Node + inspector" },
      ]}
      inspectorTitle="Explorer notes"
      inspector={
        <div className="space-y-5 text-sm text-muted-foreground">
          <div>
            <div className="text-[11px] uppercase tracking-[0.26em]">Why this route exists</div>
            <p className="mt-2 leading-6">
              Memory should not stay hidden behind generic settings. It needs its own navigable system surface with evidence, freshness, and confidence cues.
            </p>
          </div>
        </div>
      }
    >
      <VesperPanel
        kicker="System map"
        title="The first self-knowledge slice"
        description="This is a shell-level preview of the Memory Explorer structure. The purpose is to anchor route hierarchy and the inspector pattern before wiring live evidence."
      >
        <div className="grid gap-4 md:grid-cols-2">
          {nodes.map(([title, detail]) => (
            <div key={title} className="rounded-[1.4rem] border border-border/60 bg-background/72 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <BrainCircuit className="size-4 text-muted-foreground" />
                {title}
              </div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{detail}</p>
            </div>
          ))}
        </div>
      </VesperPanel>

      <div className="grid gap-6 lg:grid-cols-3">
        <VesperPanel kicker="Evidence" title="Grounding">
          <div className="flex gap-3 text-sm leading-6 text-muted-foreground">
            <Database className="mt-1 size-4 shrink-0" />
            Notes, incidents, docs, files, and runtime traces should become linked evidence rather than decorative labels.
          </div>
        </VesperPanel>
        <VesperPanel kicker="Freshness" title="Recency cues">
          <div className="flex gap-3 text-sm leading-6 text-muted-foreground">
            <ShieldCheck className="mt-1 size-4 shrink-0" />
            Each node should eventually reveal whether the underlying knowledge is recent, stale, or uncertain.
          </div>
        </VesperPanel>
        <VesperPanel kicker="Inspection" title="Detail rail">
          <div className="flex gap-3 text-sm leading-6 text-muted-foreground">
            <Eye className="mt-1 size-4 shrink-0" />
            The right-side inspector becomes the place for proofs, weak spots, and follow-up actions.
          </div>
        </VesperPanel>
      </div>

      <VesperPanel
        kicker="Future behavior"
        title="What the Memory route should answer"
        description="The point is not to expose raw internals. The point is to explain what VESPER knows, misses, and confuses in product language."
      >
        <div className="space-y-4 text-sm leading-6 text-muted-foreground">
          <div className="flex gap-3">
            <Search className="mt-1 size-4 shrink-0" />
            <p>Where did this knowledge come from, and how recently was it refreshed?</p>
          </div>
          <div className="flex gap-3">
            <Layers3 className="mt-1 size-4 shrink-0" />
            <p>What parts of the memory stack are healthy, and where is drift or compression causing blind spots?</p>
          </div>
        </div>
      </VesperPanel>
    </VesperShell>
  );
}
