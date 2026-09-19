"use client";

import { motion, useReducedMotion } from "motion/react";
import type { Detection } from "@/lib/types";

export const VERDICT_COLOR = {
  ai: "var(--color-ai)",
  human: "var(--color-human)",
  mixed: "var(--color-mixed)",
} as const;

export const VERDICT_LABEL = {
  ai: "AI",
  human: "Human",
  mixed: "Mixed",
} as const;

const SUBCLASS_COPY: Record<string, string> = {
  concatenated: "AI text pasted into their own words",
  polished: "their words, rewritten by AI",
};

const CONF_WORD = {
  high: "highly",
  medium: "moderately",
  low: "somewhat",
} as const;

function pct(n: number) {
  return Math.round(n * 100);
}

export function VerdictBadge({ detection }: { detection: Detection | null }) {
  const reduced = useReducedMotion();

  if (!detection) {
    return (
      <div className="flex items-baseline gap-3">
        <span className="display text-[44px] font-bold text-[var(--faint)]">—</span>
        <span className="text-[13px] text-[var(--faint)]">Waiting for enough speech</span>
      </div>
    );
  }

  const color = VERDICT_COLOR[detection.verdict];
  const probs = detection.probs ?? {
    ai: detection.verdict === "ai" ? detection.probability : 0,
    human: detection.verdict === "human" ? detection.probability : 0,
    mixed: detection.verdict === "mixed" ? detection.probability : 0,
  };

  return (
    <motion.div
      key={detection.id}
      initial={reduced ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", bounce: 0, duration: 0.35 }}
      className="space-y-3"
    >
      <p className="text-[14px] leading-snug text-[var(--muted)]">
        {CONF_WORD[detection.confidence]} confident this leans{" "}
        <span className="font-semibold" style={{ color }}>
          {VERDICT_LABEL[detection.verdict].toLowerCase()}
        </span>
      </p>
      <div className="flex flex-wrap gap-2">
        {(["ai", "mixed", "human"] as const).map((k) => {
          const on = k === detection.verdict;
          return (
            <span
              key={k}
              className="rounded-full px-2.5 py-1 text-[12px] font-semibold tabular-nums"
              style={{
                border: `1px solid ${on ? VERDICT_COLOR[k] : "var(--hairline)"}`,
                color: on ? VERDICT_COLOR[k] : "var(--faint)",
              }}
            >
              {VERDICT_LABEL[k]} {pct(probs[k])}%
            </span>
          );
        })}
      </div>
      {detection.subclass && SUBCLASS_COPY[detection.subclass] && (
        <p className="text-[12px] text-[var(--muted)]">
          {SUBCLASS_COPY[detection.subclass]}
        </p>
      )}
      {detection.thin && (
        <p className="text-[12px] text-[var(--color-mixed)]">
          Only {detection.words} words — below the 70-word floor, so a
          &ldquo;human&rdquo; reading here proves nothing.
        </p>
      )}
    </motion.div>
  );
}
