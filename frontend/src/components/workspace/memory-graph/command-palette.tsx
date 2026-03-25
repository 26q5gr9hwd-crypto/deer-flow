"use client";

import { Command, Layers3, RefreshCw, Search, X } from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";

export interface CommandItem {
  id: string;
  title: string;
  subtitle?: string;
  group: string;
}

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: CommandItem[];
  onSelect: (item: CommandItem) => void;
}

const ICONS: Record<string, React.ReactNode> = {
  Actions: <RefreshCw className="h-4 w-4" />,
  Regions: <Layers3 className="h-4 w-4" />,
  Topics: <Search className="h-4 w-4" />,
};

export function CommandPalette({ open, onOpenChange, items, onSelect }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }
    const id = window.setTimeout(() => inputRef.current?.focus(), 10);
    return () => window.clearTimeout(id);
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return items;
    }
    return items.filter((item) => `${item.title} ${item.subtitle ?? ""} ${item.group}`.toLowerCase().includes(q));
  }, [items, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, CommandItem[]>();
    filtered.forEach((item) => {
      const existing = map.get(item.group) ?? [];
      existing.push(item);
      map.set(item.group, existing);
    });
    return Array.from(map.entries());
  }, [filtered]);

  if (!open) {
    return null;
  }

  return (
    <div className="mg-command-overlay" role="dialog" aria-modal="true">
      <button className="mg-command-backdrop" aria-label="Close command palette" onClick={() => onOpenChange(false)} />
      <div className="mg-command-panel">
        <div className="mg-command-header">
          <div className="mg-command-title-row">
            <div className="mg-command-title-icon"><Command className="h-4 w-4" /></div>
            <div>
              <div className="mg-command-title">Command palette</div>
              <div className="mg-command-subtitle">Jump between regions, themes, and overview actions.</div>
            </div>
          </div>
          <button className="mg-command-close" onClick={() => onOpenChange(false)} aria-label="Close command palette">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mg-command-input-wrap">
          <Search className="h-4 w-4 text-white/35" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="mg-command-input"
            placeholder="Search commands, regions, or topics"
          />
        </div>

        <div className="mg-command-list mg-scrollbar">
          {grouped.length === 0 ? (
            <div className="mg-command-empty">No matching commands.</div>
          ) : grouped.map(([group, groupItems]) => (
            <section key={group} className="mg-command-group">
              <div className="mg-command-group-title">
                {ICONS[group] ?? <Search className="h-4 w-4" />}
                <span>{group}</span>
              </div>
              <div className="mg-command-group-items">
                {groupItems.map((item) => (
                  <button
                    key={item.id}
                    className="mg-command-item"
                    onClick={() => {
                      onSelect(item);
                      onOpenChange(false);
                    }}
                  >
                    <span className="mg-command-item-title">{item.title}</span>
                    {item.subtitle ? <span className="mg-command-item-subtitle">{item.subtitle}</span> : null}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
