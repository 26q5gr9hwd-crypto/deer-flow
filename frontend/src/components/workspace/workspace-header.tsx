"use client";

import { Orbit, SidebarClose } from "lucide-react";
import Link from "next/link";

import {
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

export function WorkspaceHeader({ className }: { className?: string }) {
  const { state } = useSidebar();

  return (
    <div
      className={cn(
        "flex h-14 items-center border-b border-sidebar-border/70 px-2",
        className,
      )}
    >
      {state === "collapsed" ? (
        <div className="flex w-full flex-col items-center gap-2">
          <Link
            href="/workspace/home"
            className="flex size-8 items-center justify-center rounded-full border border-sidebar-border/80 bg-sidebar-accent/60 text-sidebar-foreground"
          >
            <Orbit className="size-4" />
          </Link>
          <SidebarTrigger className="size-8 text-sidebar-foreground/70" />
        </div>
      ) : (
        <div className="flex w-full items-center justify-between gap-2">
          <Link
            href="/workspace/home"
            className="flex min-w-0 items-center gap-3 rounded-2xl px-2 py-1 transition-colors hover:bg-sidebar-accent/70"
          >
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full border border-sidebar-border/80 bg-sidebar-accent/80 text-sidebar-foreground shadow-sm">
              <Orbit className="size-4" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium uppercase tracking-[0.24em] text-sidebar-foreground">
                VESPER
              </div>
              <div className="truncate text-[11px] text-sidebar-foreground/65">
                App shell v1
              </div>
            </div>
          </Link>
          <SidebarTrigger className="text-sidebar-foreground/70 hover:text-sidebar-foreground">
            <SidebarClose className="size-4" />
          </SidebarTrigger>
        </div>
      )}
    </div>
  );
}
