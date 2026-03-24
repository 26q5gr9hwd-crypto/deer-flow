import {
  BellRing,
  Brain,
  CheckCircle2,
  LockKeyhole,
  type LucideIcon,
  Palette,
  PlugZap,
  Route,
  Settings2,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import type { ReactNode } from "react";

import { AboutSettingsPage } from "@/components/workspace/settings/about-settings-page";
import { AppearanceSettingsPage } from "@/components/workspace/settings/appearance-settings-page";
import { MemorySettingsPage } from "@/components/workspace/settings/memory-settings-page";
import { NotificationSettingsPage } from "@/components/workspace/settings/notification-settings-page";
import { SkillSettingsPage } from "@/components/workspace/settings/skill-settings-page";
import { ToolSettingsPage } from "@/components/workspace/settings/tool-settings-page";
import { VesperPanel, VesperShell } from "@/components/workspace/vesper-shell";

const sectionLinks = [
  { href: "#identity-and-tone", label: "Identity and tone" },
  { href: "#behavior-and-approvals", label: "Behavior and approvals" },
  { href: "#memory-policy", label: "Memory policy" },
  { href: "#workflow-defaults", label: "Workflow defaults" },
  { href: "#skills-and-tools-access", label: "Skills and tools access" },
  { href: "#channels-and-integrations", label: "Channels and integrations" },
  { href: "#advanced", label: "Advanced" },
] as const;

export default function SettingsPage() {
  return (
    <VesperShell
      eyebrow="Settings"
      title="Behavior and policy"
      description="Tune the durable parts of VESPER in product language. Live controls apply now. Future controls are labeled clearly instead of being faked."
      actions={[
        { href: "/workspace/control-room", label: "Open Control Room" },
        { href: "/workspace/home", label: "Return Home", emphasis: true },
      ]}
      meta={[
        { label: "Live now", value: "Appearance, memory, skills, tools, notifications" },
        { label: "Product language", value: "VESPER-native" },
      ]}
      inspectorTitle="How to read this surface"
      inspector={
        <div className="space-y-4 text-sm leading-6 text-muted-foreground">
          <p>
            Settings is organized around how VESPER behaves, remembers, and acts.
            It does not mirror raw config files.
          </p>
          <div className="space-y-3">
            <InspectorLegend label="Live now" tone="live">
              Changes or views that already work in the current shell.
            </InspectorLegend>
            <InspectorLegend label="Planned" tone="planned">
              Durable controls that belong here, but are not wired yet.
            </InspectorLegend>
          </div>
        </div>
      }
    >
      <VesperPanel
        kicker="Overview"
        title="A calmer settings surface"
        description="The layout is grouped by durable product questions instead of inherited DeerFlow buckets. Use the section index to jump directly to the area you want to steer."
      >
        <div className="flex flex-wrap gap-2">
          {sectionLinks.map((section) => (
            <a
              key={section.href}
              href={section.href}
              className="rounded-full border border-border/70 bg-background/72 px-3 py-2 text-xs font-medium tracking-[0.18em] text-muted-foreground transition hover:border-primary/50 hover:text-foreground"
            >
              {section.label}
            </a>
          ))}
        </div>
      </VesperPanel>

      <SectionPanel
        id="identity-and-tone"
        icon={Palette}
        kicker="Identity and tone"
        title="How VESPER presents itself"
        description="Set the visual feel and language basics now. Voice and operating style controls belong here next."
      >
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.9fr)]">
          <LiveCard
            title="Live now"
            description="Theme and language already apply in the current shell."
          >
            <AppearanceSettingsPage />
          </LiveCard>
          <PlannedCard
            title="Planned"
            description="These controls belong here, but they are not wired yet."
            items={[
              {
                label: "Response style",
                detail: "Choose whether VESPER sounds crisp, reflective, or more direct by default.",
              },
              {
                label: "Name and presence",
                detail: "Adjust how strongly the product surfaces VESPER as a personal intelligence system.",
              },
              {
                label: "Default explanation depth",
                detail: "Set whether routine answers stay concise unless detail is explicitly requested.",
              },
            ]}
          />
        </div>
      </SectionPanel>

      <SectionPanel
        id="behavior-and-approvals"
        icon={ShieldCheck}
        kicker="Behavior and approvals"
        title="How safely VESPER should act"
        description="Approval gates and escalation rules should be obvious here. Right now this category is intentionally defined before the controls are wired."
      >
        <PlannedGrid
          items={[
            {
              label: "Approval threshold",
              detail: "Decide which actions can run automatically and which ones should pause for confirmation.",
            },
            {
              label: "Escalation style",
              detail: "Control how VESPER surfaces risky changes, blockers, and decision requests.",
            },
            {
              label: "Autonomy posture",
              detail: "Set whether VESPER should prefer speed, caution, or explicit checkpoints for sensitive work.",
            },
          ]}
        />
      </SectionPanel>

      <SectionPanel
        id="memory-policy"
        icon={Brain}
        kicker="Memory policy"
        title="What VESPER keeps in mind"
        description="Current memory state is visible now. Retention and compression policy controls are reserved here for the durable version of the product."
      >
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.9fr)]">
          <LiveCard
            title="Live now"
            description="Inspect the current memory picture without leaving Settings."
          >
            <MemorySettingsPage />
          </LiveCard>
          <PlannedCard
            title="Planned"
            description="These policies are part of the intended Settings language but are not editable yet."
            items={[
              {
                label: "Retention horizon",
                detail: "Choose how long short-term context should remain easy to reach before it is compressed.",
              },
              {
                label: "Confidence rules",
                detail: "Set how conservative VESPER should be before treating something as durable knowledge.",
              },
              {
                label: "Compression posture",
                detail: "Control whether memory favors detail, brevity, or a balanced summary by default.",
              },
            ]}
          />
        </div>
      </SectionPanel>

      <SectionPanel
        id="workflow-defaults"
        icon={Route}
        kicker="Workflow defaults"
        title="How work should usually flow"
        description="This category is for default routing, handoff posture, and review expectations. It is defined now so the final settings language stays coherent as workflow controls arrive."
      >
        <PlannedGrid
          items={[
            {
              label: "Default handoff behavior",
              detail: "Choose whether VESPER should favor direct continuation, staged review, or explicit human checkpoints.",
            },
            {
              label: "Execution preference",
              detail: "Set whether routine work should bias toward research first, action first, or verification first.",
            },
            {
              label: "Recovery policy",
              detail: "Decide how many retries VESPER should attempt before escalating a broken run.",
            },
          ]}
        />
      </SectionPanel>

      <SectionPanel
        id="skills-and-tools-access"
        icon={Wrench}
        kicker="Skills and tools access"
        title="What VESPER can reach and use"
        description="The real capability controls already live here. Skills and tool access are editable now, while the broader product language stays simple."
      >
        <div className="grid gap-6 xl:grid-cols-2">
          <LiveCard
            title="Skills"
            description="Enable or disable available skills without dropping into prompt scaffolding."
          >
            <SkillSettingsPage />
          </LiveCard>
          <LiveCard
            title="Tools"
            description="Control which connected tool servers are available to the system right now."
          >
            <ToolSettingsPage />
          </LiveCard>
        </div>
      </SectionPanel>

      <SectionPanel
        id="channels-and-integrations"
        icon={PlugZap}
        kicker="Channels and integrations"
        title="Where VESPER can surface updates"
        description="Channels should explain delivery in plain language. The current surface wires notifications now and leaves richer channel behavior clearly marked for later."
      >
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(280px,0.9fr)]">
          <LiveCard
            title="Live now"
            description="Notification preferences already affect how the shell alerts you."
          >
            <NotificationSettingsPage />
          </LiveCard>
          <PlannedCard
            title="Planned"
            description="These channel controls are intentionally reserved instead of being faked."
            items={[
              {
                label: "Channel presence",
                detail: "Choose where VESPER should be allowed to appear, respond, or stay quiet by default.",
              },
              {
                label: "Integration posture",
                detail: "Show which connected systems are read-only versus action-capable in plain product language.",
              },
              {
                label: "Delivery style",
                detail: "Tune whether updates should be immediate, bundled, or reserved for important moments.",
              },
            ]}
          />
        </div>
      </SectionPanel>

      <SectionPanel
        id="advanced"
        icon={Settings2}
        kicker="Advanced"
        title="Implementation-facing detail"
        description="Advanced stays separate from the default product experience. It is where technical context can exist without becoming the personality of Settings."
      >
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(280px,0.9fr)]">
          <LiveCard
            title="Live now"
            description="Reference information and product metadata remain accessible here without taking over the main settings language."
          >
            <AboutSettingsPage />
          </LiveCard>
          <div className="rounded-[1.6rem] border border-border/65 bg-background/78 p-5">
            <StatusPill tone="live">Live now</StatusPill>
            <h3 className="mt-4 text-lg font-semibold text-foreground">
              Why this section is separate
            </h3>
            <div className="mt-3 space-y-3 text-sm leading-6 text-muted-foreground">
              <p>
                Advanced is the pressure valve for implementation-facing detail. It
                keeps the default settings experience focused on steering behavior,
                memory, workflows, and channels.
              </p>
              <p>
                Raw config-shaped controls should only land here when they provide
                real operator value and can be explained clearly.
              </p>
            </div>
          </div>
        </div>
      </SectionPanel>

      <VesperPanel
        kicker="Design rule"
        title="No fake toggles"
        description="This surface prefers honest structure over pretend completeness."
      >
        <div className="grid gap-4 md:grid-cols-3">
          <PrincipleCard
            icon={CheckCircle2}
            title="Real where practical"
            detail="Theme, language, memory, notifications, skills, tools, and advanced reference surfaces are wired now."
          />
          <PrincipleCard
            icon={LockKeyhole}
            title="Clear about limits"
            detail="Approval, workflow, and deeper policy controls are labeled as planned until the backing behavior exists."
          />
          <PrincipleCard
            icon={BellRing}
            title="Plain product copy"
            detail="Each category explains what changes in everyday language instead of exposing config jargon first."
          />
        </div>
      </VesperPanel>
    </VesperShell>
  );
}

type SectionPanelProps = {
  id: string;
  icon: LucideIcon;
  kicker: string;
  title: string;
  description: string;
  children: ReactNode;
};

function SectionPanel({
  id,
  icon: Icon,
  kicker,
  title,
  description,
  children,
}: SectionPanelProps) {
  return (
    <section id={id} className="scroll-mt-28">
      <VesperPanel kicker={kicker} title={title} description={description}>
        <div className="mb-5 flex items-center gap-3 text-sm text-muted-foreground">
          <div className="flex size-10 items-center justify-center rounded-full border border-border/70 bg-background/78 text-foreground">
            <Icon className="size-4" />
          </div>
          <p className="max-w-3xl leading-6">{description}</p>
        </div>
        {children}
      </VesperPanel>
    </section>
  );
}

function LiveCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-[1.6rem] border border-border/65 bg-background/78 p-5">
      <StatusPill tone="live">Live now</StatusPill>
      <h3 className="mt-4 text-lg font-semibold text-foreground">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
      <div className="mt-5">{children}</div>
    </div>
  );
}

function PlannedCard({
  title,
  description,
  items,
}: {
  title: string;
  description: string;
  items: { label: string; detail: string }[];
}) {
  return (
    <div className="rounded-[1.6rem] border border-dashed border-border/65 bg-background/62 p-5">
      <StatusPill tone="planned">Planned</StatusPill>
      <h3 className="mt-4 text-lg font-semibold text-foreground">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
      <div className="mt-5 space-y-3">
        {items.map((item) => (
          <PlannedItem key={item.label} label={item.label} detail={item.detail} />
        ))}
      </div>
    </div>
  );
}

function PlannedGrid({
  items,
}: {
  items: { label: string; detail: string }[];
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-[1.4rem] border border-dashed border-border/65 bg-background/62 p-5"
        >
          <StatusPill tone="planned">Planned</StatusPill>
          <h3 className="mt-4 text-base font-semibold text-foreground">{item.label}</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.detail}</p>
        </div>
      ))}
    </div>
  );
}

function PlannedItem({ label, detail }: { label: string; detail: string }) {
  return (
    <div className="rounded-[1.2rem] border border-dashed border-border/60 bg-background/55 p-4">
      <div className="text-sm font-medium text-foreground">{label}</div>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{detail}</p>
    </div>
  );
}

function PrincipleCard({
  icon: Icon,
  title,
  detail,
}: {
  icon: LucideIcon;
  title: string;
  detail: string;
}) {
  return (
    <div className="rounded-[1.4rem] border border-border/65 bg-background/72 p-5">
      <div className="flex size-10 items-center justify-center rounded-full border border-border/65 bg-background/80 text-foreground">
        <Icon className="size-4" />
      </div>
      <h3 className="mt-4 text-base font-semibold text-foreground">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{detail}</p>
    </div>
  );
}

function StatusPill({
  tone,
  children,
}: {
  tone: "live" | "planned";
  children: ReactNode;
}) {
  return (
    <span
      className={
        tone === "live"
          ? "inline-flex rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.22em] text-emerald-200"
          : "inline-flex rounded-full border border-amber-500/25 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.22em] text-amber-200"
      }
    >
      {children}
    </span>
  );
}

function InspectorLegend({
  label,
  tone,
  children,
}: {
  label: string;
  tone: "live" | "planned";
  children: ReactNode;
}) {
  return (
    <div className="rounded-[1.2rem] border border-border/60 bg-background/60 p-3">
      <StatusPill tone={tone}>{label}</StatusPill>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{children}</p>
    </div>
  );
}
