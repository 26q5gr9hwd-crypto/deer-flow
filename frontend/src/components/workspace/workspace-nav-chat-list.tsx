"use client";

import {
  BrainCircuit,
  Network,
  Home,
  Radar,
  Settings2,
  Sparkles,
  Waypoints,
  BotIcon,
  MessagesSquare,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const primaryNav = [
  { href: "/workspace/home", label: "Home", icon: Home },
  { href: "/workspace/control-room", label: "Control Room", icon: Radar },
  { href: "/workspace/workflows", label: "Workflows", icon: Waypoints },
  { href: "/workspace/memory", label: "Memory", icon: BrainCircuit },
  { href: "/workspace/memory-graph", label: "Memory Graph", icon: Network },
  { href: "/workspace/skills", label: "Skills", icon: Sparkles },
  { href: "/workspace/settings", label: "Settings", icon: Settings2 },
] as const;

const adapterNav = [
  { href: "/workspace/chats", label: "Threads", icon: MessagesSquare },
  { href: "/workspace/agents", label: "Agents", icon: BotIcon },
] as const;

export function WorkspaceNavChatList() {
  const pathname = usePathname();

  return (
    <>
      <SidebarGroup className="pt-2">
        <SidebarGroupLabel>Navigate</SidebarGroupLabel>
        <SidebarMenu>
          {primaryNav.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || pathname?.startsWith(`${item.href}/`);
            return (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton isActive={isActive} asChild tooltip={item.label}>
                  <Link href={item.href} className="text-sidebar-foreground/78">
                    <Icon />
                    <span>{item.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroup>

      <SidebarGroup>
        <SidebarGroupLabel>Runtime adapters</SidebarGroupLabel>
        <SidebarMenu>
          {adapterNav.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || pathname?.startsWith(`${item.href}/`);
            return (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton isActive={isActive} asChild tooltip={item.label}>
                  <Link href={item.href} className="text-sidebar-foreground/70">
                    <Icon />
                    <span>{item.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroup>
    </>
  );
}
