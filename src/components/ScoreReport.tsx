"use client";

import { SENTENCE_AI_THRESHOLD, SENTENCE_HUMAN_MAX } from "@/lib/constants";
import type { ClassProbs, ScoredSentence, Verdict } from "@/lib/types";
import {
  AiMeter,
  CERTAINTY,
  CertaintyBars,
  aiPct,
  type Certainty,
} from "@/components/ai-scale";

export type ScoreReportProps = {
  verdict: Verdict;
  probs: ClassProbs;
  confidence: Certainty;
  sentences: ScoredSentence[];
  transcript: string;
  words: number;
  thin?: boolean;
  subclass?: string;
};

const CLASS_COLOR: Record<Verdict, string> = {
  ai: "var(--stamp-ai)",
  mixed: "var(--stamp-mixed)",
  human: "var(--stamp-human)",
};

const CLASS_LABEL: Record<Verdict, string> = {
  ai: "AI",
  mixed: "Mixed",
  human: "Human",
};

/** Left to right: most machine-like first, so the bar reads like the scale. */
const CLASS_ORDER: Verdict[] = ["ai", "mixed", "human"];

function sentenceBand(ai: number): Verdict {
  if (ai >= SENTENCE_AI_THRESHOLD) return "ai";
  if (ai >= SENTENCE_HUMAN_MAX) return "mixed";
  return "human";
}

function bandWash(band: Verdict) {
  return `color-mix(in srgb, ${CLASS_COLOR[band]} 16%, transparent)`;
}

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
  return (
    <div className="space-y-7">
      {thin && (
        <p
          className="rounded-[var(--r-sm)] px-3.5 py-2.5 text-[13px] leading-5"
          style={{
            background:
              "color-mix(in srgb, var(--stamp-mixed) 12%, transparent)",
            color: "var(--ink)",
          }}
        >
          <span className="font-semibold">Short sample.</span> Only {words}{" "}
          words — below the floor where a &ldquo;human&rdquo; reading means
          much.
        </p>
      )}

      <div>
        <AiMeter ai={probs.ai} size="lg" className="mt-3 max-w-md" />
        <div className="mt-3.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] text-[var(--muted-ink)]">
          <span className="inline-flex items-center gap-1.5">
            <CertaintyBars level={confidence} decorative />
            {CERTAINTY[confidence].word}
          </span>
          <span aria-hidden className="text-[var(--faint-ink)]">
            ·
          </span>
          <span>{words} words analyzed</span>
          {subclass && (
            <>
              <span aria-hidden className="text-[var(--faint-ink)]">
                ·
              </span>
              <span>{subclass}</span>
            </>
          )}
        </div>
      </div>

      <div className="paper-divider pt-6">
        <p className="paper-label">Chance this excerpt is…</p>
        <div className="mt-3 flex h-2.5 w-full overflow-hidden rounded-full">
          {CLASS_ORDER.map((key) => (
            <span
              key={key}
              className="h-full"
              style={{
                width: `${Math.max(probs[key] * 100, probs[key] > 0 ? 1 : 0)}%`,
                background: CLASS_COLOR[key],
              }}
            />
          ))}
        </div>
        <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
          {CLASS_ORDER.map((key) => (
            <div key={key} className="flex items-center gap-2">
              <span
                aria-hidden
                className="size-2 rounded-full"
                style={{ background: CLASS_COLOR[key] }}
              />
              <dt className="text-[13px] text-[var(--muted-ink)]">
                {CLASS_LABEL[key]}
              </dt>
              <dd
                className="text-[13px] font-semibold tabular-nums"
                style={{
                  color: key === verdict ? CLASS_COLOR[key] : "var(--ink)",
                }}
              >
                {aiPct(probs[key])}%
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="paper-divider pt-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <p className="paper-label">Transcript · sentence by sentence</p>
          <p className="flex gap-3 text-[11px] text-[var(--muted-ink)]">
            {CLASS_ORDER.slice()
              .reverse()
              .map((band) => (
                <span key={band} className="inline-flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className="inline-block h-2.5 w-4 rounded-[3px]"
                    style={{ background: bandWash(band) }}
                  />
                  {CLASS_LABEL[band].toLowerCase()}
                </span>
              ))}
          </p>
        </div>
        <p className="max-h-[44vh] overflow-y-auto text-[16px] leading-[1.8] text-[var(--ink)]">
          {sentences.length > 0
            ? sentences.map((s, i) => (
                <span
                  key={`${i}-${s.sentence.slice(0, 16)}`}
                  title={`${aiPct(s.ai)}% AI-like`}
                  className="box-decoration-clone rounded-[4px] px-0.5"
                  style={{ background: bandWash(sentenceBand(s.ai)) }}
                >
                  {s.sentence}{" "}
                </span>
              ))
            : transcript}
        </p>
      </div>

      <p className="paper-divider pt-5 text-[12px] leading-5 text-[var(--faint-ink)]">
        A machine assessment of transcribed speech, not proof of authorship.
        Read it alongside the recording, never instead of it.
      </p>
    </div>
  );
}
