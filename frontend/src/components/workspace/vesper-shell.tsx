import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

type VesperAction = {
  href: string;
  label: string;
  emphasis?: boolean;
};

type VesperMeta = {
  label: string;
  value: string;
};

type VesperShellProps = {
  eyebrow: string;
  title: string;
  description: string;
  actions?: VesperAction[];
  meta?: VesperMeta[];
  inspector?: React.ReactNode;
  inspectorTitle?: string;
  children: React.ReactNode;
};

export function VesperShell({
  eyebrow,
  title,
  description,
  actions = [],
  meta = [],
  inspector,
  inspectorTitle = "Inspector",
  children,
}: VesperShellProps) {
  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-[linear-gradient(180deg,rgba(245,242,234,0.96)_0%,rgba(242,238,230,0.94)_42%,rgba(237,232,223,0.98)_100%)] text-foreground">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(196,175,138,0.2),transparent_32%),radial-gradient(circle_at_85%_15%,rgba(110,137,114,0.18),transparent_28%),linear-gradient(135deg,rgba(255,255,255,0.45),transparent_52%)]" />
      <div className="relative flex min-h-screen min-w-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="border-b border-border/60 bg-background/72 backdrop-blur-xl">
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-6 py-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl">
                <div className="text-[11px] font-medium uppercase tracking-[0.35em] text-muted-foreground">
                  {eyebrow}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <h1 className="font-serif text-3xl tracking-[0.02em] text-foreground sm:text-4xl">
                    {title}
                  </h1>
                  {meta.map((item) => (
                    <div
                      key={`${item.label}-${item.value}`}
                      className="rounded-full border border-border/70 bg-background/86 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-muted-foreground"
                    >
                      <span>{item.label}</span>
                      <span className="mx-2 text-border">•</span>
                      <span className="text-foreground">{item.value}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-[15px]">
                  {description}
                </p>
              </div>
              {actions.length > 0 && (
                <div className="flex flex-wrap gap-3">
                  {actions.map((action) => (
                    <Link
                      key={action.href + action.label}
                      href={action.href}
                      className={cn(
                        "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition-colors",
                        action.emphasis
                          ? "border-foreground bg-foreground text-background hover:bg-foreground/90"
                          : "border-border/70 bg-background/78 text-foreground hover:border-foreground/40 hover:bg-background",
                      )}
                    >
                      <span>{action.label}</span>
                      <ArrowUpRight className="size-4" />
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="flex min-h-0 flex-1">
            <main className="min-w-0 flex-1">
              <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-6">
                {children}
              </div>
            </main>
            {inspector ? (
              <aside className="hidden w-[340px] shrink-0 border-l border-border/60 bg-background/72 xl:block">
                <div className="sticky top-0 flex flex-col gap-5 p-6">
                  <div>
                    <div className="text-[11px] font-medium uppercase tracking-[0.3em] text-muted-foreground">
                      {inspectorTitle}
                    </div>
                    <div className="mt-2 h-px w-full bg-border/70" />
                  </div>
                  {inspector}
                </div>
              </aside>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

type VesperPanelProps = {
  kicker?: string;
  title: string;
  description?: string;
  className?: string;
  children: React.ReactNode;
};

export function VesperPanel({
  kicker,
  title,
  description,
  className,
  children,
}: VesperPanelProps) {
  return (
    <section
      className={cn(
        "rounded-[1.75rem] border border-border/60 bg-background/74 p-5 shadow-[0_24px_70px_rgba(84,69,46,0.08)] backdrop-blur",
        className,
      )}
    >
      <div className="mb-4 flex flex-col gap-2">
        {kicker ? (
          <div className="text-[11px] font-medium uppercase tracking-[0.28em] text-muted-foreground">
            {kicker}
          </div>
        ) : null}
        <h2 className="font-serif text-2xl tracking-[0.02em] text-foreground">
          {title}
        </h2>
        {description ? (
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {children}
    </section>
  );
}
