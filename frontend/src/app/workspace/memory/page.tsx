"use client";

import type { LucideIcon } from "lucide-react";
import {
  Archive,
  ArrowRight,
  BrainCircuit,
  Clock3,
  Database,
  FileSearch,
  GitBranch,
 Radar,
  RefreshCw,
  Scale,
  Search,
  ShieldCheck,
  Sparkles,
  TimerReset,
} from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { VesperPanel, VesperShell } from "@/components/workspace/vesper-shell";

type MemoryNode = {
  id:
    | "overview"
    | "ingestion"
    | "extraction"
    | "storage"
    | "retrieval"
    | "confidence"
    | "compression"
    | "skill-formation"
    | "drift";
  title: string;
  icon: LucideIcon;
  strap: string;
  summary: string;
  freshness: string;
  confidence: string;
  status: string;
  whatItMeans: string;
  evidence: { label: string; value: string; note: string }[];
  cues: string[];
  questions: string[];
};

const nodes: MemoryNode[] = [
  {
    id: "overview",
    title: "Memory overview",
    icon: BrainCircuit,
    strap: "System surface",
    summary:
      "The first self-knowledge slice treats memory as a navigable subsystem instead of a hidden implementation detail. The page is structured as nodes plus an inspector so future Runtime, Skills, and Tools surfaces can follow the same pattern.",
    freshness: "Route-level foundation",
    confidence: "High",
    status: "Ready for deeper evidence wiring",
    whatItMeans:
      "This overview explains the memory stack in product language, highlights where evidence lives, and keeps freshness and trust visible without pretending the system map is complete.",
    evidence: [
      {
        label: "Architecture direction",
        value: "ACE/VESPER docs",
        note:
          "The design docs make Memory the recommended first self-knowledge slice and call for evidence, freshness, and confidence cues.",
      },
      {
        label: "Shell foundation",
        value: "frontend/src/app/workspace/memory/page.tsx",
        note:
          "This route proves that Memory is first-class in the VESPER shell rather than buried under generic settings.",
      },
      {
        label: "Pattern to reuse",
        value: "Node + inspector",
        note:
          "Each node can open richer proofs, weak spots, and next actions in the right-side rail.",
      },
    ],
    cues: [
      "Memory now has its own route inside the shell.",
      "Evidence cards reveal where the current model comes from.",
      "Inspector behavior is already wired for future subsystem surfaces.",
    ],
    questions: [
      "Which memory subarea is least grounded right now?",
      "What evidence should be attached before this surface becomes fully live?",
      "Which UI primitive here should Runtime reuse next?",
    ],
  },
  {
    id: "ingestion",
    title: "Ingestion",
    icon: Radar,
    strap: "What enters the stack",
    summary:
      "Ingestion is where raw conversation turns, signals, and runtime context first enter the memory pipeline. The system should make that intake visible before anything is summarized or trusted.",
    freshness: "Grounded in current backend files",
    confidence: "Medium-high",
    status: "Backed by live pipeline references",
    whatItMeans:
      "The intake layer decides which events are worth remembering at all. It is the first place to look when the system feels blind or overly noisy.",
    evidence: [
      {
        label: "Primary pipeline",
        value: "backend/src/agents/memory/updater.py",
        note:
          "The updater describes a unified extraction pipeline that processes user and assistant turns asynchronously in the background.",
      },
      {
        label: "Policy shape",
        value: "Immediate + debounced writes",
        note:
          "The file documents a two-layer policy so not every event is handled with the same urgency.",
      },
      {
        label: "Signals to watch",
        value: "Feedback + corrections",
        note:
          "Feedback detection is part of the extraction side output, making corrections part of the intake story.",
      },
    ],
    cues: [
      "Evidence cue: async background intake keeps response latency separate from memory writes.",
      "Freshness cue: grounded in the current updater implementation, not only in design prose.",
      "Confidence cue: medium-high because the flow is clear, but the UI still needs live event counts.",
    ],
    questions: [
      "What qualifies for immediate write versus debounced write?",
      "How much noisy input is filtered before extraction?",
      "Which channels currently feed the pipeline directly?",
    ],
  },
  {
    id: "extraction",
    title: "Extraction",
    icon: FileSearch,
    strap: "What becomes structured",
    summary:
      "Extraction is the shaping layer. It turns conversation turns into typed memory units like facts, entities, relations, corrections, and feedback metadata.",
    freshness: "Grounded in updater v3.x comments and structure",
    confidence: "High",
    status: "Strong evidence",
    whatItMeans:
      "If ingestion is the intake door, extraction is the classification room. This is where raw dialogue becomes something the system can search, revise, and consolidate.",
    evidence: [
      {
        label: "Typed outputs",
        value: "Facts, entities, relations, corrections",
        note:
          "The updater file explicitly describes structured output that is written into Hindsight retain\(\) flows.",
      },
      {
        label: "Feedback side output",
        value: "feedback_detected",
        note:
          "The pipeline tracks feedback metadata so dissatisfaction and correction can feed later memory evolution.",
      },
      {
        label: "Unified extraction",
        value: "User + assistant turns",
        note:
          "The pipeline no longer treats the conversation as one-sided input. Both sides shape memory.",
      },
    ],
    cues: [
      "Evidence cue: structured extraction is visible in current backend implementation notes.",
      "Freshness cue: the route references the live file path used by the running system.",
      "Confidence cue: high because the extraction contract is explicit even before the UI shows run-level traces.",
    ],
    questions: [
      "Which extracted types should be surfaced directly in the UI?",
      "Where should correction-heavy turns become visible to Daniel?",
      "How should extraction failures surface in Control Room later?",
    ],
  },
  {
    id: "storage",
    title: "Storage",
    icon: Database,
    strap: "Where memory lives",
    summary:
      "Storage should explain the layered truth model, not just list databases. VESPER currently uses Hindsight-backed episodic memory, skills on the filesystem, and supporting docs that describe the long-term memory architecture.",
    freshness: "Mixed live + documented",
    confidence: "Medium",
    status: "Needs direct runtime metrics later",
    whatItMeans:
      "A good storage surface should tell Daniel where each kind of knowledge lives and why. It should make the difference between episodic records, distilled skills, and operational state legible.",
    evidence: [
      {
        label: "Episodic layer",
        value: "Hindsight retain\(\)",
        note:
          "The updater comments describe Hindsight as the storage target for typed memory units.",
      },
      {
        label: "Skill layer",
        value: "backend/src/skills/memory-management/SKILL.md",
        note:
          "The skills directory shows memory knowledge also exists as distilled procedural guidance, not only as raw episodes.",
      },
      {
        label: "Design reference",
        value: "backend/docs/MEMORY_IMPROVEMENTS.md",
        note:
          "Architecture notes still matter because they explain why the system separates storage concerns.",
      },
    ],
    cues: [
      "Evidence cue: storage is tied to actual files and architectural docs.",
      "Freshness cue: medium because the UI still lacks direct counts and health checks from runtime.",
      "Confidence cue: storage is explainable now, but live proofs should follow in the next iteration.",
    ],
    questions: [
      "Where do episodes end and skills begin?",
      "Which storage layer should Daniel inspect first when something feels wrong?",
      "What runtime counters belong here later?",
    ],
  },
  {
    id: "retrieval",
    title: "Retrieval",
    icon: Search,
    strap: "How memory comes back",
    summary:
      "Retrieval determines whether the system recalls the right things at the right time. It should expose how context is assembled and where search quality can degrade.",
    freshness: "Grounded in middleware references",
    confidence: "Medium-high",
    status: "Good conceptual grounding, thin live proofs",
    whatItMeans:
      "Retrieval is the practical face of memory. If good knowledge exists but does not return when needed, the memory stack still fails the user.",
    evidence: [
      {
        label: "Context assembly",
        value: "backend/src/agents/middlewares/vesper_context_middleware.py",
        note:
          "The middleware file is the obvious runtime hook for what gets injected back into the system during use.",
      },
      {
        label: "Search policy",
        value: "Memory-aware retrieval path",
        note:
          "The architecture notes repeatedly frame retrieval as the layer that must stay grounded and cheap by default.",
      },
      {
        label: "User-facing implication",
        value: "Recall quality",
        note:
          "This is where Daniel should eventually see why the system remembered something and how recently it was verified.",
      },
    ],
    cues: [
      "Evidence cue: retrieval is linked to the live middleware responsible for context assembly.",
      "Freshness cue: current grounding is real, but the route still needs actual retrieval traces or examples.",
      "Confidence cue: medium-high because the boundary is clear even before trace panels exist.",
    ],
    questions: [
      "What got retrieved for the latest turn?",
      "Which memory units were ignored and why?",
      "How should retrieval explain itself in plain language?",
    ],
  },
  {
    id: "confidence",
    title: "Confidence",
    icon: ShieldCheck,
    strap: "How trust is signaled",
    summary:
      "Confidence is the honesty layer. It tells Daniel whether memory is verified, recent, uncertain, or drifting instead of pretending all recalled knowledge is equally trustworthy.",
    freshness: "Design-led with clear runtime anchors",
    confidence: "Medium",
    status: "Visible cues implemented, live scoring still thin",
    whatItMeans:
      "A self-knowledge surface becomes credible when it can admit uncertainty. Confidence cues are how Memory avoids looking like a decorative map.",
    evidence: [
      {
        label: "UI contract",
        value: "Freshness + confidence badges",
        note:
          "This page now makes trust an explicit part of each node card and inspector section.",
      },
      {
        label: "Runtime anchor",
        value: "Feedback + correction metadata",
        note:
          "The extraction pipeline already records signals that can later feed trust scoring.",
      },
      {
        label: "Design direction",
        value: "Evidence before confidence",
        note:
          "Confidence is shown alongside grounding cues so the UI does not overclaim precision.",
      },
    ],
    cues: [
      "Evidence cue: confidence is tied to real sources like correction and feedback metadata.",
      "Freshness cue: the current UI labels which parts are foundational versus fully grounded.",
      "Confidence cue: intentionally medium until live runtime scoring is wired in.",
    ],
    questions: [
      "What would make a memory node feel truly verified?",
      "Which trust signals should be visible by default?",
      "How should stale evidence degrade confidence over time?",
    ],
  },
  {
    id: "compression",
    title: "Compression",
    icon: Archive,
    strap: "How the system stays lean",
    summary:
      "Compression is where raw history becomes lighter-weight summaries, policies, and memory management tactics. It protects token budgets without turning the system blind.",
    freshness: "Grounded by memory-management skill + docs",
    confidence: "Medium-high",
    status: "Concept strong, traces still needed",
    whatItMeans:
      "This surface should show how VESPER avoids drowning in its own history. Compression is both a performance strategy and a product trust problem.",
    evidence: [
      {
        label: "Operational guidance",
        value: "backend/src/skills/memory-management/SKILL.md",
        note:
          "The memory-management skill exists as a real knowledge artifact and is a natural evidence source for compression behavior.",
      },
      {
        label: "Architecture reference",
        value: "backend/docs/MEMORY_IMPROVEMENTS_SUMMARY.md",
        note:
          "The memory docs treat summarization and pruning as necessary, not optional polish.",
      },
      {
        label: "UI implication",
        value: "Compression should show tradeoffs",
        note:
          "Daniel should be able to see what was condensed and what risk that introduces.",
      },
    ],
    cues: [
      "Evidence cue: compression is tied to a real skill artifact, not just speculative copy.",
      "Freshness cue: current docs are available, but the UI still needs recent compaction events or counts.",
      "Confidence cue: medium-high because the system intent is clear and documented.",
    ],
    questions: [
      "What was summarized recently?",
      "What quality loss is acceptable when memory is compressed?",
      "Where should compression risks appear in Control Room?",
    ],
  },
  {
    id: "skill-formation",
    title: "Skill formation",
    icon: Sparkles,
    strap: "How memory becomes capability",
    summary:
      "Skill formation is the bridge from repeated experience to durable behavior. It is where memory stops being only recall and starts becoming competence.",
    freshness: "Grounded in the live skills directory",
    confidence: "High",
    status: "Strong product fit",
    whatItMeans:
      "This is one of the most VESPER-native parts of the surface because it turns memory into something that can change how the system behaves in future work.",
    evidence: [
      {
        label: "Distilled knowledge",
        value: "backend/src/skills/memory-management/SKILL.md",
        note:
          "The skills directory is the clearest proof that memory can become reusable procedural knowledge.",
      },
      {
        label: "Adjacent support",
        value: "backend/src/skills/codebase-awareness/SKILL.md",
        note:
          "Codebase awareness shows the same pattern applied to another knowledge domain, which supports the broader subsystem vision.",
      },
      {
        label: "Future UI role",
        value: "Memory to Skills handoff",
        note:
          "This node should later connect directly to the Skills route so Daniel can see what learning became durable.",
      },
    ],
    cues: [
      "Evidence cue: skills already exist on disk as real artifacts.",
      "Freshness cue: the live repository confirms this is more than a design ambition.",
      "Confidence cue: high because the behavior change path is concrete and inspectable.",
    ],
    questions: [
      "Which repeated patterns deserve promotion into skills?",
      "How should the UI show proposed versus active skills?",
      "What failures should block automatic promotion?",
    ],
  },
  {
    id: "drift",
    title: "Drift",
    icon: TimerReset,
    strap: "Where memory weakens",
    summary:
      "Drift is where memory becomes stale, contradictory, or misleading. A real self-knowledge surface should surface decay and uncertainty, not only healthy stories.",
    freshness: "Partly grounded, partly design-forward",
    confidence: "Medium",
    status: "Critical future panel",
    whatItMeans:
      "Drift is the honesty test for the whole explorer. If the UI cannot reveal weak spots, then the system map is decorative rather than operational.",
    evidence: [
      {
        label: "Known need",
        value: "Memory architecture and improvement docs",
        note:
          "The design material repeatedly treats drift, staleness, and contradictory memory as real system risks.",
      },
      {
        label: "Current runtime anchors",
        value: "Corrections + feedback metadata",
        note:
          "Existing correction signals can later become the first live drift indicators.",
      },
      {
        label: "Operator implication",
        value: "Needs escalation path",
        note:
          "Drift should eventually surface to Control Room when weak spots become operationally important.",
      },
    ],
    cues: [
      "Evidence cue: drift is supported by architecture references and existing correction signals.",
      "Freshness cue: still medium because the route needs live incidents and weak-spot counts.",
      "Confidence cue: intentionally restrained until runtime hooks are exposed visually.",
    ],
    questions: [
      "Where is memory most likely to become outdated first?",
      "Which drift signals deserve red, amber, or quiet treatment?",
      "When should drift become a top-level operator concern?",
    ],
  },
];

const overviewMetrics = [
  {
    label: "Subsystems mapped",
    value: "8 + overview",
    note: "The first slice stays narrow and real instead of pretending to ship the whole final system map.",
  },
  {
    label: "Live evidence hooks",
    value: "5",
    note: "Current file and skill references ground the surface in the running repo and docs.",
  },
  {
    label: "Inspector pattern",
    value: "Active",
    note: "The right rail already behaves like a reusable detail surface for future nodes.",
  },
] as const;

export default function MemoryPage() {
  const [selectedId, setSelectedId] = useState<MemoryNode["id"]>("overview");

  const selectedNode = useMemo<MemoryNode>(
    () => nodes.find((node) => node.id === selectedId) ?? nodes[0]!,
    [selectedId],
  );

  const SelectedIcon = selectedNode.icon;

  return (
    <VesperShell
      eyebrow="Memory"
      title="Memory Explorer Foundation v1"
      description="The first self-knowledge surface inside the VESPER shell. This route makes memory a first-class subsystem, maps the core node set, and grounds each section in real files, docs, or skill artifacts where the current system already exposes them."
      actions={[
        { href: "/workspace/control-room", label: "Open Control Room", emphasis: true },
        { href: "/workspace/home", label: "Return Home" },
      ]}
      meta={[
        { label: "Surface", value: "Memory" },
        { label: "Pattern", value: "Node + inspector" },
        { label: "Grounding", value: "Docs + runtime hooks" },
      ]}
      inspectorTitle="Selected node inspector"
      inspector={
        <div className="space-y-6 text-sm text-muted-foreground">
          <div>
            <div className="flex items-center gap-2 text-foreground">
              <SelectedIcon className="size-4" />
              <span className="font-medium">{selectedNode.title}</span>
            </div>
            <p className="mt-2 leading-6">{selectedNode.whatItMeans}</p>
          </div>

          <div className="space-y-3">
            <div className="text-[11px] uppercase tracking-[0.26em]">Signals</div>
            <div className="grid gap-2">
              <div className="rounded-2xl border border-border/60 bg-background/72 p-3">
                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  <Clock3 className="size-3.5" />
                  Freshness
                </div>
                <div className="mt-2 text-sm text-foreground">{selectedNode.freshness}</div>
              </div>
              <div className="rounded-2xl border border-border/60 bg-background/72 p-3">
                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  <Scale className="size-3.5" />
                  Confidence
                </div>
                <div className="mt-2 text-sm text-foreground">{selectedNode.confidence}</div>
              </div>
            </div>
          </div>

          <div>
            <div className="text-[11px] uppercase tracking-[0.26em]">Evidence trail</div>
            <div className="mt-3 space-y-3">
              {selectedNode.evidence.map((item) => (
                <div
                  key={`${selectedNode.id}-${item.label}`}
                  className="rounded-2xl border border-border/60 bg-background/72 p-3"
                >
                  <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    {item.label}
                  </div>
                  <div className="mt-1 text-sm font-medium text-foreground">{item.value}</div>
                  <p className="mt-2 leading-6">{item.note}</p>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="text-[11px] uppercase tracking-[0.26em]">Questions this node should answer</div>
            <ul className="mt-3 space-y-2 leading-6">
              {selectedNode.questions.map((question) => (
                <li key={question} className="flex gap-2">
                  <ArrowRight className="mt-1 size-3.5 shrink-0 text-muted-foreground" />
                  <span>{question}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      }
    >
      <section className="relative overflow-hidden rounded-[2rem] border border-border/60 bg-[linear-gradient(140deg,rgba(26,29,33,0.96),rgba(40,49,55,0.92)_48%,rgba(71,87,92,0.88))] px-6 py-7 text-slate-100 shadow-[0_28px_90px_rgba(22,28,34,0.28)]">
        <div className="absolute inset-y-0 right-0 hidden w-1/2 bg-[radial-gradient(circle_at_center,rgba(163,227,255,0.16),transparent_58%)] lg:block" />
        <div className="relative grid gap-6 xl:grid-cols-[1.15fr_0.9fr]">
          <div>
            <div className="text-[11px] uppercase tracking-[0.34em] text-slate-300/78">
              Self-knowledge surface
            </div>
            <h2 className="mt-4 max-w-3xl font-serif text-4xl tracking-[0.02em] sm:text-5xl">
              Memory becomes something Daniel can inspect, question, and judge instead of a hidden subsystem.
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-200/78 sm:text-base">
              This first slice favors a real structural foundation over a decorative map. Each subarea exposes evidence hooks, freshness posture, and trust cues so the page can evolve into a grounded operator surface rather than a static concept board.
            </p>
          </div>
          <div className="grid gap-3 self-start">
            {overviewMetrics.map((metric) => (
              <div
                key={metric.label}
                className="rounded-[1.5rem] border border-white/10 bg-white/8 p-4 backdrop-blur-sm"
              >
                <div className="text-[11px] uppercase tracking-[0.24em] text-slate-300/75">
                  {metric.label}
                </div>
                <div className="mt-2 text-2xl font-semibold text-white">{metric.value}</div>
                <p className="mt-2 text-sm leading-6 text-slate-200/72">{metric.note}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <VesperPanel
        kicker="Node map"
        title="Memory overview plus eight subareas"
        description="Select a node to update both the main evidence section and the inspector rail. This is the reusable interaction pattern for future subsystem surfaces."
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {nodes.map((node) => {
            const Icon = node.icon;
            const isActive = node.id === selectedId;
            return (
              <button
                key={node.id}
                type="button"
                onClick={() => setSelectedId(node.id)}
                className={[
                  "rounded-[1.45rem] border p-4 text-left transition-all",
                  isActive
                    ? "border-foreground/35 bg-foreground text-background shadow-[0_18px_40px_rgba(70,58,37,0.14)]"
                    : "border-border/60 bg-background/78 text-foreground hover:border-foreground/20 hover:bg-background",
                ].join(" ")}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div
                      className={[
                        "inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.18em]",
                        isActive
                          ? "border-background/20 bg-background/10 text-background/80"
                          : "border-border/60 bg-background/66 text-muted-foreground",
                      ].join(" ")}
                    >
                      <Icon className="size-3.5" />
                      {node.strap}
                    </div>
                    <div className="mt-3 text-lg font-medium tracking-[0.01em]">
                      {node.title}
                    </div>
                  </div>
                  <Badge variant="secondary" className={isActive ? "bg-background/12 text-background" : ""}>
                    {node.confidence}
                  </Badge>
                </div>
                <p
                  className={[
                    "mt-3 text-sm leading-6",
                    isActive ? "text-background/82" : "text-muted-foreground",
                  ].join(" ")}
                >
                  {node.summary}
                </p>
                <div
                  className={[
                    "mt-4 flex items-center justify-between border-t pt-3 text-xs uppercase tracking-[0.18em]",
                    isActive ? "border-background/15 text-background/72" : "border-border/50 text-muted-foreground",
                  ].join(" ")}
                >
                  <span>{node.status}</span>
                  <span>{node.freshness}</span>
                </div>
              </button>
            );
          })}
        </div>
      </VesperPanel>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <VesperPanel
          kicker={selectedNode.strap}
          title={selectedNode.title}
          description={selectedNode.summary}
        >
          <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-[1.35rem] border border-border/60 bg-background/78 p-4">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    <RefreshCw className="size-3.5" />
                    Freshness
                  </div>
                  <div className="mt-3 text-sm font-medium text-foreground">
                    {selectedNode.freshness}
                  </div>
                </div>
                <div className="rounded-[1.35rem] border border-border/60 bg-background/78 p-4">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    <ShieldCheck className="size-3.5" />
                    Confidence
                  </div>
                  <div className="mt-3 text-sm font-medium text-foreground">
                    {selectedNode.confidence}
                  </div>
                </div>
                <div className="rounded-[1.35rem] border border-border/60 bg-background/78 p-4">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    <GitBranch className="size-3.5" />
                    Status
                  </div>
                  <div className="mt-3 text-sm font-medium text-foreground">
                    {selectedNode.status}
                  </div>
                </div>
              </div>

              <div className="rounded-[1.5rem] border border-border/60 bg-background/72 p-5">
                <div className="text-[11px] uppercase tracking-[0.26em] text-muted-foreground">
                  Why this node matters
                </div>
                <p className="mt-3 text-sm leading-7 text-foreground/86">
                  {selectedNode.whatItMeans}
                </p>
              </div>
            </div>

            <div className="rounded-[1.5rem] border border-border/60 bg-background/72 p-5">
              <div className="text-[11px] uppercase tracking-[0.26em] text-muted-foreground">
                Surface cues
              </div>
              <div className="mt-3 space-y-3">
                {selectedNode.cues.map((cue) => (
                  <div key={cue} className="rounded-2xl border border-border/50 bg-background/80 p-3">
                    <div className="text-sm leading-6 text-muted-foreground">{cue}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </VesperPanel>

        <VesperPanel
          kicker="Node evidence"
          title="Grounding visible by default"
          description="The first version does not fake live metrics. Instead it shows what is already grounded, where freshness is thinner, and what should become inspectable next."
        >
          <div className="space-y-3">
            {selectedNode.evidence.map((item) => (
              <div
                key={`${selectedNode.id}-evidence-${item.label}`}
                className="rounded-[1.35rem] border border-border/60 bg-background/78 p-4"
              >
                <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                  {item.label}
                </div>
                <div className="mt-2 text-sm font-medium text-foreground">{item.value}</div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.note}</p>
              </div>
            ))}
          </div>
        </VesperPanel>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <VesperPanel kicker="Evidence" title="What is real now">
          <div className="flex gap-3 text-sm leading-6 text-muted-foreground">
            <Database className="mt-1 size-4 shrink-0" />
            The explorer references actual backend files, skills, and memory docs wherever the current repo already exposes them. That keeps the surface grounded even before live counters and traces are added.
          </div>
        </VesperPanel>
        <VesperPanel kicker="Freshness" title="What is newer versus thinner">
          <div className="flex gap-3 text-sm leading-6 text-muted-foreground">
            <Clock3 className="mt-1 size-4 shrink-0" />
            Nodes declare whether they are backed by current implementation files, mixed documentation, or still waiting on runtime verification. The UI shows uncertainty instead of hiding it.
          </div>
        </VesperPanel>
        <VesperPanel kicker="Confidence" title="What the UI admits honestly">
          <div className="flex gap-3 text-sm leading-6 text-muted-foreground">
            <Scale className="mt-1 size-4 shrink-0" />
            Confidence is strongest where the running repo already makes behavior legible and weaker where the surface still needs live proofs. That honesty is part of the product, not decoration.
          </div>
        </VesperPanel>
      </div>
    </VesperShell>
  );
}
