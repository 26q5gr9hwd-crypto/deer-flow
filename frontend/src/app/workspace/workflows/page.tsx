import { ArrowUpRight, BotIcon, MessagesSquare, Waypoints } from "lucide-react";
import Link from "next/link";

import { VesperPanel, VesperShell } from "@/components/workspace/vesper-shell";

export default function WorkflowsPage() {
  return (
    <VesperShell
      eyebrow="Workflows"
      title="Workflow surfaces"
      description="This route is a thin shell-level placeholder. It gives VESPER-native positioning to the workflow layer while existing runtime tools remain reachable through adapters."
      actions={[
        { href: "/workspace/chats", label: "Open threads", emphasis: true },
        { href: "/workspace/agents", label: "Open agents" },
      ]}
      meta={[
        { label: "Status", value: "Stub route" },
        { label: "Runtime", value: "Preserved" },
      ]}
      inspectorTitle="Adapter notes"
      inspector={
        <p className="text-sm leading-6 text-muted-foreground">
          Workflows will eventually explain automations and orchestration in product language. For now, runtime threads and agent surfaces stay intact behind explicit adapter links.
        </p>
      }
    >
      <VesperPanel
        kicker="Adapter hub"
        title="Preserve what works"
        description="The product shell changes first. Underlying runtime interactions continue to work instead of being rebuilt prematurely."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <Link href="/workspace/chats" className="rounded-[1.5rem] border border-border/60 bg-background/72 p-5 transition hover:border-foreground/35">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <MessagesSquare className="size-4 text-muted-foreground" />
              Threads adapter
            </div>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Continue using the existing chat and run history model while the shell stops treating chat as the product root.
            </p>
            <div className="mt-4 inline-flex items-center gap-2 text-sm text-foreground">
              <span>Open threads</span>
              <ArrowUpRight className="size-4" />
            </div>
          </Link>
          <Link href="/workspace/agents" className="rounded-[1.5rem] border border-border/60 bg-background/72 p-5 transition hover:border-foreground/35">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <BotIcon className="size-4 text-muted-foreground" />
              Agents adapter
            </div>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Existing agent configuration and entry points remain usable while VESPER-native skills and workflow surfaces take shape.
            </p>
            <div className="mt-4 inline-flex items-center gap-2 text-sm text-foreground">
              <span>Open agents</span>
              <ArrowUpRight className="size-4" />
            </div>
          </Link>
        </div>
      </VesperPanel>

      <VesperPanel
        kicker="Future shape"
        title="What belongs here later"
        description="This route is intentionally thin in UI-5. Its job is to claim product territory and keep routing clear."
      >
        <div className="space-y-4 text-sm leading-6 text-muted-foreground">
          <div className="flex gap-3">
            <Waypoints className="mt-1 size-4 shrink-0" />
            <p>Visual automation structures, execution history, triggers, and approval points can land here without forcing users into implementation detail first.</p>
          </div>
          <div className="flex gap-3">
            <Waypoints className="mt-1 size-4 shrink-0" />
            <p>Workflow health belongs beside action routing and intervention points, not buried inside a chat-first experience.</p>
          </div>
        </div>
      </VesperPanel>
    </VesperShell>
  );
}
