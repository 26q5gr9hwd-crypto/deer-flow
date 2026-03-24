"use client";

import { ArrowUpRight, BotIcon, MessagesSquare } from "lucide-react";
import Link from "next/link";
import { useSidebar } from "@/components/ui/sidebar";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

export function WorkspaceNavMenu() {
  const { open: isSidebarOpen } = useSidebar();

  return (
    <div className="flex flex-col gap-3">
      {isSidebarOpen ? (
        <div className="rounded-2xl border border-sidebar-border/80 bg-sidebar-accent/55 px-3 py-3 text-xs leading-5 text-sidebar-foreground/72">
          The VESPER shell is now the primary frame. Chats and agents remain available as runtime adapters while deeper surfaces are rebuilt.
        </div>
      ) : null}
      <SidebarMenu className="w-full">
        <SidebarMenuItem>
          <SidebarMenuButton asChild tooltip="Open threads adapter">
            <Link href="/workspace/chats" className="text-sidebar-foreground/72">
              <MessagesSquare className="size-4" />
              <span>Open threads adapter</span>
              <ArrowUpRight className="ml-auto size-4" />
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
        <SidebarMenuItem>
          <SidebarMenuButton asChild tooltip="Open agents adapter">
            <Link href="/workspace/agents" className="text-sidebar-foreground/72">
              <BotIcon className="size-4" />
              <span>Open agents adapter</span>
              <ArrowUpRight className="ml-auto size-4" />
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </div>
  );
}
