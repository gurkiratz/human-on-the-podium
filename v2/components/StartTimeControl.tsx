"use client";

import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";

/** A toggle that reveals a start-time field, for analyzing a clip from a given point. */
export function StartTimeControl({
  enabled,
  onEnabledChange,
  value,
  onValueChange,
  disabled,
}: {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        disabled={disabled}
        aria-pressed={enabled}
        onClick={() => onEnabledChange(!enabled)}
        title="Analyze a 60-second clip from a start time"
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
          enabled
            ? "bg-accent text-foreground"
            : "text-muted-foreground hover:bg-accent hover:text-foreground",
        )}
      >
        <Clock className="size-3.5" />
        Start time
      </button>
      {enabled ? (
        <input
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          placeholder="0:00"
          inputMode="numeric"
          disabled={disabled}
          aria-label="Start time"
          className="h-8 w-[68px] rounded-full border border-border bg-background/70 px-2.5 text-xs tabular-nums outline-none focus-visible:border-ring disabled:opacity-50"
        />
      ) : null}
    </div>
  );
}
