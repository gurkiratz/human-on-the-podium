"use client";

import { useEffect, useMemo, useRef } from "react";
import { motion, useReducedMotion } from "motion/react";
import { VERDICT_COLOR, VERDICT_LABEL } from "./VerdictBadge";
import { HeatmapSentence, heatTokens } from "./TranscriptHeatmap";
import { AiMeter, aiPct, bandOf } from "./ai-scale";
import { chunkAiShare, sessionAiShare, verdictTally } from "@/lib/ai-share";
import { CHUNK_TARGET_WORDS, RELIABLE_WORDS } from "@/lib/chunker";
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
  saving: boolean;
  sessionsOpen: boolean;
  onReset: () => void;
  onToggleSessions: () => void;
};

const STATUS_COPY: Record<ScribeStatus, string> = {
  idle: "Ready",
  connecting: "Connecting",
  listening: "Listening",
  muted: "Mic closed",
  error: "Disconnected",
};

const CONF_WORD = {
  high: "high",
  medium: "medium",
  low: "low",
} as const;

const SUBCLASS_COPY: Record<string, string> = {
  concatenated: "AI text pasted into their own words",
  polished: "their words, rewritten by AI",
};

/** The dot carries the connection state, so the label never has to shout it. */
function statusDot(status: ScribeStatus, speaking: boolean, running: boolean) {
  if (speaking) return "var(--color-ai)";
  if (status === "listening") return "var(--color-human)";
  if (status === "muted") return "var(--color-mixed)";
  if (status === "error") return "var(--color-ai)";
  return running ? "var(--muted)" : "var(--faint)";
}

export function TranscriptPanel(props: Props) {
  const reduced = useReducedMotion();
  const endRef = useRef<HTMLDivElement>(null);

  const summary = useMemo(() => {
    const share = sessionAiShare(props.detections);
    return share === null
      ? null
      : { share, tally: verdictTally(props.detections) };
  }, [props.detections]);

  useEffect(() => {
    endRef.current?.scrollIntoView({
      behavior: reduced ? "auto" : "smooth",
      block: "end",
    });
  }, [props.detections.length, props.pendingText, props.partial, reduced]);

  const progress = Math.min(props.pendingWords / CHUNK_TARGET_WORDS, 1);
  const live = `${props.pendingText} ${props.partial}`.trim();
  const empty = props.detections.length === 0 && !live;
  const statusLabel = props.speaking
    ? "Calling it out"
    : STATUS_COPY[props.status];
  const dirty = props.detections.length > 0 || props.pendingWords > 0;

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#080908]">
      <header className="shrink-0 px-6 pt-5 lg:px-9">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <motion.span
              className="h-2 w-2 rounded-full"
              style={{
                background: statusDot(
                  props.status,
                  props.speaking,
                  props.running
                ),
              }}
              animate={
                reduced || !props.running
                  ? { opacity: 1 }
                  : { opacity: [1, 0.35, 1] }
              }
              transition={{
                duration: 1.8,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />
            <span className="text-[13px] font-medium">{statusLabel}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[11px] tabular-nums text-[var(--faint)]">
              {props.scoring
                ? "Analyzing…"
                : props.saving
                ? "Saving…"
                : `${props.wordsSent} words billed`}
            </span>
            <button
              type="button"
              onClick={props.onToggleSessions}
              aria-pressed={props.sessionsOpen}
              className="border border-[var(--hairline)] px-2.5 py-1 text-[11px] text-[var(--muted)] transition-colors hover:border-[var(--hairline-strong)] hover:text-[var(--color-chalk)]"
            >
              Sessions
            </button>
            <button
              type="button"
              onClick={props.onReset}
              disabled={!dirty}
              className="border border-[var(--hairline)] px-2.5 py-1 text-[11px] text-[var(--muted)] transition-colors hover:border-[var(--hairline-strong)] hover:text-[var(--color-chalk)] disabled:pointer-events-none disabled:opacity-30"
            >
              Reset
            </button>
          </div>
        </div>

        <div className="mt-4 border-t border-[var(--hairline)] pt-4">
          <p className="caps mb-3 text-[10px] font-semibold text-[var(--faint)]">
            Whole session
          </p>
          {summary ? (
            <>
              <AiMeter ai={summary.share} size="lg" />
              <p className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-[var(--faint)]">
                <span className="tabular-nums">
                  {props.detections.length}{" "}
                  {props.detections.length === 1 ? "chunk" : "chunks"}
                </span>
                {(["ai", "mixed", "human"] as const).map((v) =>
                  summary.tally[v] ? (
                    <span
                      key={v}
                      className="tabular-nums"
                      style={{ color: VERDICT_COLOR[v] }}
                    >
                      · {summary.tally[v]} {VERDICT_LABEL[v].toLowerCase()}
                    </span>
                  ) : null
                )}
              </p>
            </>
          ) : (
            <div className="flex items-baseline gap-3">
              <span className="display text-[44px] font-bold text-[var(--faint)]">
                —
              </span>
              <span className="text-[13px] text-[var(--faint)]">
                Waiting for enough speech
              </span>
            </div>
          )}
        </div>
      </header>

      <div className="mt-4 flex min-h-0 flex-1 flex-col border-t border-[var(--hairline)]">
        <p className="caps shrink-0 px-6 pt-4 text-[10px] font-semibold text-[var(--faint)] lg:px-9">
          Transcript
        </p>
        <div className="hide-scrollbar scroll-fade min-h-0 flex-1 overflow-y-auto px-6 pb-10 pt-3 lg:px-9">
          {empty ? (
            <p className="title max-w-[34ch] text-[22px] font-semibold text-[var(--faint)]">
              {props.running ? (
                "Say something. Analysis starts once you have talked for a bit."
              ) : (
                <span className="text-6xl">
                  Hit the big red button and start talking.
                </span>
              )}
            </p>
          ) : (
            <>
              {props.detections.map((detection, i) => (
                <ChunkBlock
                  key={detection.id}
                  detection={detection}
                  position={i + 1}
                  first={i === 0}
                  reduced={!!reduced}
                />
              ))}
              {live && (
                <LiveTail
                  pendingText={props.pendingText}
                  partial={props.partial}
                  words={props.pendingWords}
                  running={props.running}
                  first={props.detections.length === 0}
                />
              )}
            </>
          )}
          <div ref={endRef} className="h-6" />
        </div>
      </div>

      <div className="shrink-0 border-t border-[var(--hairline)] px-6 py-4 lg:px-9">
        <div className="flex items-center justify-between gap-4 text-[11px] text-[var(--faint)]">
          <span className="tabular-nums">
            {props.pendingWords} / {CHUNK_TARGET_WORDS} words to next check
          </span>
          <span>GPTZero</span>
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

/**
 * One analyzed chunk: what was said, then the reading for those words alone.
 * The reading sits under its own text rather than at the top of the panel,
 * because a single number up there gets read as a verdict on the whole talk
 * when it only ever described the last chunk.
 */
function ChunkBlock({
  detection,
  position,
  first,
  reduced,
}: {
  detection: Detection;
  position: number;
  first: boolean;
  reduced: boolean;
}) {
  const tokens = heatTokens([detection]);
  const share = chunkAiShare(detection);
  const band = bandOf(share);
  const note = detection.subclass
    ? SUBCLASS_COPY[detection.subclass]
    : undefined;

  return (
    <motion.article
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", bounce: 0, duration: 0.4 }}
      className={first ? "" : "mt-6 border-t border-[var(--hairline)] pt-6"}
    >
      <p className="text-[clamp(17px,1.6vw,22px)] font-medium leading-[1.45]">
        {tokens.map((t) => (
          <HeatmapSentence key={t.key} token={t} reduced={reduced} />
        ))}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px]">
        <span
          className="caps px-2 py-[3px] text-[10px] font-semibold"
          style={{
            border: `1px solid ${VERDICT_COLOR[detection.verdict]}`,
            color: VERDICT_COLOR[detection.verdict],
          }}
        >
          {VERDICT_LABEL[detection.verdict]}
        </span>
        <span
          className="tabular-nums font-semibold"
          style={{ color: `var(${band.v})` }}
        >
          {aiPct(share)}% AI
        </span>
        <span className="text-[var(--faint)]">{band.label}</span>
        <span className="tabular-nums text-[var(--faint)]">
          · chunk {position} · {detection.words} words ·{" "}
          {CONF_WORD[detection.confidence]} confidence
        </span>
      </div>

      {note && <p className="mt-1.5 text-[12px] text-[var(--muted)]">{note}</p>}
      {detection.thin && (
        <p className="mt-1.5 text-[12px] text-[var(--color-mixed)]">
          Only {detection.words} words — under the {RELIABLE_WORDS}-word floor,
          so a &ldquo;human&rdquo; reading here proves nothing.
        </p>
      )}
    </motion.article>
  );
}

/** The words banked but not yet analyzed, shown as the open chunk. */
function LiveTail({
  pendingText,
  partial,
  words,
  running,
  first,
}: {
  pendingText: string;
  partial: string;
  words: number;
  running: boolean;
  first: boolean;
}) {
  return (
    <div className={first ? "" : "mt-6 border-t border-[var(--hairline)] pt-6"}>
      <p className="text-[clamp(17px,1.6vw,22px)] font-medium leading-[1.45]">
        {pendingText && <span className="text-white/45">{pendingText}</span>}
        {partial && <span className="text-white/25"> {partial}</span>}
      </p>
      <p className="caps mt-3 text-[10px] font-semibold text-[var(--faint)]">
        {running
          ? `Open chunk · ${words} words so far`
          : `Held over · ${words} words carry into the next take`}
      </p>
    </div>
  );
}
