"use client";

import { FolderOpen } from "lucide-react";
import { motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { AiMeter } from "@/components/AiMeter";
import { AudioEventsStrip } from "@/components/AudioEventsStrip";
import { BasicAnalytics } from "@/components/BasicAnalytics";
import { ClaimPanel } from "@/components/ClaimPanel";
import { EntityPanel } from "@/components/EntityPanel";
import { SpeakerPicker } from "@/components/SpeakerPicker";
import { TranscriptView } from "@/components/TranscriptView";
import { Button } from "@/components/ui/button";
import type { StoredClaimSet } from "@/lib/claims-store";
import type { AiReport } from "@/lib/gptzero";
import {
  audioEvents,
  filterTranscriptBySpeaker,
  speakerSummaries,
  transcriptStats,
  type Transcript,
  type TranscriptStats,
  type VideoSummary,
} from "@/lib/types";

function formatDuration(total: number): string {
  const minutes = Math.floor(total / 60);
  const seconds = Math.round(total % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * Cache key for one scope. Includes a hash of the text, not just its length, so two different
 * transcripts that happen to be the same length never alias each other's report.
 */
function scopeKey(transcript: Transcript, selected: string | null): string {
  const text = transcript.text;
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) | 0;
  }
  return `${text.length}:${hash}:${selected ?? "all"}`;
}

export function AnalyticsPanel({
  video,
  transcript,
  stats,
  sessionId,
  primarySpeaker,
  primarySpeakerReason,
  showTitle = true,
  view = "advanced",
  onOpenProject,
}: {
  video: VideoSummary | null;
  transcript: Transcript;
  stats: TranscriptStats;
  sessionId: string | null;
  primarySpeaker?: string | null;
  primarySpeakerReason?: string | null;
  /** False when the caller already shows the video title as a heading. */
  showTitle?: boolean;
  /** "basic" shows the plain AI-share reading; "advanced" shows the full panel. */
  view?: "basic" | "advanced";
  /** When set, shows a control that opens the saved project's detail page. */
  onOpenProject?: () => void;
}) {
  const speakers = speakerSummaries(transcript);
  // Seed from the auto-pick so we score one scope on mount instead of re-scoring immediately.
  const [selected, setSelected] = useState<string | null>(() => primarySpeaker ?? null);
  const [report, setReport] = useState<AiReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cache = useRef(new Map<string, AiReport>());
  const inflight = useRef(new Map<string, Promise<AiReport>>());
  const [claimReport, setClaimReport] = useState<StoredClaimSet | null>(null);
  const [claimsLoading, setClaimsLoading] = useState(false);
  const [claimsError, setClaimsError] = useState<string | null>(null);
  const claimsCache = useRef(new Map<string, StoredClaimSet>());
  const claimsInflight = useRef(new Map<string, Promise<StoredClaimSet>>());
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  /** Drive the YouTube embed through its postMessage API. */
  const seek = useCallback((seconds: number) => {
    const frame = iframeRef.current;
    if (!frame?.contentWindow) return;
    frame.contentWindow.postMessage(
      JSON.stringify({ event: "command", func: "seekTo", args: [seconds, true] }),
      "*",
    );
    frame.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  // Follow the auto-picked speaker whenever a new transcript arrives.
  useEffect(() => {
    setSelected(primarySpeaker ?? null);
  }, [primarySpeaker, transcript]);

  // Score the current scope with GPTZero, caching per speaker so toggling is free.
  useEffect(() => {
    const key = scopeKey(transcript, selected);
    const cached = cache.current.get(key);
    if (cached) {
      setReport(cached);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setReport(null);

    // Reuse an identical request already in flight (React re-runs effects in dev).
    let pending = inflight.current.get(key);
    if (!pending) {
      pending = (async () => {
        const response = await fetch("/api/detect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            transcript,
            speakerId: selected,
            source: video?.channel?.trim() || video?.title?.trim() || "Unknown source",
            title: video?.title?.trim() || "Untitled speech",
            videoId: video?.videoId ?? null,
            // Record only the speech's own speaker, so one speech counts once on the board.
            primary: primarySpeaker ? selected === primarySpeaker : selected === null,
          }),
        });
        const data = (await response.json()) as AiReport & { error?: string };
        if (!response.ok) throw new Error(data.error ?? `Scoring failed (${response.status}).`);
        cache.current.set(key, data);
        return data;
      })();
      inflight.current.set(key, pending);
      void pending.catch(() => {}).finally(() => inflight.current.delete(key));
    }

    pending
      .then((data) => {
        if (!cancelled) setReport(data);
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : String(caught));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [transcript, selected, primarySpeaker, video?.videoId]);

  // Triage the claims in the current scope. Same cache-per-speaker approach as scoring.
  useEffect(() => {
    // Claims are an advanced-panel concern; the plain reading never needs them.
    if (view !== "advanced") return;
    const key = scopeKey(transcript, selected);
    const cached = claimsCache.current.get(key);
    if (cached) {
      setClaimReport(cached);
      setClaimsError(null);
      setClaimsLoading(false);
      return;
    }

    let cancelled = false;
    setClaimsLoading(true);
    setClaimsError(null);
    setClaimReport(null);

    let pending = claimsInflight.current.get(key);
    if (!pending) {
      pending = (async () => {
        const response = await fetch("/api/claims", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            transcript,
            speakerId: selected,
            source: video?.channel?.trim() || video?.title?.trim() || null,
            title: video?.title?.trim() || null,
          }),
        });
        const data = (await response.json()) as StoredClaimSet & { error?: string };
        if (!response.ok) {
          throw new Error(data.error ?? `Claim extraction failed (${response.status}).`);
        }
        claimsCache.current.set(key, data);
        return data;
      })();
      claimsInflight.current.set(key, pending);
      void pending.catch(() => {}).finally(() => claimsInflight.current.delete(key));
    }

    pending
      .then((data) => {
        if (!cancelled) setClaimReport(data);
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setClaimsError(caught instanceof Error ? caught.message : String(caught));
        }
      })
      .finally(() => {
        if (!cancelled) setClaimsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [transcript, selected, view]);

  const shown = filterTranscriptBySpeaker(transcript, selected);
  const shownStats = selected ? transcriptStats(shown) : stats;
  const wordsPerMinute = Math.round(
    shownStats.words / Math.max(shownStats.duration / 60, 0.01),
  );
  const selectedIndex = speakers.findIndex((speaker) => speaker.id === selected);
  const scopeLabel = selected ? `Speaker ${selectedIndex + 1}` : "All speakers";

  const events = audioEvents(transcript);
  const confidence =
    typeof transcript.language_probability === "number"
      ? `${Math.round(transcript.language_probability * 100)}%`
      : "–";

  const figures: Array<[string, string]> = [
    ["Words", shownStats.words.toLocaleString()],
    ["Duration", formatDuration(shownStats.duration)],
    ["Language", shownStats.language.toUpperCase()],
    ["Confidence", confidence],
    ["WPM", wordsPerMinute.toLocaleString()],
  ];

  if (view === "basic") {
    return (
      <BasicAnalytics
        video={video}
        stats={shownStats}
        transcript={shown}
        report={report}
        loading={loading}
        error={error}
        showTitle={showTitle}
      />
    );
  }

  return (
    <div data-testid="analytics-panel" className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Transcript
          </p>
          {showTitle ? (
            <h2 className="mt-1 truncate text-[17px] font-semibold leading-tight tracking-tight">
              {video?.title ?? "Untitled video"}
            </h2>
          ) : null}
          {video?.channel ? (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{video.channel}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          {onOpenProject ? (
            <Button variant="secondary" size="sm" className="gap-1.5" onClick={onOpenProject}>
              <FolderOpen className="size-3.5" />
              Open project
            </Button>
          ) : null}
          {sessionId ? (
            <a
              className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              href={`https://www.browserbase.com/sessions/${sessionId}`}
              target="_blank"
              rel="noreferrer"
            >
              Browser session ↗
            </a>
          ) : null}
        </div>
      </div>

      {video?.videoId ? (
        <motion.div
          layout
          className="mx-auto aspect-video max-h-[46vh] w-full max-w-[680px] overflow-hidden rounded-2xl border border-border bg-black"
        >
          <iframe
            ref={iframeRef}
            className="size-full"
            src={`https://www.youtube.com/embed/${video.videoId}?enablejsapi=1`}
            title={video.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </motion.div>
      ) : null}

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border/70 bg-border/60 sm:grid-cols-5">
        {figures.map(([label, value]) => (
          <div key={label} className="bg-card/70 px-4 py-3 backdrop-blur-xl">
            <dd className="text-[19px] font-semibold tabular-nums tracking-tight">{value}</dd>
            <dt className="mt-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">
              {label}
            </dt>
          </div>
        ))}
      </dl>

      <AudioEventsStrip events={events} />

      <SpeakerPicker
        speakers={speakers}
        selected={selected}
        primary={primarySpeaker}
        reason={primarySpeakerReason}
        onSelect={setSelected}
      />

      <AiMeter report={report} loading={loading} error={error} scopedLabel={scopeLabel} />

      <ClaimPanel
        report={claimReport}
        loading={claimsLoading}
        error={claimsError}
        scopedLabel={scopeLabel}
        onSeek={video?.videoId ? seek : undefined}
      />

      <EntityPanel transcript={transcript} entities={transcript.entities} />

      <div className="glass flex max-h-[52vh] min-h-[220px] flex-col overflow-hidden rounded-2xl border border-border/70">
        <div className="flex items-center justify-between border-b border-border/70 px-5 py-2.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {selected ? "Speaker transcript" : "Full transcript"}
          </span>
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {shownStats.words.toLocaleString()} words
          </span>
        </div>
        <TranscriptView transcript={shown} scores={report?.sentences} />
      </div>

      <div className="glass rounded-2xl border border-border/70 px-5 py-4">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Coming next
        </p>
        <ul className="mt-2 grid gap-1.5 text-xs text-muted-foreground sm:grid-cols-2">
          <li>
            <span className="text-foreground">Archive</span>: catch contradictions across past
            speeches (needs a shared speaker identity first)
          </li>
          <li>
            <span className="text-foreground">Human review</span>: accept or dismiss each match
          </li>
        </ul>
      </div>
    </div>
  );
}
