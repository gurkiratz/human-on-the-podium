"use client";

import { AudioLines } from "lucide-react";
import type { AudioEvent } from "@/lib/types";

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60);
  return `${minutes}:${rest.toString().padStart(2, "0")}`;
}

function iconFor(text: string): string {
  const label = text.toLowerCase();
  if (label.includes("laugh")) return "😂";
  if (label.includes("applaus") || label.includes("cheer") || label.includes("clap")) return "👏";
  if (label.includes("music") || label.includes("instrument")) return "🎵";
  if (label.includes("crowd")) return "🗣️";
  if (label.includes("silence") || label.includes("noise")) return "🔇";
  return "🔊";
}

export function AudioEventsStrip({ events }: { events: AudioEvent[] }) {
  if (events.length === 0) return null;

  return (
    <div className="glass flex flex-col gap-2 rounded-2xl border border-border/70 px-4 py-3">
      <span className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <AudioLines className="size-3.5" />
        Audio events
        <span className="text-[10px] normal-case tracking-normal opacity-70">
          {events.length}
        </span>
      </span>

      <div className="flex flex-wrap gap-1.5">
        {events.map((event, index) => (
          <span
            key={`${event.start}-${index}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-border/70 px-2.5 py-1 text-[11px] text-muted-foreground"
          >
            <span aria-hidden="true">{iconFor(event.text)}</span>
            <span className="capitalize text-foreground/90">{event.text}</span>
            <span className="tabular-nums">{formatTime(event.start)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
