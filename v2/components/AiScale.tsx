"use client";

import { AI_BANDS, aiPct, aiShareBand, aiTone } from "@/lib/ai-bands";
import { cn } from "@/lib/utils";

const TONE_TEXT = {
  ai: "text-red-300",
  mixed: "text-amber-300",
  human: "text-emerald-300",
} as const;

const TONE_BAR = {
  ai: "bg-red-400",
  mixed: "bg-amber-400",
  human: "bg-emerald-400",
} as const;

/** One fill per band, cool → hot, using the same tokens as the AI-o-meter. */
const BAND_FILL = [
  "var(--success)",
  "var(--success)",
  "var(--warning)",
  "var(--warning)",
  "var(--destructive)",
];

/**
 * The share of an excerpt put on the machine side, with the band phrase beside it.
 * A bare verdict word reads as a hard ruling even when the model is hedging, so the number
 * carries its own unit (`28% AI`) and a plain-language band sits next to it.
 */
export function AiShare({
  share,
  size = "sm",
  showLabel = true,
  className,
}: {
  share: number;
  size?: "sm" | "lg";
  showLabel?: boolean;
  className?: string;
}) {
  const band = aiShareBand(share);
  const tone = aiTone(share);
  const pct = aiPct(share);
  const big = size === "lg";

  return (
    <div
      className={className}
      title={`GPTZero puts ${pct}% of these words on the machine side — ${band.label.toLowerCase()}.`}
    >
      <div className={cn("flex items-baseline", big ? "gap-3" : "gap-1.5")}>
        <span
          className={cn(
            "font-semibold tabular-nums",
            big ? "text-[34px] leading-none tracking-tight" : "text-[15px]",
            TONE_TEXT[tone],
          )}
        >
          {pct}%
          <span className={big ? "ml-1.5 text-[0.42em]" : "ml-1 text-[11px]"}>AI</span>
        </span>
        {showLabel ? (
          <span
            className={cn("truncate text-muted-foreground", big ? "text-[15px]" : "text-[12px]")}
          >
            {band.label}
          </span>
        ) : null}
      </div>
      <div
        className={cn(
          "w-full overflow-hidden rounded-full bg-muted",
          big ? "mt-3 h-1.5" : "mt-1.5 h-1",
        )}
      >
        <div
          className={cn("h-full rounded-full", TONE_BAR[tone])}
          style={{ width: `${Math.max(pct, 2)}%` }}
        />
      </div>
    </div>
  );
}

/** The five bands as one strip, so the colour scale explains itself. */
export function BandLegend({ className }: { className?: string }) {
  return (
    <p
      className={cn(
        "flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground",
        className,
      )}
    >
      <span>AI-ness</span>
      <span className="inline-flex h-1.5 w-24 overflow-hidden rounded-full">
        {AI_BANDS.map((band, index) => (
          <span key={band.label} className="h-full flex-1" style={{ background: BAND_FILL[index] }} />
        ))}
      </span>
      <span className="text-muted-foreground/60">0% human hands → 100% reads like a bot</span>
    </p>
  );
}
