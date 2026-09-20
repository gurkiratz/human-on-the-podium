"use client";

/**
 * One AI-share scale, shared by the analyze page and the archive table.
 *
 * A raw "HUMAN" verdict reads as a hard ruling even when the model is hedging,
 * so everywhere we surface a reading we show the share of the excerpt that
 * GPTZero puts on the machine side, plus a phrase someone can act on without
 * knowing what GPTZero is.
 *
 * Colors are CSS variables, not hex: `globals.css` tunes --band-1..5 for the
 * dark capture page, the paper roots re-tune all five for ink on paper.
 */
export const AI_BANDS = [
  { max: 0.1, label: "Human hands", v: "--band-1" },
  { max: 0.3, label: "Mostly human", v: "--band-2" },
  { max: 0.55, label: "Ghostwriter?", v: "--band-3" },
  { max: 0.8, label: "Leans machine", v: "--band-4" },
  { max: Infinity, label: "Reads like a bot", v: "--band-5" },
] as const;

export type Certainty = "low" | "medium" | "high";

export const CERTAINTY: Record<
  Certainty,
  { bars: number; word: string; note: string }
> = {
  low: {
    bars: 1,
    word: "Low certainty",
    note: "Low certainty — read this as a hint, not a finding",
  },
  medium: { bars: 2, word: "Medium certainty", note: "Medium certainty" },
  high: { bars: 3, word: "High certainty", note: "High certainty" },
};

export const CERTAINTY_RANK: Record<Certainty, number> = {
  low: 0,
  medium: 1,
  high: 2,
};

export function bandOf(ai: number) {
  return AI_BANDS.find((b) => ai < b.max) ?? AI_BANDS[AI_BANDS.length - 1];
}

export function aiPct(ai: number) {
  return Math.round(ai * 100);
}

/** Text tone that resolves on paper first, then falls back to the dark set. */
const MUTED = "var(--muted-ink, var(--muted))";

export function AiMeter({
  ai,
  size = "sm",
  showLabel = true,
  className = "",
}: {
  ai: number;
  size?: "sm" | "lg";
  /** Off in narrow slots, where the phrase would truncate to noise. */
  showLabel?: boolean;
  className?: string;
}) {
  const band = bandOf(ai);
  const share = aiPct(ai);
  const color = `var(${band.v})`;
  const big = size === "lg";

  return (
    <div
      className={className}
      title={`GPTZero puts ${share}% of these words on the machine side — ${band.label.toLowerCase()}.`}
    >
      <div className={`flex items-baseline ${big ? "gap-3" : "gap-1.5"}`}>
        <span
          className={`tabular-nums font-semibold ${
            big
              ? "text-[clamp(2.2rem,6vw,3rem)] leading-none tracking-[-0.035em]"
              : "text-[15px]"
          }`}
          style={{ color }}
        >
          {share}%
          <span className={big ? "ml-2 text-[0.42em]" : "ml-1 text-[11px]"}>
            AI
          </span>
        </span>
        {showLabel && (
          <span
            className={`truncate ${big ? "text-[15px]" : "text-[12px]"}`}
            style={{ color: MUTED }}
          >
            {band.label}
          </span>
        )}
      </div>
      <div
        className={`${big ? "mt-3.5 h-[6px]" : "mt-1.5 h-[5px]"} w-full overflow-hidden rounded-full`}
        style={{ background: `color-mix(in srgb, ${color} 18%, transparent)` }}
      >
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.max(share, 2)}%`, background: color }}
        />
      </div>
    </div>
  );
}

/** Signal bars stand in for the words high / medium / low. */
export function CertaintyBars({
  level,
  className = "",
  decorative = false,
}: {
  level: Certainty;
  className?: string;
  decorative?: boolean;
}) {
  const { bars, note } = CERTAINTY[level];
  const a11y = decorative
    ? { "aria-hidden": true as const }
    : { role: "img", "aria-label": note };

  return (
    <span
      className={`inline-flex items-end gap-[3px] ${className}`}
      title={decorative ? undefined : note}
      {...a11y}
    >
      {[6, 10, 14].map((h, i) => (
        <span
          key={h}
          className="w-[3px] rounded-[1px]"
          style={{
            height: h,
            background:
              i < bars
                ? "var(--ink, var(--color-chalk))"
                : "var(--line, var(--hairline))",
          }}
        />
      ))}
    </span>
  );
}

/** The five bands as one gradient strip, so the color scale explains itself. */
export function BandLegend({ className = "" }: { className?: string }) {
  return (
    <p
      className={`flex flex-wrap items-center gap-2 text-[12px] ${className}`}
      style={{ color: MUTED }}
    >
      <span>AI-ness</span>
      <span className="inline-flex h-[5px] w-24 overflow-hidden rounded-full">
        {AI_BANDS.map((b) => (
          <span
            key={b.label}
            className="h-full flex-1"
            style={{ background: `var(${b.v})` }}
          />
        ))}
      </span>
      <span style={{ color: "var(--faint-ink, var(--faint))" }}>
        0% human hands → 100% reads like a bot
      </span>
    </p>
  );
}
