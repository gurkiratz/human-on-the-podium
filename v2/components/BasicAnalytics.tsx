"use client";

import { AiShare, BandLegend } from "@/components/AiScale";
import { Loader } from "@/components/ui/loader";
import type { AiReport } from "@/lib/gptzero";
import { formatDuration } from "@/lib/time-format";
import type { Transcript, TranscriptStats, VideoSummary } from "@/lib/types";

/**
 * The plain reading: how much of the speech GPTZero puts on the machine side, the band it
 * falls in, the recording, and the transcript. No speakers, claims, entities or heat-map.
 */
export function BasicAnalytics({
  video,
  stats,
  transcript,
  report,
  loading,
  error,
  showTitle = true,
}: {
  video: VideoSummary | null;
  stats: TranscriptStats;
  transcript: Transcript;
  report: AiReport | null;
  loading: boolean;
  error: string | null;
  /** False when the caller already shows the video title as a heading. */
  showTitle?: boolean;
}) {
  const probability =
    report?.document?.completelyGeneratedProb ?? report?.document?.aiProb ?? null;
  const scorable = report?.scorable ?? false;

  return (
    <div data-testid="basic-analytics" className="flex flex-col gap-5">
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Detection
        </p>
        {showTitle ? (
          <h2 className="mt-1 truncate text-[17px] font-semibold leading-tight tracking-tight">
            {video?.title ?? "Untitled video"}
          </h2>
        ) : null}
        {video?.channel ? (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{video.channel}</p>
        ) : null}
        <p className="mt-1.5 text-[11px] tabular-nums text-muted-foreground">
          {stats.words.toLocaleString()} words · {formatDuration(stats.duration)} ·{" "}
          <span className="uppercase">{stats.language}</span>
        </p>
      </div>

      <div className="glass rounded-2xl border border-border/70 px-5 py-4">
        {loading ? (
          <div className="flex items-center gap-3 py-1">
            <Loader variant="dots" size="sm" />
            <span className="text-xs text-muted-foreground">Scoring with GPTZero…</span>
          </div>
        ) : error ? (
          <p className="text-xs leading-relaxed text-foreground">{error}</p>
        ) : !report || !scorable || probability === null ? (
          <p className="text-xs leading-relaxed text-muted-foreground">
            {report?.reason ?? "Nothing to score yet."}
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            <AiShare share={probability} size="lg" className="w-full" />
            <BandLegend />
          </div>
        )}
      </div>

      {video?.videoId ? (
        <div className="mx-auto aspect-video w-full max-w-[680px] overflow-hidden rounded-2xl border border-border bg-black">
          <iframe
            className="size-full"
            src={`https://www.youtube.com/embed/${video.videoId}`}
            title={video.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      ) : null}

      <div className="glass rounded-2xl border border-border/70 px-5 py-4">
        <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Transcript
        </p>
        <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-muted-foreground">
          {transcript.text}
        </p>
      </div>
    </div>
  );
}
