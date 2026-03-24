"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { cn } from "@/lib/utils";

export function WorkspaceContainer({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div className={cn("flex h-screen w-full flex-col", className)} {...props}>
      {children}
    </div>
  );
}

export function WorkspaceHeader({
  className,
  children,
  ...props
}: React.ComponentProps<"header">) {
  const pathname = usePathname();
  const segments = useMemo(() => {
    const parts = pathname?.split("/") || [];
    if (parts.length > 0) {
      return parts.slice(1, 3);
    }
  }, [pathname]);

  return (
    <header
      className={cn(
        "top-0 right-0 left-0 z-20 flex h-16 shrink-0 items-center justify-between gap-2 border-b border-border/70 bg-background/70 backdrop-blur-sm transition-[width,height] ease-out group-has-data-[collapsible=icon]/sidebar-wrapper:h-12",
        className,
      )}
      {...props}
    >
      <div className="flex items-center gap-2 px-4">
        <Breadcrumb>
          <BreadcrumbList>
            {segments?.[0] && (
              <BreadcrumbItem className="hidden md:block">
                <BreadcrumbLink asChild>
                  <Link href={`/${segments[0]}`}>{nameOfSegment(segments[0])}</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
            )}
            {segments?.[1] && (
              <>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  {segments.length >= 2 ? (
                    <BreadcrumbLink asChild>
                      <Link href={`/${segments[0]}/${segments[1]}`}>
                        {nameOfSegment(segments[1])}
                      </Link>
                    </BreadcrumbLink>
                  ) : (
                    <BreadcrumbPage>{nameOfSegment(segments[1])}</BreadcrumbPage>
                  )}
                </BreadcrumbItem>
              </>
            )}
            {children && (
              <>
                <BreadcrumbSeparator />
                {children}
              </>
            )}
          </BreadcrumbList>
        </Breadcrumb>
      </div>
      <div className="px-4 text-[11px] uppercase tracking-[0.28em] text-muted-foreground">
        VESPER shell
      </div>
    </header>
  );
}

export function WorkspaceBody({
  className,
  children,
  ...props
}: React.ComponentProps<"main">) {
  return (
    <main
      className={cn(
        "relative flex min-h-0 w-full flex-1 flex-col items-center",
        className,
      )}
      {...props}
    >
      <div className="flex h-full w-full flex-col items-center">{children}</div>
    </main>
  );
}

function nameOfSegment(segment: string | undefined) {
  if (!segment) return "Home";
  if (segment === "workspace") return "Workspace";
  if (segment === "home") return "Home";
  if (segment === "control-room") return "Control Room";
  if (segment === "workflows") return "Workflows";
  if (segment === "memory") return "Memory";
  if (segment === "skills") return "Skills";
  if (segment === "settings") return "Settings";
  if (segment === "chats") return "Threads";
  if (segment === "agents") return "Agents";
  return segment[0]?.toUpperCase() + segment.slice(1);
}
