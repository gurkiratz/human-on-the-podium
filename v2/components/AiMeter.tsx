"use client";

import { motion } from "motion/react";
import { Loader } from "@/components/ui/loader";
import { aiShareBand, aiTone } from "@/lib/ai-bands";
import { cn } from "@/lib/utils";
import type { AiReport } from "@/lib/gptzero";

function verdict(prob: number | null): { label: string; tone: "ai" | "mixed" | "human" } {
  if (prob === null) return { label: "Not scored", tone: "human" };
  return { label: aiShareBand(prob).label, tone: aiTone(prob) };
}

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60);
  return `${minutes}:${rest.toString().padStart(2, "0")}`;
}

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

export function AiMeter({
  report,
  loading,
  error,
  scopedLabel,
}: {
  report: AiReport | null;
  loading: boolean;
  error: string | null;
  scopedLabel: string;
}) {
  if (loading) {
    return (
      <div className="glass flex items-center gap-3 rounded-2xl border border-border/70 px-5 py-4">
        <Loader variant="dots" size="sm" />
        <span className="text-xs text-muted-foreground">
          Scoring {scopedLabel} with GPTZero…
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass rounded-2xl border border-destructive/40 bg-destructive/5 px-5 py-4">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          AI-o-meter
        </p>
        <p className="mt-1 text-xs leading-relaxed text-foreground">{error}</p>
      </div>
    );
  }

  if (!report) return null;

  if (!report.scorable) {
    return (
      <div className="glass rounded-2xl border border-border/70 px-5 py-4">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          AI-o-meter
        </p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {report.reason ?? "Nothing to score yet."}
        </p>
      </div>
    );
  }

  const probability = report.document?.completelyGeneratedProb ?? null;
  const percent = probability === null ? null : Math.round(probability * 100);
  const { label, tone } = verdict(probability);

  const scored = report.sentences.filter((sentence) => sentence.generatedProb !== null);
  const worst = [...scored].sort((a, b) => (b.generatedProb ?? 0) - (a.generatedProb ?? 0))[0];
  const best = [...scored].sort((a, b) => (a.generatedProb ?? 0) - (b.generatedProb ?? 0))[0];

  return (
    <div
      data-testid="ai-meter"
      className="glass flex flex-col gap-3 rounded-2xl border border-border/70 px-5 py-4"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            AI-o-meter · {scopedLabel}
          </p>
          <div className="mt-1 flex items-baseline gap-2">
            <span
              className={cn("text-[28px] font-semibold tabular-nums leading-none", TONE_TEXT[tone])}
            >
              {percent === null ? "–" : `${percent}%`}
            </span>
            <span className={cn("text-xs font-medium", TONE_TEXT[tone])}>{label}</span>
          </div>
        </div>

        <div className="shrink-0 text-right text-[11px] leading-relaxed text-muted-foreground">
          <div>
            <span className="text-foreground">{report.flaggedCount}</span> of{" "}
            {report.sentences.length} sentences flagged
          </div>
          {report.document?.burstiness !== null && report.document?.burstiness !== undefined ? (
            <div>burstiness {report.document.burstiness.toFixed(2)}</div>
          ) : null}
          <div>{report.wordCount.toLocaleString()} words scored</div>
        </div>
      </div>

      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <motion.div
          className={cn("h-full rounded-full", TONE_BAR[tone])}
          initial={{ width: 0 }}
          animate={{ width: `${percent ?? 0}%` }}
          transition={{ type: "spring", stiffness: 120, damping: 22 }}
        />
      </div>

      <div className="flex flex-col gap-1">
        {worst && (worst.generatedProb ?? 0) > 0 ? (
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            <span className="font-medium text-red-300">Most AI-like</span> at{" "}
            <span className="tabular-nums text-foreground">{formatTime(worst.start)}</span> (
            {Math.round((worst.generatedProb ?? 0) * 100)}%): “{worst.text.slice(0, 120)}
            {worst.text.length > 120 ? "…" : ""}”
          </p>
        ) : null}
        {best ? (
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            <span className="font-medium text-emerald-300">Most human-like</span> at{" "}
            <span className="tabular-nums text-foreground">{formatTime(best.start)}</span> (
            {Math.round((best.generatedProb ?? 0) * 100)}%): “{best.text.slice(0, 120)}
            {best.text.length > 120 ? "…" : ""}”
          </p>
        ) : null}
      </div>
    </div>
  );
}
