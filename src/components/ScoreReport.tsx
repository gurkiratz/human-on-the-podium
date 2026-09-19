"use client";

import {
  SENTENCE_AI_THRESHOLD,
  SENTENCE_HUMAN_MAX,
} from "@/lib/constants";
import type { ClassProbs, ScoredSentence, Verdict } from "@/lib/types";
import { VERDICT_COLOR, VERDICT_LABEL } from "@/components/VerdictBadge";

export type ScoreReportProps = {
  verdict: Verdict;
  probs: ClassProbs;
  confidence: "high" | "medium" | "low";
  sentences: ScoredSentence[];
  transcript: string;
  words: number;
  thin?: boolean;
  subclass?: string;
};

const CONF_WORD = {
  high: "highly",
  medium: "moderately",
  low: "somewhat",
} as const;

function pct(n: number) {
  return Math.round(n * 100);
}

function sentenceBand(ai: number): Verdict {
  if (ai >= SENTENCE_AI_THRESHOLD) return "ai";
  if (ai >= SENTENCE_HUMAN_MAX) return "mixed";
  return "human";
}

const BAND_BG: Record<Verdict, string> = {
  human: "rgba(48, 209, 88, 0.22)",
  mixed: "rgba(255, 214, 10, 0.2)",
  ai: "rgba(255, 159, 10, 0.28)",
};

const PROB_KEYS: Verdict[] = ["ai", "mixed", "human"];

export function ScoreReport({
  verdict,
  probs,
  confidence,
  sentences,
  transcript,
  words,
  thin,
  subclass,
}: ScoreReportProps) {
  const lead = pct(probs[verdict]);

  return (
    <div className="space-y-5">
      {thin && (
        <p className="rounded-2xl border border-[var(--color-mixed)]/30 bg-[var(--color-mixed)]/10 px-3.5 py-2.5 text-[13px] text-[var(--color-mixed)]">
          Short sample ({words} words) — reading may be less reliable.
        </p>
      )}

      <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
        <div
          className="relative grid h-[88px] w-[88px] place-items-center rounded-full"
          style={{
            background: `conic-gradient(${VERDICT_COLOR[verdict]} ${lead}%, rgba(255,255,255,0.08) 0)`,
          }}
        >
          <div className="grid h-[68px] w-[68px] place-items-center rounded-full bg-[var(--color-void)]">
            <span
              className="text-[15px] font-bold capitalize"
              style={{ color: VERDICT_COLOR[verdict] }}
            >
              {verdict}
            </span>
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-[15px] leading-snug text-[var(--color-chalk)]">
            We&apos;re{" "}
            <span className="font-semibold">{CONF_WORD[confidence]} confident</span>{" "}
            this segment leans{" "}
            <span
              className="font-semibold underline decoration-2 underline-offset-4"
              style={{
                color: VERDICT_COLOR[verdict],
                textDecorationColor: VERDICT_COLOR[verdict],
              }}
            >
              {VERDICT_LABEL[verdict].toLowerCase()}
            </span>
            .
          </p>
          {subclass && (
            <p className="mt-1 text-[12px] text-[var(--muted)]">{subclass}</p>
          )}
          <p className="mt-1 text-[12px] text-[var(--faint)]">
            {words} words scored
          </p>
        </div>
      </div>

      <div>
        <p className="caps mb-2 text-[10px] font-semibold text-[var(--faint)]">
          Chance this segment is…
        </p>
        <div className="grid grid-cols-3 gap-2">
          {PROB_KEYS.map((key) => {
            const on = key === verdict;
            const v = pct(probs[key]);
            return (
              <div
                key={key}
                className="rounded-2xl px-3 py-2.5"
                style={{
                  border: `1.5px solid ${on ? VERDICT_COLOR[key] : "var(--hairline)"}`,
                  background: on
                    ? `${VERDICT_COLOR[key]}14`
                    : "transparent",
                }}
              >
                <p className="caps text-[10px] font-semibold text-[var(--faint)]">
                  {VERDICT_LABEL[key]}
                </p>
                <p
                  className="mt-0.5 text-[22px] font-bold tabular-nums"
                  style={{ color: on ? VERDICT_COLOR[key] : "var(--muted)" }}
                >
                  {v}%
                </p>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${v}%`,
                      background: VERDICT_COLOR[key],
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="caps text-[10px] font-semibold text-[var(--faint)]">
            Transcript · sentence heat
          </p>
          <p className="flex gap-2 text-[10px] text-[var(--faint)]">
            <span>
              <span
                className="mr-1 inline-block h-2 w-2 rounded-sm"
                style={{ background: BAND_BG.human }}
              />
              human
            </span>
            <span>
              <span
                className="mr-1 inline-block h-2 w-2 rounded-sm"
                style={{ background: BAND_BG.mixed }}
              />
              mixed
            </span>
            <span>
              <span
                className="mr-1 inline-block h-2 w-2 rounded-sm"
                style={{ background: BAND_BG.ai }}
              />
              ai
            </span>
          </p>
        </div>
        <p className="scroll-fade max-h-[42vh] overflow-y-auto text-[15px] leading-[1.75] text-[var(--color-chalk)] hide-scrollbar">
          {sentences.length > 0
            ? sentences.map((s, i) => {
                const band = sentenceBand(s.ai);
                return (
                  <span
                    key={`${i}-${s.sentence.slice(0, 16)}`}
                    title={`${pct(s.ai)}% AI-like`}
                    className="box-decoration-clone rounded-[4px] px-0.5"
                    style={{ background: BAND_BG[band] }}
                  >
                    {s.sentence}{" "}
                  </span>
                );
              })
            : transcript}
        </p>
      </div>
    </div>
  );
}
