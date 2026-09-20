"use client";

import { useEffect, useMemo, useRef } from "react";
import { motion, useReducedMotion } from "motion/react";
import { VerdictBadge } from "./VerdictBadge";
import { HeatmapSentence, heatTokens } from "./TranscriptHeatmap";
import { CHUNK_TARGET_WORDS } from "@/lib/chunker";
import type { ScribeStatus } from "@/lib/scribe";
import type { Detection } from "@/lib/types";

type Props = {
  detections: Detection[];
  pendingText: string;
  partial: string;
  pendingWords: number;
  scoring: boolean;
  running: boolean;
  speaking: boolean;
  status: ScribeStatus;
  wordsSent: number;
};

const STATUS_COPY: Record<ScribeStatus, string> = {
  idle: "Ready",
  connecting: "Connecting",
  listening: "Listening",
  muted: "Mic closed",
  error: "Disconnected",
};

function statusDot(status: ScribeStatus, speaking: boolean, running: boolean) {
  if (speaking) return "var(--destructive)";
  if (status === "listening") return "var(--success)";
  if (status === "muted") return "var(--warning)";
  if (status === "error") return "var(--destructive)";
  return running ? "var(--muted-foreground)" : "color-mix(in oklch, var(--muted-foreground) 50%, transparent)";
}

export function LiveTranscriptPanel(props: Props) {
  const reduced = useReducedMotion();
  const endRef = useRef<HTMLDivElement>(null);

  const tokens = useMemo(() => heatTokens(props.detections), [props.detections]);

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
  const statusLabel = props.speaking ? "Roasting you" : STATUS_COPY[props.status];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 px-6 pt-5 lg:px-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <motion.span
              className="h-2 w-2 rounded-full"
              style={{ background: statusDot(props.status, props.speaking, props.running) }}
              animate={
                reduced || !props.running
                  ? { opacity: 1 }
                  : { opacity: [1, 0.35, 1] }
              }
              transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
            />
            <span className="text-[13px] font-medium">{statusLabel}</span>
          </div>
          <span className="text-[11px] tabular-nums text-muted-foreground/60">
            {props.scoring ? "Scoring…" : `${props.detections.length} checks · ${props.wordsSent} words`}
          </span>
        </div>

        <div className="mt-4 border-t border-border/60 pt-4">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/60">
            AI analysis
          </p>
          <VerdictBadge detection={latest} />
        </div>
      </header>

      <div className="mt-4 flex min-h-0 flex-1 flex-col border-t border-border/60">
        <p className="shrink-0 px-6 pt-4 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/60 lg:px-8">
          Transcript
        </p>
        <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto px-6 pb-10 pt-3 lg:px-8">
          {empty ? (
            <p className="max-w-[34ch] text-[20px] font-semibold tracking-tight text-muted-foreground/40">
              {props.running
                ? "Say something. Scoring starts once you have talked for a bit."
                : "Hit the big red button and start talking."}
            </p>
          ) : (
            <p className="text-[clamp(17px,1.6vw,22px)] font-medium leading-[1.45]">
              {tokens.map((t) => (
                <HeatmapSentence key={t.key} token={t} reduced={!!reduced} />
              ))}
              {props.pendingText && (
                <span className="text-foreground/45"> {props.pendingText}</span>
              )}
              {props.partial && (
                <span className="text-foreground/25"> {props.partial}</span>
              )}
            </p>
          )}
          <div ref={endRef} className="h-6" />
        </div>
      </div>

      <div className="shrink-0 border-t border-border/60 px-6 py-4 lg:px-8">
        <div className="flex items-center justify-between gap-4 text-[11px] text-muted-foreground/60">
          <span className="tabular-nums">
            {props.pendingWords} / {CHUNK_TARGET_WORDS} words to next check
          </span>
          <span>GPTZero</span>
        </div>
        <div className="mt-2 h-[3px] overflow-hidden rounded-full bg-foreground/10">
          <motion.div
            className="h-full rounded-full bg-foreground/70"
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

