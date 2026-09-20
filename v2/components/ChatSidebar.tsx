"use client";

import { FileText, PanelLeftClose, Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader } from "@/components/ui/loader";
import { cn } from "@/lib/utils";
import type { ChatSession, ChatSummary } from "@/lib/history";

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!then) return "";
  const minutes = Math.round((Date.now() - then) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
}

export function ChatSidebar({
  activeId,
  refreshKey,
  onCollapse,
  onNew,
  onSelect,
  onShowTranscripts,
}: {
  activeId: string;
  refreshKey: number;
  onCollapse: () => void;
  onNew: () => void;
  onSelect: (session: ChatSession) => void;
  onShowTranscripts: () => void;
}) {
  const [items, setItems] = useState<ChatSummary[] | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/chats", { cache: "no-store" });
      const data = response.ok
        ? ((await response.json()) as { items: ChatSummary[] })
        : { items: [] };
      setItems(data.items);
    } catch {
      setItems([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey, activeId]);

  async function choose(id: string) {
    setLoadingId(id);
    try {
      const response = await fetch(`/api/chats/${id}`, { cache: "no-store" });
      if (response.ok) onSelect((await response.json()) as ChatSession);
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <div className="flex h-full w-[264px] flex-col">
      <div className="flex items-center justify-between px-3 py-2.5">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          History
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground hover:text-foreground"
          onClick={onCollapse}
          aria-label="Hide history"
        >
          <PanelLeftClose className="size-4" />
        </Button>
      </div>

      <div className="px-3 pb-2">
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start gap-2 border-border/70"
          onClick={onNew}
        >
          <Plus className="size-3.5" />
          New chat
        </Button>
      </div>

      <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {items === null ? (
          <div className="flex justify-center py-6">
            <Loader variant="dots" size="sm" />
          </div>
        ) : items.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs leading-relaxed text-muted-foreground">
            No conversations yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  onClick={() => void choose(item.id)}
                  disabled={loadingId === item.id}
                  aria-current={item.id === activeId}
                  className={cn(
                    "flex w-full flex-col items-start gap-0.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-accent",
                    item.id === activeId && "bg-accent",
                    loadingId === item.id && "opacity-60",
                  )}
                >
                  <span className="line-clamp-2 w-full text-[12.5px] font-medium text-foreground">
                    {item.title}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {relativeTime(item.updatedAt)} · {item.messageCount} messages
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-border/60 p-2">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
          onClick={onShowTranscripts}
        >
          <FileText className="size-3.5" />
          Saved transcripts
        </Button>
      </div>
    </div>
  );
}
