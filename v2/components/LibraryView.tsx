"use client";

/* eslint-disable @next/next/no-img-element */

import { ArrowLeft, Clock3, FileText, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { AnalyticsPanel } from "@/components/AnalyticsPanel";
import { Button } from "@/components/ui/button";
import { Loader } from "@/components/ui/loader";
import { formatDay, formatDuration } from "@/lib/time-format";
import { cn } from "@/lib/utils";
import type { LibraryEntry, LibraryItem } from "@/lib/library";

export function LibraryView({ onBack }: { onBack?: () => void }) {
  const [items, setItems] = useState<LibraryItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<LibraryEntry | null>(null);
  const [opening, setOpening] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch("/api/library", { cache: "no-store" });
      if (!response.ok) throw new Error(`Could not load the library (${response.status}).`);
      const data = (await response.json()) as { items: LibraryItem[] };
      setItems(data.items);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setItems([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function open(id: string) {
    setOpening(id);
    setError(null);
    try {
      const response = await fetch(`/api/library/${id}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`Could not open that transcript (${response.status}).`);
      setSelected((await response.json()) as LibraryEntry);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setOpening(null);
    }
  }

  if (selected) {
    return (
      <div className="scroll-quiet h-full overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
        <div className="mx-auto w-full max-w-5xl">
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 mb-4 text-muted-foreground hover:text-foreground"
            onClick={() => setSelected(null)}
          >
            <ArrowLeft className="size-4" />
            All transcripts
          </Button>
          <AnalyticsPanel
            video={selected.video}
            transcript={selected.transcript}
            stats={selected.stats}
            sessionId={null}
            primarySpeaker={selected.primarySpeaker}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="scroll-quiet h-full overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="flex min-w-0 items-center gap-2">
            {onBack ? (
              <Button
                variant="ghost"
                size="sm"
                className="-ml-2 h-7 shrink-0 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
                onClick={onBack}
              >
                <ArrowLeft className="size-3.5" />
                Back to chat
              </Button>
            ) : null}
            <div className="min-w-0">
              <h2 className="text-[15px] font-semibold tracking-tight">Saved transcripts</h2>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                Every speech you have transcribed, newest first.
              </p>
            </div>
          </div>
          <Button variant="ghost" size="sm" className="shrink-0" onClick={() => void load()}>
            <RefreshCw className="size-4" />
            Refresh
          </Button>
        </div>

        {error ? (
          <p className="mb-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-foreground">
            {error}
          </p>
        ) : null}

        {items === null ? (
          <div className="flex justify-center py-16">
            <Loader variant="dots" />
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border px-6 py-14 text-center">
            <p className="text-sm font-medium">No transcripts yet</p>
            <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
              Run a search in Live Chat and approve a video. Its transcript will be saved here.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-1">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  onClick={() => void open(item.id)}
                  disabled={opening === item.id}
                  className={cn(
                    "group flex w-full items-start gap-4 rounded-xl border border-transparent px-3 py-3 text-left transition-colors",
                    "hover:border-border/70 hover:bg-card/50 focus-visible:border-ring focus-visible:outline-none",
                    opening === item.id && "opacity-60",
                  )}
                >
                  <span className="hidden h-[56px] w-24 shrink-0 overflow-hidden rounded-lg border border-border bg-muted sm:block">
                    {item.video.thumbnail ? (
                      <img
                        src={item.video.thumbnail}
                        alt=""
                        className="size-full object-cover"
                      />
                    ) : null}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="truncate text-[13.5px] font-medium text-foreground">
                        {item.video.title}
                      </span>
                      <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                        {formatDay(Date.parse(item.createdAt))}
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {item.video.channel || "Unknown channel"}
                    </span>
                    <span className="mt-1.5 flex items-center gap-3 text-[11px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <FileText className="size-3" />
                        {item.stats.words.toLocaleString()} words
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Clock3 className="size-3" />
                        {formatDuration(item.stats.duration)}
                      </span>
                      <span className="uppercase">{item.stats.language}</span>
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
