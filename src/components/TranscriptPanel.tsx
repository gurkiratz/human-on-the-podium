"use client";

import { useEffect, useMemo, useRef } from "react";
import { motion, useReducedMotion } from "motion/react";
import { VerdictBadge } from "./VerdictBadge";
import { SENTENCE_AI_THRESHOLD, SENTENCE_HUMAN_MAX } from "@/lib/constants";
import { CHUNK_TARGET_WORDS } from "@/lib/chunker";
import type { Detection } from "@/lib/types";

type Props = {
  detections: Detection[];
  pendingText: string;
  partial: string;
  pendingWords: number;
  scoring: boolean;
  running: boolean;
  wordsSent: number;
};

type Token = {
  key: string;
  text: string;
  ai: number;
  scored: boolean;
};

export function TranscriptPanel(props: Props) {
  const reduced = useReducedMotion();
  const endRef = useRef<HTMLDivElement>(null);

  const tokens = useMemo<Token[]>(() => {
    const out: Token[] = [];
    for (const d of props.detections) {
      d.sentences.forEach((s, i) => {
        if (!s.sentence.trim()) return;
        out.push({ key: `${d.id}-${i}`, text: s.sentence, ai: s.ai, scored: true });
      });
    }
    return out;
  }, [props.detections]);

  useEffect(() => {
    endRef.current?.scrollIntoView({
      behavior: reduced ? "auto" : "smooth",
      block: "end",
    });
  }, [tokens.length, props.pendingText, props.partial, reduced]);

  const latest = props.detections.length
    ? props.detections[props.detections.length - 1]
    : null;

  const progress = Math.min(props.pendingWords / CHUNK_TARGET_WORDS, 1);
  const empty = tokens.length === 0 && !props.pendingText && !props.partial;

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#080908]">
      <div className="shrink-0 border-b border-[var(--hairline)] px-6 py-5 lg:px-9">
        <VerdictBadge detection={latest} />
      </div>

      <div className="hide-scrollbar scroll-fade min-h-0 flex-1 overflow-y-auto px-6 pb-16 pt-7 lg:px-9">
        {empty ? (
          <p className="title max-w-[28ch] text-[26px] font-semibold text-[var(--faint)]">
            {props.running
              ? "Say something. Analysis starts once you have talked for a bit."
              : "Hit the big red button and start talking."}
          </p>
        ) : (
          <p className="title text-[clamp(20px,2.1vw,30px)] font-medium">
            {tokens.map((t) => (
              <Sentence key={t.key} token={t} reduced={!!reduced} />
            ))}
            {props.pendingText && (
              <span className="text-white/45"> {props.pendingText}</span>
            )}
            {props.partial && (
              <span className="text-white/25"> {props.partial}</span>
            )}
          </p>
        )}
        <div ref={endRef} className="h-10" />
      </div>

      <div className="shrink-0 border-t border-[var(--hairline)] px-6 py-4 lg:px-9">
        <div className="flex items-center justify-between gap-4 text-[11px] text-[var(--faint)]">
          <span className="tabular-nums">
            {props.scoring
              ? "Analyzing…"
              : `${props.pendingWords} / ${CHUNK_TARGET_WORDS} words to next check`}
          </span>
          <span className="tabular-nums">
            {props.detections.length} checks · {props.wordsSent} words billed
          </span>
        </div>
        <div className="mt-2 h-[3px] overflow-hidden bg-white/10">
          <motion.div
            className="h-full bg-white/70"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: progress }}
            style={{ transformOrigin: "left" }}
            transition={{ type: "spring", bounce: 0, duration: 0.4 }}
          />
        </div>
      </div>
    </div>
  );
}

function Sentence({ token, reduced }: { token: Token; reduced: boolean }) {
  const band =
    token.ai >= SENTENCE_AI_THRESHOLD
      ? "ai"
      : token.ai >= SENTENCE_HUMAN_MAX
        ? "mixed"
        : "human";

  const style =
    band === "ai"
      ? {
          background: "rgba(255,159,10,0.28)",
          color: "#ffe8cc",
        }
      : band === "mixed"
        ? {
            background: "rgba(255,214,10,0.18)",
            color: "rgba(255,214,10,0.95)",
          }
        : {
            background: "rgba(48,209,88,0.16)",
            color: "rgba(245,245,247,0.92)",
          };

  return (
    <motion.span
      initial={reduced ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
      title={`AI ${Math.round(token.ai * 100)}%`}
      className="mr-[0.3em] box-decoration-clone rounded-[4px] px-[0.15em] py-[0.05em]"
      style={style}
    >
      {token.text}
    </motion.span>
  );
}
